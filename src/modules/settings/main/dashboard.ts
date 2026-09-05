/** إحصائيات لوحة القيادة من قاعدة البيانات مباشرة (لا أرقام ثابتة). */
import { getDatabase } from '@modules/database/main'
import type { DashboardStats, OutstandingRow } from '@shared/entities'
import { getSettings } from './repository'

export function getDashboardStats(): DashboardStats {
  const db = getDatabase()
  const currency = getSettings().invoice.defaultCurrency
  const today = new Date().toISOString().slice(0, 10)

  const counts = db.get<{ total: number; paid: number; unpaid: number; overdue: number; revenue: number; remaining: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
            SUM(CASE WHEN status IN ('sent','partially_paid','overdue','draft') THEN 1 ELSE 0 END) AS unpaid,
            SUM(CASE WHEN (status = 'overdue') OR (due_date IS NOT NULL AND due_date < ? AND remaining_minor > 0 AND status NOT IN ('cancelled','paid')) THEN 1 ELSE 0 END) AS overdue,
            COALESCE(SUM(paid_minor), 0) AS revenue,
            COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN remaining_minor ELSE 0 END), 0) AS remaining
     FROM invoices WHERE deleted_at IS NULL AND doc_type = 'invoice'`,
    [today]
  )

  const customers = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM customers WHERE deleted_at IS NULL')?.n ?? 0
  const products = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL')?.n ?? 0

  // آخر 12 شهرًا: المفوتر (حسب تاريخ الإصدار) والمدفوع (حسب تاريخ الدفع)
  const months: string[] = []
  const cursor = new Date()
  cursor.setDate(1)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const invoiced = new Map(
    db.all<{ m: string; total: number }>(
      `SELECT substr(issue_date, 1, 7) AS m, SUM(grand_total_minor) AS total FROM invoices
       WHERE deleted_at IS NULL AND doc_type = 'invoice' AND status <> 'cancelled' AND issue_date >= ? GROUP BY m`,
      [`${months[0]}-01`]
    ).map((r) => [r.m, r.total])
  )
  const paid = new Map(
    db.all<{ m: string; total: number }>(
      `SELECT substr(p.paid_at, 1, 7) AS m, SUM(p.amount_minor) AS total FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE i.deleted_at IS NULL AND p.paid_at >= ? GROUP BY m`,
      [`${months[0]}-01`]
    ).map((r) => [r.m, r.total])
  )

  const outstanding = db.all<{
    id: number; number: string; customer_id: number | null; customer_snapshot: string; due_date: string | null; remaining_minor: number; currency: string
  }>(
    `SELECT i.id, i.number, i.customer_id, i.customer_snapshot, i.due_date, i.remaining_minor, i.currency
     FROM invoices i
     WHERE i.deleted_at IS NULL AND i.doc_type = 'invoice' AND i.remaining_minor > 0 AND i.status NOT IN ('cancelled','draft')
     ORDER BY COALESCE(i.due_date, i.issue_date) ASC LIMIT 25`
  )

  const rows: OutstandingRow[] = outstanding.map((r) => {
    let name = ''
    try {
      const snap = JSON.parse(r.customer_snapshot || '{}')
      name = snap.displayName || [snap.companyName, [snap.firstName, snap.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
    } catch {
      name = ''
    }
    const days = r.due_date ? Math.floor((Date.parse(today) - Date.parse(r.due_date)) / 86_400_000) : 0
    return {
      invoiceId: r.id, invoiceNumber: r.number, customerId: r.customer_id, customerName: name,
      dueDate: r.due_date, remainingMinor: r.remaining_minor, daysOverdue: Math.max(0, days), currency: r.currency
    }
  })

  return {
    totalInvoices: counts?.total ?? 0,
    paidInvoices: counts?.paid ?? 0,
    unpaidInvoices: counts?.unpaid ?? 0,
    overdueInvoices: counts?.overdue ?? 0,
    totalRevenueMinor: counts?.revenue ?? 0,
    remainingMinor: counts?.remaining ?? 0,
    customersCount: customers,
    productsCount: products,
    currency,
    revenueByMonth: months.map((m) => ({ month: m, invoicedMinor: invoiced.get(m) ?? 0, paidMinor: paid.get(m) ?? 0 })),
    outstanding: rows
  }
}
