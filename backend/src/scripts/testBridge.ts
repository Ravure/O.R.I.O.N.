#!/usr/bin/env node

import { LifiBridgeClient, CHAIN_IDS } from '../bridge/client.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

/**
 * Test script for LI.FI bridge integration
 * Tests bridging USDC from Sepolia to Base Sepolia
 */
async function main() {
  console.log('\n🌉 ORION - Cross-Chain Bridge Test\n');
  console.log('='.repeat(60));

  try {
    // Initialize bridge client
    console.log('\n1️⃣  Initializing LI.FI Bridge Client...');
    const bridgeClient = new LifiBridgeClient();
    console.log('   ✅ Bridge client initialized\n');

    // Get RPC URL
    const rpcUrl = process.env.ALCHEMY_SEPOLIA_URL || 
                   process.env.SEPOLIA_RPC_URL || 
                   'https://eth-sepolia.g.alchemy.com/v2/demo';

    // Create provider (for demo, we'll just get quotes)
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    bridgeClient.setProvider(provider);

    // Test address (you can use your own)
    const testAddress = process.env.AGENT_ADDRESS || '0x0000000000000000000000000000000000000000';
    
    // Amount: 10 USDC (6 decimals)
    const amount = ethers.parseUnits('10', 6).toString();

    console.log('2️⃣  Getting bridge quote...');
    console.log(`   From: Sepolia (${CHAIN_IDS.SEPOLIA})`);
    console.log(`   To: Base Sepolia (${CHAIN_IDS.BASE_SEPOLIA})`);
    console.log(`   Amount: 10 USDC\n`);

    // Get best route
    const route = await bridgeClient.getBestBridgeRoute(
      CHAIN_IDS.SEPOLIA,
      CHAIN_IDS.BASE_SEPOLIA,
      amount,
      testAddress,
      0.005 // 0.5% slippage
    );

    console.log('   ✅ Route found!\n');
    console.log(bridgeClient.formatRouteDetails(route));

    console.log('\n3️⃣  Route Analysis:');
    console.log(`   Steps: ${route.steps.length}`);
    route.steps.forEach((step, index) => {
      console.log(`   Step ${index + 1}: ${step.toolDetails.name}`);
      console.log(`      - From: ${step.action.fromChain.name}`);
      console.log(`      - To: ${step.action.toChain.name}`);
      console.log(`      - Estimated time: ${step.estimate.executionDuration || 0}s`);
    });

    console.log('\n✨ Bridge quote test completed!');
    console.log('\n💡 To execute a bridge:');
    console.log('   1. Connect your wallet with a signer');
    console.log('   2. Call bridgeClient.executeBridge(route, signer)');
    console.log('   3. Monitor with bridgeClient.waitForBridgeCompletion()\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
