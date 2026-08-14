# Product Rules

Last updated: 2026-06-29

## Platform Standards

- The platform must feel robust, professional, polished, and production-ready.
- Changes should be implemented, locally verified, pushed, deployed, and live-verified whenever the task affects production behavior.
- Do not push anything that breaks the platform.
- Preserve unrelated local user changes.

## UI Standards

- Question previews must be fully visible without inner scrolling.
- Question cards must not duplicate concept names or prompt text.
- Student attempt/exam workspaces must keep timing and answer context visible without relying on awkward nested scrolling.
- Long expression-style questions must stay readable by shrinking to fit before clipping.
- Existing MathPath design system classes should be preferred.
- Role-based admin, teacher, and student surfaces must remain visually consistent.
- Student-facing hero blocks should reuse the shared `math-kicker` / `math-block-header` / `math-subtitle` treatment instead of page-specific subtitle widths or font weights.
- Student-facing metric and status cards should converge on the shared gamified compact-card convention unless a page has a strong reason not to.
- App-wide layout should avoid horizontal page wobble; horizontal swipe should be localized to explicit wide-content containers such as tables.
- Auth/login screens should avoid artificial success delays and verbose transient status banners.
- Header branding in the authenticated shell should prefer the image logo as the primary brand mark and avoid redundant taglines or duplicate wordmarks.

## Generator Standards

- Practice/DPS generation must remain workbook-faithful.
- Master Module practice concepts that require the visual method must be mapped and displayed as `Concept Name (Visual)`.
- Master Module visual section titles, seeded DPS titles, and generator flags must stay aligned with the authoritative source workbook/image labels.
- Mock generation must follow the finalized section and concept conventions.
- Do not let competition mock generation inherit stale or unrelated DPS section mappings.

## Curriculum Progression Paths (background for gamification, esp. Level Mastery badges)

Added 2026-07-30, directly from Shailesh. **Updated 2026-08-14: YLM was
collapsed from 3 levels down to a single level (YLM-L1 only) by a
2026-08-12 curriculum change** (`seed_ylm_phase1.py`'s `_delete_obsolete_levels()`
now actively deletes any leftover YLM-L2/YLM-L3 rows on every backend
startup, matching BM/MM's one-level-per-module shape) — this section
originally described the pre-collapse 3-level YLM and was caught stale from
a live parent report showing the wrong next-level text; corrected below. A
student progresses through the curriculum via exactly one of 3 fixed entry
paths. Modules referenced: YLM (1 level), PM (4 levels), BM (1 level), IM (4
levels), MM (currently 1 level, expected to grow). The module order after
entry is always the same (…→ IM → MM); only the entry point and whether
PM-L1 is included differ.

- **Path 1:** Starts and completes at **YLM-L1** (YLM is now a single-level
  module), then enters PM at **PM-L2** (PM-L1 is *never assigned* to this
  path — skipped entirely), completes PM-L2 through PM-L4, then IM (all 4
  levels), then MM. This path **never touches BM**, and **never touches
  PM-L1**.
- **Path 2:** Starts at **PM-L1**, completes the full PM module (L1-L4), then
  IM (all 4 levels), then MM. This path **never touches YLM or BM**.
- **Path 3:** Starts at **BM-L1** (BM is a single-level module), then
  straight to IM (all 4 levels), then MM. This path **never touches YLM or
  PM at all**.

For now only IM and MM students exist in the platform; all 3 paths will be
populated over time, so any feature reasoning about student position should
not assume a flat 13-level sequence.

**Level Mastery badge visibility — the actual rule shipped, deliberately NOT
path-based:** a first attempt (PR #410, 2026-07-30) tried to solve "which
badges should a student see" by resolving which of the 3 paths a student is
on and projecting which levels are reachable ahead, backed by a new
`Student.entry_path` schema column + migration. That shipped, broke
production (the migration silently didn't apply against the live DB, causing
500s on every `Student` lookup across the app, not just achievements), and
was rolled back (PR #411). It also turned out to be solving a harder problem
than necessary — the feature never needs to reason about levels beyond the
student's current one.

**Rule actually shipped (no schema change, no migration):** a locked,
zero-progress Level Mastery badge is shown only if it is for the student's
CURRENT level (`badge's level_id == Student.current_level_id`).
Already-unlocked badges and badges with real progress > 0 always show
regardless of level. This alone produces the right behavior: a badge for an
already-passed level with no in-app history (real students had progress
before this platform existed) stays hidden since it has neither unlock nor
progress; a badge for a level completed in-app stays visible via progress >
0; and as a student advances to a new current level, that level's badge
appears automatically on the next request. No path inference, no
entry-point tracking, no schema field.

**Standard to follow for future "which badges/levels should this student
see" features:** prefer "current position + already-earned progress" over
"resolve path then project forward" unless a real requirement forces the
latter — it avoids an entire class of ambiguity (which path is this student
on?) and schema/migration risk for no behavioral benefit in this case. The 3
paths above remain true product facts and may still matter for other
features (e.g. a curriculum roadmap UI that needs to show the *whole* path
ahead, not just the next unlock).

## Deployment Standards

- Render backend and Vercel frontend are redeployed from GitHub pushes.
- After push, verify the live platform whenever the change affects user-facing behavior.
