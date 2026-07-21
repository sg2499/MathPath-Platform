# MathPath Security & Data-Safety Audit — 2026-07-21

> **Phase 0 status (updated same day, after this audit was written): code portion done, self-verified, PREPARED NOT YET DELIVERED.** Fixed: hardcoded default passwords in the admin create/reset-password backend endpoints *and* the admin frontend forms that pre-filled them (the real, live version of finding #1 below — worse than "just documented," these were structurally live), scrubbed every plaintext credential from every tracked file, hardened 6 Playwright specs, extended the CI exposure-audit tool to actually catch this class of issue going forward. **Two items remain and cannot be done by any Claude session:** (1) rotate the admin password plus three confirmed-live account passwords (`MP-T-001`, `MP-ST-001`, `MP-ST-006`) yourself — see `docs/project-memory/COWORK_HANDOFF.md`'s matching entry for exactly which accounts and why; (2) purge `backend/mathpath.db.pre_im_l3_backup` from git history via `git filter-repo` from your local terminal — ask for the exact commands when ready. Full narrative in `COWORK_HANDOFF.md`'s "2026-07-21 update (security audit)" entry.

Scope: full read-through of `backend/app` (auth, API routes, services, config) and `frontend` (auth/token handling, env exposure, XSS surface), plus a repo-wide scan for leaked secrets, dependency posture, and infra config (`render.yaml`, `.gitignore`). This was a code-level audit (static review), not a live penetration test — see "Before public launch" at the end for what a pen test should cover that this couldn't.

The short version: the application-layer security MathPath already has — auth, RBAC, ownership checks, server-side grading — is genuinely solid, better than a lot of production apps at this stage. But there are two critical, real-world data-exposure problems sitting in the git repository itself, unrelated to code quality, that need to be treated as already-compromised and fixed first. Everything else is real but lower-urgency hardening.

---

## Critical — treat as already compromised, fix before anything else

**1. The production admin password is committed to the repo in plaintext, in five places, and is used as a fallback default in test scripts.**

`admin@mathpath.local` / `Admin@123` appears in `README.md`, `SETUP_GUIDE.md`, `backend/README.md`, and as the hardcoded fallback value (`process.env.MATHPATH_ADMIN_PASSWORD || "Admin@123"`) in six Playwright regression specs under `frontend/tests/`. `docs/project-memory/COWORK_HANDOFF.md` additionally logs this same password as "current working password" from a recent session, plus a real test-student password (`Verify@2026` for Ishan Banerjee, `MP-ST-006`) and a third student's password that autofilled by accident (`pragya-ghosh`). All of these files are tracked in git.

Anyone with read access to this repository — and if it's ever made public, anyone at all — has the admin password to your live platform. This needs to be treated the same way as if it had actually leaked, because functionally it has.

**2. A full database backup file is committed to git.**

`backend/mathpath.db.pre_im_l3_backup` (2.4 MB SQLite file) is tracked in the repository. If this predates a real data migration, it likely contains real student/teacher/admin records — names, emails, phone numbers, and bcrypt password hashes — permanently baked into git history. Even if the file is deleted in a future commit, it remains fully recoverable from history unless that history is rewritten.

---

## High severity — fix this week, straightforward code changes

**3. Unhandled exceptions leak internal error detail to the client.** `backend/app/main.py`'s global exception handler returns `str(exc)` directly in the JSON response body for any unhandled `Exception` (500s). This can expose internal file paths, query fragments, or library error text to anyone probing the API — an information-disclosure issue that also just makes the API a nicer target to fingerprint.

**4. No security headers anywhere.** There's no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, or `Referrer-Policy` set globally (only one endpoint sets `X-Content-Type-Options: nosniff`, on the profile-photo response). Without these, the app has no defense-in-depth against clickjacking, MIME-sniffing, or protocol-downgrade attacks even if everything else is correct.

**5. A stale/mismatched environment variable name means the assessment-readiness bypass is silently stuck on in production, regardless of what render.yaml says.** `render.yaml` sets `TEMPORARY_ASSESSMENT_READINESS_BYPASS=false`, but `backend/app/core/config.py` actually reads a *different* variable name, `ASSESSMENT_READINESS_FORCE_STRICT`. Since that variable is never set, it defaults to `"false"`, which flips `TEMPORARY_ASSESSMENT_READINESS_BYPASS` to `True` in code — the exact opposite of what the deployment config intends. This isn't a breach vector by itself, but it means an integrity gate you believe is enforced in production isn't, which is exactly the kind of gap that becomes a real problem once real assessment results matter.

**6. `SEED_ON_STARTUP=true` is set in `render.yaml` for the production service**, while the code comment directly above the flag in `config.py` says the opposite: *"Production/demo deployments must not create demo students, demo teachers... Enable only for intentional local curriculum seeding."* Worth confirming exactly what `seed_ylm_phase1` creates before launch — if it creates any demo accounts with known credentials, those are live in production today.

**7. The login identifier is passed unescaped into a SQL `ILIKE` pattern.** `auth_service.py`'s `login()` does `User.email.ilike(cleaned_identifier)` directly on user input. `%` and `_` are SQL wildcards in `ILIKE` — a login attempt with `%` as the identifier matches *any* row with a non-null email and returns the first one. This doesn't bypass the password check (bcrypt verification still runs against whatever account gets matched), but it's an unintended enumeration/targeting primitive that has no reason to exist — identifiers should be exact-matched, not pattern-matched.

**8. `GET /api/auth/profile-photo/{user_id}` has no authentication requirement at all.** Anyone, logged in or not, can fetch any user's profile photo by ID. Low severity on its own (it's a photo, not PII in the strict sense), but it's a real gap in an otherwise consistently-enforced auth model, and worth closing on principle — a future field added to that response wouldn't get the same scrutiny this audit gave it.

