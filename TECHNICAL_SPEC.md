# Technical Specification - Project ORION
**Version:** 1.0  
**Date:** February 1, 2026  
**Companion to:** PRD.md

---

## 🏗 Detailed Architecture Specifications

### 1. System Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐     │
│  │   React UI   │  │  WebSocket   │  │  Wallet Connector   │     │
│  │  Dashboard   │  │   Client     │  │   (WalletConnect)   │     │
│  └──────┬───────┘  └───────┬──────┘  └─────────────┬───────┘     │
└─────────┼──────────────────┼───────────────────────┼─────────────┘
          │                  │                       │
┌─────────▼──────────────────▼───────────────────────▼─────────────┐
│                        APPLICATION LAYER                         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              ORION Agent Orchestrator                    │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐   │    │
│  │  │ Risk     │  │ Portfolio│  │ Yield    │  │ Trade   │   │    │
│  │  │ Analyzer │  │ Manager  │  │ Scanner  │  │ Executor│   │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                  Data Layer                              │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │    │
│  │  │ SQLite DB   │  │ Redis Cache  │  │ The Graph API  │   │    │
│  │  │ (State)     │  │ (APY Data)   │  │ (On-chain)     │   │    │
│  │  └─────────────┘  └──────────────┘  └────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬──────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────┐
│                      INTEGRATION LAYER                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐    │
│  │ ENS Client │  │  Yellow    │  │ Uniswap v4 │  │   LI.FI   │    │
│  │ (ethers.js)│  │  Nitrolite │  │   Client   │  │    SDK    │    │
│  └─────┬──────┘  └─────┬──────┘  └──────┬─────┘  └──────┬────┘    │
└────────┼───────────────┼────────────────┼───────────────┼─────────┘
         │               │                │               │
┌────────▼───────────────▼────────────────▼───────────────▼─────────┐
│                       BLOCKCHAIN LAYER                            │
│  [Ethereum]  [Base]  [Arbitrum]  [Polygon]  [Sui]  [Circle Arc]   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🔌 API Specifications

### ENS Client API

#### 1. Read Risk Profile
```typescript
/**
 * Fetches user's risk configuration from ENS
 * @param ensName - User's ENS name (e.g., "vitalik.eth")
 * @returns UserProfile object or null if not configured
 */
async function getUserProfile(ensName: string): Promise<UserProfile | null> {
  const provider = new ethers.JsonRpcProvider(ALCHEMY_RPC_URL);
  
  try {
    // Resolve ENS name to address
    const address = await provider.resolveName(ensName);
    if (!address) throw new Error('ENS name not found');
    
    // Get resolver
    const resolver = await provider.getResolver(ensName);
    if (!resolver) throw new Error('No resolver configured');
    
    // Read all configuration keys
    const [riskProfile, maxSlippage, rebalanceFreq] = await Promise.all([
      resolver.getText('risk_profile'),
      resolver.getText('max_slippage'),
      resolver.getText('rebalance_frequency')
    ]);
    
    return {
      ensName,
      address,
      riskProfile: riskProfile as RiskLevel,
      maxSlippage: parseFloat(maxSlippage) || 0.5,
      rebalanceFrequency: rebalanceFreq as RebalanceFreq || 'weekly'
    };
  } catch (error) {
    console.error('Failed to read ENS profile:', error);
    return null;
  }
}
```

#### 2. Update Risk Profile
```typescript
/**
 * Updates user's ENS text records
 * @param ensName - User's ENS name
 * @param updates - Key-value pairs to update
 * @param signer - Ethers signer (from connected wallet)
 */
async function updateProfile(
  ensName: string,
  updates: Partial<UserProfile>,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const resolver = await provider.getResolver(ensName);
  
  // Build transaction
  const tx = await resolver.setText(
    'risk_profile',
    updates.riskProfile
  );
  
  return await tx.wait();
}
```

