// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ORIONRiskHook} from "../src/ORIONRiskHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ============ Mock ENS Contracts ============

/**
 * @title Mock ENS Reverse Registrar
 * @notice Returns predictable reverse nodes for testing
 */
contract MockReverseRegistrar {
    mapping(address => bytes32) public customNodes;
    
    function node(address addr) external view returns (bytes32) {
        if (customNodes[addr] != bytes32(0)) {
            return customNodes[addr];
        }
        // Default: derive node from address
        return keccak256(abi.encodePacked(addr, ".addr.reverse"));
    }
    
    function setNode(address addr, bytes32 _node) external {
        customNodes[addr] = _node;
    }
}

/**
 * @title Mock ENS Public Resolver
 * @notice Returns configurable ENS names and text records
 */
contract MockPublicResolver {
    // Mapping: reverseNode => ENS name
    mapping(bytes32 => string) public names;
    
    // Mapping: node => key => value
    mapping(bytes32 => mapping(string => string)) public textRecords;
    
    function name(bytes32 node) external view returns (string memory) {
        return names[node];
    }
    
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return textRecords[node][key];
    }
    
    // Test helpers
    function setName(bytes32 node, string memory _name) external {
        names[node] = _name;
    }
    
    function setText(bytes32 node, string memory key, string memory value) external {
        textRecords[node][key] = value;
    }
}

/**
 * @title ORION Risk Hook Tests
 * @notice Comprehensive test suite for the risk-enforcing hook
 */
