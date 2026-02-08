# ORION - Integrated Architecture

## 🎯 Unified System Overview

ORION now integrates all phases seamlessly into a single, cohesive system where:
- **Phase 1 (ENS)** provides the risk profile foundation
- **Phase 3 (Uniswap v4 Hook)** enforces risk limits on trades
- **Phase 4 (LI.FI Bridge)** enables cross-chain yield optimization
- **Phase 2 (Yellow Network)** executes zero-fee trades

## 🔄 Complete User Flow

### 1. Initial Setup
```
User connects wallet
    ↓
System detects ENS name (or prompts to set one)
    ↓
Reads risk profile from ENS (Phase 1)
    ↓
Displays in unified dashboard
```

### 2. Risk Profile Management
```
User updates risk settings in dashboard
    ↓
Writes to ENS on-chain (Phase 1)
    ↓
Uniswap v4 Hook automatically reads new settings (Phase 3)
    ↓
All future trades validated against new risk profile
```

### 3. Yield Optimization Cycle
```
Agent scans yield opportunities across chains
    ↓
Compares with current portfolio APY
    ↓
If improvement >2%: Triggers bridge (Phase 4)
    ↓
Bridges USDC to higher-yield chain
    ↓
Executes trades via Yellow Network (Phase 2)
    ↓
All trades validated by Hook (Phase 3)
```

### 4. Trade Execution
```
User initiates trade (or agent auto-executes)
    ↓
Hook reads ENS risk profile (Phase 1 + 3)
    ↓
Validates slippage against max_slippage
    ↓
If valid: Executes via Yellow Network (Phase 2)
    ↓
If invalid: Blocks trade with reason
```

## 📁 File Structure

### Backend
```
backend/src/
├── ens/
│   └── reader.ts              # Phase 1: ENS reading
├── yellow/
│   ├── client.ts              # Phase 2: Yellow Network
│   ├── clearnode.ts
│   └── config.ts
├── bridge/
│   └── client.ts              # Phase 4: LI.FI Bridge
├── services/
│   └── orionAgent.ts          # 🆕 Unified service
└── scripts/
    ├── readENS.ts
    ├── testYellow.ts
    └── testBridge.ts
```

### Frontend
```
frontend/src/
├── components/
│   ├── UnifiedDashboard.tsx   # 🆕 Main unified view
│   ├── RiskProfileCard.tsx    # 🆕 Risk profile display
│   ├── PortfolioView.tsx      # 🆕 Portfolio across chains
│   ├── YieldOpportunities.tsx  # 🆕 Yield scanner UI
│   ├── BridgeControls.tsx     # 🆕 Bridge interface
│   ├── ENSReader.tsx          # Phase 1
│   ├── ENSWriter.tsx          # Phase 1
│   └── WalletConnection.tsx
└── App.tsx                     # Updated to use UnifiedDashboard
```

### Smart Contracts
```
contracts/
├── src/
│   └── ORIONRiskHook.sol      # Phase 3: Uniswap v4 Hook
└── test/
    └── ORIONRiskHook.t.sol
```

## 🔗 Integration Points

### 1. ENS → Hook Integration
- Hook reads `risk_profile` and `max_slippage` from ENS
- Validates every swap before execution
- Blocks trades exceeding user's risk tolerance

### 2. ENS → Bridge Integration
- Agent reads `min_apy_threshold` from ENS
- Only bridges when yield improvement exceeds threshold
- Respects `excluded_protocols` list

### 3. Bridge → Yellow Network Integration
- After bridging, executes trades via Yellow Network
- Zero-fee execution for micro-rebalancing
- All trades still validated by Hook

### 4. Unified Dashboard
- Single view showing all components
- Real-time risk profile display
- Portfolio across chains
- Yield opportunities filtered by risk profile
- Bridge controls with risk-aware routing

## 🎨 User Experience

### Dashboard Layout
```
┌─────────────────────────────────────────────────────────┐
│  ORION Dashboard                    ENS: user.eth       │
├─────────────────────────────────────────────────────────┤
│  Risk Profile Card (from ENS)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Risk: Low│ │Slippage: │ │Frequency:│ │Min APY:  │  │
│  │          │ │  0.5%    │ │ Weekly   │ │  5.0%    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│  Left Column    │  Middle Column    │  Right Column    │
│  ┌────────────┐ │  ┌──────────────┐ │  ┌─────────────┐ │
│  │ENS Writer  │ │  │ Portfolio   │ │  │Bridge       │ │
│  │ENS Reader  │ │  │ $10,000     │ │  │Controls     │ │
│  └────────────┘ │  │ 4.2% APY    │ │  │             │ │
│                 │  └──────────────┘ │  └─────────────┘ │
│                 │  ┌──────────────┐ │                  │
│                 │  │Yield Opps    │ │                  │
│                 │  │Base: 5.2%    │ │                  │
│                 │  │Arb: 4.8%     │ │                  │
│                 │  └──────────────┘ │                  │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Key Features

### 1. Seamless Integration
- All phases work together automatically
- No manual switching between components
- Single source of truth (ENS)

### 2. Risk-Aware Everything
- Trades validated by Hook
- Bridges respect risk profile
- Opportunities filtered by risk tolerance

### 3. Cross-Chain Intelligence
- Automatic yield detection
- Smart rebalancing (>2% threshold)
- Multi-chain portfolio view

### 4. Zero-Fee Execution
- Yellow Network for micro-trades
- Gas savings tracked and displayed
- High-frequency rebalancing enabled

## 📊 Data Flow

```
ENS (On-Chain)
    ↓
OrionAgent Service
    ├─→ Reads risk profile
    ├─→ Scans opportunities
    ├─→ Decides rebalancing
    └─→ Executes actions
        ├─→ Bridge (LI.FI)
        ├─→ Trade (Yellow Network)
        └─→ Validate (Hook)
```

## ✅ What's Complete

- ✅ Phase 1: ENS reading/writing
- ✅ Phase 2: Yellow Network integration
- ✅ Phase 3: Uniswap v4 Hook
- ✅ Phase 4: LI.FI Bridge
- ✅ Unified backend service (OrionAgent)
- ✅ Unified frontend dashboard
- ✅ Seamless integration between all phases

## 🎯 Next Steps (Phase 5)

- Real yield scanning (currently mocked)
- On-chain portfolio tracking
- Automated rebalancing scheduler
- Advanced analytics and reporting
