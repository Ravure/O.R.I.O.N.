import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import ENSWriter from './components/ENSWriter'
import ENSReader from './components/ENSReader'
import WalletConnection from './components/WalletConnection'
import TradingDashboard from './components/TradingDashboard'
import './App.css'

type TabType = 'identity' | 'trading';

function App() {
    const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
    const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)
    const [account, setAccount] = useState<string | null>(null)
    const [ensName, setEnsName] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabType>('identity')

    // Connect wallet on mount if already connected
    useEffect(() => {
        checkWalletConnection()
    }, [])

    const checkWalletConnection = async () => {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' })
                if (accounts && accounts.length > 0) {
                    await connectWallet()
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error)
            }
        }
    }

    const connectWallet = async () => {
        if (typeof window.ethereum === 'undefined') {
            alert('Please install MetaMask!')
            return
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const accounts = await provider.send('eth_requestAccounts', [])
            const signer = await provider.getSigner()
            const address = await signer.getAddress()

            // Try to resolve reverse ENS
            try {
                const name = await provider.lookupAddress(address)
                setEnsName(name)
            } catch (error) {
                console.log('No reverse ENS record found')
            }

            setProvider(provider)
            setSigner(signer)
            setAccount(address)
        } catch (error) {
            console.error('Error connecting wallet:', error)
            alert('Failed to connect wallet')
        }
    }

    const disconnectWallet = () => {
        setProvider(null)
        setSigner(null)
        setAccount(null)
        setEnsName(null)
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="container mx-auto px-4 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">
                        🌌 ORION
                    </h1>
                    <p className="text-lg text-gray-600">
                        Optimized Risk & Intelligence On-chain Navigator
                    </p>
                </header>

                <div className="max-w-4xl mx-auto">
                    <WalletConnection
                        account={account}
                        ensName={ensName}
                        onConnect={connectWallet}
                        onDisconnect={disconnectWallet}
                    />

                    {/* Tab Navigation */}
                    <div className="flex justify-center mt-6 mb-8">
                        <div className="inline-flex rounded-lg bg-white shadow p-1">
                            <button
                                onClick={() => setActiveTab('identity')}
                                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                                    activeTab === 'identity'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Phase 1: Identity (ENS)
                            </button>
                            <button
                                onClick={() => setActiveTab('trading')}
                                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                                    activeTab === 'trading'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Phase 2: Trading (Yellow)
                            </button>
                        </div>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'identity' ? (
                        <div className="grid md:grid-cols-2 gap-6">
                            <ENSReader provider={provider} />
                            <ENSWriter
                                provider={provider}
                                signer={signer}
                                account={account}
                                ensName={ensName}
                            />
                        </div>
                    ) : (
                        <TradingDashboard />
                    )}
                </div>
            </div>
        </div>
    )
}

export default App
