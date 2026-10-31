import { useMemo, useState } from 'react'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { decodeEventLog, isAddress } from 'viem'
import { ArrowLeft, Loader2, Target } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { useT } from '@/lib/i18n'
import { crowdfundAbi } from '@/lib/crowdfundAbi'
import { CAMPAIGN_KEY, CROWDFUND_ADDRESS, fetchCrowdfundEvents } from '@/lib/crowdfund'
import { CampaignView } from './CampaignView'

const DURATIONS = [7, 14, 30, 60, 90] as const
const TITLE_MAX = 80

function initialId(): bigint | null {
  const raw = new URLSearchParams(window.location.search).get(CAMPAIGN_KEY)
  return raw && /^\d{1,9}$/.test(raw) ? BigInt(raw) : null
}

function isRejection(error: unknown): boolean {
  const err = error as { code?: number; message?: string } | null
  const m = (err?.message ?? '').toLowerCase()
  return err?.code === 4001 || m.includes('user rejected') || m.includes('user denied')
}

export function FundCard() {
  const t = useT()
  const { address, isConnected, chainId } = useAccount()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const [viewId, setViewId] = useState<bigint | null>(initialId)
  const [lookup, setLookup] = useState('')
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [days, setDays] = useState<number>(30)
  const [beneficiary, setBeneficiary] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contract = CROWDFUND_ADDRESS
  const payout = beneficiary.trim() || address || ''
  const payoutValid = isAddress(payout)

  const goalParsed = useMemo(() => {
    if (!goal) return undefined
    try {
      const v = Amount.parse(goal, 6)
      return v.isPositive() ? v : undefined
    } catch {
      return undefined
    }
  }, [goal])

  const events = useQuery({
    queryKey: ['crowdfund-events', contract],
    queryFn: () => fetchCrowdfundEvents(contract as string),
    enabled: Boolean(contract),
    refetchInterval: 20000,
  })
  const myCampaigns = (events.data ?? []).flatMap((e) =>
    e.kind === 'created' && address && e.creator.toLowerCase() === address.toLowerCase() ? [e] : [],
  )

  if (!contract) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t('Fundraising is not live yet. It needs its smart contract to be deployed first.')}
          </p>
        </div>
      </section>
    )
  }

  const canCreate = isConnected && title.trim().length > 0 && title.trim().length <= TITLE_MAX && Boolean(goalParsed) && payoutValid && !creating

  const create = async () => {
    if (!canCreate || !goalParsed) return
    setCreating(true)
    setError(null)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86400)
      const hash = await writeContractAsync({
        address: contract,
        abi: crowdfundAbi,
        functionName: 'createCampaign',
        args: [title.trim(), payout, goalParsed.raw, deadline],
        chainId: ARC_CHAIN_ID,
      })
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID })
      if (receipt.status !== 'success') throw new Error('failed')
      let created: bigint | null = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: crowdfundAbi, topics: log.topics, data: log.data })
          if (decoded.eventName === 'CampaignCreated') created = (decoded.args as { id: bigint }).id
        } catch {
          /* not our event */
        }
      }
      toast.success(t('Campaign created'))
      setTitle('')
      setGoal('')
      void queryClient.invalidateQueries({ queryKey: ['crowdfund-events', contract] })
      if (created !== null) setViewId(created)
    } catch (e) {
      if (!isRejection(e)) setError('The campaign could not be created. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  if (viewId !== null) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <button
          type="button"
          onClick={() => setViewId(null)}
          className="mb-3 flex min-h-10 items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--accent-hover)' }}
        >
          <ArrowLeft className="size-4" /> {t('All campaigns')}
        </button>
        <CampaignView id={viewId} />
      </section>
    )
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {t('Raise USDC toward a goal. If the goal is not reached by the deadline, everyone gets their money back.')}
      </p>

      <label className="mb-1 mt-4 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="fund-title">
        {t('Campaign title')}
      </label>
      <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="fund-title"
          value={title}
          maxLength={TITLE_MAX}
          disabled={creating}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('e.g. Community garden fund')}
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="fund-goal">
            {t('Goal (USDC)')}
          </label>
          <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
            <input
              id="fund-goal"
              inputMode="decimal"
              value={goal}
              disabled={creating}
              onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setGoal(e.target.value)}
              placeholder="100"
              className="display w-full bg-transparent text-lg font-bold tabular-nums outline-none placeholder:text-slate-300"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="fund-days">
            {t('Duration')}
          </label>
          <select
            id="fund-days"
            value={days}
            disabled={creating}
            onChange={(e) => setDays(Number(e.target.value))}
            className="glass-inner min-h-[3.25rem] w-full rounded-2xl px-3 text-sm font-semibold outline-none"
            style={{ color: 'var(--ink)' }}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {t('{n} days', { n: d })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mb-1 mt-3 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="fund-payout">
        {t('Who receives the money if the goal is reached')}
      </label>
      <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="fund-payout"
          value={beneficiary || address || ''}
          disabled={creating}
          onChange={(e) => setBeneficiary(e.target.value)}
          placeholder={t('Wallet address (0x...)')}
          spellCheck={false}
          autoComplete="off"
          className="mono w-full bg-transparent text-xs outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>
      {payout && !payoutValid && (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{t('That is not a valid wallet address.')}</p>
      )}

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)]" style={{ background: 'var(--accent)' }}>
                {t('Connect Wallet')}
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : (
          <button
            disabled={!canCreate}
            onClick={() => void create()}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> {t('Creating campaign...')}</span>
            ) : (
              t('Create campaign')
            )}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>{t(error)}</p>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Your campaigns')}
      </h3>
      {myCampaigns.length === 0 ? (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--subtle)' }}>{t('No campaigns yet.')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {myCampaigns.map((c) => (
            <li key={c.id.toString()}>
              <button
                type="button"
                onClick={() => setViewId(c.id)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
              >
                <span className="truncate">{c.title}</span>
                <span className="ml-2 shrink-0 text-xs" style={{ color: 'var(--subtle)' }}>#{c.id.toString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mb-1 mt-5 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="fund-lookup">
        {t('Open a campaign by number')}
      </label>
      <div className="flex gap-2">
        <div className="field glass-inner flex-1 rounded-2xl px-4 py-3 transition-shadow">
          <input
            id="fund-lookup"
            inputMode="numeric"
            value={lookup}
            onChange={(e) => /^\d{0,9}$/.test(e.target.value) && setLookup(e.target.value)}
            placeholder="1"
            className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <button
          type="button"
          disabled={!lookup}
          onClick={() => setViewId(BigInt(lookup))}
          className="min-h-12 rounded-2xl px-5 text-sm font-semibold text-[color:var(--on-accent)] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {t('Open')}
        </button>
      </div>
    </section>
  )
}
