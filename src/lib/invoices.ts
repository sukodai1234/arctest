export interface Invoice {
  id: string
  to: string
  amount: string
  due: string
  note: string
  createdAt: number
  paidTx?: string
}

const KEY = 'arcpay-invoices-v1'
export const NOTE_MAX = 60

export function loadInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Invoice[]) : []
  } catch {
    return []
  }
}

export function saveInvoices(list: Invoice[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function nextInvoiceId(list: Invoice[]): string {
  const max = list.reduce((m, inv) => {
    const n = Number(inv.id.replace(/\D/g, ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `INV-${String(max + 1).padStart(4, '0')}`
}

export const todayIso = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type InvoiceStatus = 'paid' | 'overdue' | 'unpaid'

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.paidTx) return 'paid'
  if (inv.due && todayIso() > inv.due) return 'overdue'
  return 'unpaid'
}

export function invoiceQuery(inv: Invoice): string {
  const params = new URLSearchParams({ to: inv.to, amount: inv.amount, inv: inv.id })
  if (inv.due) params.set('due', inv.due)
  if (inv.note) params.set('note', inv.note)
  return params.toString()
}

/** Reads invoice details from a payment link. Text is shown as plain text only. */
export function readInvoiceParams(search: string): { id: string; due: string; note: string } | undefined {
  const params = new URLSearchParams(search)
  const id = (params.get('inv') ?? '').slice(0, 20)
  if (!id) return undefined
  const dueRaw = params.get('due') ?? ''
  const due = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : ''
  return { id, due, note: (params.get('note') ?? '').slice(0, NOTE_MAX) }
}
