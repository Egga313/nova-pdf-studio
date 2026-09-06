/** قوالب الاستخراج (PDF → فاتورة): تُخزَّن في invoice_templates بنوع 'extraction' مع تعريف JSON خاص بها. */
import { getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { ExtractionDefinition, ExtractionTemplate, ExtractionTemplateInput } from '@shared/extraction'

interface Row { id: number; name: string; definition: string; source_document_id: number | null; created_at: string; updated_at: string }

function parseDefinition(json: string): ExtractionDefinition {
  const def = JSON.parse(json) as Partial<ExtractionDefinition>
  return {
    version: 1,
    pageWidthPt: def.pageWidthPt ?? 595,
    pageHeightPt: def.pageHeightPt ?? 842,
    zones: Array.isArray(def.zones) ? def.zones : [],
    keywords: Array.isArray(def.keywords) ? def.keywords : [],
    language: def.language ?? 'auto',
    decimals: def.decimals ?? 2
  }
}

const map = (r: Row): ExtractionTemplate => ({ id: r.id, name: r.name, definition: parseDefinition(r.definition), sourceDocumentId: r.source_document_id, createdAt: r.created_at, updatedAt: r.updated_at })

export function listExtractionTemplates(): ExtractionTemplate[] {
  return getDatabase().all<Row>("SELECT id, name, definition, source_document_id, created_at, updated_at FROM invoice_templates WHERE kind = 'extraction' ORDER BY updated_at DESC").map(map)
}

export function saveExtractionTemplate(input: ExtractionTemplateInput): ExtractionTemplate {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'errors.VALIDATION')
  if (!input.definition.zones.length) throw new AppError('VALIDATION', 'imp.noZones')
  const db = getDatabase()
  const def = JSON.stringify({ ...input.definition, version: 1 })
  return db.transaction(() => {
    if (input.id) {
      db.run(`UPDATE invoice_templates SET name=?, definition=?, source_document_id=COALESCE(?, source_document_id), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND kind='extraction'`, [
        name, def, input.sourceDocumentId ?? null, input.id
      ])
      audit('template.changed', 'extraction_template', input.id, name)
      return map(db.get<Row>('SELECT * FROM invoice_templates WHERE id = ?', [input.id])!)
    }
    const { lastInsertRowid } = db.run("INSERT INTO invoice_templates (name, kind, definition, is_default, is_builtin, source_document_id) VALUES (?, 'extraction', ?, 0, 0, ?)", [name, def, input.sourceDocumentId ?? null])
    audit('template.changed', 'extraction_template', lastInsertRowid, name)
    return map(db.get<Row>('SELECT * FROM invoice_templates WHERE id = ?', [lastInsertRowid])!)
  })
}

export function deleteExtractionTemplate(id: number): void {
  getDatabase().run("DELETE FROM invoice_templates WHERE id = ? AND kind = 'extraction'", [id])
  audit('template.changed', 'extraction_template', id, 'deleted')
}
