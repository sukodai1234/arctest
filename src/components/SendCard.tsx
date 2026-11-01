import { readInvoiceParams } from '@/lib/invoices'
import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectKitButton } from 'connectkit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, parseOnchainError } from '@/lib/arc'
import { ARC_TOKENS, getArcToken, type TokenId } from '@/lib/tokens'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { PercentChips } from './PercentChips'
import { useFiatQuote } from '@/hooks/useFiatQuote'
import { cleanFiatAmount, getFiat } from '@/lib/fx'
import type { SentPayment } from './Activity'

const QUICK_AMOUNTS = ['0.10', '0.50', '1.00', '5.00']
const GAS_BUFFER = '0.01'

function readPrefill() {
  const params = new URLSearchParams(window.location.search)
  return {
    to: params.get('to') ?? '',
    amount: params.get('amount') ?? '',
    shop: (params.get('shop') ?? '').slice(0, 40),
    ...readFiat(params),
  }
}

function readFiat(params: URLSearchParams): { cur?: string; fiat?: string } {
  const currency = getFiat((params.get('cur') ?? '').toUpperCase())
  const fiat = currency ? cleanFiatAmount(params.get('fiat'), currency.decimals) : undefined
  return currency && fiat ? { cur: currency.code, fiat } : {}
}

export function SendCard({ onSent }: { onSent: (payment: SentPayment) => void }) {
  const t = useT()
  const [to, setTo] = useState(() => readPrefill().to)
  const [amountInput, setAmount] = useState(() => readPrefill().amount)
  const [shop] = useState(() => readPrefill().shop)
  const [invoice] = useState(() => readInvoiceParams(window.location.search))
  const [tokenId, setTokenId] = useState<TokenId>('USDC')
  const [price] = useState(() => readPrefill())
  const fx = useFiatQuote(price.cur, price.fiat)
  // A local-currency price from a payment link becomes the USDC amount once the rate is known.
  const amount = price.fiat ? (fx.usdc ?? '') : amountInput
  // Payment links (shop, invoice, prefilled) are priced in USDC, so the token is locked for them.
  const usdcOnly = Boolean(shop || invoice || price.cur || new URLSearchParams(window.location.search).has('to'))
  const token = getArcToken(tokenId)
  const isUsdc = token.id === 'USDC'

  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { balances, refetch } = useTokenBalances()
  const balance = balances[token.id]
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: receiptFailed } = useWaitForTransactionReceipt({ hash })

  const sentRef = useRef<Record<string, true>>({})
  const lastSent = useRef<{ to: string; amount: string }>({ to: '', amount: '' })

  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID
  const recipientValid = isAddress(to)

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      const value = Amount.parse(amount, token.decimals)
      return value.isPositive() ? value : undefined
    } catch {
      return undefined
    }
  }, [amount, token.decimals])

  const insufficient = Boolean(parsed && balance && parsed.gt(balance))
  const ready = isConnected && recipientValid && Boolean(parsed) && !insufficient

  useEffect(() => {
    if (!isSuccess || !hash || sentRef.current[hash]) return
    sentRef.current[hash] = true
    onSent({ hash, to: lastSent.current.to, amount: lastSent.current.amount })
    void refetch()
    toast.success(t('Payment confirmed'))
    setAmount('')
    setTo('')
  }, [isSuccess, hash, onSent, refetch, t])

  const errorMessage = error ? parseOnchainError(error) : null

  const maxAmount = () => {
    if (!balance) return
    const max = isUsdc ? balance.sub(Amount.parse(GAS_BUFFER, balance.decimals)) : balance
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
      address: token.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, parsed.raw],
      chainId: ARC_CHAIN_ID,
    })
  }

  const busy = isPending || isConfirming || isSwitching

  let label = t('Send {token}', { token: token.symbol })
  if (wrongChain) label = t('Switch to {chain}', { chain: ARC_CHAIN_NAME })
  else if (insufficient) label = t('Insufficient balance')
  else if (!recipientValid && to) label = t('Enter a valid address')

  return (
    <section className="glass-card rounded-3xl p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
        {t('Send')}
      </h2>

      {invoice && (
        <div className="glass-inner mb-3 rounded-2xl p-3">
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {t('Invoice {id}', { id: invoice.id })}
            {invoice.due && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>
                {t('Due {date}', { date: invoice.due })}
              </span>
            )}
          </div>
          {invoice.note && (
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {invoice.note}
            </div>
          )}
        </div>
      )}

      {price.cur && price.fiat && (
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          {fx.rate
            ? t('Price {amount} {currency} at 1 USD = {rate} {currency} ({source}).', {
                amount: Number(price.fiat).toLocaleString(),
                currency: price.cur,
                rate: fx.rate.perUsd.toLocaleString(undefined, { maximumFractionDigits: 4 }),
                source: t(fx.rate.source),
              })
            : fx.error
              ? t('Could not load an exchange rate.')
              : t('Getting quote...')}
        </p>
      )}

      {shop && (
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {t('Paying {shop}', { shop })}
        </p>
      )}

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="recipient">
        {t('Recipient')}
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
          {t('That is not a valid wallet address.')}
        </p>
      )}

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="amount">
        {t('Amount')}
      </label>
      <div className="field glass-inner rounded-2xl p-4 transition-shadow">
        <input
          id="amount"
          inputMode="decimal"
          value={amount}
          readOnly={Boolean(price.fiat)}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || new RegExp(`^\\d*\\.?\\d{0,${token.decimals}}$`).test(v)) setAmount(v)
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <div className="mt-2 flex items-center justify-between">
          {usdcOnly || ARC_TOKENS.length < 2 ? (
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          ) : (
            <select
              value={tokenId}
              disabled={busy}
              aria-label={t('Token')}
              onChange={(e) => {
                setTokenId(e.target.value as TokenId)
                setAmount('')
              }}
              className="rounded-lg bg-transparent py-1 pr-1 text-xs font-semibold outline-none"
              style={{ color: 'var(--ink-2)' }}
            >
              {ARC_TOKENS.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.symbol}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!balance}
            onClick={maxAmount}
            className="text-xs font-semibold tabular-nums disabled:opacity-40"
            style={{ color: 'var(--accent-hover)' }}
          >
            {balance ? t('Balance: {amount} · Max', { amount: balance.toFixed(token.decimals <= 6 ? 2 : 6) }) : t('Balance unavailable')}
          </button>
        </div>
      </div>

      {!isUsdc && <PercentChips balance={balance} onPick={setAmount} disabled={busy} />}
      <div className={`mt-3 flex gap-2 ${isUsdc ? '' : 'hidden'}`}>
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
          <dt>{t('Network')}</dt>
          <dd>{ARC_CHAIN_NAME}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('Network fee')}</dt>
          <dd>{t('Paid in USDC')}</dd>
        </div>
      </dl>

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
            <Check className="size-4" /> {t('Payment confirmed')}
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
