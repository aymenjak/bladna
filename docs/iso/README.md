# BLADNA — ISO/IEC 27001:2022 readiness pack

> **Status: prepared for certification, not certified.** ISO/IEC 27001
> certification is granted to the _organization_ that operates the platform,
> after an audit by an accredited certification body. Software alone cannot be
> "ISO certified". This folder is the documentation an auditor asks for first,
> written against what the codebase actually does today.

## ملخص بالعربية

هذه الوثائق تُجهّز بلادنا لشهادة **ISO/IEC 27001:2022** (أمن المعلومات)، ولا تعني أن المنصة حاصلة على الشهادة.
الشهادة تُمنح للفريق أو المؤسسة التي تشغّل المنصة، بعد تدقيق من هيئة معتمدة.

- **ما هو جاهز:** معظم الضوابط التقنية مطبّقة في الكود (الصلاحيات، التشفير، سجل العمليات، التحقق الثنائي، النسخ الاحتياطي…)، وكل ضابط مربوط بالملف الذي يطبّقه في [بيان التطبيق](04-statement-of-applicability.md).
- **ما ينقص:** الضوابط التنظيمية والبشرية والمادية (تعيين المسؤولين، التدريب، العقود، مقر الاستضافة)، ثم التدقيق الداخلي والخارجي.
- **ما نقوله للجنة:** «المنصة مبنية وفق ضوابط ISO/IEC 27001، ووثائق التحضير للتدقيق جاهزة»، وليس «معتمدة ISO».

## Documents

| #   | Document                                                                                 | ISO/IEC 27001 clause / control |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| 01  | [ISMS scope and information security policy](01-isms-scope-and-policy.md)                | 4.3, 5.2, A.5.1, A.5.2         |
| 02  | [Asset inventory and classification](02-asset-inventory.md)                              | A.5.9, A.5.12                  |
| 03  | [Risk assessment and treatment register](03-risk-register.md)                            | 6.1.2, 6.1.3, 8.2, 8.3         |
| 04  | [Statement of Applicability (all 93 Annex A controls)](04-statement-of-applicability.md) | 6.1.3 d)                       |
| 05  | [Incident response and breach notification](05-incident-response.md)                     | A.5.24 – A.5.28, A.6.8         |
| 06  | [Records of processing and data retention](06-records-of-processing.md)                  | A.5.34; Algerian Law 18-07     |

Technical evidence already in the repository:

- [SECURITY.md](../SECURITY.md) — every implemented control with the file that implements it.
- [OPERATIONS.md](../OPERATIONS.md) — deployment, backup and restore (drill completed end-to-end).
- [ARCHITECTURE.md](../ARCHITECTURE.md) — system design and request pipeline.

## Related standards

| Standard                     | Status in BLADNA                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| ISO/IEC 27701 / 29100        | Privacy controls aligned (consent ledger, data-subject requests, minimisation); not audited        |
| ISO/IEC 25010                | Quality evidence: 495 automated unit tests, end-to-end browser suite; no formal evaluation         |
| ISO/IEC 40500 (WCAG 2.0)     | Accessibility work (ARIA labels, RTL, reduced motion); no formal accessibility audit               |
| ISO 3166 / 4217 / 639 / 8601 | Applied: country code `DZ`, currency `DZD`, locales `ar`/`fr`/`en`, ISO 8601 timestamps in the API |
| ISO/IEC 18004                | Attendance QR codes generated with a standard QR library (`qrcode`)                                |
| ISO 26000                    | Guidance standard (not certifiable); the sponsor/CSR features serve it                             |

## Road to certification

1. **Appoint roles** — information security owner and data protection officer (see document 01).
2. **Close the "Planned" controls** in the Statement of Applicability, starting with
   those marked _priority_.
3. **Host production in Algeria** with a provider whose own controls cover Annex A.7
   (physical) and A.8.20–8.22 (networks).
4. **Operate the ISMS for at least one cycle** — risk review, internal audit
   (clause 9.2), management review (clause 9.3) — and keep the records.
5. **Stage 1 and stage 2 audits** by an accredited certification body.

Owner of this pack: Team Athar (فريق أثر). Review: at least once a year and after
any significant change.
