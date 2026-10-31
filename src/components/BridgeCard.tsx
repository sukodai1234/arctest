import { PercentChips } from './PercentChips'
import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { ArrowLeftRight, Check, ExternalLink, Loader2, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Amount } from '@/onchain-money'
import { getUsdc } from '@/onchain-facts'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'

const NETWORKS = [
  { id: 'Arc_Testnet', label: 'Arc Testnet', chainId: 5042002 },
  { id: 'Base_Sepolia', label: 'Base Sepolia', chainId: 84532 },
  { id: 'Ethereum_Sepolia', label: 'Ethereum Sepolia', chainId: 11155111 },
  { id: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia', chainId: 421614 },
  { id: 'Optimism_Sepolia', label: 'Optimism Sepolia', chainId: 11155420 },
  { id: 'Avalanche_Fuji', label: 'Avalanche Fuji', chainId: 43113 },
  { id: 'Polygon_Amoy_Testnet', label: 'Polygon Amoy', chainId: 80002 },
] as const

type NetworkId = (typeof NETWORKS)[number]['id']

interface StepView {
  name: string
  state: string
  txHash?: string
  explorerUrl?: string
}

interface FeeLine {
  label: string
  value: string
}

interface BridgeEventPayload {
  method?: string
  values?: { state?: string; txHash?: string; transactionHash?: string }
}

const STEP_LABELS: Record<string, string> = {
  approve: 'Approve USDC',
  burn: 'Burn on source network',
  fetchAttestation: 'Circle attestation',
  mint: 'Mint on destination',
  forward: 'Circle delivers to destination',
  transfer: 'Transfer on source network',
}

function bridgeError(error: unknown): string | null {
  const err = error as { message?: string; code?: number } | null
  const message = (err?.message ?? '').toLowerCase()
  if (message.includes('user rejected') || message.includes('user denied') || err?.code === 4001) return null
  if (message.includes('insufficient')) return 'Insufficient balance for this transfer and its fees.'
  if (message.includes('unsupported')) return 'This route is not supported right now. Try another destination.'
  return 'The transfer could not be completed. Please try again.'
}

function NetworkSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: NetworkId
  disabled: boolean
  onChange: (next: NetworkId) => void
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as NetworkId)}
        className="glass-inner min-h-12 w-full min-w-0 rounded-2xl px-3 text-sm font-semibold outline-none"
        style={{ color: 'var(--ink)' }}
      >
        {NETWORKS.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function BridgeCard() {
  const t = useT()
  const { isConnected, address, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const queryClient = useQueryClient()

  const [source, setSource] = useState<NetworkId>('Arc_Testnet')
  const [destination, setDestination] = useState<NetworkId>('Base_Sepolia')
  const [amount, setAmount] = useState('')
  const [fees, setFees] = useState<FeeLine[] | undefined>()
  const [feeError, setFeeError] = useState(false)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepView[]>([])
  const [outcome, setOutcome] = useState<'success' | 'error' | undefined>()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sourceNet = NETWORKS.find((n) => n.id === source) ?? NETWORKS[0]
  const sourceUsdc = getUsdc(sourceNet.chainId)
  const decimals = sourceUsdc?.decimals ?? 6
  const balanceRead = useReadContract({
    address: sourceUsdc?.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: sourceNet.chainId,
    query: { enabled: Boolean(address && sourceUsdc), refetchInterval: 10000 },
  })
  const balance = balanceRead.data !== undefined ? Amount.fromRaw(balanceRead.data, decimals) : undefined
  const refetch = balanceRead.refetch

  const parsed = useMemo(() => {
    if (!amount) return undefined
    try {
      const value = Amount.parse(amount, decimals)
      return value.isPositive() ? value : undefined
    } catch {
      return undefined
    }
  }, [amount, decimals])

  const insufficient = Boolean(parsed && balance && parsed.gt(balance))
  const destLabel = NETWORKS.find((n) => n.id === destination)?.label ?? destination
  const sourceLabel = sourceNet.label
  const ready = isConnected && Boolean(parsed) && !insufficient && !running

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  // Quote the fee for the selected route. This never moves funds.
  useEffect(() => {
    if (!parsed || !address || !connector || insufficient || running) return
    let active = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { AppKit } = await import('@circle-fin/app-kit')
          const adapter = await getAdapter()
          const estimate = await new AppKit().estimateBridge({
            from: { adapter, chain: source },
            to: { recipientAddress: address, chain: destination, useForwarder: true },
            amount: parsed.toString(),
          })
          if (!active) return
          const lines: FeeLine[] = []
          for (const f of estimate.fees) {
            if (f.amount) lines.push({ label: f.type === 'forwarder' ? 'Delivery fee' : f.type === 'kit' ? 'App fee' : 'Network fee', value: `${f.amount} ${f.token}` })
          }
          for (const g of estimate.gasFees) {
            if (g.fees?.fee) lines.push({ label: `Gas (${g.name})`, value: `${g.fees.fee} ${g.token}` })
          }
          setFees(lines)
          setFeeError(false)
        } catch {
          if (!active) return
          setFees(undefined)
          setFeeError(true)
        }
      })()
    }, 600)
    return () => {
      active = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.raw, address, source, destination, insufficient, running, connector?.uid, chainId])

  const upsertStep = (next: StepView) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.name === next.name)
      if (idx === -1) return [...prev, next]
      const copy = [...prev]
      copy[idx] = { ...copy[idx], ...next }
      return copy
    })

  const bridge = async () => {
    if (!ready || !parsed || !address) return
    setRunning(true)
    setOutcome(undefined)
    setErrorMessage(null)
    setSteps([])
    try {
      if (chainId !== sourceNet.chainId) await switchChainAsync({ chainId: sourceNet.chainId })
      const { AppKit } = await import('@circle-fin/app-kit')
      const kit = new AppKit()
      kit.on('*', (payload) => {
        const p = payload as BridgeEventPayload
        if (!p.method?.startsWith('bridge.')) return
        const name = p.method.slice('bridge.'.length)
        upsertStep({
          name,
          state: p.values?.state ?? 'success',
          txHash: p.values?.txHash ?? p.values?.transactionHash,
        })
      })
      const adapter = await getAdapter()
      const result = await kit.bridge({
        from: { adapter, chain: source },
        to: { recipientAddress: address, chain: destination, useForwarder: true },
        amount: parsed.toString(),
      })
      setSteps(
        result.steps.map((s) => ({
          name: s.name,
          state: s.state,
          txHash: s.txHash,
          explorerUrl: s.explorerUrl,
        })),
      )
      if (result.state === 'success') {
        setOutcome('success')
        setAmount('')
        toast.success(t('Bridged to {chain}', { chain: destLabel }))
      } else {
        setOutcome('error')
        setErrorMessage('The transfer stopped part way. Your funds are safe; check the steps below.')
      }
      void refetch()
      void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    } catch (error) {
      const message = bridgeError(error)
      if (message) {
        setOutcome('error')
        setErrorMessage(message)
      }
    } finally {
      setRunning(false)
    }
  }

  const resetQuote = () => {
    setFees(undefined)
    setFeeError(false)
    setOutcome(undefined)
    setErrorMessage(null)
    setSteps([])
  }

  let label = t('Bridge USDC')
  if (insufficient) label = t('Insufficient balance')
  else if (parsed) label = t('Bridge {amount} USDC to {chain}', { amount: parsed.toString(), chain: destLabel })

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <NetworkSelect
          id="bridge-source"
          label={t('From')}
          value={source}
          disabled={running}
          onChange={(next) => {
            if (next === destination) setDestination(source)
            setSource(next)
            resetQuote()
          }}
        />
        <button
          type="button"
          aria-label={t('Swap networks')}
          disabled={running}
          onClick={() => {
            setSource(destination)
            setDestination(source)
            resetQuote()
          }}
          className="mb-1 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--hover)] disabled:opacity-50"
        >
          <ArrowLeftRight className="size-4" style={{ color: 'var(--muted)' }} />
        </button>
        <NetworkSelect
          id="bridge-destination"
          label={t('To')}
          value={destination}
          disabled={running}
          onChange={(next) => {
            if (next === source) setSource(destination)
            setDestination(next)
            resetQuote()
          }}
        />
      </div>

      <label className="mb-1 mt-4 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="bridge-amount">
        {t('Amount')}
      </label>
      <div className="field glass-inner rounded-2xl p-4 transition-shadow">
        <input
          id="bridge-amount"
          inputMode="decimal"
          value={amount}
          disabled={running}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) {
              setAmount(v)
              setFees(undefined)
              setFeeError(false)
            }
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          style={{ color: 'var(--ink)' }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {balance ? t('Balance: {amount}', { amount: balance.toFixed(2) }) : t('Balance unavailable')}
          </span>
        </div>
      </div>

      <PercentChips
        balance={balance}
        reserve={source === 'Arc_Testnet' ? Amount.parse('0.01', decimals) : undefined}
        disabled={running}
        onPick={(value) => {
          setAmount(value)
          setFees(undefined)
          setFeeError(false)
        }}
      />

      <dl className="mt-4 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0">{t('Recipient')}</dt>
          <dd className="text-right">{t('Your wallet on {chain}', { chain: destLabel })}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0">{t('Delivery')}</dt>
          <dd className="text-right">{t('Circle completes the transfer on {chain}, no gas needed there', { chain: destLabel })}</dd>
        </div>
        {source !== 'Arc_Testnet' && (
          <div className="flex justify-between gap-4">
            <dt className="shrink-0">{t('Gas')}</dt>
            <dd className="text-right">{t('You need gas on {chain} to start the transfer', { chain: sourceLabel })}</dd>
          </div>
        )}
        {fees?.map((f) => (
          <div key={f.label} className="flex justify-between">
            <dt>{t(f.label)}</dt>
            <dd className="tabular-nums">{f.value}</dd>
          </div>
        ))}
        {parsed && !fees && !feeError && !insufficient && (
          <div className="flex justify-between">
            <dt>{t('Fees')}</dt>
            <dd>{t('Estimating...')}</dd>
          </div>
        )}
        {feeError && (
          <div className="flex justify-between">
            <dt>{t('Fees')}</dt>
            <dd>{t('Estimate unavailable for this route')}</dd>
          </div>
        )}
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
            disabled={!ready}
            onClick={() => void bridge()}
            className="min-h-12 w-full rounded-2xl px-3 text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> {t('Bridging...')}
              </span>
            ) : (
              label
            )}
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="glass-inner mt-4 flex flex-col gap-2 rounded-2xl p-4">
          {steps.map((s) => {
            const ok = s.state === 'success'
            const failed = s.state === 'error'
            return (
              <li key={s.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                  {ok ? (
                    <Check className="size-4" style={{ color: 'var(--success)' }} />
                  ) : failed ? (
                    <X className="size-4" style={{ color: 'var(--danger)' }} />
                  ) : (
                    <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
                  )}
                  {t(STEP_LABELS[s.name] ?? s.name)}
                </span>
                {s.explorerUrl && (
                  <a
                    href={s.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('View {step} transaction', { step: t(STEP_LABELS[s.name] ?? s.name) })}
                    className="flex size-8 items-center justify-center"
                  >
                    <ExternalLink className="size-3.5" style={{ color: 'var(--accent-hover)' }} />
                  </a>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {outcome === 'success' && (
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--success)' }}>
          {t('Bridge complete. Your USDC is on {chain}.', { chain: destLabel })}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(errorMessage)}
        </p>
      )}
    </section>
  )
}
