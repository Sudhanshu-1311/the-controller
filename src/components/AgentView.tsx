/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Monitor,
  Share2,
  HardDrive,
  Cpu,
  Check,
  X,
  ShieldCheck,
  Upload,
  Radio,
  Disc,
  Layers,
  Battery,
  Wifi,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import {
  ConnectionState,
  DeviceIdentity,
  RealFileItem,
  SystemDiagnostics,
} from '../types/controller';
import { peerMesh } from '../services/peerMesh';

interface AgentViewProps {
  myIdentity: DeviceIdentity | null;
  systemDiagnostics: SystemDiagnostics | null;
  connectionState: ConnectionState;
  onApproveConnection: (controllerId: string, shareScreen: boolean, allowRemoteInput: boolean) => void | Promise<void>;
  onRejectConnection: (controllerId: string) => void;
  incomingRequest: { senderId: string; senderName: string } | null;
  incomingFileOffers: RealFileItem[];
  onAcceptFileOffer: (id: string) => void;
  onRejectFileOffer: (id: string) => void;
  onReturnToController: () => void;
}

export const AgentView: React.FC<AgentViewProps> = ({
  myIdentity,
  systemDiagnostics,
  connectionState,
  onApproveConnection,
  onRejectConnection,
  incomingRequest,
  incomingFileOffers,
  onAcceptFileOffer,
  onRejectFileOffer,
  onReturnToController,
}) => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<RealFileItem[]>([]);
  const [autoApproveScreen, setAutoApproveScreen] = useState(true);
  const [allowRemoteInput, setAllowRemoteInput] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [displays, setDisplays] = useState<Array<{ id: string; label: string; width: number; height: number; primary: boolean }>>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState('');
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [clipboardAllowed, setClipboardAllowed] = useState(false);
  const [incomingClipboardText, setIncomingClipboardText] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    peerMesh.setOnClipboardText(setIncomingClipboardText);
    return () => { peerMesh.setOnClipboardText(() => {}); void window.controllerDesktop?.authorizeClipboard?.(false); };
  }, []);

  useEffect(() => {
    void window.controllerDesktop?.getDisplays?.().then((items) => {
      setDisplays(items);
      const primary = items.find((item) => item.primary)?.id || items[0]?.id || '';
      setSelectedDisplayId(primary);
      void window.controllerDesktop?.prepareDisplayCapture?.(primary, false);
    }).catch(() => setDisplays([]));
    const unsubscribe = window.controllerDesktop?.onSystemEvent?.((event) => {
      if (event.type === 'display-changed') void window.controllerDesktop?.getDisplays?.().then(setDisplays).catch(() => {});
    });
    return () => unsubscribe?.();
  }, []);

  // Broadcast presence on mount & when diagnostics are ready
  useEffect(() => {
    if (myIdentity && systemDiagnostics) {
      peerMesh.broadcastMessage({
        id: crypto.randomUUID(),
        type: 'DEVICE_ANNOUNCE',
        senderId: myIdentity.id,
        senderName: `Agent (${systemDiagnostics.platform.split(' ')[0]})`,
        timestamp: Date.now(),
        payload: {
          identity: myIdentity,
          systemInfo: systemDiagnostics,
          sharedFiles,
          fileAccessGranted: sharedFiles.length > 0,
          screenSharingActive: isScreenSharing,
        },
      });
    }
  }, [myIdentity, systemDiagnostics, sharedFiles, isScreenSharing]);

  const handleStartScreenShare = async () => {
    setCaptureError(null);
    let stream: MediaStream | null;
    try { stream = await peerMesh.startScreenSharing(selectedDisplayId || undefined, includeSystemAudio); }
    catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Screen capture could not be started.');
      return;
    }
    if (stream) {
      setIsScreenSharing(true);
      const audioTracks = stream.getAudioTracks();
      setSystemAudioActive(audioTracks.some((track) => track.readyState === 'live'));
      audioTracks.forEach((track) => track.addEventListener('ended', () => setSystemAudioActive(false), { once: true }));
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }
    }
  };

  const handleApprove = async () => {
    setCaptureError(null);
    try { await onApproveConnection(incomingRequest!.senderId, autoApproveScreen, allowRemoteInput); }
    catch (error) { setCaptureError(error instanceof Error ? error.message : 'The connection could not be approved.'); }
  };

  const handleStopScreenShare = () => {
    peerMesh.stopScreenSharing();
    setIsScreenSharing(false);
    setSystemAudioActive(false);
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  };

  const handleFileSelect = async () => {
    try { setSharedFiles(await peerMesh.selectAndOfferFiles()); }
    catch (error) { setCaptureError(error instanceof Error ? error.message : 'Native file selection is unavailable.'); }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-neutral-100 font-mono">AGENT NODE RUNNING</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-700/50">
                DISCOVERABLE ON MESH
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              Device Fingerprint: <span className="text-cyan-300 font-semibold">{myIdentity ? myIdentity.fingerprint : 'Device ID unavailable'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-neutral-200">Mesh State</div>
            <div className="text-[11px] font-mono text-cyan-400">{connectionState}</div>
          </div>
          <button
            onClick={onReturnToController}
            className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors cursor-pointer"
          >
            Switch to Controller
          </button>
        </div>
      </div>

      {/* Incoming Connection Approval Modal / Prompt */}
      {incomingRequest && (
        <div className="p-6 rounded-2xl bg-amber-950/40 border-2 border-amber-600/60 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-200">
                Incoming Connection Request
              </h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                The controller operator <strong className="text-amber-300 font-mono">{incomingRequest.senderName}</strong> is requesting to establish a remote session with this device.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoShareScreen"
                  checked={autoApproveScreen}
                  onChange={(e) => setAutoApproveScreen(e.target.checked)}
                  className="rounded bg-neutral-900 border-neutral-700 text-cyan-500"
                />
                <label htmlFor="autoShareScreen" className="text-xs text-neutral-300 cursor-pointer">
                  Prompt for screen sharing permission immediately upon approving
                </label>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    <input type="checkbox" checked={allowRemoteInput} disabled={!window.controllerDesktop?.authorizeRemoteInput} onChange={(event) => setAllowRemoteInput(event.target.checked)} />
                    {window.controllerDesktop?.authorizeRemoteInput ? 'Allow this controller to use mouse and keyboard on this Windows device' : 'Windows native mouse and keyboard control is NOT IMPLEMENTED on this platform'}
                  </label>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve Connection</span>
                </button>

                <button
                  onClick={() => onRejectConnection(incomingRequest.senderId)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-rose-300 border border-neutral-700 font-medium text-xs transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
              {captureError && <p role="alert" className="mt-3 text-xs text-rose-300">{captureError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Screen Sharing Card */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">Live Screen Sharing</h3>
              <p className="text-xs text-neutral-400">Streams a connected display through the active WebRTC session</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isScreenSharing && displays.length > 1 && <select aria-label="Capture display" value={selectedDisplayId} onChange={(event) => { setSelectedDisplayId(event.target.value); void window.controllerDesktop?.prepareDisplayCapture?.(event.target.value, includeSystemAudio); }} className="px-2 py-2 rounded-lg bg-neutral-800 text-neutral-200 text-xs border border-neutral-700">
              {displays.map((display) => <option key={display.id} value={display.id}>{display.label} · {display.width}×{display.height}{display.primary ? ' · Primary' : ''}</option>)}
            </select>}
            {!isScreenSharing && window.controllerDesktop && <label className="inline-flex items-center gap-1 text-[11px] text-neutral-300"><input type="checkbox" checked={includeSystemAudio} onChange={(event) => { setIncludeSystemAudio(event.target.checked); void window.controllerDesktop?.prepareDisplayCapture?.(selectedDisplayId, event.target.checked); }} />System audio</label>}
            {isScreenSharing ? (
              <button
                onClick={handleStopScreenShare}
                className="px-3.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium cursor-pointer"
              >
                Stop Sharing
              </button>
            ) : (
              <button
                onClick={handleStartScreenShare}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-md shadow-cyan-950/40 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Start Screen Stream</span>
              </button>
            )}
          </div>
        </div>

        {/* Video preview if sharing */}
        {isScreenSharing ? (
          <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 aspect-video relative max-w-lg mx-auto">
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 bg-neutral-950/80 border border-neutral-800 text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded-md flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>ACTIVE WEBRTC STREAM</span>
              {systemAudioActive && <span className="ml-2 text-cyan-300">· system audio active</span>}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-neutral-800/80 bg-neutral-950/40 text-center text-xs text-neutral-400">
            Screen sharing is inactive. Choose a display and start a real capture session.
          </div>
        )}
      </div>

      {/* Real Local File Exposure */}
      {incomingFileOffers.length > 0 && <section className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/20 space-y-2">
        <h3 className="text-xs font-semibold text-amber-200">Incoming file transfers</h3>
        {incomingFileOffers.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 text-xs text-neutral-200">
          <span>{file.name} · {file.size.toLocaleString()} bytes</span>
          <span><button className="text-cyan-300" onClick={() => onAcceptFileOffer(file.id)}>Choose save location</button><button className="ml-3 text-neutral-400" onClick={() => onRejectFileOffer(file.id)}>Reject</button></span>
        </div>)}
      </section>}

      {/* Real Local File Exposure */}
      {window.controllerDesktop?.authorizeClipboard && <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={clipboardAllowed} onChange={async (event) => {
          const allowed = await window.controllerDesktop?.authorizeClipboard?.(event.target.checked).catch(() => false);
          setClipboardAllowed(Boolean(allowed));
        }} />Allow explicit text clipboard sharing for this session</label>
        {incomingClipboardText !== null && <span className="text-xs text-amber-200">Remote peer sent text ({incomingClipboardText.length} characters)
          <button className="ml-3 text-cyan-300" onClick={() => void peerMesh.acceptClipboardText(incomingClipboardText).then(() => setIncomingClipboardText(null)).catch((error) => setCaptureError(String(error)))}>Write to clipboard</button>
          <button className="ml-2 text-neutral-400" onClick={() => setIncomingClipboardText(null)}>Reject</button>
        </span>}
      </div>}

      {/* Real Local File Exposure */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">Exposed Local Files</h3>
              <p className="text-xs text-neutral-400">Select real files from this device to make accessible over P2P</p>
            </div>
          </div>

          <div>
            <button
              onClick={() => void handleFileSelect()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Select Real Files</span>
            </button>
          </div>
        </div>

        {sharedFiles.length === 0 ? (
          <div className="p-6 rounded-xl border border-neutral-800/80 bg-neutral-950/40 text-center text-xs text-neutral-400">
            No local files shared yet. Zero fake files exist in the system.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl bg-neutral-950 overflow-hidden">
            {sharedFiles.map((file) => (
              <div key={file.id} className="p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="font-medium text-neutral-200">{file.name}</span>
                    <span className="text-[11px] font-mono text-neutral-400 ml-2">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">Shared to Peer</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Genuine System Diagnostics for This Agent */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Genuine Device Platform Diagnostics</h3>
            <p className="text-xs text-neutral-400">Obtained exclusively from this machine&apos;s navigator and hardware APIs</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Platform</div>
            <div className="font-semibold text-neutral-200 mt-1 truncate">{systemDiagnostics?.platform || 'Unavailable'}</div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Logical CPU Cores</div>
            <div className="font-semibold text-neutral-200 mt-1">{systemDiagnostics?.cores ? `${systemDiagnostics.cores} Cores` : 'Restricted'}</div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Device Memory (RAM)</div>
            <div className="font-semibold text-neutral-200 mt-1">{systemDiagnostics?.memoryGb ? `~${systemDiagnostics.memoryGb} GB` : 'Restricted'}</div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Screen Resolution</div>
            <div className="font-semibold text-neutral-200 mt-1 truncate">{systemDiagnostics?.screenResolution || 'Unavailable'}</div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Battery</div>
            <div className="font-semibold text-neutral-200 mt-1">
              {typeof systemDiagnostics?.batteryLevel === 'number'
                ? `${Math.round(systemDiagnostics.batteryLevel * 100)}% ${systemDiagnostics.isCharging ? '(Charging)' : ''}`
                : 'Desktop / Restricted'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="text-[10px] text-neutral-400 uppercase">Timezone</div>
            <div className="font-semibold text-neutral-200 mt-1 truncate">{systemDiagnostics?.timezone || 'Unavailable'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
