import { ethers } from 'ethers';
import {
  AaveV3Arbitrum,
  AaveV3ArbitrumSepolia,
  AaveV3Base,
  AaveV3BaseSepolia,
  AaveV3Ethereum,
  AaveV3Optimism,
  AaveV3Polygon,
  AaveV3Sepolia,
} from '@bgd-labs/aave-address-book';
import { YieldPool } from '../../yields/types.js';
import { ensureErc20Approval } from '../evm.js';
import { DepositResult, ProtocolAdapter } from './types.js';

const AAVE_V3_POOL_BY_CHAIN: Record<number, string> = {
  1: (AaveV3Ethereum as any).POOL,
  8453: (AaveV3Base as any).POOL,
  42161: (AaveV3Arbitrum as any).POOL,
  10: (AaveV3Optimism as any).POOL,
  137: (AaveV3Polygon as any).POOL,
  11155111: (AaveV3Sepolia as any).POOL,
  84532: (AaveV3BaseSepolia as any).POOL,
  421614: (AaveV3ArbitrumSepolia as any).POOL,
};

export class AaveV3Adapter implements ProtocolAdapter {
  readonly name = 'AaveV3';

  supports(pool: YieldPool): boolean {
    const proto = (pool.protocol || '').toLowerCase();
    const proj = (pool.project || '').toLowerCase();
    return proto === 'aave-v3' || proj.includes('aave') || proj.includes('aave-v3');
  }

  async validate(params: { signer: ethers.Signer; pool: YieldPool; asset: string }): Promise<void> {
    const chainId = params.pool.chainId;
    const aavePool = AAVE_V3_POOL_BY_CHAIN[chainId];
    if (!aavePool) {
      throw new Error(`Aave V3 not supported on chainId ${chainId} in this adapter`);
    }

    // Basic sanity check that the pool is callable and the reserve exists.
    const poolContract = new ethers.Contract(
      aavePool,
      [
        'function getReserveData(address asset) view returns (tuple(uint256,uint128,uint128,uint128,uint128,uint128,uint40,address,address,address,address,uint8))',
      ],
      params.signer
    );

    // Will throw if asset not supported or RPC misconfigured.
    await poolContract.getReserveData(params.asset);
  }

  async deposit(params: { signer: ethers.Signer; pool: YieldPool; asset: string; amount: bigint }): Promise<DepositResult> {
    const chainId = params.pool.chainId;
    const aavePool = AAVE_V3_POOL_BY_CHAIN[chainId];
    if (!aavePool) {
      throw new Error(`Aave V3 not supported on chainId ${chainId} in this adapter`);
    }

    const receiver = await params.signer.getAddress();

    await ensureErc20Approval({
      signer: params.signer,
      token: params.asset,
      spender: aavePool,
      amount: params.amount,
    });

    const poolContract = new ethers.Contract(
      aavePool,
      ['function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)'],
      params.signer
    );

    const tx = await poolContract.supply(params.asset, params.amount, receiver, 0);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      amountDeposited: params.amount,
      receiptStatus: receipt?.status ?? undefined,
    };
  }
}

