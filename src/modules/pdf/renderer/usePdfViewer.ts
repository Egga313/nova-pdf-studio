/**
 * حالة عارض PDF لكل تبويب (مخزن مستقل يُنشأ لكل مستند): المحرك، الصفحات، التكبير، الدوران، البحث، الشريط الجانبي.
 * لا يُخزَّن أي شيء عالميًا حتى يمكن فتح عدة ملفات في تبويبات متزامنة.
 */
import { createStore, type StoreApi } from 'zustand'
import { useStore } from 'zustand'
import { AppError } from '@shared/errors'
import { invoke } from '@renderer/lib/ipc'
import { type OutlineItem, type PageInfo, PdfEngine, type SearchHit, type TextSpan } from './pdfEngine'

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom'
export type SidebarMode = 'none' | 'thumbnails' | 'bookmarks' | 'search'

export interface ViewerState {
  path: string | null
  fileName: string
  bytes: Uint8Array | null
  engine: PdfEngine | null
  status: 'idle' | 'loading' | 'password' | 'ready' | 'error'
  error: AppError | null
  pages: PageInfo[]
  currentPage: number         // فهرس صفري
  zoomMode: ZoomMode
  scale: number               // بكسل منطقي لكل نقطة
  rotation: 0 | 90 | 180 | 270
  sidebar: SidebarMode
  outline: OutlineItem[]
  metadata: Record<string, string>
  documentId: number | null
  isScanned: boolean
  scannedNoticeDismissed: boolean
  search: { query: string; hits: SearchHit[]; current: number; running: boolean; progress: number }
  dirty: boolean              // تعديلات غير محفوظة (المرحلة 3)
  fullscreen: boolean
  ocrVersion: number          // يزداد بعد كل OCR حتى تعيد الصفحات جلب طبقة النص

  load: (password?: string) => Promise<void>
  loadBytes: (bytes: Uint8Array, name: string, path?: string | null, password?: string) => Promise<void>
  setPage: (index: number) => void
  setZoomMode: (mode: ZoomMode, containerWidth?: number, containerHeight?: number) => void
  setScale: (scale: number) => void
  zoomBy: (factor: number, containerWidth?: number, containerHeight?: number) => void
  rotate: (delta: 90 | -90) => void
  resetRotation: () => void
  setSidebar: (mode: SidebarMode) => void
  runSearch: (query: string) => Promise<void>
  stepSearch: (delta: 1 | -1) => void
  clearSearch: () => void
  dismissScannedNotice: () => void
  bumpOcr: () => void
  setFullscreen: (on: boolean) => void
  destroy: () => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 6
const PAGE_GAP = 16
const CSS_PER_PT = 96 / 72

function fitScale(mode: ZoomMode, page: PageInfo | undefined, rotation: number, width?: number, height?: number, current = 1): number {
  if (!page || !width) return current
  const rotated = rotation % 180 !== 0
  const pw = rotated ? page.heightPt : page.widthPt
  const ph = rotated ? page.widthPt : page.heightPt
  const usableW = Math.max(100, width - 48)
  if (mode === 'fit-width') return usableW / pw
  if (mode === 'fit-page' && height) return Math.min(usableW / pw, Math.max(100, height - PAGE_GAP * 2) / ph)
  return current
}

export function createViewerStore(path: string | null, fileName: string): StoreApi<ViewerState> {
  let searchSignal = { cancelled: false }
  return createStore<ViewerState>((set, get) => ({
    path,
    fileName,
    bytes: null,
    engine: null,
    status: 'idle',
    error: null,
    pages: [],
    currentPage: 0,
    zoomMode: 'fit-width',
    scale: CSS_PER_PT,
    rotation: 0,
    sidebar: 'thumbnails',
    outline: [],
    metadata: {},
    documentId: null,
    isScanned: false,
    scannedNoticeDismissed: false,
    search: { query: '', hits: [], current: -1, running: false, progress: 0 },
    dirty: false,
    fullscreen: false,
    ocrVersion: 0,

    load: async (password) => {
      const { path: filePath } = get()
      if (!filePath) return
      set({ status: 'loading', error: null })
      try {
        const bytes = get().bytes ?? (await invoke('file:read', { path: filePath })).data
        await get().loadBytes(bytes, fileName, filePath, password)
      } catch (error) {
        const appError = AppError.wrap(error)
        set({ status: appError.code === 'PDF_PASSWORD' ? 'password' : 'error', error: appError })
      }
    },

    loadBytes: async (bytes, name, filePath = null, password?: string) => {
      set({ status: 'loading', error: null, bytes, fileName: name, path: filePath })
      try {
        get().engine?.destroy()
        const engine = await PdfEngine.load(bytes, password)
        const pages = await engine.pageInfos()
        const [outline, metadata, scannedFirst] = await Promise.all([engine.outline(), engine.metadata(), engine.isScanned(0)])
        // نفحص أول 3 صفحات فقط لتقدير "ممسوح ضوئيًا" بسرعة
        let isScanned = scannedFirst
        for (let i = 1; i < Math.min(3, pages.length) && isScanned; i++) isScanned = await engine.isScanned(i)
        set({ engine, pages, outline, metadata, isScanned, status: 'ready', currentPage: 0 })
        if (filePath) {
          invoke('documents:register', { path: filePath, title: name, pageCount: pages.length, sizeBytes: bytes.byteLength, isScanned })
            .then(async (doc) => {
              set({ documentId: doc.id })
              // نص OCR محفوظ سابقًا: يُعاد كطبقة نص (بحث/تحديد/نسخ) بلا إعادة تعرف
              if (doc.ocrDone && get().engine === engine) {
                const layouts = await invoke('documents:page-layouts', { documentId: doc.id })
                for (const l of layouts) {
                  try {
                    engine.setOcrSpans(l.pageIndex, JSON.parse(l.layout) as TextSpan[])
                  } catch {
                    /* تخطيط تالف: نتجاهله */
                  }
                }
                if (layouts.length) set((s) => ({ ocrVersion: s.ocrVersion + 1, scannedNoticeDismissed: true }))
              }
            })
            .catch(() => undefined)
        }
      } catch (error) {
        const appError = AppError.wrap(error)
        set({ status: appError.code === 'PDF_PASSWORD' ? 'password' : 'error', error: appError })
      }
    },

    setPage: (index) => {
      const count = get().pages.length
      set({ currentPage: Math.max(0, Math.min(index, count - 1)) })
    },

    setZoomMode: (mode, width, height) => {
      const { pages, currentPage, rotation, scale } = get()
      set({ zoomMode: mode, scale: fitScale(mode, pages[currentPage], rotation, width, height, scale) })
    },

    setScale: (scale) => set({ zoomMode: 'custom', scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) }),

    zoomBy: (factor) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, get().scale * factor))
      set({ zoomMode: 'custom', scale: Number(next.toFixed(3)) })
    },

