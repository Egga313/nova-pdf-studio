/**
 * طبقة التعديل فوق صفحة واحدة: تعرض الكائنات، وتتيح الإنشاء بالسحب، التحديد، التحريك، تغيير الحجم،
 * وتحرير النص في مكانه. النقر على نص أصلي في وضع "النص" ينشئ تغطية بيضاء + نصًا جديدًا بنفس الموضع (تعديل النص الأصلي).
 */
import { clsx } from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreApi } from 'zustand'
import type { EditObject, TextObject } from '../shared/editModel'
import { isRtlText } from '../shared/editModel'
import type { PageInfo, TextSpan } from './pdfEngine'
import { cssFont, resolveDirection } from './rasterizeText'
import { type EditorState, type EditTool, newId, useEditor } from './useEditor'

interface Props {
  store: StoreApi<EditorState>
  page: PageInfo
  scale: number
  spans: TextSpan[] | null
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

/** التقاط المؤشر قد يفشل مع بعض أجهزة الإدخال (قلم/لمس) أو أحداث مصنّعة؛ لا يجب أن يوقف التعديل. */
function capture(el: HTMLElement | null, pointerId: number): void {
  try {
    el?.setPointerCapture(pointerId)
  } catch {
    /* تجاهل: السحب يستمر عبر أحداث الحركة العادية */
  }
}
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN_SIZE = 6

export function EditOverlay({ store, page, scale, spans }: Props) {
  const enabled = useEditor(store, (s) => s.enabled)
  const tool = useEditor(store, (s) => s.tool)
  const objects = useEditor(store, (s) => s.history.present.objects)
  const selectedId = useEditor(store, (s) => s.selectedId)
  const editingTextId = useEditor(store, (s) => s.editingTextId)
  const defaults = useEditor(store, (s) => s.defaults)
  const pendingImage = useEditor(store, (s) => s.pendingImage)
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const drag = useRef<{ kind: 'create' | 'move' | 'resize'; id?: string; handle?: Handle; startX: number; startY: number; orig?: EditObject } | null>(null)

  const pageObjects = objects.filter((o) => o.page === page.index)

  const toPage = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = ref.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
  }, [scale])

  const spanAt = (x: number, y: number): TextSpan | null => {
    if (!spans) return null
    for (let i = spans.length - 1; i >= 0; i--) {
      const s = spans[i]
      if (x >= s.x && x <= s.x + s.width && y >= s.y - 1 && y <= s.y + s.height + 1) return s
    }
    return null
  }

  const createFromDraft = (d: { x: number; y: number; w: number; h: number }, t: EditTool) => {
    const st = store.getState()
    const base = { id: newId(), page: page.index, x: d.x, y: d.y, width: Math.max(MIN_SIZE, d.w), height: Math.max(MIN_SIZE, d.h) }
    let obj: EditObject | null = null
    switch (t) {
      case 'text':
        obj = { ...base, kind: 'text', width: Math.max(80, d.w), height: Math.max(defaults.fontSize * 1.4, d.h), text: '', fontSize: defaults.fontSize, fontFamily: defaults.fontFamily, bold: false, italic: false, underline: false, align: document.dir === 'rtl' ? 'right' : 'left', color: defaults.color, background: null, direction: 'auto' }
        break
      case 'rect': case 'ellipse': case 'check':
        obj = { ...base, kind: t, stroke: defaults.stroke, strokeWidth: defaults.strokeWidth, fill: defaults.fill, opacity: 1 }
        break
      case 'line':
        obj = { ...base, kind: 'line', width: d.w, height: d.h, stroke: defaults.stroke, strokeWidth: defaults.strokeWidth, fill: null, opacity: 1 }
        break
      case 'highlight':
        obj = { ...base, kind: 'highlight', color: defaults.highlightColor, opacity: 0.4 }
        break
      case 'whiteout':
        obj = { ...base, kind: 'redact', color: '#ffffff' }
        break
      case 'image': case 'signature': case 'stamp': {
        if (!pendingImage) return
        const ratio = pendingImage.height / Math.max(1, pendingImage.width)
        const w = Math.max(MIN_SIZE, d.w || 120)
        obj = { ...base, kind: 'image', width: w, height: d.h > MIN_SIZE ? d.h : w * ratio, mime: pendingImage.mime, dataBase64: pendingImage.dataBase64, role: pendingImage.role, opacity: 1 }
        st.setPendingImage(null)
        break
      }
    }
    if (!obj) return
    st.add(obj)
    // بعد إدراج صورة/توقيع/ختم نعود إلى أداة التحديد؛ باقي الأدوات تبقى للاستخدام المتكرر
    if (t === 'image' || t === 'signature' || t === 'stamp') st.setTool('select')
    if (obj.kind === 'text') st.setEditingText(obj.id)
  }

  /** تعديل نص أصلي: تغطية بيضاء بحجم المقطع + كائن نص فوقه بنفس الحجم والنص. */
  const replaceSpan = (span: TextSpan) => {
    const st = store.getState()
    const pad = 1.5
    st.add({ id: newId('wo'), page: page.index, kind: 'redact', x: span.x - pad, y: span.y - pad, width: span.width + pad * 2, height: span.height + pad * 2, color: '#ffffff' }, false)
    const textObj: TextObject = {
      id: newId('t'), page: page.index, kind: 'text', x: span.x, y: span.y, width: Math.max(span.width + 4, 40), height: span.height,
      text: span.text, fontSize: Math.max(4, Math.round(span.fontSize * 0.92 * 10) / 10), fontFamily: 'sans', bold: false, italic: false, underline: false,
      align: span.dir === 'rtl' || isRtlText(span.text) ? 'right' : 'left', color: '#111111', background: null, direction: span.dir === 'rtl' ? 'rtl' : 'auto',
      replaces: { spanText: span.text }
    }
    st.add(textObj)
    st.setTool('select')          // أولًا: setTool يمسح حالة التحرير
    st.setEditingText(textObj.id) // ثم نفتح محرر النص فوق المقطع
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-edit-ui]')) return // النقر داخل محرر نص أو مقبض
    // إلغاء الإجراء الافتراضي يمنع mousedown اللاحق من نقل التركيز إلى body، وإلا فقد محرر النص الذي نفتحه هنا تركيزه فورًا (onBlur → إغلاق)
    e.preventDefault()
    const { x, y } = toPage(e)
    const st = store.getState()
    if (tool === 'select') {
      const hit = [...pageObjects].reverse().find((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height)
      if (hit && !hit.locked) {
        st.select(hit.id)
        drag.current = { kind: 'move', id: hit.id, startX: x, startY: y, orig: hit }
        capture(ref.current, e.pointerId)
      } else {
        st.select(null)
      }
      return
    }
    if (tool === 'text') {
      const span = spanAt(x, y)
      if (span) {
        replaceSpan(span)
        return
      }
    }
    drag.current = { kind: 'create', startX: x, startY: y }
    setDraft({ x, y, w: 0, h: 0 })
    capture(ref.current, e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const { x, y } = toPage(e)
    if (d.kind === 'create') {
      setDraft({ x: Math.min(d.startX, x), y: Math.min(d.startY, y), w: Math.abs(x - d.startX), h: Math.abs(y - d.startY) })
    } else if (d.kind === 'move' && d.id && d.orig) {
      store.getState().update(d.id, { x: d.orig.x + (x - d.startX), y: d.orig.y + (y - d.startY) }, false)
    } else if (d.kind === 'resize' && d.id && d.orig && d.handle) {
      store.getState().update(d.id, resize(d.orig, d.handle, x - d.startX, y - d.startY), false)
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'create') {
      const df = draft
      setDraft(null)
      if (df) {
        // نقرة بلا سحب: حجم افتراضي
        const size = tool === 'text' ? { w: 160, h: defaults.fontSize * 1.5 } : tool === 'check' ? { w: 18, h: 18 } : { w: 120, h: 60 }
        createFromDraft(df.w < 3 && df.h < 3 ? { ...df, ...size } : df, tool)
      }
    } else {
      store.getState().commitTransient()
    }
  }

  const startResize = (e: React.PointerEvent, o: EditObject, handle: Handle) => {
    e.stopPropagation()
    const { x, y } = toPage(e)
    drag.current = { kind: 'resize', id: o.id, handle, startX: x, startY: y, orig: o }
    capture(ref.current, e.pointerId)
  }

  // Delete / Escape داخل الطبقة
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const st = store.getState()
      if (st.editingTextId) return
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId && pageObjects.some((o) => o.id === st.selectedId)) {
        e.preventDefault()
        st.remove([st.selectedId])
      } else if (e.key === 'Escape') {
        st.select(null)
        st.setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, store, pageObjects])

  if (!enabled) return null

  const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-10 select-none"
      style={{ cursor, direction: 'ltr' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* تلميح المقاطع الأصلية القابلة للتعديل في وضع النص */}
      {tool === 'text' && spans?.map((s, i) => (
        <div key={i} className="absolute rounded-sm border border-dashed border-accent/40 hover:bg-accent/10" style={{ left: s.x * scale, top: (s.y - 1) * scale, width: s.width * scale, height: (s.height + 2) * scale }} />
      ))}

      {pageObjects.map((o) => (
        <ObjectView key={o.id} o={o} scale={scale} selected={o.id === selectedId} editing={o.id === editingTextId} store={store} onResizeStart={startResize} />
      ))}

      {draft && (
        <div className="absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: draft.x * scale, top: draft.y * scale, width: draft.w * scale, height: draft.h * scale }} />
      )}
    </div>
  )
}

