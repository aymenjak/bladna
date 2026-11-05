# 04 — Statement of Applicability (SoA)

ISO/IEC 27001:2022 clause 6.1.3 d) — all 93 Annex A controls.

**Status legend:** ✅ **Implemented** (evidence in the codebase or repository) ·
🟡 **Partial** · 📝 **Drafted** (documented in this pack, not yet operated) ·
⏳ **Planned** · ➖ **Not applicable / inherited** (with justification).

Paths are relative to the repository root; `server/` means `apps/web/src/server/`.

## A.5 Organizational controls (37)

| Control | Title                                                         | Status | Evidence / justification                                                                                                                                               |
| ------- | ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1     | Policies for information security                             | 📝     | Policy in document 01                                                                                                                                                  |
| 5.2     | Information security roles and responsibilities               | 📝     | Roles table in document 01; holders to confirm                                                                                                                         |
| 5.3     | Segregation of duties                                         | 🟡     | Separate system roles in `packages/domain/src/rbac.ts`; organizational rule in document 01                                                                             |
| 5.4     | Management responsibilities                                   | 📝     | Commitments in document 01                                                                                                                                             |
| 5.5     | Contact with authorities                                      | 📝     | ANPDP notification path in document 05                                                                                                                                 |
| 5.6     | Contact with special interest groups                          | ⏳     | Join a national CERT / security community mailing list                                                                                                                 |
| 5.7     | Threat intelligence                                           | ⏳     | Subscribe to advisories for Node.js, Next.js, PostgreSQL                                                                                                               |
| 5.8     | Information security in project management                    | ✅     | Security requirements tracked in `docs/IMPLEMENTATION_CHECKLIST.md` and `docs/SECURITY.md`                                                                             |
| 5.9     | Inventory of information and other associated assets          | 📝     | Document 02                                                                                                                                                            |
| 5.10    | Acceptable use of information and other associated assets     | ⏳     | Acceptable-use rules for team members                                                                                                                                  |
| 5.11    | Return of assets                                              | ⏳     | Off-boarding checklist (accounts, keys, devices)                                                                                                                       |
| 5.12    | Classification of information                                 | 📝     | Scheme in document 02                                                                                                                                                  |
| 5.13    | Labelling of information                                      | 🟡     | Public verification returns only fields marked public (`server/modules/public.ts`)                                                                                     |
| 5.14    | Information transfer                                          | 🟡     | TLS at the reverse proxy; HSTS (`src/proxy.ts`); no external transfers wired                                                                                           |
| 5.15    | Access control                                                | ✅     | Server-side RBAC on every request (`server/guards.ts`, `packages/domain/src/rbac.ts`)                                                                                  |
| 5.16    | Identity management                                           | ✅     | Unique accounts, email verification, account states `SUSPENDED`/`BANNED`/`DELETED` (`server/guards.ts`)                                                                |
| 5.17    | Authentication information                                    | ✅     | scrypt hashes, password policy, single-use recovery codes (`packages/auth`)                                                                                            |
| 5.18    | Access rights                                                 | ✅     | Organization roles from `OrganizationMember` rows; inactive memberships lose access (`server/guards.ts`)                                                               |
| 5.19    | Information security in supplier relationships                | ⏳     | Select an Algerian hosting provider; assess its controls                                                                                                               |
| 5.20    | Addressing information security within supplier agreements    | ⏳     | Data-processing clauses in the hosting contract                                                                                                                        |
| 5.21    | Managing information security in the ICT supply chain         | 🟡     | Locked dependencies (`package-lock.json`); `npm audit` gate in CI (`.github/workflows/ci.yml`)                                                                         |
| 5.22    | Monitoring, review and change management of supplier services | ⏳     | Annual supplier review                                                                                                                                                 |
| 5.23    | Information security for use of cloud services                | ⏳     | Applies once production hosting is chosen                                                                                                                              |
| 5.24    | Incident management planning and preparation                  | 📝     | Document 05                                                                                                                                                            |
| 5.25    | Assessment and decision on information security events        | 📝     | Severity scale in document 05                                                                                                                                          |
| 5.26    | Response to information security incidents                    | 🟡     | Procedure in document 05; session revocation and account suspension available in the admin console                                                                     |
| 5.27    | Learning from information security incidents                  | 📝     | Post-incident review step in document 05                                                                                                                               |
| 5.28    | Collection of evidence                                        | ✅     | Append-only audit log with request id, IP and user agent (`server/services/audit.ts`)                                                                                  |
| 5.29    | Information security during disruption                        | 🟡     | Restore procedure (`docs/OPERATIONS.md` §4)                                                                                                                            |
| 5.30    | ICT readiness for business continuity                         | 🟡     | Backup and restore drill completed; ⏳ recovery time objective and standby host                                                                                        |
| 5.31    | Legal, statutory, regulatory and contractual requirements     | 🟡     | Law 18-07 / 25-11 privacy policy and terms (`apps/web/src/ui/i18n/*.ts`); ⏳ ANPDP declaration                                                                         |
| 5.32    | Intellectual property rights                                  | ✅     | Licensed photos with attribution page (`apps/web/src/ui/photo-credits.ts`, `/credits`)                                                                                 |
| 5.33    | Protection of records                                         | ✅     | Append-only hours, payments ledger and audit log (`docs/SECURITY.md` §7–8, §11)                                                                                        |
| 5.34    | Privacy and protection of PII                                 | 🟡     | Consent ledger, data-subject requests, masking (`docs/SECURITY.md` §9); guardian consent for minors at registration (`GuardianConsent`, `registerSchema`); document 06 |
| 5.35    | Independent review of information security                    | ⏳     | Internal audit, then certification audit                                                                                                                               |
| 5.36    | Compliance with policies, rules and standards                 | 🟡     | CI enforces typecheck, lint, format, tests (`.github/workflows/ci.yml`)                                                                                                |
| 5.37    | Documented operating procedures                               | ✅     | `docs/OPERATIONS.md` (deploy, backup, restore)                                                                                                                         |

