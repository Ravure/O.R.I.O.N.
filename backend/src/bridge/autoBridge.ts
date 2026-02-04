/**
 * Auto-Bridge Logic
 * Decides when to bridge assets based on yield differentials and risk parameters
 */

import { 
  BridgeAction, 
  Portfolio, 
  PortfolioPosition,
  SupportedChain,
  BridgeQuoteRequest,
} from './types.js';
import { 
  SUPPORTED_CHAINS, 
  AUTO_BRIDGE_CONFIG, 
  getUsdcAddress,
  getChainName,
} from './config.js';
import { getLiFiClient } from './lifi.js';
import type { ChainYields } from '../yields/types.js';

// ============ Auto Bridger ============

export class AutoBridger {
  private yieldThreshold: number;
  private maxChainExposure: number;
  private minBridgeAmountUsd: number;
  private maxBridgeFeePercent: number;

  constructor(config: Partial<typeof AUTO_BRIDGE_CONFIG> = {}) {
    this.yieldThreshold = config.minApyDifferential ?? AUTO_BRIDGE_CONFIG.minApyDifferential;
    this.maxChainExposure = config.maxChainExposure ?? AUTO_BRIDGE_CONFIG.maxChainExposure;
    this.minBridgeAmountUsd = config.minBridgeAmountUsd ?? AUTO_BRIDGE_CONFIG.minBridgeAmountUsd;
    this.maxBridgeFeePercent = config.maxBridgeFeePercent ?? AUTO_BRIDGE_CONFIG.maxBridgeFeePercent;
  }

  /**
   * Analyze portfolio and yields to determine if bridging is needed
   */
  async checkAndBridge(
    portfolio: Portfolio,
    yields: ChainYields
  ): Promise<BridgeAction | null> {
    console.log('\n[AutoBridge] Analyzing portfolio for optimization opportunities...');
    
    // 1. Check for yield optimization opportunity
    const yieldAction = this.checkYieldOptimization(portfolio, yields);
    if (yieldAction) {
      console.log(`[AutoBridge] 🎯 Found yield opportunity: ${yieldAction.reason}`);
      return yieldAction;
    }

    // 2. Check for chain concentration risk
    const diversifyAction = this.checkConcentrationRisk(portfolio, yields);
    if (diversifyAction) {
      console.log(`[AutoBridge] ⚠️ Found concentration risk: ${diversifyAction.reason}`);
      return diversifyAction;
    }

    console.log('[AutoBridge] ✓ Portfolio is optimized, no action needed');
    return null;
  }

  /**
   * Check if there's a better yield opportunity on another chain
   */
  private checkYieldOptimization(
    portfolio: Portfolio,
    yields: ChainYields
  ): BridgeAction | null {
    // Find current chain's yield
    const currentPosition = this.getLargestPosition(portfolio);
    if (!currentPosition) return null;

    const currentYield = yields[currentPosition.chainId]?.bestApy ?? 0;
    const currentChain = currentPosition.chain;

    console.log(`[AutoBridge] Current position: ${getChainName(currentPosition.chainId)} @ ${currentYield.toFixed(2)}% APY`);

    // Find the best yield across all chains
    let bestChain: SupportedChain | null = null;
    let bestYield = currentYield;
    let bestChainId = 0;

    for (const [chainId, data] of Object.entries(yields)) {
      const chainIdNum = parseInt(chainId);
      if (data.bestApy > bestYield) {
        bestYield = data.bestApy;
        bestChainId = chainIdNum;
        // Map chainId to chain name
        for (const [name, config] of Object.entries(SUPPORTED_CHAINS)) {
          if (config.chainId === chainIdNum) {
            bestChain = name as SupportedChain;
            break;
          }
        }
      }
    }

    // Check if the improvement exceeds threshold
    const yieldDiff = bestYield - currentYield;
    if (bestChain && yieldDiff > this.yieldThreshold) {
      const improvement = yieldDiff.toFixed(2);
      console.log(`[AutoBridge] Better opportunity: ${getChainName(bestChainId)} @ ${bestYield.toFixed(2)}% APY (+${improvement}%)`);

      return {
        type: 'YIELD_OPTIMIZATION',
        fromChain: currentChain,
        toChain: bestChain,
        amount: currentPosition.balance,
        reason: `${improvement}% APY improvement (${currentYield.toFixed(2)}% → ${bestYield.toFixed(2)}%)`,
        expectedApyImprovement: yieldDiff,
      };
    }

    return null;
  }

