/** حول البرنامج: الإصدار، المنصة، المسارات، سجل المطوّر. */
import { FolderOpen, LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo } from '@shared/entities'
import { Button, SectionTitle } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { Group, Row } from './shared'

export function AboutSection() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    invoke('app:info').then(setInfo).catch(() => setInfo(null))
  }, [])
  return (
    <>
      <SectionTitle>{t('settings.sections.about')}</SectionTitle>
      <Group>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 text-accent-fg shadow-soft"><LayoutGrid className="h-7 w-7" /></div>
          <div>
            <h3 className="text-base font-semibold">{t('app.name')}</h3>
            <p className="text-xs text-muted">{t('app.tagline')}</p>
            <p className="mt-2 text-[13px]">{t('settings.about.description')}</p>
            <p className="mt-1 text-[12px] text-success">{t('settings.about.localFirst')}</p>
          </div>
        </div>
      </Group>
      <Group>
        <Row label={t('common.version')}><span className="text-[13px] ltr-text">{info?.version ?? '—'}</span></Row>
        <Row label={t('settings.about.platform')}><span className="text-[13px] ltr-text">{info?.platform ?? '—'} · Electron</span></Row>
        <Row label={t('settings.about.dataDir')} hint={info?.dataDir}><Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => info && void invoke('app:open-path', { path: info.dataDir })}>{t('settings.storage.openFolder')}</Button></Row>
        <Row label={t('settings.about.logs')} hint={info?.logPath}><Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => info?.logPath && void invoke('app:show-in-folder', { path: info.logPath })}>{t('settings.storage.openFolder')}</Button></Row>
      </Group>
    </>
  )
}
