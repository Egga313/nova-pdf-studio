/** خطّاف مشترك: يحوّل فاتورة + قالب + لغة إلى HTML جاهز (يحمّل أصول الهوية مرة واحدة). */
import { useEffect, useMemo, useState } from 'react'
import type { Invoice } from '@shared/invoicing'
import type { Language } from '@shared/settings'
import type { TemplateDefinition } from '@shared/templates'
import { fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { currentCurrency, useSettings } from '@renderer/stores/settings'
import { renderInvoiceHtml, type RenderAssets } from '../shared/invoiceHtml'

export function useBrandAssets(): RenderAssets & { reload: () => void } {
  const [assets, setAssets] = useState<RenderAssets>({})
  const [tick, setTick] = useState(0)
  const logoPath = useSettings((s) => s.settings.company.logoPath)
  useEffect(() => {
    invoke('brand:assets').then((a) => setAssets({ logoDataUrl: a.logo, signatureDataUrl: a.signature, stampDataUrl: a.stamp })).catch(() => setAssets({}))
  }, [logoPath, tick])
  return { ...assets, reload: () => setTick((t) => t + 1) }
}

export function useInvoiceHtml(invoice: Invoice | null, template: TemplateDefinition | null, languageOverride?: Language | 'auto'): string {
  const settings = useSettings((s) => s.settings)
  const assets = useBrandAssets()
  return useMemo(() => {
    if (!invoice || !template) return ''
    const language = languageOverride && languageOverride !== 'auto' ? languageOverride : settings.language
    return renderInvoiceHtml({
      invoice, company: settings.company, template, currency: currentCurrency(invoice.currency), language,
      assets: { logoDataUrl: assets.logoDataUrl, signatureDataUrl: assets.signatureDataUrl, stampDataUrl: assets.stampDataUrl },
      dateFormatter: (iso) => fmtDate(iso)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, template, languageOverride, settings.language, settings.company, assets.logoDataUrl, assets.signatureDataUrl, assets.stampDataUrl])
}
