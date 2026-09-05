/** الشريط العلوي: زر طي الشريط الجانبي، البحث الشامل (يفتح لوحة الأوامر)، الإشعارات. */
import { Bell, PanelLeft, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Kbd } from '@renderer/components/ui'
import { useNotifications } from '@renderer/stores/notifications'

export function TopBar({ onToggleSidebar, onOpenPalette, onOpenNotifications }: { onToggleSidebar: () => void; onOpenPalette: () => void; onOpenNotifications: () => void }) {
  const { t } = useTranslation()
  const unread = useNotifications((s) => s.unread)
  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-surface/60 px-3">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="toggle sidebar">
        <PanelLeft className="h-4 w-4 rtl:-scale-x-100" />
      </Button>
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-9 w-full max-w-xl items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-start">{t('topbar.search')}</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onOpenNotifications} aria-label={t('topbar.notifications')} className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </div>
    </header>
  )
}
