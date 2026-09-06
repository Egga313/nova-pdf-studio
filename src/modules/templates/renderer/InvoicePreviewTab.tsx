/**
 * معاينة الفاتورة: HTML حيّ داخل iframe بنفس محرك الطباعة، اختيار القالب واللغة، طباعة، تصدير PDF (يُحفظ مساره في الفاتورة)،
 * وقائمة "مشاركة / إرسال" جاهزة لقنوات لاحقة (بريد/واتساب/سحابة) دون تغيير البنية.
 */
import { ChevronDown, Copy, FileDown, FolderOpen, Printer, RefreshCw, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Invoice } from '@shared/invoicing'
import type { Language } from '@shared/settings'
import type { InvoiceTemplate } from '@shared/templates'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Button, Select, Spinner } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { suggestedFileName } from '../shared/invoiceHtml'
import { useInvoiceHtml } from './useInvoiceRender'

export function InvoicePreviewTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const id = tab.params.id as number
  const action = tab.params.action as 'print' | 'export' | undefined
  const { setTitle, updateParams } = useTabs()
  const settings = useSettings((s) => s.settings)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [language, setLanguage] = useState<Language | 'auto'>('auto')
  const [busy, setBusy] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const load = useCallback(async () => {
    try {
      const [inv, list] = await Promise.all([invoke('invoices:get', { id }), invoke('templates:list', { kind: 'layout' })])
      setInvoice(inv)
      setTemplates(list)
      setTemplateId((current) => current ?? inv?.templateId ?? list.find((x) => x.isDefault)?.id ?? list[0]?.id ?? null)
      if (inv) setTitle(tab.id, `${inv.number} · ${t('tpl.preview.title')}`)
    } catch (e) {
      notify.error(e)
    }
  }, [id, tab.id, setTitle, t])

  useEffect(() => {
    void load()
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void load()
    })
    return unsub
  }, [load, tab.id])

  const template = templates.find((x) => x.id === templateId) ?? null
  const html = useInvoiceHtml(invoice, template?.definition ?? null, language)

  const buildJob = () => {
    const page = template!.definition.page
    return { html, paperSize: page.size, landscape: page.orientation === 'landscape', marginsMm: 0 }
  }

  const exportPdf = useCallback(async (silentPath?: string) => {
    if (!invoice || !template) return null
    setBusy('export')
    try {
      const info = await invoke('app:info')
      const defaultPath = silentPath ?? `${info.dataDir}\\documents\\${suggestedFileName(invoice)}`
      const target = silentPath ? silentPath : await invoke('dialog:save-file', { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!target) return null
      const res = await invoke('print:html-to-pdf', { ...buildJob(), outputPath: target })
      await invoke('invoices:set-pdf-path', { id: invoice.id, pdfPath: res.path })
      await invoke('documents:register', { path: res.path, title: suggestedFileName(invoice), kind: 'generated', pageCount: 1, sizeBytes: res.sizeBytes })
      setInvoice({ ...invoice, pdfPath: res.path })
      notify.success('tpl.preview.exported', { name: suggestedFileName(invoice) })
      return res.path
    } catch (e) {
      notify.error(e)
      return null
    } finally {
      setBusy(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, template, html])

  const print = useCallback(async () => {
    if (!invoice || !template) return
    setBusy('print')
    try {
      const res = await invoke('print:html', { ...buildJob(), title: invoice.number, copies: settings.printing.copies })
      if (res.success) notify.success('tpl.preview.printed')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, template, html, settings.printing.copies])

  // Ctrl+P / أمر الطباعة العام عندما يكون هذا التبويب نشطًا
  useEffect(() => {
    const onPrint = () => {
      if (useTabs.getState().activeId === tab.id) void print()
    }
    window.addEventListener('nova:print', onPrint)
    return () => window.removeEventListener('nova:print', onPrint)
  }, [print, tab.id])

  // إجراء مطلوب عند الفتح (من محرّر الفاتورة)
  useEffect(() => {
    if (!action || !html || !template) return
    updateParams(tab.id, { action: undefined })
    if (action === 'print') void print()
    if (action === 'export') void exportPdf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, html, template])

  useEffect(() => {
    if (!shareOpen) return
    const close = () => setShareOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [shareOpen])

  if (!invoice) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-border bg-surface px-3">
        <span className="text-[13px] font-semibold ltr-text">{invoice.number}</span>
        <Select value={templateId ?? ''} onChange={(e) => setTemplateId(Number(e.target.value))} className="w-52 h-8">
          {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.isDefault ? ` · ${t('tpl.default')}` : ''}</option>)}
        </Select>
        <Select value={language} onChange={(e) => setLanguage(e.target.value as Language | 'auto')} className="w-36 h-8" title={t('tpl.preview.language')}>
          <option value="auto">{t('tpl.preview.auto')}</option><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option>
        </Select>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>{t('tpl.preview.regenerate')}</Button>
        <div className="ms-auto flex items-center gap-1">
          <Button size="sm" variant="primary" icon={<Printer className="h-3.5 w-3.5" />} loading={busy === 'print'} onClick={() => void print()}>{t('tpl.preview.print')}</Button>
          <Button size="sm" variant="outline" icon={<FileDown className="h-3.5 w-3.5" />} loading={busy === 'export'} onClick={() => void exportPdf()}>{t('tpl.preview.exportPdf')}</Button>
          <div className="relative">
            <Button size="sm" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} onClick={(e) => { e.stopPropagation(); setShareOpen((v) => !v) }}>{t('tpl.preview.share')}<ChevronDown className="h-3 w-3" /></Button>
            {shareOpen && (
              <ul className="card absolute end-0 top-full z-30 mt-1 min-w-[220px] py-1 text-[13px] shadow-pop animate-scale-in" onClick={(e) => e.stopPropagation()}>
                <ShareItem icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => { setShareOpen(false); void exportPdf() }}>{t('tpl.preview.exportPdf')}</ShareItem>
                <ShareItem icon={<FolderOpen className="h-3.5 w-3.5" />} disabled={!invoice.pdfPath} onClick={() => invoice.pdfPath && void invoke('app:show-in-folder', { path: invoice.pdfPath })}>{t('tpl.preview.openFolder')}</ShareItem>
                <ShareItem icon={<Copy className="h-3.5 w-3.5" />} disabled={!invoice.pdfPath} onClick={async () => { if (invoice.pdfPath) { await navigator.clipboard.writeText(invoice.pdfPath); notify.success('toast.copied') } }}>{t('tpl.preview.copyFile')}</ShareItem>
                <li className="my-1 border-t border-border" />
                <ShareItem disabled onClick={() => undefined}>{t('tpl.preview.email')}</ShareItem>
                <ShareItem disabled onClick={() => undefined}>{t('tpl.preview.whatsapp')}</ShareItem>
                <ShareItem disabled onClick={() => undefined}>{t('tpl.preview.cloud')}</ShareItem>
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface-2/60 p-6">
        <div className="mx-auto shadow-pop" style={{ width: `${template ? pageWidthMm(template) : 210}mm`, maxWidth: '100%' }}>
          <iframe ref={frameRef} title="preview" srcDoc={html} sandbox="" className="block w-full bg-white" style={{ height: `${template ? pageHeightMm(template) : 297}mm`, border: 0 }} />
        </div>
      </div>
    </div>
  )
}

function pageWidthMm(t: InvoiceTemplate): number {
  const base = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] }[t.definition.page.size]
  return t.definition.page.orientation === 'landscape' ? base[1] : base[0]
}
function pageHeightMm(t: InvoiceTemplate): number {
  const base = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] }[t.definition.page.size]
  return t.definition.page.orientation === 'landscape' ? base[0] : base[1]
}

function ShareItem({ children, onClick, icon, disabled }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent">{icon}{children}</button>
    </li>
  )
}
