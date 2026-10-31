import { decodeEventLog, type Hex } from 'viem'
import { buildAddressExplorerUrl, requireChain } from '@/onchain-facts'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { crowdfundAbi } from '@/lib/crowdfundAbi'

/** Set after the contract is deployed (see README). Undefined means fundraising is not live yet. */
export const CROWDFUND_ADDRESS = (import.meta.env.VITE_CROWDFUND_ADDRESS as `0x${string}` | undefined) || undefined

export const CAMPAIGN_KEY = 'campaign'
export const MAX_LOG_PAGES = 10

export interface Campaign {
  creator: `0x${string}`
  beneficiary: `0x${string}`
  goal: bigint
  deadline: bigint
  raised: bigint
  title: string
  withdrawn: boolean
  cancelled: boolean
}

export type CampaignStatus = 'active' | 'funded' | 'ended' | 'cancelled' | 'paidOut'

const RECOVERY_SECONDS = 30n * 24n * 3600n

/** Mirrors the contract's rules so the UI can offer exactly the actions that will succeed. */
export function campaignState(c: Campaign, nowSec: bigint) {
  const goalReached = c.raised >= c.goal
  const open = !c.cancelled && !c.withdrawn && nowSec < c.deadline
  const canWithdraw = !c.cancelled && !c.withdrawn && goalReached && nowSec < c.deadline + RECOVERY_SECONDS
  const canRefund =
    !c.withdrawn &&
    (c.cancelled || (nowSec >= c.deadline && !goalReached) || nowSec >= c.deadline + RECOVERY_SECONDS)
  let status: CampaignStatus = 'active'
  if (c.withdrawn) status = 'paidOut'
  else if (c.cancelled) status = 'cancelled'
  else if (goalReached) status = 'funded'
  else if (nowSec >= c.deadline) status = 'ended'
  return { goalReached, open, canWithdraw, canRefund, status }
}

export type CampaignEvent =
  | { kind: 'created'; id: bigint; creator: string; title: string }
  | { kind: 'contributed'; id: bigint; contributor: string; amount: bigint; hash: string }
  | { kind: 'refunded'; id: bigint; contributor: string; amount: bigint; hash: string }

interface ExplorerLog {
  topics: (string | null)[]
  data: string
  transaction_hash: string
}

/** Reads the contract's recent logs from the chain explorer (newest first). Bounded to a fixed number of pages. */
export async function fetchCrowdfundEvents(address: string): Promise<CampaignEvent[]> {
  const base = requireChain(ARC_CHAIN_ID).explorerBase
  const events: CampaignEvent[] = []
  let next: Record<string, string | number> | null = null
  for (let page = 0; page < MAX_LOG_PAGES; page += 1) {
    const qs: string = next ? `?${new URLSearchParams(Object.entries(next).map(([k, v]) => [k, String(v)])).toString()}` : ''
    const res = await fetch(`${base}/api/v2/addresses/${address}/logs${qs}`)
    if (!res.ok) throw new Error(`explorer ${res.status}`)
    const json = (await res.json()) as { items: ExplorerLog[]; next_page_params: Record<string, string | number> | null }
    for (const log of json.items) {
      const topics = log.topics.filter((x): x is string => Boolean(x)) as Hex[]
      if (topics.length === 0) continue
      try {
        const decoded = decodeEventLog({ abi: crowdfundAbi, topics: topics as [Hex, ...Hex[]], data: log.data as Hex })
        const args = decoded.args as Record<string, unknown>
        if (decoded.eventName === 'CampaignCreated') {
          events.push({ kind: 'created', id: args.id as bigint, creator: args.creator as string, title: args.title as string })
        } else if (decoded.eventName === 'Contributed') {
          events.push({ kind: 'contributed', id: args.id as bigint, contributor: args.contributor as string, amount: args.amount as bigint, hash: log.transaction_hash })
        } else if (decoded.eventName === 'Refunded') {
          events.push({ kind: 'refunded', id: args.id as bigint, contributor: args.contributor as string, amount: args.amount as bigint, hash: log.transaction_hash })
        }
      } catch {
        /* a log from another event or contract: ignore */
      }
    }
    if (!json.next_page_params) break
    next = json.next_page_params
  }
  return events
}

export interface Contributor {
  address: string
  amount: bigint
}

/** Net contributions per address for one campaign, largest first. */
export function contributorsOf(events: CampaignEvent[], id: bigint): Contributor[] {
  const totals = new Map<string, bigint>()
  for (const e of events) {
    if (e.kind === 'created' || e.id !== id) continue
    const key = e.contributor.toLowerCase()
    totals.set(key, (totals.get(key) ?? 0n) + (e.kind === 'contributed' ? e.amount : -e.amount))
  }
  return [...totals.entries()]
    .filter(([, v]) => v > 0n)
    .map(([address, amount]) => ({ address, amount }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
}

export const crowdfundExplorerUrl = (address: string) => buildAddressExplorerUrl(ARC_CHAIN_ID, address)
