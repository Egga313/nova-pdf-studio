/** نموذج إعدادات التطبيق وقيمها الافتراضية. تُخزَّن في جدول settings كأزواج مفتاح/JSON. */

export type Language = 'ar' | 'fr' | 'en' | 'zh' | 'tr' | 'es' | 'de' | 'pt' | 'ru' | 'hi' | 'id' | 'ja' | 'it' | 'fa'
export type ThemeMode = 'light' | 'dark' | 'system'
export type PaperSize = 'A4' | 'A5' | 'Letter'
export type Orientation = 'portrait' | 'landscape'
export type CurrencyPosition = 'before' | 'after'

/** اللغات المضمّنة. لإضافة لغة: ملف JSON في translations/locales + سطر هنا + تسجيل في i18n.ts. */
export const LANGUAGES: { code: Language; label: string; dir: 'rtl' | 'ltr'; intl: string }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl', intl: 'ar-DZ' },
  { code: 'fr', label: 'Français', dir: 'ltr', intl: 'fr-FR' },
  { code: 'en', label: 'English', dir: 'ltr', intl: 'en-GB' },
  { code: 'es', label: 'Español', dir: 'ltr', intl: 'es-ES' },
  { code: 'de', label: 'Deutsch', dir: 'ltr', intl: 'de-DE' },
  { code: 'it', label: 'Italiano', dir: 'ltr', intl: 'it-IT' },
  { code: 'pt', label: 'Português', dir: 'ltr', intl: 'pt-BR' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr', intl: 'tr-TR' },
  { code: 'ru', label: 'Русский', dir: 'ltr', intl: 'ru-RU' },
  { code: 'zh', label: '中文', dir: 'ltr', intl: 'zh-CN' },
  { code: 'ja', label: '日本語', dir: 'ltr', intl: 'ja-JP' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr', intl: 'hi-IN' },
  { code: 'id', label: 'Bahasa Indonesia', dir: 'ltr', intl: 'id-ID' },
  { code: 'fa', label: 'فارسی', dir: 'rtl', intl: 'fa-IR' }
]

export function languageDirection(language: Language): 'rtl' | 'ltr' {
  return LANGUAGES.find((l) => l.code === language)?.dir ?? 'ltr'
}

/** الإعداد المحلي لـ Intl حسب اللغة (الأرقام تُجبر لاتينية عند الحاجة في مواضع الاستخدام). */
export function intlLocaleOf(language: Language): string {
  return LANGUAGES.find((l) => l.code === language)?.intl ?? 'en-GB'
}

/** الحقول القابلة للإظهار/الإخفاء في ترويسة الفاتورة */
export const COMPANY_FIELD_KEYS = [
  'name', 'ownerName', 'address', 'phone', 'email', 'website',
  'rc', 'nif', 'nis', 'ai', 'taxId', 'bankAccount', 'iban', 'swift', 'logo'
] as const
export type CompanyFieldKey = (typeof COMPANY_FIELD_KEYS)[number]

export interface CompanyProfile {
  name: string
  firstName: string
  lastName: string
  address: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  rc: string          // رقم السجل التجاري
  nif: string
  nis: string
  ai: string          // Article d'imposition
  taxId: string
  bankAccount: string
  iban: string
  swift: string
  logoPath: string | null
  visibleFields: Record<CompanyFieldKey, boolean>
}

export interface InvoiceSettings {
  numberPattern: string          // مثل INV-{YYYY}-{SEQ:5}
  quotePattern: string
  proformaPattern: string
  receiptPattern: string
  defaultCurrency: string        // رمز ISO مثل DZD
  currencyPosition: CurrencyPosition
  defaultTaxId: number | null
  defaultDueDays: number
  amountInWords: boolean
  defaultNotes: string
  defaultPaymentTerms: string
  showLogo: boolean
}

export interface PrintingSettings {
  paperSize: PaperSize
  orientation: Orientation
  marginsMm: number
  scalePercent: number
  copies: number
}

export interface OcrSettings {
  languages: string[]            // أكواد tesseract: ara, fra, eng
  autoPrompt: boolean
}

export interface SecuritySettings {
  appLockEnabled: boolean
  autoLockMinutes: number
}

export interface BackupSettings {
  autoBackup: boolean
  folder: string | null
  keepCount: number
  lastBackupAt: string | null
}

export interface GeneralSettings {
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  numberingSystem: 'latn' | 'arab'
  confirmBeforeDelete: boolean
  openLastTabsOnStart: boolean
}

export interface AppSettings {
  setupCompleted: boolean
  language: Language
  theme: ThemeMode
  general: GeneralSettings
  company: CompanyProfile
  invoice: InvoiceSettings
  printing: PrintingSettings
  ocr: OcrSettings
  security: SecuritySettings
  backup: BackupSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  setupCompleted: false,
  language: 'ar',
  theme: 'system',
  general: {
    dateFormat: 'DD/MM/YYYY',
    numberingSystem: 'latn',
    confirmBeforeDelete: true,
    openLastTabsOnStart: true
  },
  company: {
    name: '',
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    rc: '',
    nif: '',
    nis: '',
    ai: '',
    taxId: '',
    bankAccount: '',
    iban: '',
    swift: '',
    logoPath: null,
    visibleFields: {
      name: true, ownerName: false, address: true, phone: true, email: true, website: false,
      rc: true, nif: true, nis: true, ai: true, taxId: false, bankAccount: false, iban: false, swift: false, logo: true
    }
  },
  invoice: {
    numberPattern: 'INV-{YYYY}-{SEQ:5}',
    quotePattern: 'QUO-{YYYY}-{SEQ:5}',
    proformaPattern: 'PRO-{YYYY}-{SEQ:5}',
    receiptPattern: 'REC-{YYYY}-{SEQ:5}',
    defaultCurrency: 'DZD',
    currencyPosition: 'after',
    defaultTaxId: null,
    defaultDueDays: 30,
    amountInWords: true,
    defaultNotes: '',
    defaultPaymentTerms: '',
    showLogo: true
  },
  printing: { paperSize: 'A4', orientation: 'portrait', marginsMm: 12, scalePercent: 100, copies: 1 },
  ocr: { languages: ['ara', 'fra', 'eng'], autoPrompt: true },
  security: { appLockEnabled: false, autoLockMinutes: 10 },
  backup: { autoBackup: true, folder: null, keepCount: 10, lastBackupAt: null }
}

/** دمج عميق للإعدادات المخزّنة فوق الافتراضية حتى لا تنكسر النسخ القديمة عند إضافة حقول. */
export function mergeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  const out: AppSettings = structuredClone(DEFAULT_SETTINGS)
  if (!stored) return out
  for (const key of Object.keys(stored) as (keyof AppSettings)[]) {
    const value = stored[key]
    if (value === undefined) continue
    const current = out[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      ;(out as unknown as Record<string, unknown>)[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      ;(out as unknown as Record<string, unknown>)[key] = value
    }
  }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k] as Record<string, unknown>, v) : v
  }
  return out
}
