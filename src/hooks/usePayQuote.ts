import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { paySwapError, quotePayment, type PayQuote, type PayToken } from '@/lib/payQuote'

/** Live quote for paying `neededRaw` USDC with another token. Refreshes every 20 seconds while mounted. */
export function usePayQuote(token: PayToken, neededRaw: bigint | undefined) {
  const { connector, address } = useAccount()
  const [state, setState] = useState<{ quote?: PayQuote; loading: boolean; error?: string }>({ loading: false })
  const [tick, setTick] = useState(0)
  const active = token !== 'USDC' && neededRaw !== undefined && neededRaw > 0n && Boolean(connector && address)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((n) => n + 1), 20000)
    return () => clearInterval(id)
  }, [active])

  useEffect(() => {
    if (!active || !connector || neededRaw === undefined) return
    let cancelled = false
    const run = async () => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }))
      try {
        const provider = (await connector.getProvider()) as EIP1193Provider
        const quote = await quotePayment(provider, token, neededRaw)
        if (!cancelled) setState({ quote, loading: false })
      } catch (e) {
        if (cancelled) return
        setState({ loading: false, error: paySwapError(e) ?? 'The swap could not be completed. Please try again.' })
      }
    }
    const timer = setTimeout(() => void run(), 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, connector, token, neededRaw, tick])

  // A stored quote only counts when it was made for the current token and amount.
  const quote = state.quote && state.quote.token === token && state.quote.neededRaw === neededRaw ? state.quote : undefined
  return { quote, loading: active && state.loading && !quote, refreshing: active && state.loading && Boolean(quote), error: active ? state.error : undefined, active }
}
