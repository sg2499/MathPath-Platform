# Gamification Elevation Plan — Mock Exam Badges, DPS Badges, Leaderboard

Status: DRAFT — awaiting Shailesh's approval before any implementation begins. Written after a full code + live audit of the existing badge, rank, and leaderboard systems (see findings summary below). No code has been changed as part of this plan.

## 0. Why this plan exists

The ask: elevate the mock exam badge system, build DPS sheet badges from scratch, revamp the leaderboard, and do it all to a genuine AAA gamified standard — animations, physics, VFX — so gamification becomes a real USP, something students want to come back and fiddle with. Also: 30 mock exam badges isn't enough headroom for a student who plays through every level of every module (MM being the last/terminal module today); the catalog needs to scale so completing everything is a real, motivating grind, not something exhausted in a week.

Before proposing new work, the existing systems were audited end to end — in code and live in production (via a real student account, Nishant Gantayet, read-only). That audit surfaced something important enough to reshape the plan: **a lot of genuinely AAA-quality work already exists in this codebase, but a meaningful amount of it either never fires at the right moment or fires and then breaks.** Concretely:

- The mock exam badge inspection cinematic (`BadgeInspectionModal.tsx`) is a real, well-built React Three Fiber experience — 16 bespoke procedural 3D environments, bloom/vignette/noise post-processing, slow-mo entrance, kinetic typography. But nothing in the actual mock-submission flow ever shows a student *which* badge they just earned — the result page's celebration (`EpicCelebration`) is purely accuracy-tiered and has zero awareness of badge unlocks. Discovering a badge today means noticing a plain notification and clicking through.
- The leaderboard's podium-click cinematic (`PodiumHeroAnimation.tsx`) is even more ambitious — six distinct bespoke 3D scenes (a distorted "galaxy" core, an infinite cyan grid, falling shards, a black hole singularity, a data-stream cylinder, a nebula) with full kinetic "Awarded To [Name] — [Title]" typography. Live-testing it (after working around a real click-registration issue in this session's own tooling) surfaced a genuine, reproducible production bug: the full-screen black backdrop that's supposed to fully immerse the viewer gets stuck at roughly 20% opacity and never reaches 100% — so the ordinary leaderboard table is clearly visible behind the "epic" reveal, and in this session's test the "Skip Animation" button didn't dismiss it either. Most likely cause: the stacked post-processing passes are heavy enough to stall the main thread and starve the Framer Motion animation loop driving the opacity tween.
- The backend already computes each leaderboard entry's top 3 badges (`topBadges`) for exactly the "flex your achievements" moment — the frontend never renders it.
- The Rank system (Copper→Champion) has the actual "AI-generated master asset + custom GLSL key-out shader" pipeline this project's own `.claude/agents/vfx-3d.md` calls the standard — but even that only plays as a manual, on-demand preview from a guide modal, never automatically when a student's XP actually crosses a tier.
- The Trophy Room's DPS Sheets tab is a real, empty placeholder ("Coming Soon — currently being forged") with zero backend behind it — confirmed via a full grep, not assumed.

The implication for this plan: elevating this system is not purely an additive exercise. A meaningful first phase has to be about making what's already built actually land reliably, before or alongside building more on top of it — otherwise we're stacking new spectacle on infrastructure with a proven failure mode.

## 1. Guiding principles

