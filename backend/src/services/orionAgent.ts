/**
 * ORION Agent - Unified Service
 * Integrates Phase 1 (ENS), Phase 3 (Hook), and Phase 4 (Bridge)
 */

import { getUserProfile } from '../ens/reader.js';
import { LifiBridgeClient, CHAIN_IDS } from '../bridge/client.js';
import { YellowNetworkClient } from '../yellow/client.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

export interface YieldOpportunity {
  protocol: string;
  chain: number;
  chainName: string;
  apy: number;
  tvl: number;
  riskScore: number;
  contractAddress: string;
}

export interface PortfolioPosition {
  chain: number;
  chainName: string;
  protocol: string;
  amount: number;
  apy: number;
  valueUSD: number;
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  fromChain: number;
  toChain: number;
  amount: number;
  reason: string;
  expectedApyGain: number;
}

/**
 * Main ORION Agent Service
 * Orchestrates all phases into a unified system
 */
export class OrionAgent {
  private ensProvider: ethers.Provider;
  private bridgeClient: LifiBridgeClient;
  private yellowClient: YellowNetworkClient | null = null;

  constructor(provider: ethers.Provider) {
    this.ensProvider = provider;
    this.bridgeClient = new LifiBridgeClient();
    this.bridgeClient.setProvider(provider);
  }

  /**
   * Gets user's complete profile from ENS
   */
  async getUserProfile(ensName: string) {
    return await getUserProfile(ensName, this.ensProvider);
  }

  /**
   * Scans for yield opportunities across chains
   * This is a placeholder - will be fully implemented in Phase 5
   */
  async scanYieldOpportunities(): Promise<YieldOpportunity[]> {
    // Mock data for now - Phase 5 will implement real scanning
    return [
      {
        protocol: 'Aave',
        chain: CHAIN_IDS.SEPOLIA,
        chainName: 'Sepolia',
        apy: 3.5,
        tvl: 1000000,
        riskScore: 2,
        contractAddress: '0x...',
      },
      {
        protocol: 'Aave',
        chain: CHAIN_IDS.BASE_SEPOLIA,
        chainName: 'Base Sepolia',
        apy: 5.2,
        tvl: 500000,
        riskScore: 2,
        contractAddress: '0x...',
      },
      {
        protocol: 'Compound',
        chain: CHAIN_IDS.ARBITRUM_SEPOLIA,
        chainName: 'Arbitrum Sepolia',
        apy: 4.8,
        tvl: 750000,
        riskScore: 3,
        contractAddress: '0x...',
      },
    ];
  }

  /**
   * Gets current portfolio positions
   * This is a placeholder - will read from on-chain in Phase 5
   */
  async getPortfolioPositions(userAddress: string): Promise<PortfolioPosition[]> {
    // Mock data for now
    return [
      {
        chain: CHAIN_IDS.SEPOLIA,
        chainName: 'Sepolia',
        protocol: 'Aave',
        amount: 1000,
        apy: 3.5,
        valueUSD: 1000,
      },
    ];
  }

  /**
   * Decides if rebalancing is needed based on yield opportunities
   * Implements the >2% APY improvement rule
   */
  async shouldRebalance(
    ensName: string,
    currentPositions: PortfolioPosition[],
    opportunities: YieldOpportunity[]
  ): Promise<RebalanceDecision> {
    // Get user's risk profile
    const profile = await this.getUserProfile(ensName);
    if (!profile) {
      return {
        shouldRebalance: false,
        fromChain: 0,
        toChain: 0,
        amount: 0,
        reason: 'No ENS profile found',
        expectedApyGain: 0,
      };
    }

    // Calculate current weighted APY
    const totalValue = currentPositions.reduce((sum, pos) => sum + pos.valueUSD, 0);
    if (totalValue === 0) {
      return {
        shouldRebalance: false,
        fromChain: 0,
        toChain: 0,
        amount: 0,
        reason: 'No positions to rebalance',
        expectedApyGain: 0,
      };
    }

    const currentWeightedApy = currentPositions.reduce(
      (sum, pos) => sum + (pos.apy * pos.valueUSD) / totalValue,
      0
    );

    // Find best opportunity
    const bestOpportunity = opportunities
      .filter((opp) => opp.riskScore <= this.getRiskThreshold(profile.riskProfile))
      .sort((a, b) => b.apy - a.apy)[0];

    if (!bestOpportunity) {
      return {
        shouldRebalance: false,
        fromChain: 0,
        toChain: 0,
        amount: 0,
        reason: 'No suitable opportunities found',
        expectedApyGain: 0,
      };
    }

    // Check if improvement is >2%
    const apyImprovement = bestOpportunity.apy - currentWeightedApy;

    if (apyImprovement > 0.02) {
      // Find position to move from (simplified: use largest position)
      const largestPosition = currentPositions.sort(
        (a, b) => b.valueUSD - a.valueUSD
      )[0];

      return {
        shouldRebalance: true,
        fromChain: largestPosition.chain,
        toChain: bestOpportunity.chain,
        amount: largestPosition.valueUSD,
        reason: `${(apyImprovement * 100).toFixed(2)}% APY improvement on ${bestOpportunity.chainName}`,
        expectedApyGain: apyImprovement,
      };
    }

    return {
      shouldRebalance: false,
      fromChain: 0,
      toChain: 0,
      amount: 0,
      reason: `APY improvement (${(apyImprovement * 100).toFixed(2)}%) below 2% threshold`,
      expectedApyGain: apyImprovement,
    };
  }

  /**
   * Executes a rebalancing bridge
   */
  async executeRebalance(
    decision: RebalanceDecision,
    userAddress: string,
    signer: ethers.Signer
  ): Promise<{
    txHash: string;
    route: any;
  }> {
    if (!decision.shouldRebalance) {
      throw new Error('Cannot execute rebalance: decision indicates no rebalancing needed');
    }

    // Convert amount to wei (USDC has 6 decimals)
    const amount = ethers.parseUnits(decision.amount.toString(), 6).toString();

    // Get bridge route
    const route = await this.bridgeClient.getBestBridgeRoute(
      decision.fromChain,
      decision.toChain,
      amount,
      userAddress,
      0.005 // 0.5% slippage
    );

    // Execute bridge
    const result = await this.bridgeClient.executeBridge(route, signer);

    return result;
  }

  /**
   * Gets risk threshold based on risk profile
   */
  private getRiskThreshold(riskProfile: 'low' | 'medium' | 'high' | null): number {
    switch (riskProfile) {
      case 'low':
        return 3; // Only protocols with risk score 1-3
      case 'medium':
        return 6; // Risk score 1-6
      case 'high':
        return 10; // All protocols
      default:
        return 5; // Default to medium
    }
  }

  /**
   * Initializes Yellow Network client for zero-fee trading
   */
  async initializeYellowNetwork(privateKey?: string): Promise<void> {
    this.yellowClient = new YellowNetworkClient(privateKey);
  }

  /**
   * Gets Yellow Network client
   */
  getYellowClient(): YellowNetworkClient | null {
    return this.yellowClient;
  }
}
