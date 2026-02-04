import { ethers } from 'ethers';
import { YieldPool } from '../../yields/types.js';

export interface DepositResult {
  txHash: string;
  amountDeposited: bigint;
  receiptStatus?: number;
}

export interface ProtocolAdapter {
  /** Human name (e.g. ERC4626) */
  readonly name: string;

  /** Quick eligibility check (cheap) */
  supports(pool: YieldPool): boolean;

  /** Strong validation (may do RPC calls) */
  validate(params: { signer: ethers.Signer; pool: YieldPool; asset: string }): Promise<void>;

  /** Deposit underlying asset into the yield position */
  deposit(params: {
    signer: ethers.Signer;
    pool: YieldPool;
    asset: string;
    amount: bigint;
  }): Promise<DepositResult>;
}

