/** Currencies Arc Pay can price in. `numeric` is the ISO 4217 code used inside merchant QR codes. */
export const FIAT_CURRENCIES = [
  { code: 'USD', name: 'US dollar', numeric: '840', decimals: 2 },
  { code: 'EUR', name: 'Euro', numeric: '978', decimals: 2 },
  { code: 'VND', name: 'Vietnamese dong', numeric: '704', decimals: 0 },
  { code: 'THB', name: 'Thai baht', numeric: '764', decimals: 2 },
  { code: 'IDR', name: 'Indonesian rupiah', numeric: '360', decimals: 0 },
  { code: 'MYR', name: 'Malaysian ringgit', numeric: '458', decimals: 2 },
  { code: 'SGD', name: 'Singapore dollar', numeric: '702', decimals: 2 },
  { code: 'PHP', name: 'Philippine peso', numeric: '608', decimals: 2 },
  { code: 'JPY', name: 'Japanese yen', numeric: '392', decimals: 0 },
  { code: 'KRW', name: 'South Korean won', numeric: '410', decimals: 0 },
  { code: 'CNY', name: 'Chinese yuan', numeric: '156', decimals: 2 },
  { code: 'INR', name: 'Indian rupee', numeric: '356', decimals: 2 },
  { code: 'GBP', name: 'British pound', numeric: '826', decimals: 2 },
  { code: 'AUD', name: 'Australian dollar', numeric: '036', decimals: 2 },
  { code: 'CAD', name: 'Canadian dollar', numeric: '124', decimals: 2 },
  { code: 'CHF', name: 'Swiss franc', numeric: '756', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong dollar', numeric: '344', decimals: 2 },
  { code: 'BRL', name: 'Brazilian real', numeric: '986', decimals: 2 },
  { code: 'MXN', name: 'Mexican peso', numeric: '484', decimals: 2 },
] as const

export type FiatCode = (typeof FIAT_CURRENCIES)[number]['code']

export const getFiat = (code: string) => FIAT_CURRENCIES.find((c) => c.code === code)
export const fiatByNumeric = (numeric: string) => FIAT_CURRENCIES.find((c) => c.numeric === numeric)

export interface FxRate {
  code: string
  /** Units of this currency for one US dollar (and so for one USDC). */
  perUsd: number
  /** Human-readable name of the rate publisher. */
  source: string
  /** Date or time the publisher gave for this rate. */
  asOf: string
}

const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; rate: FxRate }>()

async function fromEcb(code: string): Promise<FxRate | undefined> {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${code}`)
  if (!res.ok) return undefined
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> }
  const perUsd = json.rates?.[code]
  if (!perUsd || !Number.isFinite(perUsd) || perUsd <= 0) return undefined
  return { code, perUsd, source: 'European Central Bank reference rate', asOf: json.date ?? '' }
}

async function fromMarket(code: string): Promise<FxRate | undefined> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) return undefined
  const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string }
  const perUsd = json.rates?.[code]
  if (!perUsd || !Number.isFinite(perUsd) || perUsd <= 0) return undefined
  return { code, perUsd, source: 'ExchangeRate-API market rate', asOf: json.time_last_update_utc ?? '' }
}

/**
 * Looks up the rate for one currency. The European Central Bank reference rate is used when it covers the
 * currency; otherwise an aggregated market rate. USD itself is exactly 1, because 1 USDC is 1 US dollar.
 */
export async function getFxRate(code: string): Promise<FxRate> {
  if (code === 'USD') return { code, perUsd: 1, source: 'USDC is a US dollar stablecoin', asOf: '' }
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rate
  const rate = (await fromEcb(code).catch(() => undefined)) ?? (await fromMarket(code).catch(() => undefined))
  if (!rate) throw new Error('No exchange rate available')
  cache.set(code, { at: Date.now(), rate })
  return rate
}

/** USDC to pay for a local-currency price. Rounded up to the next cent so the merchant never receives less. */
export function fiatToUsdc(fiatAmount: string, perUsd: number): string | undefined {
  const value = Number(fiatAmount)
  if (!Number.isFinite(value) || value <= 0 || perUsd <= 0) return undefined
  const cents = Math.max(1, Math.ceil((value / perUsd) * 100 - 1e-9))
  return (cents / 100).toFixed(2)
}

/** Accepts a plain positive decimal with at most `decimals` places and at most 12 digits. */
export function cleanFiatAmount(value: string | null | undefined, decimals = 2): string | undefined {
  const text = (value ?? '').trim()
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(text)) return undefined
  const [, fraction = ''] = text.split('.')
  if (fraction.length > Math.max(decimals, 2)) return undefined
  return Number(text) > 0 ? text : undefined
}
