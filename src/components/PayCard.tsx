import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { Check, ClipboardPaste, ExternalLink, Loader2, ScanLine, ShieldAlert } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID, ARC_CHAIN_NAME, USDC_ADDRESS, parseOnchainError } from '@/lib/arc'
import { parsePaymentCode, type PaymentRequest } from '@/lib/payqr'
import { useT } from '@/lib/i18n'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { usePayQuote } from '@/hooks/usePayQuote'
import { PAY_TOKENS, executePaymentSwap, getPayToken, paySwapError, type PayToken } from '@/lib/payQuote'
import { HISTORY_KEY } from '@/hooks/useTransferHistory'
import { QrScanner } from './QrScanner'
import { PayFromNetwork } from './PayFromNetwork'

type Stage = 'idle' | 'scan' | 'review'

export function PayCard() {
  const t = useT()
  const queryClient = useQueryClient()
  const { isConnected, chainId, connector } = useAccount()
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { balances, refetch } = useTokenBalances()
  const { writeContract, data: hash, isPending, error, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: receiptFailed } = useWaitForTransactionReceipt({ hash })

  const [stage, setStage] = useState<Stage>('idle')
  const [request, setRequest] = useState<PaymentRequest | undefined>()
  const [typed, setTyped] = useState('')
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const settled = useRef<string | undefined>(undefined)
  const [payToken, setPayToken] = useState<PayToken>('USDC')
  const [swapping, setSwapping] = useState(false)
  const [swapProblem, setSwapProblem] = useState<string | null>(null)
  const [swapDone, setSwapDone] = useState(false)
  const [paidWith, setPaidWith] = useState<string | undefined>()

  const info = getPayToken(payToken)
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID
  const amountText = request?.amount ?? typed
  const parsed = useMemo(() => {
    if (!amountText) return undefined
    try {
      const value = Amount.parse(amountText, 6)
      return value.isPositive() ? value : undefined
    } catch {
      return undefined
    }
  }, [amountText])
  const { quote, loading: quoting, refreshing, error: quoteProblem } = usePayQuote(payToken, parsed?.raw)
  const payBalance = balances[payToken]
  const needed = payToken === 'USDC' ? parsed : quote?.amountIn
  const insufficient = Boolean(needed && payBalance && needed.gt(payBalance))

  const open = useCallback((text: string) => {
    const result = parsePaymentCode(text)
    if (!result.ok) {
      setProblem(result.reason)
      setStage('idle')
      return
    }
    setProblem(null)
    setRequest(result.request)
    setTyped('')
    setStage('review')
  }, [])

  const back = () => {
    resetWrite()
    settled.current = undefined
    setPayToken('USDC')
    setSwapDone(false)
    setSwapProblem(null)
    setPaidWith(undefined)
    setRequest(undefined)
    setTyped('')
    setPasted('')
    setProblem(null)
    setStage('idle')
  }

  useEffect(() => {
    if (!isSuccess || !hash || settled.current === hash) return
    settled.current = hash
    toast.success(t('Payment confirmed'))
    void refetch()
    void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
  }, [isSuccess, hash, refetch, queryClient, t])

  const sendUsdc = () => {
    if (!request || !parsed) return
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [request.to, parsed.raw],
      chainId: ARC_CHAIN_ID,
    })
  }

  // Step 1: swap into exactly enough USDC. Step 2: send that USDC to the merchant.
  const paySwap = async () => {
    if (!quote || !connector || !parsed) return
    setSwapProblem(null)
    setSwapping(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const provider = (await connector.getProvider()) as EIP1193Provider
      await executePaymentSwap(provider, quote)
      setPaidWith(`${quote.amountIn.toString()} ${info.symbol}`)
      await refetch()
      setSwapDone(true)
      setPayToken('USDC')
      sendUsdc()
    } catch (e) {
      const message = paySwapError(e)
      if (message) setSwapProblem(message)
    } finally {
      setSwapping(false)
    }
  }

  const pay = () => {
    if (wrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID })
      return
    }
    if (!request || !parsed) return
    if (payToken !== 'USDC') {
      void paySwap()
      return
    }
    if (insufficient) return
    sendUsdc()
  }

  const busy = isPending || isConfirming || isSwitching || swapping
  const errorMessage = error ? parseOnchainError(error) : null

  if (stage === 'scan') {
    return (
      <section className="glass-card rounded-3xl p-5">
        <QrScanner onResult={open} onClose={() => setStage('idle')} />
      </section>
    )
  }

  if (stage === 'review' && request) {
    const done = isSuccess && Boolean(hash)
    let label = t('Pay {amount} USDC', { amount: parsed ? parsed.toString() : '' })
    if (payToken !== 'USDC' && quote) label = t('Swap and pay {amount} {token}', { amount: quote.amountIn.toString(), token: info.symbol })
    if (wrongChain) label = t('Switch to {chain}', { chain: ARC_CHAIN_NAME })
    else if (insufficient) label = t('Insufficient balance')
    else if (!parsed) label = t('Enter an amount')
    const waitingQuote = payToken !== 'USDC' && !quote && !wrongChain && Boolean(parsed)

    return (
      <section className="glass-card rounded-3xl p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>
          {t('You are paying')}
        </div>
        <div className="display mt-1 break-words text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {request.merchant ?? t('A wallet address')}
        </div>
        <div className="mono mt-1 break-all text-xs" style={{ color: 'var(--muted)' }}>
          {request.to}
        </div>

        {request.invoice && (
          <div className="glass-inner mt-3 rounded-2xl p-3 text-sm">
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>
              {t('Invoice {id}', { id: request.invoice.id })}
              {request.invoice.due && (
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>
                  {t('Due {date}', { date: request.invoice.due })}
                </span>
              )}
            </div>
            {request.invoice.note && (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {request.invoice.note}
              </div>
            )}
          </div>
        )}

        <label className="mb-1 mt-4 block text-xs font-medium" style={{ color: 'var(--muted)' }} htmlFor="pay-amount">
          {t('Amount to pay (US dollars)')}
        </label>
        <div className="field glass-inner flex items-center gap-2 rounded-2xl px-4 py-3 transition-shadow">
          <input
            id="pay-amount"
            inputMode="decimal"
            value={amountText}
            readOnly={Boolean(request.amount) || busy || done}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setTyped(v)
            }}
            placeholder="0.00"
            className="display min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>
            USD
          </span>
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
          {t('The merchant receives USDC. One dollar is one USDC.')}
        </div>

        {!done && parsed && isConnected && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
              {t('Pay with')}
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Pay with')}>
              {PAY_TOKENS.map((tk) => {
                const selected = tk.id === payToken
                const held = balances[tk.id]
                return (
                  <button
                    key={tk.id}
                    type="button"
                    disabled={busy}
                    aria-pressed={selected}
                    onClick={() => {
                      setPayToken(tk.id)
                      setSwapProblem(null)
                    }}
                    className="flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-center transition-colors disabled:opacity-50"
                    style={{
                      background: selected ? 'var(--accent)' : 'var(--surface-muted)',
                      color: selected ? 'var(--on-accent)' : 'var(--ink-2)',
                    }}
                  >
                    <span className="text-sm font-semibold">{tk.symbol}</span>
                    <span className="text-[11px] opacity-80">{t(tk.name)}</span>
                    <span className="text-[11px] tabular-nums opacity-80">{held ? held.toFixed(tk.decimals <= 6 ? 2 : 6) : '--'}</span>
                  </button>
                )
              })}
            </div>

            {payToken !== 'USDC' && (
              <div className="glass-inner mt-3 rounded-2xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--muted)' }}>{t('You pay (estimate)')}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {quote ? `${quote.amountIn.toFixed(info.decimals <= 6 ? 4 : 8)} ${info.symbol}` : quoting ? <Loader2 className="size-4 animate-spin" /> : '--'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span style={{ color: 'var(--muted)' }}>{t('Merchant receives')}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    ${parsed.toString()} USDC
                  </span>
                </div>
                {refreshing && (
                  <div className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                    {t('Updating quote...')}
                  </div>
                )}
                {quoteProblem && (
                  <div role="alert" className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                    {t(quoteProblem)}
                  </div>
                )}
                <p className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
                  {t('Step 1 swaps into the USDC needed, step 2 sends it. If the swap returns a little more than needed, the extra stays in your wallet.')}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                  {t('Swaps run through a swap provider (a third-party aggregator or Circle), which may change by route and is subject to its terms. Estimates can move before the swap completes.')}
                </p>
              </div>
            )}
            <div className="mt-2 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
              {payBalance ? t('Balance: {amount}', { amount: payBalance.toFixed(info.decimals <= 6 ? 2 : 6) }) : ''}
            </div>
          </div>
        )}

        {swapDone && !done && (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            {t('Swap done. Now sending the USDC to the merchant.')}
          </p>
        )}

        {!done && (
          <p className="mt-3 flex items-start gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {t('Check the name and the address before you pay. Payments cannot be reversed.')}
          </p>
        )}

        <div className="mt-4">
          {done && hash ? (
            <div className="glass-inner rounded-2xl p-4">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
                <Check className="size-4" /> {t('Payment confirmed')}
              </div>
              {paidWith && (
                <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {t('Paid with {amount}.', { amount: paidWith })}
                </div>
              )}
              <a
                href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--accent-hover)' }}
              >
                {t('View on explorer')} <ExternalLink className="size-3" />
              </a>
              <button
                type="button"
                onClick={back}
                className="mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)]"
                style={{ background: 'var(--accent)' }}
              >
                {t('Scan another code')}
              </button>
            </div>
          ) : !isConnected ? (
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
            <>
              <button
                disabled={busy || waitingQuote || (!wrongChain && (!parsed || insufficient))}
                onClick={pay}
                className="min-h-12 w-full rounded-2xl text-sm font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {swapping ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Step 1 of 2: swapping...')}
                  </span>
                ) : isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Confirm in wallet...')}
                  </span>
                ) : isConfirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Confirming...')}
                  </span>
                ) : waitingQuote ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t('Getting quote...')}
                  </span>
                ) : (
                  label
                )}
              </button>
              <button type="button" onClick={back} disabled={busy} className="mt-2 min-h-11 w-full text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t('Cancel')}
              </button>
            </>
          )}
        </div>

        {errorMessage && (
          <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
            {t(errorMessage)}
          </p>
        )}
        {swapProblem && (
          <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
            {t(swapProblem)}
          </p>
        )}
        {receiptFailed && (
          <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
            {t('The transaction failed onchain. Your funds were not sent.')}
          </p>
        )}

        {!done && parsed && isConnected && <PayFromNetwork to={request.to} amount={parsed.toString()} />}
      </section>
    )
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
        {t('Scan a QR code to pay a cafe, a restaurant, a shop or an invoice with USDC.')}
      </p>
      <button
        type="button"
        onClick={() => {
          setProblem(null)
          setStage('scan')
        }}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-[color:var(--on-accent)] transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: 'var(--accent)' }}
      >
        <ScanLine className="size-5" /> {t('Scan QR code')}
      </button>

      <div className="mt-5 text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {t('Or paste a payment link or wallet address')}
      </div>
      <div className="mt-1 flex gap-2">
        <div className="field glass-inner min-w-0 flex-1 rounded-2xl px-4 py-3 transition-shadow">
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={t('Payment link or wallet address')}
            placeholder="https://... or 0x..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <button
          type="button"
          disabled={!pasted.trim()}
          onClick={() => open(pasted)}
          aria-label={t('Continue')}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          <ClipboardPaste className="size-5" />
        </button>
      </div>

      {problem && (
        <p role="alert" className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
          {t(problem)}
        </p>
      )}

      <ul className="mt-5 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
        <li>{t('Works with Arc Pay shop and invoice codes, wallet payment codes for USDC on Arc, and plain addresses.')}</li>
        <li>{t('No USDC on Arc? You can pay from another network with Circle cross-chain transfers.')}</li>
      </ul>
      <p className="mt-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
        {t('Payments are sent from your own wallet on Arc Testnet.')}
      </p>
    </section>
  )
}
