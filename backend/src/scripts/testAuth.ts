/**
 * Test Yellow Network Authentication Flow
 * Debug the exact messages being sent/received
 */

import WebSocket from 'ws';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  type AuthChallengeResponse,
  type PartialEIP712AuthMessage,
} from '@erc7824/nitrolite';

const SANDBOX_URL = 'wss://clearnet-sandbox.yellow.com/ws';

// Test private key - DO NOT use in production
// This is just for testing the auth flow
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

// Generate a fresh session key to avoid "session key already exists" errors
const SESSION_PRIVATE_KEY = generatePrivateKey();
const sessionAccount = privateKeyToAccount(SESSION_PRIVATE_KEY);

// Auth parameters - shared between request and verify
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
const scope = 'console';
const application = 'ORION';
const allowances = [
  { asset: 'ytest.usd', amount: '1000000000' },
];

async function testAuth() {
  console.log('🔐 Testing Yellow Network Authentication Flow\n');
  console.log('=' .repeat(60));

  // Create account from private key
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);
  const address = account.address;
  console.log(`📍 Wallet Address: ${address}`);
  console.log(`📍 Session Key: ${sessionAccount.address}\n`);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  const ws = new WebSocket(SANDBOX_URL);

  ws.on('open', async () => {
    console.log('✅ Connected to ClearNode\n');

    try {
      // Step 1: Create auth request
      console.log('📤 Step 1: Sending auth_request...');
      const authRequestMsg = await createAuthRequestMessage({
        address: address as Address,
        session_key: sessionAccount.address as Address,
        application,
        allowances,
        expires_at: expiresAt,
        scope,
      });
      console.log('Auth Request:', authRequestMsg);
      console.log('');
      ws.send(authRequestMsg);

    } catch (error) {
      console.error('❌ Error in auth flow:', error);
    }
  });

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', JSON.stringify(message, null, 2));
    console.log('');

    if (message.res && Array.isArray(message.res)) {
      const [_id, method, params] = message.res;

      if (method === 'auth_challenge') {
        try {
          const challengeMessage = params.challenge_message || params.challengeMessage;
          console.log(`🔑 Challenge: ${challengeMessage}\n`);

          // Create EIP-712 signer with the WALLET (not session key)
          const account = privateKeyToAccount(TEST_PRIVATE_KEY);
          const walletClient = createWalletClient({
            account,
            chain: sepolia,
            transport: http(),
          });

          // Use the SAME parameters as auth_request
          const partialMessage: PartialEIP712AuthMessage = {
            scope,
            session_key: sessionAccount.address as Address,
            expires_at: expiresAt,
            allowances,
          };

          console.log('📤 Step 2: Creating EIP-712 signer...');
          console.log('Partial Message:', JSON.stringify(partialMessage, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v, 2));

          const eip712Signer = createEIP712AuthMessageSigner(
            walletClient,
            partialMessage,
            { name: application }
          );

          // Create auth verify message
          const authChallengeResponse: AuthChallengeResponse = {
            method: 'auth_challenge' as any,
            params: {
              challengeMessage: challengeMessage,
            },
          };

          console.log('📤 Step 3: Creating auth_verify message...');
          const authVerifyMsg = await createAuthVerifyMessage(
            eip712Signer,
            authChallengeResponse
          );
          console.log('Auth Verify:', authVerifyMsg);
          console.log('');

          ws.send(authVerifyMsg);

        } catch (error) {
          console.error('❌ Error creating auth_verify:', error);
        }
      } else if (method === 'auth_verify') {
        if (params.success || params.jwtToken || params.jwt) {
          console.log('✅ Authentication SUCCESS!');
          console.log('JWT Token:', params.jwtToken || params.jwt);
        } else {
          console.log('❌ Authentication response:', params);
        }
        ws.close();
        process.exit(0);
      } else if (method === 'error') {
        console.log('❌ Error from server:', params);
        ws.close();
        process.exit(1);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket Error:', error.message);
  });

  ws.on('close', () => {
    console.log('\n🔌 Connection closed');
  });

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('\n⏱️ Timeout - closing connection');
    ws.close();
    process.exit(1);
  }, 30000);
}

testAuth().catch(console.error);
