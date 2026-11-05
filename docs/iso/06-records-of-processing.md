# 06 — Records of processing activities and data retention

ISO/IEC 27001:2022 Annex A.5.34 · ISO/IEC 27701 · Algerian Law 18-07 as amended by Law 25-11

Controller: the entity that will operate BLADNA (Team Athar until a legal entity
is registered). Data protection officer: to be appointed (document 01).
Hosting: in Algeria (planned); no transfer of personal data abroad is configured.

## 1. Processing activities

| #   | Activity                             | Purpose                                           | People                       | Data categories                                                                                                                                            | Legal basis                                                | Recipients                                                    |
| --- | ------------------------------------ | ------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| P1  | Account management                   | Create and secure accounts                        | All users                    | Name, email, phone (optional), date of birth, password hash, MFA secret, sessions (IP, user agent); for minors the guardian name, relationship and contact | Consent + performance of the service                       | Platform administrators                                       |
| P2  | Volunteer profile and matching       | Suggest suitable initiatives                      | Volunteers                   | Wilaya, skills, interests, languages, availability, date of birth                                                                                          | Consent                                                    | Organizations the volunteer applies to                        |
| P3  | Applications and attendance          | Organize initiatives and record presence          | Volunteers                   | Application motivation, attendance check-ins, hours                                                                                                        | Consent + performance                                      | The organizing association                                    |
| P4  | Certificates and public verification | Prove volunteering to third parties               | Volunteers                   | Name, organization, hours, dates, certificate status                                                                                                       | Consent (requested by the volunteer)                       | **Anyone holding the certificate number** (minimal data only) |
| P5  | Organization verification            | Ensure associations are genuine                   | Organization representatives | Identity and registration documents, contact details                                                                                                       | Legal obligation (Law 12-06 context) + legitimate interest | Verification officers                                         |
| P6  | Messaging and moderation             | Communication and safety                          | All users                    | Messages, reports (reporter email masked in queues)                                                                                                        | Consent + legitimate interest                              | Moderators                                                    |
| P7  | Campaign contributions               | Record pledges and bank transfers to associations | Contributors                 | Name, amount, transfer reference (no card data; no money handled)                                                                                          | Consent                                                    | The receiving association                                     |
| P8  | Security and audit                   | Protect accounts and records                      | All users                    | Audit events, IP addresses, user agents                                                                                                                    | Legitimate interest / legal obligation                     | Information security owner                                    |
| P9  | Consent and data-subject requests    | Prove consent; handle access and deletion         | All users                    | Consent purpose, policy version, IP; request status                                                                                                        | Legal obligation                                           | Data protection officer                                       |

Minors: the date of birth is required at registration. Under 19 (age of majority, Civil Code art. 40) the account needs a guardian — name, relationship and an email or phone — and the `guardian_consent` purpose; both are enforced by the API (`packages/validation/src/auth.ts`) and stored in `GuardianConsent`. Under 13 registration is refused (platform policy). Initiatives also set a minimum age, enforced at application (`apps/web/src/server/modules/applications.ts`). **Planned:** the guardian confirms by email or SMS once delivery is wired (`GuardianConsent.confirmedAt`).

## 2. Data-subject rights

| Right                        | How it is exercised today                                                                                 | Target time   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| Information                  | Privacy policy (`/privacy`), consent at registration                                                      | At collection |
| Access / copy                | `POST /me/data-request` (type export)                                                                     | 30 days       |
| Rectification                | Profile editing in the account                                                                            | Immediate     |
| Deletion                     | `POST /me/data-request` (type delete) → `DeletionRequest`; audit history anonymized rather than destroyed | 30 days       |
| Objection / withdraw consent | Privacy settings (`PATCH /me/privacy`); marketing consent optional                                        | Immediate     |

Fulfilment of export and deletion requests is currently handled by an
administrator; automating it is planned (SoA 8.10).

## 3. Retention schedule (policy)

| Data                                | Retention                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Active account and profile          | While the account is active                                                        |
| Inactive account                    | Reminder after 24 months of inactivity; deletion 3 months later unless reactivated |
| Hours and certificates              | While the account exists — they are the volunteer's proof; anonymized on deletion  |
| Organization verification documents | Duration of the organization's activity + 1 year                                   |
| Messages                            | 24 months after the last message in a conversation                                 |
| Sessions                            | Until expiry or revocation                                                         |
| Audit log                           | 5 years (evidence); actor anonymized when an account is deleted                    |
| Consent ledger                      | Duration of the account + 5 years (proof of consent)                               |
| Backups                             | 30 days rolling; restored data re-applies pending deletions                        |

These periods are the proposed policy; automated purging is planned and must be
validated by the data protection officer.
