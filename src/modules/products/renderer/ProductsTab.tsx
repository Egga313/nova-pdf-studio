/** تبويب المنتجات والخدمات: كتالوج مع بحث وتصنيفات، إنشاء/تعديل/حذف، حالة النشاط. */
import { clsx } from 'clsx'
import { Boxes, Package, Pencil, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product, ProductInput } from '@shared/invoicing'
import { minorToDecimalString, parseMinor } from '@shared/money'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Switch, Textarea } from '@renderer/components/ui'
import { fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'

export function ProductsTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const { settings, taxes } = useSettings()
  const [rows, setRows] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([invoke('products:list', { query, category: category || undefined, includeInactive: true, limit: 500 }), invoke('products:categories')])
      setRows(list)
      setCategories(cats)
    } catch (e) {
      notify.error(e)
    } finally {
      setLoading(false)
    }
  }, [query, category])

  useEffect(() => {
    const h = setTimeout(() => void reload(), 120)
    return () => clearTimeout(h)
  }, [reload])
  useEffect(() => {
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
    return unsub
  }, [reload, tab.id])

  const remove = async (p: Product) => {
    if (settings.general.confirmBeforeDelete && !window.confirm(t('prod.confirmDelete', { name: p.name }))) return
    try {
      await invoke('products:delete', { id: p.id })
      notify.success('prod.deleted')
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const taxName = (id: number | null) => taxes.find((x) => x.id === id)?.name ?? '—'

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t('prod.title')}</h1>
            <p className="text-xs text-muted">{t('prod.subtitle')}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Package className="h-4 w-4" />} onClick={() => setDialog({ open: true, product: null })}>{t('prod.new')}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('prod.search')} className="ps-9" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
            <option value="">{t('prod.allCategories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <span className="text-xs text-muted">{t('prod.count', { count: rows.length })}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!loading && rows.length === 0 ? (
          <div className="card"><EmptyState icon={<Boxes className="h-6 w-6" />} title={t('empty.products.title')} body={t('empty.products.body')} action={<Button variant="primary" onClick={() => setDialog({ open: true, product: null })}>{t('empty.products.action')}</Button>} /></div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('prod.cols.name')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('prod.cols.sku')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('prod.cols.category')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('prod.cols.price')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('prod.cols.tax')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('prod.cols.unit')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('prod.cols.status')}</th>
                  <th className="w-20 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className={clsx('group hover:bg-surface-2/40', !p.isActive && 'opacity-60')} onDoubleClick={() => setDialog({ open: true, product: p })}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="truncate text-[11.5px] text-muted">{p.description}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-muted ltr-text">{p.sku ?? ''}</td>
                    <td className="px-3 py-2.5">{p.category}</td>
                    <td className="px-3 py-2.5 text-end font-medium ltr-text">{fmtMoney(p.priceMinor, p.currency)}</td>
                    <td className="px-3 py-2.5">{taxName(p.taxId)}</td>
                    <td className="px-3 py-2.5">{p.unit}</td>
                    <td className="px-3 py-2.5">{p.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ open: true, product: p })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" onClick={() => void remove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ProductDialog open={dialog.open} product={dialog.product} categories={categories} onClose={() => setDialog({ open: false, product: null })} onSaved={() => { setDialog({ open: false, product: null }); void reload() }} />
    </div>
  )
}

export function ProductDialog({ open, onClose, onSaved, product, categories }: { open: boolean; onClose: () => void; onSaved: (p: Product) => void; product: Product | null; categories: string[] }) {
  const { t } = useTranslation()
  const { settings, taxes, currencies } = useSettings()
  const [form, setForm] = useState<ProductInput>({ name: '' })
  const [price, setPrice] = useState('0.00')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    if (product) {
      setForm({ id: product.id, sku: product.sku, name: product.name, description: product.description, currency: product.currency, taxId: product.taxId, unit: product.unit, category: product.category, notes: product.notes, isActive: product.isActive })
      setPrice(minorToDecimalString(product.priceMinor))
    } else {
      setForm({ name: '', sku: '', description: '', currency: settings.invoice.defaultCurrency, taxId: settings.invoice.defaultTaxId, unit: '', category: '', notes: '', isActive: true })
      setPrice('0.00')
    }
  }, [open, product, settings])

  const submit = async () => {
    setBusy(true)
    try {
      const saved = await invoke('products:save', { ...form, priceMinor: parseMinor(price) })
      notify.success('prod.saved')
      onSaved(saved)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open={open} onClose={onClose} title={product ? t('prod.edit') : t('prod.new')} width="max-w-lg"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label={t('prod.fields.name')} required className="sm:col-span-2"><Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label={t('prod.fields.sku')}><Input value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value)} className="ltr-text" /></Field>
        <Field label={t('prod.fields.category')}>
          <Input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} list="product-categories" />
          <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={t('prod.fields.description')} className="sm:col-span-2"><Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className="min-h-[56px]" /></Field>
        <Field label={t('prod.fields.price')}><Input value={price} onChange={(e) => setPrice(e.target.value)} className="numeric" /></Field>
        <Field label={t('prod.fields.currency')}><Select value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>{currencies.filter((c) => c.isActive).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field>
        <Field label={t('prod.fields.tax')}>
          <Select value={form.taxId ?? ''} onChange={(e) => set('taxId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('common.none')}</option>
            {taxes.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label={t('prod.fields.unit')}><Input value={form.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="pcs / h / kg" /></Field>
        <Field label={t('prod.fields.notes')} className="sm:col-span-2"><Input value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Switch label={t('prod.fields.active')} checked={form.isActive !== false} onChange={(v) => set('isActive', v)} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
