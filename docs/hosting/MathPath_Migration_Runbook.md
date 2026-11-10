# MathPath Platform — Production Migration & Cutover Runbook

**Document owner:** Shailesh Gupta
**Audience:** Hosting / infrastructure team
**Scope:** Migrating the MathPath platform (frontend, backend, database) to a new hosting environment, with zero data loss, and validating the new environment prior to load testing and go-live.

---

## 1. Overview

This runbook covers four phases, to be executed in order:

1. Database migration (full data transfer)
2. Application configuration on the new environment
3. First-login bootstrap (contingency only)
4. Verification and sign-off

Each phase assumes the previous phase is complete. Do not proceed out of order.

---

## 2. Database Migration

The database must be migrated as a complete, consistent dump — not reconstructed manually. The schema includes binary image data stored as encoded text, structured JSON fields, and a large number of foreign-key relationships across tables; a manually rebuilt dataset carries a high risk of silent data loss or corruption. A full logical dump/restore is the only supported method.

**Step 2.1 — Export from current production**

```bash
pg_dump --dbname "$DATABASE_URL" --no-owner --no-acl --clean -f mathpath_production_dump.sql
```

A wrapper for this exact command is included in the repository at `backend/scripts/db_backup.py`, for reference.

**Step 2.2 — Import into the new environment**

Once the new PostgreSQL instance is provisioned and reachable:

```bash
psql "$NEW_DATABASE_URL" -f mathpath_production_dump.sql
```

**Step 2.3 — Initialize the application against the new database**

Start the backend service once against the new database connection string. On startup, the application runs its schema migrations and a small number of startup-time integrity checks automatically. Confirm the service starts cleanly with no errors in the boot logs before proceeding.

This procedure preserves all existing data — student and teacher records, attempt history, gamification/economy data, and curriculum content — without manual re-entry.

---

## 3. Application Configuration

None of the values below are hardcoded in the application. Each must be set explicitly in the new environment's configuration/secrets management. This is expected and by design — it is what allows the same codebase to run in multiple environments — but it means every value below requires deliberate action; nothing here is inferred automatically from the repository.

### 3.1 Frontend service

| Variable | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL the frontend uses to reach the backend API | Set to the new backend service's public URL. Determined only once the backend has been deployed. |
| `BACKEND_ORIGIN` | Server-side equivalent of the above; takes precedence if both are set | Same value as `NEXT_PUBLIC_API_BASE_URL`. |

**Deployment note:** these are build-time variables. Setting them after the frontend has already been built and only restarting the running process is not sufficient — the frontend must be rebuilt and redeployed after the values are set.

### 3.2 Backend service

