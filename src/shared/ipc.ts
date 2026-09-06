/**
 * عقد IPC المكتوب بالأنواع بين الواجهة والعملية الرئيسية.
 * كل قناة تُعرَّف مرة واحدة هنا؛ الواجهة تستدعي invoke(channel, req) وتحصل على res المكتوب.
 * القنوات محصورة بهذه القائمة فقط (preload يرفض غيرها).
 */
import type { AppSettings } from './settings'
import type { AppInfo, AuditLog, Currency, DashboardStats, FileFilter, RecentFile, RecentFileKind, Tax } from './entities'
import type { DocumentRecord, PdfExportRequest, PrintJobRequest } from './documents'
import type { InvoiceTemplate, TemplateInput } from './templates'
import type { SpreadsheetDetail, SpreadsheetExportType, SpreadsheetListFilters, SpreadsheetRecord, SpreadsheetSaveInput } from './spreadsheets'
import type { OcrProgress, OcrRequest, OcrResult } from './ocr'
import type { ExtractionTemplate, ExtractionTemplateInput } from './extraction'
import type {
  Customer, CustomerInput, CustomerSummary, DocType, Invoice, InvoiceFilters, InvoiceInput, InvoiceListRow, InvoiceStatus, OutstandingItem,
  PaymentInput, Product, ProductInput
} from './invoicing'

export interface IpcContract {
  // ---- التطبيق ----
  'app:info': { req: void; res: AppInfo }
  'app:open-path': { req: { path: string }; res: void }
  'app:show-in-folder': { req: { path: string }; res: void }
  'app:log': { req: { level: 'info' | 'warn' | 'error'; message: string; details?: string }; res: void }
  'app:read-resource': { req: { relativePath: string }; res: Uint8Array }

  // ---- الحوارات والملفات ----
  'dialog:open-files': { req: { filters?: FileFilter[]; multiple?: boolean; title?: string }; res: string[] }
  'dialog:save-file': { req: { defaultPath?: string; filters?: FileFilter[]; title?: string }; res: string | null }
  'dialog:pick-folder': { req: { title?: string }; res: string | null }
  'file:read': { req: { path: string }; res: { name: string; sizeBytes: number; data: Uint8Array } }
  'file:write': { req: { path: string; data: Uint8Array }; res: { sizeBytes: number } }
  'file:stat': { req: { path: string }; res: { exists: boolean; sizeBytes: number; modifiedAt: string | null } }

  // ---- الإعدادات ----
  'settings:get': { req: void; res: AppSettings }
  'settings:update': { req: Partial<AppSettings>; res: AppSettings }
  'settings:pick-logo': { req: void; res: string | null }
  'settings:read-logo': { req: void; res: string | null } // data URL

  // ---- الضرائب والعملات ----
  'taxes:list': { req: { includeInactive?: boolean } | void; res: Tax[] }
  'taxes:save': { req: Partial<Tax> & { name: string; rateBps: number }; res: Tax }
  'taxes:delete': { req: { id: number }; res: void }
  'currencies:list': { req: { includeInactive?: boolean } | void; res: Currency[] }
  'currencies:save': { req: Partial<Currency> & { code: string; name: string; symbol: string }; res: Currency }
  'currencies:delete': { req: { code: string }; res: void }

  // ---- الملفات الأخيرة ----
  'recent:list': { req: { limit?: number; kind?: RecentFileKind } | void; res: RecentFile[] }
  'recent:add': { req: { path: string; kind: RecentFileKind }; res: RecentFile }
  'recent:remove': { req: { id: number }; res: void }
  'recent:pin': { req: { id: number; pinned: boolean }; res: void }
  'recent:clear': { req: void; res: void }

  // ---- لوحة القيادة ----
  'dashboard:stats': { req: void; res: DashboardStats }

  // ---- التدقيق والبيانات التجريبية ----
  'audit:list': { req: { limit?: number } | void; res: AuditLog[] }
  'demo:load': { req: void; res: { customers: number; products: number; invoices: number } }
  'demo:clear': { req: void; res: void }
  'demo:status': { req: void; res: { loaded: boolean } }

  // ---- الأمان ----
  'security:set-pin': { req: { pin: string; currentPin?: string }; res: void }
  'security:remove-pin': { req: { currentPin: string }; res: void }
  'security:verify-pin': { req: { pin: string }; res: { ok: boolean } }
  'security:status': { req: void; res: { enabled: boolean } }

