/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Activity,
  HardDrive,
  Cpu,
  Terminal,
  Download,
  Send,
  Maximize2,
  FileText,
  FileCode,
  FileArchive,
  Layers,
  Wifi,
  Battery,
  AlertCircle,
  Clock,
  Play,
  Share2,
} from 'lucide-react';
import {
  ConnectionState,
  RealFileItem,
  RealPerformanceMetrics,
  RegisteredDevice,
} from '../types/controller';
import { EmptyFiles, EmptyPerformance, EmptySessionPrompt } from './EmptyState';
import { peerMesh } from '../services/peerMesh';

interface RemoteSessionViewProps {
  device: RegisteredDevice | null;
  connectionState: ConnectionState;
  remoteStream: MediaStream | null;
  metrics: RealPerformanceMetrics | null;
  files: RealFileItem[];
  onConnect: (device: RegisteredDevice) => void;
  onDisconnect: () => void;
  onRequestFileAccess?: () => void;
  isDemoMode?: boolean;
}

export const RemoteSessionView: React.FC<RemoteSessionViewProps> = ({
  device,
  connectionState,
  remoteStream,
  metrics,
  files,
  onConnect,
  onDisconnect,
  onRequestFileAccess,
  isDemoMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<'screen' | 'performance' | 'files' | 'system' | 'terminal'>('screen');
  const [terminalLogs, setTerminalLogs] = useState<Array<{ text: string; time: string; type: 'info' | 'out' | 'err' }>>([]);
  const [commandInput, setCommandInput] = useState('');
  const [isPingRunning, setIsPingRunning] = useState(false);
  const [remoteControlGranted, setRemoteControlGranted] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [fileTransfers, setFileTransfers] = useState<Array<{ id: string; name: string; sentBytes: number; totalBytes: number; state: string }>>([]);
  const [clipboardAllowed, setClipboardAllowed] = useState(false);
  const [incomingClipboardText, setIncomingClipboardText] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pressedKeys = useRef(new Set<number>());
  const pressedButtons = useRef(new Set<'left' | 'right' | 'middle'>());
  const isConnected = connectionState === 'Connected';

 useEffect(() => {
  peerMesh.setOnRemoteControlAuthorization(setRemoteControlGranted);

  const unsubscribeTransferProgress = peerMesh.subscribeTransferProgress((progress) =>
    setFileTransfers((old) => [
      ...old.filter((item) => item.id !== progress.id),
      progress,
    ])
  );

  peerMesh.setOnClipboardText(setIncomingClipboardText);

  return () => {
    peerMesh.setOnRemoteControlAuthorization(() => {});
    unsubscribeTransferProgress();
    peerMesh.setOnClipboardText(() => {});
    void window.controllerDesktop?.authorizeClipboard?.(false);
    void peerMesh.sendRemoteInput({ kind: 'releaseAll' });
  };
}, []);
  useEffect(() => {
    if (!isConnected) {
      setInputEnabled(false);
      setRemoteControlGranted(false);
      pressedKeys.current.clear();
      pressedButtons.current.clear();
    }
  }, [isConnected, device?.identity.id]);

  const sendInput = (event: Parameters<typeof peerMesh.sendRemoteInput>[0]) => {
    if (isConnected && inputEnabled && remoteControlGranted) peerMesh.sendRemoteInput(event);
  };

  const releaseInput = () => {
    pressedKeys.current.clear();
    pressedButtons.current.clear();
    peerMesh.sendRemoteInput({ kind: 'releaseAll' });
  };

  const sendPointerPosition = (event: React.PointerEvent<HTMLVideoElement> | React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    const y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) sendInput({ kind: 'move', x, y });
  };

  const sendMouseButton = (event: React.PointerEvent<HTMLVideoElement>, down: boolean) => {
    const button = event.button === 0 ? 'left' : event.button === 1 ? 'middle' : event.button === 2 ? 'right' : null;
    if (button) {
      event.preventDefault();
      event.currentTarget.parentElement?.focus();
      sendPointerPosition(event);
      if (down) pressedButtons.current.add(button);
      else pressedButtons.current.delete(button);
      sendInput({ kind: 'button', button, down });
    }
  };

  const handleRemoteKey = (event: React.KeyboardEvent<HTMLDivElement>, down: boolean) => {
    const sideSpecificModifier: Record<string, number> = {
      ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3,
      AltLeft: 0xa4, AltRight: 0xa5, MetaLeft: 0x5b, MetaRight: 0x5c,
    };
    const key = sideSpecificModifier[event.code] || event.keyCode;
    if (!key || key > 0xff || !isConnected || !inputEnabled || !remoteControlGranted) return;
    event.preventDefault();
    if (down) {
      if (pressedKeys.current.has(key)) return;
      pressedKeys.current.add(key);
    } else {
      pressedKeys.current.delete(key);
    }
    sendInput({ kind: 'key', key, down });
  };

  // Attach real remote MediaStream to video element
  useEffect(() => {
    if (videoRef.current) {
      if (remoteStream) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch((err) => console.warn('Video auto-play prevented:', err));
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [remoteStream]);

  // Terminal log listener for real ping-pong and data channel events
  useEffect(() => {
    const unsub = peerMesh.subscribe((msg) => {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      if (msg.type === 'COMMAND_RESULT') {
        setTerminalLogs((prev) => [
          ...prev,
          { text: `[AGENT EXEC]: ${JSON.stringify(msg.payload)}`, time: timeStr, type: 'out' },
        ]);
      } else if (msg.type === 'FILE_MANIFEST_UPDATE') {
        setTerminalLogs((prev) => [
          ...prev,
          { text: `[FILE SYSTEM]: Manifest updated with ${msg.payload?.files?.length || 0} real files`, time: timeStr, type: 'info' },
        ]);
      }
    });

    return () => unsub();
  }, []);

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;

    const timeStr = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [
      ...prev,
      { text: `$ ${commandInput}`, time: timeStr, type: 'info' },
    ]);

    const sent = peerMesh.sendOverDataChannel({
      type: 'EXEC_COMMAND',
      command: commandInput,
      timestamp: Date.now(),
    });

    if (!sent) {
      setTerminalLogs((prev) => [
        ...prev,
        { text: `[ERROR]: DataChannel is not open. Connection state: ${connectionState}`, time: timeStr, type: 'err' },
      ]);
    }

    setCommandInput('');
  };

  const handleSendPing = () => {
    setIsPingRunning(true);
    const start = performance.now();
    const sent = peerMesh.sendOverDataChannel({
      type: 'PING',
      timestamp: Date.now(),
    });

    const timeStr = new Date().toLocaleTimeString();
    if (sent) {
      setTerminalLogs((prev) => [
        ...prev,
        { text: `[PING]: Sent 64-byte frame across WebRTC RTCDataChannel...`, time: timeStr, type: 'info' },
      ]);
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        { text: `[PING FAILED]: Session is not connected.`, time: timeStr, type: 'err' },
      ]);
    }
    setTimeout(() => setIsPingRunning(false), 500);
  };

  if (!device) {
    return <EmptySessionPrompt onConnect={() => {}} />;
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Top Header Bar */}
      <div className="border-b border-neutral-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-neutral-950/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-cyan-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-neutral-100">{device.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                isConnected
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/50'
                  : 'bg-neutral-800 text-neutral-400'
              }`}>
                {connectionState}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono">
              Fingerprint: {device.identity.fingerprint}
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
          <button
            onClick={() => setActiveTab('screen')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'screen'
                ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Screen Viewport</span>
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'performance'
                ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Real Telemetry</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Files ({files.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'system'
                ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>System Specs</span>
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'terminal'
                ? 'bg-neutral-800 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Control Channel</span>
          </button>
        </div>

        {/* Header Actions */}
        <div>
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => onConnect(device)}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              Connect to Device
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6">
        {/* TAB 1: Screen Viewport */}
        {activeTab === 'screen' && (
          <div className="space-y-4">
            <div
              tabIndex={0}
              onKeyDown={(event) => handleRemoteKey(event, true)}
              onKeyUp={(event) => handleRemoteKey(event, false)}
              onBlur={releaseInput}
              onContextMenu={(event) => event.preventDefault()}
              className="relative aspect-video w-full bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden flex items-center justify-center outline-none focus:ring-1 focus:ring-cyan-600"
            >
              {remoteStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  onPointerMove={sendPointerPosition}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); sendMouseButton(event, true); }}
                  onPointerUp={(event) => { sendMouseButton(event, false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                  onLostPointerCapture={() => {
                    pressedButtons.current.forEach((button) => sendInput({ kind: 'button', button, down: false }));
                    pressedButtons.current.clear();
                  }}
                  onWheel={(event) => { event.preventDefault(); sendInput({ kind: 'wheel', delta: Math.max(-1200, Math.min(1200, Math.round(-event.deltaY))) }); }}
                />
              ) : isConnected ? (
                <div className="text-center p-8 max-w-md">
                  <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-400 mb-3">
                    <Share2 className="w-6 h-6 text-neutral-400 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-200 mb-1">
                    Waiting for screen capture stream from remote agent.
                  </h4>
                  <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                    The peer connection is active. On the remote agent device, click <strong>[ Start Screen Stream ]</strong> to initiate live desktop / window streaming via WebRTC.
                  </p>
                </div>
              ) : (
                <div className="text-center p-8 max-w-md">
                  <Monitor className="w-10 h-10 text-neutral-400 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium text-neutral-300">No active remote session.</p>
                  <p className="text-xs text-neutral-400 mt-1 mb-4">
                    Connect to this device to establish real-time screen streaming.
                  </p>
                  <button
                    onClick={() => onConnect(device)}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Connect Session
                  </button>
                </div>
              )}

              {/* Real Stream Overlay Pill (Only when stream is active) */}
              {remoteStream && metrics && (
                <div className="absolute top-3 left-3 bg-neutral-950/85 backdrop-blur-md border border-neutral-800 rounded-lg px-3 py-1.5 flex items-center gap-3 text-[11px] font-mono text-neutral-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-emerald-400 font-semibold">LIVE WEBRTC</span>
                  </div>
                  {metrics.fps !== null && <span>{metrics.fps} FPS</span>}
                  {metrics.resolution && <span>{metrics.resolution}</span>}
                  {metrics.videoCodec && <span>{metrics.videoCodec.replace('video/', '')}</span>}
                  {metrics.latencyMs !== null && <span>{metrics.latencyMs} ms RTT</span>}
                </div>
              )}
            </div>

            {remoteControlGranted && (
              <label className="flex items-start gap-2 text-xs text-neutral-300">
                <input type="checkbox" checked={inputEnabled} onChange={(event) => { setInputEnabled(event.target.checked); if (!event.target.checked) releaseInput(); }} />
                Enable mouse and keyboard control for this session
              </label>
            )}

            {/* Quick Metrics Bar underneath viewport */}
            {isConnected && metrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3 font-mono">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Frames / Sec</div>
                  <div className="text-lg font-bold text-neutral-100 mt-0.5">
                    {metrics.fps !== null ? `${metrics.fps} FPS` : '—'}
                  </div>
                </div>
                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3 font-mono">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Round Trip Latency</div>
                  <div className="text-lg font-bold text-neutral-100 mt-0.5">
                    {metrics.latencyMs !== null ? `${metrics.latencyMs} ms` : '—'}
                  </div>
                </div>
                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3 font-mono">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Bitrate Received</div>
                  <div className="text-lg font-bold text-neutral-100 mt-0.5">
                    {metrics.bitrateKbps !== null ? `${metrics.bitrateKbps} kbps` : '—'}
                  </div>
                </div>
                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3 font-mono">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Packet Loss</div>
                  <div className="text-lg font-bold text-neutral-100 mt-0.5">
                    {metrics.packetLossPct !== null ? `${metrics.packetLossPct}%` : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPerformance />
            )}
          </div>
        )}

        {/* TAB 2: Real Performance Telemetry */}
        {activeTab === 'performance' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">
                  Genuine WebRTC Connection Telemetry
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Extracted in real-time from active RTCPeerConnection statistics reports. Zero simulation.
                </p>
              </div>
              <div className="text-xs font-mono text-neutral-400">
                {metrics?.lastUpdated
                  ? `Updated: ${new Date(metrics.lastUpdated).toLocaleTimeString()}`
                  : 'No active session stream'}
              </div>
            </div>

            {fileTransfers.length > 0 && <div className="space-y-2">
              {fileTransfers.map((transfer) => <div key={transfer.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs">
                <div className="flex justify-between text-neutral-300"><span>{transfer.name}</span><span>{transfer.state === 'transferring' ? `${transfer.totalBytes ? Math.floor(transfer.sentBytes / transfer.totalBytes * 100) : 100}%` : transfer.state}</span></div>
                <progress className="w-full h-2 mt-2" max={Math.max(1, transfer.totalBytes)} value={transfer.sentBytes} />
                <div className="mt-1 flex justify-between text-[10px] text-neutral-500"><span>{transfer.sentBytes.toLocaleString()} / {transfer.totalBytes.toLocaleString()} bytes</span>{transfer.state === 'transferring' && <button className="text-rose-300" onClick={() => peerMesh.cancelFileTransfer(transfer.id)}>Cancel</button>}</div>
              </div>)}
            </div>}

            {isConnected && metrics ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Frame Rate (FPS)</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.fps !== null ? metrics.fps : '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: RTCInboundRtpVideoStream.framesPerSecond
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Latency / Round-Trip Time</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.latencyMs !== null ? `${metrics.latencyMs} ms` : '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: RTCIceCandidatePair.currentRoundTripTime
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Throughput Bitrate</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.bitrateKbps !== null ? `${metrics.bitrateKbps} kbps` : '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: bytesReceived delta / interval delta
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Packet Loss</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.packetLossPct !== null ? `${metrics.packetLossPct}%` : '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: packetsLost / totalPackets
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Jitter Buffer</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.jitterMs !== null ? `${metrics.jitterMs} ms` : '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: RTCInboundRtpVideoStream.jitter
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono">
                  <div className="text-xs text-neutral-400">Stream Resolution</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {metrics.resolution || '—'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Source: frameWidth × frameHeight
                  </div>
                  {metrics.encoderImplementation && <div className="text-[10px] text-neutral-500 mt-1">Encoder: {metrics.encoderImplementation}</div>}
                </div>
              </div>
            ) : (
              <EmptyPerformance />
            )}
          </div>
        )}

        {/* TAB 3: Real Filesystem */}
        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">
                  Remote Filesystem
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Direct peer-to-peer file transfer. Only real files exposed by the agent are shown.
                </p>
              </div>

              <button
                onClick={() => void peerMesh.selectAndOfferFiles().catch((error) => window.alert(error instanceof Error ? error.message : 'Native file selection is unavailable.'))}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 cursor-pointer"
              >Send Local Files</button>
              {onRequestFileAccess && (
                <button
                  onClick={onRequestFileAccess}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 cursor-pointer"
                >
                  Expose Files from Agent
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <EmptyFiles
                isConnected={isConnected}
                hasFileAccess={device.fileAccessGranted || files.length > 0}
                onRequestAccess={onRequestFileAccess}
              />
            ) : (
              <div className="divide-y divide-neutral-800/80 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-neutral-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-cyan-400 shrink-0">
                        {file.type.includes('pdf') || file.type.includes('text') ? (
                          <FileText className="w-4 h-4" />
                        ) : file.type.includes('zip') || file.type.includes('tar') ? (
                          <FileArchive className="w-4 h-4" />
                        ) : (
                          <FileCode className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-neutral-200">{file.name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span>{file.type || 'binary'}</span>
                          <span>•</span>
                          <span>{new Date(file.lastModified).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {(
                      <button
                        onClick={() => void peerMesh.acceptFileTransfer(file.id).catch((error) => window.alert(error instanceof Error ? error.message : 'Could not receive the selected file.'))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Save to this device</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Real System Diagnostics */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            {window.controllerDesktop?.authorizeClipboard && <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
              <label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={clipboardAllowed} onChange={async (event) => {
                const allowed = await window.controllerDesktop?.authorizeClipboard?.(event.target.checked).catch(() => false);
                setClipboardAllowed(Boolean(allowed));
              }} />Allow clipboard access for this session</label>
              <button disabled={!clipboardAllowed || !isConnected} onClick={() => void peerMesh.sendClipboardText().catch((error) => window.alert(error instanceof Error ? error.message : 'Clipboard text could not be sent.'))} className="px-3 py-2 rounded-lg bg-neutral-800 text-xs text-neutral-200 disabled:opacity-40">Send this device’s text clipboard to peer</button>
              {incomingClipboardText !== null && <div className="text-xs text-amber-200">Peer sent text ({incomingClipboardText.length} characters).
                <button className="ml-2 text-cyan-300" onClick={() => void peerMesh.acceptClipboardText(incomingClipboardText).then(() => setIncomingClipboardText(null)).catch((error) => window.alert(String(error)))}>Write to this clipboard</button>
                <button className="ml-2 text-neutral-400" onClick={() => setIncomingClipboardText(null)}>Reject</button>
              </div>}
            </section>}
            <div className="pb-2 border-b border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-100">
                Verified System Diagnostics
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Information queried directly from the physical device platform APIs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                <h4 className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                  Hardware Architecture
                </h4>
                <div className="space-y-2 text-neutral-300">
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Platform:</span>
                    <span className="text-neutral-200">{device.systemInfo?.platform || 'Unavailable'}</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Logical CPU Cores:</span>
                    <span className="text-neutral-200">
                      {device.systemInfo?.cores ? `${device.systemInfo.cores} Cores` : 'API restricted by browser'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Device RAM Reported:</span>
                    <span className="text-neutral-200">
                      {device.systemInfo?.memoryGb ? `~${device.systemInfo.memoryGb} GB` : 'API restricted by browser'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Screen Resolution:</span>
                    <span className="text-neutral-200">{device.systemInfo?.screenResolution || 'Unavailable'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">GPU Renderer:</span>
                    <span className="text-neutral-200 text-[11px] truncate max-w-[200px]" title={device.systemInfo?.gpuRenderer}>
                      {device.systemInfo?.gpuRenderer || 'Unmasked renderer withheld'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                <h4 className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
                  Network & Environment
                </h4>
                <div className="space-y-2 text-neutral-300">
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Network Type:</span>
                    <span className="text-neutral-200">{device.systemInfo?.networkType || 'Standard IP / WebRTC'}</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Downlink Speed:</span>
                    <span className="text-neutral-200">
                      {device.systemInfo?.downlinkMbps ? `${device.systemInfo.downlinkMbps} Mbps` : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Battery Level:</span>
                    <span className="text-neutral-200">
                      {typeof device.systemInfo?.batteryLevel === 'number'
                        ? `${Math.round(device.systemInfo.batteryLevel * 100)}% ${device.systemInfo.isCharging ? '(Charging)' : ''}`
                        : 'Desktop / API restricted'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800/60 pb-1.5">
                    <span className="text-neutral-400">Timezone:</span>
                    <span className="text-neutral-200">{device.systemInfo?.timezone || 'Unavailable'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Language:</span>
                    <span className="text-neutral-200">{device.systemInfo?.language || 'Unavailable'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3.5 text-xs text-neutral-400">
              <span className="font-semibold text-neutral-300 block mb-1">User Agent String (Raw):</span>
              <p className="font-mono text-[11px] text-neutral-400 break-all">
                {device.systemInfo?.userAgent || 'Unavailable'}
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: Control Channel / Terminal */}
        {activeTab === 'terminal' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">
                  WebRTC RTCDataChannel Console
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Direct encrypted bidirectional communication pipe with remote agent node.
                </p>
              </div>

              <button
                onClick={handleSendPing}
                disabled={isPingRunning || !isConnected}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-mono font-medium border border-neutral-700 transition-colors cursor-pointer"
              >
                {isPingRunning ? 'Pinging...' : 'Send Real Ping'}
              </button>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs h-72 overflow-y-auto space-y-2 select-text">
              <div className="text-neutral-400">
                # THE CONTROLLER Real DataChannel Session established with node {device.identity.fingerprint}
              </div>
              <div className="text-neutral-400">
                # Connection state: {connectionState}. Zero mock telemetry.
              </div>

              {terminalLogs.length === 0 ? (
                <div className="text-neutral-400 italic py-4">
                  No commands sent yet. Type a command below or click &quot;Send Real Ping&quot; to test network round-trip.
                </div>
              ) : (
                terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`leading-relaxed ${
                      log.type === 'err'
                        ? 'text-rose-400'
                        : log.type === 'out'
                        ? 'text-cyan-400'
                        : 'text-neutral-300'
                    }`}
                  >
                    <span className="text-neutral-400 text-[10px] mr-2">[{log.time}]</span>
                    <span>{log.text}</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendCommand} className="flex gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Send control payload or diagnostic ping..."
                disabled={!isConnected}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isConnected || !commandInput.trim()}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
