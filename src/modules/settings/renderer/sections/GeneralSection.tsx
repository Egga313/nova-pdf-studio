/** عام + المظهر: صيغة التاريخ، نظام الأرقام، التأكيد قبل الحذف، اللغة، المظهر. */
import { clsx } from 'clsx'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, type ThemeMode } from '@shared/settings'
import { SectionTitle, Select, Switch } from '@renderer/components/ui'
import { useSettings } from '@renderer/stores/settings'
import { Group, Row, useSaveSettings } from './shared'

export function GeneralSection({ mode }: { mode: 'general' | 'appearance' }) {
  const { t } = useTranslation()
  const { settings, setLanguage, setTheme } = useSettings()
  const save = useSaveSettings()
  const general = settings.general

  if (mode === 'appearance') {
    const themes: { id: ThemeMode; icon: typeof Sun }[] = [{ id: 'light', icon: Sun }, { id: 'dark', icon: Moon }, { id: 'system', icon: SunMoon }]
    return (
      <>
        <SectionTitle hint={t('settings.appearance.hint')}>{t('settings.sections.appearance')}</SectionTitle>
        <Group title={t('settings.appearance.theme')}>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((th) => (
              <button key={th.id} type="button" onClick={() => void setTheme(th.id)} className={clsx('flex flex-col items-center gap-2 rounded-lg border p-4 transition-all', settings.theme === th.id ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-2')}>
                <th.icon className="h-5 w-5" />
                <span className="text-[13px] font-medium">{t(`theme.${th.id}`)}</span>
              </button>
            ))}
          </div>
        </Group>
        <Group title={t('settings.appearance.language')}>
          <div className="grid grid-cols-3 gap-3">
            {LANGUAGES.map((lang) => (
              <button key={lang.code} type="button" onClick={() => void setLanguage(lang.code)} className={clsx('rounded-lg border p-4 text-center transition-all', settings.language === lang.code ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-2')}>
                <div className="text-[15px] font-semibold">{lang.label}</div>
                <div className="mt-0.5 text-[11px] uppercase text-muted">{lang.code} · {lang.dir}</div>
              </button>
            ))}
          </div>
        </Group>
      </>
    )
  }

  return (
    <>
      <SectionTitle>{t('settings.sections.general')}</SectionTitle>
      <Group>
        <Row label={t('settings.general.dateFormat')}>
          <Select value={general.dateFormat} onChange={(e) => void save({ general: { ...general, dateFormat: e.target.value as typeof general.dateFormat } })}>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </Select>
        </Row>
        <Row label={t('settings.general.numberingSystem')}>
          <Select value={general.numberingSystem} onChange={(e) => void save({ general: { ...general, numberingSystem: e.target.value as 'latn' | 'arab' } })}>
            <option value="latn">{t('settings.general.latn')}</option>
            <option value="arab">{t('settings.general.arab')}</option>
          </Select>
        </Row>
        <Switch label={t('settings.general.confirmDelete')} checked={general.confirmBeforeDelete} onChange={(v) => void save({ general: { ...general, confirmBeforeDelete: v } }, true)} />
        <Switch label={t('settings.general.openLastTabs')} checked={general.openLastTabsOnStart} onChange={(v) => void save({ general: { ...general, openLastTabsOnStart: v } }, true)} />
      </Group>
    </>
  )
}
