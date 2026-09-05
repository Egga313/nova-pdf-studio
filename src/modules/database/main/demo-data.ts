/**
 * بيانات تجريبية معزولة بعلامة is_demo = 1 حتى تُحذف كلها بأمر واحد دون المسّ ببيانات المستخدم.
 * تُحسب مبالغ الفواتير بمحرّك المال نفسه (لا مجاميع مكتوبة يدويًا).
 */
import { applyBps, multiplyQuantity, sumMinor } from '@shared/money'
import { formatDocumentNumber } from '@shared/numbering'
import { getDatabase } from './index'
import { audit } from './audit'

interface DemoItem { name: string; qtyMilli: number; priceMinor: number; taxBps: number; discountBps: number }

const CUSTOMERS = [
  { first: 'أحمد', last: 'بن يوسف', company: 'شركة النور للتجارة', phone: '0550 12 34 56', email: 'ahmed@alnour.dz', city: 'الجزائر', country: 'الجزائر' },
  { first: 'Sarah', last: 'Martin', company: 'Atelier Lumière', phone: '+33 6 12 34 56 78', email: 'sarah@lumiere.fr', city: 'Lyon', country: 'France' },
  { first: 'Karim', last: 'Haddad', company: 'Haddad Import Export', phone: '0661 98 76 54', email: 'karim@haddad-ie.com', city: 'Oran', country: 'Algérie' },
  { first: 'ليلى', last: 'مراد', company: '', phone: '0770 11 22 33', email: 'leila.mourad@example.com', city: 'قسنطينة', country: 'الجزائر' },
  { first: 'John', last: 'Walker', company: 'Walker & Sons Ltd', phone: '+44 7700 900123', email: 'john@walkersons.co.uk', city: 'London', country: 'United Kingdom' }
]

const PRODUCTS = [
  { sku: 'SRV-DESIGN', name: 'تصميم هوية بصرية', desc: 'شعار + دليل استخدام', price: 4500000, unit: 'خدمة', cat: 'خدمات', tax: 1900 },
  { sku: 'SRV-WEB', name: 'Développement site web', desc: 'Site vitrine responsive', price: 12000000, unit: 'projet', cat: 'Services', tax: 1900 },
  { sku: 'PRD-LAPTOP', name: 'Laptop Pro 15"', desc: '16GB RAM, 512GB SSD', price: 18500000, unit: 'pcs', cat: 'Hardware', tax: 1900 },
  { sku: 'PRD-PAPER', name: 'ورق A4 (علبة 5 رزم)', desc: '80 غ/م²', price: 320000, unit: 'علبة', cat: 'قرطاسية', tax: 1900 },
  { sku: 'SRV-HOUR', name: 'Consulting hour', desc: 'Senior consultant', price: 800000, unit: 'hour', cat: 'Services', tax: 900 },
  { sku: 'PRD-INK', name: 'Cartouche d\'encre', desc: 'Noir, haute capacité', price: 450000, unit: 'pcs', cat: 'Consommables', tax: 1900 },
  { sku: 'SRV-MAINT', name: 'عقد صيانة سنوي', desc: 'دعم فني وتحديثات', price: 6000000, unit: 'سنة', cat: 'خدمات', tax: 0 },
  { sku: 'PRD-CHAIR', name: 'Office chair ergonomic', desc: 'Adjustable lumbar support', price: 2900000, unit: 'pcs', cat: 'Furniture', tax: 1900 }
]

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function demoStatus(): { loaded: boolean } {
  const n = getDatabase().get<{ n: number }>('SELECT COUNT(*) AS n FROM customers WHERE is_demo = 1')?.n ?? 0
  return { loaded: n > 0 }
}

