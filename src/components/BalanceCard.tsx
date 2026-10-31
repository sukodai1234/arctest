import { useAccount } from 'wagmi'
import { Wallet } from 'lucide-react'
import { ARC_CHAIN_NAME } from '@/lib/arc'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'

export function BalanceCard() {
  const { isConnected } = useAccount()
  const { amount, isLoading } = useUsdcBalance()

  const display = !isConnected ? '--' : isLoading || !amount ? '...' : amount.toFixed(2)

  return (
    <section className="glass-card rounded-3xl p-6">
      <div className="mb-3 flex items-center gap-1.5">
        <div className="flex size-5 items-center justify-center rounded-md" style={{ background: 'rgba(18,45,69,0.08)' }}>
          <Wallet className="size-3" style={{ color: 'var(--ink)' }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
          Available balance
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {display}
        </span>
        <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>
          USDC
        </span>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        {isConnected ? `Live on ${ARC_CHAIN_NAME}` : 'Connect your wallet to see your live balance'}
      </p>
    </section>
  )
}