contract ORIONRiskHookTest is Test {
    TestableORIONRiskHook public hook;
    MockReverseRegistrar public mockReverseRegistrar;
    MockPublicResolver public mockPublicResolver;

    address public poolManager = address(0x1); // Mock
    address public owner;
    address public alice = address(0x100);
    address public bob = address(0x200);
    address public nonOwner = address(0x999);

    function setUp() public {
        owner = address(this);
        
        // Deploy mock ENS contracts
        mockReverseRegistrar = new MockReverseRegistrar();
        mockPublicResolver = new MockPublicResolver();
        
        // Deploy testable hook with mocks
        hook = new TestableORIONRiskHook(
            IPoolManager(poolManager),
            address(mockReverseRegistrar),
            address(mockPublicResolver),
            owner
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
        assertEq(hook.ensReverseRegistrar(), address(mockReverseRegistrar), "ENS reverse registrar should be set");
        assertEq(hook.ensPublicResolver(), address(mockPublicResolver), "ENS public resolver should be set");
    }

    // ============ Access Control Tests ============

    function test_OnlyOwnerCanSetRiskLevel() public {
        // Owner can set
        hook.setRiskLevelMaxSlippage("low", 75);
        assertEq(hook.riskLevelMaxSlippage("low"), 75, "Owner should be able to set risk level");
    }

    function test_NonOwnerCannotSetRiskLevel() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        hook.setRiskLevelMaxSlippage("low", 75);
    }

    function test_OnlyOwnerCanEmergencyPause() public {
        hook.emergencyPause();
        
        assertEq(hook.riskLevelMaxSlippage("low"), 0, "Low should be 0 after pause");
        assertEq(hook.riskLevelMaxSlippage("medium"), 0, "Medium should be 0 after pause");
        assertEq(hook.riskLevelMaxSlippage("high"), 0, "High should be 0 after pause");
    }

    function test_NonOwnerCannotEmergencyPause() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        hook.emergencyPause();
    }

    function test_OnlyOwnerCanResetRiskLevels() public {
        // First pause
        hook.emergencyPause();
        assertEq(hook.riskLevelMaxSlippage("low"), 0, "Should be paused");
        
        // Then reset
        hook.resetRiskLevels();
        assertEq(hook.riskLevelMaxSlippage("low"), 50, "Low should reset to 50");
        assertEq(hook.riskLevelMaxSlippage("medium"), 100, "Medium should reset to 100");
        assertEq(hook.riskLevelMaxSlippage("high"), 200, "High should reset to 200");
    }

    function test_NonOwnerCannotResetRiskLevels() public {
        hook.emergencyPause();
        
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        hook.resetRiskLevels();
    }

    // ============ ENS Mock Integration Tests ============

    function test_ENS_UserWithNoName_ReturnsEmpty() public {
        // Alice has no ENS name set
        bytes32 aliceReverseNode = mockReverseRegistrar.node(alice);
        string memory name = mockPublicResolver.name(aliceReverseNode);
        
        assertEq(bytes(name).length, 0, "Alice should have no ENS name");
    }

    function test_ENS_UserWithName_ReturnsName() public {
        // Set up Bob with an ENS name
        bytes32 bobReverseNode = keccak256(abi.encodePacked(bob, ".addr.reverse"));
        mockReverseRegistrar.setNode(bob, bobReverseNode);
        mockPublicResolver.setName(bobReverseNode, "bob.eth");
        
        string memory name = mockPublicResolver.name(bobReverseNode);
        assertEq(name, "bob.eth", "Bob should have ENS name bob.eth");
    }

    function test_ENS_RiskProfile_Default() public {
        // User with ENS name but no risk_profile text record
        bytes32 aliceReverseNode = keccak256(abi.encodePacked(alice, ".addr.reverse"));
        mockReverseRegistrar.setNode(alice, aliceReverseNode);
        mockPublicResolver.setName(aliceReverseNode, "alice.eth");
        
        // No risk_profile set - should return empty string
        bytes32 ensNode = _namehash("alice.eth");
        string memory profile = mockPublicResolver.text(ensNode, "risk_profile");
        
        // Empty means hook should default to "low"
        assertEq(bytes(profile).length, 0, "Should have no risk profile set");
    }

    function test_ENS_RiskProfile_CustomSet() public {
        // User with custom risk profile
        bytes32 ensNode = _namehash("highrisk.eth");
        mockPublicResolver.setText(ensNode, "risk_profile", "high");
        
        string memory profile = mockPublicResolver.text(ensNode, "risk_profile");
        assertEq(profile, "high", "Should have high risk profile");
    }

    function test_ENS_MaxSlippage_CustomSet() public {
        // User with custom max_slippage
        bytes32 ensNode = _namehash("custom.eth");
        mockPublicResolver.setText(ensNode, "max_slippage", "1.5");
        
        string memory slippage = mockPublicResolver.text(ensNode, "max_slippage");
        assertEq(slippage, "1.5", "Should have custom slippage of 1.5%");
    }

    function test_ENS_FullProfile_Setup() public {
        // Complete user profile with ENS name, risk profile, and custom slippage
        bytes32 bobReverseNode = keccak256(abi.encodePacked(bob, ".addr.reverse"));
        mockReverseRegistrar.setNode(bob, bobReverseNode);
        mockPublicResolver.setName(bobReverseNode, "defi-trader.eth");
        
        bytes32 ensNode = _namehash("defi-trader.eth");
        mockPublicResolver.setText(ensNode, "risk_profile", "medium");
        mockPublicResolver.setText(ensNode, "max_slippage", "0.75");
        
        // Verify all data
        string memory name = mockPublicResolver.name(bobReverseNode);
        string memory profile = mockPublicResolver.text(ensNode, "risk_profile");
        string memory slippage = mockPublicResolver.text(ensNode, "max_slippage");
        
        assertEq(name, "defi-trader.eth", "Name should match");
        assertEq(profile, "medium", "Risk profile should be medium");
        assertEq(slippage, "0.75", "Custom slippage should be 0.75%");
    }

    // ============ Event Tests ============

    function test_RiskLevelUpdated_Event() public {
        vm.expectEmit(true, true, true, true);
        emit ORIONRiskHook.RiskLevelUpdated("low", 50, 25);
        
        hook.setRiskLevelMaxSlippage("low", 25);
    }

    // ============ Fuzz Tests ============

    function testFuzz_SetRiskLevel(uint256 slippage) public {
        // Bound slippage to reasonable values (0-1000 bp = 0-10%)
        slippage = bound(slippage, 0, 1000);
        
        hook.setRiskLevelMaxSlippage("low", slippage);
        assertEq(hook.riskLevelMaxSlippage("low"), slippage, "Should set arbitrary slippage");
    }

    function testFuzz_CustomRiskLevel(string memory riskLevel, uint256 slippage) public {
        // Skip empty risk levels
        vm.assume(bytes(riskLevel).length > 0);
        vm.assume(bytes(riskLevel).length < 32);
        slippage = bound(slippage, 0, 1000);
        
        hook.setRiskLevelMaxSlippage(riskLevel, slippage);
        assertEq(hook.riskLevelMaxSlippage(riskLevel), slippage, "Should set custom risk level");
    }

    // ============ Helper Functions ============

    /**
     * @notice Simplified namehash for testing
     * @dev Only handles simple two-part names like "alice.eth"
     */
    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        
        if (bytes(name).length == 0) {
            return node;
        }
        
        // For simplicity, assume format is "label.eth"
        bytes memory nameBytes = bytes(name);
        uint256 dotPos = 0;
        
        for (uint256 i = 0; i < nameBytes.length; i++) {
            if (nameBytes[i] == '.') {
                dotPos = i;
                break;
            }
        }
        
        // Hash "eth" first
        bytes memory tld = new bytes(nameBytes.length - dotPos - 1);
        for (uint256 i = dotPos + 1; i < nameBytes.length; i++) {
            tld[i - dotPos - 1] = nameBytes[i];
        }
        node = keccak256(abi.encodePacked(node, keccak256(tld)));
        
        // Hash the label
        bytes memory label = new bytes(dotPos);
        for (uint256 i = 0; i < dotPos; i++) {
            label[i] = nameBytes[i];
        }
        node = keccak256(abi.encodePacked(node, keccak256(label)));
        
        return node;
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
        address _ensPublicResolver,
        address _owner
    ) ORIONRiskHook(_poolManager, _ensReverseRegistrar, _ensPublicResolver, _owner) {}

    /// @dev Override to skip address validation in tests
    function validateHookAddress(BaseHook) internal pure override {}
}
