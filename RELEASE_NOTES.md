# NOVA PDF Studio 0.1.0 — first public release

**Nova PDF – PDF Editor & Invoice Maker.** Local-first desktop app for Windows 10/11. No account, no internet needed, your data never leaves your computer.

## Highlights
- **PDF viewer & editor** — open, search, annotate, edit text in place, sign/stamp, merge, split, rotate, compress, convert, watermark, page numbers. Print and export through Chromium with correct Arabic shaping.
- **OCR (offline)** — Arabic, French and English recognition for scanned PDFs; makes them searchable and exports searchable PDFs.
- **Smart invoices** — customers, products, taxes, multi-currency, integer-safe money math, partial payments, overdue tracking, amount in words (ar/fr/en), QR codes, 6 premium templates + drag-and-drop designer, PDF export named like `INV-2026-00045_Client-Name.pdf`.
- **PDF → smart invoice** — automatic field detection, extraction zones, reusable extraction templates, batch import.
- **Spreadsheet studio** — formulas (SUM, AVERAGE, IF, ROUND …), XLSX/CSV import/export, paste from Excel, create an invoice from a sheet.
- **14 languages** — Arabic and Persian (RTL), French, English, Spanish, German, Italian, Portuguese, Turkish, Russian, Chinese, Japanese, Hindi, Indonesian. Switch instantly, no restart.
- **Safety** — SQLite database with atomic writes, automatic backups, soft delete & restore, audit log, PIN lock, draft recovery.

## Known limitations
- Amount-in-words and printed invoice labels are available in Arabic, French and English; other languages print in English (labels are editable in the template designer).
- The installer is not code-signed yet, so Windows SmartScreen may show an "unknown publisher" warning on first run. Click "More info → Run anyway".
- OCR uses the fast Tesseract models (good on clean scans); swap `resources/tessdata` for the *best* models for higher accuracy.

---

# NOVA PDF Studio 0.1.0 — الإصدار العام الأول

تطبيق مكتبي يعمل محليًا بالكامل على Windows 10/11، بلا حساب وبلا إنترنت، وبياناتك لا تغادر جهازك.

- عارض ومحرر PDF كامل مع تعديل النص في مكانه، توقيع وختم، دمج وتقسيم وضغط وتحويل، وطباعة عربية صحيحة.
- تعرف ضوئي بلا إنترنت (عربية/فرنسية/إنجليزية) يجعل الملفات الممسوحة قابلة للبحث.
- فواتير ذكية: عملاء ومنتجات وضرائب وعملات، حساب صحيح بلا أخطاء الفاصلة العائمة، دفعات جزئية ومتأخرات، المبلغ بالحروف، رمز QR، 6 قوالب فاخرة ومصمّم بالسحب والإفلات.
- تحويل PDF قديم إلى فاتورة ذكية مع مناطق استخراج وقوالب قابلة لإعادة الاستخدام.
- استوديو جداول بصيغ Excel واستيراد/تصدير xlsx وcsv وإنشاء فاتورة من الجدول.
- 14 لغة تتبدّل فورًا، بينها العربية والفارسية باتجاه RTL كامل.
- قاعدة SQLite بكتابة آمنة، نسخ احتياطي تلقائي، حذف قابل للاسترجاع، سجل تدقيق، قفل PIN، استرجاع المسودات.

ملاحظة: المثبّت غير موقّع رقميًا بعد، فقد يعرض Windows تحذير «ناشر غير معروف» عند أول تشغيل؛ اختر «مزيد من المعلومات ← التشغيل على أي حال».
