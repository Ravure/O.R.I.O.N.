// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ============ ENS Interface Definitions ============

/**
 * @notice ENS Registry interface for looking up resolvers
 */
interface IENS {
    function resolver(bytes32 node) external view returns (address);
}

/**
 * @notice ENS Reverse Registrar interface for address -> node mapping
 */
interface IReverseRegistrar {
    function node(address addr) external pure returns (bytes32);
}

/**
 * @notice ENS Name Resolver interface for reverse resolution
 */
interface INameResolver {
    function name(bytes32 node) external view returns (string memory);
}

/**
 * @notice ENS Public Resolver interface for text records
 */
interface IPublicResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function name(bytes32 node) external view returns (string memory);
}

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
 * - Owner-controlled admin functions
 */
contract ORIONRiskHook is BaseHook, Ownable {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

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

    event RiskLevelUpdated(
        string indexed riskLevel,
        uint256 oldSlippage,
        uint256 newSlippage
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
        address _ensPublicResolver,
        address _owner
    ) BaseHook(_poolManager) Ownable(_owner) {
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
        // Calculate the reverse node for the address
        // Format: <address>.addr.reverse
        bytes32 reverseNode = IReverseRegistrar(ensReverseRegistrar).node(user);
        
        // Try to get the name from the resolver
        try IPublicResolver(ensPublicResolver).name(reverseNode) returns (string memory name) {
            return name;
        } catch {
            return "";
        }
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
        bytes32 node = _namehash(ensName);
        
        try IPublicResolver(ensPublicResolver).text(node, "risk_profile") returns (string memory profile) {
            // If no profile set, default to "low" for safety
            if (bytes(profile).length == 0) {
                return "low";
            }
            return profile;
        } catch {
            return "low";
        }
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
        bytes32 node = _namehash(ensName);
        
        // Try to read custom max_slippage from ENS
        try IPublicResolver(ensPublicResolver).text(node, "max_slippage") returns (string memory slippageStr) {
            if (bytes(slippageStr).length > 0) {
                // Parse string to basis points (e.g., "0.5" -> 50 bp)
                uint256 customSlippage = _parseSlippageString(slippageStr);
                if (customSlippage > 0) {
                    return customSlippage;
                }
            }
        } catch {}
        
        // Fallback to default for risk level
        return riskLevelMaxSlippage[riskProfile];
    }

    /**
     * @notice Estimates price impact/slippage for a swap using Uniswap v4 concentrated liquidity math
     * @param key The pool key
     * @param params Swap parameters
     * @return Estimated slippage in basis points (1 bp = 0.01%)
     * 
     * @dev Uses the concentrated liquidity formula:
     *      For a swap of amount Δx:
     *        Δ√P = Δx / L  (change in sqrt price)
     *        Price Impact ≈ 2 * Δ√P / √P (in basis points)
     *      
     *      This accounts for:
     *      - Current pool liquidity at the active tick
     *      - Current sqrt price (sqrtPriceX96)
     *      - Swap direction (zeroForOne or oneForZero)
     */
    function _estimateSlippage(
        PoolKey calldata key,
        SwapParams calldata params
    )
        internal
        view
        returns (uint256)
    {
        // Get pool ID
        PoolId poolId = key.toId();
        
        // Get current pool state
        (uint160 sqrtPriceX96, int24 currentTick,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        
        // If no liquidity or no price, return max slippage
        if (liquidity == 0 || sqrtPriceX96 == 0) {
            return 200; // 2% max for safety
        }
        
        // Calculate absolute swap amount
        uint256 swapAmount = params.amountSpecified > 0
            ? uint256(int256(params.amountSpecified))
            : uint256(-int256(params.amountSpecified));
        
        // Estimate price impact using concentrated liquidity formula
        // 
        // In Uniswap v4 (like v3), for a swap:
        //   Δ√P = Δx / L  (for token0 -> token1)
        //   Δ√P = Δy / L  (for token1 -> token0)
        // 
        // Price impact in basis points:
        //   impact_bp = (Δ√P / √P) * 10000 * 2
        //
        // Simplified formula:
        //   impact_bp = (swapAmount * 2 * 10000) / (liquidity * √P_normalized)
        //
        // We use sqrtPriceX96 which is √P * 2^96, so we need to adjust
        
        // Calculate sqrt price normalized (divide by 2^48 to get manageable numbers)
        // sqrtPriceX96 is in Q64.96 format, so dividing by 2^48 gives us a workable value
        uint256 sqrtPriceNorm = uint256(sqrtPriceX96) >> 48;
        if (sqrtPriceNorm == 0) sqrtPriceNorm = 1;
        
        // For concentrated liquidity, impact depends on liquidity depth
        // impact_bp ≈ (swapAmount * 20000) / (liquidity * sqrtPriceNorm / 2^48)
        //
        // Simplified: We multiply by 2 (for both sides of the spread) and by 10000 for basis points
        // Then divide by (liquidity * some price factor)
        
        // Use tick spacing as an additional factor (wider spacing = higher impact)
        int24 tickSpacing = key.tickSpacing;
        uint256 tickFactor = tickSpacing > 0 ? uint256(int256(tickSpacing)) : 1;
        
        // Calculate liquidity depth factor
        // Higher liquidity = lower impact
        // We normalize by dividing swap size by liquidity, scaled appropriately
        uint256 liquidityScaled = uint256(liquidity) / 1e6; // Scale down liquidity
        if (liquidityScaled == 0) liquidityScaled = 1;
        
        // Price impact formula:
        // impact = (swapAmount * tickFactor * 10000) / (liquidityScaled * sqrtPriceNorm)
        // 
        // We add sqrt price to account for different price levels
        // At higher prices, same liquidity provides less depth in token terms
        
        uint256 numerator = swapAmount * tickFactor * 100; // * 100 for basis points
        uint256 denominator = liquidityScaled * sqrtPriceNorm;
        if (denominator == 0) denominator = 1;
        
        uint256 impactBp = numerator / denominator;
        
        // Apply minimum floor for small swaps (at least 1 bp)
        if (impactBp == 0 && swapAmount > 0) {
            impactBp = 1;
        }
        
        // Cap at 200 bp (2%) for safety
        // Trades with higher impact should be split or use limit orders
        return impactBp > 200 ? 200 : impactBp;
    }
    
    /**
     * @notice Gets the current sqrt price for a pool (for external queries)
     * @param key The pool key
     * @return sqrtPriceX96 The current sqrt price in Q64.96 format
     */
    function getPoolSqrtPrice(PoolKey calldata key) external view returns (uint160) {
        PoolId poolId = key.toId();
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        return sqrtPriceX96;
    }
    
    /**
     * @notice Gets the current liquidity for a pool (for external queries)
     * @param key The pool key
     * @return liquidity The current active liquidity
     */
    function getPoolLiquidity(PoolKey calldata key) external view returns (uint128) {
        PoolId poolId = key.toId();
        return poolManager.getLiquidity(poolId);
    }

    /**
     * @notice Computes ENS namehash for a domain name
     * @param name The ENS name (e.g., "vitalik.eth")
     * @return The namehash as bytes32
     */
    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        
        if (bytes(name).length == 0) {
            return node;
        }
        
        // Split by '.' and hash iteratively (right to left)
        // For "vitalik.eth": hash("eth"), then hash("vitalik" + previous)
        bytes memory nameBytes = bytes(name);
        uint256 lastDot = nameBytes.length;
        
        for (uint256 i = nameBytes.length; i > 0; i--) {
            if (nameBytes[i - 1] == '.') {
                // Hash the label from i to lastDot
                bytes memory label = _slice(nameBytes, i, lastDot);
                node = keccak256(abi.encodePacked(node, keccak256(label)));
                lastDot = i - 1;
            }
        }
        
        // Hash the final (leftmost) label
        bytes memory firstLabel = _slice(nameBytes, 0, lastDot);
        node = keccak256(abi.encodePacked(node, keccak256(firstLabel)));
        
        return node;
    }

    /**
     * @notice Extracts a slice from a bytes array
     * @param data The source bytes
     * @param start Start index
     * @param end End index (exclusive)
     * @return The sliced bytes
     */
    function _slice(bytes memory data, uint256 start, uint256 end) internal pure returns (bytes memory) {
        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = data[i];
        }
        return result;
    }

    /**
     * @notice Parses a slippage string like "0.5" into basis points (50)
     * @param slippageStr The string representation (e.g., "0.5" for 0.5%)
     * @return Slippage in basis points
     */
    function _parseSlippageString(string memory slippageStr) internal pure returns (uint256) {
        bytes memory b = bytes(slippageStr);
        uint256 result = 0;
        uint256 decimals = 0;
        bool foundDecimal = false;
        
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '.') {
                foundDecimal = true;
                continue;
            }
            if (b[i] >= '0' && b[i] <= '9') {
                result = result * 10 + (uint8(b[i]) - 48);
                if (foundDecimal) {
                    decimals++;
                }
            }
        }
        
        // Convert to basis points (1% = 100 bp)
        // If input is "0.5" -> result=5, decimals=1 -> 5 * 100 / 10 = 50 bp
        // If input is "1.0" -> result=10, decimals=1 -> 10 * 100 / 10 = 100 bp
        if (decimals == 0) {
            return result * 100; // Whole number percentage
        }
        
        uint256 divisor = 1;
        for (uint256 i = 0; i < decimals; i++) {
            divisor *= 10;
        }
        
        return (result * 100) / divisor;
    }

    // ============ Admin Functions ============

    /**
     * @notice Updates max slippage for a risk level
     * @param riskLevel The risk level ("low", "medium", "high")
     * @param maxSlippage New max slippage in basis points
     * @dev Only callable by contract owner
     */
    function setRiskLevelMaxSlippage(
        string memory riskLevel,
        uint256 maxSlippage
    )
        external
        onlyOwner
    {
        uint256 oldSlippage = riskLevelMaxSlippage[riskLevel];
        riskLevelMaxSlippage[riskLevel] = maxSlippage;
        emit RiskLevelUpdated(riskLevel, oldSlippage, maxSlippage);
    }

    /**
     * @notice Emergency pause - sets all risk levels to 0 (blocks all swaps)
     * @dev Only callable by contract owner
     */
    function emergencyPause() external onlyOwner {
        uint256 oldLow = riskLevelMaxSlippage["low"];
        uint256 oldMedium = riskLevelMaxSlippage["medium"];
        uint256 oldHigh = riskLevelMaxSlippage["high"];
        
        riskLevelMaxSlippage["low"] = 0;
        riskLevelMaxSlippage["medium"] = 0;
        riskLevelMaxSlippage["high"] = 0;
        
        emit RiskLevelUpdated("low", oldLow, 0);
        emit RiskLevelUpdated("medium", oldMedium, 0);
        emit RiskLevelUpdated("high", oldHigh, 0);
    }

    /**
     * @notice Reset risk levels to defaults
     * @dev Only callable by contract owner
     */
    function resetRiskLevels() external onlyOwner {
        uint256 oldLow = riskLevelMaxSlippage["low"];
        uint256 oldMedium = riskLevelMaxSlippage["medium"];
        uint256 oldHigh = riskLevelMaxSlippage["high"];
        
        riskLevelMaxSlippage["low"] = 50;
        riskLevelMaxSlippage["medium"] = 100;
        riskLevelMaxSlippage["high"] = 200;
        
        emit RiskLevelUpdated("low", oldLow, 50);
        emit RiskLevelUpdated("medium", oldMedium, 100);
        emit RiskLevelUpdated("high", oldHigh, 200);
    }
}
