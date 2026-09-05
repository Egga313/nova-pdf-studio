/** شاشة القفل: تُظهر حقل PIN وتتحقق منه عبر العملية الرئيسية (المقارنة بالتجزئة هناك). */
import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const submit = async () => {
    if (!pin) return
    setBusy(true)
    try {
      const { ok } = await invoke('security:verify-pin', { pin })
      if (ok) onUnlocked()
      else {
        setError(true)
        setPin('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <form
        className="card w-full max-w-sm p-8 text-center animate-scale-in"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">{t('lock.title')}</h1>
        <p className="mt-1 text-[13px] text-muted">{t('lock.subtitle')}</p>
        <Input
          ref={ref}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''))
            setError(false)
          }}
          placeholder={t('lock.placeholder')}
          className="mt-5 text-center text-lg tracking-[0.4em] ltr-text"
          maxLength={12}
        />
        {error && <p className="mt-2 text-xs text-danger">{t('lock.wrongPin')}</p>}
        <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy}>
          {t('lock.unlock')}
        </Button>
      </form>
    </div>
  )
}
