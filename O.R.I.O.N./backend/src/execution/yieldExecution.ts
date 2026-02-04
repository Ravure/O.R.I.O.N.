import { ethers } from 'ethers';
import { YieldPool } from '../yields/types.js';
import { getEvmSigner, getUsdcAddress } from './evm.js';
import { ProtocolAdapter } from './protocolAdapters/types.js';
import { Erc4626Adapter } from './protocolAdapters/erc4626.js';
import { AaveV3Adapter } from './protocolAdapters/aaveV3.js';

export class YieldExecutionEngine {
  private adapters: ProtocolAdapter[];

  constructor(adapters?: ProtocolAdapter[]) {
    this.adapters = adapters ?? [
      new AaveV3Adapter(),
      new Erc4626Adapter(),
    ];
  }

  /**
   * Attempt an on-chain deposit into the pool.
   * Throws if not possible/configured.
   */
  async depositMaxIntoPool(params: {
    pool: YieldPool;
    chainId: number;
    amountUsd: number;
  }): Promise<{ adapter: string; txHash: string }> {
    const pool = params.pool;

    const signer = getEvmSigner(params.chainId);
    const usdc = getUsdcAddress(params.chainId);
    if (!usdc) {
      throw new Error(`No USDC address mapping for chainId ${params.chainId}`);
    }

    // USDC has 6 decimals (assumption for these chains)
    const amount = BigInt(Math.floor(params.amountUsd * 1_000_000));
    if (amount <= 0n) throw new Error('Deposit amount too small');

    // Choose adapter
    const adapter = this.adapters.find(a => a.supports(pool));
    if (!adapter) {
      throw new Error('No protocol adapter supports this pool');
    }

    await adapter.validate({ signer, pool, asset: usdc });
    const res = await adapter.deposit({ signer, pool, asset: usdc, amount });
    if (res.receiptStatus === 0) {
      throw new Error('Deposit transaction reverted');
    }

    return { adapter: adapter.name, txHash: res.txHash };
  }

  /**
   * Read-only check: is pool depositable via any adapter (may do RPC calls).
   */
  async isDepositable(pool: YieldPool): Promise<{ ok: boolean; adapter?: string; reason?: string }> {
    // We can only validate with a signer/provider; require RPC configured.
    try {
      const signer = getEvmSigner(pool.chainId);
      const usdc = getUsdcAddress(pool.chainId);
      if (!usdc) return { ok: false, reason: `no USDC mapping for chainId ${pool.chainId}` };

      for (const adapter of this.adapters) {
        if (!adapter.supports(pool)) continue;
        try {
          await adapter.validate({ signer, pool, asset: usdc });
          return { ok: true, adapter: adapter.name };
        } catch (e: any) {
          return { ok: false, adapter: adapter.name, reason: e?.message || 'validate failed' };
        }
      }

      return { ok: false, reason: 'no adapter supports pool' };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'missing EVM config' };
    }
  }
}

