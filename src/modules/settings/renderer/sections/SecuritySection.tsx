/** الأمان: قفل التطبيق برمز PIN (تعيين/تغيير/إزالة) ومدة القفل التلقائي. */
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Dialog, Field, Input, SectionTitle, Select } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { Group, Row, useSaveSettings } from './shared'

export function SecuritySection() {
  const { t } = useTranslation()
  const { settings, load } = useSettings()
  const save = useSaveSettings()
  const [enabled, setEnabled] = useState(false)
  const [dialog, setDialog] = useState<'set' | 'remove' | null>(null)
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => invoke('security:status').then((s) => setEnabled(s.enabled))
  useEffect(() => {
    void refresh()
  }, [])

  const openDialog = (kind: 'set' | 'remove') => {
    setCurrent('')
    setPin('')
    setConfirm('')
    setDialog(kind)
  }

  const submit = async () => {
    setBusy(true)
    try {
      if (dialog === 'set') {
        if (pin !== confirm) {
          notify.warning('settings.security.pinMismatch')
          return
        }
        await invoke('security:set-pin', { pin, currentPin: enabled ? current : undefined })
        notify.success('settings.security.pinSet')
      } else if (dialog === 'remove') {
        await invoke('security:remove-pin', { currentPin: current })
        notify.success('settings.security.pinRemoved')
      }
      setDialog(null)
      await load()
      await refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12)

  return (
    <>
      <SectionTitle hint={t('settings.security.hint')}>{t('settings.sections.security')}</SectionTitle>
      <Group title={t('settings.security.appLock')}>
        <div className="flex flex-wrap items-center gap-3">
          {enabled ? <Badge tone="success">{t('common.enabled')}</Badge> : <Badge>{t('common.disabled')}</Badge>}
          <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => openDialog('set')}>{enabled ? t('settings.security.changePin') : t('settings.security.setPin')}</Button>
          {enabled && <Button variant="danger" icon={<ShieldOff className="h-4 w-4" />} onClick={() => openDialog('remove')}>{t('settings.security.removePin')}</Button>}
        </div>
      </Group>
      <Group>
        <Row label={t('settings.security.autoLock')}>
          <Select value={settings.security.autoLockMinutes} disabled={!enabled} onChange={(e) => void save({ security: { ...settings.security, autoLockMinutes: Number(e.target.value) } }, true)}>
            {[1, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} {t('settings.security.minutes')}</option>)}
            <option value={0}>{t('common.disabled')}</option>
          </Select>
        </Row>
      </Group>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'remove' ? t('settings.security.removePin') : enabled ? t('settings.security.changePin') : t('settings.security.setPin')} width="max-w-sm"
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button variant={dialog === 'remove' ? 'danger' : 'primary'} loading={busy} onClick={() => void submit()}>{t('common.confirm')}</Button></>}>
        <div className="space-y-3">
          {(enabled || dialog === 'remove') && <Field label={t('settings.security.currentPin')}><Input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(digits(e.target.value))} className="ltr-text tracking-widest" autoFocus /></Field>}
          {dialog === 'set' && (
            <>
              <Field label={t('settings.security.newPin')}><Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(digits(e.target.value))} className="ltr-text tracking-widest" autoFocus={!enabled} /></Field>
              <Field label={t('settings.security.confirmPin')}><Input type="password" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} className="ltr-text tracking-widest" /></Field>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
