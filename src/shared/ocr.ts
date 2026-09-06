/** أنواع OCR المشتركة: الطلب يحمل صورة PNG للصفحة، والنتيجة نص + أسطر وكلمات بإحداثيات بكسل الصورة. */
export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
}

export interface OcrLine {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  confidence: number
  words: OcrWord[]
}

export interface OcrResult {
  text: string
  confidence: number
  lines: OcrLine[]
  widthPx: number
  heightPx: number
  durationMs: number
  languages: string[]
}

export interface OcrRequest {
  jobId: string
  png: Uint8Array
  languages: string[]
  widthPx: number
  heightPx: number
}

export interface OcrProgress {
  jobId: string
  status: string
  progress: number // 0..1
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'ara', label: 'العربية' },
  { code: 'fra', label: 'Français' },
  { code: 'eng', label: 'English' }
]

/** الدقة المستخدمة لتصيير الصفحة قبل OCR (بكسل/بوصة). 200 توازن بين الدقة والسرعة. */
export const OCR_DPI = 200
