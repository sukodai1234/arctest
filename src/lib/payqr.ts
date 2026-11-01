import { isAddress } from 'viem'
import { Amount, parseAmount } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'
import { readInvoiceParams } from '@/lib/invoices'

type InvoiceParams = NonNullable<ReturnType<typeof readInvoiceParams>>

export interface PaymentRequest {
  to: `0x${string}`
  /** USDC amount as a decimal string, when the code fixes one. */
  amount?: string
  /** Merchant or shop name, as text only. */
  merchant?: string
  invoice?: InvoiceParams
  /** Where the request came from, to explain it to the payer. */
  source: 'arcpay' | 'eip681' | 'address'
}

export type ParseResult = { ok: true; request: PaymentRequest } | { ok: false; reason: string }

const fail = (reason: string): ParseResult => ({ ok: false, reason })

function cleanAmount(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = parseAmount(ARC_CHAIN_ID, value.trim())
    return parsed.isPositive() ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

/** Arc Pay payment links: any URL carrying `to` (and optionally amount, shop, invoice fields). */
function parseLink(text: string): ParseResult | undefined {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  const to = url.searchParams.get('to')
  if (!to) return undefined
  if (!isAddress(to)) return fail('This code has an invalid wallet address.')
  const invoice = readInvoiceParams(url.search) ?? undefined
  return {
    ok: true,
    request: {
      to,
      amount: cleanAmount(url.searchParams.get('amount')),
      merchant: (url.searchParams.get('shop') ?? '').slice(0, 40) || undefined,
      invoice,
      source: 'arcpay',
    },
  }
}

/** EIP-681: ethereum:<token>@<chain>/transfer?address=<to>&uint256=<raw>, or a native transfer with ?value=<wei>. */
function parseEip681(text: string): ParseResult | undefined {
  const match = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/([a-zA-Z]+))?(?:\?(.*))?$/.exec(text)
  if (!match) return undefined
  const [, target, chain, fn, query] = match
  if (chain && Number(chain) !== ARC_CHAIN_ID) return fail('This code is for a different network. Arc Pay pays on Arc Testnet.')
  const params = new URLSearchParams(query ?? '')

  if (fn === 'transfer') {
    if (target.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return fail('This code asks for a token other than USDC.')
    const to = params.get('address')
    if (!to || !isAddress(to)) return fail('This code has an invalid wallet address.')
    const rawText = params.get('uint256')
    let amount: string | undefined
    if (rawText && /^\d+$/.test(rawText)) {
      const raw = BigInt(rawText)
      if (raw > 0n) amount = Amount.fromRaw(raw, 6).toString()
    }
    return { ok: true, request: { to, amount, source: 'eip681' } }
  }

  if (!fn) {
    // Native transfer: on Arc the native asset is USDC, shown with 18 decimals in the native view.
    const value = params.get('value')
    let amount: string | undefined
    if (value && /^\d+$/.test(value)) {
      const rawUsdc = BigInt(value) / 10n ** 12n
      if (rawUsdc > 0n) amount = Amount.fromRaw(rawUsdc, 6).toString()
    }
    return { ok: true, request: { to: target as `0x${string}`, amount, source: 'eip681' } }
  }
  return fail('This payment code type is not supported.')
}

/** Reads whatever a QR code or pasted text contains and turns it into a payment request. */
export function parsePaymentCode(input: string): ParseResult {
  const text = input.trim()
  if (!text) return fail('Nothing to read.')
  if (isAddress(text)) return { ok: true, request: { to: text, source: 'address' } }
  return parseEip681(text) ?? parseLink(text) ?? fail('This code is not a payment request Arc Pay understands.')
}
