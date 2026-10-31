import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { shortAddress } from '@/lib/arc'

export function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
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
                : { background: 'var(--accent)', color: '#fff' }
            }
          >
            {isConnected && address ? <span className="mono text-xs">{shortAddress(address)}</span> : 'Connect Wallet'}
          </button>
        )}
      </ConnectKitButton.Custom>
    </header>
  )
}
