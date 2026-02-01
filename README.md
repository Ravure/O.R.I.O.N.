# ORION - Optimized Risk & Intelligence On-chain Navigator

Multi-chain DeFi AI Agent with zero-fee trading and ENS-based risk profiles.

## 🚀 Quick Start

### Prerequisites
```bash
# Required:
- Node.js 20+
- MetaMask or similar wallet
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

3. **Test Phase 1 (ENS)**
```bash
cd backend
npm run ens:read vitalik.eth
```

4. **Test Phase 2 (Yellow Network)**
```bash
npm run yellow:test
```

5. **Run Frontend**
```bash
cd frontend
npm run dev
# Visit http://localhost:5173
```

## 📊 Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Complete | ENS integration for risk profiles |
| **Phase 2** | ✅ Working | Yellow Network state channels |
| **Phase 3** | ✅ Complete | Uniswap v4 Hooks (smart contract ready) |
| **Phase 4** | ⏳ Todo | LI.FI cross-chain bridge |

## 📁 Project Structure

```
O.R.I.O.N./
├── backend/
│   ├── src/
│   │   ├── ens/
│   │   │   └── reader.ts          # ENS profile reading
│   │   ├── yellow/
│   │   │   ├── client.ts          # Yellow Network client
│   │   │   └── config.ts          # Network configuration
│   │   └── scripts/
│   │       ├── readENS.ts         # Test ENS reading
│   │       └── testYellow.ts      # Test Yellow Network
│   └── package.json
│
├── contracts/                      # NEW: Smart contracts
│   ├── src/
│   │   └── ORIONRiskHook.sol      # Uniswap v4 Hook
│   ├── test/
│   │   └── ORIONRiskHook.t.sol    # Tests
│   ├── script/
│   │   └── DeployORIONHook.s.sol  # Deployment
│   └── install.sh                  # Setup script
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ENSReader.tsx      # Read ENS profiles
│   │   │   ├── ENSWriter.tsx      # Write to ENS
│   │   │   └── WalletConnection.tsx
│   │   └── App.tsx
│   └── package.json
│
├── README.md                       # This file
├── PRD.md                          # Product requirements
├── TECHNICAL_SPEC.md               # Technical details
└── QUICK_START.md                  # Quick command reference
```

## 🛠️ Available Commands

### Backend
```bash
cd backend

# ENS Integration
npm run ens:read [ens-name]         # Read ENS profile

# Yellow Network
npm run yellow:test                  # Test Yellow Network

# Build
npm run build                        # Compile TypeScript
```

### Smart Contracts
```bash
cd contracts

# Setup (first time)
./install.sh                         # Install Foundry + dependencies

# Development
forge build                          # Compile contracts
forge test                           # Run tests
forge test -vvv                      # Verbose test output

# Deploy (when v4 launches)
forge script script/DeployORIONHook.s.sol --rpc-url sepolia --broadcast
```

### Frontend
```bash
cd frontend

npm run dev                          # Start dev server
npm run build                        # Build for production
```

## 🎯 Features

### Phase 1: Identity Layer ✅
- **ENS Integration**: Read/write risk profiles on-chain
- **React UI**: Clean interface for ENS management
- **Wallet Connect**: MetaMask integration

### Phase 2: Zero-Fee Trading ✅
- **Yellow Network**: State channel integration
- **Nitrolite SDK**: On-chain channel operations
- **Contract Addresses**: Configured for Sepolia testnet

### Phase 3: Smart AMM ✅
- **Uniswap v4 Hook**: Smart contract that validates swaps
- **ENS Integration**: Reads risk profiles from ENS
- **Risk Validation**: Blocks trades exceeding user's tolerance
- **Event Logging**: Transparent on-chain activity

### Phase 4: Cross-Chain ⏳
- LI.FI bridge integration
- Multi-chain yield optimization
- Automated rebalancing

## 📖 Documentation

- **[QUICK_START.md](./QUICK_START.md)** - Quick command reference
- **[PRD.md](./PRD.md)** - Product requirements and vision
- **[TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)** - Technical architecture

## 🔗 Resources

- **Yellow Network**: https://erc7824.org
- **Yellow Dashboard**: https://apps.yellow.com
- **Sepolia Faucet**: https://sepoliafaucet.com
- **Alchemy**: https://www.alchemy.com

## 🤝 Contributing

This is a hackathon project. Feel free to explore and extend!

## 📝 License

MIT

---

**Built with:**
- TypeScript
- React + Vite
- ethers.js / viem
- Nitrolite SDK (@erc7824/nitrolite)
- Tailwind CSS