**ENS Text Record Schema**:
```typescript
interface ENSTextRecords {
  risk_profile: 'low' | 'medium' | 'high';
  max_slippage: string;              // "0.5" = 0.5%
  rebalance_frequency: 'daily' | 'weekly' | 'monthly';
  min_apy_threshold: string;         // "5.0" = 5% APY
  excluded_protocols: string;        // "aave,compound"
  max_chain_exposure: string;        // "0.5" = 50% per chain
  notification_webhook: string;      // Optional webhook URL
}
```

---

### Yellow Network Integration

#### 1. Session Management
```typescript
import { NitroliteClient } from '@erc7824/nitrolite';

class YellowNetworkClient {
  private client: NitroliteClient;
  private sessionId: string | null = null;
  
  constructor(privateKey: string) {
    this.client = new NitroliteClient({
      endpoint: 'wss://clearnet-sandbox.yellow.com/ws',
      privateKey: privateKey
    });
  }
  
  /**
   * Opens a state channel session
   * @param duration - Session duration in seconds
   * @param maxAmount - Maximum USDC amount to lock
   */
  async openSession(duration: number = 86400, maxAmount: string = '10000') {
    const session = await this.client.createAppSessionMessage({
      appName: 'ORION',
      duration,
      maxAmount,
      collateralToken: 'USDC'
    });
    
    this.sessionId = session.sessionId;
    console.log(`Session opened: ${this.sessionId}`);
    
    return this.sessionId;
  }
  
  /**
   * Executes a swap via state channel
   * @param fromToken - Source token symbol
   * @param toToken - Destination token symbol
   * @param amount - Amount in base units
   */
  async executeSwap(fromToken: string, toToken: string, amount: string) {
    if (!this.sessionId) throw new Error('No active session');
    
    const payment = await this.client.sendPayment({
      sessionId: this.sessionId,
      from: fromToken,
      to: toToken,
      amount,
      nonce: Date.now()
    });
    
    return {
      txHash: payment.paymentHash,
      timestamp: Date.now(),
      gasFeePaid: 0  // Always zero for state channels!
    };
  }
  
  /**
   * Settles the state channel on-chain
   */
  async closeSession() {
    if (!this.sessionId) return;
    
    const settlement = await this.client.settleSession(this.sessionId);
    console.log(`Session settled. On-chain TX: ${settlement.txHash}`);
    
    this.sessionId = null;
    return settlement;
  }
}
```

#### 2. Trade Execution Flow
```
User Request → Check Session → Execute via WebSocket → Update Portfolio
     │              │                     │                    │
     │              ├─ If expired ────────┴──── Open New ──────┘
     │              │
     │              ├─ If active ──────── Send Payment Message
     │              │
     └──────────────┴─────────────────── Return Result
```

**WebSocket Message Format**:
```json
{
  "type": "PAYMENT",
  "sessionId": "0x123abc...",
  "payload": {
    "from": "USDC",
    "to": "DAI",
    "amount": "100000000",  // 100 USDC in base units
    "nonce": 1706832000,
    "signature": "0xabc123..."
  }
}
```

---

### Uniswap v4 Hook Specification

#### Smart Contract Interface
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/BaseHook.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

interface IENSResolver {
    function text(bytes32 node, string calldata key) 
        external view returns (string memory);
}

