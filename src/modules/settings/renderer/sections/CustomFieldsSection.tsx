/** إعدادات الحقول المخصصة: تعريف حقول لكل كيان (فاتورة/عميل/منتج/مؤسسة) بنوع وخيار الظهور على الفاتورة. */
import { clsx } from 'clsx'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, type CustomField, type CustomFieldEntity, type CustomFieldType } from '@shared/extras'
import { Button, Field, Input, SectionTitle, Select, Switch } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'

export function CustomFieldsSection() {
  const { t } = useTranslation()
  const [entity, setEntity] = useState<CustomFieldEntity>('invoice')
  const [fields, setFields] = useState<CustomField[]>([])
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setFields(await invoke('custom-fields:list'))
    } catch (e) {
      notify.error(e)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const add = async () => {
    if (!label.trim()) return
    setBusy(true)
    try {
      await invoke('custom-fields:save', { entity, label, fieldType: type, showOnInvoice: show })
      setLabel('')
      setShow(false)
      notify.success('cf.saved')
      await reload()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }
  const toggleShow = async (f: CustomField, v: boolean) => {
    try {
      await invoke('custom-fields:save', { id: f.id, entity: f.entity, label: f.label, fieldType: f.fieldType, showOnInvoice: v })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const remove = async (f: CustomField) => {
    if (!window.confirm(t('cf.confirmDelete', { label: f.label }))) return
    try {
      await invoke('custom-fields:delete', { id: f.id })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const current = fields.filter((f) => f.entity === entity)

  return (
    <div className="space-y-6">
      <SectionTitle hint={t('cf.subtitle')}>{t('cf.title')}</SectionTitle>
      <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2/60 p-1">
        {CUSTOM_FIELD_ENTITIES.map((e) => (
          <button key={e} type="button" onClick={() => setEntity(e)} className={clsx('rounded-md px-3 py-1.5 text-xs', entity === e ? 'bg-surface font-medium text-accent shadow-soft' : 'text-muted hover:text-fg')}>{t(`cf.entities.${e}`)} <span className="text-muted">({fields.filter((f) => f.entity === e).length})</span></button>
        ))}
      </div>
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end">
          <Field label={t('cf.label')}><Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} /></Field>
          <Field label={t('cf.type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>{CUSTOM_FIELD_TYPES.map((x) => <option key={x} value={x}>{t(`cf.types.${x}`)}</option>)}</Select>
          </Field>
          <div className="pb-1"><Switch checked={show} onChange={setShow} label={t('cf.showOnInvoice')} /></div>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} loading={busy} disabled={!label.trim()} onClick={() => void add()}>{t('cf.add')}</Button>
        </div>
      </div>
      <div className="card overflow-hidden">
        {current.length === 0 ? (
          <div className="flex items-center gap-3 p-6 text-sm text-muted"><ListChecks className="h-5 w-5" />{t('cf.empty')}</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2/60 text-[11.5px] text-muted"><tr><th className="px-4 py-2 text-start font-medium">{t('cf.label')}</th><th className="px-3 py-2 text-start font-medium">{t('cf.type')}</th><th className="px-3 py-2 text-start font-medium">{t('cf.showOnInvoice')}</th><th className="w-16 px-2 py-2"></th></tr></thead>
            <tbody className="divide-y divide-border">
              {current.map((f) => (
                <tr key={f.id} className="group hover:bg-surface-2/40">
                  <td className="px-4 py-2.5"><div className="font-medium">{f.label}</div><div className="text-[11px] text-muted ltr-text">{f.key}</div></td>
                  <td className="px-3 py-2.5">{t(`cf.types.${f.fieldType}`)}</td>
                  <td className="px-3 py-2.5"><Switch checked={f.showOnInvoice} onChange={(v) => void toggleShow(f, v)} /></td>
                  <td className="px-2 py-2.5 text-end"><Button size="icon" variant="ghost" className="h-7 w-7 text-danger opacity-0 group-hover:opacity-100" title={t('cf.delete')} onClick={() => void remove(f)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
