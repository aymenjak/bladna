# دليل BLADNA — كيف يعمل كل شيء

> دليل تشغيلي وشرح معماري بالفصول: ما هي المنصة، كيف يمر الطلب من المتصفح إلى
> قاعدة البيانات وما يعادله في الـ API، وكيف تُنفَّذ أهم العمليات يومياً.
>
> هذا مستند "ابدأ هنا". للمعمارية العميقة راجع `docs/ARCHITECTURE.md`، وللواجهات
> `docs/DESIGN.md`، وللـ API `docs/API.md`، وللتشغيل `docs/OPERATIONS.md`.

---

## الفصل 1 — نظرة عامة: ما هي BLADNA

منصة جزائرية-first تجمع بين:

- **هوية المتطوع** ورقم متطوع قابل للتحقق + سجل تجربة موثّق (شهادات، ساعات، حضور).
- **الفرص (المبادرات)**: عروض وطلبات مساندة (SupportNeed / SupportOffer) مع خريطة ونِسَب مطابقة.
- **منظمة SaaS**: مساحة عمل (workspace) لإدارة الأعضاء والفرص والحضور والوثائق والحملات.
- **التحقق العام**: التحقق من شهادة/متطوع/منظمة عبر رمز فحص عام.
- **الوحدة الدولية (International)**: فرص خارج الجزائر، جواز المتطوع، مزوّدون، إرشادات سلامة.
- **الرسائل، الإشعارات، الفوترة، CSR/الرعاية، الإدارة (/admin)**.

اللغات: **`ar` (افتراضية) · `fr` · `en`** — كل صفحة تحت `/ar` أو `/fr` أو `/en`.

> **قاعدة الصدق**: كل بيانات الديمو تُوسم "demo dataset"، القيم المزروعة
> `verified=false`، والمدفوعات `bank_transfer | free` فقط — لا ادّعاءات رسمية أو
> شراكات أو إحصائيات وهمية.

## الفصل 2 — خريطة المستودع (Monorepo)

```
bladna/
├── apps/web/                  تطبيق Next.js 16 (App Router) — الواجهة + الـ API معاً
│   ├── src/app/[locale]/      صفحات ar/fr/en (نفس الملفات للثلاث)
│   ├── src/app/api/v1/…       نقطة دخول الـ API (catch-all واحد)
│   ├── src/proxy.ts           تحديد اللغة + ترويسات الأمان لكل رد
│   ├── src/server/            كل ما هو server: modules, routes, guards, infra, lib
│   └── src/ui/                المكونات، قواميس i18n، عميل الـ API
├── packages/
│   ├── auth/                  scrypt، TOTP (RFC 6238)، tokens، rate-limit
│   ├── database/              Prisma client، الـ schema/الهجرات، الـ seed
│   ├── domain/                المنطق النقي: RBAC، آلات الحالة، المطابقة، شارة المتطوع
│   ├── validation/            مخططات التحقق لكل endpoint
│   ├── types/                 أنواع API المشتركة (envelopes, DTOs, enums)
│   ├── ui/                    نظام التصميم: Button, Input, Select, Card, Badge, Alert,
│   │                          EmptyState, Skeleton
│   └── utils/                 slug، pagination، locale، mask
├── scripts/                   check-routes · check-api-docs · totp-code · e2e-env
├── docs/                      API · ARCHITECTURE · DESIGN · OPERATIONS · SECURITY …
└── .env                       الإعدادات المحلية (لا يُرفع للـ git)
```

**مبدأ واحد**: `apps/web` = الطبقة القابلة للاستبدال، `packages/*` = العقل النقي
(لا knows Next.js ولا Prisma في domain/auth/validation).

## الفصل 3 — رحلة الطلب: الصفحة (SSR)

