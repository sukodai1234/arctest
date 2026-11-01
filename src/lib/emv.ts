import { fiatByNumeric } from '@/lib/fx'

/** What a local merchant QR (EMVCo standard, used by VietQR, PromptPay, QRIS, DuitNow and others) tells us. */
export interface EmvMerchantCode {
  name?: string
  city?: string
  country?: string
  /** ISO 4217 alphabetic code when it is one Arc Pay knows, otherwise the numeric code. */
  currency: string
  currencyKnown: boolean
  amount?: string
}

function parseTlv(text: string): Map<string, string> | undefined {
  const fields = new Map<string, string>()
  let i = 0
  while (i < text.length) {
    if (i + 4 > text.length) return undefined
    const tag = text.slice(i, i + 2)
    const length = Number(text.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length)) return undefined
    const value = text.slice(i + 4, i + 4 + length)
    if (value.length !== length) return undefined
    fields.set(tag, value)
    i += 4 + length
  }
  return fields
}

/** CRC-16/CCITT-FALSE, as required by the EMVCo merchant QR specification. */
function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Returns the merchant details when the text is a valid EMVCo merchant QR, otherwise undefined. */
export function parseEmvMerchantCode(raw: string): EmvMerchantCode | undefined {
  const text = raw.trim()
  if (!text.startsWith('000201') || text.length < 20) return undefined
  const crcAt = text.length - 8
  if (text.slice(crcAt, crcAt + 4) !== '6304') return undefined
  if (crc16(text.slice(0, crcAt + 4)) !== text.slice(crcAt + 4).toUpperCase()) return undefined
  const fields = parseTlv(text)
  const numeric = fields?.get('53')
  if (!fields || !numeric) return undefined
  const fiat = fiatByNumeric(numeric)
  const amount = fields.get('54')
  return {
    name: fields.get('59')?.slice(0, 40),
    city: fields.get('60')?.slice(0, 30),
    country: fields.get('58')?.slice(0, 2),
    currency: fiat?.code ?? numeric,
    currencyKnown: Boolean(fiat),
    amount: amount && /^\d{1,12}(\.\d{1,4})?$/.test(amount) ? amount : undefined,
  }
}
