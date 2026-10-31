import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectKitButton } from 'connectkit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, USDC_ADDRESS, parseOnchainError } from '@/lib/arc'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import type { SentPayment } from './Activity'

const QUICK_AMOUNTS = ['0.10', '0.50', '1.00', '5.00']
const GAS_BUFFER = '0.01'

function readPrefill() {
  const params = new URLSearchParams(window.location.search)
  return { to: params.get('to') ?? '', amount: params.get('amount') ?? '' }
}

export function SendCard({ onSent }: { onSent: (payment: SentPayment) => void }) {
  const [to, setTo] = useState(() => readPrefill().to)
  const [amount, setAmount] = useState(() => readPrefill().amount)

  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { amount: balance, refetch } = useUsdcBalance()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: receiptFailed } = useWaitForTransactionReceipt({ hash })

  const sentRef = useRef<Record<string, true>>({})
  const lastSent = useRef<{ to: string; amount: string }>({ to: '', amount: '' })

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
    onSent({ hash, to: lastSent.current.to, amount: lastSent.current.amount })
    void refetch()
    toast.success('Payment confirmed')
    setAmount('')
    setTo('')
  }, [isSuccess, hash, onSent, refetch])

  const errorMessage = error ? parseOnchainError(error) : null

  const maxAmount = () => {
    if (!balance) return
    const max = balance.sub(Amount.parse(GAS_BUFFER, balance.decimals))
    setAmount(max.isPositive() ? max.toString() : '')
  }

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

  const busy = isPending || isConfirming || isSwitching

  let label = 'Send USDC'
  if (wrongChain) label = `Switch to ${ARC_CHAIN_NAME}`
  else if (insufficient) label = 'Insufficient balance'
  else if (!recipientValid && to) label = 'Enter a valid address'

  return (
    <section className="glass-card rounded-3xl p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        Send
      </h2>

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="recipient">
        Recipient
      </label>
      <div className="field glass-inner mb-3 rounded-2xl px-4 py-3 transition-shadow">
        <input
          id="recipient"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="0x..."
          spellCheck={false}
          autoComplete="off"
          className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
      </div>
      {to && !recipientValid && (
        <p className="-mt-2 mb-3 text-xs" style={{ color: 'var(--danger)' }}>
          That is not a valid wallet address.
        </p>
      )}

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="amount">
        Amount
      </label>
      <div className="field glass-inner rounded-2xl p-4 transition-shadow">
        <input
          id="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
          <button
            type="button"
            disabled={!balance}
            onClick={maxAmount}
            className="text-xs font-semibold tabular-nums disabled:opacity-40"
            style={{ color: 'var(--accent-hover)' }}
          >
            {balance ? `Balance: ${balance.toFixed(2)} · Max` : 'Balance unavailable'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {QUICK_AMOUNTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(q)}
            className="min-h-11 flex-1 rounded-xl text-sm font-semibold tabular-nums transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
          >
            ${q}
          </button>
        ))}
      </div>

      <dl className="mt-4 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <div className="flex justify-between">
          <dt>Network</dt>
          <dd>{ARC_CHAIN_NAME}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Network fee</dt>
          <dd>Paid in USDC</dd>
        </div>
      </dl>

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--accent)' }}
              >
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : (
          <button
            disabled={busy || (!wrongChain && !ready)}
            onClick={send}
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirm in wallet...
              </span>
            ) : isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirming...
              </span>
            ) : (
              label
            )}
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {errorMessage}
        </p>
      )}
      {receiptFailed && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          The transaction failed onchain. Your funds were not sent.
        </p>
      )}

      {isSuccess && hash && (
        <div className="glass-inner mt-4 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-4" /> Payment confirmed
          </div>
          <div className="mt-2 flex items-center justify-between">
            <a
              href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on explorer <ExternalLink className="size-3" />
            </a>
            <button type="button" onClick={reset} className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
