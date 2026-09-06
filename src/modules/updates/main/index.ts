/**
 * التحديث التلقائي عبر GitHub Releases (electron-updater). يعمل فقط في النسخة المغلّفة،
 * يفحص بعد الإقلاع بثوانٍ ثم كل 6 ساعات، ويعرض إشعارًا نظاميًا عند اكتمال التنزيل. أي خطأ يُسجَّل ولا يُعطّل التطبيق.
 */
import { app } from 'electron'
import { logger } from '@main/logger'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function installAutoUpdater(): void {
  if (!app.isPackaged) return
  let updater: typeof import('electron-updater').autoUpdater
  try {
    updater = require('electron-updater').autoUpdater
  } catch (e) {
    logger.warn('auto-updater unavailable', e instanceof Error ? e.message : String(e))
    return
  }
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.logger = {
    info: (m: unknown) => logger.info(`updater: ${String(m)}`),
    warn: (m: unknown) => logger.warn(`updater: ${String(m)}`),
    error: (m: unknown) => logger.error(`updater: ${String(m)}`),
    debug: () => undefined
  }
  updater.on('update-available', (info) => logger.info('update available', { version: info.version }))
  updater.on('update-downloaded', (info) => logger.info('update downloaded, will install on quit', { version: info.version }))
  updater.on('error', (err) => logger.warn('update check failed', err instanceof Error ? err.message : String(err)))

  const check = () => updater.checkForUpdatesAndNotify().catch(() => undefined)
  setTimeout(() => void check(), 15_000)
  setInterval(() => void check(), CHECK_INTERVAL_MS)
}
