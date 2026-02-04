# Project ORION - Product Requirements Document
**Version:** 1.0  
**Date:** February 1, 2026  
**Status:** Planning Phase  
**Project Type:** Hackathon Submission - Multi-Chain DeFi AI Agent

---

## 📋 Executive Summary

### Project Name
**ORION** - Optimized Risk & Intelligence On-chain Navigator

### Vision Statement
An autonomous AI agent that manages user wealth (USDC) by navigating cross-chain yields with zero-fee state channels, providing intelligent portfolio rebalancing based on user-defined risk profiles stored on-chain.

### Core Value Proposition
- **Zero-Fee Trading**: Leverage Yellow Network's state channels for gas-free micro-transactions
- **Cross-Chain Intelligence**: Automatically find and capture the best yields across multiple blockchains
- **User-Controlled Risk**: Risk profiles stored immutably on ENS, ensuring transparency
- **Autonomous Execution**: AI-driven decision making with Uniswap v4 Hooks
- **Stable Asset Focus**: Built entirely around USDC for predictable, low-volatility returns

### Success Metrics
- Successfully execute 100+ trades on testnet without gas fees
- Achieve 5%+ APY improvement over static single-chain holding
- Complete 10+ cross-chain bridges with <2 minute execution time
- Demonstrate 99%+ adherence to user risk profiles

---

## 🎯 Problem Statement

### Current Market Pain Points

1. **High Gas Fees**: Traditional DeFi trading costs $5-50 per transaction
2. **Fragmented Liquidity**: Best yields scattered across 10+ different chains
3. **Manual Management**: Users must manually monitor and rebalance positions
4. **Risk Misalignment**: No easy way to enforce personal risk tolerance on-chain
5. **Complexity Barrier**: Average user cannot navigate multi-chain DeFi safely

### Target User Profile

**Primary Persona: "Cautious Crypto Carl"**
- Age: 28-45
- Experience: 1-3 years in crypto
- Holdings: $5,000 - $50,000 in USDC
- Goal: Earn 5-8% APY without active management
- Pain: Doesn't trust complex DeFi protocols, fears impermanent loss
- Risk Profile: Conservative (low volatility tolerance)

**Secondary Persona: "Yield Hunter Hannah"**
- Age: 25-35
- Experience: 3+ years in crypto
- Holdings: $50,000+
- Goal: Maximize yield (12%+ APY) across all opportunities
- Pain: Too many opportunities, can't monitor 24/7
- Risk Profile: Aggressive (willing to take calculated risks)

---

## 🏗 Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                        │
│  (React Dashboard + ENS Configuration Portal)            │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              ORION AI AGENT CORE                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Risk Profile  │  │Opportunity   │  │Execution     │  │
│  │Reader (ENS)  │  │Scanner       │  │Engine        │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│           BLOCKCHAIN INTEGRATION LAYER                   │
│  ┌──────────────┬──────────────┬──────────────────────┐ │
│  │Yellow Network│Uniswap v4    │LI.FI Bridge          │ │
│  │(State Chan.) │(Smart AMM)   │(Cross-Chain Router)  │ │
│  └──────────────┴──────────────┴──────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              MULTI-CHAIN LAYER                           │
│  [Ethereum] [Base] [Arbitrum] [Polygon] [Sui] [Circle]  │
└──────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Identity Layer (ENS Integration)
**Purpose**: Store and retrieve user risk profiles on-chain

**Technical Implementation**:
- Use ENS Text Records for configuration storage
- Support multiple parameters: `risk_profile`, `max_slippage`, `rebalance_frequency`
- Read-only access for the agent (user updates via ENS manager UI)

**Data Schema**:
```
ENS Name: orion-user.eth
Text Records:
  - risk_profile: "low" | "medium" | "high"
  - max_slippage: "0.5" (percentage)
  - rebalance_frequency: "daily" | "weekly" | "monthly"
  - min_apy_threshold: "5.0" (percentage)
  - excluded_protocols: "compound,aave" (comma-separated)
```

