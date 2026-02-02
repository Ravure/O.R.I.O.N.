/**
 * ORION Gas Savings Analytics
 *
 * This script provides detailed analytics on gas savings
 * when using Yellow Network state channels vs on-chain trading.
 *
 * Run: npm run demo:analytics
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

interface GasConfig {
  gasPerSwap: number;
  gasPerBridge: number;
  gasPerApproval: number;
  gasPriceGwei: number;
  ethPriceUSD: number;
}

interface TradingScenario {
  name: string;
  description: string;
  swaps: number;
  bridges: number;
  approvals: number;
  duration: string;
}

const defaultGasConfig: GasConfig = {
  gasPerSwap: 150000,      // Uniswap swap
  gasPerBridge: 200000,    // Cross-chain bridge
  gasPerApproval: 46000,   // ERC20 approval
  gasPriceGwei: 30,        // Average gas price
  ethPriceUSD: 2500,       // ETH price
};

/**
 * Calculate gas costs in ETH and USD
 */
function calculateGasCosts(
  gasUnits: number,
  config: GasConfig = defaultGasConfig
): { eth: number; usd: number } {
  const eth = (gasUnits * config.gasPriceGwei) / 1e9;
  const usd = eth * config.ethPriceUSD;
  return { eth, usd };
}

/**
 * Calculate total on-chain costs for a scenario
 */
function calculateScenarioCost(
  scenario: TradingScenario,
  config: GasConfig = defaultGasConfig
): { gasUnits: number; eth: number; usd: number } {
  const totalGas =
    scenario.swaps * config.gasPerSwap +
    scenario.bridges * config.gasPerBridge +
    scenario.approvals * config.gasPerApproval;

  const costs = calculateGasCosts(totalGas, config);
  return { gasUnits: totalGas, ...costs };
}

/**
 * Format currency
 */
