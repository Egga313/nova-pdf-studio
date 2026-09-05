/**
 * سجل المطوّر: يكتب إلى ملف نصي دوّار في مجلد بيانات التطبيق وإلى الطرفية أثناء التطوير.
 * لا يُعرض شيء من هذا للمستخدم العادي؛ الواجهة تحصل على رسائل مترجمة عبر AppError.
 */
import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 2 * 1024 * 1024
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

class Logger {
  private filePath: string | null = null
  private minLevel: LogLevel = 'info'

  init(logDir: string, minLevel: LogLevel = 'info'): void {
    fs.mkdirSync(logDir, { recursive: true })
    this.filePath = path.join(logDir, 'nova.log')
    this.minLevel = minLevel
    this.rotateIfNeeded()
  }

  get path(): string | null {
    return this.filePath
  }

  debug(message: string, details?: unknown): void {
    this.write('debug', message, details)
  }
  info(message: string, details?: unknown): void {
    this.write('info', message, details)
  }
  warn(message: string, details?: unknown): void {
    this.write('warn', message, details)
  }
  error(message: string, details?: unknown): void {
    this.write('error', message, details)
  }

  private write(level: LogLevel, message: string, details?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return
    const line = `${new Date().toISOString()} [${level.toUpperCase().padEnd(5)}] ${message}${formatDetails(details)}\n`
    if (level === 'error' || level === 'warn') process.stderr.write(line)
    else if (process.env.NODE_ENV !== 'production') process.stdout.write(line)
    if (this.filePath) {
      try {
        fs.appendFileSync(this.filePath, line, 'utf8')
      } catch {
        /* القرص ممتلئ أو الملف مقفل: لا نُسقط التطبيق بسبب السجل */
      }
    }
  }

  private rotateIfNeeded(): void {
    if (!this.filePath) return
    try {
      const stat = fs.statSync(this.filePath)
      if (stat.size > MAX_LOG_BYTES) fs.renameSync(this.filePath, `${this.filePath}.1`)
    } catch {
      /* لا يوجد ملف بعد */
    }
  }
}

function formatDetails(details: unknown): string {
  if (details === undefined) return ''
  if (details instanceof Error) return ` | ${details.name}: ${details.message}${details.stack ? `\n${details.stack}` : ''}`
  try {
    return ` | ${typeof details === 'string' ? details : JSON.stringify(details)}`
  } catch {
    return ` | ${String(details)}`
  }
}

export const logger = new Logger()
