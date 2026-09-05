/**
 * صفحة واحدة: تُصيَّر فقط عندما تقترب من منطقة العرض (IntersectionObserver)، مع طبقة نص شفافة
 * للتحديد والنسخ، وإبراز نتائج البحث. عند تغيير المقياس تُعاد المحاولة بإلغاء التصيير السابق.
 */
import { clsx } from 'clsx'
import { memo, useEffect, useRef, useState } from 'react'
import type { StoreApi } from 'zustand'
import { EditOverlay } from './EditOverlay'
import type { PageInfo, PdfEngine, SearchHit, TextSpan } from './pdfEngine'
import type { EditorState } from './useEditor'

interface Props {
  engine: PdfEngine
  page: PageInfo
  scale: number
  rotation: number
  hits: SearchHit[]
  activeHit: SearchHit | null
  onVisible: (index: number, ratio: number) => void
  textLayer?: boolean
  editor?: StoreApi<EditorState>
  editing?: boolean
}

export const PdfPage = memo(function PdfPage({ engine, page, scale, rotation, hits, activeHit, onVisible, textLayer = true, editor, editing = false }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [spans, setSpans] = useState<TextSpan[] | null>(null)
  const [failed, setFailed] = useState(false)

  const rotated = ((page.rotation + rotation) % 180) !== 0
  const widthPt = rotated ? page.heightPt : page.widthPt
  const heightPt = rotated ? page.widthPt : page.heightPt
  const width = Math.floor(widthPt * scale)
  const height = Math.floor(heightPt * scale)

  // متابعة الظهور: نصيّر عند الاقتراب (هامش 1.5 شاشة) ونبلّغ نسبة الظهور لتحديد الصفحة الحالية
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const nearObserver = new IntersectionObserver((entries) => setNear(entries[0].isIntersecting), { rootMargin: '150% 0px' })
    const visObserver = new IntersectionObserver((entries) => onVisible(page.index, entries[0].intersectionRatio), { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] })
    nearObserver.observe(el)
    visObserver.observe(el)
    return () => {
      nearObserver.disconnect()
      visObserver.disconnect()
    }
  }, [page.index, onVisible])

  // التصيير
  useEffect(() => {
    if (!near || !canvasRef.current) return
    let cancelled = false
    let cancelRender: (() => void) | null = null
    setFailed(false)
    engine
      .render(page.index, canvasRef.current, scale, rotation)
      .then(({ cancel, done }) => {
        cancelRender = cancel
        return done
      })
      .catch(() => !cancelled && setFailed(true))
    if (textLayer) engine.textSpans(page.index).then((s) => !cancelled && setSpans(s)).catch(() => undefined)
    return () => {
      cancelled = true
      cancelRender?.()
    }
  }, [engine, page.index, scale, rotation, near, textLayer])

  const pageHits = hits.filter((h) => h.page === page.index)

  return (
    <div
      ref={wrapperRef}
      data-page={page.index}
      className="relative mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ width, height }}
    >
      {near ? <canvas ref={canvasRef} className="block" /> : <div className="h-full w-full bg-white" />}
      {failed && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">!</div>}

      {/* طبقة التعديل (فوق طبقة النص) في وضع التعديل فقط، وبلا دوران إضافي حتى تبقى الإحداثيات دقيقة */}
      {editing && editor && rotation === 0 && <EditOverlay store={editor} page={page} scale={scale} spans={spans} />}

      {/* طبقة النص: شفافة لكنها قابلة للتحديد والنسخ. تعمل فقط بلا دوران إضافي حتى تبقى المحاذاة دقيقة */}
      {textLayer && spans && rotation === 0 && (
        <div className={clsx('absolute inset-0 overflow-hidden', editing ? 'pointer-events-none select-none' : 'select-text')} style={{ direction: 'ltr' }} aria-hidden={false}>
          {spans.map((span, i) => {
            const spanHits = pageHits.filter((h) => h.spanIndex === i)
            return (
              <span
                key={i}
                className={clsx('absolute whitespace-pre text-transparent', spanHits.length && 'bg-warning/35 rounded-sm', activeHit?.spanIndex === i && activeHit.page === page.index && 'bg-accent/45')}
                style={{
                  left: span.x * scale,
                  top: span.y * scale,
                  fontSize: Math.max(1, span.fontSize * scale),
                  lineHeight: 1,
                  width: span.width * scale,
                  height: span.height * scale,
                  direction: span.dir,
                  unicodeBidi: 'plaintext',
                  // نمدّ/نضغط النص ليطابق عرض المقطع في الصفحة الأصلية
                  transformOrigin: span.dir === 'rtl' ? 'right top' : 'left top'
                }}
              >
                {span.text}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
})
