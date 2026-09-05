/** التخزين: مسارات البيانات والسجل، والبيانات التجريبية (تحميل/حذف). */
import { Database, FolderOpen, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo } from '@shared/entities'
import { Badge, Button, SectionTitle } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { Group, Row } from './shared'

export function StorageSection() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [i, d] = await Promise.all([invoke('app:info'), invoke('demo:status')])
    setInfo(i)
    setDemo(d.loaded)
  }
  useEffect(() => {
    refresh().catch((e) => notify.error(e))
  }, [])

  const loadDemo = async () => {
    setBusy(true)
    try {
      await invoke('demo:load')
      notify.success('toast.demoLoaded')
      await refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }
  const clearDemo = async () => {
    setBusy(true)
    try {
      await invoke('demo:clear')
      notify.success('toast.demoCleared')
      await refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionTitle>{t('settings.sections.storage')}</SectionTitle>
      <Group>
        <Row label={t('settings.storage.dataDir')} hint={info?.dataDir}>
          <Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => info && void invoke('app:open-path', { path: info.dataDir })}>{t('settings.storage.openFolder')}</Button>
        </Row>
        <Row label={t('settings.storage.dbPath')} hint={info?.dbPath}>
          <Button size="sm" icon={<Database className="h-3.5 w-3.5" />} onClick={() => info && void invoke('app:show-in-folder', { path: info.dbPath })}>{t('settings.storage.openFolder')}</Button>
        </Row>
        <Row label={t('settings.storage.logs')} hint={info?.logPath}>
          <Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => info?.logPath && void invoke('app:show-in-folder', { path: info.logPath })}>{t('settings.storage.openFolder')}</Button>
        </Row>
      </Group>
      <Group title={t('settings.storage.demoData')} hint={t('settings.storage.demoHint')}>
        <div className="flex flex-wrap items-center gap-3">
          {demo ? <Badge tone="warning">{t('settings.storage.demoLoaded')}</Badge> : <Badge>{t('settings.storage.demoNotLoaded')}</Badge>}
          <Button loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={() => void loadDemo()}>{t('settings.storage.loadDemo')}</Button>
          <Button variant="danger" disabled={!demo} loading={busy} icon={<Trash2 className="h-4 w-4" />} onClick={() => void clearDemo()}>{t('settings.storage.clearDemo')}</Button>
        </div>
      </Group>
    </>
  )
}
