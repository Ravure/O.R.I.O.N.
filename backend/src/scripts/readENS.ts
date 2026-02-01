#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { getUserProfile, readRiskProfile, resolveENSName } from '../ens/reader.js';

// Load .env from project root (one level up from backend directory)
// When script runs, cwd is backend/, so .env is at ../.env
const envResult = dotenv.config({ path: '../.env' });
if (envResult.error) {
  // Fallback: try current directory (in case .env is in backend/)
  dotenv.config();
}

/**
 * CLI script to test ENS reading functionality
 * Usage: npm run ens:read [ens-name]
 * If no ens-name is provided, will use ENS_NAME from .env file
 */
async function main() {
  // Try to get ENS name from command line argument or environment variable
  const ensName = process.argv[2] || process.env.ENS_NAME;

  if (!ensName) {
    console.error('Usage: npm run ens:read [ens-name]');
    console.error('Example: npm run ens:read vitalik.eth');
    console.error('Or set ENS_NAME in your .env file');
    console.error('\n💡 Tip: Make sure your .env file is in the project root with ENS_NAME=yourname.eth');
    process.exit(1);
  }

  // Show which source was used
  if (process.argv[2]) {
    console.log(`📝 Using ENS name from command line argument`);
  } else {
    console.log(`📝 Using ENS name from .env file: ${ensName}`);
  }

  // Get Alchemy URL from environment (check multiple possible variable names)
  const alchemyUrl = 
    process.env.ALCHEMY_SEPOLIA_URL || 
    process.env.ALCHEMY_URL || 
    process.env.SEPOLIA_RPC_URL;
  if (!alchemyUrl) {
    console.error(
      'Error: ALCHEMY_SEPOLIA_URL, ALCHEMY_URL, or SEPOLIA_RPC_URL not found in .env file'
    );
    process.exit(1);
  }

  console.log(`\n🔍 Reading ENS data for: ${ensName}`);
  console.log(`📡 Connecting to Sepolia via Alchemy...\n`);

  // Create provider
  const provider = new ethers.JsonRpcProvider(alchemyUrl);

  try {
    // Test 1: Resolve ENS name to address
    console.log('1️⃣  Resolving ENS name to address...');
    const address = await resolveENSName(ensName, provider);
    if (address) {
      console.log(`   ✅ Address: ${address}\n`);
    } else {
      console.log(`   ❌ Could not resolve ${ensName}\n`);
      process.exit(1);
    }

    // Test 2: Read risk profile
    console.log('2️⃣  Reading risk_profile text record...');
    const riskProfile = await readRiskProfile(ensName, provider);
    if (riskProfile) {
      console.log(`   ✅ Risk Profile: ${riskProfile}\n`);
    } else {
      console.log(`   ⚠️  No risk_profile set for ${ensName}\n`);
    }

    // Test 3: Read full profile
    console.log('3️⃣  Reading complete user profile...');
    const profile = await getUserProfile(ensName, provider);
    if (profile) {
      console.log('   ✅ Profile Data:');
      console.log(`      - ENS Name: ${profile.ensName}`);
      console.log(`      - Address: ${profile.address}`);
      console.log(`      - Risk Profile: ${profile.riskProfile || 'Not set'}`);
      console.log(`      - Max Slippage: ${profile.maxSlippage}%`);
      console.log(
        `      - Rebalance Frequency: ${profile.rebalanceFrequency || 'Not set'}`
      );
      console.log(`      - Min APY Threshold: ${profile.minApyThreshold}%`);
      console.log(
        `      - Excluded Protocols: ${profile.excludedProtocols.join(', ') || 'None'}`
      );
      console.log(
        `      - Max Chain Exposure: ${profile.maxChainExposure * 100}%\n`
      );
    } else {
      console.log(`   ⚠️  Could not read full profile\n`);
    }

    console.log('✨ ENS reading test completed!\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
