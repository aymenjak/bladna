# 01 — ISMS scope and information security policy

ISO/IEC 27001:2022 clauses 4.1–4.3, 5.1–5.3 · Annex A.5.1, A.5.2, A.5.4

## 1. Context

BLADNA (بلادنا) is an Algerian platform that connects volunteers, associations,
public youth institutions and sponsors, and issues verifiable volunteering
certificates. It processes personal data of Algerian residents, including minors
(subject to an age gate per initiative), and is therefore subject to
**Law 18-07** on the protection of natural persons in the processing of personal
data, as amended by **Law 25-11** (July 2025), and to **Law 12-06** on
associations for the organizations it lists.

Interested parties and their expectations:

| Party                           | Expectation                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| Volunteers (including minors)   | Confidentiality of personal data; certificates that cannot be forged |
| Associations and youth houses   | Tenant isolation; reliable attendance and hours records              |
| Universities, employers         | Trustworthy public certificate verification                          |
| Sponsors, ministries (proposed) | Accurate impact figures; transparent handling of contributions       |
| ANPDP (personal data authority) | Compliance with Law 18-07 / 25-11, breach notification               |

## 2. Scope

**In scope:** the BLADNA web application and API (`apps/web`), its shared
packages (`packages/*`), the PostgreSQL database, file storage, the signing
secrets, the source repository, and the team that develops and operates them.

**Out of scope (until production):** physical data-centre controls, which will be
inherited from the hosting provider; third-party email and storage providers,
which are not yet connected (`infra/email.ts`, `infra/storage.ts` return
`CONFIG_ERROR`).

## 3. Information security policy

BLADNA's management commits to:

1. **Protect personal data** of volunteers and organizations according to
   Law 18-07 / 25-11: collect only what a purpose needs, record consent, honour
   access, rectification and deletion requests, and keep data in Algeria unless
   a transfer is authorized.
2. **Make records trustworthy**: volunteering hours and certificates are
   append-only and verifiable; every privileged decision is audited.
3. **Least privilege**: every permission is granted by role, checked on the
   server on every request, and privileged roles require multi-factor
   authentication.
4. **Secure by default**: security controls are built into the code and tested
   automatically before release; secrets never enter the repository.
5. **Report and learn**: anyone who suspects a security event reports it
   immediately (document 05); every incident ends with a lessons-learned review.
6. **Improve continually**: risks are reviewed at least once a year and after any
   significant change; this policy is reviewed with them.

Breaches of this policy are handled through the team's disciplinary process
(Annex A.6.4 — planned).

## 4. Roles and responsibilities

| Role                                   | Responsibility                                               | Holder (to confirm) |
| -------------------------------------- | ------------------------------------------------------------ | ------------------- |
| Information security owner             | Owns this ISMS, risk register and Statement of Applicability | Aymen Rouagha       |
| Data protection officer (Law 25-11)    | Records of processing, data-subject requests, ANPDP contact  | To be appointed     |
| Platform administrator (`SUPER_ADMIN`) | Organization verification, user management; MFA mandatory    | To be appointed     |
| Developers                             | Secure coding, code review, tests (Annex A.8.25–8.29)        | Team Athar          |

Segregation of duties (A.5.3): the person who verifies an organization should not
be a member of that organization; the role model in `packages/domain/src/rbac.ts`
separates `VERIFICATION_OFFICER`, `MODERATOR`, `SUPPORT` and `SUPER_ADMIN`.

## 5. Objectives (measurable)

| Objective                                  | Measure                                       | Target          |
| ------------------------------------------ | --------------------------------------------- | --------------- |
| No unauthorized access to personal data    | Confirmed incidents                           | 0 per year      |
| Data-subject requests answered on time     | Requests closed within 30 days                | 100 %           |
| Breach notification to ANPDP on time       | Notifications within the legal deadline       | 100 %           |
| Security regressions caught before release | Automated test suite passing on every release | 100 %           |
| Restorable backups                         | Successful restore drills                     | ≥ 1 per quarter |
