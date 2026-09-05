/** تبويب المستندات: قائمة كل ملفات PDF المسجّلة مع بحث، فتح، إزالة، وإنشاء مستند PDF جديد فارغ. */
import { FilePlus2, FileText, FolderOpen, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocumentRecord } from '@shared/documents'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { baseName, openFileByPath, pickAndOpenPdf } from '@renderer/app/openFile'
import { Badge, Button, Dialog, EmptyState, Field, Input, Select } from '@renderer/components/ui'
import { fmtBytes, fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { createBlank, type PageSizeName } from '../shared/pdfTools'

export function DocumentsTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [query, setQuery] = useState('')
  const [newOpen, setNewOpen] = useState(!!tab.params.new)
  const updateParams = useTabs((s) => s.updateParams)

  const reload = useCallback(async () => {
    try {
      setDocs(await invoke('documents:list', { limit: 300, query }))
    } catch (e) {
      notify.error(e)
    }
  }, [query])

  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    if (tab.params.new) {
      setNewOpen(true)
      updateParams(tab.id, { new: false })
    }
  }, [tab.params.new, tab.id, updateParams])
  useEffect(() => {
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const remove = async (id: number) => {
    await invoke('documents:remove', { id })
    await reload()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 animate-fade-in">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('documents.title')}</h1>
            <p className="text-[13px] text-muted">{t('documents.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void pickAndOpenPdf().then(reload)}>{t('documents.openFile')}</Button>
            <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setNewOpen(true)}>{t('documents.newPdf')}</Button>
          </div>
        </div>

        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('documents.search')} className="ps-9" />
        </div>

        {docs.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FileText className="h-6 w-6" />} title={t('documents.empty.title')} body={t('documents.empty.body')} action={<Button variant="primary" onClick={() => void pickAndOpenPdf().then(reload)}>{t('documents.empty.action')}</Button>} />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('documents.columns.title')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('documents.columns.pages')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('documents.columns.size')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('documents.columns.status')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('documents.columns.opened')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((d) => (
                  <tr key={d.id} className="group hover:bg-surface-2/40">
                    <td className="px-4 py-2.5">
                      <button type="button" className="flex items-center gap-2 text-start font-medium hover:text-accent" onClick={() => d.path && void openFileByPath(d.path)}>
                        <FileText className="h-4 w-4 shrink-0 text-danger" />
                        <span className="truncate">{d.title}</span>
                      </button>
                      {d.path && <div className="truncate ps-6 text-[11px] text-muted ltr-text">{d.path}</div>}
                    </td>
                    <td className="px-3 py-2.5 ltr-text">{d.pageCount}</td>
                    <td className="px-3 py-2.5 ltr-text">{fmtBytes(d.sizeBytes)}</td>
                    <td className="px-3 py-2.5">
                      {d.isScanned ? (d.ocrDone ? <Badge tone="success">{t('documents.ocrDone')}</Badge> : <Badge tone="warning">{t('documents.scanned')}</Badge>) : <Badge>{t('documents.text')}</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-muted ltr-text">{fmtDate(d.updatedAt, true)}</td>
                    <td className="px-3 py-2.5 text-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-danger opacity-0 group-hover:opacity-100" title={t('documents.remove')} onClick={() => void remove(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <NewPdfDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
    </div>
  )
}

export function NewPdfDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { t } = useTranslation()
  const printing = useSettings((s) => s.settings.printing)
  const [paper, setPaper] = useState<PageSizeName>(printing.paperSize)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(printing.orientation)
  const [pages, setPages] = useState('1')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const bytes = await createBlank(paper, orientation, Math.max(1, Number(pages) || 1))
      const target = await invoke('dialog:save-file', { title: t('documents.new.saveWhere'), defaultPath: 'new-document.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!target) return
      await invoke('file:write', { path: target, data: bytes })
      await invoke('documents:register', { path: target, title: baseName(target), kind: 'generated', pageCount: Number(pages) || 1, sizeBytes: bytes.byteLength })
      onClose()
      onCreated?.()
      await openFileByPath(target)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('documents.new.title')} width="max-w-sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void create()}>{t('documents.new.create')}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('documents.new.paper')}>
          <Select value={paper} onChange={(e) => setPaper(e.target.value as PageSizeName)}><option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option></Select>
        </Field>
        <Field label={t('documents.new.orientation')}>
          <Select value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}><option value="portrait">{t('settings.printing.portrait')}</option><option value="landscape">{t('settings.printing.landscape')}</option></Select>
        </Field>
        <Field label={t('documents.new.pages')}><Input type="number" min={1} max={500} value={pages} onChange={(e) => setPages(e.target.value)} className="numeric" /></Field>
      </div>
    </Dialog>
  )
}
