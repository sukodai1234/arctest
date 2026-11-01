import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { ImageUp, Loader2, X } from 'lucide-react'
import { useT } from '@/lib/i18n'

/** Decodes a QR code from pixel data, shrinking large frames first so scanning stays fast. */
function decode(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | undefined {
  const scale = Math.min(1, 720 / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(source, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  return jsQR(image.data, w, h, { inversionAttempts: 'dontInvert' })?.data
}

interface QrScannerProps {
  onResult: (text: string) => void
  onClose: () => void
}

export function QrScanner({ onResult, onClose }: QrScannerProps) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'unavailable'>('starting')

  useEffect(() => {
    let stream: MediaStream | undefined
    let frame = 0
    let stopped = false
    canvasRef.current = document.createElement('canvas')

    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const text = decode(video, video.videoWidth, video.videoHeight, canvas)
        if (text) {
          stopped = true
          onResult(text)
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus('scanning')
        frame = requestAnimationFrame(tick)
      } catch {
        setStatus('unavailable')
      }
    }
    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onResult])

  const [fileError, setFileError] = useState(false)
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setFileError(false)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      const text = decode(bitmap, bitmap.width, bitmap.height, canvas)
      bitmap.close()
      if (text) onResult(text)
      else setFileError(true)
    } catch {
      setFileError(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="size-full object-cover" aria-label={t('Camera preview')} />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2" style={{ borderColor: 'rgba(255,255,255,0.85)' }} />
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="size-4 animate-spin" /> {t('Starting camera...')}
          </div>
        )}
        {status === 'unavailable' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
            {t('The camera is not available. Allow camera access, or upload a picture of the code instead.')}
          </div>
        )}
      </div>
      {fileError && (
        <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('No QR code was found in that picture.')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label
          className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          <ImageUp className="size-4" /> {t('Upload QR picture')}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          <X className="size-4" /> {t('Cancel')}
        </button>
      </div>
    </div>
  )
}
