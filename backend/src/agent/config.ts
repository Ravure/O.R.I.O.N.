/**
 * ORION AI Agent Configuration
 * 
 * Defines agent behavior, risk profiles, and thresholds.
 */

import {
  AgentConfig,
  RiskProfile,
  RiskProfileConfig,
  NotificationConfig,
  NotificationLevel,
} from './types.js';

// ============ Risk Profiles ============

export const RISK_PROFILES: Record<RiskProfile, RiskProfileConfig> = {
  conservative: {
    name: 'conservative',
    minTvl: 10_000_000,        // $10M minimum TVL
    maxApy: 30,                // Cap at 30% APY
    minApy: 2,                 // Accept lower yields
    maxRiskScore: 4,           // Only low-risk pools
    allowedProtocols: [
      'aave-v3', 'aave-v2',
      'compound-v3', 'compound-v2',
      'maker', 'morpho',
      'curve-dex', 'convex-finance',
      'lido', 'yearn-finance',
      'spark', 'frax',
    ],
    maxChainExposure: 0.5,     // 50% max on single chain
    maxProtocolExposure: 0.3,  // 30% max in single protocol
  },
  
  balanced: {
    name: 'balanced',
    minTvl: 2_000_000,         // $2M minimum TVL
    maxApy: 80,                // Cap at 80% APY
    minApy: 10,                // Decent minimum
    maxRiskScore: 6,           // Medium risk acceptable
    allowedProtocols: 'all',
    maxChainExposure: 0.4,     // 40% max on single chain
    maxProtocolExposure: 0.25, // 25% max in single protocol
  },
  
  aggressive: {
    name: 'aggressive',
    minTvl: 500_000,           // $500K minimum TVL
    maxApy: 200,               // Higher APY allowed
    minApy: 30,                // Only high yields
    maxRiskScore: 8,           // Higher risk acceptable
    allowedProtocols: 'all',
    maxChainExposure: 0.6,     // 60% max on single chain
    maxProtocolExposure: 0.4,  // 40% max in single protocol
  },
};

// ============ Default Notification Config ============

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enableConsole: true,
  enableTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  minLevel: 'info' as NotificationLevel,
};

// ============ Default Agent Config ============

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  // Timing
  yieldScanIntervalMs: 10 * 60 * 1000,       // 10 minutes
  fullAnalysisIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
  
  // Decision thresholds
  minApyDifferential: 5,        // 5% minimum APY improvement
  minNetBenefit: 10,            // $10 minimum daily benefit
  maxChainExposure: 0.4,        // 40% max on single chain
  maxProtocolExposure: 0.25,    // 25% max in single protocol
  
  // Risk
  riskProfile: 'balanced',
  
  // Execution
  preferYellowNetwork: true,    // Zero-fee trades first
  maxSlippage: 0.5,             // 0.5% max slippage
  maxBridgeFeePercent: 1.0,     // 1% max bridge fee
  
  // Safety
  maxSingleTradePercent: 25,    // Max 25% of portfolio in single trade
  dailyLossLimit: 5,            // Pause if daily loss > 5%
  pauseOnConsecutiveErrors: 3,  // Pause after 3 consecutive errors
  
  // Notifications
  notifications: DEFAULT_NOTIFICATION_CONFIG,
};

// ============ Chain Configuration ============

export const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH', color: '#627EEA' },
  10: { name: 'Optimism', symbol: 'OP', color: '#FF0420' },
  137: { name: 'Polygon', symbol: 'MATIC', color: '#8247E5' },
  42161: { name: 'Arbitrum', symbol: 'ARB', color: '#28A0F0' },
  8453: { name: 'Base', symbol: 'BASE', color: '#0052FF' },
} as const;

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

// ============ Protocol Tiers ============

export const PROTOCOL_TIERS = {
  tier1: [
    'aave-v3', 'aave-v2',
    'compound-v3', 'compound-v2',
    'maker', 'lido',
  ],
  tier2: [
    'curve-dex', 'convex-finance',
    'yearn-finance', 'morpho',
    'uniswap-v3', 'spark',
  ],
  tier3: [
    'uniswap-v4', 'aerodrome',
    'velodrome', 'balancer',
    'pancakeswap', 'sushiswap',
  ],
} as const;

// ============ Config Helpers ============

/**
 * Get risk profile config by name
 */
export function getRiskProfile(name: RiskProfile): RiskProfileConfig {
  return RISK_PROFILES[name];
}

/**
 * Create agent config with overrides
 */
export function createAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...overrides,
    notifications: {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...overrides.notifications,
    },
  };
}

/**
 * Validate agent config
 */
export function validateAgentConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.minApyDifferential < 0 || config.minApyDifferential > 100) {
    errors.push('minApyDifferential must be between 0 and 100');
  }
  
  if (config.maxChainExposure <= 0 || config.maxChainExposure > 1) {
    errors.push('maxChainExposure must be between 0 and 1');
  }
  
  if (config.maxSlippage < 0 || config.maxSlippage > 10) {
    errors.push('maxSlippage must be between 0 and 10');
  }
  
  if (config.yieldScanIntervalMs < 60000) {
    errors.push('yieldScanIntervalMs must be at least 60 seconds');
  }
  
  if (!['conservative', 'balanced', 'aggressive'].includes(config.riskProfile)) {
    errors.push('Invalid risk profile');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Get protocol tier (1-3, lower = safer)
 */
export function getProtocolTier(protocol: string): number {
  const normalized = protocol.toLowerCase();
  
  if (PROTOCOL_TIERS.tier1.some(p => normalized.includes(p))) return 1;
  if (PROTOCOL_TIERS.tier2.some(p => normalized.includes(p))) return 2;
  if (PROTOCOL_TIERS.tier3.some(p => normalized.includes(p))) return 3;
  
  return 4; // Unknown protocol = highest risk tier
}

/**
 * Check if protocol is allowed for risk profile
 */
export function isProtocolAllowed(protocol: string, riskProfile: RiskProfile): boolean {
  const config = RISK_PROFILES[riskProfile];
  
  if (config.allowedProtocols === 'all') return true;
  
  const normalized = protocol.toLowerCase();
  return config.allowedProtocols.some(p => normalized.includes(p.toLowerCase()));
}