export function loadDemoData(): { customers: number; products: number; invoices: number } {
  const db = getDatabase()
  return db.transaction(() => {
    if (demoStatus().loaded) clearDemoData()
    const customerIds: number[] = []
    CUSTOMERS.forEach((c, i) => {
      const { lastInsertRowid } = db.run(
        `INSERT INTO customers (customer_number, first_name, last_name, company_name, phone, email, city, country, address, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [`DEMO-${String(i + 1).padStart(3, '0')}`, c.first, c.last, c.company, c.phone, c.email, c.city, c.country, `${c.city}, ${c.country}`]
      )
      customerIds.push(lastInsertRowid)
    })
    const productIds: number[] = []
    for (const p of PRODUCTS) {
      const tax = db.get<{ id: number }>('SELECT id FROM taxes WHERE rate_bps = ? ORDER BY id LIMIT 1', [p.tax])
      const { lastInsertRowid } = db.run(
        `INSERT INTO products (sku, name, description, price_minor, currency, tax_id, unit, category, is_demo)
         VALUES (?, ?, ?, ?, 'DZD', ?, ?, ?, 1)`,
        [`DEMO-${p.sku}`, p.name, p.desc, p.price, tax?.id ?? null, p.unit, p.cat]
      )
      productIds.push(lastInsertRowid)
    }

    // 14 فاتورة بحالات متنوعة خلال آخر 8 أشهر
    let invoices = 0
    const plans: { customer: number; daysAgo: number; items: DemoItem[]; paidRatio: number; status?: string }[] = []
    for (let i = 0; i < 14; i++) {
      const items: DemoItem[] = []
      const count = 1 + (i % 4)
      for (let k = 0; k < count; k++) {
        const p = PRODUCTS[(i + k * 3) % PRODUCTS.length]
        items.push({ name: p.name, qtyMilli: (1 + ((i + k) % 5)) * 1000, priceMinor: p.price, taxBps: p.tax, discountBps: k === 1 ? 500 : 0 })
      }
      const ratio = [1, 0, 0.4, 1, 0, 1, 0.5, 0, 1, 1, 0, 0.25, 1, 0][i]
      plans.push({ customer: customerIds[i % customerIds.length], daysAgo: 240 - i * 17, items, paidRatio: ratio, status: i === 13 ? 'cancelled' : undefined })
    }
    let seq = 9000
    for (const plan of plans) {
      seq++
      const issue = isoDaysAgo(plan.daysAgo)
      const due = isoDaysAgo(plan.daysAgo - 30)
      const lines = plan.items.map((it, idx) => {
        const base = multiplyQuantity(it.qtyMilli, it.priceMinor)
        const discount = applyBps(base, it.discountBps)
        const net = base - discount
        const tax = applyBps(net, it.taxBps)
        return { ...it, idx, base, discount, net, tax, total: net + tax }
      })
      const subtotal = sumMinor(lines.map((l) => l.base))
      const discountTotal = sumMinor(lines.map((l) => l.discount))
      const taxable = subtotal - discountTotal
      const taxTotal = sumMinor(lines.map((l) => l.tax))
      const grand = taxable + taxTotal
      const paid = plan.status === 'cancelled' ? 0 : Math.round(grand * plan.paidRatio)
      const remaining = grand - paid
      const overdue = remaining > 0 && Date.parse(due) < Date.now()
      const status = plan.status ?? (paid >= grand ? 'paid' : paid > 0 ? (overdue ? 'overdue' : 'partially_paid') : overdue ? 'overdue' : 'sent')
      const customer = db.get<{ first_name: string; last_name: string; company_name: string; phone: string; email: string; address: string }>(
        'SELECT first_name, last_name, company_name, phone, email, address FROM customers WHERE id = ?', [plan.customer]
      )!
      const snapshot = {
        firstName: customer.first_name, lastName: customer.last_name, companyName: customer.company_name,
        phone: customer.phone, email: customer.email, address: customer.address,
        displayName: customer.company_name || `${customer.first_name} ${customer.last_name}`
      }
      const number = formatDocumentNumber('INV-{YYYY}-{SEQ:5}', { date: new Date(issue), sequence: seq })
      const { lastInsertRowid: invoiceId } = db.run(
        `INSERT INTO invoices (doc_type, number, status, customer_id, customer_snapshot, issue_date, due_date, currency,
           subtotal_minor, discount_total_minor, taxable_minor, tax_total_minor, grand_total_minor, paid_minor, remaining_minor,
           is_demo, source, created_at, updated_at)
         VALUES ('invoice', ?, ?, ?, ?, ?, ?, 'DZD', ?, ?, ?, ?, ?, ?, ?, 1, 'manual', ?, ?)`,
        [number, status, plan.customer, JSON.stringify(snapshot), issue, due, subtotal, discountTotal, taxable, taxTotal, grand, paid, remaining, `${issue}T09:00:00.000Z`, `${issue}T09:00:00.000Z`]
      )
      for (const l of lines) {
        db.run(
          `INSERT INTO invoice_items (invoice_id, position, name, quantity_milli, unit_price_minor, discount_bps, tax_bps, tax_name,
             base_minor, discount_minor, net_minor, tax_minor, total_minor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [invoiceId, l.idx, l.name, l.qtyMilli, l.priceMinor, l.discountBps, l.taxBps, `TVA ${l.taxBps / 100}%`, l.base, l.discount, l.net, l.tax, l.total]
        )
      }
      if (paid > 0) {
        db.run(
          `INSERT INTO payments (invoice_id, paid_at, amount_minor, method, reference, is_demo) VALUES (?, ?, ?, ?, ?, 1)`,
          [invoiceId, isoDaysAgo(Math.max(0, plan.daysAgo - 10)), paid, paid >= grand ? 'bank_transfer' : 'cash', `PAY-${seq}`]
        )
      }
      invoices++
    }
    audit('demo.loaded', 'demo', undefined, `${customerIds.length} customers, ${productIds.length} products, ${invoices} invoices`)
    return { customers: customerIds.length, products: productIds.length, invoices }
  })
}

export function clearDemoData(): void {
  const db = getDatabase()
  db.transaction(() => {
    db.run('DELETE FROM payments WHERE is_demo = 1 OR invoice_id IN (SELECT id FROM invoices WHERE is_demo = 1)')
    db.run('DELETE FROM invoices WHERE is_demo = 1')
    db.run('DELETE FROM products WHERE is_demo = 1')
    db.run('DELETE FROM customers WHERE is_demo = 1')
    db.run('DELETE FROM documents WHERE is_demo = 1')
    db.run('DELETE FROM spreadsheet_documents WHERE is_demo = 1')
    audit('demo.cleared', 'demo')
  })
}
