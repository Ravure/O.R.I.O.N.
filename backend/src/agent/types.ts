/**
 * ORION AI Agent Types
 * 
 * Core type definitions for the autonomous yield hunting agent.
 */

// ============ Risk Profiles ============

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export interface RiskProfileConfig {
  name: RiskProfile;
  minTvl: number;          // Minimum TVL for pools
  maxApy: number;          // Maximum APY (filter out scams)
  minApy: number;          // Minimum APY worth considering
  maxRiskScore: number;    // Max acceptable risk score (1-10)
  allowedProtocols: string[] | 'all';
  maxChainExposure: number; // Max % on single chain (0-1)
  maxProtocolExposure: number; // Max % in single protocol (0-1)
}

// ============ Portfolio Types ============

export interface Position {
  id: string;              // Unique position ID
  chainId: number;
  chainName: string;
  protocol: string;
  pool: string;
  symbol: string;
  balance: number;         // Current balance in USD
  entryApy: number;        // APY when position was opened
  currentApy: number;      // Current APY
  entryTimestamp: number;  // When position was opened
  lastUpdated: number;     // Last update timestamp
  unrealizedPnl: number;   // Unrealized profit/loss
}

export interface Portfolio {
  positions: Position[];
  totalValue: number;
  totalPnl: number;
  chainExposure: Map<number, number>;    // chainId -> % allocation
  protocolExposure: Map<string, number>; // protocol -> % allocation
  lastUpdated: number;
}

export interface PortfolioSnapshot {
  timestamp: number;
  totalValue: number;
  totalPnl: number;
  positionCount: number;
  topPosition: Position | null;
}

// ============ Decision Types ============

export type ActionType = 
  | 'hold'           // Do nothing
  | 'rebalance'      // Move within same chain
  | 'bridge'         // Move cross-chain
  | 'deposit'        // Add to position
  | 'withdraw';      // Remove from position

export interface RebalanceOpportunity {
  id: string;
  fromPosition: Position | null;  // null = new deposit
  toPool: {
    chainId: number;
    chainName: string;
    protocol: string;
    pool: string;
    symbol: string;
    apy: number;
    tvl: number;
    riskScore: number;
  };
  amount: number;
  apyGain: number;           // Percentage improvement
  estimatedCost: number;     // Bridge/gas cost in USD
  netBenefit: number;        // Daily benefit after costs
  annualizedBenefit: number; // Yearly benefit projection
  actionType: ActionType;
  reason: string;
  priority: number;          // Higher = more urgent (0-100)
}

export interface RebalancePlan {
  id: string;
  timestamp: number;
  opportunities: RebalanceOpportunity[];
  totalNetBenefit: number;
  estimatedExecutionTime: number; // seconds
  riskProfile: RiskProfile;
  approved: boolean;
}

export interface DecisionResult {
  shouldAct: boolean;
  plan: RebalancePlan | null;
  reason: string;
  nextCheckTime: number;
}

// ============ Execution Types ============

export type ExecutionStatus = 
  | 'pending'
  | 'executing'
  | 'confirming'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface TradeExecution {
  id: string;
  opportunityId: string;
  actionType: ActionType;
  status: ExecutionStatus;
  
  // Details
  fromChain: number;
  toChain: number;
  amount: number;
  
  // Transactions
  txHashes: string[];
  bridgeTxId?: string;
  
  // Timing
  startTime: number;
  endTime?: number;
  
  // Results
  actualCost: number;
  actualReceived?: number;
  slippage?: number;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  executions: TradeExecution[];
  totalCost: number;
  totalReceived: number;
  errors: string[];
}

// ============ Notification Types ============

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error' | 'critical';

export type NotificationChannel = 'console' | 'telegram';

export interface Notification {
  id: string;
  timestamp: number;
  level: NotificationLevel;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
}

export interface NotificationConfig {
  enableConsole: boolean;
  enableTelegram: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  minLevel: NotificationLevel;
}

// ============ Agent Types ============

export type AgentState = 
  | 'idle'
  | 'scanning'
  | 'analyzing'
  | 'executing'
  | 'paused'
  | 'error'
  | 'stopped';

export interface AgentStatus {
  state: AgentState;
  startTime: number;
  lastScanTime: number;
  lastActionTime: number;
  scanCount: number;
  actionCount: number;
  totalPnl: number;
  errors: string[];
  currentPortfolio: Portfolio | null;
  nextScheduledAction: string;
  uptime: number;
}

export interface AgentAction {
  id: string;
  timestamp: number;
  type: 'scan' | 'analyze' | 'execute' | 'notify';
  description: string;
  result: any;
  duration: number;
}

export interface AgentConfig {
  // Timing
  yieldScanIntervalMs: number;
  fullAnalysisIntervalMs: number;
  
  // Decision thresholds
  minApyDifferential: number;
  minNetBenefit: number;
  maxChainExposure: number;
  maxProtocolExposure: number;
  
  // Risk
  riskProfile: RiskProfile;
  
  // Execution
  preferYellowNetwork: boolean;
  maxSlippage: number;
  maxBridgeFeePercent: number;
  
  // Safety
  maxSingleTradePercent: number;
  dailyLossLimit: number;
  pauseOnConsecutiveErrors: number;
  
  // Notifications
  notifications: NotificationConfig;
}

// ============ Events ============

export type AgentEvent = 
  | { type: 'started'; timestamp: number }
  | { type: 'stopped'; timestamp: number; reason: string }
  | { type: 'scan_completed'; timestamp: number; poolCount: number }
  | { type: 'opportunity_found'; timestamp: number; opportunity: RebalanceOpportunity }
  | { type: 'execution_started'; timestamp: number; plan: RebalancePlan }
  | { type: 'execution_completed'; timestamp: number; result: ExecutionResult }
  | { type: 'error'; timestamp: number; error: string }
  | { type: 'paused'; timestamp: number; reason: string }
  | { type: 'resumed'; timestamp: number };

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

// ============ Storage Types ============

export interface StoredPosition {
  id: string;
  chain_id: number;
  chain_name: string;
  protocol: string;
  pool: string;
  symbol: string;
  balance: number;
  entry_apy: number;
  current_apy: number;
  entry_timestamp: number;
  last_updated: number;
  unrealized_pnl: number;
}

export interface StoredExecution {
  id: string;
  opportunity_id: string;
  action_type: string;
  status: string;
  from_chain: number;
  to_chain: number;
  amount: number;
  tx_hashes: string;
  start_time: number;
  end_time: number | null;
  actual_cost: number;
  actual_received: number | null;
  error: string | null;
}

export interface StoredAgentState {
  id: number;
  state: string;
  start_time: number;
  last_scan_time: number;
  last_action_time: number;
  scan_count: number;
  action_count: number;
  total_pnl: number;
  config_json: string;
}
