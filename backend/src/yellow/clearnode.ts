import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked, toHex, type Hex, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createTransferMessage,
  createECDSAMessageSigner,
  parseRPCResponse,
} from '@erc7824/nitrolite';

dotenv.config({ path: '../.env' });

/**
 * ClearNode WebSocket Client for Yellow Network
 * Enables zero-fee off-chain trading via state channels
 */
export class ClearNodeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private privateKey: string;
  private account: ReturnType<typeof privateKeyToAccount>;
  private endpoint: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private messageId: number = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
  private sessionId: string | null = null;
  private manualDisconnect: boolean = false;

  // Trade statistics
  private tradeCount: number = 0;
  private totalVolume: number = 0;
  private gasSaved: number = 0;

  constructor(privateKey?: string, endpoint?: string) {
    super();

    this.privateKey = privateKey || process.env.AGENT_PRIVATE_KEY || '';
    this.endpoint = endpoint || process.env.YELLOW_NETWORK_ENDPOINT || 'wss://clearnet-sandbox.yellow.com/ws';

    if (!this.privateKey) {
      throw new Error('AGENT_PRIVATE_KEY not found');
    }

    this.account = privateKeyToAccount(this.privateKey as `0x${string}`);
  }

  /**
   * Connect to ClearNode WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to ClearNode: ${this.endpoint}`);

      this.ws = new WebSocket(this.endpoint);

      this.ws.on('open', () => {
        console.log('✅ Connected to ClearNode');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        console.log('🔴 ClearNode connection closed');
        this.isConnected = false;
        this.emit('disconnected');
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('❌ ClearNode WebSocket error:', error.message);
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle response to pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(message.error.message || 'Unknown error'));
        } else {
          resolve(message.result);
        }
      }

      // Handle events
      if (message.type === 'trade_confirmed') {
        this.tradeCount++;
        this.totalVolume += parseFloat(message.amount || 0);
        this.gasSaved += 3.5; // Average gas cost saved per trade
        this.emit('trade_confirmed', message);
      }

      if (message.type === 'session_created') {
        this.sessionId = message.sessionId;
        this.emit('session_created', message);
      }

      if (message.type === 'payment_received') {
        this.emit('payment_received', message);
      }

    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Attempt to reconnect on disconnect
   */
  private attemptReconnect(): void {
    if (this.manualDisconnect) {
      return; // Don't reconnect if manually disconnected
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to ClearNode');
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Authenticate with ClearNode using Nitrolite RPC protocol with EIP-712 signatures
   */
  async authenticate(): Promise<any> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to ClearNode');
    }

    // Auth request parameters
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hours from now
    const authParams = {
      address: this.account.address,
      session_key: this.account.address, // Using same key for simplicity
      application: 'ORION',
      scope: 'console',
      expires_at: expiresAt,
      allowances: [],
    };

    // Step 1: Send auth_request
    const authRequest = await createAuthRequestMessage(authParams);

    return new Promise((resolve, reject) => {
      const authTimeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 15000);

      // Handler for auth challenge response
      const handleAuthResponse = async (data: Buffer) => {
        try {
          const rawMessage = data.toString();
          const message = JSON.parse(rawMessage);
          
          // Response format: { res: [requestId, methodName, data, timestamp], sig: [...] }
          // Check if this is an auth_challenge response
          if (message.res && message.res[1] === 'auth_challenge') {
            const challengeData = message.res[2];
            const challenge = challengeData.challenge_message;
            console.log('🔑 Received challenge, creating EIP-712 signature...');
            
            // Create wallet client for EIP-712 signing
            const walletClient = createWalletClient({
              account: this.account,
              chain: sepolia,
              transport: http(),
            });

            // Create EIP-712 message signer
            const eip712Signer = createEIP712AuthMessageSigner(
              walletClient,
              {
                scope: authParams.scope,
                session_key: authParams.session_key,
                expires_at: authParams.expires_at,
                allowances: authParams.allowances,
              },
              {
                name: 'ORION',
              }
            );

            // Transform raw message to SDK-expected format (camelCase params)
            const parsedChallenge = {
              params: {
                challengeMessage: challenge, // SDK expects camelCase
              },
            };
            // Create and send auth_verify with EIP-712 signature
            const authVerify = await createAuthVerifyMessage(eip712Signer, parsedChallenge);
            this.ws!.send(authVerify);
          }
          
          // Check if this is auth success
          if (message.res && (message.res[1] === 'auth_verify' || message.res[1] === 'ok')) {
            console.log('✅ Authentication successful!');
            clearTimeout(authTimeout);
            this.ws!.off('message', handleAuthResponse);
            resolve(message.res[2]);
          }
          
          // Check for error
          if (message.err) {
            console.log('❌ Auth error:', message.err);
            clearTimeout(authTimeout);
            this.ws!.off('message', handleAuthResponse);
            reject(new Error(message.err[1] || message.err.error || 'Authentication failed'));
          }
        } catch (error) {
          console.error('Auth handler error:', error);
        }
      };

      this.ws!.on('message', handleAuthResponse);
      this.ws!.send(authRequest);
    });
  }

  /**
   * Create an app session for trading
   * ERC-7824 compliant session message
   */
  async createAppSession(params: {
    appName: string;
    duration: number;
    maxAmount: string;
    tokenAddress?: string;
  }): Promise<any> {
    const sessionMessage = {
      app: params.appName,
      participant: this.account.address,
      duration: params.duration,
      maxAmount: params.maxAmount,
      token: params.tokenAddress || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      timestamp: Date.now(),
    };

    // Sign the session message
    const messageHash = keccak256(
      encodePacked(
        ['string', 'address', 'uint256', 'string', 'address', 'uint256'],
        [
          sessionMessage.app,
          sessionMessage.participant as `0x${string}`,
          BigInt(sessionMessage.duration),
          sessionMessage.maxAmount,
          sessionMessage.token as `0x${string}`,
          BigInt(sessionMessage.timestamp),
        ]
      )
    );

    const signature = await this.account.signMessage({
      message: { raw: messageHash },
    });

    return this.sendRequest('createAppSession', {
      ...sessionMessage,
      signature,
    });
  }

  /**
   * Send a payment (off-chain trade)
   * This is the core zero-fee trading function
   */
  async sendPayment(params: {
    recipient: string;
    amount: string;
    token?: string;
    memo?: string;
  }): Promise<any> {
    if (!this.sessionId) {
      throw new Error('No active session. Call createAppSession first.');
    }

    const payment = {
      sessionId: this.sessionId,
      from: this.account.address,
      to: params.recipient,
      amount: params.amount,
      token: params.token || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      memo: params.memo || '',
      timestamp: Date.now(),
      nonce: this.tradeCount + 1,
    };

    // Sign the payment
    const paymentHash = keccak256(
      encodePacked(
        ['string', 'address', 'address', 'string', 'address', 'uint256', 'uint256'],
        [
          payment.sessionId,
          payment.from as `0x${string}`,
          payment.to as `0x${string}`,
          payment.amount,
          payment.token as `0x${string}`,
          BigInt(payment.timestamp),
          BigInt(payment.nonce),
        ]
      )
    );

    const signature = await this.account.signMessage({
      message: { raw: paymentHash },
    });

    const result = await this.sendRequest('sendPayment', {
      ...payment,
      signature,
    });

    // Update stats
    this.tradeCount++;
    this.totalVolume += parseFloat(params.amount);
    this.gasSaved += 3.5;

    return result;
  }

  /**
   * Execute a swap (trade one token for another)
   */
  async swap(params: {
    fromToken: string;
    toToken: string;
    amount: string;
    minReceive?: string;
  }): Promise<any> {
    return this.sendRequest('swap', {
      sessionId: this.sessionId,
      from: this.account.address,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      minReceive: params.minReceive || '0',
      timestamp: Date.now(),
    });
  }

  /**
   * Get current session balance
   */
  async getSessionBalance(): Promise<any> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }
    return this.sendRequest('getSessionBalance', {
      sessionId: this.sessionId,
    });
  }

  /**
   * Close the session and settle on-chain
   */
  async closeSession(): Promise<any> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    const result = await this.sendRequest('closeSession', {
      sessionId: this.sessionId,
    });

    this.sessionId = null;
    return result;
  }

  /**
   * Get trading statistics
   */
  getStats(): {
    tradeCount: number;
    totalVolume: number;
    gasSaved: number;
    gasSavedUSD: number;
    sessionId: string | null;
    isConnected: boolean;
  } {
    return {
      tradeCount: this.tradeCount,
      totalVolume: this.totalVolume,
      gasSaved: this.gasSaved,
      gasSavedUSD: this.gasSaved * 2.5, // Assume $2.5 avg gas price
      sessionId: this.sessionId,
      isConnected: this.isConnected,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.tradeCount = 0;
    this.totalVolume = 0;
    this.gasSaved = 0;
  }

  /**
   * Get account address
   */
  getAddress(): string {
    return this.account.address;
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.sessionId = null;
  }
}

/**
 * Token addresses on Sepolia testnet
 */
export const SEPOLIA_TOKENS = {
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Circle USDC on Sepolia
  USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  DAI: '0x68194a729C2450ad26072b3D33ADaCbcef39D574',
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
};

export default ClearNodeClient;
