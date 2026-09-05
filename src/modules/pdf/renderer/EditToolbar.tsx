/** شريط أدوات وضع التعديل: الأدوات، تراجع/إعادة، إدراج صورة/توقيع/ختم، حفظ، حفظ باسم، خروج. */
import { clsx } from 'clsx'
import { CheckSquare, Circle, Eraser, Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Redo2, Save, Square, Stamp, Type, Undo2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import { Button, Kbd } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { canRedo, canUndo, type EditorState, type EditTool, useEditor } from './useEditor'

const TOOLS: { id: EditTool; icon: typeof Type; key: string }[] = [
  { id: 'select', icon: MousePointer2, key: 'select' },
  { id: 'text', icon: Type, key: 'text' },
  { id: 'highlight', icon: Highlighter, key: 'highlight' },
  { id: 'whiteout', icon: Eraser, key: 'whiteout' },
  { id: 'rect', icon: Square, key: 'rect' },
  { id: 'ellipse', icon: Circle, key: 'ellipse' },
  { id: 'line', icon: Minus, key: 'line' },
  { id: 'check', icon: CheckSquare, key: 'check' }
]

async function pickImage(role: 'image' | 'signature' | 'stamp'): Promise<EditorState['pendingImage']> {
  const paths = await invoke('dialog:open-files', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
  if (!paths[0]) return null
  const file = await invoke('file:read', { path: paths[0] })
  const mime = /\.png$/i.test(paths[0]) ? ('image/png' as const) : ('image/jpeg' as const)
  const blob = new Blob([new Uint8Array(file.data).buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = url
  })
  URL.revokeObjectURL(url)
  let binary = ''
  const bytes = file.data
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { dataBase64: btoa(binary), mime, width: dims.width, height: dims.height, role }
}

export function EditToolbar({ store, onSave, onSaveAs, onExit, saving }: { store: StoreApi<EditorState>; onSave: () => void; onSaveAs: () => void; onExit: () => void; saving: boolean }) {
  const { t } = useTranslation()
  const tool = useEditor(store, (s) => s.tool)
  const history = useEditor(store, (s) => s.history)
  const pending = useEditor(store, (s) => s.pendingImage)

  const insert = async (role: 'image' | 'signature' | 'stamp') => {
    try {
      const img = await pickImage(role)
      if (img) store.getState().setPendingImage(img)
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <div className="flex h-11 items-center gap-1 border-b border-accent/30 bg-accent/5 px-2">
      <span className="me-1 rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">{t('edit.mode')}</span>
      {TOOLS.map((item) => (
        <button key={item.id} type="button" title={t(`edit.tools.${item.key}`)} onClick={() => store.getState().setTool(item.id)}
          className={clsx('flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg', tool === item.id && 'bg-accent/15 text-accent')}>
          <item.icon className="h-4 w-4" />
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => void insert('image')} className={clsx(pending?.role === 'image' && 'bg-accent/15 text-accent')}>{t('edit.tools.image')}</Button>
      <Button size="sm" variant="ghost" icon={<PenLine className="h-3.5 w-3.5" />} onClick={() => void insert('signature')} className={clsx(pending?.role === 'signature' && 'bg-accent/15 text-accent')}>{t('edit.tools.signature')}</Button>
      <Button size="sm" variant="ghost" icon={<Stamp className="h-3.5 w-3.5" />} onClick={() => void insert('stamp')} className={clsx(pending?.role === 'stamp' && 'bg-accent/15 text-accent')}>{t('edit.tools.stamp')}</Button>
      {pending && <span className="text-[11px] text-accent">{t('edit.placeHint')}</span>}
      <span className="mx-1 h-5 w-px bg-border" />
      <button type="button" title={`${t('shortcuts.undo')} (Ctrl+Z)`} disabled={!canUndo(history)} onClick={() => store.getState().undo()} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
      <button type="button" title={`${t('shortcuts.redo')} (Ctrl+Y)`} disabled={!canRedo(history)} onClick={() => store.getState().redo()} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
      <span className="ms-2 hidden items-center gap-1 text-[11px] text-muted lg:flex">{t('edit.hint')} <Kbd>Del</Kbd></span>

      <div className="ms-auto flex items-center gap-1">
        <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={onSave}>{t('common.save')}</Button>
        <Button size="sm" variant="ghost" onClick={onSaveAs} disabled={saving}>{t('pdf.saveAs')}</Button>
        <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onExit} disabled={saving}>{t('edit.exit')}</Button>
      </div>
    </div>
  )
}
