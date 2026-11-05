# 05 — Incident response and personal data breach notification

ISO/IEC 27001:2022 Annex A.5.24 – A.5.28, A.6.8 · Algerian Law 18-07 as amended by Law 25-11

## 1. Reporting (A.6.8)

Anyone — team member, organization, volunteer or researcher — who notices a
possible security event reports it **immediately** to the information security
owner through the private channel in `docs/SECURITY.md` §16. Do not investigate
alone, do not delete anything, and never include live credentials or real
personal data in the report.

## 2. Severity scale (A.5.25)

| Level        | Examples                                                                                  | Response time       |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| **Critical** | Personal data exposed or stolen; administrator account compromised; signing secret leaked | Start within 1 hour |
| **High**     | Forged hours or certificates detected; tenant isolation failure; sustained attack         | Within 4 hours      |
| **Medium**   | Single user account compromised; malicious upload blocked after reaching storage          | Within 1 day        |
| **Low**      | Failed attack attempts; minor misconfiguration with no data exposure                      | Within 1 week       |

## 3. Response steps (A.5.26)

1. **Contain**
   - Suspend affected accounts and revoke their sessions (admin console;
     `POST /auth/logout-all` for the user's own sessions).
   - If a secret leaked: rotate `AUTH_SECRET` / `SESSION_SECRET` /
     `QR_SIGNING_SECRET` (rotating `AUTH_SECRET` invalidates every session and
     requires re-enrolling TOTP secrets encrypted with it).
   - Revoke affected certificates and attendance sessions where forgery is suspected.
2. **Preserve evidence** (A.5.28) — export the relevant `AuditLog` rows (append-only,
   with request id, IP and user agent) and server logs before any restore.
3. **Assess** — which data, how many people, which wilayas, whether minors are
   affected, and whether the breach is likely to harm the people concerned.
4. **Notify** — see section 4.
5. **Recover** — fix the cause, restore from backup if needed (`docs/OPERATIONS.md` §4),
   and confirm public certificate verification still works.
6. **Learn** (A.5.27) — within two weeks, a written review: timeline, root cause,
   what worked, what changes; update the risk register (document 03).

## 4. Personal data breach notification

| To whom                                      | When                                                                                                                                                                     | What                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **ANPDP** (national personal data authority) | Without delay after discovery, within the deadline set by Law 18-07 as amended by Law 25-11 (reported as **5 days** — to be confirmed against the Journal Officiel text) | Nature of the breach, categories and approximate number of people and records, likely consequences, measures taken, DPO contact |
| **People concerned**                         | Without undue delay when the breach is likely to harm their rights                                                                                                       | What happened, what data, what they should do (e.g. change password), contact point                                             |
| **Organizations (tenants)**                  | Same day for breaches affecting their data                                                                                                                               | Scope and actions                                                                                                               |

The data protection officer drafts and sends notifications; the information
security owner approves. Keep a copy of every notification with the incident
record.

## 5. Contacts (to complete before launch)

| Role                       | Name                                                | Phone | Email |
| -------------------------- | --------------------------------------------------- | ----- | ----- |
| Information security owner |                                                     |       |       |
| Data protection officer    |                                                     |       |       |
| Hosting provider support   |                                                     |       |       |
| ANPDP                      | Use the official channel published by the authority |       |       |

## 6. Rehearsal

Run a tabletop exercise at least once a year (for example: "a backup file was
found on a public link") and record the result as evidence for clause 9.
