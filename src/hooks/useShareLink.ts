import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getShareBase } from '@/lib/share'

/** Resolves the public share base once on mount (never read window.location for links that leave the app). */
export function useShareBase(): string | undefined {
  const [base, setBase] = useState<string | undefined>()
  useEffect(() => {
    let active = true
    void getShareBase().then((url) => {
      if (active) setBase(url)
    })
    return () => {
      active = false
    }
  }, [])
  return base
}

/** Renders a QR code for `link` as a PNG data URL; undefined while there is no link. */
export function useQrDataUrl(link: string | undefined, size = 240): string | undefined {
  const [result, setResult] = useState<{ link: string; url: string } | undefined>()
  useEffect(() => {
    if (!link) return
    let active = true
    void QRCode.toDataURL(link, { width: size, margin: 1, color: { dark: '#122d45', light: '#ffffff' } }).then((url) => {
      if (active) setResult({ link, url })
    })
    return () => {
      active = false
    }
  }, [link, size])
  return result && result.link === link ? result.url : undefined
}
