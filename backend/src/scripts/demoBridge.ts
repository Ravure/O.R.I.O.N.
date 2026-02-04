/**
 * Demo Bridge Script
 * Demonstrates the full auto-bridging flow with real yield data
 * 
 * Usage: npm run bridge:demo
 */

import { getYieldScanner, formatApy, formatTvl } from '../yields/index.js';
import { getAutoBridger } from '../bridge/autoBridge.js';
import { getLiFiClient } from '../bridge/lifi.js';
import { SUPPORTED_CHAINS, getChainName } from '../bridge/config.js';
import type { Portfolio, PortfolioPosition, SupportedChain } from '../bridge/types.js';

// Simulated portfolio for demo
const DEMO_PORTFOLIO: Portfolio = {
  totalValueUsd: 10000,
  positions: [
    {
      chain: 'ethereum' as SupportedChain,
      chainId: 1,
      protocol: 'aave-v3',
      tokenSymbol: 'USDC',
      balance: '10000000000', // $10,000 (6 decimals)
      balanceUsd: 10000,
      apy: 0.03, // 3%
    },
  ],
};

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ORION - Auto-Bridge Demo                         ║');
  console.log('║           Real yield data + Bridge decision engine         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. Display current portfolio
  console.log('📦 Current Portfolio:\n');
  console.log('─'.repeat(60));
  console.log(`  Total Value: $${DEMO_PORTFOLIO.totalValueUsd.toLocaleString()}`);
  console.log('');
  
  for (const pos of DEMO_PORTFOLIO.positions) {
    console.log(`  Position on ${getChainName(pos.chainId)}:`);
    console.log(`    Protocol: ${pos.protocol}`);
    console.log(`    Balance:  $${pos.balanceUsd.toLocaleString()} ${pos.tokenSymbol}`);
    console.log(`    APY:      ${(pos.apy * 100).toFixed(2)}%`);
  }
  console.log('─'.repeat(60));

  // 2. Scan real yields
  console.log('\n\n🔍 Scanning real-time yields across all chains...\n');
  
  const scanner = getYieldScanner({
    minTvlUsd: 100000,
    maxRiskScore: 6,
  });
  
  const yieldResult = await scanner.scanAllChains(true);
  
  // 3. Initialize auto-bridger
  console.log('\n\n🤖 Running Auto-Bridge Decision Engine...\n');
  
  const autoBridger = getAutoBridger({
    minApyDifferential: 0.01, // Lower threshold for demo (1%)
    maxChainExposure: 0.60,   // 60% max on single chain
  });

  // 4. Check for bridge opportunities
  const action = await autoBridger.checkAndBridge(DEMO_PORTFOLIO, yieldResult.yields);

  console.log('─'.repeat(60));
  
  if (action) {
    console.log('\n🎯 BRIDGE ACTION RECOMMENDED:\n');
    console.log(`  Type:       ${action.type}`);
    console.log(`  From:       ${getChainName(SUPPORTED_CHAINS[action.fromChain].chainId)}`);
    console.log(`  To:         ${getChainName(SUPPORTED_CHAINS[action.toChain].chainId)}`);
    console.log(`  Amount:     $${parseFloat(action.amount).toLocaleString()}`);
    console.log(`  Reason:     ${action.reason}`);
    
    if (action.expectedApyImprovement) {
      const newApy = DEMO_PORTFOLIO.positions[0].apy + action.expectedApyImprovement;
      const annualGain = DEMO_PORTFOLIO.totalValueUsd * action.expectedApyImprovement;
      console.log(`\n  Expected Impact:`);
      console.log(`    Current APY:    ${(DEMO_PORTFOLIO.positions[0].apy * 100).toFixed(2)}%`);
      console.log(`    New APY:        ${(newApy * 100).toFixed(2)}%`);
      console.log(`    Annual Gain:    $${annualGain.toFixed(2)} (extra yield)`);
    }

    // 5. Get bridge quote
    console.log('\n\n💱 Fetching Bridge Quote...\n');
    
    const client = getLiFiClient();
    const fromConfig = SUPPORTED_CHAINS[action.fromChain];
    const toConfig = SUPPORTED_CHAINS[action.toChain];
    
    try {
      const quote = await client.getQuote({
        fromChainId: fromConfig.chainId,
        toChainId: toConfig.chainId,
        fromToken: fromConfig.usdc,
        toToken: toConfig.usdc,
        amount: (DEMO_PORTFOLIO.totalValueUsd * 1e6).toString(), // Convert to USDC decimals
        userAddress: '0x0000000000000000000000000000000000000001', // Demo address
      });

      const outputAmount = parseInt(quote.toAmount) / 1e6;
      const minOutput = parseInt(quote.toAmountMin) / 1e6;
      const fee = DEMO_PORTFOLIO.totalValueUsd - outputAmount;

      console.log('  Bridge Details:');
      console.log(`    Bridge:      ${quote.bridgeName}`);
      console.log(`    Input:       $${DEMO_PORTFOLIO.totalValueUsd.toLocaleString()} USDC`);
      console.log(`    Output:      $${outputAmount.toFixed(2)} USDC`);
      console.log(`    Min Output:  $${minOutput.toFixed(2)} USDC`);
      console.log(`    Fee:         $${fee.toFixed(2)} (${(fee / DEMO_PORTFOLIO.totalValueUsd * 100).toFixed(2)}%)`);
      console.log(`    Est. Time:   ~${Math.ceil(quote.estimatedTime / 60)} minutes`);
      console.log(`    Gas Cost:    $${quote.estimatedGas}`);

      // ROI calculation
      if (action.expectedApyImprovement) {
        const daysToBreakeven = fee / (DEMO_PORTFOLIO.totalValueUsd * action.expectedApyImprovement / 365);
        console.log(`\n  ROI Analysis:`);
        console.log(`    Break-even:  ${daysToBreakeven.toFixed(1)} days`);
        console.log(`    1-year gain: $${(DEMO_PORTFOLIO.totalValueUsd * action.expectedApyImprovement - fee).toFixed(2)}`);
      }

      // Would execute check
      console.log('\n  ⚠️  This is a DEMO - no actual bridge executed');
      console.log('      In production, call executeBridge() with a real signer');

    } catch (error) {
      console.log(`  ❌ Could not get bridge quote: ${error instanceof Error ? error.message : error}`);
    }

  } else {
    console.log('\n✅ NO BRIDGE NEEDED\n');
    console.log('  Your portfolio is already optimally positioned.');
    console.log('  Current yields are competitive across all chains.');
    
    // Show comparison anyway
    console.log('\n  Yield comparison vs your current position:');
    const currentApy = DEMO_PORTFOLIO.positions[0].apy;
    
    for (const [chainId, data] of Object.entries(yieldResult.yields)) {
      const diff = data.bestApy - currentApy;
      const diffStr = diff > 0 ? `+${(diff * 100).toFixed(2)}%` : `${(diff * 100).toFixed(2)}%`;
      const indicator = diff > 0.02 ? '🔥' : diff > 0 ? '📈' : '➖';
      
      console.log(`    ${indicator} ${getChainName(parseInt(chainId)).padEnd(12)}: ${formatApy(data.bestApy)} (${diffStr})`);
    }
  }

  // 6. Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('                    DEMO COMPLETE');
  console.log('═'.repeat(60));
  console.log('\n  This demo showed:');
  console.log('    1. ✅ Real yield data from DeFiLlama');
  console.log('    2. ✅ Automatic bridge opportunity detection');
  console.log('    3. ✅ APY comparison across 5 chains');
  console.log('    4. ✅ LI.FI bridge quote fetching');
  console.log('    5. ✅ ROI analysis for bridging decisions');
  console.log('\n  To run in production:');
  console.log('    • Connect real wallet');
  console.log('    • Use real portfolio data');
  console.log('    • Call executeBridge() with signer');
  console.log('\n' + '═'.repeat(60) + '\n');
}

main().catch(console.error);
