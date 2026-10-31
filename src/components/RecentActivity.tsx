import { useT } from '@/lib/i18n'
import { useAccount } from 'wagmi'
import { useTransferHistory } from '@/hooks/useTransferHistory'
import { Row } from './Activity'

const LIMIT = 5

/** Latest transfers for the connected wallet. Renders nothing when there is no history yet. */
export function RecentActivity() {
  const t = useT()
  const { isConnected } = useAccount()
  const { data } = useTransferHistory()
  const items = (data?.pages[0]?.items ?? []).slice(0, LIMIT)

  if (!isConnected || items.length === 0) return null

  return (
    <section className="glass-card rounded-3xl p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Recent activity')}
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </ul>
    </section>
  )
}
