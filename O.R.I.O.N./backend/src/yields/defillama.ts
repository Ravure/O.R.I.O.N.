/**
 * DeFiLlama API Client
 * Fetches real-time yield data from DeFiLlama's yields API
 * 
 * API Documentation: https://defillama.com/docs/api
 * 
 * Rate Limited: 8 requests/second with token bucket algorithm
 */

import { 
  YieldPool, 
  DeFiLlamaPool, 
  DeFiLlamaResponse, 
  YieldScannerConfig,
  YieldScanError,
} from './types.js';
import { SUPPORTED_CHAIN_IDS, CHAIN_ID_TO_NAME } from '../bridge/config.js';
import { defiLlamaRateLimiter, rateLimitedFetch } from '../utils/rateLimiter.js';

// ============ Constants ============

const DEFILLAMA_YIELDS_URL = 'https://yields.llama.fi/pools';
const DEFILLAMA_LEND_URL = 'https://yields.llama.fi/lendBorrow';

// Chain name mapping (DeFiLlama uses different names)
const DEFILLAMA_CHAIN_MAP: Record<string, number> = {
  'Ethereum': 1,
  'Base': 8453,
  'Arbitrum': 42161,
  'Polygon': 137,
  'Optimism': 10,
  'Avalanche': 43114,
  'BSC': 56,
  'Fantom': 250,
  'Gnosis': 100,
};

// Default scanner configuration
const DEFAULT_CONFIG: YieldScannerConfig = {
  minTvlUsd: 100000,  // $100k minimum TVL
  minApy: 0,
  maxRiskScore: 7,
  chainIds: SUPPORTED_CHAIN_IDS,
};

// ============ DeFiLlama Client ============

/**
 * Fetch all yield pools from DeFiLlama
 * Rate limited to prevent API throttling
 */
