/**
 * مصمّم القالب (Drag & Drop): معاينة حيّة للفاتورة العيّنة بمقاس الصفحة الحقيقي، وفوقها طبقة شفافة للكتل
 * يمكن سحبها وتغيير حجمها بالملليمتر. لوحة خصائص للكتلة المختارة، وإعدادات الصفحة والألوان والأعمدة. Ctrl+S للحفظ.
 */
import { clsx } from 'clsx'
import { Eye, EyeOff, RotateCcw, Save, Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Language } from '@shared/settings'
import { BUILTIN_TEMPLATES, cloneDefinition, type InvoiceTemplate, normalizeDefinition, pageSizeMm, type TemplateBlock, type TemplateDefinition } from '@shared/templates'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Button, Field, Input, Select, Spinner, Switch } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { sampleInvoice } from './sampleInvoice'
import { useInvoiceHtml } from './useInvoiceRender'

const MIN_MM = 8

export function TemplateDesigner({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const id = tab.params.id as number
  const { setDirty, setTitle } = useTabs()
  const settings = useSettings((s) => s.settings)
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null)
  const [def, setDef] = useState<TemplateDefinition | null>(null)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedJson, setSavedJson] = useState('')
  const [scale, setScale] = useState(1) // بكسل لكل مم
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'move' | 'resize'; id: string; startX: number; startY: number; orig: TemplateBlock } | null>(null)

  useEffect(() => {
    invoke('templates:get', { id }).then((tp) => {
      if (!tp) return
      setTemplate(tp)
      setDef(cloneDefinition(tp.definition))
      setName(tp.name)
      setSavedJson(JSON.stringify({ name: tp.name, def: tp.definition }))
      setTitle(tab.id, tp.name)
    }).catch((e) => notify.error(e))
  }, [id, tab.id, setTitle])

  const dirty = !!def && JSON.stringify({ name, def }) !== savedJson
  useEffect(() => setDirty(tab.id, dirty), [dirty, tab.id, setDirty])

  const lang: Language = def ? (def.language === 'auto' ? settings.language : def.language) : settings.language
  const invoice = useMemo(() => sampleInvoice(lang, settings.invoice.defaultCurrency), [lang, settings.invoice.defaultCurrency])
  const html = useInvoiceHtml(invoice, def, lang)

  // مقياس العرض: نلائم عرض الصفحة داخل المساحة المتاحة
  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el || !def) return
    const apply = () => {
      const page = pageSizeMm(def.page)
      // لا نصغّر الصفحة تحت ~3 بكسل/مم حتى تبقى الكتل قابلة للسحب بدقة؛ تظهر أشرطة تمرير عند الحاجة
      setScale(Math.max(3, Math.min(3.6, (el.clientWidth - 48) / page.width)))
    }
    apply()
    const ro = new ResizeObserver(() => requestAnimationFrame(apply))
    ro.observe(el)
    return () => ro.disconnect()
  }, [def?.page.size, def?.page.orientation, def])

  const update = (patch: Partial<TemplateDefinition>) => setDef((d) => (d ? { ...d, ...patch } : d))
  const updateBlock = (bid: string, patch: Partial<TemplateBlock>) => setDef((d) => (d ? { ...d, blocks: d.blocks.map((b) => (b.id === bid ? { ...b, ...patch } : b)) } : d))
  const updateStyle = (bid: string, patch: Partial<NonNullable<TemplateBlock['style']>>) => setDef((d) => (d ? { ...d, blocks: d.blocks.map((b) => (b.id === bid ? { ...b, style: { ...(b.style ?? {}), ...patch } } : b)) } : d))

  const save = useCallback(async (asDefault = false) => {
    if (!def || !template) return
    setSaving(true)
    try {
      const saved = await invoke('templates:save', { id: template.id, name: name.trim() || template.name, definition: def, isDefault: asDefault ? true : undefined })
      setTemplate(saved)
      setSavedJson(JSON.stringify({ name: saved.name, def }))
      setTitle(tab.id, saved.name)
      notify.success('tpl.saved')
    } catch (e) {
      notify.error(e)
    } finally {
      setSaving(false)
    }
  }, [def, template, name, tab.id, setTitle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useTabs.getState().activeId !== tab.id) return
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void save() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [save, tab.id])

  // سحب/تغيير حجم بالملليمتر
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    const rtl = (def?.direction === 'auto' ? lang === 'ar' : def?.direction === 'rtl')
    const x = rtl ? (r.right - e.clientX) / scale : (e.clientX - r.left) / scale
    return { x: x - (def?.page.marginMm ?? 0), y: (e.clientY - r.top) / scale - (def?.page.marginMm ?? 0) }
  }
  const onPointerDown = (e: React.PointerEvent, b: TemplateBlock, kind: 'move' | 'resize') => {
    e.stopPropagation()
    setSelected(b.id)
    const p = toMm(e)
    drag.current = { kind, id: b.id, startX: p.x, startY: p.y, orig: b }
    try { canvasRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !def) return
    const p = toMm(e)
    const dx = Math.round((p.x - d.startX) * 2) / 2
    const dy = Math.round((p.y - d.startY) * 2) / 2
    if (d.kind === 'move') updateBlock(d.id, { x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) })
    else updateBlock(d.id, { width: Math.max(MIN_MM, d.orig.width + dx), height: Math.max(MIN_MM, d.orig.height + dy) })
  }
  const onPointerUp = () => (drag.current = null)

  if (!def || !template) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  const page = pageSizeMm(def.page)
  const rtl = def.direction === 'auto' ? lang === 'ar' : def.direction === 'rtl'
  const sel = def.blocks.find((b) => b.id === selected) ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-border bg-surface px-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-56" aria-label={t('tpl.designer.name')} />
        {template.isBuiltin && <span className="text-[11px] text-muted">{t('tpl.builtin')}</span>}
        {dirty && <span className="text-[11px] text-warning">• {t('tpl.designer.unsaved')}</span>}
        <span className="ms-2 hidden text-[11px] text-muted lg:inline">{t('tpl.designer.dragHint')}</span>
        <div className="ms-auto flex gap-1">
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { const base = BUILTIN_TEMPLATES.find((b) => b.name === template.name)?.definition ?? BUILTIN_TEMPLATES[0].definition; setDef({ ...def, blocks: cloneDefinition(normalizeDefinition(base)).blocks }) }}>{t('tpl.designer.reset')}</Button>
          <Button size="sm" variant="ghost" icon={<Star className="h-3.5 w-3.5" />} onClick={() => void save(true)}>{t('tpl.setDefault')}</Button>
          <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={() => void save()}>{t('common.save')}</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* قائمة الكتل */}
        <aside className="w-56 shrink-0 overflow-y-auto border-e border-border bg-surface p-2 text-[12.5px]">
          <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('tpl.designer.blocks')}</h3>
          {def.blocks.map((b) => (
            <div key={b.id} className={clsx('flex items-center gap-1 rounded-md px-2 py-1', selected === b.id ? 'bg-accent/10 text-accent' : 'hover:bg-surface-2')}>
              <button type="button" className="flex-1 truncate text-start" onClick={() => setSelected(b.id)}>{t(`tpl.designer.kinds.${b.kind}`)}</button>
              <button type="button" className="text-muted" title={b.visible ? t('tpl.designer.visible') : t('tpl.designer.hidden')} onClick={() => updateBlock(b.id, { visible: !b.visible })}>{b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
            </div>
          ))}
        </aside>

        {/* اللوحة */}
        <div className="min-w-0 flex-1 overflow-auto bg-surface-2/60 p-6" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div ref={canvasRef} className="relative mx-auto bg-white shadow-pop" style={{ width: page.width * scale, height: page.height * scale }} onPointerDown={() => setSelected(null)}>
            <iframe title="design" srcDoc={html} sandbox="" className="pointer-events-none absolute inset-0 origin-top-left bg-white" style={{ width: `${page.width}mm`, height: `${page.height}mm`, transform: `scale(${scale / 3.7795})`, transformOrigin: 'top left', border: 0 }} />
            {/* طبقة الكتل */}
            <div className="absolute" style={{ top: def.page.marginMm * scale, [rtl ? 'right' : 'left']: def.page.marginMm * scale, width: (page.width - def.page.marginMm * 2) * scale, height: (page.height - def.page.marginMm * 2) * scale }}>
              {def.blocks.map((b) => (
                <div
                  key={b.id}
                  onPointerDown={(e) => onPointerDown(e, b, 'move')}
                  className={clsx('absolute cursor-move rounded-sm border transition-colors', selected === b.id ? 'border-accent bg-accent/10' : 'border-transparent hover:border-accent/50 hover:bg-accent/5', !b.visible && 'opacity-30')}
                  style={{ top: b.y * scale, [rtl ? 'right' : 'left']: b.x * scale, width: b.width * scale, height: b.height * scale }}
                  title={t(`tpl.designer.kinds.${b.kind}`)}
                >
                  {selected === b.id && (
                    <>
                      <span className="absolute -top-5 start-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-fg">{t(`tpl.designer.kinds.${b.kind}`)}</span>
                      <span onPointerDown={(e) => onPointerDown(e, b, 'resize')} className="absolute -bottom-1.5 -end-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-accent bg-surface" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* الخصائص */}
        <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-s border-border bg-surface p-3 text-[12.5px]">
          {sel ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('tpl.designer.properties')} · {t(`tpl.designer.kinds.${sel.kind}`)}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('tpl.designer.x')}><Input type="number" step={0.5} value={sel.x} onChange={(e) => updateBlock(sel.id, { x: Number(e.target.value) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.y')}><Input type="number" step={0.5} value={sel.y} onChange={(e) => updateBlock(sel.id, { y: Number(e.target.value) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.width')}><Input type="number" step={0.5} value={sel.width} onChange={(e) => updateBlock(sel.id, { width: Math.max(MIN_MM, Number(e.target.value)) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.height')}><Input type="number" step={0.5} value={sel.height} onChange={(e) => updateBlock(sel.id, { height: Math.max(MIN_MM, Number(e.target.value)) })} className="numeric h-8" /></Field>
              </div>
              {(sel.kind === 'text' || sel.kind === 'title' || sel.kind === 'footer') && <Field label={t('tpl.designer.text')} className="mt-2"><Input value={sel.text ?? ''} onChange={(e) => updateBlock(sel.id, { text: e.target.value })} className="h-8" /></Field>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label={t('tpl.designer.fontSize')}><Input type="number" step={0.5} min={5} max={40} value={sel.style?.fontSize ?? def.theme.baseFontSize} onChange={(e) => updateStyle(sel.id, { fontSize: Number(e.target.value) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.align')}>
                  <Select value={sel.style?.align ?? 'start'} onChange={(e) => updateStyle(sel.id, { align: e.target.value as 'start' | 'center' | 'end' })} className="h-8"><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></Select>
                </Field>
                <Field label={t('tpl.designer.color')}><input type="color" value={sel.style?.color ?? def.theme.text} onChange={(e) => updateStyle(sel.id, { color: e.target.value })} className="h-8 w-full rounded border border-border bg-surface" /></Field>
                <Field label={t('tpl.designer.background')}>
                  <div className="flex gap-1"><input type="color" value={sel.style?.background ?? '#ffffff'} onChange={(e) => updateStyle(sel.id, { background: e.target.value })} className="h-8 w-full rounded border border-border bg-surface" /><Button size="sm" variant="ghost" onClick={() => updateStyle(sel.id, { background: null })}>×</Button></div>
                </Field>
                <Field label={t('tpl.designer.padding')}><Input type="number" step={0.5} min={0} value={sel.style?.padding ?? 0} onChange={(e) => updateStyle(sel.id, { padding: Number(e.target.value) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.radius')}><Input type="number" step={0.5} min={0} value={sel.style?.borderRadius ?? 0} onChange={(e) => updateStyle(sel.id, { borderRadius: Number(e.target.value) })} className="numeric h-8" /></Field>
                <Field label={t('tpl.designer.border')} className="col-span-2"><Input value={sel.style?.border ?? ''} placeholder="1px solid #dddddd" onChange={(e) => updateStyle(sel.id, { border: e.target.value || null })} className="h-8 ltr-text" /></Field>
              </div>
              <div className="mt-2"><Switch label={t('tpl.designer.visible')} checked={sel.visible} onChange={(v) => updateBlock(sel.id, { visible: v })} /><Switch label="Bold" checked={!!sel.style?.bold} onChange={(v) => updateStyle(sel.id, { bold: v })} /></div>
            </section>
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('tpl.designer.page')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('tpl.designer.size')}><Select value={def.page.size} onChange={(e) => update({ page: { ...def.page, size: e.target.value as 'A4' | 'A5' | 'Letter' } })} className="h-8"><option>A4</option><option>A5</option><option>Letter</option></Select></Field>
                  <Field label={t('tpl.designer.orientation')}><Select value={def.page.orientation} onChange={(e) => update({ page: { ...def.page, orientation: e.target.value as 'portrait' | 'landscape' } })} className="h-8"><option value="portrait">{t('settings.printing.portrait')}</option><option value="landscape">{t('settings.printing.landscape')}</option></Select></Field>
                  <Field label={t('tpl.designer.margin')}><Input type="number" min={0} max={40} value={def.page.marginMm} onChange={(e) => update({ page: { ...def.page, marginMm: Number(e.target.value) } })} className="numeric h-8" /></Field>
                  <Field label={t('tpl.designer.direction')}><Select value={def.direction} onChange={(e) => update({ direction: e.target.value as TemplateDefinition['direction'] })} className="h-8"><option value="auto">{t('tpl.preview.auto')}</option><option value="rtl">RTL</option><option value="ltr">LTR</option></Select></Field>
                  <Field label={t('tpl.preview.language')} className="col-span-2"><Select value={def.language} onChange={(e) => update({ language: e.target.value as TemplateDefinition['language'] })} className="h-8"><option value="auto">{t('tpl.preview.auto')}</option><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></Select></Field>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('tpl.designer.theme')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('tpl.designer.accent')}><input type="color" value={def.theme.accent} onChange={(e) => update({ theme: { ...def.theme, accent: e.target.value } })} className="h-8 w-full rounded border border-border bg-surface" /></Field>
                  <Field label={t('tpl.designer.color')}><input type="color" value={def.theme.text} onChange={(e) => update({ theme: { ...def.theme, text: e.target.value } })} className="h-8 w-full rounded border border-border bg-surface" /></Field>
                  <Field label={t('tpl.designer.tableHeader')}><input type="color" value={def.theme.tableHeaderBg} onChange={(e) => update({ theme: { ...def.theme, tableHeaderBg: e.target.value } })} className="h-8 w-full rounded border border-border bg-surface" /></Field>
                  <Field label={t('tpl.designer.tableHeaderText')}><input type="color" value={def.theme.tableHeaderText} onChange={(e) => update({ theme: { ...def.theme, tableHeaderText: e.target.value } })} className="h-8 w-full rounded border border-border bg-surface" /></Field>
                  <Field label={t('tpl.designer.baseFont')}><Input type="number" step={0.5} min={7} max={16} value={def.theme.baseFontSize} onChange={(e) => update({ theme: { ...def.theme, baseFontSize: Number(e.target.value) } })} className="numeric h-8" /></Field>
                  <Field label={t('tpl.designer.font')}><Select value={def.theme.fontFamily} onChange={(e) => update({ theme: { ...def.theme, fontFamily: e.target.value } })} className="h-8">
                    <option value='"Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif'>Sans</option>
                    <option value='"Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif'>Naskh</option>
                    <option value='"Times New Roman", "Noto Naskh Arabic", serif'>Serif</option>
                    <option value='Consolas, "Courier New", monospace'>Mono</option>
                  </Select></Field>
                </div>
                <div className="mt-1">
                  <Switch label={t('tpl.designer.stripe')} checked={!!def.theme.tableStripe} onChange={(v) => update({ theme: { ...def.theme, tableStripe: v ? '#f5f6fa' : null } })} />
                  <Switch label={t('tpl.designer.showLogo')} checked={def.showLogo} onChange={(v) => update({ showLogo: v })} />
                  <Switch label={t('tpl.designer.showWords')} checked={def.showAmountInWords} onChange={(v) => update({ showAmountInWords: v })} />
                  <Switch label={t('tpl.designer.showQr')} checked={def.showQr} onChange={(v) => update({ showQr: v })} />
                </div>
                {def.showQr && (
                  <Field label={t('tpl.designer.qrContent')} className="mt-1">
                    <Select value={def.qrContent} onChange={(e) => update({ qrContent: e.target.value as TemplateDefinition['qrContent'] })} className="h-8">
                      <option value="summary">{t('tpl.designer.qrSummary')}</option><option value="number">{t('tpl.designer.qrNumber')}</option><option value="custom">{t('tpl.designer.qrCustom')}</option>
                    </Select>
                    {def.qrContent === 'custom' && <Input value={def.qrCustomText} onChange={(e) => update({ qrCustomText: e.target.value })} className="mt-1 h-8" />}
                  </Field>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('tpl.designer.columns')}</h3>
                {(Object.keys(def.columns) as (keyof TemplateDefinition['columns'])[]).map((k) => (
                  <Switch key={k} label={t(`inv.editor.grid.${{ index: 'item', description: 'description', unit: 'unit', discount: 'discount', taxRate: 'tax', taxAmount: 'taxAmount', net: 'subtotal' }[k]}`)} checked={def.columns[k]} onChange={(v) => update({ columns: { ...def.columns, [k]: v } })} />
                ))}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
