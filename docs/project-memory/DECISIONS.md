# Decisions

Last updated: 2026-07-07

## Project Continuity

Decision: Use repo-based project memory plus Codex automation.

Reason:

- Chat history alone is not reliable enough for a long-running client product.
- Git history shows what changed, but not enough of the product intent.
- Repo-based memory travels with the project and can be read by any future conversation.

## MM Mock Defaults

Decision: MM mocks default to 100 questions and 60 minutes.

Reason:

- This matches the expected full Master Module mock convention.
- The default section allocation becomes 10 questions across each of the 10 MM sections.

## MM Mock Structure

Decision: MM competition mocks are section-locked and concept-sequential.

Reason:

- The mock must train and test section-wise mastery, not random concept mixing.
- Section labels must match generated sums.
- Concept sequence is part of the learning and assessment process.

## Existing Mock Preview Cleanup

Decision: Fix duplicated prompts and scroll behavior at the frontend renderer layer.

Reason:

- Existing saved mocks should benefit without regeneration.
- The issue is display convention, not data correctness.

## Student Mock Attempt Workspace

Decision: Competition mock attempts should use one coherent exam workspace with timer/status surfaced inside the metrics area rather than relying on separated sticky timer blocks.

Reason:

- Students need persistent timing and progress context without losing horizontal room for the active question.
- The structured workspace reduces awkward scroll behavior and leaves more room for long questions and answer options.

## MM Visual Add/Less Constraints

Decision: MM visual add/less generation should enforce explicit row-count and digit-shape rules for fast visualisation and decimal visual questions.

Reason:

- Generic add/less ranges were allowing malformed or overly easy visual questions.
- Competition mocks need consistent visual difficulty and valid operand patterns across saved and live-generated mocks.

## Student UI Conventions

Decision: Student-facing hero blocks and metric cards should converge on shared design-system conventions instead of page-specific typography and sizing.

Reason:

- The 2026-06-26 and 2026-06-29 UI cleanup work repeatedly had to remove one-off hero spacing, subtitle widths, and card styling differences.
- A shared `math-kicker` / `math-block-header` / `math-subtitle` treatment plus the gamified compact metric-card pattern reduces drift and makes future UI edits safer.

## Header Branding

Decision: The authenticated app shell should use the refreshed image logo as the primary brand mark and avoid redundant wordmark/tagline text.

Reason:

- The upscaled logo asset now carries the branding more cleanly than the previous mixed image-plus-text treatment.
- The repeated 2026-06-29 header adjustments converged on a larger image-only LogoMark for clarity and consistency.

## Login UX

Decision: Login should redirect immediately after success without artificial delay or verbose transient status banners.

Reason:

- The old timed delay made the app feel slower without improving correctness.
- The cleaner loading state keeps the flow standard and reduces unnecessary UI noise.

## Student Login Accessibility

Decision: The shared login surface must remain zoom-friendly and responsive across narrow phones, tablets, landscape, and short screens, and regressions should be guarded by an explicit Playwright matrix.

Reason:

- The earlier viewport lock (`maximumScale: 1`, `userScalable: false`) masked mobile usability problems instead of solving them.
- The 2026-07-04 hardening work added real layout safeguards and CI coverage, so future edits should preserve user zoom and measurable responsive behavior.

## Dashboard Grind Metric

Decision: The student dashboard grind heatmap should reflect time spent per day, with a minimum 2-minute credit for any completed sheet, instead of raw completed-sheet count alone.

Reason:

- Pure completion counts flattened the visualization and understated longer work sessions.
- A small minimum credit keeps quick completions visible while still allowing heavier sessions to stand out.

## Dashboard Grind Window

Decision: The student dashboard grind heatmap should show the current Sunday-to-Saturday week instead of a rolling last-7-days window.

Reason:

- The tooltip/card language now frames the surface as a weekly rhythm tracker rather than a trailing activity log.
- A fixed calendar week makes empty earlier or upcoming days easier to interpret during browser QA and student review.

## Dashboard Flow Tooltip

Decision: The dashboard grind heatmap bars should communicate a derived daily flow score with tier labels, while the tooltip also exposes time spent and accuracy.

Reason:

- Time spent alone was too blunt to communicate the quality of a practice session.
- The richer tooltip keeps the compact chart readable while surfacing a stronger daily-performance narrative.
