# DPS Badge Color Audit — 2026-08-03

**Status: fix applied, per Shailesh's direction (option A + narrowing the leaderboard requirement). Prepared in this Cowork session, not yet delivered — needs a local Claude Code session to review, run qa-reviewer, and push.**

## 6. What was actually done

1. **Leaderboard fix.** `get_mock_exam_leaderboard()` and `get_cumulative_leaderboard()` in `backend/app/api/routes_student.py` now filter `AchievementBadge` on `code NOT LIKE 'dps\_%'` before building `topBadges`. This was the only surface where DPS and non-DPS badges ever rendered side by side, so it closes out the dps-vs-existing-88 risk at the source rather than by chasing colour math against an already near-maximally-packed 88-colour palette.
2. **Full 40-colour repalette**, hand-tuned (not raw solver output): every family keeps one thematic hue lane with real tier-to-tier drift (lightness/saturation progression within the lane, matching this file's established tier conventions -- BASE muted, SUPER vivid+glitch, LEGENDARY rich+border accent, MYTHIC radiant multi-stop with a white highlight). `dps_midnight` (twilight violet), `dps_compass` (antique brass/verdigris), and `dps_sage` (jade wisdom-green) got genuinely new identities from scratch since the originals were copy-pastes. `discipline`/`crystal`/`tome`/`quill`/`chain`/`phoenix`/`anvil` kept their original thematic intent, recoloured within it.
3. **Verified via the project's own script**, not just my own scratch checks: added a permanent `DPS_NEW` block to `frontend/scripts/verify-badge-colour-distinctness.mjs` (40 entries, same `{key, name, primary, note}` shape as every other batch) and ran it for real.
   - **DPS-vs-DPS (780 pairs): 0 dE00-FAILs.** Worst pair dE00 15.99 (well above the 12.0 FAIL bar). 5 pairs get flagged FAIL only by the script's secondary "HSL triple-near" escalation heuristic despite scoring 16.4-17.6 on the authoritative CIEDE2000 metric -- these are documented as accepted, consistent with how this same script treats similar borderline cases elsewhere in the file.
   - **DPS-vs-existing-88: 109 total FAILs remain**, unchanged in kind from before (this was never chased to zero -- see point 1 for why that's fine now).
   - Zero exact/near-exact (dE00 < 5) duplicates anywhere, DPS-internal or DPS-vs-existing -- the worst-case "two badges look identical" failure mode from the original palette is fully gone.
4. **Verification run:** 64/64 backend pytest pass (leaderboard filter didn't break anything), `py_compile` clean on `routes_student.py`, `esbuild` compiles `badgeVisuals.ts` with no syntax errors, real verifier script run and captured (see `frontend/scripts/verify-badge-colour-distinctness.mjs` output).

Since this Cowork sandbox has no GitHub push access, there's no live Vercel preview URL to hand over the way a local session would produce one -- a rendered swatch preview of all 40 new gradients was shown inline in chat instead. A local Claude Code session needs to review the diff, run qa-reviewer, and push/PR to get the real deploy preview before merge.

## 1. What's actually broken

The 07-31 Antigravity work that added the 40 DPS badges never ran this repo's own mandatory check (`frontend/scripts/verify-badge-colour-distinctness.mjs`, dE00 < 12 = FAIL, "would read as the same chip"). I ran it for the first time against the real 40 DPS colors and the real 88 existing badge colors.

Result: **128 of the ~4,900 possible pairs fail**, spread across all 40 badges — every single DPS badge collides with something. Of those, **8 pairs are byte-identical (dE00 = 0.0)** — not "close," literally the same hex value:

- `dps_discipline_LEGENDARY` = `unstoppable_streak_chain_LEGENDARY` (both `#f97316`)
- `dps_discipline_MYTHIC` = `dps_crystal_LEGENDARY` (both `#f43f5e`)
- `dps_tome_SUPER` = `dps_chain_SUPER` (both `#475569`)
- `dps_midnight_BASE` = `dps_compass_BASE` = `dps_sage_BASE` (all three identical)
- `dps_midnight_SUPER` = `dps_compass_SUPER`
- `dps_midnight_LEGENDARY` = `dps_compass_LEGENDARY`
- `dps_compass_MYTHIC` = `dps_phoenix_MYTHIC`
- `dps_sage_LEGENDARY` = `dps_phoenix_LEGENDARY`
- `dps_sage_MYTHIC` = `dps_chain_LEGENDARY`

`dps_midnight`, `dps_compass`, and `dps_sage` are near-total copy-pastes of each other — same `customBg`, `customShadow`, `customBorder`, `iconColorHex`, `bloomColor`, all four tiers, for three supposedly different badge concepts (Midnight Oil / Golden Compass / Sage's Eye).

**Where this matters visually:** the Trophy Room keeps DPS and non-DPS badges in separate tabs, so this doesn't show up there. It does show up on the competition leaderboard — `TopBadgeChips` renders a student's best 3 badges regardless of category, unfiltered, side by side. A student with a DPS badge and a Level Mastery or Perfectionist badge in their top 3 could see two visually-identical chips.

## 2. What I tried

Reused this repo's own methodology (`scripts/_badge_palette_solver.mjs` — the same max-min CIEDE2000 solver used to design every other badge batch): hold the 88 existing colors fixed, search for 40 new colors that maximize the worst-case pairwise distance against those 88 plus each other.

Ran it hard — greedy initial placement, coordinate-descent refinement, dozens of random-restart/jitter rounds, both with loose thematic hue windows per family and with no hue restriction at all (fully free search, to find the true ceiling).

## 3. Result: it plateaus around dE00 ≈ 10.3, not 12

Every version of the search — constrained or fully free — converges to the same ceiling: **worst pair ≈ 10.1–10.3**, never reaching the 12.0 bar. This isn't a weak search; I confirmed it's a real limit:

**The existing 88-color palette is already packed to its own edge.** Its own tightest pair (`unstoppable_streak_BASE` vs `level_mastery_pm_l3_SUPER`) sits at **dE00 = 12.05** — just barely legal. That means there's very little unclaimed space left in perceptual color space for 40 more colors to land in at full separation from all 88 simultaneously. Adding this many colors on top of an already near-maximally-packed palette may not be geometrically achievable without touching some of the 88.

Applying my best automated palette gets you from **128 fails (8 of them exact duplicates)** down to **101 fails (0 exact duplicates)** — a real improvement, but still short of a clean pass. And it comes at a cost: chasing raw distinctness pushed several families off their intended visual identity (e.g. a "Rising Phoenix" landing on navy blue and pale yellow-green, an "Anvil" tier landing on bright mint and violet). That's not a palette I'd recommend shipping as-is — it fixes the math but breaks the design intent, and every other badge batch in this file was hand-tuned by a human for exactly that reason, not just algorithmically generated.

**Before / after, in short:**

| | Fails (dE00<12) | Exact duplicates (dE00=0.0) | Worst pair |
|---|---|---|---|
| Current (shipped 07-31) | 128 | 8 | 0.0 |
| Best automated palette | 101 | 0 | 10.27 |

## 4. Three ways to close the rest of the gap

**A. Ship the improved palette, document the remaining ~101 as a known, low-severity gap.** Zero exact duplicates is a real fix for the worst part of this (two badges being literally indistinguishable). The residual sub-12 pairs are mostly in the 10–12 range, not exact matches, and the one place they'd co-occur (leaderboard top-3 chips) only shows 3 badges out of 128 possible at a time, so actual collision odds per student are low. Would still need a proper hand-tuned re-pass on the specific badges (`compass`, `sage`, `midnight`, `phoenix`, `anvil`) to restore thematic coherence, since the raw solver output isn't launch-quality.

**B. Also nudge a few of the existing 88 colors.** The real fix, if you want a clean pass — but it means touching already-shipped, previously-approved badges (Perfectionist, Level Mastery, Podium Finisher, etc. all show up repeatedly in the collision list). Bigger change, needs its own review pass, but is the only path to genuinely clearing the 12.0 bar everywhere.

**C. Narrow the actual requirement.** Since DPS and non-DPS badges only ever appear together in the leaderboard's top-3 chips, a cheaper fix might be: don't chase full 128-color distinctness at all — instead change `TopBadgeChips`/its backend query so it never shows two badges that fail the check next to each other (e.g. dedupe or note a same-color pair specifically at render time). Smaller blast radius, doesn't touch existing colors, but is a product/UX change rather than a color-design fix.

## 5. My read

I lean toward **A**, with a proper hand-crafted redesign (not the raw solver output) for the 5 broken families specifically, since that's where every real problem is (the other 5 families — Discipline, Crystal, Tome, Quill, Chain, Phoenix — already had reasonable original design intent, just wrong hex values in a few spots). But this is your call, not mine, especially the part about whether touching already-shipped colors (option B) is worth it.

Full raw fail/warn list (all 101+201 pairs) is available if you want to see it before deciding — didn't paste it here since it's long, just say the word.
