import { useState } from 'react'

interface RiskProfileCardProps {
  profile: {
    riskProfile: string
    maxSlippage: string
    rebalanceFrequency: string
    minApyThreshold: string
  }
}

export default function RiskProfileCard({ profile }: RiskProfileCardProps) {
  const getRiskColor = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case 'low':
        return 'bg-green-100 text-green-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'high':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Your Risk Profile
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-gray-600 mb-1">Risk Level</div>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(
              profile.riskProfile
            )}`}
          >
            {profile.riskProfile || 'Not set'}
          </span>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Max Slippage</div>
          <div className="text-lg font-semibold text-gray-900">
            {profile.maxSlippage}%
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Rebalance Frequency</div>
          <div className="text-lg font-semibold text-gray-900">
            {profile.rebalanceFrequency || 'Not set'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Min APY Threshold</div>
          <div className="text-lg font-semibold text-gray-900">
            {profile.minApyThreshold}%
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-blue-200">
        <p className="text-xs text-gray-600">
          💡 These settings are stored on-chain via ENS and are used by the
          Uniswap v4 Hook to protect your trades
        </p>
      </div>
    </div>
  )
}