contract ORIONRiskHook is BaseHook {
    IENSResolver public immutable ensResolver;
    
    // Events
    event SwapBlocked(address indexed user, string reason, uint256 priceImpact);
    event RiskProfileChecked(address indexed user, string profile);
    
    constructor(
        IPoolManager _poolManager,
        address _ensResolver
    ) BaseHook(_poolManager) {
        ensResolver = IENSResolver(_ensResolver);
    }
    
    function getHookPermissions() 
        public pure override 
        returns (Hooks.Permissions memory) 
    {
        return Hooks.Permissions({
            beforeSwap: true,
            afterSwap: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeDonate: false,
            afterDonate: false
        });
    }
    
    /**
     * Validates swap against user's risk profile
     * Executes BEFORE swap happens
     */
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4) {
        // 1. Get user's ENS name from reverse resolver
        string memory ensName = _resolveAddress(sender);
        
        // 2. Read risk profile
        string memory riskProfile = ensResolver.text(
            _namehash(ensName),
            "risk_profile"
        );
        
        emit RiskProfileChecked(sender, riskProfile);
        
        // 3. Calculate price impact
        uint256 priceImpact = _calculatePriceImpact(key, params);
        
        // 4. Enforce limits based on risk profile
        uint256 maxImpact = _getMaxImpact(riskProfile);
        
        require(
            priceImpact <= maxImpact,
            "Price impact exceeds risk tolerance"
        );
        
        return BaseHook.beforeSwap.selector;
    }
    
    /**
     * Logs swap execution for analytics
     * Executes AFTER swap completes
     */
    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4) {
        // Log trade for portfolio tracking
        emit SwapExecuted(sender, delta.amount0(), delta.amount1());
        
        return BaseHook.afterSwap.selector;
    }
    
    // Internal helpers
    function _getMaxImpact(string memory riskProfile) 
        internal pure returns (uint256) 
    {
        if (keccak256(bytes(riskProfile)) == keccak256("low")) {
            return 50;  // 0.5% max slippage
        } else if (keccak256(bytes(riskProfile)) == keccak256("medium")) {
            return 100;  // 1% max slippage
        } else {
            return 200;  // 2% max slippage
        }
    }
    
    function _calculatePriceImpact(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params
    ) internal view returns (uint256) {
        // TODO: Implement TWAP-based price impact calculation
        // This is a simplified version
        return 0;  // Placeholder
    }
}
```

#### Deployment Script (Foundry)
```solidity
// script/DeployORIONHook.s.sol
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ORIONRiskHook.sol";

contract DeployORIONHook is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envAddress("POOL_MANAGER_ADDRESS");
        address ensResolver = vm.envAddress("ENS_RESOLVER_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        ORIONRiskHook hook = new ORIONRiskHook(
            IPoolManager(poolManager),
            ensResolver
        );
        
        console.log("Hook deployed at:", address(hook));
        
        vm.stopBroadcast();
    }
}
```

**Deployment Command**:
```bash
forge script script/DeployORIONHook.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

---

### LI.FI Bridge Integration

#### 1. Get Best Route
```typescript
import { LiFi, RouteRequest } from '@lifi/sdk';

const lifi = new LiFi({
  integrator: 'ORION'  // Your app name
});

async function getBestBridgeRoute(
  fromChain: number,    // 1 = Ethereum, 8453 = Base
  toChain: number,
  amount: string,       // In wei
  userAddress: string
): Promise<Route> {
  const routeRequest: RouteRequest = {
    fromChainId: fromChain,
    toChainId: toChain,
    fromTokenAddress: USDC_ADDRESSES[fromChain],
    toTokenAddress: USDC_ADDRESSES[toChain],
    fromAmount: amount,
    fromAddress: userAddress,
    toAddress: userAddress,
    options: {
      slippage: 0.005,      // 0.5%
      order: 'RECOMMENDED',  // Balance of speed + cost
      allowBridges: ['stargate', 'across', 'hop']
    }
  };
  
  const routes = await lifi.getRoutes(routeRequest);
  
  // Return fastest route with acceptable cost
  return routes[0];
}
```

#### 2. Execute Bridge
```typescript
async function executeBridge(route: Route, signer: ethers.Signer) {
  // Get transaction data
  const txData = await lifi.getStepTransaction(route.steps[0]);
  
  // Execute via user's wallet
  const tx = await signer.sendTransaction({
    to: txData.to,
    data: txData.data,
    value: txData.value,
    gasLimit: txData.gasLimit
  });
  
  console.log(`Bridge initiated: ${tx.hash}`);
  
  // Track status
  const status = await lifi.getStatus({
    txHash: tx.hash,
    bridge: route.steps[0].tool,
    fromChain: route.fromChainId,
    toChain: route.toChainId
  });
  
  return status;
}
```

