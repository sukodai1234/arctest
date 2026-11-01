import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { Amount } from '@/onchain-money'

export type PayToken = 'USDC' | 'EURC' | 'CIRBTC'

export interface PayTokenInfo {
  id: PayToken
  symbol: string
  /** What the token represents, shown next to the symbol. */
  name: string
  decimals: number
  /** A small amount used to read the current exchange rate. */
  probe: string
}

/** Tokens Circle's swap service accepts on Arc. USDC is the dollar, EURC the euro, cirBTC bitcoin. */
export const PAY_TOKENS: PayTokenInfo[] = [
  { id: 'USDC', symbol: 'USDC', name: 'US dollar', decimals: 6, probe: '1' },
  { id: 'EURC', symbol: 'EURC', name: 'Euro', decimals: 6, probe: '1' },
  { id: 'CIRBTC', symbol: 'cirBTC', name: 'Bitcoin', decimals: 8, probe: '0.0001' },
]

export const getPayToken = (id: PayToken): PayTokenInfo => PAY_TOKENS.find((t) => t.id === id) ?? PAY_TOKENS[0]

export const PAY_SLIPPAGE_BPS = 100
/** Extra USDC asked from the swap on top of the price, so normal price movement cannot leave the payment short. */
const SAFETY_PERMILLE = 1012n

export interface PayQuote {
  token: PayToken
  /** USDC the merchant must receive, in base units. */
  neededRaw: bigint
  amountIn: Amount
  /** USDC the swap is expected to return (at least `neededRaw`). */
  expectedOut: Amount
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b

async function makeAdapter(provider: EIP1193Provider) {
  return createViemAdapterFromProvider({ provider })
}

/**
 * Works out how much of `token` has to be swapped so the wallet ends up with the USDC the merchant must receive.
 * The swap service only quotes "amount in", so a probe quote gives the rate and a second quote confirms the result.
 */
export async function quotePayment(provider: EIP1193Provider, token: PayToken, neededRaw: bigint): Promise<PayQuote> {
  const info = getPayToken(token)
  const { AppKit } = await import('@circle-fin/app-kit')
  const kit = new AppKit()
  const adapter = await makeAdapter(provider)

  const estimate = async (amountIn: string) => {
    const result = await kit.estimateSwap({
      from: { adapter, chain: 'Arc_Testnet' },
      tokenIn: token,
      tokenOut: 'USDC',
      amountIn,
      config: { slippageBps: PAY_SLIPPAGE_BPS },
    })
    // Keep at most 6 decimals, the precision of USDC.
    const [whole, fraction = ''] = result.estimatedOutput.amount.split('.')
    return Amount.parse(fraction ? `${whole}.${fraction.slice(0, 6)}` : whole, 6).raw
  }

  const target = ceilDiv(neededRaw * SAFETY_PERMILLE, 1000n)
  const probeIn = Amount.parse(info.probe, info.decimals).raw
  const probeOut = await estimate(info.probe)
  if (probeOut <= 0n) throw new Error('route')

  let inRaw = ceilDiv(target * probeIn * 102n, probeOut * 100n)
  let out = 0n
  for (let attempt = 0; attempt < 3; attempt += 1) {
    out = await estimate(Amount.fromRaw(inRaw, info.decimals).toString())
    if (out >= target) break
    if (out <= 0n) throw new Error('route')
    inRaw = ceilDiv(inRaw * target * 101n, out * 100n)
  }
  if (out < neededRaw) throw new Error('route')
  return { token, neededRaw, amountIn: Amount.fromRaw(inRaw, info.decimals), expectedOut: Amount.fromRaw(out, 6) }
}

/** Swaps into USDC. `stopLimit` makes the swap fail instead of returning less than the merchant must receive. */
export async function executePaymentSwap(provider: EIP1193Provider, quote: PayQuote) {
  const { AppKit } = await import('@circle-fin/app-kit')
  const adapter = await makeAdapter(provider)
  return new AppKit().swap({
    from: { adapter, chain: 'Arc_Testnet' },
    tokenIn: quote.token,
    tokenOut: 'USDC',
    amountIn: quote.amountIn.toString(),
    config: { slippageBps: PAY_SLIPPAGE_BPS, stopLimit: quote.neededRaw.toString() },
  })
}

/** Maps SDK failures to messages; returns null for a wallet rejection (the user chose to stop). */
export function paySwapError(error: unknown): string | null {
  const err = error as { message?: string; code?: number } | null
  const message = (err?.message ?? '').toLowerCase()
  if (message.includes('user rejected') || message.includes('user denied') || err?.code === 4001) return null
  if (message.includes('insufficient')) return 'Insufficient balance for this swap and its fees.'
  if (message.includes('route') || message.includes('unsupported')) return 'No swap route is available for this amount right now.'
  if (message.includes('stop') || message.includes('limit')) return 'The price moved too much. Please try again.'
  return 'The swap could not be completed. Please try again.'
}
