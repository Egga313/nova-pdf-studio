/**
 * نظام التبويبات (كالمتصفح): كل تبويب له نوع ومعاملات؛ الوحدات تسجّل مكوّن العرض لكل نوع.
 * التبويبات "المفردة" (القوائم مثل العملاء) تُعاد إلى الواجهة بدل تكرارها.
 */
import { create } from 'zustand'

export type TabKind =
  | 'dashboard' | 'settings' | 'pdf' | 'pdf-new' | 'invoices' | 'invoice' | 'invoice-preview' | 'customers' | 'customer'
  | 'products' | 'spreadsheets' | 'spreadsheet' | 'templates' | 'template-designer' | 'documents' | 'tools' | 'audit'

export interface Tab {
  id: string
  kind: TabKind
  title: string          // نص جاهز أو مفتاح ترجمة يبدأ بـ "t:"
  params: Record<string, unknown>
  dirty: boolean
  closable: boolean
  icon?: string
}

const SINGLETON_KINDS: TabKind[] = ['dashboard', 'settings', 'invoices', 'customers', 'products', 'spreadsheets', 'templates', 'documents', 'tools', 'audit']

interface TabsState {
  tabs: Tab[]
  activeId: string
  closedStack: Tab[]
  open: (tab: Omit<Tab, 'id' | 'dirty' | 'closable'> & { id?: string; closable?: boolean }) => string
  activate: (id: string) => void
  close: (id: string) => void
  closeOthers: (id: string) => void
  reopenClosed: () => void
  setDirty: (id: string, dirty: boolean) => void
  setTitle: (id: string, title: string) => void
  updateParams: (id: string, params: Record<string, unknown>) => void
  next: () => void
  prev: () => void
}

let counter = 0
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(counter++).toString(36)}`

const HOME: Tab = { id: 'dashboard', kind: 'dashboard', title: 't:nav.home', params: {}, dirty: false, closable: false }

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [HOME],
  activeId: HOME.id,
  closedStack: [],

  open: (input) => {
    const { tabs } = get()
    // معرّف صريح (مثل invoice-12) أو نوع مفرد: نعيد التفعيل بدل التكرار
    const existing = input.id
      ? tabs.find((t) => t.id === input.id)
      : SINGLETON_KINDS.includes(input.kind)
        ? tabs.find((t) => t.kind === input.kind)
        : undefined
    if (existing) {
      set({ activeId: existing.id, tabs: tabs.map((t) => (t.id === existing.id ? { ...t, params: { ...t.params, ...input.params } } : t)) })
      return existing.id
    }
    const tab: Tab = {
      id: input.id ?? newId(input.kind),
      kind: input.kind,
      title: input.title,
      params: input.params ?? {},
      dirty: false,
      closable: input.closable ?? true,
      icon: input.icon
    }
    set({ tabs: [...tabs, tab], activeId: tab.id })
    return tab.id
  },

  activate: (id) => {
    if (get().tabs.some((t) => t.id === id)) set({ activeId: id })
  },

  close: (id) => {
    const { tabs, activeId, closedStack } = get()
    const index = tabs.findIndex((t) => t.id === id)
    if (index < 0 || !tabs[index].closable) return
    const closing = tabs[index]
    const remaining = tabs.filter((t) => t.id !== id)
    let nextActive = activeId
    if (activeId === id) nextActive = (remaining[index] ?? remaining[index - 1] ?? remaining[0]).id
    set({ tabs: remaining, activeId: nextActive, closedStack: [...closedStack.slice(-9), { ...closing, dirty: false }] })
  },

  closeOthers: (id) => {
    const { tabs } = get()
    const keep = tabs.filter((t) => t.id === id || !t.closable)
    const closed = tabs.filter((t) => t.id !== id && t.closable)
    set({ tabs: keep, activeId: id, closedStack: [...get().closedStack, ...closed].slice(-10) })
  },

  reopenClosed: () => {
    const { closedStack } = get()
    const last = closedStack[closedStack.length - 1]
    if (!last) return
    set({ closedStack: closedStack.slice(0, -1) })
    get().open({ ...last, id: last.id })
  },

  setDirty: (id, dirty) => set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) }),
  setTitle: (id, title) => set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title } : t)) }),
  updateParams: (id, params) => set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, params: { ...t.params, ...params } } : t)) }),

  next: () => {
    const { tabs, activeId } = get()
    const i = tabs.findIndex((t) => t.id === activeId)
    set({ activeId: tabs[(i + 1) % tabs.length].id })
  },
  prev: () => {
    const { tabs, activeId } = get()
    const i = tabs.findIndex((t) => t.id === activeId)
    set({ activeId: tabs[(i - 1 + tabs.length) % tabs.length].id })
  }
}))

export function useActiveTab(): Tab {
  return useTabs((s) => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0])
}
