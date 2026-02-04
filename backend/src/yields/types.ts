/**
 * Yield Scanner Type Definitions
 * Interfaces for yield data from DeFiLlama and protocol subgraphs
 */

// ============ Yield Pool Data ============

export interface YieldPool {
  /** Pool unique identifier (from DeFiLlama) */
  pool: string;
  
  /** Protocol name (e.g., "aave-v3", "compound-v3") */
  protocol: string;
  
  /** Project display name */
  project: string;
  
  /** Chain name (e.g., "Ethereum", "Base") */
  chain: string;
  
  /** Chain ID for EVM chains */
  chainId: number;
  
  /** Token symbol (e.g., "USDC") */
  symbol: string;
  
  /** Total Value Locked in USD */
  tvlUsd: number;
  
  /** Total APY (base + reward) */
  apy: number;
  
  /** Base APY (lending/supply rate) */
  apyBase: number;
  
  /** Reward APY (token incentives) */
  apyReward: number;
  
  /** 7-day average APY */
  apyMean7d?: number;
  
  /** Pool status */
  status?: 'active' | 'paused' | 'deprecated';
  
  /** Risk score (1-10, lower is safer) */
  riskScore?: number;
  
  /** Contract address */
  poolAddress?: string;
  
  /** Last updated timestamp */
  updatedAt?: string;
}

// ============ Chain Aggregated Data ============

export interface ChainYieldData {
  /** Best APY available on this chain */
  bestApy: number;
  
  /** Average APY across all pools */
  avgApy: number;
  
  /** Total TVL on this chain */
  totalTvl: number;
  
  /** Number of pools */
  poolCount: number;
  
  /** All USDC pools on this chain */
  pools: YieldPool[];
  
  /** Best pool details */
  bestPool?: YieldPool;
}

export interface ChainYields {
  [chainId: number]: ChainYieldData;
}

// ============ Scanner Configuration ============

export interface YieldScannerConfig {
  /** Minimum TVL to consider (default: $100k) */
  minTvlUsd?: number;
  
  /** Minimum APY to consider (default: 0%) */
  minApy?: number;

  /** Maximum APY to consider (default: unlimited) */
  maxApy?: number;
  
  /** Maximum risk score to consider (default: 7) */
  maxRiskScore?: number;

  /** Only include stablecoin pools */
  stablecoinOnly?: boolean;
  
  /** Only include these protocols (if specified) */
  includeProtocols?: string[];
  
  /** Exclude these protocols */
  excludeProtocols?: string[];
  
  /** Only include these chains (by chain ID) */
  chainIds?: number[];
}

// ============ DeFiLlama API Response ============

export interface DeFiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number | null;
  rewardTokens: string[] | null;
  pool_old?: string;
  apyPct1D?: number | null;
  apyPct7D?: number | null;
  apyPct30D?: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
  mu?: number;
  sigma?: number;
  count?: number;
  outlier?: boolean;
  underlyingTokens?: string[];
  il7d?: number | null;
  apyBase7d?: number | null;
  apyMean30d?: number | null;
  volumeUsd1d?: number | null;
  volumeUsd7d?: number | null;
  apyBaseInception?: number | null;
}

export interface DeFiLlamaResponse {
  status: string;
  data: DeFiLlamaPool[];
}

// ============ Subgraph Types ============

export interface AaveReserve {
  id: string;
  symbol: string;
  liquidityRate: string;
  variableBorrowRate: string;
  stableBorrowRate: string;
  totalLiquidity: string;
  availableLiquidity: string;
}

export interface CompoundMarket {
  id: string;
  symbol: string;
  supplyRate: string;
  borrowRate: string;
  totalSupply: string;
  cash: string;
}

// ============ Scanner Result ============

export interface YieldScanResult {
  /** Timestamp of the scan */
  timestamp: number;
  
  /** Yields grouped by chain */
  yields: ChainYields;
  
  /** All pools found */
  allPools: YieldPool[];
  
  /** Best overall opportunity */
  bestOpportunity: YieldPool | null;
  
  /** Summary statistics */
  stats: {
    totalPools: number;
    totalTvl: number;
    avgApy: number;
    chainsScanned: number;
  };
}

// ============ Error Types ============

export class YieldScanError extends Error {
  constructor(
    message: string,
    public source: 'defillama' | 'subgraph' | 'unknown',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'YieldScanError';
  }
}
