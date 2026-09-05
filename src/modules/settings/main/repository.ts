/**
 * مستودع الإعدادات: الإعدادات العامة في جدول settings (مفتاح/JSON)، وملف المؤسسة في جدول companies.
 * الواجهة تتعامل مع كائن AppSettings واحد؛ التقسيم على جدولين تفصيل داخلي.
 */
import { getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { type AppSettings, type CompanyProfile, DEFAULT_SETTINGS, mergeSettings } from '@shared/settings'

const SETTING_KEYS = ['setupCompleted', 'language', 'theme', 'general', 'invoice', 'printing', 'ocr', 'security', 'backup'] as const
type SettingKey = (typeof SETTING_KEYS)[number]

interface CompanyRow {
  name: string; first_name: string; last_name: string; address: string; city: string; country: string
  phone: string; email: string; website: string; rc: string; nif: string; nis: string; ai: string; tax_id: string
  bank_account: string; iban: string; swift: string; logo_path: string | null; visible_fields: string
}

export function getSettings(): AppSettings {
  const db = getDatabase()
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      try {
        stored[row.key] = JSON.parse(row.value)
      } catch {
        /* قيمة تالفة: نتجاهلها ونستخدم الافتراضي */
      }
    }
  }
  const merged = mergeSettings(stored as Partial<AppSettings>)
  merged.company = readCompany()
  return merged
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDatabase()
  const current = getSettings()
  const next = mergeSettings({ ...current, ...patch, company: current.company })
  if (patch.company) next.company = mergeCompany(current.company, patch.company)

  db.transaction(() => {
    for (const key of SETTING_KEYS) {
      if (!(key in patch)) continue
      db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(next[key as SettingKey])]
      )
    }
    if (patch.company) writeCompany(next.company)
  })
  audit('settings.changed', 'settings', undefined, Object.keys(patch).join(','))
  return next
}

/** قراءة/كتابة قيمة مفتاح داخلي غير معروض للمستخدم (مثل تجزئة PIN). */
export function getInternalValue<T>(key: string): T | null {
  const row = getDatabase().get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function setInternalValue(key: string, value: unknown | null): void {
  const db = getDatabase()
  if (value === null) {
    db.run('DELETE FROM settings WHERE key = ?', [key])
    return
  }
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value)]
  )
}

function readCompany(): CompanyProfile {
  const row = getDatabase().get<CompanyRow>('SELECT * FROM companies WHERE id = 1')
  const defaults = DEFAULT_SETTINGS.company
  if (!row) return structuredClone(defaults)
  let visible: Record<string, boolean> = {}
  try {
    visible = JSON.parse(row.visible_fields || '{}')
  } catch {
    visible = {}
  }
  return {
    name: row.name, firstName: row.first_name, lastName: row.last_name, address: row.address, city: row.city,
    country: row.country, phone: row.phone, email: row.email, website: row.website, rc: row.rc, nif: row.nif,
    nis: row.nis, ai: row.ai, taxId: row.tax_id, bankAccount: row.bank_account, iban: row.iban, swift: row.swift,
    logoPath: row.logo_path,
    visibleFields: { ...defaults.visibleFields, ...visible } as CompanyProfile['visibleFields']
  }
}

function mergeCompany(current: CompanyProfile, patch: Partial<CompanyProfile>): CompanyProfile {
  return {
    ...current,
    ...patch,
    visibleFields: { ...current.visibleFields, ...(patch.visibleFields ?? {}) }
  }
}

function writeCompany(c: CompanyProfile): void {
  getDatabase().run(
    `UPDATE companies SET name=$name, first_name=$firstName, last_name=$lastName, address=$address, city=$city,
       country=$country, phone=$phone, email=$email, website=$website, rc=$rc, nif=$nif, nis=$nis, ai=$ai,
       tax_id=$taxId, bank_account=$bankAccount, iban=$iban, swift=$swift, logo_path=$logoPath,
       visible_fields=$visibleFields, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = 1`,
    {
      name: c.name, firstName: c.firstName, lastName: c.lastName, address: c.address, city: c.city, country: c.country,
      phone: c.phone, email: c.email, website: c.website, rc: c.rc, nif: c.nif, nis: c.nis, ai: c.ai, taxId: c.taxId,
      bankAccount: c.bankAccount, iban: c.iban, swift: c.swift, logoPath: c.logoPath,
      visibleFields: JSON.stringify(c.visibleFields)
    }
  )
}
