/** شريط التبويبات كالمتصفح: إغلاق، إغلاق الآخرين، إعادة الفتح، مؤشر غير محفوظ، وقائمة سياقية. */
import { clsx } from 'clsx'
import { FileText, Home, Receipt, Settings, Table2, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTabs, type Tab } from '@renderer/stores/tabs'

const ICONS: Partial<Record<Tab['kind'], typeof Home>> = {
  dashboard: Home, settings: Settings, pdf: FileText, 'pdf-new': FileText, invoices: Receipt, invoice: Receipt,
  customers: Users, customer: Users, spreadsheets: Table2, spreadsheet: Table2
}

export function TabBar() {
  const { t } = useTranslation()
  const { tabs, activeId, activate, close, closeOthers, reopenClosed, closedStack } = useTabs()
  const [menu, setMenu] = useState<{ x: number; y: number; tab: Tab } | null>(null)

  useEffect(() => {
    if (!menu) return
    const hide = () => setMenu(null)
    window.addEventListener('click', hide)
    window.addEventListener('keydown', hide)
    return () => {
      window.removeEventListener('click', hide)
      window.removeEventListener('keydown', hide)
    }
  }, [menu])

  const title = (tab: Tab) => (tab.title.startsWith('t:') ? t(tab.title.slice(2)) : tab.title)

  return (
    <div className="flex h-10 items-end gap-0.5 overflow-x-auto border-b border-border bg-surface/60 px-2">
      {tabs.map((tab) => {
        const Icon = ICONS[tab.kind] ?? FileText
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => activate(tab.id)}
            onKeyDown={(e) => e.key === 'Enter' && activate(tab.id)}
            onAuxClick={(e) => e.button === 1 && close(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, tab })
            }}
            className={clsx(
              'group relative flex h-9 max-w-[220px] min-w-[120px] cursor-default select-none items-center gap-2 rounded-t-md border border-b-0 px-3 text-[12.5px] transition-colors',
              active ? 'border-border bg-bg text-fg' : 'border-transparent text-muted hover:bg-surface-2/70 hover:text-fg'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="flex-1 truncate">{title(tab)}</span>
            {tab.dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" title={t('tabs.unsaved')} />}
            {tab.closable && (
              <button
                type="button"
                aria-label={t('tabs.close')}
                onClick={(e) => {
                  e.stopPropagation()
                  close(tab.id)
                }}
                className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-border', !active && 'opacity-0 group-hover:opacity-100')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {active && <span className="absolute -bottom-px start-0 end-0 h-px bg-bg" />}
          </div>
        )
      })}

      {menu && (
        <ul
          className="card fixed z-50 min-w-[200px] py-1 text-[13px] shadow-pop animate-scale-in"
          style={{ top: menu.y, left: Math.min(menu.x, window.innerWidth - 220) }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem disabled={!menu.tab.closable} onClick={() => { close(menu.tab.id); setMenu(null) }}>{t('tabs.close')}</MenuItem>
          <MenuItem onClick={() => { closeOthers(menu.tab.id); setMenu(null) }}>{t('tabs.closeOthers')}</MenuItem>
          <MenuItem disabled={closedStack.length === 0} onClick={() => { reopenClosed(); setMenu(null) }}>{t('tabs.reopenClosed')}</MenuItem>
        </ul>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onClick} className="w-full px-3 py-1.5 text-start hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent">
        {children}
      </button>
    </li>
  )
}
