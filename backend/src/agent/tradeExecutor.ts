/**
 * ORION Trade Executor
 * 
 * Executes rebalancing decisions through Yellow Network or LI.FI bridges.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  RebalancePlan,
  RebalanceOpportunity,
  TradeExecution,
  ExecutionResult,
  ExecutionStatus,
  AgentConfig,
} from './types.js';
import { ClearNodeClient } from '../yellow/clearnode.js';
import { LiFiBridgeClient } from '../bridge/lifi.js';
import { PortfolioTracker } from './portfolioTracker.js';
import { YieldExecutionEngine } from '../execution/yieldExecution.js';
import { getUsdcAddress } from '../bridge/config.js';

export class TradeExecutor {
  private config: AgentConfig;
  private yellowClient: ClearNodeClient | null = null;
  private bridgeClient: LiFiBridgeClient;
  private portfolioTracker: PortfolioTracker;
  private isConnected: boolean = false;
  private executionHistory: TradeExecution[] = [];
  private yieldEngine: YieldExecutionEngine;

  // Yellow Network budgeting (ytest.usd has 6 decimals)
  private static readonly YELLOW_ASSET = 'ytest.usd';
  private static readonly YELLOW_DECIMALS = 1_000_000n;
  private static readonly SAFETY_BUFFER_MICRO = 5_000n; // 0.005 ytest.usd

  constructor(
    config: AgentConfig,
    portfolioTracker: PortfolioTracker,
    yellowPrivateKey?: string
  ) {
    this.config = config;
    this.portfolioTracker = portfolioTracker;
    this.bridgeClient = new LiFiBridgeClient();
    this.yieldEngine = new YieldExecutionEngine();
    
    if (yellowPrivateKey) {
      this.yellowClient = new ClearNodeClient(yellowPrivateKey);
    }
  }

  /**
   * Connect to Yellow Network
   */
  async connect(): Promise<void> {
    if (!this.yellowClient) {
      throw new Error('Yellow Network client not initialized (missing private key)');
    }
    
    try {
      await this.yellowClient.connect();
      await this.yellowClient.authenticate();
      this.isConnected = true;
      console.log('✅ Connected to Yellow Network');
    } catch (error: any) {
      console.error('❌ Failed to connect to Yellow Network:', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from Yellow Network
   */
  disconnect(): void {
    if (this.yellowClient) {
      this.yellowClient.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Execute a full rebalance plan
   */
  async executePlan(plan: RebalancePlan): Promise<ExecutionResult> {
    const executions: TradeExecution[] = [];
    const errors: string[] = [];
    let totalCost = 0;
    let totalReceived = 0;

    console.log(`\n🚀 Executing rebalance plan with ${plan.opportunities.length} opportunities`);

    // If we are executing via Yellow Network, clamp spend to available on-ledger balance.
    // Note: In this repo the Yellow transfer is the "real execution" primitive; portfolio balances are simulated USD.
    let remainingMicro: bigint | null = null;
    if (this.yellowClient && this.isConnected) {
      try {
        const available = await this.getAvailableYellowAssetMicro(TradeExecutor.YELLOW_ASSET);
        remainingMicro = available > TradeExecutor.SAFETY_BUFFER_MICRO
          ? available - TradeExecutor.SAFETY_BUFFER_MICRO
          : 0n;
        console.log(
          `   💛 Yellow balance: ${(available / TradeExecutor.YELLOW_DECIMALS).toString()}.${(available % TradeExecutor.YELLOW_DECIMALS).toString().padStart(6, '0')} ${TradeExecutor.YELLOW_ASSET}`
        );
        console.log(
          `   🧾 Spendable (after buffer): ${(remainingMicro / TradeExecutor.YELLOW_DECIMALS).toString()}.${(remainingMicro % TradeExecutor.YELLOW_DECIMALS).toString().padStart(6, '0')} ${TradeExecutor.YELLOW_ASSET}`
        );
      } catch (e: any) {
        console.warn(`   ⚠️ Could not fetch Yellow balance for budgeting: ${e?.message || e}`);
      }
    }
    
    for (let i = 0; i < plan.opportunities.length; i++) {
      const opportunity = plan.opportunities[i];
      console.log(`\n📊 Executing ${i + 1}/${plan.opportunities.length}: ${opportunity.reason}`);
      
      try {
        let oppToExecute = opportunity;

        // Clamp rebalance transfers to available Yellow funds to avoid "insufficient funds" from rounding/over-allocation.
        if (remainingMicro !== null && opportunity.actionType !== 'bridge') {
          const desiredMicro = BigInt(Math.floor(opportunity.amount * 1_000_000));
          const spendMicro = desiredMicro <= remainingMicro ? desiredMicro : remainingMicro;

          if (spendMicro <= 0n) {
            throw new Error(`Insufficient Yellow balance remaining for ${TradeExecutor.YELLOW_ASSET}`);
          }

          const spendAmount = Number(spendMicro) / 1_000_000;
          oppToExecute = { ...opportunity, amount: spendAmount };
          remainingMicro = remainingMicro - spendMicro;
        }

        const execution = await this.executeOpportunity(oppToExecute);
        executions.push(execution);
        
        if (execution.status === 'completed') {
          totalCost += execution.actualCost;
          totalReceived += execution.actualReceived || 0;
          
          // Update portfolio
          this.portfolioTracker.recordTrade({
            positionId: opportunity.fromPosition?.id,
            actionType: opportunity.actionType as any,
            fromChain: opportunity.fromPosition?.chainId,
            toChain: opportunity.toPool.chainId,
            fromProtocol: opportunity.fromPosition?.protocol,
            toProtocol: opportunity.toPool.protocol,
            amount: oppToExecute.amount,
            cost: execution.actualCost,
          });

          // Add destination position so funds remain "owned" by the same wallet in our portfolio model.
          // (The actual on-chain ownership remains the same EVM address when yield deposit is used.)
          this.portfolioTracker.addPosition({
            chainId: opportunity.toPool.chainId,
            protocol: opportunity.toPool.protocol,
            pool: opportunity.toPool.pool,
            symbol: opportunity.toPool.symbol,
            balance: execution.amount,
            apy: opportunity.toPool.apy,
          });
          
          console.log(`   ✅ Completed: Cost $${execution.actualCost.toFixed(2)}, Received $${(execution.actualReceived || 0).toFixed(2)}`);
        } else {
          errors.push(execution.error || 'Unknown error');
          console.log(`   ❌ Failed: ${execution.error}`);
        }
      } catch (error: any) {
        const execution: TradeExecution = {
          id: uuidv4(),
          opportunityId: opportunity.id,
          actionType: opportunity.actionType,
          status: 'failed',
          fromChain: opportunity.fromPosition?.chainId || 0,
          toChain: opportunity.toPool.chainId,
          amount: opportunity.amount,
          txHashes: [],
          startTime: Date.now(),
          endTime: Date.now(),
          actualCost: 0,
          error: error.message,
        };
        
        executions.push(execution);
        errors.push(error.message);
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Store execution history
    this.executionHistory.push(...executions);

    const successCount = executions.filter(e => e.status === 'completed').length;
    console.log(`\n📋 Execution complete: ${successCount}/${executions.length} successful`);

    return {
      success: errors.length === 0,
      executions,
      totalCost,
      totalReceived,
      errors,
    };
  }

  /**
   * Execute a single opportunity
   */
  private async executeOpportunity(opportunity: RebalanceOpportunity): Promise<TradeExecution> {
    const execution: TradeExecution = {
      id: uuidv4(),
      opportunityId: opportunity.id,
      actionType: opportunity.actionType,
      status: 'pending',
      fromChain: opportunity.fromPosition?.chainId || 0,
      toChain: opportunity.toPool.chainId,
      amount: opportunity.amount,
      txHashes: [],
      startTime: Date.now(),
      actualCost: 0,
    };

    try {
      execution.status = 'executing';
      
      if (opportunity.actionType === 'bridge') {
        // Cross-chain bridge via LI.FI
        return await this.executeBridge(execution, opportunity);
      } else {
        // Prefer on-chain yield deposit if possible; fall back to Yellow transfer.
        const canOnChain = await this.canExecuteOnChainDeposit(opportunity);
        if (canOnChain) {
          return await this.executeOnChainYieldDeposit(execution, opportunity);
        }
        return await this.executeYellowTransfer(execution, opportunity);
      }
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
      return execution;
    }
  }

  private async canExecuteOnChainDeposit(opportunity: RebalanceOpportunity): Promise<boolean> {
    // Needs a pool contract address from yield data
    const poolAddress = (opportunity as any)?.toPool?.poolAddress ?? undefined;
    // Our opportunity.toPool doesn't currently carry poolAddress; try to detect from pool id string.
    // If pool id contains a 0x... address, we can attempt ERC4626 validation.
    const addrMatch = (opportunity.toPool.pool || '').match(/0x[a-fA-F0-9]{40}/);
    const inferred = addrMatch ? addrMatch[0] : undefined;
    const pool = {
      pool: opportunity.toPool.pool,
      project: opportunity.toPool.protocol,
      protocol: opportunity.toPool.protocol,
      chain: opportunity.toPool.chainName,
      chainId: opportunity.toPool.chainId,
      symbol: opportunity.toPool.symbol,
      tvlUsd: opportunity.toPool.tvl,
      apy: opportunity.toPool.apy,
      apyBase: opportunity.toPool.apy,
      apyReward: 0,
      poolAddress: poolAddress || inferred,
    };

    const check = await this.yieldEngine.isDepositable(pool as any);
    return check.ok;
  }

  private async executeOnChainYieldDeposit(
    execution: TradeExecution,
    opportunity: RebalanceOpportunity
  ): Promise<TradeExecution> {
    console.log(`   ⛓️ Executing on-chain yield deposit (keeps ownership)`);

    const addrMatch = (opportunity.toPool.pool || '').match(/0x[a-fA-F0-9]{40}/);
    const inferred = addrMatch ? addrMatch[0] : undefined;

    const pool: any = {
      pool: opportunity.toPool.pool,
      project: opportunity.toPool.protocol,
      protocol: opportunity.toPool.protocol,
      chain: opportunity.toPool.chainName,
      chainId: opportunity.toPool.chainId,
      symbol: opportunity.toPool.symbol,
      tvlUsd: opportunity.toPool.tvl,
      apy: opportunity.toPool.apy,
      apyBase: opportunity.toPool.apy,
      apyReward: 0,
      poolAddress: inferred,
    };

    const res = await this.yieldEngine.depositMaxIntoPool({
      pool,
      chainId: opportunity.toPool.chainId,
      amountUsd: opportunity.amount,
    });

    execution.status = 'completed';
    execution.actualCost = 0; // not yet accounting gas in USD
    execution.actualReceived = opportunity.amount;
    execution.txHashes.push(res.txHash);
    execution.endTime = Date.now();

    console.log(`   ✅ On-chain deposit via ${res.adapter}: ${res.txHash}`);
    return execution;
  }

  /**
   * Execute transfer via Yellow Network (zero fees)
   */
  private async executeYellowTransfer(
    execution: TradeExecution,
    opportunity: RebalanceOpportunity
  ): Promise<TradeExecution> {
    if (!this.yellowClient || !this.isConnected) {
      throw new Error('Yellow Network not connected');
    }

    console.log(`   💛 Executing via Yellow Network (zero gas)`);
    
    // Convert amount to Yellow Network format (6 decimals).
    // IMPORTANT: Use floor() to avoid overshooting ledger balance by a few micros.
    const amountMicro = Math.floor(opportunity.amount * 1_000_000);
    if (amountMicro <= 0) {
      throw new Error('Transfer amount too small after rounding');
    }
    const amount = amountMicro.toString();
    
    // For demo, we'll transfer to a recipient address
    // In production, this would be a swap or deposit operation
    const recipient = process.env.TRADE_RECIPIENT || '0xf768b3889cA6DE670a8a3bda98789Eb93a6Ed7ca';
    
    const result = await this.yellowClient.transfer({
      destination: recipient,
      asset: 'ytest.usd', // Using test token
      amount,
    });

    const txId = result.transactions?.[0]?.id;
    
    if (txId) {
      execution.txHashes.push(`YN-${txId}`);
      execution.status = 'completed';
      execution.actualCost = 0; // Zero gas!
      const executedAmount = amountMicro / 1_000_000;
      execution.amount = executedAmount;
      execution.actualReceived = executedAmount;
      execution.endTime = Date.now();
      
      console.log(`   ✅ Yellow Network TX #${txId} confirmed (gas: $0.00)`);
    } else {
      throw new Error('No transaction ID returned from Yellow Network');
    }

    return execution;
  }

  /**
   * Execute cross-chain bridge via LI.FI
   */
  private async executeBridge(
    execution: TradeExecution,
    opportunity: RebalanceOpportunity
  ): Promise<TradeExecution> {
    console.log(`   🌉 Executing bridge: ${execution.fromChain} → ${execution.toChain}`);
    
    const fromToken = getUsdcAddress(execution.fromChain);
    const toToken = getUsdcAddress(execution.toChain);
    if (!fromToken || !toToken) {
      throw new Error(`Missing USDC mapping for bridge (${execution.fromChain} → ${execution.toChain})`);
    }

    const userAddress = this.yellowClient?.getAddress();
    if (!userAddress) {
      throw new Error('Yellow Network address not available for bridge quote');
    }

    // Get bridge quote
    const quote = await this.bridgeClient.getQuote({
      fromChainId: execution.fromChain,
      toChainId: execution.toChain,
      fromToken,
      toToken,
      amount: Math.floor(opportunity.amount * 1_000_000).toString(), // 6 decimals
      userAddress,
    });

    if (!quote) {
      throw new Error('No bridge route available');
    }

    execution.status = 'confirming';
    console.log(`   📊 Bridge quote: ${quote.bridgeName}, fee: $${quote.estimatedGas}`);

    // For now, we just record the quote - actual execution requires real funds
    // In production, you would use bridgeClient.executeBridge() with a signer
    
    execution.actualCost = parseFloat(quote.estimatedGas || '0');
    const quotedReceived = Number(quote.toAmount) / 1_000_000;
    execution.actualReceived = Number.isFinite(quotedReceived)
      ? quotedReceived
      : opportunity.amount - execution.actualCost;
    
    // Simulate bridge completion for demo
    console.log(`   ⏳ Bridge initiated (would take ~${Math.round((quote.estimatedTime || 60) / 60)} minutes)`);
    
    execution.status = 'completed';
    execution.endTime = Date.now();
    execution.bridgeTxId = `BRIDGE-${uuidv4().slice(0, 8)}`;
    execution.txHashes.push(execution.bridgeTxId);

    return execution;
  }

  /**
   * Get Yellow Network balance
   */
  async getYellowBalance(): Promise<{ asset: string; amount: number }[]> {
    if (!this.yellowClient || !this.isConnected) {
      return [];
    }

    try {
      const balances = await this.yellowClient.getLedgerBalances();
      const list = balances?.balances || balances?.ledger_balances;
      if (list) {
        return list.map((b: any) => ({
          asset: b.asset,
          amount: parseInt(b.amount) / 1_000_000,
        }));
      }
    } catch (error) {
      console.error('Failed to get Yellow Network balance:', error);
    }

    return [];
  }

  private async getAvailableYellowAssetMicro(asset: string): Promise<bigint> {
    if (!this.yellowClient || !this.isConnected) {
      return 0n;
    }
    const balances = await this.yellowClient.getLedgerBalances();
    const list = balances?.balances || balances?.ledger_balances || [];
    const row = list.find((b: any) => (b.asset || '').toLowerCase() === asset.toLowerCase());
    const amount = row?.amount ?? '0';
    try {
      return BigInt(amount);
    } catch {
      return 0n;
    }
  }

  /**
   * Check if executor is ready
   */
  isReady(): boolean {
    return this.isConnected || !this.config.preferYellowNetwork;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): TradeExecution[] {
    return this.executionHistory;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalCost: number;
    totalVolume: number;
  } {
    const successful = this.executionHistory.filter(e => e.status === 'completed');
    const failed = this.executionHistory.filter(e => e.status === 'failed');
    
    return {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      totalCost: successful.reduce((sum, e) => sum + e.actualCost, 0),
      totalVolume: successful.reduce((sum, e) => sum + e.amount, 0),
    };
  }

  /**
   * Simulate execution (dry run)
   */
  async simulateExecution(plan: RebalancePlan): Promise<{
    estimatedCost: number;
    estimatedReceived: number;
    steps: string[];
  }> {
    const steps: string[] = [];
    let estimatedCost = 0;
    let estimatedReceived = 0;

    for (const opp of plan.opportunities) {
      if (opp.actionType === 'bridge') {
        steps.push(`Bridge $${opp.amount.toFixed(2)} from ${opp.fromPosition?.chainName} to ${opp.toPool.chainName}`);
        estimatedCost += opp.estimatedCost;
      } else {
        steps.push(`Transfer $${opp.amount.toFixed(2)} via Yellow Network (zero fee)`);
      }
      estimatedReceived += opp.amount - opp.estimatedCost;
    }

    return { estimatedCost, estimatedReceived, steps };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
