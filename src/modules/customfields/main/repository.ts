/** حقول مخصصة: تعريفات لكل كيان (فاتورة/عميل/منتج/شركة) وقيمها لكل سجل. */
import { bool, getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { CustomField, CustomFieldEntity, CustomFieldInput, CustomFieldValue } from '@shared/extras'

interface Row { id: number; entity: CustomFieldEntity; key: string; label: string; field_type: CustomField['fieldType']; show_on_invoice: number; position: number }
const map = (r: Row): CustomField => ({ id: r.id, entity: r.entity, key: r.key, label: r.label, fieldType: r.field_type, showOnInvoice: bool(r.show_on_invoice), position: r.position })

function slug(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  return s || `field_${Date.now().toString(36)}`
}

export function listCustomFields(entity?: CustomFieldEntity): CustomField[] {
  const db = getDatabase()
  return (entity
    ? db.all<Row>('SELECT * FROM custom_fields WHERE entity = ? ORDER BY position, id', [entity])
    : db.all<Row>('SELECT * FROM custom_fields ORDER BY entity, position, id')
  ).map(map)
}

export function saveCustomField(input: CustomFieldInput): CustomField {
  const label = input.label.trim()
  if (!label) throw new AppError('VALIDATION')
  const db = getDatabase()
  if (input.id) {
    db.run(`UPDATE custom_fields SET label = ?, field_type = ?, show_on_invoice = ?, position = COALESCE(?, position), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [
      label, input.fieldType, input.showOnInvoice ? 1 : 0, input.position ?? null, input.id
    ])
    audit('settings.changed', 'custom_field', input.id, label)
    return map(db.get<Row>('SELECT * FROM custom_fields WHERE id = ?', [input.id])!)
  }
  let key = input.key?.trim() || slug(label)
  for (let i = 2; db.get('SELECT id FROM custom_fields WHERE entity = ? AND key = ?', [input.entity, key]); i++) key = `${slug(label)}_${i}`
  const position = input.position ?? (db.get<{ n: number }>('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM custom_fields WHERE entity = ?', [input.entity])?.n ?? 1)
  const { lastInsertRowid } = db.run('INSERT INTO custom_fields (entity, key, label, field_type, show_on_invoice, position) VALUES (?, ?, ?, ?, ?, ?)', [
    input.entity, key, label, input.fieldType, input.showOnInvoice ? 1 : 0, position
  ])
  audit('settings.changed', 'custom_field', lastInsertRowid, label)
  return map(db.get<Row>('SELECT * FROM custom_fields WHERE id = ?', [lastInsertRowid])!)
}

export function deleteCustomField(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    db.run('DELETE FROM custom_field_values WHERE field_id = ?', [id])
    db.run('DELETE FROM custom_fields WHERE id = ?', [id])
  })
  audit('settings.changed', 'custom_field', id, 'deleted')
}

export function getCustomFieldValues(entity: CustomFieldEntity, entityId: number): CustomFieldValue[] {
  return getDatabase()
    .all<{ field_id: number; entity_id: number; value: string | null }>(
      'SELECT v.field_id, v.entity_id, v.value FROM custom_field_values v JOIN custom_fields f ON f.id = v.field_id WHERE f.entity = ? AND v.entity_id = ?', [entity, entityId]
    )
    .map((r) => ({ fieldId: r.field_id, entityId: r.entity_id, value: r.value }))
}

export function setCustomFieldValues(entity: CustomFieldEntity, entityId: number, values: { fieldId: number; value: string | null }[]): void {
  const db = getDatabase()
  const allowed = new Set(listCustomFields(entity).map((f) => f.id))
  db.transaction(() => {
    for (const v of values) {
      if (!allowed.has(v.fieldId)) continue
      if (v.value === null || v.value === '') db.run('DELETE FROM custom_field_values WHERE field_id = ? AND entity_id = ?', [v.fieldId, entityId])
      else db.run('INSERT INTO custom_field_values (field_id, entity_id, value) VALUES (?, ?, ?) ON CONFLICT(field_id, entity_id) DO UPDATE SET value = excluded.value', [v.fieldId, entityId, v.value])
    }
  })
}