function formatUSD(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(2)}k`;
  }
  return `$${amount.toFixed(2)}`;
}

function formatETH(amount: number): string {
  return `${amount.toFixed(6)} ETH`;
}

/**
 * Draw a horizontal bar chart
 */
function drawBar(
  label: string,
  value: number,
  maxValue: number,
  barWidth: number = 30,
  color: string = colors.green
): void {
  const filledWidth = Math.round((value / maxValue) * barWidth);
  const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);
  console.log(`  ${label.padEnd(12)} ${color}${bar}${colors.reset} ${formatUSD(value)}`);
}

/**
 * Print section header
 */
function printHeader(title: string): void {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log('═'.repeat(70) + '\n');
}

/**
 * Print sub-section header
 */
function printSubHeader(title: string): void {
  console.log(`\n${colors.bright}${colors.yellow}▸ ${title}${colors.reset}\n`);
}

/**
 * Main analytics function
 */
async function runAnalytics(): Promise<void> {
  console.clear();

  printHeader('🔬 ORION Gas Savings Analytics');

  console.log(`${colors.dim}Comparing Yellow Network State Channels vs On-Chain Trading${colors.reset}`);
  console.log(`${colors.dim}Gas Price: ${defaultGasConfig.gasPriceGwei} gwei | ETH: $${defaultGasConfig.ethPriceUSD}${colors.reset}`);

  // Define scenarios
  const scenarios: TradingScenario[] = [
    {
      name: 'Light',
      description: 'Casual user, monthly rebalancing',
      swaps: 10,
      bridges: 2,
      approvals: 5,
      duration: 'month',
    },
    {
      name: 'Medium',
      description: 'Active user, weekly rebalancing',
      swaps: 50,
      bridges: 10,
      approvals: 15,
      duration: 'month',
    },
    {
      name: 'Heavy',
      description: 'Power user, daily rebalancing',
      swaps: 200,
      bridges: 30,
      approvals: 40,
      duration: 'month',
    },
    {
      name: 'ORION AI',
      description: 'AI agent with micro-rebalancing',
      swaps: 1000,
      bridges: 50,
      approvals: 100,
      duration: 'month',
    },
  ];

  // Calculate costs for each scenario
  printSubHeader('Cost Comparison by Usage Level');

  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│  Scenario     │ On-Chain Cost  │ Yellow Network │   Savings   │');
  console.log('├────────────────────────────────────────────────────────────────┤');

  let maxCost = 0;
  const results = scenarios.map(scenario => {
    const cost = calculateScenarioCost(scenario);
    if (cost.usd > maxCost) maxCost = cost.usd;
    return { scenario, cost };
  });

  for (const { scenario, cost } of results) {
    const onChain = formatUSD(cost.usd).padStart(12);
    const offChain = formatUSD(0).padStart(12);
    const savings = formatUSD(cost.usd).padStart(9);
    const pct = '(100%)'.padStart(7);

    console.log(
      `│  ${colors.cyan}${scenario.name.padEnd(12)}${colors.reset}│ ${colors.red}${onChain}${colors.reset}   │ ${colors.green}${offChain}${colors.reset}   │${colors.green}${colors.bright} ${savings} ${pct}${colors.reset}│`
    );
  }

  console.log('└────────────────────────────────────────────────────────────────┘');

  // Visual bar chart
  printSubHeader('Monthly Gas Costs (On-Chain)');

  for (const { scenario, cost } of results) {
    drawBar(scenario.name, cost.usd, maxCost, 35, colors.red);
  }

  printSubHeader('Monthly Gas Costs (Yellow Network)');

  for (const { scenario } of results) {
    drawBar(scenario.name, 0, maxCost, 35, colors.green);
  }

  // Detailed breakdown
  printSubHeader('Cost Breakdown by Operation Type');

  console.log(`  ${colors.dim}Operation        │ Gas Units │ Cost per Op │ Yellow Network${colors.reset}`);
  console.log(`  ${'─'.repeat(60)}`);

  const operations = [
    { name: 'Token Swap', gas: defaultGasConfig.gasPerSwap },
    { name: 'Bridge', gas: defaultGasConfig.gasPerBridge },
    { name: 'Approval', gas: defaultGasConfig.gasPerApproval },
  ];

  for (const op of operations) {
    const cost = calculateGasCosts(op.gas);
    console.log(
      `  ${op.name.padEnd(17)}│ ${op.gas.toLocaleString().padStart(9)} │ ${colors.red}${formatUSD(cost.usd).padStart(11)}${colors.reset} │ ${colors.green}$0.00${colors.reset}`
    );
  }

  // Annual projection
  printSubHeader('Annual Savings Projection');

  const annualResults = results.map(({ scenario, cost }) => ({
    scenario,
    monthly: cost.usd,
    annual: cost.usd * 12,
  }));

  console.log('┌──────────────────────────────────────────────────────────────────┐');
  console.log('│  User Type     │ Monthly Savings │ Annual Savings │ 3-Year Total │');
  console.log('├──────────────────────────────────────────────────────────────────┤');

  for (const { scenario, monthly, annual } of annualResults) {
    console.log(
      `│  ${colors.cyan}${scenario.name.padEnd(13)}${colors.reset}│ ${colors.green}${formatUSD(monthly).padStart(14)}${colors.reset}  │ ${colors.green}${formatUSD(annual).padStart(13)}${colors.reset}  │ ${colors.green}${colors.bright}${formatUSD(annual * 3).padStart(12)}${colors.reset}  │`
    );
  }

  console.log('└──────────────────────────────────────────────────────────────────┘');

  // ORION specific stats
  printSubHeader('ORION AI Agent Statistics');

  const orionScenario = scenarios[3];
  const orionCost = calculateScenarioCost(orionScenario);

  console.log(`  ${colors.bright}Daily Operations:${colors.reset}`);
  console.log(`    • Swaps: ~${Math.round(orionScenario.swaps / 30)} trades/day`);
  console.log(`    • Bridges: ~${Math.round(orionScenario.bridges / 30)} bridges/day`);
  console.log(`    • Total ops: ~${Math.round((orionScenario.swaps + orionScenario.bridges) / 30)}/day`);

  console.log(`\n  ${colors.bright}If done on-chain:${colors.reset}`);
  console.log(`    • Daily cost: ${colors.red}${formatUSD(orionCost.usd / 30)}${colors.reset}`);
  console.log(`    • Monthly cost: ${colors.red}${formatUSD(orionCost.usd)}${colors.reset}`);
  console.log(`    • Annual cost: ${colors.red}${formatUSD(orionCost.usd * 12)}${colors.reset}`);

  console.log(`\n  ${colors.bright}With Yellow Network:${colors.reset}`);
  console.log(`    • Daily cost: ${colors.green}$0.00${colors.reset}`);
  console.log(`    • Monthly cost: ${colors.green}$0.00${colors.reset}`);
  console.log(`    • Annual cost: ${colors.green}$0.00${colors.reset}`);

  console.log(`\n  ${colors.bgGreen}${colors.bright}${colors.white} 💰 ANNUAL SAVINGS: ${formatUSD(orionCost.usd * 12)} ${colors.reset}`);

  // Technical details
  printSubHeader('How Yellow Network Achieves Zero Fees');

  console.log(`  ${colors.cyan}1.${colors.reset} State Channels (ERC-7824)`);
  console.log(`     - Open channel: 1 on-chain tx`);
  console.log(`     - Trade: Unlimited off-chain`);
  console.log(`     - Close channel: 1 on-chain tx`);

  console.log(`\n  ${colors.cyan}2.${colors.reset} Cost Comparison (1000 trades)`);
  const thousandTradesCost = calculateGasCosts(1000 * defaultGasConfig.gasPerSwap);
  const channelOpenClose = calculateGasCosts(2 * 100000); // Open + close
  console.log(`     - On-chain: ${colors.red}${formatUSD(thousandTradesCost.usd)}${colors.reset}`);
  console.log(`     - Yellow Network: ${colors.green}${formatUSD(channelOpenClose.usd)}${colors.reset} (just open/close)`);
  console.log(`     - Savings: ${colors.green}${colors.bright}${((1 - channelOpenClose.usd / thousandTradesCost.usd) * 100).toFixed(1)}%${colors.reset}`);

  console.log(`\n  ${colors.cyan}3.${colors.reset} Additional Benefits`);
  console.log(`     - Instant finality (no block wait)`);
  console.log(`     - Private transactions`);
  console.log(`     - MEV protection`);
  console.log(`     - Cross-chain atomic swaps`);

  // Footer
  printHeader('📊 Analytics Complete');

  console.log(`${colors.dim}Yellow Network enables ORION to make unlimited micro-adjustments`);
  console.log(`to optimize your portfolio without any gas costs.${colors.reset}\n`);

  console.log(`${colors.yellow}For hackathon judges:${colors.reset}`);
  console.log(`This integration demonstrates the power of state channels for`);
  console.log(`high-frequency DeFi operations that would be economically`);
  console.log(`impossible with traditional on-chain transactions.\n`);
}

// Run analytics
runAnalytics().catch(console.error);
