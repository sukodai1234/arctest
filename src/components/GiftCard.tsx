import { useMemo, useState } from 'react'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Check, Copy, Gift as GiftIcon, Loader2, Share2, Trash2 } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'
import { useI18n } from '@/lib/i18n'
import {
  GIFT_FEE_RESERVE,
  GIFT_MIN_AMOUNT,
  giftLink,
  loadGifts,
  newGift,
  readGiftBalance,
  saveGifts,
  sweepGift,
  type Gift,
} from '@/lib/gift'
import { useQrDataUrl, useShareBase } from '@/hooks/useShareLink'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

type GiftStatus = 'unclaimed' | 'claimed' | 'reclaimed' | 'unfunded'

function isRejection(error: unknown): boolean {
  const err = error as { code?: number; message?: string } | null
  const message = (err?.message ?? '').toLowerCase()
  return err?.code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

export function GiftCard() {
  const { t, locale } = useI18n()
  const { address, isConnected, chainId } = useAccount()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { amount: balance, refetch } = useUsdcBalance()
  const base = useShareBase()

  const [gifts, setGifts] = useState<Gift[]>(loadGifts)
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decimals = balance?.decimals ?? 6
  const reserve = Amount.parse(GIFT_FEE_RESERVE, decimals)
  const minimum = Amount.parse(GIFT_MIN_AMOUNT, decimals)

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      return Amount.parse(amount, decimals)
    } catch {
      return undefined
    }
  }, [amount, decimals])

  const total = parsed ? parsed.add(reserve) : undefined
  const tooSmall = Boolean(parsed && parsed.lt(minimum))
  const insufficient = Boolean(total && balance && total.gt(balance))
  const canCreate = Boolean(parsed) && !tooSmall && !insufficient && !creating && isConnected

  const mine = useMemo(
    () => gifts.filter((g) => address && g.from?.toLowerCase() === address.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt),
    [gifts, address],
  )

  const balances = useQueries({
    queries: mine.map((g) => ({
      queryKey: ['gift-balance', g.address],
      queryFn: () => readGiftBalance(g.address),
      refetchInterval: 10000,
    })),
  })

  const statusOf = (g: Gift, index: number): GiftStatus => {
    if (g.reclaimed) return 'reclaimed'
    const held = balances[index]?.data
    if (held !== undefined && held > 0n) return 'unclaimed'
    return g.txHash ? 'claimed' : 'unfunded'
  }

  const persist = (next: Gift[]) => {
    saveGifts(next)
    setGifts(next)
  }

  const create = async () => {
    if (!canCreate || !parsed || !total || !address) return
    setCreating(true)
    setError(null)
    const gift = newGift(parsed.toString(), address)
    // Save the key BEFORE sending funds, so a closed tab can never strand money.
    persist([...gifts, gift])
    let sent = false
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [gift.address, total.raw],
        chainId: ARC_CHAIN_ID,
      })
      sent = true
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID })
      if (receipt.status !== 'success') throw new Error('failed')
      persist(loadGifts().map((g) => (g.id === gift.id ? { ...g, txHash: hash } : g)))
      setHighlightId(gift.id)
      setAmount('')
      toast.success(t('Gift link ready'))
      void refetch()
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    } catch (e) {
      if (!sent) persist(loadGifts().filter((g) => g.id !== gift.id))
      if (!isRejection(e)) setError('The gift could not be created. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const linkOf = (g: Gift) => (base ? giftLink(base, g.key) : undefined)

  const copy = async (g: Gift) => {
    const link = linkOf(g)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(g.id)
      toast.success(t('Gift link copied'))
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      toast.error(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  const share = async (g: Gift) => {
    const link = linkOf(g)
    if (!link) return
    try {
      await navigator.share({ title: t('A gift for you'), text: t('You received {amount} USDC. Open the link to claim it.', { amount: g.amount }), url: link })
    } catch {
      /* dismissed or unsupported: the copy button remains */
    }
  }

  const reclaim = async (g: Gift) => {
    if (!address) return
    setBusyId(g.id)
    setError(null)
    try {
      await sweepGift(g.key, address)
      persist(loadGifts().map((x) => (x.id === g.id ? { ...x, reclaimed: true } : x)))
      toast.success(t('Gift reclaimed'))
      void refetch()
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    } catch (e) {
      const code = (e as { code?: string }).code
      setError(code === 'EMPTY' ? 'This gift was already claimed.' : 'The gift could not be reclaimed. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = (g: Gift) => persist(loadGifts().filter((x) => x.id !== g.id))

  const highlighted = highlightId ? mine.find((g) => g.id === highlightId) : undefined
  const highlightLink = highlighted && highlighted.txHash ? linkOf(highlighted) : undefined
  const qr = useQrDataUrl(highlightLink, 200)

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale, { dateStyle: 'medium' })
  const badge: Record<GiftStatus, { text: string; color: string }> = {
    unclaimed: { text: t('Unclaimed'), color: 'var(--accent-hover)' },
    claimed: { text: t('Claimed'), color: 'var(--success)' },
    reclaimed: { text: t('Reclaimed'), color: 'var(--muted)' },
    unfunded: { text: t('Not funded'), color: 'var(--danger)' },
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <GiftIcon className="size-5" style={{ color: 'var(--ink)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('Create a link that holds USDC. The first person to open it claims the gift, once.')}
        </p>
      </div>

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="gift-amount">
        {t('Gift amount (USDC)')}
      </label>
      <div className="field glass-inner rounded-2xl p-4 transition-shadow">
        <input
          id="gift-amount"
          inputMode="decimal"
          value={amount}
          disabled={creating}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>USDC</span>
          <span className="tabular-nums">{balance ? t('Balance: {amount}', { amount: balance.toFixed(2) }) : t('Balance unavailable')}</span>
        </div>
      </div>
      {tooSmall && (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {t('The minimum gift is {amount} USDC.', { amount: GIFT_MIN_AMOUNT })}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('You send the gift plus {fee} USDC for the claim network fee. Whatever is left of that fee goes to the person who claims.', { fee: GIFT_FEE_RESERVE })}
      </p>

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)]"
                style={{ background: 'var(--accent)' }}
              >
                {t('Connect Wallet')}
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : (
          <button
            disabled={!canCreate}
            onClick={() => void create()}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Creating gift...')}
              </span>
            ) : insufficient ? (
              t('Insufficient balance')
            ) : (
              t('Create gift link')
            )}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(error)}
        </p>
      )}

      {highlighted && highlightLink && (
        <div className="glass-inner mt-4 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-4" /> {t('Gift ready: {amount} USDC', { amount: highlighted.amount })}
          </div>
          <div className="mt-3 flex justify-center">
            {qr && <img src={qr} alt={t('QR code for the gift link')} className="size-[200px] rounded-xl bg-white p-2" />}
          </div>
          <p className="mono mt-3 break-all rounded-xl p-2 text-[11px]" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
            {highlightLink}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy(highlighted)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-[color:var(--on-accent)]"
              style={{ background: 'var(--accent)' }}
            >
              {copiedId === highlighted.id ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiedId === highlighted.id ? t('Copied') : t('Copy gift link')}
            </button>
            <button
              type="button"
              onClick={() => void share(highlighted)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
            >
              <Share2 className="size-4" /> {t('Share')}
            </button>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
            {t('Anyone who has this link can claim the gift. Send it privately and do not post it publicly.')}
          </p>
        </div>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Your gifts')}
      </h3>
      {mine.length === 0 ? (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('No gifts yet.')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((g, i) => {
            const status = statusOf(g, i)
            const busy = busyId === g.id
            return (
              <li key={g.id} className="glass-inner rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="display text-lg font-bold tabular-nums">{g.amount} USDC</span>
                  <span className="text-xs font-semibold" style={{ color: badge[status].color }}>
                    {badge[status].text}
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {fmtDate(g.createdAt)}
                </div>
                <div className="mt-2 flex gap-2">
                  {status === 'unclaimed' && (
                    <>
                      <button
                        type="button"
                        disabled={!base}
                        onClick={() => void copy(g)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                      >
                        {copiedId === g.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {copiedId === g.id ? t('Copied') : t('Copy gift link')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reclaim(g)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                        {busy ? t('Reclaiming...') : t('Reclaim')}
                      </button>
                    </>
                  )}
                  {status !== 'unclaimed' && (
                    <button
                      type="button"
                      aria-label={t('Remove from list')}
                      onClick={() => remove(g)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
                    >
                      <Trash2 className="size-4" /> {t('Remove from list')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('Gift links are saved in this browser so you can copy them again or reclaim an unclaimed gift.')}
      </p>
    </section>
  )
}
