# Deploy ORION Hook to Sepolia - Step by Step

You successfully mined an address using v4-template! Now let's deploy YOUR hook.

## Step 1: Copy Your Contract to v4-template

```bash
# Navigate to your v4-template directory
cd ~/v4-template  # Or wherever you cloned it

# Copy ORION Hook to the template
cp /Users/jenish/Documents/O.R.I.O.N./contracts/src/ORIONRiskHook.sol src/

# Copy the test too
cp /Users/jenish/Documents/O.R.I.O.N./contracts/test/ORIONRiskHook.t.sol test/
```

## Step 2: Create Deployment Script

Create `script/DeployORIONHook.s.sol` in v4-template:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ORIONRiskHook} from "../src/ORIONRiskHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "../test/shared/HookMiner.sol";

contract DeployORIONHook is Script {
    function run() external {
        // Sepolia addresses
        address poolManager = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
        address ensReverseRegistrar = 0x084b1c3C81545d370f3634392De611CaaBFf8148;
        address ensPublicResolver = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;

        // Calculate required flags
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);

        // Mine for valid address
        console.log("Mining for valid ORION Hook address...");

        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,  // Use the same deployer as v4-template
            flags,
            type(ORIONRiskHook).creationCode,
            abi.encode(poolManager, ensReverseRegistrar, ensPublicResolver)
        );

        console.log("Mined Hook Address:", hookAddress);
        console.log("Salt:", vm.toString(salt));

        // Deploy
        vm.startBroadcast();

        ORIONRiskHook hook = new ORIONRiskHook{salt: salt}(
            IPoolManager(poolManager),
            ensReverseRegistrar,
            ensPublicResolver
        );

        console.log("\nDeployed ORION Hook at:", address(hook));

        vm.stopBroadcast();
    }
}
```

## Step 3: Mine and Deploy

```bash
# Make sure you're in v4-template directory
cd ~/v4-template

# Mine for address (this will take 1-30 minutes depending on luck)
forge script script/DeployORIONHook.s.sol \
  --rpc-url sepolia \
  --broadcast \
  --verify \
  -vvv

# Your .env should have:
# - SEPOLIA_RPC_URL
# - PRIVATE_KEY
# - ETHERSCAN_API_KEY (for verification)
```

## What This Does

1. **Uses v4-template's HookMiner** - Their mining implementation is optimized
2. **Finds valid address** - May take 1-30 minutes
3. **Deploys with CREATE2** - Uses the mined salt
4. **Verifies on Etherscan** - Auto-verification

## Expected Output

```
Mining for valid ORION Hook address...
[... mining in progress ...]
Mined Hook Address: 0x1234...abcd
Salt: 0x...

Deployed ORION Hook at: 0x1234...abcd
✅ Contract verified on Etherscan
```

## After Deployment

Your hook will be:
- ✅ Live on Sepolia testnet
- ✅ Connected to Uniswap v4 PoolManager
- ✅ Verified on Etherscan
- ✅ Ready to demonstrate

## Alternative: Use Anvil for Demo

If Sepolia deployment takes too long:

```bash
# Start local Anvil (you already did this)
anvil

# Deploy locally (instant)
forge script script/DeployORIONHook.s.sol --rpc-url http://localhost:8545 --broadcast
```

Then show judges:
- ✅ Local deployment working
- ✅ Hook address with correct flags
- ✅ All tests passing

---

**Recommendation:** For hackathon, showing local Anvil deployment + passing tests is often more impressive than waiting for testnet mining!
