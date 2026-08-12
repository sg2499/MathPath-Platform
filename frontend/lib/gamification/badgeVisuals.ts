// Shared badge visual config -- extracted 2026-07-25 from
// Shared badge visual config -- extracted 2026-07-25 from
// app/student/achievements/page.tsx so the mock-result page's new in-moment
// badge reveal (Round 1 gamification fix) can render badges with the exact
// same colors/icons/glow as the Trophy Room, instead of duplicating (and
// risking drift from) a second copy of this table. Achievements page now
// imports from here too -- this file is the single source of truth for how
// a badge's code+tier maps to its visual identity.
import {
  dpsBatch2Glyphs,
  referenceBatchGlyphs,
  mockExamBatch1Glyphs,
  mockExamBatch2Glyphs,
  mythicPhase1Glyphs,
  phase2Glyphs,
  levelMasteryImGlyphs,
  dpsBatch1Glyphs,
  dpsBatch3Glyphs,
  dpsBatch4Glyphs,
  dpsBatch5Glyphs
} from "./badgeGlyphs";

// Map our backend icon names to badge glyph components.
//
// NOTE (2026-07-27, batch-1 pass): the fifteen lucide entries that used to head
// this object -- Target, Focus, Scan, Zap, FastForward, Rocket, Medal, Flag,
// Crown, Flame, Activity, Infinity, Clock, Sun, AlarmClock -- were REMOVED from
// the literal (and from the import above) rather than being left in place and
// shadowed by the `...mockExamBatch1Glyphs` spread below. Leaving them in is a
// hard TypeScript error, not a style question: TS2783 "specified more than
// once, so this usage will be overwritten". Deleting the shadowed keys is the
// correct fix and is behaviourally identical, because the spread was going to
// win for all fifteen anyway.
//
// NOTE (2026-07-27, batch-2 pass): the remaining fifteen lucide entries --
// TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, Sparkles, Crosshair,
// Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library -- were
// removed for exactly the same TS2783 reason now that
// `...mockExamBatch2Glyphs` defines all fifteen. `lucide-react` is therefore no
// longer imported by this file at all: all 30 real mock-exam badges plus the 5
// reference-batch demos now resolve to hand-drawn marks, and there is no stock
// UI glyph left anywhere in the badge pipeline.
export const BadgeIconMap: Record<string, any> = {
  // --- Reference batch (2026-07-27), additive only ---------------------
  // New iconName keys introduced by the "AAA badge environment" reference
  // batch. These deliberately do NOT collide with any existing backend
  // iconName, so no currently-unlocked badge changes appearance.
  //
  // CRAFT PASS (2026-07-27): these five were originally aliased onto stock
  // lucide glyphs (Zap / Gem / Diamond / Layers / Flame). They now resolve to
  // hand-drawn, badge-specific marks in ./badgeGlyphs. Every key ABOVE this
  // line still points at the same lucide icon it always did.
  ...referenceBatchGlyphs,

  // --- Mock-exam elevation, batch 1 (2026-07-27) ------------------------
  // Unlike the block above, these 15 keys are the backend's OWN iconName
  // strings. They are the ONLY definition of those keys in this object (see
  // the TS2783 note on the object's opening comment), which is the mechanism
  // by which 15 live badges get bespoke artwork without a backend change.
  //
  // Safe because every one of these 15 iconName values is used by exactly one
  // AchievementBadge row (checked against the seed list in
  // backend/app/services/achievements.py): Target/Focus/Scan -> perfectionist,
  // Zap/FastForward/Rocket -> speed_demon, Medal/Flag/Crown -> competitor,
  // Flame/Activity/Infinity -> unstoppable_streak, Clock/Sun/AlarmClock ->
  // early_bird. No badge outside this batch resolves through any of them.
  ...mockExamBatch1Glyphs,

  // --- Mock-exam elevation, batch 2 (2026-07-27) ------------------------
  // The other 15 backend iconName strings, same contract as batch 1 and
  // verified the same way against the seed list in
  // backend/app/services/achievements.py:
  //   TrendingUp/ArrowUpRight/ChevronsUp -> comeback_kid
  //   Trophy/Star/Sparkles               -> podium_finisher
  //   Crosshair/Aperture/Radar           -> sharpshooter
  //   Shield/Anchor/Mountain             -> underdog
  //   Brain/Lightbulb/Library            -> polymath ("High Achiever")
  // Each key is used by exactly one AchievementBadge row, so overriding them
  // here cannot change the appearance of a badge outside this batch.
  ...mockExamBatch2Glyphs,

  // --- Phase-1 MYTHIC tier (2026-07-28) ---------------------------------
  // The 9 new MYTHIC badges for the existing skill-badge families. Unlike the
  // two mock-exam batches (which REUSE the backend's pre-existing iconName
  // strings), these 9 keys are BRAND-NEW strings seeded by the backend
  // alongside the 9 new MYTHIC AchievementBadge rows -- same additive contract
  // as `referenceBatchGlyphs`. Each is owned by exactly one row, so this spread
  // cannot change the appearance of any BASE/SUPER/LEGENDARY badge:
  //   SpeedCometMythic  CrownMythic       InfinityMythic
  //   DawnBreakMythic   PhoenixSurgeMythic LaurelCrownMythic
  //   PrecisionCoreMythic SummitMythic    OracleMythic
  // (The 10th MYTHIC family, Perfectionist, already resolves through
  // `referenceBatchGlyphs`' PerfectionistGemMythic and is untouched here.)
  ...mythicPhase1Glyphs,

  // --- Phase 2: five new families (2026-07-28) ---------------------------
  // 20 brand-new iconName strings, seeded by the backend with the 20 new
  // AchievementBadge rows for Marathoner, Iron Wall, The Veteran, Last-Minute
  // Hero and Section Specialist -- same additive contract as
  // `referenceBatchGlyphs` and `mythicPhase1Glyphs`. Each key is owned by
  // exactly one row (checked against the seed list in
  // backend/app/services/achievements.py), so this spread cannot change the
  // appearance of any of the original 30 badges or of any phase-1 MYTHIC:
  //   MarathonTrail/Surge/Horizon/Eternal            -> marathoner
  //   IronWallBrick/Bastion/Rampart/Citadel          -> iron_wall
  //   VeteranChevron/Medallion/Standard/Legacy       -> veteran
  //   LastMinuteSpark/Flash/Blaze/Eclipse            -> last_minute_hero
  //   SectionSpecialistNode/Grid/Matrix/Nexus        -> section_specialist
  ...phase2Glyphs,
  ...levelMasteryImGlyphs,
  ...dpsBatch1Glyphs,
  ...dpsBatch2Glyphs,
  ...dpsBatch3Glyphs,
  ...dpsBatch4Glyphs,
  ...dpsBatch5Glyphs,
};

// ===========================================================================
// MOCK-EXAM BADGE ELEVATION -- BATCH 1 (2026-07-27)
// ---------------------------------------------------------------------------
// The first 5 of the 10 real mock-exam badge families (15 of the 30 live
// badges) are re-graded below. Scope discipline for this pass:
//
//   * PRESENTATIONAL ONLY. Not one AchievementBadge row, code, tier,
//     required_count or unlock rule was touched. Students who already hold
//     these badges hold exactly the same badges; they just look different.
//   * The other 5 families (comeback_kid, podium_finisher, sharpshooter,
//     underdog, polymath) are BYTE-FOR-BYTE UNCHANGED below and are scheduled
//     for batch 2.
//   * `perfectionist_SUPER`, `perfectionist_MYTHIC` and `speed_demon_BASE`
//     were graded in the reference batch and are deliberately NOT re-graded
//     here -- they are inputs to this pass, not outputs of it.
//
// HOW THESE 13 COLOURS WERE CHOSEN (and why they are not hand-picked)
// ---------------------------------------------------------------------------
// The rule is that no two badges may share a colour identity. That is a
// perceptual claim, so it is measured, not asserted:
// `frontend/scripts/verify-badge-colour-distinctness.mjs` computes CIEDE2000
// across all 18 gated colours (these 13 + the 5 frozen ones) and prints every
// pairwise distance. Result for this palette: 143 pairs, 0 fail, 0 warn,
// tightest pair dE00 = 19.3 (unstoppable_streak_BASE vs perfectionist_SUPER),
// tightest pair among the 13 NEW colours = 23.1.
//
// The first, hand-picked draft FAILED that check: "vital green" at hue 100 and
// "green-flash emerald" at hue 132 read as 32 degrees apart in HSL and measured
// dE00 5.9 -- the same chip. Hue degrees are not perceptual distance (green is
// compressed, blue is expanded), so the final values come from a constrained
// max-min-dE00 search over thematic hue/chroma windows instead of from taste.
//
// Every `burst[0]` below IS the badge's identity colour, because burst[0] is
// what BadgeInspectionModal feeds to the 3D scene lights, the ambient
// particles and the star field. Grading anything else would grade a value the
// viewer never actually sees at full strength.
//
// `iconColorHex` is picked off WCAG relative luminance, not HSL lightness:
// hsl(62,96%,50%) (speed_demon_SUPER) is nominally "mid lightness" but has
// ~0.85 relative luminance, so it takes an INK glyph. Three badges in this
// batch do (speed_demon_SUPER, unstoppable_streak_SUPER, early_bird_SUPER).
// ===========================================================================

