/**
 * Free, real on-chain testing on Aave V3 testnets.
 *
 * Default: Sepolia (chainId 11155111) because Aave provides a faucet there.
 *
 * What it does:
 * - Uses Aave faucet (if available) to mint USDC test tokens
 * - Approves Aave Pool
 * - Supplies USDC into Aave V3 (ownership stays with your EVM wallet; you receive aUSDC)
 *
 * Env required:
 * - EVM_PRIVATE_KEY
 * - RPC_URL_11155111 (or RPC_URL_<CHAIN_ID>)
 *
 * Optional env:
 * - CHAIN_ID (11155111 | 84532 | 421614)  (default 11155111)
 * - MINT_USDC (default 1000)   // USDC units (not micro)
 * - DEPOSIT_USDC (default 10)  // USDC units (not micro)
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import {
  AaveV3Sepolia,
  AaveV3BaseSepolia,
  AaveV3ArbitrumSepolia,
} from '@bgd-labs/aave-address-book';
import { getEvmSigner, getRpcUrl, getUsdcAddress, ensureErc20Approval } from '../execution/evm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

type Market = typeof AaveV3Sepolia;

function getMarket(chainId: number): Market {
  if (chainId === 11155111) return AaveV3Sepolia as any;
  if (chainId === 84532) return AaveV3BaseSepolia as any;
  if (chainId === 421614) return AaveV3ArbitrumSepolia as any;
  throw new Error(`Unsupported CHAIN_ID ${chainId}. Use 11155111 (Sepolia), 84532 (Base Sepolia), 421614 (Arbitrum Sepolia).`);
}

async function main(): Promise<void> {
  const chainId = Number(process.env.CHAIN_ID || '11155111');
  const mintUsdc = Number(process.env.MINT_USDC || '1000');
  const depositUsdc = Number(process.env.DEPOSIT_USDC || '10');

  if (!process.env.EVM_PRIVATE_KEY) {
    throw new Error('Missing EVM_PRIVATE_KEY');
  }
  const rpc = getRpcUrl(chainId);
  if (!rpc) {
    throw new Error(`Missing RPC_URL_${chainId}`);
  }

  const market = getMarket(chainId) as any;
  const poolAddress: string = market.POOL;
  const faucetAddress: string | undefined = market.FAUCET;
  const usdc = getUsdcAddress(chainId);
  if (!usdc) throw new Error(`No USDC mapping for chainId ${chainId}`);

  const signer = getEvmSigner(chainId);
  const addr = await signer.getAddress();

  console.log(`\n🧪 Aave Testnet Mint+Deposit`);
  console.log(`   ChainId:  ${chainId}`);
  console.log(`   Wallet:   ${addr}`);
  console.log(`   RPC:      ${rpc}`);
  console.log(`   AavePool:  ${poolAddress}`);
  console.log(`   USDC:      ${usdc}`);
  console.log(`   Faucet:    ${faucetAddress ?? '(none)'}`);

  const usdcContract = new ethers.Contract(
    usdc,
    [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ],
    signer
  );

  const decimals: number = await usdcContract.decimals();
  if (decimals !== 6) {
    console.warn(`⚠️ USDC decimals = ${decimals} (expected 6). Proceeding anyway.`);
  }

  const balBefore: bigint = await usdcContract.balanceOf(addr);
  console.log(`\n💰 USDC balance before: ${(Number(balBefore) / 1e6).toFixed(6)}`);

  // Mint (if faucet available)
  if (faucetAddress) {
    const faucet = new ethers.Contract(
      faucetAddress,
      ['function mint(address _token, uint256 _amount) payable returns (uint256)'],
      signer
    );

    const mintAmount: bigint = BigInt(Math.floor(mintUsdc * 1_000_000));
    console.log(`\n🚰 Minting ${mintUsdc} USDC via Aave faucet...`);
    const tx = await faucet.mint(usdc, mintAmount);
    console.log(`   tx: ${tx.hash}`);
    await tx.wait();
  } else {
    console.log(`\nℹ️ No Aave faucet for this chain in address-book. You must acquire test USDC elsewhere.`);
  }

  const balMid: bigint = await usdcContract.balanceOf(addr);
  console.log(`💰 USDC balance now: ${(Number(balMid) / 1e6).toFixed(6)}`);

  const depositAmount: bigint = BigInt(Math.floor(depositUsdc * 1_000_000));
  if (balMid < depositAmount) {
    throw new Error(`Not enough USDC to deposit. Have ${(Number(balMid) / 1e6).toFixed(6)}, need ${depositUsdc}.`);
  }

  // Approve + supply into Aave
  console.log(`\n✅ Approving Aave Pool to spend ${depositUsdc} USDC...`);
  await ensureErc20Approval({
    signer,
    token: usdc,
    spender: poolAddress,
    amount: depositAmount,
  });

  console.log(`\n🏦 Supplying ${depositUsdc} USDC into Aave V3...`);
  const pool = new ethers.Contract(
    poolAddress,
    ['function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)'],
    signer
  );

  const tx2 = await pool.supply(usdc, depositAmount, addr, 0);
  console.log(`   tx: ${tx2.hash}`);
  const receipt = await tx2.wait();
  if (!receipt || receipt.status === 0) throw new Error('Supply transaction failed');

  const balAfter: bigint = await usdcContract.balanceOf(addr);
  console.log(`\n✅ Done.`);
  console.log(`💰 USDC balance after: ${(Number(balAfter) / 1e6).toFixed(6)}`);
  console.log(`(You should now hold aUSDC in your wallet.)\n`);
}

main().catch((e) => {
  console.error(`\n❌ testnetAaveMintAndDeposit failed:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
