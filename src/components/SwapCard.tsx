import { PercentChips } from './PercentChips'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { ArrowUpDown, Check, ExternalLink, Loader2 } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { useT } from '@/lib/i18n'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

type Token = 'USDC' | 'EURC' | 'CIRBTC'

// Swap on Arc accepts only these three tokens.
const TOKENS: { id: Token; label: string }[] = [
  { id: 'USDC', label: 'USDC' },
  { id: 'EURC', label: 'EURC' },
  { id: 'CIRBTC', label: 'cirBTC' },
]
const DECIMALS: Record<Token, number> = { USDC: 6, EURC: 6, CIRBTC: 8 }
const labelOf = (id: Token) => TOKENS.find((x) => x.id === id)?.label ?? id

const SLIPPAGE_BPS = 100
const EURC_ADDRESS = import.meta.env.VITE_ARC_TESTNET_EURC_ADDRESS as `0x${string}` | undefined
const CIRBTC_ADDRESS = import.meta.env.VITE_ARC_TESTNET_CIRBTC_ADDRESS as `0x${string}` | undefined

interface Quote {
  amountIn: string
  tokenIn: Token
  tokenOut: Token
  account: string
  output: string
  outputToken: string
  fees: { label: string; value: string }[]
}

interface Done {
  amountOut?: string
  explorerUrl?: string
  status: string
}

function swapError(error: unknown): string | null {
  const err = error as { message?: string; code?: number } | null
  const message = (err?.message ?? '').toLowerCase()
  if (message.includes('user rejected') || message.includes('user denied') || err?.code === 4001) return null
  if (message.includes('insufficient')) return 'Insufficient balance for this swap and its fees.'
  if (message.includes('route') || message.includes('unsupported')) return 'No swap route is available for this amount right now.'
  return 'The swap could not be completed. Please try again.'
}

function TokenSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: Token
  disabled: boolean
  onChange: (next: Token) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Token)}
      className="min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold outline-none"
      style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
    >
      {TOKENS.map((x) => (
        <option key={x.id} value={x.id}>
          {x.label}
        </option>
      ))}
    </select>
  )
}

