/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Plus, Radio, RefreshCw } from 'lucide-react';
import { ConnectionState, RegisteredDevice } from '../types/controller';
import { DeviceCard } from './DeviceCard';
import { EmptyDevices } from './EmptyState';

interface DeviceListProps {
  devices: RegisteredDevice[];
  currentConnectionState: ConnectionState;
  selectedDevice: RegisteredDevice | null;
  onSelectDevice: (device: RegisteredDevice) => void;
  onConnectDevice: (device: RegisteredDevice) => void;
  onDisconnectDevice: () => void;
  onOpenAddDevice: () => void;
  onRefreshDiscovery: () => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  currentConnectionState,
  selectedDevice,
  onSelectDevice,
  onConnectDevice,
  onDisconnectDevice,
  onOpenAddDevice,
  onRefreshDiscovery,
}) => {
  if (devices.length === 0) {
    return (
      <EmptyDevices
        onAddDevice={onOpenAddDevice}
        onConnectDevice={onOpenAddDevice}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <span>Verified Remote Devices</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-neutral-900 border border-neutral-800 text-neutral-400">
              {devices.length}
            </span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real hardware nodes currently registered with mutual authentication
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshDiscovery}
            className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
            title="Scan for mesh broadcasts"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenAddDevice}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Device</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device) => (
          <div
            key={device.identity.id}
            onClick={() => onSelectDevice(device)}
            className="cursor-pointer"
          >
            <DeviceCard
              device={device}
              currentConnectionState={currentConnectionState}
              isSelected={selectedDevice?.identity.id === device.identity.id}
              onConnect={onConnectDevice}
              onDisconnect={onDisconnectDevice}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
