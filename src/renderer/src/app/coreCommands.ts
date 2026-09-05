/** الأوامر الأساسية للتطبيق (تنقل، تبويبات، مظهر، لغة، نسخ احتياطي). الوحدات تضيف أوامرها من ملفاتها. */
import { LANGUAGES } from '@shared/settings'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs, type TabKind } from '@renderer/stores/tabs'
import { useCommands, type Command } from './commands'
import { pickAndOpenPdf, pickAndOpenSpreadsheet } from './openFile'

const nav = (id: string, kind: TabKind, titleKey: string, section?: string, shortcut?: string): Command => ({
  id,
  titleKey,
  section: 'navigation',
  shortcut,
  run: () => {
    useTabs.getState().open({ kind, title: `t:${titleKey.replace('commands.open', 'nav.').toLowerCase()}`, params: section ? { section } : {} })
  }
})

export function registerCoreCommands(hooks: { openPalette: () => void; lock: () => void; showShortcuts: () => void }): () => void {
  const tabs = useTabs.getState
  const commands: Command[] = [
    { id: 'palette.open', titleKey: 'topbar.commandPalette', section: 'system', shortcut: 'Ctrl+K', run: hooks.openPalette },
    { id: 'nav.home', titleKey: 'commands.goHome', section: 'navigation', shortcut: 'Ctrl+Shift+H', run: () => tabs().activate('dashboard') },
    { id: 'nav.settings', titleKey: 'commands.openSettings', section: 'navigation', shortcut: 'Ctrl+,', run: () => tabs().open({ kind: 'settings', title: 't:nav.settings', params: {} }) },
    { id: 'nav.invoices', titleKey: 'commands.openInvoices', section: 'navigation', run: () => tabs().open({ kind: 'invoices', title: 't:nav.invoices', params: {} }) },
    { id: 'nav.customers', titleKey: 'commands.openCustomers', section: 'navigation', run: () => tabs().open({ kind: 'customers', title: 't:nav.customers', params: {} }) },
    { id: 'nav.products', titleKey: 'commands.openProducts', section: 'navigation', run: () => tabs().open({ kind: 'products', title: 't:nav.products', params: {} }) },
    { id: 'nav.spreadsheets', titleKey: 'nav.spreadsheets', section: 'navigation', run: () => tabs().open({ kind: 'spreadsheets', title: 't:nav.spreadsheets', params: {} }) },
    { id: 'nav.templates', titleKey: 'nav.templates', section: 'navigation', run: () => tabs().open({ kind: 'templates', title: 't:nav.templates', params: {} }) },
    { id: 'nav.tools', titleKey: 'nav.tools', section: 'navigation', run: () => tabs().open({ kind: 'tools', title: 't:nav.tools', params: {} }) },

    { id: 'pdf.open', titleKey: 'commands.openPdf', section: 'actions', shortcut: 'Ctrl+O', run: () => pickAndOpenPdf() },
    { id: 'pdf.new', titleKey: 'dashboard.actions.newPdf', section: 'actions', run: () => tabs().open({ kind: 'pdf-new', title: 't:dashboard.actions.newPdf', params: {} }) },
    { id: 'invoice.new', titleKey: 'commands.newInvoice', section: 'actions', shortcut: 'Ctrl+N', run: () => tabs().open({ kind: 'invoice', title: 't:commands.newInvoice', params: { id: null } }) },
    { id: 'spreadsheet.new', titleKey: 'commands.newSpreadsheet', section: 'actions', run: () => tabs().open({ kind: 'spreadsheet', title: 't:commands.newSpreadsheet', params: { path: null } }) },
    { id: 'spreadsheet.open', titleKey: 'dashboard.actions.spreadsheets', section: 'actions', run: () => pickAndOpenSpreadsheet() },
    { id: 'tools.merge', titleKey: 'commands.mergePdf', section: 'actions', run: () => tabs().open({ kind: 'tools', title: 't:nav.tools', params: { tool: 'merge' } }) },
    { id: 'tools.split', titleKey: 'dashboard.actions.splitPdf', section: 'actions', run: () => tabs().open({ kind: 'tools', title: 't:nav.tools', params: { tool: 'split' } }) },
    { id: 'tools.convert', titleKey: 'dashboard.actions.convert', section: 'actions', run: () => tabs().open({ kind: 'tools', title: 't:nav.tools', params: { tool: 'convert' } }) },
    { id: 'tools.scan', titleKey: 'dashboard.actions.scanOcr', section: 'actions', run: () => tabs().open({ kind: 'tools', title: 't:nav.tools', params: { tool: 'ocr' } }) },

    { id: 'tab.close', titleKey: 'commands.closeTab', section: 'view', shortcut: 'Ctrl+W', run: () => tabs().close(tabs().activeId) },
    { id: 'tab.reopen', titleKey: 'commands.reopenTab', section: 'view', shortcut: 'Ctrl+Shift+T', run: () => tabs().reopenClosed() },
    { id: 'tab.next', titleKey: 'commands.nextTab', section: 'view', shortcut: 'Ctrl+Tab', run: () => tabs().next() },
    { id: 'tab.prev', titleKey: 'commands.prevTab', section: 'view', shortcut: 'Ctrl+Shift+Tab', run: () => tabs().prev() },
    {
      id: 'view.theme',
      titleKey: 'commands.toggleTheme',
      section: 'view',
      shortcut: 'Ctrl+Shift+D',
      run: () => {
        const s = useSettings.getState()
        return s.setTheme(s.resolvedTheme === 'dark' ? 'light' : 'dark')
      }
    },
    ...LANGUAGES.map<Command>((lang) => ({
      id: `view.language.${lang.code}`,
      titleKey: 'commands.language',
      titleParams: { lang: lang.label },
      section: 'view',
      keywords: [lang.label, lang.code],
      run: () => useSettings.getState().setLanguage(lang.code)
    })),
    { id: 'help.shortcuts', titleKey: 'commands.showShortcuts', section: 'system', shortcut: 'F1', run: hooks.showShortcuts },
    { id: 'system.lock', titleKey: 'commands.lockApp', section: 'system', shortcut: 'Ctrl+L', enabled: () => useSettings.getState().settings.security.appLockEnabled, run: hooks.lock },
    {
      id: 'system.backup',
      titleKey: 'commands.createBackup',
      section: 'system',
      run: async () => {
        try {
          await invoke('backup:create')
          notify.success('toast.backupCreated')
        } catch (e) {
          notify.error(e)
        }
      }
    }
  ]
  void nav
  return useCommands.getState().register(...commands)
}