function resize(o: EditObject, handle: Handle, dx: number, dy: number): Partial<EditObject> {
  let { x, y, width, height } = o
  if (handle.includes('e')) width = Math.max(MIN_SIZE, o.width + dx)
  if (handle.includes('s')) height = Math.max(MIN_SIZE, o.height + dy)
  if (handle.includes('w')) {
    width = Math.max(MIN_SIZE, o.width - dx)
    x = o.x + (o.width - width)
  }
  if (handle.includes('n')) {
    height = Math.max(MIN_SIZE, o.height - dy)
    y = o.y + (o.height - height)
  }
  return { x, y, width, height }
}

function ObjectView({ o, scale, selected, editing, store, onResizeStart }: { o: EditObject; scale: number; selected: boolean; editing: boolean; store: StoreApi<EditorState>; onResizeStart: (e: React.PointerEvent, o: EditObject, h: Handle) => void }) {
  const style: React.CSSProperties = { left: o.x * scale, top: o.y * scale, width: o.width * scale, height: o.height * scale, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined }
  return (
    <div className={clsx('absolute', selected && 'outline outline-2 outline-accent')} style={style} onDoubleClick={() => o.kind === 'text' && store.getState().setEditingText(o.id)}>
      <ObjectBody o={o} scale={scale} editing={editing} store={store} />
      {selected && !editing && HANDLES.map((h) => (
        <span key={h} data-edit-ui onPointerDown={(e) => onResizeStart(e, o, h)} className="absolute h-2.5 w-2.5 rounded-sm border border-accent bg-surface" style={handleStyle(h)} />
      ))}
    </div>
  )
}

