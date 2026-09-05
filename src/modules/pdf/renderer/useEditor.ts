/** حالة محرّر PDF لكل عارض: الأداة الحالية، طبقة الكائنات مع التاريخ (تراجع/إعادة)، التحديد، وإعدادات الأداة الافتراضية. */
import { createStore, type StoreApi, useStore } from 'zustand'
import {
  addObject, bringToFront, canRedo, canUndo, createHistory, type EditHistory, type EditLayer, type EditObject, moveObject, newId, redo,
  removeObjects, type TextObject, undo, updateObject
} from '../shared/editModel'

export type EditTool = 'select' | 'text' | 'image' | 'rect' | 'ellipse' | 'line' | 'highlight' | 'whiteout' | 'check' | 'signature' | 'stamp'

export interface ToolDefaults {
  fontSize: number
  fontFamily: TextObject['fontFamily']
  color: string
  stroke: string
  fill: string | null
  strokeWidth: number
  highlightColor: string
}

export interface EditorState {
  enabled: boolean
  tool: EditTool
  history: EditHistory
  selectedId: string | null
  editingTextId: string | null
  defaults: ToolDefaults
  pendingImage: { dataBase64: string; mime: 'image/png' | 'image/jpeg'; width: number; height: number; role: 'image' | 'signature' | 'stamp' } | null

  setEnabled: (on: boolean) => void
  setTool: (tool: EditTool) => void
  setDefaults: (patch: Partial<ToolDefaults>) => void
  add: (object: EditObject, select?: boolean) => void
  update: (id: string, patch: Partial<EditObject>, record?: boolean) => void
  move: (id: string, dx: number, dy: number, record?: boolean) => void
  remove: (ids: string[]) => void
  toFront: (id: string) => void
  select: (id: string | null) => void
  setEditingText: (id: string | null) => void
  commitTransient: () => void
  undo: () => void
  redo: () => void
  reset: (layer?: EditLayer) => void
  setPendingImage: (img: EditorState['pendingImage']) => void
  layer: () => EditLayer
  dirty: () => boolean
}

export function createEditorStore(): StoreApi<EditorState> {
  let transientBase: EditLayer | null = null
  return createStore<EditorState>((set, get) => ({
    enabled: false,
    tool: 'select',
    history: createHistory(),
    selectedId: null,
    editingTextId: null,
    defaults: { fontSize: 12, fontFamily: 'sans', color: '#111111', stroke: '#e11d48', fill: null, strokeWidth: 2, highlightColor: '#fde047' },
    pendingImage: null,

    setEnabled: (on) => set({ enabled: on, tool: 'select', selectedId: null, editingTextId: null }),
    setTool: (tool) => set({ tool, selectedId: tool === 'select' ? get().selectedId : null, editingTextId: null }),
    setDefaults: (patch) => set({ defaults: { ...get().defaults, ...patch } }),
    add: (object, select = true) => set({ history: addObject(get().history, object), selectedId: select ? object.id : get().selectedId }),
    update: (id, patch, record = true) => {
      if (!record && !transientBase) transientBase = get().history.present
      set({ history: updateObject(get().history, id, patch, record) })
    },
    move: (id, dx, dy, record = true) => {
      if (!record && !transientBase) transientBase = get().history.present
      set({ history: moveObject(get().history, id, dx, dy, record) })
    },
    remove: (ids) => set({ history: removeObjects(get().history, ids), selectedId: null, editingTextId: null }),
    toFront: (id) => set({ history: bringToFront(get().history, id) }),
    select: (id) => set({ selectedId: id, editingTextId: null }),
    setEditingText: (id) => set({ editingTextId: id, selectedId: id ?? get().selectedId }),
    /** بعد سحب متواصل بلا تسجيل: نسجّل خطوة واحدة في التاريخ من الحالة قبل السحب إلى الحالة الحالية */
    commitTransient: () => {
      if (!transientBase) return
      const base = transientBase
      transientBase = null
      const h = get().history
      if (JSON.stringify(base) === JSON.stringify(h.present)) return
      set({ history: { past: [...h.past.slice(-99), base], present: h.present, future: [] } })
    },
    undo: () => set({ history: undo(get().history), selectedId: null, editingTextId: null }),
    redo: () => set({ history: redo(get().history), selectedId: null, editingTextId: null }),
    reset: (layer) => set({ history: createHistory(layer), selectedId: null, editingTextId: null }),
    setPendingImage: (img) => set({ pendingImage: img, tool: img ? 'image' : get().tool }),
    layer: () => get().history.present,
    dirty: () => get().history.past.length > 0 || get().history.present.objects.length > 0
  }))
}

export function useEditor<T>(store: StoreApi<EditorState>, selector: (s: EditorState) => T): T {
  return useStore(store, selector)
}

export { canRedo, canUndo, newId }
