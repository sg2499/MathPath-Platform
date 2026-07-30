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

## Curriculum Progression Paths (load-bearing for gamification, esp. Level Mastery badges)

Added 2026-07-30, directly from Shailesh, after the Level Mastery badge system
shipped and it became clear the Trophy Room can't just show all 39 badges to
every student regardless of position. **Any feature that shows a student
"which levels/badges are reachable" (Level Mastery badges, roadmap/progress
UI, etc.) must account for this — do not assume a flat 13-level sequence.**

A student progresses through the curriculum via exactly one of 3 fixed entry
paths. Modules referenced: YLM (3 levels), PM (4 levels), BM (1 level), IM (4
levels), MM (currently 1 level, expected to grow). The module order after
entry is always the same (…→ IM → MM); only the entry point and whether PM-L1
is included differ.

- **Path 1:** Starts at **YLM-L1**, completes all of YLM (L1-L3), then enters
  PM at **PM-L2** (PM-L1 is *never assigned* to this path — skipped
  entirely), completes PM-L2 through PM-L4, then IM (all 4 levels), then MM.
  This path **never touches BM**, and **never touches PM-L1**.
- **Path 2:** Starts at **PM-L1**, completes the full PM module (L1-L4), then
  IM (all 4 levels), then MM. This path **never touches YLM or BM**.
- **Path 3:** Starts at **BM-L1** (BM is a single-level module), then
  straight to IM (all 4 levels), then MM. This path **never touches YLM or
  PM at all**.

**Consequence for Level Mastery badges:** a badge for a level that is not on
a given student's path (either behind their entry point, or — for Path 1 —
PM-L1 specifically, which is skipped regardless of position) is permanently
unearnable for that student and should not be shown to them at all. A badge
for a level at or ahead of their current position on their own path should
still show normally (locked, progressing toward unlock).

**Known gap as of 2026-07-30, not yet resolved:** nothing in the data model
currently records *which path* a student is on. `Student.current_module_id`
/ `current_level_id` only capture where a student is *right now* — once
they've moved past their entry point, there's no stored distinction between,
e.g., a Path 1 student at PM-L3 (who skipped PM-L1) and a Path 2 student at
PM-L3 (who completed PM-L1). Building the "only show reachable badges"
filter requires resolving this first — either a new persistent field
(set at enrollment, e.g. `Student.entry_path` or `Student.starting_level_id`)
with a backfill plan for existing students, or some other way to disambiguate
that doesn't yet exist. Do not guess a student's path from `current_level_id`
alone where PM-L1 is involved — it's genuinely ambiguous.

## Deployment Standards

- Render backend and Vercel frontend are redeployed from GitHub pushes.
- After push, verify the live platform whenever the change affects user-facing behavior.
