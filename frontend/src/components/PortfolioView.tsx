import { useState, useEffect } from 'react'

interface Position {
  chain: string
  protocol: string
  amount: number
  apy: number
  valueUSD: number
}

interface PortfolioViewProps {
  portfolio: Position[]
  loading: boolean
}

export default function PortfolioView({ portfolio, loading }: PortfolioViewProps) {
  const [totalValue, setTotalValue] = useState(0)
  const [weightedApy, setWeightedApy] = useState(0)

  useEffect(() => {
    if (portfolio.length > 0) {
      const total = portfolio.reduce((sum, pos) => sum + pos.valueUSD, 0)
      const weighted =
        portfolio.reduce((sum, pos) => sum + (pos.apy * pos.valueUSD), 0) / total
      setTotalValue(total)
      setWeightedApy(weighted)
    } else {
      setTotalValue(0)
      setWeightedApy(0)
    }
  }, [portfolio])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Portfolio</h3>
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Portfolio Overview</h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Value</div>
          <div className="text-2xl font-bold text-gray-900">
            ${totalValue.toLocaleString()}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Weighted APY</div>
          <div className="text-2xl font-bold text-green-700">
            {weightedApy.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Positions */}
      {portfolio.length > 0 ? (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-700">Positions</h4>
          {portfolio.map((pos, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {pos.protocol} on {pos.chain}
                </div>
                <div className="text-sm text-gray-500">
                  {pos.amount.toLocaleString()} USDC
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-green-600">{pos.apy}% APY</div>
                <div className="text-sm text-gray-500">
                  ${pos.valueUSD.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No positions yet</p>
          <p className="text-sm mt-2">
            Positions will appear here once you start trading
          </p>
        </div>
      )}
    </div>
  )
}
