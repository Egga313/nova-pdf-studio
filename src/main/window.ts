/** إنشاء النافذة الرئيسية بإعدادات أمان صارمة (عزل السياق، بلا Node في الواجهة). */
import path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { logger } from './logger'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'NOVA PDF Studio',
    backgroundColor: '#0f1217',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload يحتاج Buffer/Uint8Array لنقل الملفات؛ الواجهة نفسها معزولة تمامًا
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // أخطاء وتحذيرات الواجهة تُسجَّل في سجل المطوّر (مفيد للتشخيص بلا أدوات المطوّر)
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) logger.warn(`renderer console: ${message}`, `${sourceId}:${line}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => logger.error('renderer process gone', details))

  // الروابط الخارجية تُفتح في المتصفح، لا داخل التطبيق
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return window
}
