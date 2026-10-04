/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, Terminal, Cpu, ShieldAlert, ArrowRight } from 'lucide-react';
import { DeviceIdentity } from '../types/controller';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  myIdentity: DeviceIdentity | null;
  onSwitchToAgentMode: () => void;
  onConnectByDeviceId: (deviceId: string) => void;
}
export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  myIdentity,
  onSwitchToAgentMode,
  onConnectByDeviceId,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'deviceId' | 'browser' | 'network' | 'daemon'>('deviceId');
  const [deviceId, setDeviceId] = useState('');

  if (!isOpen) return null;

  const agentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?role=agent`
    : '';

  const handleCopyLink = () => {
    if (navigator.clipboard && agentUrl) {
      navigator.clipboard.writeText(agentUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };
const handleConnectByDeviceId = () => {
  console.log('[MODAL] Connect button clicked');
  console.log('[MODAL] Device ID:', deviceId);

  const normalizedId = deviceId.trim();

  if (!normalizedId) return;

  onConnectByDeviceId(normalizedId);
};

const handleOpenAgentTab = () => {
    if (typeof window === 'undefined') return;

    if (window.AndroidHost) {
      onSwitchToAgentMode();
      onClose();
      return;
    }

    window.open(agentUrl, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-neutral-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">+ Add Real Device</h2>
            <p className="text-xs text-neutral-400">Connect a verified device agent running THE CONTROLLER</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-neutral-800 mb-5 gap-2">
          <button
          onClick={() => setActiveTab('deviceId')}
          className={`pb-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'deviceId'
             ? 'border-cyan-500 text-cyan-400'
            : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Connect by Device ID
        </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'browser'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Launch Browser Agent
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'network'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Agent Pairing Link
          </button>
          <button
            onClick={() => setActiveTab('daemon')}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'daemon'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            CLI / Headless Daemon
          </button>
        </div>
        {activeTab === 'deviceId' && (
  <div className="space-y-4">
    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-neutral-100">
          Connect to a Device
        </h4>
        <p className="text-xs text-neutral-400 leading-relaxed mt-1">
          Enter the exact Device ID shown on the remote device.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="device-id"
          className="text-xs font-medium text-neutral-300"
        >
          Device ID
        </label>

        <input
          id="device-id"
          type="text"
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleConnectByDeviceId();
            }
          }}
          placeholder="Enter device ID"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-neutral-100 font-mono outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      <button
        onClick={handleConnectByDeviceId}
        disabled={!deviceId.trim()}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium text-xs transition-all cursor-pointer disabled:cursor-not-allowed"
      >
        <span>Connect to Device</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400">
      <span className="font-semibold text-neutral-300">
        Your Device ID:{' '}
      </span>
      <span className="font-mono text-cyan-400 break-all">
        {myIdentity?.id || 'Device ID unavailable'}
      </span>
    </div>
  </div>
)}
        {activeTab === 'browser' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-3">
              <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                <span>Option 1: Open Agent in a Second Tab or Window</span>
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Opens THE CONTROLLER in Agent role in a second window. It will generate its real device identity, gather true system diagnostics, and announce itself over the local real-time mesh channel.
              </p>
              <button
                onClick={handleOpenAgentTab}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md shadow-cyan-950/40 transition-all cursor-pointer"
              >
                <span>Launch Agent in New Tab / Window</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-3">
              <h4 className="text-xs font-semibold text-neutral-200">
                Option 2: Switch This Tab to Agent Node
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Turn this current tab into the remote agent to be controlled from another browser or workstation.
              </p>
              <button
                onClick={() => {
                  onSwitchToAgentMode();
                  onClose();
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs border border-neutral-700 transition-all cursor-pointer"
              >
                <span>Switch This Tab to Agent Role</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-400">
              Open this link on any mobile phone, laptop, or desktop on your network to enroll it as a live remote agent:
            </p>
            <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg p-2.5">
              <input
                type="text"
                readOnly
                value={agentUrl}
                className="bg-transparent text-xs text-neutral-300 font-mono flex-1 outline-none select-all"
              />
              <button
                onClick={handleCopyLink}
                className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer shrink-0"
                title="Copy Agent URL"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400">
              <span className="font-semibold text-neutral-300">Your Controller Identity: </span>
              <span className="font-mono text-cyan-400">
                {myIdentity ? myIdentity.fingerprint : 'Device ID unavailable'}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'daemon' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Headless Daemon Architecture</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              For remote Linux / macOS servers, install the agent daemon service to stream real hardware telemetry:
            </p>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 space-y-1">
              <div className="text-neutral-500"># Install & enroll daemon agent</div>
              <div>curl -sSL https://controller.internal/install.sh | bash</div>
              <div className="text-neutral-500"># Start service with cryptographic enrollment token</div>
              <div>controller-agent --enroll={myIdentity?.id || 'TOKEN'}</div>
            </div>
            <p className="text-[11px] text-neutral-400 italic">
              Note: Devices will not appear until the agent daemon executes and completes mutual TLS / WebRTC handshake.
            </p>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span>Strict Zero-Fake Policy: Devices only appear when genuinely connected.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
