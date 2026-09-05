/** مسارات التطبيق: مجلد البيانات، قاعدة البيانات، السجلات، النسخ الاحتياطية، ملفات WASM. */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppPaths {
  dataDir: string
  dbPath: string
  logDir: string
  backupDir: string
  documentsDir: string   // ملفات PDF المولَّدة للفواتير
  attachmentsDir: string
  tempDir: string
  sqlWasmPath: string
  resourcesDir: string
}

let cached: AppPaths | null = null

/** يحوّل مسارًا داخل app.asar إلى نسخته غير المضغوطة (asarUnpack) عند التغليف. */
function unpacked(p: string): string {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

/** يجد ملف WASM الخاص بـ sql.js: عبر محلّل الوحدات أولًا (يعمل في التطوير والتغليف)، ثم مسارات احتياطية. */
function resolveSqlWasm(appPath: string): string {
  const candidates: string[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    candidates.push(require.resolve('sql.js/dist/sql-wasm.wasm'))
  } catch {
    /* المحلّل قد يرفض ملفات غير JS في بعض الإصدارات */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    candidates.push(path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', 'sql-wasm.wasm'))
  } catch {
    /* تجاهل */
  }
  candidates.push(path.join(appPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  candidates.push(path.join(appPath, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  candidates.push(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  for (const candidate of candidates) {
    const real = unpacked(candidate)
    if (fs.existsSync(real)) return real
  }
  return unpacked(candidates[candidates.length - 1])
}

export function getPaths(): AppPaths {
  if (cached) return cached
  const dataDir = path.join(app.getPath('userData'), 'data')
  const appPath = app.getAppPath()
  const paths: AppPaths = {
    dataDir,
    dbPath: path.join(dataDir, 'nova.sqlite'),
    logDir: path.join(app.getPath('userData'), 'logs'),
    backupDir: path.join(dataDir, 'backups'),
    documentsDir: path.join(dataDir, 'documents'),
    attachmentsDir: path.join(dataDir, 'attachments'),
    tempDir: path.join(app.getPath('temp'), 'nova-pdf-studio'),
    sqlWasmPath: resolveSqlWasm(appPath),
    resourcesDir: app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(appPath, 'resources')
  }
  for (const dir of [paths.dataDir, paths.logDir, paths.backupDir, paths.documentsDir, paths.attachmentsDir, paths.tempDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  cached = paths
  return paths
}
