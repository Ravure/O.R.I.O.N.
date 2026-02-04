/**
 * ORION AI Agent - Maximum Profit 5-Minute Run
 * 
 * Aggressive settings to maximize profits with full balance.
 */

import { createOrionAgent, getPortfolioTracker, AgentEvent } from '../agent/index.js';
import { ClearNodeClient } from '../yellow/clearnode.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePrivateKey } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface Metrics {
  startTime: number;
  endTime: number;
  scans: number;
  opportunities: number;
  trades: number;
  successfulTrades: number;
  totalVolume: number;
  gasSaved: number;
  startBalance: number;
  endBalance: number;
  startTotal: number;
  endTotal: number;
}

const metrics: Metrics = {
  startTime: 0,
  endTime: 0,
  scans: 0,
  opportunities: 0,
  trades: 0,
  successfulTrades: 0,
  totalVolume: 0,
  gasSaved: 0,
  startBalance: 0,
  endBalance: 0,
  startTotal: 0,
  endTotal: 0,
};

function log(msg: string, color: string = c.reset): void {
  const time = new Date().toLocaleTimeString();
  console.log(`${c.dim}[${time}]${c.reset} ${color}${msg}${c.reset}`);
}

async function getYellowBalance(): Promise<number> {
  const client = new ClearNodeClient();
  try {
    await client.connect();
    await client.authenticate();
    const balances = await client.getLedgerBalances();
    client.disconnect();
    
    const list = balances?.balances || balances?.ledger_balances || [];
    const ytest = list.find((b: any) => b.asset === 'ytest.usd');
    return ytest ? parseInt(ytest.amount) / 1_000_000 : 0;
  } catch (e) {
    return 0;
  }
}

async function getYellowBalanceMicro(privateKey?: string): Promise<bigint> {
  const client = new ClearNodeClient(privateKey);
  try {
    await client.connect();
    await client.authenticate();
    const balances = await client.getLedgerBalances();
    client.disconnect();

    const list = balances?.balances || balances?.ledger_balances || [];
    const ytest = list.find((b: any) => b.asset === 'ytest.usd');
    return ytest ? BigInt(ytest.amount) : 0n;
  } catch (e) {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
    return 0n;
  }
}

function printBanner(): void {
  console.log(`
${c.magenta}${c.bright}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗                         ║
║  ██╔═══██╗██╔══██╗██║██╔═══██╗████╗  ██║                         ║
║  ██║   ██║██████╔╝██║██║   ██║██╔██╗ ██║                         ║
║  ██║   ██║██╔══██╗██║██║   ██║██║╚██╗██║                         ║
║  ╚██████╔╝██║  ██║██║╚██████╔╝██║ ╚████║                         ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝                         ║
║                                                                   ║
║         💰 MAXIMUM PROFIT RUN - 5 MINUTES 💰                      ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${c.reset}`);
}

function printFinalReport(): void {
  const duration = (metrics.endTime - metrics.startTime) / 1000 / 60;
  // In this sandbox runner, funds can move between sender and the ephemeral recipient.
  // The correct P&L is computed on the combined total.
  const profitLoss = metrics.endTotal - metrics.startTotal;
  const profitPercent = metrics.startTotal > 0 ? (profitLoss / metrics.startTotal) * 100 : 0;

  console.log(`\n\n${c.cyan}${c.bright}`);
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                    💰 PROFIT REPORT 💰                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log(`${c.reset}`);

  console.log(`${c.bright}Duration:${c.reset} ${duration.toFixed(1)} minutes\n`);

  console.log(`${c.yellow}Trading Activity:${c.reset}`);
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log(`│  Yield Scans:                  ${metrics.scans.toString().padStart(6)}                    │`);
  console.log(`│  Opportunities Found:          ${metrics.opportunities.toString().padStart(6)}                    │`);
  console.log(`│  Trades Executed:              ${metrics.trades.toString().padStart(6)}                    │`);
  console.log(`│  Successful Trades:            ${metrics.successfulTrades.toString().padStart(6)}                    │`);
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log(`│  Total Volume:                 $${metrics.totalVolume.toFixed(2).padStart(8)}                 │`);
  console.log(`│  Gas Saved (vs on-chain):      $${metrics.gasSaved.toFixed(2).padStart(8)}                 │`);
  console.log('└────────────────────────────────────────────────────────────┘');

  console.log(`\n${c.green}${c.bright}Balance Summary:${c.reset}`);
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log(`│  Starting Total:               $${metrics.startTotal.toFixed(2).padStart(8)}                 │`);
  console.log(`│  Ending Total:                 $${metrics.endTotal.toFixed(2).padStart(8)}                 │`);
  console.log('├────────────────────────────────────────────────────────────┤');
  
  const profitColor = profitLoss >= 0 ? c.green : c.red;
  const sign = profitLoss >= 0 ? '+' : '';
  console.log(`│  ${profitColor}P&L: ${sign}$${profitLoss.toFixed(2)} (${sign}${profitPercent.toFixed(2)}%)${c.reset}`.padEnd(73) + '│');
  console.log('└────────────────────────────────────────────────────────────┘');

  if (metrics.successfulTrades > 0) {
    console.log(`\n${c.green}${c.bright}✅ PROFIT RUN COMPLETE - ${metrics.successfulTrades} trades executed!${c.reset}`);
  } else if (metrics.scans > 0) {
    console.log(`\n${c.yellow}${c.bright}⚠️ RUN COMPLETE - Opportunities analyzed but no profitable trades met threshold${c.reset}`);
  }
  
  console.log('');
}

