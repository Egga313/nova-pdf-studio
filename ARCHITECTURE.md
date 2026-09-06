# NOVA PDF Studio — Architecture

> PDF Editor • Smart Invoice • Spreadsheet • Documents — local-first desktop platform.

## Stack decision

| Concern | Choice | Why |
|---|---|---|
| Shell | **Electron 33** + electron-vite | No Rust/MSVC toolchain is required (Tauri needs both). Chromium gives faithful HTML→PDF rendering with correct Arabic shaping/RTL, which pdf-lib alone cannot do. |
| UI | React 18 + TypeScript + Tailwind | Fast iteration, design tokens via CSS variables, instant RTL/LTR and theme switching. |
| State | zustand | Small stores per concern (tabs, settings, notifications, commands). |
| i18n | i18next | `ar` / `fr` / `en` bundled; add a language = one JSON file + one entry. |
| Database | SQLite via **sql.js (WASM)** | Zero native compilation. Atomic file writes (tmp + rename), migrations, soft delete, audit log. The driver interface (`SqliteDatabase`) is the only thing to swap for `better-sqlite3` later. |
| Money | integer minor units + basis points | `1050.50 DZD` is stored as `105050`; 19 % is `1900` bps; quantities in thousandths. No floats anywhere in financial math. |
| PDF | pdf.js (render/text) + pdf-lib (edit/build) | Phases 2–3. |
| OCR | tesseract.js (offline language packs) | Phase 7. |
| Spreadsheet | SheetJS import/export + in-app grid | Phase 6. |

The platform layer (file dialogs, file IO, printing, paths) lives only in `src/main` and `src/preload`; the renderer never touches Node. Porting to Tauri means re-implementing `src/main/handlers.ts` behind the same `IpcContract`.

## Layout

```
src/
  main/                     Electron main process (bootstrap, window, IPC registry, logger, paths)
  preload/                  contextBridge: typed `window.nova.invoke(channel, req)` + events
  shared/                   Types and pure logic shared by both sides
    ipc.ts                  IpcContract: every channel + request/response types (single source of truth)
    money.ts                Minor-unit arithmetic, parsing, formatting (tested)
    numbering.ts            Document number patterns  INV-{YYYY}-{SEQ:5}  (tested)
    settings.ts             AppSettings model + defaults + deep merge
    errors.ts               AppError codes → translated messages
  modules/<name>/
    main/                   Repositories, services, IPC handlers for the module (Node side)
    renderer/               React components for the module (browser side)
    shared/                 Module-specific types
  renderer/src/
    app/                    Shell: Sidebar, TabBar, TopBar, CommandPalette, NotificationCenter, Wizard, Lock
    stores/                 zustand stores
    components/ui.tsx       Design-system primitives
    lib/                    ipc client, formatting helpers
```

Modules: `database`, `settings`, `translations`, `dashboard`, `backup` (Phase 1) · `pdf`, `printing` (Phase 2) · `invoices`, `customers`, `products` (Phase 4) · `templates` (Phase 5) · `spreadsheet` (Phase 6) · `ocr` (Phase 7).

## Data flow

```
React component ──invoke('customers:list', req)──▶ preload (whitelist) ──▶ ipcMain.handle
                ◀── IpcResult {ok,data} | {ok:false,error}  ◀── handler → repository → SqliteDatabase
```

* Every handler is wrapped by `handle()` which converts any thrown error into a serialized `AppError`
  (code + translation key). The renderer shows `t(error.messageKey)`; details go to `logs/nova.log`.
* Writes happen in `db.transaction(...)`; the database is flushed to disk atomically ~200 ms after the last write and on quit.
* Sensitive records (invoices, customers, products, documents) use `deleted_at` (soft delete) and can be restored.
* Important actions are recorded in `audit_logs`.

## Tabs & commands

* `useTabs` holds browser-like tabs (`kind` + `params`). Singleton kinds (lists, settings) are re-focused, entity tabs get stable ids (`invoice-12`, `pdf:<path>`).
* `tabRegistry.tsx` maps a `TabKind` to a component. A module registers its tab kinds there.
* `useCommands` is the single registry behind the command palette (Ctrl+K), keyboard shortcuts, menus and dashboard quick actions.

## Database schema (v1)

`settings`, `companies`, `taxes`, `currencies`, `customers`, `products`, `document_sequences`, `invoices`, `invoice_items`,
`payments`, `documents`, `document_pages`, `invoice_templates`, `attachments`, `spreadsheet_documents`, `recent_files`,
`audit_logs`, `custom_fields`, `custom_field_values`, `notes`, `drafts`, `schema_migrations`.

All monetary columns are `INTEGER` minor units (`*_minor`), rates are `*_bps`, quantities are `*_milli`.

## Development

```bash
npm install
npm run dev          # electron-vite dev with HMR
npm run typecheck    # both TS projects
npm test             # vitest (money engine, numbering, …)
npm run build        # out/ bundles
npm run dist         # Windows NSIS installer in release/
```

Dev-only automation: `NOVA_AUTOMATION=plan.json` runs eval/screenshot steps against the live window (see `src/main/index.ts`).

## Phase status

- [x] Phase 1 — shell, navigation, tabs, database, settings, translations, theme, dashboard, wizard, backup, app lock
- [x] Phase 2 — PDF viewer (pdf.js, lazy pages, text layer, thumbnails, bookmarks, search, zoom/rotate/fullscreen), print & export through Chromium, PDF tools (merge/split/extract/delete/reorder/rotate/blank/insert/images/watermark/numbers/compress/to-images/to-text), documents registry
- [x] Phase 3 — PDF edit mode: overlay objects (text, image/signature/stamp, rect/ellipse/line/check, highlight, white-out), click-to-edit original text (white-out + replacement), drag/resize/properties, undo/redo, save/save-as baked with pdf-lib (Latin text as real text, other scripts rasterized via Canvas)
- [x] Phase 4 — invoices (draft/sent/paid/partial/overdue/cancelled, auto numbering, trash/restore), customers (profile, balances), products (autocomplete), tax profiles, central integer calculation engine (tested), payments with live remaining balance, amount in words (ar/fr/en), Excel paste into the items grid
- [ ] Phase 5 — invoice PDF generator, templates, designer, printing
- [ ] Phase 6 — spreadsheet studio, XLSX import/export, formulas, invoice integration
- [ ] Phase 7 — OCR, PDF → smart invoice, zones, extraction templates
- [ ] Phase 8 — security, audit UI, performance, testing, polish
