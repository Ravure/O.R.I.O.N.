import { useState, useEffect } from 'react'

interface Opportunity {
  protocol: string
  chain: string
  apy: number
  tvl: number
  riskScore: number
}

interface YieldOpportunitiesProps {
  opportunities: Opportunity[]
  riskProfile: any
}

export default function YieldOpportunities({
  opportunities,
  riskProfile,
}: YieldOpportunitiesProps) {
  const [filtered, setFiltered] = useState<Opportunity[]>([])

  useEffect(() => {
    if (!riskProfile || !opportunities.length) {
      setFiltered([])
      return
    }

    const riskThreshold = getRiskThreshold(riskProfile.riskProfile)
    const minApy = parseFloat(riskProfile.minApyThreshold || '5.0')

    const filtered = opportunities
      .filter((opp) => opp.riskScore <= riskThreshold && opp.apy >= minApy)
      .sort((a, b) => b.apy - a.apy)

    setFiltered(filtered)
  }, [opportunities, riskProfile])

  const getRiskThreshold = (risk: string): number => {
    switch (risk?.toLowerCase()) {
      case 'low':
        return 3
      case 'medium':
        return 6
      case 'high':
        return 10
      default:
        return 5
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Yield Opportunities</h3>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((opp, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {opp.protocol} on {opp.chain}
                </div>
                <div className="text-sm text-gray-500">
                  TVL: ${(opp.tvl / 1000000).toFixed(1)}M | Risk: {opp.riskScore}/10
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  {opp.apy}%
                </div>
                <div className="text-xs text-gray-500">APY</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No opportunities found</p>
          <p className="text-sm mt-2">
            {riskProfile
              ? 'No opportunities match your risk profile'
              : 'Set your risk profile to see opportunities'}
          </p>
        </div>
      )}
    </div>
  )
}
