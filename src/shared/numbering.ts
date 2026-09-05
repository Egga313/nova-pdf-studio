/**
 * ترقيم المستندات وفق نمط قابل للتخصيص، مثل: INV-{YYYY}-{SEQ:5} → INV-2026-00001
 *
 * الرموز المدعومة:
 *   {YYYY} السنة بأربعة أرقام   {YY} السنة برقمين   {MM} الشهر   {DD} اليوم
 *   {SEQ} أو {SEQ:n} العدّاد التسلسلي بحشو أصفار إلى n خانة
 *   {PREFIX} بادئة اختيارية من الإعدادات
 */

export interface NumberingContext {
  date: Date
  sequence: number
  prefix?: string
}

const TOKEN_RE = /\{(YYYY|YY|MM|DD|SEQ(?::(\d{1,3}))?|PREFIX)\}/g

export function formatDocumentNumber(pattern: string, ctx: NumberingContext): string {
  const year = ctx.date.getFullYear()
  const month = String(ctx.date.getMonth() + 1).padStart(2, '0')
  const day = String(ctx.date.getDate()).padStart(2, '0')
  return pattern.replace(TOKEN_RE, (_match, token: string, width?: string) => {
    if (token === 'YYYY') return String(year)
    if (token === 'YY') return String(year % 100).padStart(2, '0')
    if (token === 'MM') return month
    if (token === 'DD') return day
    if (token === 'PREFIX') return ctx.prefix ?? ''
    // SEQ
    const pad = width ? Number(width) : 1
    return String(ctx.sequence).padStart(pad, '0')
  })
}

/** مفتاح التسلسل: يُعاد العدّاد إلى 1 عند تغيّر السنة إذا كان النمط يتضمن السنة. */
export function sequenceScope(pattern: string, date: Date): string {
  const parts: string[] = []
  if (/\{YYYY\}|\{YY\}/.test(pattern)) parts.push(String(date.getFullYear()))
  if (/\{MM\}/.test(pattern)) parts.push(String(date.getMonth() + 1).padStart(2, '0'))
  return parts.join('-') || 'global'
}

export function validatePattern(pattern: string): { ok: true } | { ok: false; reason: 'empty' | 'missing_seq' | 'unknown_token' } {
  if (!pattern.trim()) return { ok: false, reason: 'empty' }
  if (!/\{SEQ(?::\d{1,3})?\}/.test(pattern)) return { ok: false, reason: 'missing_seq' }
  const unknown = pattern.replace(TOKEN_RE, '').match(/\{[^}]*\}/)
  if (unknown) return { ok: false, reason: 'unknown_token' }
  return { ok: true }
}
