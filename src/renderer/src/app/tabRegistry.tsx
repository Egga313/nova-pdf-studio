/** ربط أنواع التبويبات بمكوّنات العرض. الوحدات الجديدة تسجّل نوعها هنا فقط. */
import type { ComponentType } from 'react'
import { CustomerProfileTab } from '@modules/customers/renderer/CustomerProfileTab'
import { CustomersTab } from '@modules/customers/renderer/CustomersTab'
import { Dashboard } from '@modules/dashboard/renderer/Dashboard'
import { InvoiceEditor } from '@modules/invoices/renderer/InvoiceEditor'
import { InvoicesTab } from '@modules/invoices/renderer/InvoicesTab'
import { ProductsTab } from '@modules/products/renderer/ProductsTab'
import { DocumentsTab } from '@modules/pdf/renderer/DocumentsTab'
import { PdfViewerTab } from '@modules/pdf/renderer/PdfViewerTab'
import { ToolsTab } from '@modules/pdf/renderer/ToolsTab'
import { SettingsTab } from '@modules/settings/renderer/SettingsTab'
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
  'invoice-preview': (p) => <PhasePlaceholder tab={p.tab} phase={5} />,
  customers: CustomersTab,
  customer: CustomerProfileTab,
  products: ProductsTab,
  templates: (p) => <PhasePlaceholder tab={p.tab} phase={5} />,
  spreadsheets: (p) => <PhasePlaceholder tab={p.tab} phase={6} />,
  spreadsheet: (p) => <PhasePlaceholder tab={p.tab} phase={6} />,
  audit: (p) => <PhasePlaceholder tab={p.tab} phase={8} />
}

export function registerTabComponent(kind: TabKind, component: ComponentType<TabComponentProps>): void {
  registry[kind] = component
}

export function resolveTabComponent(kind: TabKind): ComponentType<TabComponentProps> {
  return registry[kind] ?? ((p) => <PhasePlaceholder tab={p.tab} phase={0} />)
}
