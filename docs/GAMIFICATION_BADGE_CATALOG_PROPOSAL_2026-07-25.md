# Mock Exam Badge Catalog + Animation Elevation — Proposal for Approval

Status: DRAFT, for Shailesh's sign-off before anything is built. Companion to `GAMIFICATION_ELEVATION_PLAN_2026-07-25.md` (the broader phased plan). This doc is the concrete round-1 deliverable per that plan's sequencing: fix + elevate the existing mock exam badge/animation system, and expand the mock exam badge catalog, before DPS badges or the full leaderboard visual pipeline decision.

Every threshold below is a proposed starting point, not a locked spec — flag anything you want changed, renamed, retuned, or cut before this goes to build.

## Grounding: what's actually built today, and the real 5-module structure

The platform's intended structure is 5 modules, confirmed directly in `seed_master_module.py`'s own hierarchy comment: **Young Learners (YLM) → Preparatory (PM) → Bridge (BM) → Intermediate (IM) → Master (MM)**. Only 3 of the 5 have any real content today — Preparatory and Bridge have no seed script, no `Module`/`Level` rows, and no question engine at all, the same "reserved but unbuilt" state DPS badges were in.

| Module | Status | Built levels today |
|---|---|---|
| YLM (Young Learners) | Live | L1, L2, L3 — 3 levels |
| Preparatory | **Not built** | — |
| Bridge | **Not built** | — |
| IM (Intermediate) | Live | L1, L2, L3, L4 — 4 levels |
| MM (Master, terminal module) | Live | L1 only — 1 level (30 lessons inside it) |

**8 real levels across the 3 live modules today.** Every progression-badge count below is built off real `Level`/`Module` rows, not hardcoded lists — so Preparatory and Bridge badges appear on their own the day those modules ship real content, with no redesign needed. Preparatory will have 4 levels; Bridge will have 1 level, once built.

**Critical structural fact, corrected by Shailesh: there are three mutually exclusive student journeys, not two — a student takes exactly one, never a combination:**

- **Path 1 (YLM entry):** YLM (all levels) → Preparatory starting at **Level 2** (Level 1 is structurally skipped — YLM already covers that ground) → remaining Preparatory levels → Intermediate → Master.
- **Path 2 (Preparatory direct-entry):** Preparatory starting at Level 1, all 4 levels → Intermediate → Master.
- **Path 3 (Bridge entry):** Bridge (single level) → Intermediate → Master.

This means no student's "complete every module" ever literally means all 5, and — the sharper point — "complete Preparatory" doesn't mean the same set of levels for every student: a Path 1 student who never touched Preparatory Level 1 has still completed Preparatory, because Level 1 was never applicable to their journey, not because they're missing progress. A completion check that requires Level 1 for everyone would make Preparatory permanently unearnable for every YLM-path student. This directly shapes how the level/module/capstone badges below are defined (Section 1b/1c/1d, revised) — path determination must come from real enrollment/assignment history, never inferred from which levels a student happens to have attempted.

## Part 1 — The expanded badge catalog

### 1a. Skill badges (Axis A) — extend the existing 10 families to 15, add a 4th tier

The existing 10 families stay as-is (Perfectionist, Speed Demon, Competitor, Unstoppable Streak, Early Bird, Comeback Kid, Podium Finisher, Sharpshooter, Underdog, High Achiever) — no changes to their logic or thresholds. Two changes apply across all 15 families:

**A new MYTHIC tier above Legendary**, so a long-tenure student doesn't exhaust every tier partway through their journey — this is the direct fix for "30 is nothing by the time they finish MM." Proposed Mythic thresholds are roughly 2–3x the existing Legendary bar (exact numbers in the table below).

**5 new families**, chosen because each maps to a real, already-available signal (nothing here needs new data collection):

