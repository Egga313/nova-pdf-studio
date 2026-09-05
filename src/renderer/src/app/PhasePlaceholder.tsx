/** عنصر نائب صريح للوحدات التي تُبنى في مراحل لاحقة (لا أزرار وهمية: يُصرَّح بالمرحلة). */
import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@renderer/components/ui'
import type { Tab } from '@renderer/stores/tabs'

export function PhasePlaceholder({ tab, phase }: { tab: Tab; phase: number }) {
  const { t } = useTranslation()
  const title = tab.title.startsWith('t:') ? t(tab.title.slice(2)) : tab.title
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={<Construction className="h-6 w-6" />} title={`${title} — ${t('empty.phase.title')}`} body={t('empty.phase.body', { phase })} />
    </div>
  )
}
