import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { erc20Abi, isAddress, type EIP1193Provider } from 'viem'
import { Check, ChevronDown, ExternalLink, Globe, Loader2, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { getUsdc } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { useT } from '@/lib/i18n'
import { NETWORKS, type NetworkId } from './BridgeCard'

const ARC_ID = 'Arc_Testnet'
const SOURCES = NETWORKS.filter((n) => n.id !== ARC_ID)

interface StepView {
  name: string
  state: string
  explorerUrl?: string
}

function ceilToCent(a: Amount): Amount {
  const unit = 10n ** BigInt(Math.max(a.decimals - 2, 0))
  return Amount.fromRaw(((a.raw + unit - 1n) / unit) * unit, a.decimals)
}

/** Lets a payer settle an invoice from another network; the funds are delivered to the invoice owner on Arc. */
export function PayFromNetwork({ to, amount }: { to: string; amount: string }) {
  const t = useT()
  const { isConnected, address, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<NetworkId>(SOURCES[0].id)
  const [feeTotal, setFeeTotal] = useState<Amount | undefined>()
  const [feeError, setFeeError] = useState(false)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepView[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const net = SOURCES.find((n) => n.id === source) ?? SOURCES[0]
  const usdc = getUsdc(net.chainId)
  const decimals = usdc?.decimals ?? 6
  const recipient = isAddress(to) ? to : undefined

  const invoiceAmount = useMemo(() => {
    try {
      const v = Amount.parse(amount, decimals)
      return v.isPositive() ? v : undefined
    } catch {
      return undefined
    }
  }, [amount, decimals])

  const balanceRead = useReadContract({
    address: usdc?.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: net.chainId,
    query: { enabled: Boolean(address && usdc && open), refetchInterval: 10000 },
  })
  const balance = balanceRead.data !== undefined ? Amount.fromRaw(balanceRead.data, decimals) : undefined

  // The payer covers the bridge fee on top so the invoice owner receives the full invoice amount.
  const total = invoiceAmount && feeTotal ? invoiceAmount.add(ceilToCent(feeTotal)) : undefined
  const insufficient = Boolean(total && balance && total.gt(balance))

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  useEffect(() => {
    if (!open || !invoiceAmount || !recipient || !connector || running) return
    let active = true
    const run = async () => {
      try {
        const { AppKit } = await import('@circle-fin/app-kit')
        const adapter = await getAdapter()
        const estimate = await new AppKit().estimateBridge({
          from: { adapter, chain: source },
          to: { recipientAddress: recipient, chain: ARC_ID, useForwarder: true },
          amount: invoiceAmount.toString(),
        })
        if (!active) return
        let sum = Amount.zero(decimals)
        for (const f of estimate.fees) {
          if (f.amount && f.token === 'USDC') sum = sum.add(Amount.parse(f.amount, decimals))
        }
        setFeeTotal(sum)
        setFeeError(false)
      } catch {
        if (!active) return
        setFeeTotal(undefined)
        setFeeError(true)
      }
    }
    void run()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, invoiceAmount?.raw, recipient, connector?.uid, running])

  const pay = async () => {
    if (!total || !recipient || insufficient || running) return
    setRunning(true)
    setError(null)
    setDone(false)
    setSteps([])
    try {
      if (chainId !== net.chainId) await switchChainAsync({ chainId: net.chainId })
      const { AppKit } = await import('@circle-fin/app-kit')
      const adapter = await getAdapter()
      const result = await new AppKit().bridge({
        from: { adapter, chain: source },
        to: { recipientAddress: recipient, chain: ARC_ID, useForwarder: true },
        amount: total.toString(),
      })
      setSteps(result.steps.map((s) => ({ name: s.name, state: s.state, explorerUrl: s.explorerUrl })))
      if (result.state === 'success') setDone(true)
      else setError('The transfer stopped part way. Your funds are safe; check the steps below.')
    } catch (e) {
      const err = e as { code?: number; message?: string }
      const m = (err.message ?? '').toLowerCase()
      if (!(err.code === 4001 || m.includes('user rejected') || m.includes('user denied'))) {
        setError('The transfer could not be completed. Please try again.')
      }
    } finally {
      setRunning(false)
    }
  }

  if (!recipient || !invoiceAmount) return null

  return (
    <section className="glass-card rounded-3xl p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          <Globe className="size-4" /> {t('Pay from another network')}
        </span>
        <ChevronDown className={`size-5 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--muted)' }} />
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('No funds on Arc? Pay the invoice with USDC from another network. It is delivered to the invoice owner on Arc.')}
          </p>

          <label className="mb-1 mt-3 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="pay-source">
            {t('Pay from')}
          </label>
          <select
            id="pay-source"
            value={source}
            disabled={running}
            onChange={(e) => {
              setSource(e.target.value as NetworkId)
              setFeeTotal(undefined)
              setFeeError(false)
              setSteps([])
              setError(null)
            }}
            className="glass-inner min-h-12 w-full rounded-2xl px-3 text-sm font-semibold outline-none"
            style={{ color: 'var(--ink)' }}
          >
            {SOURCES.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>

          <dl className="mt-3 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <div className="flex justify-between gap-4">
              <dt>{t('Invoice amount')}</dt>
              <dd className="tabular-nums">{invoiceAmount.toFixed(2)} USDC</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('Bridge fees')}</dt>
              <dd className="tabular-nums">
                {feeTotal ? `${ceilToCent(feeTotal).toFixed(2)} USDC` : feeError ? t('Estimate unavailable for this route') : t('Estimating...')}
              </dd>
            </div>
            <div className="flex justify-between gap-4 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              <dt>{t('You pay')}</dt>
              <dd className="tabular-nums">{total ? `${total.toFixed(2)} USDC` : '--'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('Your balance on {chain}', { chain: net.label })}</dt>
              <dd className="tabular-nums">{balance ? `${balance.toFixed(2)} USDC` : '--'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
            {t('You need gas on {chain} to start the transfer', { chain: net.label })}
          </p>

          <div className="mt-3">
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
            ) : (
              <button
                disabled={!total || insufficient || running}
                onClick={() => void pay()}
                className="min-h-12 w-full rounded-2xl px-3 text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Bridging...')}
                  </span>
                ) : insufficient ? (
                  t('Insufficient balance')
                ) : total ? (
                  t('Pay {amount} USDC from {chain}', { amount: total.toFixed(2), chain: net.label })
                ) : (
                  t('Pay invoice')
                )}
              </button>
            )}
          </div>

          {steps.length > 0 && (
            <ol className="glass-inner mt-3 flex flex-col gap-2 rounded-2xl p-3">
              {steps.map((s) => (
                <li key={s.name} className="flex items-center justify-between text-xs" style={{ color: 'var(--ink-2)' }}>
                  <span className="flex items-center gap-2">
                    {s.state === 'success' ? <Check className="size-4" style={{ color: 'var(--success)' }} /> : <X className="size-4" style={{ color: 'var(--danger)' }} />}
                    {s.name}
                  </span>
                  {s.explorerUrl && (
                    <a href={s.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={t('View on explorer')} className="flex size-8 items-center justify-center">
                      <ExternalLink className="size-3.5" style={{ color: 'var(--accent-hover)' }} />
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
          {done && (
            <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--success)' }}>
              {t('Payment sent. The invoice shows as paid once the funds arrive on Arc.')}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
              {t(error)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
