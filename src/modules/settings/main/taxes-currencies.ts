/** مستودعا الضرائب والعملات: ملفات ضريبية قابلة للتخصيص وعملات بلا قيود ثابتة. */
import { bool, getDatabase } from '@modules/database/main'
import type { Currency, Tax } from '@shared/entities'
import { AppError } from '@shared/errors'

interface TaxRow { id: number; name: string; rate_bps: number; is_default: number; is_active: number; created_at: string; updated_at: string }
interface CurrencyRow { code: string; name: string; symbol: string; decimals: number; position: 'before' | 'after'; is_active: number; created_at: string; updated_at: string }

const mapTax = (r: TaxRow): Tax => ({
  id: r.id, name: r.name, rateBps: r.rate_bps, isDefault: bool(r.is_default), isActive: bool(r.is_active),
  createdAt: r.created_at, updatedAt: r.updated_at
})
const mapCurrency = (r: CurrencyRow): Currency => ({
  code: r.code, name: r.name, symbol: r.symbol, decimals: r.decimals, position: r.position,
  isActive: bool(r.is_active), createdAt: r.created_at, updatedAt: r.updated_at
})

// ------------------------------------------------------------------ الضرائب
export function listTaxes(includeInactive = false): Tax[] {
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  return getDatabase().all<TaxRow>(`SELECT * FROM taxes ${where} ORDER BY rate_bps, name`).map(mapTax)
}

export function getTax(id: number): Tax | null {
  const row = getDatabase().get<TaxRow>('SELECT * FROM taxes WHERE id = ?', [id])
  return row ? mapTax(row) : null
}

export function saveTax(input: Partial<Tax> & { name: string; rateBps: number }): Tax {
  const db = getDatabase()
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'errors.validation.name_required')
  if (!Number.isInteger(input.rateBps) || input.rateBps < 0 || input.rateBps > 100_00 * 10) {
    throw new AppError('VALIDATION', 'errors.validation.rate_invalid')
  }
  return db.transaction(() => {
    if (input.isDefault) db.run('UPDATE taxes SET is_default = 0')
    if (input.id) {
      db.run(
        `UPDATE taxes SET name=?, rate_bps=?, is_default=COALESCE(?, is_default), is_active=COALESCE(?, is_active),
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        [name, input.rateBps, input.isDefault === undefined ? null : input.isDefault ? 1 : 0,
          input.isActive === undefined ? null : input.isActive ? 1 : 0, input.id]
      )
      const tax = getTax(input.id)
      if (!tax) throw new AppError('NOT_FOUND')
      return tax
    }
    const { lastInsertRowid } = db.run('INSERT INTO taxes (name, rate_bps, is_default, is_active) VALUES (?, ?, ?, 1)', [
      name, input.rateBps, input.isDefault ? 1 : 0
    ])
    return getTax(lastInsertRowid)!
  })
}

export function deleteTax(id: number): void {
  const db = getDatabase()
  const used = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE tax_id = ?', [id])?.n ?? 0
  // الضريبة المستخدمة في منتجات تُعطَّل فقط حتى لا تنكسر البيانات؛ غير المستخدمة تُحذف
  if (used > 0) db.run('UPDATE taxes SET is_active = 0, is_default = 0 WHERE id = ?', [id])
  else db.run('DELETE FROM taxes WHERE id = ?', [id])
}

// ------------------------------------------------------------------ العملات
export function listCurrencies(includeInactive = false): Currency[] {
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  return getDatabase().all<CurrencyRow>(`SELECT * FROM currencies ${where} ORDER BY code`).map(mapCurrency)
}

export function getCurrency(code: string): Currency | null {
  const row = getDatabase().get<CurrencyRow>('SELECT * FROM currencies WHERE code = ?', [code.toUpperCase()])
  return row ? mapCurrency(row) : null
}

export function saveCurrency(input: Partial<Currency> & { code: string; name: string; symbol: string }): Currency {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z]{3,5}$/.test(code)) throw new AppError('VALIDATION', 'errors.validation.currency_code')
  const decimals = input.decimals ?? 2
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) throw new AppError('VALIDATION', 'errors.validation.decimals')
  getDatabase().run(
    `INSERT INTO currencies (code, name, symbol, decimals, position, is_active) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, symbol=excluded.symbol, decimals=excluded.decimals,
       position=excluded.position, is_active=excluded.is_active, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [code, input.name.trim() || code, input.symbol.trim() || code, decimals, input.position ?? 'after', input.isActive === false ? 0 : 1]
  )
  return getCurrency(code)!
}

export function deleteCurrency(code: string): void {
  const db = getDatabase()
  const upper = code.toUpperCase()
  const used = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM invoices WHERE currency = ?', [upper])?.n ?? 0
  if (used > 0) db.run('UPDATE currencies SET is_active = 0 WHERE code = ?', [upper])
  else db.run('DELETE FROM currencies WHERE code = ?', [upper])
}