function handleStyle(h: Handle): React.CSSProperties {
  const pos: React.CSSProperties = {}
  const off = -5
  if (h.includes('n')) pos.top = off
  if (h.includes('s')) pos.bottom = off
  if (h.includes('w')) pos.left = off
  if (h.includes('e')) pos.right = off
  if (h === 'n' || h === 's') { pos.left = '50%'; pos.marginLeft = -5 }
  if (h === 'e' || h === 'w') { pos.top = '50%'; pos.marginTop = -5 }
  const cursors: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
  pos.cursor = cursors[h]
  return pos
}

function ObjectBody({ o, scale, editing, store }: { o: EditObject; scale: number; editing: boolean; store: StoreApi<EditorState> }) {
  switch (o.kind) {
    case 'redact':
      return <div className="h-full w-full" style={{ background: o.color, boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }} />
    case 'highlight':
      return <div className="h-full w-full" style={{ background: o.color, opacity: o.opacity, mixBlendMode: 'multiply' }} />
    case 'rect':
      return <div className="h-full w-full" style={{ border: `${o.strokeWidth * scale}px solid ${o.stroke}`, background: o.fill ?? 'transparent', opacity: o.opacity }} />
    case 'ellipse':
      return <div className="h-full w-full rounded-full" style={{ border: `${o.strokeWidth * scale}px solid ${o.stroke}`, background: o.fill ?? 'transparent', opacity: o.opacity }} />
    case 'line':
      return (
        <svg className="absolute inset-0 overflow-visible" width={Math.max(1, o.width * scale)} height={Math.max(1, o.height * scale)} style={{ opacity: o.opacity }}>
          <line x1={0} y1={0} x2={o.width * scale} y2={o.height * scale} stroke={o.stroke} strokeWidth={o.strokeWidth * scale} strokeLinecap="round" />
        </svg>
      )
    case 'check':
      return (
        <svg className="h-full w-full" viewBox="0 0 24 24" fill="none" style={{ opacity: o.opacity }}>
          <path d="M4 13l5 5L20 6" stroke={o.stroke} strokeWidth={o.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'image':
      return <img src={`data:${o.mime};base64,${o.dataBase64}`} alt="" className="h-full w-full object-fill" style={{ opacity: o.opacity }} draggable={false} />
    case 'text':
      return <TextBody o={o} scale={scale} editing={editing} store={store} />
  }
}

function TextBody({ o, scale, editing, store }: { o: TextObject; scale: number; editing: boolean; store: StoreApi<EditorState> }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) {
      const focus = () => {
        const el = ref.current
        if (!el || document.activeElement === el) return
        el.focus()
        if (!o.replaces) el.select()
        else el.setSelectionRange(el.value.length, el.value.length)
      }
      focus()
      // إعادة التركيز بعد انتهاء سلسلة أحداث المؤشر التي فتحت المحرر (mousedown/click قد تسحب التركيز)
      const t1 = window.setTimeout(focus, 0)
      const t2 = window.setTimeout(focus, 120)
      return () => {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
      }
    }
    return undefined
  }, [editing, o.replaces])
  const dir = resolveDirection(o)
  const common: React.CSSProperties = {
    font: cssFont(o, scale),
    color: o.color,
    background: o.background ?? 'transparent',
    textAlign: o.align,
    direction: dir,
    lineHeight: 1.25,
    textDecoration: o.underline ? 'underline' : 'none',
    padding: 0,
    margin: 0
  }
  if (editing) {
    return (
      <textarea
        ref={ref}
        data-edit-ui
        value={o.text}
        onChange={(e) => store.getState().update(o.id, { text: e.target.value }, false)}
        onBlur={() => {
          store.getState().commitTransient()
          store.getState().setEditingText(null)
          if (!o.text.trim() && !o.replaces) store.getState().remove([o.id])
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur()
          e.stopPropagation()
        }}
        className="h-full w-full resize-none overflow-hidden border-0 outline outline-2 outline-accent"
        style={{ ...common, background: o.background ?? 'rgba(255,255,255,0.85)' }}
        spellCheck={false}
      />
    )
  }
  return (
    <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words" style={common}>
      {o.text || ' '}
    </div>
  )
}