**9. Rate limiting exists only on `/api/auth/login` (5/minute).** `change-password`, admin `reset-password`, and every other sensitive mutation have no per-endpoint throttle — only the app-wide default (200/minute) from `slowapi`. Not urgent given the RBAC/ownership checks already in place, but worth extending before launch traffic makes it worth someone's time to probe.

---

## Medium severity — real, but not urgent; plan for the next few weeks

- **Access tokens live for 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES=1440`) with no server-side revocation.** The sliding-renewal design in `dependencies.py` is well-built and password changes correctly invalidate old tokens (`password_changed_at` check) — but there's no way to force-kill a single stolen-but-not-yet-expired token (e.g., a lost device) without changing that user's password. Worth a lightweight revoked-token table or shortening the window and leaning more on the existing sliding-renewal mechanism.
- **JWTs are stored in `localStorage`** (`frontend/lib/auth.ts`), which is readable by any script running on the page. React's default JSX escaping and the fact that `dangerouslySetInnerHTML` is used exactly once (a static theme-bootstrap script, not user data) keeps current XSS exposure low, but this is the kind of thing that becomes a real problem the moment any future feature renders user-supplied HTML unescaped. httpOnly cookies are the stronger long-term pattern; not a rewrite to do casually, but worth planning for.
- **Password policy is minimal:** 6-character minimum, no complexity requirement, checked in exactly one place (`change-password`) — admin-created teacher/student accounts go through a separate code path with the same 6-char-only check. No password-reuse or breach-list check (e.g., HaveIBeenPwned range API).
- **No MFA** for any role, including Admin — the highest-value account on the platform.
- **`backend/app/api/routes_admin.py`'s bulk-upload endpoint** (`.xlsx`/`.xlsm` via `openpyxl`) has no explicit file-size cap before parsing. Admin-only, so lower risk, but Excel files are zip archives and unbounded parsing of a maliciously crafted file is a known DoS pattern worth a size guard regardless.
- **`python-jose` (JWT library, pinned `3.3.0`)** is effectively unmaintained upstream compared to alternatives like `PyJWT` or `Authlib`. Current usage is safe (algorithm is explicitly pinned to `HS256` in `decode_token()`, which blocks the classic "alg: none" and algorithm-confusion attacks), but it's worth a dependency review rather than assuming it'll stay safe indefinitely.
- **No CI-level secret scanning or dependency vulnerability scanning** (e.g., `gitleaks`, `pip-audit`, `npm audit`, Dependabot/Renovate) — this is exactly the kind of control that would have caught findings #1 and #2 automatically before they were ever committed.

---

## What's already solid — worth knowing, not just gaps

To be clear about where the platform actually stands, not just what's wrong:

- **RBAC coverage is consistently applied.** Every one of the ~150 endpoints across `routes_admin.py`, `routes_student.py`, `routes_teacher.py`, and `routes_notifications.py` was checked programmatically for an auth dependency in its signature — 100% coverage outside the intentionally-public `login`, `health`, and root routes.
- **IDOR/ownership checks are real, not just role checks.** Spot-checked across student attempts (`get_attempt_for_student` verifies `attempt.student_id == student.id`), teacher-student access (`own_students_query` scoping, checked in both list and detail endpoints), and answer submission (`save_answer` verifies the question belongs to the specific attempt) — a student or teacher role alone isn't enough to reach another user's data; the specific record is checked every time.
- **No SQL injection surface found.** The entire backend goes through SQLAlchemy's ORM query builder; no raw string-formatted SQL anywhere in `app/`.
- **Grading and rewards are computed server-side.** The question payload sent to a student mid-attempt (`safe_questions_payload`) never includes which option is correct, and nothing in the answer-submission or mock-attempt request bodies lets the client submit its own score, XP, or coin values — all of that is server-computed on submit.
- **Passwords are bcrypt-hashed** via `passlib`, not reversibly encrypted or stored plain.
- **JWTs are correctly signed and verified** with an explicit, pinned algorithm (blocking algorithm-confusion attacks), and `SECRET_KEY` is auto-generated by Render (`generateValue: true`) rather than depending on the insecure `"dev-secret-change-me"` fallback in `config.py` — that fallback only bites in local/dev, not production, confirmed against `render.yaml`.
- **`.env` handling is correct**: `.gitignore` properly excludes `.env`/`.env.*` (with an explicit `.env.example` allowlist exception), and no real `.env` file is tracked in git.
- **CORS is scoped to specific origins**, not a wildcard.
- **Sentry error tracking is already wired in** (`SENTRY_DSN`), giving you real visibility into production exceptions once the leaking-detail issue above is fixed to stop double-exposing that same information to end users.

---

## Implementation plan

### Phase 0 — today, before anything else (credential/data exposure)

1. Rotate the production admin password immediately, and reset the password on any real (non-test) account that might be represented in `mathpath.db.pre_im_l3_backup`, treating both as already known to an outside party.
2. Remove the plaintext credentials from `README.md`, `SETUP_GUIDE.md`, `backend/README.md`, and the six test specs — replace with `<set via MATHPATH_ADMIN_PASSWORD env var>`-style placeholders. Scrub the specific passwords out of `COWORK_HANDOFF.md`'s recent entries (replace with "see password manager" or similar, not the literal string).
3. Purge `mathpath.db.pre_im_l3_backup` from git history (not just delete it going forward) — this needs `git filter-repo` or BFG Repo-Cleaner run from the local Claude Code terminal (has real git access), followed by a force-push and everyone with a clone re-cloning. This is the one step in this whole plan that needs your explicit go-ahead before it happens, since rewriting history is disruptive if anyone else has this repo cloned.
4. Add `gitleaks` (or similar) as a pre-commit hook and a CI check so this class of leak can't happen again silently.

### Phase 1 — this week (high-severity code fixes, all backend, all low-risk changes)

5. Fix the global exception handler to log full detail server-side (Sentry already captures this) and return a generic `{"code": "INTERNAL_SERVER_ERROR", "message": "Something went wrong."}` to the client instead of `str(exc)`.
6. Add a security-headers middleware (CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`) applied globally in `main.py`.
7. Fix the `TEMPORARY_ASSESSMENT_READINESS_BYPASS` / `ASSESSMENT_READINESS_FORCE_STRICT` env-var name mismatch so `render.yaml`'s setting actually takes effect, and confirm with you what the intended live behavior should be before flipping it.
8. Confirm exactly what `SEED_ON_STARTUP=true` creates in production; either turn it off or confirm it's genuinely idempotent/harmless.
9. Fix the login-identifier `ILIKE` wildcard issue — exact match (or escape `%`/`_`) before the query.
10. Require authentication on the profile-photo endpoint.
11. Extend rate limiting to `change-password` and the admin `reset-password` endpoints.

