/**
 * مسودة الفاتورة في المحرّر: رأس الفاتورة + البنود + مجاميع حيّة من محرّك الحساب المركزي.
 * لا يوجد أي منطق حساب هنا؛ كل شيء يمرّ عبر calcTotals حتى تتطابق الواجهة مع ما تخزّنه العملية الرئيسية.
 */
import { createStore, type StoreApi, useStore } from 'zustand'
import type { CustomerSnapshot, DocType, Invoice, InvoiceInput, InvoiceItemInput, InvoiceStatus, Payment } from '@shared/invoicing'
import { calcTotals, type TotalsResult } from '../shared/calc'

export interface DraftItem extends InvoiceItemInput {
  key: string
}

export interface DraftHeader {
  id: number | null
  docType: DocType
  number: string | null
  status: InvoiceStatus
  customerId: number | null
  customerSnapshot: CustomerSnapshot | null
  issueDate: string
  dueDate: string | null
  reference: string
  purchaseOrder: string
  currency: string
  currencyPosition: 'before' | 'after'
  paymentMethod: string
  notes: string
  paymentTerms: string
  templateId: number | null
  shippingMinor: number
  feesMinor: number
  amountInWords: boolean
  source: 'manual' | 'pdf_import' | 'spreadsheet'
  sourceDocumentId: number | null
}

export interface DraftState {
  header: DraftHeader
  items: DraftItem[]
  payments: Payment[]
  paidMinor: number
  totals: TotalsResult
  dirty: boolean
  savedSnapshot: string
  setHeader: (patch: Partial<DraftHeader>) => void
  setItem: (key: string, patch: Partial<DraftItem>) => void
  addItem: (item?: Partial<DraftItem>, index?: number) => string
  addItems: (items: Partial<DraftItem>[]) => void
  removeItem: (key: string) => void
  moveItem: (key: string, delta: number) => void
  duplicateItem: (key: string) => void
  loadInvoice: (invoice: Invoice) => void
  markSaved: () => void
  toInput: () => InvoiceInput
}

let seq = 0
const key = () => `row-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function emptyItem(defaults: { taxBps: number; taxName: string; unit?: string }): DraftItem {
  return { key: key(), name: '', description: '', quantityMilli: 1000, unit: defaults.unit ?? '', unitPriceMinor: 0, discountBps: 0, taxBps: defaults.taxBps, taxName: defaults.taxName, productId: null }
}

function recalc(items: DraftItem[], header: DraftHeader, paidMinor: number): TotalsResult {
  return calcTotals({
    lines: items.map((it) => ({ quantityMilli: it.quantityMilli, unitPriceMinor: it.unitPriceMinor, discountBps: it.discountBps, taxBps: it.taxBps })),
    shippingMinor: header.shippingMinor,
    feesMinor: header.feesMinor,
    paidMinor
  })
}

function snapshot(header: DraftHeader, items: DraftItem[]): string {
  return JSON.stringify({ header, items: items.map(({ key: _k, ...rest }) => rest) })
}

export function createDraftStore(initialHeader: DraftHeader, initialItems: DraftItem[]): StoreApi<DraftState> {
  return createStore<DraftState>((set, get) => {
    const commit = (header: DraftHeader, items: DraftItem[], paidMinor = get().paidMinor) =>
      set({ header, items, paidMinor, totals: recalc(items, header, paidMinor), dirty: snapshot(header, items) !== get().savedSnapshot })
    return {
      header: initialHeader,
      items: initialItems,
      payments: [],
      paidMinor: 0,
      totals: recalc(initialItems, initialHeader, 0),
      dirty: false,
      savedSnapshot: snapshot(initialHeader, initialItems),

      setHeader: (patch) => commit({ ...get().header, ...patch }, get().items),
      setItem: (k, patch) => commit(get().header, get().items.map((it) => (it.key === k ? { ...it, ...patch } : it))),
      addItem: (item, index) => {
        const row: DraftItem = { ...emptyItem({ taxBps: 0, taxName: '' }), ...item, key: key() }
        const items = [...get().items]
        items.splice(index ?? items.length, 0, row)
        commit(get().header, items)
        return row.key
      },
      addItems: (rows) => commit(get().header, [...get().items, ...rows.map((r) => ({ ...emptyItem({ taxBps: 0, taxName: '' }), ...r, key: key() }))]),
      removeItem: (k) => commit(get().header, get().items.filter((it) => it.key !== k)),
      moveItem: (k, delta) => {
        const items = [...get().items]
        const i = items.findIndex((it) => it.key === k)
        const j = i + delta
        if (i < 0 || j < 0 || j >= items.length) return
        ;[items[i], items[j]] = [items[j], items[i]]
        commit(get().header, items)
      },
      duplicateItem: (k) => {
        const items = [...get().items]
        const i = items.findIndex((it) => it.key === k)
        if (i < 0) return
        items.splice(i + 1, 0, { ...items[i], key: key() })
        commit(get().header, items)
      },
      loadInvoice: (inv) => {
        const header: DraftHeader = {
          id: inv.id, docType: inv.docType, number: inv.number, status: inv.status, customerId: inv.customerId, customerSnapshot: inv.customerSnapshot,
          issueDate: inv.issueDate, dueDate: inv.dueDate, reference: inv.reference, purchaseOrder: inv.purchaseOrder, currency: inv.currency,
          currencyPosition: inv.currencyPosition, paymentMethod: inv.paymentMethod, notes: inv.notes, paymentTerms: inv.paymentTerms, templateId: inv.templateId,
          shippingMinor: inv.shippingMinor, feesMinor: inv.feesMinor, amountInWords: inv.amountInWords, source: inv.source as DraftHeader['source'], sourceDocumentId: inv.sourceDocumentId
        }
        const items: DraftItem[] = inv.items.map((it) => ({
          key: key(), id: it.id, productId: it.productId, name: it.name, description: it.description, quantityMilli: it.quantityMilli, unit: it.unit,
          unitPriceMinor: it.unitPriceMinor, discountBps: it.discountBps, taxBps: it.taxBps, taxName: it.taxName
        }))
        const snap = snapshot(header, items)
        set({ header, items, payments: inv.payments, paidMinor: inv.paidMinor, totals: recalc(items, header, inv.paidMinor), dirty: false, savedSnapshot: snap })
      },
      markSaved: () => set({ savedSnapshot: snapshot(get().header, get().items), dirty: false }),
      toInput: () => {
        const { header, items } = get()
        return {
          id: header.id ?? undefined, docType: header.docType, number: header.number, status: header.status, customerId: header.customerId,
          customerSnapshot: header.customerSnapshot, issueDate: header.issueDate, dueDate: header.dueDate, reference: header.reference,
          purchaseOrder: header.purchaseOrder, currency: header.currency, currencyPosition: header.currencyPosition, paymentMethod: header.paymentMethod,
          notes: header.notes, paymentTerms: header.paymentTerms, templateId: header.templateId, shippingMinor: header.shippingMinor, feesMinor: header.feesMinor,
          amountInWords: header.amountInWords, source: header.source, sourceDocumentId: header.sourceDocumentId,
          items: items.filter((it) => it.name.trim() || it.unitPriceMinor || it.productId).map(({ key: _k, ...rest }) => rest)
        }
      }
    }
  })
}

export function useDraft<T>(store: StoreApi<DraftState>, selector: (s: DraftState) => T): T {
  return useStore(store, selector)
}
