import React, { useState, useEffect, useCallback } from 'react';
import { YellowNetworkClient, CLEARNODE_ENDPOINTS, YELLOW_ASSETS } from '../services/yellowNetwork';

interface Trade {
  id: number;
  from: string;
  to: string;
  amount: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  gasSaved: number;
  txId: string;
}

interface TradingStats {
  totalTrades: number;
  totalVolume: number;
  totalGasSaved: number;
  isConnected: boolean;
  isAuthenticated: boolean;
  sessionActive: boolean;
  channelOpenCost: number;
  channelCloseCost: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'authenticated';

/**
 * Yellow Network Trading Dashboard
 * Real integration with Yellow Network's ClearNode WebSocket
 */
export const TradingDashboard: React.FC = () => {
  // Channel costs (one-time): ~100k gas each for open/close at 30 gwei, $2500 ETH
  const CHANNEL_OPEN_COST = 7.50;
  const CHANNEL_CLOSE_COST = 7.50;
  const GAS_PER_TRADE_ONCHAIN = 11.25; // ~150k gas per swap

  const [client] = useState(() => new YellowNetworkClient({
    endpoint: CLEARNODE_ENDPOINTS.sandbox,
  }));

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [stats, setStats] = useState<TradingStats>({
    totalTrades: 0,
    totalVolume: 0,
    totalGasSaved: 0,
    isConnected: false,
    isAuthenticated: false,
    sessionActive: false,
    channelOpenCost: CHANNEL_OPEN_COST,
    channelCloseCost: CHANNEL_CLOSE_COST,
  });

  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Add log message
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  }, []);

  // Handle ClearNode messages
  const handleMessage = useCallback((method: string, data: any) => {
    addLog(`[${method}]: ${JSON.stringify(data).slice(0, 80)}...`);
  }, [addLog]);

  // Connect to ClearNode
  const connectToClearNode = async () => {
    setIsLoading(true);
    setError(null);
    setConnectionStatus('connecting');
    addLog('Connecting to ClearNode sandbox...');

    try {
      // Update client callbacks
      client['config'].onMessage = handleMessage;
      client['config'].onConnected = () => {
        addLog('WebSocket connected!');
        setConnectionStatus('connected');
        setStats(prev => ({ ...prev, isConnected: true }));
      };
      client['config'].onDisconnected = () => {
        addLog('WebSocket disconnected');
        setConnectionStatus('disconnected');
        setStats(prev => ({ ...prev, isConnected: false, isAuthenticated: false }));
      };
      client['config'].onError = (err: Error) => {
        addLog(`Error: ${err.message}`);
        setError(err.message);
      };
      client['config'].onAuthChallenge = (challenge: string) => {
        addLog(`Auth challenge received: ${challenge.slice(0, 50)}...`);
      };
      client['config'].onAuthenticated = () => {
        addLog('Authentication successful!');
        setConnectionStatus('authenticated');
        setStats(prev => ({ ...prev, isAuthenticated: true }));
      };

      await client.connect();
      addLog('Connected to: ' + CLEARNODE_ENDPOINTS.sandbox);

      // Try to get assets
      try {
        const assets = await client.getAssets();
        addLog(`Assets: ${JSON.stringify(assets.data?.assets?.length || 0)} available`);
      } catch (e) {
        addLog('Could not fetch assets (auth may be required)');
      }

    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      addLog(`Connection failed: ${err.message}`);
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  };

  // Authenticate with wallet
  const authenticateWithWallet = async () => {
    setIsLoading(true);
    setError(null);
    addLog('Connecting wallet...');

    try {
      const { address } = await client.setupWalletSigner();
      addLog(`Wallet: ${address.slice(0, 10)}...${address.slice(-6)}`);

      setConnectionStatus('authenticating');
      addLog('Starting EIP-712 authentication...');

      await client.authenticate();
      // Note: onAuthenticated callback will update the status

    } catch (err: any) {
      const errorMsg = err.message || 'Authentication failed';
      setError(errorMsg);
      addLog(`Auth failed: ${errorMsg}`);
      setConnectionStatus('connected'); // Reset to connected on failure
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect
  const disconnect = () => {
    client.disconnect();
    setConnectionStatus('disconnected');
    setStats({
      totalTrades: 0,
      totalVolume: 0,
      totalGasSaved: 0,
      isConnected: false,
      isAuthenticated: false,
      sessionActive: false,
      channelOpenCost: CHANNEL_OPEN_COST,
      channelCloseCost: CHANNEL_CLOSE_COST,
    });
    setTrades([]);
    addLog('Disconnected from ClearNode');
  };

  // Check channels and balances
  const checkChannelsAndBalances = async () => {
    setIsLoading(true);
    addLog('Checking channels and balances...');

    try {
      // Get channels
      const channels = await client.getChannels();
      const channelList = channels?.channels || [];
      addLog(`Channels: ${channelList.length} found`);
      if (channelList.length > 0) {
        channelList.forEach((ch: any, i: number) => {
          addLog(`  Channel ${i + 1}: ${ch.channel_id?.slice(0, 10)}... Status: ${ch.status}`);
        });
      } else {
        addLog('  No channels - deposit funds to create one');
      }

      // Get ledger balances
      const balances = await client.getLedgerBalances();
      const balanceList = balances?.ledgerBalances || balances?.ledger_balances || [];
      addLog(`Balances: ${balanceList.length} assets`);
      if (balanceList.length > 0) {
        balanceList.forEach((bal: any) => {
          addLog(`  ${bal.asset}: ${bal.amount || bal.balance}`);
        });
      } else {
        addLog('  No balances - need to deposit funds');
      }

    } catch (err: any) {
      addLog(`Check failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute a simulated trade (real trading requires deposited channel funds)
  const executeTrade = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      // Use ytest.usd for Yellow Network sandbox
      const fromAsset = YELLOW_ASSETS.YTEST_USD;
      const toAsset = YELLOW_ASSETS.YTEST_USD; // Same asset, simulating internal transfer
      const amount = Math.floor(Math.random() * 500 + 50);

      // Use the client's simulate trade (would be real in production with channel funds)
      const result = client.simulateTrade(fromAsset, toAsset, amount);

      const newTrade: Trade = {
        id: Date.now(),
        from: fromAsset.toUpperCase(),
        to: toAsset.toUpperCase(),
        amount: amount.toFixed(2),
        timestamp: new Date(),
        status: 'confirmed',
        gasSaved: result.gasSaved,
        txId: result.txId,
      };

      setTrades(prev => [newTrade, ...prev.slice(0, 9)]);
      setStats(prev => ({
        ...prev,
        totalTrades: prev.totalTrades + 1,
        totalVolume: prev.totalVolume + amount,
        totalGasSaved: prev.totalGasSaved + GAS_PER_TRADE_ONCHAIN,
        sessionActive: true,
      }));

      addLog(`Trade: ${amount} ${fromAsset.toUpperCase()} -> ${toAsset.toUpperCase()}`);

    } catch (err: any) {
      setError('Trade failed');
      addLog(`Trade failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Run rapid trades demo
  const runRapidTradesDemo = async () => {
    setIsLoading(true);
    setError(null);
    addLog('Starting 10 rapid trades demo...');

    for (let i = 0; i < 10; i++) {
      await executeTrade();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    addLog('Rapid trades demo complete!');
    setIsLoading(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'authenticated': return 'bg-green-100 text-green-800';
      case 'authenticating': return 'bg-purple-100 text-purple-800';
      case 'connected': return 'bg-blue-100 text-blue-800';
      case 'connecting': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDotColor = () => {
    switch (connectionStatus) {
      case 'authenticated': return 'bg-green-500';
      case 'authenticating': return 'bg-purple-500 animate-pulse';
      case 'connected': return 'bg-blue-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Yellow Network Trading
        </h2>
        <p className="text-gray-600 mt-1">
          Zero-fee state channel trading powered by ERC-7824
        </p>
        <p className="text-sm text-blue-600 mt-1">
          Sandbox: {CLEARNODE_ENDPOINTS.sandbox}
        </p>
      </div>

      {/* Connection Status & Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${getStatusColor()}`}>
            <span className={`w-2 h-2 rounded-full ${getStatusDotColor()}`} />
            {connectionStatus === 'authenticated' && 'Authenticated'}
            {connectionStatus === 'authenticating' && 'Authenticating (check wallet)...'}
            {connectionStatus === 'connected' && 'Connected (not authenticated)'}
            {connectionStatus === 'connecting' && 'Connecting...'}
            {connectionStatus === 'disconnected' && 'Disconnected'}
          </div>

          <div className="flex gap-2">
            {connectionStatus === 'disconnected' && (
              <button
                onClick={connectToClearNode}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                Connect to ClearNode
              </button>
            )}
            {connectionStatus === 'connected' && (
              <button
                onClick={authenticateWithWallet}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                Authenticate with Wallet
              </button>
            )}
            {connectionStatus === 'authenticating' && (
              <button
                disabled
                className="px-4 py-2 bg-purple-400 text-white rounded-lg cursor-not-allowed"
              >
                Check MetaMask...
              </button>
            )}
            {connectionStatus === 'authenticated' && (
              <button
                onClick={checkChannelsAndBalances}
                disabled={isLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                Check Channels/Balances
              </button>
            )}
            {connectionStatus !== 'disconnected' && connectionStatus !== 'authenticating' && (
              <button
                onClick={disconnect}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {stats.sessionActive && connectionStatus === 'authenticated' && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-800 w-fit">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Trading Session Active
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 uppercase tracking-wide">Total Trades</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            {stats.totalTrades}
          </div>
          <div className="text-sm text-green-600 mt-1">
            All off-chain (zero gas)
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 uppercase tracking-wide">Volume</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            ${stats.totalVolume.toFixed(2)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Stablecoin trades
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500 uppercase tracking-wide">Net Savings</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            ${Math.max(0, stats.totalGasSaved - (stats.sessionActive ? stats.channelOpenCost + stats.channelCloseCost : 0)).toFixed(2)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            after channel costs
          </div>
        </div>
      </div>

      {/* Channel Cost Notice */}
      {stats.sessionActive && connectionStatus === 'authenticated' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-yellow-600 text-xl">&#9888;</span>
            <div>
              <div className="font-medium text-yellow-800">State Channel Costs (One-Time)</div>
              <div className="text-sm text-yellow-700 mt-1">
                Opening channel: <span className="font-medium">${stats.channelOpenCost.toFixed(2)}</span> |
                Closing channel: <span className="font-medium">${stats.channelCloseCost.toFixed(2)}</span> |
                <span className="font-medium"> Total: ${(stats.channelOpenCost + stats.channelCloseCost).toFixed(2)}</span>
              </div>
              <div className="text-sm text-yellow-600 mt-1">
                All trades within the session are FREE. Break-even at {Math.ceil((stats.channelOpenCost + stats.channelCloseCost) / GAS_PER_TRADE_ONCHAIN)} trades.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-4">
        {connectionStatus !== 'authenticated' && (
          <div className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
            {connectionStatus === 'disconnected'
              ? 'Connect to ClearNode and authenticate to enable trading'
              : 'Authenticate with your wallet to enable trading'}
          </div>
        )}
        <div className="flex gap-4">
          <button
            onClick={executeTrade}
            disabled={isLoading || connectionStatus !== 'authenticated'}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isLoading || connectionStatus !== 'authenticated'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Processing...' : 'Execute Trade'}
          </button>

          <button
            onClick={runRapidTradesDemo}
            disabled={isLoading || connectionStatus !== 'authenticated'}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isLoading || connectionStatus !== 'authenticated'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            Run 10 Rapid Trades
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-3 rounded-lg text-center">
          {error}
        </div>
      )}

      {/* Gas Savings Comparison */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Gas Cost Comparison
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-600 mb-2">On-Chain Cost ({stats.totalTrades} trades)</div>
            <div className="h-8 bg-red-200 rounded relative overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${Math.min(stats.totalTrades * 10, 100)}%` }}
              />
            </div>
            <div className="text-sm text-red-600 mt-1 font-medium">
              ${stats.totalGasSaved.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-2">Yellow Network Cost</div>
            <div className="h-8 bg-green-200 rounded relative overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: stats.sessionActive ? '15%' : '0%' }}
              />
            </div>
            <div className="text-sm text-green-600 mt-1 font-medium">
              ${stats.sessionActive ? (stats.channelOpenCost + stats.channelCloseCost).toFixed(2) : '0.00'} (open + close only)
            </div>
          </div>
        </div>

        {stats.totalTrades > 0 && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Savings per trade:</span>
              <span className="font-medium text-green-600">
                ${((stats.totalGasSaved - (stats.channelOpenCost + stats.channelCloseCost)) / stats.totalTrades).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-gray-700">Break-even at:</span>
              <span className="font-medium text-blue-600">
                {Math.ceil((stats.channelOpenCost + stats.channelCloseCost) / GAS_PER_TRADE_ONCHAIN)} trades
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-gray-700 font-medium">Total net savings:</span>
              <span className="font-bold text-green-600 text-lg">
                ${Math.max(0, stats.totalGasSaved - stats.channelOpenCost - stats.channelCloseCost).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connection Log */}
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
          Connection Log
        </h3>
        <div className="h-32 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500">No activity yet. Connect to ClearNode to start.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-green-400 py-0.5">{log}</div>
            ))
          )}
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Recent Trades
          </h3>
        </div>
        <div className="divide-y divide-gray-200">
          {trades.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No trades yet. Connect and click "Execute Trade" to start.
            </div>
          ) : (
            trades.map(trade => (
              <div key={trade.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${
                    trade.status === 'confirmed' ? 'bg-green-500' :
                    trade.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <div className="font-medium text-gray-900">
                      {trade.from} → {trade.to}
                    </div>
                    <div className="text-sm text-gray-500">
                      {trade.timestamp.toLocaleTimeString()} | {trade.txId.slice(0, 10)}...
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900">
                    ${trade.amount}
                  </div>
                  <div className="text-sm text-green-600">
                    Gas: $0.00
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Technical Details */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          How It Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white rounded-lg p-4">
            <div className="font-medium text-blue-600 mb-2">1. Open Channel</div>
            <p className="text-gray-600">
              Create an ERC-7824 state channel (one on-chain tx: ~$7.50).
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="font-medium text-blue-600 mb-2">2. Trade Off-Chain</div>
            <p className="text-gray-600">
              Execute unlimited trades instantly via ClearNode WebSocket.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="font-medium text-blue-600 mb-2">3. Close Channel</div>
            <p className="text-gray-600">
              Settle final balances on-chain (one tx: ~$7.50).
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <div className="font-medium text-blue-800 mb-1">Note for Testing</div>
          <p className="text-sm text-blue-700">
            Currently using simulated trades. For real trading, you need to deposit funds into a Yellow Network channel
            via <a href="https://apps.yellow.com" target="_blank" rel="noopener noreferrer" className="underline">apps.yellow.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;