#### 3. Bridge Status Monitoring
```typescript
/**
 * Polls bridge status until completion
 * @param txHash - Bridge transaction hash
 * @param fromChain - Source chain ID
 * @param toChain - Destination chain ID
 */
async function waitForBridgeCompletion(
  txHash: string,
  fromChain: number,
  toChain: number
): Promise<boolean> {
  const maxAttempts = 60;  // 5 minutes (5s intervals)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const status = await lifi.getStatus({
      txHash,
      bridge: 'stargate',
      fromChain,
      toChain
    });
    
    if (status.status === 'DONE') {
      console.log('Bridge completed!');
      return true;
    } else if (status.status === 'FAILED') {
      throw new Error('Bridge failed');
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  throw new Error('Bridge timeout');
}
```

---

## 🗄️ Database Schema (SQLite)

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    ens_name TEXT UNIQUE,
    risk_profile TEXT CHECK(risk_profile IN ('low', 'medium', 'high')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_ens ON users(ens_name);
```

### Portfolios Table
```sql
CREATE TABLE portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_value_usdc REAL NOT NULL DEFAULT 0,
    last_rebalance DATETIME,
    lifetime_yield REAL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_portfolios_user ON portfolios(user_id);
```

### Positions Table
```sql
CREATE TABLE positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    chain TEXT NOT NULL,
    amount REAL NOT NULL,
    current_apy REAL,
    entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    yield_earned REAL DEFAULT 0,
    status TEXT CHECK(status IN ('active', 'pending', 'closed')),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

CREATE INDEX idx_positions_portfolio ON positions(portfolio_id);
CREATE INDEX idx_positions_status ON positions(status);
```

### Trades Table
```sql
CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    trade_type TEXT CHECK(trade_type IN ('deposit', 'withdraw', 'swap', 'bridge')),
    from_protocol TEXT,
    to_protocol TEXT,
    from_chain TEXT,
    to_chain TEXT,
    amount REAL NOT NULL,
    gas_fee_paid REAL DEFAULT 0,
    tx_hash TEXT,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

CREATE INDEX idx_trades_portfolio ON trades(portfolio_id);
CREATE INDEX idx_trades_timestamp ON trades(timestamp);
```

### Opportunities Cache Table
```sql
CREATE TABLE opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol TEXT NOT NULL,
    chain TEXT NOT NULL,
    apy REAL NOT NULL,
    tvl REAL,
    risk_score INTEGER CHECK(risk_score BETWEEN 1 AND 10),
    contract_address TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(protocol, chain)
);

CREATE INDEX idx_opportunities_apy ON opportunities(apy DESC);
CREATE INDEX idx_opportunities_updated ON opportunities(last_updated);
```

---

## 📊 Agent Decision Engine

### Risk Scoring Algorithm
```typescript
/**
 * Calculates risk-adjusted score for an opportunity
 * Higher score = better opportunity for the given risk profile
 */
function calculateOpportunityScore(
  opportunity: YieldOpportunity,
  riskProfile: RiskLevel
): number {
  const riskWeights = {
    low: { apyWeight: 0.3, riskWeight: 0.7 },
    medium: { apyWeight: 0.6, riskWeight: 0.4 },
    high: { apyWeight: 0.9, riskWeight: 0.1 }
  };
  
  const weights = riskWeights[riskProfile];
  
  // Normalize APY (0-20% → 0-1)
  const normalizedAPY = Math.min(opportunity.apy / 20, 1);
  
  // Invert risk score (10 is risky, 1 is safe → flip it)
  const safetyScore = (11 - opportunity.riskScore) / 10;
  
  // Weighted combination
  const score = (
    normalizedAPY * weights.apyWeight +
    safetyScore * weights.riskWeight
  );
  
  // Bonus for high TVL (indicates safety)
  const tvlBonus = opportunity.tvl > 100_000_000 ? 0.1 : 0;
  
  return score + tvlBonus;
}
```

### Rebalancing Decision Tree
```typescript
async function shouldRebalance(
  currentPortfolio: Portfolio,
  opportunities: YieldOpportunity[],
  riskProfile: UserProfile
): Promise<RebalanceAction | null> {
  // 1. Calculate current portfolio score
  const currentScore = currentPortfolio.positions.reduce((sum, pos) => 
    sum + (pos.amount * pos.apy), 0
  ) / currentPortfolio.totalValueUSDC;
  
  // 2. Find best opportunity
  const bestOpp = opportunities
    .filter(opp => opp.riskScore <= getRiskThreshold(riskProfile.riskProfile))
    .sort((a, b) => 
      calculateOpportunityScore(b, riskProfile.riskProfile) - 
      calculateOpportunityScore(a, riskProfile.riskProfile)
    )[0];
  
  // 3. Calculate potential improvement
  const potentialScore = bestOpp.apy;
  const improvement = potentialScore - currentScore;
  
  // 4. Decision logic
  if (improvement > 0.02) {  // >2% APY improvement
    return {
      type: 'REBALANCE',
      from: currentPortfolio.positions[0],  // Simplification
      to: bestOpp,
      amount: currentPortfolio.totalValueUSDC,
      reason: `${improvement.toFixed(2)}% APY improvement`
    };
  }
  
  // 5. Check chain concentration risk
  const chainExposure = getChainExposure(currentPortfolio);
  if (Object.values(chainExposure).some(exp => exp > 0.6)) {
    return {
      type: 'DIVERSIFY',
      reason: 'Chain concentration risk'
    };
  }
  
  return null;  // No action needed
}

