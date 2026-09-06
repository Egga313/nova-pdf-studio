/**
 * توليد HTML الفاتورة للمعاينة والطباعة والتصدير (PDF عبر Chromium) من: الفاتورة + ملف المؤسسة + القالب.
 * الكتل تُوضع بإحداثيات مطلقة بالملليمتر داخل صفحة بمقاس القالب، مع دعم RTL/LTR كامل.
 * دالة نقية: تعمل في الواجهة (معاينة حيّة) وفي الاختبارات.
 */
import type { Invoice, InvoiceItem } from '@shared/invoicing'
import { formatMoney, formatPercent, formatQuantity, type CurrencyInfo } from '@shared/money'
import { type CompanyProfile, intlLocaleOf, type Language, languageDirection } from '@shared/settings'
import { type BlockStyle, pageSizeMm, type TemplateBlock, type TemplateDefinition } from '@shared/templates'
import { amountInWords } from '@modules/invoices/shared/amountInWords'
import { qrSvg } from './qr'

export interface RenderAssets {
  logoDataUrl?: string | null
  signatureDataUrl?: string | null
  stampDataUrl?: string | null
}

export interface RenderContext {
  invoice: Invoice
  company: CompanyProfile
  template: TemplateDefinition
  currency: CurrencyInfo
  language: Language
  assets?: RenderAssets
  labels?: Record<string, string>     // نصوص مترجمة للعناوين (تُمرَّر من i18n)
  dateFormatter?: (iso: string | null) => string
}

/** تسميات الفاتورة المطبوعة متاحة بالعربية/الفرنسية/الإنجليزية؛ اللغات الأخرى تطبع بالإنجليزية (المقبولة دوليًا) ويمكن تعديل التسميات من مصمّم القالب. */
type LabelsLanguage = 'ar' | 'fr' | 'en'
const labelsLanguage = (lang: Language): LabelsLanguage => (lang === 'ar' || lang === 'fr' ? lang : 'en')

