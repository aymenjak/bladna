# BLADNA — PARTNERSHIPS & CSR ECOSYSTEM — Design Report

> **الحالة: بانتظار موافقة المستخدم** (وفق بند 28 من الموجّه: لا كتابة أي كود قبل اعتماد التصميم).
> **الأساس:** قراءة كاملة لـ `packages/database/prisma/schema.prisma` (2,392 سطرًا، 86 Model، 70 Enum) + جداول المسارات الحقيقية في `src/server/routes` + مصفوفة الصلاحيات في `packages/domain/src/rbac.ts` + وحدات `sponsors/csr/support/impact/matching`.
> **المبدأ: EXTEND BLADNA — وليس REBUILD.** لا حذف، لا استبدال، لا كسر: API، Auth، Volunteer، Organization، Opportunity، International، Campaigns، Impact، Support، Billing، Audit — كما هي.

---

## 1. EXISTING — الموجود حاليًا (موثّق بالفحص المباشر)

### الطبقات الثماني كما هي فعليًا في الـSchema

| #   | الطبقة                   | النماذج الموجودة (بالاسم الحقيقي)                                                                                                                                                                                             | الحالة                                          |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A   | المؤسسات والمنظمات       | `Organization` (بـ `OrganizationType.COMPANY` جاهز)، `OrganizationMember`، `OrganizationInvitation`، `OrganizationVerification`، `VerificationDocument`، مع `TrustLevel` و`VerificationStatus` و`OrganizationStatus`          | سليم — الهوية والتحقق والعضويات موجودة بالكامل  |
| B   | المبادرات                | `Opportunity` (مشكلة/هدف بالثلاث لغات، تصنيف، ولاية، مواصفات، طاقة استيعابية، أسئلة، طلبات، حضور، شهادات)، `OpportunityApplication`، `AttendanceSession`، `Attendance`، `VolunteerHour` (append-only)، `VolunteerCertificate` | سليم                                            |
| C   | الاحتياجات والدعم        | `SupportNeed` (4 أنواع: FINANCIAL/EQUIPMENT/MATERIAL/SERVICE، كمية، مبلغ هدف، تقدّم)، `SupportOffer` (PENDING→ACCEPTED/REJECTED مع سبب وصاحب قرار)                                                                            | موجود — **لكن العرض بشخص واحد فقط** (الفجوة 4)  |
| D   | المؤسسات الاقتصادية وCSR | `Sponsor` + `SponsorMember` + `CSRProgram` (ميزانية، أهداف ساعات/مستفيدين) + `Sponsorship` (CASH/IN_KIND)                                                                                                                     | موجود — **معزول عن `Organization`** (الفجوة 1)  |
| E   | قياس الأثر               | `ImpactMetric` (مرتبط Campaign/CSRProgram/Opportunity، هدف/فعلي/وحدة/مصدر/تحقق)                                                                                                                                               | موجود — **`source` نص حر بلا أدلة** (الفجوة 10) |
| F   | الحوكمة والأمان          | `Report`، `RiskAssessment`، `AuditLog`، `AdminAction`، `Incident`+`IncidentEvent`، `OrganizationVerification`، `TrustLevel`                                                                                                   | قوي — جاهز لاستيعاب أحداث الشراكات              |
| G   | التواصل                  | `Conversation`+`ConversationMember`+`Message`+`MessageRead`                                                                                                                                                                   | موجود — تراسل لا CRM                            |
| H   | الفوترة                  | `Plan`، `Subscription`، `Invoice`، `InvoiceItem`، `Payment`                                                                                                                                                                   | موجود — Billing للمنصة لا تمويل المشاريع        |

### ما يخدم الرؤية موجود أصلًا

- مسار المال الحالي موثّق: التمويل يمرّ بنك → منظمة، والمنصّة تسجّل الالتزام فقط (لا بوابة دفع) — `CampaignContribution` و`SupportOffer.amount` على نفس المبدأ.
- تعليق صريح في الـSchema (سطر 1731): «Sponsors fund programs; they can never edit volunteer verification records» — قاعدة §25 موجودة مسبقًا.
- `Counter` (اسم/قيمة) هو نمط الترقيم المنزلي — يصلح لأرقام الاتفاقيات (`agreement_number`) بلا نموذج جديد.
- `RiskAssessment.engineVersion` («rules-v1») هو النمط الذي سنعتمده لمحرّك المطابقة.
- `Notification`+`AuditLog` بمجال `action` نص حر — يستوعبان أحداث الشراكة الجديدة دون نماذج جديدة.

### مسارات API الحالية في النطاق (41 نقطة نهاية، موثّقة ومُزامَنة)

