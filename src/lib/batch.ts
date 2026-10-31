import { isAddress } from 'viem'
import { parseAmount, type Amount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'

export const MAX_BATCH_ROWS = 50

export interface BatchRow {
  line: number
  to: `0x${string}`
  amount: Amount
}

export interface BatchError {
  line: number
  /** English source text; translate at render. */
  reason: string
}

export interface BatchParse {
  rows: BatchRow[]
  errors: BatchError[]
}

/** Parses lines like "0xabc..., 1.50" (comma, semicolon, tab or space separated). */
export function parseBatch(input: string): BatchParse {
  const rows: BatchRow[] = []
  const errors: BatchError[] = []
  const lines = input.split(/\r?\n/)

  lines.forEach((raw, index) => {
    const text = raw.trim()
    if (!text) return
    const line = index + 1
    const parts = text.split(/[\s,;]+/).filter(Boolean)
    if (parts.length !== 2) {
      errors.push({ line, reason: 'Use one address and one amount per line.' })
      return
    }
    const [to, value] = parts
    if (!isAddress(to)) {
      errors.push({ line, reason: 'Not a valid wallet address.' })
      return
    }
    try {
      const amount = parseAmount(ARC_CHAIN_ID, value)
      if (!amount.isPositive()) throw new Error('zero')
      rows.push({ line, to, amount })
    } catch {
      errors.push({ line, reason: 'Amount must be greater than zero, with at most 6 decimals.' })
    }
  })

  if (rows.length > MAX_BATCH_ROWS) {
    errors.push({ line: 0, reason: 'Too many recipients. The limit is 50 per batch.' })
  }
  return { rows, errors }
}
