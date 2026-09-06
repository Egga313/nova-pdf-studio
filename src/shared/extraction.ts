/**
 * أنواع استخراج الفواتير من PDF: مناطق (Zones) بنسب من أبعاد الصفحة حتى تعمل مع أي دقة،
 * قوالب استخراج تُخزَّن في invoice_templates بنوع 'extraction'، ونتيجة استخراج مع تحققات حسابية.
 */
export type ZoneField =
  | 'number' | 'issueDate' | 'dueDate' | 'reference'
  | 'customerName' | 'customerPhone' | 'customerAddress' | 'customerTaxId'
  | 'subtotal' | 'discount' | 'tax' | 'total' | 'notes' | 'items'

export const ZONE_FIELDS: ZoneField[] = [
  'number', 'issueDate', 'dueDate', 'reference', 'customerName', 'customerPhone', 'customerAddress', 'customerTaxId',
  'subtotal', 'discount', 'tax', 'total', 'notes', 'items'
]

export const AMOUNT_FIELDS: ZoneField[] = ['subtotal', 'discount', 'tax', 'total']
export const DATE_FIELDS: ZoneField[] = ['issueDate', 'dueDate']

export type ItemColumn = 'ref' | 'description' | 'qty' | 'unitPrice' | 'discount' | 'tax' | 'total'
export const ITEM_COLUMNS: ItemColumn[] = ['ref', 'description', 'qty', 'unitPrice', 'discount', 'tax', 'total']

/** مستطيل بنسب (0..1) من عرض/ارتفاع الصفحة. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneColumn {
  column: ItemColumn
  x: number // نسبة من عرض المنطقة
  w: number
}

export interface Zone {
  id: string
  field: ZoneField
  page: number
  rect: Rect
  columns?: ZoneColumn[]   // لمنطقة البنود فقط
  hasHeaderRow?: boolean   // لمنطقة البنود: تجاهل الصف الأول
}

export interface ExtractionDefinition {
  version: 1
  pageWidthPt: number
  pageHeightPt: number
  zones: Zone[]
  keywords: string[]          // كلمات تميّز مستندات هذا المورّد (للتعرف التلقائي على القالب)
  language: 'ar' | 'fr' | 'en' | 'auto'
  decimals: number
}

export interface ExtractionTemplate {
  id: number
  name: string
  definition: ExtractionDefinition
  sourceDocumentId: number | null
  createdAt: string
  updatedAt: string
}

export interface ExtractionTemplateInput {
  id?: number
  name: string
  definition: ExtractionDefinition
  sourceDocumentId?: number | null
}

export interface ExtractedField {
  field: ZoneField
  raw: string        // النص كما وُجد
  value: string      // القيمة المطبَّعة (ISO للتاريخ، رقم عشري نصي للمبالغ)
  confidence: number // 0..1
  source: 'zone' | 'auto'
}

export interface ExtractedItem {
  name: string
  description: string
  quantityMilli: number
  unitPriceMinor: number
  discountBps: number
  taxBps: number
  totalMinor: number | null   // الإجمالي كما ورد في المستند (للتحقق)
  raw: string
}

export type WarningCode = 'items_total_mismatch' | 'total_mismatch' | 'missing_total' | 'missing_number' | 'missing_customer' | 'no_items' | 'date_unparsed'

export interface ExtractionWarning {
  code: WarningCode
  params?: Record<string, string | number>
}

export interface ExtractedInvoice {
  fields: Partial<Record<ZoneField, ExtractedField>>
  items: ExtractedItem[]
  warnings: ExtractionWarning[]
  computedItemsTotalMinor: number
  pageText: string
}