function getRiskThreshold(riskLevel: RiskLevel): number {
  return {
    low: 3,     // Only protocols with risk score 1-3
    medium: 6,  // Risk score 1-6
    high: 10    // All protocols
  }[riskLevel];
}
```

---

## 🔄 Background Job Scheduler

```typescript
import cron from 'node-cron';

class ORIONScheduler {
  /**
   * Scans yield opportunities every 5 minutes
   */
  startOpportunityScanner() {
    cron.schedule('*/5 * * * *', async () => {
      console.log('[CRON] Scanning opportunities...');
      
      const opportunities = await scanAllProtocols();
      await db.opportunities.upsertMany(opportunities);
      
      console.log(`[CRON] Found ${opportunities.length} opportunities`);
    });
  }
  
  /**
   * Checks if users need rebalancing (based on their frequency setting)
   */
  startRebalanceChecker() {
    cron.schedule('0 */6 * * *', async () => {  // Every 6 hours
      console.log('[CRON] Checking rebalancing needs...');
      
      const users = await db.users.findAll();
      
      for (const user of users) {
        const profile = await getUserProfile(user.ensName);
        if (!profile) continue;
        
        const portfolio = await db.portfolios.findByUserId(user.id);
        const opportunities = await db.opportunities.findAll();
        
        const action = await shouldRebalance(portfolio, opportunities, profile);
        
        if (action) {
          await executeRebalance(user, action);
        }
      }
    });
  }
  
  /**
   * Settles Yellow Network sessions daily
   */
  startSessionSettler() {
    cron.schedule('0 0 * * *', async () => {  // Midnight daily
      console.log('[CRON] Settling Yellow Network sessions...');
      
      const yellowClient = new YellowNetworkClient(process.env.AGENT_KEY);
      await yellowClient.closeSession();
    });
  }
  
  /**
   * Syncs ENS profiles hourly
   */
  startENSSync() {
    cron.schedule('0 * * * *', async () => {  // Every hour
      console.log('[CRON] Syncing ENS profiles...');
      
      const users = await db.users.findAll({ where: { ensName: { not: null } } });
      
      for (const user of users) {
        const profile = await getUserProfile(user.ensName);
        if (profile) {
          await db.users.update(user.id, {
            riskProfile: profile.riskProfile
          });
        }
      }
    });
  }
}

// Start all background jobs
const scheduler = new ORIONScheduler();
scheduler.startOpportunityScanner();
scheduler.startRebalanceChecker();
scheduler.startSessionSettler();
scheduler.startENSSync();
```

---

## 🧪 Testing Specifications

### Unit Test Examples

#### Test: ENS Profile Reading
```typescript
import { describe, it, expect } from 'vitest';
import { getUserProfile } from '../src/ens';

