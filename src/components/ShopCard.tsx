import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowDownLeft, Check, Copy, Download, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { shortAddress } from '@/lib/arc'
import { useQrDataUrl, useShareBase } from '@/hooks/useShareLink'
import { useTransferHistory, type HistoryItem } from '@/hooks/useTransferHistory'

const NAME_KEY = 'arcpay-shop-name'
const MAX_NAME = 40

export function ShopCard() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const base = useShareBase()
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [copied, setCopied] = useState(false)

  const trimmed = name.trim()
  const link = useMemo(() => {
    if (!base || !address) return undefined
    const params = new URLSearchParams({ to: address })
    if (trimmed) params.set('shop', trimmed)
    return `${base}/?${params.toString()}`
  }, [base, address, trimmed])
  const qr = useQrDataUrl(link, 280)

  // Watch for payments that arrive while this panel is open.
  const { data } = useTransferHistory(5000)
  const baseline = useRef<Set<string> | null>(null)
  const [arrivals, setArrivals] = useState<HistoryItem[]>([])

  useEffect(() => {
    if (!data) return
    const incoming = data.pages[0]?.items ?? []
    if (baseline.current === null) {
      baseline.current = new Set(incoming.map((i) => i.key))
      return
    }
    const seen = baseline.current
    const fresh = incoming.filter((i) => !seen.has(i.key))
    if (fresh.length === 0) return
    for (const item of fresh) seen.add(item.key)
    const received = fresh.filter((i) => i.direction === 'in')
    if (received.length === 0) return
    setArrivals((prev) => [...received, ...prev])
    for (const item of received) {
      toast.success(t('Received {amount} USDC', { amount: Amount.fromRaw(item.raw, item.decimals).toFixed(2) }))
    }
  }, [data, t])

  const total = arrivals.reduce((sum, i) => sum + i.raw, 0n)
  const decimals = arrivals[0]?.decimals ?? 6

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(t('Shop link copied'))
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  if (!isConnected) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('Connect your wallet to open your shop payment page.')}
        </p>
      </section>
    )
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="shop-name">
        {t('Shop name')}
      </label>
      <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="shop-name"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => {
            setName(e.target.value)
            localStorage.setItem(NAME_KEY, e.target.value)
          }}
          placeholder={t('e.g. Corner Coffee')}
          className="w-full bg-transparent text-base font-medium outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      <div className="mt-4 flex flex-col items-center gap-2">
        <div className="text-center">
          <div className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            {trimmed || t('Pay with USDC')}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('Scan to pay. Customers choose the amount.')}
          </div>
        </div>
        <div
          className="flex size-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white p-2"
          style={{ border: '1px solid var(--border)' }}
        >
          {qr ? (
            <img src={qr} alt={t('Shop payment QR code')} className="size-full" />
          ) : (
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              {t('Preparing QR code...')}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!link}
          onClick={() => void copy()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t('Copied') : t('Copy link')}
        </button>
        {qr ? (
          <a
            href={qr}
            download={`${trimmed || 'shop'}-payment-qr.png`}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
          >
            <Download className="size-4" /> {t('Download QR')}
          </a>
        ) : (
          <span
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold opacity-40"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
          >
            <Download className="size-4" /> {t('Download QR')}
          </span>
        )}
      </div>

      <div className="glass-inner mt-4 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
            <Radio className="size-3.5" style={{ color: 'var(--success)' }} /> {t('Waiting for payments')}
          </span>
          <span className="display text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {Amount.fromRaw(total, decimals).toFixed(2)} USDC
          </span>
        </div>
        {arrivals.length === 0 ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            {t('Payments sent to your shop while this panel is open appear here as soon as they are confirmed.')}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {arrivals.map((item) => (
              <li key={item.key} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
                <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-2)' }}>
                  <ArrowDownLeft className="size-4" style={{ color: 'var(--success)' }} />
                  <span className="mono">{shortAddress(item.from)}</span>
                </span>
                <span className="display text-sm font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                  +{Amount.fromRaw(item.raw, item.decimals).toFixed(2)} USDC
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
