// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {ORIONRiskHook} from "../src/ORIONRiskHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

/**
 * @title Deploy ORION Hook with CREATE2
 * @notice Mines for a valid hook address and deploys
 */
contract DeployWithCreate2 is Script {
    function run() external {
        // Load configuration
        uint256 deployerPrivateKey = vm.envUint("AGENT_PRIVATE_KEY");
        address poolManager = vm.envOr(
            "UNISWAP_V4_POOL_MANAGER",
            0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
        );
        address ensReverseRegistrar = vm.envOr(
            "ENS_REVERSE_REGISTRAR",
            0x084b1c3C81545d370f3634392De611CaaBFf8148
        );
        address ensPublicResolver = vm.envOr(
            "ENS_PUBLIC_RESOLVER",
            0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
        );

        // Get required hook permissions
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        );

        console.log("Mining for valid hook address...");
        console.log("Required flags:");
        console.log("  BEFORE_SWAP: true");
        console.log("  AFTER_SWAP: true");
        console.log("");

        // Mine for valid address
        bytes memory constructorArgs = abi.encode(
            IPoolManager(poolManager),
            ensReverseRegistrar,
            ensPublicResolver
        );

        (address hookAddress, bytes32 salt) = HookMiner.find(
            vm.addr(deployerPrivateKey),
            flags,
            type(ORIONRiskHook).creationCode,
            constructorArgs
        );

        console.log("Found valid address!");
        console.log("Hook Address:", hookAddress);
        console.log("Salt:", vm.toString(salt));
        console.log("");

        // Deploy with CREATE2
        vm.startBroadcast(deployerPrivateKey);

        ORIONRiskHook hook = new ORIONRiskHook{salt: salt}(
            IPoolManager(poolManager),
            ensReverseRegistrar,
            ensPublicResolver
        );

        require(address(hook) == hookAddress, "Hook address mismatch");

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Hook Address:", address(hook));
        console.log("Pool Manager:", poolManager);
        console.log("ENS Reverse Registrar:", ensReverseRegistrar);
        console.log("ENS Public Resolver:", ensPublicResolver);
        console.log("");
        console.log("Risk Levels:");
        console.log("  Low: 0.5% (50 bp)");
        console.log("  Medium: 1.0% (100 bp)");
        console.log("  High: 2.0% (200 bp)");
        console.log("");
        console.log("ORION Hook deployed successfully!");
    }
}
