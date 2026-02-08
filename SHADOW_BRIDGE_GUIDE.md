# Shadow Bridge Pattern - Implementation Guide

## 🌉 What is Shadow Bridge?

The Shadow Bridge pattern solves the LI.FI testnet limitation by:
1. **Using Real LI.FI Mainnet Data**: Get actual route intelligence from LI.FI mainnet
2. **Executing on Testnet**: Perform actual token transfers (burn/lock + mint) on testnet
3. **Best of Both Worlds**: Real intelligence + testnet execution

---

## 🔄 How It Works

### Step 1: Get Route (Frontend)
```typescript
// Map testnet → mainnet for LI.FI query
Sepolia (11155111) → Ethereum (1)
Base Sepolia (84532) → Base (8453)

// Get real route from LI.FI using mainnet data
const route = await getRoutes({
  fromChainId: 1,  // Mainnet Ethereum
  toChainId: 8453, // Mainnet Base
  // ... other params
})

// Return route with testnet chain IDs
return {
  ...route,
  fromChainId: 11155111, // Sepolia
  toChainId: 84532,      // Base Sepolia
  isShadowBridge: true
}
```

### Step 2: Execute Bridge (Backend)
```typescript
// On source chain (Sepolia): Burn/lock tokens
await fromTokenContract.transfer(BURN_ADDRESS, amount)

// On destination chain (Base Sepolia): Mint tokens
await toTokenContract.mint(userAddress, amount)
```

---

## 📋 Implementation Status

### ✅ Completed
- [x] Shadow bridge route fetching (uses mainnet data)
- [x] Frontend UI updates (shows real route data)
- [x] Backend shadow bridge executor (`backend/src/bridge/shadowBridge.ts`)

### 🚧 TODO
- [ ] Create backend API endpoint (`/api/bridge/shadow`)
- [ ] Handle minting permissions (testnet USDC contracts)
- [ ] Add transaction monitoring
- [ ] Error handling for failed mints

---

## 🛠️ Backend API Endpoint

Create this endpoint to handle shadow bridge execution:

```typescript
// backend/src/api/bridge.ts or similar
import { executeShadowBridge } from '../bridge/shadowBridge.js';

app.post('/api/bridge/shadow', async (req, res) => {
  const { route, fromChainRpc, toChainRpc, userAddress } = req.body;
  
  // Get signer from request (or use agent private key)
  const signer = getSigner(userAddress);
  
  const result = await executeShadowBridge(
    route,
    signer,
    fromChainRpc,
    toChainRpc
  );
  
  res.json(result);
});
```

---

## ⚠️ Important Notes

### Minting Limitations
Most testnet USDC contracts don't have public `mint()` functions. Options:

1. **Use Faucet Pattern**: Instead of minting, show a message:
   ```
   "Tokens locked on Sepolia. Use Base Sepolia faucet to receive testnet USDC."
   ```

2. **Deploy Test Contract**: Create a simple bridge contract on testnet that can mint

3. **Manual Minting**: For demo, manually mint tokens before/after

### Burn vs Transfer
- **Burn**: `contract.burn(amount)` - permanently destroys tokens
- **Transfer to Dead**: `contract.transfer(0x000...dead, amount)` - simulates lock

Both work for demo purposes.

---

## 🎨 UI Updates

The UI now shows:
- ✅ Real LI.FI route data (bridge names, hops, costs)
- ✅ "Shadow Bridge" label when on testnet
- ✅ Route details (e.g., "Hop 1: Stargate, Hop 2: 1inch")
- ✅ Clear indication it's simulated execution

---

## 🚀 Usage

1. **Select Testnet Chains**: Choose Sepolia → Base Sepolia
2. **Get Quote**: System fetches real LI.FI mainnet route
3. **See Route**: View actual bridge hops and costs
4. **Execute**: Tokens burned on source, minted on dest (or faucet message shown)

---

## 📝 Example Flow

```
User selects: Sepolia → Base Sepolia, 10 USDC
    ↓
Frontend calls getShadowBridgeRoute()
    ↓
Maps Sepolia→Ethereum, Base Sepolia→Base
    ↓
Calls LI.FI with mainnet chain IDs
    ↓
Gets real route: "Stargate → 1inch, $2.50, 3 min"
    ↓
Returns route with testnet chain IDs
    ↓
User clicks "Execute Bridge"
    ↓
Backend burns 10 USDC on Sepolia
    ↓
Backend mints 10 USDC on Base Sepolia (or shows faucet message)
    ↓
Success! Route intelligence was real, execution was testnet
```

---

## 💡 Benefits

1. **Real Intelligence**: Uses actual LI.FI route optimization
2. **Testnet Safe**: No mainnet costs for testing
3. **Demo Ready**: Shows real bridge intelligence in demo
4. **Production Path**: Same code works for mainnet (just different execution)

---

## 🔧 Next Steps

1. Create backend API endpoint
2. Test minting on testnet USDC contracts
3. Add error handling for mint failures
4. Add transaction monitoring
5. Update UI with better status messages