export function SwapCard() {
  const t = useT()
  const { isConnected, address, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const queryClient = useQueryClient()
  const usdc = useUsdcBalance()
  const eurcRead = useReadContract({
    address: EURC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address && EURC_ADDRESS), refetchInterval: 10000 },
  })

  const cirbtcRead = useReadContract({
    address: CIRBTC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address && CIRBTC_ADDRESS), refetchInterval: 10000 },
  })

  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | undefined>()
  const [quoting, setQuoting] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [done, setDone] = useState<Done | undefined>()
  const [error, setError] = useState<string | null>(null)

  const balances: Record<Token, Amount | undefined> = {
    USDC: usdc.amount,
    EURC: eurcRead.data !== undefined ? Amount.fromRaw(eurcRead.data, 6) : undefined,
    CIRBTC: cirbtcRead.data !== undefined ? Amount.fromRaw(cirbtcRead.data, DECIMALS.CIRBTC) : undefined,
  }
  const balanceIn = balances[tokenIn]

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      const value = Amount.parse(amount, DECIMALS[tokenIn])
      return value.isPositive() ? value : undefined
    } catch {
      return undefined
    }
  }, [amount, tokenIn])
  const amountText = parsed?.toString()

  const insufficient = Boolean(parsed && balanceIn && parsed.gt(balanceIn))
  const quoteIsCurrent = Boolean(
    quote && amountText && quote.amountIn === amountText && quote.tokenIn === tokenIn && quote.tokenOut === tokenOut && quote.account === address,
  )

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const reset = () => {
    setQuoting(false)
    setQuote(undefined)
    setDone(undefined)
    setError(null)
  }

  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID
  const [tick, setTick] = useState(0)
  const canQuote = Boolean(amountText && address && connector && !insufficient && !wrongChain)

  // Refresh the quote every 20 seconds while one is on screen.
  useEffect(() => {
    if (!canQuote || swapping) return
    const id = setInterval(() => setTick((n) => n + 1), 20000)
    return () => clearInterval(id)
  }, [canQuote, swapping])

  // Quote automatically shortly after the amount or tokens change.
  useEffect(() => {
    if (!canQuote || !amountText || !address || !connector) return
    let cancelled = false
    const run = async () => {
      setQuoting(true)
      try {
        const { AppKit } = await import('@circle-fin/app-kit')
        const provider = (await connector.getProvider()) as EIP1193Provider
        const adapter = await createViemAdapterFromProvider({ provider })
        const estimate = await new AppKit().estimateSwap({
          from: { adapter, chain: 'Arc_Testnet' },
          tokenIn,
          tokenOut,
          amountIn: amountText,
          config: { slippageBps: SLIPPAGE_BPS },
        })
        if (cancelled) return
        setError(null)
        setQuote({
          amountIn: amountText,
          tokenIn,
          tokenOut,
          account: address,
          output: estimate.estimatedOutput.amount,
          outputToken: estimate.estimatedOutput.token,
          fees: (estimate.fees ?? [])
            .filter((f) => f.amount)
            .map((f) => ({ label: f.type === 'provider' ? 'Provider fee' : 'Fee', value: `${f.amount} ${f.token}` })),
        })
      } catch (e) {
        if (cancelled) return
        setQuote(undefined)
        const message = swapError(e)
        if (message) setError(message)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }
    const timer = setTimeout(() => void run(), 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canQuote, amountText, tokenIn, tokenOut, address, connector, tick])

  const swap = async () => {
    if (!quote || !quoteIsCurrent || !address) return
    setSwapping(true)
    setError(null)
    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const adapter = await getAdapter()
      const result = await new AppKit().swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        amountIn: quote.amountIn,
        config: { slippageBps: SLIPPAGE_BPS },
      })
      setDone({ amountOut: result.amountOut, explorerUrl: result.explorerUrl, status: result.progress.status })
      setQuote(undefined)
      setAmount('')
      toast.success(t('Swap submitted'))
      void usdc.refetch()
      void eurcRead.refetch()
      void cirbtcRead.refetch()
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    } catch (e) {
      const message = swapError(e)
      if (message) setError(message)
    } finally {
      setSwapping(false)
    }
  }

  const fmt = (a: Amount | undefined) => (a ? a.toFixed(2) : '--')
  const busy = quoting || swapping

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="glass-inner rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>{t('You pay')}</span>
          <span className="tabular-nums">{t('Balance: {amount}', { amount: fmt(balanceIn) })}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            inputMode="decimal"
            aria-label={t('Amount to swap')}
            value={amount}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || new RegExp(`^\\d*\\.?\\d{0,${DECIMALS[tokenIn]}}$`).test(v)) {
                setAmount(v)
                reset()
              }
            }}
            placeholder="0.00"
            className="display w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
          <TokenSelect
            label={t('Token to pay with')}
            value={tokenIn}
            disabled={busy}
            onChange={(next) => {
              if (next === tokenOut) setTokenOut(tokenIn)
              setTokenIn(next)
              setAmount('')
              reset()
            }}
          />
        </div>
      </div>

      <PercentChips
        balance={balanceIn}
        reserve={tokenIn === 'USDC' ? Amount.parse('0.01', DECIMALS.USDC) : undefined}
        disabled={busy}
        onPick={(value) => {
          setAmount(value)
          reset()
        }}
      />

      <div className="-my-2 flex justify-center">
        <button
          type="button"
          aria-label={t('Reverse swap direction')}
          disabled={busy}
          onClick={() => {
            setTokenIn(tokenOut)
            setTokenOut(tokenIn)
            setAmount('')
            reset()
          }}
          className="relative z-10 flex size-10 items-center justify-center rounded-full border transition-transform hover:rotate-180 disabled:opacity-50"
          style={{ background: 'var(--surface-pop)', borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          <ArrowUpDown className="size-4" />
        </button>
      </div>

      <div className="glass-inner rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>{t('You receive (estimate)')}</span>
          <span className="tabular-nums">{t('Balance: {amount}', { amount: fmt(balances[tokenOut]) })}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="display text-3xl font-bold tabular-nums" style={{ color: quoteIsCurrent ? 'var(--ink)' : 'var(--subtle)' }}>
            {quoteIsCurrent && quote ? quote.output : quoting && amountText ? <Loader2 className="size-6 animate-spin" aria-label={t('Getting quote...')} /> : '--'}
          </span>
          <TokenSelect
            label={t('Token to receive')}
            value={tokenOut}
            disabled={busy}
            onChange={(next) => {
              if (next === tokenIn) setTokenIn(tokenOut)
              setTokenOut(next)
              setAmount('')
              reset()
            }}
          />
        </div>
      </div>

      {quoteIsCurrent && quote && (
        <dl className="mt-3 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <div className="flex justify-between">
            <dt>{t('Max slippage')}</dt>
            <dd className="tabular-nums">{SLIPPAGE_BPS / 100}%</dd>
          </div>
          {quote.fees.map((f) => (
            <div key={f.label} className="flex justify-between">
              <dt>{t(f.label)}</dt>
              <dd className="tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)]"
                style={{ background: 'var(--accent)' }}
              >
                {t('Connect Wallet')}
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : quoteIsCurrent && quote ? (
          <button
            disabled={swapping}
            onClick={() => void swap()}
            className="min-h-12 w-full rounded-2xl px-3 text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {swapping ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Swapping...')}
              </span>
            ) : (
              t('Swap {amount} {from} to {to}', { amount: quote.amountIn, from: labelOf(quote.tokenIn), to: labelOf(quote.tokenOut) })
            )}
          </button>
        ) : wrongChain ? (
          <button
            onClick={() => void switchChainAsync({ chainId: ARC_CHAIN_ID })}
            className="min-h-12 w-full rounded-2xl px-3 text-sm font-semibold text-[color:var(--on-accent)]"
            style={{ background: 'var(--accent)' }}
          >
            {t('Switch to {chain}', { chain: 'Arc Testnet' })}
          </button>
        ) : (
          <button
            disabled
            className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {quoting && amountText ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Getting quote...')}
              </span>
            ) : insufficient ? (
              t('Insufficient balance')
            ) : (
              t('Enter an amount')
            )}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(error)}
        </p>
      )}

      {done && (
        <div className="glass-inner mt-4 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-4" />
            {done.amountOut ? t('Swapped. You received {amount}.', { amount: done.amountOut }) : t('Swap submitted')}
          </div>
          {done.explorerUrl && (
            <a
              href={done.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--accent-hover)' }}
            >
              {t('View on explorer')} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>
        {t('Swaps run through a swap provider (a third-party aggregator or Circle), which may change by route and is subject to its terms. Estimates can move before the swap completes.')}
      </p>
    </section>
  )
}
