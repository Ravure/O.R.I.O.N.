/**
 * ORION AI Agent CLI Runner
 * 
 * Commands:
 *   npm run agent:start    - Start agent continuously
 *   npm run agent:once     - Run single scan + action
 *   npm run agent:status   - Show current status
 *   npm run agent:demo     - Run demo mode (faster intervals)
 * 
 * Usage:
 *   tsx src/scripts/runAgent.ts start [--risk=balanced]
 *   tsx src/scripts/runAgent.ts once
 *   tsx src/scripts/runAgent.ts demo
 */

import { createOrionAgent, RiskProfile, AgentConfig } from '../agent/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function printBanner(): void {
  console.log(`
${colors.cyan}${colors.bright}
 ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗
██╔═══██╗██╔══██╗██║██╔═══██╗████╗  ██║
██║   ██║██████╔╝██║██║   ██║██╔██╗ ██║
██║   ██║██╔══██╗██║██║   ██║██║╚██╗██║
╚██████╔╝██║  ██║██║╚██████╔╝██║ ╚████║
 ╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
${colors.reset}
${colors.dim}  Autonomous Yield Hunting AI Agent${colors.reset}
`);
}

function printHelp(): void {
  console.log(`
${colors.bright}ORION Agent CLI${colors.reset}

${colors.yellow}Commands:${colors.reset}
  start [options]  Start the agent continuously
  once             Run single scan and analysis
  demo             Run in demo mode (faster intervals)
  status           Show current status
  help             Show this help

${colors.yellow}Options:${colors.reset}
  --risk=<profile>   Risk profile: conservative, balanced, aggressive
  --scan=<minutes>   Scan interval in minutes (default: 10)
  --analysis=<hours> Full analysis interval in hours (default: 6)

${colors.yellow}Examples:${colors.reset}
  npm run agent:start
  npm run agent:start -- --risk=aggressive
  npm run agent:once
  npm run agent:demo
`);
}

function parseArgs(): { command: string; options: Record<string, string> } {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options: Record<string, string> = {};
  
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || 'true';
    }
  }
  
  return { command, options };
}

function buildConfig(options: Record<string, string>): Partial<AgentConfig> {
  const config: Partial<AgentConfig> = {};
  
  if (options.risk) {
    const validProfiles: RiskProfile[] = ['conservative', 'balanced', 'aggressive'];
    if (validProfiles.includes(options.risk as RiskProfile)) {
      config.riskProfile = options.risk as RiskProfile;
    }
  }
  
  if (options.scan) {
    config.yieldScanIntervalMs = parseInt(options.scan) * 60 * 1000;
  }
  
  if (options.analysis) {
    config.fullAnalysisIntervalMs = parseInt(options.analysis) * 60 * 60 * 1000;
  }
  
  return config;
}

async function runStart(options: Record<string, string>): Promise<void> {
  printBanner();
  
  const config = buildConfig(options);
  const agent = createOrionAgent(config);
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️ Received SIGINT, shutting down...');
    await agent.stop('SIGINT received');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n\n⚠️ Received SIGTERM, shutting down...');
    await agent.stop('SIGTERM received');
    process.exit(0);
  });
  
  // Subscribe to events
  agent.onEvent(async (event) => {
    if (event.type === 'opportunity_found') {
      console.log(`${colors.green}🎯 Opportunity: ${event.opportunity.reason}${colors.reset}`);
    }
  });
  
  try {
    await agent.start();
    
    // Keep process running
    console.log('\n📡 Agent is running. Press Ctrl+C to stop.\n');
    
    // Print status every 5 minutes
    setInterval(() => {
      const status = agent.getStatus();
      console.log(`${colors.dim}[Status] Scans: ${status.scanCount}, Actions: ${status.actionCount}, P&L: $${status.totalPnl.toFixed(2)}${colors.reset}`);
    }, 5 * 60 * 1000);
    
  } catch (error: any) {
    console.error(`${colors.red}❌ Failed to start agent: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function runOnce(options: Record<string, string>): Promise<void> {
  printBanner();
  console.log(`${colors.yellow}Running single scan and analysis...${colors.reset}\n`);
  
  const config = buildConfig(options);
  const agent = createOrionAgent(config);
  
  try {
    // Connect first
    await agent.start();
    
    // Run once
    const actions = await agent.runOnce();
    
    // Print results
    console.log(`\n${colors.bright}Results:${colors.reset}`);
    for (const action of actions) {
      console.log(`  ${action.type}: ${action.description} (${action.duration}ms)`);
    }
    
    // Get status
    const status = agent.getStatus();
    console.log(`\n${colors.bright}Status:${colors.reset}`);
    console.log(`  Scans: ${status.scanCount}`);
    console.log(`  Actions: ${status.actionCount}`);
    console.log(`  P&L: $${status.totalPnl.toFixed(2)}`);
    
    await agent.stop('Single run completed');
    
  } catch (error: any) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function runDemo(): Promise<void> {
  printBanner();
  console.log(`${colors.yellow}Running in DEMO mode (accelerated intervals)${colors.reset}\n`);
  
  const agent = createOrionAgent({
    riskProfile: 'balanced',
    yieldScanIntervalMs: 30 * 1000,        // 30 seconds
    fullAnalysisIntervalMs: 2 * 60 * 1000, // 2 minutes
    minApyDifferential: 2,                  // Lower threshold for demo
    minNetBenefit: 1,                       // $1 minimum
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️ Stopping demo...');
    await agent.stop('Demo ended');
    
    // Print summary
    const status = agent.getStatus();
    console.log(`\n${colors.bright}Demo Summary:${colors.reset}`);
    console.log(`  Duration: ${Math.round(status.uptime / 1000)}s`);
    console.log(`  Scans: ${status.scanCount}`);
    console.log(`  Actions: ${status.actionCount}`);
    console.log(`  P&L: $${status.totalPnl.toFixed(2)}`);
    
    process.exit(0);
  });
  
  try {
    await agent.start();
    console.log(`\n${colors.green}Demo running. Press Ctrl+C to stop.${colors.reset}\n`);
    
    // Run for 5 minutes max
    setTimeout(async () => {
      console.log('\n⏰ Demo time limit reached');
      await agent.stop('Demo time limit');
      process.exit(0);
    }, 5 * 60 * 1000);
    
  } catch (error: any) {
    console.error(`${colors.red}❌ Demo error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function runStatus(): Promise<void> {
  console.log(`\n${colors.bright}ORION Agent Status${colors.reset}\n`);
  console.log(`${colors.dim}Note: Status shows last known state from database${colors.reset}\n`);
  
  // This would read from persistent storage
  // For now, just show that no agent is running
  console.log(`State: ${colors.yellow}No agent currently running${colors.reset}`);
  console.log(`\nStart an agent with: npm run agent:start\n`);
}

// Main entry point
async function main(): Promise<void> {
  const { command, options } = parseArgs();
  
  switch (command) {
    case 'start':
      await runStart(options);
      break;
    case 'once':
      await runOnce(options);
      break;
    case 'demo':
      await runDemo();
      break;
    case 'status':
      await runStatus();
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
