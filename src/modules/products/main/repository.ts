/** مستودع المنتجات والخدمات: بحث بالإكمال التلقائي، تصنيفات، حذف ناعم. */
import { bool, getDatabase } from '@modules/database/main'
import { audit } from '@modules/database/main/audit'
import { AppError } from '@shared/errors'
import type { Product, ProductInput } from '@shared/invoicing'

interface Row {
  id: number; sku: string | null; name: string; description: string; price_minor: number; currency: string; tax_id: number | null; unit: string
  category: string; notes: string; is_active: number; is_demo: number; deleted_at: string | null; created_at: string; updated_at: string
}

const map = (r: Row): Product => ({
  id: r.id, sku: r.sku, name: r.name, description: r.description, priceMinor: r.price_minor, currency: r.currency, taxId: r.tax_id, unit: r.unit,
  category: r.category, notes: r.notes, isActive: bool(r.is_active), isDemo: bool(r.is_demo), createdAt: r.created_at, updatedAt: r.updated_at
})

export interface ProductFilters {
  query?: string
  category?: string
  includeInactive?: boolean
  includeDeleted?: boolean
  limit?: number
  offset?: number
  sort?: 'name' | 'recent' | 'price_desc' | 'price_asc'
}

export function listProducts(filters: ProductFilters = {}): Product[] {
  const where: string[] = [filters.includeDeleted ? '1=1' : 'deleted_at IS NULL']
  const params: (string | number)[] = []
  if (!filters.includeInactive) where.push('is_active = 1')
  if (filters.category) {
    where.push('category = ?')
    params.push(filters.category)
  }
  if (filters.query?.trim()) {
    const like = `%${filters.query.trim()}%`
    where.push('(name LIKE ? OR sku LIKE ? OR description LIKE ? OR category LIKE ?)')
    params.push(like, like, like, like)
  }
  const order = { name: 'name COLLATE NOCASE', recent: 'updated_at DESC', price_desc: 'price_minor DESC', price_asc: 'price_minor ASC' }[filters.sort ?? 'name']
  params.push(filters.limit ?? 500, filters.offset ?? 0)
  return getDatabase().all<Row>(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, params).map(map)
}

export function getProduct(id: number): Product | null {
  const row = getDatabase().get<Row>('SELECT * FROM products WHERE id = ?', [id])
  return row ? map(row) : null
}

export function listCategories(): string[] {
  return getDatabase().all<{ category: string }>(`SELECT DISTINCT category FROM products WHERE deleted_at IS NULL AND category <> '' ORDER BY category COLLATE NOCASE`).map((r) => r.category)
}

/** إكمال تلقائي: يطابق بداية الاسم أولًا ثم أي جزء منه أو من SKU. */
export function searchProducts(query: string, limit = 8): Product[] {
  const q = query.trim()
  if (!q) return listProducts({ limit })
  return getDatabase()
    .all<Row>(
      `SELECT * FROM products WHERE deleted_at IS NULL AND is_active = 1 AND (name LIKE ? OR sku LIKE ? OR name LIKE ?)
       ORDER BY CASE WHEN name LIKE ? THEN 0 WHEN sku LIKE ? THEN 1 ELSE 2 END, name COLLATE NOCASE LIMIT ?`,
      [`${q}%`, `${q}%`, `%${q}%`, `${q}%`, `${q}%`, limit]
    )
    .map(map)
}

export function saveProduct(input: ProductInput): Product {
  const db = getDatabase()
  const name = input.name?.trim()
  if (!name) throw new AppError('VALIDATION', 'errors.validation.name_required')
  const price = input.priceMinor ?? 0
  if (!Number.isInteger(price) || price < 0) throw new AppError('VALIDATION', 'errors.validation.price_invalid')
  const sku = input.sku?.trim() || null
  if (sku) {
    const dup = db.get<{ id: number }>('SELECT id FROM products WHERE sku = ? AND deleted_at IS NULL AND id <> ?', [sku, input.id ?? 0])
    if (dup) throw new AppError('CONFLICT', 'errors.validation.sku_duplicate', { sku })
  }
  const fields = {
    sku, name, description: input.description ?? '', price_minor: price, currency: input.currency ?? 'DZD', tax_id: input.taxId ?? null,
    unit: input.unit ?? '', category: (input.category ?? '').trim(), notes: input.notes ?? '', is_active: input.isActive === false ? 0 : 1
  }
  if (input.id) {
    db.run(
      `UPDATE products SET sku=$sku, name=$name, description=$description, price_minor=$price_minor, currency=$currency, tax_id=$tax_id, unit=$unit,
         category=$category, notes=$notes, is_active=$is_active, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=$id`,
      { ...fields, id: input.id }
    )
    audit('product.updated', 'product', input.id, name)
    return getProduct(input.id)!
  }
  const { lastInsertRowid } = db.run(
    `INSERT INTO products (sku, name, description, price_minor, currency, tax_id, unit, category, notes, is_active)
     VALUES ($sku, $name, $description, $price_minor, $currency, $tax_id, $unit, $category, $notes, $is_active)`,
    fields
  )
  audit('product.created', 'product', lastInsertRowid, name)
  return getProduct(lastInsertRowid)!
}

export function deleteProduct(id: number): void {
  getDatabase().run(`UPDATE products SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [id])
  audit('product.deleted', 'product', id)
}

export function restoreProduct(id: number): void {
  getDatabase().run('UPDATE products SET deleted_at = NULL WHERE id = ?', [id])
}
