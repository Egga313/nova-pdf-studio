/** لوحة خصائص الكائن المحدد في وضع التعديل: خط، حجم، سمك، ألوان، محاذاة، شفافية، حذف وترتيب. */
import { AlignCenter, AlignLeft, AlignRight, ArrowUpToLine, Bold, Italic, Trash2, Underline } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import { Button, Field, Input, Select } from '@renderer/components/ui'
import type { EditObject, ShapeObject, TextObject } from '../shared/editModel'
import { type EditorState, useEditor } from './useEditor'

export function PropertiesPanel({ store }: { store: StoreApi<EditorState> }) {
  const { t } = useTranslation()
  const selectedId = useEditor(store, (s) => s.selectedId)
  const objects = useEditor(store, (s) => s.history.present.objects)
  const defaults = useEditor(store, (s) => s.defaults)
  const tool = useEditor(store, (s) => s.tool)
  const o = objects.find((x) => x.id === selectedId) ?? null
  const update = (patch: Partial<EditObject>) => o && store.getState().update(o.id, patch)

  if (!o) {
    // بلا تحديد: إعدادات الأداة الافتراضية
    return (
      <aside className="w-60 shrink-0 space-y-3 overflow-y-auto border-s border-border bg-surface p-3 text-[12.5px]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t('edit.toolDefaults')} · {t(`edit.tools.${tool}`)}</h3>
        <Field label={t('edit.props.fontSize')}><Input type="number" min={4} max={200} value={defaults.fontSize} onChange={(e) => store.getState().setDefaults({ fontSize: Number(e.target.value) || 12 })} className="numeric h-8" /></Field>
        <Field label={t('edit.props.textColor')}><ColorInput value={defaults.color} onChange={(v) => store.getState().setDefaults({ color: v })} /></Field>
        <Field label={t('edit.props.stroke')}><ColorInput value={defaults.stroke} onChange={(v) => store.getState().setDefaults({ stroke: v })} /></Field>
        <Field label={t('edit.props.strokeWidth')}><Input type="number" min={0.5} max={30} step={0.5} value={defaults.strokeWidth} onChange={(e) => store.getState().setDefaults({ strokeWidth: Number(e.target.value) || 1 })} className="numeric h-8" /></Field>
        <Field label={t('edit.props.highlight')}><ColorInput value={defaults.highlightColor} onChange={(v) => store.getState().setDefaults({ highlightColor: v })} /></Field>
        <p className="text-[11px] text-muted">{t('edit.selectHint')}</p>
      </aside>
    )
  }

  return (
    <aside className="w-60 shrink-0 space-y-3 overflow-y-auto border-s border-border bg-surface p-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t(`edit.kinds.${o.kind}`)}</h3>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title={t('edit.props.toFront')} onClick={() => store.getState().toFront(o.id)}><ArrowUpToLine className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" title={t('common.delete')} onClick={() => store.getState().remove([o.id])}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X"><Input type="number" value={Math.round(o.x)} onChange={(e) => update({ x: Number(e.target.value) })} className="numeric h-8" /></Field>
        <Field label="Y"><Input type="number" value={Math.round(o.y)} onChange={(e) => update({ y: Number(e.target.value) })} className="numeric h-8" /></Field>
        <Field label={t('edit.props.width')}><Input type="number" min={1} value={Math.round(o.width)} onChange={(e) => update({ width: Math.max(1, Number(e.target.value)) })} className="numeric h-8" /></Field>
        <Field label={t('edit.props.height')}><Input type="number" min={1} value={Math.round(o.height)} onChange={(e) => update({ height: Math.max(1, Number(e.target.value)) })} className="numeric h-8" /></Field>
      </div>

      {o.kind === 'text' && <TextProps o={o} update={update} />}
      {(o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'line' || o.kind === 'check') && <ShapeProps o={o} update={update} />}
      {o.kind === 'highlight' && (
        <>
          <Field label={t('edit.props.color')}><ColorInput value={o.color} onChange={(v) => update({ color: v })} /></Field>
          <Field label={t('edit.props.opacity')}><Input type="range" min={0.1} max={1} step={0.05} value={o.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} /></Field>
        </>
      )}
      {o.kind === 'redact' && <Field label={t('edit.props.color')}><ColorInput value={o.color} onChange={(v) => update({ color: v })} /></Field>}
      {o.kind === 'image' && <Field label={t('edit.props.opacity')}><Input type="range" min={0.1} max={1} step={0.05} value={o.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} /></Field>}
      <Field label={t('edit.props.rotation')}><Input type="number" min={-180} max={180} value={o.rotation ?? 0} onChange={(e) => update({ rotation: Number(e.target.value) || 0 })} className="numeric h-8" /></Field>
    </aside>
  )
}

