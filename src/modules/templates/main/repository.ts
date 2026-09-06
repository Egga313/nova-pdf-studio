/** مستودع القوالب: تهيئة القوالب المضمّنة، إنشاء/تعديل/تكرار/حذف/افتراضي، وأصول الهوية (شعار/توقيع/ختم) كـ data URL. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { bool, getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { getInternalValue, setInternalValue } from '@modules/settings/main/repository'
import { AppError } from '@shared/errors'
import { BUILTIN_TEMPLATES, cloneDefinition, type InvoiceTemplate, normalizeDefinition, type TemplateDefinition, type TemplateInput } from '@shared/templates'

interface Row { id: number; name: string; kind: 'layout' | 'extraction'; definition: string; is_default: number; is_builtin: number; source_document_id: number | null; created_at: string; updated_at: string }

function map(r: Row): InvoiceTemplate {
  let def: TemplateDefinition
  try {
    def = normalizeDefinition(JSON.parse(r.definition))
  } catch {
    def = normalizeDefinition(null)
  }
  return { id: r.id, name: r.name, kind: r.kind, definition: def, isDefault: bool(r.is_default), isBuiltin: bool(r.is_builtin), sourceDocumentId: r.source_document_id, createdAt: r.created_at, updatedAt: r.updated_at }
}

/** يُنشئ القوالب المضمّنة إن لم توجد (يُستدعى عند التشغيل). */
export function seedBuiltinTemplates(): void {
  const db = getDatabase()
  const count = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM invoice_templates WHERE kind = 'layout' AND is_builtin = 1")?.n ?? 0
  if (count > 0) return
  db.transaction(() => {
    BUILTIN_TEMPLATES.forEach((t, i) => {
      db.run("INSERT INTO invoice_templates (name, kind, definition, is_default, is_builtin) VALUES (?, 'layout', ?, ?, 1)", [t.name, JSON.stringify(t.definition), i === 0 ? 1 : 0])
    })
  })
}

export function listTemplates(kind: 'layout' | 'extraction' = 'layout'): InvoiceTemplate[] {
  return getDatabase().all<Row>('SELECT * FROM invoice_templates WHERE kind = ? ORDER BY is_default DESC, is_builtin DESC, name COLLATE NOCASE', [kind]).map(map)
}

export function getTemplate(id: number): InvoiceTemplate | null {
  const row = getDatabase().get<Row>('SELECT * FROM invoice_templates WHERE id = ?', [id])
  return row ? map(row) : null
}

export function getDefaultTemplate(): InvoiceTemplate {
  const db = getDatabase()
  const row = db.get<Row>("SELECT * FROM invoice_templates WHERE kind = 'layout' AND is_default = 1") ?? db.get<Row>("SELECT * FROM invoice_templates WHERE kind = 'layout' ORDER BY id LIMIT 1")
  if (!row) {
    seedBuiltinTemplates()
    return getDefaultTemplate()
  }
  return map(row)
}

export function saveTemplate(input: TemplateInput): InvoiceTemplate {
  const db = getDatabase()
  const name = input.name?.trim()
  if (!name) throw new AppError('VALIDATION', 'errors.validation.name_required')
  const def = JSON.stringify(normalizeDefinition(input.definition))
  return db.transaction(() => {
    if (input.isDefault) db.run("UPDATE invoice_templates SET is_default = 0 WHERE kind = 'layout'")
    if (input.id) {
      const existing = db.get<Row>('SELECT * FROM invoice_templates WHERE id = ?', [input.id])
      if (!existing) throw new AppError('NOT_FOUND')
      db.run(`UPDATE invoice_templates SET name=?, definition=?, is_default=COALESCE(?, is_default), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        [name, def, input.isDefault === undefined ? null : input.isDefault ? 1 : 0, input.id])
      audit('template.changed', 'template', input.id, name)
      return getTemplate(input.id)!
    }
    const { lastInsertRowid } = db.run("INSERT INTO invoice_templates (name, kind, definition, is_default, is_builtin) VALUES (?, 'layout', ?, ?, 0)", [name, def, input.isDefault ? 1 : 0])
    audit('template.changed', 'template', lastInsertRowid, `created ${name}`)
    return getTemplate(lastInsertRowid)!
  })
}

export function duplicateTemplate(id: number, newName?: string): InvoiceTemplate {
  const src = getTemplate(id)
  if (!src) throw new AppError('NOT_FOUND')
  return saveTemplate({ name: newName?.trim() || `${src.name} (copy)`, definition: cloneDefinition(src.definition), isDefault: false })
}

export function setDefaultTemplate(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    db.run("UPDATE invoice_templates SET is_default = 0 WHERE kind = 'layout'")
    db.run('UPDATE invoice_templates SET is_default = 1 WHERE id = ?', [id])
  })
}

export function deleteTemplate(id: number): void {
  const db = getDatabase()
  const row = db.get<Row>('SELECT * FROM invoice_templates WHERE id = ?', [id])
  if (!row) return
  if (bool(row.is_builtin)) throw new AppError('CONFLICT', 'errors.template.builtin')
  db.transaction(() => {
    db.run('UPDATE invoices SET template_id = NULL WHERE template_id = ?', [id])
    db.run('DELETE FROM invoice_templates WHERE id = ?', [id])
    if (bool(row.is_default)) db.run("UPDATE invoice_templates SET is_default = 1 WHERE id = (SELECT id FROM invoice_templates WHERE kind = 'layout' ORDER BY is_builtin DESC, id LIMIT 1)")
  })
  audit('template.changed', 'template', id, 'deleted')
}

/** يعيد القوالب المضمّنة إلى تعريفاتها الأصلية (لا يمس القوالب المخصصة). */
export function resetBuiltinTemplates(): void {
  const db = getDatabase()
  db.transaction(() => {
    for (const t of BUILTIN_TEMPLATES) db.run("UPDATE invoice_templates SET definition = ?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE is_builtin = 1 AND name = ?", [JSON.stringify(t.definition), t.name])
  })
}

// ------------------------------------------------------------------ أصول الهوية
export type BrandAsset = 'logo' | 'signature' | 'stamp'
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

export async function setBrandAsset(dataDir: string, kind: BrandAsset, sourcePath: string | null): Promise<string | null> {
  if (!sourcePath) {
    const old = getInternalValue<string>(`brand.${kind}`)
    if (old && fs.existsSync(old)) await fsp.rm(old, { force: true }).catch(() => undefined)
    setInternalValue(`brand.${kind}`, null)
    return null
  }
  const ext = path.extname(sourcePath).toLowerCase()
  if (!MIME[ext]) throw new AppError('VALIDATION', 'errors.validation.image_type')
  const target = path.join(dataDir, `brand-${kind}${ext}`)
  await fsp.copyFile(sourcePath, target)
  setInternalValue(`brand.${kind}`, target)
  return target
}

export async function readBrandAssets(logoPath: string | null): Promise<{ logo: string | null; signature: string | null; stamp: string | null }> {
  const read = async (p: string | null): Promise<string | null> => {
    if (!p || !fs.existsSync(p)) return null
    const mime = MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
    return `data:${mime};base64,${(await fsp.readFile(p)).toString('base64')}`
  }
  return {
    logo: await read(logoPath),
    signature: await read(getInternalValue<string>('brand.signature')),
    stamp: await read(getInternalValue<string>('brand.stamp'))
  }
}
