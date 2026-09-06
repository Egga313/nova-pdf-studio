/** تبويب الإعدادات: قائمة أقسام على جهة البداية ومحتوى القسم المختار. */
import { clsx } from 'clsx'
import {
  Building2, Coins, Database, FileText, Globe2, HardDrive, Info, Palette, Percent, Printer, ScanText, Settings2, ShieldCheck
, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { AboutSection } from './sections/AboutSection'
import { BackupSection } from './sections/BackupSection'
import { CompanySection } from './sections/CompanySection'
import { CustomFieldsSection } from './sections/CustomFieldsSection'
import { CurrenciesSection } from './sections/CurrenciesSection'
import { GeneralSection } from './sections/GeneralSection'
import { InvoiceSection } from './sections/InvoiceSection'
import { PrintingOcrSection } from './sections/PrintingOcrSection'
import { SecuritySection } from './sections/SecuritySection'
import { StorageSection } from './sections/StorageSection'
import { TaxesSection } from './sections/TaxesSection'

export type SettingsSection = 'general' | 'company' | 'invoice' | 'tax' | 'currencies' | 'appearance' | 'printing' | 'ocr' | 'storage' | 'backup' | 'security' | 'fields' | 'about'

const SECTIONS: { id: SettingsSection; icon: typeof Info }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'appearance', icon: Palette },
  { id: 'company', icon: Building2 },
  { id: 'invoice', icon: FileText },
  { id: 'tax', icon: Percent },
  { id: 'currencies', icon: Coins },
  { id: 'printing', icon: Printer },
  { id: 'ocr', icon: ScanText },
  { id: 'storage', icon: HardDrive },
  { id: 'backup', icon: Database },
  { id: 'security', icon: ShieldCheck },
  { id: 'fields', icon: ListChecks },
  { id: 'about', icon: Info }
]

export function SettingsTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<SettingsSection>((tab.params.section as SettingsSection) ?? 'general')
  useEffect(() => {
    if (tab.params.section) setSection(tab.params.section as SettingsSection)
  }, [tab.params.section])

  return (
    <div className="flex h-full">
      <nav className="w-56 shrink-0 overflow-y-auto border-e border-border p-3">
        <h2 className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('settings.title')}</h2>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={clsx('nav-item h-8')} data-active={section === s.id} onClick={() => setSection(s.id)}>
            <s.icon className="h-4 w-4" />
            <span className="truncate">{t(`settings.sections.${s.id}`)}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6 animate-fade-in" key={section}>
          {section === 'general' && <GeneralSection mode="general" />}
          {section === 'appearance' && <GeneralSection mode="appearance" />}
          {section === 'company' && <CompanySection />}
          {section === 'invoice' && <InvoiceSection />}
          {section === 'tax' && <TaxesSection />}
          {section === 'currencies' && <CurrenciesSection />}
          {section === 'printing' && <PrintingOcrSection mode="printing" />}
          {section === 'ocr' && <PrintingOcrSection mode="ocr" />}
          {section === 'storage' && <StorageSection />}
          {section === 'backup' && <BackupSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'fields' && <CustomFieldsSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

export { Globe2 }