```
المتصفح
  │
  ▼
proxy.ts
  ├─ تحديد اللغة: بادئة المسار ← كوكي bladna_locale ← Accept-Language ← ar
  │    (بدون بادئة؟ redirect إلى /{locale}/…)
  ├─ ترويسة x-locale إلى الداخل (الـ layout يقرأها لـ <html lang/dir>)
  └─ ترويسات الأمان على كل رد: CSP بـ nonce لكل طلب، HSTS، nosniff،
     frame/referrer/permissions policies (الـ API سياسة default-src 'none')
  │
  ▼
[locale]/layout.tsx
  ├─ SiteHeader (server): يقرأ كوكي الجلسة فقط — هل المستخدم مسجّل؟
  │    ├─ NavLinks (الصف الرئيسي + حالة نشطة aria-current)
  │    ├─ قائمة Account (مساحة العمل/الإعدادات/الفوترة/السلامة)
  │    ├─ LocaleSwitch (اللغات الثلاث، الحالية معلَّمة)
  │    └─ MobileNav (تحت lg — Escape/نقر خارجي/تمرير)
  └─ SiteFooter
  │
  ▼
الصفحة (server component) ── queries عبر server/modules/* + Prisma
  │
  ▼
مكونات العميل (ui/components/*) ── عميل API ← fetch('/api/v1/…')
```

ملاحظات مهمة:

- استخدام `cookies()`/`headers()` في التخطيط يجعل كل الصفحات **dynamic** (تُبنى
  عند الطلب، لا تُخبَّأ).
- **صفحة واحدة = h1 واحد** بحجم `text-3xl`، والأوعية كلها `max-w-6xl px-4 py-10`
  (انظر `docs/DESIGN.md`).
- حالات التحميل = `Skeleton` (لا `fallback={null}`).

## الفصل 4 — رحلة الطلب: الـ API

كل شيء تحت مسار واحد `apps/web/src/app/api/v1/[[...segments]]/route.ts`:

```
HTTP /api/v1/<segment>
  → router.ts  (جدول مسارات: core=57, platform=179, participants=75 — المجموع 311)
  → guards.ts  (مصادقة بالكوكي، RBAC، rate limiting، ترويسات الأمان)
  → validation (packages/validation — رفض مبكر بـ 400)
  → modules/*  (منطق الأعمال — 27 وحدة)
  → Prisma     (قاعدة البيانات)
  → envelope موحّد:
       نجاح:  { "success": true,  "data": …, "meta": { "requestId": … } }
       فشل:   { "success": false, "error": { "code", "message" }, "meta": … }
```

- **كل endpoint جديد = سطر جديد في `docs/API.md`** وإلا فشل `check:api-docs`.
- الأخطاء غير المتوقعة ترجع **500 مغلق (fail-closed)** — لا تُسرَّب تفاصيل داخلية.
- `requestId` في كل رد لتتبّع السجلات.

## الفصل 5 — المصادقة والجلسات والأمان

### التدفق

```
/register → (تحقق من المخطط + سياسة كلمة المرور) → حساب
/login    →
   ├─ بدون 2FA: إنشاء جلسة ← كوكي ACCESS (HttpOnly, SameSite=Lax, Secure في الإنتاج)
   └─ مع 2FA:   كوكي MFA-pending — لا يفتح أي شيء حتى /auth/mfa/verify بنجاح
                (يقبل TOTP أو رمز استرداد BLD-XXXX-XXXX)
```

### الضمانات (مُتحقَّق منها بالفحص الحي)

| الضمانة             | كيف                                                                           |
| ------------------- | ----------------------------------------------------------------------------- |
| كلمات المرور        | scrypt + مقارنة `timingSafeEqual`                                             |
| عدم كشف وجود الحساب | رد موحّد لكل حالات الدخول الخاطئ + موازنة توقيت الاستجابة                     |
| rate limiting       | لكل مسار فئة، + حد خاص بحساب الدخول (10/15 دقيقة)، استعادة كلمة المرور (5/15) |
| تدوير الجلسة        | تدوير عند الترقيع + كشف إعادة استخدام التوكن + تثبيت `jti`                    |
| التوكنات المخزّنة   | opaque مشفّر (لا تُخزَّن خاماً)                                               |
| ترويسات الأمان      | CSP بـ nonce + HSTS + … من `security-headers.ts` عبر `src/proxy.ts` (Next 16) |
| خلف وسيط            | `TRUST_PROXY=false` افتراضياً (لا ثقة بـ X-Forwarded-For)                     |

### أدوات المصادقة

```powershell
# رمز TOTP الحالي لحساب تجريبي (بيئات الفحص):
npx tsx scripts/totp-code.ts org@bladna.dz   # يحتاج .env محمّلاً في البيئة
```

الخوارزمية نفسها تماماً: SHA1، 6 أرقام، فترة 30 ثانية، issuer `BLADNA`.

