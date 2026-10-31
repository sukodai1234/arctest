import type { TFunction } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n'
import { useAccount } from 'wagmi'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, Repeat } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, shortAddress } from '@/lib/arc'
import { useTransferHistory, type HistoryItem } from '@/hooks/useTransferHistory'

export interface SentPayment {
  hash: string
  to: string
  amount: string
  memo?: string
}

const HISTORY_LIMIT = 5

function timeAgo(ms: number, t: TFunction, locale: string): string {
  if (!ms) return ''
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diff = (ms - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return t('just now')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function Row({ item }: { item: HistoryItem }) {
  const { t, locale } = useI18n()
  const amount = Amount.fromRaw(item.raw, item.decimals).toFixed(2)
  const isOut = item.direction === 'out'
  const Icon = item.direction === 'self' ? Repeat : isOut ? ArrowUpRight : ArrowDownLeft
  const counterparty = isOut ? item.to : item.from
  const sign = item.direction === 'self' ? '' : isOut ? '-' : '+'
  const title = item.direction === 'self' ? t('To yourself') : isOut ? t('Sent to') : t('Received from')

  return (
    <li className="glass-inner flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
          <Icon className="size-4" style={{ color: 'var(--ink)' }} />
        </div>
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>
            {title} · {timeAgo(item.timestamp, t, locale)}
          </div>
          <div className="mono truncate text-xs" style={{ color: 'var(--ink)' }}>
            {shortAddress(counterparty)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span
          className="display text-sm font-semibold tabular-nums"
          style={{ color: item.direction === 'in' ? 'var(--success)' : 'var(--ink)' }}
        >
          {sign}
          {amount} USDC
        </span>
        <a
          href={buildTxExplorerUrl(ARC_CHAIN_ID, item.hash)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('View transaction on explorer')}
          className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--hover)]"
        >
          <ExternalLink className="size-4" style={{ color: 'var(--accent-hover)' }} />
        </a>
      </div>
    </li>
  )
}

export function Activity() {
  const { t } = useI18n()
  const { isConnected } = useAccount()
  const { data, isLoading, isError, refetch } = useTransferHistory()
  const items = (data?.pages[0]?.items ?? []).slice(0, HISTORY_LIMIT)

  return (
    <section className="glass-card rounded-3xl p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Latest 5 transactions')}
      </h2>

      {!isConnected ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('Connect your wallet to see your USDC history.')}
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--subtle)' }}>
          <Loader2 className="size-4 animate-spin" /> {t('Loading history...')}
        </div>
      ) : isError ? (
        <div className="py-4 text-center">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {t('Could not load history from the explorer.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 min-h-11 rounded-xl px-4 text-sm font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
          >
            {t('Try again')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('No USDC transfers yet for this wallet.')}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