## A.6 People controls (8)

| Control | Title                                                      | Status | Evidence / justification                                                            |
| ------- | ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| 6.1     | Screening                                                  | ⏳     | Background check for anyone given `SUPER_ADMIN` or database access                  |
| 6.2     | Terms and conditions of employment                         | ⏳     | Security clause in team agreements                                                  |
| 6.3     | Information security awareness, education and training     | ⏳     | Annual training on this pack and on Law 18-07                                       |
| 6.4     | Disciplinary process                                       | ⏳     | Defined with the team agreement                                                     |
| 6.5     | Responsibilities after termination or change of employment | ⏳     | Off-boarding: revoke sessions, rotate secrets                                       |
| 6.6     | Confidentiality or non-disclosure agreements               | ⏳     | NDA for team members and administrators                                             |
| 6.7     | Remote working                                             | ⏳     | Rules for workstations holding `.env` (disk encryption, screen lock)                |
| 6.8     | Information security event reporting                       | 📝     | Reporting channel in document 05; vulnerability reporting in `docs/SECURITY.md` §16 |

## A.7 Physical controls (14)

The platform has no premises of its own. Production servers will be hosted by a
provider in Algeria; controls **7.1–7.8 and 7.11–7.14** are therefore
**➖ inherited** from that provider and verified through 5.19–5.23. Controls that
apply to team devices:

| Control   | Title                                                                       | Status | Evidence / justification                                                    |
| --------- | --------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 7.1–7.6   | Perimeters, entry, offices, monitoring, environmental threats, secure areas | ➖     | Inherited from the hosting provider                                         |
| 7.7       | Clear desk and clear screen                                                 | ⏳     | Screen lock on team workstations                                            |
| 7.8       | Equipment siting and protection                                             | ➖     | Inherited from the hosting provider                                         |
| 7.9       | Security of assets off-premises                                             | ⏳     | Encrypted laptops for anyone holding secrets                                |
| 7.10      | Storage media                                                               | ⏳     | Backups stored encrypted, separately from secrets (`docs/OPERATIONS.md` §3) |
| 7.11–7.14 | Utilities, cabling, maintenance, disposal                                   | ➖     | Inherited from the hosting provider                                         |

## A.8 Technological controls (34)

