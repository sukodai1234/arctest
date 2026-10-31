import { useCallback, useState } from 'react'
import { Header } from '@/components/Header'
import { BalanceCard } from '@/components/BalanceCard'
import { SendCard } from '@/components/SendCard'
import { Activity, type SentPayment } from '@/components/Activity'

export default function App() {
  const [sent, setSent] = useState<SentPayment[]>([])

  const handleSent = useCallback((payment: SentPayment) => {
    setSent((prev) => [payment, ...prev])
  }, [])

  return (
    <div className="min-h-dvh px-4 py-6">
      <main className="mx-auto flex max-w-md flex-col gap-4 pb-20">
        <Header />
        <BalanceCard />
        <SendCard onSent={handleSent} />
        <Activity items={sent} />
        <p className="text-balance text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Running on Arc Testnet. Need test USDC? Use "Get test USDC" in the Arc Studio sidebar.
        </p>
      </main>
    </div>
  )
}
