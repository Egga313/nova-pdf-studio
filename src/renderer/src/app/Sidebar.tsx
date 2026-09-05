/** الشريط الجانبي: التنقل الأساسي أعلى، والتخزين/النسخ/اللغة/المظهر أسفل. يظهر يمينًا في العربية تلقائيًا (بداية الاتجاه). */
import { clsx } from 'clsx'
import {
  BookTemplate, Boxes, Database, FileText, HardDrive, Home, Languages, LayoutGrid, Moon, Receipt, Settings, Sun, SunMoon, Table2, Users, Wrench
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@shared/settings'
import { useSettings } from '@renderer/stores/settings'
import { useTabs, type TabKind } from '@renderer/stores/tabs'

const NAV: { kind: TabKind; key: string; icon: typeof Home }[] = [
  { kind: 'dashboard', key: 'nav.home', icon: Home },
  { kind: 'documents', key: 'nav.pdf', icon: FileText },
  { kind: 'invoices', key: 'nav.invoices', icon: Receipt },
  { kind: 'customers', key: 'nav.customers', icon: Users },
  { kind: 'products', key: 'nav.products', icon: Boxes },
  { kind: 'spreadsheets', key: 'nav.spreadsheets', icon: Table2 },
  { kind: 'templates', key: 'nav.templates', icon: BookTemplate },
  { kind: 'tools', key: 'nav.tools', icon: Wrench }
]

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const open = useTabs((s) => s.open)
  const active = useTabs((s) => s.tabs.find((tab) => tab.id === s.activeId)?.kind)
  const { settings, setLanguage, setTheme } = useSettings()

  const openKind = (kind: TabKind, key: string) => open({ kind, title: `t:${key}`, params: {} })
  const nextLanguage = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === settings.language) + 1) % LANGUAGES.length]
  const cycleTheme = () => setTheme(settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light')
  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'dark' ? Moon : SunMoon

  const item = (kind: TabKind | null, key: string, Icon: typeof Home, onClick?: () => void) => (
    <button
      key={String(kind) + key}
      type="button"
      className={clsx('nav-item', collapsed && 'justify-center px-0')}
      data-active={kind !== null && active === kind}
      title={collapsed ? t(key) : undefined}
      onClick={onClick ?? (() => kind !== null && openKind(kind, key))}
    >
      <Icon className="h-[17px] w-[17px] shrink-0" />
      {!collapsed && <span className="truncate">{t(key)}</span>}
    </button>
  )

  return (
    <aside className={clsx('flex h-full flex-col border-e border-border bg-surface/60 transition-all', collapsed ? 'w-14' : 'w-56')}>
      <div className={clsx('flex h-12 items-center gap-2.5 px-3', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent/70 text-accent-fg shadow-soft">
          <LayoutGrid className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold tracking-tight">NOVA</div>
            <div className="truncate text-[10.5px] text-muted">PDF Studio</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">{NAV.map((n) => item(n.kind, n.key, n.icon))}</nav>

      <div className="space-y-0.5 border-t border-border px-2 py-2">
        {item('settings', 'nav.settings', Settings)}
        {item(null, 'nav.storage', HardDrive, () => open({ kind: 'settings', title: 't:nav.settings', params: { section: 'storage' } }))}
        {item(null, 'nav.backup', Database, () => open({ kind: 'settings', title: 't:nav.settings', params: { section: 'backup' } }))}
        <button type="button" className={clsx('nav-item', collapsed && 'justify-center px-0')} onClick={() => void setLanguage(nextLanguage.code)} title={nextLanguage.label}>
          <Languages className="h-[17px] w-[17px] shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.language')} · <span className="text-fg">{LANGUAGES.find((l) => l.code === settings.language)?.label}</span></span>}
        </button>
        <button type="button" className={clsx('nav-item', collapsed && 'justify-center px-0')} onClick={() => void cycleTheme()} title={t(`theme.${settings.theme}`)}>
          <ThemeIcon className="h-[17px] w-[17px] shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.theme')} · <span className="text-fg">{t(`theme.${settings.theme}`)}</span></span>}
        </button>
        {!collapsed && <div className="px-2.5 pt-1 text-[10.5px] text-muted/60 ltr-text">NOVA PDF Studio · v0.1.0</div>}
      </div>
    </aside>
  )
}
