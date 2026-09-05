/** ربط أنواع التبويبات بمكوّنات العرض. الوحدات الجديدة تسجّل نوعها هنا فقط. */
import type { ComponentType } from 'react'
import { Dashboard } from '@modules/dashboard/renderer/Dashboard'
import { SettingsTab } from '@modules/settings/renderer/SettingsTab'
import type { Tab, TabKind } from '@renderer/stores/tabs'
import { PhasePlaceholder } from './PhasePlaceholder'

export interface TabComponentProps {
  tab: Tab
}

const registry: Partial<Record<TabKind, ComponentType<TabComponentProps>>> = {
  dashboard: Dashboard,
  settings: SettingsTab,
  // المراحل اللاحقة تستبدل هذه العناصر النائبة بوحدات حقيقية
  documents: (p) => <PhasePlaceholder tab={p.tab} phase={2} />,
  pdf: (p) => <PhasePlaceholder tab={p.tab} phase={2} />,
  'pdf-new': (p) => <PhasePlaceholder tab={p.tab} phase={3} />,
  invoices: (p) => <PhasePlaceholder tab={p.tab} phase={4} />,
  invoice: (p) => <PhasePlaceholder tab={p.tab} phase={4} />,
  customers: (p) => <PhasePlaceholder tab={p.tab} phase={4} />,
  customer: (p) => <PhasePlaceholder tab={p.tab} phase={4} />,
  products: (p) => <PhasePlaceholder tab={p.tab} phase={4} />,
  templates: (p) => <PhasePlaceholder tab={p.tab} phase={5} />,
  spreadsheets: (p) => <PhasePlaceholder tab={p.tab} phase={6} />,
  spreadsheet: (p) => <PhasePlaceholder tab={p.tab} phase={6} />,
  tools: (p) => <PhasePlaceholder tab={p.tab} phase={2} />,
  audit: (p) => <PhasePlaceholder tab={p.tab} phase={8} />
}

export function registerTabComponent(kind: TabKind, component: ComponentType<TabComponentProps>): void {
  registry[kind] = component
}

export function resolveTabComponent(kind: TabKind): ComponentType<TabComponentProps> {
  return registry[kind] ?? ((p) => <PhasePlaceholder tab={p.tab} phase={0} />)
}
