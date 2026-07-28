# Gamification Round 2 — Execution Plan

Status: **APPROVED. Ready to start the reference batch (2a).** Companion docs:

- `GAMIFICATION_ELEVATION_PLAN_2026-07-25.md` — the overall phased plan (Phase 0 is done and live; this doc covers Phases 1-4 of it).
- `GAMIFICATION_BADGE_CATALOG_PROPOSAL_2026-07-25.md` — the 99-badge catalog and animation-elevation requirements (Parts 1-3), updated 2026-07-25 to correct the path model to 3 paths (see Section 1 below).

## 0. What Round 2 actually covers

Everything that isn't a bug fix: elevating the existing 30 badges to AAA/unique-per-badge quality, building the ~69 new badges that take the catalog to 99, DPS Sheet badges from scratch, and the 10-12 celebration variants per accuracy tier. Six sub-phases, each independently shippable and QA-gated, in the order below — deliberately reference-batch-first so quality is proven before it's scaled, not discovered after 99 badges are already built.

## 1. Decisions — all confirmed by Shailesh 2026-07-25

1. **Badge taxonomy — approved**, with one structural correction that's now baked into the catalog doc: **there are 3 student journeys, not 2.**
   - Path 1 (YLM entry): YLM (all levels) → Preparatory Level 2-4 (Level 1 structurally skipped) → Intermediate → Master.
   - Path 2 (Preparatory direct-entry): Preparatory Level 1-4 (all 4 levels) → Intermediate → Master.
   - Path 3 (Bridge entry): Bridge (1 level) → Intermediate → Master.

   Preparatory will have 4 levels, Bridge 1 level, once built. Every path-aware badge (Module Completion, Grand Master, all cross-module meta badges) is defined against these 3 paths — see the catalog doc's Section 1c/1d for the exact per-path logic, including the rule that a Path 1 student's Preparatory-completion check excludes Level 1 entirely (not applicable, not missing). 60 skill badges + 24 Level Mastery + 10 Module Completion + 5 meta = 99 total, unchanged.