| New family | Signal | BASE | SUPER | LEGENDARY | MYTHIC |
|---|---|---|---|---|---|
| **Marathoner** | Cumulative time spent across all mock attempts, lifetime (revised 2026-07-28: the original same-calendar-day-volume signal turned out to be unrealistic — mock assignment on this platform is fully manual/ad-hoc and bulk-to-a-level, so a student rarely if ever has 3+ mocks available to complete in one day. Time-on-task is immune to that, since it accumulates regardless of how bursty or sparse assignment is) | 3 hrs | 10 hrs | 25 hrs | 60 hrs |
| **Iron Wall** | Never drops below a score floor across a run of mocks (consistency, distinct from the existing >90% streak badge) | 5 straight mocks ≥60% | 10 straight ≥70% | 20 straight ≥75% | 40 straight ≥80% |
| **The Veteran** | Lifetime question volume across all mocks (rewards sheer time invested, not just accuracy) | 250 questions answered | 1,000 | 3,000 | 7,500 |
| **Last-Minute Hero** | Submits within the final 10% of the assignment window and still scores ≥80% (mirrors Early Bird's opposite) | 1 time | 5 times | 15 times | 30 times |
| **Section Specialist** | Scores 100% on every question of one concept/section within a mock, at least 3 times across different mocks | 3 times | 10 times | 25 times | 50 times |

**Proposed MYTHIC thresholds for the existing 10 families** (roughly 2–3x today's Legendary bar, keeping the existing BASE/SUPER/LEGENDARY numbers untouched):

| Family | MYTHIC threshold |
|---|---|
| Perfectionist | 25 perfect (100%) scores |
| Speed Demon | 40 times |
| Competitor | 150 mocks completed |
| Unstoppable Streak | 25 consecutive mocks >90% |
| Early Bird | 30 times |
| Comeback Kid | 12 comeback improvements |
| Podium Finisher | 15 first-place finishes |
| Sharpshooter | 25 times |
| Underdog | 12 times |
| High Achiever | 75 mocks >80% |

**Total Axis A: 15 families x 4 tiers = 60 badges** (up from today's 30).

### 1b. Level Mastery badges (Axis B, new) — one 3-tier set per real level

Awarded per-level, scoped to mocks taken within that level, so progress feels tied to the actual curriculum journey rather than being fully abstract:

- **Cleared** (BASE) — complete every mock currently assigned in that level at least once.
- **Mastered** (SUPER) — average ≥85% across every mock in that level.
- **Perfected** (LEGENDARY) — average ≥95% across every mock in that level, OR at least one 100% run in that level (whichever is easier to compute cleanly — a build-time call, not a design one).

Applied to all 8 real levels:

| Module | Levels | Badges (3 tiers each) |
|---|---|---|
| YLM | L1, L2, L3 | 9 |
| IM | L1, L2, L3, L4 | 12 |
| MM | L1 | 3 |

**Total Level Mastery: 8 levels x 3 tiers = 24 badges.** This count grows automatically (no redesign needed) the moment MM ships more levels — that's a deliberate design choice, not an oversight.

### 1c. Module Completion badges (Axis B, new) — the real capstones, path-aware

One 3-tier badge per module (built for every module as it ships, including Preparatory/Bridge once they exist):

- **[Module] Bronze Graduate** — clear every *applicable* Level Mastery "Cleared" badge in that module for the student's own path.
- **[Module] Silver Graduate** — clear every *applicable* Level Mastery "Mastered" badge in that module for the student's own path.
- **[Module] Gold Graduate** — clear every *applicable* Level Mastery "Perfected" badge in that module for the student's own path.

"Applicable" matters specifically for Preparatory: a Path 1 (YLM-entry) student's applicable level set is Levels 2-4 only — Level 1 is structurally skipped, not required, so it's excluded from their completion check entirely rather than treated as an unearned badge. A Path 2 (Preparatory direct-entry) student's applicable set is all 4 levels, Level 1 included. Same completion bar, different applicable-level set per path — determined by real enrollment/assignment history, never by which levels a student happened to attempt.

**Grand Master of MathPath** (single, ultimate, no tiers) is **path-aware, not a fixed module list** — since Bridge and Preparatory-direct-entry are alternate entry points to the YLM route (never combined for the same student), requiring literally all 5 modules would make this badge permanently unearnable for every student. Instead, per the 3 real paths:

- IM and MM always count (every path converges through both).
- **Path 1 (YLM entry):** YLM Gold Graduate + Preparatory Gold Graduate (Levels 2-4 only, per the applicable-set rule above) + IM + MM.
- **Path 2 (Preparatory direct-entry):** Preparatory Gold Graduate (all 4 levels) + IM + MM. YLM never required.
- **Path 3 (Bridge entry):** Bridge Gold Graduate + IM + MM. YLM and Preparatory never required.
- **Grand Master of MathPath = hold Gold Graduate in every module applicable to the student's own actual path.** Same real bar for everyone, scoped to the path they were actually on — determined by enrollment history, not inferred from attempts.

**Total Module Completion (against today's 3 live modules): (3 x 3 tiers) + 1 = 10 badges** — grows by 3 more per module (plus the existing Grand Master logic auto-extending across all 3 paths) once Preparatory/Bridge ship.

### 1d. Cross-module meta badges (Axis B, new) — also path-aware

| Badge | Requirement |
|---|---|
| Multi-Disciplinarian | Complete at least one mock in every module on the student's own path (not a fixed count) |
| Triple Podium | Top-3 finish on a mock in every module on the student's own path (name to be revisited once it isn't always "3") |
| The Completionist | Unlock every Level Mastery badge available on the student's own path |
| Full Spectrum | Unlock at least one badge from every skill family (Axis A) — unaffected by path, since skill badges aren't module-scoped |
| MathPath Legend | Unlock every badge available on the student's own path — the true 100%-completion capstone, same path-aware logic as Grand Master |

**Total meta: 5 badges.** Same path-scoping rule applies throughout: "every module" always means "every module applicable to whichever of the 3 real paths this student is actually on," never a hardcoded list.

### 1e. Grand total

| Category | Count |
|---|---|
| Skill badges (Axis A) | 60 |
| Level Mastery (Axis B) | 24 |
| Module Completion (Axis B) | 10 |
| Cross-module meta (Axis B) | 5 |
| **Total** | **99** — up from today's 30 |

That's a little over 3x today's catalog, entirely tied to real, verifiable progress signals already present in the data model, and structured so it keeps growing on its own as MM ships more levels rather than needing a redesign every time new curriculum lands.

## Part 2 — Elevating the animations to the next level

**Scope confirmed: this elevation applies to all 99 badges — the existing 30 as well as every new one — not just new content.** The goal is one consistent, world-class standard across the whole catalog, so nothing in the Trophy Room reads as visibly older or flatter than anything else. Concretely, this is built as a shared, parametrized "badge reveal engine" (driven by tier + family, not one-off bespoke components per badge) — the same reason Level Mastery/Module Completion badges auto-extend to future modules is the same reason this visual layer auto-applies to every future badge too, not something re-earned per badge.

This is purely a visual/presentation-layer change — no `AchievementBadge` codes, tiers, thresholds, or unlock logic are touched by any of the below, so it carries the same zero-regression guarantee as everything else in this plan (Section 7.5 of the companion plan doc).

In priority order:

1. **Fix the floor first (Phase 0 from the main plan).** The leaderboard cinematic's stuck-at-20%-opacity bug, the badge modal rendering behind the app header, and the fact that no mock submission today actually shows which badge you just earned — all of this ships before anything below, because none of the elevation ideas matter if the existing showcase pieces don't reliably work.
2. **A real in-moment badge reveal, tied to the actual result.** Today: submit a mock, see a generic accuracy-tier celebration, badges surface later via a notification you have to click through. New: the mock-result page reads the real `unlockedBadges` the backend already returns from that exact submission and plays the badge reveal (the existing `BadgeInspectionModal` cinematic, extended) as part of the same moment — sequenced after the accuracy celebration if both apply, queued if more than one badge unlocked at once. This is the single highest-impact change here: it turns "I got a badge" from a thing you discover into a thing that happens *to* you.
3. **Accuracy-tier celebration gets 10-12 unique cutscene variants per tier (40-48 total, up from today's 4), selected so a repeat never shows until every variant in that tier has been seen.** This is the system that actually needs anti-repetition, since it fires after every single mock submission regardless of outcome — a student who consistently lands in one accuracy band would otherwise see the identical animation potentially hundreds of times. Implementation: a shuffled, non-repeating selection per student per tier (track which variants a student has already seen this cycle, reshuffle only once the full pool of 10-12 has been exhausted) rather than plain random, so "you won't see a repeat until you've earned it long enough to cycle back around" is a literal guarantee, not just a probabilistic likelihood.
4. **Hard requirement, per Shailesh: every one of the 99 badges gets a fully unique design and cinematic — zero shared environments, zero shared entrance choreography, zero shared color/typography identity across any two badges.** This corrects and replaces an earlier draft of this section, which had proposed sharing entrance-choreography *pools* across badges of the same tier — that directly conflicts with "nothing should be identical" and is dropped. Two clarifications on scope, since there are two different axes of "variety" in play and they need different treatments:
   - **Badge-to-badge uniqueness (this requirement):** every badge is its own persona — own 3D environment, own camera/motion signature, own color identity, own typography treatment. Today's system already has real duplication to fix here — several icons share one environment (`Medal`/`Trophy`/`Crown` all render `EnvMedal`; `Clock`/`AlarmClock` share `EnvClock`; `Scan`/`Radar` share `EnvScan`) — the rebuild keys every environment off the unique badge *code*, never a shared icon-name fallback.
   - **Same-badge repeat-view consistency (not a problem, expected):** re-opening your own already-earned "Perfectionist" badge and seeing its same signature cinematic every time is correct, not stale — that consistency *is* the badge's identity, the same way a logo doesn't change every time you look at it. The "gets boring" problem is specifically about the accuracy-tier celebration (item 3 above), which fires on every single submission regardless of outcome and would otherwise be seen dozens of times identically — a different situation from a badge, which is earned once and inspected occasionally.
   - **How 99 fully unique badges is actually achievable, not just promised:** hand-modeling 99 bespoke 3D scenes from scratch is a real, large production effort if approached that way. The scalable path: pair a **unique AI-generated master art medallion per badge** (same GLSL black-background key-out technique already proven on the Rank system, just one generated image per badge instead of one per rank tier) with a **procedurally-parametrized environment/camera/motion recipe seeded uniquely per badge code** (not hand-authored per badge, but deterministically varied — different base geometry, motion pattern, camera choreography, particle behavior, and timing curve per badge) so every badge is genuinely distinct without requiring either an unbounded manual art budget or a small shared-pool shortcut. This also resolves the "Option A vs B" visual-pipeline question from Section 1 (Phase 1) — the answer is both, combined, not a choice between them.
5. **Rarity-scaled spectacle.** Right now Legendary already gets extra treatment (foil sweep, screen shake, spark particles) over Base/Super. Extend that ladder to the new Mythic tier with a genuinely bespoke top-of-the-ladder moment — this is the natural home for adapting the `PodiumHeroAnimation` cinematic's full-screen letterboxed kinetic-typography treatment (currently the single most cinematic asset in the whole codebase, and currently stuck behind a broken leaderboard interaction) into a "Mythic Unlock" template once its opacity bug is fixed. Reserve it for the rarest tier so it stays special rather than diluted by overuse.
6. **Upgrade the card thumbnails**, not just the full-screen modal. The Trophy Room grid — what a student actually sees most of the time, far more often than the full inspection cinematic — still renders each badge as a `lucide-react` icon inside a flat CSS clip-path polygon. That's the one place today's badges read noticeably flatter than the Rank system's hand-crafted layered SVG art. This is where the unique AI-generated medallion art from item 4 actually surfaces day-to-day, not just at the rare unlock moment.
7. **A Progression section in the Trophy Room**, alongside the existing tier shelves — the current UI only has a flat Base/Super/Legendary layout, which has nowhere to put Level Mastery, Module Completion, or meta badges. This needs a real, if contained, UI restructure.
8. **Sound.** Checked directly: there is currently zero audio anywhere in this codebase — no sound effects, no music, nothing, across the entire badge, rank, and leaderboard systems. That's a completely untapped lever. A short unlock chime (scaled in intensity by tier, the same way the visuals already are), a rank-up sting, and a podium-cinematic swell would likely be one of the cheapest, highest-leverage additions to actual "wow" factor available here.
9. **Consistency pass across all existing procedural environments**, even though every badge is uniquely designed — a shared visual grammar (lighting intensity range, bloom thresholds, pacing conventions) keeps 99 distinct badges reading as one coherent "world" rather than 99 disconnected experiments. Unique does not mean inconsistent in quality or tone.
10. **Real secondary physics on the highest tiers.** Today's particle work (`Sparkles`, `Stars`) is procedural but not physically simulated. For Legendary/Mythic tier reveals specifically, consider borrowing the Collector's Vault's existing Cannon.js physics engine for a genuine physics-driven debris/shard moment, rather than only procedural particle drift — reuses infrastructure that already exists elsewhere in the app instead of building a new physics layer from scratch.

## Part 3 — The AAA quality bar, and how it's actually enforced, not just promised

Explicit answer to the standing question of whether this genuinely reaches AAA/world-class quality rather than regressing to something flat or generic: **yes, and here's the concrete mechanism that makes that true rather than aspirational.**

- **The proof point already exists in this codebase.** `PodiumHeroAnimation`'s six bespoke 3D scenes, `RankCinematicOverlay`'s shader-keyed master art with scripted camera choreography, and `BadgeInspectionModal`'s 16 procedural environments are already genuinely AAA-caliber work — real cinematography (cubic-eased camera pull-backs, scripted impact shakes, time-dilation slow-mo), real shader work, real post-processing discipline. The bar this plan is holding itself to already exists and is already proven achievable in this exact codebase, by this exact team — the work here is raising *every* badge to that existing ceiling, consistently, not inventing a new capability from nothing.
- **The real risk to quality isn't ambition, it's inconsistency and performance.** A design can be well-conceived and still read as cheap if it stutters, pops in, or renders translucent — exactly the leaderboard bug this audit already found. That's why Phase 0 (fixing what's broken) and Phase 4 (performance safeguards: one heavy canvas at a time, profiled draw calls, reduced-motion fallback) aren't side items — they're load-bearing for "AAA," because janky is the fastest way anything here reads as cheap regardless of how good the underlying design is.
- **A concrete design bar, not a vague adjective.** "AAA" gets defined against real reference points during design — the kind of reveal-moment craft seen in mobile/live-service game loot reveals (Genshin Impact character pulls, Marvel Snap card reveals, Clash Royale chest openings) — camera work, lighting, color grading, timing, and (once built) sound all held to that standard, reviewed against it, not just shipped the moment something technically renders.
- **Prove it on a small batch before scaling to all 99.** Rather than building all 99 badges against an unproven pipeline and finding out at the end whether it actually hit the bar, the first concrete deliverable in Round 2 is a small reference batch — 3-5 badges spanning different tiers and families — built, reviewed against the design bar above, and explicitly signed off by Shailesh before the same pipeline gets replicated across the remaining ~94-96. This is the real de-risking mechanism: quality gets locked in and validated on a small set first, not discovered after 99 are already built.
- **Opus 5 for the design/build work**, as already agreed, specifically because this initiative combines hard technical 3D/shader/performance work with real visual design judgment — not routine implementation.

## What I need back from you

- Sign off on the badge list in Part 1 as-is, or tell me what to rename/retune/cut/add before it's built.
- Confirm the Part 2 elevation priorities and the two hard requirements now locked in (10-12 non-repeating celebration variants per tier; full badge-to-badge uniqueness across all 99 badges via the AI-art-plus-procedural-recipe approach) — anything you want reordered, dropped, or pushed to a later round.
- Once both are approved, I'll route the implementation itself to `vfx-3d` / `principal-designer` / `backend-architect` (Opus, as agreed) with `qa-reviewer` and live `browser-qa` gates before anything ships, per the sequencing in the main plan.
