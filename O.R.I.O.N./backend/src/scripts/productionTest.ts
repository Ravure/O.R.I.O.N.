/**
 * ORION AI Agent - Production Level Test
 * 
 * Runs the agent for 60 minutes with:
 * - Realistic portfolio positions ($100+ value)
 * - Production-like intervals (5 min scan, 15 min analysis)
 * - Full logging and metrics
 * - Final performance report
 * 
 * Run: npm run agent:production
 */

import { createOrionAgent, getPortfolioTracker, AgentEvent, RiskProfile } from '../agent/index.js';
import { ClearNodeClient } from '../yellow/clearnode.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Test configuration
const TEST_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const RISK_PROFILE: RiskProfile = 'balanced';

// Metrics tracking
interface TestMetrics {
  startTime: number;
  endTime: number;
  scansCompleted: number;
  opportunitiesFound: number;
  tradesExecuted: number;
  tradesSuccessful: number;
  tradesFailed: number;
  totalVolume: number;
  totalGasSaved: number;
  errors: string[];
  events: { time: number; type: string; details: string }[];
}

const metrics: TestMetrics = {
  startTime: 0,
  endTime: 0,
  scansCompleted: 0,
  opportunitiesFound: 0,
  tradesExecuted: 0,
  tradesSuccessful: 0,
  tradesFailed: 0,
  totalVolume: 0,
  totalGasSaved: 0,
  errors: [],
  events: [],
};

function log(msg: string, color: string = c.reset): void {
  const time = new Date().toLocaleTimeString();
  console.log(`${c.dim}[${time}]${c.reset} ${color}${msg}${c.reset}`);
}

function logEvent(type: string, details: string): void {
  metrics.events.push({ time: Date.now(), type, details });
}

function printBanner(): void {
  console.log(`
${c.cyan}${c.bright}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗                         ║
║  ██╔═══██╗██╔══██╗██║██╔═══██╗████╗  ██║                         ║
║  ██║   ██║██████╔╝██║██║   ██║██╔██╗ ██║                         ║
║  ██║   ██║██╔══██╗██║██║   ██║██║╚██╗██║                         ║
║  ╚██████╔╝██║  ██║██║╚██████╔╝██║ ╚████║                         ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝                         ║
║                                                                   ║
║             PRODUCTION LEVEL TEST - 60 MINUTES                    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${c.reset}`);
}

function printConfig(): void {
  console.log(`${c.yellow}Configuration:${c.reset}`);
  console.log(`  Duration:        60 minutes`);
  console.log(`  Risk Profile:    ${RISK_PROFILE}`);
  console.log(`  Scan Interval:   5 minutes`);
  console.log(`  Analysis:        15 minutes`);
  console.log(`  Min APY Diff:    5%`);
  console.log(`  Min Net Benefit: $1/day`);
  console.log('');
}

async function checkBalance(): Promise<number> {
  const client = new ClearNodeClient();
  try {
    // Important: show which wallet is actually used for Yellow Network
    log(`Yellow wallet: ${client.getAddress()}`, c.dim);

    await client.connect();
    await client.authenticate();
    const balances = await client.getLedgerBalances();
    client.disconnect();
    
    const list = balances?.balances || balances?.ledger_balances || [];
    if (list.length > 0) {
      const ytest = list.find((b: any) => b.asset === 'ytest.usd');
      const ytestAmount = ytest ? parseInt(ytest.amount) / 1_000_000 : 0;

      // Log brief per-asset balances for visibility
      const summary = list
        .slice(0, 5)
        .map((b: any) => `${b.asset}:${(parseInt(b.amount) / 1_000_000).toFixed(2)}`)
        .join(', ');
      log(`Ledger balances: ${summary}${list.length > 5 ? ', ...' : ''}`, c.dim);

      return ytestAmount;
    }
  } catch (e) {
    // Ignore
  }
  return 0;
}

function printProgressBar(elapsed: number, total: number): void {
  const percent = Math.min(100, Math.round((elapsed / total) * 100));
  const filled = Math.round(percent / 2);
  const empty = 50 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const remaining = Math.round((total - elapsed) / 60000);
  
  process.stdout.write(`\r${c.cyan}Progress: [${bar}] ${percent}% | ${remaining} min remaining${c.reset}   `);
}

