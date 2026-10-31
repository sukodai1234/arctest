import { useT } from '@/lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Network, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { requireChain } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002
const ARC_MAINNET_ID = 5042

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const NETWORKS = [
  { chainId: ARC_TESTNET_ID, caption: 'For testing. Free test USDC.', real: false },
  { chainId: ARC_MAINNET_ID, caption: 'Real funds. Add it now, use it later.', real: true },
] as const

async function getProvider(connectorProvider: () => Promise<unknown> | undefined): Promise<Eip1193 | undefined> {
  const fromConnector = await connectorProvider()
  if (fromConnector) return fromConnector as Eip1193
  return (window as unknown as { ethereum?: Eip1193 }).ethereum
}

export function AddNetworkButton() {
  const t = useT()
  const { connector } = useAccount()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [added, setAdded] = useState<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const addNetwork = async (chainId: number) => {
    const chain = requireChain(chainId)
    setPending(chainId)
    try {
      const provider = await getProvider(() => connector?.getProvider())
      if (!provider) {
        toast.error(t('No wallet found. Install or open a browser wallet first.'))
        return
      }
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${chain.chainId.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: { name: 'USDC', symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals },
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: [chain.explorerBase],
          },
        ],
      })
      setAdded((prev) => (prev.includes(chainId) ? prev : [...prev, chainId]))
      toast.success(t('{chain} added to your wallet', { chain: chain.name }))
    } catch (error) {
      const err = error as { code?: number; message?: string }
      if (err.code === 4001 || err.message?.toLowerCase().includes('user rejected')) return
      toast.error(t('Your wallet could not add this network.'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div ref={rootRef} className="fixed bottom-16 right-4 z-30 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={t('Add network to wallet')}
            className="glass-card w-72 rounded-2xl p-3"
            style={{ background: 'var(--surface-pop)' }}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
              {t('Add network to wallet')}
            </div>
            <ul className="flex flex-col gap-1.5">
              {NETWORKS.map((n) => {
                const chain = requireChain(n.chainId)
                const done = added.includes(n.chainId)
                return (
                  <li key={n.chainId}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pending !== null}
                      onClick={() => void addNetwork(n.chainId)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[color:var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {chain.name}
                          {n.real && (
                            <span
                              className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                              style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}
                            >
                              {t('Real funds')}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {t(n.caption)}
                        </span>
                        <span className="mono block text-[11px]" style={{ color: 'var(--subtle)' }}>
                          {t('Chain ID {id}', { id: chain.chainId })}
                        </span>
                      </span>
                      {pending === n.chainId ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: 'var(--subtle)' }} />
                      ) : done ? (
                        <Check className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                      ) : (
                        <Plus className="size-4 shrink-0" style={{ color: 'var(--accent-hover)' }} />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="px-2 pt-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
              {t('Your wallet asks you to approve. Arc Pay itself runs on Arc Testnet.')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[color:var(--on-accent)] shadow-lg transition-all hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ background: 'var(--accent)' }}
      >
        <Network className="size-4" /> {t('Add network')}
      </button>
    </div>
  )
}
