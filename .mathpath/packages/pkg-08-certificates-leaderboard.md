# Package 8 (Phase 8): Certificates / Leaderboard Visibility

## Objective
REQUIREMENTS.md item 5 ("results/certificate visibility") left two things
unanswered: the leaderboard's exact visibility scope, and what fields go
on a certificate. Rather than a further round-trip to the client, Shailesh
(2026-09-05) gave both product decisions directly:

- **Leaderboard scope**: a logged-in student sees their own result only,
  once released -- no public/shared leaderboard listing other students.
- **Certificate fields**: student name, competition level, rank, score,
  and the competition date, plus MathPath branding -- one certificate
  design, not tiered by rank.
- **Certificate eligibility**: every student who finalized an attempt,
  not just rank-holders.

## Status: COMPLETE (2026-09-05)

## What was built

### Leaderboard -- mostly already existed
The "own result only" decision means the student side needed **nothing
new**: `GetCompetitionEventResultForStudent` (Package 6) already returns
exactly that -- full metrics including rank, gated by `is_released`,
nothing about any other student. The admin-side "leaderboard" is
`ListCompetitionEventResultsForAdmin` (Package 6) + the Studio's own
**Results** tab (Package 7), which already lists every result ranked,
with accuracy/score/time, filterable by level, regardless of release --
that already IS an admin leaderboard. This package's only leaderboard
work was cosmetic: rank 1/2/3 in that table now render as a medal-colored
badge (`RankBadge` in the Studio page) instead of a plain number, so the
existing table reads as a leaderboard at a glance. No new backend
endpoint was added for this -- reusing the existing, already-tested
Package 6 endpoint was the deliberate choice over standing up a second,
near-identical read path.

### Certificates -- new
- **`backend/app/services/annual_competition_certificate_service.py`**
  (NEW): renders a landscape A4 PDF certificate (reportlab) from an
  already-computed `CompetitionEventResult` -- this module never scores
  or ranks anything itself. Two entry points:
  - `BuildAnnualCompetitionCertificateForStudent(db, StudentRecord,
    AttemptId)` -- ownership-checked (a mismatched attempt is reported as
    404, same as one that doesn't exist, so a student can't even probe
    for another's attempt id), re-checks `is_released` on every call
    (`403 COMPETITION_RESULT_NOT_RELEASED` if not yet released -- never
    trusts a client-side flag).
  - `BuildAnnualCompetitionCertificateForAdmin(db, *, AttemptId)` --
    bypasses the release gate entirely, matching this epic's established
    "admin always sees everything" convention (Package 6/7). Useful for a
    support case or printing ahead of the public release moment.
  - Duplicates (does not import) a small font-registration + MathPath-logo
    lookup + brand-color palette from `report_export_service.py`'s own
    toolkit -- deliberate, see the module's own docstring: this epic's
    established precedent is for each service module to stay
    self-contained rather than reach into another module's
    underscore-prefixed internals.
- **`backend/app/api/routes_student.py`**: `GET
  /api/student/annual-competition/attempts/{attempt_id}/certificate`.
- **`backend/app/api/routes_admin.py`**: `GET
  /api/admin/annual-competition/attempts/{attempt_id}/certificate`.
- **`backend/tests/test_annual_competition_certificate_service.py`** (NEW,
  8 tests): rejected before release, 404 for an attempt with no result yet
  (still in progress), 404 for an unknown attempt, ownership enforced
  (another student's attempt id), a real PDF downloads once released
  (verified via `pypdf` -- exactly one page, extracted text contains the
  student's name/level/rank), every finalized participant is eligible
  (not just rank 1 -- a rank-2-of-2 student still gets one), admin
  bypasses the release gate, admin 404 for an unknown attempt.
- Manually rendered a sample certificate to a JPEG (via `pdftoppm`) and
  visually reviewed it before shipping -- confirmed the MathPath logo
  (found automatically in `frontend/public/mathpath-logo.png`), the
  double blue/gold border, and every confirmed field render correctly
  with no overlap or truncation.
- Full backend suite: 485 passed (477 baseline after Package 6b + 8 new),
  zero regressions.

### Frontend
- **`frontend/lib/api/student.ts`**: `downloadAnnualCompetitionCertificate(attemptId): Promise<Blob>`.
- **`frontend/app/student/competition/annual/attempt/[attemptId]/page.tsx`**:
  a "Download Certificate" button next to "Back To Annual Competition" on
  the post-submission screen, shown only once `resultQuery` itself
  reports a released result (the backend re-checks independently
  regardless -- this is a UX convenience, not the actual gate). Downloads
  via blob + object URL, same pattern already used elsewhere in this
  codebase (e.g. `frontend/app/teacher/progress-reports/page.tsx`'s own
  `triggerBlobDownload`).
- **`frontend/lib/api/admin.ts`**: `downloadAnnualCompetitionCertificate(attemptId): Promise<Blob>` (admin variant, bypasses release).
- **`frontend/app/admin/competition/annual-studio/[eventId]/page.tsx`**:
  the existing Results table gained a "Certificate" column (a per-row
  download button, works regardless of release) and the Rank column now
  renders `RankBadge` (medal styling for 1st/2nd/3rd).
- Verification: `npx tsc --noEmit` clean, `npm run build` succeeds with
  zero new warnings.

## Checklist

### 1. Leaderboard visibility scope -- confirmed directly by Shailesh
- [x] Own result only for students (no public/shared leaderboard) --
      already fully satisfied by Package 6, nothing new required.
- [x] Admin leaderboard -- already existed (Package 6/7's Results tab);
      polished with medal styling this package.

### 2. Certificate fields -- confirmed directly by Shailesh
- [x] Name, competition level, rank, score, competition date, MathPath
      branding.

### 3. Certificate generation
- [x] Sourced from `CompetitionEventResult` (never recomputes anything).
- [x] Every finalized participant is eligible, not a rank cutoff.
- [x] Gated by `is_released` for students; admin always can download.
- [x] Student can download from their own portal once published.

## Not built in this package (out of scope, not requested)
- No bulk "generate all certificates for this level" admin action --
  each certificate is rendered on demand per download request; revisit
  only if a real need for bulk PDF export (e.g. for physical printing at
  the prize-distribution event) comes up.
- No email delivery of certificates -- download-only, matching exactly
  what was asked ("download their certificate from their portal").