const DEFAULT_LABELS: Record<LabelsLanguage, Record<string, string>> = {
  ar: {
    invoice: 'فاتورة', quote: 'عرض سعر', proforma: 'فاتورة أولية', receipt: 'وصل', credit_note: 'إشعار دائن', purchase_order: 'أمر شراء', delivery_note: 'وصل تسليم',
    number: 'رقم', issueDate: 'تاريخ الإصدار', dueDate: 'تاريخ الاستحقاق', reference: 'المرجع', purchaseOrder: 'أمر الشراء', billTo: 'الفاتورة إلى', customerNumber: 'رقم العميل',
    idx: '#', item: 'البند', description: 'الوصف', qty: 'الكمية', unit: 'الوحدة', price: 'سعر الوحدة', discount: 'خصم', tax: 'ضريبة', taxAmount: 'قيمة الضريبة', net: 'الصافي', total: 'المجموع',
    subtotal: 'المجموع الفرعي', discountTotal: 'الخصم', taxable: 'المبلغ الخاضع', taxTotal: 'إجمالي الضريبة', shipping: 'الشحن', fees: 'رسوم', grandTotal: 'المجموع الإجمالي',
    paid: 'المدفوع', remaining: 'المتبقي', amountWords: 'المبلغ بالحروف', notes: 'ملاحظات', terms: 'شروط الدفع', payment: 'معلومات الدفع', paymentMethod: 'طريقة الدفع',
    bank: 'الحساب البنكي', signature: 'التوقيع', stamp: 'الختم', phone: 'الهاتف', email: 'البريد', website: 'الموقع', taxId: 'الرقم الضريبي', status: 'الحالة',
    draft: 'مسودة', sent: 'مرسلة', paid_status: 'مدفوعة', partially_paid: 'مدفوعة جزئيًا', overdue: 'متأخرة', cancelled: 'ملغاة', page: 'صفحة', thanks: 'شكرًا لتعاملكم معنا'
  },
  fr: {
    invoice: 'FACTURE', quote: 'DEVIS', proforma: 'FACTURE PROFORMA', receipt: 'REÇU', credit_note: 'AVOIR', purchase_order: 'BON DE COMMANDE', delivery_note: 'BON DE LIVRAISON',
    number: 'N°', issueDate: "Date d'émission", dueDate: "Date d'échéance", reference: 'Référence', purchaseOrder: 'Bon de commande', billTo: 'Facturer à', customerNumber: 'N° client',
    idx: '#', item: 'Désignation', description: 'Description', qty: 'Qté', unit: 'Unité', price: 'P.U.', discount: 'Remise', tax: 'TVA', taxAmount: 'Montant TVA', net: 'HT', total: 'Total',
    subtotal: 'Sous-total', discountTotal: 'Remise', taxable: 'Base imposable', taxTotal: 'Total TVA', shipping: 'Livraison', fees: 'Frais', grandTotal: 'TOTAL TTC',
    paid: 'Payé', remaining: 'Reste à payer', amountWords: 'Montant en lettres', notes: 'Notes', terms: 'Conditions de paiement', payment: 'Paiement', paymentMethod: 'Mode de paiement',
    bank: 'Compte bancaire', signature: 'Signature', stamp: 'Cachet', phone: 'Tél', email: 'E-mail', website: 'Site', taxId: 'Identifiant fiscal', status: 'État',
    draft: 'Brouillon', sent: 'Envoyée', paid_status: 'Payée', partially_paid: 'Partiellement payée', overdue: 'En retard', cancelled: 'Annulée', page: 'Page', thanks: 'Merci de votre confiance'
  },
  en: {
    invoice: 'INVOICE', quote: 'QUOTE', proforma: 'PROFORMA INVOICE', receipt: 'RECEIPT', credit_note: 'CREDIT NOTE', purchase_order: 'PURCHASE ORDER', delivery_note: 'DELIVERY NOTE',
    number: 'No.', issueDate: 'Issue date', dueDate: 'Due date', reference: 'Reference', purchaseOrder: 'Purchase order', billTo: 'Bill to', customerNumber: 'Customer no.',
    idx: '#', item: 'Item', description: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', discount: 'Discount', tax: 'Tax', taxAmount: 'Tax amount', net: 'Net', total: 'Total',
    subtotal: 'Subtotal', discountTotal: 'Discount', taxable: 'Taxable amount', taxTotal: 'Tax total', shipping: 'Shipping', fees: 'Fees', grandTotal: 'GRAND TOTAL',
    paid: 'Paid', remaining: 'Balance due', amountWords: 'Amount in words', notes: 'Notes', terms: 'Payment terms', payment: 'Payment', paymentMethod: 'Payment method',
    bank: 'Bank account', signature: 'Signature', stamp: 'Stamp', phone: 'Phone', email: 'Email', website: 'Website', taxId: 'Tax ID', status: 'Status',
    draft: 'Draft', sent: 'Sent', paid_status: 'Paid', partially_paid: 'Partially paid', overdue: 'Overdue', cancelled: 'Cancelled', page: 'Page', thanks: 'Thank you for your business'
  }
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>')
}

