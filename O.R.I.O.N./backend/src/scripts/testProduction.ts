/**
 * Test Yellow Network PRODUCTION endpoint
 * Check if it supports real USDC
 */

import WebSocket from 'ws';

const PRODUCTION_URL = 'wss://clearnet.yellow.com/ws';

async function testProduction() {
  console.log('🔌 Connecting to Yellow Network PRODUCTION...');
  console.log(`   URL: ${PRODUCTION_URL}\n`);

  const ws = new WebSocket(PRODUCTION_URL);

  ws.on('open', () => {
    console.log('✅ Connected!\n');

    // Query available assets
    console.log('📤 Requesting available assets...');
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'get_assets',
      params: {},
    }));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('\n📨 Received:');
    console.log(JSON.stringify(message, null, 2));

    // Parse and display nicely
    if (message.res && message.res[2]?.assets) {
      console.log('\n📋 Supported Assets:');
      console.log('─'.repeat(60));
      for (const asset of message.res[2].assets) {
        console.log(`  Chain ${asset.chain_id}: ${asset.symbol} (${asset.token.slice(0,10)}...)`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  ws.on('close', () => {
    console.log('\n🔌 Connection closed');
  });

  // Close after 5 seconds
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 5000);
}

testProduction().catch(console.error);
