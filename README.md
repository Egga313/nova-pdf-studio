# NOVA PDF Studio

**PDF Editor • Smart Invoice • Spreadsheet • Documents**

منصة مكتبية متكاملة تعمل محليًا بالكامل (Local-first): قراءة وتعديل PDF، فواتير ذكية بحسابات دقيقة
بوحدات مالية صحيحة، جداول شبيهة بـ Excel، تعرّف ضوئي على النصوص (عربية/فرنسية/إنجليزية)، وطباعة وتصدير.

## التشغيل من المصدر

المتطلبات: Node.js 20+ (جُرّب على 24) ونظام Windows 10/11.

```bash
npm install
npm run dev
```

## البناء والتغليف

```bash
npm run typecheck   # فحص الأنواع للعمليتين
npm test            # اختبارات محرّك المال والترقيم وغيرها
npm run build       # حزم الإنتاج في out/
npm run dist        # مثبّت Windows (NSIS) في release/
```

## البنية

راجع [ARCHITECTURE.md](ARCHITECTURE.md): وحدات معزولة في `src/modules/<name>/{main,renderer,shared}`،
عقد IPC مكتوب بالأنواع في `src/shared/ipc.ts`، SQLite محلي مع ترحيلات، ومحرّك مالي بلا أعداد عشرية.

## اللغات

العربية (RTL كامل)، الفرنسية، الإنجليزية — تتغيّر فورًا من الشريط الجانبي أو الإعدادات.
ملفات الترجمة في `src/modules/translations/renderer/locales/`.

## البيانات والخصوصية

كل شيء يُخزَّن في `%APPDATA%\nova-pdf-studio\data\` (قاعدة بيانات SQLite، النسخ الاحتياطية، المستندات المولَّدة).
لا يُرفع أي ملف إلى الإنترنت.
