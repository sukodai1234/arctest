import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { Check, ExternalLink, Gift as GiftIcon, Loader2 } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { useT } from '@/lib/i18n'
import { GiftError, addressOfKey, readGiftBalance, readGiftKeyFromHash, sweepGift } from '@/lib/gift'

/** Landing page for a gift link: shows the gift and sweeps it to the claimer's address. */
export function ClaimGift() {
  const t = useT()
  const { address: connected } = useAccount()
  // The key is read from the #fragment once and never leaves the browser.
  const [key] = useState(() => readGiftKeyFromHash(window.location.hash))
  const [manual, setManual] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimedHash, setClaimedHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const giftAddress = key ? addressOfKey(key) : undefined
  const holding = useQuery({
    queryKey: ['claim-balance', giftAddress],
    enabled: Boolean(giftAddress),
    queryFn: () => readGiftBalance(giftAddress as `0x${string}`),
    refetchInterval: claimedHash ? false : 5000,
  })

  const destination = manual.trim() || connected || ''
  const destinationValid = isAddress(destination)
  const value = holding.data !== undefined ? Amount.fromRaw(holding.data, 6) : undefined
  const empty = holding.data === 0n

  const claim = async () => {
    if (!key || !destinationValid) return
    setClaiming(true)
    setError(null)
    try {
      const hash = await sweepGift(key, destination)
      setClaimedHash(hash)
      void holding.refetch()
    } catch (e) {
      if (e instanceof GiftError) {
        setError(e.code === 'EMPTY' ? 'This gift has already been claimed.' : 'This gift is too small to cover the network fee.')
      } else {
        setError('The gift could not be claimed. Please try again.')
      }
    } finally {
      setClaiming(false)
    }
  }

  return (
    <section className="glass-card mx-auto w-full max-w-md rounded-3xl p-6">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <GiftIcon className="size-7" style={{ color: 'var(--ink)' }} />
        </div>
        <h1 className="display mt-3 text-2xl font-bold" style={{ color: 'var(--ink)' }}>
          {t('You received a gift')}
        </h1>
      </div>

      {!key ? (
        <p role="alert" className="mt-5 text-center text-sm" style={{ color: 'var(--danger)' }}>
          {t('This gift link is not valid. Ask the sender for a new one.')}
        </p>
      ) : claimedHash ? (
        <div className="glass-inner mt-5 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-base font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-5" /> {t('Gift claimed!')}
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {t('The USDC is now in the wallet you chose.')}
          </p>
          <a
            href={buildTxExplorerUrl(ARC_CHAIN_ID, claimedHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--accent-hover)' }}
          >
            {t('View on explorer')} <ExternalLink className="size-3" />
          </a>
        </div>
      ) : (
        <>
          <div className="glass-inner mt-5 rounded-2xl p-5 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
              {t('This gift holds')}
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {holding.isLoading || !value ? '...' : value.toFixed(2)}
              </span>
              <span className="text-lg" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
            </div>
          </div>

          {empty ? (
            <p role="alert" className="mt-4 text-center text-sm" style={{ color: 'var(--danger)' }}>
              {t('This gift has already been claimed.')}
            </p>
          ) : (
            <>
              <label className="mb-1 mt-5 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="claim-to">
                {t('Send the gift to')}
              </label>
              <div className="field glass-inner rounded-2xl px-4 py-3 transition-shadow">
                <input
                  id="claim-to"
                  value={manual || connected || ''}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder={t('Your wallet address (0x...)')}
                  spellCheck={false}
                  autoComplete="off"
                  className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              {destination && !destinationValid && (
                <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {t('That is not a valid wallet address.')}
                </p>
              )}
              {!connected && (
                <div className="mt-2">
                  <ConnectKitButton.Custom>
                    {({ show }) => (
                      <button type="button" onClick={show} className="min-h-11 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                        {t('Or connect a wallet')}
                      </button>
                    )}
                  </ConnectKitButton.Custom>
                </div>
              )}
              <button
                type="button"
                disabled={!destinationValid || claiming || holding.isLoading}
                onClick={() => void claim()}
                className="mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {claiming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Claiming...')}
                  </span>
                ) : (
                  t('Claim gift')
                )}
              </button>
              <p className="mt-3 text-center text-xs" style={{ color: 'var(--subtle)' }}>
                {t('The network fee is paid from the gift, so you do not need any funds. It can be claimed once.')}
              </p>
            </>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-xs" style={{ color: 'var(--danger)' }}>
          {t(error)}
        </p>
      )}

      <a href="/" className="mt-5 block text-center text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
        {t('Open Arc Pay')}
      </a>
    </section>
  )
}
