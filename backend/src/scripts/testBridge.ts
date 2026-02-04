/**
 * Test Bridge Script
 * Tests LI.FI bridge quotes between chains
 * 
 * Usage: npm run bridge:test
 */

import { getLiFiClient } from '../bridge/lifi.js';
import { 
  SUPPORTED_CHAINS, 
  getChainName,
  getUsdcAddress,
} from '../bridge/config.js';
import type { BridgeQuoteRequest } from '../bridge/types.js';

// Test wallet address (don't use real funds!)
const TEST_ADDRESS = '0x0000000000000000000000000000000000000001';

// Test amount: $100 USDC (6 decimals)
const TEST_AMOUNT = '100000000';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ORION - LI.FI Bridge Test                        ║');
  console.log('║           Testing cross-chain bridge quotes                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const client = getLiFiClient();

  // Test bridge quotes between all chain pairs
  const chains = Object.entries(SUPPORTED_CHAINS);
  const results: Array<{
    from: string;
    to: string;
    success: boolean;
    toAmount?: string;
    estimatedTime?: number;
    bridge?: string;
    gasCost?: string;
    error?: string;
  }> = [];

  console.log(`🔗 Testing USDC bridge quotes between ${chains.length} chains...\n`);
  console.log(`   Test amount: $100 USDC`);
  console.log(`   Test address: ${TEST_ADDRESS}\n`);
  console.log('─'.repeat(70));

  // Test a subset of chain pairs to avoid rate limiting
  const testPairs = [
    ['ethereum', 'base'],
    ['ethereum', 'arbitrum'],
    ['base', 'arbitrum'],
    ['arbitrum', 'polygon'],
    ['polygon', 'optimism'],
  ];

  for (const [fromName, toName] of testPairs) {
    const fromChain = SUPPORTED_CHAINS[fromName as keyof typeof SUPPORTED_CHAINS];
    const toChain = SUPPORTED_CHAINS[toName as keyof typeof SUPPORTED_CHAINS];

    if (!fromChain || !toChain) continue;

    console.log(`\n  ${fromChain.name} → ${toChain.name}`);
    
    try {
      const quoteRequest: BridgeQuoteRequest = {
        fromChainId: fromChain.chainId,
        toChainId: toChain.chainId,
        fromToken: fromChain.usdc,
        toToken: toChain.usdc,
        amount: TEST_AMOUNT,
        userAddress: TEST_ADDRESS,
      };

      const quote = await client.getQuote(quoteRequest);

      const toAmountFormatted = (parseInt(quote.toAmount) / 1e6).toFixed(2);
      const toAmountMinFormatted = (parseInt(quote.toAmountMin) / 1e6).toFixed(2);
      const minutes = Math.ceil(quote.estimatedTime / 60);

      console.log(`    ✅ Quote received`);
      console.log(`       Output: $${toAmountFormatted} USDC (min: $${toAmountMinFormatted})`);
      console.log(`       Bridge: ${quote.bridgeName}`);
      console.log(`       Time:   ~${minutes} min`);
      console.log(`       Gas:    $${quote.estimatedGas}`);

      results.push({
        from: fromChain.name,
        to: toChain.name,
        success: true,
        toAmount: toAmountFormatted,
        estimatedTime: quote.estimatedTime,
        bridge: quote.bridgeName,
        gasCost: quote.estimatedGas,
      });

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`    ❌ Failed: ${errorMsg}`);
      
      results.push({
        from: fromChain.name,
        to: toChain.name,
        success: false,
        error: errorMsg,
      });
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(70));
  console.log('                        RESULTS SUMMARY');
  console.log('═'.repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n  ✅ Successful quotes: ${successful.length}/${results.length}`);
  console.log(`  ❌ Failed quotes:     ${failed.length}/${results.length}`);

  if (successful.length > 0) {
    console.log('\n  📊 Bridge Comparison (for $100 USDC):');
    console.log('  ' + '─'.repeat(65));
    console.log('  Route                        │ Output   │ Time   │ Gas    │ Bridge');
    console.log('  ' + '─'.repeat(65));

    for (const r of successful) {
      const route = `${r.from} → ${r.to}`.padEnd(28);
      const output = `$${r.toAmount}`.padStart(7);
      const time = `${Math.ceil((r.estimatedTime ?? 0) / 60)}m`.padStart(5);
      const gas = `$${r.gasCost}`.padStart(6);
      const bridge = (r.bridge ?? 'Unknown').slice(0, 10);
      
      console.log(`  ${route} │ ${output} │ ${time} │ ${gas} │ ${bridge}`);
    }
    console.log('  ' + '─'.repeat(65));
  }

  if (failed.length > 0) {
    console.log('\n  ⚠️  Failed Routes:');
    for (const r of failed) {
      console.log(`     ${r.from} → ${r.to}: ${r.error}`);
    }
  }

  // Best route
  const bestRoute = successful.reduce((best, r) => {
    if (!best) return r;
    const bestOutput = parseFloat(best.toAmount ?? '0');
    const thisOutput = parseFloat(r.toAmount ?? '0');
    return thisOutput > bestOutput ? r : best;
  }, null as typeof successful[0] | null);

  if (bestRoute) {
    console.log(`\n  🏆 Best Route: ${bestRoute.from} → ${bestRoute.to}`);
    console.log(`     Via ${bestRoute.bridge}, output: $${bestRoute.toAmount} (~${Math.ceil((bestRoute.estimatedTime ?? 0) / 60)}m)`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('✅ Bridge test complete!\n');
}

main().catch(console.error);
