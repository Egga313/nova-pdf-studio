/**
 * سجل الأوامر المركزي: كل أمر له معرّف، مفتاح ترجمة، اختصار اختياري، ودالة تنفيذ.
 * تستخدمه لوحة الأوامر (Ctrl+K) واختصارات لوحة المفاتيح والقوائم، فلا يتكرر المنطق.
 */
import { create } from 'zustand'

export interface Command {
  id: string
  titleKey: string
  titleParams?: Record<string, string>
  section: 'navigation' | 'actions' | 'view' | 'system'
  shortcut?: string            // مثل "Ctrl+K" أو "Ctrl+Shift+S"
  keywords?: string[]
  icon?: string
  enabled?: () => boolean
  run: () => unknown   // القيمة المعادة تُهمل (يسمح بإرجاع معرّف التبويب أو Promise)
}

interface CommandsState {
  commands: Map<string, Command>
  register: (...commands: Command[]) => () => void
  run: (id: string) => Promise<void>
  list: () => Command[]
}

export const useCommands = create<CommandsState>((set, get) => ({
  commands: new Map(),
  register: (...commands) => {
    set((s) => {
      const next = new Map(s.commands)
      for (const c of commands) next.set(c.id, c)
      return { commands: next }
    })
    return () =>
      set((s) => {
        const next = new Map(s.commands)
        for (const c of commands) next.delete(c.id)
        return { commands: next }
      })
  },
  run: async (id) => {
    const command = get().commands.get(id)
    if (!command || (command.enabled && !command.enabled())) return
    await command.run()
  },
  list: () => [...get().commands.values()]
}))

/** يحوّل حدث لوحة المفاتيح إلى نص اختصار موحّد: "Ctrl+Shift+S". */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  let key = event.key
  if (key === ' ') key = 'Space'
  if (key.length === 1) key = key.toUpperCase()
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null
  // Ctrl+Tab يُبلَّغ بـ key = "Tab"
  parts.push(key)
  return parts.join('+')
}

export function normalizeShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((p) => {
      const t = p.trim()
      if (/^(ctrl|control|cmd|meta)$/i.test(t)) return 'Ctrl'
      if (/^shift$/i.test(t)) return 'Shift'
      if (/^alt|option$/i.test(t)) return 'Alt'
      return t.length === 1 ? t.toUpperCase() : t
    })
    .join('+')
}

/** نص الاختصار للعرض حسب المنصة. */
export function displayShortcut(shortcut: string): string {
  const isMac = window.nova?.platform === 'darwin'
  return normalizeShortcut(shortcut)
    .replace('Ctrl', isMac ? '⌘' : 'Ctrl')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace('Alt', isMac ? '⌥' : 'Alt')
}

/** هل العنصر النشط حقل إدخال؟ (بعض الاختصارات لا تُلتقط أثناء الكتابة) */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

const TYPING_SAFE = new Set(['Ctrl+K', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P', 'Ctrl+O', 'Ctrl+W', 'Ctrl+Shift+T', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+,', 'Ctrl+L', 'F1', 'Escape'])

/** معالج عام للاختصارات؛ يُركَّب مرة واحدة في App. */
export function installShortcutListener(): () => void {
  const handler = (event: KeyboardEvent) => {
    const combo = shortcutFromEvent(event)
    if (!combo) return
    if (isTypingTarget(event.target) && !TYPING_SAFE.has(combo)) return
    const command = useCommands.getState().list().find((c) => c.shortcut && normalizeShortcut(c.shortcut) === combo)
    if (!command || (command.enabled && !command.enabled())) return
    event.preventDefault()
    event.stopPropagation()
    void command.run()
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}
