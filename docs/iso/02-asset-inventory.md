# 02 — Asset inventory and classification

ISO/IEC 27001:2022 Annex A.5.9, A.5.12, A.5.13

## Classification scheme

| Level            | Meaning                                                           | Handling                                                               |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Secret**       | Compromise allows impersonation of any user or forging of records | Never in the repository or logs; environment only; rotate on suspicion |
| **Confidential** | Personal data (Law 18-07) or tenant-private data                  | Access by role only; masked in queues; minimal in public responses     |
| **Internal**     | Operational data not meant for the public                         | Authenticated access                                                   |
| **Public**       | Intended for anyone                                               | No restriction                                                         |

## Information assets

| Asset                                                    | Location                                                 | Class                       | Owner                      |
| -------------------------------------------------------- | -------------------------------------------------------- | --------------------------- | -------------------------- |
| `AUTH_SECRET`, `SESSION_SECRET`, `QR_SIGNING_SECRET`     | Server environment (`.env`, git-ignored)                 | Secret                      | Information security owner |
| Password hashes (scrypt), refresh-token hashes           | `User`, `Session` tables                                 | Secret                      | Information security owner |
| TOTP secrets (AES-256-GCM encrypted), recovery codes     | `TwoFactorSecret`, `RecoveryCode` tables                 | Secret                      | Information security owner |
| Identity data: name, email, phone, date of birth         | `User`, `VolunteerProfile`                               | Confidential                | Data protection officer    |
| Uploaded documents (identity, organization registration) | File storage (`STORAGE_LOCAL_DIR`)                       | Confidential                | Data protection officer    |
| Volunteering records: applications, attendance, hours    | `Application`, `Attendance*`, `VolunteerHour`            | Confidential                | Organization (tenant)      |
| Messages and moderation reports                          | `Message*`, `Report` tables                              | Confidential                | Platform administrator     |
| Consent ledger, data-subject requests                    | `PrivacyConsent`, `DataAccessRequest`, `DeletionRequest` | Confidential                | Data protection officer    |
| Audit log (actor, action, IP, user agent)                | `AuditLog` (append-only)                                 | Confidential                | Information security owner |
| Session metadata (IP, user agent)                        | `Session`                                                | Confidential                | Information security owner |
| Organization profiles, verification status, trust level  | `Organization`, `OrganizationVerification`               | Internal / Public (profile) | Platform administrator     |
| Certificate number, holder name, hours, status           | `VolunteerCertificate` via `/public/verify`              | Public (by design, minimal) | Organization (tenant)      |
| Published initiatives, campaigns, impact figures         | `Opportunity`, `Campaign`, impact tables                 | Public                      | Organization (tenant)      |
| Source code and infrastructure definitions               | Git repository (GitHub)                                  | Internal                    | Developers                 |
| Database backups and storage archives                    | `backups/` (see OPERATIONS.md §3)                        | Confidential                | Information security owner |

## Supporting assets

| Asset                                 | Notes                                                               |
| ------------------------------------- | ------------------------------------------------------------------- |
| Application server (Next.js, Node.js) | Single node today; container image from the repository `Dockerfile` |
| PostgreSQL 16                         | Docker container; production host to be selected in Algeria         |
| Developer workstations                | Hold `.env` for local work only; must use disk encryption (planned) |
| Hosting provider (to be selected)     | Supplier controls A.5.19–5.23 apply once chosen                     |
