/**
 * Bridge Configuration
 * Chain IDs, USDC addresses, and bridge settings for cross-chain operations
 */

import { ChainConfig, SupportedChain } from './types.js';

// ============ Supported Chains ============

export const SUPPORTED_CHAINS: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    explorer: 'https://etherscan.io',
  },
  base: {
    chainId: 8453,
    name: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    explorer: 'https://arbiscan.io',
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorer: 'https://polygonscan.com',
  },
  optimism: {
    chainId: 10,
    name: 'Optimism',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    explorer: 'https://optimistic.etherscan.io',
  },
};

// ============ Chain ID Mappings ============

export const CHAIN_ID_TO_NAME: Record<number, SupportedChain> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  137: 'polygon',
  10: 'optimism',
};

export const SUPPORTED_CHAIN_IDS = Object.values(SUPPORTED_CHAINS).map(c => c.chainId);

// ============ Bridge Options ============

export const BRIDGE_OPTIONS = {
  // Default slippage tolerance (0.5%)
  slippage: 0.005,
  
  // Preferred bridge protocols (in order of preference)
  allowedBridges: ['stargate', 'across', 'hop', 'cbridge', 'connext'],
  
  // Route ordering preference
  order: 'RECOMMENDED' as const,
  
  // Maximum wait time for bridge completion (5 minutes)
  maxWaitTimeMs: 300000,
  
  // Poll interval for status checks (5 seconds)
  pollIntervalMs: 5000,
};

// ============ Auto-Bridge Thresholds ============

export const AUTO_BRIDGE_CONFIG = {
  // Minimum APY difference to trigger bridge (2%)
  minApyDifferential: 0.02,
  
  // Maximum exposure to single chain (50%)
  maxChainExposure: 0.50,
  
  // Minimum amount to bridge (in USD)
  minBridgeAmountUsd: 100,
  
  // Bridge cost buffer - don't bridge if fees > this % of amount
  maxBridgeFeePercent: 0.01, // 1%
};

// ============ Helper Functions ============

export function getChainConfig(chainId: number): ChainConfig | undefined {
  const name = CHAIN_ID_TO_NAME[chainId];
  return name ? SUPPORTED_CHAINS[name] : undefined;
}

export function getUsdcAddress(chainId: number): string | undefined {
  const config = getChainConfig(chainId);
  return config?.usdc;
}

export function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAIN_IDS.includes(chainId);
}

export function getChainName(chainId: number): string {
  const config = getChainConfig(chainId);
  return config?.name ?? `Chain ${chainId}`;
}
