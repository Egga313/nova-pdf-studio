/** نقطة دخول العملية الرئيسية: السجل، قاعدة البيانات، المعالجات، النافذة، النسخ التلقائي، الإغلاق الآمن. */
import { app, BrowserWindow, dialog } from 'electron'
import { autoBackupIfDue } from '@modules/backup/main'
import { closeDatabase, openDatabase } from '@modules/database/main'
import { seedBuiltinTemplates } from '@modules/templates/main/repository'
import { registerCoreHandlers } from './handlers'
import { logger } from './logger'
import { getPaths } from './paths'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null

// نسخة واحدة من التطبيق؛ الملفات المفتوحة من مستكشف الملفات تُرسل إلى النافذة الموجودة
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = argv.find((a) => /\.(pdf|xlsx|xls|csv|png|jpe?g)$/i.test(a))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (file) mainWindow.webContents.send('app:open-file-request', { path: file })
    }
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) mainWindow.webContents.send('app:open-file-request', { path: filePath })
    else pendingOpenPath = filePath
  })

  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()
  const paths = getPaths()
  logger.init(paths.logDir, app.isPackaged ? 'info' : 'debug')
  logger.info('app starting', { version: app.getVersion(), dataDir: paths.dataDir })

  try {
    await openDatabase(paths.dbPath, paths.sqlWasmPath)
  } catch (error) {
    logger.error('database failed to open', error)
    dialog.showErrorBox('NOVA PDF Studio', 'Database could not be opened. See logs folder for details.')
    app.exit(1)
    return
  }

  try {
    seedBuiltinTemplates()
  } catch (error) {
    logger.warn('seeding built-in templates failed', error)
  }
  registerCoreHandlers()
  mainWindow = createMainWindow()
  mainWindow.on('closed', () => (mainWindow = null))

  mainWindow.webContents.once('did-finish-load', () => {
    const file = pendingOpenPath ?? process.argv.slice(app.isPackaged ? 1 : 2).find((a) => /\.(pdf|xlsx|xls|csv|png|jpe?g)$/i.test(a))
    if (file && mainWindow) mainWindow.webContents.send('app:open-file-request', { path: file })
    pendingOpenPath = null
    if (mainWindow) installDevAutomation(mainWindow)
  })

  void autoBackupIfDue(paths.backupDir)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  closeDatabase()
    .catch((error) => logger.error('database close failed', error))
    .finally(() => {
      logger.info('app quit')
      app.quit()
    })
})

/**
 * أتمتة للفحص أثناء التطوير فقط (غير مفعّلة في النسخة المغلّفة):
 * NOVA_AUTOMATION=<ملف JSON> يحتوي خطوات: {"steps":[{"eval":"..."},{"wait":800},{"shot":"c:/x.png"}],"exit":true}
 */
function installDevAutomation(window: BrowserWindow): void {
  const scriptPath = process.env.NOVA_AUTOMATION
  if (app.isPackaged || !scriptPath) return
  void (async () => {
    const fs = await import('node:fs/promises')
    try {
      const plan = JSON.parse(await fs.readFile(scriptPath, 'utf8')) as { steps: Array<{ eval?: string; wait?: number; shot?: string }>; exit?: boolean }
      for (const step of plan.steps) {
        if (step.wait) await new Promise((r) => setTimeout(r, step.wait))
        if (step.eval) {
          const result = await window.webContents.executeJavaScript(step.eval, true)
          logger.info('automation eval', { code: step.eval.slice(0, 80), result })
        }
        if (step.shot) {
          const image = await window.webContents.capturePage()
          await fs.writeFile(step.shot, image.toPNG())
          logger.info('automation screenshot', step.shot)
        }
      }
      if (plan.exit) app.quit()
    } catch (error) {
      logger.error('automation failed', error)
      app.exit(2)
    }
  })()
}

process.on('uncaughtException', (error) => logger.error('uncaught exception', error))
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', reason))