function TextProps({ o, update }: { o: TextObject; update: (p: Partial<TextObject>) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('edit.props.font')}>
        <Select value={o.fontFamily} onChange={(e) => update({ fontFamily: e.target.value as TextObject['fontFamily'] })} className="h-8">
          <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
        </Select>
      </Field>
      <Field label={t('edit.props.fontSize')}><Input type="number" min={4} max={200} value={o.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) || 12 })} className="numeric h-8" /></Field>
      <div className="flex gap-1">
        <Toggle on={o.bold} onClick={() => update({ bold: !o.bold })} title="Bold"><Bold className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={o.italic} onClick={() => update({ italic: !o.italic })} title="Italic"><Italic className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={o.underline} onClick={() => update({ underline: !o.underline })} title="Underline"><Underline className="h-3.5 w-3.5" /></Toggle>
        <span className="mx-1 w-px bg-border" />
        <Toggle on={o.align === 'left'} onClick={() => update({ align: 'left' })} title="Left"><AlignLeft className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={o.align === 'center'} onClick={() => update({ align: 'center' })} title="Center"><AlignCenter className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={o.align === 'right'} onClick={() => update({ align: 'right' })} title="Right"><AlignRight className="h-3.5 w-3.5" /></Toggle>
      </div>
      <Field label={t('edit.props.direction')}>
        <Select value={o.direction} onChange={(e) => update({ direction: e.target.value as TextObject['direction'] })} className="h-8">
          <option value="auto">{t('edit.props.auto')}</option><option value="rtl">RTL</option><option value="ltr">LTR</option>
        </Select>
      </Field>
      <Field label={t('edit.props.textColor')}><ColorInput value={o.color} onChange={(v) => update({ color: v })} /></Field>
      <Field label={t('edit.props.background')}>
        <div className="flex items-center gap-2">
          <ColorInput value={o.background ?? '#ffffff'} onChange={(v) => update({ background: v })} />
          <Button size="sm" variant="ghost" onClick={() => update({ background: null })}>{t('common.none')}</Button>
        </div>
      </Field>
    </>
  )
}

function ShapeProps({ o, update }: { o: ShapeObject; update: (p: Partial<ShapeObject>) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('edit.props.stroke')}><ColorInput value={o.stroke} onChange={(v) => update({ stroke: v })} /></Field>
      <Field label={t('edit.props.strokeWidth')}><Input type="number" min={0.5} max={30} step={0.5} value={o.strokeWidth} onChange={(e) => update({ strokeWidth: Number(e.target.value) || 1 })} className="numeric h-8" /></Field>
      {(o.kind === 'rect' || o.kind === 'ellipse') && (
        <Field label={t('edit.props.fill')}>
          <div className="flex items-center gap-2">
            <ColorInput value={o.fill ?? '#ffffff'} onChange={(v) => update({ fill: v })} />
            <Button size="sm" variant="ghost" onClick={() => update({ fill: null })}>{t('common.none')}</Button>
          </div>
        </Field>
      )}
      <Field label={t('edit.props.opacity')}><Input type="range" min={0.1} max={1} step={0.05} value={o.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} /></Field>
    </>
  )
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`flex h-7 w-7 items-center justify-center rounded ${on ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2'}`}>
      {children}
    </button>
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-surface p-0.5" />
      <span className="font-mono text-[11px] text-muted ltr-text">{value}</span>
    </div>
  )
}