describe('ENS Integration', () => {
  it('should read risk profile from ENS', async () => {
    const profile = await getUserProfile('test-orion.eth');
    
    expect(profile).toBeDefined();
    expect(profile.riskProfile).toBe('low');
    expect(profile.maxSlippage).toBe(0.5);
  });
  
  it('should return null for non-existent ENS', async () => {
    const profile = await getUserProfile('does-not-exist-123.eth');
    expect(profile).toBeNull();
  });
});
```

#### Test: Opportunity Scoring
```typescript
describe('Risk Scoring', () => {
  it('should score high APY higher for aggressive profile', () => {
    const opp = {
      protocol: 'Aave',
      chain: 'ethereum',
      apy: 15,
      riskScore: 8
    };
    
    const lowScore = calculateOpportunityScore(opp, 'low');
    const highScore = calculateOpportunityScore(opp, 'high');
    
    expect(highScore).toBeGreaterThan(lowScore);
  });
});
```

### Integration Test Example

```typescript
describe('End-to-End Rebalancing', () => {
  it('should rebalance when better opportunity exists', async () => {
    // 1. Setup user with ENS
    const user = await createTestUser('test-user.eth');
    await setENSRiskProfile('test-user.eth', 'medium');
    
    // 2. Create initial position
    await depositToAave(user, 1000, 'ethereum');
    
    // 3. Mock higher APY on another chain
    mockOpportunity({
      protocol: 'Aave',
      chain: 'base',
      apy: 8  // vs. 5% on Ethereum
    });
    
    // 4. Trigger rebalance check
    await scheduler.checkRebalancing();
    
    // 5. Verify bridge was executed
    const trades = await db.trades.findByUser(user.id);
    expect(trades).toContainEqual(
      expect.objectContaining({
        tradeType: 'bridge',
        fromChain: 'ethereum',
        toChain: 'base'
      })
    );
  });
});
```

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (`npm test`)
- [ ] Environment variables set in `.env.production`
- [ ] Smart contracts deployed to testnet
- [ ] Contract addresses updated in config
- [ ] Frontend build successful (`npm run build`)

### Deployment Steps

#### 1. Smart Contracts (Sepolia)
```bash
# Deploy hook
forge script script/DeployORIONHook.s.sol --broadcast --verify

# Copy contract address
export HOOK_ADDRESS="0x..."

# Verify on Etherscan
forge verify-contract $HOOK_ADDRESS ORIONRiskHook --chain sepolia
```

#### 2. Backend (Railway)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up
```

#### 3. Frontend (Vercel)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add VITE_HOOK_ADDRESS production
vercel env add VITE_ALCHEMY_KEY production
```

### Post-Deployment Verification
- [ ] Frontend loads without errors
- [ ] Wallet connection works
- [ ] ENS reading displays correct data
- [ ] Test trade executes successfully
- [ ] Yellow Network connection stable
- [ ] LI.FI quotes return correctly

---

## 📈 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| ENS Read Latency | <500ms | Time to fetch profile |
| Yellow Network Trade | <2s | WebSocket round-trip |
| Bridge Execution | <3 min | LI.FI quote → completion |
| Opportunity Scan | <30s | All protocols, all chains |
| Dashboard Load | <2s | First Contentful Paint |
| Gas Savings | >95% | vs. traditional on-chain |

---

## 🔒 Security Checklist

### Smart Contracts
- [ ] Slither analysis passes
- [ ] Mythril scan clean
- [ ] Manual audit of critical paths
- [ ] Test coverage >90%
- [ ] Emergency pause function tested

### Backend
- [ ] Private keys in environment variables (not code)
- [ ] Rate limiting on all API endpoints
- [ ] Input validation on all user data
- [ ] SQL injection prevention (parameterized queries)
- [ ] CORS configured correctly

### Frontend
- [ ] XSS prevention (React auto-escaping)
- [ ] No sensitive data in localStorage
- [ ] HTTPS enforced
- [ ] Content Security Policy headers
- [ ] Wallet connection via WalletConnect (not private keys)

---

**End of Technical Specification**

*Companion document to PRD.md*  
*Last Updated: February 1, 2026*