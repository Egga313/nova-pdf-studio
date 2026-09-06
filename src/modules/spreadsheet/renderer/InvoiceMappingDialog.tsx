/**
 * ربط أعمدة الورقة ببنود الفاتورة: يخمّن الأعمدة من العناوين، ويحوّل القيم إلى وحدات صحيحة عبر محرك المال (لا أعداد عائمة).
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { InvoiceItemInput } from '@shared/invoicing'
import { parseMinor, parsePercent, parseQuantity } from '@shared/money'
import { Button, Dialog, Field, Select, Switch } from '@renderer/components/ui'
import { colToLetters } from '../shared/formula'
import type { Cell, Sheet } from '../shared/sheetModel'
import { usedRange } from './sheetHtml'

type FieldKey = 'description' | 'qty' | 'price' | 'discount' | 'tax' | 'ref'
const FIELDS: FieldKey[] = ['description', 'qty', 'price', 'discount', 'tax', 'ref']
const GUESS: Record<FieldKey, RegExp> = {
  description: /وصف|بند|منتج|تسمية|d[ée]signation|description|item|libell|article|name|اسم/i,
  qty: /كمية|qt[ée]|quant|qty|عدد/i,
  price: /سعر|prix|price|p\.?u|unit/i,
  discount: /خصم|remise|discount|disc/i,
  tax: /ضريبة|tva|tax|vat|t\.?v\.?a/i,
  ref: /مرجع|r[ée]f|code|sku|ref/i
}

export interface MappingResult { items: InvoiceItemInput[] }

function cellText(cell: Cell | undefined): string {
  if (!cell) return ''
  const v = cell.value
  if (v === null || v === undefined) return cell.input
  return typeof v === 'number' ? String(v) : String(v)
}

function percentOf(cell: Cell | undefined): number {
  if (!cell) return 0
  const raw = cell.input.trim()
  try {
    if (raw.endsWith('%')) return parsePercent(raw.slice(0, -1))
    if (typeof cell.value === 'number') return cell.style?.format === 'percent' || (cell.value > 0 && cell.value < 1) ? parsePercent(String(cell.value * 100)) : parsePercent(String(cell.value))
    return parsePercent(cellText(cell))
  } catch {
    return 0
  }
}

export function buildItems(sheet: Sheet, mapping: Record<FieldKey, number>, headerRow: boolean, decimals: number, defaultTax: { taxBps: number; taxName: string }): InvoiceItemInput[] {
  const { rows } = usedRange(sheet)
  const items: InvoiceItemInput[] = []
  for (let r = headerRow ? 1 : 0; r < rows; r++) {
    const get = (f: FieldKey) => (mapping[f] >= 0 ? sheet.cells[`${mapping[f]}:${r}`] : undefined)
    const name = cellText(get('description')).trim()
    const priceCell = get('price')
    if (!name && !priceCell) continue
    if (!name) continue
    let unitPriceMinor = 0
    try {
      unitPriceMinor = priceCell ? parseMinor(cellText(priceCell), decimals) : 0
    } catch {
      unitPriceMinor = 0
    }
    let quantityMilli = 1000
    const q = get('qty')
    if (q) {
      try {
        quantityMilli = parseQuantity(cellText(q)) || 1000
      } catch {
        quantityMilli = 1000
      }
    }
    const taxCell = get('tax')
    const taxBps = taxCell ? percentOf(taxCell) : defaultTax.taxBps
    const refText = cellText(get('ref')).trim()
    items.push({
      name, description: refText ? refText : '', quantityMilli, unitPriceMinor, discountBps: percentOf(get('discount')), taxBps,
      taxName: taxCell ? `${(taxBps / 100).toString()}%` : defaultTax.taxName, productId: null
    })
  }
  return items
}

export function InvoiceMappingDialog({ open, onClose, sheet, decimals, defaultTax, onConfirm }: {
  open: boolean
  onClose: () => void
  sheet: Sheet
  decimals: number
  defaultTax: { taxBps: number; taxName: string }
  onConfirm: (result: MappingResult) => void
}) {
  const { t } = useTranslation()
  const { rows, cols } = useMemo(() => usedRange(sheet), [sheet])
  const [headerRow, setHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({ description: -1, qty: -1, price: -1, discount: -1, tax: -1, ref: -1 })

  useEffect(() => {
    if (!open) return
    // تخمين من عناوين الصف الأول؛ إن لم يكن هناك عناوين نصية نفترض ترتيبًا شائعًا
    const guess: Record<FieldKey, number> = { description: -1, qty: -1, price: -1, discount: -1, tax: -1, ref: -1 }
    const firstRowTexts = Array.from({ length: cols }, (_, c) => cellText(sheet.cells[`${c}:0`]))
    const hasHeader = firstRowTexts.some((s) => s && Number.isNaN(Number(s.replace(/[\s,]/g, ''))))
    setHeaderRow(hasHeader)
    if (hasHeader) {
      for (const f of FIELDS) {
        const idx = firstRowTexts.findIndex((s, c) => GUESS[f].test(s) && !Object.values(guess).includes(c))
        if (idx >= 0) guess[f] = idx
      }
    }
    if (guess.description < 0) {
      // أول عمود نصي غالبًا الوصف، وأول عمود رقمي بعده السعر
      for (let c = 0; c < cols; c++) {
        const v = sheet.cells[`${c}:${hasHeader ? 1 : 0}`]?.value
        if (typeof v === 'string' && guess.description < 0) guess.description = c
        else if (typeof v === 'number' && guess.description >= 0 && guess.price < 0 && c !== guess.qty) {
          if (guess.qty < 0 && Number.isInteger(v) && v < 1000) guess.qty = c
          else guess.price = c
        }
      }
    }
    setMapping(guess)
  }, [open, sheet, cols])

  const items = useMemo(() => (mapping.description >= 0 ? buildItems(sheet, mapping, headerRow, decimals, defaultTax) : []), [sheet, mapping, headerRow, decimals, defaultTax])
  const canConfirm = mapping.description >= 0 && mapping.price >= 0 && items.length > 0
  const colLabel = (c: number) => {
    const head = headerRow ? cellText(sheet.cells[`${c}:0`]).trim() : ''
    return head ? `${colToLetters(c)} — ${head.slice(0, 24)}` : colToLetters(c)
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('sheet.mappingTitle')} width="max-w-2xl"
      footer={
        <>
          <span className="me-auto text-xs text-muted">{canConfirm ? t('sheet.rowsFound', { count: items.length }) : t('sheet.needDescription')}</span>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!canConfirm} onClick={() => onConfirm({ items })}>{t('sheet.createInvoice')}</Button>
        </>
      }>
      <p className="mb-4 text-xs text-muted">{t('sheet.mappingHint')}</p>
      <div className="mb-4"><Switch checked={headerRow} onChange={setHeaderRow} label={t('sheet.headerRow')} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <Field key={f} label={t(`sheet.col${f[0].toUpperCase()}${f.slice(1)}`)} required={f === 'description' || f === 'price'}>
            <Select value={mapping[f]} onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })}>
              <option value={-1}>{t('sheet.colNone')}</option>
              {Array.from({ length: cols }, (_, c) => <option key={c} value={c}>{colLabel(c)}</option>)}
            </Select>
          </Field>
        ))}
      </div>
      {items.length > 0 && (
        <div className="mt-4 max-h-48 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr><th className="px-2 py-1 text-start">{t('sheet.colDescription')}</th><th className="px-2 py-1 text-end">{t('sheet.colQty')}</th><th className="px-2 py-1 text-end">{t('sheet.colPrice')}</th><th className="px-2 py-1 text-end">{t('sheet.colTax')}</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.slice(0, 50).map((it, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{it.name}</td>
                  <td className="px-2 py-1 text-end ltr-text">{(it.quantityMilli / 1000).toString()}</td>
                  <td className="px-2 py-1 text-end ltr-text">{(it.unitPriceMinor / 10 ** decimals).toFixed(decimals)}</td>
                  <td className="px-2 py-1 text-end ltr-text">{(it.taxBps / 100).toString()}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 text-[11px] text-muted">{t('sheet.gridInfo', { rows, cols })}</div>
        </div>
      )}
    </Dialog>
  )
}