#### 2. Brain Layer (Uniswap v4 Hooks)
**Purpose**: Create custom trading logic based on risk profiles

**Hook Types to Implement**:

1. **beforeSwap Hook**:
   - Read user's ENS risk profile
   - Check if swap meets risk criteria
   - Reject if price impact exceeds threshold

2. **afterSwap Hook**:
   - Log trade execution to event stream
   - Update portfolio analytics
   - Trigger rebalancing if needed

3. **beforeModifyPosition Hook**:
   - Validate liquidity provision against risk limits
   - Ensure impermanent loss exposure is acceptable

**Sample Hook Logic**:
```solidity
function beforeSwap(
    address sender,
    PoolKey calldata key,
    IPoolManager.SwapParams calldata params
) external returns (bytes4) {
    // 1. Resolve sender's ENS name
    string memory ensName = reverseRegistrar.getName(sender);
    
    // 2. Read risk profile from ENS
    string memory riskProfile = ensResolver.text(ensName, "risk_profile");
    
    // 3. Get max allowed slippage
    uint256 maxSlippage = parseSlippage(
        ensResolver.text(ensName, "max_slippage")
    );
    
    // 4. Calculate actual price impact
    uint256 priceImpact = calculatePriceImpact(params);
    
    // 5. Enforce risk limits
    require(priceImpact <= maxSlippage, "Exceeds risk tolerance");
    
    return IHooks.beforeSwap.selector;
}
```

#### 3. Zero-Fee Layer (Yellow Network)
**Purpose**: Execute micro-trades without gas costs

**Integration Flow**:
1. **Session Creation**: Open persistent WebSocket connection
2. **App Session**: Create ERC-7824 compliant session message
3. **Payment Channel**: Lock USDC collateral in state channel
4. **Trade Execution**: Send signed payment messages off-chain
5. **Settlement**: Periodically settle net balances on-chain

**Key Features**:
- Instant finality (no block confirmations)
- Zero gas fees per trade
- Support for high-frequency rebalancing
- Atomic cross-chain swaps via OpenTabs

**Technical Setup**:
```javascript
const { NitroliteClient } = require('@erc7824/nitrolite');

// Initialize client
const client = new NitroliteClient({
  endpoint: 'wss://clearnet-sandbox.yellow.com/ws',
  privateKey: process.env.AGENT_PRIVATE_KEY
});

// Create session
const session = await client.createAppSessionMessage({
  appName: 'ORION',
  duration: 86400, // 24 hours
  maxAmount: '10000' // 10k USDC
});

// Execute trade
const trade = await client.sendPayment({
  from: 'USDC',
  to: 'DAI',
  amount: '100',
  recipient: yieldProtocolAddress
});
```

#### 4. Airport Layer (LI.FI Integration)
**Purpose**: Seamlessly bridge assets across chains

**Supported Chains** (Priority Order):
1. **Ethereum Mainnet** - Highest liquidity, most protocols
2. **Base** - Low fees, growing ecosystem
3. **Arbitrum** - Established DeFi, good yields
4. **Polygon** - Ultra-low fees, stable yields
5. **Sui** - Emerging chain, potential alpha

**Bridge Strategy**:
```javascript
const { LiFi } = require('@lifi/sdk');

async function findBestBridge(fromChain, toChain, amount) {
  const quote = await LiFi.getQuote({
    fromChain: fromChain,
    toChain: toChain,
    fromToken: 'USDC',
    toToken: 'USDC',
    fromAmount: amount,
    slippage: 0.005, // 0.5%
    order: 'RECOMMENDED' // Optimize for speed + cost
  });
  
  return quote.transactionRequest;
}
```

**Bridge Triggers**:
- Yield differential >2% APY on another chain
- Liquidity concentration risk (>50% on single chain)
- User-configured rebalancing schedule

#### 5. Yield Discovery Engine
**Purpose**: Continuously scan for best yield opportunities