| Variable | Purpose | Source of value |
|---|---|---|
| `DATABASE_URL` | Database connection string | Generated automatically by the new database instance once provisioned. |
| `FRONTEND_URL` | Allowed origin for cross-origin requests (CORS) | Set to the new frontend service's public URL. Not present in the repository's deployment manifest today — it is currently set directly in the current production hosting dashboard, outside version control, and must be set explicitly again in the new environment. |
| `SECRET_KEY` | Signing key for authentication tokens | Generate a new, cryptographically random value for this environment. Does not need to match the value used in current production. |
| `COOKIE_SECURE` | Requires HTTPS for session cookies | `true` (matches current production; only disable for local HTTP-only development). |
| `SEED_ON_STARTUP` | Re-applies curriculum/master-data seeding on boot | `true` (matches current production; this operation is idempotent and does not affect student, teacher, or attempt data). |
| `ASSESSMENT_READINESS_FORCE_STRICT` | Assessment readiness gating mode | `false` (matches current production). |
| `ASSESSMENT_TESTING_OVERRIDE_ENABLED` | Admin assessment-testing override | `false` (matches current production). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session token lifetime | `1440` (matches current production). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` (or `RESEND_API_KEY` / `BREVO_API_KEY`) | Outbound email delivery (parent reports, notifications) | To be supplied by the platform owner. These are account credentials tied to the current email provider and are not present in the repository. Required only if email-triggering workflows are in scope for testing. |

---

## 4. First-Login Bootstrap (Contingency Only)

**Skip this section if the database was migrated per Section 2.** A full data migration already includes existing administrator accounts, and no further action is required here.

This section applies only if the new environment is being initialized with an empty database rather than a migrated one. The application does not provide a self-registration or account-creation flow for administrator accounts; the only way to create the first administrator on an empty database is a direct database insert.

Run the following once, after the backend has started successfully against the new database (so the required tables exist):

```sql
INSERT INTO users (
    id,
    full_name,
    email,
    password_hash,
    role,
    is_active,
    totp_enabled
)
VALUES (
    'a9f4e0bc-6b4f-4c4e-8aa3-1d14062ac061',
    'Super Admin',
    'admin@mathpath.in',
    '$2b$12$AEBMbOTHYTkQ1apAqPUwEOTkhDDiTRombVI6x/lY2xaRujHDboJfW',
    'SUPER_ADMIN',
    TRUE,
    FALSE
);
```

**Resulting credentials:**
Email: `admin@mathpath.in`
Password: `YvZg2uwRRswWYiAd!Aa1`

This password hash was generated using the application's own password-hashing routine and verified against it prior to delivery.

**Action required after first login:** change this password immediately (Account Settings → Change Password), and remove or deactivate this account once a permanent administrator account has been established. This is a bootstrap credential and should not remain active in production.

*Reference — schema constraints relevant to this insert, for future account provisioning:*
- `id` is a string-typed UUID primary key on every table in this schema, not an auto-incrementing integer.
- `password_hash` must be a bcrypt hash in the format produced by the application's own hashing library; hashes in any other format will fail authentication without a descriptive error.
- `role` must be exactly `SUPER_ADMIN` or `ADMIN` (case-sensitive; not enforced at the database level).
- `is_active` has no database-level default and must be supplied explicitly as `TRUE`.

---

## 5. Known Configuration Dependency

Nearly all frontend-to-backend API traffic is routed through a same-origin proxy layer, which is also what allows session cookies to function correctly across the two services. One component — the user profile photo display — is implemented as a direct call to the backend's origin rather than through this proxy layer. This is the single exception to the general routing pattern and should be verified independently during acceptance testing (see Section 7, item 5).

---

## 6. Troubleshooting: "Not Found" on Login

If login returns a generic "Not Found" response rather than a credential error, the cause is a routing/configuration issue, not an application defect. The authentication logic itself can only return an invalid-credentials or account-inactive response — it has no code path that returns "Not Found." A "Not Found" response indicates the request did not reach the backend at all.

**Diagnostic sequence:**

1. Confirm the backend is reachable directly:
   ```bash
   curl https://<new-backend-host>/api/health
   ```
   This should return a healthy status response. If it does not, resolve backend deployment/routing before proceeding further.

2. Confirm `NEXT_PUBLIC_API_BASE_URL` (and/or `BACKEND_ORIGIN`) on the frontend service is set to the exact backend URL confirmed in step 1.

3. Rebuild and redeploy the frontend service (see build-time note in Section 3.1).

4. Retry login.

---

## 7. Acceptance Checklist

To be completed and signed off before proceeding to load testing:

1. Backend health endpoint returns a healthy response.
2. Administrator login succeeds and returns a valid session.
3. Administrator dashboard reflects migrated production data (non-zero record counts across students, teachers, and curriculum).
4. A migrated student or teacher account can log in successfully.
5. Profile photo renders correctly for at least one account (see Section 5).
6. A practice/assessment attempt can be submitted end-to-end and is graded correctly.
7. Bootstrap administrator password has been changed, or confirmed not in use if full migration was performed.
8. If in scope: one outbound email notification has been triggered and confirmed delivered.

Once all items are confirmed, the environment is considered a validated replica of production and is cleared for load testing.
