/**
 * Live on-chain yield deposit (no simulation).
 *
 * Requirements:
 * - EVM_PRIVATE_KEY set (wallet that holds USDC on the target chain)
 * - RPC_URL_<chainId> set (e.g. RPC_URL_8453 for Base)
 *
 * This script:
 * - Scans DeFiLlama yields
 * - Finds the first pool with a detectable contract address (poolAddress)
 * - Verifies ERC4626(asset == USDC)
 * - Deposits as much as possible up to MAX_DEPOSIT_USD (defaults to 10)
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { YieldScanner } from '../yields/scanner.js';
import { YieldExecutionEngine } from '../execution/yieldExecution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main(): Promise<void> {
  const maxDepositUsd = Number(process.env.MAX_DEPOSIT_USD || '10');
  const scanner = new YieldScanner({ minTvlUsd: 100_000, minApy: 1, maxApy: 200, stablecoinOnly: true });
  const engine = new YieldExecutionEngine();

  if (!process.env.EVM_PRIVATE_KEY) {
    console.error('❌ Missing EVM_PRIVATE_KEY. This is required for real on-chain deposits.');
    console.error('   Set it in `.env` along with `RPC_URL_<chainId>` (e.g. RPC_URL_8453 for Base).');
    process.exit(1);
  }

  const scan = await scanner.scanAllChains(true);
  // Prefer protocols we can *actually* execute today (AaveV3, ERC4626).
  const prioritized = scan.allPools
    .filter(p => {
      const proto = (p.protocol || '').toLowerCase();
      return proto === 'aave-v3' || !!p.poolAddress; // ERC4626 needs poolAddress
    })
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 150);

  for (const pool of prioritized) {
    const ok = await engine.isDepositable(pool);
    if (!ok.ok) continue;

    console.log(`✅ Depositable pool found: ${pool.project} ${pool.chain} ${pool.symbol}`);
    if (pool.poolAddress) console.log(`   poolAddress: ${pool.poolAddress}`);
    console.log(`   APY: ${pool.apy.toFixed(2)}% | TVL: $${pool.tvlUsd.toFixed(0)}`);

    const amount = Math.max(1, Math.floor(maxDepositUsd));
    console.log(`\n⛓️ Depositing ~$${amount} USDC into ${ok.adapter} vault...`);

    const res = await engine.depositMaxIntoPool({
      pool,
      chainId: pool.chainId,
      amountUsd: amount,
    });

    console.log(`\n✅ Deposit submitted: ${res.txHash}`);
    process.exit(0);
  }

  console.log('No depositable pool found with current adapters/config.');
  console.log('If you expected Aave deposits to work, make sure the RPC for that chain is configured.');
  process.exit(1);
}

main().catch((e) => {
  console.error('❌ liveYieldDeposit failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

