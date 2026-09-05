/** النسخ الاحتياطي: إنشاء، استرجاع، تصدير القاعدة، المجلد، النسخ التلقائي، وقائمة النسخ. */
import { Download, FolderOpen, RotateCcw, Save, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, SectionTitle, Switch } from '@renderer/components/ui'
import { fmtBytes, fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { Group, Row, useSaveSettings } from './shared'

export function BackupSection() {
  const { t } = useTranslation()
  const { settings, load } = useSettings()
  const save = useSaveSettings()
  const backup = settings.backup
  const [list, setList] = useState<{ path: string; sizeBytes: number; createdAt: string }[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = () => invoke('backup:list').then(setList).catch(() => setList([]))
  useEffect(() => {
    void refresh()
  }, [backup.folder, backup.lastBackupAt])

  const create = async () => {
    setBusy(true)
    try {
      await invoke('backup:create')
      notify.success('toast.backupCreated')
      await load()
      await refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const restore = async (path?: string) => {
    let file = path
    if (!file) {
      const picked = await invoke('dialog:open-files', { filters: [{ name: 'NOVA Backup', extensions: ['nova-backup', 'sqlite'] }] })
      file = picked[0]
    }
    if (!file) return
    if (!window.confirm(t('settings.backup.confirmRestore'))) return
    setBusy(true)
    try {
      await invoke('backup:restore', { path: file })
      notify.success('toast.backupRestored')
      await load()
      await refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const pickFolder = async () => {
    const folder = await invoke('dialog:pick-folder', {})
    if (folder) await save({ backup: { ...backup, folder } })
  }

  const exportDb = async () => {
    try {
      const path = await invoke('backup:export-db')
      if (path) notify.success('toast.dbExported')
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <>
      <SectionTitle hint={t('settings.backup.hint')}>{t('settings.backup.title')}</SectionTitle>
      <Group>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={busy} icon={<Save className="h-4 w-4" />} onClick={() => void create()}>{t('settings.backup.create')}</Button>
          <Button loading={busy} icon={<Upload className="h-4 w-4" />} onClick={() => void restore()}>{t('settings.backup.restore')}</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => void exportDb()}>{t('settings.backup.export')}</Button>
        </div>
        <p className="mt-3 text-xs text-muted">{t('settings.backup.last')}: {backup.lastBackupAt ? fmtDate(backup.lastBackupAt, true) : t('settings.backup.never')}</p>
      </Group>
      <Group>
        <Switch label={t('settings.backup.auto')} checked={backup.autoBackup} onChange={(v) => void save({ backup: { ...backup, autoBackup: v } }, true)} />
        <Row label={t('settings.backup.folder')} hint={backup.folder ?? t('settings.backup.defaultFolder')}>
          <Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => void pickFolder()}>{t('settings.backup.chooseFolder')}</Button>
        </Row>
        <Row label={t('settings.backup.keep')}>
          <Input type="number" min={1} max={100} value={backup.keepCount} onChange={(e) => void save({ backup: { ...backup, keepCount: Math.max(1, Number(e.target.value) || 1) } }, true)} className="numeric" />
        </Row>
      </Group>
      <Group title={t('settings.backup.list')}>
        {list.length === 0 ? (
          <p className="text-xs text-muted">{t('settings.backup.never')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b) => (
              <li key={b.path} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="flex-1 truncate ltr-text">{b.path.split(/[\\/]/).pop()}</span>
                <span className="text-xs text-muted ltr-text">{fmtDate(b.createdAt, true)} · {fmtBytes(b.sizeBytes)}</span>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void restore(b.path)}>{t('settings.backup.restoreThis')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  )
}
