/** لوحة الأوامر (Ctrl+K): أوامر التطبيق + الملفات الأخيرة + بحث شامل في العملاء والفواتير والمنتجات، مع تنقّل بلوحة المفاتيح. */
import { clsx } from 'clsx'
import { Command as CommandIcon, FileText, Package, Receipt, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentFile } from '@shared/entities'
import type { IpcResponse } from '@shared/ipc'
import { Kbd } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { useTabs } from '@renderer/stores/tabs'
import { displayShortcut, useCommands, type Command } from './commands'
import { openFileByPath } from './openFile'

interface Item {
  id: string
  title: string
  subtitle?: string
  section: string
  shortcut?: string
  run: () => unknown
}

type GlobalResults = IpcResponse<'search:global'>
const EMPTY: GlobalResults = { customers: [], invoices: [], products: [] }

function score(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 3
  if (t.includes(q)) return 2
  // تطابق حروف متتابع (ضبابي)
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 1 : 0
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const commands = useCommands((s) => s.commands)
  const openTab = useTabs((s) => s.open)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [results, setResults] = useState<GlobalResults>(EMPTY)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    setResults(EMPTY)
    setTimeout(() => inputRef.current?.focus(), 10)
    invoke('recent:list', { limit: 8 }).then(setRecent).catch(() => setRecent([]))
  }, [open])

  // بحث شامل في قاعدة البيانات عند حرفين أو أكثر (مع تأخير قصير)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(EMPTY)
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const h = setTimeout(() => {
      invoke('search:global', { query: q, limit: 6 })
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults(EMPTY))
        .finally(() => !cancelled && setSearching(false))
    }, 140)
    return () => {
      cancelled = true
      clearTimeout(h)
    }
  }, [query])

  const items = useMemo<Item[]>(() => {
    const cmdItems: Item[] = [...commands.values()]
      .filter((c: Command) => !c.enabled || c.enabled())
      .map((c) => ({
        id: c.id,
        title: t(c.titleKey, c.titleParams),
        section: t(`palette.${c.section === 'navigation' ? 'navigation' : 'commands'}`),
        shortcut: c.shortcut,
        run: () => c.run()
      }))
    const fileItems: Item[] = recent.map((f) => ({
      id: `recent-${f.id}`,
      title: f.name,
      subtitle: f.path,
      section: t('palette.recentFiles'),
      run: () => openFileByPath(f.path)
    }))
    const searchItems: Item[] = [
      ...results.customers.map((c) => ({ id: `cust-${c.id}`, title: c.label, subtitle: c.sub, section: t('palette.customers'), run: () => openTab({ id: `customer-${c.id}`, kind: 'customer', title: c.label, params: { id: c.id } }) })),
      ...results.invoices.map((i) => ({ id: `inv-${i.id}`, title: i.label, subtitle: i.sub, section: t('palette.invoices'), run: () => openTab({ id: `invoice-${i.id}`, kind: 'invoice', title: i.label, params: { id: i.id } }) })),
      ...results.products.map((p) => ({ id: `prod-${p.id}`, title: p.label, subtitle: p.sub, section: t('palette.products'), run: () => openTab({ kind: 'products', title: 't:nav.products', params: { query: p.label } }) }))
    ]
    const all = [...cmdItems, ...fileItems]
    if (!query.trim()) return all
    const matched = all
      .map((item) => ({ item, s: Math.max(score(query, item.title), score(query, item.subtitle ?? '') * 0.8) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.item)
    return [...searchItems, ...matched]
  }, [commands, recent, results, query, t, openTab])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const run = async (item: Item) => {
    onClose()
    await item.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && items[index]) {
      e.preventDefault()
      void run(items[index])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const icon = (id: string) => {
    if (id.startsWith('recent-')) return <FileText className="h-4 w-4 shrink-0 opacity-70" />
    if (id.startsWith('cust-')) return <Users className="h-4 w-4 shrink-0 text-accent" />
    if (id.startsWith('inv-')) return <Receipt className="h-4 w-4 shrink-0 text-accent" />
    if (id.startsWith('prod-')) return <Package className="h-4 w-4 shrink-0 text-accent" />
    return <CommandIcon className="h-4 w-4 shrink-0 opacity-70" />
  }

  let lastSection = ''
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div className="card w-full max-w-xl overflow-hidden shadow-pop animate-scale-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
          />
          {searching && <span className="text-[11px] text-muted">{t('palette.searching')}</span>}
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{searching ? t('palette.searching') : t('palette.noResults')}</li>}
          {items.map((item, i) => {
            const header = item.section !== lastSection ? item.section : null
            lastSection = item.section
            return (
              <li key={item.id}>
                {header && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted/80">{header}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => void run(item)}
                  className={clsx('flex w-full items-center gap-3 rounded-md px-3 py-2 text-start', i === index ? 'bg-accent/10 text-accent' : 'hover:bg-surface-2')}
                >
                  {icon(item.id)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{item.title}</span>
                    {item.subtitle && <span className={clsx('block truncate text-[11px] text-muted', item.id.startsWith('recent-') && 'ltr-text')}>{item.subtitle}</span>}
                  </span>
                  {item.shortcut && <Kbd>{displayShortcut(item.shortcut)}</Kbd>}
                </button>
              </li>
            )
          })}
        </ul>
        <footer className="border-t border-border px-4 py-2 text-[11px] text-muted">{t('palette.hint')}</footer>
      </div>
    </div>
  )
}
