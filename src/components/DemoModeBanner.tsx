/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';

interface DemoModeBannerProps {
  onExitDemoMode: () => void;
}

export const DemoModeBanner: React.FC<DemoModeBannerProps> = ({ onExitDemoMode }) => {
  return (
    <aside
      aria-label="Demo Mode Notice"
      className="bg-amber-950/80 border-b border-amber-600/40 text-amber-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg relative z-40 backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
          <AlertTriangle className="w-4 h-4 animate-pulse" />
        </div>
        <div className="text-xs sm:text-sm">
          <span className="font-bold tracking-wider uppercase text-amber-300 mr-2 flex-inline items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
            DEMO MODE ACTIVE
          </span>
          <span className="text-amber-200/90 hidden md:inline">
            — Simulated Sandbox for UI inspection only. All devices, files, and metrics here are synthetic and completely isolated from the real controller engine.
          </span>
        </div>
      </div>

      <button
        onClick={onExitDemoMode}
        className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
      >
        <span>Exit Demo Mode & Return to Real Data</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </aside>
  );
};