    rotate: (delta) => {
      const next = (((get().rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270
      set({ rotation: next })
    },

    resetRotation: () => set({ rotation: 0 }),

    setSidebar: (mode) => set({ sidebar: mode }),

    runSearch: async (query) => {
      const { engine } = get()
      searchSignal.cancelled = true
      searchSignal = { cancelled: false }
      const signal = searchSignal
      if (!engine || !query.trim()) {
        set({ search: { query, hits: [], current: -1, running: false, progress: 0 } })
        return
      }
      set({ search: { query, hits: [], current: -1, running: true, progress: 0 } })
      const hits = await engine.search(query, (done, total) => {
        if (!signal.cancelled) set((s) => ({ search: { ...s.search, progress: done / total } }))
      }, signal)
      if (signal.cancelled) return
      set({ search: { query, hits, current: hits.length ? 0 : -1, running: false, progress: 1 } })
      if (hits.length) get().setPage(hits[0].page)
    },

    stepSearch: (delta) => {
      const { search } = get()
      if (!search.hits.length) return
      const current = (search.current + delta + search.hits.length) % search.hits.length
      set({ search: { ...search, current } })
      get().setPage(search.hits[current].page)
    },

    clearSearch: () => {
      searchSignal.cancelled = true
      set({ search: { query: '', hits: [], current: -1, running: false, progress: 0 } })
    },

    dismissScannedNotice: () => set({ scannedNoticeDismissed: true }),
    bumpOcr: () => set((s) => ({ ocrVersion: s.ocrVersion + 1 })),
    setFullscreen: (on) => set({ fullscreen: on }),

    destroy: () => {
      searchSignal.cancelled = true
      get().engine?.destroy()
      set({ engine: null, bytes: null, status: 'idle' })
    }
  }))
}

export function useViewer<T>(store: StoreApi<ViewerState>, selector: (s: ViewerState) => T): T {
  return useStore(store, selector)
}

export { CSS_PER_PT, MAX_SCALE, MIN_SCALE, PAGE_GAP }