  // ---- المستندات (PDF) ----
  'documents:list': { req: { limit?: number; query?: string } | void; res: DocumentRecord[] }
  'documents:register': { req: { path: string | null; title?: string; kind?: DocumentRecord['kind']; sizeBytes?: number | null; pageCount: number; isScanned?: boolean }; res: DocumentRecord }
  'documents:remove': { req: { id: number }; res: void }
  'documents:save-page-text': { req: { documentId: number; pageIndex: number; text: string; confidence?: number }; res: void }
  'documents:mark-ocr': { req: { documentId: number }; res: void }

  // ---- العملاء ----
  'customers:list': { req: { query?: string; sort?: 'name' | 'recent' | 'invoiced_desc' | 'remaining_desc'; includeDeleted?: boolean; limit?: number; offset?: number } | void; res: CustomerSummary[] }
  'customers:get': { req: { id: number }; res: CustomerSummary | null }
  'customers:save': { req: CustomerInput; res: Customer }
  'customers:delete': { req: { id: number }; res: void }
  'customers:restore': { req: { id: number }; res: void }
  'customers:purge': { req: { id: number }; res: void }
  'customers:search': { req: { query: string; limit?: number }; res: Customer[] }
  'customers:next-number': { req: void; res: string }

  // ---- المنتجات ----
  'products:list': { req: { query?: string; category?: string; includeInactive?: boolean; includeDeleted?: boolean; limit?: number; offset?: number; sort?: 'name' | 'recent' | 'price_desc' | 'price_asc' } | void; res: Product[] }
  'products:get': { req: { id: number }; res: Product | null }
  'products:save': { req: ProductInput; res: Product }
  'products:delete': { req: { id: number }; res: void }
  'products:restore': { req: { id: number }; res: void }
  'products:search': { req: { query: string; limit?: number }; res: Product[] }
  'products:categories': { req: void; res: string[] }

  // ---- الفواتير والمدفوعات ----
  'invoices:list': { req: InvoiceFilters | void; res: { rows: InvoiceListRow[]; total: number } }
  'invoices:get': { req: { id: number }; res: Invoice | null }
  'invoices:save': { req: InvoiceInput; res: Invoice }
  'invoices:set-status': { req: { id: number; status: InvoiceStatus }; res: Invoice }
  'invoices:trash': { req: { id: number }; res: void }
  'invoices:restore': { req: { id: number }; res: void }
  'invoices:purge': { req: { id: number }; res: void }
  'invoices:duplicate': { req: { id: number }; res: Invoice }
  'invoices:next-number': { req: { docType: DocType; issueDate?: string }; res: string }
  'invoices:outstanding': { req: { limit?: number } | void; res: OutstandingItem[] }
  'invoices:set-pdf-path': { req: { id: number; pdfPath: string }; res: void }
  'payments:add': { req: PaymentInput; res: Invoice }
  'payments:delete': { req: { id: number }; res: Invoice }
  'search:global': { req: { query: string; limit?: number }; res: { customers: { id: number; label: string; sub: string }[]; invoices: { id: number; label: string; sub: string }[]; products: { id: number; label: string; sub: string }[] } }

  // ---- القوالب وأصول الهوية ----
  'templates:list': { req: { kind?: 'layout' | 'extraction' } | void; res: InvoiceTemplate[] }
  'templates:get': { req: { id: number }; res: InvoiceTemplate | null }
  'templates:default': { req: void; res: InvoiceTemplate }
  'templates:save': { req: TemplateInput; res: InvoiceTemplate }
  'templates:duplicate': { req: { id: number; name?: string }; res: InvoiceTemplate }
  'templates:set-default': { req: { id: number }; res: void }
  'templates:delete': { req: { id: number }; res: void }
  'templates:reset-builtin': { req: void; res: void }
  'brand:assets': { req: void; res: { logo: string | null; signature: string | null; stamp: string | null } }
  'brand:pick': { req: { kind: 'logo' | 'signature' | 'stamp' }; res: string | null }
  'brand:clear': { req: { kind: 'logo' | 'signature' | 'stamp' }; res: void }

