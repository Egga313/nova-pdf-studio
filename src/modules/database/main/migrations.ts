/**
 * ترحيلات مخطط قاعدة البيانات. كل نسخة تُطبَّق مرة واحدة داخل معاملة وتُسجَّل في schema_migrations.
 * لا تُعدَّل ترحيلة منشورة؛ أضف نسخة جديدة دائمًا.
 */
import type { SqliteDatabase } from './sqlite'

export interface Migration {
  version: number
  name: string
  up: string
}

const TS = `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  rc TEXT NOT NULL DEFAULT '',
  nif TEXT NOT NULL DEFAULT '',
  nis TEXT NOT NULL DEFAULT '',
  ai TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  swift TEXT NOT NULL DEFAULT '',
  logo_path TEXT,
  visible_fields TEXT NOT NULL DEFAULT '{}',
  ${TS}
);

CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rate_bps INTEGER NOT NULL CHECK (rate_bps >= 0),
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  ${TS}
);

CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 2 CHECK (decimals BETWEEN 0 AND 4),
  position TEXT NOT NULL DEFAULT 'after' CHECK (position IN ('before','after')),
  is_active INTEGER NOT NULL DEFAULT 1,
  ${TS}
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_number TEXT UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(deleted_at);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DZD',
  tax_id INTEGER REFERENCES taxes(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS document_sequences (
  doc_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, scope)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL DEFAULT 'invoice'
    CHECK (doc_type IN ('invoice','quote','proforma','receipt','credit_note','purchase_order','delivery_note')),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','partially_paid','overdue','cancelled')),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_snapshot TEXT NOT NULL DEFAULT '{}',
  company_snapshot TEXT NOT NULL DEFAULT '{}',
  issue_date TEXT NOT NULL,
  due_date TEXT,
  reference TEXT NOT NULL DEFAULT '',
  purchase_order TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'DZD',
  currency_position TEXT NOT NULL DEFAULT 'after',
  payment_method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  template_id INTEGER,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  discount_total_minor INTEGER NOT NULL DEFAULT 0,
  taxable_minor INTEGER NOT NULL DEFAULT 0,
  tax_total_minor INTEGER NOT NULL DEFAULT 0,
  shipping_minor INTEGER NOT NULL DEFAULT 0,
  fees_minor INTEGER NOT NULL DEFAULT 0,
  grand_total_minor INTEGER NOT NULL DEFAULT 0,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  remaining_minor INTEGER NOT NULL DEFAULT 0,
  amount_in_words INTEGER NOT NULL DEFAULT 1,
  pdf_path TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_document_id INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  ${TS}
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(doc_type, number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit TEXT NOT NULL DEFAULT '',
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  discount_bps INTEGER NOT NULL DEFAULT 0,
  tax_bps INTEGER NOT NULL DEFAULT 0,
  tax_name TEXT NOT NULL DEFAULT '',
  base_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  net_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  paid_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_at);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf','generated','scan','image')),
  path TEXT,
  size_bytes INTEGER,
  page_count INTEGER NOT NULL DEFAULT 0,
  is_scanned INTEGER NOT NULL DEFAULT 0,
  ocr_done INTEGER NOT NULL DEFAULT 0,
  hash TEXT,
  notes TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);

CREATE TABLE IF NOT EXISTS document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  width_pt REAL,
  height_pt REAL,
  rotation INTEGER NOT NULL DEFAULT 0,
  text_content TEXT,
  ocr_confidence REAL,
  ${TS},
  UNIQUE (document_id, page_index)
);

CREATE TABLE IF NOT EXISTS invoice_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'layout' CHECK (kind IN ('layout','extraction')),
  definition TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  ${TS}
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('customer','invoice','product')),
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS spreadsheet_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  path TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  sheet_count INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  ${TS}
);

CREATE TABLE IF NOT EXISTS recent_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  size_bytes INTEGER,
  last_opened_at TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recent_files_opened ON recent_files(last_opened_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL CHECK (entity IN ('customer','invoice','product','company')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','bool')),
  show_on_invoice INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  ${TS},
  UNIQUE (entity, key)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL,
  value TEXT,
  UNIQUE (field_id, entity_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('customer','invoice','product')),
  owner_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  ${TS}
);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO companies (id, name) VALUES (1, '');

INSERT OR IGNORE INTO currencies (code, name, symbol, decimals, position) VALUES
  ('DZD', 'Algerian Dinar', 'DZD', 2, 'after'),
  ('EUR', 'Euro', '€', 2, 'before'),
  ('USD', 'US Dollar', '$', 2, 'before'),
  ('GBP', 'Pound Sterling', '£', 2, 'before');

INSERT INTO taxes (name, rate_bps, is_default) SELECT 'TVA 0%', 0, 0 WHERE NOT EXISTS (SELECT 1 FROM taxes);
INSERT INTO taxes (name, rate_bps, is_default) SELECT 'TVA 9%', 900, 0 WHERE (SELECT COUNT(*) FROM taxes) = 1;
INSERT INTO taxes (name, rate_bps, is_default) SELECT 'TVA 19%', 1900, 1 WHERE (SELECT COUNT(*) FROM taxes) = 2;
`
  },
  {
    version: 2,
    name: 'document_pages_ocr_layout',
    // تخطيط أسطر OCR (JSON بإحداثيات النقاط) حتى تُعاد طبقة النص القابلة للبحث عند فتح المستند مجددًا
    up: `ALTER TABLE document_pages ADD COLUMN layout TEXT;`
  }
]

export interface MigrationReport {
  applied: number[]
  currentVersion: number
}

export function runMigrations(db: SqliteDatabase, migrations: Migration[] = MIGRATIONS): MigrationReport {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`)
  const done = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version))
  const applied: number[] = []
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(migration.version)) continue
    db.transaction(() => {
      db.exec(migration.up)
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name])
    })
    applied.push(migration.version)
  }
  const current = db.get<{ v: number }>('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')?.v ?? 0
  return { applied, currentVersion: current }
}
