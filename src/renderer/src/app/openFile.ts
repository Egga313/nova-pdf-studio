/**
 * فتح ملف حسب نوعه: PDF → عارض PDF، XLSX/CSV → الجداول، صورة → خيارات.
 * نقطة واحدة تستخدمها لوحة الأوامر، السحب والإفلات، الملفات الأخيرة، وفتح الملفات من النظام.
 */
import type { RecentFileKind } from '@shared/entities'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useTabs } from '@renderer/stores/tabs'

export function kindOf(path: string): RecentFileKind {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'))
  if (ext === '.pdf') return 'pdf'
  if (['.xlsx', '.xls', '.csv', '.ods'].includes(ext)) return 'spreadsheet'
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif'].includes(ext)) return 'image'
  return 'other'
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export async function openFileByPath(path: string): Promise<void> {
  const stat = await invoke('file:stat', { path })
  if (!stat.exists) {
    notify.warning('toast.fileMissing')
    return
  }
  const kind = kindOf(path)
  await invoke('recent:add', { path, kind }).catch(() => undefined)
  const tabs = useTabs.getState()
  if (kind === 'pdf') {
    tabs.open({ id: `pdf:${path}`, kind: 'pdf', title: baseName(path), params: { path }, icon: 'pdf' })
  } else if (kind === 'spreadsheet') {
    tabs.open({ id: `sheet:${path}`, kind: 'spreadsheet', title: baseName(path), params: { path }, icon: 'sheet' })
  } else if (kind === 'image') {
    tabs.open({ id: `image:${path}`, kind: 'documents', title: baseName(path), params: { path, image: true } })
  } else {
    await invoke('app:open-path', { path })
  }
}

export async function pickAndOpenPdf(): Promise<void> {
  const paths = await invoke('dialog:open-files', { filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: false })
  if (paths[0]) await openFileByPath(paths[0])
}

export async function pickAndOpenSpreadsheet(): Promise<void> {
  const paths = await invoke('dialog:open-files', { filters: [{ name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv'] }], multiple: false })
  if (paths[0]) await openFileByPath(paths[0])
}
