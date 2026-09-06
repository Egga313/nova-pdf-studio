/**
 * مستودع الفواتير: إنشاء/تعديل مع إعادة حساب مركزية (calcTotals)، ترقيم تلقائي، مدفوعات، حالات، سلة محذوفات، بحث.
 * كل الحسابات تُعاد في العملية الرئيسية قبل التخزين — الواجهة لا تُرسل مجاميع، بل بنودًا فقط.
 */
import { bool, getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { getSettings } from '@modules/settings/main/repository'
import { AppError } from '@shared/errors'
import type {
  CustomerSnapshot, DocType, Invoice, InvoiceFilters, InvoiceInput, InvoiceItem, InvoiceListRow, InvoiceStatus, OutstandingItem, Payment, PaymentInput
} from '@shared/invoicing'
import { customerDisplayName } from '@shared/invoicing'
import { formatDocumentNumber, sequenceScope } from '@shared/numbering'
import { calcTotals, daysOverdue, deriveStatus } from '../shared/calc'

const today = (): string => new Date().toISOString().slice(0, 10)

interface InvoiceRow {
  id: number; doc_type: DocType; number: string; status: InvoiceStatus; customer_id: number | null; customer_snapshot: string; company_snapshot: string
  issue_date: string; due_date: string | null; reference: string; purchase_order: string; currency: string; currency_position: 'before' | 'after'
  payment_method: string; notes: string; payment_terms: string; template_id: number | null; subtotal_minor: number; discount_total_minor: number
  taxable_minor: number; tax_total_minor: number; shipping_minor: number; fees_minor: number; grand_total_minor: number; paid_minor: number
  remaining_minor: number; amount_in_words: number; pdf_path: string | null; source: string; source_document_id: number | null; is_demo: number
  deleted_at: string | null; created_at: string; updated_at: string
}
interface ItemRow {
  id: number; invoice_id: number; position: number; product_id: number | null; name: string; description: string; quantity_milli: number; unit: string
  unit_price_minor: number; discount_bps: number; tax_bps: number; tax_name: string; base_minor: number; discount_minor: number; net_minor: number
  tax_minor: number; total_minor: number
}
interface PaymentRow { id: number; invoice_id: number; paid_at: string; amount_minor: number; method: string; reference: string; notes: string; created_at: string; updated_at: string }

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

const mapItem = (r: ItemRow): InvoiceItem => ({
  id: r.id, position: r.position, productId: r.product_id, name: r.name, description: r.description, quantityMilli: r.quantity_milli, unit: r.unit,
  unitPriceMinor: r.unit_price_minor, discountBps: r.discount_bps, taxBps: r.tax_bps, taxName: r.tax_name, baseMinor: r.base_minor,
  discountMinor: r.discount_minor, netMinor: r.net_minor, taxMinor: r.tax_minor, totalMinor: r.total_minor
})
const mapPayment = (r: PaymentRow): Payment => ({
  id: r.id, invoiceId: r.invoice_id, paidAt: r.paid_at, amountMinor: r.amount_minor, method: r.method, reference: r.reference, notes: r.notes,
  createdAt: r.created_at, updatedAt: r.updated_at
})

function mapInvoice(r: InvoiceRow, items: InvoiceItem[], payments: Payment[]): Invoice {
  return {
    id: r.id, docType: r.doc_type, number: r.number, status: r.status, customerId: r.customer_id,
    customerSnapshot: parseJson<CustomerSnapshot>(r.customer_snapshot, { displayName: '' }),
    companySnapshot: parseJson<Record<string, unknown>>(r.company_snapshot, {}),
    issueDate: r.issue_date, dueDate: r.due_date, reference: r.reference, purchaseOrder: r.purchase_order, currency: r.currency,
    currencyPosition: r.currency_position, paymentMethod: r.payment_method, notes: r.notes, paymentTerms: r.payment_terms, templateId: r.template_id,
    subtotalMinor: r.subtotal_minor, discountTotalMinor: r.discount_total_minor, taxableMinor: r.taxable_minor, taxTotalMinor: r.tax_total_minor,
    shippingMinor: r.shipping_minor, feesMinor: r.fees_minor, grandTotalMinor: r.grand_total_minor, paidMinor: r.paid_minor, remainingMinor: r.remaining_minor,
    amountInWords: bool(r.amount_in_words), pdfPath: r.pdf_path, source: r.source, sourceDocumentId: r.source_document_id, isDemo: bool(r.is_demo),
    deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at, items, payments
  }
}

// ------------------------------------------------------------------ الترقيم
function patternFor(docType: DocType): string {
  const inv = getSettings().invoice
  return { invoice: inv.numberPattern, quote: inv.quotePattern, proforma: inv.proformaPattern, receipt: inv.receiptPattern }[docType as 'invoice'] ?? inv.numberPattern.replace('INV', docType.slice(0, 3).toUpperCase())
}

/** يحجز الرقم التالي داخل المعاملة الحالية (آمن ضد التكرار). */
export function allocateNumber(docType: DocType, issueDate: string): string {
  const db = getDatabase()
  const pattern = patternFor(docType)
  const date = new Date(`${issueDate}T00:00:00`)
  const scope = sequenceScope(pattern, date)
  db.run(
    `INSERT INTO document_sequences (doc_type, scope, last_value) VALUES (?, ?, 1)
     ON CONFLICT(doc_type, scope) DO UPDATE SET last_value = last_value + 1`,
    [docType, scope]
  )
  const seq = db.get<{ last_value: number }>('SELECT last_value FROM document_sequences WHERE doc_type = ? AND scope = ?', [docType, scope])!.last_value
  let number = formatDocumentNumber(pattern, { date, sequence: seq })
  // إن كان الرقم مستخدمًا (رقم يدوي سابق) نتقدّم حتى نجد رقمًا حرًا
  let guard = 0
  while (db.get('SELECT 1 FROM invoices WHERE doc_type = ? AND number = ?', [docType, number]) && guard++ < 10_000) {
    db.run('UPDATE document_sequences SET last_value = last_value + 1 WHERE doc_type = ? AND scope = ?', [docType, scope])
    const next = db.get<{ last_value: number }>('SELECT last_value FROM document_sequences WHERE doc_type = ? AND scope = ?', [docType, scope])!.last_value
    number = formatDocumentNumber(pattern, { date, sequence: next })
  }
  return number
}

export function previewNextNumber(docType: DocType, issueDate = today()): string {
  const db = getDatabase()
  const pattern = patternFor(docType)
  const date = new Date(`${issueDate}T00:00:00`)
  const scope = sequenceScope(pattern, date)
  const last = db.get<{ last_value: number }>('SELECT last_value FROM document_sequences WHERE doc_type = ? AND scope = ?', [docType, scope])?.last_value ?? 0
  return formatDocumentNumber(pattern, { date, sequence: last + 1 })
}

// ------------------------------------------------------------------ الحفظ
function validate(input: InvoiceInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new AppError('VALIDATION', 'errors.validation.date')
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new AppError('VALIDATION', 'errors.validation.date')
  if (!input.currency) throw new AppError('VALIDATION', 'errors.validation.currency_required')
  input.items.forEach((it, i) => {
    if (!Number.isInteger(it.quantityMilli) || !Number.isInteger(it.unitPriceMinor) || !Number.isInteger(it.discountBps) || !Number.isInteger(it.taxBps)) {
      throw new AppError('VALIDATION', 'errors.validation.item_numbers', { line: i + 1 })
    }
    if (it.discountBps < 0 || it.discountBps > 10_000) throw new AppError('VALIDATION', 'errors.validation.discount_range', { line: i + 1 })
  })
}

function snapshotCustomer(customerId: number | null | undefined, provided?: CustomerSnapshot | null): CustomerSnapshot {
  if (provided && provided.displayName) return provided
  if (!customerId) return { displayName: provided?.displayName ?? '' }
  const c = getDatabase().get<{ id: number; first_name: string; last_name: string; company_name: string; address: string; city: string; country: string; phone: string; email: string; tax_id: string; customer_number: string | null }>(
    'SELECT id, first_name, last_name, company_name, address, city, country, phone, email, tax_id, customer_number FROM customers WHERE id = ?', [customerId]
  )
  if (!c) return { displayName: '' }
  return {
    id: c.id, displayName: customerDisplayName({ firstName: c.first_name, lastName: c.last_name, companyName: c.company_name }),
    firstName: c.first_name, lastName: c.last_name, companyName: c.company_name, address: c.address, city: c.city, country: c.country,
    phone: c.phone, email: c.email, taxId: c.tax_id, customerNumber: c.customer_number
  }
}

export function saveInvoice(input: InvoiceInput): Invoice {
  validate(input)
  const db = getDatabase()
  const settings = getSettings()
  const docType: DocType = input.docType ?? 'invoice'
  const totals = calcTotals({
    lines: input.items.map((it) => ({ quantityMilli: it.quantityMilli, unitPriceMinor: it.unitPriceMinor, discountBps: it.discountBps, taxBps: it.taxBps })),
    shippingMinor: input.shippingMinor ?? 0,
    feesMinor: input.feesMinor ?? 0
  })

  return db.transaction(() => {
    const existing = input.id ? db.get<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [input.id]) : undefined
    if (input.id && !existing) throw new AppError('NOT_FOUND')
    const paid = existing?.paid_minor ?? 0
    const number = input.number?.trim() || existing?.number || allocateNumber(docType, input.issueDate)
    if (!existing || existing.number !== number) {
      const dup = db.get('SELECT 1 FROM invoices WHERE doc_type = ? AND number = ? AND id <> ?', [docType, number, input.id ?? 0])
      if (dup) throw new AppError('CONFLICT', 'errors.invoice.number_exists', { number })
    }
    const requestedStatus: InvoiceStatus = input.status ?? existing?.status ?? 'draft'
    const status = deriveStatus(requestedStatus, totals.grandTotalMinor, paid, input.dueDate ?? null, today())
    const snapshot = snapshotCustomer(input.customerId, input.customerSnapshot)
    const company = existing ? parseJson(existing.company_snapshot, {}) : { ...settings.company }
    const fields = {
      doc_type: docType, number, status, customer_id: input.customerId ?? null, customer_snapshot: JSON.stringify(snapshot),
      company_snapshot: JSON.stringify(company), issue_date: input.issueDate, due_date: input.dueDate ?? null, reference: input.reference ?? '',
      purchase_order: input.purchaseOrder ?? '', currency: input.currency, currency_position: input.currencyPosition ?? settings.invoice.currencyPosition,
      payment_method: input.paymentMethod ?? '', notes: input.notes ?? '', payment_terms: input.paymentTerms ?? '', template_id: input.templateId ?? null,
      subtotal_minor: totals.subtotalMinor, discount_total_minor: totals.discountTotalMinor, taxable_minor: totals.taxableMinor, tax_total_minor: totals.taxTotalMinor,
      shipping_minor: totals.shippingMinor, fees_minor: totals.feesMinor, grand_total_minor: totals.grandTotalMinor, paid_minor: paid,
      remaining_minor: totals.grandTotalMinor - paid, amount_in_words: input.amountInWords ?? settings.invoice.amountInWords ? 1 : 0,
      source: input.source ?? existing?.source ?? 'manual', source_document_id: input.sourceDocumentId ?? existing?.source_document_id ?? null
    }
    let id = input.id
    if (existing) {
      db.run(
        `UPDATE invoices SET doc_type=$doc_type, number=$number, status=$status, customer_id=$customer_id, customer_snapshot=$customer_snapshot,
           issue_date=$issue_date, due_date=$due_date, reference=$reference, purchase_order=$purchase_order, currency=$currency,
           currency_position=$currency_position, payment_method=$payment_method, notes=$notes, payment_terms=$payment_terms, template_id=$template_id,
           subtotal_minor=$subtotal_minor, discount_total_minor=$discount_total_minor, taxable_minor=$taxable_minor, tax_total_minor=$tax_total_minor,
           shipping_minor=$shipping_minor, fees_minor=$fees_minor, grand_total_minor=$grand_total_minor, paid_minor=$paid_minor, remaining_minor=$remaining_minor,
           amount_in_words=$amount_in_words, source=$source, source_document_id=$source_document_id, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=$id`,
        { ...fields, id }
      )
      db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id])
    } else {
      const { lastInsertRowid } = db.run(
        `INSERT INTO invoices (doc_type, number, status, customer_id, customer_snapshot, company_snapshot, issue_date, due_date, reference, purchase_order,
           currency, currency_position, payment_method, notes, payment_terms, template_id, subtotal_minor, discount_total_minor, taxable_minor,
           tax_total_minor, shipping_minor, fees_minor, grand_total_minor, paid_minor, remaining_minor, amount_in_words, source, source_document_id)
         VALUES ($doc_type, $number, $status, $customer_id, $customer_snapshot, $company_snapshot, $issue_date, $due_date, $reference, $purchase_order,
           $currency, $currency_position, $payment_method, $notes, $payment_terms, $template_id, $subtotal_minor, $discount_total_minor, $taxable_minor,
           $tax_total_minor, $shipping_minor, $fees_minor, $grand_total_minor, $paid_minor, $remaining_minor, $amount_in_words, $source, $source_document_id)`,
        fields
      )
      id = lastInsertRowid
    }
    input.items.forEach((it, i) => {
      const line = totals.lines[i]
      db.run(
        `INSERT INTO invoice_items (invoice_id, position, product_id, name, description, quantity_milli, unit, unit_price_minor, discount_bps, tax_bps, tax_name,
           base_minor, discount_minor, net_minor, tax_minor, total_minor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, i, it.productId ?? null, it.name ?? '', it.description ?? '', it.quantityMilli, it.unit ?? '', it.unitPriceMinor, it.discountBps, it.taxBps,
          it.taxName ?? '', line.baseMinor, line.discountMinor, line.netMinor, line.taxMinor, line.totalMinor]
      )
    })
    audit(existing ? 'invoice.updated' : 'invoice.created', 'invoice', id, `${number} ${snapshot.displayName}`)
    return getInvoice(id!)!
  })
}

export function getInvoice(id: number): Invoice | null {
  const db = getDatabase()
  const row = db.get<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [id])
  if (!row) return null
  const items = db.all<ItemRow>('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position', [id]).map(mapItem)
  const payments = db.all<PaymentRow>('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at, id', [id]).map(mapPayment)
  return mapInvoice(row, items, payments)
}

// ------------------------------------------------------------------ القوائم
export function listInvoices(filters: InvoiceFilters = {}): { rows: InvoiceListRow[]; total: number } {
  const db = getDatabase()
  const where: string[] = []
  const params: (string | number)[] = []
  if (filters.onlyDeleted) where.push('i.deleted_at IS NOT NULL')
  else if (!filters.includeDeleted) where.push('i.deleted_at IS NULL')
  if (filters.docType && filters.docType !== 'all') {
    where.push('i.doc_type = ?')
    params.push(filters.docType)
  }
  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'unpaid') where.push("i.status IN ('sent','partially_paid','overdue')")
    else {
      where.push('i.status = ?')
      params.push(filters.status)
    }
  }
  if (filters.customerId) {
    where.push('i.customer_id = ?')
    params.push(filters.customerId)
  }
  if (filters.from) {
    where.push('i.issue_date >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    where.push('i.issue_date <= ?')
    params.push(filters.to)
  }
  if (filters.query?.trim()) {
    const q = filters.query.trim()
    const like = `%${q}%`
    const digits = q.replace(/\D/g, '')
    const amount = Number(q.replace(/[^\d.,]/g, '').replace(',', '.'))
    where.push(`(i.number LIKE ? OR i.customer_snapshot LIKE ? OR i.reference LIKE ? OR i.notes LIKE ?
      ${digits ? "OR REPLACE(REPLACE(i.customer_snapshot, ' ', ''), '-', '') LIKE ?" : ''}
      ${Number.isFinite(amount) && amount > 0 ? 'OR i.grand_total_minor = ?' : ''})`)
    params.push(like, like, like, like)
    if (digits) params.push(`%${digits}%`)
    if (Number.isFinite(amount) && amount > 0) params.push(Math.round(amount * 100))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = {
    date_desc: 'i.issue_date DESC, i.id DESC', date_asc: 'i.issue_date ASC, i.id ASC', number: 'i.number DESC',
    amount_desc: 'i.grand_total_minor DESC', customer: 'i.customer_snapshot COLLATE NOCASE'
  }[filters.sort ?? 'date_desc']
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM invoices i ${whereSql}`, params)?.n ?? 0
  const rows = db
    .all<InvoiceRow>(`SELECT * FROM invoices i ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, filters.limit ?? 100, filters.offset ?? 0])
    .map((r) => ({
      id: r.id, docType: r.doc_type, number: r.number, status: r.status, customerId: r.customer_id,
      customerName: parseJson<CustomerSnapshot>(r.customer_snapshot, { displayName: '' }).displayName, issueDate: r.issue_date, dueDate: r.due_date,
      currency: r.currency, grandTotalMinor: r.grand_total_minor, paidMinor: r.paid_minor, remainingMinor: r.remaining_minor, isDemo: bool(r.is_demo),
      deletedAt: r.deleted_at, updatedAt: r.updated_at
    }))
  return { rows, total }
}

export function listOutstanding(limit = 100): OutstandingItem[] {
  const t = today()
  return getDatabase()
    .all<InvoiceRow>(
      `SELECT * FROM invoices WHERE deleted_at IS NULL AND doc_type = 'invoice' AND remaining_minor > 0 AND status NOT IN ('cancelled','draft')
       ORDER BY COALESCE(due_date, issue_date) ASC LIMIT ?`, [limit]
    )
    .map((r) => ({
      invoiceId: r.id, number: r.number, customerId: r.customer_id, customerName: parseJson<CustomerSnapshot>(r.customer_snapshot, { displayName: '' }).displayName,
      dueDate: r.due_date, remainingMinor: r.remaining_minor, currency: r.currency, daysOverdue: daysOverdue(r.due_date, t)
    }))
}

// ------------------------------------------------------------------ الحالة والمدفوعات
function refreshInvoiceMoney(id: number): Invoice {
  const db = getDatabase()
  const row = db.get<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [id])
  if (!row) throw new AppError('NOT_FOUND')
  const paid = db.get<{ s: number }>('SELECT COALESCE(SUM(amount_minor),0) AS s FROM payments WHERE invoice_id = ?', [id])!.s
  const status = deriveStatus(row.status === 'draft' && paid > 0 ? 'sent' : row.status, row.grand_total_minor, paid, row.due_date, today())
  db.run(`UPDATE invoices SET paid_minor=?, remaining_minor=?, status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`, [paid, row.grand_total_minor - paid, status, id])
  return getInvoice(id)!
}

export function setInvoiceStatus(id: number, status: InvoiceStatus): Invoice {
  const db = getDatabase()
  const row = db.get<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [id])
  if (!row) throw new AppError('NOT_FOUND')
  const next = status === 'cancelled' || status === 'draft' ? status : deriveStatus(status, row.grand_total_minor, row.paid_minor, row.due_date, today())
  db.run(`UPDATE invoices SET status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`, [next, id])
  audit('invoice.updated', 'invoice', id, `status → ${next}`)
  return getInvoice(id)!
}

export function addPayment(input: PaymentInput): Invoice {
  const db = getDatabase()
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new AppError('VALIDATION', 'errors.validation.amount_positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)) throw new AppError('VALIDATION', 'errors.validation.date')
  return db.transaction(() => {
    const row = db.get<InvoiceRow>('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL', [input.invoiceId])
    if (!row) throw new AppError('NOT_FOUND')
    if (row.status === 'cancelled') throw new AppError('CONFLICT', 'errors.invoice.cancelled')
    db.run('INSERT INTO payments (invoice_id, paid_at, amount_minor, method, reference, notes) VALUES (?, ?, ?, ?, ?, ?)', [
      input.invoiceId, input.paidAt, input.amountMinor, input.method ?? 'cash', input.reference ?? '', input.notes ?? ''
    ])
    audit('payment.added', 'invoice', input.invoiceId, `${input.amountMinor} ${row.currency}`)
    return refreshInvoiceMoney(input.invoiceId)
  })
}

export function deletePayment(paymentId: number): Invoice {
  const db = getDatabase()
  return db.transaction(() => {
    const p = db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', [paymentId])
    if (!p) throw new AppError('NOT_FOUND')
    db.run('DELETE FROM payments WHERE id = ?', [paymentId])
    audit('payment.deleted', 'invoice', p.invoice_id, `${p.amount_minor}`)
    return refreshInvoiceMoney(p.invoice_id)
  })
}

/** مسح دوري: تعليم الفواتير المتأخرة (يُستدعى عند التشغيل ومع كل عرض للقائمة). */
export function refreshOverdue(): number {
  const t = today()
  const { changes } = getDatabase().run(
    `UPDATE invoices SET status = 'overdue' WHERE deleted_at IS NULL AND status IN ('sent','partially_paid') AND due_date IS NOT NULL AND due_date < ? AND remaining_minor > 0`,
    [t]
  )
  return changes
}

// ------------------------------------------------------------------ الحذف
export function trashInvoice(id: number): void {
  getDatabase().run(`UPDATE invoices SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [id])
  audit('invoice.deleted', 'invoice', id)
}
export function restoreInvoice(id: number): void {
  getDatabase().run('UPDATE invoices SET deleted_at = NULL WHERE id = ?', [id])
  audit('invoice.restored', 'invoice', id)
}
export function purgeInvoice(id: number): void {
  getDatabase().run('DELETE FROM invoices WHERE id = ?', [id])
  audit('invoice.purged', 'invoice', id)
}
export function duplicateInvoice(id: number): Invoice {
  const src = getInvoice(id)
  if (!src) throw new AppError('NOT_FOUND')
  return saveInvoice({
    docType: src.docType, status: 'draft', customerId: src.customerId, customerSnapshot: src.customerSnapshot, issueDate: today(), dueDate: null,
    reference: src.reference, purchaseOrder: src.purchaseOrder, currency: src.currency, currencyPosition: src.currencyPosition, paymentMethod: src.paymentMethod,
    notes: src.notes, paymentTerms: src.paymentTerms, templateId: src.templateId, shippingMinor: src.shippingMinor, feesMinor: src.feesMinor,
    amountInWords: src.amountInWords, source: 'manual',
    items: src.items.map((it) => ({ productId: it.productId, name: it.name, description: it.description, quantityMilli: it.quantityMilli, unit: it.unit, unitPriceMinor: it.unitPriceMinor, discountBps: it.discountBps, taxBps: it.taxBps, taxName: it.taxName }))
  })
}

export function setInvoicePdfPath(id: number, pdfPath: string): void {
  getDatabase().run('UPDATE invoices SET pdf_path = ? WHERE id = ?', [pdfPath, id])
}

/** بحث شامل للوحة الأوامر: عملاء + فواتير + منتجات. */
export function globalSearch(query: string, limit = 6): { customers: { id: number; label: string; sub: string }[]; invoices: { id: number; label: string; sub: string }[]; products: { id: number; label: string; sub: string }[] } {
  const db = getDatabase()
  const q = query.trim()
  if (!q) return { customers: [], invoices: [], products: [] }
  const like = `%${q}%`
  const digits = q.replace(/\D/g, '')
  const customers = db.all<{ id: number; first_name: string; last_name: string; company_name: string; phone: string }>(
    `SELECT id, first_name, last_name, company_name, phone FROM customers WHERE deleted_at IS NULL AND (first_name LIKE ? OR last_name LIKE ? OR company_name LIKE ? OR email LIKE ?
      ${digits ? "OR REPLACE(REPLACE(phone,' ',''),'-','') LIKE ?" : ''}) LIMIT ?`,
    digits ? [like, like, like, like, `%${digits}%`, limit] : [like, like, like, like, limit]
  ).map((c) => ({ id: c.id, label: customerDisplayName({ firstName: c.first_name, lastName: c.last_name, companyName: c.company_name }), sub: c.phone }))
  const invoices = listInvoices({ query: q, limit }).rows.map((r) => ({ id: r.id, label: r.number, sub: r.customerName }))
  const products = db.all<{ id: number; name: string; sku: string | null }>(
    'SELECT id, name, sku FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR sku LIKE ?) LIMIT ?', [like, like, limit]
  ).map((p) => ({ id: p.id, label: p.name, sub: p.sku ?? '' }))
  return { customers, invoices, products }
}
