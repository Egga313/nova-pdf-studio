/** جذر الواجهة: تحميل الإعدادات، معالج أول تشغيل، القفل، الهيكل (شريط جانبي + تبويبات + محتوى)، اللوحات العامة. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { installShortcutListener, useCommands } from './app/commands'
import { CommandPalette } from './app/CommandPalette'
import { registerCoreCommands } from './app/coreCommands'
import { LockScreen } from './app/LockScreen'
import { NotificationCenter } from './app/NotificationCenter'
import { openFileByPath } from './app/openFile'
import { SetupWizard } from './app/SetupWizard'
import { ShortcutsDialog } from './app/ShortcutsDialog'
import { Sidebar } from './app/Sidebar'
import { TabBar } from './app/TabBar'
import { resolveTabComponent } from './app/tabRegistry'
import { Toasts } from './app/Toasts'
import { TopBar } from './app/TopBar'
import { Spinner } from './components/ui'
import { invoke, onMainEvent } from './lib/ipc'
import { notify } from './stores/notifications'
import { useSettings } from './stores/settings'
import { useTabs } from './stores/tabs'

export function App() {
  const { t } = useTranslation()
  const { loaded, settings, load } = useSettings()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [locked, setLocked] = useState(false)
  const [lockChecked, setLockChecked] = useState(false)
  const [dragging, setDragging] = useState(false)
  const idleTimer = useRef<number | null>(null)

  // التحميل الأولي
  useEffect(() => {
    load()
      .then(async () => {
        const status = await invoke('security:status')
        setLocked(status.enabled)
        setLockChecked(true)
      })
      .catch((e) => notify.error(e))
  }, [load])

  // الأوامر والاختصارات
  useEffect(() => {
    const unregister = registerCoreCommands({
      openPalette: () => setPaletteOpen(true),
      lock: () => setLocked(true),
      showShortcuts: () => setShortcutsOpen(true)
    })
    const uninstall = installShortcutListener()
    return () => {
      unregister()
      uninstall()
    }
  }, [])

  // ملفات مفتوحة من النظام (سطر الأوامر / نسخة ثانية / macOS open-file)
  useEffect(() => onMainEvent('app:open-file-request', ({ path }) => void openFileByPath(path)), [])

  // القفل التلقائي بعد فترة خمول
  const resetIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    const { appLockEnabled, autoLockMinutes } = useSettings.getState().settings.security
    if (!appLockEnabled || autoLockMinutes <= 0) return
    idleTimer.current = window.setTimeout(() => setLocked(true), autoLockMinutes * 60_000)
  }, [])
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'wheel']
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => events.forEach((e) => window.removeEventListener(e, resetIdle))
  }, [resetIdle, settings.security.appLockEnabled, settings.security.autoLockMinutes])

  // السحب والإفلات على النافذة كلها
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = () => setDragging(false)
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = e.dataTransfer?.files
      if (!files?.length) return
      for (const file of Array.from(files)) {
        const path = (file as File & { path?: string }).path
        if (path) void openFileByPath(path)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const run = useCommands((s) => s.run)

  if (!loaded || !lockChecked) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }
  if (!settings.setupCompleted) return <SetupWizard />
  if (locked) return <LockScreen onUnlocked={() => setLocked(false)} />

  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar collapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onToggleSidebar={() => setSidebarCollapsed((v) => !v)} onOpenPalette={() => void run('palette.open')} onOpenNotifications={() => setNotifOpen((v) => !v)} />
        <TabBar />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => {
            const Component = resolveTabComponent(tab.kind)
            // كل التبويبات مركّبة لكن المخفية لا تُعرض: تحافظ على حالتها (مثل موضع صفحة PDF)
            return (
              <div key={tab.id} className="absolute inset-0" hidden={tab.id !== activeId}>
                <Component tab={tab} />
              </div>
            )
          })}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
              <div className="rounded-xl border-2 border-dashed border-accent bg-surface px-8 py-6 text-sm font-medium text-accent shadow-pop">{t('dashboard.actions.openPdf')} · {t('dashboard.actions.spreadsheets')}</div>
            </div>
          )}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Toasts />
    </div>
  )
}
