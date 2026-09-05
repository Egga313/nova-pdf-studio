/**
 * أخطاء التطبيق الموحّدة.
 * كل خطأ يحمل رمزًا ومفتاح ترجمة، فتعرض الواجهة رسالة مفهومة بلغة المستخدم
 * وتُسجَّل التفاصيل التقنية في سجل المطوّر فقط.
 */
export type AppErrorCode =
  | 'UNKNOWN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DB_ERROR'
  | 'DISK_FULL'
  | 'FILE_NOT_FOUND'
  | 'FILE_ACCESS'
  | 'PDF_CORRUPTED'
  | 'PDF_PASSWORD'
  | 'PDF_UNSUPPORTED'
  | 'EXCEL_UNSUPPORTED'
  | 'OCR_FAILED'
  | 'PRINTER_OFFLINE'
  | 'LOCKED'
  | 'CANCELLED'

export interface SerializedAppError {
  __appError: true
  code: AppErrorCode
  messageKey: string
  params?: Record<string, string | number>
  details?: string
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly messageKey: string
  readonly params?: Record<string, string | number>
  readonly details?: string

  constructor(code: AppErrorCode, messageKey?: string, params?: Record<string, string | number>, details?: string) {
    super(messageKey ?? `errors.${code}`)
    this.name = 'AppError'
    this.code = code
    this.messageKey = messageKey ?? `errors.${code}`
    this.params = params
    this.details = details
  }

  serialize(): SerializedAppError {
    return { __appError: true, code: this.code, messageKey: this.messageKey, params: this.params, details: this.details }
  }

  static isSerialized(value: unknown): value is SerializedAppError {
    return typeof value === 'object' && value !== null && (value as SerializedAppError).__appError === true
  }

  static fromSerialized(value: SerializedAppError): AppError {
    return new AppError(value.code, value.messageKey, value.params, value.details)
  }

  /** يحوّل أي استثناء (Node/SQLite/غير معروف) إلى AppError برسالة مفهومة. */
  static wrap(error: unknown): AppError {
    if (error instanceof AppError) return error
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    if (lower.includes('enospc')) return new AppError('DISK_FULL', undefined, undefined, message)
    if (lower.includes('enoent')) return new AppError('FILE_NOT_FOUND', undefined, undefined, message)
    if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('ebusy')) {
      return new AppError('FILE_ACCESS', undefined, undefined, message)
    }
    if (lower.includes('sqlite') || lower.includes('constraint') || lower.includes('no such table')) {
      return new AppError('DB_ERROR', undefined, undefined, message)
    }
    return new AppError('UNKNOWN', undefined, undefined, message)
  }
}
