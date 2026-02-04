/**
 * Verify Live Trading on Yellow Network Sandbox
 * This script tests REAL transfers (not simulated)
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createTransferMessage,
  createECDSAMessageSigner,
} from '@erc7824/nitrolite';

dotenv.config({ path: '../.env' });

const ENDPOINT = 'wss://clearnet-sandbox.yellow.com/ws';
const RECIPIENT = process.env.TRADE_RECIPIENT || '0xf768b3889cA6DE670a8a3bda98789Eb93a6Ed7ca';

async function verifyLiveTrades() {
  console.log('🔍 LIVE TRADING VERIFICATION');
  console.log('========================================\n');

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ AGENT_PRIVATE_KEY not found');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`📍 Sender: ${account.address}`);
  console.log(`📍 Recipient: ${RECIPIENT}`);
  console.log(`📍 Endpoint: ${ENDPOINT}\n`);

  // Connect to WebSocket
  console.log('1️⃣ Connecting to ClearNode...');
  const ws = new WebSocket(ENDPOINT);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log('   ✅ WebSocket connected\n');
      resolve();
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  // Authenticate
  console.log('2️⃣ Authenticating...');
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
  const authParams = {
    address: account.address,
    session_key: account.address,
    application: 'ORION',
    scope: 'console',
    expires_at: expiresAt,
    allowances: [],
  };

  const authRequest = await createAuthRequestMessage(authParams);
  
  const authResult = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Auth timeout')), 15000);
    
    const handler = async (data: Buffer) => {
      const message = JSON.parse(data.toString());
      
      if (message.res?.[1] === 'auth_challenge') {
        const challenge = message.res[2].challenge_message;
        console.log('   🔑 Challenge received');
        
        const walletClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(),
        });

        const eip712Signer = createEIP712AuthMessageSigner(
          walletClient,
          {
            scope: authParams.scope,
            session_key: authParams.session_key,
            expires_at: authParams.expires_at,
            allowances: authParams.allowances,
          },
          { name: 'ORION' }
        );

        const parsedChallenge = { params: { challengeMessage: challenge } };
        const authVerify = await createAuthVerifyMessage(eip712Signer, parsedChallenge);
        ws.send(authVerify);
      }

      if (message.res?.[1] === 'auth_verify') {
        clearTimeout(timeout);
        ws.off('message', handler);
        console.log('   ✅ Authentication successful\n');
        resolve(message.res[2]);
      }

      if (message.err) {
        clearTimeout(timeout);
        ws.off('message', handler);
        reject(new Error(message.err[1] || message.err.error));
      }
    };

    ws.on('message', handler);
    ws.send(authRequest);
  });

  // Execute REAL transfers
  console.log('3️⃣ Executing 5 REAL transfers on Yellow Network...\n');

  const messageSigner = createECDSAMessageSigner(privateKey as Hex);
  const trades = [
    { amount: '500000', label: '0.5 ytest.usd' },
    { amount: '1000000', label: '1.0 ytest.usd' },
    { amount: '750000', label: '0.75 ytest.usd' },
    { amount: '250000', label: '0.25 ytest.usd' },
    { amount: '1500000', label: '1.5 ytest.usd' },
  ];

  const completedTrades: any[] = [];

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    console.log(`   📊 Trade ${i + 1}/5: ${trade.label} → ${RECIPIENT.slice(0, 10)}...`);

    const transferParams = {
      destination: RECIPIENT as `0x${string}`,
      allocations: [
        { asset: 'ytest.usd', amount: trade.amount }
      ],
    };

    const transferMessage = await createTransferMessage(messageSigner, transferParams);
    
    const transferResult = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Transfer timeout')), 30000);

      const handler = (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.res?.[1] === 'transfer') {
          clearTimeout(timeout);
          ws.off('message', handler);
          const tx = message.res[2].transactions[0];
          console.log(`      ✅ TX #${tx.id} confirmed (${tx.created_at})`);
          resolve(message.res[2]);
        }

        if (message.err || message.res?.[1] === 'error') {
          clearTimeout(timeout);
          ws.off('message', handler);
          const errMsg = message.err?.[1] || message.err?.error || 'Unknown error';
          reject(new Error(errMsg));
        }
      };

      ws.on('message', handler);
      ws.send(transferMessage);
    });

    completedTrades.push(transferResult.transactions[0]);
    
    // Small delay between trades
    await new Promise(r => setTimeout(r, 100));
  }

  // Summary
  console.log('\n   ─────────────────────────────────────────');
  console.log('   📋 TRADE SUMMARY:');
  console.log('   ─────────────────────────────────────────');
  let totalAmount = 0;
  for (const tx of completedTrades) {
    totalAmount += parseInt(tx.amount);
    console.log(`   TX #${tx.id}: ${(parseInt(tx.amount) / 1000000).toFixed(2)} ytest.usd`);
  }
  console.log('   ─────────────────────────────────────────');
  console.log(`   TOTAL: ${(totalAmount / 1000000).toFixed(2)} ytest.usd transferred`);
  console.log(`   GAS USED: 0 (all off-chain!)`);
  console.log('   ─────────────────────────────────────────');

  console.log('\n========================================');
  console.log('✅ LIVE TRADING VERIFICATION COMPLETE');
  console.log('========================================\n');

  ws.close();
  process.exit(0);
}

verifyLiveTrades().catch((error) => {
  console.error('\n❌ Verification failed:', error.message);
  process.exit(1);
});
