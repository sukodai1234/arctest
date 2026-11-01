import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useQueries } from '@tanstack/react-query'
import { createPublicClient, erc20Abi, http } from 'viem'
import { Check, Copy, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { TESTNET_ONCHAIN_CHAINS, buildAddressExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, shortAddress } from '@/lib/arc'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { ARC_TOKENS } from '@/lib/tokens'

const OTHER_CHAINS = TESTNET_ONCHAIN_CHAINS.filter((c) => c.chainId !== ARC_CHAIN_ID && c.usdc !== undefined)

export function WalletCard() {
  const t = useT()
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { amount, isLoading, refetch } = useUsdcBalance()
  const { balances, refetch: refetchTokens } = useTokenBalances()
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const others = useQueries({
    queries: OTHER_CHAINS.map((chain) => ({
      queryKey: ['wallet-usdc', chain.chainId, address],
      enabled: Boolean(address),
      refetchInterval: 30000,
      queryFn: async () => {
        const usdc = chain.usdc
        if (!usdc || !address) throw new Error('No USDC on this chain')
        const client = createPublicClient({ transport: http(chain.rpcUrls[0]) })
        const raw = await client.readContract({
          address: usdc.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })
        return Amount.fromRaw(raw, usdc.decimals).toFixed(2)
      },
    })),
  })

  if (!isConnected || !address) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <p className="py-3 text-center text-sm" style={{ color: 'var(--subtle)' }}>
          {t('Connect your wallet to see your balances.')}
        </p>
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
      </section>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success(t('Address copied'))
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t('Could not copy. Select the address and copy it manually.'))
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([refetch(), refetchTokens(), ...others.map((q) => q.refetch())])
    setRefreshing(false)
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
            {connector?.name ?? t('Wallet')}
          </div>
          <div className="mono mt-1 break-all text-xs" style={{ color: 'var(--ink)' }}>
            {address}
          </div>
        </div>
        <button
          type="button"
          aria-label={t('Refresh balances')}
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--hover)] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      <div className="glass-inner mt-4 rounded-2xl p-4">
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          {t('Current balance on {chain}', { chain: ARC_CHAIN_NAME })}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {isLoading || !amount ? '...' : amount.toFixed(2)}
          </span>
          <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
          {t('USDC is also the gas token on Arc, so this is one balance for both sending and fees.')}
        </p>
      </div>

      {ARC_TOKENS.length > 1 && (
        <>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
            {t('Other tokens on {chain}', { chain: ARC_CHAIN_NAME })}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {ARC_TOKENS.filter((tk) => tk.id !== 'USDC').map((tk) => {
              const value = balances[tk.id]
              return (
                <li key={tk.id} className="glass-inner flex items-center justify-between rounded-xl px-4 py-2.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                    {tk.symbol}
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: value && value.isPositive() ? 'var(--ink)' : 'var(--subtle)' }}>
                    {value ? value.toFixed(tk.decimals <= 6 ? 2 : 6) : '...'}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t('Copied') : t('Copy')}
        </button>
        <a
          href={buildAddressExplorerUrl(ARC_CHAIN_ID, address)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          <ExternalLink className="size-4" /> {t('Explorer')}
        </a>
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}
        >
          <LogOut className="size-4" /> {t('Disconnect')}
        </button>
      </div>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('USDC on other testnets')}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {OTHER_CHAINS.map((chain, i) => {
          const q = others[i]
          return (
            <li key={chain.chainId} className="glass-inner flex items-center justify-between rounded-xl px-4 py-2.5">
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                {chain.name}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                {q.isLoading ? (
                  <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
                ) : q.isError ? (
                  <span className="text-xs font-normal" style={{ color: 'var(--subtle)' }}>
                    {t('Unavailable')}
                  </span>
                ) : (
                  `${q.data} USDC`
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('Connected as {address}. These are separate balances on separate networks.', { address: shortAddress(address) })}
      </p>
    </section>
  )
}
