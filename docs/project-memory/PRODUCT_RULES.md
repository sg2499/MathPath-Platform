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

## Deployment Standards

- Render backend and Vercel frontend are redeployed from GitHub pushes.
- After push, verify the live platform whenever the change affects user-facing behavior.
