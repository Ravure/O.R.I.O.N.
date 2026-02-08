import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import WalletConnection from './components/WalletConnection'
import UnifiedDashboard from './components/UnifiedDashboard'
import './App.css'

function App() {
    const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
    const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)
    const [account, setAccount] = useState<string | null>(null)
    const [ensName, setEnsName] = useState<string | null>(null)

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
            await provider.send('eth_requestAccounts', [])
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

                <div className="max-w-7xl mx-auto">
                    <WalletConnection
                        account={account}
                        ensName={ensName}
                        onConnect={connectWallet}
                        onDisconnect={disconnectWallet}
                    />

                    {/* Unified Dashboard - All Phases Integrated */}
                    {account && (
                        <UnifiedDashboard
                            provider={provider}
                            signer={signer}
                            account={account}
                            ensName={ensName}
                        />
                    )}

                    {!account && (
                        <div className="mt-8 text-center text-gray-500">
                            <p>Please connect your wallet to view the ORION dashboard</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default App
