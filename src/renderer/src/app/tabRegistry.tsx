/** ربط أنواع التبويبات بمكوّنات العرض. الوحدات الجديدة تسجّل نوعها هنا فقط. */
import type { ComponentType } from 'react'
import { CustomerProfileTab } from '@modules/customers/renderer/CustomerProfileTab'
import { CustomersTab } from '@modules/customers/renderer/CustomersTab'
import { Dashboard } from '@modules/dashboard/renderer/Dashboard'
import { InvoiceEditor } from '@modules/invoices/renderer/InvoiceEditor'
import { InvoicesTab } from '@modules/invoices/renderer/InvoicesTab'
import { ProductsTab } from '@modules/products/renderer/ProductsTab'
import { InvoicePreviewTab } from '@modules/templates/renderer/InvoicePreviewTab'
import { TemplateDesigner } from '@modules/templates/renderer/TemplateDesigner'
import { TemplatesTab } from '@modules/templates/renderer/TemplatesTab'
import { AuditTab } from '@modules/audit/renderer/AuditTab'
import { PdfImportTab } from '@modules/import/renderer/PdfImportTab'
import { DocumentsTab } from '@modules/pdf/renderer/DocumentsTab'
import { PdfViewerTab } from '@modules/pdf/renderer/PdfViewerTab'
import { ToolsTab } from '@modules/pdf/renderer/ToolsTab'
import { SettingsTab } from '@modules/settings/renderer/SettingsTab'
import { SpreadsheetTab } from '@modules/spreadsheet/renderer/SpreadsheetTab'
import { SpreadsheetsTab } from '@modules/spreadsheet/renderer/SpreadsheetsTab'
import type { Tab, TabKind } from '@renderer/stores/tabs'
import { PhasePlaceholder } from './PhasePlaceholder'

export interface TabComponentProps {
  tab: Tab
}

const registry: Partial<Record<TabKind, ComponentType<TabComponentProps>>> = {
  dashboard: Dashboard,
  settings: SettingsTab,
  documents: DocumentsTab,
  pdf: PdfViewerTab,
  'pdf-new': DocumentsTab,
  tools: ToolsTab,
  // المراحل اللاحقة تستبدل هذه العناصر النائبة بوحدات حقيقية
  invoices: InvoicesTab,
  invoice: InvoiceEditor,
  'invoice-preview': InvoicePreviewTab,
  customers: CustomersTab,
  customer: CustomerProfileTab,
  products: ProductsTab,
  templates: TemplatesTab,
  'template-designer': TemplateDesigner,
  spreadsheets: SpreadsheetsTab,
  spreadsheet: SpreadsheetTab,
  'pdf-import': PdfImportTab,
  audit: AuditTab
}

export function registerTabComponent(kind: TabKind, component: ComponentType<TabComponentProps>): void {
  registry[kind] = component
}

export function resolveTabComponent(kind: TabKind): ComponentType<TabComponentProps> {
  return registry[kind] ?? ((p) => <PhasePlaceholder tab={p.tab} phase={0} />)
}
