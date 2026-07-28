# Reference Batch — Design Brief

Status: IN PROGRESS. First concrete deliverable of Round 2 (`GAMIFICATION_ROUND2_EXECUTION_PLAN_2026-07-25.md`, Section 2a). Built for Shailesh's explicit sign-off before the same pipeline replicates across the other ~94-96 badges.

## Technical pivot, stated plainly

The original plan's visual-pipeline decision (`GAMIFICATION_BADGE_CATALOG_PROPOSAL_2026-07-25.md` Part 2, item 4) called for "AI-generated master art medallion + GLSL key-out shader," mirroring the Rank system's 8 `/public/assets/ranks/*.png` images. Investigation confirmed those 8 images were manually produced outside the codebase with an external AI image tool and committed as raw files — there's no generation script, no API wrapper, nothing reusable in-repo, and no image-generation tool is available in this build environment either.

Rather than block on that or fake it with placeholder art, the reference batch uses **fully procedural, code-native art direction** instead: real custom Three.js geometry, PBR materials, particle systems (including physics-driven debris via the existing Cannon.js Collector's Vault integration for the top tier), scripted camera choreography, and post-processing — built with the same level of intentional art direction a master-art image would have carried, just authored in code instead of pixels. This is "Option A" from the master elevation plan, executed with full craft rather than as a fallback. The rank system's existing image-based approach is untouched — this is a parallel technique for badges specifically, not a replacement.

## The 5 reference badges

Selected to cover every axis the reference batch needs to prove per the execution plan: a clean baseline, a re-elevated existing badge, the brand-new Mythic ceiling, a brand-new badge type (Level Mastery), and full Legendary-tier spectacle.

### 1. Speed Demon — BASE (existing family, baseline quality bar)
Theme: velocity. A faceted crystalline hourglass-shard spinning inside a motion-blurred light-trail ring. Palette: electric cyan/blue. Camera: a quick snap pull-back with directional motion streaks, ~2s total — BASE tier stays clean and short, no screen shake, subtle bloom only. Particles: convergent light-speed streaks.

### 2. Perfectionist — SUPER (existing badge, re-elevated — proves no seam between old and new)
Theme: precision. A rotating faceted gem core suspended inside a thin golden torus orbit ring. Palette: violet-to-gold gradient. Camera: slow orbit with a rack-focus bloom-threshold sweep. Particles: a symmetric sparkle grid pulsing on a beat. SUPER tier: one subtle screen-shake pulse on reveal, richer bloom than BASE.

### 3. Perfectionist — MYTHIC (new ceiling tier, same family as #2 — proves one family scales cleanly from re-elevated tiers to the brand-new top)
Same gem/gold-violet identity as #2, escalated: the gem fractures open mid-reveal to expose a nested inner gem, full prismatic light-dispersion shader, physics-driven shard debris (Cannon.js). Camera: multi-stage push-pull-orbit-impact sequence, ~4-5s. Distinct MYTHIC typography: iridescent holographic-shimmer gradient text, not just a bigger version of Legendary's treatment.

### 4. Intermediate Module, Level 1 — Perfected (Level Mastery, new badge type entirely, LEGENDARY-tier bar)
Its own visual identity axis, deliberately distinct from skill-family badges so Level Mastery never reads as reused skill-badge assets. Theme: ascending curriculum mastery. An ascending stepped monument of glowing translucent glass tablets (visually "completing" one by one on inspection). Palette: deep indigo-to-emerald (module-tied color). Camera: vertical crane-up rising alongside the monument, ending on a wide establishing shot. Particles: slow-rising firefly-like motes.

### 5. Unstoppable Streak — LEGENDARY (existing family, full rarity-scaled spectacle)
Theme: consecutive dominance. A continuous Möbius-looped chain of blazing interlocking rings, ion-trail style. Palette: fire orange-to-crimson. Camera: adapts `PodiumHeroAnimation`'s letterboxed kinetic-typography treatment — full pull-back, impact shake, cinematic drift — with letterboxing bars reserved for Legendary/Mythic only (not Base/Super). Particles: whip-crack sparks trailing the chain.

## Deliverable for this pass

New procedural environment/scene components for these 5 badges built into the existing `BadgeInspectionModal` environment-switch pattern, a shared per-badge "recipe" scaffold other badges can plug into later, upgraded card thumbnails reflecting the same art direction, and a local preview route so all 5 can be reviewed and screenshotted before anything ships or gets a sign-off ask. No `AchievementBadge` schema, threshold, or unlock-logic changes — purely presentational, same zero-regression guarantee as every prior round.
