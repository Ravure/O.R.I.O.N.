/**
 * Test Yellow Network Sandbox Connection
 * Check what chains and assets are supported
 */

import WebSocket from 'ws';

const SANDBOX_URL = 'wss://clearnet-sandbox.yellow.com/ws';

async function testSandbox() {
  console.log('🔌 Connecting to Yellow Network Sandbox...');
  console.log(`   URL: ${SANDBOX_URL}\n`);

  const ws = new WebSocket(SANDBOX_URL);

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

    // Query config
    setTimeout(() => {
      console.log('📤 Requesting config...');
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'get_config',
        params: {},
      }));
    }, 1000);
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('\n📨 Received:');
    console.log(JSON.stringify(message, null, 2));
  });

  ws.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  ws.on('close', () => {
    console.log('\n🔌 Connection closed');
  });

  // Close after 10 seconds
  setTimeout(() => {
    console.log('\n⏱️ Closing connection...');
    ws.close();
    process.exit(0);
  }, 10000);
}

testSandbox().catch(console.error);
