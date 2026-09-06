/** ملاحظات داخلية + مرفقات + قيم الحقول المخصصة لسجل محفوظ (فاتورة/عميل/منتج). */
import { ExternalLink, Paperclip, Plus, Save, StickyNote, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment, CustomField, Note, OwnerType } from '@shared/extras'
import { Button, Input, Switch, Textarea } from '@renderer/components/ui'
import { fmtBytes, fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'

export function ExtrasPanel({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: number | null }) {
  const { t } = useTranslation()
  const confirmDelete = useSettings((s) => s.settings.general.confirmBeforeDelete)
  const [notes, setNotes] = useState<Note[]>([])
  const [atts, setAtts] = useState<Attachment[]>([])
  const [fields, setFields] = useState<CustomField[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [dirtyValues, setDirtyValues] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!ownerId) return
    try {
      const [n, a, f, v] = await Promise.all([
        invoke('notes:list', { ownerType, ownerId }),
        invoke('attachments:list', { ownerType, ownerId }),
        invoke('custom-fields:list', { entity: ownerType }),
        invoke('custom-fields:values', { entity: ownerType, entityId: ownerId })
      ])
      setNotes(n)
      setAtts(a)
      setFields(f)
      setValues(Object.fromEntries(v.map((x) => [x.fieldId, x.value ?? ''])))
      setDirtyValues(false)
    } catch (e) {
      notify.error(e)
    }
  }, [ownerType, ownerId])
  useEffect(() => {
    void reload()
  }, [reload])

  if (!ownerId) return <p className="mt-3 rounded-md border border-dashed border-border p-3 text-center text-xs text-muted">{t('notes.saveFirst')}</p>

  const addNote = async () => {
    if (!body.trim()) return
    setBusy('note')
    try {
      const n = await invoke('notes:add', { ownerType, ownerId, body })
      setNotes((cur) => [n, ...cur])
      setBody('')
      notify.success('notes.saved')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }
  const deleteNote = async (id: number) => {
    try {
      await invoke('notes:delete', { id })
      setNotes((cur) => cur.filter((n) => n.id !== id))
    } catch (e) {
      notify.error(e)
    }
  }
  const addFiles = async () => {
    setBusy('att')
    try {
      const added = await invoke('attachments:add', { ownerType, ownerId })
      if (added.length) {
        setAtts((cur) => [...added.reverse(), ...cur])
        notify.success('att.added', { count: added.length })
      }
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }
  const removeFile = async (a: Attachment) => {
    if (confirmDelete && !window.confirm(t('att.confirmRemove', { name: a.name }))) return
    try {
      await invoke('attachments:remove', { id: a.id })
      setAtts((cur) => cur.filter((x) => x.id !== a.id))
      notify.success('att.removed')
    } catch (e) {
      notify.error(e)
    }
  }
  const saveValues = async () => {
    setBusy('cf')
    try {
      await invoke('custom-fields:set-values', { entity: ownerType, entityId: ownerId, values: fields.map((f) => ({ fieldId: f.id, value: values[f.id] ?? null })) })
      setDirtyValues(false)
      notify.success('cf.valuesSaved')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }
  const setValue = (id: number, v: string) => {
    setValues((cur) => ({ ...cur, [id]: v }))
    setDirtyValues(true)
  }

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3">
      {fields.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted">{t('cf.values')}</h4>
            {dirtyValues && <Button size="sm" variant="primary" icon={<Save className="h-3 w-3" />} loading={busy === 'cf'} onClick={() => void saveValues()}>{t('common.save')}</Button>}
          </div>
          <div className="space-y-1.5">
            {fields.map((f) => (
              <label key={f.id} className="block text-xs">
                <span className="mb-0.5 block text-muted">{f.label}</span>
                {f.fieldType === 'bool' ? (
                  <Switch checked={values[f.id] === '1'} onChange={(v) => setValue(f.id, v ? '1' : '')} />
                ) : (
                  <Input type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'} value={values[f.id] ?? ''} onChange={(e) => setValue(f.id, e.target.value)} className="h-8 text-xs" dir={f.fieldType === 'text' ? 'auto' : 'ltr'} />
                )}
              </label>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><StickyNote className="h-3.5 w-3.5" />{t('notes.title')} <span>({notes.length})</span></h4>
        <div className="flex gap-1">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('notes.placeholder')} className="min-h-[56px] flex-1 text-xs" dir="auto" onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) void addNote() }} />
          <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" title={t('notes.add')} loading={busy === 'note'} disabled={!body.trim()} onClick={() => void addNote()}><Plus className="h-4 w-4" /></Button>
        </div>
        <ul className="mt-2 space-y-1.5">
          {notes.length === 0 && <li className="text-xs text-muted">{t('notes.empty')}</li>}
          {notes.map((n) => (
            <li key={n.id} className="group rounded-md bg-surface-2/60 p-2 text-xs">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed" dir="auto">{n.body}</p>
                <button type="button" className="shrink-0 text-muted opacity-0 hover:text-danger group-hover:opacity-100" title={t('notes.delete')} onClick={() => void deleteNote(n.id)}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1 text-[10.5px] text-muted ltr-text">{fmtDate(n.createdAt, true)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Paperclip className="h-3.5 w-3.5" />{t('att.title')} <span>({atts.length})</span></h4>
          <Button size="sm" variant="ghost" icon={<Plus className="h-3 w-3" />} loading={busy === 'att'} onClick={() => void addFiles()}>{t('att.add')}</Button>
        </div>
        <ul className="space-y-1">
          {atts.length === 0 && <li className="text-xs text-muted">{t('att.empty')}</li>}
          {atts.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
              <button type="button" className="min-w-0 flex-1 truncate text-start hover:text-accent ltr-text" dir="ltr" title={a.path} onClick={() => void invoke('attachments:open', { id: a.id }).catch((e) => notify.error(e))}>{a.name}</button>
              <span className="shrink-0 text-[10.5px] text-muted ltr-text">{fmtBytes(a.sizeBytes)}</span>
              <button type="button" className="shrink-0 text-muted hover:text-accent" title={t('att.open')} onClick={() => void invoke('attachments:open', { id: a.id }).catch((e) => notify.error(e))}><ExternalLink className="h-3.5 w-3.5" /></button>
              <button type="button" className="shrink-0 text-muted hover:text-danger" title={t('att.remove')} onClick={() => void removeFile(a)}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10.5px] text-muted">{t('att.dropHint')}</p>
      </section>
    </div>
  )
}
