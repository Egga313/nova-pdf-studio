/** يحوّل ورقة إلى HTML للطباعة/تصدير PDF عبر Chromium (نص عربي حقيقي، اتجاه حسب اللغة). */
import { formatCellValue, type Sheet, DEFAULT_COL_WIDTH } from '../shared/sheetModel'
import { colToLetters } from '../shared/formula'

export interface SheetHtmlOptions {
  title: string
  locale: string
  currency: string
  rtl: boolean
  gridlines?: boolean
  headers?: boolean
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export function usedRange(sheet: Sheet): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.input === '' && !cell.style?.background) continue
    const [c, r] = key.split(':').map(Number)
    rows = Math.max(rows, r + 1)
    cols = Math.max(cols, c + 1)
  }
  for (const m of sheet.merges) {
    rows = Math.max(rows, m.row + m.rows)
    cols = Math.max(cols, m.col + m.cols)
  }
  return { rows, cols }
}

export function renderSheetHtml(sheet: Sheet, opts: SheetHtmlOptions): { html: string; landscape: boolean } {
  const { rows, cols } = usedRange(sheet)
  const totalWidth = Array.from({ length: cols }, (_, c) => sheet.colWidths[c] ?? DEFAULT_COL_WIDTH).reduce((a, b) => a + b, 0)
  const landscape = totalWidth > 720
  const covered = new Set<string>()
  const anchors = new Map<string, { cols: number; rows: number }>()
  for (const m of sheet.merges) {
    anchors.set(`${m.col}:${m.row}`, { cols: m.cols, rows: m.rows })
    for (let r = m.row; r < m.row + m.rows; r++) for (let c = m.col; c < m.col + m.cols; c++) if (r !== m.row || c !== m.col) covered.add(`${c}:${r}`)
  }
  const gridlines = opts.gridlines ?? true
  const showHeaders = opts.headers ?? false
  const body: string[] = []
  if (showHeaders) {
    body.push('<tr class="hdr"><th></th>' + Array.from({ length: cols }, (_, c) => `<th style="width:${sheet.colWidths[c] ?? DEFAULT_COL_WIDTH}px">${colToLetters(c)}</th>`).join('') + '</tr>')
  }
  for (let r = 0; r < rows; r++) {
    const tds: string[] = []
    if (showHeaders) tds.push(`<th>${r + 1}</th>`)
    for (let c = 0; c < cols; c++) {
      const key = `${c}:${r}`
      if (covered.has(key)) continue
      const cell = sheet.cells[key]
      const span = anchors.get(key)
      const st = cell?.style ?? {}
      const isNum = typeof cell?.value === 'number'
      const align = st.align ?? (isNum ? 'end' : 'start')
      const styles = [
        `text-align:${align === 'center' ? 'center' : align === 'end' ? (opts.rtl ? 'left' : 'right') : opts.rtl ? 'right' : 'left'}`,
        st.bold ? 'font-weight:600' : '',
        st.italic ? 'font-style:italic' : '',
        st.underline ? 'text-decoration:underline' : '',
        st.color ? `color:${st.color}` : '',
        st.background ? `background:${st.background}` : '',
        st.fontSize ? `font-size:${st.fontSize}px` : ''
      ].filter(Boolean).join(';')
      const text = cell ? formatCellValue(cell, opts.locale, opts.currency) : ''
      const attrs = `${span ? ` colspan="${span.cols}" rowspan="${span.rows}"` : ''} style="${styles}"`
      tds.push(`<td${attrs}${isNum ? ' dir="ltr"' : ''}>${esc(text)}</td>`)
    }
    body.push(`<tr style="height:${sheet.rowHeights[r] ?? 26}px">${tds.join('')}</tr>`)
  }
  const colgroup = '<colgroup>' + (showHeaders ? '<col style="width:36px">' : '') + Array.from({ length: cols }, (_, c) => `<col style="width:${sheet.colWidths[c] ?? DEFAULT_COL_WIDTH}px">`).join('') + '</colgroup>'
  const html = `<!doctype html><html lang="${opts.locale}" dir="${opts.rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: "Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif; color: #111827; margin: 0; font-size: 11px; }
  h1 { font-size: 15px; margin: 0 0 8px; font-weight: 600; }
  .meta { color: #6b7280; font-size: 10px; margin-bottom: 8px; }
  table { border-collapse: collapse; table-layout: fixed; max-width: 100%; }
  td, th { padding: 3px 6px; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; ${gridlines ? 'border: 1px solid #d1d5db;' : ''} }
  th { background: #f3f4f6; color: #6b7280; font-weight: 500; text-align: center; }
  tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(opts.title)}</h1>
<div class="meta">${esc(sheet.name)} · ${rows} × ${cols}</div>
<table>${colgroup}<tbody>${body.join('')}</tbody></table>
</body></html>`
  return { html, landscape }
}