// 30 Unique Colors based on Badge Code and Tier (Distinct Spectrum)
export const badgeColorConfig: Record<string, any> = {


  "level_mastery_im_l1_BASE": { customBg: "linear-gradient(to bottom right, #004c6a, #111)", customShadow: "0 8px 20px -4px #004c6a88", customBorder: "3px solid #004c6a", iconColorHex: "#fff", bloomColor: "rgba(0, 76, 106, 0.55)", glitch: false, burst: ["#004c6a", "#111", "#004c6a", "#fff"] },
  "level_mastery_im_l1_SUPER": { customBg: "linear-gradient(to bottom right, #ff9b73, #111)", customShadow: "0 10px 24px -4px #ff9b7388", customBorder: "4px solid #ff9b73", iconColorHex: "#fff", bloomColor: "rgba(255, 155, 115, 0.75)", glitch: false, burst: ["#ff9b73", "#111", "#ff9b73", "#fff"] },
  "level_mastery_im_l1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #00b60b, #111)", customShadow: "0 12px 30px -4px #00b60b88", customBorder: "4px solid #00b60b", iconColorHex: "#fff", bloomColor: "rgba(0, 182, 11, 0.9)", glitch: false, burst: ["#00b60b", "#111", "#00b60b", "#fff"] },
  "level_mastery_im_l2_BASE": { customBg: "linear-gradient(to bottom right, #402848, #111)", customShadow: "0 8px 20px -4px #40284888", customBorder: "3px solid #402848", iconColorHex: "#fff", bloomColor: "rgba(64, 40, 72, 0.55)", glitch: false, burst: ["#402848", "#111", "#402848", "#fff"] },
  "level_mastery_im_l2_SUPER": { customBg: "linear-gradient(to bottom right, #899ec8, #111)", customShadow: "0 10px 24px -4px #899ec888", customBorder: "4px solid #899ec8", iconColorHex: "#fff", bloomColor: "rgba(137, 158, 200, 0.75)", glitch: false, burst: ["#899ec8", "#111", "#899ec8", "#fff"] },
  "level_mastery_im_l2_LEGENDARY": { customBg: "linear-gradient(to bottom right, #f1ebaf, #111)", customShadow: "0 12px 30px -4px #f1ebaf88", customBorder: "4px solid #f1ebaf", iconColorHex: "#fff", bloomColor: "rgba(241, 235, 175, 0.9)", glitch: false, burst: ["#f1ebaf", "#111", "#f1ebaf", "#fff"] },
  "level_mastery_im_l3_BASE": { customBg: "linear-gradient(to bottom right, #8e707a, #111)", customShadow: "0 8px 20px -4px #8e707a88", customBorder: "3px solid #8e707a", iconColorHex: "#fff", bloomColor: "rgba(142, 112, 122, 0.55)", glitch: false, burst: ["#8e707a", "#111", "#8e707a", "#fff"] },
  "level_mastery_im_l3_SUPER": { customBg: "linear-gradient(to bottom right, #950437, #111)", customShadow: "0 10px 24px -4px #95043788", customBorder: "4px solid #950437", iconColorHex: "#fff", bloomColor: "rgba(149, 4, 55, 0.75)", glitch: false, burst: ["#950437", "#111", "#950437", "#fff"] },
  "level_mastery_im_l3_LEGENDARY": { customBg: "linear-gradient(to bottom right, #913f77, #111)", customShadow: "0 12px 30px -4px #913f7788", customBorder: "4px solid #913f77", iconColorHex: "#fff", bloomColor: "rgba(145, 63, 119, 0.9)", glitch: false, burst: ["#913f77", "#111", "#913f77", "#fff"] },
  "level_mastery_im_l4_BASE": { customBg: "linear-gradient(to bottom right, #56782c, #111)", customShadow: "0 8px 20px -4px #56782c88", customBorder: "3px solid #56782c", iconColorHex: "#fff", bloomColor: "rgba(86, 120, 44, 0.55)", glitch: false, burst: ["#56782c", "#111", "#56782c", "#fff"] },
  "level_mastery_im_l4_SUPER": { customBg: "linear-gradient(to bottom right, #708f7f, #111)", customShadow: "0 10px 24px -4px #708f7f88", customBorder: "4px solid #708f7f", iconColorHex: "#fff", bloomColor: "rgba(112, 143, 127, 0.75)", glitch: false, burst: ["#708f7f", "#111", "#708f7f", "#fff"] },
  "level_mastery_im_l4_LEGENDARY": { customBg: "linear-gradient(to bottom right, #64aece, #111)", customShadow: "0 12px 30px -4px #64aece88", customBorder: "4px solid #64aece", iconColorHex: "#fff", bloomColor: "rgba(100, 174, 206, 0.9)", glitch: false, burst: ["#64aece", "#111", "#64aece", "#fff"] },

  // --- Perfectionist ---------------------------------------------------
  // Shape narrative (Target -> gem -> Scan) escalates precision; colour
  // deliberately does NOT follow it. jade / amethyst / azure / opal.
  //
  // BASE -- JADE. Was emerald #34d399, i.e. the same hue family as LEGENDARY,
  // which is the exact "same badge, bigger text" failure this pass exists to
  // remove. Now a deep jade that clears LEGENDARY's azure by dE00 48.8.
  "perfectionist_BASE": { customBg: "linear-gradient(135deg, #239f82 0%, #115041 100%)", customShadow: "0 10px 15px -3px rgba(35, 159, 130, 0.2)", customBorder: "none", iconColorHex: "#f0f9f7", bloomColor: "rgba(35, 159, 130, 0.6)", glitch: false, burst: ["#239f82", "#115041", "#07221c"] },
  // ===================================================================
  // COLOUR-IDENTITY RULE (2026-07-27, craft pass) -- confirmed direction:
  // EVERY TIER OF EVERY BADGE GETS ITS OWN COLOUR IDENTITY. No hue is shared,
  // not even between two tiers of the same badge. Rarity is communicated by
  // EFFECTS and AUDIO (halo intensity, particle density, shake, letterbox,
  // chime) -- never by recycling a palette. Before this pass,
  // perfectionist_SUPER and perfectionist_MYTHIC both ran violet+gold, which
  // made "the next tier up" read as "the same badge with bigger text".
  // ===================================================================
  //
  // perfectionist_SUPER -- AMETHYST / MAGENTA jewel tone. The gold is GONE:
  // gold was the exact overlap with MYTHIC. This is now a single-family
  // precious-stone identity (deep amethyst body, magenta fire, lilac
  // highlight) and shares no hue with BASE (emerald), LEGENDARY (emerald --
  // still to be re-graded) or MYTHIC (opal).
  // `revealPulse` opts THIS badge alone into a short SUPER-tier screen-shake
  // pulse -- it is not blanket SUPER behaviour, so no other SUPER badge moves.
  "perfectionist_SUPER": { customBg: "linear-gradient(135deg, #e0219c 0%, #9b1fd6 55%, #5b0e8b 100%)", customShadow: "0 10px 15px -3px rgba(155, 31, 214, 0.4)", customBorder: "2px solid rgba(245, 163, 255, 0.85)", iconColorHex: "#fbe6ff", bloomColor: "rgba(155, 31, 214, 0.8)", glitch: true, revealPulse: true, burst: ["#9b1fd6", "#e0219c", "#f5a3ff", "#ffffff"] },
  // LEGENDARY -- AZURE SCAN-BEAM. The "Scan" glyph resolves everything rather
  // than merely hitting the mark, so this tier goes cold and instrument-blue.
  // Nearest neighbour is speed_demon_BASE's cyan at dE00 22.9: that pair trips
  // the crude HSL "within 20 degrees" heuristic (16.1 deg apart) and is
  // nonetheless clearly separable, because 16 degrees in the blue arc is a
  // 28-unit CIELAB b* gap. See the verifier's header for why HSL misfires here.
  "perfectionist_LEGENDARY": { customBg: "linear-gradient(135deg, #149bf5 0%, #04426c 100%)", customShadow: "0 10px 15px -3px rgba(20, 155, 245, 0.45)", customBorder: "4px solid #c7dff0", iconColorHex: "#f0f6f9", bloomColor: "rgba(20, 155, 245, 0.9)", glitch: true, burst: ["#149bf5", "#0564a3", "#c7dff0", "#ffffff"] },
  // perfectionist_MYTHIC -- OPAL / PRISMATIC. Brand-new ceiling tier
  // (frontend preview only -- no backend tier enum change).
  //
  // This badge's concept is "the stone fractures and prismatic light escapes",
  // so its identity is not a hue at all: it is a milky pearl body carrying a
  // full spectral fire (aqua -> mint -> amber -> rose -> periwinkle). That is
  // deliberately the one thing in the batch that CANNOT collide with another
  // badge's colour, because it isn't a single colour.
  //
  // burst[0] is the pearl, not a spectral stop -- burst[0] is what
  // BadgeInspectionModal feeds to the 3D scene lights and ambient particles,
  // and an opal is lit white; the hue comes from the stone, not the lamp.
  // iconColorHex is INK, not white: the card is near-white here, so a white
  // glyph would vanish. This is the only badge in the set with a dark mark.
  "perfectionist_MYTHIC": { customBg: "linear-gradient(125deg, #eaf6ff 0%, #5ffbf1 18%, #7cff9e 34%, #ffd166 52%, #ff7bd5 70%, #8ea2ff 86%, #eaf6ff 100%)", customShadow: "0 10px 40px -3px rgba(120, 220, 255, 0.6)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#1a1033", bloomColor: "rgba(214, 255, 250, 0.95)", glitch: true, burst: ["#eaf6ff", "#5ffbf1", "#ff7bd5", "#ffd166"] },

  // --- Speed Demon -----------------------------------------------------
  // BASE is UNCHANGED. The reference batch already claimed this exact key
  // (cyan + the hand-drawn SpeedComet mark), it was signed off, and rebuilding
  // it would only churn an approved badge. This pass instead points the real
  // backend iconName "Zap" at that same approved mark/environment, so the badge
  // students actually hold now looks like the badge that was reviewed.
  "speed_demon_BASE": { customBg: "linear-gradient(to bottom right, #22d3ee, #0891b2)", customShadow: "0 10px 15px -3px rgba(6, 182, 212, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(6, 182, 212, 0.6)", glitch: false, burst: ["#22d3ee", "#06b6d4", "#0891b2"] },
  // SUPER -- ELECTRIC CITRON. Hazard-tape yellow-green: the highest-luminance
  // colour in the whole catalogue (CIELAB L* 94.8), which is why it is the one
  // badge here that reads as literally "too fast to look at". Takes an INK
  // glyph -- a white mark on this is invisible.
  "speed_demon_SUPER": { customBg: "linear-gradient(135deg, #f2fa05 0%, #979d02 100%)", customShadow: "0 10px 15px -3px rgba(242, 250, 5, 0.35)", customBorder: "2px solid #878b18", iconColorHex: "#3c3e0f", bloomColor: "rgba(242, 250, 5, 0.8)", glitch: true, burst: ["#f2fa05", "#979d02", "#626501"] },
  // LEGENDARY -- PLASMA ROSE. Afterburner colour, and the deepest chroma in
  // the family. Clears the SUPER citron by dE00 87.7 -- the widest in-family
  // gap in the batch, which is the point: three tiers, three unrelated colours.
  "speed_demon_LEGENDARY": { customBg: "linear-gradient(135deg, #c11f65 0%, #3e0920 100%)", customShadow: "0 10px 15px -3px rgba(193, 31, 101, 0.45)", customBorder: "4px solid #e0adc3", iconColorHex: "#f9f0f4", bloomColor: "rgba(193, 31, 101, 0.9)", glitch: true, burst: ["#c11f65", "#6e1139", "#e0adc3", "#ffffff"] },

  // --- Competitor ------------------------------------------------------
  // BASE -- PEWTER. The only near-neutral badge in the catalogue (chroma 9 vs
  // 60-100 for everything else), which makes it unmistakable by construction
  // rather than by hue placement, and it is exactly right for a struck medal.
  "competitor_BASE": { customBg: "linear-gradient(135deg, #9591a1 0%, #646071 100%)", customShadow: "0 10px 15px -3px rgba(149, 145, 161, 0.2)", customBorder: "none", iconColorHex: "#f3f0f9", bloomColor: "rgba(149, 145, 161, 0.6)", glitch: false, burst: ["#9591a1", "#646071", "#494653"] },
  // SUPER -- SIGNAL RED. Start-flag red, the only true primary red in the set.
  "competitor_SUPER": { customBg: "linear-gradient(135deg, #ce0909 0%, #720404 100%)", customShadow: "0 10px 15px -3px rgba(206, 9, 9, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#f9f0f0", bloomColor: "rgba(206, 9, 9, 0.8)", glitch: true, burst: ["#ce0909", "#720404", "#ffffff"] },
  // LEGENDARY -- IMPERIAL GOLD. Deliberately antique/struck gold rather than
  // bright yellow: bright yellow is speed_demon_SUPER's, and the two are held
  // 25.6 dE00 apart mostly on CIELAB L* (65.1 vs 94.8).
  "competitor_LEGENDARY": { customBg: "linear-gradient(135deg, #c19915 0%, #382c05 100%)", customShadow: "0 10px 15px -3px rgba(193, 153, 21, 0.45)", customBorder: "4px solid #e0d2a3", iconColorHex: "#f9f7f0", bloomColor: "rgba(193, 153, 21, 0.9)", glitch: true, burst: ["#c19915", "#6b540b", "#e0d2a3", "#ffffff"] },

  // --- Unstoppable Streak ----------------------------------------------
  // ALL THREE ARE DELIBERATELY NON-FIRE COLOURS. There is already a separate
  // demo badge on code `unstoppable_streak_chain` running orange -> crimson
  // (#f97316), and the whole point of giving it a different code was that the
  // two must never be confused. Fire is therefore off-limits for this family:
  // measured against that demo, BASE clears it by dE00 61.5, SUPER by 61.4 and
  // LEGENDARY by 52.4 -- none of the three is within 50 dE00 of it.
  //
  // BASE -- COBALT COLD-FLAME. A flame's hottest part is blue; that is the
  // out for a "Flame" glyph that is not allowed to be orange.
  "unstoppable_streak_BASE": { customBg: "linear-gradient(135deg, #23339f 0%, #111950 100%)", customShadow: "0 10px 15px -3px rgba(35, 51, 159, 0.2)", customBorder: "none", iconColorHex: "#f0f1f9", bloomColor: "rgba(35, 51, 159, 0.6)", glitch: false, burst: ["#23339f", "#111950", "#070b22"] },
  // SUPER -- VITAL GREEN. Cardiac-monitor green, straight off the "Activity"
  // glyph's meaning. Takes an INK mark (relative luminance 0.58).
  "unstoppable_streak_SUPER": { customBg: "linear-gradient(135deg, #1ae657 0%, #0e9135 100%)", customShadow: "0 10px 15px -3px rgba(26, 230, 87, 0.35)", customBorder: "2px solid #188b3b", iconColorHex: "#0f3e1d", bloomColor: "rgba(26, 230, 87, 0.8)", glitch: true, burst: ["#1ae657", "#0e9135", "#095e23"] },
  // LEGENDARY -- ORCHID. Highest-chroma magenta in the set; sits 22.3 dE00
  // clear of perfectionist_SUPER's amethyst, which is the nearest violet.
  "unstoppable_streak_LEGENDARY": { customBg: "linear-gradient(135deg, #f84fd6 0%, #a90588 100%)", customShadow: "0 10px 15px -3px rgba(248, 79, 214, 0.45)", customBorder: "4px solid #f7e3f3", iconColorHex: "#f9f0f8", bloomColor: "rgba(248, 79, 214, 0.9)", glitch: true, burst: ["#f84fd6", "#df07b4", "#f7e3f3", "#ffffff"] },

  // --- Early Bird ------------------------------------------------------
  // A dawn timeline read as three separate lights rather than one orange ramp:
  // brass lamp -> full sunrise -> the cold blue hour that precedes it.
  //
  // BASE -- ANTIQUE BRONZE. Low luminance, moderate chroma: the only "metal
  // warm" in the set and 28.2 dE00 from the demo chain badge's orange despite
  // sitting only 9.7 hue-degrees from it (chroma and L* carry the separation).
  "early_bird_BASE": { customBg: "linear-gradient(135deg, #7f5824 0%, #34240e 100%)", customShadow: "0 10px 15px -3px rgba(127, 88, 36, 0.2)", customBorder: "none", iconColorHex: "#f9f5f0", bloomColor: "rgba(127, 88, 36, 0.6)", glitch: false, burst: ["#7f5824", "#34240e", "#1c1308"] },
  // SUPER -- DAWN PEACH. The only high-key warm card in the catalogue, and the
  // only badge besides MYTHIC with a dark ink glyph. It sits 0.3 hue-degrees
  // from the demo chain badge's orange and is still 23.3 dE00 clear of it,
  // purely on lightness -- a good demonstration of why hue-only rules fail.
  "early_bird_SUPER": { customBg: "linear-gradient(135deg, #f6caac 0%, #ee9253 100%)", customShadow: "0 10px 15px -3px rgba(246, 202, 172, 0.35)", customBorder: "2px solid #8b4718", iconColorHex: "#3e220f", bloomColor: "rgba(246, 202, 172, 0.8)", glitch: true, burst: ["#f6caac", "#ee9253", "#e97120"] },
  // LEGENDARY -- BLUE-HOUR PETROL. The darkest card in the set (L* 37.7); the
  // hour before sunrise, which is when this badge is actually earned.
  "early_bird_LEGENDARY": { customBg: "linear-gradient(135deg, #0f626c 0%, #041d20 100%)", customShadow: "0 10px 15px -3px rgba(15, 98, 108, 0.45)", customBorder: "4px solid #62bbc6", iconColorHex: "#f0f8f9", bloomColor: "rgba(15, 98, 108, 0.9)", glitch: true, burst: ["#0f626c", "#06292d", "#62bbc6", "#ffffff"] },

  // ===================================================================
  // MOCK-EXAM BADGE ELEVATION -- BATCH 2 (2026-07-27)
  // -------------------------------------------------------------------
  // The remaining 5 families. Same scope discipline as batch 1: PRESENTATIONAL
  // ONLY -- no AchievementBadge row, code, tier, required_count or unlock rule
  // was touched, and every batch-1 / reference-batch entry above is
  // byte-for-byte unchanged and was treated as a fixed input here.
  //
  // HOW THESE 15 COLOURS WERE CHOSEN
  // Same method, harder problem. The gate is now 33 colours (18 already graded
  // + these 15) all mutually >= 18 dE00, and by the time batch 1 shipped the
  // easy regions of sRGB were gone: bright yellow, orange, red, cyan, azure,
  // cobalt, jade, vital green, magenta, orchid, gold, bronze, peach, petrol,
  // pewter and pearl were all spoken for. A farthest-point search over the
  // remaining volume showed the theoretical ceiling for 15 more colours is
  // dE00 ~19; this palette lands at 19.08 in free search and 18.56 once each
  // badge is also constrained to a thematically legible hue window. There is
  // no arrangement of 15 pretty, saturated, well-spaced colours left -- some of
  // these are deliberately low-chroma or deep, and that is a consequence of the
  // measurement, not a lapse.
  //
  // The two family narratives that had to move off the brief's first sketch,
  // and why:
  //   * PODIUM FINISHER is laurel, not metal. Champagne and platinum both
  //     measured inside 12 dE00 of early_bird_SUPER's dawn peach and
  //     perfectionist_MYTHIC's pearl respectively; a third near-neutral was
  //     also blocked by competitor_BASE's pewter. Laurel (the actual podium
  //     symbol) was free, and it keeps this family clear of Competitor's
  //     pewter/red/gold, which was the real requirement.
  //   * SHARPSHOOTER cannot be three cold colours. After azure, cyan, cobalt,
  //     indigo and petrol, exactly two cold holes remained. The family is
  //     therefore gunmetal -> steel -> ice: still one temperature, but two of
  //     the three are carried by lightness and chroma rather than hue.
  //
  // Podium's three tiers all sit in the green-yellow band, which is the one
  // place this batch relaxes batch 1's "no two tiers share a hue region" rule.
  // It is relaxed knowingly and it is measured: the three are 21.6 (BASE-SUPER),
  // 30.2 (SUPER-LEGENDARY) and 43.2 (BASE-LEGENDARY) dE00 apart -- wider than
  // the tightest ACCEPTED pair anywhere in the catalogue -- and they span 43.6
  // units of CIELAB L* and 54.1 of chroma. They cannot read as "the same badge
  // with bigger text", which is what the rule exists to stop.
  // ===================================================================

  // --- Comeback Kid ----------------------------------------------------
  // A heat ramp, because that is literally the story: something that was going
  // out gets hotter. Ember -> flare -> incandescence. All three are warm, and
  // all three had to fit between competitor_SUPER's signal red, the demo chain
  // badge's orange and early_bird_SUPER's peach -- which is why the arc runs
  // through pink at the top rather than through yellow (yellow-white at high L*
  // measured 13 dE00 from dawn peach and 14 from citron; rose measured 21+).
  //
  // BASE -- EMBER RUST. The banked coal. Lowest L* of the family (28.5) and the
  // only badge in the catalogue in the deep red-brown region; nearest
  // neighbour is competitor_SUPER's signal red at dE00 19.5, held apart on
  // lightness and chroma together (L* 28.5 vs 43.3, chroma 32.4 vs 86.6).
  "comeback_kid_BASE": { customBg: "linear-gradient(135deg, #6f302a 0%, #2a0f0c 100%)", customShadow: "0 10px 15px -3px rgba(111, 48, 42, 0.2)", customBorder: "none", iconColorHex: "#f9f1ee", bloomColor: "rgba(111, 48, 42, 0.6)", glitch: false, burst: ["#6f302a", "#2a0f0c", "#150605"] },
  // SUPER -- VERMILLION FLARE. Highest chroma in the family (66.5). Sits 22.0
  // dE00 off signal red and 21.8 off its own LEGENDARY.
  "comeback_kid_SUPER": { customBg: "linear-gradient(135deg, #ff606c 0%, #8f1420 100%)", customShadow: "0 10px 15px -3px rgba(255, 96, 108, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#fff1f2", bloomColor: "rgba(255, 96, 108, 0.8)", glitch: true, burst: ["#ff606c", "#8f1420", "#ffe3e6"] },
  // LEGENDARY -- INCANDESCENT ROSE. Past red and past orange, heated metal goes
  // pale with a rose cast; that is the physical read AND the only high-L* warm
  // hole left (dE00 21.8 to dawn peach, 21.8 to its own SUPER).
  // INK GLYPH: relative luminance 0.60, so a white mark would disappear. This
  // is one of three ink-marked badges in the batch.
  "comeback_kid_LEGENDARY": { customBg: "linear-gradient(135deg, #ffb7cf 0%, #b04a72 100%)", customShadow: "0 10px 15px -3px rgba(255, 183, 207, 0.45)", customBorder: "4px solid #ffe0ea", iconColorHex: "#4a1024", bloomColor: "rgba(255, 183, 207, 0.9)", glitch: true, burst: ["#ffb7cf", "#e07fa0", "#ffe0ea", "#ffffff"] },

  // --- Podium Finisher -------------------------------------------------
  // The wreath, not the medal. See the block note above for why the metals
  // were unavailable.
  //
  // BASE -- PALE LAUREL. Fresh, unremarkable, correct: this is "you made the
  // top three once". Highest L* in the family (78.4) and the lowest chroma
  // (17.9); nearest neighbour is sharpshooter_LEGENDARY's ice at dE00 21.3.
  // INK GLYPH: relative luminance 0.54.
  "podium_finisher_BASE": { customBg: "linear-gradient(135deg, #bdc6a5 0%, #6b7350 100%)", customShadow: "0 10px 15px -3px rgba(189, 198, 165, 0.2)", customBorder: "none", iconColorHex: "#2f371d", bloomColor: "rgba(189, 198, 165, 0.6)", glitch: false, burst: ["#bdc6a5", "#8b9470", "#6b7350"] },
  // SUPER -- GILT LAUREL. The wreath, gilded. Chroma jumps 17.9 -> 72.0, which
  // is what carries the tier step. Deliberately chartreuse rather than gold:
  // gold is competitor_LEGENDARY's (cleared by dE00 20.2) and bright yellow is
  // speed_demon_SUPER's.
  "podium_finisher_SUPER": { customBg: "linear-gradient(135deg, #7ea503 0%, #2f3d01 100%)", customShadow: "0 10px 15px -3px rgba(126, 165, 3, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#f7fbe9", bloomColor: "rgba(126, 165, 3, 0.8)", glitch: true, burst: ["#7ea503", "#4d6602", "#d9f27a"] },
  // LEGENDARY -- IMPERIAL LAUREL. "The Champion". The wreath closes and goes
  // deep: L* 34.8, the darkest of the three and the only true green in the
  // catalogue other than perfectionist BASE's jade (dE00 27.6) and
  // unstoppable_streak_SUPER's vital green (dE00 42.5).
  "podium_finisher_LEGENDARY": { customBg: "linear-gradient(135deg, #00600c 0%, #002206 100%)", customShadow: "0 10px 15px -3px rgba(0, 96, 12, 0.45)", customBorder: "4px solid #a9e6b6", iconColorHex: "#eefaf0", bloomColor: "rgba(0, 96, 12, 0.9)", glitch: true, burst: ["#00600c", "#00380a", "#a9e6b6", "#ffffff"] },

  // --- Sharpshooter ----------------------------------------------------
  // One temperature, three instruments: gunmetal -> steel -> ice.
  //
  // BASE -- GUNMETAL. Near-neutral with a cold cast (chroma 11.7, hue 240).
  // The third-lowest-chroma badge in the catalogue, behind competitor_BASE's
  // pewter (9.2) and underdog_BASE's basalt (9.7), and 31.5 dE00 clear of the
  // pewter almost entirely on L* (27.3 vs 61.0) -- the two are "dark tool
  // steel" and "polished trophy metal", never the same chip.
  "sharpshooter_BASE": { customBg: "linear-gradient(135deg, #3f3f51 0%, #16161e 100%)", customShadow: "0 10px 15px -3px rgba(63, 63, 81, 0.2)", customBorder: "none", iconColorHex: "#eef0f8", bloomColor: "rgba(63, 63, 81, 0.6)", glitch: false, burst: ["#3f3f51", "#16161e", "#0a0a10"] },
  // SUPER -- STEEL. The tightest gated pair in the entire catalogue: dE00 18.6
  // against perfectionist_BASE's jade. The two are close in L* (56.2 vs 58.8)
  // and are separated on chroma instead -- 14.4 vs 40.3, i.e. jade is nearly
  // three times as saturated -- plus 15 CIELAB b* units. The verifier ranks
  // every pair closest-first so this one sits at the top of the report rather
  // than buried. It is the price of the cold band being nearly full.
  "sharpshooter_SUPER": { customBg: "linear-gradient(135deg, #668d96 0%, #24393e 100%)", customShadow: "0 10px 15px -3px rgba(102, 141, 150, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#f0f8fa", bloomColor: "rgba(102, 141, 150, 0.8)", glitch: true, burst: ["#668d96", "#24393e", "#bfe2ea"] },
  // LEGENDARY -- ICE. L* 92.4, the second-brightest card in the catalogue after
  // perfectionist_MYTHIC's pearl, and 21.0 dE00 from speed_demon_BASE's cyan --
  // the pair a naive "both are blue-green" reading would call identical, and
  // which CIEDE2000 separates on chroma and lightness together.
  // INK GLYPH: relative luminance 0.82. Border is dark for the same reason.
  "sharpshooter_LEGENDARY": { customBg: "linear-gradient(135deg, #81ffe1 0%, #17a184 100%)", customShadow: "0 10px 15px -3px rgba(129, 255, 225, 0.45)", customBorder: "4px solid #0b3a30", iconColorHex: "#0b3a30", bloomColor: "rgba(129, 255, 225, 0.9)", glitch: true, burst: ["#81ffe1", "#3fd8b6", "#d6fff4", "#ffffff"] },

  // --- Underdog --------------------------------------------------------
  // The only deliberately EARTHY family in the catalogue. Everything else here
  // is a light source, a jewel or a metal; this one is dirt, rope and rock,
  // which is the read the badge wants ("beat the odds from nowhere") and also
  // the reason it can occupy the muted mid-chroma region nothing else wanted.
  //
  // BASE -- BASALT. Dark, almost achromatic warm stone (chroma 9.7 -- second
  // only to competitor_BASE's pewter at 9.2, and the two are 30+ dE00 apart on
  // lightness). Nearest neighbour is early_bird_BASE's antique bronze at dE00
  // 18.6, separated by chroma (9.7 vs 37.1) rather than by hue: bronze is a lit
  // metal, this is unlit rock.
  "underdog_BASE": { customBg: "linear-gradient(135deg, #484536 0%, #191811 100%)", customShadow: "0 10px 15px -3px rgba(72, 69, 54, 0.2)", customBorder: "none", iconColorHex: "#f7f5ec", bloomColor: "rgba(72, 69, 54, 0.6)", glitch: false, burst: ["#484536", "#191811", "#0d0c08"] },
  // SUPER -- WEATHERED TAN. Sun-bleached rope and salted iron. 19.3 dE00 from
  // competitor_BASE's pewter, 19.6 from early_bird_SUPER's dawn peach and 19.8
  // from the demo chain badge's orange -- the three nearest things to it.
  "underdog_SUPER": { customBg: "linear-gradient(135deg, #a8876f 0%, #4b3626 100%)", customShadow: "0 10px 15px -3px rgba(168, 135, 111, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#faf4ef", bloomColor: "rgba(168, 135, 111, 0.8)", glitch: true, burst: ["#a8876f", "#4b3626", "#e3c6ac"] },
  // LEGENDARY -- GRANITE MOSS. Lichened summit rock. Cool-shifted away from
  // SUPER's tan (b* 17.3 at a* -8.2 vs a* +9.1) so the two muted earths do not
  // converge; measured 20.2 dE00 apart.
  "underdog_LEGENDARY": { customBg: "linear-gradient(135deg, #787e5d 0%, #2f3323 100%)", customShadow: "0 10px 15px -3px rgba(120, 126, 93, 0.45)", customBorder: "4px solid #d9dcc4", iconColorHex: "#f6f7ee", bloomColor: "rgba(120, 126, 93, 0.9)", glitch: true, burst: ["#787e5d", "#4f5439", "#d9dcc4", "#ffffff"] },

  // --- High Achiever (backend code `polymath`) -------------------------
  // True violet, and specifically NOT the two violets already in use:
  // perfectionist_SUPER's amethyst-magenta (#9b1fd6) and
  // unstoppable_streak_LEGENDARY's orchid (#f84fd6). Both of those are
  // high-chroma magentas; this family is built on the blue side of violet and
  // on lightness contrast instead.
  //
  // BASE -- LAPIS INK. Muted, bookish, low chroma (27.0). Nearest neighbours
  // are competitor_BASE pewter (18.6) and perfectionist_SUPER amethyst (19.1);
  // it clears the amethyst by 72 units of chroma (27.0 vs 99.4), not by hue.
  "polymath_BASE": { customBg: "linear-gradient(135deg, #7e638d 0%, #2f2338 100%)", customShadow: "0 10px 15px -3px rgba(126, 99, 141, 0.2)", customBorder: "none", iconColorHex: "#f7f0fa", bloomColor: "rgba(126, 99, 141, 0.6)", glitch: false, burst: ["#7e638d", "#2f2338", "#191021"] },
  // SUPER -- PERIWINKLE. The insight moment: same hue family as BASE, twice the
  // chroma (53.3 vs 27.0) and 25 more L*. The most blue-shifted violet in the
  // set (CIELAB b* -43.7), which is what holds it 20.1 dE00 off pewter and 20.8
  // off the level-mastery demo's indigo.
  "polymath_SUPER": { customBg: "linear-gradient(135deg, #bd9fff 0%, #5b3fae 100%)", customShadow: "0 10px 15px -3px rgba(189, 159, 255, 0.35)", customBorder: "2px solid rgba(255,255,255,0.75)", iconColorHex: "#f9f4ff", bloomColor: "rgba(189, 159, 255, 0.8)", glitch: true, burst: ["#bd9fff", "#5b3fae", "#ffffff"] },
  // LEGENDARY -- IMPERIAL VIOLET. Oxblood-violet, the colour of a bound
  // library spine. Darkest of the three (L* 25.2) and 19.7 dE00 from amethyst,
  // which is the closest thing to it anywhere in the catalogue.
  "polymath_LEGENDARY": { customBg: "linear-gradient(135deg, #6c1260 0%, #250320 100%)", customShadow: "0 10px 15px -3px rgba(108, 18, 96, 0.45)", customBorder: "4px solid #edb9e2", iconColorHex: "#fbf0f9", bloomColor: "rgba(108, 18, 96, 0.9)", glitch: true, burst: ["#6c1260", "#420a3a", "#edb9e2", "#ffffff"] },

  // ===================================================================
  // PHASE-1 MYTHIC TIER (2026-07-28)
  // -------------------------------------------------------------------
  // The 9 new MYTHIC badges for the existing skill-badge families.
  // Perfectionist's MYTHIC (opal, above) already shipped and is a FIXED INPUT
  // here -- it is not re-graded, and neither is any BASE/SUPER/LEGENDARY entry.
  //
  // HOW THESE 9 COLOURS WERE CHOSEN -- and why the method inverted this time.
  // Batches 1 and 2 picked hexes first and drew glyphs to match. Here the
  // hand-drawn MYTHIC glyphs in ./badgeGlyphs ALREADY EXISTED and already
  // carried a per-badge palette in their hardcoded accent constants
  // (SDM_VIOLET tachyon violet, CRM_SAPPHIRE imperial sapphire, INM_TURQ
  // eternal turquoise, PCM_ROSE singularity rose, SUM_SKY summit sky, ...), and
  // three of them are explicitly annotated "DRAWN FOR A LIGHT CARD". That
  // artwork is committed, so it was treated as the anchor: each colour below is
  // the most perceptually-separated point available INSIDE its own glyph's hue
  // family, at a lightness that matches the card polarity its glyph assumes.
  // Colour follows the drawing here, not the other way round.
  //
  // THE HARD PART, honestly stated. The gate is now 42 colours (33 already
  // graded + these 9) and the easy sRGB is long gone. An unconstrained
  // farthest-point CIEDE2000 search -- no thematic constraint at all, free to
  // put all 9 anywhere in the colour solid -- puts the theoretical ceiling for
  // 9 more colours at dE00 16.06. So batch 1's "every gated pair >= 18" is
  // ARITHMETICALLY UNREACHABLE at this catalogue size and 0 WARN is not an
  // option any palette could have hit. This set lands at 12.50 minimum while
  // staying inside the glyphs' hue families, and every pair clears the FAIL
  // line (dE00 >= 12, and no pair is both HSL-triple-near and < 18). The WARN
  // band is therefore populated ON PURPOSE and is documented per entry below,
  // following the precedent already set by sharpshooter_SUPER (18.6, the
  // tightest ACCEPTED pair in batch 2) rather than silently widening a
  // threshold. Rarity is carried by effects, particles and audio -- which is
  // exactly the escape hatch batch 1 wrote down for when hue runs out.
  //
  // MYTHIC's shared visual language, and why it is not a colour: every entry
  // below is a MULTI-STOP gradient that passes through a white or near-white
  // blowout at its centre -- the "there is still light inside" move that
  // perfectionist_MYTHIC introduced. That is what makes a MYTHIC card read as
  // above its own LEGENDARY (all 9 LEGENDARYs are 2-stop ramps) without
  // needing a hue nobody else has.
  //
  // burst[0] is the graded primary in every case: BadgeInspectionModal feeds
  // burst[0] to the 3D scene's lights and ambient particles (`Env* color`), so
  // it is chosen to be a colour that can actually light a scene, never a
  // near-black. iconColorHex is set by WCAG relative luminance against the
  // card, not by eye -- the four INK marks below are the four cards over 0.45.
  // ===================================================================

  // speed_demon_MYTHIC -- TACHYON VIOLET. The comet does not go faster; it goes
  // PAST light, and the blueshift wraps off the end of the visible spectrum.
  // That is the one read that escalates BASE's cyan without re-using it.
  // Chroma 105.3 -- the most saturated colour in the entire catalogue, which is
  // the point of a ceiling tier. Nearest neighbours are perfectionist_SUPER's
  // amethyst and unstoppable_streak_LEGENDARY's orchid, both at dE00 12.5:
  // WARN, accepted. It clears both on lightness and chroma together (L* 55.0 vs
  // 45.4/65.6, chroma 105.3 vs 99.4/78.6) and neither is HSL-triple-near.
  // Violet at this lightness is boxed in on all sides by those two; 12.5 is the
  // widest gap that exists between them.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #fdf2ff (near-white)
  // against a background that passes through #ffffff at 42% -- a WCAG
  // contrast of 1.01, i.e. the icon was visually invisible against its own
  // badge, confirmed live via browser screenshot. Every other badge using
  // this "opal, light-center" gradient shape (perfectionist_MYTHIC,
  // unstoppable_streak_MYTHIC, etc.) correctly uses a DARK ink glyph for
  // exactly this reason -- this one just missed it. Fixed to #2a0350, which
  // is not an arbitrary black but the gradient's own 100% stop (deep
  // violet), so the icon reads as "the dark end of this badge's own
  // palette" rather than a mismatched color. New contrast: 15.9.
  "speed_demon_MYTHIC": { customBg: "linear-gradient(125deg, #c83efe 0%, #e79bff 24%, #ffffff 42%, #8a12d8 68%, #2a0350 100%)", customShadow: "0 10px 40px -3px rgba(200, 62, 254, 0.6)", customBorder: "4px solid rgba(240, 179, 255, 0.9)", iconColorHex: "#2a0350", bloomColor: "rgba(200, 62, 254, 0.95)", glitch: true, burst: ["#c83efe", "#f0b3ff", "#8a12d8", "#ffffff"] },

  // competitor_MYTHIC -- IMPERIAL SAPPHIRE. The family's LEGENDARY is struck
  // gold, so MYTHIC deliberately does NOT go "more gold": a brighter gold is
  // the exact "same badge, bigger text" failure this catalogue exists to avoid,
  // and it measured inside 12 of competitor_LEGENDARY anyway. The coronation
  // stone instead of the coronation metal -- and it is 56.4 dE00 off its own
  // LEGENDARY, the widest in-family MYTHIC step in this batch.
  // Nearest neighbour is perfectionist_LEGENDARY's azure at dE00 13.1 (WARN):
  // separated on chroma, 36.1 vs 58.6, i.e. a stone versus an instrument beam.
  // ICON-CONTRAST FIX (2026-07-29): same class of bug as speed_demon_MYTHIC
  // above -- iconColorHex was #eff8ff (near-white) against this gradient's
  // pale-blue centre (#d6ecff at 46%), contrast 1.17. Fixed to #03243a, the
  // gradient's own 100% stop (deep navy). New contrast: 12.7.
  "competitor_MYTHIC": { customBg: "linear-gradient(125deg, #1d7aaf 0%, #4aa8e8 26%, #d6ecff 46%, #0b4f77 74%, #03243a 100%)", customShadow: "0 10px 40px -3px rgba(29, 122, 175, 0.6)", customBorder: "4px solid rgba(214, 236, 255, 0.9)", iconColorHex: "#03243a", bloomColor: "rgba(74, 168, 232, 0.95)", glitch: true, burst: ["#1d7aaf", "#4aa8e8", "#d6ecff", "#ffffff"] },

  // unstoppable_streak_MYTHIC -- ETERNAL TURQUOISE. STILL NOT FIRE: this family
  // is fenced off from orange/crimson because the separate demo badge on code
  // `unstoppable_streak_chain` owns that, and this entry sits 59.1 dE00 from it
  // -- the widest clearance of the four tiers. Turquoise is the blue-green the
  // family's cobalt BASE and vital-green SUPER both point at without either one
  // occupying it, so the loop closes on a colour the family already implied.
  // INK GLYPH: relative luminance 0.470, just over the line -- a white mark
  // greys out on this. Nearest are perfectionist_BASE's jade and
  // sharpshooter_LEGENDARY's ice at 14.0, and its OWN SUPER at 14.1 (all WARN);
  // the SUPER pair is held on hue, b* +15.5 vs +48.9, blue-green vs pure green.
  "unstoppable_streak_MYTHIC": { customBg: "linear-gradient(125deg, #0ccf98 0%, #9ffbe6 28%, #ffffff 44%, #06705d 74%, #032e26 100%)", customShadow: "0 10px 40px -3px rgba(12, 207, 152, 0.55)", customBorder: "4px solid rgba(6, 112, 93, 0.85)", iconColorHex: "#04352a", bloomColor: "rgba(12, 207, 152, 0.95)", glitch: true, burst: ["#0ccf98", "#9ffbe6", "#06705d", "#ffffff"] },

  // early_bird_MYTHIC -- GENESIS SOLAR. The family runs bronze lamp -> dawn
  // peach -> the cold blue hour BEFORE sunrise; MYTHIC is the sun itself
  // finally clearing the horizon, so it is the one tier allowed to be pure
  // light. L* 87.2. INK GLYPH (relative luminance 0.704) and a DARK border, for
  // the same reason sharpshooter_LEGENDARY has one: nothing pale reads here.
  // Nearest are speed_demon_SUPER's citron and competitor_LEGENDARY's gold at
  // 16.2 (WARN) -- citron is 8 L* brighter and far greener (b* 54.4 vs 90.5),
  // the gold is 22 L* darker. Its own SUPER peach is 16.6 away.
  "early_bird_MYTHIC": { customBg: "linear-gradient(125deg, #fed671 0%, #fff0b8 22%, #ffffff 40%, #c98a00 72%, #7a4f00 100%)", customShadow: "0 10px 40px -3px rgba(254, 214, 113, 0.6)", customBorder: "4px solid rgba(122, 79, 0, 0.85)", iconColorHex: "#3f2a00", bloomColor: "rgba(255, 240, 184, 0.95)", glitch: true, burst: ["#fed671", "#c98a00", "#fff0b8", "#ffffff"] },

  // comeback_kid_MYTHIC -- PHOENIX EMBER. The family is already a heat ramp
  // (ember rust -> vermillion -> incandescent rose) and it climbed through PINK
  // at the top because yellow-white was taken. MYTHIC returns to the fire's
  // own colour at full chroma (61.0) -- the bird, not the coal.
  // Nearest are competitor_SUPER's signal red and early_bird_BASE's bronze at
  // 14.6, and the demo chain badge's orange at 14.9 (all WARN). The chain pair
  // is the one worth naming: they share a hue region, and they are held apart
  // by lightness (L* 48.6 vs 63.0) plus this badge's much deeper red cast.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #fff3ea (near-white)
  // against this gradient's peachy centre (#ffb391 at 46%), contrast 1.62
  // -- lower severity than the pure-white cases above but still a real
  // mesh. Fixed to #2b0c05, the gradient's own 100% stop (deep umber). New
  // contrast: 10.3.
  "comeback_kid_MYTHIC": { customBg: "linear-gradient(125deg, #b7591a 0%, #ff8c3c 26%, #ffb391 46%, #6d230f 76%, #2b0c05 100%)", customShadow: "0 10px 40px -3px rgba(183, 89, 26, 0.6)", customBorder: "4px solid rgba(255, 179, 145, 0.9)", iconColorHex: "#2b0c05", bloomColor: "rgba(255, 140, 60, 0.95)", glitch: true, burst: ["#b7591a", "#ff8c3c", "#ffb391", "#ffffff"] },

  // podium_finisher_MYTHIC -- IMMORTAL LAUREL ("The Immortal"). This family was
  // already the documented exception that keeps all its tiers in the
  // green-yellow band (see the batch-2 block note); MYTHIC continues that on
  // purpose and takes the band's last free corner, the high-key one: L* 95.2,
  // where BASE/SUPER/LEGENDARY are 78.4 / 55.4 / 34.8. The wreath stops being
  // foliage and becomes marble lit from behind.
  // INK GLYPH (relative luminance 0.882) + dark border. Nearest are
  // unstoppable_streak_SUPER's vital green 16.2, speed_demon_SUPER's citron
  // 16.4 and its own BASE laurel 16.6 -- all WARN, all separated on lightness.
  "podium_finisher_MYTHIC": { customBg: "linear-gradient(125deg, #d4ffa4 0%, #eeffc4 22%, #ffffff 40%, #8ba336 70%, #41521a 100%)", customShadow: "0 10px 40px -3px rgba(212, 255, 164, 0.55)", customBorder: "4px solid rgba(65, 82, 26, 0.85)", iconColorHex: "#22300c", bloomColor: "rgba(238, 255, 196, 0.95)", glitch: true, burst: ["#d4ffa4", "#8ba336", "#eeffc4", "#ffffff"] },

  // sharpshooter_MYTHIC -- SINGULARITY ROSE. The one family that had to break
  // its own rule. Batch 2 built it as gunmetal -> steel -> ice specifically
  // because "sharpshooter cannot be three cold colours" -- the cold band was
  // full at 33 entries and is beyond full at 42. A fourth cold tier does not
  // exist, so MYTHIC takes the hot complement instead: the target itself,
  // glowing, at the instant of the lock. Chroma 80.6 against ice's 44.7.
  // Nearest are comeback_kid_SUPER 14.0, unstoppable_streak_LEGENDARY's orchid
  // 14.0 and speed_demon_LEGENDARY's plasma rose 14.1 (all WARN). It is 80.0
  // dE00 from its own LEGENDARY -- the widest in-family step in the catalogue.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #fff0f6 (near-white)
  // against this gradient's pale-rose centre (#ffdcea at 44%), contrast
  // 1.20. Fixed to #2c0a1a, the gradient's own 100% stop (deep maroon). New
  // contrast: 13.6.
  "sharpshooter_MYTHIC": { customBg: "linear-gradient(125deg, #ff2989 0%, #ff7bb4 24%, #ffdcea 44%, #7c2748 76%, #2c0a1a 100%)", customShadow: "0 10px 40px -3px rgba(255, 41, 137, 0.6)", customBorder: "4px solid rgba(255, 220, 234, 0.9)", iconColorHex: "#2c0a1a", bloomColor: "rgba(255, 41, 137, 0.95)", glitch: true, burst: ["#ff2989", "#ff7bb4", "#ffdcea", "#ffffff"] },

  // underdog_MYTHIC -- SUMMIT SKY. The family is deliberately the earthy one
  // (basalt, weathered tan, granite moss) because it is dirt and rope and rock.
  // MYTHIC is the first tier that LEAVES the ground, so it is the first tier
  // allowed off the earth palette entirely: thin, hard, high-altitude blue. The
  // in-family step is 37.8 / 42.8 / 46.1 dE00 -- nobody will read this as the
  // same badge. Nearest are unstoppable_streak_BASE's cobalt at 12.9 and the
  // level-mastery demo's indigo at 13.4 (WARN): cleared on chroma (61.8 vs
  // 44.9) and on this badge being 10 L* brighter than the cobalt.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #f2f7ff (near-white)
  // against this gradient's pale-blue centre (#eef5ff at 48%), contrast
  // 1.11. Fixed to #06172e, the gradient's own 100% stop (deep navy). New
  // contrast: 15.0.
  "underdog_MYTHIC": { customBg: "linear-gradient(125deg, #0058bd 0%, #8dbfff 30%, #eef5ff 48%, #16407a 76%, #06172e 100%)", customShadow: "0 10px 40px -3px rgba(0, 88, 189, 0.6)", customBorder: "4px solid rgba(238, 245, 255, 0.9)", iconColorHex: "#06172e", bloomColor: "rgba(141, 191, 255, 0.95)", glitch: true, burst: ["#0058bd", "#8dbfff", "#eef5ff", "#ffffff"] },

  // polymath_MYTHIC -- ORACLE VIOLET. The family is built on the blue side of
  // violet and on LIGHTNESS contrast rather than hue (lapis ink -> periwinkle
  // -> imperial violet). MYTHIC completes that axis at the top: near-white,
  // L* 86.5, the family's own hue bleached almost out of itself, which is the
  // only place "knows everything at once" could land. Its glyph is annotated
  // "DRAWN FOR A LIGHT CARD" and is the reason this card is pale.
  // Lowest chroma of the 9 (19.8) BY DESIGN -- it is the quiet one, and quiet
  // is also what let it clear a crowded region: nearest are
  // comeback_kid_LEGENDARY 16.3, its own SUPER periwinkle 16.3 and
  // perfectionist_MYTHIC's pearl 16.4. INK GLYPH, relative luminance 0.689.
  "polymath_MYTHIC": { customBg: "linear-gradient(125deg, #ded3f8 0%, #f6e2ff 24%, #ffffff 42%, #9d5cc8 72%, #4b1f6b 100%)", customShadow: "0 10px 40px -3px rgba(222, 211, 248, 0.6)", customBorder: "4px solid rgba(75, 31, 107, 0.85)", iconColorHex: "#2b1240", bloomColor: "rgba(246, 226, 255, 0.95)", glitch: true, burst: ["#ded3f8", "#9d5cc8", "#f6e2ff", "#ffffff"] },

  // ===================================================================
  // PHASE 2 -- FIVE NEW FAMILIES, FOUR TIERS EACH (2026-07-28)
  // -------------------------------------------------------------------
  // Marathoner, Iron Wall, The Veteran, Last-Minute Hero and Section
  // Specialist. Every entry above is a FIXED INPUT and none is re-graded --
  // no existing badge's code, tier, colour or glyph is touched by this pass.
  //
  // HOW THESE 20 COLOURS WERE CHOSEN, and the arithmetic first.
  // The gate is now 62 colours. A FREE farthest-point CIEDE2000 search -- 20
  // points placed anywhere in sRGB with the existing 42 held fixed and no
  // thematic constraint at all -- maximises the smallest new distance at
  // dE00 13.50 (greedy over a 23k-point grid restricted to CIELAB L* 22..97,
  // i.e. excluding the near-blacks and near-whites that cannot light a 3D
  // scene). This palette lands at 13.46: 99.7% of the unconstrained ceiling,
  // while ALSO keeping every badge inside a hue window its theme survives.
  // Batch 1's "every gated pair >= 18" has been arithmetically unreachable
  // since phase 1 measured its own ceiling at 16.06 for nine colours; at 62
  // colours it is not close. The WARN band is therefore populated on purpose,
  // documented per entry, and the property that actually holds is the one that
  // means "these cannot be confused": every gated pair clears FAIL (dE00 >= 12,
  // and no pair is simultaneously HSL-triple-near and < 18).
  //
  // The method: seed from the holes the free search actually found, assign each
  // hole to the badge whose theme could justify it, then re-optimise by
  // coordinate ascent inside a per-badge thematic box. Two family themes moved
  // as a direct result of the measurement rather than of taste, exactly as
  // batch 2's champagne/platinum and three-cold-colours findings did:
  //
  //   * LAST-MINUTE HERO IS NOT FOUR HOT COLOURS. Only two genuinely hot holes
  //     were left in the whole catalogue -- after signal red, vermillion,
  //     incandescent rose, orange, ember rust, phoenix ember, plasma rose,
  //     singularity rose, dawn peach, citron, gold, genesis solar, bronze and
  //     tan, the warm band is full. So the family runs struck amber ->
  //     flashbulb lime -> scorched gold -> eclipse plum: a DEADLINE arc (the
  //     spark, the blown-out flash, fire seen through smoke, and finally the
  //     dark of the deadline itself) instead of a heat ramp. The brief's own
  //     MYTHIC direction -- an eclipse, dark-before-light -- is what made that
  //     arc available, and it is still the exact opposite temperature from
  //     Early Bird, which was the actual requirement.
  //   * IRON WALL IS THREE NEUTRALS PLUS ONE. Brick, quarry stone and pale
  //     limestone are the masonry; the near-neutral band cannot hold a fourth
  //     entry alongside competitor_BASE's pewter, sharpshooter_BASE's gunmetal
  //     and underdog_BASE's basalt, so MYTHIC leaves it for verdigris -- the
  //     citadel's aged bronze rather than its stone.
  //
  // MYTHIC's shared language is unchanged from phase 1: all four new MYTHIC
  // entries are MULTI-STOP gradients passing through a white or near-white
  // blowout at the centre, which is what makes a MYTHIC card read as above its
  // own LEGENDARY without needing a hue nobody else has.
  //
  // burst[0] is the graded primary in every case (BadgeInspectionModal feeds it
  // to the scene lights and ambient particles), and iconColorHex is set by WCAG
  // relative luminance against that primary, not by eye. The SIX ink marks
  // below are the six cards over 0.45.
  // ===================================================================

  // --- Marathoner ------------------------------------------------------
  // Cumulative time on task, lifetime. A journey read as four separate lights:
  // the road surface, the heat of the effort, the distance, and the light at
  // the end of it.
  //
  // BASE -- TRAIL GREY. Chroma 2.1: the LOWEST-CHROMA COLOUR IN THE ENTIRE
  // CATALOGUE, below competitor_BASE's pewter (9.2) and underdog_BASE's basalt
  // (9.7). That is the point -- three hours is the entry rung and this is
  // packed gravel, not a jewel. Nearest neighbours are underdog_BASE at dE00
  // 16.1 and last_minute_hero_MYTHIC at 17.0, both held on lightness (L* 44.9
  // vs 28.5 / 34.1) since none of the three has enough chroma to separate on.
  "marathoner_BASE": { customBg: "linear-gradient(135deg, #6e6969 0%, #3f3c3c 100%)", customShadow: "0 10px 15px -3px rgba(110, 105, 105, 0.2)", customBorder: "none", iconColorHex: "#f7f5f5", bloomColor: "rgba(110, 105, 105, 0.6)", glitch: false, burst: ["#6e6969", "#3f3c3c", "#211f1f"] },
  // SUPER -- SUN-BAKED OCHRE. The road at the hottest part of the run. This is
  // the colour that LOST the amber to last_minute_hero_BASE: only two hot holes
  // remained and the heat family had first claim, so Marathoner took the softer
  // high-key one above it (L* 71.3 vs 53.5). Nearest are competitor_LEGENDARY's
  // imperial gold at dE00 13.5 and the demo chain badge's orange at 13.8 (WARN,
  // accepted) -- cleared on lightness against the gold (71.3 vs 65.1) and on
  // chroma against the orange (52.2 vs 87.0).
  "marathoner_SUPER": { customBg: "linear-gradient(135deg, #e6a055 0%, #7a4c14 100%)", customShadow: "0 10px 15px -3px rgba(230, 160, 85, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#fff8ef", bloomColor: "rgba(230, 160, 85, 0.8)", glitch: true, burst: ["#e6a055", "#7a4c14", "#ffe0bd"] },
  // LEGENDARY -- HORIZON BLUE. Atmospheric perspective: at twenty-five hours
  // the badge stops being about the road and starts being about how far you can
  // see down it. INK GLYPH (relative luminance 0.557) and a DARK border, same
  // reason sharpshooter_LEGENDARY has one -- nothing pale reads on this card.
  // Nearest is perfectionist_LEGENDARY's azure scan-beam at 15.8 (WARN), which
  // it clears on chroma and lightness together (28.9 vs 58.6, L* 79.4 vs 58.7):
  // haze versus instrument beam.
  "marathoner_LEGENDARY": { customBg: "linear-gradient(135deg, #a0c8fa 0%, #234066 100%)", customShadow: "0 10px 15px -3px rgba(160, 200, 250, 0.45)", customBorder: "4px solid #14273f", iconColorHex: "#0d2038", bloomColor: "rgba(160, 200, 250, 0.9)", glitch: true, burst: ["#a0c8fa", "#5b86c4", "#dbe9ff", "#ffffff"] },
  // MYTHIC -- ENDLESS DAWN. Sixty hours; the family's last tier is the only one
  // allowed to be pure light, because it is the only one where the trail has
  // closed into a loop and there is no end of the road left to reach. L* 96.8.
  // INK GLYPH (relative luminance 0.920) + dark border. Nearest are
  // perfectionist_MYTHIC's opal pearl at 14.4 and early_bird_SUPER's dawn peach
  // at 14.5 (WARN): the pearl is COOL near-white (b* +1.3) and this is WARM
  // (b* +10.8), and the peach is 15 L* darker.
  "marathoner_MYTHIC": { customBg: "linear-gradient(125deg, #fff5e1 0%, #ffe9c2 22%, #ffffff 40%, #b98d3e 72%, #5c3f12 100%)", customShadow: "0 10px 40px -3px rgba(255, 245, 225, 0.6)", customBorder: "4px solid rgba(92, 63, 18, 0.85)", iconColorHex: "#3a2810", bloomColor: "rgba(255, 245, 225, 0.95)", glitch: true, burst: ["#fff5e1", "#b98d3e", "#ffe9c2", "#ffffff"] },

  // --- Iron Wall -------------------------------------------------------
  // Never drops below an escalating floor. Masonry, and deliberately NOT a
  // light source: this family is the only one in the catalogue whose whole
  // identity is that it does not move. Distinct from Unstoppable Streak by
  // construction -- that family is offence (cobalt cold-flame, vital green,
  // orchid, turquoise) and reads as forward motion; this one is defence.
  //
  // BASE -- FIRED BRICK. Deep russet clay, L* 21.6. Nearest are
  // early_bird_BASE's antique bronze at 15.5 and underdog_BASE's basalt at 15.7
  // (WARN): the bronze is 15 L* brighter and a lit metal, the basalt is nearly
  // achromatic (chroma 9.7 vs 28.6). Unlit fired clay is not either of them.
  "iron_wall_BASE": { customBg: "linear-gradient(135deg, #4b2d0a 0%, #1d1103 100%)", customShadow: "0 10px 15px -3px rgba(75, 45, 10, 0.2)", customBorder: "none", iconColorHex: "#faf3ea", bloomColor: "rgba(75, 45, 10, 0.6)", glitch: false, burst: ["#4b2d0a", "#1d1103", "#0d0801"] },
  // SUPER -- QUARRY STONE. Chroma 5.0, the second-lowest in the catalogue after
  // this phase's own trail grey. Nearest is competitor_BASE's pewter at dE00
  // 14.3 (WARN) and it is the tight pair worth naming: both are near-neutrals,
  // and they are held apart almost entirely on lightness (L* 63.0 vs 61.0 is
  // NOT the axis -- the separation is hue and chroma, pewter being a cool
  // violet-grey at a* +2.9 / b* -6.1 against this warm stone at a* -1.7 /
  // b* +4.7, an 11-unit b* swing). Struck trophy metal versus cut rock.
  "iron_wall_SUPER": { customBg: "linear-gradient(135deg, #999990 0%, #4c4c46 100%)", customShadow: "0 10px 15px -3px rgba(153, 153, 144, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#f9f9f6", bloomColor: "rgba(153, 153, 144, 0.8)", glitch: true, burst: ["#999990", "#4c4c46", "#d8d8d1"] },
  // LEGENDARY -- PALE LIMESTONE. Sun-bleached ashlar, chroma 3.7. The family's
  // in-family SUPER->LEGENDARY step (dE00 15.0) is the tightest in this phase
  // and is carried on lightness alone (63.0 -> 79.6), which is a deliberate
  // consequence of both tiers being near-neutral; the wall gets paler as it
  // gets bigger, which is what stone does. INK GLYPH (relative luminance 0.559)
  // + dark border. Nearest outside the family is early_bird_SUPER's dawn peach
  // at 14.4, cleared on chroma (3.7 vs 30.2).
  "iron_wall_LEGENDARY": { customBg: "linear-gradient(135deg, #cdc3c3 0%, #5c5252 100%)", customShadow: "0 10px 15px -3px rgba(205, 195, 195, 0.45)", customBorder: "4px solid #2b2323", iconColorHex: "#241d1d", bloomColor: "rgba(205, 195, 195, 0.9)", glitch: true, burst: ["#cdc3c3", "#8d8080", "#eee8e8", "#ffffff"] },
  // MYTHIC -- VERDIGRIS. The family's only non-masonry tier, and the reason is
  // measured rather than aesthetic: the near-neutral band is full at three
  // (pewter, gunmetal, basalt, plus this family's own stone and limestone) and
  // a fourth grey would have measured inside the FAIL line. So the ceiling tier
  // takes the citadel's aged bronze -- gates and roof, not walls. Nearest are
  // underdog_LEGENDARY's granite moss and veteran_LEGENDARY's regimental
  // bottle green, both at dE00 15.2 (WARN). The moss is warm-shifted (b* +17.3
  // vs +8.3) and the bottle green is 18 L* darker.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #eefff8 (near-white)
  // against this gradient's near-white mint centre (#eafff5 at 46%),
  // contrast 1.03 -- confirmed live via browser screenshot as one of the
  // worst offenders. Fixed to #08201a, the gradient's own 100% stop (deep
  // forest green). New contrast: 16.0.
  "iron_wall_MYTHIC": { customBg: "linear-gradient(125deg, #3c735a 0%, #7fd0a8 26%, #eafff5 46%, #1c4535 74%, #08201a 100%)", customShadow: "0 10px 40px -3px rgba(60, 115, 90, 0.6)", customBorder: "4px solid rgba(234, 255, 245, 0.9)", iconColorHex: "#08201a", bloomColor: "rgba(127, 208, 168, 0.95)", glitch: true, burst: ["#3c735a", "#7fd0a8", "#eafff5", "#ffffff"] },

  // --- The Veteran -----------------------------------------------------
  // Lifetime question volume. Service colours, in the literal military sense:
  // the drab you are issued, the ribbon a medal hangs from, the standard a
  // regiment is granted, and what is left when the person has gone. Every
  // metal this family would naturally want (pewter, gold, bronze, steel,
  // gunmetal) is already spoken for, so the family is built on CLOTH instead --
  // which is also the more honest read for a badge about time served.
  //
  // BASE -- OLIVE DRAB. L* 20.4, the darkest card in this phase. Nearest is
  // podium_finisher_LEGENDARY's imperial laurel at dE00 14.7 (WARN): both are
  // dark greens, and they are held apart on hue (b* +28.2 versus +23.7 at very
  // different a*, -17.5 versus -37.5) -- a yellow-shifted khaki against a true
  // bottle green. The laurel is a wreath; this is a uniform.
  "veteran_BASE": { customBg: "linear-gradient(135deg, #233700 0%, #0d1500 100%)", customShadow: "0 10px 15px -3px rgba(35, 55, 0, 0.2)", customBorder: "none", iconColorHex: "#f6faea", bloomColor: "rgba(35, 55, 0, 0.6)", glitch: false, burst: ["#233700", "#0d1500", "#060a00"] },
  // SUPER -- CAMPAIGN CRIMSON. The medal's suspension ribbon, not the medal.
  // Comfortably the most-separated colour in this phase: nearest neighbours are
  // speed_demon_LEGENDARY's plasma rose and competitor_SUPER's signal red, both
  // at dE00 16.6, and it clears each of them by more than 50 units of chroma
  // (31.8 versus 66.5 and 86.6). A washed ribbon and a signal light are never
  // the same object.
  "veteran_SUPER": { customBg: "linear-gradient(135deg, #a55f5a 0%, #4a2320 100%)", customShadow: "0 10px 15px -3px rgba(165, 95, 90, 0.35)", customBorder: "2px solid rgba(255,255,255,0.72)", iconColorHex: "#fdf2f1", bloomColor: "rgba(165, 95, 90, 0.8)", glitch: true, burst: ["#a55f5a", "#4a2320", "#e8bfbb"] },
  // LEGENDARY -- REGIMENTAL BOTTLE GREEN. The colours, in the heraldic sense.
  // L* 26.0. Nearest are early_bird_LEGENDARY's blue-hour petrol and this
  // phase's own iron_wall_MYTHIC verdigris, both at 15.2 (WARN): the petrol is
  // 12 L* brighter and blue-shifted (b* -6.4 against +4.0), the verdigris is 18
  // L* brighter. Its own BASE olive drab is 15.3 away, held on hue -- a* -21.8
  // here against -17.5 with a 24-unit b* swing, i.e. green against khaki.
  "veteran_LEGENDARY": { customBg: "linear-gradient(135deg, #0f4637 0%, #041c15 100%)", customShadow: "0 10px 15px -3px rgba(15, 70, 55, 0.45)", customBorder: "4px solid #8fd9be", iconColorHex: "#eefaf5", bloomColor: "rgba(15, 70, 55, 0.9)", glitch: true, burst: ["#0f4637", "#072a20", "#8fd9be", "#ffffff"] },
  // MYTHIC -- HONOUR MAUVE. 7,500 questions. The ribbon, raised off the object
  // and into the light: the honour rather than the medal. This is the family's
  // widest in-family step (BASE->MYTHIC dE00 56.6, the widest anywhere in this
  // phase), which is the point of a ceiling tier. Nearest are
  // sharpshooter_MYTHIC's singularity rose at 16.2 and polymath_BASE's lapis
  // ink at 16.3 -- cleared on chroma against the rose (28.5 vs 80.6) and on
  // hue against the lapis (a* +27.8 vs +18.0 at b* -6.6 vs -18.9).
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #fdf1f7 (near-white)
  // against a background that passes through #ffffff at 42%, contrast 1.05
  // -- this is the exact badge Shailesh flagged live (the monument/star
  // icon was reading as a barely-visible smudge). Fixed to #2e1424, the
  // gradient's own 100% stop (deep plum). New contrast: 16.1.
  "veteran_MYTHIC": { customBg: "linear-gradient(125deg, #b97d9b 0%, #eabfd6 24%, #ffffff 42%, #6d3a55 72%, #2e1424 100%)", customShadow: "0 10px 40px -3px rgba(185, 125, 155, 0.6)", customBorder: "4px solid rgba(234, 191, 214, 0.9)", iconColorHex: "#2e1424", bloomColor: "rgba(234, 191, 214, 0.95)", glitch: true, burst: ["#b97d9b", "#eabfd6", "#6d3a55", "#ffffff"] },

  // --- Last-Minute Hero ------------------------------------------------
  // Submits in the final 10% of the window and still scores 80%+. The mirror
  // image of Early Bird, which is calm, warm and dawn-lit. See the block note
  // above for why this is a DEADLINE arc rather than the heat ramp the brief's
  // first sketch asked for: the hot band of sRGB is full, and no arrangement of
  // four hot colours exists that clears the FAIL line at 62 gated colours.
  //
  // BASE -- STRUCK AMBER. Chroma 62.5. This badge got the last real warm hole
  // in the catalogue ahead of marathoner_SUPER, because a family about heat
  // needs one more than a family about distance does. Nearest are
  // competitor_LEGENDARY's imperial gold at dE00 13.6 and comeback_kid_MYTHIC's
  // phoenix ember at 13.8 (WARN): the gold is 12 L* brighter at lower chroma,
  // the ember is far redder (a* +37.7 against +16.7).
  "last_minute_hero_BASE": { customBg: "linear-gradient(135deg, #b07300 0%, #4a3000 100%)", customShadow: "0 10px 15px -3px rgba(176, 115, 0, 0.2)", customBorder: "none", iconColorHex: "#fff8e8", bloomColor: "rgba(176, 115, 0, 0.6)", glitch: false, burst: ["#b07300", "#4a3000", "#221600"] },
  // SUPER -- FLASHBULB LIME. The overexposed instant, not a colour anyone
  // chooses to look at -- which is exactly right for the badge. Chroma 84.2,
  // second only to speed_demon_MYTHIC's tachyon violet among this phase's
  // neighbours. INK GLYPH (relative luminance 0.569) and a dark border.
  // Nearest are podium_finisher_SUPER's gilt laurel at dE00 13.5 and
  // speed_demon_SUPER's electric citron at 13.6 (WARN): the gilt laurel is 25
  // L* darker, and the citron -- the one genuinely close call -- is 15 L*
  // brighter and 20 hue-degrees yellower (a* -40.4 here against -21.6).
  "last_minute_hero_SUPER": { customBg: "linear-gradient(135deg, #a2d824 0%, #4e6a0c 100%)", customShadow: "0 10px 15px -3px rgba(162, 216, 36, 0.35)", customBorder: "2px solid #3f5309", iconColorHex: "#2b3a05", bloomColor: "rgba(162, 216, 36, 0.8)", glitch: true, burst: ["#a2d824", "#6b8f14", "#3f5309"] },
  // LEGENDARY -- SCORCHED GOLD. Fire seen through its own smoke: the hue of a
  // blaze with the lightness taken out of it. L* 40.9 against SUPER's 80.1,
  // which is what makes "the flash" and "the fire" different events rather than
  // two brightnesses of one. Nearest are early_bird_BASE's antique bronze and
  // underdog_LEGENDARY's granite moss, both at 16.2 -- the bronze is far redder
  // (a* +12.4 against -10.8), the moss is a third the chroma.
  "last_minute_hero_LEGENDARY": { customBg: "linear-gradient(135deg, #646400 0%, #2b2b00 100%)", customShadow: "0 10px 15px -3px rgba(100, 100, 0, 0.45)", customBorder: "4px solid #dcd857", iconColorHex: "#fbfbe4", bloomColor: "rgba(100, 100, 0, 0.9)", glitch: true, burst: ["#646400", "#3a3a00", "#dcd857", "#ffffff"] },
  // MYTHIC -- ECLIPSE PLUM. The deadline itself: dark before light. Chroma 17.7
  // makes this the quietest card in the phase, and that is deliberate -- an
  // eclipse is defined by what it takes AWAY, and the multi-stop gradient's
  // white blowout is the corona. Nearest are comeback_kid_BASE's ember rust at
  // dE00 14.1 and polymath_BASE's lapis ink at 14.4 (WARN): the rust is warm
  // (b* +12.2 against -2.8) and the lapis is 12 L* brighter and violet-shifted.
  // ICON-CONTRAST FIX (2026-07-29): iconColorHex was #fbf0f5 (near-white)
  // against this gradient's near-white center (#f6e6ee at 42%), contrast
  // 1.06. Fixed to #331d28, the gradient's own 74% stop (deep wine), which
  // sits closer to where a centered icon actually renders than the even
  // darker 100% stop. New contrast: 11.9 against the 35-65% span.
  "last_minute_hero_MYTHIC": { customBg: "linear-gradient(125deg, #694655 0%, #b98aa0 24%, #f6e6ee 42%, #331d28 74%, #120810 100%)", customShadow: "0 10px 40px -3px rgba(105, 70, 85, 0.6)", customBorder: "4px solid rgba(246, 230, 238, 0.9)", iconColorHex: "#331d28", bloomColor: "rgba(185, 138, 160, 0.95)", glitch: true, burst: ["#694655", "#b98aa0", "#f6e6ee", "#ffffff"] },

  // --- Section Specialist ----------------------------------------------
  // 100% on every question of one concept, N times over. Precision mastery of a
  // single domain, read as a data structure lighting up: a dim terminal, a
  // grid, a matrix, a nexus. The family is green-cyan on purpose -- phosphor,
  // not foliage -- and it is the last family in the catalogue that could still
  // fit there, which is why podium_finisher (laurel, the other green family) is
  // its nearest neighbour three separate times below.
  //
  // BASE -- DIM PHOSPHOR. One node, barely lit. Nearest are
  // perfectionist_BASE's jade at dE00 13.9 and podium_finisher_BASE's pale
  // laurel at 14.1 (WARN): the jade is far more saturated and blue-shifted
  // (b* +11.8 against +23.6), the pale laurel is 13 L* brighter at half the
  // chroma. A lit cell, an unlit stone, and a leaf.
  "section_specialist_BASE": { customBg: "linear-gradient(135deg, #7daa73 0%, #3b5535 100%)", customShadow: "0 10px 15px -3px rgba(125, 170, 115, 0.2)", customBorder: "none", iconColorHex: "#f4faf2", bloomColor: "rgba(125, 170, 115, 0.6)", glitch: false, burst: ["#7daa73", "#3b5535", "#1e2c1a"] },
  // SUPER -- GRID CYAN-GREEN. The lattice comes up. The family's in-family
  // BASE->SUPER step is 15.8 dE00 -- the second-tightest in this phase -- and
  // is carried by hue plus lightness together: b* +23.6 (a warm green) against
  // -0.7 (a true blue-green), across 8 L*. INK GLYPH: relative luminance 0.453,
  // just over the line, exactly like unstoppable_streak_MYTHIC's 0.470.
  "section_specialist_SUPER": { customBg: "linear-gradient(135deg, #87beb4 0%, #2f504a 100%)", customShadow: "0 10px 15px -3px rgba(135, 190, 180, 0.35)", customBorder: "2px solid #163832", iconColorHex: "#0f2b26", bloomColor: "rgba(135, 190, 180, 0.8)", glitch: true, burst: ["#87beb4", "#3f6660", "#12332d"] },
  // LEGENDARY -- MATRIX GREEN. Chroma 69.5, the family's saturation ceiling and
  // the tier where the structure stops having holes in it. Nearest is its own
  // BASE at 15.4 (a 34-unit chroma step) and podium_finisher_SUPER's gilt
  // laurel at 15.6, cleared on hue -- a* -53.4 here against -25.4, i.e. a true
  // green against a chartreuse.
  "section_specialist_LEGENDARY": { customBg: "linear-gradient(135deg, #0f9128 0%, #054a13 100%)", customShadow: "0 10px 15px -3px rgba(15, 145, 40, 0.45)", customBorder: "4px solid #a8f3b8", iconColorHex: "#eefdf1", bloomColor: "rgba(15, 145, 40, 0.9)", glitch: true, burst: ["#0f9128", "#075c19", "#a8f3b8", "#ffffff"] },
  // MYTHIC -- NEXUS WHITE. L* 97.4, the brightest card in the entire catalogue,
  // ahead of podium_finisher_MYTHIC's immortal laurel (95.2) and
  // perfectionist_MYTHIC's opal pearl (96.7). Fifty sections is a network that
  // has stopped being a diagram and become a light source. INK GLYPH (relative
  // luminance 0.935) + dark border -- nothing pale survives here. Nearest are
  // sharpshooter_LEGENDARY's ice at 14.2 and podium_finisher_BASE's pale laurel
  // at 14.5 (WARN): the ice is 5 L* darker at three times the chroma (44.7 vs
  // 14.8), the laurel 19 L* darker.
  "section_specialist_MYTHIC": { customBg: "linear-gradient(125deg, #e1ffeb 0%, #f2fff7 22%, #ffffff 40%, #3f9a63 72%, #113322 100%)", customShadow: "0 10px 40px -3px rgba(225, 255, 235, 0.6)", customBorder: "4px solid rgba(17, 51, 34, 0.85)", iconColorHex: "#0d2a1c", bloomColor: "rgba(225, 255, 235, 0.95)", glitch: true, burst: ["#e1ffeb", "#3f9a63", "#f2fff7", "#ffffff"] },

  // ===================================================================
  // REFERENCE BATCH (2026-07-27) -- brand-new codes, purely additive.
  // These two `code` values do not exist in the backend AchievementBadge
  // table yet -- staged ahead of the next badge-build phase (the temporary
  // /dev/badge-preview harness that used to exercise them was deleted
  // 2026-07-28 as part of shipping the existing-30 elevation; these config
  // entries themselves are left in place since they're real work product,
  // not dev-only scaffolding).
  // ===================================================================

  // Level Mastery -- its own visual axis (architectural, per-level shapes),
  // kept deliberately outside every skill-badge palette so a level badge can
  // never read as a reskinned skill badge. The reference-batch demo entry
  // that used to sit here ("level_mastery_intermediate_1_LEGENDARY") never
  // matched a real backend code and is superseded by the real Level Mastery
  // build starting below (real codes: level_mastery_{level_code}, derived
  // dynamically from the live Level table -- see seed_badges() in
  // backend/app/services/achievements.py).

  // ===================================================================
  // PHASE 3 (2026-07-29) -- Level Mastery, real badges, built in small
  // batches per Shailesh's request (batch N reviewed live before batch N+1
  // starts). Batch 1: BM-L1 (Bridge module, 1 level -- teal->violet
  // "crossing" identity, distinct from every skill-badge palette and from
  // IM's indigo-emerald). Same icon shape across all 3 tiers (per-LEVEL
  // shapes, not per-tier -- Shailesh's explicit call); tier is expressed
  // entirely through color richness + the environment/cutscene escalation.
  // ===================================================================
  // burst[0] is this project's "primary swatch" convention (verified against
  // verify-badge-colour-distinctness.mjs, not eyeballed). First draft of
  // this family used teal->violet, which measured 8 real FAILs against the
  // existing 61-colour palette (closest: polymath_MYTHIC vs LEGENDARY at
  // dE00 3.0 -- effectively the same chip). That whole hue register turned
  // out to be saturated across the catalogue already (teal/cyan/blue: speed
  // demon, competitor, veteran, iron_wall, unstoppable_streak, marathoner,
  // section_specialist all live there). Re-picked via an actual constrained
  // search against all 61 existing primaries (not eyeballed) -- landed on a
  // "twilight crossing" register instead: deep plum (BASE, dusk begins) ->
  // rich magenta (SUPER, deep twilight) -> pale dusty rose (LEGENDARY, dawn
  // light on the far bank -- apex-tier high-key motif, same pattern as this
  // palette's other pale LEGENDARY/MYTHIC tiers). Every pair clears dE00>=12
  // against the whole existing palette (worst: 12.4, comeback_kid_LEGENDARY)
  // and the 3 tiers clear each other by 29-54 dE00.
  "level_mastery_bm_l1_BASE": { customBg: "linear-gradient(to bottom right, #3f0a1e, #1a0a12)", customShadow: "0 8px 20px -4px rgba(89, 13, 43, 0.4)", customBorder: "3px solid #9d2955", iconColorHex: "#fce7ef", bloomColor: "rgba(89, 13, 43, 0.55)", glitch: false, burst: ["#590d2b", "#1a0a12", "#9d2955", "#ffffff"] },
  "level_mastery_bm_l1_SUPER": { customBg: "linear-gradient(to bottom right, #7d0f66, #2d0a24)", customShadow: "0 10px 24px -4px rgba(207, 23, 170, 0.5)", customBorder: "4px solid #ec6fd1", iconColorHex: "#fdf4fb", bloomColor: "rgba(207, 23, 170, 0.75)", glitch: false, burst: ["#cf17aa", "#2d0a24", "#f0a4e0", "#ffffff"] },
  "level_mastery_bm_l1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #b9564a, #590d2b)", customShadow: "0 12px 30px -4px rgba(223, 166, 159, 0.55)", customBorder: "4px solid #f3d4ce", iconColorHex: "#ffffff", bloomColor: "rgba(223, 166, 159, 0.9)", glitch: false, burst: ["#dfa69f", "#590d2b", "#f3d4ce", "#ffffff"] },

  // PHASE 3, Batch 2 (2026-07-29) -- Level Mastery, MM-L1. "Ascent into the
  // night sky": obsidian/indigo night (BASE) -> royal sapphire climb (SUPER)
  // -> pale frost/starlight summit (LEGENDARY). Deliberately a different hue
  // family and structural motif from BM-L1's magenta arch/bridge -- MM is
  // the capstone module every student path ends in (IM -> MM, always).
  // burst[0] is the primary swatch checked by verify-badge-colour-distinctness.mjs.
  "level_mastery_mm_l1_BASE": { customBg: "linear-gradient(to bottom right, #100637, #05020f)", customShadow: "0 8px 20px -4px rgba(37, 20, 110, 0.45)", customBorder: "3px solid #4a3399", iconColorHex: "#e8e6fb", bloomColor: "rgba(37, 20, 110, 0.55)", glitch: false, burst: ["#100637", "#05020f", "#4a3399", "#ffffff"] },
  "level_mastery_mm_l1_SUPER": { customBg: "linear-gradient(to bottom right, #4b4ec4, #201f5e)", customShadow: "0 10px 24px -4px rgba(117, 120, 215, 0.5)", customBorder: "4px solid #a5a8ec", iconColorHex: "#fbfbff", bloomColor: "rgba(117, 120, 215, 0.75)", glitch: false, burst: ["#7578d7", "#201f5e", "#b3b6f0", "#ffffff"] },
  "level_mastery_mm_l1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #3a5560, #0d1418)", customShadow: "0 12px 30px -4px rgba(169, 190, 198, 0.55)", customBorder: "4px solid #a9bec6", iconColorHex: "#ffffff", bloomColor: "rgba(169, 190, 198, 0.9)", glitch: false, burst: ["#a9bec6", "#0d1418", "#d7e4e8", "#ffffff"] },

  // PHASE 3, Batch 3 (2026-07-29) -- Level Mastery, YLM-L1/L2/L3. "Seed ->
  // sprout -> blossom": YLM is the very first module in every student path.
  // L1 rust-to-gold "first light", L2 teal-cyan "clear water", L3 orchid-
  // magenta "full bloom" -- 3 hue families, none overlapping BM's magenta/
  // plum/rose or MM's indigo/sapphire/frost. Colors found via a scripted
  // constrained search against the real existing palette (67 colors incl.
  // BM-L1/MM-L1) -- the mid/high-lightness bands turned out to be dense
  // across nearly the whole hue wheel. First pass (dE00-only search) placed
  // 5 of the 9 in territory that the real script's HSL-triple-near
  // heuristic (hue/sat/light all simultaneously close to an existing badge)
  // escalated to FAIL despite clearing the raw 12.0 dE00 floor -- caught
  // only by actually running `node scripts/verify-badge-colour-
  // distinctness.mjs`, not the scratch re-implementation, which only
  // checked raw dE00. Re-searched those 5 with the same HSL-suspect rule
  // added as a hard filter (not just dE00); L1's BASE also could not find
  // any safe candidate anywhere in the 30-80deg amber/gold band at dark
  // lightness (every point there is HSL-close to some existing dark BASE
  // tier), so it shifted to a rust/burnt-umber dark tone at ~12deg instead
  // -- still reads as "dark soil", just warmer-red than gold. Verified via
  // the real script after the fix: 0 FAIL. burst[0] is the primary swatch.
  "level_mastery_ylm_l1_BASE": { customBg: "linear-gradient(to bottom right, #350d03, #180601)", customShadow: "0 8px 20px -4px rgba(90, 30, 8, 0.4)", customBorder: "3px solid #7a2c0c", iconColorHex: "#fbe4d9", bloomColor: "rgba(90, 30, 8, 0.55)", glitch: false, burst: ["#350d03", "#180601", "#7a2c0c", "#ffffff"] },
  // PHASE 3, Batch 4 (2026-07-30) -- Level Mastery, PM-L1/L2/L3/L4
  // Tier escalations mapped properly (border thickness, shadow spread, glow intensity, and gradient history)
