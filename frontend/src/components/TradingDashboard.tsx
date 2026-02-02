import React, { useState, useEffect } from 'react';

interface Trade {
  id: number;
  from: string;
  to: string;
  amount: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  gasSaved: number;
}

interface TradingStats {
  totalTrades: number;
  totalVolume: number;
  totalGasSaved: number;
  isConnected: boolean;
  sessionActive: boolean;
}

/**
 * Yellow Network Trading Dashboard
 * Shows real-time trading activity and gas savings
 */
export const TradingDashboard: React.FC = () => {
  const [stats, setStats] = useState<TradingStats>({
    totalTrades: 0,
    totalVolume: 0,
    totalGasSaved: 0,
    isConnected: false,
    sessionActive: false,
  });

  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulate connection status
  useEffect(() => {
    // In production, this would connect to the actual ClearNode WebSocket
    const timer = setTimeout(() => {
      setStats(prev => ({ ...prev, isConnected: true }));
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Demo function to simulate trades
  const simulateTrade = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate trade execution
      await new Promise(resolve => setTimeout(resolve, 100));

      const newTrade: Trade = {
        id: Date.now(),
        from: ['USDC', 'DAI', 'USDT'][Math.floor(Math.random() * 3)],
        to: ['DAI', 'USDC', 'USDT'][Math.floor(Math.random() * 3)],
        amount: (Math.random() * 500 + 50).toFixed(2),
        timestamp: new Date(),
        status: 'confirmed',
        gasSaved: 3.5, // Average gas cost saved
      };

      setTrades(prev => [newTrade, ...prev.slice(0, 9)]);
      setStats(prev => ({
        ...prev,
        totalTrades: prev.totalTrades + 1,
        totalVolume: prev.totalVolume + parseFloat(newTrade.amount),
        totalGasSaved: prev.totalGasSaved + newTrade.gasSaved,
        sessionActive: true,
      }));
    } catch {
      setError('Trade failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Rapid trades demo
  const runRapidTradesDemo = async () => {
    setIsLoading(true);
    setError(null);

    for (let i = 0; i < 10; i++) {
      await simulateTrade();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setIsLoading(false);
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
      </div>

      {/* Connection Status */}
      <div className="flex items-center justify-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
          stats.isConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            stats.isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
          }`} />
          {stats.isConnected ? 'Connected to ClearNode' : 'Connecting...'}
        </div>

        {stats.sessionActive && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-800">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Session Active
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
          <div className="text-sm text-gray-500 uppercase tracking-wide">Gas Saved</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            ${(stats.totalGasSaved * 2.5).toFixed(2)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            vs on-chain trading
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={simulateTrade}
          disabled={isLoading || !stats.isConnected}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            isLoading || !stats.isConnected
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Processing...' : 'Execute Trade'}
        </button>

        <button
          onClick={runRapidTradesDemo}
          disabled={isLoading || !stats.isConnected}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            isLoading || !stats.isConnected
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          Run 10 Rapid Trades Demo
        </button>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-3 rounded-lg text-center">
          {error}
        </div>
      )}

      {/* Gas Savings Comparison */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Gas Savings Comparison
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-600 mb-2">On-Chain Cost</div>
            <div className="h-8 bg-red-200 rounded relative overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${Math.min(stats.totalTrades * 10, 100)}%` }}
              />
            </div>
            <div className="text-sm text-red-600 mt-1">
              ${(stats.totalTrades * 3.5 * 2.5).toFixed(2)} (if on-chain)
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-2">Yellow Network Cost</div>
            <div className="h-8 bg-green-200 rounded relative overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: '0%' }}
              />
            </div>
            <div className="text-sm text-green-600 mt-1">
              $0.00 (state channels)
            </div>
          </div>
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
              No trades yet. Click "Execute Trade" to start.
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
                      {trade.timestamp.toLocaleTimeString()}
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
            <div className="font-medium text-blue-600 mb-2">1. Open Session</div>
            <p className="text-gray-600">
              Create an ERC-7824 compliant state channel session with Yellow Network.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="font-medium text-blue-600 mb-2">2. Trade Off-Chain</div>
            <p className="text-gray-600">
              Execute unlimited trades instantly with zero gas fees.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="font-medium text-blue-600 mb-2">3. Settle On-Chain</div>
            <p className="text-gray-600">
              Final balances are settled on-chain when you close the session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;
