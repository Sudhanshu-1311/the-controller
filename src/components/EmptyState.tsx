/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MonitorX, Plus, Radio, HardDrive, Gauge, ShieldX } from 'lucide-react';

interface EmptyDevicesProps {
  onAddDevice: () => void;
  onConnectDevice: () => void;
}

export const EmptyDevices: React.FC<EmptyDevicesProps> = ({ onAddDevice, onConnectDevice }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 max-w-xl mx-auto my-8">
      <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 mb-5 shadow-inner">
        <MonitorX className="w-7 h-7 text-neutral-400" />
      </div>
      <h3 className="text-lg font-semibold text-neutral-200 tracking-tight mb-2">
        No devices connected yet.
      </h3>
      <p className="text-sm text-neutral-400 mb-6 max-w-md leading-relaxed">
        Real device nodes appear here once an agent registers with a genuine cryptographic identity and authenticates with the controller.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onAddDevice}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-all shadow-md shadow-cyan-950/40 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Device</span>
        </button>

        <button
          onClick={onConnectDevice}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium text-sm transition-all cursor-pointer"
        >
          <Radio className="w-4 h-4 text-cyan-400" />
          <span>Connect to Device</span>
        </button>
      </div>
    </div>
  );
};

interface EmptyFilesProps {
  isConnected: boolean;
  hasFileAccess: boolean;
  onRequestAccess?: () => void;
}

export const EmptyFiles: React.FC<EmptyFilesProps> = ({ isConnected, hasFileAccess, onRequestAccess }) => {
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-neutral-800/80 bg-neutral-900/20 text-neutral-400 py-12">
        <HardDrive className="w-8 h-8 text-neutral-400 mb-3 opacity-60" />
        <p className="text-sm font-medium text-neutral-300">No remote device connected.</p>
        <p className="text-xs text-neutral-400 mt-1">Connect to a live agent device to access the remote filesystem.</p>
      </div>
    );
  }

  if (!hasFileAccess) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-amber-900/30 bg-amber-950/10 text-neutral-400 py-12">
        <ShieldX className="w-8 h-8 text-amber-500/70 mb-3" />
        <p className="text-sm font-medium text-amber-200/90">File access is unavailable.</p>
        <p className="text-xs text-neutral-400 mt-1 max-w-sm mb-4">
          The remote agent has not granted access to local files or storage has not been exposed.
        </p>
        {onRequestAccess && (
          <button
            onClick={onRequestAccess}
            className="px-3.5 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 cursor-pointer"
          >
            Expose Files from Agent
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-neutral-800/80 bg-neutral-900/20 text-neutral-400 py-12">
      <HardDrive className="w-8 h-8 text-neutral-400 mb-3 opacity-60" />
      <p className="text-sm font-medium text-neutral-300">No files are available.</p>
      <p className="text-xs text-neutral-400 mt-1">The remote storage directory is currently empty.</p>
    </div>
  );
};

export const EmptyPerformance: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center rounded-lg border border-neutral-800/60 bg-neutral-900/30 text-neutral-400">
      <Gauge className="w-6 h-6 text-neutral-400 mb-2 opacity-60" />
      <p className="text-xs font-medium text-neutral-300">
        Performance data will appear when a real remote session is active.
      </p>
      <p className="text-[11px] text-neutral-400 mt-0.5">
        WebRTC inbound and outbound statistics are extracted continuously during an active session.
      </p>
    </div>
  );
};

export const EmptySessionPrompt: React.FC<{ onConnect: () => void }> = ({ onConnect }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-neutral-800 bg-neutral-900/30 my-6">
      <Radio className="w-10 h-10 text-cyan-500/70 mb-4 animate-pulse" />
      <h3 className="text-base font-semibold text-neutral-200 mb-1">
        Connect to a device to begin.
      </h3>
      <p className="text-xs text-neutral-400 max-w-sm mb-5">
        Select an online agent node from your verified device catalog to establish a real P2P screen & telemetry session.
      </p>
      <button
        onClick={onConnect}
        className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm cursor-pointer"
      >
        Connect
      </button>
    </div>
  );
};
