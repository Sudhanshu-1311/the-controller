import type { AgentPresenceState, AgentSettings } from './agent';
import type { DeviceIdentity } from './controller';

declare global {
  interface Window {
    controllerDesktop?: {
      getIdentity(): Promise<DeviceIdentity>;
      getSettings(): Promise<Partial<AgentSettings>>;
      getStatus(): Promise<{ state: AgentPresenceState; details?: string }>;
      authGoogle?: () => Promise<{
  idToken: string;
  accessToken: string | null;
}>;
      setCredentials(value: { idToken: string; refreshToken: string; uid: string; firebaseConfig: Record<string, string> }): Promise<boolean>;
      clearCredentials(): Promise<boolean>;
      updateSettings(value: Partial<AgentSettings>): Promise<Partial<AgentSettings>>;
      startAgent(): Promise<boolean>;
      capturePrimaryScreen?(includeAudio?: boolean): Promise<{ sourceId: string; displayId: string; width: number; height: number; scaleFactor: number }>;
      prepareDisplayCapture?(displayId?: string, includeAudio?: boolean): Promise<boolean>;
      getDisplays?(): Promise<Array<{ id: string; label: string; width: number; height: number; scaleFactor: number; bounds: { x: number; y: number; width: number; height: number }; primary: boolean }>>;
      captureDisplay?(id: string, includeAudio?: boolean): Promise<{ sourceId: string; displayId: string; width: number; height: number; scaleFactor: number; label?: string }>;
      selectTransferFiles?(): Promise<Array<{ id: string; name: string; size: number; lastModified: number; sha256: string }>>;
      readTransferFileChunk?(id: string, offset: number, length: number): Promise<{ bytesRead: number; data: ArrayBuffer }>;
      releaseTransferFile?(id: string): Promise<boolean>;
      beginFileReceive?(request: { transferId: string; name: string; size: number; sha256: string }): Promise<{ transferId: string; name: string; chunkLimit: number } | null>;
      writeFileReceiveChunk?(request: { transferId: string; sequence: number; data: ArrayBuffer }): Promise<{ receivedBytes: number }>;
      finishFileReceive?(id: string): Promise<{ name: string; size: number }>;
      cancelFileReceive?(id: string): Promise<boolean>;
      authorizeRemoteInput?(allowed: boolean): Promise<boolean>;
      sendRemoteInputEvent?(input: { kind: 'move'; x: number; y: number } | { kind: 'button'; button: 'left' | 'right' | 'middle'; down: boolean } | { kind: 'wheel'; delta: number } | { kind: 'key'; key: number; down: boolean } | { kind: 'releaseAll' }): Promise<boolean>;
      releaseRemoteInput?(): Promise<boolean>;
      authorizeClipboard?(allowed: boolean): Promise<boolean>;
      readClipboardText?(): Promise<string>;
      writeClipboardText?(value: string): Promise<boolean>;
      hideWindow(): Promise<void>;
      showWindow(): Promise<void>;
      openSection(value: string): Promise<void>;
      exit(): Promise<void>;
      onState(callback: (value: { state: AgentPresenceState; details?: string }) => void): () => void;
      onSignal(callback: (value: { signalId: string; message: import('./controller').MeshMessage }) => void): () => void;
      onSettings(callback: (value: Partial<AgentSettings>) => void): () => void;
      acknowledgeSignal(signalId: string): void;
      onOpenSection(callback: (value: string) => void): () => void;
      onSystemEvent?(callback: (event: { type: 'display-changed' | 'suspend' | 'resume' | 'remote-input-revoked'; details?: Record<string, unknown> }) => void): () => void;
    };
  }
}

export {};
