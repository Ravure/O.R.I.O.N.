/**
 * ORION Agent Orchestrator
 * 
 * Main control loop that ties all components together for autonomous operation.
 */

import {
  AgentConfig,
  AgentStatus,
  AgentState,
  AgentAction,
  AgentEvent,
  AgentEventHandler,
  RebalancePlan,
  ExecutionResult,
} from './types.js';
import { DEFAULT_AGENT_CONFIG, createAgentConfig } from './config.js';
import { YieldScanner } from '../yields/scanner.js';
import { PortfolioTracker, getPortfolioTracker } from './portfolioTracker.js';
import { DecisionEngine } from './decisionEngine.js';
import { TradeExecutor } from './tradeExecutor.js';
import { Notifier } from './notifier.js';

export class OrionAgent {
  private config: AgentConfig;
  private state: AgentState = 'idle';
  private scanner: YieldScanner;
  private portfolio: PortfolioTracker;
  private decision: DecisionEngine;
  private executor: TradeExecutor;
  private notifier: Notifier;
  
  // Timing
  private startTime: number = 0;
  private lastScanTime: number = 0;
  private lastActionTime: number = 0;
  private scanInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  
  // Counters
  private scanCount: number = 0;
  private actionCount: number = 0;
  private consecutiveErrors: number = 0;
  private totalPnl: number = 0;
  
  // Event handlers
  private eventHandlers: AgentEventHandler[] = [];
  private actionHistory: AgentAction[] = [];

  constructor(config?: Partial<AgentConfig>, privateKey?: string) {
    this.config = createAgentConfig(config);
    
    // Initialize components
    this.scanner = new YieldScanner({
      minTvl: 100_000,
      minApy: 1,
      maxApy: 200,
      stablecoinOnly: true,
    });
    
    this.portfolio = getPortfolioTracker();
    this.decision = new DecisionEngine(this.config);
    this.executor = new TradeExecutor(this.config, this.portfolio, privateKey);
    this.notifier = new Notifier(this.config.notifications);
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      throw new Error(`Cannot start agent in state: ${this.state}`);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  🤖 ORION AI Agent Starting...');
    console.log('═'.repeat(60) + '\n');

    this.state = 'idle';
    this.startTime = Date.now();
    this.consecutiveErrors = 0;

    try {
      // Connect to Yellow Network
      console.log('📡 Connecting to Yellow Network...');
      await this.executor.connect();
      
      // Initial scan
      console.log('🔍 Running initial yield scan...');
      await this.runScan();
      
      // Emit started event
      this.emitEvent({ type: 'started', timestamp: Date.now() });
      await this.notifier.notifyAgentStarted({ riskProfile: this.config.riskProfile });

      // Start periodic scanning
      this.startPeriodicTasks();
      
      this.state = 'idle';
      console.log('\n✅ ORION Agent is now running');
      console.log(`   Risk Profile: ${this.config.riskProfile}`);
      console.log(`   Scan Interval: ${this.config.yieldScanIntervalMs / 60000} minutes`);
      console.log(`   Analysis Interval: ${this.config.fullAnalysisIntervalMs / 3600000} hours\n`);
      
    } catch (error: any) {
      this.state = 'error';
      await this.notifier.notifyError(error.message, 'Agent startup');
      throw error;
    }
  }

  /**
   * Stop the agent
   */
  async stop(reason: string = 'User requested'): Promise<void> {
    console.log('\n⏹️ Stopping ORION Agent...');
    
    this.state = 'stopped';
    
    // Stop periodic tasks
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    
    // Disconnect
    this.executor.disconnect();
    
    // Notify
    this.emitEvent({ type: 'stopped', timestamp: Date.now(), reason });
    await this.notifier.notifyAgentStopped(reason);
    
    console.log('✅ Agent stopped\n');
  }

  /**
   * Run a single scan and analysis cycle
   */
  async runOnce(): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    
    try {
      // Scan yields
      const scanAction = await this.runScan();
      actions.push(scanAction);
      
      // Analyze and potentially execute
      const analysisAction = await this.runAnalysis();
      actions.push(analysisAction);
      
      this.consecutiveErrors = 0;
      
    } catch (error: any) {
      this.consecutiveErrors++;
      await this.handleError(error);
      
      if (this.consecutiveErrors >= this.config.pauseOnConsecutiveErrors) {
        await this.pause(`${this.consecutiveErrors} consecutive errors`);
      }
    }
    
