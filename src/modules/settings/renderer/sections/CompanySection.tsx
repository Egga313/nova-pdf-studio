/** ملف المؤسسة: كل الحقول + الشعار + مفاتيح إظهار/إخفاء كل حقل في الفاتورة. */
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { COMPANY_FIELD_KEYS, type CompanyFieldKey, type CompanyProfile } from '@shared/settings'
import { Button, Field, Input, SectionTitle, Switch } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { Group, useSaveSettings } from './shared'

const TEXT_FIELDS: { key: keyof CompanyProfile; ltr?: boolean; wide?: boolean }[] = [
  { key: 'name', wide: true }, { key: 'firstName' }, { key: 'lastName' }, { key: 'address', wide: true }, { key: 'city' }, { key: 'country' },
  { key: 'phone', ltr: true }, { key: 'email', ltr: true }, { key: 'website', ltr: true }, { key: 'rc', ltr: true }, { key: 'nif', ltr: true },
  { key: 'nis', ltr: true }, { key: 'ai', ltr: true }, { key: 'taxId', ltr: true }, { key: 'bankAccount', ltr: true }, { key: 'iban', ltr: true }, { key: 'swift', ltr: true }
]

/** التوقيع والختم: يُخزَّنان في مجلد البيانات ويُدرجان في الفاتورة حسب موضعهما في القالب. */
function BrandAssetsGroup() {
  const { t } = useTranslation()
  const [assets, setAssets] = useState<{ signature: string | null; stamp: string | null }>({ signature: null, stamp: null })
  const reload = () => invoke('brand:assets').then((a) => setAssets({ signature: a.signature, stamp: a.stamp })).catch(() => undefined)
  useEffect(() => {
    void reload()
  }, [])
  const pick = async (kind: 'signature' | 'stamp') => {
    try {
      await invoke('brand:pick', { kind })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const clear = async (kind: 'signature' | 'stamp') => {
    await invoke('brand:clear', { kind })
    await reload()
  }
  const slot = (kind: 'signature' | 'stamp') => (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2/50">
        {assets[kind] ? <img src={assets[kind]!} alt={kind} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted" />}
      </div>
      <div>
        <div className="mb-1 text-[13px] font-medium">{t(`tpl.brand.${kind}`)}</div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void pick(kind)} icon={<ImagePlus className="h-3.5 w-3.5" />}>{t('tpl.brand.pick')}</Button>
          {assets[kind] && <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void clear(kind)}>{t('tpl.brand.remove')}</Button>}
        </div>
      </div>
    </div>
  )
  return (
    <Group title={t('tpl.brand.title')} hint={t('tpl.brand.hint')}>
      <div className="grid gap-4 sm:grid-cols-2">{slot('signature')}{slot('stamp')}</div>
    </Group>
  )
}

export function CompanySection() {
  const { t } = useTranslation()
  const stored = useSettings((s) => s.settings.company)
  const save = useSaveSettings()
  const [form, setForm] = useState<CompanyProfile>(stored)
  const [logo, setLogo] = useState<string | null>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(stored)

  useEffect(() => setForm(stored), [stored])
  useEffect(() => {
    invoke('settings:read-logo').then(setLogo).catch(() => setLogo(null))
  }, [stored.logoPath])

  const set = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => setForm((f) => ({ ...f, [key]: value }))

  const pickLogo = async () => {
    try {
      await invoke('settings:pick-logo')
      await useSettings.getState().load()
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <>
      <SectionTitle hint={t('settings.company.hint')}>{t('settings.sections.company')}</SectionTitle>
      <Group title={t('settings.company.logo')}>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2/50">
            {logo ? <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted" />}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void pickLogo()} icon={<ImagePlus className="h-4 w-4" />}>{t('settings.company.pickLogo')}</Button>
            {stored.logoPath && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void save({ company: { ...stored, logoPath: null } })}>{t('settings.company.removeLogo')}</Button>}
          </div>
        </div>
      </Group>
      <Group>
        <div className="grid grid-cols-2 gap-3">
          {TEXT_FIELDS.map((f) => (
            <Field key={f.key} label={t(`settings.company.${f.key}`)} className={f.wide ? 'col-span-2' : ''}>
              <Input value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value as never)} className={f.ltr ? 'ltr-text' : ''} />
            </Field>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setForm(stored)}>{t('common.reset')}</Button>
          <Button variant="primary" disabled={!dirty} onClick={() => void save({ company: form })}>{t('common.save')}</Button>
        </div>
      </Group>
      <BrandAssetsGroup />
      <Group title={t('settings.company.visibleFields')}>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {COMPANY_FIELD_KEYS.map((key: CompanyFieldKey) => (
            <Switch key={key} label={t(`settings.company.${key}`)} checked={stored.visibleFields[key]} onChange={(v) => void save({ company: { ...stored, visibleFields: { ...stored.visibleFields, [key]: v } } }, true)} />
          ))}
        </div>
      </Group>
    </>
  )
}