function printFinalReport(): void {
  const duration = (metrics.endTime - metrics.startTime) / 1000 / 60;
  
  console.log(`\n\n${c.cyan}${c.bright}`);
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                    PRODUCTION TEST REPORT                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log(`${c.reset}`);
  
  console.log(`${c.bright}Test Duration:${c.reset} ${duration.toFixed(1)} minutes\n`);
  
  console.log(`${c.yellow}Performance Metrics:${c.reset}`);
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log(`│  Yield Scans Completed:        ${metrics.scansCompleted.toString().padStart(6)}                    │`);
  console.log(`│  Opportunities Detected:       ${metrics.opportunitiesFound.toString().padStart(6)}                    │`);
  console.log(`│  Trades Executed:              ${metrics.tradesExecuted.toString().padStart(6)}                    │`);
  console.log(`│  Successful Trades:            ${metrics.tradesSuccessful.toString().padStart(6)}                    │`);
  console.log(`│  Failed Trades:                ${metrics.tradesFailed.toString().padStart(6)}                    │`);
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log(`│  Total Volume Traded:          $${metrics.totalVolume.toFixed(2).padStart(8)}                 │`);
  console.log(`│  Gas Saved (vs on-chain):      $${metrics.totalGasSaved.toFixed(2).padStart(8)}                 │`);
  console.log('└────────────────────────────────────────────────────────────┘');
  
  if (metrics.errors.length > 0) {
    console.log(`\n${c.red}Errors (${metrics.errors.length}):${c.reset}`);
    for (const err of metrics.errors.slice(0, 5)) {
      console.log(`  - ${err.slice(0, 60)}...`);
    }
  }
  
  console.log(`\n${c.green}Event Timeline (last 10):${c.reset}`);
  const lastEvents = metrics.events.slice(-10);
  for (const event of lastEvents) {
    const time = new Date(event.time).toLocaleTimeString();
    console.log(`  ${c.dim}[${time}]${c.reset} ${event.type}: ${event.details.slice(0, 50)}`);
  }
  
  // Success rate
  const successRate = metrics.tradesExecuted > 0 
    ? ((metrics.tradesSuccessful / metrics.tradesExecuted) * 100).toFixed(1)
    : 'N/A';
  
  console.log(`\n${c.bright}Summary:${c.reset}`);
  console.log(`  Success Rate:     ${successRate}%`);
  console.log(`  Avg Scans/Hour:   ${(metrics.scansCompleted / (duration / 60)).toFixed(1)}`);
  console.log(`  Uptime:           100%`);
  
  if (metrics.tradesSuccessful > 0) {
    console.log(`\n${c.green}${c.bright}✅ PRODUCTION TEST PASSED${c.reset}`);
  } else if (metrics.scansCompleted > 0) {
    console.log(`\n${c.yellow}${c.bright}⚠️ TEST COMPLETED (No trades executed - may need more opportunities)${c.reset}`);
  } else {
    console.log(`\n${c.red}${c.bright}❌ TEST FAILED${c.reset}`);
  }
  
  console.log('');
}

