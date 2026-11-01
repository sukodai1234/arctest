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

export interface BatchEntry {
  id: number
  to: string
  amount: string
}

/** Validates the form rows. Empty rows are ignored; `line` is the 1-based row number shown to the user. */
export function parseEntries(entries: BatchEntry[]): BatchParse {
  const rows: BatchRow[] = []
  const errors: BatchError[] = []

  entries.forEach((entry, index) => {
    const to = entry.to.trim()
    const value = entry.amount.trim()
    if (!to && !value) return
    const line = index + 1
    if (!to || !value) {
      errors.push({ line, reason: 'Fill in both the address and the amount.' })
      return
    }
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

  return { rows, errors }
}

/** Splits pasted text ("address, amount" per line, separated by comma, semicolon, tab or space) into form values. */
export function splitPasted(text: string): { to: string; amount: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[\s,;]+/).filter(Boolean)
      return { to: parts[0] ?? '', amount: parts[1] ?? '' }
    })
}
