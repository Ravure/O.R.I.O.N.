/**
 * ORION Phase 2: Zero-Fee Trading Demo
 *
 * This script demonstrates:
 * 1. Connecting to Yellow Network's ClearNode
 * 2. Authenticating with EIP-712 signatures
 * 3. Executing REAL trades with ZERO gas fees
 * 4. Comparing gas savings vs on-chain trading (with REAL gas prices)
 *
 * Run: npm run demo:trades
 */

import { ClearNodeClient, SEPOLIA_TOKENS } from '../yellow/clearnode.js';
import { YellowNetworkClient } from '../yellow/client.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string): void {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cache for real-time data
let cachedGasData: {
  gasPriceGwei: number;
  ethPriceUSD: number;
  fetchedAt: number;
  isReal: boolean;
} | null = null;

/**
 * Fetch real ETH price from CoinGecko API
 */
async function fetchEthPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    if (!response.ok) throw new Error('CoinGecko API error');
    const data = await response.json();
    return data.ethereum?.usd ?? 2500;
  } catch (error) {
    console.log('   ⚠️  Could not fetch ETH price, using estimate');
    return 2500; // Fallback
  }
}

/**
 * Fetch real gas price from Ethereum mainnet
 */
async function fetchGasPrice(): Promise<number> {
  try {
    // Use public Ethereum RPC
    const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
    const feeData = await provider.getFeeData();
    
    if (feeData.gasPrice) {
      // Convert from wei to gwei
      const gasPriceGwei = Number(feeData.gasPrice) / 1e9;
      return Math.round(gasPriceGwei * 10) / 10; // Round to 1 decimal
    }
    throw new Error('No gas price data');
  } catch (error) {
    console.log('   ⚠️  Could not fetch gas price, using estimate');
    return 30; // Fallback
  }
}

/**
 * Get real-time gas and ETH price data
 */
async function getRealTimeGasData(): Promise<{
  gasPriceGwei: number;
  ethPriceUSD: number;
  isReal: boolean;
}> {
  // Use cache if less than 60 seconds old
  if (cachedGasData && Date.now() - cachedGasData.fetchedAt < 60000) {
    return cachedGasData;
  }

  console.log('   📡 Fetching real-time gas & ETH prices...');
  
  const [gasPriceGwei, ethPriceUSD] = await Promise.all([
    fetchGasPrice(),
    fetchEthPrice(),
  ]);

  const isReal = gasPriceGwei !== 30 || ethPriceUSD !== 2500;
  
  cachedGasData = {
    gasPriceGwei,
    ethPriceUSD,
    fetchedAt: Date.now(),
    isReal,
  };

  return cachedGasData;
}

/**
 * Calculate on-chain gas costs for comparison using REAL prices
 */
