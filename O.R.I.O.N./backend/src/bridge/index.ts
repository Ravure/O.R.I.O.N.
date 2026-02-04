/**
 * Bridge Module - Cross-chain bridging via LI.FI
 */

// Types
export * from './types.js';

// Configuration
export * from './config.js';

// LI.FI Client
export { LiFiBridgeClient, getLiFiClient } from './lifi.js';

// Status Monitoring
export { 
  waitForBridgeCompletion, 
  monitorMultipleBridges, 
  checkBridgeStatus,
  formatElapsedTime,
  estimateRemainingTime,
} from './monitor.js';

// Auto-Bridge Logic
export { AutoBridger, getAutoBridger } from './autoBridge.js';
