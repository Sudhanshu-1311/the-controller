/**
 * Browser-side settings and UI adapter. This is not a native agent.
 * Presence remains OFFLINE until a real native service and authenticated
 * signaling client are integrated.
 */

import { AgentPresenceState, AgentSettings, AuthorizedDeviceRecord, PlatformCapabilities } from '../types/agent';
import { DeviceIdentity, SystemDiagnostics } from '../types/controller';
import { peerMesh } from './peerMesh';

const SETTINGS_STORAGE_KEY = 'the_controller_agent_settings_v2';

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  keepRunningOnClose: false,
  startWithWindows: false,
  allowRemoteConnections: true,
  pauseRemoteAccess: false,
  authorizedDevices: [],
  authorizedControllerUids: [],
};

type StateChangeSubscriber = (state: AgentPresenceState, details?: string) => void;
type SettingsSubscriber = (settings: AgentSettings) => void;

class NativeAgentService {
  private state: AgentPresenceState = 'OFFLINE';
  private settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  private stateSubscribers = new Set<StateChangeSubscriber>();
  private settingsSubscribers = new Set<SettingsSubscriber>();
  private identity: DeviceIdentity | null = null;
  private diagnostics: SystemDiagnostics | null = null;
  private isWindowVisible = true;
  private onWindowVisibilityChangeCb: ((visible: boolean) => void) | null = null;

  constructor() {
    this.loadSettings();
    window.controllerDesktop?.onState(({ state, details }) => this.setState(state, details));
    window.controllerDesktop?.getStatus().then((value) => this.setState(value.state, value.details));
    window.controllerDesktop?.onSettings((settings) => this.applySettingsFromHost(settings));
  }

  public getPlatformCapabilities(): PlatformCapabilities {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isWindows = /Windows/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);
    const isLinux = /Linux/i.test(userAgent) && !isAndroid;
    const isMac = /Macintosh|Mac OS X/i.test(userAgent);
    return {
      isWindows,
      isAndroid,
      isLinux,
      isMac,
      supportsNativeService: false,
      supportsForegroundService: isAndroid && Boolean(window.controllerAndroid),
      runtimeType: isAndroid && window.controllerAndroid ? 'android-foreground-service' : typeof window !== 'undefined' && window.controllerDesktop ? 'electron' : 'browser-tab',
    };
  }

  public getState(): AgentPresenceState { return this.state; }
  public getSettings(): AgentSettings { return { ...this.settings }; }
  public getIdentity(): DeviceIdentity | null { return this.identity; }
  public getDiagnostics(): SystemDiagnostics | null { return this.diagnostics; }
  public isUIWindowVisible(): boolean { return this.isWindowVisible; }
  public setDeviceIdentity(identity: DeviceIdentity): void { this.identity = identity; }

  public setOnWindowVisibilityChange(cb: (visible: boolean) => void) {
    this.onWindowVisibilityChangeCb = cb;
  }

  public subscribeState(cb: StateChangeSubscriber): () => void {
    this.stateSubscribers.add(cb);
    cb(this.state);
    return () => this.stateSubscribers.delete(cb);
  }

  public subscribeSettings(cb: SettingsSubscriber): () => void {
    this.settingsSubscribers.add(cb);
    cb(this.getSettings());
    return () => this.settingsSubscribers.delete(cb);
  }

  private setState(state: AgentPresenceState, details?: string) {
    this.state = state;
    this.stateSubscribers.forEach((cb) => cb(state, details));
  }

  public updateSettings(updates: Partial<AgentSettings>) {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    this.settingsSubscribers.forEach((cb) => cb(this.getSettings()));
    void window.controllerDesktop?.updateSettings(updates);
  }

  public applySettingsFromHost(updates: Partial<AgentSettings>) {
    const previous = this.settings;
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    this.settingsSubscribers.forEach((cb) => cb(this.getSettings()));
    const priorUids = previous.authorizedControllerUids || [];
    const nextUids = this.settings.authorizedControllerUids || [];
    const authorizationRevoked = priorUids.some((uid) => !nextUids.includes(uid));
    if (authorizationRevoked || (updates.allowRemoteConnections === false && previous.allowRemoteConnections)) {
      peerMesh.disconnectSession();
    }
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) this.settings = { ...DEFAULT_AGENT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      this.settings = { ...DEFAULT_AGENT_SETTINGS };
    }
  }

  private saveSettings() {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Storage may be unavailable. */ }
  }

  /** No backend authentication/signaling exists in this browser build. */
  public async startAgent(): Promise<boolean> {
    if (window.controllerDesktop) {
      await window.controllerDesktop.startAgent();
      return true;
    }
    this.setState('OFFLINE', 'NOT IMPLEMENTED: native agent and authenticated signaling are unavailable');
    return false;
  }

  /** Hides app content in this page only; browsers cannot hide their own window. */
  public closeUIWindow(): void {
    void window.controllerDesktop?.hideWindow();
    this.isWindowVisible = false;
    this.onWindowVisibilityChangeCb?.(false);
    if (!this.settings.keepRunningOnClose) void this.exitTheController();
  }

  public restoreUIWindow(): void {
    void window.controllerDesktop?.showWindow();
    this.isWindowVisible = true;
    this.onWindowVisibilityChangeCb?.(true);
  }

  /** Stops this page's WebRTC session and marks local UI presence offline. */
  public async exitTheController(): Promise<void> {
    if (window.controllerDesktop) {
      await window.controllerDesktop.exit();
      return;
    }
    this.setState('STOPPING', 'Stopping the browser session');
    peerMesh.disconnectSession();
    if (this.identity) {
      peerMesh.broadcastMessage({
        id: crypto.randomUUID(),
        type: 'DEVICE_OFFLINE',
        senderId: this.identity.id,
        senderName: 'Browser agent',
        timestamp: Date.now(),
      });
    }
    this.setState('OFFLINE', 'Browser session stopped; native service is not implemented');
    this.isWindowVisible = false;
    this.onWindowVisibilityChangeCb?.(false);
  }

  public pauseRemoteAccess(): void { this.updateSettings({ pauseRemoteAccess: true }); }
  public resumeRemoteAccess(): void { this.updateSettings({ pauseRemoteAccess: false }); }

  public authorizeDevice(device: { id: string; fingerprint: string; name: string }): void {
    const list = this.settings.authorizedDevices.filter((entry) => entry.id !== device.id);
    const record: AuthorizedDeviceRecord = {
      id: device.id,
      fingerprint: device.fingerprint,
      name: device.name,
      authorizedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    this.updateSettings({ authorizedDevices: [...list, record] });
  }

  public revokeDevice(deviceId: string): void {
    this.updateSettings({ authorizedDevices: this.settings.authorizedDevices.filter((entry) => entry.id !== deviceId) });
  }

  public isDeviceAuthorized(deviceId: string): boolean {
    if (!this.settings.allowRemoteConnections || this.settings.pauseRemoteAccess) return false;
    return this.settings.authorizedDevices.length === 0 || this.settings.authorizedDevices.some((entry) => entry.id === deviceId);
  }
}

export const nativeAgent = new NativeAgentService();
