/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceIdentity, SystemDiagnostics } from '../types/controller';

const STORAGE_KEY_IDENTITY = 'the_controller_device_identity_v1';

/**
 * Generates or retrieves genuine device identity from WebCrypto API.
 * Never hardcodes or fakes IDs.
 */
export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const desktopIdentity = await window.controllerDesktop?.getIdentity();
  if (desktopIdentity) return desktopIdentity;
  try {
    const existing = localStorage.getItem(STORAGE_KEY_IDENTITY);
    if (existing) {
      const parsed = JSON.parse(existing) as DeviceIdentity;
      if (parsed.id && parsed.fingerprint) {
        return parsed;
      }
    }

    // Generate real cryptographic UUID
    const id = typeof crypto.randomUUID === 'function' 
      ? crypto.randomUUID() 
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

    // Generate a cryptographic fingerprint using subtle crypto
    const rawFingerprintData = `${navigator.userAgent}|${navigator.hardwareConcurrency || ''}|${screen.width}x${screen.height}|${id}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawFingerprintData));
    const fingerprint = Array.from(new Uint8Array(hashBuffer))
      .slice(0, 8)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const identity: DeviceIdentity = {
      id,
      fingerprint: `FP-${fingerprint.toUpperCase()}`,
      registeredAt: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(identity));
    return identity;
  } catch {
    // If crypto failed or storage is unavailable
    return {
      id: 'Device ID unavailable',
      fingerprint: 'UNAVAILABLE',
      registeredAt: Date.now(),
    };
  }
}

/**
 * Extracts REAL system information using only legitimate browser/platform APIs.
 * Does NOT invent CPU, GPU, RAM, battery or network metrics if unavailable.
 */
export async function getRealSystemDiagnostics(): Promise<SystemDiagnostics> {
  const diagnostics: SystemDiagnostics = {
    platform: (navigator as any).userAgentData?.platform || navigator.platform || 'Unknown platform',
    userAgent: navigator.userAgent,
    language: navigator.language || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
  };

  // Real CPU Cores (Logical Processors)
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0) {
    diagnostics.cores = navigator.hardwareConcurrency;
  }

  // Real Device Memory (RAM in GB reported by Chromium browsers)
  if (typeof (navigator as any).deviceMemory === 'number') {
    diagnostics.memoryGb = (navigator as any).deviceMemory;
  }

  // Real Screen Resolution & Color Depth
  if (typeof window !== 'undefined' && window.screen) {
    diagnostics.screenResolution = `${window.screen.width} × ${window.screen.height} (Scale: ${window.devicePixelRatio || 1}x)`;
    diagnostics.colorDepth = window.screen.colorDepth;
  }

  // Real GPU Renderer via WebGL unmasked vendor/renderer extension
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer && typeof renderer === 'string') {
          diagnostics.gpuRenderer = renderer;
        }
      }
    }
  } catch {
    // Unmasked renderer blocked or unsupported
  }

  // Real Battery API if supported and granted
  try {
    if (typeof (navigator as any).getBattery === 'function') {
      const battery = await (navigator as any).getBattery();
      if (battery) {
        diagnostics.batteryLevel = typeof battery.level === 'number' ? battery.level : undefined;
        diagnostics.isCharging = typeof battery.charging === 'boolean' ? battery.charging : undefined;
      }
    }
  } catch {
    // Battery API restricted or rejected
  }

  // Real Network Information API
  try {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      if (conn.effectiveType) {
        diagnostics.networkType = conn.effectiveType.toUpperCase();
      }
      if (typeof conn.downlink === 'number') {
        diagnostics.downlinkMbps = conn.downlink;
      }
      if (typeof conn.rtt === 'number') {
        diagnostics.roundTripTimeMs = conn.rtt;
      }
    }
  } catch {
    // Network Info API restricted
  }

  return diagnostics;
}
