import { useState } from 'react'
import { ethers } from 'ethers'

interface ENSWriterProps {
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
  account: string | null
  ensName: string | null
}

export default function ENSWriter({
  provider,
  signer,
  account,
  ensName,
}: ENSWriterProps) {
  const [targetEnsName, setTargetEnsName] = useState('')
  const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('low')
  const [maxSlippage, setMaxSlippage] = useState('0.5')
  const [rebalanceFreq, setRebalanceFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [minApyThreshold, setMinApyThreshold] = useState('5.0')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Use connected ENS name if available
  const displayEnsName = ensName || targetEnsName

  const writeENS = async () => {
    if (!signer || !provider) {
      setError('Please connect your wallet first')
      return
    }

    const ensNameToUse = ensName || targetEnsName.trim()
    if (!ensNameToUse) {
      setError('Please enter an ENS name or connect with an ENS-enabled wallet')
      return
    }

    // Verify the signer owns this ENS name
    try {
      const address = await provider.resolveName(ensNameToUse)
      const signerAddress = await signer.getAddress()
      
      if (address?.toLowerCase() !== signerAddress.toLowerCase()) {
        setError(`You don't own ${ensNameToUse}. Please connect the wallet that owns this ENS name.`)
        return
      }
    } catch (err) {
      setError('Failed to verify ENS ownership')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)
    setTxHash(null)

    try {
      // Get resolver
      const resolver = await provider.getResolver(ensNameToUse)
      if (!resolver) {
        throw new Error(`No resolver found for ${ensNameToUse}`)
      }

      // Get namehash for the ENS name
      const namehash = ethers.namehash(ensNameToUse)

      // Get resolver address from ENS registry
      // Sepolia ENS Registry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e (same as mainnet)
      const ensRegistryAddress = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
      const ensRegistryABI = [
        'function resolver(bytes32 node) external view returns (address)'
      ]
      
      const registry = new ethers.Contract(ensRegistryAddress, ensRegistryABI, provider)
      const resolverAddress = await registry.resolver(namehash)
      
      if (!resolverAddress || resolverAddress === ethers.ZeroAddress) {
        throw new Error('No resolver address found for this ENS name')
      }
      
      // PublicResolver ABI for setText function
      const resolverABI = [
        'function setText(bytes32 node, string calldata key, string calldata value) external'
      ]

      // Create contract instance
      const resolverContract = new ethers.Contract(
        resolverAddress,
        resolverABI,
        signer
      )

      // Prepare transactions
      const txs: Promise<ethers.TransactionResponse>[] = []

      // Set risk_profile
      txs.push(
        resolverContract.setText(namehash, 'risk_profile', riskProfile)
      )

      // Set max_slippage
      txs.push(
        resolverContract.setText(namehash, 'max_slippage', maxSlippage)
      )

      // Set rebalance_frequency
      txs.push(
        resolverContract.setText(namehash, 'rebalance_frequency', rebalanceFreq)
      )

      // Set min_apy_threshold
      txs.push(
        resolverContract.setText(namehash, 'min_apy_threshold', minApyThreshold)
      )

      // Execute all transactions
      const results = await Promise.all(txs)
      
      // Wait for first transaction to confirm (we'll use its hash)
      const receipt = await results[0].wait()
      setTxHash(receipt?.hash || null)

      setSuccess(true)
      
      // Reset form after 3 seconds
      setTimeout(() => {
        setSuccess(false)
      }, 5000)
    } catch (err: any) {
      console.error('Error writing ENS:', err)
      setError(err.message || 'Failed to write ENS records')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">✍️ Write ENS Profile</h2>
      
      <div className="space-y-4">
        {!ensName && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ENS Name (you must own this)
            </label>
            <input
              type="text"
              value={targetEnsName}
              onChange={(e) => setTargetEnsName(e.target.value)}
              placeholder="yourname.eth"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {ensName && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-medium">Writing to:</span> {ensName}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Risk Profile
          </label>
          <select
            value={riskProfile}
            onChange={(e) => setRiskProfile(e.target.value as 'low' | 'medium' | 'high')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="low">Low (Conservative)</option>
            <option value="medium">Medium (Balanced)</option>
            <option value="high">High (Aggressive)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Slippage (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={maxSlippage}
            onChange={(e) => setMaxSlippage(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rebalance Frequency
          </label>
          <select
            value={rebalanceFreq}
            onChange={(e) => setRebalanceFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min APY Threshold (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="20"
            value={minApyThreshold}
            onChange={(e) => setMinApyThreshold(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          onClick={writeENS}
          disabled={loading || !signer}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Writing to ENS...' : 'Write to ENS'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            <p className="font-semibold">✅ Successfully wrote to ENS!</p>
            {txHash && (
              <p className="text-sm mt-1">
                Transaction:{' '}
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View on Etherscan
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
