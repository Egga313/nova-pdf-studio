/** حوار الاختصارات: يُبنى تلقائيًا من سجل الأوامر حتى يبقى مطابقًا للواقع. */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, Kbd } from '@renderer/components/ui'
import { displayShortcut, useCommands } from './commands'

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const all = useCommands((s) => s.commands)
  // المحدِّد يجب أن يعيد مرجعًا مستقرًا؛ الاشتقاق يتم خارجه
  const commands = useMemo(() => [...all.values()].filter((c) => c.shortcut), [all])
  return (
    <Dialog open={open} onClose={onClose} title={t('shortcuts.title')} width="max-w-md">
      <ul className="divide-y divide-border">
        {commands.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-[13px]">
            <span>{t(c.titleKey, c.titleParams)}</span>
            <span className="flex gap-1">
              {displayShortcut(c.shortcut!).split('+').map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
