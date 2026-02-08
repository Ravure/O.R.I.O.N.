import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import ENSReader from './ENSReader'
import ENSWriter from './ENSWriter'
import PortfolioView from './PortfolioView'
import YieldOpportunities from './YieldOpportunities'
import BridgeControls from './BridgeControls'
import RiskProfileCard from './RiskProfileCard'

interface UnifiedDashboardProps {
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
  account: string | null
  ensName: string | null
}

export default function UnifiedDashboard({
  provider,
  signer,
  account,
  ensName,
}: UnifiedDashboardProps) {
  const [riskProfile, setRiskProfile] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Load risk profile when ENS name changes
  useEffect(() => {
    if (ensName && provider) {
      loadRiskProfile()
    }
  }, [ensName, provider])

  const loadRiskProfile = async () => {
    if (!ensName || !provider) return

    try {
      const resolver = await provider.getResolver(ensName)
      if (!resolver) return

      const [risk, slippage, freq, minApy] = await Promise.all([
        resolver.getText('risk_profile'),
        resolver.getText('max_slippage'),
        resolver.getText('rebalance_frequency'),
        resolver.getText('min_apy_threshold'),
      ])

      setRiskProfile({
        riskProfile: risk || 'Not set',
        maxSlippage: slippage || '0.5',
        rebalanceFrequency: freq || 'Not set',
        minApyThreshold: minApy || '5.0',
      })
    } catch (error) {
      console.error('Failed to load risk profile:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Risk Profile */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">ORION Dashboard</h2>
          {ensName && (
            <div className="text-sm text-gray-500">
              <span className="font-medium">ENS:</span> {ensName}
            </div>
          )}
        </div>

        {riskProfile && (
          <RiskProfileCard profile={riskProfile} />
        )}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Identity & Settings */}
        <div className="lg:col-span-1 space-y-6">
          <ENSWriter
            provider={provider}
            signer={signer}
            account={account}
            ensName={ensName}
          />
          <ENSReader provider={provider} />
        </div>

        {/* Middle Column: Portfolio & Opportunities */}
        <div className="lg:col-span-1 space-y-6">
          <PortfolioView
            portfolio={portfolio}
            loading={loading}
          />
          <YieldOpportunities
            opportunities={opportunities}
            riskProfile={riskProfile}
          />
        </div>

        {/* Right Column: Bridge & Actions */}
        <div className="lg:col-span-1 space-y-6">
          <BridgeControls
            provider={provider}
            signer={signer}
            account={account}
            riskProfile={riskProfile}
          />
        </div>
      </div>
    </div>
  )
}