    return actions;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return {
      state: this.state,
      startTime: this.startTime,
      lastScanTime: this.lastScanTime,
      lastActionTime: this.lastActionTime,
      scanCount: this.scanCount,
      actionCount: this.actionCount,
      totalPnl: this.totalPnl,
      errors: [],
      currentPortfolio: this.portfolio.getCurrentPortfolio(),
      nextScheduledAction: this.getNextScheduledAction(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Pause the agent
   */
  async pause(reason: string): Promise<void> {
    this.state = 'paused';
    this.emitEvent({ type: 'paused', timestamp: Date.now(), reason });
    await this.notifier.notifyCritical('Agent Paused', reason);
    console.log(`\n⏸️ Agent paused: ${reason}\n`);
  }

  /**
   * Resume the agent
   */
  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      throw new Error('Agent is not paused');
    }
    
    this.state = 'idle';
    this.consecutiveErrors = 0;
    this.emitEvent({ type: 'resumed', timestamp: Date.now() });
    console.log('\n▶️ Agent resumed\n');
  }

  /**
   * Subscribe to events
   */
  onEvent(handler: AgentEventHandler): void {
    this.eventHandlers.push(handler);
  }

  // ============ Private Methods ============

  /**
   * Start periodic scanning and analysis
   */
  private startPeriodicTasks(): void {
    // Quick scan every yieldScanIntervalMs
    this.scanInterval = setInterval(async () => {
      if (this.state === 'idle') {
        try {
          await this.runScan();
        } catch (error: any) {
          await this.handleError(error);
        }
      }
    }, this.config.yieldScanIntervalMs);

    // Full analysis every fullAnalysisIntervalMs
    this.analysisInterval = setInterval(async () => {
      if (this.state === 'idle') {
        try {
          await this.runAnalysis();
        } catch (error: any) {
          await this.handleError(error);
        }
      }
    }, this.config.fullAnalysisIntervalMs);
  }

  /**
   * Run yield scan
   */
  private async runScan(): Promise<AgentAction> {
    const startTime = Date.now();
    this.state = 'scanning';
    
    console.log(`\n🔍 [${new Date().toLocaleTimeString()}] Scanning yields...`);
    
    const result = await this.scanner.scanAllChains();
    
    this.lastScanTime = Date.now();
    this.scanCount++;
    this.state = 'idle';
    
    const duration = Date.now() - startTime;
    console.log(`   Found ${result.stats.totalPools} pools in ${(duration / 1000).toFixed(1)}s`);

    // Always emit scan completion (used by production test metrics)
    this.emitEvent({
      type: 'scan_completed',
      timestamp: Date.now(),
      poolCount: result.stats.totalPools,
    });
    
    // Check for high-priority opportunities
    const currentBestApy = this.getBestCurrentApy();
    const portfolioNow = this.portfolio.getCurrentPortfolio();
    const quickCheck = this.decision.quickScan(result.allPools, currentBestApy);
    
    if (quickCheck.hasHighPriority) {
      // Only treat as "actionable high priority" if it can plausibly clear minNetBenefit
      // given the current portfolio size. This prevents noisy analysis loops on tiny portfolios.
      const apyDiff = Math.max(0, quickCheck.bestNewApy - currentBestApy);
      const estimatedDailyBenefit = (portfolioNow.totalValue * (apyDiff / 100)) / 365;

      if (estimatedDailyBenefit >= this.config.minNetBenefit) {
        console.log(`   🔥 High-priority opportunity detected! (${quickCheck.reason})`);
        // Trigger immediate analysis
        await this.runAnalysis();
      } else {
        console.log(
          `   ℹ️ High APY signal but not actionable: est $${estimatedDailyBenefit.toFixed(4)}/day < minNetBenefit ($${this.config.minNetBenefit}/day)`
        );
      }
    }
    
    const action: AgentAction = {
      id: `scan-${Date.now()}`,
      timestamp: startTime,
      type: 'scan',
      description: `Scanned ${result.stats.totalPools} pools`,
      result: { poolCount: result.stats.totalPools, bestApy: result.bestOpportunity?.apy },
      duration,
    };
    
    this.actionHistory.push(action);
    return action;
  }

