/**
 * Bridge Status Monitor
 * Polls LI.FI for bridge transaction status until completion
 */

import { getLiFiClient } from './lifi.js';
import { BridgeStatus, BridgeTimeoutError, BridgeError } from './types.js';
import { BRIDGE_OPTIONS, getChainName } from './config.js';

// ============ Status Monitor ============

export interface MonitorOptions {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  onStatusUpdate?: (status: BridgeStatus) => void;
}

/**
 * Wait for a bridge transaction to complete
 * Polls the LI.FI API until the bridge reaches a terminal state
 */
export async function waitForBridgeCompletion(
  txHash: string,
  fromChainId: number,
  toChainId: number,
  options: MonitorOptions = {}
): Promise<BridgeStatus> {
  const {
    maxWaitMs = BRIDGE_OPTIONS.maxWaitTimeMs,
    pollIntervalMs = BRIDGE_OPTIONS.pollIntervalMs,
    onStatusUpdate,
  } = options;

  const client = getLiFiClient();
  const startTime = Date.now();
  let lastStatus: BridgeStatus['status'] | null = null;

  console.log(`[Monitor] Watching bridge ${txHash.slice(0, 10)}...`);
  console.log(`[Monitor] ${getChainName(fromChainId)} -> ${getChainName(toChainId)}`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await client.getStatus(txHash, fromChainId, toChainId);

      // Log status changes
      if (status.status !== lastStatus) {
        console.log(`[Monitor] Status: ${status.status}${status.substatus ? ` (${status.substatus})` : ''}`);
        lastStatus = status.status;
      }

      // Call status update callback if provided
      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      // Check for terminal states
      if (status.status === 'DONE') {
        console.log(`[Monitor] Bridge completed successfully!`);
        if (status.receivingTxHash) {
          console.log(`[Monitor] Receiving TX: ${status.receivingTxHash}`);
        }
        return status;
      }

      if (status.status === 'FAILED') {
        throw new BridgeError(
          `Bridge failed: ${status.error ?? 'Unknown error'}`,
          'BRIDGE_FAILED',
          { txHash, status }
        );
      }

      // Wait before next poll
      await sleep(pollIntervalMs);
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      
      // Log but continue polling on transient errors
      console.warn(`[Monitor] Poll error (retrying): ${error instanceof Error ? error.message : error}`);
      await sleep(pollIntervalMs);
    }
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  throw new BridgeTimeoutError(txHash, elapsed);
}

/**
 * Monitor multiple bridge transactions in parallel
 */
export async function monitorMultipleBridges(
  bridges: Array<{
    txHash: string;
    fromChainId: number;
    toChainId: number;
  }>,
  options: MonitorOptions = {}
): Promise<Map<string, BridgeStatus>> {
  console.log(`[Monitor] Watching ${bridges.length} bridges...`);

  const results = new Map<string, BridgeStatus>();

  const promises = bridges.map(async (bridge) => {
    try {
      const status = await waitForBridgeCompletion(
        bridge.txHash,
        bridge.fromChainId,
        bridge.toChainId,
        options
      );
      results.set(bridge.txHash, status);
    } catch (error) {
      results.set(bridge.txHash, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Quick status check without waiting
 */
export async function checkBridgeStatus(
  txHash: string,
  fromChainId: number,
  toChainId: number
): Promise<BridgeStatus> {
  const client = getLiFiClient();
  return client.getStatus(txHash, fromChainId, toChainId);
}

// ============ Helper Functions ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format elapsed time for display
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Estimate remaining time based on progress
 */
export function estimateRemainingTime(
  startTime: number,
  estimatedTotalTime: number
): string {
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, estimatedTotalTime * 1000 - elapsed);
  return formatElapsedTime(remaining);
}
