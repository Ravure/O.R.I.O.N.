import { ethers } from 'ethers';
import { YieldPool } from '../../yields/types.js';
import { ensureErc20Approval } from '../evm.js';
import { ProtocolAdapter, DepositResult } from './types.js';

export class Erc4626Adapter implements ProtocolAdapter {
  readonly name = 'ERC4626';

  supports(pool: YieldPool): boolean {
    // Needs a contract address we can call.
    return !!pool.poolAddress && /^0x[a-fA-F0-9]{40}$/.test(pool.poolAddress);
  }

  async validate(params: { signer: ethers.Signer; pool: YieldPool; asset: string }): Promise<void> {
    const vault = new ethers.Contract(
      params.pool.poolAddress!,
      [
        'function asset() view returns (address)',
        'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
      ],
      params.signer
    );

    const vaultAsset: string = await vault.asset();
    if (vaultAsset.toLowerCase() !== params.asset.toLowerCase()) {
      throw new Error(`ERC4626 asset mismatch. Vault asset=${vaultAsset}, expected=${params.asset}`);
    }
  }

  async deposit(params: {
    signer: ethers.Signer;
    pool: YieldPool;
    asset: string;
    amount: bigint;
  }): Promise<DepositResult> {
    const vaultAddress = params.pool.poolAddress!;
    const receiver = await params.signer.getAddress();

    await ensureErc20Approval({
      signer: params.signer,
      token: params.asset,
      spender: vaultAddress,
      amount: params.amount,
    });

    const vault = new ethers.Contract(
      vaultAddress,
      ['function deposit(uint256 assets, address receiver) returns (uint256 shares)'],
      params.signer
    );

    const tx = await vault.deposit(params.amount, receiver);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      amountDeposited: params.amount,
      receiptStatus: receipt?.status ?? undefined,
    };
  }
}

