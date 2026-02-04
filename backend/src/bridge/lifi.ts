/**
 * LI.FI Bridge Client
 * Wrapper around the LI.FI SDK for cross-chain bridging
 */

import { createConfig, getQuote, getStatus, getRoutes } from '@lifi/sdk';
import type { Route, RoutesRequest, GetStatusRequest } from '@lifi/sdk';
import { ethers } from 'ethers';
import { 
  BridgeQuoteRequest, 
  BridgeQuote, 
  BridgeStatus, 
  BridgeExecution,
  BridgeError,
  BridgeQuoteError,
} from './types.js';
import { BRIDGE_OPTIONS, getUsdcAddress, getChainName } from './config.js';

// ============ Initialize LI.FI SDK ============

createConfig({
  integrator: 'ORION',
});

// ============ LI.FI Bridge Client ============

export class LiFiBridgeClient {
  private integrator = 'ORION';

  constructor() {
    console.log('[LI.FI] Client initialized');
  }

  /**
   * Get a quote for bridging tokens between chains
   */
  async getQuote(params: BridgeQuoteRequest): Promise<BridgeQuote> {
    console.log(`[LI.FI] Getting quote: ${getChainName(params.fromChainId)} -> ${getChainName(params.toChainId)}`);
    console.log(`[LI.FI] Amount: ${params.amount}`);

    try {
      const routeRequest: RoutesRequest = {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromTokenAddress: params.fromToken,
        toTokenAddress: params.toToken,
        fromAmount: params.amount,
        fromAddress: params.userAddress,
        toAddress: params.userAddress,
        options: {
          slippage: params.slippage ?? BRIDGE_OPTIONS.slippage,
          order: BRIDGE_OPTIONS.order,
          allowBridges: BRIDGE_OPTIONS.allowedBridges,
        },
      };

      const result = await getRoutes(routeRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new BridgeQuoteError('No routes found for this bridge', params);
      }

      const bestRoute = result.routes[0];
      return this.convertRouteToQuote(bestRoute, params);
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeQuoteError(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
        params
      );
    }
  }

  /**
   * Get multiple quotes for comparison
   */
  async getQuotes(params: BridgeQuoteRequest, limit: number = 3): Promise<BridgeQuote[]> {
    console.log(`[LI.FI] Getting ${limit} quotes for comparison`);

    try {
      const routeRequest: RoutesRequest = {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromTokenAddress: params.fromToken,
        toTokenAddress: params.toToken,
        fromAmount: params.amount,
        fromAddress: params.userAddress,
        toAddress: params.userAddress,
        options: {
          slippage: params.slippage ?? BRIDGE_OPTIONS.slippage,
        },
      };

      const result = await getRoutes(routeRequest);
      
      if (!result.routes || result.routes.length === 0) {
        return [];
      }

      return result.routes
        .slice(0, limit)
        .map(route => this.convertRouteToQuote(route, params));
    } catch (error) {
      console.error('[LI.FI] Failed to get quotes:', error);
      return [];
    }
  }

  /**
   * Check the status of a bridge transaction
   */
  async getStatus(
    txHash: string,
    fromChainId: number,
    toChainId: number,
    bridge?: string
  ): Promise<BridgeStatus> {
    try {
      const statusRequest: GetStatusRequest = {
        txHash,
        fromChain: fromChainId,
        toChain: toChainId,
        bridge,
      };

      const status = await getStatus(statusRequest);

      return {
        status: this.mapStatus(status.status),
        substatus: status.substatus,
        txHash: status.sending?.txHash,
        receivingTxHash: status.receiving?.txHash,
        fromAmount: status.sending?.amount,
        toAmount: status.receiving?.amount,
      };
    } catch (error) {
      console.error('[LI.FI] Failed to get status:', error);
      return {
        status: 'PENDING',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a bridge transaction (returns transaction data for signing)
   */
  async getBridgeTransaction(quote: BridgeQuote): Promise<{
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
  }> {
    console.log(`[LI.FI] Getting transaction data for bridge ${quote.id}`);
    
    // In production, use lifi.getStepTransaction() for each step
    // For now, return placeholder - actual execution requires signer
    throw new BridgeError(
      'Direct execution not implemented - use quote data with your signer',
      'NOT_IMPLEMENTED'
    );
  }

  // ============ Private Helpers ============

  private convertRouteToQuote(route: Route, request: BridgeQuoteRequest): BridgeQuote {
    const steps = route.steps.map(step => ({
      type: step.type as 'swap' | 'bridge' | 'cross',
      tool: step.tool,
      fromChainId: step.action.fromChainId,
      toChainId: step.action.toChainId,
      fromToken: step.action.fromToken.address,
      toToken: step.action.toToken.address,
      fromAmount: step.action.fromAmount,
      toAmount: step.estimate.toAmount,
    }));

    return {
      id: route.id,
      fromChainId: request.fromChainId,
      toChainId: request.toChainId,
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: route.fromAmount,
      toAmount: route.toAmount,
      toAmountMin: route.toAmountMin,
      estimatedGas: route.gasCostUSD ?? '0',
      estimatedTime: this.calculateEstimatedTime(route),
      bridgeName: steps[0]?.tool ?? 'unknown',
      steps,
    };
  }

  private calculateEstimatedTime(route: Route): number {
    // Sum up estimated execution times from all steps
    return route.steps.reduce((total, step) => {
      return total + (step.estimate.executionDuration ?? 60);
    }, 0);
  }

  private mapStatus(status: string): BridgeStatus['status'] {
    switch (status.toUpperCase()) {
      case 'DONE':
        return 'DONE';
      case 'FAILED':
        return 'FAILED';
      case 'PENDING':
        return 'PENDING';
      default:
        return 'IN_PROGRESS';
    }
  }
}

// ============ Singleton Instance ============

let clientInstance: LiFiBridgeClient | null = null;

export function getLiFiClient(): LiFiBridgeClient {
  if (!clientInstance) {
    clientInstance = new LiFiBridgeClient();
  }
  return clientInstance;
}