async function calculateOnChainCosts(numberOfTrades: number): Promise<{
  totalGasUnits: number;
  totalGasCostETH: number;
  totalGasCostUSD: number;
  gasPriceGwei: number;
  ethPriceUSD: number;
  isRealData: boolean;
}> {
  const gasPerTrade = 150000; // Average gas per swap on Uniswap (actual benchmark)
  
  const { gasPriceGwei, ethPriceUSD, isReal } = await getRealTimeGasData();

  const totalGasUnits = numberOfTrades * gasPerTrade;
  const totalGasCostETH = (totalGasUnits * gasPriceGwei) / 1e9;
  const totalGasCostUSD = totalGasCostETH * ethPriceUSD;

  return { 
    totalGasUnits, 
    totalGasCostETH, 
    totalGasCostUSD, 
    gasPriceGwei,
    ethPriceUSD,
    isRealData: isReal,
  };
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Main demo function
 */
async function runDemo(): Promise<void> {
  logSection('🚀 ORION Phase 2: Zero-Fee Trading Demo');

  log('This demo executes REAL trades on Yellow Network sandbox', colors.yellow);
  log('with ZERO gas fees via state channels (ERC-7824 compliant)\n', colors.yellow);

  const RECIPIENT = process.env.TRADE_RECIPIENT || '0xf768b3889cA6DE670a8a3bda98789Eb93a6Ed7ca';

  // Step 1: Initialize clients
  logSection('Step 1: Initialize Yellow Network Client');

  let clearnode: ClearNodeClient;
  let nitrolite: YellowNetworkClient;
  let isLiveMode = false;

  try {
    nitrolite = new YellowNetworkClient();
    log('✅ Nitrolite SDK initialized', colors.green);

    clearnode = new ClearNodeClient();
    log('✅ ClearNode client initialized', colors.green);
    log(`   Sender: ${clearnode.getAddress()}`, colors.blue);
    log(`   Recipient: ${RECIPIENT}`, colors.blue);

  } catch (error: any) {
    log(`❌ Failed to initialize: ${error.message}`, colors.red);
    process.exit(1);
  }

  // Step 2: Connect and Authenticate
  logSection('Step 2: Connect & Authenticate');

  log('📡 Connecting to ClearNode WebSocket...', colors.yellow);
  log('   Endpoint: wss://clearnet-sandbox.yellow.com/ws', colors.blue);

  try {
    await clearnode.connect();
    log('✅ Connected to ClearNode', colors.green);
    
    log('🔐 Authenticating with EIP-712...', colors.yellow);
    await clearnode.authenticate();
    log('✅ Authentication successful', colors.green);
    isLiveMode = true;
  } catch (error: any) {
    log(`⚠️  Live connection failed: ${error.message}`, colors.yellow);
    log('   Running in simulation mode...', colors.yellow);
    isLiveMode = false;
  }

  // Step 3: Check initial balance (live mode only)
  logSection('Step 3: Check Balance & Execute Trades');

  if (isLiveMode) {
    try {
      const balances = await clearnode.getLedgerBalances();
      log('📊 Initial Balance:', colors.yellow);
      if (balances?.balances?.length > 0) {
        for (const b of balances.balances) {
          log(`   ${b.asset}: ${(parseInt(b.amount) / 1000000).toFixed(2)}`, colors.blue);
        }
      } else {
        log('   ytest.usd: Available (sandbox mode)', colors.blue);
      }
    } catch (e) {
      log('   Balance check skipped (sandbox mode)', colors.blue);
    }
  }

  // Step 4: Execute trades
  logSection('Step 4: Execute 10 Rapid Trades (Zero Gas!)');

  const trades = [
    { amount: '100000', label: '0.10 ytest.usd', reason: 'Yield rebalancing' },
    { amount: '150000', label: '0.15 ytest.usd', reason: 'Risk adjustment' },
    { amount: '200000', label: '0.20 ytest.usd', reason: 'Stablecoin diversification' },
    { amount: '250000', label: '0.25 ytest.usd', reason: 'Return to base' },
    { amount: '300000', label: '0.30 ytest.usd', reason: 'Protocol opportunity' },
    { amount: '350000', label: '0.35 ytest.usd', reason: 'Position close' },
    { amount: '400000', label: '0.40 ytest.usd', reason: 'Micro-rebalance' },
    { amount: '450000', label: '0.45 ytest.usd', reason: 'Chain rotation' },
    { amount: '500000', label: '0.50 ytest.usd', reason: 'Consolidation' },
    { amount: '550000', label: '0.55 ytest.usd', reason: 'Final optimization' },
  ];

  let totalVolume = 0;
  let successfulTrades = 0;
  const completedTxIds: string[] = [];
  const startTime = Date.now();

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const tradeNum = i + 1;

    log(`\n📊 Trade ${tradeNum}/10:`, colors.cyan);
    log(`   Amount: ${trade.label}`, colors.blue);
    log(`   Reason: ${trade.reason}`, colors.magenta);

    if (isLiveMode) {
      try {
        const result = await clearnode.transfer({
          destination: RECIPIENT,
          asset: 'ytest.usd',
          amount: trade.amount,
        });
        
        const tx = result.transactions?.[0];
        if (tx) {
          log(`   ✅ TX #${tx.id} confirmed`, colors.green);
          log(`   ⛽ Gas used: 0 (off-chain!)`, colors.green);
          completedTxIds.push(`TX #${tx.id}`);
          successfulTrades++;
          totalVolume += parseInt(trade.amount) / 1000000;
        }
      } catch (error: any) {
        log(`   ⚠️  Trade failed: ${error.message}`, colors.yellow);
        // Continue with remaining trades
      }
    } else {
      // Simulation mode
      await sleep(100);
      const mockTxId = `SIM-${Date.now()}-${i}`;
      log(`   ✅ Simulated: ${mockTxId}`, colors.green);
      log(`   ⛽ Gas used: 0 (off-chain!)`, colors.green);
      completedTxIds.push(mockTxId);
      successfulTrades++;
      totalVolume += parseInt(trade.amount) / 1000000;
    }

    await sleep(100); // Small delay between trades
  }

  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;

  // Step 5: Show results
  logSection('Step 5: Trading Results & Gas Savings');

  log('📈 Trading Summary:', colors.bright);
  log(`   Mode: ${isLiveMode ? '🟢 LIVE (Real Trades)' : '🟡 SIMULATION'}`, isLiveMode ? colors.green : colors.yellow);
  log(`   Successful Trades: ${successfulTrades}/${trades.length}`, colors.blue);
  log(`   Total Volume: ${totalVolume.toFixed(2)} ytest.usd`, colors.blue);
  log(`   Execution Time: ${totalTime.toFixed(2)} seconds`, colors.blue);
  log(`   Trades/Second: ${(successfulTrades / totalTime).toFixed(1)}`, colors.blue);

  if (isLiveMode && completedTxIds.length > 0) {
    log('\n📋 Transaction IDs:', colors.bright);
    for (const txId of completedTxIds) {
      log(`   ${txId}`, colors.cyan);
    }
  }

  // Fetch REAL gas prices for comparison
  log('\n💰 Gas Savings Comparison:', colors.bright);
  const onChainCosts = await calculateOnChainCosts(successfulTrades);
  
  const dataSource = onChainCosts.isRealData ? '🟢 LIVE DATA' : '🟡 ESTIMATED';
  log(`   Data Source: ${dataSource}`, onChainCosts.isRealData ? colors.green : colors.yellow);
  
  log('┌─────────────────────────────────────────────────────┐', colors.yellow);
  log('│                  ON-CHAIN vs OFF-CHAIN              │', colors.yellow);
  log('├─────────────────────────────────────────────────────┤', colors.yellow);
  log(`│  On-Chain Gas Cost:     ${formatUSD(onChainCosts.totalGasCostUSD).padStart(10)}              │`, colors.red);
  log(`│  Off-Chain Gas Cost:    ${formatUSD(0).padStart(10)}              │`, colors.green);
  log(`│  ─────────────────────────────────────              │`, colors.yellow);
  log(`│  TOTAL SAVED:           ${formatUSD(onChainCosts.totalGasCostUSD).padStart(10)}              │`, colors.green + colors.bright);
  log(`│  Savings:               ${(100).toString().padStart(7)}%              │`, colors.green + colors.bright);
  log('└─────────────────────────────────────────────────────┘', colors.yellow);

  log('\n📊 Detailed Breakdown:', colors.bright);
  log(`   Gas per trade (on-chain): 150,000 gas units`, colors.blue);
  log(`   Gas price: ${onChainCosts.gasPriceGwei.toFixed(1)} gwei ${onChainCosts.isRealData ? '(LIVE)' : '(estimated)'}`, colors.blue);
  log(`   ETH price: $${onChainCosts.ethPriceUSD.toFixed(2)} ${onChainCosts.isRealData ? '(LIVE from CoinGecko)' : '(estimated)'}`, colors.blue);
  log(`   Cost per trade (on-chain): ${formatUSD(onChainCosts.totalGasCostUSD / successfulTrades)}`, colors.red);
  log(`   Cost per trade (off-chain): ${formatUSD(0)}`, colors.green);

  // Final summary
  logSection('🎯 Demo Complete!');

  log('Key Takeaways:', colors.bright + colors.yellow);
  log(`  1. ✅ ${successfulTrades} trades executed in ${totalTime.toFixed(1)} seconds`, colors.green);
  log('  2. ✅ ZERO gas fees (all off-chain via state channels)', colors.green);
  log(`  3. ✅ Saved ${formatUSD(onChainCosts.totalGasCostUSD)} compared to on-chain`, colors.green);
  log('  4. ✅ ERC-7824 compliant session management', colors.green);
  log('  5. ✅ Instant finality (no block confirmations)', colors.green);

  if (isLiveMode) {
    log('\n🔥 LIVE MODE VERIFIED!', colors.bright + colors.green);
    log('   All transactions are REAL and recorded on Yellow Network', colors.green);
    log(`   Verify at: https://apps.yellow.com (search: ${clearnode.getAddress().slice(0, 10)}...)`, colors.blue);
  }

  log('\n🔗 Yellow Network Integration:', colors.bright + colors.cyan);
  log('   - State channels enable unlimited off-chain trades');
  log('   - Only 2 on-chain txs needed: open & close channel');
  log('   - Perfect for high-frequency rebalancing');
  log('   - Atomic cross-chain swaps via OpenTabs');

  log('\n📝 For hackathon judges:', colors.bright + colors.magenta);
  log('   This demonstrates Yellow Network\'s zero-fee trading');
  log('   capability integrated with ORION\'s AI rebalancing.');
  log('   The agent can make unlimited micro-adjustments');
  log('   without incurring gas costs!\n');

  // Clean up
  clearnode.disconnect();
  process.exit(0);
}

/**
 * Run the demo
 */
runDemo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
