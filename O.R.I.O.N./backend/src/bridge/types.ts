/**
 * Bridge Module Type Definitions
 * TypeScript interfaces for cross-chain bridging operations
 */

// ============ Chain Configuration ============

export interface ChainConfig {
  chainId: number;
  name: string;
  usdc: string;
  rpcUrl?: string;
  explorer?: string;
}

export type SupportedChain = 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'optimism';

// ============ Bridge Request/Response ============

export interface BridgeQuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  amount: string;
  userAddress: string;
  slippage?: number;
}

export interface BridgeQuote {
  id: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  estimatedGas: string;
  estimatedTime: number; // seconds
  bridgeName: string;
  steps: BridgeStep[];
}

export interface BridgeStep {
  type: 'swap' | 'bridge' | 'cross';
  tool: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
}

export interface BridgeExecution {
  txHash: string;
  fromChainId: number;
  toChainId: number;
  status: BridgeStatus;
  startTime: number;
  estimatedEndTime: number;
}

// ============ Bridge Status ============

export type BridgeStatusType = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED';

export interface BridgeStatus {
  status: BridgeStatusType;
  substatus?: string;
  txHash?: string;
  receivingTxHash?: string;
  fromAmount?: string;
  toAmount?: string;
  error?: string;
}

// ============ Auto-Bridge Logic ============

export type BridgeActionType = 'YIELD_OPTIMIZATION' | 'DIVERSIFICATION' | 'REBALANCE';

export interface BridgeAction {
  type: BridgeActionType;
  fromChain: SupportedChain;
  toChain: SupportedChain;
  amount: string;
  reason: string;
  expectedApyImprovement?: number;
}

export interface Portfolio {
  totalValueUsd: number;
  positions: PortfolioPosition[];
}

export interface PortfolioPosition {
  chain: SupportedChain;
  chainId: number;
  protocol: string;
  tokenSymbol: string;
  balance: string;
  balanceUsd: number;
  apy: number;
}

// ============ Error Types ============

export class BridgeError extends Error {
  constructor(
    message: string,
    public code: string = 'BRIDGE_ERROR',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export class BridgeTimeoutError extends BridgeError {
  constructor(txHash: string, elapsed: number) {
    super(`Bridge timeout after ${elapsed}ms`, 'BRIDGE_TIMEOUT', { txHash, elapsed });
    this.name = 'BridgeTimeoutError';
  }
}

export class BridgeQuoteError extends BridgeError {
  constructor(message: string, request: BridgeQuoteRequest) {
    super(message, 'BRIDGE_QUOTE_ERROR', { request });
    this.name = 'BridgeQuoteError';
  }
}