## الفصل 6 — الواجهة: اللغة + التصميم + التنقل

### i18n

- **أربعة ملفات متزامنة دائماً**: `ui/i18n/types.ts` (الأنواع) + `en.ts` + `fr.ts` +
  `ar.ts`. أي مفتاح ناقص = **خطأ typecheck** — لا يوجد "مفتاح مؤجل".
- القواميس تُمرَّر للسيرفر عبر `x-locale`، والمكوّنات العميلة تستدعي
  `getDictionary(locale)`.

### نظام التصميم (`docs/DESIGN.md` = المرجع)

- **التوكنات**: `brand` (أخضر) + `sand` (رمادي دافئ) في `globals.css` — الدرجات
  50→900 كاملة. أي لون خارج هذه اللائحة = عيب مراجعة.
- **السلّم**: h1 `text-3xl` ← h2 `text-lg font-semibold` ← h3 `text-base` (البطل
  الاستثناء `text-4xl/5xl` في الهبوط فقط).
- **الأزرار**: kit `Button` بأحجام sm/md/lg (32/40/48px)؛ ** primary واحد لكل شاشة**؛
  أزرار التصفية/البحث **outline دائماً**.
- **الحقول**: `Input` يولّد `id` تلقائياً ويربط التسمية (`useId`) + ارتفاع `h-10`
  مطابق للأزرار + `aria-invalid`.
- **RTL**: خصائص منطقية فقط (`ms/me/pe/text-end`) — `ml/mr/pr/text-right` ممنوعة.
- **الحالات**: skeleton → فارغ (سبب + خطوة تالية) → خطأ (لغة بسيطة + إعادة) → محتوى.

### التنقل (بنية استناداً إلى منصات عالمية)

- **الصف الرئيسي (lg+)**: المبادرات · الخريطة · المنظمات · الحملات + (عند التسجيل)
  لوحة التحكم · الطلبات · الرسائل · الإشعارات — العناصر منخفضة التردد في **قائمة
  Account** حتى لا يفيض الصف أبداً.
- **تحت lg**: قائمة Mobile كاملة (Escape + نقر خارجي + إغلاق عند الانتقال).
- الحالة النشطة: `aria-current="page"` + ظلّ brand.

## الفصل 7 — قاعدة البيانات والبيانات التجريبية

```powershell
npm run db:migrate        # تطبيق الهجرات (DATABASE_MIGRATION_URL)
$env:SEED_DEMO='true'; npm run db:seed   # أو DEMO_MODE=true
npm run db:studio         # فحص مباشرة
```

- **الـ seed آمن ومتكرر التشغيل (idempotent)**: يجد الصف بالفتاح الطبيعي أولاً، ولا
  يكرّر ولا يتجاوز أي محتوى كتبه المشغّل (الربط upsert بـ `update: {}`).
- **لا يعمل إطلاقاً** بدون `SEED_DEMO=true` أو `DEMO_MODE=true` (حماية الإنتاج).
- حجم بيانات الديمو الحالية: 3 مبادرات · 4 طلبات · 3 عروض · 7 مؤشرات · 58 ولاية ·
  منظمة موثّقة واحدة · 12 مدينة — كلها **demo dataset**.

### حسابات الديمو (مصدر واحد: `packages/database/src/demo-accounts.ts`)

| الحساب                | الدور                    | 2FA |
| --------------------- | ------------------------ | --- |
| `volunteer@bladna.dz` | متطوع بملف وتجربة موثّقة | لا  |
| `org@bladna.dz`       | مالك منظمة atlas-verts   | نعم |
| `admin@bladna.dz`     | SUPER_ADMIN              | نعم |

كلمة المرور للثلاثة: `Sahra-2026-Atlas!`

## الفصل 8 — أهم العمليات الوظيفية

1. **تصفح الفرص والتقديم**: `/opportunities` (تصفية + مطابقة) → صفحة الفرصة →
   `POST /opportunities/:id/applications` → آلة الحالة في `domain/state-machines`.
2. **مساحة العمل**: إنشاء منظمة → دعوة أعضاء → نشر فرص → حضور (QR/يدوي) → اعتماد
   ساعات → إصدار شهادات → وثائق — كل ذلك خلف RBAC (`domain/rbac`).
