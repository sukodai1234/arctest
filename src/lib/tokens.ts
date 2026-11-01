import { USDC_ADDRESS } from '@/lib/arc'

export type TokenId = 'USDC' | 'EURC' | 'CIRBTC' | 'WETH'

export interface ArcToken {
  id: TokenId
  symbol: string
  decimals: number
  address: `0x${string}`
}

const env = import.meta.env as Record<string, string | undefined>
const fromEnv = (value: string | undefined) => (value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as `0x${string}`) : undefined)

const optional: { id: TokenId; symbol: string; decimals: number; address: `0x${string}` | undefined }[] = [
  { id: 'EURC', symbol: 'EURC', decimals: 6, address: fromEnv(env.VITE_ARC_TESTNET_EURC_ADDRESS) },
  { id: 'CIRBTC', symbol: 'cirBTC', decimals: 8, address: fromEnv(env.VITE_ARC_TESTNET_CIRBTC_ADDRESS) },
  { id: 'WETH', symbol: 'WETH', decimals: 18, address: fromEnv(env.VITE_ARC_TESTNET_WETH_ADDRESS) },
]

/** Tokens the app can send and show on Arc Testnet. USDC is always first. A token is listed only when its address is configured. */
export const ARC_TOKENS: ArcToken[] = [
  { id: 'USDC', symbol: 'USDC', decimals: 6, address: USDC_ADDRESS },
  ...optional.flatMap((t) => (t.address ? [{ ...t, address: t.address }] : [])),
]

export const getArcToken = (id: TokenId): ArcToken => ARC_TOKENS.find((t) => t.id === id) ?? ARC_TOKENS[0]
