# Quick Start Guide

## ⚡ TL;DR

```bash
# 1. Setup
echo "ALCHEMY_SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY" > .env
echo "AGENT_PRIVATE_KEY=0xYOUR_TESTNET_KEY" >> .env

# 2. Test ENS
cd backend && npm run ens:read vitalik.eth

# 3. Test Yellow Network
npm run yellow:test

# 4. Run Frontend
cd ../frontend && npm run dev
```

## 📋 Available Commands

### Backend Commands
```bash
cd backend

# ENS - Read any ENS profile
npm run ens:read vitalik.eth
npm run ens:read yourname.eth

# Yellow Network - Test state channels
npm run yellow:test
```

### Frontend
```bash
cd frontend

# Start development server
npm run dev
# Open http://localhost:5173

# Build for production
npm run build
```

## 🔧 Environment Setup

Create `.env` in project root:

```bash
# Required for ENS
ALCHEMY_SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# Required for Yellow Network
AGENT_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY

# Optional
ENS_NAME=yourname.eth
```

### Get Your Keys

1. **Alchemy API Key** (free):
   - Visit https://www.alchemy.com
   - Create account → New App → Sepolia testnet
   - Copy API key

2. **Testnet Private Key**:
   - Use MetaMask testnet account
   - **NEVER use mainnet!**
   - Get Sepolia ETH: https://sepoliafaucet.com

## 📊 What's Working

| Feature | Status | Test Command |
|---------|--------|--------------|
| ENS Reading | ✅ | `npm run ens:read vitalik.eth` |
| ENS Writing | ✅ | Frontend UI |
| Yellow Network | ✅ | `npm run yellow:test` |
| State Channels | ✅ | Ready to use |

## 🐛 Troubleshooting

### "ALCHEMY_SEPOLIA_URL not found"
```bash
# Make sure .env is in project ROOT
ls -la .env
cat .env
```

### "AGENT_PRIVATE_KEY not found"
```bash
echo "AGENT_PRIVATE_KEY=0xYOUR_KEY" >> .env
```

### Frontend won't connect
- Install MetaMask
- Switch to Sepolia network
- Refresh page

## 📁 Project Structure

```
backend/
  src/
    ens/
      reader.ts           # ENS integration
    yellow/
      client.ts           # Yellow Network client
      config.ts           # Network configs
    scripts/
      readENS.ts          # ENS test
      testYellow.ts       # Yellow test

frontend/
  src/
    components/
      ENSReader.tsx       # Read ENS UI
      ENSWriter.tsx       # Write ENS UI
      WalletConnection.tsx
```

## 🎯 Next Steps

1. **Test ENS**: `npm run ens:read vitalik.eth`
2. **Test Yellow**: `npm run yellow:test`
3. **Try Frontend**: `npm run dev` in frontend/
4. **Read PRD.md** for full project vision

## 🔗 Useful Links

- **Yellow Network Dashboard**: https://apps.yellow.com
- **Sepolia Explorer**: https://sepolia.etherscan.io
- **Sepolia Faucet**: https://sepoliafaucet.com
- **Documentation**: https://erc7824.org

---

**Need help?** Check README.md or PRD.md for more details.
