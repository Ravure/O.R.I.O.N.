/**
 * Yellow Network Integration for ORION
 *
 * Real integration with Yellow Network's ClearNode using @erc7824/nitrolite SDK.
 * Connects to the sandbox endpoint for testing.
 */

import { type Address, type Hex, createWalletClient, custom, getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import {
  createAuthRequestMessage,
  createAppSessionMessage,
  createCloseAppSessionMessage,
} from '@erc7824/nitrolite';

// EIP-712 types from @erc7824/nitrolite SDK
const EIP712AuthTypes = {
  Policy: [
    { name: 'challenge', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'session_key', type: 'address' },
    { name: 'expires_at', type: 'uint64' },
    { name: 'allowances', type: 'Allowance[]' },
  ],
  Allowance: [
    { name: 'asset', type: 'string' },
    { name: 'amount', type: 'string' },
  ],
} as const;

// ClearNode WebSocket endpoints
export const CLEARNODE_ENDPOINTS = {
  sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
  production: 'wss://clearnet.yellow.com/ws',
} as const;

// Supported assets on Yellow Network (Sepolia testnet)
export const YELLOW_ASSETS = {
  YTEST_USD: 'ytest.usd',
} as const;

// Chain IDs supported by sandbox
export const SUPPORTED_CHAINS = {
  ETHEREUM_SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  LINEA_SEPOLIA: 59141,
  POLYGON_AMOY: 80002,
} as const;

export interface YellowNetworkConfig {
  endpoint: string;
  onMessage?: (method: string, data: any) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onAuthChallenge?: (challenge: string) => void;
  onAuthenticated?: () => void;
}

export interface TradingStats {
  totalTrades: number;
  totalVolume: number;
  savedGas: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'authenticated';

/**
 * Yellow Network Client for browser environments
 * Implements real authentication flow with ClearNode using @erc7824/nitrolite SDK
 */
export class YellowNetworkClient {
  private ws: WebSocket | null = null;
  private config: YellowNetworkConfig;
  private userAddress: Address | null = null;
  private sessionKey: Address | null = null;
  private sessionPrivateKey: Hex | null = null;
  private status: ConnectionStatus = 'disconnected';
  private stats: TradingStats = { totalTrades: 0, totalVolume: 0, savedGas: 0 };
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private jwtToken: string | null = null;

  constructor(config: Partial<YellowNetworkConfig> = {}) {
    this.config = {
      endpoint: CLEARNODE_ENDPOINTS.sandbox,
      ...config,
    };
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get user address
   */
  getUserAddress(): Address | null {
    return this.userAddress;
  }

  /**
   * Get JWT token
   */
  getJwtToken(): string | null {
    return this.jwtToken;
  }

  /**
   * Get session key address
   */
  getSessionKey(): Address | null {
    return this.sessionKey;
  }

  /**
   * Get trading statistics
   */
  getStats(): TradingStats {
    return { ...this.stats };
  }

  /**
   * Connect wallet and get address
   */
  async setupWalletSigner(): Promise<{ address: Address }> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }

    // Checksum the address for consistent EIP-712 signing
    const address = getAddress(accounts[0]) as Address;
    this.userAddress = address;

    return { address };
  }

  /**
   * Connect to ClearNode WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('Already connected to ClearNode');
      return;
    }

    this.status = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint);

        this.ws.onopen = () => {
          console.log('Connected to ClearNode:', this.config.endpoint);
          this.status = 'connected';
          this.config.onConnected?.();
          this.startPingInterval();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          const err = new Error('WebSocket connection error');
          this.config.onError?.(err);
          reject(err);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from ClearNode');
          this.status = 'disconnected';
          this.stopPingInterval();
          this.config.onDisconnected?.();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this.jwtToken = null;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);
      console.log('Received from ClearNode:', parsed);

      // Handle Yellow Network's response format: { res: [id, method, data, timestamp], sig: [...] }
      if (parsed.res && Array.isArray(parsed.res)) {
        const [_resId, method, responseData] = parsed.res;
        // Notify listener
        this.config.onMessage?.(method, responseData);
      }
    } catch (error) {
      console.error('Failed to parse message:', error, data);
    }
  }

  /**
   * Send a raw message
   */
  private sendRaw(message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to ClearNode');
    }
    console.log('Sending to ClearNode:', message);
    this.ws.send(message);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const message = { req: [Date.now(), 'ping', {}, Date.now()] };
        this.ws.send(JSON.stringify(message));
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Wait for a specific method response
   */
  private waitForMethod(method: string, timeoutMs: number = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);

      const originalHandler = this.config.onMessage;

      const cleanup = () => {
        clearTimeout(timeout);
        this.config.onMessage = originalHandler;
      };

      this.config.onMessage = (receivedMethod: string, data: any) => {
        originalHandler?.(receivedMethod, data);

        if (receivedMethod === method) {
          cleanup();
          resolve(data);
        } else if (receivedMethod === 'error') {
          cleanup();
          reject(new Error(data?.error || 'Unknown error'));
        }
      };
    });
  }

  /**
   * Authenticate with ClearNode using @erc7824/nitrolite SDK
   * Following the official documentation flow
   */
  async authenticate(): Promise<void> {
    if (!this.userAddress) {
      throw new Error('Wallet not connected. Call setupWalletSigner first.');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to ClearNode');
    }

    if (!window.ethereum) {
      throw new Error('MetaMask not found');
    }

    this.status = 'authenticating';

    try {
      // Generate a fresh session key to avoid "session key already exists" errors
      this.sessionPrivateKey = generatePrivateKey();
      const sessionAccount = privateKeyToAccount(this.sessionPrivateKey);
      this.sessionKey = sessionAccount.address;

      // Auth parameters
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hours
      const scope = 'console';
      const application = 'ORION';
      const allowances = [
        { asset: YELLOW_ASSETS.YTEST_USD, amount: '1000000000' },
      ];

      // Step 1: Create and send auth_request using SDK
      console.log('Step 1: Creating auth_request with SDK...');
      console.log('Wallet:', this.userAddress);
      console.log('Session Key:', this.sessionKey);
      const authRequestMsg = await createAuthRequestMessage({
        address: this.userAddress,
        session_key: this.sessionKey,
        application,
        allowances,
        expires_at: expiresAt,
        scope,
      });
      console.log('Auth request message:', authRequestMsg);
      this.sendRaw(authRequestMsg);

      // Step 2: Wait for auth_challenge response
      const challengeData = await this.waitForMethod('auth_challenge', 15000);
      console.log('Step 2: Got challenge:', challengeData);

      // Server sends challenge_message (snake_case)
      const challengeMessage = challengeData.challenge_message || challengeData.challengeMessage;
      if (!challengeMessage) {
        throw new Error('No challenge message received');
      }
      this.config.onAuthChallenge?.(challengeMessage);

      // Step 3: Create viem wallet client and sign with EIP-712
      console.log('Step 3: Creating wallet client for EIP-712 signing...');
      console.log('=== AUTH PARAMS (must match between request and signature) ===');
      console.log('Wallet address:', this.userAddress);
      console.log('Session key:', this.sessionKey);
      console.log('Scope:', scope);
      console.log('Application:', application);
      console.log('Expires at:', expiresAt.toString());
      console.log('Allowances:', JSON.stringify(allowances));
      console.log('Challenge:', challengeMessage);
      console.log('============================================================');

      // Create wallet client with MetaMask (no account - let MetaMask handle it)
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      });

      // EIP-712 message to sign - MUST match the auth_request params
      const message = {
        challenge: challengeMessage,
        scope: scope,
        wallet: this.userAddress!,
        session_key: this.sessionKey!,
        expires_at: expiresAt,
        allowances: allowances,
      };

      console.log('EIP-712 Full Data:');
      console.log('  Domain:', JSON.stringify({ name: application }));
      console.log('  Types:', JSON.stringify(EIP712AuthTypes));
      console.log('  Message:', JSON.stringify(message, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v, 2));

      // Sign with viem (handles MetaMask interaction)
      // Pass account explicitly so viem knows which address to sign with
      const signature = await walletClient.signTypedData({
        account: this.userAddress!,
        domain: { name: application },
        types: EIP712AuthTypes,
        primaryType: 'Policy',
        message: message,
      });
      console.log('Signature:', signature);

      // Step 4: Create auth_verify message
      const requestId = Date.now();
      const authVerifyMsg = JSON.stringify({
        req: [requestId, 'auth_verify', { challenge: challengeMessage }, Date.now()],
        sig: [signature],
      });
      console.log('Auth verify message:', authVerifyMsg);
      this.sendRaw(authVerifyMsg);

      // Step 6: Wait for auth_verify response
      const authResult = await this.waitForMethod('auth_verify', 15000);
      console.log('Auth result:', authResult);

      // Handle different response formats: jwt_token (snake_case) or jwtToken/jwt
      const token = authResult.jwt_token || authResult.jwtToken || authResult.jwt;

      if (authResult.success && token) {
        console.log('Authentication successful! Got JWT token.');
        this.jwtToken = token;
        this.status = 'authenticated';
        this.config.onAuthenticated?.();

        // Store JWT for reconnection
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('clearnode_jwt', token);
        }
      } else if (token) {
        // Alternative response format without success field
        console.log('Authentication successful! Got JWT token.');
        this.jwtToken = token;
        this.status = 'authenticated';
        this.config.onAuthenticated?.();

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('clearnode_jwt', token);
        }
      } else {
        throw new Error('Authentication failed: No JWT received');
      }

    } catch (error: any) {
      this.status = 'connected';
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Get available assets from ClearNode
   */
  async getAssets(): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

      const originalHandler = this.config.onMessage;
      this.config.onMessage = (method, data) => {
        originalHandler?.(method, data);
        if (method === 'get_assets' || method === 'assets') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          resolve(data);
        }
      };

      const message = { req: [Date.now(), 'get_assets', {}, Date.now()] };
      this.sendRaw(JSON.stringify(message));
    });
  }

  /**
   * Get user's channels
   */
  async getChannels(): Promise<any> {
    if (!this.userAddress) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

      const originalHandler = this.config.onMessage;
      this.config.onMessage = (method, data) => {
        originalHandler?.(method, data);
        if (method === 'get_channels' || method === 'channels') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          resolve(data);
        } else if (method === 'error') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          reject(new Error(data?.error || 'Failed to get channels'));
        }
      };

      const message = {
        req: [Date.now(), 'get_channels', { participant: this.userAddress }, Date.now()]
      };
      this.sendRaw(JSON.stringify(message));
    });
  }

  /**
   * Get user's ledger balances (funds available for trading)
   */
  async getLedgerBalances(): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

      const originalHandler = this.config.onMessage;
      this.config.onMessage = (method, data) => {
        originalHandler?.(method, data);
        if (method === 'get_ledger_balances') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          resolve(data);
        } else if (method === 'error') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          reject(new Error(data?.error || 'Failed to get balances'));
        }
      };

      const message = { req: [Date.now(), 'get_ledger_balances', {}, Date.now()] };
      this.sendRaw(JSON.stringify(message));
    });
  }

  /**
   * Get existing app sessions
   */
  async getAppSessions(): Promise<any> {
    if (!this.userAddress) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

      const originalHandler = this.config.onMessage;
      this.config.onMessage = (method, data) => {
        originalHandler?.(method, data);
        if (method === 'get_app_sessions') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          resolve(data);
        } else if (method === 'error') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          reject(new Error(data?.error || 'Failed to get app sessions'));
        }
      };

      const message = {
        req: [Date.now(), 'get_app_sessions', { participant: this.userAddress }, Date.now()]
      };
      this.sendRaw(JSON.stringify(message));
    });
  }

  /**
   * Create a message signer for app session operations
   * This uses personal_sign via MetaMask
   */
  private createMessageSigner(): (payload: any) => Promise<Hex> {
    if (!this.userAddress || !window.ethereum) {
      throw new Error('Wallet not connected');
    }

    return async (payload: any): Promise<Hex> => {
      // Serialize payload to string and sign it
      const message = JSON.stringify(payload, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      );

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, this.userAddress],
      }) as Hex;

      return signature;
    };
  }

  /**
   * Create an app session for trading
   * This is where real trading happens after authentication
   */
  async createAppSession(counterpartyAddress: Address, initialAmount: string): Promise<any> {
    if (!this.userAddress) {
      throw new Error('Not authenticated');
    }

    if (this.status !== 'authenticated') {
      throw new Error('Must be authenticated to create app session');
    }

    const signer = this.createMessageSigner();

    // App definition for a simple trading session
    const definition = {
      application: 'ORION-trading',
      protocol: 'NitroRPC-0.2' as const,
      participants: [this.userAddress, counterpartyAddress] as Hex[],
      weights: [50, 50],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
    };

    // Initial allocations - both parties start with equal amounts
    const allocations = [
      {
        participant: this.userAddress,
        asset: YELLOW_ASSETS.YTEST_USD,
        amount: initialAmount,
      },
      {
        participant: counterpartyAddress,
        asset: YELLOW_ASSETS.YTEST_USD,
        amount: initialAmount,
      },
    ];

    console.log('Creating app session with:', { definition, allocations });

    // Create the signed message using SDK
    const sessionMessage = await createAppSessionMessage(
      signer,
      { definition, allocations }
    );

    console.log('App session message:', sessionMessage);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout creating app session')), 15000);

      const originalHandler = this.config.onMessage;
      this.config.onMessage = (method, data) => {
        originalHandler?.(method, data);
        if (method === 'create_app_session') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          console.log('App session created:', data);
          resolve(data);
        } else if (method === 'error') {
          clearTimeout(timeout);
          this.config.onMessage = originalHandler;
          reject(new Error(data?.error || 'Failed to create app session'));
        }
      };

      this.sendRaw(sessionMessage);
    });
  }

  /**
   * Execute a real trade through Yellow Network
   * For now, this simulates the trade but shows the real flow
   */
  async executeTrade(fromAsset: string, toAsset: string, amount: number): Promise<{
    success: boolean;
    gasSaved: number;
    txId: string;
    simulated: boolean;
  }> {
    if (this.status !== 'authenticated') {
      throw new Error('Must be authenticated to trade');
    }

    // For real trading, we would:
    // 1. Check channel balance
    // 2. Create app session if needed
    // 3. Submit state update (the actual trade)
    // 4. Get counterparty signature

    // For now, simulate but mark as simulated
    const gasSaved = 11.25;
    const txId = `0x${Math.random().toString(16).slice(2, 18)}`;

    this.stats.totalTrades++;
    this.stats.totalVolume += amount;
    this.stats.savedGas += gasSaved;

    console.log(`Trade executed: ${amount} ${fromAsset} -> ${toAsset}`);

    return {
      success: true,
      gasSaved,
      txId,
      simulated: true, // Mark as simulated until we have channel funds
    };
  }

  /**
   * Simulate a trade (legacy method for compatibility)
   */
  simulateTrade(_fromAsset: string, _toAsset: string, amount: number): {
    success: boolean;
    gasSaved: number;
    txId: string;
  } {
    const gasSaved = 11.25;
    const txId = `0x${Math.random().toString(16).slice(2, 18)}`;

    this.stats.totalTrades++;
    this.stats.totalVolume += amount;
    this.stats.savedGas += gasSaved;

    return { success: true, gasSaved, txId };
  }
}

// Export singleton instance
export const yellowNetwork = new YellowNetworkClient();
