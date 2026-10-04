/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Shield,
  Activity,
  User,
  LogOut,
  LogIn,
  Sliders,
  Radio,
  Cpu,
  Minus,
  X,
  Power,
  Settings as SettingsIcon,
} from 'lucide-react';
import { ConnectionState, DeviceIdentity } from '../types/controller';
import { AuthenticatedUser } from '../services/authService';
import { AgentPresenceState, AgentSettings } from '../types/agent';

interface NavbarProps {
  currentRole: 'controller' | 'agent';
  onSwitchRole: (role: 'controller' | 'agent') => void;
  connectionState: ConnectionState;
  agentPresenceState: AgentPresenceState;
  myIdentity: DeviceIdentity | null;
  authUser: AuthenticatedUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  onOpenSettings: () => void;
  onOpenStatus: () => void;
  onCloseWindow: () => void;
  onExitApp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSwitchRole,
  connectionState,
  agentPresenceState,
  myIdentity,
  authUser,
  onOpenAuth,
  onSignOut,
  isDemoMode,
  onToggleDemoMode,
  onOpenSettings,
  onOpenStatus,
  onCloseWindow,
  onExitApp,
}) => {
  const getStatusColor = (state: ConnectionState) => {
    switch (state) {
      case 'Connected':
        return 'bg-emerald-500 text-emerald-400 border-emerald-500/30';
      case 'Connecting':
      case 'Waiting for approval':
      case 'Reconnecting':
        return 'bg-amber-500 text-amber-400 border-amber-500/30 animate-pulse';
      case 'Offline':
      case 'Disconnected':
      default:
        return 'bg-neutral-600 text-neutral-400 border-neutral-700';
    }
  };

  const getAgentColor = (state: AgentPresenceState) => {
    switch (state) {
      case 'ONLINE':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/50';
      case 'REMOTE_ACCESS_PAUSED':
        return 'text-amber-400 border-amber-500/40 bg-amber-950/50';
      case 'RECONNECTING':
      case 'STARTING':
      case 'AUTHENTICATING':
      case 'REGISTERING':
        return 'text-amber-300 border-amber-500/40 bg-amber-950/50 animate-pulse';
      case 'STOPPING':
      case 'OFFLINE':
      default:
        return 'text-neutral-400 border-neutral-800 bg-neutral-900';
    }
  };

  return (
    <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-4 lg:px-8 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 sm:gap-3 min-w-0">
        {/* Logo and title */}
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white shadow-md shadow-cyan-900/30">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[11px] sm:text-sm tracking-wider text-neutral-100 font-mono truncate">
                THE CONTROLLER
              </span>
               
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium border bg-neutral-900 text-cyan-400 border-cyan-800/40 uppercase tracking-wider">
                {isDemoMode ? 'SANDBOX' : 'REAL ENGINE'}
              </span>
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-medium border bg-amber-950/40 text-amber-300 border-amber-800/40">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>the-controller-982de</span>
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
              <span>Device ID:</span>
              <span className="text-neutral-300">
                {myIdentity ? myIdentity.fingerprint : 'Device ID unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Agent Real Presence & Role selector */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Real Agent Presence Badge (Click to open Status) */}
          <button
            onClick={onOpenStatus}
            className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${getAgentColor(
              agentPresenceState
            )}`}
            title="Click for Real Device Status and Network Telemetry"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                agentPresenceState === 'ONLINE'
                  ? 'bg-emerald-400'
                  : agentPresenceState === 'REMOTE_ACCESS_PAUSED'
                  ? 'bg-amber-400'
                  : agentPresenceState === 'RECONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-neutral-500'
              }`}
            />
            <span>AGENT: {agentPresenceState}</span>
          </button>

          {/* Role selector */}
          <div className="hidden sm:flex bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => onSwitchRole('controller')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                currentRole === 'controller'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Controller View
            </button>
            <button
              onClick={() => onSwitchRole('agent')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                currentRole === 'agent'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Agent Node
            </button>
          </div>
        </div>

        {/* Right: Settings, Auth, Window Close controls */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            title="Settings (Background Agent & Remote Access)"
          >
            <SettingsIcon className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Demo Mode Toggle */}
          <button
            onClick={onToggleDemoMode}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
              isDemoMode
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-200'
            }`}
            title="Separate Demo Mode for UI layout evaluation"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isDemoMode ? 'Exit Demo' : 'Demo Mode'}</span>
          </button>

          {/* Operator Auth */}
          {authUser ? (
            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-neutral-300">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono font-medium max-w-[120px] truncate">{authUser.name}</span>
              <button
                onClick={onSignOut}
                className="text-neutral-500 hover:text-neutral-300 transition-colors ml-1 cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-amber-700/40 text-xs font-medium transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400" />
              <span>Sign-in is required</span>
            </button>
          )}

          {/* Closing hides the desktop window; Exit explicitly stops the native agent. */}
          <div className="flex items-center border-l border-neutral-800 pl-2 ml-1">
            <button
              onClick={onCloseWindow}
              className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              title={window.controllerAndroid ? 'Hide the app UI; keep the foreground agent running' : window.controllerDesktop ? 'Hide window; keep the background agent running' : 'Hide app content in this browser tab only'}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCloseWindow}
              className="p-1.5 rounded-md hover:bg-rose-950/80 hover:text-rose-300 text-neutral-400 transition-colors cursor-pointer"
              title={window.controllerAndroid ? 'Close the app UI; the foreground agent continues' : window.controllerDesktop ? 'Close window to tray; background agent keeps running' : 'Hide app content in this browser tab only'}
            >
              <X className="w-4 h-4" />
            </button>
            {window.controllerDesktop && (
              <button
                onClick={onExitApp}
                className="p-1.5 rounded-md hover:bg-rose-950/80 hover:text-rose-300 text-neutral-400 transition-colors cursor-pointer"
                title="Exit THE CONTROLLER and stop the background agent"
              >
                <Power className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
