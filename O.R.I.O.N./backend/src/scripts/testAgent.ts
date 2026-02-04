/**
 * ORION Agent Test Script
 * 
 * Tests the AI agent with mock positions
 */

import { createOrionAgent, getPortfolioTracker } from '../agent/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function testAgent(): Promise<void> {
  console.log(`\n${colors.cyan}${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}  🧪 ORION AI Agent Test${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // Get portfolio tracker and add test positions
  const portfolio = getPortfolioTracker('./data/test_portfolio.db');
  
  console.log(`${colors.yellow}📊 Setting up test positions...${colors.reset}\n`);
  
  // Clear any existing positions
  portfolio.clearAll();
  
  // Add test positions with lower APYs (to trigger rebalancing)
  // Use smaller amounts to fit within Yellow Network sandbox balance (~50 ytest.usd)
  const testPositions = [
    { chainId: 1, protocol: 'aave-v3', pool: 'USDC-lending', symbol: 'USDC', balance: 10, apy: 5 },
    { chainId: 42161, protocol: 'compound-v3', pool: 'USDC-supply', symbol: 'USDC', balance: 5, apy: 4 },
    { chainId: 8453, protocol: 'aave-v3', pool: 'USDC-lending', symbol: 'USDC', balance: 5, apy: 3 },
  ];
  
  for (const pos of testPositions) {
    const added = portfolio.addPosition(pos);
    console.log(`   Added: $${pos.balance} in ${pos.protocol} on chain ${pos.chainId} @ ${pos.apy}% APY`);
  }
  
  const currentPortfolio = portfolio.getCurrentPortfolio();
  console.log(`\n${colors.green}✅ Portfolio initialized:${colors.reset}`);
  console.log(`   Total Value: $${currentPortfolio.totalValue.toFixed(2)}`);
  console.log(`   Positions: ${currentPortfolio.positions.length}`);
  
  // Create agent with lower thresholds for testing
  console.log(`\n${colors.yellow}🤖 Starting agent with test configuration...${colors.reset}\n`);
  
  const agent = createOrionAgent({
    riskProfile: 'balanced',
    minApyDifferential: 2,  // 2% minimum APY improvement
    minNetBenefit: 0.001,   // $0.001 minimum daily benefit (low for testing)
    yieldScanIntervalMs: 30 * 1000,         // 30 seconds
    fullAnalysisIntervalMs: 60 * 1000,      // 1 minute
  });
  
  // Subscribe to events
  agent.onEvent(async (event) => {
    if (event.type === 'opportunity_found') {
      console.log(`\n${colors.green}🎯 OPPORTUNITY FOUND!${colors.reset}`);
      console.log(`   ${event.opportunity.reason}`);
      console.log(`   APY Gain: +${event.opportunity.apyGain.toFixed(1)}%`);
      console.log(`   Net Benefit: $${event.opportunity.netBenefit.toFixed(2)}/day`);
    }
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️ Stopping test...');
    await agent.stop('Test ended');
    
    // Print summary
    const status = agent.getStatus();
    const finalPortfolio = portfolio.getCurrentPortfolio();
    const pnl = portfolio.calculatePnL();
    
    console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}  📊 Test Summary${colors.reset}`);
    console.log(`${colors.bright}═══════════════════════════════════════════════════════════${colors.reset}\n`);
    console.log(`   Duration: ${Math.round(status.uptime / 1000)}s`);
    console.log(`   Scans: ${status.scanCount}`);
    console.log(`   Actions: ${status.actionCount}`);
    console.log(`   Total P&L: $${pnl.totalPnl.toFixed(2)}`);
    console.log(`   Final Portfolio Value: $${finalPortfolio.totalValue.toFixed(2)}\n`);
    
    portfolio.close();
    process.exit(0);
  });
  
  try {
    await agent.start();
    
    console.log(`\n${colors.green}✅ Agent running! Press Ctrl+C to stop.${colors.reset}`);
    console.log(`${colors.blue}   Watching for yield opportunities...${colors.reset}\n`);
    
    // Run for 2 minutes max
    setTimeout(async () => {
      console.log('\n⏰ Test time limit reached (2 minutes)');
      await agent.stop('Test time limit');
      portfolio.close();
      process.exit(0);
    }, 2 * 60 * 1000);
    
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}`);
    portfolio.close();
    process.exit(1);
  }
}

testAgent();
