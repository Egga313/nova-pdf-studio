/** فتح قاعدة البيانات الوحيدة للتطبيق وتطبيق الترحيلات. */
import { logger } from '@main/logger'
import { runMigrations } from './migrations'
import { SqliteDatabase } from './sqlite'

let instance: SqliteDatabase | null = null

export async function openDatabase(dbPath: string | null, wasmPath?: string): Promise<SqliteDatabase> {
  if (instance) return instance
  const db = await SqliteDatabase.open(dbPath, wasmPath)
  const report = runMigrations(db)
  if (report.applied.length) logger.info('database migrations applied', report)
  await db.flush()
  instance = db
  return db
}

export function getDatabase(): SqliteDatabase {
  if (!instance) throw new Error('database not opened')
  return instance
}

export async function closeDatabase(): Promise<void> {
  if (!instance) return
  await instance.close()
  instance = null
}

/** يستبدل النسخة الحالية (بعد استرجاع نسخة احتياطية) ويعيد تطبيق الترحيلات إن كانت أقدم. */
export function replaceDatabase(bytes: Uint8Array): void {
  const db = getDatabase()
  db.replaceWith(bytes)
  runMigrations(db)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function bool(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}
