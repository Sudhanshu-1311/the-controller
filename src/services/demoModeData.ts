/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegisteredDevice, RealPerformanceMetrics } from '../types/controller';

/**
 * STRICT ISOLATION:
 * This data is ONLY EVER rendered when the user explicitly enables DEMO MODE.
 * It is NEVER loaded or merged into Real Mode.
 */
export const DEMO_DEVICES: RegisteredDevice[] = [
  {
    identity: {
      id: 'demo-device-01-sandbox-only',
      fingerprint: 'FP-DEMO01',
      registeredAt: 1774940000000,
    },
    name: '[DEMO SANDBOX] Edge Node 01 (Linux x86_64)',
    role: 'agent',
    status: 'Connected',
    lastSeen: Date.now(),
    systemInfo: {
      platform: 'Linux x86_64 [DEMO]',
      userAgent: 'TheControllerAgent/1.0 (Demo Virtual Node)',
      cores: 16,
      memoryGb: 32,
      screenResolution: '2560 × 1440 (Scale: 1x)',
      colorDepth: 24,
      gpuRenderer: 'NVIDIA RTX 4090 (Virtual Demo Driver)',
      batteryLevel: 0.94,
      isCharging: true,
      networkType: '4G/FIBER',
      downlinkMbps: 100,
      roundTripTimeMs: 12,
      timezone: 'UTC',
      language: 'en-US',
    },
    sharedFiles: [
      {
        id: 'demo-f1',
        name: 'sample_system_report_demo.pdf',
        size: 1048576,
        type: 'application/pdf',
        lastModified: 1774930000000,
      },
      {
        id: 'demo-f2',
        name: 'diagnostic_trace_demo.log',
        size: 409600,
        type: 'text/plain',
        lastModified: 1774935000000,
      },
    ],
    fileAccessGranted: true,
    screenSharingActive: true,
  },
  {
    identity: {
      id: 'demo-device-02-sandbox-only',
      fingerprint: 'FP-DEMO02',
      registeredAt: 1774941000000,
    },
    name: '[DEMO SANDBOX] Field Tablet 02 (ARM64)',
    role: 'agent',
    status: 'Offline',
    lastSeen: Date.now() - 3600000,
    systemInfo: {
      platform: 'Android 15 / ARM64 [DEMO]',
      userAgent: 'TheControllerAgent/1.0 (Demo Tablet)',
      cores: 8,
      memoryGb: 8,
      screenResolution: '2000 × 1200',
      colorDepth: 24,
      batteryLevel: 0.42,
      isCharging: false,
      networkType: 'WIFI',
      downlinkMbps: 45,
      roundTripTimeMs: 28,
    },
    sharedFiles: [],
    fileAccessGranted: false,
    screenSharingActive: false,
  },
];

export const DEMO_PERFORMANCE_METRICS: RealPerformanceMetrics = {
  fps: 60,
  latencyMs: 14,
  bitrateKbps: 4200,
  packetLossPct: 0.0,
  jitterMs: 2,
  resolution: '2560×1440',
  framesDecoded: 18450,
  bytesReceived: 84900000,
  lastUpdated: Date.now(),
};
