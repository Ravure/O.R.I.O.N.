#!/bin/bash

# ORION Contracts Installation Script
# Installs Foundry and all dependencies for Uniswap v4 Hook development

set -e

echo "🚀 Installing ORION Smart Contract Dependencies..."
echo ""

# Check if Foundry is installed
if ! command -v forge &> /dev/null; then
    echo "📦 Foundry not found. Installing..."
    curl -L https://foundry.paradigm.xyz | bash

    # Source the appropriate shell config
    if [ -f "$HOME/.zshenv" ]; then
        source "$HOME/.zshenv"
    elif [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    fi

    # Run foundryup to install forge, cast, anvil
    foundryup
else
    echo "✅ Foundry already installed"
    forge --version
fi

echo ""
echo "📚 Installing contract dependencies..."

# Install Uniswap v4 dependencies
echo "  - Installing v4-core..."
$HOME/.foundry/bin/forge install Uniswap/v4-core

echo "  - Installing v4-periphery..."
$HOME/.foundry/bin/forge install Uniswap/v4-periphery

echo "  - Installing forge-std..."
$HOME/.foundry/bin/forge install foundry-rs/forge-std

echo ""
echo "🔨 Building contracts..."
$HOME/.foundry/bin/forge build

echo ""
echo "✅ Installation complete!"
echo ""
echo "🧪 Running tests..."
$HOME/.foundry/bin/forge test

echo ""
echo "📋 All set! Phase 3 is ready."
echo ""
echo "Next steps:"
echo "  1. Add AGENT_PRIVATE_KEY to .env (for deployment)"
echo "  2. Add ALCHEMY_SEPOLIA_URL to .env"
echo "  3. Run tests: forge test"
echo "  4. Deploy: forge script script/DeployORIONHook.s.sol --rpc-url sepolia --broadcast"
echo ""
