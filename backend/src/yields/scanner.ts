/**
 * Yield Scanner
 * Main scanner that combines DeFiLlama and subgraph data
 * to find the best USDC yield opportunities across chains
 */

import { 
  YieldPool, 
  ChainYields, 
  ChainYieldData,
  YieldScannerConfig,
  YieldScanResult,
  YieldScanError,
} from './types.js';
import { fetchUSDCPools, fetchBestPerChain, formatApy, formatTvl } from './defillama.js';
import { fetchAllSubgraphYields, verifyYieldData } from './subgraphs.js';
import { SUPPORTED_CHAINS, CHAIN_ID_TO_NAME, getChainName } from '../bridge/config.js';

// ============ Default Configuration ============

const DEFAULT_CONFIG: YieldScannerConfig = {
  minTvlUsd: 100000,      // $100k minimum
  minApy: 0,              // Include all APYs
  maxRiskScore: 7,        // Exclude very risky pools
  chainIds: Object.values(SUPPORTED_CHAINS).map(c => c.chainId),
};

// ============ Yield Scanner Class ============

export class YieldScanner {
  private config: YieldScannerConfig;
  private lastScan: YieldScanResult | null = null;
  private cacheExpiryMs = 60000; // 1 minute cache

  constructor(config: Partial<YieldScannerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scan all chains for USDC yield opportunities
   */
  async scanAllChains(forceRefresh = false): Promise<YieldScanResult> {
    // Check cache
    if (
      !forceRefresh &&
      this.lastScan &&
      Date.now() - this.lastScan.timestamp < this.cacheExpiryMs
    ) {
      console.log('[YieldScanner] Returning cached results');
      return this.lastScan;
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     ORION Yield Scanner                ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const startTime = Date.now();

    // 1. Fetch from DeFiLlama (primary source)
    console.log('[YieldScanner] Fetching from DeFiLlama (primary)...');
    let pools: YieldPool[];
    
    try {
      pools = await fetchUSDCPools(this.config);
    } catch (error) {
      console.warn('[YieldScanner] DeFiLlama failed, falling back to subgraphs');
      pools = await fetchAllSubgraphYields();
    }

    // 2. Optionally verify with subgraphs
    if (pools.length > 0) {
      try {
        const { verified, discrepancies } = await verifyYieldData(pools);
        if (discrepancies.length > 0) {
          console.log(`[YieldScanner] Found ${discrepancies.length} APY discrepancies between sources`);
        }
        pools = verified;
      } catch {
        // Continue with unverified data if subgraphs fail
      }
    }

    // 3. Apply basic filters (min/max APY, min TVL)
    pools = pools.filter(pool => {
      if (this.config.minApy !== undefined && pool.apy < this.config.minApy) return false;
      if (this.config.maxApy !== undefined && pool.apy > this.config.maxApy) return false;
      if (this.config.minTvlUsd !== undefined && pool.tvlUsd < this.config.minTvlUsd) return false;
      if (this.config.stablecoinOnly && !pool.symbol.toUpperCase().includes('USDC')) return false;
      return true;
    });

    // 4. Apply risk filters
    pools = pools.filter(pool => 
      !pool.riskScore || pool.riskScore <= (this.config.maxRiskScore ?? 10)
    );

    // 5. Aggregate by chain
    const yields = this.aggregateByChain(pools);

    // 6. Find best overall opportunity
    const bestOpportunity = this.findBestOpportunity(pools);

    // 7. Calculate stats
    const stats = this.calculateStats(pools, yields);

    const result: YieldScanResult = {
      timestamp: Date.now(),
      yields,
      allPools: pools,
      bestOpportunity,
      stats,
    };

    // Cache result
    this.lastScan = result;

    // Print summary
    this.printSummary(result, Date.now() - startTime);

    return result;
  }

  /**
   * Get yields for a specific chain
   */
  async getChainYields(chainId: number): Promise<ChainYieldData | null> {
    const result = await this.scanAllChains();
    return result.yields[chainId] ?? null;
  }

  /**
   * Get the best yield opportunity
   */
  async getBestOpportunity(): Promise<YieldPool | null> {
    const result = await this.scanAllChains();
    return result.bestOpportunity;
  }

  /**
   * Compare yields between two chains
   */
  async compareChains(
    chainIdA: number,
    chainIdB: number
  ): Promise<{
    chainA: ChainYieldData | null;
    chainB: ChainYieldData | null;
    difference: number;
    betterChain: number | null;
  }> {
    const result = await this.scanAllChains();
    
    const chainA = result.yields[chainIdA] ?? null;
    const chainB = result.yields[chainIdB] ?? null;
    
    const apyA = chainA?.bestApy ?? 0;
    const apyB = chainB?.bestApy ?? 0;
    
    return {
      chainA,
      chainB,
      difference: Math.abs(apyA - apyB),
      betterChain: apyA > apyB ? chainIdA : apyB > apyA ? chainIdB : null,
    };
  }

  // ============ Private Methods ============

  private aggregateByChain(pools: YieldPool[]): ChainYields {
    const yields: ChainYields = {};

    for (const pool of pools) {
      if (!yields[pool.chainId]) {
        yields[pool.chainId] = {
          bestApy: 0,
          avgApy: 0,
          totalTvl: 0,
          poolCount: 0,
          pools: [],
          bestPool: undefined,
        };
      }

      const chainData = yields[pool.chainId];
      chainData.pools.push(pool);
      chainData.totalTvl += pool.tvlUsd;
      chainData.poolCount++;

      if (pool.apy > chainData.bestApy) {
        chainData.bestApy = pool.apy;
        chainData.bestPool = pool;
      }
    }

    // Calculate averages
    for (const chainData of Object.values(yields)) {
      if (chainData.poolCount > 0) {
        chainData.avgApy = chainData.pools.reduce((sum, p) => sum + p.apy, 0) / chainData.poolCount;
      }
    }

    return yields;
  }

  private findBestOpportunity(pools: YieldPool[]): YieldPool | null {
    if (pools.length === 0) return null;
    
    // Score pools by APY and safety
    return pools.reduce((best, pool) => {
      const bestScore = this.calculatePoolScore(best);
      const poolScore = this.calculatePoolScore(pool);
      return poolScore > bestScore ? pool : best;
    });
  }

  private calculatePoolScore(pool: YieldPool): number {
    // Weight: 70% APY, 30% safety (inverse risk)
    const apyScore = pool.apy / 20; // Normalize to 0-1 (assuming max 20% APY)
    const safetyScore = (11 - (pool.riskScore ?? 5)) / 10;
    return apyScore * 0.7 + safetyScore * 0.3;
  }

  private calculateStats(
    pools: YieldPool[],
    yields: ChainYields
  ): YieldScanResult['stats'] {
    return {
      totalPools: pools.length,
      totalTvl: pools.reduce((sum, p) => sum + p.tvlUsd, 0),
      avgApy: pools.length > 0
        ? pools.reduce((sum, p) => sum + p.apy, 0) / pools.length
        : 0,
      chainsScanned: Object.keys(yields).length,
    };
  }

  private printSummary(result: YieldScanResult, durationMs: number): void {
    console.log('\n┌────────────────────────────────────────┐');
    console.log('│           SCAN RESULTS                 │');
    console.log('├────────────────────────────────────────┤');
    console.log(`│ Pools found:     ${result.stats.totalPools.toString().padStart(6)}               │`);
    console.log(`│ Total TVL:       ${formatTvl(result.stats.totalTvl).padStart(10)}           │`);
    console.log(`│ Avg APY:         ${formatApy(result.stats.avgApy).padStart(8)}             │`);
    console.log(`│ Chains scanned:  ${result.stats.chainsScanned.toString().padStart(6)}               │`);
    console.log(`│ Scan time:       ${(durationMs / 1000).toFixed(2).padStart(6)}s              │`);
    console.log('└────────────────────────────────────────┘');

    console.log('\n📊 Best APY per Chain:');
    console.log('─'.repeat(60));
    
    const sortedChains = Object.entries(result.yields)
      .sort(([, a], [, b]) => b.bestApy - a.bestApy);
    
    for (const [chainId, data] of sortedChains) {
      const chainName = getChainName(parseInt(chainId)).padEnd(12);
      const apy = formatApy(data.bestApy).padStart(8);
      const protocol = (data.bestPool?.project ?? 'Unknown').padEnd(15);
      const tvl = formatTvl(data.totalTvl);
      
      console.log(`  ${chainName} │ ${apy} APY │ ${protocol} │ TVL: ${tvl}`);
    }
    console.log('─'.repeat(60));

    if (result.bestOpportunity) {
      console.log('\n🏆 Best Overall Opportunity:');
      console.log(`   ${result.bestOpportunity.project} on ${result.bestOpportunity.chain}`);
      console.log(`   APY: ${formatApy(result.bestOpportunity.apy)} | TVL: ${formatTvl(result.bestOpportunity.tvlUsd)}`);
      console.log(`   Risk Score: ${result.bestOpportunity.riskScore ?? 'N/A'}/10`);
    }
  }
}

// ============ Singleton Instance ============

let scannerInstance: YieldScanner | null = null;

export function getYieldScanner(config?: Partial<YieldScannerConfig>): YieldScanner {
  if (!scannerInstance) {
    scannerInstance = new YieldScanner(config);
  }
  return scannerInstance;
}

// ============ Convenience Exports ============

export { formatApy, formatTvl } from './defillama.js';
