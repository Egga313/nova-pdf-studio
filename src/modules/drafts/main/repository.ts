/** مسودات الاسترجاع التلقائي: تُحفظ كل بضع ثوانٍ أثناء التحرير وتُحذف عند الحفظ الفعلي أو الإغلاق المقصود. */
import { getDatabase, nowIso } from '@modules/database/main'
import type { DraftKind, DraftRecord } from '@shared/extras'

interface Row { id: string; kind: DraftKind; title: string; payload: string; updated_at: string }
const map = (r: Row): DraftRecord => ({ id: r.id, kind: r.kind, title: r.title, payload: r.payload, updatedAt: r.updated_at })

export function listDrafts(kind?: DraftKind): DraftRecord[] {
  const db = getDatabase()
  return (kind ? db.all<Row>('SELECT * FROM drafts WHERE kind = ? ORDER BY updated_at DESC', [kind]) : db.all<Row>('SELECT * FROM drafts ORDER BY updated_at DESC')).map(map)
}

export function saveDraft(input: { id: string; kind: DraftKind; title: string; payload: string }): void {
  if (input.payload.length > 5 * 1024 * 1024) return
  getDatabase().run('INSERT INTO drafts (id, kind, title, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, payload = excluded.payload, updated_at = excluded.updated_at', [
    input.id, input.kind, input.title, input.payload, nowIso()
  ])
}

export function deleteDraft(id: string): void {
  getDatabase().run('DELETE FROM drafts WHERE id = ?', [id])
}
