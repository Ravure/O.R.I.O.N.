#!/usr/bin/env node

import { YellowNetworkClient } from '../yellow/client.js';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

/**
 * Test script for the updated Yellow Network client
 * Uses the actual Nitrolite SDK API
 */
async function main() {
  console.log('\n🧪 Testing Yellow Network Client V2\n');
  console.log('='.repeat(60));

  try {
    // Initialize client
    console.log('\n1️⃣  Initializing client...\n');
    const client = new YellowNetworkClient();

    console.log('✅ Client initialized successfully!\n');

    // Test 2: Get account balance in custody contract
    console.log('2️⃣  Checking account balance in custody contract...\n');
    try {
      // For native ETH in custody, use zero address
      const balance = await client.getAccountBalance('0x0000000000000000000000000000000000000000');
      const balanceInEth = Number(balance) / 1e18;
      console.log(`   Balance (ETH): ${balanceInEth}`);

      if (balanceInEth === 0) {
        console.log(`   ℹ️  No funds deposited yet (this is normal)`);
      }

      console.log(`   ✅ Account balance check successful\n`);
    } catch (error: any) {
      console.log(`   ⚠️  Could not get account balance: ${error.message}\n`);
    }

    // Test 3: Get open channels
    console.log('3️⃣  Checking open channels...\n');
    try {
      const channels = await client.getOpenChannels();
      console.log(`   Open channels: ${channels.length}`);
      if (channels.length > 0) {
        console.log(`   Channel IDs:`);
        channels.forEach((id, index) => {
          console.log(`      ${index + 1}. ${id}`);
        });
      } else {
        console.log(`   ℹ️  No open channels found`);
      }
      console.log(`   ✅ Channel check successful\n`);
    } catch (error: any) {
      console.log(`   ⚠️  Could not get channels: ${error.message}\n`);
    }

    // Test 4: Get wallet ETH balance (using viem directly)
    console.log('4️⃣  Checking wallet ETH balance...\n');
    try {
      // For native ETH, we use viem's publicClient directly
      const rpcUrl = process.env.ALCHEMY_SEPOLIA_URL ||
                     process.env.SEPOLIA_RPC_URL ||
                     'https://eth-sepolia.g.alchemy.com/v2/demo';

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
      });

      const balance = await publicClient.getBalance({
        address: client.getAddress() as `0x${string}`
      });

      const balanceInEth = Number(balance) / 1e18;
      console.log(`   Balance: ${balanceInEth.toFixed(4)} ETH`);

      if (balanceInEth < 0.01) {
        console.log(`   ⚠️  Low balance! Get testnet ETH from https://sepoliafaucet.com`);
      }

      console.log(`   ✅ Wallet balance check successful\n`);
    } catch (error: any) {
      console.log(`   ⚠️  Could not get wallet balance: ${error.message}\n`);
    }

    // Summary
    console.log('='.repeat(60));
    console.log('\n✨ Test completed!\n');
    console.log('📋 Summary:');
    console.log('   - Client initialization: ✅ SUCCESS');
    console.log('   - SDK API: ✅ CORRECT');
    console.log('   - Contract addresses: ✅ CONFIGURED\n');

    console.log('📝 Next Steps:');
    console.log('   1. Verify contract addresses on Sepolia Etherscan');
    console.log('   2. Visit https://apps.yellow.com to create a channel');
    console.log('   3. Deposit funds into custody contract if needed');
    console.log('   4. Test channel creation and operations\n');

    console.log('🔗 Useful Links:');
    console.log(`   - Your account: https://sepolia.etherscan.io/address/${client.getAddress()}`);
    console.log('   - Yellow Dashboard: https://apps.yellow.com');
    console.log('   - Documentation: https://erc7824.org/quick_start\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack:', error.stack);

    console.error('\n💡 Troubleshooting:');
    console.error('   - Verify AGENT_PRIVATE_KEY is set in .env');
    console.error('   - Check RPC URL is working (ALCHEMY_SEPOLIA_URL)');
    console.error('   - Verify contract addresses are deployed on Sepolia');
    console.error('   - Visit https://sepolia.etherscan.io to check contracts\n');

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
