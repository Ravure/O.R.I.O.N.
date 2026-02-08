import { getRoutes, executeRoute, getActiveRoute, type Route, type RouteRequest } from '@lifi/sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

/**
 * Chain IDs for supported networks
 */
export const CHAIN_IDS = {
  ETHEREUM: 1,
  SEPOLIA: 11155111,
  BASE: 8453,
  BASE_SEPOLIA: 84532,
  ARBITRUM: 42161,
  ARBITRUM_SEPOLIA: 421614,
  POLYGON: 137,
  POLYGON_AMOY: 80002,
} as const;

/**
 * USDC token addresses by chain
 */
export const USDC_ADDRESSES: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [CHAIN_IDS.SEPOLIA]: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
  [CHAIN_IDS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [CHAIN_IDS.BASE_SEPOLIA]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
  [CHAIN_IDS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: '0x75faf114eafb1BDbe2F0316DF893fd58cE9c1c4C', // Arbitrum Sepolia USDC
  [CHAIN_IDS.POLYGON]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  [CHAIN_IDS.POLYGON_AMOY]: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582', // Polygon Amoy USDC
};

/**
 * LI.FI Bridge Client for cross-chain asset transfers
 * Uses LI.FI SDK functions directly (no class instantiation needed)
 */
export class LifiBridgeClient {
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;

  constructor() {
    // LI.FI SDK exports functions directly, no initialization needed
  }

  /**
   * Sets the provider and signer for executing transactions
   */
  setProvider(provider: ethers.Provider, signer?: ethers.Signer) {
    this.provider = provider;
    if (signer) {
      this.signer = signer;
    }
  }

  /**
   * Gets the best bridge route between two chains
   * @param fromChain - Source chain ID
   * @param toChain - Destination chain ID
   * @param amount - Amount in wei (as string)
   * @param userAddress - User's wallet address
   * @param slippage - Maximum slippage (default: 0.5%)
   */
  async getBestBridgeRoute(
    fromChain: number,
    toChain: number,
    amount: string,
    userAddress: string,
    slippage: number = 0.005
  ): Promise<Route> {
    const fromToken = USDC_ADDRESSES[fromChain];
    const toToken = USDC_ADDRESSES[toChain];

    if (!fromToken || !toToken) {
      throw new Error(
        `USDC not supported on chain ${fromChain} or ${toChain}`
      );
    }

    const routeRequest: RouteRequest = {
      fromChainId: fromChain,
      toChainId: toChain,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount: amount,
      fromAddress: userAddress,
      toAddress: userAddress,
      options: {
        slippage,
        order: 'RECOMMENDED', // Balance of speed + cost
        allowBridges: ['stargate', 'across', 'hop', 'socket'],
      },
    };

    try {
      const routes = await getRoutes(routeRequest);
      
      if (!routes || routes.length === 0) {
        throw new Error('No routes found');
      }

      // Return the best route (first one is usually the best)
      return routes[0];
    } catch (error) {
      console.error('Failed to get bridge route:', error);
      throw error;
    }
  }

  /**
   * Executes a bridge transaction
   * @param route - The route to execute
   * @param signer - Ethers signer for signing transactions
   */
  async executeBridge(
    route: Route,
    signer: ethers.Signer
  ): Promise<{
    txHash: string;
    route: Route;
  }> {
    try {
      // Execute the route using LI.FI SDK function
      await executeRoute(signer, route);

      // Get the active route to find transaction hash
      const activeRoute = await getActiveRoute(route.id);
      
      return {
        txHash: activeRoute?.txHash || route.steps[0]?.transactionRequest?.hash || 'pending',
        route,
      };
    } catch (error) {
      console.error('Bridge execution failed:', error);
      throw error;
    }
  }

  /**
   * Gets bridge status
   * @param txHash - Transaction hash
   * @param fromChain - Source chain ID
   * @param toChain - Destination chain ID
   * @param bridgeName - Name of the bridge (optional)
   */
  async getBridgeStatus(
    routeId: string
  ): Promise<any> {
    try {
      // Use getActiveRoute to check status
      const activeRoute = await getActiveRoute(routeId);
      return activeRoute;
    } catch (error) {
      console.error('Failed to get bridge status:', error);
      throw error;
    }
  }

  /**
   * Waits for bridge completion
   * @param txHash - Bridge transaction hash
   * @param fromChain - Source chain ID
   * @param toChain - Destination chain ID
   * @param maxWaitTime - Maximum wait time in seconds (default: 5 minutes)
   */
  async waitForBridgeCompletion(
    routeId: string,
    maxWaitTime: number = 300
  ): Promise<boolean> {
    const maxAttempts = Math.floor(maxWaitTime / 5); // Check every 5 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const status = await this.getBridgeStatus(routeId);

        if (status?.status === 'DONE') {
          console.log('✅ Bridge completed!');
          return true;
        } else if (status?.status === 'FAILED') {
          throw new Error('Bridge failed');
        }

        // Wait 5 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      } catch (error: any) {
        if (error.message === 'Bridge failed') {
          throw error;
        }
        // Continue polling on other errors
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    throw new Error('Bridge timeout');
  }

  /**
   * Detects the best chain based on yield opportunities
   * This is a placeholder - will be integrated with Phase 5 (AI Agent)
   * @param currentChain - Current chain ID
   * @param opportunities - Array of yield opportunities per chain
   */
  detectBestChain(
    currentChain: number,
    opportunities: Array<{ chain: number; apy: number }>
  ): number | null {
    const currentOpportunity = opportunities.find(
      (opp) => opp.chain === currentChain
    );

    if (!currentOpportunity) {
      return null;
    }

    // Find chain with >2% APY improvement
    const bestOpportunity = opportunities
      .filter((opp) => opp.apy > currentOpportunity.apy + 0.02)
      .sort((a, b) => b.apy - a.apy)[0];

    return bestOpportunity ? bestOpportunity.chain : null;
  }

  /**
   * Formats route details for display
   */
  formatRouteDetails(route: Route): string {
    const steps = route.steps;
    const totalTime = steps.reduce((sum, step) => sum + (step.estimate.executionDuration || 0), 0);
    const totalCost = steps.reduce((sum, step) => sum + parseFloat(step.estimate.gasCosts?.[0]?.amountUSD || '0'), 0);

    return `
Route Details:
  From: ${route.fromChain.name} → To: ${route.toChain.name}
  Amount: ${route.fromAmount} ${route.fromToken.symbol}
  Estimated Time: ${Math.floor(totalTime / 60)} minutes
  Estimated Cost: $${totalCost.toFixed(2)}
  Steps: ${steps.length}
  Bridges: ${steps.map(s => s.toolDetails.name).join(' → ')}
    `;
  }
}
