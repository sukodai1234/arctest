import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS, shortAddress } from '@/lib/arc'
import { useT } from '@/lib/i18n'
import { crowdfundAbi } from '@/lib/crowdfundAbi'
import {
  CROWDFUND_ADDRESS,
  campaignState,
  contributorsOf,
  crowdfundExplorerUrl,
  fetchCrowdfundEvents,
} from '@/lib/crowdfund'
import { useShareBase } from '@/hooks/useShareLink'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'

const DECIMALS = 6

function isRejection(error: unknown): boolean {
  const err = error as { code?: number; message?: string } | null
  const m = (err?.message ?? '').toLowerCase()
  return err?.code === 4001 || m.includes('user rejected') || m.includes('user denied')
}

function timeLeft(deadline: bigint, now: bigint, t: ReturnType<typeof useT>): string {
  const secs = Number(deadline - now)
  if (secs <= 0) return t('Ended')
  const days = Math.floor(secs / 86400)
  if (days >= 1) return t('{n} days left', { n: days })
  const hours = Math.floor(secs / 3600)
  if (hours >= 1) return t('{n} hours left', { n: hours })
  return t('{n} minutes left', { n: Math.max(1, Math.floor(secs / 60)) })
}

export function CampaignView({ id }: { id: bigint }) {
  const t = useT()
  const { address, isConnected, chainId } = useAccount()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { amount: balance, refetch: refetchBalance } = useUsdcBalance()
  const base = useShareBase()
  const contract = CROWDFUND_ADDRESS as `0x${string}`

  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 30000)
    return () => clearInterval(timer)
  }, [])

  const campaignRead = useReadContract({
    address: contract,
    abi: crowdfundAbi,
    functionName: 'getCampaign',
    args: [id],
    chainId: ARC_CHAIN_ID,
    query: { refetchInterval: 8000 },
  })
  const mineRead = useReadContract({
    address: contract,
    abi: crowdfundAbi,
    functionName: 'contributionOf',
    args: address ? [id, address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  })
  const allowanceRead = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contract] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address) },
  })
  const events = useQuery({
    queryKey: ['crowdfund-events', contract],
    queryFn: () => fetchCrowdfundEvents(contract),
    refetchInterval: 15000,
  })

  const campaign = campaignRead.data
  const exists = Boolean(campaign && campaign.creator !== '0x0000000000000000000000000000000000000000')
  const state = campaign ? campaignState(campaign, now) : undefined
  const mine = mineRead.data ?? 0n
  const contributors = useMemo(() => contributorsOf(events.data ?? [], id), [events.data, id])

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      const v = Amount.parse(amount, DECIMALS)
      return v.isPositive() ? v : undefined
    } catch {
      return undefined
    }
  }, [amount])
  const insufficient = Boolean(parsed && balance && parsed.gt(balance))

  const refreshAll = () => {
    void campaignRead.refetch()
    void mineRead.refetch()
    void allowanceRead.refetch()
    void refetchBalance()
    void queryClient.invalidateQueries({ queryKey: ['crowdfund-events', contract] })
  }

  const run = async (label: string, send: () => Promise<`0x${string}`>) => {
    setBusy(label)
    setError(null)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const hash = await send()
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID })
      if (receipt.status !== 'success') throw new Error('failed')
      return true
    } catch (e) {
      if (!isRejection(e)) setError('The transaction failed. Nothing was changed.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const contribute = async () => {
    if (!parsed || !address) return
    const allowance = allowanceRead.data ?? 0n
    if (allowance < parsed.raw) {
      const ok = await run('approve', () =>
        writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [contract, parsed.raw], chainId: ARC_CHAIN_ID }),
      )
      if (!ok) return
    }
    const ok = await run('contribute', () =>
      writeContractAsync({ address: contract, abi: crowdfundAbi, functionName: 'contribute', args: [id, parsed.raw], chainId: ARC_CHAIN_ID }),
    )
    if (ok) {
      setAmount('')
      toast.success(t('Thank you! Your contribution is in.'))
      refreshAll()
    }
  }

  const simple = async (fn: 'withdraw' | 'refund' | 'cancel', message: string) => {
    const ok = await run(fn, () => writeContractAsync({ address: contract, abi: crowdfundAbi, functionName: fn, args: [id], chainId: ARC_CHAIN_ID }))
    if (ok) {
      toast.success(t(message))
      refreshAll()
    }
  }

  const copyLink = async () => {
    if (!base) return
    try {
      await navigator.clipboard.writeText(`${base}/?campaign=${id.toString()}`)
      setCopied(true)
      toast.success(t('Campaign link copied'))
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  if (campaignRead.isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--subtle)' }}>
        <Loader2 className="size-4 animate-spin" /> {t('Loading campaign...')}
      </p>
    )
  }
  if (!campaign || !exists || !state) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: 'var(--subtle)' }}>
        {t('Campaign not found.')}
      </p>
    )
  }

  const pct = campaign.goal > 0n ? Math.min(100, Number((campaign.raised * 10000n) / campaign.goal) / 100) : 0
  const isCreator = Boolean(address && campaign.creator.toLowerCase() === address.toLowerCase())
  const statusText: Record<typeof state.status, string> = {
    active: t('Open'),
    funded: t('Goal reached'),
    ended: t('Goal not reached'),
    cancelled: t('Cancelled'),
    paidOut: t('Paid out'),
  }
  const statusColor = state.status === 'funded' || state.status === 'paidOut' ? 'var(--success)' : state.status === 'active' ? 'var(--accent-hover)' : 'var(--danger)'

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {campaign.title}
        </h3>
        <span className="shrink-0 text-xs font-semibold" style={{ color: statusColor }}>
          {statusText[state.status]}
        </span>
      </div>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: state.goalReached ? 'var(--success)' : 'var(--accent)' }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-sm tabular-nums">
        <span className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
          {Amount.fromRaw(campaign.raised, DECIMALS).toFixed(2)} <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </span>
        <span style={{ color: 'var(--muted)' }}>
          {t('of {goal} goal', { goal: Amount.fromRaw(campaign.goal, DECIMALS).toFixed(2) })} · {Math.floor(pct)}%
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
        {timeLeft(campaign.deadline, now, t)} · {t('Organizer {address}', { address: shortAddress(campaign.creator) })} · {t('Payout to {address}', { address: shortAddress(campaign.beneficiary) })}
      </p>

      {state.open && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor={`contribute-${id}`}>
            {t('Your contribution (USDC)')}
          </label>
          <div className="field glass-inner rounded-2xl p-3 transition-shadow">
            <input
              id={`contribute-${id}`}
              inputMode="decimal"
              value={amount}
              disabled={Boolean(busy)}
              onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setAmount(e.target.value)}
              placeholder="0.00"
              className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          <button
            disabled={!isConnected || !parsed || insufficient || Boolean(busy)}
            onClick={() => void contribute()}
            className="mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {busy === 'approve' ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> {t('Step 1 of 2: allow USDC...')}</span>
            ) : busy === 'contribute' ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> {t('Contributing...')}</span>
            ) : !isConnected ? (
              t('Connect your wallet to contribute')
            ) : insufficient ? (
              t('Insufficient balance')
            ) : (
              t('Contribute')
            )}
          </button>
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            {t('All or nothing: if the goal is not reached by the deadline, every contributor can take their USDC back.')}
          </p>
        </div>
      )}

      {mine > 0n && (
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
          {t('You contributed {amount} USDC', { amount: Amount.fromRaw(mine, DECIMALS).toFixed(2) })}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {state.canWithdraw && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void simple('withdraw', 'Funds released to the beneficiary')}
            className="min-h-11 rounded-xl text-sm font-semibold text-[color:var(--on-accent)] disabled:opacity-50"
            style={{ background: 'var(--success)' }}
          >
            {busy === 'withdraw' ? t('Releasing...') : t('Release funds to the beneficiary')}
          </button>
        )}
        {state.canRefund && mine > 0n && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void simple('refund', 'Refund sent to your wallet')}
            className="min-h-11 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          >
            {busy === 'refund' ? t('Refunding...') : t('Claim my refund')}
          </button>
        )}
        {isCreator && !campaign.withdrawn && !campaign.cancelled && (
          <button
            disabled={Boolean(busy)}
            onClick={() => void simple('cancel', 'Campaign cancelled')}
            className="min-h-11 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}
          >
            {busy === 'cancel' ? t('Cancelling...') : t('Cancel campaign (everyone can refund)')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(error)}
        </p>
      )}

      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Contributors ({count})', { count: contributors.length })}
      </h4>
      {events.isError ? (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>{t('Could not load history from the explorer.')}</p>
      ) : contributors.length === 0 ? (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--subtle)' }}>{t('No contributions yet. Be the first.')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {contributors.slice(0, 8).map((c) => (
            <li key={c.address} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--surface-muted)' }}>
              <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{shortAddress(c.address)}</span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{Amount.fromRaw(c.amount, DECIMALS).toFixed(2)} USDC</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!base}
          onClick={() => void copyLink()}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t('Copied') : t('Copy campaign link')}
        </button>
        <a
          href={crowdfundExplorerUrl(contract)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('View contract on explorer')}
          className="flex min-h-11 w-12 items-center justify-center rounded-xl"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  )
}
