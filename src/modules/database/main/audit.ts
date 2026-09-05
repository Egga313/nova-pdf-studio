/** سجل التدقيق: العمليات المهمة فقط (إنشاء/تعديل/حذف الفواتير، المدفوعات، العملاء...). */
import type { AuditAction, AuditLog } from '@shared/entities'
import { getDatabase } from './index'

export function audit(action: AuditAction, objectType?: string, objectId?: string | number, summary?: string): void {
  getDatabase().run(
    'INSERT INTO audit_logs (action, object_type, object_id, summary) VALUES (?, ?, ?, ?)',
    [action, objectType ?? null, objectId === undefined ? null : String(objectId), summary ?? null]
  )
}

export function listAudit(limit = 200): AuditLog[] {
  return getDatabase()
    .all<{ id: number; action: AuditAction; object_type: string | null; object_id: string | null; summary: string | null; created_at: string }>(
      'SELECT id, action, object_type, object_id, summary, created_at FROM audit_logs ORDER BY id DESC LIMIT ?',
      [limit]
    )
    .map((r) => ({ id: r.id, action: r.action, objectType: r.object_type, objectId: r.object_id, summary: r.summary, createdAt: r.created_at }))
}
