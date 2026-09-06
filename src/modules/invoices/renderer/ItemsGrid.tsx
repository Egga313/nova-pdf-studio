/**
 * شبكة بنود الفاتورة (شبيهة بـ Excel): تنقّل بلوحة المفاتيح، إكمال تلقائي للمنتجات، لصق مباشر من Excel،
 * حساب فوري لكل سطر عبر المحرّك المركزي (الأعمدة المحسوبة للقراءة فقط).
 */
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import type { Product } from '@shared/invoicing'
import type { Tax as TaxEntity } from '@shared/entities'
import { minorToDecimalString, parseMinor, parsePercent, parseQuantity } from '@shared/money'
import { fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { type DraftItem, type DraftState, useDraft } from './useInvoiceDraft'

type ColKey = 'name' | 'description' | 'qty' | 'unit' | 'price' | 'discount' | 'tax'
const EDITABLE: ColKey[] = ['name', 'description', 'qty', 'unit', 'price', 'discount', 'tax']

interface Props {
  store: StoreApi<DraftState>
  taxes: TaxEntity[]
  currency: string
  defaultTax: { taxBps: number; taxName: string }
  readOnly?: boolean
}

export function ItemsGrid({ store, taxes, currency, defaultTax, readOnly }: Props) {
  const { t } = useTranslation()
  const items = useDraft(store, (s) => s.items)
  const totals = useDraft(store, (s) => s.totals)
  const [focus, setFocus] = useState<{ row: number; col: ColKey } | null>(null)
  const [suggest, setSuggest] = useState<{ row: number; products: Product[]; index: number } | null>(null)
  const gridRef = useRef<HTMLTableElement>(null)

  const st = () => store.getState()

  // إكمال تلقائي للمنتجات أثناء كتابة اسم البند
  const searchProducts = async (row: number, query: string) => {
    if (!query.trim()) {
      setSuggest(null)
      return
    }
    try {
      const products = await invoke('products:search', { query, limit: 6 })
      setSuggest(products.length ? { row, products, index: 0 } : null)
    } catch {
      setSuggest(null)
    }
  }

  const applyProduct = (row: number, p: Product) => {
    const item = items[row]
    const tax = taxes.find((x) => x.id === p.taxId)
    st().setItem(item.key, {
      name: p.name, description: p.description, unitPriceMinor: p.priceMinor, unit: p.unit, productId: p.id,
      taxBps: tax ? tax.rateBps : item.taxBps, taxName: tax ? tax.name : item.taxName
    })
    setSuggest(null)
    focusCell(row, 'qty')
  }

  const focusCell = (row: number, col: ColKey) => {
    setFocus({ row, col })
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)
      el?.focus()
      if (el instanceof HTMLInputElement) el.select()
    })
  }

  const onKeyDown = (e: React.KeyboardEvent, row: number, col: ColKey) => {
    if (suggest && suggest.row === row && col === 'name') {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggest({ ...suggest, index: (suggest.index + 1) % suggest.products.length }); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggest({ ...suggest, index: (suggest.index - 1 + suggest.products.length) % suggest.products.length }); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyProduct(row, suggest.products[suggest.index]); return }
      if (e.key === 'Escape') { setSuggest(null); return }
    }
    const colIndex = EDITABLE.indexOf(col)
    const rtl = document.dir === 'rtl'
    if (e.key === 'Enter') {
      e.preventDefault()
      if (row === items.length - 1) st().addItem(emptyLike(defaultTax))
      focusCell(row + 1, col)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const next = e.shiftKey ? colIndex - 1 : colIndex + 1
      if (next >= EDITABLE.length) {
        if (row === items.length - 1) st().addItem(emptyLike(defaultTax))
        focusCell(row + 1, 'name')
      } else if (next < 0) {
        if (row > 0) focusCell(row - 1, EDITABLE[EDITABLE.length - 1])
      } else focusCell(row, EDITABLE[next])
    } else if (e.key === 'ArrowDown' && row < items.length - 1) { e.preventDefault(); focusCell(row + 1, col) }
    else if (e.key === 'ArrowUp' && row > 0) { e.preventDefault(); focusCell(row - 1, col) }
    else if ((e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) && e.ctrlKey && colIndex < EDITABLE.length - 1) { e.preventDefault(); focusCell(row, EDITABLE[colIndex + 1]) }
    else if ((e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) && e.ctrlKey && colIndex > 0) { e.preventDefault(); focusCell(row, EDITABLE[colIndex - 1]) }
    else if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); st().removeItem(items[row].key); focusCell(Math.max(0, row - 1), col) }
  }

  // لصق من Excel: أعمدة مفصولة بـ Tab، صفوف بأسطر. الترتيب المتوقع: البند، الوصف؟، الكمية، السعر، الخصم؟، الضريبة؟
  const onPaste = (e: React.ClipboardEvent, startRow: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const rows = text.split(/\r?\n/).filter((l) => l.trim())
    const parsed = rows.map(parseClipboardRow).filter((r): r is Partial<DraftItem> => r !== null)
    if (!parsed.length) return
    const current = st().items
    // نستبدل الصف الحالي إن كان فارغًا ثم نضيف الباقي
    const target = current[startRow]
    const isEmpty = target && !target.name && !target.unitPriceMinor
    const withDefaults = parsed.map((p) => ({ ...emptyLike(defaultTax), ...p, taxBps: p.taxBps ?? defaultTax.taxBps, taxName: p.taxBps === undefined ? defaultTax.taxName : taxes.find((x) => x.rateBps === p.taxBps)?.name ?? `${(p.taxBps ?? 0) / 100}%` }))
    if (isEmpty) {
      st().setItem(target.key, withDefaults[0])
      if (withDefaults.length > 1) st().addItems(withDefaults.slice(1))
    } else st().addItems(withDefaults)
    notify.success('inv.editor.pasted', { count: withDefaults.length })
  }

  useEffect(() => {
    const close = () => setSuggest(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const cell = (row: number, col: ColKey, value: string, onCommit: (v: string) => void, opts: { numeric?: boolean; wide?: boolean; placeholder?: string } = {}) => (
    <input
      data-cell={`${row}:${col}`}
      defaultValue={value}
      key={`${items[row].key}:${col}:${value}`}
      placeholder={opts.placeholder}
      disabled={readOnly}
      onFocus={() => setFocus({ row, col })}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => onKeyDown(e, row, col)}
      onPaste={(e) => onPaste(e, row)}
      onChange={(e) => col === 'name' && void searchProducts(row, e.target.value)}
      className={clsx('h-8 w-full bg-transparent px-2 text-[13px] outline-none focus:bg-accent/5 focus:ring-1 focus:ring-accent', opts.numeric && 'numeric text-end', opts.wide && 'min-w-[160px]')}
      style={opts.numeric ? { direction: 'ltr' } : undefined}
    />
  )

  return (
    <div className="card overflow-visible">
      <div className="overflow-x-auto">
        <table ref={gridRef} className="w-full min-w-[1120px] table-fixed text-[13px]">
          <thead className="bg-surface-2/60 text-[11.5px] text-muted">
            <tr>
              <th className="w-8 px-2 py-2 font-medium">#</th>
              <th className="w-[200px] px-2 py-2 text-start font-medium">{t('inv.editor.grid.item')}</th>
              <th className="px-2 py-2 text-start font-medium">{t('inv.editor.grid.description')}</th>
              <th className="w-[84px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.qty')}</th>
              <th className="w-[72px] px-2 py-2 text-start font-medium">{t('inv.editor.grid.unit')}</th>
              <th className="w-[130px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.price')}</th>
              <th className="w-[84px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.discount')}</th>
              <th className="w-[96px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.tax')}</th>
              <th className="w-[120px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.taxAmount')}</th>
              <th className="w-[120px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.subtotal')}</th>
              <th className="w-[130px] px-2 py-2 text-end font-medium">{t('inv.editor.grid.total')}</th>
              <th className="w-[112px] px-1 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it, row) => {
              const line = totals.lines[row]
              const focused = focus?.row === row
              return (
                <tr key={it.key} className={clsx('group', focused && 'bg-accent/[0.03]')}>
                  <td className="px-2 py-1 text-center text-[11px] text-muted">{row + 1}</td>
                  <td className="relative py-1">
                    {cell(row, 'name', it.name, (v) => st().setItem(it.key, { name: v }), { wide: true, placeholder: t('inv.editor.productSearch') })}
                    {suggest && suggest.row === row && (
                      <ul className="card absolute start-0 top-full z-20 mt-1 w-80 py-1 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
                        {suggest.products.map((p, i) => (
                          <li key={p.id}>
                            <button type="button" onMouseDown={() => applyProduct(row, p)} className={clsx('flex w-full items-center justify-between px-3 py-1.5 text-start text-[12.5px] hover:bg-surface-2', i === suggest.index && 'bg-accent/10 text-accent')}>
                              <span className="truncate">{p.name}{p.sku ? <span className="ms-2 text-[11px] text-muted ltr-text">{p.sku}</span> : null}</span>
                              <span className="ltr-text text-muted">{fmtMoney(p.priceMinor, p.currency)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-1">{cell(row, 'description', it.description ?? '', (v) => st().setItem(it.key, { description: v }), { wide: true })}</td>
                  <td className="py-1">{cell(row, 'qty', minorToDecimalString(it.quantityMilli, 3).replace(/\.?0+$/, ''), (v) => st().setItem(it.key, { quantityMilli: safe(() => parseQuantity(v), it.quantityMilli) }), { numeric: true })}</td>
                  <td className="py-1">{cell(row, 'unit', it.unit ?? '', (v) => st().setItem(it.key, { unit: v }))}</td>
                  <td className="py-1">{cell(row, 'price', minorToDecimalString(it.unitPriceMinor), (v) => st().setItem(it.key, { unitPriceMinor: safe(() => parseMinor(v), it.unitPriceMinor) }), { numeric: true })}</td>
                  <td className="py-1">{cell(row, 'discount', minorToDecimalString(it.discountBps).replace(/\.?0+$/, ''), (v) => st().setItem(it.key, { discountBps: Math.min(10_000, Math.max(0, safe(() => parsePercent(v), it.discountBps))) }), { numeric: true })}</td>
                  <td className="py-1">
                    <select
                      data-cell={`${row}:tax`}
                      value={String(it.taxBps)}
                      disabled={readOnly}
                      onFocus={() => setFocus({ row, col: 'tax' })}
                      onKeyDown={(e) => onKeyDown(e, row, 'tax')}
                      onChange={(e) => {
                        const bps = Number(e.target.value)
                        const tax = taxes.find((x) => x.rateBps === bps)
                        st().setItem(it.key, { taxBps: bps, taxName: tax?.name ?? `${bps / 100}%` })
                      }}
                      className="h-8 w-full bg-transparent px-1 text-end text-[13px] outline-none focus:ring-1 focus:ring-accent numeric"
                    >
                      {!taxes.some((x) => x.rateBps === it.taxBps) && <option value={String(it.taxBps)}>{it.taxBps / 100}%</option>}
                      {taxes.filter((x) => x.isActive).map((x) => <option key={x.id} value={String(x.rateBps)}>{x.rateBps / 100}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-end text-muted ltr-text">{line ? fmtMoney(line.taxMinor, currency, false) : ''}</td>
                  <td className="px-2 py-1 text-end ltr-text">{line ? fmtMoney(line.netMinor, currency, false) : ''}</td>
                  <td className="px-2 py-1 text-end font-medium ltr-text">{line ? fmtMoney(line.totalMinor, currency, false) : ''}</td>
                  <td className="px-1 py-1">
                    {!readOnly && (
                      <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconBtn title={t('inv.editor.duplicateRow')} onClick={() => st().duplicateItem(it.key)}><Copy className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="↑" disabled={row === 0} onClick={() => st().moveItem(it.key, -1)}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="↓" disabled={row === items.length - 1} onClick={() => st().moveItem(it.key, 1)}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title={t('inv.editor.removeRow')} danger onClick={() => st().removeItem(it.key)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button type="button" onClick={() => { const k = st().addItem(emptyLike(defaultTax)); focusCell(st().items.findIndex((i) => i.key === k), 'name') }} className="flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
            <Plus className="h-3.5 w-3.5" />{t('inv.editor.addRow')}
          </button>
          <span className="text-[11px] text-muted">{t('inv.editor.pasteHint')}</span>
        </div>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={clsx('flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 disabled:opacity-30', danger && 'hover:text-danger')}>
      {children}
    </button>
  )
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function emptyLike(defaults: { taxBps: number; taxName: string }): Partial<DraftItem> {
  return { name: '', description: '', quantityMilli: 1000, unit: '', unitPriceMinor: 0, discountBps: 0, taxBps: defaults.taxBps, taxName: defaults.taxName, productId: null }
}

/**
 * يحوّل صفًا ملصوقًا إلى بند. يتعرف على الأعمدة الرقمية آليًا:
 *  - نص واحد + عددان: (البند، الكمية، السعر)
 *  - نصان + عددان: (البند، الوصف، الكمية، السعر)
 *  - ثم اختياريًا: الخصم %، الضريبة %
 */
export function parseClipboardRow(line: string): Partial<DraftItem> | null {
  const cells = line.split('\t').map((c) => c.trim())
  if (cells.length < 2) return null
  const isNum = (c: string) => /^-?[\d\s.,]+%?$/.test(c) && /\d/.test(c)
  const texts: string[] = []
  const nums: string[] = []
  let seenNum = false
  for (const c of cells) {
    if (isNum(c)) {
      seenNum = true
      nums.push(c.replace('%', ''))
    } else if (!seenNum) texts.push(c)
    else if (c) texts.push(c)
  }
  if (!texts.length || !nums.length) return null
  const [qty, price, discount, tax] = nums
  try {
    return {
      name: texts[0],
      description: texts.slice(1).join(' '),
      quantityMilli: qty !== undefined ? parseQuantity(qty) : 1000,
      unitPriceMinor: price !== undefined ? parseMinor(price) : 0,
      discountBps: discount !== undefined ? Math.min(10_000, parsePercent(discount)) : 0,
      taxBps: tax !== undefined ? parsePercent(tax) : undefined
    }
  } catch {
    return null
  }
}

