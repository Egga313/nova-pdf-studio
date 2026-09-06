/** مستودع العملاء: بحث/ترتيب/ترقيم صفحات، حذف ناعم واسترجاع، ملخص مالي لكل عميل. */
import { bool, getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { Customer, CustomerInput, CustomerSummary } from '@shared/invoicing'

interface Row {
  id: number; customer_number: string | null; first_name: string; last_name: string; company_name: string; address: string; city: string
  country: string; phone: string; email: string; tax_id: string; notes: string; is_demo: number; deleted_at: string | null; created_at: string; updated_at: string
}
interface SummaryRow extends Row { invoices_count: number; total_invoiced: number; paid: number; remaining: number; last_activity: string | null }

const map = (r: Row): Customer => ({
  id: r.id, customerNumber: r.customer_number, firstName: r.first_name, lastName: r.last_name, companyName: r.company_name, address: r.address,
  city: r.city, country: r.country, phone: r.phone, email: r.email, taxId: r.tax_id, notes: r.notes, isDemo: bool(r.is_demo),
  deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at
})

const SUMMARY_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NULL AND i.doc_type = 'invoice' AND i.status <> 'cancelled') AS invoices_count,
    (SELECT COALESCE(SUM(i.grand_total_minor),0) FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NULL AND i.doc_type = 'invoice' AND i.status <> 'cancelled') AS total_invoiced,
    (SELECT COALESCE(SUM(i.paid_minor),0) FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NULL AND i.doc_type = 'invoice' AND i.status <> 'cancelled') AS paid,
    (SELECT COALESCE(SUM(i.remaining_minor),0) FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NULL AND i.doc_type = 'invoice' AND i.status <> 'cancelled') AS remaining,
    (SELECT MAX(i.updated_at) FROM invoices i WHERE i.customer_id = c.id AND i.deleted_at IS NULL) AS last_activity
  FROM customers c`

export interface CustomerFilters {
  query?: string
  sort?: 'name' | 'recent' | 'invoiced_desc' | 'remaining_desc'
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

export function listCustomers(filters: CustomerFilters = {}): CustomerSummary[] {
  const db = getDatabase()
  const where: string[] = [filters.includeDeleted ? '1=1' : 'c.deleted_at IS NULL']
  const params: (string | number)[] = []
  if (filters.query?.trim()) {
    const like = `%${filters.query.trim()}%`
    const digits = filters.query.replace(/\D/g, '')
    where.push(`(c.first_name LIKE ? OR c.last_name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ? OR c.customer_number LIKE ? OR c.city LIKE ?
      OR (c.first_name || ' ' || c.last_name) LIKE ? ${digits ? 'OR REPLACE(REPLACE(REPLACE(c.phone, " ", ""), "-", ""), ".", "") LIKE ?' : ''})`)
    params.push(like, like, like, like, like, like, like)
    if (digits) params.push(`%${digits}%`)
  }
  const order = {
    name: 'c.company_name COLLATE NOCASE, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE',
    recent: 'c.updated_at DESC',
    invoiced_desc: 'total_invoiced DESC',
    remaining_desc: 'remaining DESC'
  }[filters.sort ?? 'name']
  params.push(filters.limit ?? 500, filters.offset ?? 0)
  return db
    .all<SummaryRow>(`${SUMMARY_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, params)
    .map((r) => ({ ...map(r), invoicesCount: r.invoices_count, totalInvoicedMinor: r.total_invoiced, paidMinor: r.paid, remainingMinor: r.remaining, lastActivityAt: r.last_activity }))
}

export function getCustomer(id: number): CustomerSummary | null {
  const row = getDatabase().get<SummaryRow>(`${SUMMARY_SELECT} WHERE c.id = ?`, [id])
  return row ? { ...map(row), invoicesCount: row.invoices_count, totalInvoicedMinor: row.total_invoiced, paidMinor: row.paid, remainingMinor: row.remaining, lastActivityAt: row.last_activity } : null
}

export function nextCustomerNumber(): string {
  const row = getDatabase().get<{ n: number }>(`SELECT COALESCE(MAX(CAST(SUBSTR(customer_number, 5) AS INTEGER)), 0) AS n FROM customers WHERE customer_number LIKE 'CUS-%'`)
  return `CUS-${String((row?.n ?? 0) + 1).padStart(5, '0')}`
}

export function saveCustomer(input: CustomerInput): Customer {
  const db = getDatabase()
  const first = (input.firstName ?? '').trim()
  const last = (input.lastName ?? '').trim()
  const company = (input.companyName ?? '').trim()
  if (!first && !last && !company) throw new AppError('VALIDATION', 'errors.validation.customer_name')
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new AppError('VALIDATION', 'errors.validation.email')

  return db.transaction(() => {
    const fields = {
      first_name: first, last_name: last, company_name: company, address: (input.address ?? '').trim(), city: (input.city ?? '').trim(),
      country: (input.country ?? '').trim(), phone: (input.phone ?? '').trim(), email: (input.email ?? '').trim(), tax_id: (input.taxId ?? '').trim(),
      notes: input.notes ?? ''
    }
    if (input.id) {
      db.run(
        `UPDATE customers SET first_name=$first_name, last_name=$last_name, company_name=$company_name, address=$address, city=$city, country=$country,
           phone=$phone, email=$email, tax_id=$tax_id, notes=$notes, customer_number=COALESCE($customer_number, customer_number),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=$id`,
        { ...fields, customer_number: input.customerNumber ?? null, id: input.id }
      )
      audit('customer.updated', 'customer', input.id, company || `${first} ${last}`)
      return map(db.get<Row>('SELECT * FROM customers WHERE id = ?', [input.id])!)
    }
    const number = input.customerNumber?.trim() || nextCustomerNumber()
    const { lastInsertRowid } = db.run(
      `INSERT INTO customers (customer_number, first_name, last_name, company_name, address, city, country, phone, email, tax_id, notes)
       VALUES ($customer_number, $first_name, $last_name, $company_name, $address, $city, $country, $phone, $email, $tax_id, $notes)`,
      { ...fields, customer_number: number }
    )
    audit('customer.created', 'customer', lastInsertRowid, company || `${first} ${last}`)
    return map(db.get<Row>('SELECT * FROM customers WHERE id = ?', [lastInsertRowid])!)
  })
}

export function deleteCustomer(id: number): void {
  getDatabase().run(`UPDATE customers SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [id])
  audit('customer.deleted', 'customer', id)
}

export function restoreCustomer(id: number): void {
  getDatabase().run('UPDATE customers SET deleted_at = NULL WHERE id = ?', [id])
}

export function purgeCustomer(id: number): void {
  const db = getDatabase()
  const used = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM invoices WHERE customer_id = ?', [id])?.n ?? 0
  if (used > 0) throw new AppError('CONFLICT', 'errors.customer.has_invoices', { count: used })
  db.run('DELETE FROM customers WHERE id = ?', [id])
}

/** إكمال تلقائي سريع للفاتورة. */
export function searchCustomers(query: string, limit = 8): Customer[] {
  return listCustomers({ query, limit, sort: 'name' })
}
