import { ArrowUpRight, ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_CHAIN_ID, shortAddress } from '@/lib/arc'

export interface SentPayment {
  hash: string
  to: string
  amount: string
  memo?: string
}

export function Activity({ items }: { items: SentPayment[] }) {
  return (
    <section className="glass-card rounded-3xl p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        Sent this session
      </h2>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          Confirmed payments will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.hash} className="glass-inner flex items-center justify-between rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <ArrowUpRight className="size-4" style={{ color: 'var(--ink)' }} />
                </div>
                <div>
                  <div className="mono text-xs" style={{ color: 'var(--ink)' }}>
                    {shortAddress(item.to)}
                  </div>
                  {item.memo && (
                    <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                      {item.memo}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="display text-sm font-semibold tabular-nums">-{item.amount} USDC</span>
                <a
                  href={buildTxExplorerUrl(ARC_CHAIN_ID, item.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View transaction on explorer"
                  className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                >
                  <ExternalLink className="size-4" style={{ color: 'var(--accent-hover)' }} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
