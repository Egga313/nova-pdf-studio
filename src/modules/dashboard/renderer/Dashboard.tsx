/** لوحة القيادة: ترحيب، إجراءات سريعة، إحصائيات حقيقية من القاعدة، رسم بياني، المستحقات، المستندات الأخيرة، الأدوات. */
import { clsx } from 'clsx'
import {
  ArrowRight, BookTemplate, Boxes, Clock, FilePlus2, FileText, Files, FolderOpen, Layers, Pin, PinOff, Receipt, ScanLine, Scissors,
  Settings, Table2, Trash2, Users, Wand2, X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DashboardStats, RecentFile } from '@shared/entities'
import { useCommands } from '@renderer/app/commands'
import { baseName, openFileByPath } from '@renderer/app/openFile'
import { Button, Card, EmptyState } from '@renderer/components/ui'
import { fmtBytes, fmtDate, fmtMoney, fmtMonthLabel } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'

export function Dashboard() {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const run = useCommands((s) => s.run)
  const open = useTabs((s) => s.open)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<RecentFile[]>([])

  const reload = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([invoke('dashboard:stats'), invoke('recent:list', { limit: 8 })])
      setStats(s)
      setRecent(r)
    } catch (error) {
      notify.error(error)
    }
  }, [])

  useEffect(() => {
    void reload()
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const quick = [
    { key: 'newInvoice', icon: Receipt, cmd: 'invoice.new', primary: true },
    { key: 'openPdf', icon: FolderOpen, cmd: 'pdf.open' },
    { key: 'newSpreadsheet', icon: Table2, cmd: 'spreadsheet.new' },
    { key: 'scanDocument', icon: ScanLine, cmd: 'tools.scan' },
    { key: 'mergePdfs', icon: Layers, cmd: 'tools.merge' }
  ]

  const tools = [
    { key: 'openPdf', icon: FolderOpen, cmd: 'pdf.open' },
    { key: 'newPdf', icon: FilePlus2, cmd: 'pdf.new' },
    { key: 'newInvoice', icon: Receipt, cmd: 'invoice.new' },
    { key: 'invoices', icon: Files, cmd: 'nav.invoices' },
    { key: 'customers', icon: Users, cmd: 'nav.customers' },
    { key: 'products', icon: Boxes, cmd: 'nav.products' },
    { key: 'spreadsheets', icon: Table2, cmd: 'nav.spreadsheets' },
    { key: 'templates', icon: BookTemplate, cmd: 'nav.templates' },
    { key: 'scanOcr', icon: ScanLine, cmd: 'tools.scan' },
    { key: 'mergePdf', icon: Layers, cmd: 'tools.merge' },
    { key: 'splitPdf', icon: Scissors, cmd: 'tools.split' },
    { key: 'convert', icon: Wand2, cmd: 'tools.convert' },
    { key: 'settings', icon: Settings, cmd: 'nav.settings' }
  ]

  const company = settings.company.name.trim()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] space-y-6 p-6 animate-fade-in">
        {/* ترحيب + إجراءات سريعة */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{company ? t('dashboard.welcomeCompany', { name: company }) : t('dashboard.welcome')}</h1>
            <p className="mt-1 text-[13px] text-muted">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <Button key={q.key} variant={q.primary ? 'primary' : 'outline'} icon={<q.icon className="h-4 w-4" />} onClick={() => void run(q.cmd)}>
                {t(`dashboard.actions.${q.key}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* الإحصائيات */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('dashboard.stats.totalInvoices')} value={stats ? String(stats.totalInvoices) : '—'} sub={stats ? `${t('dashboard.stats.paid')}: ${stats.paidInvoices} · ${t('dashboard.stats.unpaid')}: ${stats.unpaidInvoices}` : undefined} />
          <Stat label={t('dashboard.stats.revenue')} value={stats ? fmtMoney(stats.totalRevenueMinor, stats.currency) : '—'} tone="success" />
          <Stat label={t('dashboard.stats.remaining')} value={stats ? fmtMoney(stats.remainingMinor, stats.currency) : '—'} tone={stats && stats.remainingMinor > 0 ? 'warning' : undefined} />
          <Stat label={t('dashboard.stats.overdue')} value={stats ? String(stats.overdueInvoices) : '—'} tone={stats && stats.overdueInvoices > 0 ? 'danger' : undefined} sub={stats ? `${t('dashboard.stats.customers')}: ${stats.customersCount} · ${t('dashboard.stats.products')}: ${stats.productsCount}` : undefined} />
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          {/* الرسم البياني */}
          <Card title={t('dashboard.chart.title')} className="lg:col-span-3">
            {stats && stats.revenueByMonth.some((m) => m.invoicedMinor || m.paidMinor) ? (
              <RevenueChart data={stats.revenueByMonth} language={settings.language} currency={stats.currency} labels={{ invoiced: t('dashboard.chart.invoiced'), paid: t('dashboard.chart.paid') }} />
            ) : (
              <EmptyState icon={<Receipt className="h-5 w-5" />} title={t('dashboard.chart.empty')} body={t('empty.invoices.body')} action={<Button variant="primary" size="sm" onClick={() => void run('invoice.new')}>{t('empty.invoices.action')}</Button>} />
            )}
          </Card>

          {/* المستحقات */}
          <Card title={t('dashboard.outstanding.title')} className="lg:col-span-2" actions={stats && stats.outstanding.length > 0 ? <Button variant="ghost" size="sm" onClick={() => void run('nav.invoices')} icon={<ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />}>{t('common.all')}</Button> : undefined}>
            {!stats || stats.outstanding.length === 0 ? (
              <EmptyState icon={<Clock className="h-5 w-5" />} title={t('dashboard.outstanding.empty')} />
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {stats.outstanding.slice(0, 6).map((o) => (
                  <li key={o.invoiceId} className="flex items-center gap-3 px-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{o.customerName || '—'}</div>
                      <div className="truncate text-[11.5px] text-muted ltr-text">{o.invoiceNumber} · {fmtDate(o.dueDate)}</div>
                    </div>
                    <div className="text-end">
                      <div className="text-[13px] font-semibold ltr-text">{fmtMoney(o.remainingMinor, o.currency)}</div>
                      <div className={clsx('text-[11px]', o.daysOverdue > 0 ? 'text-danger' : 'text-muted')}>
                        {o.daysOverdue > 0 ? `${o.daysOverdue} ${t('dashboard.outstanding.daysOverdue')}` : t('dashboard.outstanding.onTime')}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          {/* المستندات الأخيرة */}
          <Card title={t('dashboard.recentDocuments')} className="lg:col-span-2" actions={recent.length > 0 ? <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { await invoke('recent:clear'); await reload() }}>{t('recent.clear')}</Button> : undefined}>
            {recent.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title={t('dashboard.noRecent')} body={t('dashboard.noRecentHint')} action={<Button size="sm" onClick={() => void run('pdf.open')} icon={<FolderOpen className="h-4 w-4" />}>{t('dashboard.actions.openPdf')}</Button>} />
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {recent.map((f) => (
                  <li key={f.id} className="group flex items-center gap-3 px-2 py-2">
                    <FileText className={clsx('h-4 w-4 shrink-0', f.kind === 'pdf' ? 'text-danger' : f.kind === 'spreadsheet' ? 'text-success' : 'text-muted')} />
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => void openFileByPath(f.path)}>
                      <div className="truncate text-[13px] font-medium">{baseName(f.path)}</div>
                      <div className="truncate text-[11px] text-muted ltr-text">{fmtDate(f.lastOpenedAt, true)} · {fmtBytes(f.sizeBytes)}</div>
                    </button>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={f.pinned ? t('recent.unpin') : t('recent.pin')} onClick={async () => { await invoke('recent:pin', { id: f.id, pinned: !f.pinned }); await reload() }}>
                        {f.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t('recent.remove')} onClick={async () => { await invoke('recent:remove', { id: f.id }); await reload() }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* الأدوات */}
          <Card title={t('dashboard.tools')} className="lg:col-span-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  onClick={() => void run(tool.cmd)}
                  className="flex flex-col items-center gap-2 rounded-lg border border-transparent px-2 py-3 text-center text-[12px] text-muted transition-all hover:border-border hover:bg-surface-2 hover:text-fg"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><tool.icon className="h-4.5 w-4.5" /></span>
                  <span className="leading-tight">{t(`dashboard.actions.${tool.key}`)}</span>
                </button>
              ))}
            </div>
          </Card>
        </section>

        <p className="pb-2 text-center text-[11px] text-muted/60">{t('app.tagline')}</p>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx('stat-value mt-1 ltr-text', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function RevenueChart({ data, language, currency, labels }: { data: DashboardStats['revenueByMonth']; language: string; currency: string; labels: { invoiced: string; paid: string } }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.invoicedMinor, d.paidMinor)))
  const W = 640
  const H = 180
  const pad = 8
  const colW = (W - pad * 2) / data.length
  return (
    <div className="ltr-text">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-[210px] w-full">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H - H * f + 4} y2={H - H * f + 4} className="stroke-border" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const x = pad + i * colW
          const hi = (d.invoicedMinor / max) * (H - 8)
          const hp = (d.paidMinor / max) * (H - 8)
          return (
            <g key={d.month}>
              <rect x={x + colW * 0.18} y={H + 4 - hi} width={colW * 0.28} height={hi} rx={3} className="fill-accent/35">
                <title>{`${labels.invoiced}: ${fmtMoney(d.invoicedMinor, currency)}`}</title>
              </rect>
              <rect x={x + colW * 0.52} y={H + 4 - hp} width={colW * 0.28} height={hp} rx={3} className="fill-success">
                <title>{`${labels.paid}: ${fmtMoney(d.paidMinor, currency)}`}</title>
              </rect>
              <text x={x + colW / 2} y={H + 20} textAnchor="middle" className="fill-muted text-[10px]">{fmtMonthLabel(d.month, language)}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-center gap-5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent/35" />{labels.invoiced}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" />{labels.paid}</span>
      </div>
    </div>
  )
}
