/** الطباعة (حجم الورق، الاتجاه، الهوامش، المقياس، النسخ) وOCR (اللغات، الاقتراح التلقائي). */
import { useTranslation } from 'react-i18next'
import type { Orientation, PaperSize } from '@shared/settings'
import { Input, SectionTitle, Select, Switch } from '@renderer/components/ui'
import { useSettings } from '@renderer/stores/settings'
import { Group, Row, useSaveSettings } from './shared'

const OCR_LANGS = ['ara', 'fra', 'eng'] as const

export function PrintingOcrSection({ mode }: { mode: 'printing' | 'ocr' }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const save = useSaveSettings()

  if (mode === 'ocr') {
    const ocr = settings.ocr
    const toggle = (code: string, on: boolean) => {
      const next = on ? [...new Set([...ocr.languages, code])] : ocr.languages.filter((l) => l !== code)
      if (next.length === 0) return
      void save({ ocr: { ...ocr, languages: next } }, true)
    }
    return (
      <>
        <SectionTitle>{t('settings.sections.ocr')}</SectionTitle>
        <Group title={t('settings.ocr.languages')}>
          {OCR_LANGS.map((code) => (
            <Switch key={code} label={t(`settings.ocr.${code}`)} checked={ocr.languages.includes(code)} onChange={(v) => toggle(code, v)} />
          ))}
        </Group>
        <Group>
          <Switch label={t('settings.ocr.autoPrompt')} checked={ocr.autoPrompt} onChange={(v) => void save({ ocr: { ...ocr, autoPrompt: v } }, true)} />
        </Group>
      </>
    )
  }

  const p = settings.printing
  return (
    <>
      <SectionTitle>{t('settings.sections.printing')}</SectionTitle>
      <Group>
        <Row label={t('settings.printing.paperSize')}>
          <Select value={p.paperSize} onChange={(e) => void save({ printing: { ...p, paperSize: e.target.value as PaperSize } }, true)}>
            <option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option>
          </Select>
        </Row>
        <Row label={t('settings.printing.orientation')}>
          <Select value={p.orientation} onChange={(e) => void save({ printing: { ...p, orientation: e.target.value as Orientation } }, true)}>
            <option value="portrait">{t('settings.printing.portrait')}</option><option value="landscape">{t('settings.printing.landscape')}</option>
          </Select>
        </Row>
        <Row label={t('settings.printing.margins')}><Input type="number" min={0} max={50} value={p.marginsMm} onChange={(e) => void save({ printing: { ...p, marginsMm: Number(e.target.value) || 0 } }, true)} className="numeric" /></Row>
        <Row label={t('settings.printing.scale')}><Input type="number" min={25} max={200} value={p.scalePercent} onChange={(e) => void save({ printing: { ...p, scalePercent: Number(e.target.value) || 100 } }, true)} className="numeric" /></Row>
        <Row label={t('settings.printing.copies')}><Input type="number" min={1} max={99} value={p.copies} onChange={(e) => void save({ printing: { ...p, copies: Math.max(1, Number(e.target.value) || 1) } }, true)} className="numeric" /></Row>
      </Group>
    </>
  )
}
