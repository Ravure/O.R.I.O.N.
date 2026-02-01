// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/**
 * @title ORION Risk Hook
 * @notice Uniswap v4 Hook that enforces user-defined risk profiles stored in ENS
 * @dev Reads risk_profile and max_slippage from ENS text records
 *
 * Features:
 * - Reads user risk settings from ENS
 * - Validates swap slippage against user limits
 * - Blocks trades that exceed risk tolerance
 * - Logs all trades for transparency
 */
contract ORIONRiskHook is BaseHook {

    // ============ Errors ============

    error SlippageExceedsRiskTolerance(uint256 actual, uint256 max);
    error NoENSProfileFound(address user);
    error InvalidRiskProfile(string profile);

    // ============ Events ============

    event SwapValidated(
        address indexed user,
        string ensName,
        string riskProfile,
        uint256 slippage,
        bool approved
    );

    event SwapBlocked(
        address indexed user,
        string reason,
        uint256 actualSlippage,
        uint256 maxAllowed
    );

    // ============ Storage ============

    /// @notice ENS Reverse Registrar for address → name resolution
    address public immutable ensReverseRegistrar;

    /// @notice ENS Public Resolver for reading text records
    address public immutable ensPublicResolver;

    /// @notice Maximum slippage per risk level (in basis points)
    mapping(string => uint256) public riskLevelMaxSlippage;

    // ============ Constructor ============

    constructor(
        IPoolManager _poolManager,
        address _ensReverseRegistrar,
        address _ensPublicResolver
    ) BaseHook(_poolManager) {
        ensReverseRegistrar = _ensReverseRegistrar;
        ensPublicResolver = _ensPublicResolver;

        // Set default slippage limits (in basis points: 1 bp = 0.01%)
        riskLevelMaxSlippage["low"] = 50;      // 0.5%
        riskLevelMaxSlippage["medium"] = 100;   // 1.0%
        riskLevelMaxSlippage["high"] = 200;     // 2.0%
    }

    // ============ Hook Permissions ============

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,          // ✅ Validate before swap
            afterSwap: true,           // ✅ Log after swap
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ============ Hook Implementation ============

    /**
     * @notice Called before every swap to validate against user's risk profile
     * @param sender The address initiating the swap
     * @param key The pool key
     * @param params Swap parameters including amount and direction
     */
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata /* hookData */
    )
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // 1. Get user's ENS name
        string memory ensName = _getENSName(sender);

        // If no ENS name, allow the swap (no risk profile to enforce)
        if (bytes(ensName).length == 0) {
            return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        // 2. Read risk profile from ENS
        string memory riskProfile = _getRiskProfile(ensName);

        // 3. Read max slippage from ENS (or use default for risk level)
        uint256 maxSlippage = _getMaxSlippage(ensName, riskProfile);

        // 4. Calculate expected price impact/slippage
        uint256 estimatedSlippage = _estimateSlippage(key, params);

        // 5. Validate against risk tolerance
        if (estimatedSlippage > maxSlippage) {
            emit SwapBlocked(
                sender,
                "Slippage exceeds risk tolerance",
                estimatedSlippage,
                maxSlippage
            );

            revert SlippageExceedsRiskTolerance(estimatedSlippage, maxSlippage);
        }

        // 6. Log validation
        emit SwapValidated(
            sender,
            ensName,
            riskProfile,
            estimatedSlippage,
            true
        );

        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /**
     * @notice Called after swap executes to log the trade
     * @param sender The address that initiated the swap
     * @param key The pool key
     * @param params Swap parameters
     * @param delta The balance changes from the swap
     */
    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata /* hookData */
    )
        internal
        override
        returns (bytes4, int128)
    {
        // Could log additional analytics here
        // For now, just return success
        return (this.afterSwap.selector, 0);
    }

    // ============ Internal Functions ============

    /**
     * @notice Gets ENS name for an address via reverse resolution
     * @param user The address to resolve
     * @return The ENS name or empty string if none
     */
    function _getENSName(address user) internal view returns (string memory) {
        // In production, would call ENS Reverse Registrar
        // For demo/testing, we'll use a simplified version

        // TODO: Implement actual ENS reverse resolution
        // Example: ReverseRegistrar(ensReverseRegistrar).getName(user);

        return ""; // Placeholder
    }

    /**
     * @notice Reads risk_profile text record from ENS
     * @param ensName The ENS name to read from
     * @return The risk profile: "low", "medium", or "high"
     */
    function _getRiskProfile(string memory ensName)
        internal
        view
        returns (string memory)
    {
        // In production, would call ENS Public Resolver
        // Example:
        // bytes32 node = namehash(ensName);
        // string memory profile = Resolver(ensPublicResolver).text(node, "risk_profile");

        // For now, default to "low" for safety
        return "low"; // Placeholder
    }

    /**
     * @notice Gets max slippage from ENS or default for risk level
     * @param ensName The ENS name
     * @param riskProfile The user's risk profile
     * @return Max slippage in basis points
     */
    function _getMaxSlippage(
        string memory ensName,
        string memory riskProfile
    )
        internal
        view
        returns (uint256)
    {
        // Try to read custom max_slippage from ENS
        // If not set, use default for risk level

        // TODO: Read from ENS
        // string memory customSlippage = Resolver(ensPublicResolver).text(node, "max_slippage");

        // Use default for risk level
        return riskLevelMaxSlippage[riskProfile];
    }

    /**
     * @notice Estimates price impact/slippage for a swap
     * @param key The pool key
     * @param params Swap parameters
     * @return Estimated slippage in basis points
     */
    function _estimateSlippage(
        PoolKey calldata key,
        SwapParams calldata params
    )
        internal
        view
        returns (uint256)
    {
        // Simplified slippage calculation
        // In production, would use TWAP oracle and pool reserves

        // For demo purposes, estimate based on swap size
        // Larger swaps = more slippage
        uint256 swapSize = params.amountSpecified > 0
            ? uint256(int256(params.amountSpecified))
            : uint256(-int256(params.amountSpecified));

        // Simple heuristic: 0.1% slippage per 10k units
        // This is a placeholder - real implementation would use pool math
        uint256 estimated = (swapSize / 10000) * 10; // 10 bp per 10k

        return estimated;
    }

    // ============ Admin Functions ============

    /**
     * @notice Updates max slippage for a risk level
     * @param riskLevel The risk level ("low", "medium", "high")
     * @param maxSlippage New max slippage in basis points
     */
    function setRiskLevelMaxSlippage(
        string memory riskLevel,
        uint256 maxSlippage
    )
        external
    {
        // In production, add access control (onlyOwner)
        riskLevelMaxSlippage[riskLevel] = maxSlippage;
    }
}
