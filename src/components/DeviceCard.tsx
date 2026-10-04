/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Monitor,
  Cpu,
  Layers,
  Battery,
  Wifi,
  HardDrive,
  Radio,
  ChevronRight,
  ShieldCheck,
  Disc,
} from 'lucide-react';
import { ConnectionState, RegisteredDevice } from '../types/controller';

interface DeviceCardProps {
  device: RegisteredDevice;
  currentConnectionState: ConnectionState;
  onConnect: (device: RegisteredDevice) => void;
  onDisconnect: () => void;
  isSelected: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  currentConnectionState,
  onConnect,
  onDisconnect,
  isSelected,
}) => {
  const isThisDeviceConnected = isSelected && currentConnectionState === 'Connected';
  const isThisDeviceConnecting = isSelected && (currentConnectionState === 'Connecting' || currentConnectionState === 'Waiting for approval');
  const canConnect = (device.presenceState === 'ONLINE' || (!device.presenceState && device.status === 'Connected'))
    && device.allowRemoteConnections !== false
    && !device.remoteAccessPaused;

  const getStatusBadge = () => {
    if (!isSelected && device.presenceState === 'REMOTE_ACCESS_PAUSED') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/70 border border-amber-600/40 text-amber-400">Remote Access Paused</span>;
    }
    if (!isSelected && device.presenceState === 'ONLINE') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/70 border border-emerald-600/40 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Online</span>;
    }
    const status: ConnectionState = isSelected
      ? currentConnectionState
      : device.presenceState === 'RECONNECTING'
          ? 'Reconnecting'
          : device.status;
    switch (status) {
      case 'Connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/70 border border-emerald-600/40 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Connected
          </span>
        );
      case 'Connecting':
      case 'Waiting for approval':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/70 border border-amber-600/40 text-amber-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {status}
          </span>
        );
      case 'Reconnecting':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/70 border border-amber-600/40 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Reconnecting
          </span>
        );
      case 'Disconnected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-neutral-900 border border-neutral-700 text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
            Disconnected
          </span>
        );
      case 'Offline':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-neutral-900 border border-neutral-800 text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
            Offline
          </span>
        );
    }
  };

  const sys = device.systemInfo;

  return (
    <div
      className={`rounded-xl border transition-all p-5 ${
        isSelected
          ? 'bg-neutral-900/90 border-cyan-500/60 shadow-lg shadow-cyan-950/30'
          : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-800/80 border border-neutral-700/60 flex items-center justify-center text-cyan-400 shrink-0">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              <span>{device.name}</span>
            </h4>
            <div className="text-[11px] text-neutral-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
              <span title="Cryptographic Device Fingerprint" className="text-neutral-400">
                {device.identity.fingerprint || 'Device ID unavailable'}
              </span>
              <span>•</span>
              <span className="text-neutral-400">
                ID: {device.identity.id ? device.identity.id.slice(0, 18) + '...' : 'Device ID unavailable'}
              </span>
            </div>
          </div>
        </div>

        {getStatusBadge()}
      </div>

      {/* Real Hardware & System Information (Rendered ONLY if legitimately present) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4 text-[11px] font-mono bg-neutral-950/60 border border-neutral-800/60 rounded-lg p-3">
        {sys?.platform ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <Layers className="w-3 h-3 text-neutral-400" />
              <span>Platform</span>
            </div>
            <div className="text-neutral-200 truncate mt-0.5" title={sys.platform}>
              {sys.platform}
            </div>
          </div>
        ) : null}

        {typeof sys?.cores === 'number' ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <Cpu className="w-3 h-3 text-neutral-400" />
              <span>Logical Cores</span>
            </div>
            <div className="text-neutral-200 mt-0.5">
              {sys.cores} Cores
            </div>
          </div>
        ) : null}

        {typeof sys?.memoryGb === 'number' ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <HardDrive className="w-3 h-3 text-neutral-400" />
              <span>RAM Reported</span>
            </div>
            <div className="text-neutral-200 mt-0.5">
              ~{sys.memoryGb} GB
            </div>
          </div>
        ) : null}

        {sys?.screenResolution ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <Monitor className="w-3 h-3 text-neutral-400" />
              <span>Resolution</span>
            </div>
            <div className="text-neutral-200 mt-0.5 truncate" title={sys.screenResolution}>
              {sys.screenResolution}
            </div>
          </div>
        ) : null}

        {typeof sys?.batteryLevel === 'number' ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <Battery className="w-3 h-3 text-neutral-400" />
              <span>Battery</span>
            </div>
            <div className="text-neutral-200 mt-0.5">
              {Math.round(sys.batteryLevel * 100)}% {sys.isCharging ? '(Charging)' : ''}
            </div>
          </div>
        ) : null}

        {sys?.networkType ? (
          <div>
            <div className="text-neutral-400 text-[10px] flex items-center gap-1 uppercase tracking-wider">
              <Wifi className="w-3 h-3 text-neutral-400" />
              <span>Network</span>
            </div>
            <div className="text-neutral-200 mt-0.5">
              {sys.networkType} {typeof sys.downlinkMbps === 'number' ? `(${sys.downlinkMbps} Mbps)` : ''}
            </div>
          </div>
        ) : null}
      </div>

      {/* Action footer */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="text-neutral-400 text-[11px] font-mono">
          Last seen: {new Date(device.lastSeen).toLocaleTimeString()}
        </div>

        <div>
          {isThisDeviceConnected ? (
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-medium transition-colors cursor-pointer"
            >
              Disconnect Session
            </button>
          ) : isThisDeviceConnecting ? (
            <button
              disabled
              className="px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-700/50 text-amber-300 font-medium opacity-80 cursor-wait flex items-center gap-1.5"
            >
              <Disc className="w-3.5 h-3.5 animate-spin" />
              <span>Connecting...</span>
            </button>
          ) : (
            canConnect ? (
              <button
                onClick={() => onConnect(device)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-all shadow-sm shadow-cyan-950/40 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Connect</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button disabled className="px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-500 text-xs cursor-not-allowed">
                {device.remoteAccessPaused || !device.allowRemoteConnections ? 'Remote Access Paused' : 'Offline'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
