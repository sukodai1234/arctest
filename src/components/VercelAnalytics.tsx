import { Analytics } from '@vercel/analytics/react'

/** Page-view analytics only make sense on Vercel: the script is served from /_vercel on that host. */
const onVercel = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')

export function VercelAnalytics() {
  return import.meta.env.PROD && onVercel ? <Analytics /> : null
}
