import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Check, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { useI18n } from '@/lib/i18n'
import {
  NOTE_MAX,
  invoiceQuery,
  invoiceStatus,
  loadInvoices,
  nextInvoiceId,
  saveInvoices,
  todayIso,
  type Invoice,
} from '@/lib/invoices'
import { useShareBase } from '@/hooks/useShareLink'
import { useTransferHistory } from '@/hooks/useTransferHistory'

// A payer who bridges in adds the bridge fee on top, so a small overpayment still counts.
const PAID_WINDOW = 250000n // 0.25 USDC (6 decimals)

export function InvoicesCard() {
  const { t, locale } = useI18n()
  const { address, isConnected } = useAccount()
  const base = useShareBase()
  const { data } = useTransferHistory()

  const [invoices, setInvoices] = useState<Invoice[]>(loadInvoices)
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Derive paid status: an incoming transfer of the exact amount after creation marks an invoice paid.
  const resolved = useMemo(() => {
    if (!address) return invoices
    const incoming = (data?.pages[0]?.items ?? []).filter((i) => i.direction === 'in')
    const used = new Set(invoices.flatMap((i) => (i.paidTx ? [i.paidTx] : [])))
    const paid = new Map<string, string>()
    const open = invoices
      .filter((i) => !i.paidTx && i.to.toLowerCase() === address.toLowerCase())
      .sort((x, y) => x.createdAt - y.createdAt)
    for (const inv of open) {
      const want = parseAmount(ARC_CHAIN_ID, inv.amount).raw
      const hit = incoming.find((tx) => tx.raw >= want && tx.raw <= want + PAID_WINDOW && tx.timestamp >= inv.createdAt && !used.has(tx.hash))
      if (!hit) continue
      used.add(hit.hash)
      paid.set(inv.id, hit.hash)
    }
    return paid.size === 0 ? invoices : invoices.map((i) => (paid.has(i.id) ? { ...i, paidTx: paid.get(i.id) } : i))
  }, [invoices, data, address])

  useEffect(() => {
    if (resolved !== invoices) saveInvoices(resolved)
  }, [resolved, invoices])

  const mine = useMemo(
    () => resolved.filter((i) => address && i.to.toLowerCase() === address.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt),
    [resolved, address],
  )

  const amountValid = useMemo(() => {
    if (!amount) return false
    try {
      return parseAmount(ARC_CHAIN_ID, amount).isPositive()
    } catch {
      return false
    }
  }, [amount])

  const create = () => {
    if (!address || !amountValid) return
    const normalized = parseAmount(ARC_CHAIN_ID, amount).toString()
    const inv: Invoice = {
      id: nextInvoiceId(resolved),
      to: address,
      amount: normalized,
      due,
      note: note.trim().slice(0, NOTE_MAX),
      createdAt: Date.now(),
    }
    const next = [...resolved, inv]
    saveInvoices(next)
    setInvoices(next)
    setAmount('')
    setDue('')
    setNote('')
    toast.success(t('Invoice {id} created', { id: inv.id }))
  }

  const remove = (id: string) => {
    const next = resolved.filter((i) => i.id !== id)
    saveInvoices(next)
    setInvoices(next)
  }

  const copy = async (inv: Invoice) => {
    if (!base) return
    try {
      await navigator.clipboard.writeText(`${base}/?${invoiceQuery(inv)}`)
      setCopiedId(inv.id)
      toast.success(t('Invoice link copied'))
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      toast.error(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { dateStyle: 'medium' })

  if (!isConnected) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('Connect your wallet to create invoices.')}
        </p>
      </section>
    )
  }

  const badge = {
    paid: { text: t('Paid'), color: 'var(--success)' },
    overdue: { text: t('Overdue'), color: 'var(--danger)' },
    unpaid: { text: t('Unpaid'), color: 'var(--muted)' },
  } as const

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="inv-amount">
            {t('Amount (USDC)')}
          </label>
          <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
            <input
              id="inv-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const v = e.target.value
                if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-slate-300"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="inv-due">
            {t('Due date (optional)')}
          </label>
          <div className="field glass-inner rounded-2xl px-3 py-3.5 transition-shadow">
            <input
              id="inv-due"
              type="date"
              min={todayIso()}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: 'var(--ink)', colorScheme: 'inherit' }}
            />
          </div>
        </div>
      </div>

      <label className="mb-1 mt-3 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="inv-note">
        {t('What is it for? (optional)')}
      </label>
      <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="inv-note"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('e.g. Website design, October')}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      <button
        type="button"
        disabled={!amountValid}
        onClick={create}
        className="mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {t('Create invoice')}
      </button>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Your invoices')}
      </h3>
      {mine.length === 0 ? (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('No invoices yet.')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((inv) => {
            const status = invoiceStatus(inv)
            return (
              <li key={inv.id} className="glass-inner rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    {inv.id}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: badge[status].color }}>
                    {badge[status].text}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="display text-lg font-bold tabular-nums">{inv.amount} USDC</span>
                  {inv.due && (
                    <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                      {t('Due {date}', { date: fmtDate(inv.due) })}
                    </span>
                  )}
                </div>
                {inv.note && (
                  <p className="mt-1 truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {inv.note}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={!base}
                    onClick={() => void copy(inv)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                  >
                    {copiedId === inv.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedId === inv.id ? t('Copied') : t('Copy link')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('Delete invoice {id}', { id: inv.id })}
                    onClick={() => remove(inv.id)}
                    className="flex size-11 items-center justify-center rounded-xl"
                    style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('An invoice shows as paid when a transfer of its amount (up to 0.25 USDC more, for bridge fees) arrives after it was created. Invoices are saved in this browser.')}
      </p>
    </section>
  )
}
