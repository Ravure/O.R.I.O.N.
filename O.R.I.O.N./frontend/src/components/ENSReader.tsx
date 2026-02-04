import { useState } from 'react'
import { ethers } from 'ethers'

interface ENSReaderProps {
  provider: ethers.BrowserProvider | null
}

export default function ENSReader({ provider }: ENSReaderProps) {
  const [ensName, setEnsName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    address: string | null
    riskProfile: string | null
    profile: any
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readENS = async () => {
    if (!provider) {
      setError('Please connect your wallet first')
      return
    }

    if (!ensName.trim()) {
      setError('Please enter an ENS name')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Resolve ENS name to address
      const address = await provider.resolveName(ensName)
      if (!address) {
        throw new Error(`Could not resolve ${ensName}`)
      }

      // Get resolver
      const resolver = await provider.getResolver(ensName)
      if (!resolver) {
        throw new Error(`No resolver found for ${ensName}`)
      }

      // Read risk profile
      const riskProfile = await resolver.getText('risk_profile')

      // Read other fields
      const [maxSlippage, rebalanceFreq, minApyThreshold] = await Promise.all([
        resolver.getText('max_slippage'),
        resolver.getText('rebalance_frequency'),
        resolver.getText('min_apy_threshold'),
      ])

      setResult({
        address,
        riskProfile: riskProfile || null,
        profile: {
          maxSlippage: maxSlippage || 'Not set',
          rebalanceFreq: rebalanceFreq || 'Not set',
          minApyThreshold: minApyThreshold || 'Not set',
        },
      })
    } catch (err: any) {
      setError(err.message || 'Failed to read ENS data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">📖 Read ENS Profile</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ENS Name
          </label>
          <input
            type="text"
            value={ensName}
            onChange={(e) => setEnsName(e.target.value)}
            placeholder="vitalik.eth"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && readENS()}
          />
        </div>

        <button
          onClick={readENS}
          disabled={loading || !provider}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Reading...' : 'Read ENS Data'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-green-900">✅ Results:</h3>
            <div className="text-sm space-y-1">
              <p>
                <span className="font-medium">Address:</span>{' '}
                <span className="font-mono">{result.address}</span>
              </p>
              <p>
                <span className="font-medium">Risk Profile:</span>{' '}
                {result.riskProfile || 'Not set'}
              </p>
              <p>
                <span className="font-medium">Max Slippage:</span>{' '}
                {result.profile.maxSlippage}
              </p>
              <p>
                <span className="font-medium">Rebalance Frequency:</span>{' '}
                {result.profile.rebalanceFreq}
              </p>
              <p>
                <span className="font-medium">Min APY Threshold:</span>{' '}
                {result.profile.minApyThreshold}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