**Protocols to Monitor**:
| Protocol | Chains | Asset Type | Typical APY |
|----------|--------|------------|-------------|
| Aave | ETH, Base, Arb, Polygon | Lending | 3-5% |
| Compound | ETH, Base | Lending | 2-4% |
| Uniswap v4 | ETH, Base, Arb | LP Fees | 4-8% |
| Curve | ETH, Polygon | Stable LP | 3-6% |
| Stargate | Multi | Bridge LP | 5-10% |
| Sui Staking | Sui | Validator | 3-4% |

**Scanning Logic**:
```python
import asyncio
from web3 import Web3

async def scan_opportunities():
    opportunities = []
    
    # Check Aave on all chains
    for chain in ['ethereum', 'base', 'arbitrum']:
        apy = await get_aave_supply_apy(chain, 'USDC')
        opportunities.append({
            'protocol': 'Aave',
            'chain': chain,
            'apy': apy,
            'risk_score': 2,  # Low risk
            'liquidity': await get_protocol_tvl('aave', chain)
        })
    
    # Sort by risk-adjusted return
    return sorted(opportunities, 
                  key=lambda x: x['apy'] / x['risk_score'], 
                  reverse=True)
```

---

## 🔧 Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Web3 Library**: ethers.js v6 or viem
- **State Management**: Zustand (lightweight, simple)
- **UI Components**: shadcn/ui (Tailwind-based)
- **Charts**: Recharts for portfolio visualization

### Backend / Agent
- **Runtime**: Node.js 20+ LTS
- **Language**: TypeScript for type safety
- **AI Framework**: LangGraph for agent orchestration
- **Database**: SQLite for local state, The Graph for on-chain data
- **Task Scheduling**: node-cron for periodic scans

### Smart Contracts
- **Language**: Solidity 0.8.26
- **Framework**: Foundry (forge, cast, anvil)
- **Testing**: Forge tests + Hardhat for integration
- **Deployment**: Foundry scripts

### Infrastructure
- **RPC Provider**: Alchemy (primary) + Infura (fallback)
- **IPFS**: Pinata for metadata storage
- **Hosting**: Vercel for frontend, Railway for backend
- **Monitoring**: Tenderly for transaction tracking

---

## 📊 Data Models

### User Profile (Stored in ENS)
```typescript
interface UserProfile {
  ensName: string;              // e.g., "alice.eth"
  riskProfile: 'low' | 'medium' | 'high';
  maxSlippage: number;          // 0-1 (0.5 = 0.5%)
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
  minApyThreshold: number;      // Minimum acceptable APY
  excludedProtocols: string[];  // Blacklist
  maxChainExposure: number;     // 0-1 (0.5 = 50% max per chain)
}
```

### Portfolio State (Stored in Agent DB)
```typescript
interface Portfolio {
  userId: string;
  totalValueUSDC: number;
  positions: Position[];
  lastRebalance: Date;
  lifetimeYield: number;
  trades: Trade[];
}

interface Position {
  protocol: string;
  chain: string;
  amount: number;
  apy: number;
  entryDate: Date;
  yieldEarned: number;
}

interface Trade {
  timestamp: Date;
  type: 'deposit' | 'withdraw' | 'swap' | 'bridge';
  fromProtocol: string;
  toProtocol: string;
  amount: number;
  gasFeePaid: number;
  reason: string;
}
```

### Opportunity (Real-time Scan Result)
```typescript
interface YieldOpportunity {
  protocol: string;
  chain: string;
  apy: number;
  tvl: number;
  riskScore: number;          // 1-10 (1=safest)
  contractAddress: string;
  verified: boolean;
  auditReports: string[];
}
```

---

## 🎨 User Interface Design

### Core Screens

#### 1. Dashboard (Home)
**Components**:
- Portfolio value chart (7d, 30d, All)
- Current APY (real-time)
- Position breakdown (pie chart by protocol/chain)
- Recent trades feed
- Pending actions (rebalance suggestions)

**Key Metrics Display**:
```
┌─────────────────────────────────────────────┐
│  Total Portfolio: $12,450.23                │
│  Current APY: 6.8% ↑ 0.3%                   │
│  Lifetime Yield: $342.18                    │
│  Next Rebalance: 2h 15m                     │
└─────────────────────────────────────────────┘
```

