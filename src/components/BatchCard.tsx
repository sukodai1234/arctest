import { useMemo, useState } from 'react'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { Check, CircleDashed, ExternalLink, Loader2, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS, shortAddress } from '@/lib/arc'
import { MAX_BATCH_ROWS, parseBatch } from '@/lib/batch'
import { useT } from '@/lib/i18n'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

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

  const [text, setText] = useState('')
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({})
  const [running, setRunning] = useState(false)

  const { rows, errors } = useMemo(() => parseBatch(text), [text])
  const decimals = balance?.decimals ?? 6
  const total = useMemo(() => Amount.sum(rows.map((r) => r.amount), decimals), [rows, decimals])
  const insufficient = Boolean(balance && total.gt(balance))
  const valid = rows.length > 0 && errors.length === 0 && rows.length <= MAX_BATCH_ROWS
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

  const reset = () => {
    setStatuses({})
    setText('')
  }

  let label = t('Send to {count} recipients', { count: rows.length })
  if (started && !allDone) label = t('Retry {count} unsent', { count: remaining.length })
  if (insufficient) label = t('Insufficient balance')

  return (
    <section className="glass-card rounded-3xl p-5">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="batch-input">
        {t('Recipients and amounts')}
      </label>
      <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
        <textarea
          id="batch-input"
          value={text}
          disabled={running || started}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={t('One per line: address, amount')}
          className="mono w-full resize-none bg-transparent text-xs outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('Example line: address, 1.50. Up to {max} recipients. Each payment is a separate wallet confirmation.', { max: MAX_BATCH_ROWS })}
      </p>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 text-xs" style={{ color: 'var(--danger)' }}>
          {errors.slice(0, 5).map((e, i) => (
            <li key={`${e.line}-${i}`}>{e.line > 0 ? t('Line {line}: {reason}', { line: e.line, reason: t(e.reason) }) : t(e.reason)}</li>
          ))}
          {errors.length > 5 && <li>{t('And {count} more issues.', { count: errors.length - 5 })}</li>}
        </ul>
      )}

      {rows.length > 0 && (
        <>
          <ul className="mt-4 flex flex-col gap-1.5">
            {rows.map((r) => {
              const st = statuses[r.line]?.state ?? 'pending'
              const hash = statuses[r.line]?.hash
              return (
                <li key={r.line} className="glass-inner flex items-center justify-between gap-2 rounded-xl px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {st === 'done' ? (
                      <Check className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                    ) : st === 'failed' ? (
                      <X className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                    ) : st === 'wallet' || st === 'confirming' ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: 'var(--subtle)' }} />
                    ) : (
                      <CircleDashed className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
                    )}
                    <span className="mono truncate text-xs" style={{ color: 'var(--ink)' }}>
                      {shortAddress(r.to)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                      {st === 'wallet' ? t('Confirm in wallet...') : st === 'confirming' ? t('Confirming...') : st === 'failed' ? t('Failed') : st === 'skipped' ? t('Skipped') : ''}
                    </span>
                    <span className="display text-sm font-semibold tabular-nums">{r.amount.toFixed(2)}</span>
                    {hash && (
                      <a
                        href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('View on explorer')}
                        className="flex size-8 items-center justify-center"
                      >
                        <ExternalLink className="size-3.5" style={{ color: 'var(--accent-hover)' }} />
                      </a>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>{t('Total')}</span>
            <span className="display font-bold tabular-nums">{total.toFixed(2)} USDC</span>
          </div>
        </>
      )}

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
