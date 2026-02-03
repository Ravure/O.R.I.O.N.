# ORION - Optimized Risk & Intelligence On-chain Navigator

Multi-chain DeFi AI Agent with zero-fee trading and ENS-based risk profiles.

## Quick Start

### Prerequisites
```bash
# Required:
- Node.js 20+
- MetaMask browser extension
- Alchemy API key (free tier)
```

### Setup

1. **Clone and Install**
```bash
cd O.R.I.O.N
npm install
```

2. **Configure Environment**

Create `.env` in project root:
```bash
# Required
ALCHEMY_SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
AGENT_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY

# Optional
ENS_NAME=yourname.eth
```

3. **Run Frontend**
```bash
cd frontend
npm run dev
# Visit http://localhost:5173
```

4. **Test Yellow Network Auth**
```bash
cd backend
npx tsx src/scripts/testAuth.ts
```

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Complete | ENS integration for risk profiles |
| **Phase 2** | 🟡 In Progress | Yellow Network state channels |
| **Phase 3** | ✅ Complete | Uniswap v4 Hooks (smart contract ready) |
| **Phase 4** | ⏳ Todo | LI.FI cross-chain bridge |

---

## Phase 2: Yellow Network Integration - Detailed Status

### What's Working

| Feature | Status | Notes |
|---------|--------|-------|
| WebSocket Connection | ✅ | Connects to `wss://clearnet-sandbox.yellow.com/ws` |
| EIP-712 Authentication | ✅ | Full auth flow with MetaMask signing |
| Session Key Generation | ✅ | Fresh keys generated per session |
| JWT Token Retrieval | ✅ | Successfully authenticated with ClearNode |
| Get Assets | ✅ | Queries available assets (ytest.usd) |
| Get Channels | ✅ | Queries user's channels (returns 0 - no deposits) |
| Get Ledger Balances | ✅ | Queries deposited balances (returns 0 - no deposits) |
| Create App Session | 🟡 | Code ready, needs testing with funds |
| Trading UI | ✅ | Dashboard with simulated trades |

### What's Not Working Yet

| Feature | Blocker | Solution |
|---------|---------|----------|
| Real Trading | No ytest.usd tokens | Need faucet or tokens from Yellow team |
| Channel Creation | No deposited funds | Deposit tokens via apps.yellow.com or SDK |
| App Sessions | Unclear if channel required | Ask Yellow Network team |

### Key Technical Fixes Applied

1. **Address Checksumming** - MetaMask returns lowercase addresses, but EIP-712 requires checksummed addresses
   ```typescript
   const address = getAddress(accounts[0]) as Address; // from viem
   ```

2. **Fresh Session Keys** - Must generate new session key each auth to avoid "session key already exists" error
   ```typescript
   const sessionPrivateKey = generatePrivateKey();
   const sessionAccount = privateKeyToAccount(sessionPrivateKey);
   ```

3. **JWT Token Field** - Server returns `jwt_token` (snake_case), not `jwtToken`

---

## Architecture

### Yellow Network Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Wallet (MetaMask)                   │
│                    Has: ETH, tokens, etc.                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ deposit() - on-chain tx
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Yellow Network Account                    │
│                    (Ledger Balance)                          │
│                    - ytest.usd: X amount                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ createChannel() - on-chain tx
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    State Channel                             │
│                    - Locked funds for trading                │
│                    - One-time gas cost (~$7.50)              │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              App Session (off-chain)                 │   │
│   │              - Trading agreement                     │   │
│   │              - FREE to create/close                  │   │
│   │              - Unlimited trades                      │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Channel vs Session

| | Channel | App Session |
|---|---------|-------------|
| **Where** | On-chain smart contract | Off-chain (ClearNode) |
| **Cost** | Gas fees (~$7-15) | Free |
| **Holds** | Real deposited funds | Trading rules/allocations |
| **Duration** | Long-lived (days/weeks) | Short-lived (per trade batch) |
| **Requirement** | Deposit tokens first | Need channel OR broker |

---

## Project Structure