### Phase 2 — next 2–4 weeks (defense-in-depth hardening)

12. Run `pip-audit` and `npm audit` for real (this session's sandbox can check code but not run a full network-based audit reliably) and enable Dependabot/Renovate on the repo.
13. Strengthen password policy (8+ chars, basic complexity) at every account-creation/change path, not just one.
14. Add optional TOTP-based 2FA, prioritized for the Admin role first.
15. Add a lightweight token-revocation mechanism so a compromised session can be force-logged-out without requiring a password change.
16. Evaluate moving access tokens from `localStorage` to httpOnly cookies — bigger change, worth scoping separately rather than bundling into this pass.
17. Add a file-size guard ahead of `openpyxl` parsing in bulk-upload.
18. Review `python-jose` vs. `PyJWT`/`Authlib` and decide whether to migrate.

### Phase 3 — before/at public launch

19. A real dynamic scan (OWASP ZAP or equivalent) against a staging environment — static review can't find everything a live scan will.
20. Confirm Sentry alerting rules exist (not just capture) so someone actually gets paged on a spike in 401s/500s.
21. Write a one-page incident-response runbook: who rotates what, how to force-logout every user, where backups live.
22. Set up encrypted, automated database backups that never touch git (this is the direct fix for how issue #2 happened in the first place).
23. Since this platform holds student data, confirm with your own legal/compliance judgment (not something I can advise on) whether COPPA/FERPA or local equivalent obligations apply given your students' ages and jurisdiction — that's a legal question, not an engineering one, but it should be closed out before a genuinely public launch.
24. Consider a CDN/WAF layer (e.g., Cloudflare) in front of the Render backend for DDoS absorption and edge-level rate limiting, since Render alone doesn't provide this the way Vercel does for the frontend.

---

**Suggested order of operations with you:** confirm Phase 0 items 1–3 (password rotation + history rewrite) before I touch anything, since #3 specifically needs your explicit approval and your local terminal's git access. Once that's clear, Phase 1 is small, low-risk backend code I can implement and hand off through the same delivery pattern as recent rounds (qa-reviewer verification, then your local session for commit/push/PR/merge).