  // ---- جداول البيانات ----
  'spreadsheets:list': { req: SpreadsheetListFilters | void; res: SpreadsheetRecord[] }
  'spreadsheets:get': { req: { id: number }; res: SpreadsheetDetail | null }
  'spreadsheets:save': { req: SpreadsheetSaveInput; res: SpreadsheetRecord }
  'spreadsheets:delete': { req: { id: number }; res: void }
  'spreadsheets:restore': { req: { id: number }; res: void }
  'spreadsheets:purge': { req: { id: number }; res: void }
  'spreadsheets:import-file': { req: { path: string }; res: { title: string; data: string; sheetCount: number } }
  'spreadsheets:export-file': { req: { path: string; data: string; bookType: SpreadsheetExportType }; res: { sizeBytes: number } }

  // ---- OCR والاستخراج (PDF → فاتورة) ----
  'ocr:recognize': { req: OcrRequest; res: OcrResult }
  'ocr:languages': { req: void; res: string[] }
  'extraction:list': { req: void; res: ExtractionTemplate[] }
  'extraction:save': { req: ExtractionTemplateInput; res: ExtractionTemplate }
  'extraction:delete': { req: { id: number }; res: void }

  // ---- الطباعة والتصدير (محرك Chromium) ----
  'printers:list': { req: void; res: { name: string; displayName: string; isDefault: boolean; status: number }[] }
  'print:html': { req: PrintJobRequest; res: { success: boolean; reason?: string } }
  'print:html-to-pdf': { req: PdfExportRequest; res: { path: string; sizeBytes: number } }

  // ---- النسخ الاحتياطي ----
  'backup:create': { req: { folder?: string } | void; res: { path: string; sizeBytes: number } }
  'backup:restore': { req: { path: string }; res: void }
  'backup:list': { req: void; res: { path: string; sizeBytes: number; createdAt: string }[] }
  'backup:export-db': { req: void; res: string | null }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<K extends IpcChannel> = IpcContract[K]['req']
export type IpcResponse<K extends IpcChannel> = IpcContract[K]['res']

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:info', 'app:open-path', 'app:show-in-folder', 'app:log', 'app:read-resource',
  'dialog:open-files', 'dialog:save-file', 'dialog:pick-folder', 'file:read', 'file:write', 'file:stat',
  'settings:get', 'settings:update', 'settings:pick-logo', 'settings:read-logo',
  'taxes:list', 'taxes:save', 'taxes:delete', 'currencies:list', 'currencies:save', 'currencies:delete',
  'recent:list', 'recent:add', 'recent:remove', 'recent:pin', 'recent:clear',
  'dashboard:stats',
  'audit:list', 'demo:load', 'demo:clear', 'demo:status',
  'security:set-pin', 'security:remove-pin', 'security:verify-pin', 'security:status',
  'documents:list', 'documents:register', 'documents:remove', 'documents:save-page-text', 'documents:mark-ocr',
  'customers:list', 'customers:get', 'customers:save', 'customers:delete', 'customers:restore', 'customers:purge', 'customers:search', 'customers:next-number',
  'products:list', 'products:get', 'products:save', 'products:delete', 'products:restore', 'products:search', 'products:categories',
  'invoices:list', 'invoices:get', 'invoices:save', 'invoices:set-status', 'invoices:trash', 'invoices:restore', 'invoices:purge', 'invoices:duplicate',
  'invoices:next-number', 'invoices:outstanding', 'invoices:set-pdf-path', 'payments:add', 'payments:delete', 'search:global',
  'templates:list', 'templates:get', 'templates:default', 'templates:save', 'templates:duplicate', 'templates:set-default', 'templates:delete', 'templates:reset-builtin',
  'brand:assets', 'brand:pick', 'brand:clear',
  'spreadsheets:list', 'spreadsheets:get', 'spreadsheets:save', 'spreadsheets:delete', 'spreadsheets:restore', 'spreadsheets:purge', 'spreadsheets:import-file', 'spreadsheets:export-file',
  'ocr:recognize', 'ocr:languages', 'extraction:list', 'extraction:save', 'extraction:delete',
  'printers:list', 'print:html', 'print:html-to-pdf',
  'backup:create', 'backup:restore', 'backup:list', 'backup:export-db'
]

/** غلاف النتيجة العائدة عبر IPC حتى تُنقل الأخطاء كبيانات لا كاستثناءات Electron المشوّهة. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: import('./errors').SerializedAppError }

/** أحداث تبثّها العملية الرئيسية إلى الواجهة (بلا طلب). */
export interface IpcEvents {
  'app:open-file-request': { path: string }
  'app:lock': void
  'backup:completed': { path: string }
  'ocr:progress': OcrProgress
}
export type IpcEventName = keyof IpcEvents