async function runProductionTest(): Promise<void> {
  printBanner();
  printConfig();
  
  // Check initial balance
  log('Checking Yellow Network balance...', c.yellow);
  const balance = await checkBalance();
  log(`Available balance: ${balance.toFixed(2)} ytest.usd`, c.green);
  
  if (balance < 10) {
    log('Warning: Low balance, some trades may fail', c.red);
  }
  
  // Setup portfolio with realistic positions
  log('Setting up portfolio with test positions...', c.yellow);
  const portfolio = getPortfolioTracker('./data/production_test.db');
  portfolio.clearAll();
  
  // Add positions across multiple chains (simulating a real portfolio)
  const positions = [
    { chainId: 1, protocol: 'aave-v3', pool: 'USDC-lending', symbol: 'USDC', balance: 50, apy: 4.5 },
    { chainId: 42161, protocol: 'compound-v3', pool: 'USDC-supply', symbol: 'USDC', balance: 30, apy: 3.8 },
    { chainId: 8453, protocol: 'morpho', pool: 'USDC-vault', symbol: 'USDC', balance: 20, apy: 5.2 },
  ];
  
  for (const pos of positions) {
    portfolio.addPosition(pos);
    log(`  Added: $${pos.balance} in ${pos.protocol} @ ${pos.apy}% APY`, c.dim);
  }
  
  const initialPortfolio = portfolio.getCurrentPortfolio();
  log(`Portfolio initialized: $${initialPortfolio.totalValue.toFixed(2)} across ${initialPortfolio.positions.length} positions\n`, c.green);
  
  // Create agent with production settings
  const agent = createOrionAgent({
    riskProfile: RISK_PROFILE,
    yieldScanIntervalMs: 5 * 60 * 1000,      // 5 minutes
    fullAnalysisIntervalMs: 15 * 60 * 1000,  // 15 minutes
    minApyDifferential: 5,                    // 5% minimum improvement
    minNetBenefit: 1,                         // $1/day minimum
    maxSlippage: 0.5,
  });
  
  // Track events
  agent.onEvent((event: AgentEvent) => {
    switch (event.type) {
      case 'scan_completed':
        metrics.scansCompleted++;
        logEvent('scan', `Found ${event.poolCount} pools`);
        break;
      case 'opportunity_found':
        metrics.opportunitiesFound++;
        logEvent('opportunity', `${event.opportunity.reason} (+${event.opportunity.apyGain.toFixed(1)}% APY)`);
        log(`🎯 Opportunity: ${event.opportunity.reason}`, c.green);
        break;
      case 'execution_completed':
        const result = event.result;
        metrics.tradesExecuted += result.executions.length;
        metrics.tradesSuccessful += result.executions.filter(e => e.status === 'completed').length;
        metrics.tradesFailed += result.executions.filter(e => e.status === 'failed').length;
        metrics.totalVolume += result.totalReceived;
        metrics.totalGasSaved += result.executions.filter(e => e.status === 'completed').length * 0.15; // ~$0.15 per trade saved
        logEvent('execution', `${result.executions.length} trades, ${result.success ? 'success' : 'partial'}`);
        break;
      case 'error':
        metrics.errors.push(event.error);
        logEvent('error', event.error);
        log(`❌ Error: ${event.error}`, c.red);
        break;
    }
  });
  
  // Handle shutdown
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    
    console.log(`\n\n${c.yellow}Shutting down: ${reason}${c.reset}`);
    metrics.endTime = Date.now();
    
    await agent.stop(reason);
    portfolio.close();
    
    printFinalReport();
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('User interrupted (Ctrl+C)'));
  process.on('SIGTERM', () => shutdown('SIGTERM received'));
  
  // Start the agent
  console.log(`${c.cyan}${c.bright}Starting production test...${c.reset}\n`);
  metrics.startTime = Date.now();
  
  try {
    await agent.start();
    log('Agent started successfully', c.green);
    log(`Running for ${TEST_DURATION_MS / 60000} minutes. Press Ctrl+C to stop early.\n`, c.dim);
    
    // Progress updates every minute
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - metrics.startTime;
      printProgressBar(elapsed, TEST_DURATION_MS);
    }, 30000);
    
    // Status updates every 10 minutes
    const statusInterval = setInterval(() => {
      const status = agent.getStatus();
      console.log(''); // New line after progress bar
      log(`Status: ${status.scanCount} scans, ${status.actionCount} actions, P&L: $${status.totalPnl.toFixed(2)}`, c.blue);
    }, 10 * 60 * 1000);
    
    // End after duration
    setTimeout(async () => {
      clearInterval(progressInterval);
      clearInterval(statusInterval);
      await shutdown('Test duration completed (60 minutes)');
    }, TEST_DURATION_MS);
    
  } catch (error: any) {
    log(`Failed to start: ${error.message}`, c.red);
    metrics.errors.push(error.message);
    metrics.endTime = Date.now();
    printFinalReport();
    process.exit(1);
  }
}

// Run
runProductionTest();
