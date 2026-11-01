import { useT } from '@/lib/i18n'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, FileText, Gift, ScanLine, Target, HandCoins, QrCode, Repeat2, Store, Users, Wallet, X } from 'lucide-react'
import { Header } from '@/components/Header'
import { BalanceCard } from '@/components/BalanceCard'
import { SendCard } from '@/components/SendCard'
import { Activity, type SentPayment } from '@/components/Activity'
import { NavMenu, type FeatureId, type NavItem } from '@/components/NavMenu'
import { FeaturePanel } from '@/components/FeaturePanel'
import { WalletCard } from '@/components/WalletCard'
import { TipCard } from '@/components/TipCard'
import { RequestCard } from '@/components/RequestCard'
import { ShopCard } from '@/components/ShopCard'
import { BridgeCard } from '@/components/BridgeCard'
import { BatchCard } from '@/components/BatchCard'
import { InvoicesCard } from '@/components/InvoicesCard'
import { SwapCard } from '@/components/SwapCard'
import { GiftCard } from '@/components/GiftCard'
import { FundCard } from '@/components/FundCard'
import { PayCard } from '@/components/PayCard'
import { PayFromNetwork } from '@/components/PayFromNetwork'
import { ClaimGift } from '@/components/ClaimGift'
import { isClaimRoute } from '@/lib/gift'
import { RecentActivity } from '@/components/RecentActivity'
import { AddNetworkButton } from '@/components/AddNetworkButton'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

const NAV_ITEMS: NavItem[] = [
  { id: 'pay', label: 'Pay', hint: 'Scan a QR code to pay', icon: <ScanLine className="size-4" /> },
  { id: 'wallet', label: 'Wallet', hint: 'Address and balances', icon: <Wallet className="size-4" /> },
  { id: 'tip', label: 'Tip', hint: 'Preset tip amounts', icon: <HandCoins className="size-4" /> },
  { id: 'request', label: 'Request payment', hint: 'Link and QR code', icon: <QrCode className="size-4" /> },
  { id: 'shop', label: 'Shop', hint: 'Store payment page', icon: <Store className="size-4" /> },
  { id: 'fund', label: 'Fundraiser', hint: 'Goal, deadline, refunds', icon: <Target className="size-4" /> },
  { id: 'gift', label: 'Gift', hint: 'One-time claim link', icon: <Gift className="size-4" /> },
  { id: 'invoices', label: 'Invoices', hint: 'Numbered, with due dates', icon: <FileText className="size-4" /> },
  { id: 'batch', label: 'Batch send', hint: 'Pay many people at once', icon: <Users className="size-4" /> },
  { id: 'swap', label: 'Swap', hint: 'USDC, EURC, cirBTC', icon: <Repeat2 className="size-4" /> },
  { id: 'bridge', label: 'Bridge', hint: 'Move USDC to other chains', icon: <ArrowLeftRight className="size-4" /> },
]

function initialFeature(): FeatureId | null {
  const params = new URLSearchParams(window.location.search)
  if (params.has('campaign')) return 'fund'
  return params.has('tipTo') ? 'tip' : null
}

export default function App() {
  if (isClaimRoute()) return <ClaimView />
  return <MainApp />
}

/** Focused page for someone opening a gift link. */
function ClaimView() {
  const t = useT()
  return (
    <div className="min-h-dvh px-5 py-5">
      <div className="mx-auto w-full max-w-md">
        <Header />
        <div className="mt-8 pb-20">
          <ClaimGift />
        </div>
        <p className="text-balance text-center text-xs" style={{ color: 'var(--subtle)' }}>
          {t('Running on Arc Testnet.')}
        </p>
      </div>
    </div>
  )
}

function MainApp() {
  const t = useT()
  const queryClient = useQueryClient()
  const [active, setActive] = useState<FeatureId | null>(initialFeature)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSent = useCallback(
    (_payment: SentPayment) => {
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    },
    [queryClient],
  )

  const select = (id: FeatureId) => {
    setActive((current) => (current === id ? null : id))
    setDrawerOpen(false)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDrawerOpen(false)
      setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeItem = NAV_ITEMS.find((i) => i.id === active)

  return (
    <div className="min-h-dvh px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[66rem]">
        <Header onMenu={() => setDrawerOpen(true)} />

        <div className="mt-8 grid gap-6 lg:grid-cols-[14rem_minmax(0,23rem)_minmax(0,25rem)] lg:justify-between lg:gap-8">
          {/* Tools menu: left column on desktop, drawer on mobile */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <NavMenu items={NAV_ITEMS} active={active} onSelect={select} />
            </div>
          </div>

          <AnimatePresence>
            {drawerOpen && (
              <>
                <motion.div
                  key="scrim"
                  className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDrawerOpen(false)}
                />
                <motion.div
                  key="drawer"
                  className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto p-4 lg:hidden"
                  style={{
                    background: 'var(--surface-pop)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    boxShadow: '12px 0 40px rgba(18,45,69,0.16)',
                  }}
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                      {t('Menu')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('Close menu')}
                      onClick={() => setDrawerOpen(false)}
                      className="flex size-11 items-center justify-center rounded-full hover:bg-[color:var(--hover)]"
                    >
                      <X className="size-5" style={{ color: 'var(--muted)' }} />
                    </button>
                  </div>
                  <NavMenu items={NAV_ITEMS} active={active} onSelect={select} />
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Arc Pay: always visible */}
          <main className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-4 pb-20 lg:mx-0 lg:max-w-none">
            <BalanceCard />
            <SendCard onSent={handleSent} />
            <InvoicePayOptions />
            <Activity />
          </main>

          {/* Selected tool: sheet on mobile, right column on desktop */}
          <div className="min-w-0 pb-20 lg:max-w-none">
            <AnimatePresence mode="wait">
              {activeItem ? (
                <FeaturePanel key={activeItem.id} title={activeItem.label} onClose={() => setActive(null)}>
                  {activeItem.id === 'wallet' && <WalletCard />}
                  {activeItem.id === 'tip' && <TipCard onSent={handleSent} />}
                  {activeItem.id === 'request' && <RequestCard />}
                  {activeItem.id === 'shop' && <ShopCard />}
                  {activeItem.id === 'pay' && <PayCard />}
                  {activeItem.id === 'fund' && <FundCard />}
                  {activeItem.id === 'gift' && <GiftCard />}
                  {activeItem.id === 'invoices' && <InvoicesCard />}
                  {activeItem.id === 'batch' && <BatchCard />}
                  {activeItem.id === 'swap' && <SwapCard />}
                  {activeItem.id === 'bridge' && <BridgeCard />}
                  <RecentActivity />
                </FeaturePanel>
              ) : null}
            </AnimatePresence>
            {!activeItem && (
              <p
                className="hidden rounded-3xl border border-dashed p-6 text-center text-sm text-balance lg:block"
                style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}
              >
                {t('Pick a tool from the menu on the left and it will open here.')}
              </p>
            )}
          </div>
        </div>

        <p className="mt-2 text-balance text-center text-xs" style={{ color: 'var(--subtle)' }}>
          {t('Running on Arc Testnet. Need test USDC? Use "Get test USDC" in the Arc Studio sidebar.')}
        </p>
      </div>
      <AddNetworkButton />
    </div>
  )
}

/** Shown on an invoice payment link: pay from another network instead of Arc. */
function InvoicePayOptions() {
  const params = new URLSearchParams(window.location.search)
  const to = params.get('to')
  const amount = params.get('amount')
  if (!params.get('inv') || !to || !amount) return null
  return <PayFromNetwork to={to} amount={amount} />
}