| الوحدة          | المسارات                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sponsors` (17) | `GET/POST /sponsors`، `GET/PATCH /sponsors/:id`، `POST /sponsors/:id/status`، الأعضاء (3)، الرعايات `GET/POST /sponsors/:id/sponsorships` + `transition`، `GET /orgs/:orgId/sponsorships`، إدارة `GET/POST /admin/sponsors` + `GET/PATCH /admin/sponsors/:id` + `status` |
| `csr` (7)       | `GET /csr/programs`، `GET /csr/programs/:id`، برنامج/تحويلات تحت `/sponsors/:sponsorId/programs...`                                                                                                                                                                      |
| `support` (9)   | احتياجات `GET/POST/PATCH/DELETE` تحت `/orgs/:orgId/opportunities/:id/support-needs...`، عروض `POST /opportunities/:slug/support-offers`، انتقال `POST .../support-offers/:offerId`، `GET /me/support-offers` + `cancel`                                                  |
| `impact` (7)    | `GET /impact`، `GET /impact/metrics`، تقارير `/orgs/:orgId/impact/report` و`/sponsors/:sponsorId/impact/report`، إنشاء مقاييس (حملة/مبادرة/برنامج CSR)                                                                                                                   |
| `matching` (1)  | `GET /me/recommendations` — **مطابقة متطوع↔فرصة فقط، لا مطابقة مؤسسات**                                                                                                                                                                                                  |

### صلاحيات موجودة سنبني عليها

`sponsor.read` · `sponsor.manage` · `csr.create` · `csr.manage` · `sponsorship.create` · `sponsorship.manage` · `impact.read` + صلاحيات المنظمات (`organization.update`، `opportunity.*`، `campaign.*`) + صلاحيات التوثيق (`organization.verify`) والإشراف (`moderation.action`, `audit.read`).

---

## 2. GAP ANALYSIS — الفجوات الاثنتا عشرة (كلها مؤكَّدة بالفحص)

| #   | الفجوة                                                 | الدليل في الشيفرة                                                                                             | الخطورة                                 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | `Organization` و`Sponsor` كيانان متوايران بلا رابط     | `model Sponsor` (سطر 1651) لا يحوي `organizationId` إطلاقًا                                                   | 🔴 عالية — تكرار هوية الشركة لاحقًا     |
| 2   | لا ملف اقتصادي حقيقي (قطاع، حجم، ميزانية CSR، تفضيلات) | حقول `Sponsor` = اسم/شعار/sector نص حر/جهة اتصال فقط                                                          | 🔴 — يحبط أي مطابقة مبنية على التفضيلات |
| 3   | لا محرّك مطابقة مؤسسات                                 | وحدة `matching` = توصيات متطوعين فقط (`/me/recommendations`)                                                  | 🔴 — قلب الرؤية مفقود                   |
| 4   | `SupportOffer` بشخص واحد                               | حقل `userId` مطلوب (سطر 1602) — لا `organizationId`                                                           | 🔴 — «الشركة تدعم» مستحيل تمثيلها       |
| 5   | لا `PartnershipRequest`                                | غير موجود في 86 نموذجًا                                                                                       | 🔴                                      |
| 6   | لا `Proposal` منظّم                                    | غير موجود                                                                                                     | 🔴                                      |
| 7   | لا `Agreement` ولا التزامات طرفين                      | غير موجود (فجوة مؤسساتية صريحة)                                                                               | 🔴                                      |
| 8   | `Sponsorship` ليس دورة تمويل                           | حقولها: مبلغ/نوع/حالة/مدة فقط (سطر 1712) — لا أقساط ولا صرف ولا إثباتات                                       | 🟡                                      |
| 9   | الدعم العيني = وصف نصي                                 | `Sponsorship.description` عند `kind=IN_KIND` فقط                                                              | 🟡                                      |
| 10  | الأثر بلا أدلة                                         | `ImpactMetric.source String` (سطر 1636) — لا صور ولا فواتير ولا تحقق مستند                                    | 🟡                                      |
| 11  | لا لوحة/t تقرير CSR تجميعي                             | تقارير `impact/report` تابعة للمنظمة/الراعي حسب المقاييس — لا تجميع مالي/جغرافي/قطاعي بفترة، ولا تقرير مؤتمَن | 🟡                                      |
| 12  | لا CRM شراكات                                          | `Conversation/Message` تراسل فقط — لا جهات اتصال ولا لقاءات ولا متابعات                                       | 🔴                                      |

**الخلاصة:** الأساس 60–70% فعلاً — وما ينقصه طبقة `Partnerships & CSR Ecosystem` فوقه، لا إعادة بناء.

---

## 3. PROPOSED ARCHITECTURE — البنية المقترحة

### 3.1 المبادئ الحاكمة

1. `Organization` تبقى نواة الهوية والتعاقد والصلاحيات (قاعدة البيت: عضوية المنظمة مصدر الصلاحيات الوحيد).
2. لا كيان مكرّر: كل مفهوم موجود يُعاد استخدامه؛ الجديد فقط ما لا نظير له.
3. الحالات الانتقالية في آلات حالة صريحة (`state-machines.ts` النمط)؛ الحالات النهائية لا تُعاد قرارها (نمط `CampaignContribution`).
4. المال Decimal دائمًا، لا Float؛ الأرقام تُشتق ولا تُخزَّن مزدوجة.
5. المطابقة قواعد deterministic قابلة للتفسير — بلا AI في الجوهر.
6. كل عملية حسّاسة → `AuditLog`؛ كل تغيير حالة يمرّ بنقاط `transition` المعلنة.

### 3.2 القرار D1 — علاقة المؤسسة الاقتصادية: الجسر الهجين (موصى به)

**المشكلة:** `Sponsor` و`Organization(COMPANY)` متوايران، و`CSRProgram.sponsorId` مطلوب لا يقبل بديلًا.

**الخيار A (دمج كامل):** `Organization` هي كل شيء، وCSR وظيفة عليها — نظيف طويل المدى لكنه يمسّ `CSRProgram`/`Sponsorship`/مسارات `/sponsors/*` وأدوار `SPONSOR_*` (كسر محتمل).

**الخيار B (رابط فقط):** `Sponsor.organizationId?` — آمن لكنه وحده لا يعطي الملف الاقتصادي.

**المركّب الموصى به (يجمع A وB كما طلبت):**

```
Organization (COMPANY أو أي منظمة تفعّل المشاركة الاقتصادية)
      │  1:1
      ├── EconomicInstitutionProfile   ← ملف §6 الكامل (القطاع، الحجم، الميزانية، التفضيلات)
      │
      └── Sponsor.organizationId @unique (جسر توافق)
              │
              └── CSRProgram / Sponsorship (تبقى كما هي تمامًا — صفر تعديل)
```

- الملف الجديد `EconomicInstitutionProfile` مربوط بـ`Organization` مباشرة (يطابق §6، ويجمع فيه ما اقترحتَه باسم `CSRProfile` في قائمة الوحدة — نموذج واحد لا اثنان).
- عند «تفعيل المشاركة الاقتصادية» تُنشأ/تُربط صفقة `Sponsor` تلقائيًا للمنظمة (جسر مشتق)، فتبقى كل مسارات `/sponsors/:sponsorId/programs` و`Sponsorship` و`ImpactMetric.csrProgramId` تعمل دون أي تعديل.
- **مصدر الحقيقة للهوية:** عند وجود `organizationId` تقرأ الواجهات الاسم/الشعار/التواصل من `Organization` (حقول `Sponsor` تبقى احتياطيًا للصفقات القديمة) — لا تكرار بيانات.
- الربط القديم (حسّابات `Sponsor` غير المرتبطة) يبقى كما هو — الترحيل لا يمسّ صفًا واحدًا.

### 3.3 القرار D2 — `SupportOffer` يمثّل المؤسسات

**الموصى به:** الإبقاء `userId` مطلوبًا (المُرسِل = المستخدم المُصادَق عليه دائمًا، وبذلك يبقى التدقيق والـAudit صحيحي المصدر) + إضافة `organizationId String?` (صفة «قدَّم العرض نيابة عن منظمة/شركة عضو فيها»).

- توافق رجعي كامل: كل الصفوف القديمة تبقى صالحة (userId مملوء، org فارغ).
- يحترم قاعدة البيت: معرّفات المنظمات إشارة يتحقق منها الخادم من العضوية الفعلية — لا ثقة بالمدخل.
- البديل (userId اختياري + CHECK «واحد من اثنين») ممكن لكنه يعقد الخدمة والفحص ويضعفAudit؛ البديل الأثقل (`Party/Actor` موحّد) إعادة بناء — كلاهما مرفوض لهذا الدور. مؤسسة اقتصادية غير مرتبطة بمنظمة لا تقدّم عرض إلا بعد التفعيل (جسر D1).

### 3.4 القرار D3 — `CSRProgram` يبقى مرساة على `Sponsor`

بفضل جسر D1 هذا ليس تنازلًا: الشركة عبر منظمتها ← جسر `Sponsor` ← برامجها كما هي. صفر تعديل على `CSRProgram`/`Sponsorship`/`ImpactMetric`. دمجها لاحقًا (نقل `sponsorId` إلى `organizationId`) مرحلة منفصلة اختيارية لا نحتاجها الآن.

### 3.5 القرار D4 — محرّك المطابقة: قواعد deterministic مادّية

- مدخلات المطابقة (كلها موجودة أو مقترحة): مجال CSR للجهة × مجال مبادرة، الولاية، نوع الدعم المطلوب مقابل ما تقدّمه الجهة، الميزانية (نطاق min/max في الملف الاقتصادي مقابل مبلغ الاحتياج)، نوع المنظمة، مستوى الثقة/التحقق، الفئة المستهدفة، حجم/مدة المبادرة.
- ناتج: `PartnerMatch` صف مادّية لكل (مبادرة، جهة اقتصادية): `score` 0–100 + `breakdown` Json تفصيلي `[{code, weight, points, detail}]` + `engineVersion` (نمط «rules-v1» في `RiskAssessment`) + `computedAt`.
- **لا صندوق أسود:** كل نقطة في النتيجة مفسَّرة («+ نفس الولاية»…)، والقوائم تُحسب عند الطلب أو إعادة الحساب الصريحة — لا AI في هذا الأساس (يُضاف لاحقًا فوق الطبقة نفسها).
- قراءة الشرح مضمّنة في الاستجابة — أساس «لماذا ظهرت الشركة بنسبة 94%».

### 3.6 النماذج المعاد استخدامها صراحةً (30)

`Organization` · `OrganizationMember` · `OrganizationInvitation` · `OrganizationVerification` · `VerificationDocument` · `Document` · `User` · `VolunteerProfile` (قراءة) · `Opportunity` · `OpportunityCategory` · `Attendance`/`VolunteerHour`/`VolunteerCertificate` (أدلة تنفيذ القراءة) · `Campaign` · `CampaignContribution` · `SupportNeed` · `SupportOffer` (+عمود) · `Sponsor` (+عمود) · `SponsorMember` · `CSRProgram` · `Sponsorship` · `ImpactMetric` · `Notification`/`NotificationDelivery`/`NotificationPreference` · `Conversation`/`Message` · `AuditLog` · `AdminAction` · `Report` · `RiskAssessment` · `Incident` · `Counter` (ترقيم الاتفاقية) · `Setting`/`FeatureFlag` · `AnalyticsEvent` · الجغرافيا `Country/Wilaya/City` · آلة Billing و`Subscription/Invoice/Payment` (بلا لمس) · إشارات `TrustLevel`/`VerificationStatus`.

### 3.7 النماذج الجديدة (20)

| #   | النموذج                      | المحتوى الأساسي                                                                                                                                                                                                             | يربط                                    |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | `EconomicInstitutionProfile` | sector، subSector، companySize، nationalScope، csrEnabled، esgEnabled، جهات تواصل CSR، أنواع دعم مفضّلة، فئات مستفدين مفضّلة، `minProjectBudget`، `maxProjectBudget`، `annualCSRBudget` (كل مالي Decimal)                   | `organizationId @unique` → Organization |
| 2   | `CSRFocusArea`               | المرجع: EDUCATION/YOUTH/EMPLOYMENT/DIGITAL/ENVIRONMENT/HEALTH/SPORT/CULTURE/SOCIAL/DISABILITY/WOMEN/RURAL_DEVELOPMENT/ENTREPRENEURSHIP/INNOVATION/COMMUNITY_DEVELOPMENT/OTHER + `nameAr/nameFr/nameEn` + active + sortOrder | مرجعي (بذرة 16)                         |
| 3   | `EconomicProfileFocusArea`   | تفضيلات الجهة (مع `priority Int`)                                                                                                                                                                                           | profile ↔ focusArea                     |
| 4   | `OpportunityFocusArea`       | مجالات أثر المبادرة                                                                                                                                                                                                         | opportunity ↔ focusArea                 |
| 5   | `PartnerMatch`               | score، breakdown Json، engineVersion، computedAt؛ فريد (initiative, economic org)                                                                                                                                           | opportunity ↔ economic organizationId   |
| 6   | `PartnershipRequest`         | requester/receiver organization، opportunity؟، csrProgramId؟، supportNeedId؟، مبلغ مطلوب؟، رسالة، status، submittedAt/reviewedAt/reviewedBy/decisionNote                                                                    | مؤسستان + المبادرة                      |
| 7   | `PartnershipProposal`        | title، requestedAmount، supportType، implementationPlan، expectedOutcomes، أهداف مستفيدين/متطوعين/ساعات، start/end، status، **`version @default(1)`** فريد (request, version) — النسخ السابقة لا تضيع                       | request (+ partnership عند القبول)      |
| 8   | `Partnership`                | النواة: `organizationId` (الجهة الشبابية) + `economicOrganizationId` (الاقتصادية) + opportunityId؟ + csrProgramId؟ + campaignId؟، partnershipType، status، start/end، totalValue، currency                                  | —                                       |
| 9   | `PartnershipAgreement`       | `agreementNumber` (عبر `Counter`)، title، agreementType، signedAt، start/end، totalValue، status، `documentId؟` (PDF عبر نظام الوثائق الموجود)                                                                              | partnership                             |
| 10  | `PartnershipObligation`      | party (طرف أول/ثانٍ)، description، dueDate، status، value؟، evidence documentId؟، verifiedAt/ById                                                                                                                           | partnership                             |
| 11  | `FundingCommitment`          | مبلغ ملزم، currency، status، مرجع `sponsorshipId?` عند النزول من رعاية قديمة، links csrProgramId؟                                                                                                                           | partnership                             |
| 12  | `FundingInstallment`         | رقم القسط، amount، dueAt، status، paidAt، evidenceDocumentId؟                                                                                                                                                               | commitment                              |
| 13  | `Disbursement`               | amount، executedAt، reference، evidenceDocumentId؟ (وصل)، status، verifiedById/At                                                                                                                                           | commitment + installment؟               |
| 14  | `InKindContribution`         | kind (EQUIPMENT/MATERIAL/TRANSPORTATION/FOOD/TRAINING/SERVICES/TECHNOLOGY/LOGISTICS/OTHER)، item، quantity، unit، estimatedValue، marketValue، deliveryDate، deliveryLocation، receivedById، evidence، status               | partnership                             |
| 15  | `ImpactEvidence`             | type (PHOTO/DOCUMENT/ATTENDANCE/CERTIFICATE/RECEIPT/INVOICE/REPORT/VIDEO/OTHER)، documentId؟، uploadedBy/At، status PENDING/VERIFIED/REJECTED، verifiedBy/At، notes                                                         | `metricId` → ImpactMetric               |
| 16  | `ImpactReport`               | الفترة، المؤشرات المؤتمَنة في `payload Json` (من بيانات موثقة فقط)، status DRAFT/GENERATED/PUBLISHED/ARCHIVED، generatedAt/By                                                                                               | sponsor + organization؟                 |
| 17  | `PartnershipContact`         | جهة اتصال: name، role، email، phone                                                                                                                                                                                         | partnership                             |
| 18  | `PartnershipInteraction`     | type MEETING/CALL/EMAIL/MESSAGE/EVENT/SITE_VISIT/OTHER، occurredAt، participants، notes، nextAction، nextActionAt                                                                                                           | partnership                             |
| 19  | `PartnershipFollowUp`        | متابعة: title، dueAt، status OPEN/DONE/CANCELLED، ownerId                                                                                                                                                                   | partnership + interaction؟              |
| 20  | `PartnershipNote`            | ملاحظة داخلية: body، authorId                                                                                                                                                                                               | partnership                             |

**الاختلافان عن قائمة الوحدة في موجّهك (معلَّمان للنقاش):** `CSRProfile` مُدمج في `EconomicInstitutionProfile` (نموذج واحد، §6)؛ `PartnershipNotification` **غير منتج** — نستخدم `Notification` الموجود كما تنصّ القاعدة 22.

### 3.8 Enums الجديدة (15)

`EconomicCompanySize` (MICRO/SMALL/MEDIUM/LARGE/ENTERPRISE) · `EconomicSector` (مرجعي، مع إبقاء `Sponsor.industry` نصي للقديم) · `PartnershipRequestStatus` (DRAFT/SUBMITTED/UNDER_REVIEW/REQUEST_INFO/SHORTLISTED/NEGOTIATION/APPROVED/REJECTED/CANCELLED/EXPIRED) · `PartnershipProposalStatus` (DRAFT/SUBMITTED/UNDER_REVIEW/ACCEPTED/REJECTED/WITHDRAWN/SUPERSEDED) · `PartnershipStatus` (PROPOSED/ACTIVE/PAUSED/COMPLETED/CANCELLED/TERMINATED) · `PartnershipType` (SPONSORSHIP/SERVICE/IN_KIND/COOPERATION/PRO_BONO) · `AgreementStatus` (DRAFT/PENDING_SIGNATURE/ACTIVE/EXPIRED/TERMINATED) · `AgreementType` · `ObligationParty` (INITIATIVE_ORGANIZATION/ECONOMIC_ORGANIZATION) · `ObligationStatus` (PENDING/IN_PROGRESS/FULFILLED/WAIVED/BREACHED) · `FundingCommitmentStatus` (PENDING/COMMITTED/CANCELLED/TERMINATED) · `FundingInstallmentStatus` (SCHEDULED/PAID/CANCELLED) · `DisbursementStatus` (SCHEDULED/EXECUTED/VERIFIED/REJECTED) · `InKindStatus` (PLANNED/DELIVERED/RECEIVED/VERIFIED/REJECTED) · `EvidenceStatus` (PENDING/VERIFIED/REJECTED) · `PartnershipInteractionType` · `ImpactReportStatus` (DRAFT/GENERATED/PUBLISHED/ARCHIVED).

**امتدادات Exist (إضافية آمنة):** `NotificationType` += `PARTNERSHIP_MATCH` · `PARTNERSHIP_REQUEST` · `PROPOSAL_RECEIVED` · `PROPOSAL_ACCEPTED` · `PROPOSAL_REJECTED` · `AGREEMENT_SIGNED` · `FUNDING_COMMITTED` · `FUNDING_DISBURSED` · `EVIDENCE_REQUIRED` · `IMPACT_VERIFICATION` · `REPORT_READY` (إعادة استخدام `DEADLINE_REMINDER` و`NEW_MATCHING_OPPORTUNITY` بدل تكرارهما).

### 3.9 أعمدة جديدة على نماذج موجودة (2 — آمنة)

- `Sponsor.organizationId String? @unique` → Organization (جسر D1).
- `SupportOffer.organizationId String?` → Organization (قرار D2).
- (لا شيء آخر يُمسّ: `CSRProgram`/`Sponsorship`/`ImpactMetric`/`Opportunity`/`Campaign` بلا تغيير.)

---

## 4. MIGRATION PLAN — خطة الترحيل (backward-compatible بالكامل)

| الخطوة | المحتوى                                                                                                                                                                                 | الأمان                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `0012_partnerships_csr` — إنشاء 20 جدولًا جديدًا بالفهارس والفهارس الفريدة والقيود                                                                                                      | إنشاء فقط — لا مساس بالجداول القديمة                                                                                                                                                                                         |
| 2      | داخله أيضًا: `ALTER TABLE "Sponsor" ADD COLUMN "organizationId"` فريد اختياري بـFK؛ `ALTER TABLE "SupportOffer" ADD COLUMN "organizationId"` اختياري بـFK                               | إضافة أعمدة nullable — لا أثر على أي صف قديم أو أي استعلام حالي                                                                                                                                                              |
| 3      | إنشاء Enums الـ15 الجديدة + قيم `NotificationType` الإضافية                                                                                                                             | `ALTER TYPE ... ADD VALUE` داخل معاملة مخفية في PostgreSQL القديم: إن اشتكى المولّد نُقلت أحداث Enum إلى `0013_notification_partnerships` بـ`prisma db execute` غير المعاملاتي (نمط SQL الخام المقبول في `0002_constraints`) |
| 4      | قيود CHECK اختيارية بأرقام موجبة (نمط `0011`/`VolunteerHour`): مبالغ `FundingInstallment/Disbursement/InKind` > 0                                                                       | Prisma لا يعبّر عن CHECK — يُكتب SQL خام كما جرى سابقًا                                                                                                                                                                      |
| 5      | Backfill: **لا حاجة** — جداول جديدة فارغة، والأعمدة الجديدة NULL افتراضيًا. ربط صفوف `Sponsor` القديمة بمنظماتها إن وُجدت تطابق = عملية seed/تشغيل يدوية لا جزء من الترحيل              |
| 6      | Seed: `CSRFocusArea` (16 × 3 لغات) + سلسلة تجريبية جزائرية واقعية (منظمة شبابية بولاية + مبادرة باحتياجات + شركة اقتصادية بملف + برنامج CSR + طلب شراكة → اتفاقية → قسط → دليل → تقرير) | يبقى تحت `db:seed` المعتاد، والبيانات التجريبية الحالية (مبادرة ONLINE) لا تُمسّ                                                                                                                                             |
| 7      | التحقق: `prisma validate` + `migrate diff` offline (بيئة بلا Docker) ثم بوّابة كاملة بعد كل مرحلة تنفيذ: `npm run validate` + E2E + probe + P1 + P2 + `prettier --check .`              | لا يُعتمد أي مرحلة قبل خضوعها للبوابات                                                                                                                                                                                       |

**ما لن نكسره (قائمة الحراسة):** مسارات `/sponsors/*` و`/csr/*` و`/support` و`/impact` الحالية تعمل حرفيًا بلا تعديل؛ `SupportOffer.userId` يبقى مطلوبًا؛ `CSRProgram.sponsorId` يبقى مطلوبًا؛ آلات `Opportunity`/`Application`/`Hours`/`Sponsorship` لا تتأثر؛ أعمدة جديدة فقط nullable.

---

## 5. API PLAN — هندسة الواجهات

كلها تصعد إلى جدول `platform` (137 حاليًا ← يكبر)، بأنماط البيت نفسها (`/orgs/:orgId`، `/sponsors/:sponsorId`، `/me`، `/admin`، `/transition`)، مع فرز Zod، وفهرس `docs/API.md` يبقى مُزامَنًا بأمر `check:api-docs`، وفحص `check-routes` يمنع التكرار.

### ملف المؤسسة الاقتصادية والمطابقة

| Method                  | Path                                               | الفاعل                           |
| ----------------------- | -------------------------------------------------- | -------------------------------- |
| `GET/PATCH`             | `/orgs/:orgId/economic-profile`                    | أعضاء المنظمة                    |
| `POST`                  | `/orgs/:orgId/economic-profile/activate`           | OWNER/ADMIN — ينشئ جسر `Sponsor` |
| `PUT`                   | `/orgs/:orgId/economic-profile/focus-areas`        | OWNER/MANAGER                    |
| `GET`                   | `/csr-focus-areas`                                 | عام                              |
| `GET/POST/PATCH/DELETE` | `/admin/csr-focus-areas`                           | SUPER_ADMIN                      |
| `GET`                   | `/orgs/:orgId/partner-matches?minScore=&wilayaId=` | جهة اقتصادية: مبادرات مطابقة     |
| `GET`                   | `/opportunities/:id/partner-matches`               | جهة شبابية: شركات مطابقة         |
| `POST`                  | `/opportunities/:id/partner-matches/recompute`     | صاحب المبادرة (أو cron)          |
| `GET`                   | `/partner-matches/:id`                             | الطرفان — يعيد breakdown مفصّل   |

### دورة الشراكة

| Method           | Path                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST`           | `/partnership-requests` (أي طرف يبدأ)                                                                                            |
| `GET`            | `/me/partnership-requests` · `GET` `/orgs/:orgId/partnership-requests`                                                           |
| `POST`           | `/partnership-requests/:id/transition` (SUBMITTED/UNDER_REVIEW/REQUEST_INFO/SHORTLISTED/NEGOTIATION/APPROVED/REJECTED/CANCELLED) |
| `POST`           | `/partnership-requests/:id/proposals` (إصدار جديد = `version++`، السابق SUPERSEDED)                                              |
| `POST`           | `/partnership-proposals/:id/transition` — القبول ينشئ `Partnership`                                                              |
| `GET/POST`       | `/partnerships` · `/partnerships/:id` · `/partnerships/:id/transition`                                                           |
| `GET/POST/PATCH` | `/partnerships/:id/obligations` + `/obligations/:id/transition`                                                                  |
| `POST`           | `/partnerships/:id/agreements` + `/agreements/:id/transition` (أرقام من `Counter`)                                               |
| `POST`           | `/partnerships/:id/funding-commitments` + `/transition`                                                                          |
| `GET/POST`       | `/funding-commitments/:id/installments` + `/transition` (PAID نهائية)                                                            |
| `POST`           | `/funding-commitments/:id/disbursements` + `/verify` (ضمن التحقق)                                                                |
| `GET/POST`       | `/partnerships/:id/in-kind` + `/transition` (PLANNED→…→VERIFIED/REJECTED)                                                        |

### الأدلة والتقرير والـCRM

| Method                  | Path                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `POST/GET`              | `/impact/metrics/:metricId/evidence` + `/verify` (ضابط التحقق فقط)               |
| `GET`                   | `/sponsors/:sponsorId/csr/dashboard` (مالي/مشاريع/أثر/جغرافيا/قطاعات)            |
| `POST/GET`              | `/sponsors/:sponsorId/impact/reports` (توليد → نشر) + `GET /impact/reports/:id`  |
| `GET/POST/PATCH/DELETE` | `/partnerships/:id/crm/contacts` · `…/interactions` · `…/follow-ups` · `…/notes` |
| `POST`                  | `/support-offers` (بديل المسار الحالي) — يقبل `organizationId`                   |

**إشعار وتدقيق:** كل انتقال → `NotificationType` المناسب + `AuditLog` بأحداث: `ECONOMIC_INSTITUTION_VERIFIED` · `CSR_PROGRAM_CREATED` · `PARTNERSHIP_CREATED` · `PROPOSAL_SUBMITTED/ACCEPTED/REJECTED` · `AGREEMENT_SIGNED` · `FUNDING_COMMITTED/DISBURSED` · `EVIDENCE_UPLOADED` · `IMPACT_VERIFIED` · `PARTNERSHIP_TERMINATED`.

---

## 6. PERMISSION MATRIX — مصفوفة الصلاحيات

### صلاحيات جديدة (إضافة لـ`rbac.ts` — لا استبدال)

`economic.profile.manage` · `partner.match.read` · `partnership.request.create` · `partnership.request.review` · `partnership.proposal.manage` · `partnership.manage` · `partnership.agreement.manage` · `partnership.funding.manage` · `partnership.obligation.update` · `partnership.evidence.manage` · `impact.evidence.verify` · `partnership.report.generate` · `partnership.crm.manage` · `partnership.moderate` — كلها تُستدعى بالنمط `requirePermission(permission, { organizationId })` (حدود الاستئجار من `OrganizationMember` فقط).

### المصفوفة

| القدرة                                  | منظمة شبابية (عضوية `OrgMemberRole`) | مؤسسة اقتصادية (نفس العضوية + ملف مفعّل) | ضابط التحقق                      | إدارة/إشراف | متطوّع/عام    |
| --------------------------------------- | ------------------------------------ | ---------------------------------------- | -------------------------------- | ----------- | ------------- |
| ملف اقتصادي + مجالات CSR                | —                                    | ✅ `economic.profile.manage`             | 👁 قراءة                          | ✅          | 👁 عام         |
| قراءة المطابقة (طرفيها)                 | ✅ شركاتها المطابقة                  | ✅ مبادراتها المطابقة                    | 👁                                | ✅          | ❌            |
| إنشاء طلب شراكة                         | ✅                                   | ✅                                       | ❌                               | ✅          | ❌            |
| مراجعة/قرار الطلب                       | ✅ (الطرف المتلقّي فقط)              | ✅ (الطرف المتلقّي فقط)                  | ❌                               | ✅          | ❌            |
| مقترحات + نسخها                         | ✅                                   | ✅                                       | ❌                               | ✅          | ❌            |
| الشراكة + التزاماتها                    | ✅ التزامات طرفها فقط                | ✅ التزامات طرفها فقط                    | ❌                               | ✅          | ❌            |
| اتفاقية                                 | ✅                                   | ✅                                       | ❌                               | ✅          | ❌            |
| التمويل (التزام/أقساط/صرف)              | ❌ (تقرأ)                            | ✅ `partnership.funding.manage`          | ✅ تحقق وثائق الصرف              | ✅          | ❌            |
| دعم عيني                                | ✅ تسجيل/تسليم                       | ✅ تسجيل/تسليم                           | ✅ تحقق                          | ✅          | ❌            |
| رفع أدلة الأثر                          | ✅                                   | ✅                                       | ✅                               | ✅          | ❌            |
| **التحقق من الأثر (VERIFIED/REJECTED)** | ❌                                   | ❌                                       | ✅ وحده `impact.evidence.verify` | عبر الضابط  | ❌            |
| تقرير CSR                               | 👁 تقرير شركائها                      | ✅ `partnership.report.generate`         | 👁                                | ✅          | 👁 المنشور فقط |
| CRM الشراكة                             | ✅ طرفها                             | ✅ طرفها                                 | ❌                               | ✅          | ❌            |
| **ساعات/شهادات/حضور المتطوّع**          | ✅ (المنطق الحالي كما هو)            | **❌ ممنوع مطلقًا**                      | ✅ (المنطق الحالي)               | ✅          | ❌            |

**قيود أمنية صريحة (§25) تُطبَّق بالفصل لا بالرجاء:** المؤسسة الاقتصادية لا تملك الأذونات الأصلية `hours.verify`/`certificate.issue`/`attendance.verify` أصلًا — فصل الأنواع يجعل الاستحالة بنيوية؛ ولا تعديل ولا حذف لـ`AuditLog` إطلاقًا؛ وكل رفع دليل يُسجَّل بـ`documentId` ومالكه وطابعته عبر نظام `Document` الحالي (حجر الصحي والماسح كما هما).

---

## 7. WORKFLOW — الدورة الكاملة وآلات الحالات

### المسار التجاري (20 خطوة من الموجّه ↔ النموذج ↔ المسار)

```
1-2. جمعية تسجل مبادرة (Opportunity) ← تتحقق BLADNA (VerificationStatus/TrustLevel — موجود)
3.  تحدد الاحتياجات (SupportNeed — موجود) + مجالات الأثر (OpportunityFocusArea — جديد)
4-5. المحرّك يحلل ويطابق (PartnerMatch — جديد، قواعد rules-v1)
6.  قائمة مرتبة: شركة A 95% · B 91% · C 84% (مع breakdown مفسَّر)
7-8. الشركة ترى المبادرة: المشكلة/الهدف/الميزانية/المستفيدون/الأثر المتوقع/مستوى الثقة
9-10. تقديم/قبول عبر PartnershipRequest → PartnershipProposal (نسخ محفوظة)
11-12. إنشاء Partnership → توقيع Agreement (رقم، PDF، التزامات للطرفين)
13-14. FundingCommitment → أقساط → Disbursement (وصول) أو InKindContribution (تسليم)
15-16. التنفيذ: الأنشطة والحضور والساعات — الأنظمة الحالية كما هي تمامًا
17-18. Evidence (ImpactEvidence) ← Verification (ضابط التحقق فقط)
19.   ImpactMetric (الموجود) تُغذّى من أداء مقاس + أدلة موثّقة
20.   ImpactReport → لوحة CSR + تقرير PDF مؤتمَن
```

### آلات الحالات (انتقالات مشروطة، الحالات النهائية لا تُعاد)

| الآلة                   | الانتقالات                                                 |
| ----------------------- | ---------------------------------------------------------- |
| `PartnershipRequest`    | `DRAFT→SUBMITTED→UNDER_REVIEW→{REQUEST_INFO→UNDER_REVIEW   | SHORTLISTED→NEGOTIATION→APPROVED                                    | REJECTED}`·`SUBMITTED→CANCELLED`· انتهاء المهلة →`EXPIRED` (cron) |
| `PartnershipProposal`   | `DRAFT→SUBMITTED→UNDER_REVIEW→{ACCEPTED (ينشئ Partnership) | REJECTED}`· إصدار جديد → السابق`SUPERSEDED`                         |
| `Partnership`           | `PROPOSED→ACTIVE→{PAUSED⇄ACTIVE                            | COMPLETED                                                           | CANCELLED                                                         | TERMINATED}` |
| `PartnershipAgreement`  | `DRAFT→PENDING_SIGNATURE→ACTIVE→{EXPIRED                   | TERMINATED}`                                                        |
| `PartnershipObligation` | `PENDING→IN_PROGRESS→FULFILLED` · `→WAIVED` · `→BREACHED`  |
| `FundingCommitment`     | `PENDING→COMMITTED→{CANCELLED                              | TERMINATED}` — التقدّم (مسدد/متبقٍ) **يُشتق** من الأقساط لا يُخزَّن |
| `FundingInstallment`    | `SCHEDULED→PAID` (نهائية) · `→CANCELLED`                   |
| `Disbursement`          | `SCHEDULED→EXECUTED→{VERIFIED                              | REJECTED}` (نهائية — نمط «لا إعادة قرار»)                           |
| `InKindContribution`    | `PLANNED→DELIVERED→RECEIVED→{VERIFIED                      | REJECTED}`                                                          |
| `ImpactEvidence`        | `PENDING→{VERIFIED                                         | REJECTED}` — نهائية، append-only                                    |
| `ImpactReport`          | `DRAFT→GENERATED→PUBLISHED→ARCHIVED`                       |

---

## 8. DATABASE DIAGRAM — المخطط النصي (ERD)

```
                        EXISTING CORE (untouched)
┌──────────────┐      ┌──────────────┐       ┌──────────────────┐
│     User     │      │  Opportunity │       │     Campaign     │
└──────┬───────┘      └──────┬───────┘       └────────┬─────────┘
       │ members             │ supportNeeds           │ metrics / sponsorships
┌──────▼───────┐      ┌──────▼───────┐       ┌────────▼─────────┐
│ Organization │──────│  SupportNeed │       │   ImpactMetric   │
│ (COMPANY..)  │      └──────┬───────┘       └────────┬─────────┘
└──┬───────┬───┘             │ offers                 │ evidence (NEW)
   │       │          ┌──────▼───────┐       ┌────────▼─────────┐
   │ 1:1   │ bridge   │ SupportOffer │       │  ImpactEvidence  │
   │       │ (NEW .orgId)            │       │      (NEW)       │
┌──▼──────────────┐    └──────────────┘       └──────────────────┘
│ EconomicInstitu-│
│ tionProfile    │◄─┐
│    (NEW)       │  │ m:n CSRFocusArea (NEW, seed 16)
└──┬─────────────┘  │        ▲ m:n OpportunityFocusArea (NEW)
   │ activate()     │        │
┌──▼─────────────┐  │  ┌─────┴─────────────────────────┐
│ Sponsor(+orgId)│──┘  │  PartnerMatch (NEW)           │
│    (bridge)    │     │  opportunity × economicOrg    │
└──┬─────────────┘     │  score + breakdown + rules-v1 │
   │ (existing,        └────────────────────────────────┘
   │  untouched)
┌──▼─────────┐   ┌───────────────┐
│ CSRProgram │   │   Sponsorship │   (existing — zero edits)
└──────┬─────┘   └───────────────┘
       │
═══════╪══════════ PARTNERSHIP CLUSTER (all NEW) ════════════
       │
┌──────▼──────────────┐   ┌─────────────────────┐
│ PartnershipRequest  │──►│ PartnershipProposal │ (versioned)
└──────────┬──────────┘   └──────────┬──────────┘
           │ accepted                │
┌──────────▼──────────────────────────▼──────────┐
│ Partnership                                   │
│ orgId (youth) ↔ economicOrganizationId (firm) │
│ + opportunityId? + csrProgramId? + campaignId?│
└──┬──────────┬──────────────┬──────────────┬───┘
   │          │              │              │
   ▼          ▼              ▼              ▼
Agreement  Obligations   FundingCommitment  InKindContribution
(+Counter  (party A/B)        │              (kind, qty, value)
 +Document)                   ├─► FundingInstallment
                              └─► Disbursement ─► evidence Docs
   │
   ├─► PartnershipContact / Interaction / FollowUp / Note  (CRM)
   └─► ImpactReport (period, verified payload Json, PDF)

Reuse edges: Notification (+11 types) · AuditLog (+events) · Document
(tracking) · Counter (agreement_number) · Conversation (escalation)
```

---

## 9. Deliverables — حالة التسليم ومراحل التنفيذ المقترحة

**مكتمل في هذا التقرير:** 1 تحليل الـSchema · 2 النماذج المعاد استخدامها · 3 النماذج الجديدة · 4 Enums الجديدة · 5 العلاقات الجديدة · 6 ERD.
**يتلو الموافقة:** 7 Prisma Schema الفعلي · 8 استراتيجية الترحيل (0012/0013) · 9 معمارية API (نقاط 5 أعلاه تصبح مسارات فعلية) · 10 RBAC · 11 خوارزمية المطابقة (rules-v1 بموازين معلنة) · 12 workflows · 13 دورة التمويل · 14 تدقيق الأدلة · 15 معمارية لوحة CSR · 16 معمارية التقرير · 17 أحداث الإشعار · 18 أحداث التدقيق · 19 seed جزائري · 20 أمثلة واقعية.

**مراحل التنفيذ المقترحة (كل واحدة ببوّابتها الكاملة):**

| المرحلة                                 | المحتوى                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 (P33)** ✅ **(منفَّذ 2026-10-05)** | Schema + ترحيل 0012/0013 + Seed + عميل Prisma المولَّد + مزامنة الوثائق — بوّابات خضراء بلا أي مساس بالمسارات القديمة (21 نموذجًا، 21 enum، صفر حذف؛ 0013 أعاد الفهارس الثلاثة التي كشفها فرق 0012 كـdrift مُعلَن)                                                                                                                                                                                                                                                        |
| **M2 (P34)** ✅ **(منفَّذ 2026-10-05)** | وحدات الخدمة + 43 مسارًا (12 اقتصادي + 16 شراكات + 11 تمويل + 3 أدلة + 1 دعم أساسي) + 14 صلاحية جديدة (`partner.match.read` لكل الأدوار) + 11 آلة حالات باختبارات حصرية شاملة + حارس الجوانب `partnership-access.ts` (403 يذكر الصلاحية المفقودة / 404 للغريب) + التمويل للجهة الاقتصادية والتحقق للضابط فقط + قبول المقترح يؤسّس الشراكة ويغلق الطلب مع منع التكرار + عدّاد `AGR-YYYY-######` + Audit بأسماء أحداث العقد — صفر تغييرات Schema، API 312/312، اختبارات 489 |     |
| **M3 (P35)**                            | محرّك المطابقة rules-v1 + إعادة الحساب + شرح النقاط + اختبارات حسابية                                                                                                                                                                                                                                                                                                                                                                                                     |
| **M4 (P36)**                            | لوحة CSR + تقرير الأثر PDF (pdfkit) + أحداث الإشعار + CRM                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **M5 (P37)**                            | الواجهة بالثلاث لغات (RTL أولًا) + E2E للدورة كاملة                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 10. نقاط القرار المطلوبة منك قبل أي سطر كود

1. **D1 — الجسر الهجين** (ملف اقتصادي على `Organization` + `Sponsor.organizationId` تلقائي + `CSRProgram` بلا تعديل): مقبول؟ أم تفضّل الدمج الكامل (خيار A) الآن مع تحمّل ترحيل أثقل؟
2. **D2 — عرض الدعم:** `userId` يبقى مطلوبًا + `organizationId` اختياري (موصى به) — أم userId اختياري مع CHECK «واحد من اثنين»؟
3. **النطاق والترتيب:** هل توافق على التسليم على خمس مراحل M1→M5 (Schema أولًا كما ينصّ الموجّه، ثم API، ثم المطابقة، ثم اللوحة/التقرير، ثم الواجهة) — أم تدمج M1+M2 في مرحلة واحدة؟
4. **الدمج في الملف:** تسمية `EconomicInstitutionProfile` نموذجًا واحدًا يجمع ما اسماه الموجّه `CSRProfile` أيضًا — موافق؟
5. **النطاق التحريري:** هل نتجاوز الواجهة (M5) حتى تتم الدورة خلف الكاشفات، أم الواجهة أولوية لعرض الوزارة؟

**قرارات مُعتمَدة (2026-10-05 — «اعمل المناسب على المدى الطويل»):** D1 = الخيار الهجّير باتجاه A الكامل لاحقًا (`Organization` نواة، `Sponsor` جسر توافق 1:1، وكل نموذج جديد يركب على `Organization` مباشرة) · D2 = `userId` مطلوب + `organizationId` اختياري · D3 = خمس مراحل M1→M5 بوّابة لكل واحدة · D4 = `EconomicInstitutionProfile` نموذج واحد · D5 = الواجهة في M5.

**بانتظار موافقتك — يبدأ تنفيذ Prisma Schema فور الاعتماد.**
