/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Sliders,
  Shield,
  Monitor,
  Radio,
  Power,
  Check,
  Trash2,
  Terminal,
  Smartphone,
  AlertTriangle,
  Info,
  Clock,
  Key,
} from 'lucide-react';
import { AgentPresenceState, AgentSettings, AuthorizedDeviceRecord, PlatformCapabilities } from '../types/agent';
import { nativeAgent } from '../services/nativeAgent';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AgentSettings;
  agentState: AgentPresenceState;
  onUpdateSettings: (updates: Partial<AgentSettings>) => void;
  onRevokeDevice: (deviceId: string) => void;
  currentUserId?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  agentState,
  onUpdateSettings,
  onRevokeDevice,
  currentUserId,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'remote' | 'security' | 'platform'>('general');
  const capabilities = nativeAgent.getPlatformCapabilities();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative text-neutral-200 my-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">THE CONTROLLER Settings</h2>
            <p className="text-xs text-neutral-400">
              {window.controllerAndroid ? 'Android foreground agent and authenticated device presence.' : window.controllerDesktop ? 'Windows background agent and authenticated device presence.' : 'Browser session controls. Persistent background availability is not implemented.'}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-800 mb-6 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('remote')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'remote'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Remote Access
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'security'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Security & Authorized Devices
          </button>
          <button
            onClick={() => setActiveTab('platform')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'platform'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Platform / Native Service
          </button>
        </div>

        {/* TAB 1: General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
              <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                Window Close Behavior
              </h4>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.keepRunningOnClose}
                  disabled={!window.controllerDesktop}
                  onChange={(e) => onUpdateSettings({ keepRunningOnClose: e.target.checked })}
                  className="rounded bg-neutral-900 border-neutral-700 text-cyan-500 mt-1 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-neutral-100 block">
                    Keep THE CONTROLLER running in the background when window is closed
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5 leading-relaxed">
                    {window.controllerAndroid ? 'The authenticated foreground service continues with a persistent notification after the app UI is closed.' : window.controllerDesktop ? 'Closing the desktop window hides it to the system tray. The separate background agent continues running.' : 'NOT IMPLEMENTED in the browser build. Closing the browser ends its execution.'}
                  </span>
                </div>
              </label>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
              <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                System Startup
              </h4>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.startWithWindows}
                  disabled={!window.controllerDesktop || Boolean(window.controllerAndroid)}
                  onChange={(e) => onUpdateSettings({ startWithWindows: e.target.checked })}
                  className="rounded bg-neutral-900 border-neutral-700 text-cyan-500 mt-1 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-neutral-100 block">
                    {window.controllerAndroid ? 'Start THE CONTROLLER with Android' : 'Start THE CONTROLLER with Windows'}
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5 leading-relaxed">
                    {window.controllerAndroid ? 'NOT IMPLEMENTED on Android. Open the app and sign in to start the foreground service.' : window.controllerDesktop ? 'Starts the background agent at Windows sign-in. The main window stays closed.' : 'NOT IMPLEMENTED in the browser build.'}
                  </span>
                </div>
              </label>

            </div>
          </div>
        )}

        {/* TAB 2: Remote Access Controls */}
        {activeTab === 'remote' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
              <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                Inbound Session Permissions
              </h4>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowRemoteConnections}
                  onChange={(e) => onUpdateSettings({ allowRemoteConnections: e.target.checked })}
                  className="rounded bg-neutral-900 border-neutral-700 text-cyan-500 mt-1 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-neutral-100 block">
                    Allow remote connections
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5 leading-relaxed">
                    {window.controllerAndroid ? 'The Android foreground service publishes authenticated presence and delivers request notifications. Screen capture and WebRTC session handling are NOT IMPLEMENTED on Android.' : window.controllerDesktop ? 'The Windows agent enforces this policy in authenticated backend presence. Session approval and WebRTC media still require the UI renderer to be running.' : 'Controls this browser session only. Persistent background presence is NOT IMPLEMENTED in browser mode.'}
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.pauseRemoteAccess}
                  onChange={(e) => onUpdateSettings({ pauseRemoteAccess: e.target.checked })}
                  className="rounded bg-neutral-900 border-neutral-700 text-amber-500 mt-1 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-amber-300 block">
                    Pause remote access
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5 leading-relaxed">
                    {window.controllerAndroid ? 'The foreground agent remains authenticated but blocks new session requests.' : window.controllerDesktop ? 'The Windows background agent remains authenticated and blocks new session requests.' : 'Pauses remote access in this browser session only; background availability is NOT IMPLEMENTED.'}
                  </span>
                </div>
              </label>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-400">Current Presence State:</span>
              <span className="px-2 py-0.5 rounded font-bold bg-neutral-900 border border-neutral-700 text-cyan-400">
                {agentState}
              </span>
            </div>
          </div>
        )}

        {/* TAB 3: Security & Authorized Devices */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                  Authorized Controller Devices
                </h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Authorized Firebase accounts can discover this device and request a session. Each session still requires approval.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <label className="text-xs font-semibold text-neutral-200" htmlFor="authorized-controller-uids">
                Authorized Firebase account UIDs
              </label>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Only these signed-in accounts may discover this device or send it a session request. Add one Firebase UID per line. Your account: <span className="font-mono text-cyan-300">{currentUserId || 'Sign in first'}</span>
              </p>
              <textarea
                id="authorized-controller-uids"
                value={(settings.authorizedControllerUids || []).join('\n')}
                onChange={(event) => onUpdateSettings({ authorizedControllerUids: [...new Set(event.target.value.split(/\r?\n/).map((uid) => uid.trim()).filter(Boolean))] })}
                disabled={(!window.controllerDesktop && !window.controllerAndroid) || !currentUserId}
                rows={3}
                className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2 text-xs font-mono text-neutral-200 disabled:opacity-50"
                placeholder="Firebase UID, one per line"
              />
            </div>

            {settings.authorizedDevices.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 text-center space-y-2">
                <Shield className="w-8 h-8 text-neutral-500 mx-auto opacity-70" />
                <p className="text-xs text-neutral-300 font-medium">No specific device whitelist active.</p>
                <p className="text-[11px] text-neutral-500 max-w-sm mx-auto leading-relaxed">
                  Incoming connections require manual prompt approval on each request until authorized.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl bg-neutral-950 overflow-hidden text-xs">
                {settings.authorizedDevices.map((device) => (
                  <div key={device.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-neutral-200">{device.name}</div>
                      <div className="text-[10px] font-mono text-neutral-400 flex items-center gap-2 mt-0.5">
                        <span>Fingerprint: {device.fingerprint}</span>
                        <span>•</span>
                        <span>Authorized: {new Date(device.authorizedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onRevokeDevice(device.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium cursor-pointer transition-colors"
                      title="Revoke device access"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke Device</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Platform Capability & Native Architecture */}
        {activeTab === 'platform' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <h4 className="font-semibold text-neutral-200 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>Windows Native Service Architecture</span>
              </h4>
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                    {window.controllerAndroid ? 'Android runs an authenticated foreground service with an ongoing notification. Android or manufacturer battery policies can restrict it. The service maintains presence and polls signaling, but Android screen capture, WebRTC media, and session recovery are NOT IMPLEMENTED.' : window.controllerDesktop ? 'The Windows desktop build runs authenticated presence and signal polling in a separate process. Closing the window hides Electron to the system tray; Exit stops that process. Active WebRTC sessions and media still run in the UI renderer and do not survive renderer closure. This is a per-user process, not a Windows Service.' : 'NOT IMPLEMENTED in this browser build. This repository does not contain a native desktop host or system tray.'}
              </p>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 space-y-1">
                <div>{window.controllerDesktop ? 'Install the Windows desktop build to enable tray and login startup.' : 'Windows desktop integration is unavailable in this browser build.'}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">STUN / TURN connectivity</h4>
              <p className="text-[11px] text-neutral-400 leading-relaxed">ICE servers are fetched from the authenticated backend at session setup. This build has no deployed TURN server configuration, so relay connectivity is NOT IMPLEMENTED. Direct candidates may still connect, but restrictive NAT traversal is not guaranteed. Set STUN_URLS and TURN_URLS in Functions configuration and TURN_SHARED_SECRET in Secret Manager, then deploy and test a relay path.</p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <h4 className="font-semibold text-neutral-200 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Android Foreground Service Guidelines</span>
              </h4>
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                {window.controllerAndroid ? 'This APK has an authenticated Android foreground agent. Android or manufacturer battery policies may still stop background work. Persistent screen capture, remote control, and Android session recovery are NOT IMPLEMENTED.' : 'Android strictly limits background activity. Android foreground service integration is NOT IMPLEMENTED in the browser build.'}
              </p>
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-200/90 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Technical honesty policy: Standard mobile web browsers suspend background tabs when closed. Permanent Android availability requires the native APK container with Foreground Service permissions.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs">
          <div className="text-neutral-400 text-[11px] font-mono">
            Platform: {capabilities.isWindows ? 'Windows x64' : capabilities.isAndroid ? 'Android' : 'Desktop / Node'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
