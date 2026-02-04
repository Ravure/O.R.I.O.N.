/**
 * Yields Module - Real-time yield data from DeFiLlama and protocol subgraphs
 */

// Types
export * from './types.js';

// DeFiLlama Client
export {
  fetchAllPools,
  fetchUSDCPools,
  fetchProtocolPools,
  fetchBestPerChain,
  formatApy,
  formatTvl,
} from './defillama.js';

// Protocol Subgraphs
export {
  fetchAaveYields,
  fetchCompoundYields,
  fetchAllSubgraphYields,
  verifyYieldData,
} from './subgraphs.js';

// Main Scanner
export { YieldScanner, getYieldScanner } from './scanner.js';
