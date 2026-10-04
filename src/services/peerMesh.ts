/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConnectionState,
  DeviceIdentity,
  MeshMessage,
  RealFileItem,
  RealPerformanceMetrics,
  RegisteredDevice,
  SystemDiagnostics,
} from '../types/controller';
import { sendSignalMessage } from './firebaseSignaling';
import { capturePrimaryDisplay } from './screenCapture';
import { loadIceConfiguration } from './iceConfiguration';

export type MeshEventListener = (message: MeshMessage) => void;

class RealPeerMeshService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<MeshEventListener> = new Set();
  private seenMessageIds = new Set<string>();
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private activeCaptureDisplayId: string | undefined;
  private activeCaptureAudio = false;
  private remoteStream: MediaStream | null = null;
  private currentRemoteId: string | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private recoveryTimer: number | null = null;
  private recoveryAttempts = 0;
  private ownDeviceIdentity: DeviceIdentity | null = null;
  private approvedPeerIds = new Set<string>();
  private pendingOffers = new Map<string, { offer: RTCSessionDescriptionInit; senderName: string }>();
  private pendingIceByPeer = new Map<string, RTCIceCandidateInit[]>();
  private localRemoteInputAuthorized = false;
  private remoteControlGranted = false;
  private connectionTimeout: number | null = null;
  private displayChangeUnsubscribe: (() => void) | null = null;
  private networkListenersInstalled = false;
  private makingOffer = false;
  private ignoreOffer = false;

  private statsInterval: number | null = null;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;
  private prevFramesDecoded = 0;

  // Real connection state
  private connectionState: ConnectionState = 'Offline';
  private onStateChangeCb: ((state: ConnectionState) => void) | null = null;
  private onRemoteStreamCb: ((stream: MediaStream | null) => void) | null = null;
  private onMetricsCb: ((metrics: RealPerformanceMetrics) => void) | null = null;
  private onFilesReceivedCb: ((files: RealFileItem[]) => void) | null = null;
  private onIncomingRequestCb: ((request: { senderId: string; senderName: string }) => void) | null = null;
  private onRemoteControlAuthorizationCb: ((allowed: boolean) => void) | null = null;
  private localFiles = new Map<string, { id: string; name: string; size: number; lastModified: number; sha256: string }>();
  private pendingFileOffers = new Map<string, { id: string; name: string; size: number; lastModified: number; sha256: string }>();
  private incomingFileTransfers = new Map<string, { sequence: number; size: number; name: string; sha256: string }>();
  private transferFileTokens = new Map<string, string>();
  private fileAckWaiters = new Map<string, (value: { sequence: number; receivedBytes: number }) => void>();


  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('THE_CONTROLLER_REAL_P2P_MESH_V1');
      this.channel.onmessage = (event) => {
        this.dispatchMessage(event.data);
      };
    }
  }

  public subscribe(listener: MeshEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setOnStateChange(cb: (state: ConnectionState) => void) {
    this.onStateChangeCb = cb;
  }

  public setOnRemoteStream(cb: (stream: MediaStream | null) => void) {
    this.onRemoteStreamCb = cb;
  }

  public setOnMetrics(cb: (metrics: RealPerformanceMetrics) => void) {
    this.onMetricsCb = cb;
  }

  public setOnFilesReceived(cb: (files: RealFileItem[]) => void) {
    this.onFilesReceivedCb = cb;
  }

  public setOnIncomingRequest(cb: (request: { senderId: string; senderName: string }) => void) {
    this.onIncomingRequestCb = cb;
  }

  public setOnRemoteControlAuthorization(cb: (allowed: boolean) => void) {
    this.onRemoteControlAuthorizationCb = cb;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public setDeviceIdentity(identity: DeviceIdentity): void {
    this.ownDeviceIdentity = identity;
  }

  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    if (this.onStateChangeCb) {
      this.onStateChangeCb(state);
    }
  }

  public broadcastMessage(message: MeshMessage) {
    this.seenMessageIds.add(message.id);
    if (this.channel) {
      try { this.channel.postMessage(message); } catch (error) { console.warn('Local mesh delivery failed:', error); }
    } else {
      this.dispatchMessage(message);
    }
    if (message.targetId) {
      void sendSignalMessage(message).catch((error) => console.warn('Secure signaling delivery failed:', error));
    }
  }

  public receiveMessage(message: MeshMessage) {
    this.dispatchMessage(message);
  }

  private dispatchMessage(message: MeshMessage) {
    if (this.seenMessageIds.has(message.id)) return;
    this.seenMessageIds.add(message.id);
    if (this.seenMessageIds.size > 2000) this.seenMessageIds.clear();
    this.handleIncomingMeshMessage(message);
  }

  private handleIncomingMeshMessage(msg: MeshMessage) {
    if (!msg || !msg.type) return;
    if (msg.targetId && this.ownDeviceIdentity && msg.targetId !== this.ownDeviceIdentity.id) return;
    if (msg.type === 'WEBRTC_OFFER' && msg.senderId !== this.currentRemoteId) return;

    this.listeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in mesh listener:', err);
      }
    });

    switch (msg.type) {
      case 'CONNECT_REQUEST':
        if (this.peerConnection || this.connectionState === 'Connected' || this.connectionState === 'Connecting'
          || (this.connectionState === 'Waiting for approval' && this.currentRemoteId !== msg.senderId)) {
          if (this.ownDeviceIdentity) {
            this.broadcastMessage({
              id: crypto.randomUUID(), type: 'CONNECT_REJECT', senderId: this.ownDeviceIdentity.id,
              senderName: 'Agent Node', targetId: msg.senderId, timestamp: Date.now(),
            });
          }
          break;
        }
        this.currentRemoteId = msg.senderId;
        if (this.onIncomingRequestCb) {
          this.setConnectionState('Waiting for approval');
          this.onIncomingRequestCb({
            senderId: msg.senderId,
            senderName: msg.senderName,
          });
        }
        break;
case 'CONNECT_APPROVE':
  if (this.currentRemoteId !== msg.senderId) break;

  this.approvedPeerIds.add(msg.senderId);
  this.setConnectionState('Connecting');
  break;


      case 'CONNECT_REJECT':
        this.setConnectionState('Disconnected');
        this.approvedPeerIds.delete(msg.senderId);
        this.cleanupPeerConnection();
        break;

      case 'DISCONNECT':
        this.setConnectionState('Disconnected');
        this.approvedPeerIds.delete(msg.senderId);
        this.cleanupPeerConnection();
        break;

      case 'WEBRTC_OFFER':
        if (this.approvedPeerIds.has(msg.senderId)) {
          void this.handleRemoteOffer(msg.payload.offer, msg.senderId, msg.senderName).catch((error) => {
            console.warn('Could not negotiate the remote WebRTC offer:', error);
            this.setConnectionState('Disconnected');
          });
        } else if (this.currentRemoteId === msg.senderId) {
          this.pendingOffers.set(msg.senderId, { offer: msg.payload.offer, senderName: msg.senderName });
        }
        break;

      case 'WEBRTC_ANSWER':
        this.handleRemoteAnswer(msg.payload.answer);
        break;

      case 'WEBRTC_ICE':
        if (msg.payload.candidate && this.approvedPeerIds.has(msg.senderId) && this.currentRemoteId === msg.senderId) {
          this.addRemoteIceCandidate(msg.payload.candidate);
        } else if (msg.payload.candidate && this.currentRemoteId === msg.senderId) {
          const pending = this.pendingIceByPeer.get(msg.senderId) || [];
          if (pending.length < 256) pending.push(msg.payload.candidate);
          this.pendingIceByPeer.set(msg.senderId, pending);
        }
        break;
    }
  }

  /**
   * Controller initiates a real WebRTC connection to an agent device
   */
  public async initiateConnectionToDevice(
    targetDevice: RegisteredDevice,
    myIdentity: DeviceIdentity,
    myName: string
  ): Promise<void> {
    const iceConfiguration = await loadIceConfiguration();
    this.currentRemoteId = targetDevice.identity.id;
    this.ownDeviceIdentity = myIdentity;
    this.approvedPeerIds.delete(targetDevice.identity.id);
    this.cleanupPeerConnection();
    this.setConnectionState('Waiting for approval');

    // Notify agent of connection request
    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'CONNECT_REQUEST',
      senderId: myIdentity.id,
      senderName: myName,
      targetId: targetDevice.identity.id,
      timestamp: Date.now(),
    });

    const pc = new RTCPeerConnection({ iceServers: iceConfiguration.iceServers });
    this.peerConnection = pc;
    this.pendingIceCandidates = [];
    this.recoveryAttempts = 0;

    // Create Data Channel for real remote control commands and file chunks
    const dc = pc.createDataChannel('controller-channel', { ordered: true });
    this.setupDataChannel(dc);
    this.dataChannel = dc;

    // Handle remote media stream (screen capture from agent)
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStreamCb) {
          this.onRemoteStreamCb(this.remoteStream);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastMessage({
          id: crypto.randomUUID(),
          type: 'WEBRTC_ICE',
          senderId: myIdentity.id,
          senderName: myName,
          targetId: targetDevice.identity.id,
          timestamp: Date.now(),
          payload: { candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.handlePeerConnectionStateChange(pc.connectionState);
    };
    this.armConnectionTimeout(pc);
    this.installNetworkRecoveryListeners();

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected') {
        this.setConnectionState('Reconnecting');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        if (pc.connectionState !== 'connected' && pc.iceConnectionState === 'failed') {
          this.setConnectionState('Reconnecting');
          this.scheduleIceRestart();
        } else if (pc.iceConnectionState === 'closed') this.setConnectionState('Disconnected');
      }
    };

    // Create real SDP offer
    this.makingOffer = true;
    let offer: RTCSessionDescriptionInit;
    try {
      offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } finally { this.makingOffer = false; }

    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'WEBRTC_OFFER',
      senderId: myIdentity.id,
      senderName: myName,
      targetId: targetDevice.identity.id,
      timestamp: Date.now(),
      payload: { offer },
    });
  }

  /**
   * Agent approves the incoming connection request
   */
  public async approveIncomingConnection(
    controllerId: string,
    myIdentity: DeviceIdentity,
    myName: string,
    shareScreen: boolean = false,
    allowRemoteInput: boolean = false
  ): Promise<void> {
    if (shareScreen) await this.startScreenSharing();
    this.currentRemoteId = controllerId;
    this.ownDeviceIdentity = myIdentity;
    this.approvedPeerIds.add(controllerId);
    this.localRemoteInputAuthorized = false;
    if (allowRemoteInput && window.controllerDesktop?.authorizeRemoteInput) {
      this.localRemoteInputAuthorized = await window.controllerDesktop.authorizeRemoteInput(true);
    }
    this.setConnectionState('Connecting');

    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'CONNECT_APPROVE',
      senderId: myIdentity.id,
      senderName: myName,
      targetId: controllerId,
      timestamp: Date.now(),
    });

    const pendingOffer = this.pendingOffers.get(controllerId);
    if (pendingOffer) {
      this.pendingOffers.delete(controllerId);
      await this.handleRemoteOffer(pendingOffer.offer, controllerId, pendingOffer.senderName);
    }
    const pendingCandidates = this.pendingIceByPeer.get(controllerId) || [];
    this.pendingIceByPeer.delete(controllerId);
    for (const candidate of pendingCandidates) this.addRemoteIceCandidate(candidate);
  }

  /**
   * Agent rejects the incoming connection request
   */
  public rejectIncomingConnection(controllerId: string, myIdentity: DeviceIdentity, myName: string): void {
    this.ownDeviceIdentity = myIdentity;
    this.pendingOffers.delete(controllerId);
    this.pendingIceByPeer.delete(controllerId);
    this.approvedPeerIds.delete(controllerId);
    this.setConnectionState('Disconnected');
    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'CONNECT_REJECT',
      senderId: myIdentity.id,
      senderName: myName,
      targetId: controllerId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle receiving an SDP offer (on Agent)
   */
  private async handleRemoteOffer(offer: RTCSessionDescriptionInit, senderId: string, senderName: string) {
    this.currentRemoteId = senderId;
    if (!this.peerConnection) {
      const iceConfiguration = await loadIceConfiguration();
      const pc = new RTCPeerConnection({ iceServers: iceConfiguration.iceServers });
      this.peerConnection = pc;
      this.armConnectionTimeout(pc);
      this.installNetworkRecoveryListeners();

      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
        this.dataChannel = event.channel;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.broadcastMessage({
            id: crypto.randomUUID(),
            type: 'WEBRTC_ICE',
            senderId: this.ownDeviceIdentity?.id || 'agent',
            senderName: 'Agent Node',
            targetId: senderId,
            timestamp: Date.now(),
            payload: { candidate: event.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        this.handlePeerConnectionStateChange(pc.connectionState);
      };

      // Add local screen stream tracks if already captured
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.localStream!);
        });
      }
    }

    const pc = this.peerConnection;
    const offerCollision = this.makingOffer || pc.signalingState !== 'stable';
    const polite = (this.ownDeviceIdentity?.id || '').localeCompare(senderId) > 0;
    this.ignoreOffer = !polite && offerCollision;
    if (this.ignoreOffer) return;
    if (offerCollision && polite) await pc.setLocalDescription({ type: 'rollback' });
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'WEBRTC_ANSWER',
      senderId: this.ownDeviceIdentity?.id || 'agent',
      senderName: 'Agent Node',
      targetId: senderId,
      timestamp: Date.now(),
      payload: { answer },
    });
  }

  /**
   * Handle receiving SDP answer (on Controller)
   */
  private async handleRemoteAnswer(answer: RTCSessionDescriptionInit) {
    if (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
      const pc = this.peerConnection;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushPendingIceCandidates(pc);
    }
  }

  /**
   * Update real connection state based on actual WebRTC state
   */
  private handlePeerConnectionStateChange(state: RTCPeerConnectionState) {
    switch (state) {
      case 'connected':
        if (this.connectionTimeout) window.clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
        if (this.recoveryTimer) window.clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        this.recoveryAttempts = 0;
        this.setConnectionState('Connected');
        this.startRealStatsMonitoring();
        break;
      case 'connecting':
        this.setConnectionState('Connecting');
        break;
      case 'disconnected':
        this.setConnectionState('Reconnecting');
        void window.controllerDesktop?.releaseRemoteInput?.();
        this.stopRealStatsMonitoring();
        this.scheduleIceRestart();
        break;
      case 'failed':
        this.setConnectionState('Reconnecting');
        void window.controllerDesktop?.releaseRemoteInput?.();
        this.scheduleIceRestart();
        break;
      case 'closed':
        this.setConnectionState('Disconnected');
        this.stopRealStatsMonitoring();
        break;
    }
  }

  private armConnectionTimeout(pc: RTCPeerConnection) {
    if (this.connectionTimeout) window.clearTimeout(this.connectionTimeout);
    this.connectionTimeout = window.setTimeout(() => {
      this.connectionTimeout = null;
      if (this.peerConnection !== pc || pc.connectionState === 'connected') return;
      const remoteId = this.currentRemoteId;
      this.setConnectionState('Disconnected');
      this.cleanupPeerConnection();
      if (remoteId) {
        this.approvedPeerIds.delete(remoteId);
        this.broadcastMessage({ id: crypto.randomUUID(), type: 'DISCONNECT', senderId: this.ownDeviceIdentity?.id || 'local', senderName: 'THE CONTROLLER', targetId: remoteId, timestamp: Date.now() });
      }
      this.currentRemoteId = null;
    }, 30000);
  }

  private installNetworkRecoveryListeners() {
    if (this.networkListenersInstalled || typeof window === 'undefined') return;
    this.networkListenersInstalled = true;
    window.addEventListener('offline', this.onNetworkInterruption);
    window.addEventListener('online', this.onNetworkRestored);
    this.displayChangeUnsubscribe = window.controllerDesktop?.onSystemEvent?.((event) => {
      if (event.type === 'display-changed' && this.localStream) void this.refreshPrimaryCapture();
      if (event.type === 'resume') {
        this.setConnectionState(this.peerConnection?.connectionState === 'connected' ? 'Connected' : 'Reconnecting');
        if (this.localStream) void this.refreshPrimaryCapture();
        this.scheduleIceRestart();
      }
      if (event.type === 'remote-input-revoked') {
        this.localRemoteInputAuthorized = false;
        this.sendOverDataChannel({ type: 'REMOTE_CONTROL_REVOKED' });
      }
      if (event.type === 'suspend' && this.peerConnection?.connectionState !== 'connected') this.setConnectionState('Reconnecting');
    }) || null;
  }

  private onNetworkInterruption = () => {
    if (this.peerConnection) this.setConnectionState('Reconnecting');
  };

  private onNetworkRestored = () => {
    if (this.peerConnection && this.peerConnection.connectionState !== 'connected') this.scheduleIceRestart();
  };

  private async refreshPrimaryCapture() {
    const oldStream = this.localStream;
    const pc = this.peerConnection;
    if (!oldStream) return;
    try {
      let capture;
      try { capture = await capturePrimaryDisplay(this.activeCaptureDisplayId, this.activeCaptureAudio); }
      catch (error) {
        if (!this.activeCaptureDisplayId) throw error;
        console.warn('Selected display is unavailable; falling back to primary display.', error);
        capture = await capturePrimaryDisplay(undefined, this.activeCaptureAudio);
        this.activeCaptureDisplayId = capture.displayId || undefined;
      }
      const { stream } = capture;
      const oldTrack = oldStream.getVideoTracks()[0];
      const newTrack = stream.getVideoTracks()[0];
      if (pc && newTrack) {
        for (const track of stream.getTracks()) {
          const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
          if (sender) await sender.replaceTrack(track);
          else pc.addTrack(track, stream);
        }
      }
      this.localStream = stream;
      if (oldTrack) oldTrack.onended = null;
      oldStream.getTracks().forEach((track) => track.stop());
      newTrack.onended = () => this.stopScreenSharing();
    } catch (error) {
      console.warn('Primary display capture could not be restored:', error);
    }
  }

  private addRemoteIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.ignoreOffer) return;
    const pc = this.peerConnection;
    if (!pc || !pc.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => console.warn('Could not apply remote ICE candidate:', error));
  }

  private async flushPendingIceCandidates(pc: RTCPeerConnection) {
    const candidates = this.pendingIceCandidates.splice(0);
    for (const candidate of candidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn('Could not apply queued ICE candidate:', error); }
    }
  }

  private scheduleIceRestart() {
    const pc = this.peerConnection;
    if (!pc || this.recoveryTimer) return;
    if (this.recoveryAttempts >= 2) {
      const remoteId = this.currentRemoteId;
      this.setConnectionState('Disconnected');
      this.cleanupPeerConnection();
      if (remoteId) this.approvedPeerIds.delete(remoteId);
      this.currentRemoteId = null;
      return;
    }
    this.recoveryTimer = window.setTimeout(async () => {
      this.recoveryTimer = null;
      if (this.peerConnection !== pc || (pc.connectionState !== 'disconnected' && pc.connectionState !== 'failed')) return;
      this.recoveryAttempts += 1;
      try {
        pc.restartIce();
        this.makingOffer = true;
        let offer: RTCSessionDescriptionInit;
        try {
          offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
        } finally { this.makingOffer = false; }
        if (this.currentRemoteId) {
          this.broadcastMessage({
            id: crypto.randomUUID(),
            type: 'WEBRTC_OFFER',
            senderId: this.ownDeviceIdentity?.id || 'local',
            senderName: 'THE CONTROLLER',
            targetId: this.currentRemoteId,
            timestamp: Date.now(),
            payload: { offer },
          });
        }
        this.recoveryTimer = window.setTimeout(() => {
          this.recoveryTimer = null;
          if (this.peerConnection !== pc || pc.connectionState === 'connected') return;
          this.scheduleIceRestart();
        }, 12000);
      } catch (error) {
        console.warn('ICE restart failed:', error);
        this.setConnectionState('Disconnected');
        this.cleanupPeerConnection();
      }
    }, 5000);
  }

  /**
   * Starts real primary-display capture through the native platform capture service.
   */
  public async startScreenSharing(displayId?: string, includeAudio = false): Promise<MediaStream | null> {
    try {
      const { stream, displayId: capturedDisplayId } = await capturePrimaryDisplay(displayId, includeAudio);
      this.installNetworkRecoveryListeners();

      this.localStream = stream;
      this.activeCaptureDisplayId = capturedDisplayId || displayId;
      this.activeCaptureAudio = includeAudio;

      // Add track to active peer connection if connected
      if (this.peerConnection) {
        stream.getTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, stream);
        });

        // Trigger renegotiation
        const pc = this.peerConnection;
        this.makingOffer = true;
        let offer: RTCSessionDescriptionInit;
        try {
          offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
        } finally { this.makingOffer = false; }
        this.broadcastMessage({
          id: crypto.randomUUID(),
          type: 'WEBRTC_OFFER',
            senderId: this.ownDeviceIdentity?.id || 'agent',
          senderName: 'Agent Node',
          targetId: this.currentRemoteId || undefined,
          timestamp: Date.now(),
          payload: { offer },
        });
      }

      // Handle user stopping screen share via browser stop button
      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenSharing();
      };

      return stream;
    } catch (err) {
      console.warn('Screen capture is unavailable or access was denied:', err);
      throw err;
    }
  }

  public stopScreenSharing() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.activeCaptureDisplayId = undefined;
    this.activeCaptureAudio = false;
  }

  /**
   * Genuine WebRTC performance statistics extraction.
   * NEVER uses Math.random() or hardcoded values.
   */
  private startRealStatsMonitoring() {
    this.stopRealStatsMonitoring();

    this.statsInterval = window.setInterval(async () => {
      if (!this.peerConnection || this.connectionState !== 'Connected') {
        return;
      }

      try {
        const stats = await this.peerConnection.getStats();
        let fps: number | null = null;
        let latencyMs: number | null = null;
        let bitrateKbps: number | null = null;
        let packetLossPct: number | null = null;
        let jitterMs: number | null = null;
        let resolution: string | null = null;
        let framesDecoded: number | null = null;
        let bytesReceived: number | null = null;
        let outboundCodecId: string | null = null;
        let encoderImplementation: string | null = null;

        const currentTimestamp = Date.now();
        const timeDiffSeconds = (currentTimestamp - this.prevTimestamp) / 1000;

        stats.forEach((report) => {
          // Candidate pair for latency / RTT
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              latencyMs = Math.round(report.currentRoundTripTime * 1000);
            } else if (typeof report.totalRoundTripTime === 'number' && typeof report.responsesReceived === 'number') {
              latencyMs = Math.round((report.totalRoundTripTime / report.responsesReceived) * 1000);
            }
          }

          // Inbound RTP for video (Controller perspective)
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (typeof report.framesPerSecond === 'number') {
              fps = Math.round(report.framesPerSecond);
            } else if (typeof report.framesDecoded === 'number' && timeDiffSeconds > 0) {
              const framesDelta = report.framesDecoded - this.prevFramesDecoded;
              fps = Math.max(0, Math.round(framesDelta / timeDiffSeconds));
            }

            if (typeof report.framesDecoded === 'number') {
              framesDecoded = report.framesDecoded;
              this.prevFramesDecoded = report.framesDecoded;
            }

            if (typeof report.bytesReceived === 'number') {
              bytesReceived = report.bytesReceived;
              if (timeDiffSeconds > 0 && this.prevBytesReceived > 0) {
                const bytesDelta = report.bytesReceived - this.prevBytesReceived;
                bitrateKbps = Math.round((bytesDelta * 8) / (timeDiffSeconds * 1000));
              }
              this.prevBytesReceived = report.bytesReceived;
            }

            if (typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
              const totalPackets = report.packetsLost + report.packetsReceived;
              if (totalPackets > 0) {
                packetLossPct = Math.round((report.packetsLost / totalPackets) * 1000) / 10;
              }
            }

            if (typeof report.jitter === 'number') {
              jitterMs = Math.round(report.jitter * 1000);
            }

            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}×${report.frameHeight}`;
            }
          }

          // Outbound RTP for video (Agent perspective)
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            if (typeof report.codecId === 'string') outboundCodecId = report.codecId;
            if (typeof report.encoderImplementation === 'string') encoderImplementation = report.encoderImplementation;
            if (typeof report.framesPerSecond === 'number') {
              fps = Math.round(report.framesPerSecond);
            }
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}×${report.frameHeight}`;
            }
          }
        });

        const videoCodec = outboundCodecId ? stats.get(outboundCodecId)?.mimeType || null : null;
        this.prevTimestamp = currentTimestamp;

        const metrics: RealPerformanceMetrics = {
          fps,
          latencyMs,
          bitrateKbps,
          packetLossPct,
          jitterMs,
          resolution,
          framesDecoded,
          bytesReceived,
          lastUpdated: currentTimestamp,
          videoCodec,
          encoderImplementation,
        };

        if (this.onMetricsCb) {
          this.onMetricsCb(metrics);
        }
      } catch (err) {
        console.warn('Error reading WebRTC stats:', err);
      }
    }, 1500);
  }

  private stopRealStatsMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Setup real RTCDataChannel for real messaging
   */
  private setupDataChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      console.log('Real RTCDataChannel opened');
      channel.send(JSON.stringify({ type: this.localRemoteInputAuthorized ? 'REMOTE_CONTROL_GRANTED' : 'REMOTE_CONTROL_REVOKED' }));
    };

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) { void this.handleFileChunk(event.data); return; }
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CLIPBOARD_TEXT' && typeof data.text === 'string' && new TextEncoder().encode(data.text).byteLength <= 1024 * 1024) {
          this.onClipboardTextCb?.(data.text);
        } else if (data.type === 'FILE_OFFER' && this.isValidFileOffer(data.file)) {
          const item = data.file as { id: string; name: string; size: number; lastModified: number; sha256: string };
          this.pendingFileOffers.set(item.id, item);
          this.onFilesReceivedCb?.([{ id: item.id, name: item.name, size: item.size, type: 'application/octet-stream', lastModified: item.lastModified }]);
        } else if (data.type === 'FILE_REQUEST' && typeof data.id === 'string') {
          const file = this.localFiles.get(data.id);
          if (file) this.sendOverDataChannel({ type: 'FILE_OFFER', file });
        } else if (data.type === 'FILE_ACCEPT' && this.localFiles.has(data.id)) {
          this.transferFileTokens.set(data.transferId || data.id, data.id);
          void this.transmitFile(data.id, data.transferId || data.id);
        } else if (data.type === 'FILE_CHUNK_ACK') {
          this.fileAckWaiters.get(data.id)?.({ sequence: data.sequence, receivedBytes: data.receivedBytes });
        } else if (data.type === 'FILE_TRANSFER_COMPLETE') {
          this.emitTransferProgress({ id: data.id, name: data.name, sentBytes: data.size, totalBytes: data.size, state: 'complete' });
          const token = this.transferFileTokens.get(data.id) || data.id;
          this.transferFileTokens.delete(data.id);
          void window.controllerDesktop?.releaseTransferFile?.(token);
          this.localFiles.delete(token);
        } else if (data.type === 'FILE_REJECT' || data.type === 'FILE_TRANSFER_CANCEL') {
          this.emitTransferProgress({ id: data.id, name: data.name || 'File', sentBytes: 0, totalBytes: 0, state: 'cancelled' });
          this.pendingFileOffers.delete(data.id);
          const token = this.transferFileTokens.get(data.id) || data.id;
          this.transferFileTokens.delete(data.id); this.localFiles.delete(token);
          void window.controllerDesktop?.releaseTransferFile?.(token);
          if (this.incomingFileTransfers.has(data.id)) {
            this.incomingFileTransfers.delete(data.id);
            void window.controllerDesktop?.cancelFileReceive?.(data.id);
          }
        } else if (data.type === 'FILE_TRANSFER_EMPTY') {
          const receiver = this.incomingFileTransfers.get(data.id);
          if (receiver?.size === 0) void this.finishIncomingFile(data.id, receiver);
        } else if (data.type === 'PING') {
          this.sendOverDataChannel({ type: 'PONG', timestamp: data.timestamp });
        } else if (data.type === 'REMOTE_CONTROL_GRANTED' || data.type === 'REMOTE_CONTROL_REVOKED') {
          this.remoteControlGranted = data.type === 'REMOTE_CONTROL_GRANTED';
          this.onRemoteControlAuthorizationCb?.(this.remoteControlGranted);
        } else if (data.type === 'REMOTE_INPUT' && this.localRemoteInputAuthorized && data.event) {
          void window.controllerDesktop?.sendRemoteInputEvent?.(data.event).catch((error) => console.warn('Native remote input was rejected:', error));
        }
      } catch {
        // Raw data
      }
    };

    channel.onclose = () => {
      console.log('Real RTCDataChannel closed');
    };
  }

  private transferProgressListeners = new Set<(progress: { id: string; name: string; sentBytes: number; totalBytes: number; state: 'transferring' | 'complete' | 'cancelled' | 'error' }) => void>();
  public subscribeTransferProgress(cb: (progress: { id: string; name: string; sentBytes: number; totalBytes: number; state: 'transferring' | 'complete' | 'cancelled' | 'error' }) => void): () => void { this.transferProgressListeners.add(cb); return () => this.transferProgressListeners.delete(cb); }
  private emitTransferProgress(progress: { id: string; name: string; sentBytes: number; totalBytes: number; state: 'transferring' | 'complete' | 'cancelled' | 'error' }) { this.transferProgressListeners.forEach((listener) => listener(progress)); }
  private onClipboardTextCb: ((text: string) => void) | null = null;
  public setOnClipboardText(cb: (text: string) => void) { this.onClipboardTextCb = cb; }
  public async sendClipboardText(): Promise<void> {
    const text = await window.controllerDesktop?.readClipboardText?.();
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 1024 * 1024) throw new Error('Clipboard text is unavailable or exceeds the 1 MiB limit.');
    if (!this.sendOverDataChannel({ type: 'CLIPBOARD_TEXT', text })) throw new Error('Clipboard could not be sent because the peer connection is unavailable.');
  }
  public async acceptClipboardText(text: string): Promise<void> {
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 1024 * 1024) throw new Error('Clipboard text is invalid or exceeds the 1 MiB limit.');
    if (!await window.controllerDesktop?.writeClipboardText?.(text)) throw new Error('Native clipboard write is unavailable or unauthorized.');
  }
  private isValidFileOffer(file: any): boolean { return !!file && typeof file.id === 'string' && file.id.length < 80 && typeof file.name === 'string' && file.name.length > 0 && file.name.length < 181 && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 8 * 1024 ** 4 && Number.isFinite(file.lastModified) && /^[0-9a-f]{64}$/i.test(file.sha256); }
  public async selectAndOfferFiles(): Promise<RealFileItem[]> {
    const bridge = window.controllerDesktop;
    if (!bridge?.selectTransferFiles) throw new Error('Native file transfer is available in the Windows desktop app.');
    const files = await bridge.selectTransferFiles();
    const items: RealFileItem[] = [];
    for (const file of files) { this.localFiles.set(file.id, file); this.sendOverDataChannel({ type: 'FILE_OFFER', file }); items.push({ id: file.id, name: file.name, size: file.size, type: 'application/octet-stream', lastModified: file.lastModified }); }
    return items;
  }
  public requestFileTransfer(id: string): boolean { return this.sendOverDataChannel({ type: 'FILE_REQUEST', id }); }
  public async acceptFileTransfer(id: string): Promise<void> {
    const offer = this.pendingFileOffers.get(id); if (!offer) throw new Error('This file offer is no longer available.');
    const transferId = crypto.randomUUID();
    const receiver = await window.controllerDesktop?.beginFileReceive?.({ transferId, name: offer.name, size: offer.size, sha256: offer.sha256 });
    if (!receiver) { this.sendOverDataChannel({ type: 'FILE_REJECT', id }); return; }
    this.pendingFileOffers.delete(id);
    this.incomingFileTransfers.set(transferId, { sequence: 0, size: offer.size, name: offer.name, sha256: offer.sha256 });
    this.sendOverDataChannel({ type: 'FILE_ACCEPT', id, transferId });
  }
  public rejectFileTransfer(id: string): void { this.pendingFileOffers.delete(id); this.sendOverDataChannel({ type: 'FILE_REJECT', id }); }
  public cancelFileTransfer(id: string): void {
    this.sendOverDataChannel({ type: 'FILE_TRANSFER_CANCEL', id });
    const token = this.transferFileTokens.get(id) || id;
    this.transferFileTokens.delete(id); this.localFiles.delete(token);
    void window.controllerDesktop?.releaseTransferFile?.(token);
    if (this.incomingFileTransfers.has(id)) { this.incomingFileTransfers.delete(id); void window.controllerDesktop?.cancelFileReceive?.(id); }
    this.emitTransferProgress({ id, name: 'File transfer', sentBytes: 0, totalBytes: 0, state: 'cancelled' });
  }
  private async transmitFile(fileId: string, transferId: string): Promise<void> {
    const bridge = window.controllerDesktop, file = this.localFiles.get(fileId); if (!bridge?.readTransferFileChunk || !file || !this.dataChannel) return;
    let offset = 0, sequence = 0;
    try {
      while (offset < file.size) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') throw new Error('File transfer connection was lost.');
        const chunk = await bridge.readTransferFileChunk(file.id, offset, 64 * 1024);
        if (!chunk.bytesRead) throw new Error('Selected file ended before the advertised size.');
        const frame = new Uint8Array(20 + chunk.bytesRead); const hex = transferId.replace(/-/g, '');
        for (let i = 0; i < 16; i++) frame[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        new DataView(frame.buffer).setUint32(16, sequence, false); frame.set(new Uint8Array(chunk.data, 0, chunk.bytesRead), 20);
        const ack = new Promise<{ sequence: number; receivedBytes: number }>((resolve, reject) => { const timer = window.setTimeout(() => { this.fileAckWaiters.delete(transferId); reject(new Error('File transfer acknowledgement timed out.')); }, 15000); this.fileAckWaiters.set(transferId, (value) => { window.clearTimeout(timer); this.fileAckWaiters.delete(transferId); resolve(value); }); });
        this.dataChannel.send(frame.buffer);
        const result = await ack; if (result.sequence !== sequence) throw new Error('File transfer acknowledgement was invalid.');
        offset = result.receivedBytes; sequence++;
        this.emitTransferProgress({ id: transferId, name: file.name, sentBytes: offset, totalBytes: file.size, state: 'transferring' });
      }
      if (file.size === 0) this.sendOverDataChannel({ type: 'FILE_TRANSFER_EMPTY', id: transferId });
    } catch (error) {
      this.emitTransferProgress({ id: transferId, name: file.name, sentBytes: offset, totalBytes: file.size, state: 'error' });
      this.cancelFileTransfer(transferId);
    }
  }
  private async handleFileChunk(frame: ArrayBuffer): Promise<void> {
    if (frame.byteLength < 21 || frame.byteLength > 20 + 64 * 1024) return;
    const data = new Uint8Array(frame), hex = Array.from(data.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const receiver = this.incomingFileTransfers.get(id); if (!receiver) return;
    const sequence = new DataView(frame).getUint32(16, false); if (sequence !== receiver.sequence) return;
    const chunk = data.slice(20).buffer; const result = await window.controllerDesktop?.writeFileReceiveChunk?.({ transferId: id, sequence, data: chunk }); if (!result) return;
    receiver.sequence++; this.sendOverDataChannel({ type: 'FILE_CHUNK_ACK', id, sequence, receivedBytes: result.receivedBytes });
    this.emitTransferProgress({ id, name: receiver.name, sentBytes: result.receivedBytes, totalBytes: receiver.size, state: 'transferring' });
    if (result.receivedBytes === receiver.size) await this.finishIncomingFile(id, receiver);
  }
  private async finishIncomingFile(id: string, receiver: { sequence: number; size: number; name: string; sha256: string }): Promise<void> {
    const result = await window.controllerDesktop?.finishFileReceive?.(id); if (!result) return;
    this.incomingFileTransfers.delete(id); this.sendOverDataChannel({ type: 'FILE_TRANSFER_COMPLETE', id, name: result.name, size: result.size });
    this.emitTransferProgress({ id, name: receiver.name, sentBytes: result.size, totalBytes: result.size, state: 'complete' });
  }

  public sendOverDataChannel(data: any): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(typeof data === 'string' ? data : JSON.stringify(data));
        return true;
      } catch (err) {
        console.warn('DataChannel send failed:', err);
      }
    }
    return false;
  }

  public sendRemoteInput(input: { kind: 'move'; x: number; y: number } | { kind: 'button'; button: 'left' | 'right' | 'middle'; down: boolean } | { kind: 'wheel'; delta: number } | { kind: 'key'; key: number; down: boolean } | { kind: 'releaseAll' }): boolean {
    return this.sendOverDataChannel({ type: 'REMOTE_INPUT', event: input });
  }

  public disconnectSession() {
    this.broadcastMessage({
      id: crypto.randomUUID(),
      type: 'DISCONNECT',
      senderId: this.ownDeviceIdentity?.id || 'local',
      senderName: 'local',
      targetId: this.currentRemoteId || undefined,
      timestamp: Date.now(),
    });
    this.cleanupPeerConnection();
    if (this.currentRemoteId) this.approvedPeerIds.delete(this.currentRemoteId);
    if (this.currentRemoteId) this.pendingOffers.delete(this.currentRemoteId);
    if (this.currentRemoteId) this.pendingIceByPeer.delete(this.currentRemoteId);
    this.currentRemoteId = null;
    this.setConnectionState('Disconnected');
  }

  private cleanupPeerConnection() {
    for (const id of this.incomingFileTransfers.keys()) void window.controllerDesktop?.cancelFileReceive?.(id);
    for (const token of this.localFiles.keys()) void window.controllerDesktop?.releaseTransferFile?.(token);
    this.incomingFileTransfers.clear(); this.localFiles.clear(); this.transferFileTokens.clear(); this.fileAckWaiters.clear();
    if (this.localRemoteInputAuthorized) this.sendOverDataChannel({ type: 'REMOTE_CONTROL_REVOKED' });
    this.localRemoteInputAuthorized = false;
    this.remoteControlGranted = false;
    this.onRemoteControlAuthorizationCb?.(false);
    void window.controllerDesktop?.releaseRemoteInput?.();
    void window.controllerDesktop?.authorizeRemoteInput?.(false);
    if (this.connectionTimeout) window.clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;
    if (this.recoveryTimer) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.pendingIceCandidates = [];
    this.stopRealStatsMonitoring();
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
    this.stopScreenSharing();
    this.displayChangeUnsubscribe?.();
    this.displayChangeUnsubscribe = null;
    window.removeEventListener('offline', this.onNetworkInterruption);
    window.removeEventListener('online', this.onNetworkRestored);
    this.networkListenersInstalled = false;
    this.remoteStream = null;
    if (this.onRemoteStreamCb) {
      this.onRemoteStreamCb(null);
    }
  }
}

export const peerMesh = new RealPeerMeshService();
