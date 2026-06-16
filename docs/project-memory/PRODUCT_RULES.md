# Product Rules

Last updated: 2026-06-16

## Platform Standards

- The platform must feel robust, professional, polished, and production-ready.
- Changes should be implemented, locally verified, pushed, deployed, and live-verified whenever the task affects production behavior.
- Do not push anything that breaks the platform.
- Preserve unrelated local user changes.

## UI Standards

- Question previews must be fully visible without inner scrolling.
- Question cards must not duplicate concept names or prompt text.
- Existing MathPath design system classes should be preferred.
- Role-based admin, teacher, and student surfaces must remain visually consistent.

## Generator Standards

- Practice/DPS generation must remain workbook-faithful.
- Mock generation must follow the finalized section and concept conventions.
- Do not let competition mock generation inherit stale or unrelated DPS section mappings.

## Deployment Standards

- Render backend and Vercel frontend are redeployed from GitHub pushes.
- After push, verify the live platform whenever the change affects user-facing behavior.
