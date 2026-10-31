import { useT } from '@/lib/i18n'
import { ConnectKitButton } from 'connectkit'
import { Menu } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { shortAddress } from '@/lib/arc'

export function Header({ onMenu }: { onMenu?: () => void }) {
  const t = useT()
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {onMenu && (
          <button
            type="button"
            aria-label={t('Open tools menu')}
            onClick={onMenu}
            className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] lg:hidden"
          >
            <Menu className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        )}
        <TokenUSDC variant="branded" size={28} />
        <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
          Arc Pay
        </span>
      </div>
      <ConnectKitButton.Custom>
        {({ isConnected, show, address }) => (
          <button
            onClick={show}
            className="min-h-11 rounded-full px-4 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={
              isConnected
                ? { background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }
                : { background: 'var(--accent)', color: 'var(--on-accent)' }
            }
          >
            {isConnected && address ? <span className="mono text-xs">{shortAddress(address)}</span> : t('Connect Wallet')}
          </button>
        )}
      </ConnectKitButton.Custom>
    </header>
  )
}