  /**
   * Run full analysis and potentially execute
   */
  private async runAnalysis(): Promise<AgentAction> {
    const startTime = Date.now();
    this.state = 'analyzing';
    
    console.log(`\n📊 [${new Date().toLocaleTimeString()}] Running full analysis...`);
    
    // Get current data
    const portfolio = this.portfolio.getCurrentPortfolio();
    const yields = await this.scanner.scanAllChains();
    
    // Analyze
    const decision = this.decision.analyze(portfolio, yields.allPools);
    
    let result: any = { shouldAct: decision.shouldAct, reason: decision.reason };
    
    if (decision.shouldAct && decision.plan) {
      console.log(`   📋 Rebalance plan: ${decision.plan.opportunities.length} opportunities`);
      
      // Notify about opportunities
      for (const opp of decision.plan.opportunities) {
        await this.notifier.notifyOpportunityFound(opp);
        this.emitEvent({ type: 'opportunity_found', timestamp: Date.now(), opportunity: opp });
      }
      
      // Execute
      this.state = 'executing';
      this.emitEvent({ type: 'execution_started', timestamp: Date.now(), plan: decision.plan });
      
      const execResult = await this.executor.executePlan(decision.plan);
      
      this.lastActionTime = Date.now();
      this.actionCount++;
      this.decision.markRebalanceExecuted();
      
      // Update P&L
      this.totalPnl += execResult.totalReceived - execResult.totalCost;
      
      // Notify result
      await this.notifier.notifyExecutionResult(execResult);
      this.emitEvent({ type: 'execution_completed', timestamp: Date.now(), result: execResult });
      
      result = { ...result, execution: execResult };
    } else {
      console.log(`   ${decision.reason}`);
    }
    
    this.state = 'idle';
    
    const duration = Date.now() - startTime;
    const action: AgentAction = {
      id: `analyze-${Date.now()}`,
      timestamp: startTime,
      type: 'analyze',
      description: decision.reason,
      result,
      duration,
    };
    
    this.actionHistory.push(action);
    return action;
  }

  /**
   * Handle errors
   */
  private async handleError(error: Error): Promise<void> {
    this.state = 'error';
    console.error(`\n❌ Error: ${error.message}`);
    
    this.emitEvent({ type: 'error', timestamp: Date.now(), error: error.message });
    await this.notifier.notifyError(error.message);
    
    this.state = 'idle';
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: AgentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Get best APY from current positions
   */
  private getBestCurrentApy(): number {
    const portfolio = this.portfolio.getCurrentPortfolio();
    if (portfolio.positions.length === 0) return 0;
    return Math.max(...portfolio.positions.map(p => p.currentApy));
  }

  /**
   * Get next scheduled action description
   */
  private getNextScheduledAction(): string {
    const now = Date.now();
    const nextScan = this.lastScanTime + this.config.yieldScanIntervalMs;
    const nextAnalysis = this.lastActionTime + this.config.fullAnalysisIntervalMs;
    
    if (nextScan < nextAnalysis) {
      const mins = Math.round((nextScan - now) / 60000);
      return `Quick scan in ${mins} minutes`;
    } else {
      const mins = Math.round((nextAnalysis - now) / 60000);
      return `Full analysis in ${mins} minutes`;
    }
  }

  /**
   * Get action history
   */
  getActionHistory(): AgentAction[] {
    return this.actionHistory;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.decision.updateConfig(this.config);
    this.executor.updateConfig(this.config);
    
    if (updates.notifications) {
      this.notifier.updateConfig(updates.notifications);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }
}

// Factory function for easy creation
export function createOrionAgent(
  config?: Partial<AgentConfig>,
  privateKey?: string
): OrionAgent {
  return new OrionAgent(config, privateKey || process.env.AGENT_PRIVATE_KEY);
}
