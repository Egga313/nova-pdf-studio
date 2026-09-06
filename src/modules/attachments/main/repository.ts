/** مرفقات: تُنسخ الملفات إلى مجلد البيانات (attachments/<owner>/<id>/) حتى لا تضيع إن حُذف الأصل. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { Attachment, OwnerType } from '@shared/extras'
import { getPaths } from '@main/paths'

interface Row { id: number; owner_type: OwnerType; owner_id: number; name: string; path: string; mime: string; size_bytes: number | null; created_at: string }
const map = (r: Row): Attachment => ({ id: r.id, ownerType: r.owner_type, ownerId: r.owner_id, name: r.name, path: r.path, mime: r.mime, sizeBytes: r.size_bytes, createdAt: r.created_at })

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain', '.zip': 'application/zip'
}

export function listAttachments(ownerType: OwnerType, ownerId: number): Attachment[] {
  return getDatabase().all<Row>('SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC', [ownerType, ownerId]).map(map)
}

async function uniqueTarget(dir: string, name: string): Promise<string> {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = path.join(dir, name)
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`)
  return candidate
}

export async function addAttachments(ownerType: OwnerType, ownerId: number, sourcePaths: string[] | null): Promise<Attachment[]> {
  let paths = sourcePaths
  if (!paths) {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    paths = result.filePaths
  }
  const dir = path.join(getPaths().attachmentsDir, ownerType, String(ownerId))
  await fsp.mkdir(dir, { recursive: true })
  const db = getDatabase()
  const out: Attachment[] = []
  for (const source of paths) {
    if (!fs.existsSync(source)) throw new AppError('FILE_NOT_FOUND', undefined, { path: source })
    const name = path.basename(source)
    const target = await uniqueTarget(dir, name)
    await fsp.copyFile(source, target)
    const stat = await fsp.stat(target)
    const { lastInsertRowid } = db.run('INSERT INTO attachments (owner_type, owner_id, name, path, mime, size_bytes) VALUES (?, ?, ?, ?, ?, ?)', [
      ownerType, ownerId, path.basename(target), target, MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream', stat.size
    ])
    audit('attachment.added', ownerType, ownerId, name)
    out.push(map(db.get<Row>('SELECT * FROM attachments WHERE id = ?', [lastInsertRowid])!))
  }
  return out
}

export async function removeAttachment(id: number): Promise<void> {
  const db = getDatabase()
  const row = db.get<Row>('SELECT * FROM attachments WHERE id = ?', [id])
  if (!row) return
  db.run('DELETE FROM attachments WHERE id = ?', [id])
  await fsp.unlink(row.path).catch(() => undefined)
  audit('attachment.removed', row.owner_type, row.owner_id, row.name)
}

export async function openAttachment(id: number): Promise<void> {
  const row = getDatabase().get<Row>('SELECT * FROM attachments WHERE id = ?', [id])
  if (!row) throw new AppError('NOT_FOUND')
  if (!fs.existsSync(row.path)) throw new AppError('FILE_NOT_FOUND', undefined, { path: row.path })
  const err = await shell.openPath(row.path)
  if (err) throw new AppError('FILE_ACCESS', undefined, undefined, err)
}
