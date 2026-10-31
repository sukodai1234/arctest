import { Moon, Sun } from 'lucide-react'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

/** Language and light/dark switches. */
export function Preferences() {
  const { lang, setLang, t } = useI18n()
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <div className="mt-6 flex flex-col gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
        {t('Preferences')}
      </div>

      <div role="group" aria-label={t('Language')} className="flex gap-1 rounded-2xl p-1" style={{ background: 'var(--surface-muted)' }}>
        {LANGUAGES.map((l) => {
          const selected = l.id === lang
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setLang(l.id)}
              className="min-h-10 flex-1 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={selected ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { color: 'var(--ink-2)' }}
            >
              {l.label}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={dark}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        className="flex min-h-12 items-center justify-between rounded-2xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
      >
        <span className="flex items-center gap-2">
          {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
          {dark ? t('Dark mode') : t('Light mode')}
        </span>
        <span
          className="relative h-6 w-11 rounded-full transition-colors"
          style={{ background: dark ? 'var(--accent)' : 'var(--border-strong)' }}
        >
          <span
            className="absolute top-0.5 size-5 rounded-full transition-all"
            style={{ left: dark ? '1.35rem' : '0.125rem', background: dark ? 'var(--on-accent)' : '#fff' }}
          />
        </span>
      </button>
    </div>
  )
}
