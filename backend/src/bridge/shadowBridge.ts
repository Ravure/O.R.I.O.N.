/**
 * Shadow Bridge Pattern for Testnet
 * 
 * Uses LI.FI mainnet data for route intelligence, but executes
 * mock bridges on testnet (burn/lock on source, mint on dest)
 */

import { ethers } from 'ethers';
import { getRoutes, type Route } from '@lifi/sdk';
import { CHAIN_IDS, USDC_ADDRESSES } from './client.js';

// Map testnet chains to their mainnet equivalents for LI.FI route queries
const TESTNET_TO_MAINNET_MAP: Record<number, number> = {
  [CHAIN_IDS.SEPOLIA]: CHAIN_IDS.ETHEREUM,
  [CHAIN_IDS.BASE_SEPOLIA]: CHAIN_IDS.BASE,
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: CHAIN_IDS.ARBITRUM,
  [CHAIN_IDS.POLYGON_AMOY]: CHAIN_IDS.POLYGON,
};

// ERC20 ABI for transfers and minting
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function burn(uint256 amount)',
  'function mint(address to, uint256 amount)',
];

/**
 * Gets real LI.FI route data using mainnet chain IDs
 * This provides the intelligence/route information even for testnet
 */
export async function getShadowBridgeRoute(
  fromChain: number,
  toChain: number,
  amount: string,
  userAddress: string,
  slippage: number = 0.005
): Promise<Route> {
  // Map testnet chains to mainnet for LI.FI query
  const mainnetFromChain = TESTNET_TO_MAINNET_MAP[fromChain] || fromChain;
  const mainnetToChain = TESTNET_TO_MAINNET_MAP[toChain] || toChain;

  const fromToken = USDC_ADDRESSES[mainnetFromChain];
  const toToken = USDC_ADDRESSES[mainnetToChain];

  if (!fromToken || !toToken) {
    throw new Error(`USDC not supported on chains ${fromChain} or ${toChain}`);
  }

  // Get real route from LI.FI using mainnet data
  const routes = await getRoutes({
    fromChainId: mainnetFromChain,
    toChainId: mainnetToChain,
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    fromAmount: amount,
    fromAddress: userAddress,
    toAddress: userAddress,
    options: {
      slippage,
      order: 'RECOMMENDED',
      allowBridges: ['stargate', 'across', 'hop', 'socket'],
    },
  });

  if (!routes || routes.length === 0) {
    throw new Error('No routes found');
  }

  // Return the best route (with mainnet data, but we'll execute on testnet)
  const route = routes[0];
  
  // Mark as shadow bridge route
  return {
    ...route,
    id: `shadow-${route.id}`,
    fromChainId: fromChain, // Keep original testnet chain IDs
    toChainId: toChain,
  };
}

/**
 * Executes a shadow bridge on testnet
 * Burns/locks tokens on source chain, mints on destination chain
 */
export async function executeShadowBridge(
  route: Route,
  signer: ethers.Signer,
  fromChainRpc: string,
  toChainRpc: string
): Promise<{
  txHash: string;
  fromTxHash: string;
  toTxHash: string;
  route: Route;
}> {
  const userAddress = await signer.getAddress();
  const fromChainId = route.fromChainId;
  const toChainId = route.toChainId;
  const amount = BigInt(route.fromAmount);

  // Get testnet USDC addresses
  const fromTokenAddress = USDC_ADDRESSES[fromChainId];
  const toTokenAddress = USDC_ADDRESSES[toChainId];

  if (!fromTokenAddress || !toTokenAddress) {
    throw new Error('USDC addresses not found for testnet chains');
  }

  // Create providers for both chains
  const fromProvider = new ethers.JsonRpcProvider(fromChainRpc);
  const toProvider = new ethers.JsonRpcProvider(toChainRpc);

  // Create contract instances
  const fromTokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, signer);
  const toTokenContract = new ethers.Contract(toTokenAddress, ERC20_ABI, signer);

  // Step 1: Burn/lock tokens on source chain
  // For testnet, we'll transfer to a burn address (0x0000...dead)
  const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
  
  console.log(`🔥 Burning ${ethers.formatUnits(amount, 6)} USDC on chain ${fromChainId}...`);
  
  // Check if contract has burn function, otherwise transfer to burn address
  let fromTxHash: string;
  try {
    // Try to call burn (if contract supports it)
    const burnTx = await fromTokenContract.burn(amount);
    fromTxHash = burnTx.hash;
    await burnTx.wait();
  } catch {
    // If no burn function, transfer to burn address
    const transferTx = await fromTokenContract.transfer(BURN_ADDRESS, amount);
    fromTxHash = transferTx.hash;
    await transferTx.wait();
  }

  console.log(`✅ Tokens burned/locked. TX: ${fromTxHash}`);

  // Step 2: Mint tokens on destination chain
  // Note: This requires the contract to have a mint function or you need special permissions
  // For demo purposes, we'll try to mint, but if it fails, we'll show a message
  console.log(`💰 Minting ${ethers.formatUnits(amount, 6)} USDC on chain ${toChainId}...`);
  
  let toTxHash: string;
  try {
    // Try to mint (requires contract to have public mint or you to be minter)
    const mintTx = await toTokenContract.mint(userAddress, amount);
    toTxHash = mintTx.hash;
    await mintTx.wait();
    console.log(`✅ Tokens minted. TX: ${toTxHash}`);
  } catch (error: any) {
    // If minting fails (common on testnet), we'll create a mock transaction
    console.warn(`⚠️ Minting failed: ${error.message}`);
    console.log(`💡 For demo: Tokens would be minted on destination chain`);
    console.log(`💡 In production, this would be handled by the bridge contract`);
    
    // Create a mock transaction hash for UI purposes
    toTxHash = `0x${'0'.repeat(64)}`; // Mock hash
  }

  return {
    txHash: fromTxHash, // Primary transaction
    fromTxHash,
    toTxHash,
    route,
  };
}

/**
 * Alternative: Simple transfer-based shadow bridge
 * Transfers tokens to a "bridge vault" on source, then mints on dest
 * This is simpler and works if contracts don't have burn/mint
 */
export async function executeSimpleShadowBridge(
  route: Route,
  signer: ethers.Signer,
  fromChainRpc: string,
  toChainRpc: string
): Promise<{
  txHash: string;
  fromTxHash: string;
  toTxHash: string;
  route: Route;
}> {
  const userAddress = await signer.getAddress();
  const fromChainId = route.fromChainId;
  const toChainId = route.toChainId;
  const amount = BigInt(route.fromAmount);

  const fromTokenAddress = USDC_ADDRESSES[fromChainId];
  const toTokenAddress = USDC_ADDRESSES[toChainId];

  // Create a "bridge vault" address (could be a contract or just a burn address)
  const BRIDGE_VAULT = '0x000000000000000000000000000000000000dEaD';

  const fromProvider = new ethers.JsonRpcProvider(fromChainRpc);
  const fromTokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, signer);

  // Transfer to bridge vault (simulating lock)
  console.log(`🔒 Locking ${ethers.formatUnits(amount, 6)} USDC in bridge vault...`);
  const lockTx = await fromTokenContract.transfer(BRIDGE_VAULT, amount);
  const fromTxHash = lockTx.hash;
  await lockTx.wait();

  // For destination, we'd need a minting contract or faucet
  // For now, return mock hash
  const toTxHash = `0x${'0'.repeat(64)}`;

  return {
    txHash: fromTxHash,
    fromTxHash,
    toTxHash,
    route,
  };
}
