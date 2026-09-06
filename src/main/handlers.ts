/** تسجيل معالجات IPC للمرحلة الأولى: التطبيق، الملفات، الإعدادات، الضرائب/العملات، الأخيرة، اللوحة، التدقيق، الأمان، النسخ. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { listAudit } from '@modules/database/main/audit'
import { clearDemoData, demoStatus, loadDemoData } from '@modules/database/main/demo-data'
import { getDatabase } from '@modules/database/main'
import { createBackup, listBackups, restoreBackup } from '@modules/backup/main'
import { listDocuments, markOcrDone, registerDocument, removeDocument, savePageText } from '@modules/pdf/main/documents'
import { deleteCustomer, getCustomer, listCustomers, nextCustomerNumber, purgeCustomer, restoreCustomer, saveCustomer, searchCustomers } from '@modules/customers/main/repository'
import { deleteProduct, getProduct, listCategories, listProducts, restoreProduct, saveProduct, searchProducts } from '@modules/products/main/repository'
import {
  addPayment, deletePayment, duplicateInvoice, getInvoice, globalSearch, listInvoices, listOutstanding, previewNextNumber, purgeInvoice, refreshOverdue,
  restoreInvoice, saveInvoice, setInvoicePdfPath, setInvoiceStatus, trashInvoice
} from '@modules/invoices/main/repository'
import { exportHtmlToPdf, listPrinters, printHtml } from '@modules/printing/main'
import {
  deleteTemplate, duplicateTemplate, getDefaultTemplate, getTemplate, listTemplates, readBrandAssets, resetBuiltinTemplates, saveTemplate, setBrandAsset,
  setDefaultTemplate
} from '@modules/templates/main/repository'
import {
  deleteSpreadsheet, exportSpreadsheetFile, getSpreadsheet, importSpreadsheetFile, listSpreadsheets, purgeSpreadsheet, restoreSpreadsheet, saveSpreadsheet
} from '@modules/spreadsheet/main/repository'
import { getDashboardStats } from '@modules/settings/main/dashboard'
import { addRecent, clearRecent, listRecent, pinRecent, removeRecent } from '@modules/settings/main/recent-files'
import { getSettings, updateSettings } from '@modules/settings/main/repository'
import { pinStatus, removePin, setPin, verifyPin } from '@modules/settings/main/security'
import {
  deleteCurrency, deleteTax, listCurrencies, listTaxes, saveCurrency, saveTax
} from '@modules/settings/main/taxes-currencies'
import { AppError } from '@shared/errors'
import type { FileFilter } from '@shared/entities'
import { handle } from './ipc'
import { logger } from './logger'
import { getPaths } from './paths'

const focused = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp'
}

export function registerCoreHandlers(): void {
  const paths = getPaths()

  // ---- التطبيق ----
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: paths.dataDir,
    dbPath: paths.dbPath,
    logPath: logger.path ?? ''
  }))
  handle('app:open-path', async ({ path: p }) => {
    const err = await shell.openPath(p)
    if (err) throw new AppError('FILE_ACCESS', undefined, undefined, err)
  })
  handle('app:show-in-folder', ({ path: p }) => shell.showItemInFolder(p))
  handle('app:log', ({ level, message, details }) => logger[level](`[renderer] ${message}`, details))

  // ---- الحوارات والملفات ----
  handle('dialog:open-files', async ({ filters, multiple, title }) => {
    const result = await dialog.showOpenDialog(focused()!, {
      title,
      filters: toFilters(filters),
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile']
    })
    return result.canceled ? [] : result.filePaths
  })
  handle('dialog:save-file', async ({ defaultPath, filters, title }) => {
    const result = await dialog.showSaveDialog(focused()!, { title, defaultPath, filters: toFilters(filters) })
    return result.canceled || !result.filePath ? null : result.filePath
  })
  handle('dialog:pick-folder', async ({ title }) => {
    const result = await dialog.showOpenDialog(focused()!, { title, properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  handle('file:read', async ({ path: p }) => {
    if (!fs.existsSync(p)) throw new AppError('FILE_NOT_FOUND', undefined, { path: p })
    const data = await fsp.readFile(p)
    return { name: path.basename(p), sizeBytes: data.byteLength, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
  })
  handle('file:write', async ({ path: p, data }) => {
    await fsp.mkdir(path.dirname(p), { recursive: true })
    const temp = `${p}.tmp-${process.pid}`
    await fsp.writeFile(temp, Buffer.from(data))
    await fsp.rename(temp, p)
    return { sizeBytes: data.byteLength }
  })
  handle('file:stat', async ({ path: p }) => {
    try {
      const s = await fsp.stat(p)
      return { exists: true, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() }
    } catch {
      return { exists: false, sizeBytes: 0, modifiedAt: null }
    }
  })

  // ---- الإعدادات ----
  handle('settings:get', () => getSettings())
  handle('settings:update', (patch) => updateSettings(patch))
  handle('settings:pick-logo', async () => {
    const result = await dialog.showOpenDialog(focused()!, {
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    // ننسخ الشعار داخل مجلد البيانات حتى لا يضيع إذا حُذف الأصل
    const source = result.filePaths[0]
    const target = path.join(paths.dataDir, `company-logo${path.extname(source).toLowerCase()}`)
    await fsp.copyFile(source, target)
    updateSettings({ company: { ...getSettings().company, logoPath: target } })
    return target
  })
  handle('settings:read-logo', async () => {
    const logo = getSettings().company.logoPath
    if (!logo || !fs.existsSync(logo)) return null
    const mime = MIME_BY_EXT[path.extname(logo).toLowerCase()] ?? 'application/octet-stream'
    const data = await fsp.readFile(logo)
    return `data:${mime};base64,${data.toString('base64')}`
  })

  // ---- الضرائب والعملات ----
  handle('taxes:list', (req) => listTaxes(req?.includeInactive ?? false))
  handle('taxes:save', (req) => saveTax(req))
  handle('taxes:delete', ({ id }) => deleteTax(id))
  handle('currencies:list', (req) => listCurrencies(req?.includeInactive ?? false))
  handle('currencies:save', (req) => saveCurrency(req))
  handle('currencies:delete', ({ code }) => deleteCurrency(code))

  // ---- الملفات الأخيرة ----
  handle('recent:list', (req) => listRecent(req?.limit ?? 20, req?.kind))
  handle('recent:add', ({ path: p, kind }) => addRecent(p, kind))
  handle('recent:remove', ({ id }) => removeRecent(id))
  handle('recent:pin', ({ id, pinned }) => pinRecent(id, pinned))
  handle('recent:clear', () => clearRecent())

  // ---- لوحة القيادة والتدقيق والتجريبي ----
  handle('dashboard:stats', () => getDashboardStats())
  handle('audit:list', (req) => listAudit(req?.limit ?? 200))
  handle('demo:load', () => loadDemoData())
  handle('demo:clear', () => clearDemoData())
  handle('demo:status', () => demoStatus())

  // ---- الأمان ----
  handle('security:status', () => pinStatus())
  handle('security:set-pin', ({ pin, currentPin }) => setPin(pin, currentPin))
  handle('security:remove-pin', ({ currentPin }) => removePin(currentPin))
  handle('security:verify-pin', ({ pin }) => ({ ok: verifyPin(pin) }))

  // ---- المستندات ----
  handle('documents:list', (req) => listDocuments(req?.limit ?? 200, req?.query))
  handle('documents:register', (req) => registerDocument(req))
  handle('documents:remove', ({ id }) => removeDocument(id))
  handle('documents:save-page-text', ({ documentId, pageIndex, text, confidence }) => savePageText(documentId, pageIndex, text, confidence))
  handle('documents:mark-ocr', ({ documentId }) => markOcrDone(documentId))

  // ---- العملاء ----
  handle('customers:list', (req) => listCustomers(req ?? {}))
  handle('customers:get', ({ id }) => getCustomer(id))
  handle('customers:save', (req) => saveCustomer(req))
  handle('customers:delete', ({ id }) => deleteCustomer(id))
  handle('customers:restore', ({ id }) => restoreCustomer(id))
  handle('customers:purge', ({ id }) => purgeCustomer(id))
  handle('customers:search', ({ query, limit }) => searchCustomers(query, limit))
  handle('customers:next-number', () => nextCustomerNumber())

  // ---- المنتجات ----
  handle('products:list', (req) => listProducts(req ?? {}))
  handle('products:get', ({ id }) => getProduct(id))
  handle('products:save', (req) => saveProduct(req))
  handle('products:delete', ({ id }) => deleteProduct(id))
  handle('products:restore', ({ id }) => restoreProduct(id))
  handle('products:search', ({ query, limit }) => searchProducts(query, limit))
  handle('products:categories', () => listCategories())

  // ---- الفواتير والمدفوعات ----
  handle('invoices:list', (req) => {
    refreshOverdue()
    return listInvoices(req ?? {})
  })
  handle('invoices:get', ({ id }) => getInvoice(id))
  handle('invoices:save', (req) => saveInvoice(req))
  handle('invoices:set-status', ({ id, status }) => setInvoiceStatus(id, status))
  handle('invoices:trash', ({ id }) => trashInvoice(id))
  handle('invoices:restore', ({ id }) => restoreInvoice(id))
  handle('invoices:purge', ({ id }) => purgeInvoice(id))
  handle('invoices:duplicate', ({ id }) => duplicateInvoice(id))
  handle('invoices:next-number', ({ docType, issueDate }) => previewNextNumber(docType, issueDate))
  handle('invoices:outstanding', (req) => {
    refreshOverdue()
    return listOutstanding(req?.limit ?? 100)
  })
  handle('invoices:set-pdf-path', ({ id, pdfPath }) => setInvoicePdfPath(id, pdfPath))
  handle('payments:add', (req) => addPayment(req))
  handle('payments:delete', ({ id }) => deletePayment(id))
  handle('search:global', ({ query, limit }) => globalSearch(query, limit))

  // ---- القوالب وأصول الهوية ----
  handle('templates:list', (req) => listTemplates(req?.kind ?? 'layout'))
  handle('templates:get', ({ id }) => getTemplate(id))
  handle('templates:default', () => getDefaultTemplate())
  handle('templates:save', (req) => saveTemplate(req))
  handle('templates:duplicate', ({ id, name }) => duplicateTemplate(id, name))
  handle('templates:set-default', ({ id }) => setDefaultTemplate(id))
  handle('templates:delete', ({ id }) => deleteTemplate(id))
  handle('templates:reset-builtin', () => resetBuiltinTemplates())
  handle('brand:assets', () => readBrandAssets(getSettings().company.logoPath))
  handle('brand:pick', async ({ kind }) => {
    const result = await dialog.showOpenDialog(focused()!, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    if (kind === 'logo') {
      const target = path.join(paths.dataDir, `company-logo${path.extname(result.filePaths[0]).toLowerCase()}`)
      await fsp.copyFile(result.filePaths[0], target)
      updateSettings({ company: { ...getSettings().company, logoPath: target } })
      return target
    }
    return setBrandAsset(paths.dataDir, kind, result.filePaths[0])
  })
  handle('brand:clear', async ({ kind }) => {
    if (kind === 'logo') updateSettings({ company: { ...getSettings().company, logoPath: null } })
    else await setBrandAsset(paths.dataDir, kind, null)
  })

  // ---- جداول البيانات ----
  handle('spreadsheets:list', (req) => listSpreadsheets(req ?? {}))
  handle('spreadsheets:get', ({ id }) => getSpreadsheet(id))
  handle('spreadsheets:save', (req) => saveSpreadsheet(req))
  handle('spreadsheets:delete', ({ id }) => deleteSpreadsheet(id))
  handle('spreadsheets:restore', ({ id }) => restoreSpreadsheet(id))
  handle('spreadsheets:purge', ({ id }) => purgeSpreadsheet(id))
  handle('spreadsheets:import-file', ({ path: p }) => importSpreadsheetFile(p))
  handle('spreadsheets:export-file', ({ path: p, data, bookType }) => exportSpreadsheetFile(p, data, bookType))

  // ---- الطباعة والتصدير ----
  handle('printers:list', () => listPrinters(focused()))
  handle('print:html', (job) => printHtml(job))
  handle('print:html-to-pdf', (job) => exportHtmlToPdf(job))

  // ---- النسخ الاحتياطي ----
  handle('backup:create', (req) => createBackup(paths.backupDir, req?.folder))
  handle('backup:restore', ({ path: p }) => restoreBackup(p, paths.backupDir))
  handle('backup:list', () => listBackups(paths.backupDir))
  handle('backup:export-db', async () => {
    const result = await dialog.showSaveDialog(focused()!, {
      defaultPath: path.join(app.getPath('documents'), 'nova-database.sqlite'),
      filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
    })
    if (result.canceled || !result.filePath) return null
    const db = getDatabase()
    await db.flush()
    await fsp.writeFile(result.filePath, db.exportBytes())
    return result.filePath
  })
}

function toFilters(filters?: FileFilter[]): Electron.FileFilter[] | undefined {
  return filters?.map((f) => ({ name: f.name, extensions: f.extensions }))
}