1. **Every reveal moment must actually render as designed, every time.** Opaque when it should be opaque, on the correct real trigger (not just a manual preview), dismissible, performant. "Wow" only counts if it reliably lands — an inconsistent cinematic is worse than a plain one.
2. **One visual standard, not three.** Today there are three different rendering philosophies for conceptually similar things (hand-coded SVG rank badges, AI-master-asset + shader rank cinematics, procedural-R3F-plus-lucide-icon achievement badges). Converge deliberately rather than adding a fourth.
3. **Badge count scales with real progress signals, not arbitrary padding.** More badges should mean more genuine skill/effort/consistency signals recognized, spanning the full module → level → lesson hierarchy, not participation-trophy spam.
4. **Never regress the academic flows underneath.** Every mock exam, DPS, and assessment correctness fix from the pre-rollout QA closeout phase stays untouched; gamification is an additive layer.
5. **Performance discipline is non-negotiable.** These are the heaviest components in the app already (per `vfx-3d.md`'s own operating rules). More of them, triggered more often, raises real risk to Core Web Vitals and low-end devices if not budgeted deliberately.
6. **Ship in verifiable phases**, each with a `qa-reviewer` gate and a real `browser-qa` live-verification pass (this session's own experience is proof that reading the code is not sufficient to know a cinematic actually works — it has to be clicked).

## 2. Phase 0 — Fix what's already built (highest leverage, lowest risk)

This phase touches no new features. It makes today's real, already-built spectacle actually work, and is a prerequisite for everything after it.

1. **Root-cause and fix the Podium Hero Animation opacity stall.** Reduce the EffectComposer cost on the podium cinematic (candidates: drop `ChromaticAberration`, cap `multisampling`, profile draw calls per `vfx-3d.md`'s own performance-discipline rule), and decouple the critical backdrop opacity from a starvable rAF-driven tween — e.g. a plain CSS transition for the opaque backdrop layer, independent of whatever the 3D canvas is doing. Add a hard fallback: if the entrance animation hasn't resolved within a bounded time, force it to its end state rather than allow an indefinite stuck/translucent overlay. Same fix philosophy applies to the exit/dismiss path, since "Skip Animation" not working is the more serious of the two symptoms found.
2. **Wire the mock-exam badge unlock into the actual result moment.** `SubmitCompetitionMockAttemptForStudent` already returns `unlockedBadges` in its response. Extend the mock-result page to consume it and play a dedicated per-badge reveal (adapting the existing `BadgeInspectionModal` cinematic) sequenced with or in place of the generic `EpicCelebration`, queued if more than one badge unlocked in the same submission.
3. **Render `topBadges` on the leaderboard** (backend already computes it) — a small badge-chip cluster per podium card / table row.
4. **Fix the BadgeInspectionModal stacking/immersion bug** — it currently renders below the app's own header chrome (theme toggle, bell, profile all stay visible through the "epic" reveal); it should render above all app UI. Add a real Escape-to-close handler and confirm the close button has a reliable, unambiguous hit target.
5. **Verify (and very likely fix) the leaderboard's ambient background effects in light mode.** The hyperspace grid, floating stardust, and aurora glows are built with very low opacities and `mix-blend-screen`, which reads as effectively invisible against a light background. Either retune them to work in both themes or make an explicit, deliberate call that they're a dark-mode-only flourish.
6. **Wire an automatic rank-up trigger.** The Rank cinematic currently only plays as a manual preview; it should fire automatically the moment a student's `UserEconomy.current_xp` genuinely crosses a tier boundary.

Every item in this phase gets a live `browser-qa` re-verification against a real (or throwaway) account before being called done — the same standard the recent pre-rollout QA closeout phase held itself to, and the same reason this planning pass caught what a code-only read would have missed.

## 3. Phase 1 — Unify the visual pipeline

Decision needed before Phase 2 can be built at scale: what does a *new* badge look like, visually?

- **Option A — Extend the existing procedural R3F environment system.** Already has 16 bespoke environments, is genuinely good, and — critically — scales by writing code (a new environment function per visual family), not by commissioning a unique art asset per badge. This matters a lot once the catalog grows into the hundreds (Phase 2).
- **Option B — Move achievement badges to the AI-master-asset + GLSL key-out pipeline** the Rank system uses. Higher single-badge fidelity, but real production cost per new badge (an asset has to be generated and approved for every one), which scales much worse against a catalog this large.
- **Recommendation: Option A as the base, with a quality pass on the flat parts.** Keep the procedural-environment system (it's the right architecture for scale), but replace the *thumbnail/card* representation — currently a `lucide-react` icon inside a CSS `clip-path` polygon, which is the one place today's badges look visibly flatter than the Rank system — with real modeled badge medallion shapes (or AI-generated medallion art composited the same shader-key way Rank already does, used only for the small card thumbnail, not the full environment). This gets Rank-level card polish without paying Rank's per-badge asset cost for the *inspection cinematic*, which stays procedural.

This is a real design/architecture call, not a foregone conclusion — flagged as a decision point below rather than assumed.

## 4. Phase 2 — Expand the mock exam badge catalog

### 4.1 What exists today
10 skill-based families × 3 tiers (BASE/SUPER/LEGENDARY) = 30 badges, entirely global — none of them are tied to which module or level the mock was taken in. Families: Perfectionist, Speed Demon, Competitor, Unstoppable Streak, Early Bird, Comeback Kid, Podium Finisher, Sharpshooter, Underdog, High Achiever.

### 4.2 What's actually built in the curriculum right now (grounds the numbers below)
Confirmed by grepping the real curriculum/seed code rather than assuming: **IM has 4 built levels (L1–L4)**; **MM currently has L1 and L9 confirmed referenced in code** (MM's full level range beyond that isn't yet built out, per the codebase as it stands today); **YLM has at least an L2 phase-1 seed**, with the full YLM level count not yet confirmed here. Before Phase 2 is actually built, this needs a proper pass against the live `Module`/`Level` tables (not just a grep) to get exact, current level counts per module — the numbers below are structural targets, not a final locked list.

### 4.3 Proposed structure — two axes instead of one

**Axis A — Skill badges (exists today, extend it).** Keep all 10 existing families. Consider adding several more cross-cutting skill signals that don't exist yet: a "Marathoner" family (multiple mocks completed in a single day/session), a pure-accuracy-streak family distinct from the existing percentage-based streak, and a couple of others tied to signals already computed elsewhere in the app (e.g. time-management consistency). Target: grow from 10 to roughly 15–18 families. Add a fourth tier (MYTHIC, above Legendary) to the highest-count families specifically so a long-tenure student doesn't exhaust every tier partway through their journey — this is the direct answer to "30 is nothing by the time they finish MM."

**Axis B — Progression badges (new).**
- **Level Mastery badges** — one badge per level per module, awarded for a real bar (e.g. every assigned mock in that level completed at or above a defined accuracy threshold), not just participation. With the confirmed level counts above (4 for IM, at least 2 confirmed for MM, YLM TBD) this alone is a meaningful chunk of new badges, and grows automatically as new levels/modules ship — no code change needed per new level if built generically off the `Level` table.
- **Module Completion badges** — a capstone per module (e.g. "YLM Champion", "IM Champion", "MM Champion"), each with its own quality tier, plus a single top-tier "Grand Master" badge for clearing every currently-available module at the highest tier. This is the badge that should feel genuinely hard to get and is the natural answer to "make it difficult and motivating by the time they finish MM."
- **Cross-module meta badges** — signals that only make sense once a student has touched more than one module (e.g. "completed a mock in every module", "podium finish in every module").

Put together, this plausibly lands in the 90–130 badge range depending on final level counts — a genuinely large, structured system, not padding, since every badge still maps to a real, verifiable signal already available in the data model (`CompetitionMockResultSummary`, `Student.current_level_id`, existing stat counters).

### 4.4 What this needs technically
- New `AchievementBadge` rows (schema already supports arbitrary `code`/`tier`/`required_count` — no migration needed for more badges in the existing shape).
- Level/Module-scoped badges need the evaluation logic to know which level/module a mock belongs to (already available via `CompetitionMockExam.level_id`/`module_id`) and a way to track "all mocks in this level cleared," which likely needs a small new stat-tracking helper alongside the existing per-family counters in `AchievementEngine`.
- The Trophy Room UI needs a grouping change (currently three flat tier shelves) to also group by module/level for the new axis — a real, if contained, frontend change.

## 5. Phase 3 — Build DPS Sheet badges from scratch

Confirmed zero backend or frontend exists today (no model, service, or seed data references DPS anywhere in the achievement system) — this is a genuine from-scratch build, not an extension.

- **Signals available for DPS specifically, distinct from mock signals:** consecutive-day practice streaks, DPS volume completed, DPS-specific accuracy, "Needs Re-Attempt" recovery (cleared a resubmission), per-lesson/per-level DPS mastery, speed-within-time-limit. These are meaningfully different from the mock-exam signals and shouldn't just be a re-skin of the same 10 families.
- **Reuses the existing generic schema** (`AchievementBadge`/`StudentBadge`/`StudentAchievementStat` are not mock-specific in structure) — the main design decision is how badges get tagged as DPS-origin vs. mock-origin (a `source_type`/category field, or a code-prefix convention) so the Trophy Room's existing "Mock Exams" / "DPS Sheets" tab split (already scaffolded in the UI) can filter correctly.
- **New evaluation hook** mirroring `AchievementEngine.evaluate_mock_exam_submission()`, called from wherever DPS attempts are submitted (`attempt_service.py`), following the same commit-and-notify pattern already established and already fixed once for a real notification-persistence bug on the mock side — worth applying that same fix pattern proactively here rather than rediscovering it.
- **Trophy Room DPS tab** reuses ~80% of the existing Mock Exams tab's rendering code (Shelf/BadgeCard/BadgeInspectionModal all already generic over badge data) — this is genuinely less net-new frontend work than it sounds like, since the shell is already built and empty, waiting for real data.

## 6. Phase 4 — Performance & robustness safeguards

Given how many heavy React Three Fiber canvases will exist once this is done (mock badge modal, DPS badge modal, rank cinematic, podium hero animation, plus the existing Collector's Vault) —

1. **A shared "one heavy canvas at a time" rule** — ensure a previous cinematic's `<Canvas>` genuinely unmounts (and its WebGL context is released) before the next one mounts, to avoid context exhaustion if a student chains through several reveal moments in one session.
2. **A `prefers-reduced-motion` and low-end-device fallback** for every new cinematic — a static, still-celebratory version that skips the heaviest post-processing, both for accessibility and for the Core Web Vitals mandate `frontend-architect` already owns.
3. **Automated regression coverage for every cinematic**, not just a visual once-over: assert it mounts on the real trigger event (not only via manual preview), reaches its intended full-opacity/settled state within a bounded time, and is reliably dismissible. This directly targets the exact class of bug this audit found.

## 7. Delivery sequencing

Recommended as four separate rounds rather than one large one, each independently shippable and QA-gated:

1. Phase 0 fixes (bug fixes to existing systems — lowest risk, highest immediate payoff).
2. Visual pipeline decision + expanded skill-badge catalog (Axis A) — still mock-only, no new schema shape needed.
3. Level/Module/meta badges (Axis B) — needs the real curriculum data pull first.
4. DPS badges from scratch.

Squad routing per `.agents/AGENTS.md`: `principal-designer` + `vfx-3d` for the design/build (a case for dispatching this specific work to Opus 4.8 rather than the Sonnet default was already discussed and is still awaiting your explicit go-ahead per the model-routing protocol); `backend-architect` for the DPS badge service and new badge seed data; `qa-reviewer` gate before every merge; `browser-qa` for live verification of every new trigger, given this audit's own lesson that reading code is not sufficient; `sre-devops` for delivery once qa passes. This Cowork sandbox has no push/PR access regardless of how much of this gets prepared here — delivery still ultimately needs a local Claude Code session, same as every other workstream on this project.

## 7.5 Data safety guarantee — existing badges, XP, coins, and rank stay untouched

Explicit commitment, since gamification data corruption is a real historical risk this project has already hit once (see `AGENTS.md`'s "Gamification Stat Integrity" rule, written after a prior incident where piecemeal ORM scripts risked double-counting stats):

- **XP, coins, and rank tier live entirely in `UserEconomy`/`EconomyTransaction`, a separate system from badges.** Nothing in this plan touches `EconomyService`, `award_xp_and_coins()`, or how/when XP or coins are earned. The only economy-adjacent change anywhere in this plan is presentational — auto-firing the already-existing rank-up cinematic when a rank-up that already happens under today's logic occurs, not changing when or how rank actually changes.
- **Every schema change is additive, never destructive.** New tiers (Mythic), new skill families, Level Mastery, Module Completion, and meta badges are all *new* `AchievementBadge` rows with new codes. The existing 10 families' codes, tiers, thresholds, and logic in `AchievementEngine` are not modified. A `StudentBadge` row is a foreign key to a specific badge row — adding new badge rows cannot alter, delete, or renumber any badge a student has already earned.
- **Existing `StudentAchievementStat` counters keep accumulating exactly as they do today** — untouched by this work. New stat counters for new badge families start at zero and count forward from whenever the new badges ship, unless we explicitly decide to backfill them against a student's real historical attempts (open decision below) — and if we do, it happens via the same holistic `recalculate_all_gamification_stats()`-style master reset this project already established as the safe pattern, never a piecemeal ad hoc script.
- **Verification, not just intent:** before any round is called done, a real student account's already-earned badges, XP, coins, and rank are checked before and after the change and confirmed byte-for-byte identical unless the change was specifically meant to add something new. This is a `qa-reviewer` gate item, not optional.

**One open decision this raises:** should the new badges (especially Level Mastery / Module Completion, which depend on a student's whole history in a level) be backfilled against attempts a student already completed before these badges existed, or only start counting from launch day forward? Backfilling is fairer to students who've already demonstrated qualifying performance, but is exactly the kind of operation that has to go through the safe recalculation pattern above rather than being rushed. Flagging for your call rather than assuming either way.

## 8. Open decisions needed before implementation starts

1. **Exact badge taxonomy/count** — greenlight the two-axis shape now and let exact numbers/thresholds get finalized once the real per-module level counts are pulled in Phase 2, or do you want the exact list back for sign-off first?
2. **Visual pipeline direction (Phase 1)** — confirm the Option A recommendation (procedural environments + upgraded card thumbnails) rather than fully committing every new badge to bespoke AI-generated art.
3. **Model routing** — confirm dispatching the `vfx-3d`/`principal-designer` work on this initiative to Opus 4.8 for these tasks specifically, per the earlier model-router read (hard technical 3D/shader/performance work combined with visual design judgment).
4. **Sequencing** — confirm the four-round breakdown above, or reprioritize (e.g. DPS badges before the expanded mock catalog, if that matters more to you near-term).