export async function fetchAllPools(): Promise<DeFiLlamaPool[]> {
  console.log('[DeFiLlama] Fetching all yield pools...');
  console.log(`[DeFiLlama] Rate limiter: ${defiLlamaRateLimiter.getAvailableTokens()} tokens available`);
  
  try {
    const response = await rateLimitedFetch(defiLlamaRateLimiter, DEFILLAMA_YIELDS_URL);
    
    if (!response.ok) {
      throw new YieldScanError(
        `DeFiLlama API error: ${response.status} ${response.statusText}`,
        'defillama'
      );
    }
    
    const data = await response.json() as DeFiLlamaResponse;
    
    if (data.status !== 'success' || !data.data) {
      throw new YieldScanError('Invalid DeFiLlama response format', 'defillama');
    }
    
    console.log(`[DeFiLlama] Fetched ${data.data.length} total pools`);
    return data.data;
  } catch (error) {
    if (error instanceof YieldScanError) throw error;
    throw new YieldScanError(
      `Failed to fetch DeFiLlama data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'defillama'
    );
  }
}

/**
 * Fetch USDC yield pools from supported chains
 */
export async function fetchUSDCPools(
  config: YieldScannerConfig = DEFAULT_CONFIG
): Promise<YieldPool[]> {
  const allPools = await fetchAllPools();
  
  console.log('[DeFiLlama] Filtering for USDC pools on supported chains...');
  
  const usdcPools = allPools
    .filter(pool => {
      // Must be USDC-related
      const symbol = pool.symbol.toUpperCase();
      if (!symbol.includes('USDC')) return false;
      
      // Must be on a supported chain
      const chainId = DEFILLAMA_CHAIN_MAP[pool.chain];
      if (!chainId) return false;
      if (config.chainIds && !config.chainIds.includes(chainId)) return false;
      
      // Must have valid APY
      if (pool.apy === null || pool.apy === undefined) return false;
      if (pool.apy < (config.minApy ?? 0)) return false;
      
      // Must meet TVL threshold
      if (pool.tvlUsd < (config.minTvlUsd ?? 0)) return false;
      
      // Check protocol filters
      if (config.includeProtocols && config.includeProtocols.length > 0) {
        if (!config.includeProtocols.includes(pool.project.toLowerCase())) return false;
      }
      if (config.excludeProtocols && config.excludeProtocols.length > 0) {
        if (config.excludeProtocols.includes(pool.project.toLowerCase())) return false;
      }
      
      return true;
    })
    .map(pool => convertToYieldPool(pool))
    .sort((a, b) => b.apy - a.apy);  // Sort by APY descending
  
  console.log(`[DeFiLlama] Found ${usdcPools.length} USDC pools`);
  return usdcPools;
}

/**
 * Fetch pools for a specific protocol
 */
export async function fetchProtocolPools(
  protocol: string,
  config: YieldScannerConfig = DEFAULT_CONFIG
): Promise<YieldPool[]> {
  const pools = await fetchUSDCPools({
    ...config,
    includeProtocols: [protocol.toLowerCase()],
  });
  
  return pools;
}

/**
 * Fetch the best yield opportunity per chain
 */
export async function fetchBestPerChain(
  config: YieldScannerConfig = DEFAULT_CONFIG
): Promise<Map<number, YieldPool>> {
  const pools = await fetchUSDCPools(config);
  const bestPerChain = new Map<number, YieldPool>();
  
  for (const pool of pools) {
    const existing = bestPerChain.get(pool.chainId);
    if (!existing || pool.apy > existing.apy) {
      bestPerChain.set(pool.chainId, pool);
    }
  }
  
  return bestPerChain;
}

// ============ Helper Functions ============

/**
 * Convert DeFiLlama pool format to our YieldPool format
 */
function convertToYieldPool(pool: DeFiLlamaPool): YieldPool {
  const chainId = DEFILLAMA_CHAIN_MAP[pool.chain] ?? 0;
  
  return {
    pool: pool.pool,
    protocol: pool.project.toLowerCase(),
    project: pool.project,
    chain: pool.chain,
    chainId,
    symbol: pool.symbol,
    tvlUsd: pool.tvlUsd,
    apy: pool.apy ?? 0,
    apyBase: pool.apyBase ?? 0,
    apyReward: pool.apyReward ?? 0,
    apyMean7d: pool.apyPct7D ?? undefined,
    status: 'active',
    riskScore: calculateRiskScore(pool),
    poolMeta: pool.poolMeta,
    underlyingTokens: pool.underlyingTokens,
    poolAddress: extractAddress(pool.pool) ?? extractAddress(pool.poolMeta ?? undefined),
    updatedAt: new Date().toISOString(),
  };
}

function extractAddress(input?: string): string | undefined {
  if (!input) return undefined;
  const match = input.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : undefined;
}

/**
 * Calculate a risk score based on pool characteristics
 */
function calculateRiskScore(pool: DeFiLlamaPool): number {
  let score = 3; // Base score
  
  // Lower TVL = higher risk
  if (pool.tvlUsd < 1000000) score += 2;
  else if (pool.tvlUsd < 10000000) score += 1;
  else if (pool.tvlUsd > 100000000) score -= 1;
  
  // Very high APY = higher risk (likely unsustainable)
  if (pool.apy && pool.apy > 20) score += 2;
  else if (pool.apy && pool.apy > 10) score += 1;
  
  // Reward-heavy APY = higher risk (token dumps)
  if (pool.apyReward && pool.apyBase) {
    const rewardRatio = pool.apyReward / (pool.apyBase + pool.apyReward);
    if (rewardRatio > 0.7) score += 2;
    else if (rewardRatio > 0.5) score += 1;
  }
  
  // Well-known protocols get lower scores
  const safeProtocols = ['aave', 'compound', 'maker', 'morpho', 'spark'];
  if (safeProtocols.some(p => pool.project.toLowerCase().includes(p))) {
    score -= 1;
  }
  
  // Clamp to 1-10 range
  return Math.max(1, Math.min(10, score));
}

/**
 * Format APY for display
 */
export function formatApy(apy: number): string {
  return `${(apy).toFixed(2)}%`;
}

/**
 * Format TVL for display
 */
export function formatTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(2)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(2)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(2)}K`;
  return `$${tvl.toFixed(2)}`;
}