2. **Visual pipeline — approved.** Unique AI-generated master art medallion per badge (GLSL key-out technique, same as the Rank system) + a procedurally-parametrized environment/camera/motion recipe seeded per badge code. Proof point is the reference batch (2a) — reviewed against real top-tier game references (Genshin, Marvel Snap, Clash Royale) before scaling to the rest.
3. **Model routing — approved.** `vfx-3d` / `principal-designer` design-and-build work routes to Opus 5 for this initiative.
4. **Historical backfill — approved.** Level Mastery / Module Completion badges backfill against attempts completed before these badges existed, through the established safe recalculation pattern (`AGENTS.md`'s "Gamification Stat Integrity" rule) — never a piecemeal script.
5. **Sequencing — approved as laid out in Section 2 below.**

## 2. Sub-phases, in sequence

### 2a. Reference batch (de-risking step, ships first, small)

Before touching the other 94-96 badges, build and get explicit sign-off on **3-5 reference badges spanning different tiers and families** — this is the actual quality gate, not a formality. Proposed selection: one BASE-tier skill badge, one existing badge getting re-elevated (e.g. Perfectionist, to prove the "no visible seam between old and new" requirement), one new MYTHIC-tier badge (the top of the ladder, so the ceiling is proven early), one Level Mastery badge (a new badge *type*, not just a new instance of an existing one), and one LEGENDARY badge with the rarity-scaled spectacle treatment.

Each reference badge gets: a unique AI-generated master art medallion, the GLSL black-background key-out shader, a procedurally-parametrized environment/camera/motion recipe, an upgraded card thumbnail (replacing the flat lucide-icon-in-clip-path treatment), and — if sign-off extends to it — a first pass at the unlock sound effect. Reviewed against the concrete design bar from the catalog doc's Part 3 (Genshin/Marvel Snap/Clash Royale-caliber reveal-moment craft: camera work, lighting, color grading, timing).

**Nothing past this sub-phase starts until these are explicitly approved.**

### 2b. Visual pipeline build-out (infrastructure, not content)

Once the reference batch proves the approach, build it as reusable infrastructure rather than one-off code per badge:

- The procedural recipe generator (deterministic variation seeded off badge code — geometry, motion pattern, camera choreography, particle behavior, timing curve).
- The card-thumbnail rendering upgrade (AI medallion art + shader key-out, replacing `lucide-react` icon + CSS clip-path across the whole Trophy Room grid, not just the inspection modal).
- The shared visual-grammar constraints (lighting intensity range, bloom thresholds, pacing conventions) that keep 99 distinct badges reading as one coherent world.
- Performance safeguards from the master plan's Phase 4: one heavy `<Canvas>` mounted at a time with guaranteed unmount/context-release between cinematics, a `prefers-reduced-motion` / low-end-device fallback per cinematic, and automated regression coverage that asserts each cinematic actually mounts on its real trigger and reaches a settled state within a bounded time (the same class of bug Phase 0 just fixed).

### 2c. Elevate the existing 30 badges

Re-skin all 30 current badges (10 families x 3 tiers) onto the new pipeline — new unique master art, new unique procedural recipe per badge, new card thumbnail. Zero changes to `AchievementBadge` codes, tiers, thresholds, or `AchievementEngine` unlock logic — purely presentational, so already-earned `StudentBadge` rows are completely unaffected (same zero-regression guarantee as Round 1). This is also where the current icon-sharing duplication gets fixed for good (`Medal`/`Trophy`/`Crown` sharing one environment, `Clock`/`AlarmClock` sharing another, etc.) since every environment keys off badge code now, never a shared icon fallback.

### 2d. Build the new 69 badges

In the order the signal complexity naturally suggests:

1. **5 new skill families + MYTHIC tier on all 15 families** (Axis A, 60 badges total including the existing 15x3) — pure additive `AchievementBadge` rows, evaluation logic extends the existing per-family counters in `AchievementEngine`, no new data source needed.
2. **Level Mastery badges** (24 badges, 3 tiers x 8 real levels today) — needs a small new stat-tracking helper for "all mocks in this level cleared" alongside the existing counters, and a live pull against the real `Module`/`Level` tables to confirm exact current counts before building (the grep-based numbers in the catalog doc are a starting point, not final).
3. **Module Completion badges** (10 badges) — including the path-aware Grand Master logic across all 3 real paths (YLM-entry, Preparatory-direct-entry, Bridge-entry — see Section 1), plus the Path 1 Preparatory-Level-1-skip rule (excluded from that path's completion check, not treated as missing). Needs the path-determination logic (real enrollment/assignment history, not inferred from attempts) built once and reused everywhere path-aware badges are evaluated.
4. **Cross-module meta badges** (5 badges) — built last since several of them (The Completionist, MathPath Legend) depend on every other badge category already existing.
5. **Trophy Room UI restructure** — add the Progression section (Level Mastery / Module Completion / meta) alongside the existing flat tier shelves, since there's currently nowhere in the UI for these new badge types to live.

### 2e. Accuracy-tier celebration variants

10-12 unique cutscene variants per tier (40-48 total, up from today's 4) with the shuffled non-repeating selection logic (track seen variants per student per tier, reshuffle only once the pool is exhausted). This is scoped separately from badge work since it touches a different component (`EpicCelebration.tsx`, not `BadgeInspectionModal.tsx`) and fires on every single mock submission regardless of outcome, so it has the highest repeat-exposure of anything in this plan.

### 2f. DPS Sheet badges from scratch

Genuinely net-new (confirmed zero backend/frontend exists today): DPS-specific signals (consecutive-day streaks, DPS volume, DPS-specific accuracy, Needs-Re-Attempt recovery, per-lesson/per-level DPS mastery, speed-within-time-limit), a new evaluation hook mirroring `AchievementEngine.evaluate_mock_exam_submission()` called from the DPS attempt-submission path, and a `source_type`/code-prefix convention so the Trophy Room's already-scaffolded "Mock Exams"/"DPS Sheets" tab split filters correctly. Reuses ~80% of the existing Mock Exams tab's rendering code (Shelf/BadgeCard/BadgeInspectionModal are already generic over badge data).

Sequenced last because it's the only fully from-scratch piece (everything else extends proven infrastructure), and because the DPS submission path hasn't had the same "does the notification actually persist" bug pattern checked yet that the mock side already hit once — worth doing that check proactively as part of this build, not after.

## 3. Squad routing and gates

Per `.agents/AGENTS.md`, unchanged from the master plan: `principal-designer` + `vfx-3d` for design/build (Opus 5, pending confirmation in Section 1), `backend-architect` for the DPS badge service, new badge seed data, and the Level/Module stat-tracking helpers, `qa-reviewer` gate before every merge, `browser-qa` for live verification of every new trigger (non-negotiable — this is the exact lesson Round 1's audit already proved: reading the code is not sufficient to know a cinematic actually works). `sre-devops` for delivery once qa passes. Same Cowork-sandbox constraint as always: this environment can prepare and review everything below, but push/PR/merge/deploy and final live-reverification still need a local Claude Code session.

## 4. Zero-regression guarantee, restated for Round 2 specifically

Same commitment as Round 1, extended to cover the new surface area:

- Elevating the existing 30 badges (2c) is presentational only — no `AchievementBadge` code/tier/threshold changes, no `AchievementEngine` logic changes, so no already-earned `StudentBadge` row is touched.
- Every new badge (2d, 2f) is a new `AchievementBadge` row with a new code — additive only, never modifies an existing badge's identity.
- Nothing in this plan touches `EconomyService`, `award_xp_and_coins()`, or XP/coin/rank logic, at any point.
- If historical backfill is approved (Section 1, decision 4), it happens through the established safe recalculation pattern, never a piecemeal script.
- Before any sub-phase is called done: a real student account's already-earned badges, XP, coins, and rank are checked before/after and confirmed identical unless the change specifically added something new — a `qa-reviewer` gate item, not optional.

## 5. Next action

Start the reference batch (2a): 3-5 sample badges built to the new visual bar, routed to `vfx-3d`/`principal-designer` (Opus 5), reviewed against real game references, `qa-reviewer`-gated, and presented for Shailesh's explicit sign-off before anything else in this plan starts.
