/**
 * محرّك SQLite محلي مبني على sql.js (WASM) بلا أي اعتماديات أصلية تحتاج تجميعًا.
 *
 * قاعدة البيانات تعيش في الذاكرة أثناء التشغيل وتُكتب إلى القرص ذرّيًا (ملف مؤقت ثم استبدال)
 * بعد كل معاملة كتابة (مع تجميع 200 مللي ثانية)، وتُفرَّغ إجباريًا عند الإغلاق.
 * الواجهة العامة ثابتة حتى يمكن استبدال المحرّك بـ better-sqlite3 لاحقًا دون تغيير المستودعات.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js'
import { AppError } from '@shared/errors'

export type Row = Record<string, unknown>
export type Param = string | number | boolean | null | undefined | Uint8Array | Date
export type Params = Param[] | Record<string, Param>

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

const PERSIST_DEBOUNCE_MS = 200

function toSqlValue(value: Param): SqlValue {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.toISOString()
  return value as SqlValue
}

function convertParams(params?: Params): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params === undefined) return undefined
  if (Array.isArray(params)) return params.map(toSqlValue)
  const out: Record<string, SqlValue> = {}
  for (const [key, value] of Object.entries(params)) {
    // sql.js يتوقع أسماء المعاملات بالبادئة ($name)
    out[key.startsWith('$') || key.startsWith(':') || key.startsWith('@') ? key : `$${key}`] = toSqlValue(value)
  }
  return out
}

export class SqliteDatabase {
  private persistTimer: NodeJS.Timeout | null = null
  private dirty = false
  private transactionDepth = 0
  private closed = false
  private persistChain: Promise<void> = Promise.resolve()

  private constructor(
    private db: SqlJsDatabase,
    readonly filePath: string | null,
    private readonly SQL: Awaited<ReturnType<typeof initSqlJs>>
  ) {}

  /** يفتح ملف قاعدة بيانات (أو ينشئه). filePath = null يعطي قاعدة في الذاكرة فقط (للاختبارات). */
  static async open(filePath: string | null, wasmPath?: string): Promise<SqliteDatabase> {
    const SQL = await initSqlJs(wasmPath ? { locateFile: () => wasmPath } : undefined)
    let db: SqlJsDatabase
    if (filePath && fs.existsSync(filePath)) {
      const bytes = await fsp.readFile(filePath)
      db = new SQL.Database(bytes)
    } else {
      db = new SQL.Database()
      if (filePath) await fsp.mkdir(path.dirname(filePath), { recursive: true })
    }
    const instance = new SqliteDatabase(db, filePath, SQL)
    instance.exec('PRAGMA foreign_keys = ON;')
    return instance
  }

  // ------------------------------------------------------------------ استعلامات
  run(sql: string, params?: Params): RunResult {
    this.assertOpen()
    try {
      this.db.run(sql, convertParams(params))
      const changes = this.db.getRowsModified()
      const idRow = this.db.exec('SELECT last_insert_rowid() AS id')
      const lastInsertRowid = Number(idRow[0]?.values[0]?.[0] ?? 0)
      this.markDirty()
      return { changes, lastInsertRowid }
    } catch (error) {
      throw AppError.wrap(error)
    }
  }

  all<T = Row>(sql: string, params?: Params): T[] {
    this.assertOpen()
    const stmt = this.db.prepare(sql)
    try {
      if (params !== undefined) stmt.bind(convertParams(params))
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } catch (error) {
      throw AppError.wrap(error)
    } finally {
      stmt.free()
    }
  }

  get<T = Row>(sql: string, params?: Params): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  /** ينفّذ عدة عبارات مفصولة بفواصل منقوطة (للترحيلات). */
  exec(sql: string): void {
    this.assertOpen()
    try {
      this.db.exec(sql)
      this.markDirty()
    } catch (error) {
      throw AppError.wrap(error)
    }
  }

  /** معاملة متداخلة آمنة: الخارجية فقط تُطلق BEGIN/COMMIT، والفشل يعيد كل شيء. */
  transaction<T>(fn: () => T): T {
    this.assertOpen()
    if (this.transactionDepth > 0) {
      this.transactionDepth++
      try {
        return fn()
      } finally {
        this.transactionDepth--
      }
    }
    this.db.exec('BEGIN')
    this.transactionDepth = 1
    try {
      const result = fn()
      this.db.exec('COMMIT')
      this.transactionDepth = 0
      this.markDirty()
      return result
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* الرجوع فشل أيضًا؛ الخطأ الأصلي أهم */
      }
      this.transactionDepth = 0
      throw AppError.wrap(error)
    }
  }

  // ------------------------------------------------------------------ الحفظ على القرص
  private markDirty(): void {
    if (!this.filePath || this.transactionDepth > 0) {
      this.dirty = this.dirty || !!this.filePath
      if (this.transactionDepth > 0) return
    }
    this.dirty = true
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.flush(), PERSIST_DEBOUNCE_MS)
  }

  /** يكتب القاعدة إلى القرص إن كانت متغيّرة. الكتابة ذرّية عبر ملف مؤقت. */
  flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (!this.filePath || !this.dirty) return this.persistChain
    this.dirty = false
    const target = this.filePath
    const bytes = this.db.export()
    this.persistChain = this.persistChain.then(async () => {
      const temp = `${target}.tmp-${process.pid}`
      try {
        await fsp.writeFile(temp, bytes)
        await fsp.rename(temp, target)
      } catch (error) {
        this.dirty = true // نعيد المحاولة في الكتابة التالية
        await fsp.rm(temp, { force: true }).catch(() => undefined)
        throw AppError.wrap(error)
      }
    })
    return this.persistChain
  }

  exportBytes(): Uint8Array {
    this.assertOpen()
    return this.db.export()
  }

  /** يستبدل المحتوى بالكامل (استرجاع نسخة احتياطية). */
  replaceWith(bytes: Uint8Array): void {
    this.assertOpen()
    this.db.close()
    this.db = new this.SQL.Database(bytes)
    this.exec('PRAGMA foreign_keys = ON;')
    this.dirty = true
    this.markDirty()
  }

  async close(): Promise<void> {
    if (this.closed) return
    await this.flush()
    this.closed = true
    this.db.close()
  }

  private assertOpen(): void {
    if (this.closed) throw new AppError('DB_ERROR', 'errors.DB_CLOSED')
  }
}
