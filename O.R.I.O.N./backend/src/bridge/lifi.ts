/**
 * LI.FI Bridge Client
 * Wrapper around the LI.FI SDK for cross-chain bridging
 * 
 * Supports:
 * - Quote fetching for optimal routes
 * - Full bridge execution with signer integration
 * - Transaction approval handling (ERC20)
 * - Status monitoring
 * - Rate limiting (5 req/sec)
 */

import { createConfig, getQuote, getStatus, getRoutes, getStepTransaction } from '@lifi/sdk';
import type { Route, RoutesRequest, GetStatusRequest, LiFiStep } from '@lifi/sdk';
import { ethers, Signer, Provider, Contract } from 'ethers';
import { 
  BridgeQuoteRequest, 
  BridgeQuote, 
  BridgeStatus, 
  BridgeExecution,
  BridgeError,
  BridgeQuoteError,
} from './types.js';
import { BRIDGE_OPTIONS, getUsdcAddress, getChainName } from './config.js';
import { lifiRateLimiter } from '../utils/rateLimiter.js';

// ERC20 ABI for token approvals
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ============ Types ============

export interface ExecuteBridgeParams {
  quote: BridgeQuote;
  signer: Signer;
  onStepStart?: (step: number, total: number, description: string) => void;
  onStepComplete?: (step: number, txHash: string) => void;
  onApprovalRequired?: (token: string, spender: string, amount: string) => void;
}

