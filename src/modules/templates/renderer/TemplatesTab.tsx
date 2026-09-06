/** تبويب القوالب: بطاقات بمعاينة مصغّرة حيّة، تكرار/تعديل/حذف/افتراضي، وإعادة القوالب المضمّنة. */
import { clsx } from 'clsx'
import { BookTemplate, Copy, Pencil, Plus, RotateCcw, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { InvoiceTemplate } from '@shared/templates'
import { BUILTIN_TEMPLATES, normalizeDefinition } from '@shared/templates'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, EmptyState } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { sampleInvoice } from './sampleInvoice'
import { useInvoiceHtml } from './useInvoiceRender'

export function TemplatesTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const open = useTabs((s) => s.open)
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const reload = useCallback(async () => {
    try {
      setTemplates(await invoke('templates:list', { kind: 'layout' }))
    } catch (e) {
      notify.error(e)
    }
  }, [])
  useEffect(() => {
    void reload()
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
    return unsub
  }, [reload, tab.id])

  const act = async (tp: InvoiceTemplate, action: 'duplicate' | 'delete' | 'default') => {
    try {
      if (action === 'duplicate') {
        const copy = await invoke('templates:duplicate', { id: tp.id })
        notify.success('tpl.duplicated')
        open({ id: `template-${copy.id}`, kind: 'template-designer', title: copy.name, params: { id: copy.id } })
      } else if (action === 'delete') {
        if (!window.confirm(t('tpl.confirmDelete', { name: tp.name }))) return
        await invoke('templates:delete', { id: tp.id })
        notify.success('tpl.deleted')
      } else await invoke('templates:set-default', { id: tp.id })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }

  const createNew = async () => {
    try {
      const created = await invoke('templates:save', { name: t('tpl.new'), definition: normalizeDefinition(BUILTIN_TEMPLATES[0].definition) })
      await reload()
      open({ id: `template-${created.id}`, kind: 'template-designer', title: created.name, params: { id: created.id } })
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6 animate-fade-in">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('tpl.title')}</h1>
            <p className="text-[13px] text-muted">{t('tpl.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => { await invoke('templates:reset-builtin'); await reload() }}>{t('tpl.resetBuiltin')}</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => void createNew()}>{t('tpl.new')}</Button>
          </div>
        </div>
        {templates.length === 0 ? (
          <div className="card"><EmptyState icon={<BookTemplate className="h-6 w-6" />} title={t('empty.generic.title')} /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tp) => <TemplateCard key={tp.id} template={tp} onAct={(a) => void act(tp, a)} onEdit={() => open({ id: `template-${tp.id}`, kind: 'template-designer', title: tp.name, params: { id: tp.id } })} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateCard({ template: tp, onAct, onEdit }: { template: InvoiceTemplate; onAct: (a: 'duplicate' | 'delete' | 'default') => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const lang = tp.definition.language === 'auto' ? settings.language : tp.definition.language
  const invoice = useMemo(() => sampleInvoice(lang, settings.invoice.defaultCurrency), [lang, settings.invoice.defaultCurrency])
  const html = useInvoiceHtml(invoice, tp.definition, lang)
  return (
    <div className={clsx('card group overflow-hidden transition-shadow hover:shadow-pop', tp.isDefault && 'ring-2 ring-accent')}>
      <button type="button" onClick={onEdit} className="relative block h-64 w-full overflow-hidden bg-surface-2/60">
        <iframe title={tp.name} srcDoc={html} sandbox="" className="pointer-events-none absolute start-0 top-0 origin-top-left bg-white" style={{ width: '210mm', height: '297mm', transform: 'scale(0.36)', transformOrigin: document.dir === 'rtl' ? 'top right' : 'top left', border: 0 }} />
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{tp.name}</div>
          <div className="mt-0.5 flex gap-1">
            {tp.isDefault && <Badge tone="accent">{t('tpl.default')}</Badge>}
            <Badge>{tp.isBuiltin ? t('tpl.builtin') : t('tpl.custom')}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!tp.isDefault && <Button size="icon" variant="ghost" className="h-7 w-7" title={t('tpl.setDefault')} onClick={() => onAct('default')}><Star className="h-3.5 w-3.5" /></Button>}
          <Button size="icon" variant="ghost" className="h-7 w-7" title={t('tpl.edit')} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title={t('tpl.duplicate')} onClick={() => onAct('duplicate')}><Copy className="h-3.5 w-3.5" /></Button>
          {!tp.isBuiltin && <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" title={t('tpl.delete')} onClick={() => onAct('delete')}><Trash2 className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>
    </div>
  )
}
