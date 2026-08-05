# MathPath — New Host Migration Guide

Purpose: everything needed to stand up this platform on a new host, migrate all existing data across without loss, get a working first login, and verify the app is actually functional before going live. Follow the sections in order — each one depends on the previous one being done first.

---

## 1. Migrate the database itself (all existing data, not just one table)

Do **not** hand-write `INSERT` statements to recreate data row by row — this schema has base64 image blobs stored as text, JSON columns, and dozens of foreign-key-linked tables. A manually reconstructed set of INSERTs is exactly how data gets silently dropped or corrupted. Use a real database-level export/import instead:

1. On the **current** host, dump the whole database:
   ```bash
   pg_dump --dbname "$DATABASE_URL" --no-owner --no-acl --clean -f mathpath_full_backup.sql
   ```
   (This repo already has this exact command wrapped as `backend/scripts/db_backup.py` — running it against the current production `DATABASE_URL` produces a compressed, complete, consistent snapshot of every table.)

2. On the **new** host, once the new Postgres database exists and is reachable:
   ```bash
   psql "$NEW_DATABASE_URL" -f mathpath_full_backup.sql
   ```

3. Start the backend once against the new database so it finishes provisioning the schema (Alembic migrations + a few startup-only column shims run automatically on boot — see `backend/app/main.py`'s startup handler). Confirm no errors in the startup logs before moving on.

This approach preserves everything — students, teachers, attempts, badges, economy transactions, curriculum content — exactly as it exists today, with no risk of a hand-typed field being wrong.

---

## 2. Bootstrap the first login (only needed because a blank DB has no way in otherwise)

This app has no self-registration or admin-creation flow anywhere — confirmed directly in the code (`routes_auth.py` only exposes login/2FA endpoints, all of which require an already-existing account; every `User`-creating endpoint in `routes_admin.py` is hardcoded to `TEACHER`/`STUDENT` roles only). If step 1's restore already brought over the real production `users` table, **skip this section entirely** — your existing admin accounts are already in the database. This is only needed if you're starting from a genuinely empty `users` table.

Run this once, directly against the new database, after the backend has started at least once (so the `users` table exists):

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

Login once this runs: **admin@mathpath.in** / **YvZg2uwRRswWYiAd!Aa1** — this hash was generated and round-trip-verified using this app's own hashing function (`app/core/security.py`, passlib bcrypt), so it's guaranteed to work, not guessed.

**Change this password immediately after first login (Account Settings → Change Password), and delete or deactivate this row once a real named admin account exists.** Don't leave a generated bootstrap credential sitting in production.

Notes on why this differs from a generic template, in case they hand-write a different one later:
- `id` must be a string UUID — every table in this schema uses `id = Column(String, primary_key=True, default=uuid_str)`, never an auto-increment integer, and that default is Python-side only (not written into the database), so a raw INSERT must always supply its own UUID.
- `password_hash` must be a **passlib bcrypt** hash (`$2b$12$...`) — any other hash format fails login silently with "invalid credentials," not an error that points at the real cause.
- `role` must be exactly `SUPER_ADMIN` or `ADMIN` (case-sensitive; nothing in the database enforces this, it's convention only).
- `is_active` must be supplied explicitly as `TRUE` — it looks defaulted in the app's model, but that default is Python-side only; the real database column has no default, so omitting it fails a NOT NULL constraint.

---

## 3. Environment variables that MUST be set correctly on the new host

None of these are hardcoded in the codebase — that's intentional, so the same code runs on any host — but it means every one of these needs a real value set on the new environment, or things will break in ways that look like bugs but aren't.

### Frontend (new host)

| Variable | What it controls | What happens if wrong/missing |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Where the frontend proxies every `/api/*` call to (see `frontend/next.config.mjs`'s `rewrites()`) | Every API call, including login, returns a bare **"Not Found"** — this is almost certainly what's happening right now |
| `BACKEND_ORIGIN` | Same purpose as above, takes priority if both are set | Same failure mode if set to the wrong value |

**Important:** `NEXT_PUBLIC_*` variables get baked into the compiled JS bundle at build time in Next.js (this one is also read directly in a couple of client components, not just the server-side proxy config). Setting the variable and only restarting the running process is **not enough** — it needs a fresh build/redeploy to actually take effect.

### Backend (new host)

| Variable | What it controls | What happens if wrong/missing |
|---|---|---|
| `DATABASE_URL` | Which Postgres database the app connects to | App can't start / connects to the wrong data |
| `FRONTEND_URL` | Which origin is allowed through CORS (`backend/app/main.py`) | Cross-origin requests get blocked by the browser. **Not currently in `render.yaml`** — it's set by hand in the current hosting dashboard, outside version control, so the new host needs this value set explicitly; it won't appear just by copying the repo |
| `SECRET_KEY` | Signs every login token | Must be set to a real fixed value on the new host (fine for it to differ from the old host — everyone just re-logs in — but must not be left on the insecure `dev-secret-change-me` fallback) |
| `COOKIE_SECURE` | Whether session cookies require HTTPS | Defaults to `true` (correct for any real HTTPS deployment); only set to `false` for local HTTP-only development |
| `SEED_ON_STARTUP` | Whether curriculum seed data re-runs on every boot | Set deliberately for this environment rather than leaving on default |
| `ASSESSMENT_READINESS_FORCE_STRICT`, `ASSESSMENT_TESTING_OVERRIDE_ENABLED` | Assessment-gating behavior toggles, not URLs | Only matters for what you intend to test — set deliberately, don't assume |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_EMAIL` (or `RESEND_API_KEY` / `BREVO_API_KEY`) | Outgoing email (parent progress reports, notifications) | Only needed if the load test includes email-triggering flows — otherwise these silently no-op |

---

## 4. Fixing today's "Not Found" on login specifically

This is a configuration issue, not a codebase defect — confirmed by reading the actual login code: for any admin account, the login function only ever queries the `users` table and can only ever return "invalid credentials" or "account inactive," never a 404. A bare "Not Found" means the request never reached that code at all.

Steps, in order:

1. Confirm the backend itself is up and reachable directly, bypassing the frontend entirely:
   ```bash
   curl https://<new-backend-host>/api/health
   ```
   This should return a healthy JSON response. If this itself 404s, the backend isn't deployed/routed correctly yet — stop here and fix that first.

2. Once the backend responds correctly on its own, set `NEXT_PUBLIC_API_BASE_URL` (and/or `BACKEND_ORIGIN`) on the frontend deployment to that exact backend URL.

3. Rebuild/redeploy the frontend (not just restart — see the note in section 3 above).

4. Retry login.

---

## 5. One exception to flag and check manually

Almost every frontend API call goes through a same-origin proxy (`/api/*`, rewritten server-side to the real backend) — this is also what makes the httpOnly session cookie work at all cross-service. One place does **not** follow this pattern: profile photo display (`frontend/components/common/ProfileAvatar.tsx` / `useAuthenticatedImage`) builds a direct URL straight to the backend's own origin instead of going through the proxy. Once everything else above is working, specifically check that profile photos load correctly — it's the one code path that isn't covered by the same fix as everything else.

---

## 6. Post-migration verification checklist

Run through these in order before considering the new host ready for load testing:

1. `curl https://<new-backend-host>/api/health` returns healthy.
2. Login as the bootstrap (or migrated) super admin succeeds and returns a session.
3. Admin dashboard loads real migrated data (student counts, curriculum, etc. — not empty/zero, confirming the DB restore actually worked, not just that login works).
4. A real student/teacher login (from the migrated data) succeeds.
5. Profile photo displays correctly for at least one account (the section 5 exception).
6. A DPS/practice attempt can be submitted end to end and the result is graded correctly.
7. Change the bootstrap admin's password (if section 2 was used), or confirm real admin accounts from the migration are the ones being used going forward.
8. If email is in scope for this test: trigger one real notification/report and confirm it sends.

Once all of these pass, the new host is a faithful copy of production and safe to run the fraction/load test against.
