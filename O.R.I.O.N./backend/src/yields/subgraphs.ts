/**
 * Protocol Subgraph Clients
 * Direct queries to Aave and Compound subgraphs for yield data
 * 
 * Used as backup/verification source alongside DeFiLlama
 */

import { YieldPool, AaveReserve, CompoundMarket, YieldScanError } from './types.js';

// ============ Subgraph Endpoints ============

const SUBGRAPH_ENDPOINTS = {
  // Aave V3 Subgraphs
  aave: {
    ethereum: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
    arbitrum: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    optimism: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
    polygon: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
    base: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-base',
  },
  // Compound V3 Subgraphs
  compound: {
    ethereum: 'https://api.thegraph.com/subgraphs/name/messari/compound-v3-ethereum',
    arbitrum: 'https://api.thegraph.com/subgraphs/name/messari/compound-v3-arbitrum',
    base: 'https://api.thegraph.com/subgraphs/name/messari/compound-v3-base',
    polygon: 'https://api.thegraph.com/subgraphs/name/messari/compound-v3-polygon',
  },
};

// Chain ID mapping
const CHAIN_NAMES: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  optimism: 10,
};

// ============ Aave Subgraph Client ============

/**
 * Fetch USDC reserve data from Aave V3
 */
export async function fetchAaveYields(): Promise<YieldPool[]> {
  console.log('[Subgraph] Fetching Aave V3 USDC reserves...');
  
  const pools: YieldPool[] = [];
  
  const query = `
    query GetUSDCReserve {
      reserves(where: { symbol_contains_nocase: "USDC" }) {
        id
        symbol
        liquidityRate
        variableBorrowRate
        totalLiquidity
        availableLiquidity
        underlyingAsset
      }
    }
  `;
  
  for (const [chain, endpoint] of Object.entries(SUBGRAPH_ENDPOINTS.aave)) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const reserves = data?.data?.reserves as AaveReserve[] ?? [];
      
      for (const reserve of reserves) {
        // Convert ray (1e27) to percentage
        const apy = parseFloat(reserve.liquidityRate) / 1e27 * 100;
        const tvl = parseFloat(reserve.totalLiquidity) / 1e6; // Assuming 6 decimals
        
        if (apy > 0 && tvl > 0) {
          pools.push({
            pool: `aave-v3-${chain}-${reserve.id}`,
            protocol: 'aave-v3',
            project: 'Aave V3',
            chain: chain.charAt(0).toUpperCase() + chain.slice(1),
            chainId: CHAIN_NAMES[chain] ?? 0,
            symbol: reserve.symbol,
            tvlUsd: tvl,
            apy,
            apyBase: apy,
            apyReward: 0,
            status: 'active',
            riskScore: 2, // Aave is generally low risk
          });
        }
      }
      
      console.log(`[Subgraph] Aave ${chain}: ${reserves.length} reserves found`);
    } catch (error) {
      console.warn(`[Subgraph] Failed to fetch Aave ${chain}:`, error);
    }
  }
  
  return pools;
}

/**
 * Fetch USDC market data from Compound V3
 */
export async function fetchCompoundYields(): Promise<YieldPool[]> {
  console.log('[Subgraph] Fetching Compound V3 USDC markets...');
  
  const pools: YieldPool[] = [];
  
  const query = `
    query GetUSDCMarket {
      markets(where: { inputToken_: { symbol_contains_nocase: "USDC" } }) {
        id
        name
        inputToken {
          symbol
        }
        totalValueLockedUSD
        rates {
          rate
          side
        }
      }
    }
  `;
  
  for (const [chain, endpoint] of Object.entries(SUBGRAPH_ENDPOINTS.compound)) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const markets = data?.data?.markets ?? [];
      
      for (const market of markets) {
        const supplyRate = market.rates?.find((r: any) => r.side === 'LENDER');
        const apy = supplyRate ? parseFloat(supplyRate.rate) : 0;
        const tvl = parseFloat(market.totalValueLockedUSD ?? '0');
        
        if (apy > 0 && tvl > 0) {
          pools.push({
            pool: `compound-v3-${chain}-${market.id}`,
            protocol: 'compound-v3',
            project: 'Compound V3',
            chain: chain.charAt(0).toUpperCase() + chain.slice(1),
            chainId: CHAIN_NAMES[chain] ?? 0,
            symbol: market.inputToken?.symbol ?? 'USDC',
            tvlUsd: tvl,
            apy,
            apyBase: apy,
            apyReward: 0,
            status: 'active',
            riskScore: 2, // Compound is generally low risk
          });
        }
      }
      
      console.log(`[Subgraph] Compound ${chain}: ${markets.length} markets found`);
    } catch (error) {
      console.warn(`[Subgraph] Failed to fetch Compound ${chain}:`, error);
    }
  }
  
  return pools;
}

/**
 * Fetch yields from all protocol subgraphs
 */
export async function fetchAllSubgraphYields(): Promise<YieldPool[]> {
  console.log('[Subgraph] Fetching yields from all protocol subgraphs...');
  
  const [aavePools, compoundPools] = await Promise.allSettled([
    fetchAaveYields(),
    fetchCompoundYields(),
  ]);
  
  const pools: YieldPool[] = [];
  
  if (aavePools.status === 'fulfilled') {
    pools.push(...aavePools.value);
  }
  
  if (compoundPools.status === 'fulfilled') {
    pools.push(...compoundPools.value);
  }
  
  console.log(`[Subgraph] Total pools from subgraphs: ${pools.length}`);
  return pools;
}

/**
 * Verify DeFiLlama data against subgraph data
 */
export async function verifyYieldData(
  defiLlamaPools: YieldPool[]
): Promise<{
  verified: YieldPool[];
  discrepancies: Array<{
    pool: YieldPool;
    defillamaApy: number;
    subgraphApy: number;
    difference: number;
  }>;
}> {
  const subgraphPools = await fetchAllSubgraphYields();
  const verified: YieldPool[] = [];
  const discrepancies: Array<{
    pool: YieldPool;
    defillamaApy: number;
    subgraphApy: number;
    difference: number;
  }> = [];
  
  // Create lookup by protocol + chain
  const subgraphMap = new Map<string, YieldPool>();
  for (const pool of subgraphPools) {
    const key = `${pool.protocol}-${pool.chainId}`;
    subgraphMap.set(key, pool);
  }
  
  for (const pool of defiLlamaPools) {
    const key = `${pool.protocol}-${pool.chainId}`;
    const subgraphPool = subgraphMap.get(key);
    
    if (subgraphPool) {
      const diff = Math.abs(pool.apy - subgraphPool.apy);
      const threshold = Math.max(pool.apy * 0.1, 0.1); // 10% or 0.1% absolute
      
      if (diff > threshold) {
        discrepancies.push({
          pool,
          defillamaApy: pool.apy,
          subgraphApy: subgraphPool.apy,
          difference: diff,
        });
      } else {
        verified.push(pool);
      }
    } else {
      // No subgraph data to verify against
      verified.push(pool);
    }
  }
  
  return { verified, discrepancies };
}
