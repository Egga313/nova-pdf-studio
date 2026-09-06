/** مستودع جداول البيانات: تخزين المصنّف JSON في spreadsheet_documents، حذف ناعم، استيراد/تصدير ملفات عبر SheetJS. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { bool, getDatabase, nowIso } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { workbookFromBytes, workbookToBytes } from '@modules/spreadsheet/shared/xlsx'
import type { Workbook } from '@modules/spreadsheet/shared/sheetModel'
import { AppError } from '@shared/errors'
import type { SpreadsheetDetail, SpreadsheetExportType, SpreadsheetListFilters, SpreadsheetRecord, SpreadsheetSaveInput } from '@shared/spreadsheets'

interface Row {
  id: number; title: string; path: string | null; data: string; sheet_count: number; is_demo: number; deleted_at: string | null; created_at: string; updated_at: string
}

const mapRecord = (r: Row): SpreadsheetRecord => ({
  id: r.id, title: r.title, path: r.path, sheetCount: r.sheet_count, isDemo: bool(r.is_demo), createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at
})

const COLS = 'id, title, path, sheet_count, is_demo, deleted_at, created_at, updated_at'

export function listSpreadsheets(filters: SpreadsheetListFilters = {}): SpreadsheetRecord[] {
  const where: string[] = [filters.includeDeleted ? '1=1' : 'deleted_at IS NULL']
  const params: (string | number)[] = []
  if (filters.query?.trim()) {
    where.push('(title LIKE ? OR path LIKE ?)')
    const like = `%${filters.query.trim()}%`
    params.push(like, like)
  }
  params.push(filters.limit ?? 500)
  return getDatabase()
    .all<Row>(`SELECT ${COLS}, '' AS data FROM spreadsheet_documents WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`, params)
    .map(mapRecord)
}

export function getSpreadsheet(id: number): SpreadsheetDetail | null {
  const row = getDatabase().get<Row>('SELECT * FROM spreadsheet_documents WHERE id = ?', [id])
  return row ? { ...mapRecord(row), data: row.data } : null
}

export function saveSpreadsheet(input: SpreadsheetSaveInput): SpreadsheetRecord {
  const title = input.title.trim() || 'Untitled'
  if (input.data.length > 50 * 1024 * 1024) throw new AppError('VALIDATION')
  JSON.parse(input.data) // يتحقق من صلاحية JSON قبل التخزين
  const db = getDatabase()
  const now = nowIso()
  return db.transaction(() => {
    if (input.id) {
      const exists = db.get<{ id: number }>('SELECT id FROM spreadsheet_documents WHERE id = ?', [input.id])
      if (!exists) throw new AppError('NOT_FOUND')
      db.run('UPDATE spreadsheet_documents SET title = ?, path = ?, data = ?, sheet_count = ?, updated_at = ? WHERE id = ?', [
        title, input.path ?? null, input.data, input.sheetCount, now, input.id
      ])
      audit('spreadsheet.updated', 'spreadsheet', input.id, title)
      return mapRecord(db.get<Row>(`SELECT ${COLS}, '' AS data FROM spreadsheet_documents WHERE id = ?`, [input.id])!)
    }
    const res = db.run('INSERT INTO spreadsheet_documents (title, path, data, sheet_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      title, input.path ?? null, input.data, input.sheetCount, now, now
    ])
    audit('spreadsheet.created', 'spreadsheet', res.lastInsertRowid, title)
    return mapRecord(db.get<Row>(`SELECT ${COLS}, '' AS data FROM spreadsheet_documents WHERE id = ?`, [res.lastInsertRowid])!)
  })
}

export function deleteSpreadsheet(id: number): void {
  getDatabase().run('UPDATE spreadsheet_documents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [nowIso(), nowIso(), id])
  audit('spreadsheet.deleted', 'spreadsheet', id)
}

export function restoreSpreadsheet(id: number): void {
  getDatabase().run('UPDATE spreadsheet_documents SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id])
  audit('spreadsheet.restored', 'spreadsheet', id)
}

export function purgeSpreadsheet(id: number): void {
  getDatabase().run('DELETE FROM spreadsheet_documents WHERE id = ?', [id])
  audit('spreadsheet.purged', 'spreadsheet', id)
}

/** يقرأ xlsx/xls/csv من القرص ويعيد المصنّف كـ JSON جاهزًا للواجهة. */
export async function importSpreadsheetFile(filePath: string): Promise<{ title: string; data: string; sheetCount: number }> {
  if (!fs.existsSync(filePath)) throw new AppError('FILE_NOT_FOUND', undefined, { path: filePath })
  const bytes = await fsp.readFile(filePath)
  let wb: Workbook
  try {
    wb = workbookFromBytes(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), path.basename(filePath))
  } catch (e) {
    throw new AppError('EXCEL_UNSUPPORTED', 'sheet.importFailed', { path: filePath }, e instanceof Error ? e.message : String(e))
  }
  audit('spreadsheet.imported', 'spreadsheet', undefined, path.basename(filePath))
  return { title: path.basename(filePath, path.extname(filePath)), data: JSON.stringify(wb), sheetCount: wb.sheets.length }
}

export async function exportSpreadsheetFile(filePath: string, data: string, bookType: SpreadsheetExportType): Promise<{ sizeBytes: number }> {
  const wb = JSON.parse(data) as Workbook
  const bytes = workbookToBytes(wb, bookType)
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}`
  await fsp.writeFile(temp, bytes)
  await fsp.rename(temp, filePath)
  audit('spreadsheet.exported', 'spreadsheet', undefined, path.basename(filePath))
  return { sizeBytes: bytes.byteLength }
}
