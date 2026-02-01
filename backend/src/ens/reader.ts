import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * User profile interface matching the PRD schema
 */
export interface UserProfile {
  ensName: string;
  address: string | null;
  riskProfile: 'low' | 'medium' | 'high' | null;
  maxSlippage: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly' | null;
  minApyThreshold: number;
  excludedProtocols: string[];
  maxChainExposure: number;
}

/**
 * Resolves an ENS name to an Ethereum address
 * @param ensName - The ENS name to resolve (e.g., "vitalik.eth")
 * @param provider - Ethers provider instance
 * @returns The resolved address or null if not found
 */
export async function resolveENSName(
  ensName: string,
  provider: ethers.Provider
): Promise<string | null> {
  try {
    const address = await provider.resolveName(ensName);
    return address;
  } catch (error) {
    console.error(`Failed to resolve ENS name ${ensName}:`, error);
    return null;
  }
}

/**
 * Reads a text record from ENS
 * @param ensName - The ENS name
 * @param key - The text record key (e.g., "risk_profile")
 * @param provider - Ethers provider instance
 * @returns The text record value or null if not found
 */
export async function readENSTextRecord(
  ensName: string,
  key: string,
  provider: ethers.Provider
): Promise<string | null> {
  try {
    const resolver = await provider.getResolver(ensName);
    if (!resolver) {
      console.warn(`No resolver found for ${ensName}`);
      return null;
    }

    const value = await resolver.getText(key);
    return value || null;
  } catch (error) {
    console.error(`Failed to read text record ${key} for ${ensName}:`, error);
    return null;
  }
}

/**
 * Reads the complete user profile from ENS text records
 * @param ensName - The ENS name to read
 * @param provider - Ethers provider instance
 * @returns UserProfile object or null if ENS name doesn't exist
 */
export async function getUserProfile(
  ensName: string,
  provider: ethers.Provider
): Promise<UserProfile | null> {
  try {
    // Resolve ENS name to address
    const address = await resolveENSName(ensName, provider);
    if (!address) {
      console.warn(`ENS name ${ensName} does not resolve to an address`);
      return null;
    }

    // Get resolver
    const resolver = await provider.getResolver(ensName);
    if (!resolver) {
      console.warn(`No resolver configured for ${ensName}`);
      return null;
    }

    // Read all configuration keys in parallel
    const [
      riskProfile,
      maxSlippage,
      rebalanceFreq,
      minApyThreshold,
      excludedProtocols,
      maxChainExposure,
    ] = await Promise.all([
      resolver.getText('risk_profile'),
      resolver.getText('max_slippage'),
      resolver.getText('rebalance_frequency'),
      resolver.getText('min_apy_threshold'),
      resolver.getText('excluded_protocols'),
      resolver.getText('max_chain_exposure'),
    ]);

    // Parse and return profile
    return {
      ensName,
      address,
      riskProfile: (riskProfile as 'low' | 'medium' | 'high') || null,
      maxSlippage: maxSlippage ? parseFloat(maxSlippage) : 0.5,
      rebalanceFrequency:
        (rebalanceFreq as 'daily' | 'weekly' | 'monthly') || null,
      minApyThreshold: minApyThreshold ? parseFloat(minApyThreshold) : 5.0,
      excludedProtocols: excludedProtocols
        ? excludedProtocols.split(',').map((p) => p.trim())
        : [],
      maxChainExposure: maxChainExposure ? parseFloat(maxChainExposure) : 0.5,
    };
  } catch (error) {
    console.error(`Failed to get user profile for ${ensName}:`, error);
    return null;
  }
}

/**
 * Reads the risk profile specifically (simplified function for quick access)
 * @param ensName - The ENS name
 * @param provider - Ethers provider instance
 * @returns The risk profile string or null
 */
export async function readRiskProfile(
  ensName: string,
  provider: ethers.Provider
): Promise<string | null> {
  return await readENSTextRecord(ensName, 'risk_profile', provider);
}

/**
 * Validates if a user profile has all required fields set
 * @param profile - The user profile to validate
 * @returns Object with validation status and missing fields
 */
export function validateUserProfile(profile: UserProfile): {
  isValid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (!profile.riskProfile) missingFields.push('risk_profile');
  if (!profile.rebalanceFrequency) missingFields.push('rebalance_frequency');

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
