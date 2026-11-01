import { useMemo, useState } from 'react'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Check, CircleDashed, ExternalLink, Loader2, Plus, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'
import { MAX_BATCH_ROWS, parseEntries, splitPasted, type BatchEntry } from '@/lib/batch'
import { useT } from '@/lib/i18n'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

const DEFAULT_ROWS = 5
let nextId = 1
const blankEntry = (): BatchEntry => ({ id: nextId++, to: '', amount: '' })
const blankEntries = (): BatchEntry[] => Array.from({ length: DEFAULT_ROWS }, blankEntry)

type RowState = 'pending' | 'wallet' | 'confirming' | 'done' | 'failed' | 'skipped'

interface RowStatus {
  state: RowState
  hash?: string
}

function isRejection(error: unknown): boolean {
  const err = error as { code?: number; message?: string } | null
  const message = (err?.message ?? '').toLowerCase()
  return err?.code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

export function BatchCard() {
  const t = useT()
  const { isConnected, chainId } = useAccount()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { amount: balance, refetch } = useUsdcBalance()

  const [entries, setEntries] = useState<BatchEntry[]>(blankEntries)
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({})
  const [running, setRunning] = useState(false)

  const { rows, errors } = useMemo(() => parseEntries(entries), [entries])
  const decimals = balance?.decimals ?? 6
  const total = useMemo(() => Amount.sum(rows.map((r) => r.amount), decimals), [rows, decimals])
  const insufficient = Boolean(balance && total.gt(balance))
  const valid = rows.length > 0 && errors.length === 0
  const started = Object.keys(statuses).length > 0
  const remaining = rows.filter((r) => statuses[r.line]?.state !== 'done')
  const allDone = started && remaining.length === 0

  const setRow = (line: number, next: RowStatus) => setStatuses((prev) => ({ ...prev, [line]: { ...prev[line], ...next } }))

  const run = async () => {
    if (!valid || running) return
    setRunning(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const queue = rows.filter((r) => statuses[r.line]?.state !== 'done')
      for (let i = 0; i < queue.length; i++) {
        const row = queue[i]
        setRow(row.line, { state: 'wallet', hash: undefined })
        try {
          const hash = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [row.to, row.amount.raw],
            chainId: ARC_CHAIN_ID,
          })
          setRow(row.line, { state: 'confirming', hash })
          const receipt = await waitForTransactionReceipt(config, { hash, chainId: ARC_CHAIN_ID })
          setRow(row.line, { state: receipt.status === 'success' ? 'done' : 'failed', hash })
        } catch (error) {
          if (isRejection(error)) {
            setRow(row.line, { state: 'failed' })
            for (const rest of queue.slice(i + 1)) setRow(rest.line, { state: 'skipped' })
            toast.error(t('Batch stopped. The remaining payments were not sent.'))
            return
          }
          setRow(row.line, { state: 'failed' })
        }
      }
    } catch (error) {
      if (!isRejection(error)) toast.error(t('Something went wrong. Please try again.'))
    } finally {
      setRunning(false)
      void refetch()
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    }
  }

  const locked = running || started
  const update = (id: number, patch: Partial<BatchEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const addRow = () => setEntries((prev) => (prev.length >= MAX_BATCH_ROWS ? prev : [...prev, blankEntry()]))
  const removeRow = (id: number) => setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)))
  const onPaste = (index: number, text: string) => {
    const pasted = splitPasted(text)
    if (pasted.length === 0 || (pasted.length === 1 && !pasted[0].amount)) return false
    setEntries((prev) => {
      const next = [...prev]
      pasted.forEach((p, i) => {
        const at = index + i
        if (at < next.length) next[at] = { ...next[at], ...p }
        else if (next.length < MAX_BATCH_ROWS) next.push({ id: nextId++, ...p })
      })
      return next
    })
    return true
  }

  const reset = () => {
    setStatuses({})
    setEntries(blankEntries())
  }

  let label = t('Send to {count} recipients', { count: rows.length })
  if (started && !allDone) label = t('Retry {count} unsent', { count: remaining.length })
  if (insufficient) label = t('Insufficient balance')

  return (
    <section className="glass-card rounded-3xl p-5">
      <p className="mb-2 text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {t('Recipients and amounts')}
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map((entry, index) => {
          const line = index + 1
          const st = statuses[line]?.state
          const hash = statuses[line]?.hash
          const error = errors.find((e) => e.line === line)
          return (
            <li key={entry.id}>
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-center text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                  {line}
                </span>
                <div className="field glass-inner min-w-0 flex-1 rounded-xl px-3 py-2 transition-shadow">
                  <input
                    value={entry.to}
                    disabled={locked}
                    onChange={(e) => update(entry.id, { to: e.target.value })}
                    onPaste={(e) => {
                      if (onPaste(index, e.clipboardData.getData('text'))) e.preventDefault()
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={t('Wallet address row {n}', { n: line })}
                    placeholder="0x..."
                    className="mono w-full bg-transparent text-xs outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
                <div className="field glass-inner w-24 shrink-0 rounded-xl px-3 py-2 transition-shadow">
                  <input
                    value={entry.amount}
                    disabled={locked}
                    onChange={(e) => update(entry.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={t('Amount row {n}', { n: line })}
                    placeholder="0.00"
                    className="w-full bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center">
                  {st === 'done' ? (
                    <Check className="size-4" style={{ color: 'var(--success)' }} />
                  ) : st === 'failed' ? (
                    <X className="size-4" style={{ color: 'var(--danger)' }} />
                  ) : st === 'wallet' || st === 'confirming' ? (
                    <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
                  ) : st === 'skipped' ? (
                    <CircleDashed className="size-4" style={{ color: 'var(--subtle)' }} />
                  ) : !locked && entries.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(entry.id)}
                      aria-label={t('Remove row {n}', { n: line })}
                      className="flex size-8 items-center justify-center rounded-lg hover:bg-[color:var(--hover)]"
                    >
                      <X className="size-3.5" style={{ color: 'var(--subtle)' }} />
                    </button>
                  ) : null}
                </span>
              </div>
              {(error || st === 'wallet' || st === 'confirming' || st === 'failed' || st === 'skipped' || hash) && (
                <p className="mt-1 flex items-center gap-2 pl-6 text-xs" style={{ color: error || st === 'failed' ? 'var(--danger)' : 'var(--subtle)' }}>
                  {error
                    ? t(error.reason)
                    : st === 'wallet'
                      ? t('Confirm in wallet...')
                      : st === 'confirming'
                        ? t('Confirming...')
                        : st === 'failed'
                          ? t('Failed')
                          : st === 'skipped'
                            ? t('Skipped')
                            : ''}
                  {hash && (
                    <a href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)} target="_blank" rel="noopener noreferrer" aria-label={t('View on explorer')} className="inline-flex items-center">
                      <ExternalLink className="size-3.5" style={{ color: 'var(--accent-hover)' }} />
                    </a>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {!locked && (
        <button
          type="button"
          onClick={addRow}
          disabled={entries.length >= MAX_BATCH_ROWS}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-semibold transition-colors hover:bg-[color:var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <Plus className="size-4" /> {t('Add row')}
        </button>
      )}
      <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('Paste lines like "address, amount" into the first box to fill the rows. Up to {max} recipients. Each payment is a separate wallet confirmation.', { max: MAX_BATCH_ROWS })}
      </p>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span style={{ color: 'var(--muted)' }}>{t('Total')}</span>
        <span className="display font-bold tabular-nums">{total.toFixed(2)} USDC</span>
      </div>

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--accent)' }}
              >
                {t('Connect Wallet')}
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : allDone ? (
          <button
            type="button"
            onClick={reset}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)]"
            style={{ background: 'var(--accent)' }}
          >
            {t('Done. Start a new batch')}
          </button>
        ) : (
          <button
            disabled={!valid || running || insufficient}
            onClick={() => void run()}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Sending batch...')}
              </span>
            ) : (
              label
            )}
          </button>
        )}
        {started && !running && !allDone && (
          <button type="button" onClick={reset} className="mt-2 min-h-11 w-full text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {t('Clear and start over')}
          </button>
        )}
      </div>
    </section>
  )
}
