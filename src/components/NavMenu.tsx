import { Preferences } from './Preferences'
import { useT } from '@/lib/i18n'
import type { ReactNode } from 'react'

export type FeatureId = 'wallet' | 'tip' | 'request' | 'shop' | 'fund' | 'gift' | 'invoices' | 'batch' | 'swap' | 'bridge'

export interface NavItem {
  id: FeatureId
  label: string
  hint: string
  icon: ReactNode
}

interface NavMenuProps {
  items: NavItem[]
  active: FeatureId | null
  onSelect: (id: FeatureId) => void
}

export function NavMenu({ items, active, onSelect }: NavMenuProps) {
  const t = useT()
  return (
    <nav aria-label={t('Tools')} className="flex flex-col gap-1.5">
      <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
        {t('Tools')}
      </div>
      {items.map((item) => {
        const selected = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={
              selected
                ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                : { background: 'transparent', color: 'var(--ink-2)' }
            }
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: selected ? 'color-mix(in srgb, var(--on-accent) 16%, transparent)' : 'var(--surface-muted)' }}
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t(item.label)}</span>
              <span className="block truncate text-xs" style={{ opacity: selected ? 0.75 : 0.6 }}>
                {t(item.hint)}
              </span>
            </span>
          </button>
        )
      })}
      <Preferences />
    </nav>
  )
}
