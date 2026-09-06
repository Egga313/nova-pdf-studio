/**
 * نموذج قالب الفاتورة: صفحة A4/A5/Letter مقسّمة إلى كتل قابلة للتحريك (Drag & Drop في المصمّم)،
 * مع أنماط (خط/حجم/ألوان/حدود/خلفية/محاذاة/هوامش). القالب يُخزَّن كـ JSON في invoice_templates.definition.
 */

export type TemplateBlockKind =
  | 'logo' | 'company' | 'customer' | 'invoiceNumber' | 'dates' | 'meta' | 'title' | 'table' | 'totals' | 'amountWords'
  | 'notes' | 'terms' | 'payment' | 'signature' | 'stamp' | 'footer' | 'qr' | 'text'

export interface BlockStyle {
  fontFamily?: string
  fontSize?: number          // pt
  color?: string
  background?: string | null
  border?: string | null      // مثل "1px solid #ddd"
  borderRadius?: number
  align?: 'start' | 'center' | 'end'
  padding?: number            // mm
  bold?: boolean
}

export interface TemplateBlock {
  id: string
  kind: TemplateBlockKind
  x: number         // mm من بداية الاتجاه (يمين في RTL)
  y: number         // mm من الأعلى
  width: number     // mm
  height: number    // mm (للكتل الحرة؛ الجدول يمتد تلقائيًا)
  visible: boolean
  style?: BlockStyle
  text?: string     // لكتلة text وعنوان title
  props?: Record<string, unknown>
}

export interface TemplatePage {
  size: 'A4' | 'A5' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginMm: number
}

export interface TemplateTheme {
  fontFamily: string
  baseFontSize: number
  accent: string
  text: string
  muted: string
  tableHeaderBg: string
  tableHeaderText: string
  tableStripe: string | null
  borderColor: string
}

export interface TemplateColumns {
  index: boolean
  description: boolean
  unit: boolean
  discount: boolean
  taxRate: boolean
  taxAmount: boolean
  net: boolean
}

export interface TemplateDefinition {
  version: 1
  direction: 'auto' | 'rtl' | 'ltr'
  language: 'auto' | 'ar' | 'fr' | 'en'
  page: TemplatePage
  theme: TemplateTheme
  columns: TemplateColumns
  blocks: TemplateBlock[]
  showLogo: boolean
  showAmountInWords: boolean
  showQr: boolean
  qrContent: 'number' | 'summary' | 'custom'
  qrCustomText: string
  labels?: Partial<Record<string, string>>   // تجاوز نصوص العناوين
}

export interface InvoiceTemplate {
  id: number
  name: string
  kind: 'layout' | 'extraction'
  definition: TemplateDefinition
  isDefault: boolean
  isBuiltin: boolean
  sourceDocumentId: number | null
  createdAt: string
  updatedAt: string
}

export interface TemplateInput {
  id?: number
  name: string
  definition: TemplateDefinition
  isDefault?: boolean
}

// ------------------------------------------------------------------ القوالب المضمّنة
const A4: TemplatePage = { size: 'A4', orientation: 'portrait', marginMm: 14 }
const COLUMNS: TemplateColumns = { index: true, description: true, unit: true, discount: true, taxRate: true, taxAmount: false, net: true }

function block(id: string, kind: TemplateBlockKind, x: number, y: number, width: number, height: number, extra: Partial<TemplateBlock> = {}): TemplateBlock {
  return { id, kind, x, y, width, height, visible: true, ...extra }
}