export interface BridgeTransactionData {
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  chainId: number;
}

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
   * Rate limited to prevent API throttling
   */
  async getQuote(params: BridgeQuoteRequest): Promise<BridgeQuote> {
    console.log(`[LI.FI] Getting quote: ${getChainName(params.fromChainId)} -> ${getChainName(params.toChainId)}`);
    console.log(`[LI.FI] Amount: ${params.amount}`);
    console.log(`[LI.FI] Rate limiter: ${lifiRateLimiter.getAvailableTokens()} tokens available`);

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
          bridges: { allow: BRIDGE_OPTIONS.allowedBridges },
        },
      };

      // Rate limited API call
      const result = await lifiRateLimiter.execute(() => getRoutes(routeRequest));
      
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
   * Rate limited to prevent API throttling
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

      // Rate limited API call
      const result = await lifiRateLimiter.execute(() => getRoutes(routeRequest));
      
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
   * Rate limited to prevent API throttling
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

      // Rate limited API call
      const status = await lifiRateLimiter.execute(() => getStatus(statusRequest));

      // Handle different status response shapes
      const statusAny = status as any;
      return {
        status: this.mapStatus(status.status),
        substatus: status.substatus,
        txHash: statusAny.sending?.txHash ?? statusAny.transactionId,
        receivingTxHash: statusAny.receiving?.txHash,
        fromAmount: statusAny.sending?.amount,
        toAmount: statusAny.receiving?.amount,
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
   * Get transaction data for a bridge quote (for manual execution)
   * @param quote The bridge quote to get transaction data for
   * @param userAddress The address that will execute the transaction
   */
  async getBridgeTransaction(
    quote: BridgeQuote,
    userAddress: string
  ): Promise<BridgeTransactionData> {
    console.log(`[LI.FI] Getting transaction data for bridge ${quote.id}`);
    
    try {
      // Re-fetch the route to get the latest transaction data
      const routeRequest: RoutesRequest = {
        fromChainId: quote.fromChainId,
        toChainId: quote.toChainId,
        fromTokenAddress: quote.fromToken,
        toTokenAddress: quote.toToken,
        fromAmount: quote.fromAmount,
        fromAddress: userAddress,
        toAddress: userAddress,
        options: {
          slippage: BRIDGE_OPTIONS.slippage,
          order: BRIDGE_OPTIONS.order,
          bridges: { allow: BRIDGE_OPTIONS.allowedBridges },
        },
      };

      const result = await getRoutes(routeRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new BridgeError('No routes found', 'NO_ROUTES');
      }

      const route = result.routes[0];
      const firstStep = route.steps[0];
      
      if (!firstStep) {
        throw new BridgeError('Route has no steps', 'NO_STEPS');
      }

      // Get transaction data for the first step
      const stepTx = await getStepTransaction(firstStep);
      
      return {
        to: stepTx.transactionRequest?.to ?? '',
        data: stepTx.transactionRequest?.data?.toString() ?? '0x',
        value: stepTx.transactionRequest?.value?.toString() ?? '0',
        gasLimit: stepTx.transactionRequest?.gasLimit?.toString(),
        chainId: quote.fromChainId,
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        `Failed to get transaction data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TX_DATA_ERROR'
      );
    }
  }

  /**
   * Execute a full bridge with signer integration
   * Handles token approvals and multi-step execution
   */
  async executeBridge(params: ExecuteBridgeParams): Promise<BridgeExecution> {
    const { quote, signer, onStepStart, onStepComplete, onApprovalRequired } = params;
    const userAddress = await signer.getAddress();
    
    console.log(`[LI.FI] Starting bridge execution`);
    console.log(`[LI.FI] From: ${getChainName(quote.fromChainId)} -> ${getChainName(quote.toChainId)}`);
    console.log(`[LI.FI] Amount: ${quote.fromAmount}`);
    console.log(`[LI.FI] User: ${userAddress}`);

    const startTime = Date.now();
    let txHash: string = '';

    try {
      // Re-fetch the route to get fresh transaction data
      const routeRequest: RoutesRequest = {
        fromChainId: quote.fromChainId,
        toChainId: quote.toChainId,
        fromTokenAddress: quote.fromToken,
        toTokenAddress: quote.toToken,
        fromAmount: quote.fromAmount,
        fromAddress: userAddress,
        toAddress: userAddress,
        options: {
          slippage: BRIDGE_OPTIONS.slippage,
          order: BRIDGE_OPTIONS.order,
          bridges: { allow: BRIDGE_OPTIONS.allowedBridges },
        },
      };

      const result = await getRoutes(routeRequest);
      
      if (!result.routes || result.routes.length === 0) {
        throw new BridgeError('No routes available', 'NO_ROUTES');
      }

      const route = result.routes[0];
      const totalSteps = route.steps.length;

      console.log(`[LI.FI] Route has ${totalSteps} step(s)`);

      // Execute each step
      for (let i = 0; i < totalSteps; i++) {
        const step = route.steps[i];
        const stepDescription = `${step.type}: ${step.tool} (${getChainName(step.action.fromChainId)} -> ${getChainName(step.action.toChainId)})`;
        
        onStepStart?.(i + 1, totalSteps, stepDescription);
        console.log(`[LI.FI] Step ${i + 1}/${totalSteps}: ${stepDescription}`);

        // Check if approval is needed (for ERC20 tokens, not native)
        if (step.action.fromToken.address !== ethers.ZeroAddress) {
          await this.handleTokenApproval(
            signer,
            step.action.fromToken.address,
            step.action.fromAmount,
            step.estimate.approvalAddress ?? step.action.fromToken.address,
            onApprovalRequired
          );
        }

        // Get transaction data for this step
        const stepTx = await getStepTransaction(step);
        
        if (!stepTx.transactionRequest) {
          throw new BridgeError(`No transaction request for step ${i + 1}`, 'NO_TX_REQUEST');
        }

        // Execute the transaction
        const tx = await signer.sendTransaction({
          to: stepTx.transactionRequest.to,
          data: stepTx.transactionRequest.data?.toString(),
          value: stepTx.transactionRequest.value ?? 0n,
          gasLimit: stepTx.transactionRequest.gasLimit,
        });

        console.log(`[LI.FI] Transaction sent: ${tx.hash}`);
        txHash = tx.hash;

        // Wait for confirmation
        const receipt = await tx.wait();
        
        if (!receipt || receipt.status === 0) {
          throw new BridgeError(`Transaction failed at step ${i + 1}`, 'TX_FAILED', { txHash });
        }

        console.log(`[LI.FI] Step ${i + 1} confirmed in block ${receipt.blockNumber}`);
        onStepComplete?.(i + 1, tx.hash);
      }

      console.log(`[LI.FI] Bridge execution completed successfully`);

      return {
        txHash,
        fromChainId: quote.fromChainId,
        toChainId: quote.toChainId,
        status: {
          status: 'IN_PROGRESS',
          txHash,
        },
        startTime,
        estimatedEndTime: startTime + (quote.estimatedTime * 1000),
      };

    } catch (error) {
      console.error('[LI.FI] Bridge execution failed:', error);
      
      if (error instanceof BridgeError) throw error;
      
      throw new BridgeError(
        `Bridge execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EXECUTION_FAILED',
        { txHash }
      );
    }
  }

  /**
   * Handle ERC20 token approval if needed
   */
  private async handleTokenApproval(
    signer: Signer,
    tokenAddress: string,
    amount: string,
    spenderAddress: string,
    onApprovalRequired?: (token: string, spender: string, amount: string) => void
  ): Promise<void> {
    const userAddress = await signer.getAddress();
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);

    try {
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(userAddress, spenderAddress);
      const requiredAmount = BigInt(amount);

      if (currentAllowance >= requiredAmount) {
        console.log(`[LI.FI] Sufficient allowance already exists`);
        return;
      }

      console.log(`[LI.FI] Approval required for ${tokenAddress}`);
      onApprovalRequired?.(tokenAddress, spenderAddress, amount);

      // Approve max amount (or specific amount for better security)
      const approveTx = await tokenContract.approve(spenderAddress, requiredAmount);
      console.log(`[LI.FI] Approval transaction sent: ${approveTx.hash}`);

      const approveReceipt = await approveTx.wait();
      
      if (!approveReceipt || approveReceipt.status === 0) {
        throw new BridgeError('Token approval failed', 'APPROVAL_FAILED');
      }

      console.log(`[LI.FI] Token approval confirmed`);
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        `Token approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'APPROVAL_ERROR'
      );
    }
  }

  /**
   * Check if a token approval is needed
   */
  async checkApprovalNeeded(
    provider: Provider,
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    amount: string
  ): Promise<{ needed: boolean; currentAllowance: string }> {
    if (tokenAddress === ethers.ZeroAddress) {
      return { needed: false, currentAllowance: 'N/A (native token)' };
    }

    const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
    const currentAllowance = await tokenContract.allowance(ownerAddress, spenderAddress);
    const requiredAmount = BigInt(amount);

    return {
      needed: currentAllowance < requiredAmount,
      currentAllowance: currentAllowance.toString(),
    };
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

// ============ Convenience Functions ============

/**
 * Execute a bridge with a private key (convenience wrapper)
 */
export async function executeBridgeWithKey(
  quote: BridgeQuote,
  privateKey: string,
  rpcUrl: string,
  callbacks?: Omit<ExecuteBridgeParams, 'quote' | 'signer'>
): Promise<BridgeExecution> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const client = getLiFiClient();
  
  return client.executeBridge({
    quote,
    signer,
    ...callbacks,
  });
}
