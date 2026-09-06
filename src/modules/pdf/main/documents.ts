/** مستودع المستندات: كل PDF يُفتح أو يُولَّد يُسجَّل هنا (عدد الصفحات، هل هو ممسوح، حالة OCR، النص لكل صفحة). */
import path from 'node:path'
import { bool, getDatabase } from '@modules/database/main'
import type { DocumentRecord } from '@shared/documents'

export type { DocumentRecord }

interface Row {
  id: number; title: string; kind: DocumentRecord['kind']; path: string | null; size_bytes: number | null; page_count: number
  is_scanned: number; ocr_done: number; notes: string; created_at: string; updated_at: string
}

const map = (r: Row): DocumentRecord => ({
  id: r.id, title: r.title, kind: r.kind, path: r.path, sizeBytes: r.size_bytes, pageCount: r.page_count,
  isScanned: bool(r.is_scanned), ocrDone: bool(r.ocr_done), notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at
})

export function listDocuments(limit = 200, query?: string): DocumentRecord[] {
  const db = getDatabase()
  if (query?.trim()) {
    const like = `%${query.trim()}%`
    return db.all<Row>(
      `SELECT * FROM documents WHERE deleted_at IS NULL AND (title LIKE ? OR path LIKE ?) ORDER BY updated_at DESC LIMIT ?`,
      [like, like, limit]
    ).map(map)
  }
  return db.all<Row>('SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?', [limit]).map(map)
}

export function getDocumentByPath(filePath: string): DocumentRecord | null {
  const row = getDatabase().get<Row>('SELECT * FROM documents WHERE path = ? AND deleted_at IS NULL', [filePath])
  return row ? map(row) : null
}

export function registerDocument(input: { path: string | null; title?: string; kind?: DocumentRecord['kind']; sizeBytes?: number | null; pageCount: number; isScanned?: boolean }): DocumentRecord {
  const db = getDatabase()
  const title = input.title ?? (input.path ? path.basename(input.path) : 'Untitled')
  const existing = input.path ? db.get<Row>('SELECT * FROM documents WHERE path = ?', [input.path]) : undefined
  if (existing) {
    db.run(
      `UPDATE documents SET title=?, kind=?, size_bytes=?, page_count=?, is_scanned=?, deleted_at=NULL,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
      [title, input.kind ?? existing.kind, input.sizeBytes ?? existing.size_bytes, input.pageCount, input.isScanned === undefined ? existing.is_scanned : input.isScanned ? 1 : 0, existing.id]
    )
    return map(db.get<Row>('SELECT * FROM documents WHERE id = ?', [existing.id])!)
  }
  const { lastInsertRowid } = db.run(
    'INSERT INTO documents (title, kind, path, size_bytes, page_count, is_scanned) VALUES (?, ?, ?, ?, ?, ?)',
    [title, input.kind ?? 'pdf', input.path, input.sizeBytes ?? null, input.pageCount, input.isScanned ? 1 : 0]
  )
  return map(db.get<Row>('SELECT * FROM documents WHERE id = ?', [lastInsertRowid])!)
}

export function savePageText(documentId: number, pageIndex: number, text: string, ocrConfidence?: number, layout?: string): void {
  getDatabase().run(
    `INSERT INTO document_pages (document_id, page_index, text_content, ocr_confidence, layout)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(document_id, page_index) DO UPDATE SET text_content=excluded.text_content, ocr_confidence=excluded.ocr_confidence,
       layout=COALESCE(excluded.layout, document_pages.layout), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [documentId, pageIndex, text, ocrConfidence ?? null, layout ?? null]
  )
}

/** تخطيط نص OCR المحفوظ (أسطر بإحداثيات النقاط) لإعادة بنائه كطبقة نص عند فتح المستند مجددًا. */
export function getPageLayouts(documentId: number): { pageIndex: number; layout: string }[] {
  return getDatabase()
    .all<{ page_index: number; layout: string | null }>('SELECT page_index, layout FROM document_pages WHERE document_id = ? AND layout IS NOT NULL ORDER BY page_index', [documentId])
    .map((r) => ({ pageIndex: r.page_index, layout: r.layout as string }))
}

export function markOcrDone(documentId: number): void {
  getDatabase().run(`UPDATE documents SET ocr_done = 1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [documentId])
}

export function removeDocument(id: number): void {
  getDatabase().run(`UPDATE documents SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [id])
}