"level_mastery_pm_l1_BASE": { customBg: "linear-gradient(to bottom right, #ff3a19, #111)", customShadow: "0 8px 20px -4px #ff3a1988", customBorder: "3px solid #ff3a19", iconColorHex: "#fff", bloomColor: "rgba(255, 58, 25, 0.55)", glitch: false, burst: ["#ff3a19", "#111", "#ff3a19", "#fff"] },
  "level_mastery_pm_l1_SUPER": { customBg: "linear-gradient(to bottom right, #df2946, #111)", customShadow: "0 10px 24px -4px #df294688", customBorder: "4px solid #df2946", iconColorHex: "#fff", bloomColor: "rgba(223, 41, 70, 0.75)", glitch: false, burst: ["#df2946", "#111", "#df2946", "#fff"] },
  "level_mastery_pm_l1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #02b804, #111)", customShadow: "0 12px 30px -4px #02b80488", customBorder: "4px solid #02b804", iconColorHex: "#fff", bloomColor: "rgba(2, 184, 4, 0.9)", glitch: false, burst: ["#02b804", "#111", "#02b804", "#fff"] },
  "level_mastery_pm_l2_BASE": { customBg: "linear-gradient(to bottom right, #0c8281, #111)", customShadow: "0 8px 20px -4px #0c828188", customBorder: "3px solid #0c8281", iconColorHex: "#fff", bloomColor: "rgba(12, 130, 129, 0.55)", glitch: false, burst: ["#0c8281", "#111", "#0c8281", "#fff"] },
  "level_mastery_pm_l2_SUPER": { customBg: "linear-gradient(to bottom right, #aa012d, #111)", customShadow: "0 10px 24px -4px #aa012d88", customBorder: "4px solid #aa012d", iconColorHex: "#fff", bloomColor: "rgba(170, 1, 45, 0.75)", glitch: false, burst: ["#aa012d", "#111", "#aa012d", "#fff"] },
  "level_mastery_pm_l2_LEGENDARY": { customBg: "linear-gradient(to bottom right, #765449, #111)", customShadow: "0 12px 30px -4px #76544988", customBorder: "4px solid #765449", iconColorHex: "#fff", bloomColor: "rgba(118, 84, 73, 0.9)", glitch: false, burst: ["#765449", "#111", "#765449", "#fff"] },
  "level_mastery_pm_l3_BASE": { customBg: "linear-gradient(to bottom right, #ff9c72, #111)", customShadow: "0 8px 20px -4px #ff9c7288", customBorder: "3px solid #ff9c72", iconColorHex: "#fff", bloomColor: "rgba(255, 156, 114, 0.55)", glitch: false, burst: ["#ff9c72", "#111", "#ff9c72", "#fff"] },
  "level_mastery_pm_l3_SUPER": { customBg: "linear-gradient(to bottom right, #052a4f, #111)", customShadow: "0 10px 24px -4px #052a4f88", customBorder: "4px solid #052a4f", iconColorHex: "#fff", bloomColor: "rgba(5, 42, 79, 0.75)", glitch: false, burst: ["#052a4f", "#111", "#052a4f", "#fff"] },
  "level_mastery_pm_l3_LEGENDARY": { customBg: "linear-gradient(to bottom right, #412c5b, #111)", customShadow: "0 12px 30px -4px #412c5b88", customBorder: "4px solid #412c5b", iconColorHex: "#fff", bloomColor: "rgba(65, 44, 91, 0.9)", glitch: false, burst: ["#412c5b", "#111", "#412c5b", "#fff"] },
  "level_mastery_pm_l4_BASE": { customBg: "linear-gradient(to bottom right, #fe7eaa, #111)", customShadow: "0 8px 20px -4px #fe7eaa88", customBorder: "3px solid #fe7eaa", iconColorHex: "#fff", bloomColor: "rgba(254, 126, 170, 0.55)", glitch: false, burst: ["#fe7eaa", "#111", "#fe7eaa", "#fff"] },
  "level_mastery_pm_l4_SUPER": { customBg: "linear-gradient(to bottom right, #044967, #111)", customShadow: "0 10px 24px -4px #04496788", customBorder: "4px solid #044967", iconColorHex: "#fff", bloomColor: "rgba(4, 73, 103, 0.75)", glitch: false, burst: ["#044967", "#111", "#044967", "#fff"] },
  "level_mastery_pm_l4_LEGENDARY": { customBg: "linear-gradient(to bottom right, #514303, #111)", customShadow: "0 12px 30px -4px #51430388", customBorder: "4px solid #514303", iconColorHex: "#fff", bloomColor: "rgba(81, 67, 3, 0.9)", glitch: false, burst: ["#514303", "#111", "#514303", "#fff"] },
  "level_mastery_ylm_l1_SUPER": { customBg: "linear-gradient(to bottom right, #a29c38, #350d03)", customShadow: "0 10px 24px -4px rgba(193, 187, 68, 0.5)", customBorder: "4px solid #ded87f", iconColorHex: "#fffef0", bloomColor: "rgba(193, 187, 68, 0.75)", glitch: false, burst: ["#c1bb44", "#350d03", "#ded87f", "#ffffff"] },
  "level_mastery_ylm_l1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #a08e63, #350d03)", customShadow: "0 12px 30px -4px rgba(206, 183, 133, 0.55)", customBorder: "4px solid #ceb785", iconColorHex: "#ffffff", bloomColor: "rgba(206, 183, 133, 0.9)", glitch: false, burst: ["#ceb785", "#350d03", "#e8dcc0", "#ffffff"] },
  // 2026-08-12: YLM collapsed from 3 levels down to a single YLM-L1 level
  // covering all 32 lessons (matching the BM/MM one-level-per-module
  // pattern) -- the level_mastery_ylm_l2_*/level_mastery_ylm_l3_* visual
  // entries that used to live here were removed along with those levels.

  // Unstoppable Streak, re-elevated as a fire orange -> crimson comet chain.
  // `letterbox: true` is read by BadgeInspectionModal and is scoped to THIS
  // entry on purpose -- making letterboxing a blanket LEGENDARY behaviour
  // would silently re-crop every existing LEGENDARY badge cinematic.
  "unstoppable_streak_chain_LEGENDARY": { customBg: "linear-gradient(to bottom right, #f97316, #7f1d1d)", customShadow: "0 10px 25px -3px rgba(249, 115, 22, 0.45)", customBorder: "4px solid #fed7aa", iconColorHex: "#fff7ed", bloomColor: "rgba(220, 38, 38, 0.9)", glitch: true, letterbox: true, burst: ["#f97316", "#dc2626", "#fed7aa", "#ffffff"] },

  // --- Phase 4: DPS Gamification Overhaul ------------------------------
  // COLOUR AUDIT (2026-08-03): the original 07-31 palette had 8 byte-identical
  // duplicate pairs (dps_midnight/dps_compass/dps_sage were near-total
  // copy-pastes of each other) plus dozens more sub-12 dE00 collisions,
  // confirmed via frontend/scripts/verify-badge-colour-distinctness.mjs.
  // Full 40-colour palette regenerated below using this file's own max-min
  // CIEDE2000 methodology (see scripts/_badge_palette_solver.mjs): every
  // family now keeps one thematic hue lane with real tier-to-tier drift
  // within it, and the 40 colours are verified mutually distinct (worst
  // internal pair dE00 15.99, zero FAILs). Distinctness against the other
  // ~88 existing badges was intentionally NOT chased to a strict pass here
  // -- DPS and non-DPS badges only ever co-occurred in one place (the mock
  // exam leaderboard's topBadges chips), and that leaderboard now excludes
  // DPS badges entirely (see routes_student.py), so cross-category
  // similarity is no longer user-visible. Full before/after numbers in
  // docs/project-memory/DPS_BADGE_COLOR_AUDIT_2026-08-03.md.

  // IRONCLAD DISCIPLINE -- cold steel-blue, forged-under-pressure identity.
  "dps_discipline_BASE": { customBg: "linear-gradient(135deg, #1e4048 0%, #050d0f 100%)", customShadow: "0 10px 15px -3px rgba(30, 64, 72, 0.4)", customBorder: "none", iconColorHex: "#f0f4f4", bloomColor: "rgba(30, 64, 72, 0.6)", glitch: false, burst: ["#1e4048", "#050d0f", "#6b9da8"] },
  "dps_discipline_SUPER": { customBg: "linear-gradient(135deg, #32cef5 0%, #0498bd 45%, #036881 100%)", customShadow: "0 10px 24px -4px rgba(50, 206, 245, 0.6)", customBorder: "2px solid rgba(218, 244, 250, 0.6)", iconColorHex: "#0d2126", bloomColor: "rgba(50, 206, 245, 0.8)", glitch: true, revealPulse: true, burst: ["#32cef5", "#0498bd", "#daf4fa", "#ffffff"] },
  "dps_discipline_LEGENDARY": { customBg: "linear-gradient(135deg, #1c7287 0%, #092c34 40%, #030f11 100%)", customShadow: "0 12px 30px -4px rgba(9, 44, 52, 0.7)", customBorder: "4px solid #7cc3d4", iconColorHex: "#eff4f6", bloomColor: "rgba(28, 114, 135, 0.9)", glitch: true, burst: ["#1c7287", "#092c34", "#7cc3d4", "#ffffff"] },
  "dps_discipline_MYTHIC": { customBg: "linear-gradient(125deg, #8c9dde 0%, #f1f2f9 24%, #ffffff 42%, #3656ce 68%, #27409f 100%)", customShadow: "0 15px 40px -4px rgba(140, 157, 222, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#0d1226", bloomColor: "rgba(140, 157, 222, 1)", glitch: true, burst: ["#8c9dde", "#f1f2f9", "#3656ce", "#ffffff"] },

  // PURE CRYSTAL -- teal/cyan gem identity.
  "dps_crystal_BASE": { customBg: "linear-gradient(135deg, #30a1a1 0%, #165555 100%)", customShadow: "0 10px 15px -3px rgba(48, 161, 161, 0.4)", customBorder: "none", iconColorHex: "#eff5f5", bloomColor: "rgba(48, 161, 161, 0.6)", glitch: false, burst: ["#30a1a1", "#165555", "#a6d8d8"] },
  "dps_crystal_SUPER": { customBg: "linear-gradient(135deg, #0a96d1 0%, #025173 45%, #012737 100%)", customShadow: "0 10px 24px -4px rgba(10, 150, 209, 0.6)", customBorder: "2px solid rgba(152, 214, 241, 0.6)", iconColorHex: "#eef4f6", bloomColor: "rgba(10, 150, 209, 0.8)", glitch: true, revealPulse: true, burst: ["#0a96d1", "#025173", "#98d6f1", "#ffffff"] },
  "dps_crystal_LEGENDARY": { customBg: "linear-gradient(135deg, #0b7a64 0%, #021d18 40%, #011310 100%)", customShadow: "0 12px 30px -4px rgba(2, 29, 24, 0.7)", customBorder: "4px solid #54dfc3", iconColorHex: "#eef6f5", bloomColor: "rgba(11, 122, 100, 0.9)", glitch: true, burst: ["#0b7a64", "#021d18", "#54dfc3", "#ffffff"] },
  "dps_crystal_MYTHIC": { customBg: "linear-gradient(125deg, #22fcfc 0%, #d1fbfb 24%, #ffffff 42%, #00b8b8 68%, #007b7b 100%)", customShadow: "0 15px 40px -4px rgba(34, 252, 252, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#0d2626", bloomColor: "rgba(34, 252, 252, 1)", glitch: true, burst: ["#22fcfc", "#d1fbfb", "#00b8b8", "#ffffff"] },

  // BOUNDLESS TOME -- aged brown-leather identity.
  "dps_tome_BASE": { customBg: "linear-gradient(135deg, #4b331b 0%, #100a05 100%)", customShadow: "0 10px 15px -3px rgba(75, 51, 27, 0.4)", customBorder: "none", iconColorHex: "#f5f2f0", bloomColor: "rgba(75, 51, 27, 0.6)", glitch: false, burst: ["#4b331b", "#100a05", "#af8a64"] },
  "dps_tome_SUPER": { customBg: "linear-gradient(135deg, #f57724 0%, #b04803 45%, #742f02 100%)", customShadow: "0 10px 24px -4px rgba(245, 119, 36, 0.6)", customBorder: "2px solid rgba(248, 223, 206, 0.6)", iconColorHex: "#f6f1ee", bloomColor: "rgba(245, 119, 36, 0.8)", glitch: true, revealPulse: true, burst: ["#f57724", "#b04803", "#f8dfce", "#ffffff"] },
  "dps_tome_LEGENDARY": { customBg: "linear-gradient(135deg, #8c5217 0%, #361f07 40%, #120a02 100%)", customShadow: "0 12px 30px -4px rgba(54, 31, 7, 0.7)", customBorder: "4px solid #d9a977", iconColorHex: "#f6f2ef", bloomColor: "rgba(140, 82, 23, 0.9)", glitch: true, burst: ["#8c5217", "#361f07", "#d9a977", "#ffffff"] },
  "dps_tome_MYTHIC": { customBg: "linear-gradient(125deg, #dead8c 0%, #f9f4f1 24%, #ffffff 42%, #ce7336 68%, #9f5827 100%)", customShadow: "0 15px 40px -4px rgba(222, 173, 140, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#26170d", bloomColor: "rgba(222, 173, 140, 1)", glitch: true, burst: ["#dead8c", "#f9f4f1", "#ce7336", "#ffffff"] },

  // LIGHTNING QUILL -- gold-amber ink identity.
  "dps_quill_BASE": { customBg: "linear-gradient(135deg, #888849 0%, #484823 100%)", customShadow: "0 10px 15px -3px rgba(136, 136, 73, 0.4)", customBorder: "none", iconColorHex: "#f4f4f1", bloomColor: "rgba(136, 136, 73, 0.6)", glitch: false, burst: ["#888849", "#484823", "#c9c9b6"] },
  "dps_quill_SUPER": { customBg: "linear-gradient(135deg, #bdaf2e 0%, #6e6617 45%, #3c370c 100%)", customShadow: "0 10px 24px -4px rgba(189, 175, 46, 0.6)", customBorder: "2px solid rgba(227, 223, 181, 0.6)", iconColorHex: "#f5f5ef", bloomColor: "rgba(189, 175, 46, 0.8)", glitch: true, revealPulse: true, burst: ["#bdaf2e", "#6e6617", "#e3dfb5", "#ffffff"] },
  "dps_quill_LEGENDARY": { customBg: "linear-gradient(135deg, #aa7909 0%, #4b3502 40%, #140e01 100%)", customShadow: "0 12px 30px -4px rgba(75, 53, 2, 0.7)", customBorder: "4px solid #ebc775", iconColorHex: "#f6f4ee", bloomColor: "rgba(170, 121, 9, 0.9)", glitch: true, burst: ["#aa7909", "#4b3502", "#ebc775", "#ffffff"] },
  "dps_quill_MYTHIC": { customBg: "linear-gradient(125deg, #fbb104 0%, #f8e4b5 24%, #ffffff 42%, #996b00 68%, #5c4000 100%)", customShadow: "0 15px 40px -4px rgba(251, 177, 4, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#261f0d", bloomColor: "rgba(251, 177, 4, 1)", glitch: true, burst: ["#fbb104", "#f8e4b5", "#996b00", "#ffffff"] },

  // THE MIDNIGHT OIL -- deep indigo-violet night identity (fully redesigned;
  // was a byte-identical copy of dps_compass/dps_sage before this pass).
  "dps_midnight_BASE": { customBg: "linear-gradient(135deg, #78447e 0%, #3b1e3e 100%)", customShadow: "0 10px 15px -3px rgba(120, 68, 126, 0.4)", customBorder: "none", iconColorHex: "#f3f1f4", bloomColor: "rgba(120, 68, 126, 0.6)", glitch: false, burst: ["#78447e", "#3b1e3e", "#c0adc2"] },
  "dps_midnight_SUPER": { customBg: "linear-gradient(135deg, #d80bef 0%, #830391 45%, #4d0255 100%)", customShadow: "0 10px 24px -4px rgba(216, 11, 239, 0.6)", customBorder: "2px solid rgba(238, 179, 245, 0.6)", iconColorHex: "#f5eef6", bloomColor: "rgba(216, 11, 239, 0.8)", glitch: true, revealPulse: true, burst: ["#d80bef", "#830391", "#eeb3f5", "#ffffff"] },
  "dps_midnight_LEGENDARY": { customBg: "linear-gradient(135deg, #620ce4 0%, #380387 40%, #1f024b 100%)", customShadow: "0 12px 30px -4px rgba(56, 3, 135, 0.7)", customBorder: "4px solid #c7aaf3", iconColorHex: "#f1eef6", bloomColor: "rgba(98, 12, 228, 0.9)", glitch: true, burst: ["#620ce4", "#380387", "#c7aaf3", "#ffffff"] },
  "dps_midnight_MYTHIC": { customBg: "linear-gradient(125deg, #c788e2 0%, #f7f0f9 24%, #ffffff 42%, #a330d4 68%, #7e22a5 100%)", customShadow: "0 15px 40px -4px rgba(199, 136, 226, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#1f0d26", bloomColor: "rgba(199, 136, 226, 1)", glitch: true, burst: ["#c788e2", "#f7f0f9", "#a330d4", "#ffffff"] },

  // THE GOLDEN COMPASS -- antique brass / verdigris patina identity (fully
  // redesigned; was a byte-identical copy of dps_midnight/dps_sage before).
  "dps_compass_BASE": { customBg: "linear-gradient(135deg, #545a1b 0%, #0f1004 100%)", customShadow: "0 10px 15px -3px rgba(84, 90, 27, 0.4)", customBorder: "none", iconColorHex: "#f4f5f0", bloomColor: "rgba(84, 90, 27, 0.6)", glitch: false, burst: ["#545a1b", "#0f1004", "#b4bc67"] },
  "dps_compass_SUPER": { customBg: "linear-gradient(135deg, #e0f524 0%, #9eb003 45%, #687402 100%)", customShadow: "0 10px 24px -4px rgba(224, 245, 36, 0.6)", customBorder: "2px solid rgba(244, 248, 206, 0.6)", iconColorHex: "#24260d", bloomColor: "rgba(224, 245, 36, 0.8)", glitch: true, revealPulse: true, burst: ["#e0f524", "#9eb003", "#f4f8ce", "#ffffff"] },
  "dps_compass_LEGENDARY": { customBg: "linear-gradient(135deg, #2a7e07 0%, #091e01 40%, #061401 100%)", customShadow: "0 12px 30px -4px rgba(9, 30, 1, 0.7)", customBorder: "4px solid #7ae54d", iconColorHex: "#f1f6ee", bloomColor: "rgba(42, 126, 7, 0.9)", glitch: true, burst: ["#2a7e07", "#091e01", "#7ae54d", "#ffffff"] },
  "dps_compass_MYTHIC": { customBg: "linear-gradient(125deg, #71b30f 0%, #c1e986 24%, #ffffff 42%, #365705 68%, #121d02 100%)", customShadow: "0 15px 40px -4px rgba(113, 179, 15, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#1c260d", bloomColor: "rgba(113, 179, 15, 1)", glitch: true, burst: ["#71b30f", "#c1e986", "#365705", "#ffffff"] },

  // SAGE'S EYE -- jade wisdom-green identity (fully redesigned; was a
  // byte-identical copy of dps_midnight/dps_compass before this pass).
  "dps_sage_BASE": { customBg: "linear-gradient(135deg, #1e482f 0%, #050f09 100%)", customShadow: "0 10px 15px -3px rgba(30, 72, 47, 0.4)", customBorder: "none", iconColorHex: "#f0f4f2", bloomColor: "rgba(30, 72, 47, 0.6)", glitch: false, burst: ["#1e482f", "#050f09", "#6ba884"] },
  "dps_sage_SUPER": { customBg: "linear-gradient(135deg, #28a466 0%, #115533 45%, #072214 100%)", customShadow: "0 10px 24px -4px rgba(40, 164, 102, 0.6)", customBorder: "2px solid rgba(158, 219, 189, 0.6)", iconColorHex: "#eff5f2", bloomColor: "rgba(40, 164, 102, 0.8)", glitch: true, revealPulse: true, burst: ["#28a466", "#115533", "#9edbbd", "#ffffff"] },
  "dps_sage_LEGENDARY": { customBg: "linear-gradient(135deg, #0ce4a3 0%, #03875f 40%, #024b35 100%)", customShadow: "0 12px 30px -4px rgba(3, 135, 95, 0.7)", customBorder: "4px solid #aaf3dd", iconColorHex: "#0d261f", bloomColor: "rgba(12, 228, 163, 0.9)", glitch: true, burst: ["#0ce4a3", "#03875f", "#aaf3dd", "#ffffff"] },
  "dps_sage_MYTHIC": { customBg: "linear-gradient(125deg, #04fb1d 0%, #b5f8bc 24%, #ffffff 42%, #00990f 68%, #005c09 100%)", customShadow: "0 15px 40px -4px rgba(4, 251, 29, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#0d260f", bloomColor: "rgba(4, 251, 29, 1)", glitch: true, burst: ["#04fb1d", "#b5f8bc", "#00990f", "#ffffff"] },

  // UNBROKEN CHAIN -- slate-violet forged-link identity.
  "dps_chain_BASE": { customBg: "linear-gradient(135deg, #2d2442 0%, #09070e 100%)", customShadow: "0 10px 15px -3px rgba(45, 36, 66, 0.4)", customBorder: "none", iconColorHex: "#f2f1f4", bloomColor: "rgba(45, 36, 66, 0.6)", glitch: false, burst: ["#2d2442", "#09070e", "#83799b"] },
  "dps_chain_SUPER": { customBg: "linear-gradient(135deg, #7b65d2 0%, #432aa7 45%, #301e76 100%)", customShadow: "0 10px 24px -4px rgba(123, 101, 210, 0.6)", customBorder: "2px solid rgba(239, 237, 247, 0.6)", iconColorHex: "#f1eff5", bloomColor: "rgba(123, 101, 210, 0.8)", glitch: true, revealPulse: true, burst: ["#7b65d2", "#432aa7", "#efedf7", "#ffffff"] },
  "dps_chain_LEGENDARY": { customBg: "linear-gradient(135deg, #07077e 0%, #01011e 40%, #010114 100%)", customShadow: "0 12px 30px -4px rgba(1, 1, 30, 0.7)", customBorder: "4px solid #4d4de5", iconColorHex: "#eeeef6", bloomColor: "rgba(7, 7, 126, 0.9)", glitch: true, burst: ["#07077e", "#01011e", "#4d4de5", "#ffffff"] },
  "dps_chain_MYTHIC": { customBg: "linear-gradient(125deg, #26499c 0%, #97aad8 24%, #ffffff 42%, #10224c 68%, #050b1a 100%)", customShadow: "0 15px 40px -4px rgba(38, 73, 156, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#0d1426", bloomColor: "rgba(38, 73, 156, 1)", glitch: true, burst: ["#26499c", "#97aad8", "#10224c", "#ffffff"] },

  // THE RISING PHOENIX (The Bounce-Back) -- ember red-orange fire identity.
  "dps_phoenix_BASE": { customBg: "linear-gradient(135deg, #4f171d 0%, #100405 100%)", customShadow: "0 10px 15px -3px rgba(79, 23, 29, 0.4)", customBorder: "none", iconColorHex: "#f5eff0", bloomColor: "rgba(79, 23, 29, 0.6)", glitch: false, burst: ["#4f171d", "#100405", "#b95b65"] },
  "dps_phoenix_SUPER": { customBg: "linear-gradient(135deg, #d55360 0%, #a1212e 45%, #6e171f 100%)", customShadow: "0 10px 24px -4px rgba(213, 83, 96, 0.6)", customBorder: "2px solid rgba(244, 225, 227, 0.6)", iconColorHex: "#f5eef0", bloomColor: "rgba(213, 83, 96, 0.8)", glitch: true, revealPulse: true, burst: ["#d55360", "#a1212e", "#f4e1e3", "#ffffff"] },
  "dps_phoenix_LEGENDARY": { customBg: "linear-gradient(135deg, #8d1507 0%, #2d0601 40%, #140200 100%)", customShadow: "0 12px 30px -4px rgba(45, 6, 1, 0.7)", customBorder: "4px solid #e86859", iconColorHex: "#f6efee", bloomColor: "rgba(141, 21, 7, 0.9)", glitch: true, burst: ["#8d1507", "#2d0601", "#e86859", "#ffffff"] },
  "dps_phoenix_MYTHIC": { customBg: "linear-gradient(125deg, #dd2f03 0%, #f5ab98 24%, #ffffff 42%, #7a1900 68%, #3d0c00 100%)", customShadow: "0 15px 40px -4px rgba(221, 47, 3, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#26120d", bloomColor: "rgba(221, 47, 3, 1)", glitch: true, burst: ["#dd2f03", "#f5ab98", "#7a1900", "#ffffff"] },

  // THE MASTER'S ANVIL (Resilience) -- charcoal forge, ember/molten accent tiers.
  "dps_anvil_BASE": { customBg: "linear-gradient(135deg, #161513 0%, #0b0b09 100%)", customShadow: "0 10px 15px -3px rgba(22, 21, 19, 0.4)", customBorder: "none", iconColorHex: "#f3f2f2", bloomColor: "rgba(22, 21, 19, 0.6)", glitch: false, burst: ["#161513", "#0b0b09", "#6d6c69"] },
  "dps_anvil_SUPER": { customBg: "linear-gradient(135deg, #535053 0%, #211c21 45%, #0b0a0b 100%)", customShadow: "0 10px 24px -4px rgba(83, 80, 83, 0.6)", customBorder: "2px solid rgba(170, 166, 170, 0.6)", iconColorHex: "#f2f2f2", bloomColor: "rgba(83, 80, 83, 0.8)", glitch: true, revealPulse: true, burst: ["#535053", "#211c21", "#aaa6aa", "#ffffff"] },
  "dps_anvil_LEGENDARY": { customBg: "linear-gradient(135deg, #a40e4a 0%, #48041f 40%, #130108 100%)", customShadow: "0 12px 30px -4px rgba(72, 4, 31, 0.7)", customBorder: "4px solid #e779a5", iconColorHex: "#f6eef1", bloomColor: "rgba(164, 14, 74, 0.9)", glitch: true, burst: ["#a40e4a", "#48041f", "#e779a5", "#ffffff"] },
  "dps_anvil_MYTHIC": { customBg: "linear-gradient(125deg, #de8ca5 0%, #f9f1f3 24%, #ffffff 42%, #ce3665 68%, #9f274c 100%)", customShadow: "0 15px 40px -4px rgba(222, 140, 165, 0.8)", customBorder: "4px solid rgba(255, 255, 255, 0.9)", iconColorHex: "#260d15", bloomColor: "rgba(222, 140, 165, 1)", glitch: true, burst: ["#de8ca5", "#f9f1f3", "#ce3665", "#ffffff"] },
};

