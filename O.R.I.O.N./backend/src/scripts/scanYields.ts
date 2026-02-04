/**
 * Scan Yields Script
 * Demonstrates real-time yield scanning from DeFiLlama
 * 
 * Usage: npm run scan:yields
 */

import { getYieldScanner, formatApy, formatTvl } from '../yields/index.js';
import { SUPPORTED_CHAINS, getChainName } from '../bridge/config.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ORION - Real-Time Yield Scanner                  ║');
  console.log('║           Powered by DeFiLlama + Protocol Subgraphs        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const scanner = getYieldScanner({
    minTvlUsd: 50000,     // Lower threshold to see more results
    maxRiskScore: 8,      // Include slightly riskier pools
  });

  try {
    // 1. Full scan of all chains
    console.log('🔍 Scanning all supported chains for USDC yields...\n');
    const result = await scanner.scanAllChains(true);

    // 2. Display top pools per chain
    console.log('\n📈 Top 3 Pools per Chain:\n');
    
    for (const [name, config] of Object.entries(SUPPORTED_CHAINS)) {
      const chainData = result.yields[config.chainId];
      if (!chainData || chainData.pools.length === 0) {
        console.log(`  ${name}: No pools found`);
        continue;
      }

      console.log(`\n  🔗 ${config.name} (Chain ID: ${config.chainId})`);
      console.log('  ' + '─'.repeat(55));
      
      const topPools = chainData.pools
        .sort((a, b) => b.apy - a.apy)
        .slice(0, 3);

      for (const pool of topPools) {
        const apyStr = formatApy(pool.apy).padStart(8);
        const tvlStr = formatTvl(pool.tvlUsd).padStart(10);
        const risk = pool.riskScore ? `Risk: ${pool.riskScore}/10` : '';
        console.log(`    • ${pool.project.padEnd(20)} ${apyStr} APY │ ${tvlStr} TVL │ ${risk}`);
      }
    }

    // 3. Compare chains for bridging opportunities
    console.log('\n\n🌉 Bridge Opportunity Analysis:\n');
    console.log('─'.repeat(60));

    // Find chains with significant APY differences
    const chainYields = Object.entries(result.yields)
      .map(([chainId, data]) => ({
        chainId: parseInt(chainId),
        name: getChainName(parseInt(chainId)),
        bestApy: data.bestApy,
        bestPool: data.bestPool,
      }))
      .filter(c => c.bestApy > 0)
      .sort((a, b) => b.bestApy - a.bestApy);

    if (chainYields.length >= 2) {
      const best = chainYields[0];
      const worst = chainYields[chainYields.length - 1];
      const diff = best.bestApy - worst.bestApy;

      console.log(`  Highest Yield:  ${best.name} @ ${formatApy(best.bestApy)} (${best.bestPool?.project})`);
      console.log(`  Lowest Yield:   ${worst.name} @ ${formatApy(worst.bestApy)}`);
      console.log(`  Difference:     ${formatApy(diff)}`);
      
      if (diff >= 2) {
        console.log(`\n  ✅ BRIDGE RECOMMENDED: ${diff.toFixed(2)}% APY improvement available!`);
        console.log(`     Move funds from ${worst.name} → ${best.name}`);
      } else if (diff >= 1) {
        console.log(`\n  ⚠️  MONITOR: ${diff.toFixed(2)}% difference (below 2% threshold)`);
      } else {
        console.log(`\n  ℹ️  No significant bridging opportunity (diff: ${diff.toFixed(2)}%)`);
      }
    }

    // 4. Summary statistics
    console.log('\n\n📊 Summary Statistics:\n');
    console.log('─'.repeat(60));
    console.log(`  Total USDC pools discovered: ${result.stats.totalPools}`);
    console.log(`  Total TVL across all pools:  ${formatTvl(result.stats.totalTvl)}`);
    console.log(`  Average APY:                 ${formatApy(result.stats.avgApy)}`);
    console.log(`  Chains with opportunities:   ${result.stats.chainsScanned}`);

    // 5. Best overall opportunity
    if (result.bestOpportunity) {
      console.log('\n\n🏆 BEST OVERALL OPPORTUNITY:\n');
      console.log('═'.repeat(60));
      console.log(`  Protocol:    ${result.bestOpportunity.project}`);
      console.log(`  Chain:       ${result.bestOpportunity.chain}`);
      console.log(`  Symbol:      ${result.bestOpportunity.symbol}`);
      console.log(`  APY:         ${formatApy(result.bestOpportunity.apy)}`);
      console.log(`    - Base:    ${formatApy(result.bestOpportunity.apyBase)}`);
      console.log(`    - Reward:  ${formatApy(result.bestOpportunity.apyReward)}`);
      console.log(`  TVL:         ${formatTvl(result.bestOpportunity.tvlUsd)}`);
      console.log(`  Risk Score:  ${result.bestOpportunity.riskScore ?? 'N/A'}/10`);
      console.log('═'.repeat(60));
    }

    console.log('\n✅ Yield scan complete!\n');

  } catch (error) {
    console.error('\n❌ Yield scan failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
