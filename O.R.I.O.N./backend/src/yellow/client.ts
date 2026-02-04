import { NitroliteClient } from '@erc7824/nitrolite';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';
import {
  getNetworkConfig,
  DEFAULT_CHALLENGE_DURATION,
  CLEARNODE_WEBSOCKET_URL,
} from './config.js';

dotenv.config({ path: '../.env' });

/**
 * Yellow Network client for zero-fee state channel trading
 * Uses the Nitrolite SDK API for state channels
 */
export class YellowNetworkClient {
  private client: NitroliteClient;
  private privateKey: string;
  private account: ReturnType<typeof privateKeyToAccount>;
  private chainId: number;

  constructor(privateKey?: string, chainId: number = 11155111) {
    // Sepolia by default
    // Get private key from environment or parameter
    this.privateKey = privateKey || process.env.AGENT_PRIVATE_KEY || '';

    if (!this.privateKey) {
      throw new Error('AGENT_PRIVATE_KEY not found in .env file');
    }

    this.chainId = chainId;

    // Convert private key to account
    this.account = privateKeyToAccount(this.privateKey as `0x${string}`);

    // Get network configuration
    const networkConfig = getNetworkConfig(chainId);
    if (!networkConfig) {
      throw new Error(`No network configuration found for chainId ${chainId}`);
    }

    // Get RPC URL from environment
    const rpcUrl =
      process.env.ALCHEMY_SEPOLIA_URL ||
      process.env.SEPOLIA_RPC_URL ||
      'https://eth-sepolia.g.alchemy.com/v2/demo';

    console.log(`🌐 Network: ${networkConfig.name} (chainId: ${chainId})`);
    console.log(`📡 RPC: ${rpcUrl.slice(0, 50)}...`);
    console.log(`🔑 Account: ${this.account.address}`);
    console.log(
      `📝 Custody: ${networkConfig.custody.slice(0, 10)}...${networkConfig.custody.slice(-8)}`
    );
    console.log(
      `⚖️  Adjudicator: ${networkConfig.adjudicator.slice(0, 10)}...${networkConfig.adjudicator.slice(-8)}\n`
    );

    // Create viem clients
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account: this.account,
      chain: sepolia,
      transport: http(rpcUrl),
    });

    // Initialize Nitrolite client with correct parameters
    this.client = new NitroliteClient({
      publicClient,
      walletClient,
      stateSigner: this.account, // Use account as state signer
      addresses: {
        custody: networkConfig.custody,
        adjudicator: networkConfig.adjudicator,
      },
      chainId: networkConfig.chainId,
      challengeDuration: DEFAULT_CHALLENGE_DURATION,
    });
  }

  /**
   * Gets the client instance (for advanced usage)
   */
  getClient(): NitroliteClient {
    return this.client;
  }

  /**
   * Gets the account address
   */
  getAddress(): string {
    return this.account.address;
  }

  /**
   * Deposits tokens into the custody contract
   * This is required before creating channels
   */
  async deposit(tokenAddress: string, amount: bigint): Promise<string> {
    try {
      console.log(`💰 Depositing ${amount} of token ${tokenAddress}...`);
      const txHash = await this.client.deposit(tokenAddress as `0x${string}`, amount);
      console.log(`✅ Deposit transaction: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('❌ Deposit failed:', error);
      throw error;
    }
  }

  /**
   * Gets account balance in the custody contract
   */
  async getAccountBalance(tokenAddress: string): Promise<bigint> {
    try {
      const balance = await this.client.getAccountBalance(tokenAddress as `0x${string}`);
      return balance;
    } catch (error) {
      console.error('❌ Failed to get account balance:', error);
      throw error;
    }
  }

  /**
   * Creates a new channel
   * This is the first step for state channel operations
   */
  async createChannel(params: any): Promise<any> {
    try {
      console.log('📡 Creating channel...');
      const result = await this.client.createChannel(params);
      console.log(`✅ Channel created: ${result.channelId}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to create channel:', error);
      throw error;
    }
  }

  /**
   * Gets all open channels for this account
   */
  async getOpenChannels(): Promise<string[]> {
    try {
      const channels = await this.client.getOpenChannels();
      return channels;
    } catch (error) {
      console.error('❌ Failed to get open channels:', error);
      throw error;
    }
  }

  /**
   * Gets channel data
   */
  async getChannelData(channelId: string): Promise<any> {
    try {
      const data = await this.client.getChannelData(channelId as `0x${string}`);
      return data;
    } catch (error) {
      console.error('❌ Failed to get channel data:', error);
      throw error;
    }
  }

  /**
   * Closes a channel
   */
  async closeChannel(params: any): Promise<string> {
    try {
      console.log('🔒 Closing channel...');
      const txHash = await this.client.closeChannel(params);
      console.log(`✅ Channel closed: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('❌ Failed to close channel:', error);
      throw error;
    }
  }

  /**
   * Approves tokens for the custody contract
   */
  async approveTokens(tokenAddress: string, amount: bigint): Promise<string> {
    try {
      console.log(`✅ Approving ${amount} of token ${tokenAddress}...`);
      const txHash = await this.client.approveTokens(
        tokenAddress as `0x${string}`,
        amount
      );
      console.log(`✅ Approval transaction: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('❌ Approval failed:', error);
      throw error;
    }
  }

  /**
   * Gets token allowance for the custody contract
   */
  async getTokenAllowance(tokenAddress: string): Promise<bigint> {
    try {
      const allowance = await this.client.getTokenAllowance(
        tokenAddress as `0x${string}`
      );
      return allowance;
    } catch (error) {
      console.error('❌ Failed to get token allowance:', error);
      throw error;
    }
  }

  /**
   * Gets token balance in wallet
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    try {
      const balance = await this.client.getTokenBalance(tokenAddress as `0x${string}`);
      return balance;
    } catch (error) {
      console.error('❌ Failed to get token balance:', error);
      throw error;
    }
  }

  /**
   * Withdraws tokens from the custody contract
   */
  async withdraw(tokenAddress: string, amount: bigint): Promise<string> {
    try {
      console.log(`💸 Withdrawing ${amount} of token ${tokenAddress}...`);
      const txHash = await this.client.withdrawal(tokenAddress as `0x${string}`, amount);
      console.log(`✅ Withdrawal transaction: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('❌ Withdrawal failed:', error);
      throw error;
    }
  }

  /**
   * Estimates gas savings compared to on-chain transactions
   */
  calculateGasSavings(
    numberOfOperations: number,
    estimatedGasPerOperation: number = 3.5
  ): {
    totalSaved: number;
    savingsPercentage: number;
  } {
    const totalSaved = numberOfOperations * estimatedGasPerOperation;
    return {
      totalSaved,
      savingsPercentage: 100, // State channels have zero gas for off-chain operations!
    };
  }
}
