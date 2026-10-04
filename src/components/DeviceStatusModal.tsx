/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Activity,
  Radio,
  Wifi,
  Cpu,
  Clock,
  Shield,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Power,
} from 'lucide-react';
import { AgentPresenceState, AgentSettings } from '../types/agent';
import { DeviceIdentity, SystemDiagnostics } from '../types/controller';

interface DeviceStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentState: AgentPresenceState;
  settings: AgentSettings;
  identity: DeviceIdentity | null;
  diagnostics: SystemDiagnostics | null;
  onReconnectNow: () => void;
  onTogglePause: () => void;
}

export const DeviceStatusModal: React.FC<DeviceStatusModalProps> = ({
  isOpen,
  onClose,
  agentState,
  settings,
  identity,
  diagnostics,
  onReconnectNow,
  onTogglePause,
}) => {
  if (!isOpen) return null;

  const isNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const getStatusColor = () => {
    switch (agentState) {
      case 'ONLINE':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-600/40';
      case 'REMOTE_ACCESS_PAUSED':
        return 'text-amber-400 bg-amber-950/60 border-amber-600/40';
      case 'RECONNECTING':
      case 'STARTING':
      case 'AUTHENTICATING':
      case 'REGISTERING':
        return 'text-amber-300 bg-amber-950/60 border-amber-600/40 animate-pulse';
      case 'STOPPING':
      case 'OFFLINE':
      default:
        return 'text-neutral-400 bg-neutral-900 border-neutral-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-neutral-200 my-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Device Status</h2>
            <p className="text-xs text-neutral-400">Backend presence is unavailable in this browser build.</p>
          </div>
        </div>

        {/* State Banner */}
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${getStatusColor()}`}>
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5" />
            <div>
              <div className="font-mono font-bold text-sm tracking-wider uppercase">
                {agentState}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                {agentState === 'ONLINE'
                  ? 'Reachable by authorized controller nodes'
                  : agentState === 'REMOTE_ACCESS_PAUSED'
                  ? 'Authenticated, but blocking new sessions'
                  : agentState === 'RECONNECTING'
                  ? 'Reconnecting to the authenticated signaling service'
                  : 'OFFLINE — native agent and authenticated signaling are not implemented'}
              </div>
            </div>
          </div>

          {agentState === 'RECONNECTING' || agentState === 'OFFLINE' ? (
            <button
              onClick={onReconnectNow}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          ) : null}
        </div>

        {/* Real Network and Device Details */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs space-y-2.5">
          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Browser network indication:</span>
            <span className={`font-semibold ${isNetworkOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isNetworkOnline ? 'Online (Connected)' : 'Disconnected'}
            </span>
          </div>

          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Device Fingerprint:</span>
            <span className="text-neutral-200">{identity?.fingerprint || 'Device ID unavailable'}</span>
          </div>

          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Background agent:</span>
            <span className="text-neutral-200">
              NOT IMPLEMENTED
            </span>
          </div>

          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Remote access setting (browser session only):</span>
            <span className={settings.pauseRemoteAccess ? 'text-amber-400' : 'text-emerald-400'}>
              {settings.pauseRemoteAccess ? 'PAUSED' : 'ALLOWED'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-neutral-400">System Platform:</span>
            <span className="text-neutral-200">{diagnostics?.platform || 'Unavailable'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onTogglePause}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              settings.pauseRemoteAccess
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                : 'bg-amber-950/80 border-amber-700 text-amber-300 hover:bg-amber-900'
            }`}
          >
            {settings.pauseRemoteAccess ? 'Resume Remote Access' : 'Pause Remote Access'}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
