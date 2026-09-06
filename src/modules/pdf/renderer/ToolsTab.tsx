/** تبويب أدوات PDF: بطاقات أدوات على اليسار/البداية، ونموذج الأداة المختارة مع تنفيذ وحفظ فعليين عبر pdf-lib. */
import { clsx } from 'clsx'
import {
  ArrowDown, ArrowUp, Copy, FileImage, FilePlus2, FileText, Hash, ImageDown, Layers, ListOrdered, Lock, Minimize2, RotateCw, ScanText,
  Scissors, Stamp, Trash2, Type, X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { baseName, openFileByPath } from '@renderer/app/openFile'
import { Button, Field, Input, Select, SectionTitle } from '@renderer/components/ui'
import { fmtBytes } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useTabs } from '@renderer/stores/tabs'
import { PdfEngine } from './pdfEngine'
import { exportPagesAsImages, exportText } from './printPdf'
import * as tools from '../shared/pdfTools'

type ToolId = 'merge' | 'split' | 'extract' | 'delete' | 'rotate' | 'reorder' | 'blank' | 'insertPdf' | 'images' | 'watermark' | 'numbers' | 'compress' | 'pdfToImages' | 'pdfToText' | 'protect' | 'ocr'

const TOOLS: { id: ToolId; icon: typeof Layers; disabled?: boolean }[] = [
  { id: 'merge', icon: Layers }, { id: 'split', icon: Scissors }, { id: 'extract', icon: Copy }, { id: 'delete', icon: Trash2 },
  { id: 'rotate', icon: RotateCw }, { id: 'reorder', icon: ListOrdered }, { id: 'blank', icon: FilePlus2 }, { id: 'insertPdf', icon: FileText },
  { id: 'images', icon: FileImage }, { id: 'watermark', icon: Stamp }, { id: 'numbers', icon: Hash }, { id: 'compress', icon: Minimize2 },
  { id: 'pdfToImages', icon: ImageDown }, { id: 'pdfToText', icon: Type }, { id: 'protect', icon: Lock, disabled: true }, { id: 'ocr', icon: ScanText, disabled: true }
]

interface Loaded { path: string; bytes: Uint8Array; pages: number }

async function readPdf(path: string): Promise<Loaded> {
  const file = await invoke('file:read', { path })
  return { path, bytes: file.data, pages: await tools.pageCount(file.data) }
}

async function pickPdfs(multiple: boolean): Promise<Loaded[]> {
  const paths = await invoke('dialog:open-files', { filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple })
  const out: Loaded[] = []
  for (const p of paths) out.push(await readPdf(p))
  return out
}

