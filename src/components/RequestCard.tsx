import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import QRCode from 'qrcode'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { getShareBase } from '@/lib/share'
import { parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'

export function RequestCard() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const [amount, setAmount] = useState('')
  const [base, setBase] = useState<string | undefined>()
  const [qr, setQr] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    void getShareBase().then((url) => {
      if (active) setBase(url)
    })
    return () => {
      active = false
    }
  }, [])

  const amountValid = useMemo(() => {
    if (!amount) return true
    try {
      return parseAmount(ARC_CHAIN_ID, amount).isPositive()
    } catch {
      return false
    }
  }, [amount])

  const link = useMemo(() => {
    if (!base || !address || !amountValid) return undefined
    const params = new URLSearchParams({ to: address })
    if (amount) params.set('amount', amount)
    return `${base}/?${params.toString()}`
  }, [base, address, amount, amountValid])

  useEffect(() => {
    let active = true
    if (!link) {
      void Promise.resolve().then(() => {
        if (active) setQr(undefined)
      })
      return () => {
        active = false
      }
    }
    void QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: '#122d45', light: '#ffffff' } }).then((url) => {
      if (active) setQr(url)
    })
    return () => {
      active = false
    }
  }, [link])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(t('Payment link copied'))
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      {!isConnected ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('Connect your wallet to create a payment link and QR code.')}
        </p>
      ) : (
        <>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="request-amount">
            {t('Amount (optional)')}
          </label>
          <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
            <div className="flex items-baseline gap-2">
              <input
                id="request-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
                }}
                placeholder={t('Any amount')}
                className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                style={{ color: 'var(--ink)' }}
              />
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
            </div>
          </div>
          {!amountValid && (
            <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
              {t('Enter an amount greater than zero.')}
            </p>
          )}

          <div className="mt-4 flex flex-col items-center gap-3">
            <div
              className="flex size-[240px] items-center justify-center overflow-hidden rounded-2xl bg-white p-2"
              style={{ border: '1px solid var(--border)' }}
            >
              {qr ? (
                <img src={qr} alt={t('QR code for the payment link')} className="size-full" />
              ) : (
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {base ? t('QR code unavailable') : t('Preparing link...')}
                </span>
              )}
            </div>
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              {t('Payer scans the code or opens the link, then confirms in their own wallet.')}
            </p>
          </div>

          <button
            type="button"
            disabled={!link}
            onClick={() => void copy()}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('Copied') : t('Copy payment link')}
          </button>
        </>
      )}
    </section>
  )
}