#### 2. Risk Settings (ENS Config)
**Fields**:
- Risk Profile Selector (Low/Medium/High with descriptions)
- Max Slippage Slider (0.1% - 2%)
- Rebalancing Frequency Toggle
- Protocol Blacklist (searchable multi-select)
- Save to ENS button (triggers MetaMask transaction)

#### 3. Opportunities Explorer
**Features**:
- Filterable table of all detected opportunities
- Sort by: APY, Risk, TVL, Protocol
- "Deploy Funds" button (opens confirmation modal)
- Historical APY chart per protocol

#### 4. Transaction History
**Columns**:
- Date/Time
- Action (Deposit/Withdraw/Swap/Bridge)
- From → To
- Amount
- Gas Saved (via Yellow Network)
- Status (Success/Pending/Failed)

---

## 🔐 Security Considerations

### Smart Contract Security
1. **Audit Requirements**: All custom hooks must pass Slither + Mythril analysis
2. **Access Controls**: Only whitelisted protocols can receive funds
3. **Emergency Pause**: Admin can pause all trading in case of exploit
4. **Upgrade Path**: Use proxy pattern for hook upgrades

### Agent Security
1. **Private Key Management**: Use AWS KMS or similar HSM
2. **Rate Limiting**: Max 100 trades per hour to prevent runaway loops
3. **Approval Limits**: Each protocol gets max $X approval
4. **Monitoring**: Alert on unusual activity (volume spikes, failed txs)

### User Security
1. **Non-Custodial**: User's funds stay in their wallet
2. **Revocable**: User can revoke agent permissions anytime
3. **Transparent**: All trades logged on-chain and in UI
4. **Simulation**: Show trade preview before execution

---

## 📅 Development Roadmap

### Phase 0: Setup (Day 0)
**Duration**: 4 hours  
**Objective**: Get all accounts created and credentials ready

**Tasks**:
- [x] Sign up for Circle Developer account
- [x] Get Circle API key (standard tier)
- [x] Request testnet USDC from faucet (1000 USDC)
- [x] Register ENS name on Sepolia testnet
- [x] Create Alchemy account + API key
- [x] Fork Yellow Network sandbox repo
- [x] Set up GitHub repo with proper structure
- [x] Create `.env` file with all credentials

**Deliverable**: Checklist document with ✓ for each account

---

### Phase 1: Identity Layer (Day 1 - Morning)
**Duration**: 4 hours  
**Objective**: Read and write ENS text records programmatically

**Tasks**:
1. **ENS Reader Script** (2 hours)
   - [x] Install ethers.js
   - [x] Connect to Sepolia via Alchemy
   - [x] Write function to resolve ENS name → address
   - [x] Write function to read text record by key
   - [ ] Test with real ENS name

2. **ENS Writer UI** (2 hours)
   - [x] Create simple React form
   - [x] Add fields for risk_profile, max_slippage
   - [x] Connect wallet (MetaMask)
   - [x] Write text records to ENS
   - [x] Show success confirmation

**Deliverable**: Working demo that reads "risk_profile" from test ENS name

**Code Snippet**:
```javascript
const { ethers } = require('ethers');

async function readRiskProfile(ensName) {
  const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_URL);
  const address = await provider.resolveName(ensName);
  
  const resolver = await provider.getResolver(ensName);
  const riskProfile = await resolver.getText('risk_profile');
  
  console.log(`${ensName} has risk profile: ${riskProfile}`);
  return riskProfile;
}
```

---

### Phase 2: Zero-Fee Trading (Day 1 - Afternoon)
**Duration**: 4 hours  
**Objective**: Execute first trade on Yellow Network sandbox

**Tasks**:
1. **Yellow Network Setup** (1 hour)
   - [x] Install @erc7824/nitrolite SDK
   - [x] Connect to sandbox WebSocket
   - [x] Create app session message
   - [ ] Fund test account with sandbox tokens

2. **First Trade** (2 hours)
   - [x] Implement createPayment function
   - [x] Send 10 USDC test trade
   - [x] Listen for confirmation event
   - [x] Log trade details

