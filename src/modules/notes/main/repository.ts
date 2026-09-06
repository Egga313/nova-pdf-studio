/** ملاحظات داخلية مرتبطة بعميل/فاتورة/منتج (لا تُطبع على الفاتورة). */
import { getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { Note, OwnerType } from '@shared/extras'

interface Row { id: number; owner_type: OwnerType; owner_id: number; body: string; created_at: string; updated_at: string }
const map = (r: Row): Note => ({ id: r.id, ownerType: r.owner_type, ownerId: r.owner_id, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at })

export function listNotes(ownerType: OwnerType, ownerId: number): Note[] {
  return getDatabase().all<Row>('SELECT * FROM notes WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC', [ownerType, ownerId]).map(map)
}

export function addNote(ownerType: OwnerType, ownerId: number, body: string): Note {
  const text = body.trim()
  if (!text) throw new AppError('VALIDATION')
  const db = getDatabase()
  const { lastInsertRowid } = db.run('INSERT INTO notes (owner_type, owner_id, body) VALUES (?, ?, ?)', [ownerType, ownerId, text])
  audit('note.added', ownerType, ownerId, text.slice(0, 80))
  return map(db.get<Row>('SELECT * FROM notes WHERE id = ?', [lastInsertRowid])!)
}

export function updateNote(id: number, body: string): Note {
  const text = body.trim()
  if (!text) throw new AppError('VALIDATION')
  const db = getDatabase()
  db.run(`UPDATE notes SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [text, id])
  const row = db.get<Row>('SELECT * FROM notes WHERE id = ?', [id])
  if (!row) throw new AppError('NOT_FOUND')
  return map(row)
}

export function deleteNote(id: number): void {
  const row = getDatabase().get<Row>('SELECT * FROM notes WHERE id = ?', [id])
  getDatabase().run('DELETE FROM notes WHERE id = ?', [id])
  if (row) audit('note.deleted', row.owner_type, row.owner_id)
}
