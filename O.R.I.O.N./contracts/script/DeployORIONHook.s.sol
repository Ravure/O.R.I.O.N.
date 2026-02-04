// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {ORIONRiskHook} from "../src/ORIONRiskHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/**
 * @title Deploy ORION Hook Script
 * @notice Deploys the ORION Risk Hook to Sepolia testnet
 *
 * Usage:
 *   forge script script/DeployORIONHook.s.sol --rpc-url sepolia --broadcast --verify
 */
contract DeployORIONHook is Script {
    function run() external {
        // Load deployment configuration from environment
        uint256 deployerPrivateKey = vm.envUint("AGENT_PRIVATE_KEY");

        // Sepolia testnet addresses
        address poolManager = vm.envOr(
            "UNISWAP_V4_POOL_MANAGER",
            0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 // Uniswap v4 PoolManager on Sepolia
        );

        address ensReverseRegistrar = vm.envOr(
            "ENS_REVERSE_REGISTRAR",
            0x084b1c3C81545d370f3634392De611CaaBFf8148 // Sepolia ENS Reverse Registrar
        );

        address ensPublicResolver = vm.envOr(
            "ENS_PUBLIC_RESOLVER",
            0x8FADE66B79cC9f707aB26799354482EB93a5B7dD // Sepolia ENS Public Resolver
        );

        // Owner will be the deployer
        address owner = vm.addr(deployerPrivateKey);

        console.log("Deploying ORION Risk Hook to Sepolia...");
        console.log("Pool Manager:", poolManager);
        console.log("ENS Reverse Registrar:", ensReverseRegistrar);
        console.log("ENS Public Resolver:", ensPublicResolver);
        console.log("Owner:", owner);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the hook
        ORIONRiskHook hook = new ORIONRiskHook(
            IPoolManager(poolManager),
            ensReverseRegistrar,
            ensPublicResolver,
            owner
        );

        console.log("ORION Hook deployed at:", address(hook));

        vm.stopBroadcast();

        // Log deployment details
        console.log("\n=== Deployment Summary ===");
        console.log("Hook Address:", address(hook));
        console.log("Low Risk Max Slippage:", hook.riskLevelMaxSlippage("low"), "bp (0.5%)");
        console.log("Medium Risk Max Slippage:", hook.riskLevelMaxSlippage("medium"), "bp (1.0%)");
        console.log("High Risk Max Slippage:", hook.riskLevelMaxSlippage("high"), "bp (2.0%)");

        console.log("\n=== Next Steps ===");
        console.log("1. Verify contract on Etherscan");
        console.log("2. Set ENS risk_profile text records");
        console.log("3. Test with Uniswap v4 pools");
    }
}
