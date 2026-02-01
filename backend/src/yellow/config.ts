/**
 * Yellow Network / Nitrolite Configuration
 * Contract addresses for different networks
 */

import { Address } from 'viem';

export interface NetworkConfig {
  chainId: number;
  name: string;
  custody: Address;
  adjudicator: Address;
  rpcUrl?: string;
}

/**
 * Default contract addresses found in Yellow Network documentation
 * Source: Yellow Network docs
 *
 * NOTE: These addresses may need to be verified for Sepolia testnet
 * Check https://sepolia.etherscan.io to verify these contracts are deployed
 */
export const YELLOW_NETWORK_CONTRACTS: Record<string, NetworkConfig> = {
  // Sepolia Testnet (assumed - needs verification)
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    custody: '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6',
    adjudicator: '0xcbbc03A873c11beeFA8D99477E830be48d8Ae6D7',
  },

  // Add other networks as needed
  mainnet: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    custody: '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6', // Placeholder
    adjudicator: '0xcbbc03A873c11beeFA8D99477E830be48d8Ae6D7', // Placeholder
  },
};

/**
 * ClearNode WebSocket URL
 * This is the official Yellow Network WebSocket endpoint
 */
export const CLEARNODE_WEBSOCKET_URL = 'wss://clearnet.yellow.com/ws';

/**
 * Minimum challenge duration (1 hour in seconds)
 * This is enforced by the Nitrolite contracts
 */
export const MIN_CHALLENGE_DURATION = 3600n;

/**
 * Default challenge duration (24 hours in seconds)
 * Used for creating channels
 */
export const DEFAULT_CHALLENGE_DURATION = 86400n;

/**
 * Get network configuration by chain ID
 */
export function getNetworkConfig(chainId: number): NetworkConfig | null {
  const network = Object.values(YELLOW_NETWORK_CONTRACTS).find(
    (config) => config.chainId === chainId
  );
  return network || null;
}

/**
 * Get network configuration by name
 */
export function getNetworkConfigByName(name: string): NetworkConfig | null {
  return YELLOW_NETWORK_CONTRACTS[name.toLowerCase()] || null;
}
