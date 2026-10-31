import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

export const ARC_CHAIN_ID = arcTestnet.id

const usdcFact = getUsdc(ARC_CHAIN_ID)
if (!usdcFact) {
  throw new Error(`USDC is not registered for chain ${ARC_CHAIN_ID}`)
}

export const USDC_ADDRESS = usdcFact.address as `0x${string}`
export const ARC_CHAIN_NAME = requireChain(ARC_CHAIN_ID).name

export const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

export function parseOnchainError(error: unknown): string | null {
  const err = error as { message?: string; code?: number } | null
  const message = err?.message?.toLowerCase() ?? ''
  if (message.includes('user rejected') || err?.code === 4001) return null
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient balance. Add test USDC and try again.'
  }
  if (message.includes('reverted')) return 'The transfer was rejected by the network. Please try again.'
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network issue. Check your connection and retry.'
  }
  return 'Something went wrong. Please try again.'
}