3. **State Channel Demo** (1 hour)
   - [x] Execute 10 rapid trades (1 per second)
   - [x] Calculate total gas saved vs. on-chain
   - [x] Create comparison chart

**Deliverable**: Script that executes 10 trades with 0 gas fees

---

### Phase 3: Smart AMM (Day 2 - Morning)
**Duration**: 4 hours  
**Objective**: Deploy a working Uniswap v4 Hook

**Tasks**:
1. **Foundry Setup** (1 hour)
   - [ ] Install Foundry
   - [ ] Clone v4-template repo
   - [ ] Run `forge build` successfully
   - [ ] Run existing tests

2. **Custom Hook Development** (2 hours)
   - [ ] Create `RiskManagerHook.sol`
   - [ ] Implement beforeSwap logic
   - [ ] Add ENS resolver integration
   - [ ] Write 3 unit tests

3. **Deployment** (1 hour)
   - [ ] Deploy to Sepolia testnet
   - [ ] Verify contract on Etherscan
   - [ ] Test hook with real swap

**Deliverable**: Deployed hook contract that enforces risk limits

**Hook Template**:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/BaseHook.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";

contract RiskManagerHook is BaseHook {
    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() 
        public pure override 
        returns (Hooks.Permissions memory) 
    {
        return Hooks.Permissions({
            beforeSwap: true,
            afterSwap: false,
            beforeAddLiquidity: false,
            // ... other hooks disabled
        });
    }

    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4) {
        // TODO: Add risk enforcement logic
        return BaseHook.beforeSwap.selector;
    }
}
```

---

### Phase 4: Cross-Chain Bridge (Day 2 - Afternoon)
**Duration**: 4 hours  
**Objective**: Move USDC from Ethereum to Base automatically

**Tasks**:
1. **LI.FI Integration** (2 hours)
   - [ ] Install @lifi/sdk
   - [ ] Get quote for ETH → Base
   - [ ] Display route details (hops, fees, time)
   - [ ] Execute test bridge (10 USDC)

2. **Automated Bridge Logic** (2 hours)
   - [ ] Create function to detect best chain
   - [ ] Implement "rebalance across chains" algorithm
   - [ ] Add retry logic for failed bridges
   - [ ] Log all bridge transactions

**Deliverable**: Function that bridges USDC when yield difference >2%

---

### Phase 5: AI Agent Core (Day 3 - Morning)
**Duration**: 4 hours  
**Objective**: Build the autonomous decision engine

**Tasks**:
1. **Yield Scanner** (2 hours)
   - [ ] Connect to Aave API
   - [ ] Fetch USDC supply APY on 3 chains
   - [ ] Connect to DeFiLlama API for TVL data
   - [ ] Store opportunities in SQLite

2. **Decision Engine** (2 hours)
   - [ ] Implement risk-adjusted scoring
   - [ ] Create rebalancing algorithm
   - [ ] Add "what-if" simulator
   - [ ] Test with mock data

**Deliverable**: Agent that suggests rebalancing based on real APY data

**Algorithm Pseudocode**:
```
function decideRebalancing(portfolio, opportunities, riskProfile):
  currentScore = calculatePortfolioScore(portfolio)
  
  for each opportunity in opportunities:
    if opportunity.riskScore > riskProfile.maxRisk:
      continue  // Skip risky protocols
    
    potentialScore = simulateRebalance(portfolio, opportunity)
    
    if potentialScore > currentScore * 1.05:  // 5% improvement
      return REBALANCE_ACTION(opportunity)
  
  return HOLD_ACTION()