3. **التحقق العام**: `/verify/{certificate,volunteer,organization}` برمز فحص —
   نقطة الاعتماد العامة للمجتمع.
4. **الرسائل والإشعارات**: `modules/messaging` + `modules/notifications` (matrix
   إعدادات في الإشعارات).
5. **الحضور/التسجيل**: صفحة `/check-in` للفعاليات + وصولات QR موقّعة
   (`QR_SIGNING_SECRET`).
6. **الفوترة**: `modules/billing` — بوابة **bank_transfer | free فقط** (لا ادّعاء
   بوابة دفع إلكتروني).
7. **الدولي**: استعراض الفرص → تقديم → جواز المتطوع → مزوّدون — وحدة مستقلة
   (`modules/international`) ومخفّضة في التنقل (الفوتر + لوحة التحكم).
8. **الإدارة**: `/admin` — مراجعة المحتوى، المدفوعات، المخاطر، سجل التدقيق؛
   نقاط النهاية المميزة تطلب **TOTP إضافياً** لـ SUPER_ADMIN.
9. **الوضع التجريبي على صفحة الدخول**: عند `DEMO_MODE=true` تظهر بطاقة فيها حسابات
   الديمو + كلمة المرور + **رمز 2FA حي** (يتجدّد كل 30 ثانية) — مبنية في
   `server/lib/demo-access.ts` وهي fail-soft (أي خطأ يخفيها فقط).

## الفصل 9 — العمليات المهمة (جدول الأوامر)

| العملية             | الأمر                                    | ملاحظات                                                                                         |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| تشغيل التطوير       | `npm run dev -- -p 3002`                 | المنفذ 3002 (لا تلمس 3000 — مشروع آخر يستخدمه)                                                  |
| بناء الإنتاج        | `npm run build`                          | **أوقف مستمعّ المنفذ 3002 أولاً (سيرفرنا) — لا تقتل 3000 أبداً**                                |
| تشغيل الإنتاج       | `npm run start`                          | يتطلب build ناجحاً                                                                              |
| **البوابة الكاملة** | `npm run validate`                       | typecheck → lint → format:check → test → check → build — **مرة واحدة في المرة، والسيرفر موقوف** |
| فحص الأنواع         | `npm run typecheck`                      | TS strict                                                                                       |
| الـ lint            | `npm run lint` / `lint:fix`              | eslint                                                                                          |
| التنسيق             | `npm run format`                         | prettier على كل الملفات                                                                         |
| الاختبارات          | `npm test`                               | vitest — **403 اختباراً** (37 ملفاً)                                                            |
| اختبارات المتصفح    | `npm run test:e2e`                       | **Playwright — 15 اختباراً / 7 ملفات** (chrome مثبّت مسبقاً؛ يتطلب سيرفر 3002 أو CI)            |
| فحص المسارات        | `npm run check:routes`                   | **263 مساراً** بدون أي تكرار                                                                    |
| فحص توثيق API       | `npm run check:api-docs`                 | **264/264** متزامنة مع `docs/API.md`                                                            |
| الهجرات             | `npm run db:migrate`                     | **additive فقط** (لا حذف/إعادة تسمية)                                                           |
| الـ seed            | `$env:SEED_DEMO='true'; npm run db:seed` | idempotent                                                                                      |
| رمز TOTP حي         | `npx tsx scripts/totp-code.ts <email>`   | مع .env محمّل                                                                                   |
| صحة السيرفر         | `GET /api/v1/health`                     | أول ما تتحقق بعد التشغيل                                                                        |
| فحص شامل حي         | `%TEMP%\opencode\probe-3002.ps1`         | **153 فحصاً** — يجب أن تبقى 153/153 (+ `p1-verify.ps1` 27/27 و `p2-gates.ps1` ALL PASS)         |

## الفصل 10 — ضوابط العمل (غير قابلة للتفاوض)

1. **`npm run validate` مرة واحدة في المرة** — وأوقف السيرفر قبل أي build.
2. **أي endpoint جديد** → سطر في `docs/API.md` + مرور `check:api-docs`.
3. **أي نص واجهة جديد** → المفاتيح الأربعة (`types.ts` + `en` + `fr` + `ar`).
4. **أي تغيير واجهة** → قائمة مراجعة `docs/DESIGN.md` (h1 واحد، سلّم العناوين،
   زر primary واحد، خصائص منطقية، الحالات، focus).