async function runMaxProfitTest(): Promise<void> {
  printBanner();

  // Get starting balance
  log('Checking Yellow Network balance...', c.yellow);
  const sender = new ClearNodeClient();
  const senderAddress = sender.getAddress();

  // Create an ephemeral recipient wallet for this run so transfers are REAL
  // but we can still verify end balances (sender + recipient) without losing funds.
  const recipientPrivateKey = generatePrivateKey();
  const recipient = new ClearNodeClient(recipientPrivateKey);
  const recipientAddress = recipient.getAddress();

  process.env.TRADE_RECIPIENT = recipientAddress;

  log(`Sender:    ${senderAddress}`, c.dim);
  log(`Recipient: ${recipientAddress}`, c.dim);

  const senderStartMicro = await getYellowBalanceMicro();
  const recipientStartMicro = await getYellowBalanceMicro(recipientPrivateKey);

  metrics.startBalance = Number(senderStartMicro) / 1_000_000;
  metrics.startTotal = Number(senderStartMicro + recipientStartMicro) / 1_000_000;
  log(`Starting balance: $${metrics.startBalance.toFixed(2)} ytest.usd`, c.green);
  log(
    `Start totals: sender ${(Number(senderStartMicro) / 1_000_000).toFixed(6)} + recipient ${(Number(recipientStartMicro) / 1_000_000).toFixed(6)} = ${((Number(senderStartMicro + recipientStartMicro)) / 1_000_000).toFixed(6)}`,
    c.dim
  );

  if (metrics.startBalance < 1) {
    log('ERROR: Insufficient balance! Need at least $1 ytest.usd', c.red);
    process.exit(1);
  }

  // Setup portfolio with FULL balance - aggressive allocation
  log('Setting up MAXIMUM investment portfolio...', c.yellow);
  const portfolio = getPortfolioTracker('./data/max_profit.db');
  portfolio.clearAll();

  // Invest the full balance across positions with low current APY
  // This makes the agent want to move funds to higher APY pools
  const fullBalance = metrics.startBalance;
  const positions = [
    { chainId: 1, protocol: 'savings-account', pool: 'low-yield', symbol: 'USDC', balance: fullBalance * 0.5, apy: 0.5 },
    { chainId: 42161, protocol: 'basic-lending', pool: 'low-yield', symbol: 'USDC', balance: fullBalance * 0.3, apy: 0.8 },
    { chainId: 8453, protocol: 'simple-vault', pool: 'low-yield', symbol: 'USDC', balance: fullBalance * 0.2, apy: 1.0 },
  ];

  for (const pos of positions) {
    portfolio.addPosition(pos);
    log(`  💰 Allocated: $${pos.balance.toFixed(2)} in ${pos.protocol} @ ${pos.apy}% APY`, c.dim);
  }

  const initialPortfolio = portfolio.getCurrentPortfolio();
  log(`Portfolio: $${initialPortfolio.totalValue.toFixed(2)} total investment\n`, c.green);

  // Create agent with AGGRESSIVE settings
  console.log(`${c.magenta}${c.bright}AGGRESSIVE CONFIGURATION:${c.reset}`);
  console.log(`  Risk Profile:     aggressive`);
  console.log(`  Scan Interval:    30 seconds (fast)`);
  console.log(`  Analysis:         1 minute`);
  console.log(`  Min APY Diff:     1% (low threshold)`);
  console.log(`  Min Net Benefit:  $0.001/day (very low)`);
  console.log('');

  const agent = createOrionAgent({
    riskProfile: 'aggressive',
    yieldScanIntervalMs: 30 * 1000,       // Scan every 30 seconds
    fullAnalysisIntervalMs: 60 * 1000,    // Analyze every minute
    minApyDifferential: 1,                 // 1% minimum improvement (very low)
    minNetBenefit: 0.001,                  // $0.001/day minimum (basically always trade)
    maxSlippage: 2,                        // Allow 2% slippage
  });

  // Track events
  let tradingDisabled = false;
  agent.onEvent((event: AgentEvent) => {
    switch (event.type) {
      case 'scan_completed':
        metrics.scans++;
        break;
      case 'opportunity_found':
        metrics.opportunities++;
        log(`🎯 OPPORTUNITY: ${event.opportunity.reason} (+${event.opportunity.apyGain.toFixed(1)}% APY)`, c.green);
        break;
      case 'execution_completed':
        const result = event.result;
        metrics.trades += result.executions.length;
        metrics.successfulTrades += result.executions.filter((e: any) => e.status === 'completed').length;
        metrics.totalVolume += result.totalReceived;
        metrics.gasSaved += result.executions.filter((e: any) => e.status === 'completed').length * 11.25;
        
        for (const exec of result.executions) {
          if (exec.status === 'completed') {
            log(`✅ TRADE EXECUTED: $${exec.amount.toFixed(2)} (TX: ${exec.txHashes[0] || 'N/A'})`, c.green);
          } else {
            log(`❌ Trade failed: ${exec.error}`, c.red);
          }
        }

        // After the first successful execution batch, keep scanning but stop further trading attempts.
        if (!tradingDisabled && result.executions.some((e: any) => e.status === 'completed')) {
          tradingDisabled = true;
          log('✅ Invested funds. Disabling further trades for the remainder of the 5-minute run (monitor-only).', c.yellow);
          agent.updateConfig({
            minNetBenefit: 1_000_000_000,
            minApyDifferential: 1_000_000_000,
          });
        }
        break;
      case 'error':
        log(`❌ Error: ${event.error}`, c.red);
        break;
    }
  });

  // Shutdown handler
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n\n${c.yellow}Shutting down: ${reason}${c.reset}`);
    metrics.endTime = Date.now();

    await agent.stop(reason);
    
    // Get final balance
    const senderEndMicro = await getYellowBalanceMicro();
    const recipientEndMicro = await getYellowBalanceMicro(recipientPrivateKey);

    metrics.endBalance = Number(senderEndMicro) / 1_000_000;
    metrics.endTotal = Number(senderEndMicro + recipientEndMicro) / 1_000_000;
    log(
      `End totals: sender ${(Number(senderEndMicro) / 1_000_000).toFixed(6)} + recipient ${(Number(recipientEndMicro) / 1_000_000).toFixed(6)} = ${((Number(senderEndMicro + recipientEndMicro)) / 1_000_000).toFixed(6)}`,
      c.dim
    );
    
    portfolio.close();
    printFinalReport();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('User interrupted (Ctrl+C)'));
  process.on('SIGTERM', () => shutdown('SIGTERM received'));

  // Start
  console.log(`${c.cyan}${c.bright}🚀 STARTING MAXIMUM PROFIT RUN...${c.reset}\n`);
  metrics.startTime = Date.now();

  try {
    await agent.start();
    log('Agent started - hunting for maximum yields!', c.green);
    log(`Running for 5 minutes. Press Ctrl+C to stop early.\n`, c.dim);

    // Progress updates every 30 seconds
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - metrics.startTime;
      const remaining = Math.max(0, Math.round((TEST_DURATION_MS - elapsed) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      log(`⏱️ ${mins}:${secs.toString().padStart(2, '0')} remaining | Scans: ${metrics.scans} | Trades: ${metrics.successfulTrades}`, c.blue);
    }, 30000);

    // End after 5 minutes
    setTimeout(async () => {
      clearInterval(progressInterval);
      await shutdown('5-minute profit run completed');
    }, TEST_DURATION_MS);

  } catch (error: any) {
    log(`Failed to start: ${error.message}`, c.red);
    metrics.endTime = Date.now();
    metrics.endBalance = await getYellowBalance();
    printFinalReport();
    process.exit(1);
  }
}

runMaxProfitTest();