  /**
   * Check if portfolio is too concentrated on a single chain
   */
  private checkConcentrationRisk(
    portfolio: Portfolio,
    yields: ChainYields
  ): BridgeAction | null {
    const exposure = this.calculateChainExposure(portfolio);
    
    console.log('[AutoBridge] Chain exposure:');
    for (const [chain, pct] of Object.entries(exposure)) {
      console.log(`  ${chain}: ${(pct * 100).toFixed(1)}%`);
    }

    // Find chains that exceed maximum exposure
    for (const [chain, pct] of Object.entries(exposure)) {
      if (pct > this.maxChainExposure) {
        const targetChain = this.findDiversificationTarget(chain as SupportedChain, exposure, yields);
        if (targetChain) {
          // Bridge 25% of the overexposed amount
          const overExposure = pct - this.maxChainExposure;
          const amountToMove = portfolio.totalValueUsd * overExposure * 0.25;

          return {
            type: 'DIVERSIFICATION',
            fromChain: chain as SupportedChain,
            toChain: targetChain,
            amount: amountToMove.toFixed(2),
            reason: `Chain concentration risk: ${chain} at ${(pct * 100).toFixed(1)}% (max: ${(this.maxChainExposure * 100).toFixed(1)}%)`,
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate exposure percentage per chain
   */
  private calculateChainExposure(portfolio: Portfolio): Record<string, number> {
    const exposure: Record<string, number> = {};
    
    if (portfolio.totalValueUsd === 0) return exposure;

    for (const position of portfolio.positions) {
      const chain = position.chain;
      exposure[chain] = (exposure[chain] || 0) + (position.balanceUsd / portfolio.totalValueUsd);
    }

    return exposure;
  }

  /**
   * Find the best chain to diversify into
   */
  private findDiversificationTarget(
    fromChain: SupportedChain,
    exposure: Record<string, number>,
    yields: ChainYields
  ): SupportedChain | null {
    let bestTarget: SupportedChain | null = null;
    let bestScore = -Infinity;

    for (const [name, config] of Object.entries(SUPPORTED_CHAINS)) {
      const chain = name as SupportedChain;
      if (chain === fromChain) continue;

      const currentExposure = exposure[chain] || 0;
      const chainYield = yields[config.chainId]?.bestApy ?? 0;

      // Score = yield - current exposure (prefer high yield, low exposure)
      const score = chainYield - currentExposure;
      
      if (score > bestScore) {
        bestScore = score;
        bestTarget = chain;
      }
    }

    return bestTarget;
  }

  /**
   * Get the largest position in the portfolio
   */
  private getLargestPosition(portfolio: Portfolio): PortfolioPosition | null {
    if (portfolio.positions.length === 0) return null;
    return portfolio.positions.reduce((max, pos) => 
      pos.balanceUsd > max.balanceUsd ? pos : max
    );
  }

  /**
   * Validate that a bridge action makes economic sense
   */
  async validateBridgeEconomics(action: BridgeAction): Promise<boolean> {
    const client = getLiFiClient();
    const fromConfig = SUPPORTED_CHAINS[action.fromChain];
    const toConfig = SUPPORTED_CHAINS[action.toChain];

    // Get a quote to check fees
    const quoteRequest: BridgeQuoteRequest = {
      fromChainId: fromConfig.chainId,
      toChainId: toConfig.chainId,
      fromToken: fromConfig.usdc,
      toToken: toConfig.usdc,
      amount: action.amount,
      userAddress: '0x0000000000000000000000000000000000000000', // Placeholder for quote
    };

    try {
      const quote = await client.getQuote(quoteRequest);
      const feePercent = parseFloat(quote.estimatedGas) / parseFloat(action.amount);

      console.log(`[AutoBridge] Estimated bridge fee: $${quote.estimatedGas} (${(feePercent * 100).toFixed(2)}%)`);

      if (feePercent > this.maxBridgeFeePercent) {
        console.log(`[AutoBridge] ❌ Bridge fee too high (max: ${(this.maxBridgeFeePercent * 100).toFixed(2)}%)`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AutoBridge] Failed to validate bridge economics:', error);
      return false;
    }
  }
}

// ============ Export Singleton ============

let autoBridgerInstance: AutoBridger | null = null;

export function getAutoBridger(config?: Partial<typeof AUTO_BRIDGE_CONFIG>): AutoBridger {
  if (!autoBridgerInstance) {
    autoBridgerInstance = new AutoBridger(config);
  }
  return autoBridgerInstance;
}