function styleCss(s: BlockStyle | undefined, theme: TemplateDefinition['theme']): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`)
  if (s.fontSize) parts.push(`font-size:${s.fontSize}pt`)
  if (s.color) parts.push(`color:${s.color}`)
  if (s.background) parts.push(`background:${s.background}`)
  if (s.border) parts.push(`border:${s.border}`)
  if (s.borderRadius) parts.push(`border-radius:${s.borderRadius}mm`)
  if (s.align) parts.push(`text-align:${s.align}`)
  if (s.padding) parts.push(`padding:${s.padding}mm`)
  if (s.bold) parts.push('font-weight:700')
  void theme
  return parts.join(';')
}

export function resolveLanguage(ctx: RenderContext): Language {
  return ctx.template.language === 'auto' ? ctx.language : ctx.template.language
}

export function resolveDirection(ctx: RenderContext): 'rtl' | 'ltr' {
  if (ctx.template.direction !== 'auto') return ctx.template.direction
  return languageDirection(resolveLanguage(ctx))
}

export function qrPayload(ctx: RenderContext): string {
  const inv = ctx.invoice
  if (ctx.template.qrContent === 'custom') return ctx.template.qrCustomText || inv.number
  if (ctx.template.qrContent === 'number') return inv.number
  const total = formatMoney(inv.grandTotalMinor, ctx.currency, { locale: 'en', numberingSystem: 'latn' })
  return [`${inv.docType.toUpperCase()} ${inv.number}`, ctx.company.name, `${ctx.labels?.issueDate ?? 'Date'}: ${inv.issueDate}`, `Total: ${total}`, inv.customerSnapshot.displayName].filter(Boolean).join('\n')
}

/** يبني وثيقة HTML كاملة بحجم الصفحة ومحتواها. */
export function renderInvoiceHtml(ctx: RenderContext): string {
  const { invoice: inv, company, template: tpl, currency } = ctx
  const lang = resolveLanguage(ctx)
  const dir = resolveDirection(ctx)
  const overrides = Object.fromEntries(Object.entries({ ...(tpl.labels ?? {}), ...(ctx.labels ?? {}) }).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const L: Record<string, string> = { ...DEFAULT_LABELS[labelsLanguage(lang)], ...overrides }
  const numLocale = intlLocaleOf(lang)
  const money = (minor: number) => formatMoney(minor, currency, { locale: numLocale, numberingSystem: 'latn' })
  const money0 = (minor: number) => formatMoney(minor, currency, { locale: numLocale, numberingSystem: 'latn', withSymbol: false })
  const date = ctx.dateFormatter ?? ((iso: string | null) => (iso ? iso.split('-').reverse().join('/') : ''))
  const page = pageSizeMm(tpl.page)
  const margin = tpl.page.marginMm
  const contentW = page.width - margin * 2
  const th = tpl.theme
  const assets = ctx.assets ?? {}
  const visible = company.visibleFields

  const blockHtml = (b: TemplateBlock): string => {
    if (!b.visible) return ''
    const inner = blockInner(b)
    if (inner === null) return ''
    // x يقاس من جهة البداية: يمين في RTL ويسار في LTR
    const pos = dir === 'rtl' ? `right:${b.x}mm` : `left:${b.x}mm`
    const auto = b.kind === 'table' || b.kind === 'notes' || b.kind === 'terms' || b.kind === 'totals' || b.kind === 'amountWords' || b.kind === 'payment'
    return `<div class="blk blk-${b.kind}" data-block="${b.id}" style="${pos};top:${b.y}mm;width:${b.width}mm;${auto ? `min-height:${b.height}mm` : `height:${b.height}mm`};${styleCss(b.style, th)}">${inner}</div>`
  }

  const blockInner = (b: TemplateBlock): string | null => {
    switch (b.kind) {
      case 'logo':
        return tpl.showLogo && assets.logoDataUrl ? `<img class="logo" src="${assets.logoDataUrl}" alt=""/>` : ''
      case 'company': {
        const lines = [
          visible.name && company.name && `<div class="strong">${esc(company.name)}</div>`,
          visible.ownerName && (company.firstName || company.lastName) && `<div>${esc([company.firstName, company.lastName].filter(Boolean).join(' '))}</div>`,
          visible.address && [company.address, company.city, company.country].filter(Boolean).length && `<div>${esc([company.address, company.city, company.country].filter(Boolean).join(', '))}</div>`,
          visible.phone && company.phone && `<div><span class="muted">${L.phone}:</span> <bdi>${esc(company.phone)}</bdi></div>`,
          visible.email && company.email && `<div><span class="muted">${L.email}:</span> <bdi>${esc(company.email)}</bdi></div>`,
          visible.website && company.website && `<div><bdi>${esc(company.website)}</bdi></div>`,
          visible.rc && company.rc && `<div><span class="muted">RC:</span> <bdi>${esc(company.rc)}</bdi></div>`,
          visible.nif && company.nif && `<div><span class="muted">NIF:</span> <bdi>${esc(company.nif)}</bdi></div>`,
          visible.nis && company.nis && `<div><span class="muted">NIS:</span> <bdi>${esc(company.nis)}</bdi></div>`,
          visible.ai && company.ai && `<div><span class="muted">AI:</span> <bdi>${esc(company.ai)}</bdi></div>`,
          visible.taxId && company.taxId && `<div><span class="muted">${L.taxId}:</span> <bdi>${esc(company.taxId)}</bdi></div>`
        ].filter(Boolean)
        return lines.join('')
      }
      case 'title':
        return `<div class="title" style="color:${th.accent}">${esc(b.text || L[inv.docType] || L.invoice)}</div>`
      case 'invoiceNumber':
        return `<div><span class="muted">${L.number}</span> <bdi class="strong">${esc(inv.number)}</bdi></div>`
      case 'dates':
        return [
          `<div><span class="muted">${L.issueDate}:</span> <bdi>${esc(date(inv.issueDate))}</bdi></div>`,
          inv.dueDate && `<div><span class="muted">${L.dueDate}:</span> <bdi>${esc(date(inv.dueDate))}</bdi></div>`,
          inv.status !== 'draft' && inv.status !== 'sent' && `<div><span class="muted">${L.status}:</span> ${esc(L[inv.status === 'paid' ? 'paid_status' : inv.status] ?? inv.status)}</div>`
        ].filter(Boolean).join('')
      case 'meta':
        return [
          inv.reference && `<div><span class="muted">${L.reference}:</span> <bdi>${esc(inv.reference)}</bdi></div>`,
          inv.purchaseOrder && `<div><span class="muted">${L.purchaseOrder}:</span> <bdi>${esc(inv.purchaseOrder)}</bdi></div>`
        ].filter(Boolean).join('')
      case 'customer': {
        const c = inv.customerSnapshot
        return [
          `<div class="muted small">${L.billTo}</div>`,
          `<div class="strong">${esc(c.displayName)}</div>`,
          [c.address, c.city, c.country].filter(Boolean).length && `<div>${esc([c.address, c.city, c.country].filter(Boolean).join(', '))}</div>`,
          c.phone && `<div><bdi>${esc(c.phone)}</bdi></div>`,
          c.email && `<div><bdi>${esc(c.email)}</bdi></div>`,
          c.taxId && `<div><span class="muted">${L.taxId}:</span> <bdi>${esc(c.taxId)}</bdi></div>`,
          c.customerNumber && `<div><span class="muted">${L.customerNumber}:</span> <bdi>${esc(c.customerNumber)}</bdi></div>`
        ].filter(Boolean).join('')
      }
      case 'table':
        return tableHtml(inv.items)
      case 'totals':
        return totalsHtml()
      case 'amountWords': {
        if (!tpl.showAmountInWords || !inv.amountInWords) return ''
        let words = ''
        try {
          words = amountInWords(inv.grandTotalMinor, currency.code, lang, currency.decimals)
        } catch {
          words = ''
        }
        return words ? `<div class="muted small">${L.amountWords}</div><div class="words">${esc(words)}</div>` : ''
      }
      case 'notes':
        return inv.notes ? `<div class="muted small">${L.notes}</div><div>${nl2br(inv.notes)}</div>` : ''
      case 'terms':
        return inv.paymentTerms ? `<div class="muted small">${L.terms}</div><div>${nl2br(inv.paymentTerms)}</div>` : ''
      case 'payment': {
        const lines = [
          inv.paymentMethod && `<div><span class="muted">${L.paymentMethod}:</span> ${esc(inv.paymentMethod)}</div>`,
          visible.bankAccount && company.bankAccount && `<div><span class="muted">${L.bank}:</span> <bdi>${esc(company.bankAccount)}</bdi></div>`,
          visible.iban && company.iban && `<div><span class="muted">IBAN:</span> <bdi>${esc(company.iban)}</bdi></div>`,
          visible.swift && company.swift && `<div><span class="muted">SWIFT:</span> <bdi>${esc(company.swift)}</bdi></div>`
        ].filter(Boolean)
        return lines.length ? `<div class="muted small">${L.payment}</div>${lines.join('')}` : ''
      }
      case 'signature':
        return `<div class="muted small">${L.signature}</div>${assets.signatureDataUrl ? `<img class="fit" src="${assets.signatureDataUrl}" alt=""/>` : '<div class="sigline"></div>'}`
      case 'stamp':
        return assets.stampDataUrl ? `<img class="fit" src="${assets.stampDataUrl}" alt=""/>` : ''
      case 'qr':
        return tpl.showQr ? qrSvg(qrPayload(ctx), 96, th.text) : ''
      case 'footer':
        return `<div>${esc(b.text || L.thanks)}</div>`
      case 'text':
        return nl2br(b.text ?? '')
      default:
        return null
    }
  }

  const tableHtml = (items: InvoiceItem[]): string => {
    const cols = tpl.columns
    const head = [
      cols.index && `<th class="c-idx">${L.idx}</th>`, `<th class="c-item">${L.item}</th>`, cols.description && `<th class="c-desc">${L.description}</th>`,
      `<th class="num">${L.qty}</th>`, cols.unit && `<th>${L.unit}</th>`, `<th class="num">${L.price}</th>`, cols.discount && `<th class="num">${L.discount}</th>`,
      cols.taxRate && `<th class="num">${L.tax}</th>`, cols.taxAmount && `<th class="num">${L.taxAmount}</th>`, cols.net && `<th class="num">${L.net}</th>`, `<th class="num">${L.total}</th>`
    ].filter(Boolean).join('')
    const rows = items.map((it, i) => [
      cols.index && `<td class="c-idx">${i + 1}</td>`, `<td class="c-item">${esc(it.name)}</td>`, cols.description && `<td class="c-desc muted">${nl2br(it.description ?? '')}</td>`,
      `<td class="num"><bdi>${formatQuantity(it.quantityMilli, { locale: numLocale })}</bdi></td>`, cols.unit && `<td>${esc(it.unit)}</td>`, `<td class="num"><bdi>${money0(it.unitPriceMinor)}</bdi></td>`,
      cols.discount && `<td class="num"><bdi>${it.discountBps ? formatPercent(it.discountBps, { locale: numLocale }) : '—'}</bdi></td>`,
      cols.taxRate && `<td class="num"><bdi>${formatPercent(it.taxBps, { locale: numLocale })}</bdi></td>`, cols.taxAmount && `<td class="num"><bdi>${money0(it.taxMinor)}</bdi></td>`,
      cols.net && `<td class="num"><bdi>${money0(it.netMinor)}</bdi></td>`, `<td class="num strong"><bdi>${money0(it.totalMinor)}</bdi></td>`
    ].filter(Boolean).join('')).map((r) => `<tr>${r}</tr>`).join('')
    return `<table class="items"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  }

  const totalsHtml = (): string => {
    const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td class="lbl">${label}</td><td class="val"><bdi>${value}</bdi></td></tr>`
    const taxRows = Object.entries(inv.items.reduce<Record<number, number>>((acc, it) => { acc[it.taxBps] = (acc[it.taxBps] ?? 0) + it.taxMinor; return acc }, {}))
      .filter(([bps]) => Number(bps) > 0)
      .map(([bps, minor]) => row(`${L.tax} ${formatPercent(Number(bps), { locale: numLocale })}`, money(minor), 'muted'))
      .join('')
    return `<table class="totals">
      ${row(L.subtotal, money(inv.subtotalMinor))}
      ${inv.discountTotalMinor ? row(L.discountTotal, `− ${money(inv.discountTotalMinor)}`) : ''}
      ${inv.discountTotalMinor ? row(L.taxable, money(inv.taxableMinor)) : ''}
      ${taxRows}
      ${inv.shippingMinor ? row(L.shipping, money(inv.shippingMinor)) : ''}
      ${inv.feesMinor ? row(L.fees, money(inv.feesMinor)) : ''}
      ${row(L.grandTotal, money(inv.grandTotalMinor), 'grand')}
      ${inv.paidMinor ? row(L.paid, money(inv.paidMinor)) : ''}
      ${inv.paidMinor ? row(L.remaining, money(inv.remainingMinor), 'strong') : ''}
    </table>`
  }

  const css = `
    @page { size: ${page.width}mm ${page.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: ${th.fontFamily}; font-size: ${th.baseFontSize}pt; color: ${th.text}; direction: ${dir}; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { position: relative; width: ${page.width}mm; height: ${page.height}mm; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .canvas { position: absolute; top: ${margin}mm; ${dir === 'rtl' ? 'right' : 'left'}: ${margin}mm; width: ${contentW}mm; height: ${page.height - margin * 2}mm; }
    .blk { position: absolute; overflow: hidden; }
    .muted { color: ${th.muted}; }
    .small { font-size: 0.85em; margin-bottom: 1mm; }
    .strong { font-weight: 700; }
    .title { font-size: 20pt; font-weight: 700; letter-spacing: 0.02em; }
    .logo { max-width: 100%; max-height: 100%; object-fit: contain; }
    .fit { max-width: 100%; max-height: 80%; object-fit: contain; display: block; margin: 1mm auto 0; }
    .sigline { border-bottom: 1px solid ${th.borderColor}; height: 14mm; }
    .words { font-style: italic; }
    table.items { width: 100%; border-collapse: collapse; font-size: 0.95em; }
    table.items th { background: ${th.tableHeaderBg}; color: ${th.tableHeaderText}; font-weight: 600; padding: 2mm 2mm; text-align: start; border: 1px solid ${th.tableHeaderBg}; }
    table.items td { padding: 1.8mm 2mm; border: 1px solid ${th.borderColor}; vertical-align: top; }
    ${th.tableStripe ? `table.items tbody tr:nth-child(even) td { background: ${th.tableStripe}; }` : ''}
    table.items .num { text-align: end; white-space: nowrap; }
    table.items .c-idx { width: 7mm; text-align: center; color: ${th.muted}; }
    table.items .c-desc { max-width: 50mm; }
    table.totals { width: 100%; border-collapse: collapse; }
    table.totals td { padding: 1.2mm 2mm; }
    table.totals .lbl { color: ${th.muted}; text-align: start; }
    table.totals .val { text-align: end; white-space: nowrap; }
    table.totals tr.grand td { background: ${th.accent}; color: #fff; font-weight: 700; font-size: 1.1em; border-radius: 1mm; }
    table.totals tr.grand .lbl { color: rgba(255,255,255,0.85); }
    bdi { unicode-bidi: isolate; }
    svg { display: block; width: 100%; height: 100%; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 60pt; font-weight: 800; color: rgba(150,150,150,0.14); transform: rotate(-30deg); pointer-events: none; }
  `
  const watermark = inv.status === 'cancelled' ? `<div class="watermark">${esc(L.cancelled)}</div>` : inv.status === 'draft' ? `<div class="watermark">${esc(L.draft)}</div>` : ''
  const blocks = tpl.blocks.map(blockHtml).join('')
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>${css}</style></head>
<body><div class="page">${watermark}<div class="canvas">${blocks}</div></div></body></html>`
}

/** اسم ملف افتراضي مثل INV-2026-00045_Client-Name.pdf */
export function suggestedFileName(inv: Invoice, ext = 'pdf'): string {
  const client = (inv.customerSnapshot.displayName || 'client').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${inv.number.replace(/[\\/:*?"<>|]+/g, '-')}_${client}.${ext}`
}