```
O.R.I.O.N./
├── backend/
│   ├── src/
│   │   ├── ens/
│   │   │   └── reader.ts              # ENS profile reading
│   │   ├── yellow/
│   │   │   ├── client.ts              # Yellow Network client
│   │   │   └── config.ts              # Network configuration
│   │   └── scripts/
│   │       ├── readENS.ts             # Test ENS reading
│   │       ├── testAuth.ts            # Test ClearNode auth (working!)
│   │       ├── testSandbox.ts         # Test sandbox connection
│   │       └── testYellow.ts          # Test Yellow Network
│   └── package.json
│
├── contracts/                          # Uniswap v4 Hook
│   ├── src/
│   │   └── ORIONRiskHook.sol          # Smart contract
│   ├── test/
│   │   └── ORIONRiskHook.t.sol        # Tests
│   ├── script/
│   │   └── DeployORIONHook.s.sol      # Deployment
│   └── install.sh                      # Setup script
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ENSReader.tsx          # Read ENS profiles
│   │   │   ├── ENSWriter.tsx          # Write to ENS
│   │   │   ├── TradingDashboard.tsx   # Yellow Network trading UI
│   │   │   └── WalletConnection.tsx
│   │   ├── services/
│   │   │   └── yellowNetwork.ts       # Yellow Network browser client
│   │   └── App.tsx
│   └── package.json
│
├── README.md                           # This file
├── PRD.md                              # Product requirements
└── TECHNICAL_SPEC.md                   # Technical architecture
```

---

## Available Commands

### Backend
```bash
cd backend

# ENS Integration
npm run ens:read [ens-name]             # Read ENS profile

# Yellow Network Testing
npx tsx src/scripts/testAuth.ts         # Test authentication (works!)
npx tsx src/scripts/testSandbox.ts      # Test sandbox connection

# Build
npm run build                            # Compile TypeScript
```

### Smart Contracts
```bash
cd contracts

# Setup (first time)
./install.sh                             # Install Foundry + dependencies

# Development
forge build                              # Compile contracts
forge test                               # Run tests
forge test -vvv                          # Verbose test output

# Deploy (when v4 launches)
forge script script/DeployORIONHook.s.sol --rpc-url sepolia --broadcast
```

### Frontend
```bash
cd frontend

npm run dev                              # Start dev server (http://localhost:5173)
npm run build                            # Build for production
```

---

## Testing Yellow Network Trading

### Current State (Simulated)
1. Open http://localhost:5173
2. Click "Connect to ClearNode" - connects to sandbox WebSocket
3. Click "Authenticate with Wallet" - MetaMask will prompt for EIP-712 signature
4. Once authenticated, you can:
   - Click "Check Channels/Balances" - will show 0 (no deposits yet)
   - Click "Execute Trade" - runs simulated trade (not real)

### To Enable Real Trading
1. **Get ytest.usd tokens** - Contact Yellow Network team or check apps.yellow.com
2. **Deposit to Yellow Network** - Via apps.yellow.com or using NitroliteClient SDK
3. **Create Channel** - Locks funds for trading
4. **Create App Session** - Then trades will be real!

---

## Open Questions (Need Yellow Network Team Input)

1. **Faucet**: Is there a faucet for ytest.usd test tokens on sandbox?
2. **Sessions without Channels**: Can we create app sessions and trade without depositing to our own channel? (Using ClearNode as counterparty)
3. **Counterparty Address**: What address should we use as counterparty for test app sessions?

---

## Key Files

### Frontend Yellow Network Client
`frontend/src/services/yellowNetwork.ts`
- WebSocket connection to ClearNode
- EIP-712 authentication with MetaMask
- Channel/balance queries
- App session creation

### Trading Dashboard
`frontend/src/components/TradingDashboard.tsx`
- Connection status UI
- Authentication flow
- Trading interface (currently simulated)
- Gas savings visualization

---

## Resources

| Resource | URL |
|----------|-----|
| Yellow Network Docs | https://docs.yellow.org |
| ERC-7824 Docs | https://erc7824.org |
| Yellow Apps | https://apps.yellow.com |
| Nitrolite SDK | https://www.npmjs.com/package/@erc7824/nitrolite |
| ClearNode Sandbox | wss://clearnet-sandbox.yellow.com/ws |
| Sepolia Faucet | https://sepoliafaucet.com |

---

## Next Steps

### Immediate (to complete Phase 2)
- [ ] Get ytest.usd test tokens from Yellow Network
- [ ] Test depositing funds to create a channel
- [ ] Test creating app sessions with real funds
- [ ] Verify real trading works end-to-end

### Future (Phase 4)
- [ ] LI.FI bridge integration
- [ ] Multi-chain yield optimization
- [ ] Automated rebalancing
- [ ] AI agent for trade recommendations

---

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + TypeScript
- **Blockchain**: viem, ethers.js
- **Yellow Network**: @erc7824/nitrolite SDK
- **Smart Contracts**: Solidity + Foundry
- **Wallet**: MetaMask (EIP-712 signing)

---

## License

MIT

---

**Last Updated**: Phase 2 Yellow Network authentication working, awaiting test tokens for real trading.
