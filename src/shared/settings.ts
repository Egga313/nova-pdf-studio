/** نموذج إعدادات التطبيق وقيمها الافتراضية. تُخزَّن في جدول settings كأزواج مفتاح/JSON. */

export type Language = 'ar' | 'fr' | 'en'
export type ThemeMode = 'light' | 'dark' | 'system'
export type PaperSize = 'A4' | 'A5' | 'Letter'
export type Orientation = 'portrait' | 'landscape'
export type CurrencyPosition = 'before' | 'after'

export const LANGUAGES: { code: Language; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' }
]

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
