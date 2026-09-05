/** أنواع الكيانات المشتركة بين العملية الرئيسية والواجهة (تعكس مخطط قاعدة البيانات). */

export interface Timestamps {
  createdAt: string
  updatedAt: string
}

export interface Tax extends Timestamps {
  id: number
  name: string
  rateBps: number          // 1900 = 19%
  isDefault: boolean
  isActive: boolean
}

export interface Currency extends Timestamps {
  code: string             // ISO 4217
  name: string
  symbol: string
  decimals: number
  position: 'before' | 'after'
  isActive: boolean
}

export type RecentFileKind = 'pdf' | 'spreadsheet' | 'image' | 'invoice' | 'other'

export interface RecentFile {
  id: number
  path: string
  name: string
  kind: RecentFileKind
  sizeBytes: number | null
  lastOpenedAt: string
  openCount: number
  pinned: boolean
}

export interface DashboardStats {
  totalInvoices: number
  paidInvoices: number
  unpaidInvoices: number
  overdueInvoices: number
  totalRevenueMinor: number
  remainingMinor: number
  customersCount: number
  productsCount: number
  currency: string
  revenueByMonth: { month: string; paidMinor: number; invoicedMinor: number }[]
  outstanding: OutstandingRow[]
}

export interface OutstandingRow {
  invoiceId: number
  invoiceNumber: string
  customerId: number | null
  customerName: string
  dueDate: string | null
  remainingMinor: number
  daysOverdue: number
  currency: string
}

export type AuditAction =
  | 'invoice.created' | 'invoice.updated' | 'invoice.deleted' | 'invoice.restored' | 'invoice.purged'
  | 'payment.added' | 'payment.deleted'
  | 'customer.created' | 'customer.updated' | 'customer.deleted'
  | 'product.created' | 'product.updated' | 'product.deleted'
  | 'template.changed' | 'settings.changed' | 'backup.created' | 'backup.restored'
  | 'demo.loaded' | 'demo.cleared' | 'security.pin_set' | 'security.pin_removed'

export interface AuditLog {
  id: number
  action: AuditAction
  objectType: string | null
  objectId: string | null
  summary: string | null
  createdAt: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
  dbPath: string
  logPath: string
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface Notification {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  titleKey: string
  messageKey?: string
  params?: Record<string, string | number>
  createdAt: string
  read: boolean
}