```

---

### Phase 6: UI Polish (Day 3 - Afternoon)
**Duration**: 4 hours  
**Objective**: Create a demo-ready frontend

**Tasks**:
1. **Dashboard** (2 hours)
   - [ ] Build portfolio value chart
   - [ ] Add live APY ticker
   - [ ] Show position breakdown
   - [ ] Style with Tailwind

2. **Demo Flow** (2 hours)
   - [ ] Create onboarding wizard
   - [ ] Add "Set Risk Profile" modal
   - [ ] Build "Rebalance Preview" screen
   - [ ] Add confirmation toasts

**Deliverable**: Polished React app ready for demo video

---

## 🎬 Demo Script (For Judges)

### Act 1: The Problem (30 seconds)
> "Meet Alice. She has $10,000 in USDC sitting idle on Ethereum, earning nothing. She wants yield but is scared of DeFi complexity and high gas fees."

**Screen Recording**: Show MetaMask with 10,000 USDC

---

### Act 2: The Setup (45 seconds)
> "Alice registers orion-alice.eth and sets her risk profile to 'Low' in one click. ORION immediately scans 5 blockchains and finds 12 yield opportunities."

**Screen Recording**:
1. Go to app.ens.domains
2. Set text record: `risk_profile = low`
3. Show ORION dashboard detecting opportunities

---

### Act 3: The Magic (1 minute)
> "ORION finds that Aave on Base offers 5.2% APY - 3x better than Ethereum. Using LI.FI, it bridges 5,000 USDC in 90 seconds. Using Yellow Network's state channels, it makes 50 micro-adjustments over 24 hours with ZERO gas fees."

**Screen Recording**:
1. Show "Rebalancing..." notification
2. Display LI.FI bridge transaction
3. Show rapid Yellow Network trades
4. Highlight "Gas Saved: $47.50"

---

### Act 4: The Results (30 seconds)
> "24 hours later, Alice earned $1.42 - at zero cost. Annualized, that's 5.2% APY. ORION adapts automatically as yields change, always respecting Alice's risk limits stored on-chain."

**Screen Recording**:
- Show updated portfolio: $10,001.42
- Highlight trade history
- End with tagline: "Your wealth, your rules, fully autonomous."

---

## 🏆 Sponsor Bounty Alignment

### Circle ($2,500 - Best Use of Arc & USDC)
**How We Win**:
- All transactions are in USDC (stable, predictable)
- Showcase Arc L1 for fast settlement
- Bridge USDC across 5+ chains
- Highlight Circle's cross-chain capabilities

**Demo Focus**: "We moved 10,000 USDC across 5 chains in 3 minutes"

---

### Yellow Network ($2,500 - Best Integration)
**How We Win**:
- Use state channels for all micro-trades
- Show 100+ trades with $0 gas
- Implement full OpenTabs protocol
- Demonstrate Nitrolite SDK mastery

**Demo Focus**: "50 rebalancing trades. Gas fees: $0.00"

---

### Uniswap Foundation ($2,500 - Best v4 Hook)
**How We Win**:
- Novel use case: on-chain risk enforcement
- Clean, auditable code
- Integrate ENS for dynamic parameters
- Show beforeSwap working in production

**Demo Focus**: "Our hook reads your ENS settings and blocks risky trades automatically"

---

### ENS ($2,500 - Best Use of ENS)
**How We Win**:
- Use ENS as decentralized config store
- Show text records for complex data
- Highlight transparency (anyone can verify user's risk settings)
- Implement reverse resolution for UX

**Demo Focus**: "Your risk profile lives on-chain, not in our database"

---

### LI.FI ($2,500 - Best Integration)
**How We Win**:
- Automatically select best bridge route
- Support 5+ chains
- Show gas optimization
- Handle edge cases (slippage, timeouts)

**Demo Focus**: "LI.FI routed through 2 bridges to save 0.3% - we didn't even have to think about it"

---

## 🧪 Testing Strategy

### Unit Tests (Foundry)
```bash
forge test --match-contract RiskManagerHook -vvv
```

**Coverage Goals**:
- Smart contracts: >90% line coverage
- Critical paths (swap validation): 100%

### Integration Tests (Hardhat)
```javascript
describe("End-to-End Flow", () => {
  it("should rebalance portfolio when yield gap >2%", async () => {
    // 1. Set ENS risk profile
    // 2. Deposit to Aave on Ethereum
    // 3. Mock higher APY on Base
    // 4. Trigger agent scan
    // 5. Verify bridge transaction executed
    // 6. Confirm funds arrived on Base
  });
});
```

### Manual Testing Checklist
- [ ] Risk profile changes reflect in hook behavior
- [ ] Yellow Network recovers from connection drops
- [ ] LI.FI handles bridge failures gracefully
- [ ] UI shows loading states correctly
- [ ] All transactions appear in history

---

## 📦 Deployment Plan

### Testnet Deployment (Required for Demo)
1. **Smart Contracts**: Sepolia
2. **Frontend**: Vercel (free tier)
3. **Backend**: Railway (free tier)
4. **RPC**: Alchemy (free tier - 300M compute units/month)

### Mainnet Deployment (Post-Hackathon)
1. **Smart Contracts**: Audit + deploy to Ethereum + L2s
2. **Frontend**: Vercel Pro ($20/month)
3. **Backend**: Railway Pro ($5/month)
4. **RPC**: Alchemy Growth ($49/month)
5. **Monitoring**: Tenderly Pro ($50/month)

**Total Monthly Cost**: ~$125

---

## 🚀 Go-to-Market (Post-Hackathon)

### Phase 1: Beta Launch (Month 1-2)
- Invite 50 beta testers from hackathon network
- Limit to $1,000 max deposit per user
- Collect feedback via Typeform
- Iterate on risk profiles

### Phase 2: Public Launch (Month 3)
- Remove deposit limits
- Add 5 more protocols (Yearn, Convex, Balancer)
- Launch referral program (0.1% of referred user's yield)

### Phase 3: Growth (Month 4-6)
- Partner with crypto YouTubers for demos
- Write comparison article: "ORION vs. Yearn vs. Manual DeFi"
- Apply to DeFi accelerators (Alliance DAO, Outlier Ventures)

### Revenue Model
- **Free Tier**: Up to $5,000 managed
- **Pro Tier**: $9.99/month for unlimited
- **Performance Fee**: 10% of yield earned (industry standard)

---

## 🐛 Known Limitations & Future Work

### Current Limitations
1. **Testnet Only**: No real money at risk
2. **Limited Protocols**: Only Aave + Uniswap
3. **No Impermanent Loss Tracking**: LP positions need more logic
4. **Centralized Backend**: Agent runs on our server (not fully decentralized)

### Future Enhancements
1. **On-Chain Agent**: Deploy agent logic as smart contract
2. **Multi-Asset**: Support ETH, BTC, and other stables
3. **Social Trading**: Copy other users' strategies
4. **DAO Governance**: Token holders vote on new protocols
5. **Mobile App**: React Native for iOS/Android

---

## 📚 Appendix

### A. Glossary
- **APY**: Annual Percentage Yield
- **TVL**: Total Value Locked
- **Slippage**: Price difference between expected and actual trade
- **State Channel**: Off-chain payment channel for instant, free transactions
- **Hook**: Custom logic that runs during Uniswap pool interactions
- **Bridge**: Moving assets from one blockchain to another

### B. References
- [Circle Developer Docs](https://developers.circle.com)
- [Yellow Network Nitrolite](https://docs.yellow.com/nitrolite)
- [Uniswap v4 Hooks](https://docs.uniswap.org/contracts/v4/overview)
- [ENS Developer Guide](https://docs.ens.domains)
- [LI.FI SDK](https://docs.li.fi)

### C. Team Roles (If Hackathon Team)
| Role | Responsibilities | Required Skills |
|------|------------------|-----------------|
| Smart Contract Dev | Write hooks, deploy contracts | Solidity, Foundry |
| Backend Dev | Build agent, integrate APIs | TypeScript, Node.js |
| Frontend Dev | Create dashboard UI | React, Tailwind |
| Product Manager | Demo script, PRD | Communication |

### D. Risk Disclosure
> ⚠️ **IMPORTANT**: This is an experimental project built for a hackathon. Do NOT use with real funds without extensive auditing. DeFi protocols can be exploited, bridges can fail, and smart contracts can have bugs. Always do your own research.

---

**End of PRD**

*Last Updated: February 1, 2026*  
*Next Review: After Phase 1 Completion*