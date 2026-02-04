// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

/**
 * @title Hook Miner
 * @notice Helper to mine for valid CREATE2 hook addresses
 * @dev Based on Uniswap v4 HookMiner
 */
library HookMiner {
    /**
     * @notice Find a salt that produces a valid hook address
     * @param deployer The address that will deploy the hook
     * @param flags The hook permission flags required
     * @param creationCode The contract creation bytecode
     * @param constructorArgs ABI-encoded constructor arguments
     * @return hookAddress The valid hook address found
     * @return salt The salt to use for CREATE2 deployment
     */
    function find(
        address deployer,
        uint160 flags,
        bytes memory creationCode,
        bytes memory constructorArgs
    ) internal pure returns (address, bytes32) {
        bytes memory creationCodeWithArgs = abi.encodePacked(
            creationCode,
            constructorArgs
        );
        bytes32 creationCodeHash = keccak256(creationCodeWithArgs);

        // Try different salts - start from a random point
        uint256 startSeed = uint256(keccak256(abi.encodePacked(deployer, flags))) % 1000000;

        for (uint256 i = 0; i < 1_000_000; i++) {
            bytes32 salt = bytes32(startSeed + i);

            address hookAddress = computeAddress(
                deployer,
                salt,
                creationCodeHash
            );

            // Check if address has required flags
            if ((uint160(hookAddress) & flags) == flags) {
                return (hookAddress, salt);
            }
        }

        revert("HookMiner: Could not find valid address in 1M attempts");
    }

    /**
     * @notice Compute CREATE2 address
     */
    function computeAddress(
        address deployer,
        bytes32 salt,
        bytes32 creationCodeHash
    ) internal pure returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            deployer,
                            salt,
                            creationCodeHash
                        )
                    )
                )
            )
        );
    }
}
