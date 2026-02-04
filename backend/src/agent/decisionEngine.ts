/**
 * ORION Decision Engine
 * 
 * Core intelligence for yield optimization and rebalancing decisions.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Position,
  Portfolio,
  RiskProfile,
  RebalanceOpportunity,
  RebalancePlan,
  DecisionResult,
  ActionType,
  AgentConfig,
} from './types.js';
import {
  RISK_PROFILES,
  getRiskProfile,
  getProtocolTier,
  isProtocolAllowed,
  SUPPORTED_CHAINS,
  SupportedChainId,
} from './config.js';
import { YieldPool } from '../yields/types.js';

export class DecisionEngine {
  private config: AgentConfig;
  private lastAnalysisTime: number = 0;
  private lastRebalanceTime: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Main analysis function - determine if rebalancing is needed
   */
  analyze(
    portfolio: Portfolio,
    yields: YieldPool[],
    options: { idleBalanceOverride?: number } = {}
  ): DecisionResult {
    const now = Date.now();
    const riskProfile = getRiskProfile(this.config.riskProfile);
    
    // Filter yields based on risk profile
    const eligiblePools = this.filterPoolsByRiskProfile(yields, riskProfile);

    if (eligiblePools.length === 0) {
      return {
        shouldAct: false,
        plan: null,
        reason: 'No eligible pools after risk filters',
        nextCheckTime: now + this.config.yieldScanIntervalMs,
      };
    }
    
    // Find opportunities
    const opportunities = this.findOpportunities(
      portfolio,
      eligiblePools,
      riskProfile,
      options.idleBalanceOverride
    );
    
    if (opportunities.length === 0) {
      return {
        shouldAct: false,
        plan: null,
        reason: `No opportunities exceed minApyDifferential (${this.config.minApyDifferential}%)`,
        nextCheckTime: now + this.config.yieldScanIntervalMs,
      };
    }

    // Sort by net benefit
    const rankedOpportunities = this.rankByNetBenefit(opportunities);
    
    // Filter to only profitable moves
    const profitableOpportunities = rankedOpportunities.filter(
      o => o.netBenefit >= this.config.minNetBenefit
    );
    
    if (profitableOpportunities.length === 0) {
      const best = rankedOpportunities[0];
      const bestNet = best ? best.netBenefit : 0;
      return {
        shouldAct: false,
        plan: null,
        reason: `No profitable opportunities found (best net: $${bestNet.toFixed(4)}/day, minNetBenefit: $${this.config.minNetBenefit}/day)`,
        nextCheckTime: now + this.config.yieldScanIntervalMs,
      };
    }
    
    // Check if we've rebalanced too recently
    const timeSinceLastRebalance = now - this.lastRebalanceTime;
    if (timeSinceLastRebalance < this.config.fullAnalysisIntervalMs) {
      const highPriorityOnly = profitableOpportunities.filter(o => o.priority >= 80);
      
      if (highPriorityOnly.length === 0) {
        return {
          shouldAct: false,
          plan: null,
          reason: `Recently rebalanced. Next analysis in ${Math.round((this.config.fullAnalysisIntervalMs - timeSinceLastRebalance) / 60000)} minutes`,
          nextCheckTime: this.lastRebalanceTime + this.config.fullAnalysisIntervalMs,
        };
      }
      
      // High priority opportunities bypass time limit
      console.log(`🔥 High-priority opportunity detected, bypassing cooldown`);
    }
    
    // Create rebalance plan
    const plan = this.createRebalancePlan(profitableOpportunities, riskProfile);
    
    this.lastAnalysisTime = now;
    
    return {
      shouldAct: true,
      plan,
      reason: `Found ${plan.opportunities.length} profitable rebalancing opportunities`,
      nextCheckTime: now + this.config.fullAnalysisIntervalMs,
    };
  }

  /**
   * Filter pools based on risk profile settings
   */
  private filterPoolsByRiskProfile(
    pools: YieldPool[],
    riskProfile: typeof RISK_PROFILES[RiskProfile]
  ): YieldPool[] {
    return pools.filter(pool => {
      // TVL check
      if (pool.tvlUsd < riskProfile.minTvl) return false;
      
      // APY range check
      if (pool.apy < riskProfile.minApy) return false;
      if (pool.apy > riskProfile.maxApy) return false;
      
      // Risk score check (if available)
      if (pool.riskScore && pool.riskScore > riskProfile.maxRiskScore) return false;
      
      // Protocol check
      const protocolName = pool.protocol || pool.project;
      if (!isProtocolAllowed(protocolName, this.config.riskProfile)) return false;
      
      return true;
    });
  }

  /**
   * Find rebalancing opportunities
   */
  private findOpportunities(
    portfolio: Portfolio,
    pools: YieldPool[],
    riskProfile: typeof RISK_PROFILES[RiskProfile],
    idleBalanceOverride?: number
  ): RebalanceOpportunity[] {
    const opportunities: RebalanceOpportunity[] = [];
    const totalValue = portfolio.totalValue || 0;
    const maxSingleTradeUsd = this.getMaxSingleTradeUsd(totalValue);
    const exposures = this.getEffectiveExposures(portfolio);
    
    // Group pools by chain for easier lookup
    const poolsByChain = new Map<number, YieldPool[]>();
    for (const pool of pools) {
      const existing = poolsByChain.get(pool.chainId) || [];
      existing.push(pool);
      poolsByChain.set(pool.chainId, existing);
    }
    
    // Find best pool per chain
    const bestByChain = new Map<number, YieldPool>();
    for (const [chainId, chainPools] of poolsByChain) {
      const sorted = [...chainPools].sort((a, b) => b.apy - a.apy);
      if (sorted.length > 0) {
        bestByChain.set(chainId, sorted[0]);
      }
    }
    
    // Overall best pool
    const allPools = [...pools].sort((a, b) => b.apy - a.apy);
    const bestOverall = allPools[0];

    // Deploy idle funds (Yellow balance or other cash-like positions)
    const computedIdle = portfolio.positions
      .filter(p => this.isIdlePosition(p))
      .reduce((sum, p) => sum + p.balance, 0);
    const idleBalance = idleBalanceOverride ?? computedIdle;

    if (idleBalance > 0 && bestOverall) {
      const depositTarget = this.pickBestDepositPool(
        allPools,
        exposures.chainExposure,
        exposures.protocolExposure,
        totalValue
      );

      if (depositTarget) {
        const amount = this.computeAllowedAmount({
          desired: idleBalance,
          maxSingleTradeUsd,
          totalValue,
          currentChainExposure: exposures.chainExposure.get(depositTarget.chainId) || 0,
          currentProtocolExposure: exposures.protocolExposure.get(depositTarget.protocol.toLowerCase()) || 0,
        });

        if (amount > 0) {
          opportunities.push(this.createOpportunity({
            fromPosition: null,
            toPool: depositTarget,
            actionType: 'deposit',
            apyGain: depositTarget.apy,
            estimatedCost: 0,
            amount,
          }));
        }
      }
    }
    
    // Check each existing position for improvement opportunities
    for (const position of portfolio.positions) {
      if (this.isIdlePosition(position)) continue;

      // Same-chain rebalance (cheaper)
      const bestOnSameChain = bestByChain.get(position.chainId);
      if (bestOnSameChain && bestOnSameChain.apy > position.currentApy) {
        const apyGain = bestOnSameChain.apy - position.currentApy;
        
        if (apyGain >= this.config.minApyDifferential) {
          const amount = Math.min(position.balance, maxSingleTradeUsd);
          if (amount > 0) {
            opportunities.push(this.createOpportunity({
              fromPosition: position,
              toPool: bestOnSameChain,
              actionType: 'rebalance',
              apyGain,
              estimatedCost: this.config.preferYellowNetwork ? 0 : 0.5,
              amount,
            }));
          }
        }
      }
      
      // Cross-chain bridge (more expensive, needs bigger APY diff)
      if (bestOverall && bestOverall.chainId !== position.chainId) {
        const apyGain = bestOverall.apy - position.currentApy;
        const minBridgeApyGain = this.config.minApyDifferential * 2; // Double for bridges
        
        if (apyGain >= minBridgeApyGain) {
          // Check chain exposure limit
          const currentExposure = exposures.chainExposure.get(bestOverall.chainId) || 0;
          const amount = this.computeAllowedAmount({
            desired: position.balance,
            maxSingleTradeUsd,
            totalValue,
            currentChainExposure: currentExposure,
            currentProtocolExposure: exposures.protocolExposure.get(bestOverall.protocol.toLowerCase()) || 0,
          });

          if (amount > 0) {
            opportunities.push(this.createOpportunity({
              fromPosition: position,
              toPool: bestOverall,
              actionType: 'bridge',
              apyGain,
              estimatedCost: this.estimateBridgeCost(amount, position.chainId, bestOverall.chainId),
              amount,
            }));
          }
        }
      }
    }
    
    // Check for new deposit opportunities (if idle funds exist)
    // This would be triggered if portfolio has unallocated balance
    
    return opportunities;
  }

  /**
   * Create a rebalance opportunity object
   */
  private createOpportunity(params: {
    fromPosition: Position | null;
    toPool: YieldPool;
    actionType: ActionType;
    apyGain: number;
    estimatedCost: number;
    amount: number;
  }): RebalanceOpportunity {
    const { fromPosition, toPool, actionType, apyGain, estimatedCost, amount } = params;
    const dailyBenefit = (amount * apyGain / 100) / 365;
    const netBenefit = dailyBenefit - (estimatedCost / 30); // Amortize cost over 30 days
    
    // Calculate priority (0-100)
    let priority = 50;
    
    // Higher APY gain = higher priority
    if (apyGain > 20) priority += 20;
    else if (apyGain > 10) priority += 10;
    
    // Lower cost = higher priority
    if (estimatedCost < 1) priority += 15;
    else if (estimatedCost < 5) priority += 5;
    
    // Same-chain preferred
    if (actionType === 'rebalance') priority += 10;
    
    // Lower protocol tier = higher priority
    const tier = getProtocolTier(toPool.project);
    if (tier === 1) priority += 15;
    else if (tier === 2) priority += 5;
    
    priority = Math.min(100, Math.max(0, priority));
    
    const chainName = SUPPORTED_CHAINS[toPool.chainId as SupportedChainId]?.name || `Chain ${toPool.chainId}`;
    
    return {
      id: uuidv4(),
      fromPosition,
      toPool: {
        chainId: toPool.chainId,
        chainName,
        protocol: toPool.protocol,
        pool: toPool.pool,
        poolAddress: toPool.poolAddress,
        symbol: toPool.symbol,
        apy: toPool.apy,
        tvl: toPool.tvlUsd,
        riskScore: toPool.riskScore || this.calculateRiskScore(toPool),
      },
      amount,
      apyGain,
      estimatedCost,
      netBenefit,
      annualizedBenefit: netBenefit * 365,
      actionType,
      reason: this.generateReason(fromPosition, toPool, apyGain, actionType),
      priority,
    };
  }

  /**
   * Generate human-readable reason for rebalance
   */
  private generateReason(
    from: Position | null,
    to: YieldPool,
    apyGain: number,
    actionType: ActionType
  ): string {
    if (!from || actionType === 'deposit') {
      const chainName = SUPPORTED_CHAINS[to.chainId as SupportedChainId]?.name || `Chain ${to.chainId}`;
      return `Deploy idle funds to ${to.project} (${chainName}) for ~${apyGain.toFixed(1)}% APY`;
    }
    if (actionType === 'bridge') {
      return `Bridge from ${from.protocol} (${from.chainName}) to ${to.project} (${SUPPORTED_CHAINS[to.chainId as SupportedChainId]?.name}) for +${apyGain.toFixed(1)}% APY`;
    }
    return `Rebalance from ${from.protocol} to ${to.project} for +${apyGain.toFixed(1)}% APY`;
  }

  /**
   * Rank opportunities by net benefit
   */
  private rankByNetBenefit(opportunities: RebalanceOpportunity[]): RebalanceOpportunity[] {
    return [...opportunities].sort((a, b) => {
      // First by priority
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Then by net benefit
      return b.netBenefit - a.netBenefit;
    });
  }

  /**
   * Create a rebalance plan from opportunities
   */
  private createRebalancePlan(
    opportunities: RebalanceOpportunity[],
    riskProfile: typeof RISK_PROFILES[RiskProfile]
  ): RebalancePlan {
    // Limit number of simultaneous rebalances
    const maxSimultaneous = 3;
    const selectedOpportunities = opportunities.slice(0, maxSimultaneous);
    
    const totalNetBenefit = selectedOpportunities.reduce((sum, o) => sum + o.netBenefit, 0);
    
    // Estimate execution time
    let estimatedTime = 0;
    for (const opp of selectedOpportunities) {
      if (opp.actionType === 'bridge') {
        estimatedTime += 15 * 60; // 15 minutes for bridge
      } else {
        estimatedTime += 30; // 30 seconds for same-chain
      }
    }
    
    return {
      id: uuidv4(),
      timestamp: Date.now(),
      opportunities: selectedOpportunities,
      totalNetBenefit,
      estimatedExecutionTime: estimatedTime,
      riskProfile: riskProfile.name,
      approved: false,
    };
  }

  /**
   * Estimate bridge cost in USD
   */
  private estimateBridgeCost(amount: number, fromChain: number, toChain: number): number {
    // Base bridge fee (typically 0.1-0.5%)
    const bridgeFeePercent = 0.25;
    const bridgeFee = amount * (bridgeFeePercent / 100);
    
    // Gas costs vary by chain
    const gasEstimates: Record<number, number> = {
      1: 5,      // Ethereum mainnet - higher
      10: 0.5,   // Optimism
      137: 0.1,  // Polygon
      42161: 0.5, // Arbitrum
      8453: 0.3, // Base
    };
    
    const fromGas = gasEstimates[fromChain] || 1;
    const toGas = gasEstimates[toChain] || 1;
    
    return bridgeFee + fromGas + toGas;
  }

  private isIdlePosition(position: Position): boolean {
    return position.protocol === 'yellow-network' || position.pool === 'state-channel';
  }

  private getEffectiveExposures(portfolio: Portfolio): {
    chainExposure: Map<number, number>;
    protocolExposure: Map<string, number>;
  } {
    const chainExposure = new Map<number, number>();
    const protocolExposure = new Map<string, number>();
    const totalValue = portfolio.totalValue || 0;

    if (totalValue <= 0) {
      return { chainExposure, protocolExposure };
    }

    for (const position of portfolio.positions) {
      if (this.isIdlePosition(position)) continue;
      const pct = position.balance / totalValue;
      chainExposure.set(position.chainId, (chainExposure.get(position.chainId) || 0) + pct);
      const protoKey = position.protocol.toLowerCase();
      protocolExposure.set(protoKey, (protocolExposure.get(protoKey) || 0) + pct);
    }

    return { chainExposure, protocolExposure };
  }

  private getMaxSingleTradeUsd(totalValue: number): number {
    if (totalValue <= 0) return 0;
    return totalValue * (this.config.maxSingleTradePercent / 100);
  }

  private computeAllowedAmount(params: {
    desired: number;
    maxSingleTradeUsd: number;
    totalValue: number;
    currentChainExposure: number;
    currentProtocolExposure: number;
  }): number {
    const {
      desired,
      maxSingleTradeUsd,
      totalValue,
      currentChainExposure,
      currentProtocolExposure,
    } = params;

    if (desired <= 0 || totalValue <= 0) return 0;

    const maxChain = Math.max(0, this.config.maxChainExposure - currentChainExposure) * totalValue;
    const maxProtocol = Math.max(0, this.config.maxProtocolExposure - currentProtocolExposure) * totalValue;

    return Math.max(
      0,
      Math.min(desired, maxSingleTradeUsd, maxChain, maxProtocol)
    );
  }

  private pickBestDepositPool(
    pools: YieldPool[],
    chainExposure: Map<number, number>,
    protocolExposure: Map<string, number>,
    totalValue: number
  ): YieldPool | null {
    for (const pool of pools) {
      const currentChainExposure = chainExposure.get(pool.chainId) || 0;
      const currentProtocolExposure = protocolExposure.get(pool.protocol.toLowerCase()) || 0;
      const maxChain = Math.max(0, this.config.maxChainExposure - currentChainExposure) * totalValue;
      const maxProtocol = Math.max(0, this.config.maxProtocolExposure - currentProtocolExposure) * totalValue;
      if (maxChain > 0 && maxProtocol > 0) {
        return pool;
      }
    }
    return null;
  }

  /**
   * Calculate risk score for a pool (1-10, higher = riskier)
   */
  private calculateRiskScore(pool: YieldPool): number {
    let score = 5;
    
    // TVL factor
    if (pool.tvlUsd > 100_000_000) score -= 2;
    else if (pool.tvlUsd > 10_000_000) score -= 1;
    else if (pool.tvlUsd < 1_000_000) score += 2;
    
    // APY factor (very high APY often = high risk)
    if (pool.apy > 100) score += 3;
    else if (pool.apy > 50) score += 1;
    else if (pool.apy < 10) score -= 1;
    
    // Protocol tier
    const tier = getProtocolTier(pool.project);
    score += (tier - 2); // tier 1 = -1, tier 2 = 0, tier 3 = +1, tier 4 = +2
    
    return Math.max(1, Math.min(10, score));
  }

  /**
   * Quick check if any high-priority opportunities exist
   */
  quickScan(yields: YieldPool[], currentBestApy: number): {
    hasHighPriority: boolean;
    bestNewApy: number;
    reason: string;
  } {
    const riskProfile = getRiskProfile(this.config.riskProfile);
    const eligible = this.filterPoolsByRiskProfile(yields, riskProfile);
    
    if (eligible.length === 0) {
      return { hasHighPriority: false, bestNewApy: 0, reason: 'No eligible pools' };
    }
    
    const bestNew = eligible.reduce((a, b) => a.apy > b.apy ? a : b);
    const apyDiff = bestNew.apy - currentBestApy;
    
    // High priority if APY improvement is > 20%
    const hasHighPriority = apyDiff >= 20;
    
    return {
      hasHighPriority,
      bestNewApy: bestNew.apy,
      reason: hasHighPriority 
        ? `Significant opportunity: ${bestNew.project} @ ${bestNew.apy.toFixed(1)}% APY (+${apyDiff.toFixed(1)}%)`
        : `Best available: ${bestNew.apy.toFixed(1)}% APY`,
    };
  }

  /**
   * Mark rebalance as executed (for cooldown tracking)
   */
  markRebalanceExecuted(): void {
    this.lastRebalanceTime = Date.now();
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }
}