5. **الهجرات additive فقط**.
6. **صياغة صادقة**: لا شعارات رسمية/شريك/ضمان، لا إحصائيات وهمية، لا بوابة دفع
   غير مدعومة، بيانات الديمو موسومة.
7. **TS strict** + أخطاء 500 fail-closed.
8. ملفات الـ probe برمجياً ASCII فقط (انتبه لفخاخ اقتباس PowerShell 5.1 مع curl).

## الفصل 11 — المتغيرات البيئية والأمان

الأكثر أهمية (القائمة الكاملة في `.env.example`):

| المفتاح                                   | الدور                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `AUTH_SECRET`                             | **مطلوب** ≥32 حرفاً — تشفير كلمات المرور والتوكنات وTOTP                        |
| `SESSION_SECRET`                          | جلسات وQR (يفترض AUTH_SECRET إن غاب)                                            |
| `DATABASE_URL` / `DATABASE_MIGRATION_URL` | تشغيل / هجرات                                                                   |
| `APP_URL` / `PUBLIC_APP_URL`              | أصول الروابط والإيميلات                                                         |
| `DEMO_MODE`                               | **`false` في أي نشر فعلي** — يفعّل بطاقة الدخول التجريبي (حسابات + رمز 2FA حي!) |
| `FEATURE_FLAGS` + `FEATURE_<KEY>`         | مفاتيح الميزات (تغلب على قواعد DB)                                              |
| `EMAIL_DRIVER`                            | `console` (يدوّن في var/emails) افتراضياً                                       |
| `STORAGE_DRIVER`                          | `local` (var/storage) افتراضياً                                                 |
| `PAYMENT_PROVIDER`                        | `bank_transfer` (افتراضي) أو `free`                                             |
| `TRUST_PROXY`                             | `false` إلا خلف proxy موثوق                                                     |

## الفصل 12 — استكشاف الأخطاء الشائعة

| العَرَض                              | السبب غالباً                            | الحل                                   |
| ------------------------------------ | --------------------------------------- | -------------------------------------- |
| build يفشل أو "port in use"          | السيرفر يعمل على 3002                   | أوقفه (3002 فقط) ثم `npm run build`    |
| `check:api-docs` يفشل                | أضفت endpoint دون توثيق                 | أضف السطر لـ `docs/API.md`             |
| خطأ typecheck على قاموس              | مفتاح i18n ناقص في لغة                  | أضفه في `types.ts` + اللغات الثلاث     |
| `db:seed` يتخطّى                     | حارس غير مفعّل                          | `$env:SEED_DEMO='true'`                |
| صفحة دخول بلا بطاقة demo             | `DEMO_MODE=false` أو الـ seed لم يشغّل  | فعّل الوضع + seed                      |
| رمز 2FA مرفوض                        | انتهت فترة 30 ثانية                     | جلب رمز جديد (البطاقة تتجدّد تلقائياً) |
| CSS كأنه بلا ألوان                   | توكن مفقود في `globals.css`             | أضف الدرجة كاملة (50→900)              |
| نتائج probe غريبة على PowerShell 5.1 | اقتباس/كوكي يُقسَّم عند التمرير لـ curl | تحقّق بـ `curl -v` قبل الحكم           |

## الفصل 13 — فهرس المستندات

| المستند                            | متى تفتحه                            |
| ---------------------------------- | ------------------------------------ |
| `README.md`                        | أول خطوة: تشغيل سريع                 |
| `docs/ARCHITECTURE.md`             | قرارات المعمارية والطبقات            |
| `docs/API.md`                      | كل نقطة نهاية وأشكال الطلبات/الردود  |
| `docs/DESIGN.md`                   | أي تغيير في الواجهة (قانون المراجعة) |
| `docs/OPERATIONS.md`               | النشر، النسخ الاحتياطي، المراقبة     |
| `docs/SECURITY.md`                 | التهديدات والضمانات                  |
| `docs/IMPLEMENTATION_CHECKLIST.md` | حالة بناء الميزات                    |
| `docs/MILESTONE_REPORT.md`         | تقارير المراحل                       |
| **`docs/HOW-IT-WORKS.md`**         | **هذا الدليل — ارجع إليه دائماً**    |
