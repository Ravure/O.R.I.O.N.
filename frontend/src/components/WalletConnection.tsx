import { ethers } from 'ethers'

interface WalletConnectionProps {
  account: string | null
  ensName: string | null
  onConnect: () => void
  onDisconnect: () => void
}

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider
  }
}

export default function WalletConnection({
  account,
  ensName,
  onConnect,
  onDisconnect,
}: WalletConnectionProps) {
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Wallet Connection</h2>
      
      {!account ? (
        <div>
          <p className="text-gray-600 mb-4">
            Connect your MetaMask wallet to get started
          </p>
          <button
            onClick={onConnect}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Connect MetaMask
          </button>
        </div>
      ) : (
        <div>
          <div className="space-y-2 mb-4">
            <div>
              <span className="text-sm text-gray-500">Address:</span>
              <p className="font-mono text-sm">{formatAddress(account)}</p>
            </div>
            {ensName && (
              <div>
                <span className="text-sm text-gray-500">ENS Name:</span>
                <p className="font-semibold">{ensName}</p>
              </div>
            )}
          </div>
          <button
            onClick={onDisconnect}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