| Control | Title                                                       | Status | Evidence / justification                                                                                                                                              |
| ------- | ----------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1     | User endpoint devices                                       | ⏳     | Workstation rules (see 6.7)                                                                                                                                           |
| 8.2     | Privileged access rights                                    | ✅     | Privileged roles require an MFA-satisfied session (`MFA_PROTECTED_ROLES`, `server/guards.ts`)                                                                         |
| 8.3     | Information access restriction                              | ✅     | Tenant isolation through membership checks (`requireOrgMembership`)                                                                                                   |
| 8.4     | Access to source code                                       | 🟡     | Repository on GitHub; ⏳ branch protection and required reviews                                                                                                       |
| 8.5     | Secure authentication                                       | ✅     | TOTP MFA, session binding, refresh rotation with reuse detection (`packages/auth`, `server/services/sessions.ts`)                                                     |
| 8.6     | Capacity management                                         | 🟡     | Rate limits per tier (`packages/auth/src/rate-limit.ts`); ⏳ capacity monitoring                                                                                      |
| 8.7     | Protection against malware                                  | 🟡     | Upload validation by MIME, magic bytes and extension (`server/infra/upload.ts`); ⏳ antivirus scan stage                                                              |
| 8.8     | Management of technical vulnerabilities                     | 🟡     | `npm audit` gate in CI; critical Next.js advisory patched; 4 high advisories await the Prisma 7 / Zod 4 upgrades (R15)                                                |
| 8.9     | Configuration management                                    | ✅     | Typed environment configuration that fails fast (`server/env.ts`); `.env.example`                                                                                     |
| 8.10    | Information deletion                                        | 🟡     | Deletion requests with anonymization of audit history (`DeletionRequest`); ⏳ automated fulfilment                                                                    |
| 8.11    | Data masking                                                | ✅     | `maskEmail` / `maskPhone` / `maskName` (`packages/utils/src/mask.ts`)                                                                                                 |
| 8.12    | Data leakage prevention                                     | ✅     | Minimal public responses; external AI document sending off by default (`server/infra/ai.ts`)                                                                          |
| 8.13    | Information backup                                          | ✅     | Encrypted, checksummed, rotated dumps (`scripts/backup-db.sh`, decrypt tested); restore drill (`docs/OPERATIONS.md` §3–4)                                             |
| 8.14    | Redundancy of information processing facilities             | ⏳     | Single node today                                                                                                                                                     |
| 8.15    | Logging                                                     | ✅     | Append-only audit log of sensitive actions (`server/services/audit.ts`)                                                                                               |
| 8.16    | Monitoring activities                                       | 🟡     | Risk engine and moderation queue (`server/modules/risk.ts`, `reports.ts`); ⏳ alerting                                                                                |
| 8.17    | Clock synchronization                                       | ➖     | Inherited from host NTP; timestamps stored in UTC                                                                                                                     |
| 8.18    | Use of privileged utility programs                          | ⏳     | Restrict database console access to named administrators                                                                                                              |
| 8.19    | Installation of software on operational systems             | ✅     | Immutable container image built from the repository (`Dockerfile`)                                                                                                    |
| 8.20    | Networks security                                           | ➖     | Inherited from the hosting provider; database not exposed publicly                                                                                                    |
| 8.21    | Security of network services                                | 🟡     | HSTS and TLS at the reverse proxy (`src/proxy.ts`)                                                                                                                    |
| 8.22    | Segregation of networks                                     | ➖     | Inherited; compose network isolates the database (`docker-compose.yml`)                                                                                               |
| 8.23    | Web filtering                                               | ➖     | Not applicable: the team uses no shared office network                                                                                                                |
| 8.24    | Use of cryptography                                         | ✅     | scrypt, SHA-256 token hashes, AES-256-GCM secrets, HMAC-SHA256 QR signatures (`docs/SECURITY.md` §2, §10)                                                             |
| 8.25    | Secure development life cycle                               | ✅     | Threat model and controls documented (`docs/SECURITY.md`); CI gates                                                                                                   |
| 8.26    | Application security requirements                           | ✅     | Zod validation on every input; explicit state machines (`packages/validation`, `packages/domain`)                                                                     |
| 8.27    | Secure system architecture and engineering principles       | ✅     | Documented in `docs/ARCHITECTURE.md`                                                                                                                                  |
| 8.28    | Secure coding                                               | ✅     | Strict TypeScript, ESLint, no secrets in errors (`server/http.ts`)                                                                                                    |
| 8.29    | Security testing in development and acceptance              | ✅     | 495 unit tests, including authorization and state-machine tests; end-to-end browser suite (`tests/e2e`)                                                               |
| 8.30    | Outsourced development                                      | ➖     | No outsourced development                                                                                                                                             |
| 8.31    | Separation of development, test and production environments | ✅     | Separate databases per environment; demo data only via `SEED_DEMO`; production ignores `DEMO_MODE` without a second opt-in (`server/env.ts`, `env-demo-mode.test.ts`) |
| 8.32    | Change management                                           | 🟡     | Git history and CI on every change; ⏳ required pull-request reviews                                                                                                  |
| 8.33    | Test information                                            | ✅     | Tests and demo use synthetic seed data, not real personal data                                                                                                        |
| 8.34    | Protection of information systems during audit testing      | ⏳     | Plan audits against a staging copy                                                                                                                                    |

## Summary

| Theme          | ✅  | 🟡  | 📝  | ⏳  | ➖  |
| -------------- | --- | --- | --- | --- | --- |
| Organizational | 9   | 10  | 9   | 9   | 0   |
| People         | 0   | 0   | 1   | 7   | 0   |
| Physical       | 0   | 0   | 0   | 3   | 11  |
| Technological  | 17  | 8   | 0   | 4   | 5   |

The technical foundation is largely in place; most remaining work is
organizational (roles, training, supplier contracts) and operational (running
the ISMS for a cycle), which is normal for a project before launch.
