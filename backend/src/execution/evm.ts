import { ethers } from 'ethers';

export function getRpcUrl(chainId: number): string | null {
  // Prefer explicit per-chain RPC env vars
  const key = `RPC_URL_${chainId}`;
  const byChain = process.env[key];
  if (byChain) return byChain;

  // Common fallbacks
  if (chainId === 1) return process.env.MAINNET_RPC_URL || null;
  if (chainId === 8453) return process.env.BASE_RPC_URL || null;
  if (chainId === 42161) return process.env.ARBITRUM_RPC_URL || null;
  if (chainId === 10) return process.env.OPTIMISM_RPC_URL || null;
  if (chainId === 137) return process.env.POLYGON_RPC_URL || null;

  // Testnet fallbacks (matching .env provided in repo)
  if (chainId === 11155111) return process.env.ALCHEMY_SEPOLIA_URL || process.env.SEPOLIA_RPC_URL || null;
  if (chainId === 84532) return process.env.ALCHEMY_BASE_URL || process.env.BASE_SEPOLIA_RPC_URL || null;
  if (chainId === 80002) return process.env.ALCHEMY_AMOY_URL || process.env.AMOY_RPC_URL || null;
  if (chainId === 421614) return process.env.ALCHEMY_ARBITRUM_URL || process.env.ARBITRUM_SEPOLIA_RPC_URL || null;

  return null;
}

export function getEvmSigner(chainId: number, privateKey?: string): ethers.Signer {
  const pk = privateKey || process.env.EVM_PRIVATE_KEY || '';
  if (!pk) {
    throw new Error('EVM_PRIVATE_KEY not set (required for on-chain deposits)');
  }

  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chainId ${chainId}. Set RPC_URL_${chainId}.`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  return new ethers.Wallet(pk, provider);
}

export function getUsdcAddress(chainId: number): string | null {
  // Canonical USDC by chain (mainnets)
  const map: Record<number, string> = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',     // Ethereum USDC
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base USDC
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum native USDC
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',     // Optimism USDC
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',    // Polygon USDC

    // Testnets (Aave address-book underlyings)
    11155111: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', // Sepolia USDC (Aave V3)
    84532: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',   // Base Sepolia USDC (Aave V3)
    421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',  // Arbitrum Sepolia USDC (Aave V3)
  };
  return map[chainId] ?? null;
}

export async function ensureErc20Approval(params: {
  signer: ethers.Signer;
  token: string;
  spender: string;
  amount: bigint;
}): Promise<void> {
  const erc20 = new ethers.Contract(
    params.token,
    [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
    ],
    params.signer
  );

  const owner = await params.signer.getAddress();
  const allowance: bigint = await erc20.allowance(owner, params.spender);
  if (allowance >= params.amount) return;

  const tx = await erc20.approve(params.spender, params.amount);
  await tx.wait();
}
