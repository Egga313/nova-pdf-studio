/** أنواع نظام الفواتير المشتركة بين العملية الرئيسية والواجهة. كل المبالغ بوحدات صغرى صحيحة. */
import type { Timestamps } from './entities'

export type DocType = 'invoice' | 'quote' | 'proforma' | 'receipt' | 'credit_note' | 'purchase_order' | 'delivery_note'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other'

export const DOC_TYPES: DocType[] = ['invoice', 'quote', 'proforma', 'receipt', 'credit_note', 'purchase_order', 'delivery_note']
export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled']
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'card', 'cheque', 'other']

// ------------------------------------------------------------------ العملاء
export interface Customer extends Timestamps {
  id: number
  customerNumber: string | null
  firstName: string
  lastName: string
  companyName: string
  address: string
  city: string
  country: string
  phone: string
  email: string
  taxId: string
  notes: string
  isDemo: boolean
  deletedAt: string | null
}

export interface CustomerInput {
  id?: number
  customerNumber?: string | null
  firstName?: string
  lastName?: string
  companyName?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  email?: string
  taxId?: string
  notes?: string
}

export interface CustomerSummary extends Customer {
  invoicesCount: number
  totalInvoicedMinor: number
  paidMinor: number
  remainingMinor: number
  lastActivityAt: string | null
}

export function customerDisplayName(c: Pick<Customer, 'firstName' | 'lastName' | 'companyName'>): string {
  const person = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return c.companyName?.trim() ? (person ? `${c.companyName} — ${person}` : c.companyName) : person || '—'
}

// ------------------------------------------------------------------ المنتجات
export interface Product extends Timestamps {
  id: number
  sku: string | null
  name: string
  description: string
  priceMinor: number
  currency: string
  taxId: number | null
  unit: string
  category: string
  notes: string
  isActive: boolean
  isDemo: boolean
}

export interface ProductInput {
  id?: number
  sku?: string | null
  name: string
  description?: string
  priceMinor?: number
  currency?: string
  taxId?: number | null
  unit?: string
  category?: string
  notes?: string
  isActive?: boolean
}

// ------------------------------------------------------------------ الفواتير
export interface InvoiceItemInput {
  id?: number
  productId?: number | null
  name: string
  description?: string
  quantityMilli: number
  unit?: string
  unitPriceMinor: number
  discountBps: number
  taxBps: number
  taxName?: string
}

export interface InvoiceItem extends InvoiceItemInput {
  id: number
  position: number
  baseMinor: number
  discountMinor: number
  netMinor: number
  taxMinor: number
  totalMinor: number
}

export interface CustomerSnapshot {
  id?: number | null
  displayName: string
  firstName?: string
  lastName?: string
  companyName?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  email?: string
  taxId?: string
  customerNumber?: string | null
}

export interface InvoiceInput {
  id?: number
  docType?: DocType
  number?: string | null          // فارغ = يُولَّد تلقائيًا
  status?: InvoiceStatus
  customerId?: number | null
  customerSnapshot?: CustomerSnapshot | null
  issueDate: string               // YYYY-MM-DD
  dueDate?: string | null
  reference?: string
  purchaseOrder?: string
  currency: string
  currencyPosition?: 'before' | 'after'
  paymentMethod?: string
  notes?: string
  paymentTerms?: string
  templateId?: number | null
  shippingMinor?: number
  feesMinor?: number
  amountInWords?: boolean
  source?: 'manual' | 'pdf_import' | 'spreadsheet'
  sourceDocumentId?: number | null
  items: InvoiceItemInput[]
}

export interface Invoice extends Timestamps {
  id: number
  docType: DocType
  number: string
  status: InvoiceStatus
  customerId: number | null
  customerSnapshot: CustomerSnapshot
  companySnapshot: Record<string, unknown>
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
  subtotalMinor: number
  discountTotalMinor: number
  taxableMinor: number
  taxTotalMinor: number
  shippingMinor: number
  feesMinor: number
  grandTotalMinor: number
  paidMinor: number
  remainingMinor: number
  amountInWords: boolean
  pdfPath: string | null
  source: string
  sourceDocumentId: number | null
  isDemo: boolean
  deletedAt: string | null
  items: InvoiceItem[]
  payments: Payment[]
}

export interface InvoiceListRow {
  id: number
  docType: DocType
  number: string
  status: InvoiceStatus
  customerId: number | null
  customerName: string
  issueDate: string
  dueDate: string | null
  currency: string
  grandTotalMinor: number
  paidMinor: number
  remainingMinor: number
  isDemo: boolean
  deletedAt: string | null
  updatedAt: string
}

export interface InvoiceFilters {
  query?: string
  status?: InvoiceStatus | 'all' | 'unpaid'
  docType?: DocType | 'all'
  customerId?: number
  from?: string
  to?: string
  includeDeleted?: boolean
  onlyDeleted?: boolean
  limit?: number
  offset?: number
  sort?: 'date_desc' | 'date_asc' | 'number' | 'amount_desc' | 'customer'
}

// ------------------------------------------------------------------ المدفوعات
export interface Payment extends Timestamps {
  id: number
  invoiceId: number
  paidAt: string
  amountMinor: number
  method: string
  reference: string
  notes: string
}

export interface PaymentInput {
  invoiceId: number
  paidAt: string
  amountMinor: number
  method?: string
  reference?: string
  notes?: string
}

export interface OutstandingItem {
  invoiceId: number
  number: string
  customerId: number | null
  customerName: string
  dueDate: string | null
  remainingMinor: number
  currency: string
  daysOverdue: number
}
