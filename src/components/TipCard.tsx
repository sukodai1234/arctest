import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectKitButton } from 'connectkit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, USDC_ADDRESS, parseOnchainError } from '@/lib/arc'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import type { SentPayment } from './Activity'

const PRESETS = ['0.01', '0.05', '0.10', '0.25']

export function TipCard({ onSent }: { onSent: (payment: SentPayment) => void }) {
  const t = useT()
  const [to, setTo] = useState(() => new URLSearchParams(window.location.search).get('tipTo') ?? '')
  const [amount, setAmount] = useState('0.05')
  const [custom, setCustom] = useState(false)

  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { amount: balance, refetch } = useUsdcBalance()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: receiptFailed } = useWaitForTransactionReceipt({ hash })

  const sentRef = useRef<Record<string, true>>({})
  const lastSent = useRef({ to: '', amount: '' })

  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID
  const recipientValid = isAddress(to)

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      const value = parseAmount(ARC_CHAIN_ID, amount)
      return value.isPositive() ? value : undefined
    } catch {
      return undefined
    }
  }, [amount])

  const insufficient = Boolean(parsed && balance && parsed.gt(balance))
  const ready = isConnected && recipientValid && Boolean(parsed) && !insufficient

  useEffect(() => {
    if (!isSuccess || !hash || sentRef.current[hash]) return
    sentRef.current[hash] = true
    onSent({ hash, to: lastSent.current.to, amount: lastSent.current.amount, memo: 'Tip' })
    void refetch()
    toast.success(t('Tip sent'))
  }, [isSuccess, hash, onSent, refetch, t])

  const errorMessage = error ? parseOnchainError(error) : null
  const busy = isPending || isConfirming || isSwitching

  const send = () => {
    if (wrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID })
      return
    }
    if (!ready || !parsed || !isAddress(to)) return
    lastSent.current = { to, amount: parsed.toString() }
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, parsed.raw],
      chainId: ARC_CHAIN_ID,
    })
  }

  let label = parsed ? t('Send ${amount} tip', { amount: parsed.toString() }) : t('Choose a tip')
  if (wrongChain) label = t('Switch to {chain}', { chain: ARC_CHAIN_NAME })
  else if (insufficient) label = t('Insufficient balance')

  return (
    <section className="glass-card rounded-3xl p-5">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="tip-recipient">
        {t('Who are you tipping?')}
      </label>
      <div className="field glass-inner mb-1 rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="tip-recipient"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder={t('Creator wallet address (0x...)')}
          spellCheck={false}
          autoComplete="off"
          className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>
      {to && !recipientValid && (
        <p className="mb-2 text-xs" style={{ color: 'var(--danger)' }}>
          {t('That is not a valid wallet address.')}
        </p>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={t('Tip amount')}>
        {PRESETS.map((p) => {
          const selected = !custom && amount === p
          return (
            <button
              key={p}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setCustom(false)
                setAmount(p)
              }}
              className="min-h-12 rounded-xl text-sm font-semibold tabular-nums transition-all hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={
                selected
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : { background: 'var(--surface-muted)', color: 'var(--ink-2)' }
              }
            >
              ${p}
            </button>
          )
        })}
      </div>

      <div className="field glass-inner mt-2 flex items-baseline gap-2 rounded-2xl px-4 py-3 transition-shadow">
        <input
          inputMode="decimal"
          aria-label={t('Custom tip amount in USDC')}
          value={custom ? amount : ''}
          onFocus={() => {
            if (!custom) {
              setCustom(true)
              setAmount('')
            }
          }}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) {
              setCustom(true)
              setAmount(v)
            }
          }}
          placeholder={t('Custom amount')}
          className="display w-full bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          USDC
        </span>
      </div>

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
        ) : (
          <button
            disabled={busy || (!wrongChain && !ready)}
            onClick={send}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Confirm in wallet...')}
              </span>
            ) : isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Confirming...')}
              </span>
            ) : (
              label
            )}
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(errorMessage)}
        </p>
      )}
      {receiptFailed && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t('The transaction failed onchain. Your funds were not sent.')}
        </p>
      )}

      {isSuccess && hash && (
        <div className="glass-inner mt-4 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-4" /> {t('Tip sent. Thank you!')}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <a
              href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--accent-hover)' }}
            >
              {t('View on explorer')} <ExternalLink className="size-3" />
            </a>
            <button type="button" onClick={reset} className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {t('Dismiss')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
