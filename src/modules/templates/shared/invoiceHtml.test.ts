import { describe, expect, it } from 'vitest'
import type { Invoice } from '@shared/invoicing'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { BUILTIN_TEMPLATES, normalizeDefinition } from '@shared/templates'
import { renderInvoiceHtml, suggestedFileName } from './invoiceHtml'
import { qrMatrix, qrSvg } from './qr'

const invoice: Invoice = {
  id: 1, docType: 'invoice', number: 'INV-2026-00045', status: 'partially_paid', customerId: 1,
  customerSnapshot: { id: 1, displayName: 'شركة النور للتجارة — أحمد بن يوسف', companyName: 'شركة النور للتجارة', phone: '0550 12 34 56', email: 'ahmed@alnour.dz', address: 'الجزائر', city: 'الجزائر', country: 'الجزائر', taxId: '00123', customerNumber: 'CUS-00001' },
  companySnapshot: {}, issueDate: '2026-09-06', dueDate: '2026-10-06', reference: 'REF-9', purchaseOrder: 'PO-1', currency: 'DZD', currencyPosition: 'after',
  paymentMethod: 'bank_transfer', notes: 'شكرًا لكم', paymentTerms: 'الدفع خلال 30 يومًا', templateId: null,
  subtotalMinor: 10_000_000, discountTotalMinor: 0, taxableMinor: 10_000_000, taxTotalMinor: 1_900_000, shippingMinor: 0, feesMinor: 0, grandTotalMinor: 11_900_000,
  paidMinor: 4_000_000, remainingMinor: 7_900_000, amountInWords: true, pdfPath: null, source: 'manual', sourceDocumentId: null, isDemo: false, deletedAt: null,
  createdAt: '', updatedAt: '',
  items: [
    { id: 1, position: 0, productId: null, name: 'تصميم هوية بصرية', description: 'شعار + دليل', quantityMilli: 2000, unit: 'خدمة', unitPriceMinor: 5_000_000, discountBps: 0, taxBps: 1900, taxName: 'TVA 19%', baseMinor: 10_000_000, discountMinor: 0, netMinor: 10_000_000, taxMinor: 1_900_000, totalMinor: 11_900_000 }
  ],
  payments: []
}
const company = { ...DEFAULT_SETTINGS.company, name: 'NOVA Studio', phone: '021 00 00 00', rc: '16/00-123', nif: '000123456789' }
const currency = { code: 'DZD', symbol: 'DZD', decimals: 2, position: 'after' as const }

describe('renderInvoiceHtml', () => {
  it('renders an arabic RTL invoice with all key figures', () => {
    const tpl = normalizeDefinition(BUILTIN_TEMPLATES.find((t) => t.key === 'arabic')!.definition)
    const html = renderInvoiceHtml({ invoice, company, template: tpl, currency, language: 'ar' })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('INV-2026-00045')
    expect(html).toContain('NOVA Studio')
    expect(html).toContain('شركة النور للتجارة')
    expect(html).toContain('تصميم هوية بصرية')
    expect(html).toContain('119.000,00 DZD')          // المجموع الإجمالي بتنسيق ar-DZ
    expect(html).toContain('79.000,00 DZD')           // المتبقي
    expect(html).toContain('مائة وتسعة عشر ألف دينار جزائري')  // المبلغ بالحروف
    expect(html).toContain('<svg')                    // QR
    expect(html).toContain('RC:')
    expect(html).not.toContain('IBAN')                // مخفي افتراضيًا
  })
  it('renders english LTR with the english template and escapes HTML', () => {
    const tpl = normalizeDefinition(BUILTIN_TEMPLATES.find((t) => t.key === 'modern')!.definition)
    const html = renderInvoiceHtml({ invoice: { ...invoice, notes: '<script>alert(1)</script>' }, company, template: tpl, currency, language: 'en' })
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('GRAND TOTAL')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('honours hidden columns and cancelled watermark', () => {
    const tpl = normalizeDefinition({ ...BUILTIN_TEMPLATES[0].definition, columns: { index: false, description: false, unit: false, discount: false, taxRate: false, taxAmount: false, net: false }, showQr: false })
    const html = renderInvoiceHtml({ invoice: { ...invoice, status: 'cancelled' }, company, template: tpl, currency, language: 'fr' })
    expect(html).toContain('class="watermark"')
    expect(html).not.toContain('class="c-desc"')
    expect(html).not.toContain('<svg')
  })
  it('suggests a safe file name', () => {
    expect(suggestedFileName(invoice)).toBe('INV-2026-00045_شركة-النور-للتجارة-—-أحمد-بن-يوسف.pdf')
    expect(suggestedFileName({ ...invoice, number: 'A/B:C', customerSnapshot: { displayName: 'X<>Y' } })).toBe('A-B-C_XY.pdf')
  })
})

describe('qr', () => {
  it('produces a square matrix with finder patterns', () => {
    const m = qrMatrix('INV-2026-00045')
    expect(m.length).toBe(21) // الإصدار 1
    expect(m.every((row) => row.length === m.length)).toBe(true)
    // زاوية finder: الصف الأول 7 وحدات سوداء
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true)
    expect(m[0].slice(m.length - 7).every(Boolean)).toBe(true)
    expect(m[m.length - 1].slice(0, 7).every(Boolean)).toBe(true)
  })
  it('scales to longer payloads and renders svg', () => {
    const long = 'INVOICE INV-2026-00045\nNOVA Studio\nTotal: 119,000.00 DZD\nشركة النور للتجارة — أحمد بن يوسف'
    const m = qrMatrix(long)
    expect(m.length).toBeGreaterThan(21)
    const svg = qrSvg(long, 120)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<path')
  })
})
