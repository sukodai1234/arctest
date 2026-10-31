import { Amount } from '@/onchain-money'
import { useT } from '@/lib/i18n'

const STEPS = [25, 50, 75, 100] as const

interface PercentChipsProps {
  balance: Amount | undefined
  /** Kept back from the 100% choice, e.g. to pay network fees in the same token. */
  reserve?: Amount
  disabled?: boolean
  onPick: (amount: string) => void
}

/** Quick picks that fill an amount field with a share of the balance. */
export function PercentChips({ balance, reserve, disabled, onPick }: PercentChipsProps) {
  const t = useT()

  const pick = (pct: number) => {
    if (!balance) return
    let raw = (balance.raw * BigInt(pct)) / 100n
    if (pct === 100 && reserve && reserve.decimals === balance.decimals) raw = raw > reserve.raw ? raw - reserve.raw : 0n
    onPick(raw > 0n ? Amount.fromRaw(raw, balance.decimals).toString() : '')
  }

  return (
    <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={t('Share of balance')}>
      {STEPS.map((pct) => (
        <button
          key={pct}
          type="button"
          disabled={disabled || !balance || balance.isZero()}
          aria-label={t('Use {pct}% of balance', { pct })}
          onClick={() => pick(pct)}
          className="min-h-11 rounded-xl text-sm font-semibold tabular-nums transition-all hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          {pct}%
        </button>
      ))}
    </div>
  )
}
