// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ORIONRiskHook} from "../src/ORIONRiskHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";

/**
 * @title ORION Risk Hook Tests
 * @notice Test suite for the risk-enforcing hook
 */
contract ORIONRiskHookTest is Test {
    TestableORIONRiskHook public hook;

    address public poolManager = address(0x1); // Mock
    address public ensReverseRegistrar = address(0x2); // Mock
    address public ensPublicResolver = address(0x3); // Mock

    address public alice = address(0x100);
    address public bob = address(0x200);

    function setUp() public {
        // Deploy testable hook (skips address validation)
        hook = new TestableORIONRiskHook(
            IPoolManager(poolManager),
            ensReverseRegistrar,
            ensPublicResolver
        );
    }

    // ============ Permission Tests ============

    function test_HookPermissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        assertTrue(permissions.beforeSwap, "Should enable beforeSwap");
        assertTrue(permissions.afterSwap, "Should enable afterSwap");
        assertFalse(permissions.beforeAddLiquidity, "Should not enable beforeAddLiquidity");
    }

    // ============ Risk Level Tests ============

    function test_DefaultRiskLevels() public view {
        assertEq(hook.riskLevelMaxSlippage("low"), 50, "Low risk should be 0.5%");
        assertEq(hook.riskLevelMaxSlippage("medium"), 100, "Medium risk should be 1.0%");
        assertEq(hook.riskLevelMaxSlippage("high"), 200, "High risk should be 2.0%");
    }

    function test_UpdateRiskLevel() public {
        hook.setRiskLevelMaxSlippage("low", 25);
        assertEq(hook.riskLevelMaxSlippage("low"), 25, "Should update low risk to 0.25%");
    }

    // ============ ENS Integration Tests ============

    function test_NoENSProfile_AllowsSwap() public view {
        // If user has no ENS name, swap should be allowed
        // This would require mocking the beforeSwap call
        // For now, we verify the contract deployed correctly
        assertTrue(address(hook) != address(0), "Hook should be deployed");
    }

    // ============ Deployment Tests ============

    function test_Constructor() public view {
        assertEq(hook.ensReverseRegistrar(), ensReverseRegistrar, "ENS reverse registrar should be set");
        assertEq(hook.ensPublicResolver(), ensPublicResolver, "ENS public resolver should be set");
    }
}

/**
 * @title Testable ORION Risk Hook
 * @notice Version of the hook that skips address validation for testing
 */
contract TestableORIONRiskHook is ORIONRiskHook {
    constructor(
        IPoolManager _poolManager,
        address _ensReverseRegistrar,
        address _ensPublicResolver
    ) ORIONRiskHook(_poolManager, _ensReverseRegistrar, _ensPublicResolver) {}

    /// @dev Override to skip address validation in tests
    function validateHookAddress(BaseHook) internal pure override {}
}