async function saveResult(bytes: Uint8Array, suggested: string): Promise<string | null> {
  const target = await invoke('dialog:save-file', { defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (!target) return null
  await invoke('file:write', { path: target, data: bytes })
  await invoke('recent:add', { path: target, kind: 'pdf' })
  return target
}

function suggest(path: string | undefined, suffix: string): string {
  const base = path ? baseName(path).replace(/\.pdf$/i, '') : 'document'
  return `${base}-${suffix}.pdf`
}

export function ToolsTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const [tool, setTool] = useState<ToolId>((tab.params.tool as ToolId) ?? 'merge')
  useEffect(() => {
    if (tab.params.tool) setTool(tab.params.tool as ToolId)
  }, [tab.params.tool])

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-y-auto border-e border-border p-3">
        <h2 className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('tools.title')}</h2>
        <div className="space-y-0.5">
          {TOOLS.map((item) => (
            <button key={item.id} type="button" className={clsx('nav-item h-9', item.disabled && 'opacity-60')} data-active={tool === item.id} onClick={() => setTool(item.id)}>
              <item.icon className="h-4 w-4" />
              <span className="truncate">{t(`tools.${item.id}.title`)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6 animate-fade-in" key={tool}>
          <SectionTitle hint={t(`tools.${tool}.desc`)}>{t(`tools.${tool}.title`)}</SectionTitle>
          <ToolForm tool={tool} initialPath={tab.params.path as string | undefined} />
        </div>
      </div>
    </div>
  )
}

function ToolForm({ tool, initialPath }: { tool: ToolId; initialPath?: string }) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<Loaded[]>([])
  const [second, setSecond] = useState<Loaded | null>(null)
  const [images, setImages] = useState<{ path: string; data: Uint8Array; mime: 'image/png' | 'image/jpeg' }[]>([])
  const [range, setRange] = useState('')
  const [every, setEvery] = useState('1')
  const [splitMode, setSplitMode] = useState<'every' | 'ranges'>('every')
  const [angle, setAngle] = useState<'90' | '180' | '270'>('90')
  const [text, setText] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState('25')
  const [fontSize, setFontSize] = useState('48')
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center'>('bottom-center')
  const [format, setFormat] = useState('{n} / {total}')
  const [after, setAfter] = useState('1')
  const [paper, setPaper] = useState<'' | tools.PageSizeName>('A4')
  const [dpi, setDpi] = useState('150')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    if (initialPath && tool !== 'merge' && tool !== 'images') readPdf(initialPath).then((f) => setFiles([f])).catch(() => undefined)
  }, [initialPath, tool])

  const primary = files[0]
  const needsSingle = !['merge', 'images', 'protect', 'ocr'].includes(tool)

  const pick = async () => {
    try {
      const picked = await pickPdfs(tool === 'merge')
      if (!picked.length) return
      setFiles(tool === 'merge' ? [...files, ...picked] : [picked[0]])
      setResult(null)
    } catch (e) {
      notify.error(e)
    }
  }

  const pickImages = async () => {
    const paths = await invoke('dialog:open-files', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }], multiple: true })
    const loaded = []
    for (const p of paths) {
      const f = await invoke('file:read', { path: p })
      loaded.push({ path: p, data: f.data, mime: /\.png$/i.test(p) ? ('image/png' as const) : ('image/jpeg' as const) })
    }
    setImages([...images, ...loaded])
  }

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const idx = (text: string, count: number) => tools.parsePageRange(text, count)
      let out: Uint8Array | null = null
      let suffix: string = tool
      switch (tool) {
        case 'merge': out = await tools.merge(files.map((f) => f.bytes)); suffix = 'merged'; break
        case 'extract': out = await tools.extractPages(primary.bytes, idx(range, primary.pages)); break
        case 'delete': out = await tools.deletePages(primary.bytes, idx(range, primary.pages)); break
        case 'rotate': out = await tools.rotatePages(primary.bytes, range.trim() ? idx(range, primary.pages) : 'all', Number(angle) as 90 | 180 | 270); break
        case 'reorder': {
          const order = range.split(/[,\s،]+/).filter(Boolean).map((n) => Number(n) - 1)
          out = await tools.reorderPages(primary.bytes, order)
          break
        }
        case 'blank': out = await tools.insertBlankPage(primary.bytes, Math.max(0, Number(after))); break
        case 'insertPdf': if (!second) return; out = await tools.insertPdf(primary.bytes, second.bytes, Math.max(0, Number(after))); break
        case 'images': out = await tools.imagesToPdf(images.map((i) => ({ data: i.data, mime: i.mime })), paper || undefined); break
        case 'watermark': out = await tools.addWatermark(primary.bytes, { text, opacity: Number(opacity) / 100, fontSize: Number(fontSize) }); break
        case 'numbers': out = await tools.addPageNumbers(primary.bytes, { position, format }); break
        case 'compress': {
          out = await tools.compress(primary.bytes)
          notify.info('tools.compress.result', { before: fmtBytes(primary.bytes.byteLength), after: fmtBytes(out.byteLength) })
          break
        }
        case 'split': {
          const parts = splitMode === 'every'
            ? await tools.split(primary.bytes, { every: Math.max(1, Number(every)) })
            : await tools.split(primary.bytes, { ranges: range.split(';').map((r) => idx(r, primary.pages)) })
          const folder = await invoke('dialog:pick-folder', {})
          if (!folder) return
          const base = baseName(primary.path).replace(/\.pdf$/i, '')
          for (let i = 0; i < parts.length; i++) {
            await invoke('file:write', { path: `${folder}\\${base}-part-${String(i + 1).padStart(2, '0')}.pdf`, data: parts[i] })
          }
          notify.success('tools.savedMany', { count: parts.length })
          setResult(folder)
          return
        }
        case 'pdfToImages': {
          const folder = await invoke('dialog:pick-folder', {})
          if (!folder) return
          const engine = await PdfEngine.load(primary.bytes)
          try {
            const pages = await engine.pageInfos()
            const saved = await exportPagesAsImages(engine, pages, folder, baseName(primary.path).replace(/\.pdf$/i, ''), Number(dpi))
            notify.success('tools.savedMany', { count: saved.length })
            setResult(folder)
          } finally {
            engine.destroy()
          }
          return
        }
        case 'pdfToText': {
          const target = await invoke('dialog:save-file', { defaultPath: baseName(primary.path).replace(/\.pdf$/i, '.txt'), filters: [{ name: 'Text', extensions: ['txt'] }] })
          if (!target) return
          const engine = await PdfEngine.load(primary.bytes)
          try {
            await exportText(engine, await engine.pageInfos(), target)
          } finally {
            engine.destroy()
          }
          notify.success('tools.saved', { name: baseName(target) })
          setResult(target)
          return
        }
        default:
          return
      }
      if (!out) return
      const saved = await saveResult(out, suggest(primary?.path ?? files[0]?.path ?? images[0]?.path, suffix))
      if (saved) {
        notify.success('tools.saved', { name: baseName(saved) })
        setResult(saved)
      }
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  if (tool === 'ocr') {
    const pickForOcr = async () => {
      const paths = await invoke('dialog:open-files', { filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: false })
      if (paths[0]) useTabs.getState().open({ id: `pdf:${paths[0]}`, kind: 'pdf', title: baseName(paths[0]), params: { path: paths[0], ocr: true }, icon: 'pdf' })
    }
    return (
      <div className="card space-y-4 p-6">
        <p className="text-[13px] text-muted">{t('tools.ocr.desc')}</p>
        <p className="text-xs text-muted">{t('ocr.hint')}</p>
        <Button variant="primary" icon={<ScanText className="h-4 w-4" />} onClick={() => void pickForOcr()}>{t('tools.pickFile')}</Button>
      </div>
    )
  }
  if (tool === 'protect') {
    return <div className="card p-6 text-[13px] text-muted">{t('tools.protect.desc')}</div>
  }

  const canRun = tool === 'merge' ? files.length >= 2 : tool === 'images' ? images.length > 0 : !!primary && (tool !== 'insertPdf' || !!second)

  return (
    <div className="space-y-4">
      {/* اختيار الملفات */}
      {tool !== 'images' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void pick()} icon={<FileText className="h-4 w-4" />}>{tool === 'merge' ? t('tools.addFiles') : t('tools.pickFile')}</Button>
            {files.length > 0 && <Button variant="ghost" onClick={() => setFiles([])} icon={<X className="h-4 w-4" />}>{t('tools.clear')}</Button>}
          </div>
          {files.length > 0 && (
            <ul className="mt-3 divide-y divide-border text-[13px]">
              {files.map((f, i) => (
                <li key={f.path + i} className="flex items-center gap-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-danger" />
                  <span className="min-w-0 flex-1 truncate ltr-text">{baseName(f.path)}</span>
                  <span className="text-xs text-muted">{t('pdf.pages', { count: f.pages })} · {fmtBytes(f.bytes.byteLength)}</span>
                  {tool === 'merge' && (
                    <span className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => setFiles(move(files, i, i - 1))} title={t('tools.merge.moveUp')}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === files.length - 1} onClick={() => setFiles(move(files, i, i + 1))} title={t('tools.merge.moveDown')}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" onClick={() => setFiles(files.filter((_, k) => k !== i))} title={t('tools.merge.remove')}><X className="h-3.5 w-3.5" /></Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tool === 'images' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void pickImages()} icon={<FileImage className="h-4 w-4" />}>{t('tools.images.pickImages')}</Button>
            {images.length > 0 && <Button variant="ghost" onClick={() => setImages([])} icon={<X className="h-4 w-4" />}>{t('tools.clear')}</Button>}
          </div>
          {images.length > 0 && <ul className="mt-3 divide-y divide-border text-[13px]">{images.map((img, i) => <li key={img.path + i} className="flex items-center gap-3 py-2"><FileImage className="h-4 w-4 text-success" /><span className="flex-1 truncate ltr-text">{baseName(img.path)}</span><span className="text-xs text-muted">{fmtBytes(img.data.byteLength)}</span></li>)}</ul>}
          <Field label={t('tools.paper')} className="mt-3 max-w-xs">
            <Select value={paper} onChange={(e) => setPaper(e.target.value as '' | tools.PageSizeName)}>
              <option value="">{t('tools.images.keepSize')}</option>
              <option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option>
            </Select>
          </Field>
        </div>
      )}

      {/* معاملات الأداة */}
      {needsSingle && primary && (
        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          {(tool === 'extract' || tool === 'delete' || tool === 'rotate') && (
            <Field label={tool === 'rotate' ? `${t('tools.pagesRange')} (${t('tools.rotate.allPages')})` : t('tools.pagesRange')}><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`1-${primary.pages}`} className="ltr-text" /></Field>
          )}
          {tool === 'rotate' && (
            <Field label={t('tools.angle')}><Select value={angle} onChange={(e) => setAngle(e.target.value as typeof angle)}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></Select></Field>
          )}
          {tool === 'reorder' && (
            <Field label={t('tools.reorder.desc')} className="sm:col-span-2"><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder={Array.from({ length: primary.pages }, (_, i) => i + 1).join(',')} className="ltr-text" /></Field>
          )}
          {tool === 'split' && (
            <>
              <Field label={t('tools.split.byEvery')}><Select value={splitMode} onChange={(e) => setSplitMode(e.target.value as 'every' | 'ranges')}><option value="every">{t('tools.split.byEvery')}</option><option value="ranges">{t('tools.split.byRanges')}</option></Select></Field>
              {splitMode === 'every' ? (
                <Field label={t('tools.every')}><Input type="number" min={1} value={every} onChange={(e) => setEvery(e.target.value)} className="numeric" /></Field>
              ) : (
                <Field label={t('tools.split.byRanges')} hint={t('tools.split.rangesHint')}><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3; 4-6; 7-" className="ltr-text" /></Field>
              )}
            </>
          )}
          {(tool === 'blank' || tool === 'insertPdf') && (
            <Field label={t(`tools.${tool}.after`)}><Input type="number" min={0} max={primary.pages} value={after} onChange={(e) => setAfter(e.target.value)} className="numeric" /></Field>
          )}
          {tool === 'insertPdf' && (
            <Field label={t('tools.insertPdf.second')}>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={async () => { const [f] = await pickPdfs(false); if (f) setSecond(f) }}>{t('tools.pickFile')}</Button>
                {second && <span className="truncate text-xs text-muted ltr-text">{baseName(second.path)} · {t('pdf.pages', { count: second.pages })}</span>}
              </div>
            </Field>
          )}
          {tool === 'watermark' && (
            <>
              <Field label={t('tools.text')}><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <Field label={`${t('tools.opacity')} %`}><Input type="number" min={5} max={100} value={opacity} onChange={(e) => setOpacity(e.target.value)} className="numeric" /></Field>
              <Field label={t('tools.fontSize')}><Input type="number" min={8} max={200} value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="numeric" /></Field>
            </>
          )}
          {tool === 'numbers' && (
            <>
              <Field label={t('tools.position')}>
                <Select value={position} onChange={(e) => setPosition(e.target.value as typeof position)}>
                  <option value="bottom-center">{t('tools.numbers.bottomCenter')}</option><option value="bottom-right">{t('tools.numbers.bottomRight')}</option>
                  <option value="bottom-left">{t('tools.numbers.bottomLeft')}</option><option value="top-center">{t('tools.numbers.topCenter')}</option>
                </Select>
              </Field>
              <Field label={t('tools.format')}><Input value={format} onChange={(e) => setFormat(e.target.value)} className="ltr-text" /></Field>
            </>
          )}
          {tool === 'pdfToImages' && (
            <Field label={t('tools.pdfToImages.scale')}><Select value={dpi} onChange={(e) => setDpi(e.target.value)}><option value="96">96 DPI</option><option value="150">150 DPI</option><option value="200">200 DPI</option><option value="300">300 DPI</option></Select></Field>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" size="lg" disabled={!canRun} loading={busy} onClick={() => void run()}>{t('tools.runAndSave')}</Button>
        {result && <Button variant="ghost" onClick={() => (result.toLowerCase().endsWith('.pdf') ? void openFileByPath(result) : void invoke('app:open-path', { path: result }))}>{t('tools.openResult')}</Button>}
      </div>
    </div>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}
