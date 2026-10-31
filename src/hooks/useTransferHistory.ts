import { useAccount } from 'wagmi'
import { useInfiniteQuery } from '@tanstack/react-query'
import { requireChain } from '@/onchain-facts'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'

export interface HistoryItem {
  key: string
  hash: string
  from: string
  to: string
  raw: bigint
  decimals: number
  timestamp: number
  direction: 'in' | 'out' | 'self'
}

interface ExplorerTransfer {
  transaction_hash: string
  log_index?: number | string
  from: { hash: string }
  to: { hash: string }
  total: { value: string | null; decimals: string | null }
  timestamp: string | null
}

interface ExplorerPage {
  items: ExplorerTransfer[]
  next_page_params: Record<string, string | number | null> | null
}

interface HistoryPage {
  items: HistoryItem[]
  next: Record<string, string | number | null> | null
}

const explorerApi = () => `${requireChain(ARC_CHAIN_ID).explorerBase}/api/v2`

async function fetchPage(
  address: string,
  cursor: Record<string, string | number | null> | null,
  signal: AbortSignal,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ type: 'ERC-20', token: USDC_ADDRESS })
  if (cursor) {
    for (const [k, v] of Object.entries(cursor)) {
      if (v !== null && v !== undefined) params.set(k, String(v))
    }
  }
  const res = await fetch(`${explorerApi()}/addresses/${address}/token-transfers?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Explorer responded with ${res.status}`)
  const page = (await res.json()) as ExplorerPage

  const me = address.toLowerCase()
  const items: HistoryItem[] = page.items
    .filter((t) => t.total.value !== null)
    .map((t) => {
      const from = t.from.hash
      const to = t.to.hash
      const outgoing = from.toLowerCase() === me
      const incoming = to.toLowerCase() === me
      return {
        key: `${t.transaction_hash}-${t.log_index ?? ''}-${from}-${to}`,
        hash: t.transaction_hash,
        from,
        to,
        raw: BigInt(t.total.value ?? '0'),
        decimals: Number(t.total.decimals ?? 6),
        timestamp: t.timestamp ? Date.parse(t.timestamp) : 0,
        direction: outgoing && incoming ? 'self' : outgoing ? 'out' : 'in',
      }
    })
  return { items, next: page.next_page_params }
}

export const HISTORY_KEY = 'usdc-history'

export function useTransferHistory(refetchMs = 15000) {
  const { address } = useAccount()
  return useInfiniteQuery({
    queryKey: [HISTORY_KEY, address],
    enabled: Boolean(address),
    initialPageParam: null as Record<string, string | number | null> | null,
    queryFn: ({ pageParam, signal }) => fetchPage(address as string, pageParam, signal),
    getNextPageParam: (last) => last.next,
    refetchInterval: refetchMs,
  })
}