/** تخطيط قياسي: شعار ومؤسسة أعلى البداية، رقم وتواريخ أعلى النهاية، العميل، الجدول، المجاميع، الحروف، الملاحظات، التوقيع، التذييل. */
function standardBlocks(): TemplateBlock[] {
  return [
    block('logo', 'logo', 0, 0, 40, 22),
    block('company', 'company', 0, 24, 90, 34, { style: { fontSize: 9 } }),
    block('title', 'title', 120, 0, 62, 12, { style: { fontSize: 20, bold: true, align: 'end' } }),
    block('invoiceNumber', 'invoiceNumber', 120, 13, 62, 8, { style: { fontSize: 11, align: 'end' } }),
    block('dates', 'dates', 120, 22, 62, 18, { style: { fontSize: 9, align: 'end' } }),
    block('customer', 'customer', 120, 42, 62, 26, { style: { fontSize: 9.5, background: '#f5f6fa', padding: 3, borderRadius: 2 } }),
    block('meta', 'meta', 0, 60, 90, 10, { style: { fontSize: 9 } }),
    block('table', 'table', 0, 72, 182, 80),
    block('totals', 'totals', 112, 154, 70, 40, { style: { fontSize: 10 } }),
    block('amountWords', 'amountWords', 0, 154, 108, 12, { style: { fontSize: 9 } }),
    block('payment', 'payment', 0, 168, 108, 20, { style: { fontSize: 9 } }),
    block('notes', 'notes', 0, 200, 108, 20, { style: { fontSize: 9 } }),
    block('terms', 'terms', 0, 222, 108, 14, { style: { fontSize: 8.5 } }),
    block('qr', 'qr', 112, 200, 26, 26),
    block('signature', 'signature', 142, 200, 40, 28, { style: { fontSize: 8.5, align: 'center' } }),
    block('stamp', 'stamp', 112, 230, 30, 26),
    block('footer', 'footer', 0, 262, 182, 8, { style: { fontSize: 8, color: '#777777', align: 'center', border: '1px solid #e5e7eb' } })
  ]
}

function theme(overrides: Partial<TemplateTheme>): TemplateTheme {
  return {
    fontFamily: '"Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif', baseFontSize: 10, accent: '#1f2a44', text: '#15203a', muted: '#6b7280',
    tableHeaderBg: '#1f2a44', tableHeaderText: '#ffffff', tableStripe: '#f7f8fb', borderColor: '#e5e7eb', ...overrides
  }
}

function definition(overrides: Partial<TemplateDefinition> = {}): TemplateDefinition {
  return {
    version: 1, direction: 'auto', language: 'auto', page: A4, theme: theme({}), columns: COLUMNS, blocks: standardBlocks(),
    showLogo: true, showAmountInWords: true, showQr: true, qrContent: 'summary', qrCustomText: '', ...overrides
  }
}

export const BUILTIN_TEMPLATES: { key: string; name: string; definition: TemplateDefinition }[] = [
  { key: 'modern', name: 'Modern Invoice', definition: definition({ theme: theme({ accent: '#4f46e5', tableHeaderBg: '#4f46e5', tableStripe: '#f5f4ff' }) }) },
  { key: 'minimal', name: 'Minimal Invoice', definition: definition({ theme: theme({ accent: '#111827', tableHeaderBg: '#ffffff', tableHeaderText: '#111827', tableStripe: null, borderColor: '#d1d5db' }), showQr: false }) },
  { key: 'classic', name: 'Classic Invoice', definition: definition({ theme: theme({ fontFamily: '"Times New Roman", "Noto Naskh Arabic", serif', accent: '#7c2d12', tableHeaderBg: '#7c2d12', tableStripe: '#fdf6f0' }) }) },
  { key: 'corporate', name: 'Corporate Invoice', definition: definition({ theme: theme({ accent: '#0f766e', tableHeaderBg: '#0f766e', tableStripe: '#f0fdfa' }), page: { ...A4, marginMm: 12 } }) },
  { key: 'arabic', name: 'فاتورة عربية', definition: definition({ direction: 'rtl', language: 'ar', theme: theme({ fontFamily: '"Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif', baseFontSize: 10.5, accent: '#0f2a47', tableHeaderBg: '#0f2a47', tableStripe: '#f3f6fa' }) }) },
  { key: 'french', name: 'Facture française', definition: definition({ direction: 'ltr', language: 'fr', theme: theme({ accent: '#1d4ed8', tableHeaderBg: '#1d4ed8', tableStripe: '#eff6ff' }) }) }
]

export function cloneDefinition(def: TemplateDefinition): TemplateDefinition {
  return JSON.parse(JSON.stringify(def)) as TemplateDefinition
}

export function pageSizeMm(page: TemplatePage): { width: number; height: number } {
  const base = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] }[page.size]
  return page.orientation === 'landscape' ? { width: base[1], height: base[0] } : { width: base[0], height: base[1] }
}

/** يضمن أن التعريف المخزّن يحوي كل الحقول (للنسخ القديمة). */
export function normalizeDefinition(input: Partial<TemplateDefinition> | null | undefined): TemplateDefinition {
  const base = definition()
  if (!input) return base
  return {
    ...base, ...input,
    page: { ...base.page, ...(input.page ?? {}) },
    theme: { ...base.theme, ...(input.theme ?? {}) },
    columns: { ...base.columns, ...(input.columns ?? {}) },
    blocks: Array.isArray(input.blocks) && input.blocks.length ? input.blocks : base.blocks
  }
}
