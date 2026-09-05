/** الملفات الأخيرة المفتوحة (PDF، جداول، صور) مع تثبيت وإحصاء مرات الفتح. */
import fs from 'node:fs'
import path from 'node:path'
import { bool, getDatabase } from '@modules/database/main'
import type { RecentFile, RecentFileKind } from '@shared/entities'

interface Row { id: number; path: string; name: string; kind: RecentFileKind; size_bytes: number | null; last_opened_at: string; open_count: number; pinned: number }

const map = (r: Row): RecentFile => ({
  id: r.id, path: r.path, name: r.name, kind: r.kind, sizeBytes: r.size_bytes,
  lastOpenedAt: r.last_opened_at, openCount: r.open_count, pinned: bool(r.pinned)
})

export function kindFromPath(filePath: string): RecentFileKind {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.xlsx', '.xls', '.csv', '.ods'].includes(ext)) return 'spreadsheet'
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif'].includes(ext)) return 'image'
  return 'other'
}

export function listRecent(limit = 20, kind?: RecentFileKind): RecentFile[] {
  const rows = kind
    ? getDatabase().all<Row>('SELECT * FROM recent_files WHERE kind = ? ORDER BY pinned DESC, last_opened_at DESC LIMIT ?', [kind, limit])
    : getDatabase().all<Row>('SELECT * FROM recent_files ORDER BY pinned DESC, last_opened_at DESC LIMIT ?', [limit])
  return rows.map(map)
}

export function addRecent(filePath: string, kind: RecentFileKind): RecentFile {
  const db = getDatabase()
  let size: number | null = null
  try {
    size = fs.statSync(filePath).size
  } catch {
    size = null
  }
  db.run(
    `INSERT INTO recent_files (path, name, kind, size_bytes, last_opened_at, open_count)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)
     ON CONFLICT(path) DO UPDATE SET name=excluded.name, kind=excluded.kind, size_bytes=excluded.size_bytes,
       last_opened_at=excluded.last_opened_at, open_count=recent_files.open_count + 1`,
    [filePath, path.basename(filePath), kind, size]
  )
  // نحتفظ بآخر 100 ملف غير مثبّت فقط
  db.run(`DELETE FROM recent_files WHERE pinned = 0 AND id NOT IN (
            SELECT id FROM recent_files WHERE pinned = 0 ORDER BY last_opened_at DESC LIMIT 100)`)
  return map(db.get<Row>('SELECT * FROM recent_files WHERE path = ?', [filePath])!)
}

export function removeRecent(id: number): void {
  getDatabase().run('DELETE FROM recent_files WHERE id = ?', [id])
}

export function pinRecent(id: number, pinned: boolean): void {
  getDatabase().run('UPDATE recent_files SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id])
}

export function clearRecent(): void {
  getDatabase().run('DELETE FROM recent_files WHERE pinned = 0')
}
