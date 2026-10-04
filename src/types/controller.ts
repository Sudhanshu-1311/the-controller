/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionState =
  | 'Offline'
  | 'Connecting'
  | 'Waiting for approval'
  | 'Connected'
  | 'Reconnecting'
  | 'Disconnected';

export interface DeviceIdentity {
  id: string; // Real crypto UUID (e.g. crypto.randomUUID())
  fingerprint: string;
  registeredAt: number;
  publicKey?: string;
}

export interface SystemDiagnostics {
  platform: string;
  userAgent: string;
  cores?: number;
  memoryGb?: number;
  screenResolution?: string;
  colorDepth?: number;
  gpuRenderer?: string;
  batteryLevel?: number; // 0..1
  isCharging?: boolean;
  networkType?: string;
  downlinkMbps?: number;
  roundTripTimeMs?: number;
  timezone?: string;
  language?: string;
}

export interface RealPerformanceMetrics {
  fps: number | null;
  latencyMs: number | null;
  bitrateKbps: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  resolution: string | null;
  framesDecoded: number | null;
  bytesReceived: number | null;
  lastUpdated: number | null;
  videoCodec?: string | null;
  encoderImplementation?: string | null;
}

export interface RealFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface RegisteredDevice {
  identity: DeviceIdentity;
  name: string;
  role: 'agent' | 'controller';
  status: ConnectionState;
  presenceState?: 'STARTING' | 'AUTHENTICATING' | 'REGISTERING' | 'ONLINE' | 'RECONNECTING' | 'OFFLINE' | 'REMOTE_ACCESS_PAUSED';
  ownerUid?: string;
  allowRemoteConnections?: boolean;
  remoteAccessPaused?: boolean;
  lastSeen: number;
  systemInfo?: SystemDiagnostics;
  sharedFiles: RealFileItem[];
  fileAccessGranted: boolean;
  screenSharingActive: boolean;
}

export interface MeshMessage {
  id: string;
  type:
    | 'DEVICE_ANNOUNCE'
    | 'DEVICE_HEARTBEAT'
    | 'DEVICE_OFFLINE'
    | 'CONNECT_REQUEST'
    | 'CONNECT_APPROVE'
    | 'CONNECT_REJECT'
    | 'DISCONNECT'
    | 'WEBRTC_OFFER'
    | 'WEBRTC_ANSWER'
    | 'WEBRTC_ICE'
    | 'SYSTEM_INFO_UPDATE'
    | 'FILE_MANIFEST_UPDATE'
    | 'FILE_CHUNK'
    | 'REMOTE_COMMAND'
    | 'COMMAND_RESULT';
  senderId: string;
  senderName: string;
  targetId?: string;
  timestamp: number;
  payload?: any;
}
