import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowDownLeft, Check, Copy, Download, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { Amount, parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID, shortAddress } from '@/lib/arc'
import { useQrDataUrl, useShareBase } from '@/hooks/useShareLink'
import { useFiatQuote } from '@/hooks/useFiatQuote'
import { FIAT_CURRENCIES, cleanFiatAmount, getFiat } from '@/lib/fx'
import { useTransferHistory, type HistoryItem } from '@/hooks/useTransferHistory'

const NAME_KEY = 'arcpay-shop-name'
const AMOUNT_KEY = 'arcpay-shop-amount'
const CURRENCY_KEY = 'arcpay-shop-currency'
const MAX_NAME = 40
const QUICK_AMOUNTS = ['1', '5', '10', '20']

export function ShopCard() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const base = useShareBase()
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [amountText, setAmountText] = useState(() => localStorage.getItem(AMOUNT_KEY) ?? '')
  const [currency, setCurrency] = useState(() => (getFiat(localStorage.getItem(CURRENCY_KEY) ?? '') ? (localStorage.getItem(CURRENCY_KEY) as string) : 'USD'))
  const [copied, setCopied] = useState(false)

  const trimmed = name.trim()
  const isUsd = currency === 'USD'
  const defaultAmount = useMemo(() => {
    if (!amountText.trim()) return { value: undefined, fiat: undefined, invalid: false }
    if (!isUsd) {
      const fiat = cleanFiatAmount(amountText, getFiat(currency)?.decimals ?? 2)
      return fiat ? { value: undefined, fiat, invalid: false } : { value: undefined, fiat: undefined, invalid: true }
    }
    try {
      const parsed = parseAmount(ARC_CHAIN_ID, amountText.trim())
      return parsed.isPositive() ? { value: parsed.toString(), fiat: undefined, invalid: false } : { value: undefined, fiat: undefined, invalid: true }
    } catch {
      return { value: undefined, fiat: undefined, invalid: true }
    }
  }, [amountText, isUsd, currency])
  const preview = useFiatQuote(isUsd ? undefined : currency, defaultAmount.fiat)
  const link = useMemo(() => {
    if (!base || !address || !trimmed || defaultAmount.invalid) return undefined
    const params = new URLSearchParams({ to: address, shop: trimmed })
    if (defaultAmount.value) params.set('amount', defaultAmount.value)
    if (defaultAmount.fiat) {
      params.set('cur', currency)
      params.set('fiat', defaultAmount.fiat)
    }
    return `${base}/?${params.toString()}`
  }, [base, address, trimmed, defaultAmount, currency])
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

  const changeAmount = (value: string) => {
    const clean = value.replace(/[^0-9.]/g, '')
    setAmountText(clean)
    localStorage.setItem(AMOUNT_KEY, clean)
  }

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
        {t('Shop name (required)')}
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
          required
          aria-required="true"
          className="w-full bg-transparent text-base font-medium outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      <label className="mb-1 mt-3 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="shop-amount">
        {t('Default price (optional)')}
      </label>
      <div className="field glass-inner flex items-center gap-2 rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="shop-amount"
          value={amountText}
          onChange={(e) => changeAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t('Leave empty so customers choose')}
          className="min-w-0 flex-1 bg-transparent text-base font-medium tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <select
          aria-label={t('Currency')}
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value)
            localStorage.setItem(CURRENCY_KEY, e.target.value)
          }}
          className="rounded-lg bg-transparent py-1 text-sm font-semibold outline-none"
          style={{ color: 'var(--ink-2)' }}
        >
          {FIAT_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code === 'USD' ? 'USDC ($)' : c.code}
            </option>
          ))}
        </select>
      </div>
      {!isUsd && (
        <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
          {preview.usdc && preview.rate
            ? t('Customers pay the USDC worth {amount} {currency} at the current rate, about {usdc} USDC now ({source}). You receive USDC.', {
                amount: Number(defaultAmount.fiat).toLocaleString(),
                currency,
                usdc: preview.usdc,
                source: t(preview.rate.source),
              })
            : t('Customers pay the USDC worth this price at the rate on the day they pay. You receive USDC.')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {(isUsd ? QUICK_AMOUNTS : []).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => changeAmount(q)}
            className="min-h-9 rounded-full px-3 text-xs font-semibold transition-colors hover:bg-[color:var(--hover)]"
            style={{
              background: amountText === q ? 'var(--accent)' : 'var(--surface-muted)',
              color: amountText === q ? 'var(--on-accent)' : 'var(--ink-2)',
            }}
          >
            ${q}
          </button>
        ))}
        {amountText && (
          <button type="button" onClick={() => changeAmount('')} className="min-h-9 rounded-full px-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {t('Clear')}
          </button>
        )}
      </div>
      {defaultAmount.invalid && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {t('Enter an amount greater than zero, with at most 6 decimals.')}
        </p>
      )}

      <div className="mt-4 flex flex-col items-center gap-2">
        <div className="text-center">
          <div className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            {trimmed || t('Your shop name')}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {defaultAmount.value
              ? t('Scan to pay {amount} USDC.', { amount: defaultAmount.value })
              : defaultAmount.fiat
                ? t('Scan to pay {amount} {currency}.', { amount: Number(defaultAmount.fiat).toLocaleString(), currency })
                : t('Scan to pay. Customers choose the amount.')}
          </div>
        </div>
        <div
          className="flex size-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white p-2"
          style={{ border: '1px solid var(--border)' }}
        >
          {qr ? (
            <img src={qr} alt={t('Shop payment QR code')} className="size-full" />
          ) : (
            <span className="px-6 text-center text-xs" style={{ color: 'var(--subtle)' }}>
              {!trimmed ? t('Enter your shop name to create the payment code.') : defaultAmount.invalid ? t('Fix the amount to create the payment code.') : t('Preparing QR code...')}
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
            download={`${trimmed.replace(/[^\w-]+/g, '-') || 'shop'}-payment-qr.png`}
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
