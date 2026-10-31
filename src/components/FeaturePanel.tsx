import { useT } from '@/lib/i18n'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

interface FeaturePanelProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Bottom sheet on small screens, inline column on large screens. */
export function FeaturePanel({ title, onClose, children }: FeaturePanelProps) {
  const t = useT()
  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-label={t(title)}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl lg:static lg:z-auto lg:mx-0 lg:max-h-none lg:max-w-none lg:overflow-visible lg:rounded-none lg:!bg-transparent lg:!shadow-none"
        style={{
          background: 'var(--surface-pop)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          boxShadow: '0 -12px 40px rgba(18,45,69,0.16)',
        }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className="flex justify-center pt-3 lg:hidden">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3 lg:px-1 lg:pt-0">
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            {t(title)}
          </h2>
          <button
            type="button"
            aria-label={t('Close {title}', { title: t(title) })}
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <X className="size-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6 lg:overflow-visible lg:px-0 lg:pb-0">{children}</div>
      </motion.aside>
    </>
  )
}
