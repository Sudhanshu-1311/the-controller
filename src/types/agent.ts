/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentPresenceState =
  | 'STARTING'
  | 'AUTHENTICATING'
  | 'REGISTERING'
  | 'ONLINE'
  | 'RECONNECTING'
  | 'OFFLINE'
  | 'STOPPING'
  | 'REMOTE_ACCESS_PAUSED';

export interface AuthorizedDeviceRecord {
  id: string;
  fingerprint: string;
  name: string;
  authorizedAt: number;
  lastAccessedAt: number;
}

export interface AgentSettings {
  keepRunningOnClose: boolean;
  startWithWindows: boolean;
  allowRemoteConnections: boolean;
  pauseRemoteAccess: boolean;
  authorizedDevices: AuthorizedDeviceRecord[];
  authorizedControllerUids: string[];
}

export interface PlatformCapabilities {
  isWindows: boolean;
  isAndroid: boolean;
  isLinux: boolean;
  isMac: boolean;
  supportsNativeService: boolean;
  supportsForegroundService: boolean;
  runtimeType: 'native-service' | 'pwa-worker' | 'browser-tab' | 'electron' | 'android-foreground-service';
}