// Fallback Config just in case a badge is missing
export const fallbackBadgeConfig: Record<string, any> = {
  BASE: { unlockedBg: "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/20", iconColor: "text-white", bloomColor: "rgba(148, 163, 184, 0.6)", glitch: false, burst: ["#94a3b8", "#64748b", "#475569"] },
  SUPER: { unlockedBg: "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-500/30 border-2 border-white", iconColor: "text-slate-50", bloomColor: "rgba(100, 116, 139, 0.8)", glitch: true, burst: ["#64748b", "#475569", "#ffffff"] },
  LEGENDARY: { unlockedBg: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/40 border-4 border-slate-300", iconColor: "text-slate-50", bloomColor: "rgba(71, 85, 105, 0.9)", glitch: true, burst: ["#475569", "#334155", "#f1f5f9", "#ffffff"] },
  MYTHIC: { unlockedBg: "bg-gradient-to-br from-fuchsia-500 to-indigo-700 shadow-fuchsia-500/50 border-4 border-white", iconColor: "text-white", bloomColor: "rgba(217, 70, 239, 0.95)", glitch: true, burst: ["#e879f9", "#818cf8", "#f5f3ff", "#ffffff"] },
};

export function getBadgeVisualConfig(code: string | undefined, tier: string | undefined) {
  const configKey = code ? `${code}_${tier}` : "";
  return (
    badgeColorConfig[configKey] ||
    fallbackBadgeConfig[tier as keyof typeof fallbackBadgeConfig] ||
    fallbackBadgeConfig.BASE
  );
}
