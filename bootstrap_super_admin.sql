-- ============================================================================
-- MathPath -- Bootstrap first SUPER_ADMIN login on a freshly migrated/hosted
-- database.
--
-- WHEN TO RUN THIS:
-- After the app has been deployed/started at least once against the new
-- database (so Base.metadata.create_all() + Alembic migrations have created
-- the `users` table and all its columns), but before anyone has logged in.
-- A brand-new empty database has no way to create its first admin account
-- through the running application itself -- there is no self-registration
-- or admin-creation endpoint anywhere in this codebase (confirmed by
-- reading routes_auth.py / routes_admin.py). This one-time direct SQL
-- insert is the only way in on a blank database.
--
-- WHAT THIS CREATES:
-- One SUPER_ADMIN account with a real, working bcrypt password hash,
-- generated using this exact app's own hashing function
-- (app/core/security.py: passlib CryptContext(schemes=["bcrypt"])), so it
-- is guaranteed to verify correctly against a real login attempt --
-- this was actually generated and round-trip verified, not hand-typed.
--
-- LOGIN CREDENTIALS FOR THIS ACCOUNT:
--   Email:    admin@mathpath.in
--   Password: YvZg2uwRRswWYiAd!Aa1
--
-- CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN (Account Settings ->
-- Change Password), then consider deactivating or deleting this bootstrap
-- row once a real named admin account exists, so this generated password
-- doesn't linger as a standing credential.
-- ============================================================================

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

-- ============================================================================
-- Notes on why this differs from a generic "one admin row" template:
--
-- 1. `id` must be a string UUID, not an integer. Every table in this schema
--    uses `id = Column(String, primary_key=True, default=uuid_str)` -- there
--    is no auto-increment integer primary key anywhere, and that default is
--    Python-side only (not a DB server_default), so a raw INSERT must supply
--    its own UUID-formatted value as done above.
--
-- 2. `password_hash` must be a passlib bcrypt hash (`$2b$12$...`), matching
--    this app's exact verification function -- any other hash format
--    (sha256, md5, a different bcrypt cost/identifier) will silently fail
--    login with "invalid credentials" even though the row exists.
--
-- 3. `role` must be exactly `SUPER_ADMIN` or `ADMIN` (case-sensitive, no DB
--    constraint enforces this -- it's convention only). SUPER_ADMIN is used
--    here to guarantee access to every admin-gated route during testing;
--    `ADMIN` also works for everything except a small number of
--    SUPER_ADMIN-only actions.
--
-- 4. `is_active` must be supplied explicitly as TRUE. It looks like it
--    defaults to true in the application's ORM model, but that default is
--    Python-side only -- the actual database column has no default clause,
--    so a raw SQL insert that omits it will fail a NOT NULL constraint.
--
-- 5. `failed_login_attempts` is intentionally omitted -- it's a legacy
--    column with a real DB-level default (0) wherever it exists, unused by
--    any application logic (login throttling is a separate in-memory rate
--    limiter, not DB-backed), so it's safe to leave out entirely.
-- ============================================================================
