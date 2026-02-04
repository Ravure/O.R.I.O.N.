# Full ORION Hook Demo - With Real Trading

You're right - to test actual trading, we need the hook deployed and integrated with a pool.

## 🚀 Fastest Path: Use Your Local Anvil Setup

You already deployed Uniswap v4 to local Anvil! Let's deploy ORION Hook there.

### Step 1: Your Current Anvil Setup

You have running on `localhost:8545`:
- ✅ PoolManager: `0x0D9BAf34817Fccd3b3068768E5d20542B66424A5`
- ✅ SwapRouter: `0xB61598fa7E856D43384A8fcBBAbF2Aa6aa044FfC`
- ✅ PositionManager: `0x90aAE8e3C8dF1d226431D0C2C527f76Bbe02A416`

### Step 2: Deploy ORION Hook Locally

```bash
cd /Users/jenish/Documents/O.R.I.O.N./contracts

# Deploy to your local Anvil (no mining needed on local!)
~/.foundry/bin/forge script script/DeployORIONHook.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  # Default Anvil address
```

**Note:** Local Anvil doesn't validate hook addresses, so deployment will work!

### Step 3: Create Pool With Your Hook

Create `script/CreatePool.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract CreatePool is Script {
    function run() external {
        address poolManager = 0x0D9BAf34817Fccd3b3068768E5d20542B66424A5;
        address hookAddress = vm.envAddress("ORION_HOOK_ADDRESS"); // From deployment

        // Create a USDC/ETH pool with your hook
        address token0 = address(0x1); // Mock USDC
        address token1 = address(0x2); // Mock ETH

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 3000, // 0.3%
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        vm.broadcast();
        IPoolManager(poolManager).initialize(poolKey, 79228162514264337593543950336); // sqrt(1) price

        console.log("Pool created with ORION Hook!");
    }
}
```

### Step 4: Test a Swap

Create `script/TestSwap.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

contract TestSwap is Script {
    function run() external {
        // Execute a swap that will trigger your hook's beforeSwap validation

        console.log("Executing swap...");
        console.log("Your hook will validate the slippage!");

        // If slippage > user's risk tolerance → Hook blocks it ❌
        // If slippage <= user's risk tolerance → Hook allows it ✅

        vm.broadcast();
        // ... swap logic
    }
}
```

### Step 5: Full Demo Flow

```bash
# 1. Deploy hook locally
forge script script/DeployORIONHook.s.sol --rpc-url http://localhost:8545 --broadcast

# 2. Create pool with your hook
export ORION_HOOK_ADDRESS=<deployed_address>
forge script script/CreatePool.s.sol --rpc-url http://localhost:8545 --broadcast

# 3. Execute test swaps
forge script script/TestSwap.s.sol --rpc-url http://localhost:8545 --broadcast

# Watch your hook validate trades! 🎉
```

---

## Alternative: Deploy to Sepolia for Real Trading

If you want REAL testnet deployment:

### Option A: Use v4-template's Miner (Recommended)

```bash
cd ~/v4-template

# Copy your hook
cp /Users/jenish/Documents/O.R.I.O.N./contracts/src/ORIONRiskHook.sol src/

# Modify their deploy script to use ORIONRiskHook
# Then run (this will mine the address):
forge script script/DeployHook.s.sol --rpc-url sepolia --broadcast

# This can take 10-60 minutes for mining
```

### Option B: Deploy to Sepolia Without Hook Validation (Hacky)

Deploy a **test version** that skips address validation:

```solidity
contract TestableORIONRiskHook is ORIONRiskHook {
    constructor(...) ORIONRiskHook(...) {}

    function validateHookAddress(BaseHook) internal pure override {
        // Skip validation for testing
    }
}
```

Then you can demo on Sepolia, with caveat: "This is a test deployment without address mining for demo purposes. Production would use mined CREATE2 address."

---

## 🎯 My Recommendation

**Use local Anvil for demo:**

**Pros:**
- ✅ No waiting for address mining
- ✅ Full control over test scenarios
- ✅ Can show multiple swaps quickly
- ✅ Easy to reset and retry
- ✅ Shows understanding of full flow

**Demo Script:**
1. Show Anvil with Uniswap v4 running ✅
2. Deploy ORION Hook ✅
3. Create pool with hook ✅
4. Execute low-slippage swap → **Allowed** ✅
5. Execute high-slippage swap → **Blocked** ❌
6. Show hook events in logs ✅

**For Judges:**
"I deployed this locally to demonstrate the full trading flow. For production, this requires CREATE2 address mining which takes 10-60 minutes. Here's the working demo..."

This is **more impressive** than just showing code!

---

## Quick Start Now

Want me to create the complete local demo scripts so you can show actual trading with risk validation?
