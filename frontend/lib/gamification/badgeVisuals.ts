// Shared badge visual config -- extracted 2026-07-25 from
// app/student/achievements/page.tsx so the mock-result page's new in-moment
// badge reveal (Round 1 gamification fix) can render badges with the exact
// same colors/icons/glow as the Trophy Room, instead of duplicating (and
// risking drift from) a second copy of this table. Achievements page now
// imports from here too -- this file is the single source of truth for how
// a badge's code+tier maps to its visual identity.
import {
  referenceBatchGlyphs,
  mockExamBatch1Glyphs,
  mockExamBatch2Glyphs,
  mythicPhase1Glyphs,
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
  "speed_demon_MYTHIC": { customBg: "linear-gradient(125deg, #c83efe 0%, #e79bff 24%, #ffffff 42%, #8a12d8 68%, #2a0350 100%)", customShadow: "0 10px 40px -3px rgba(200, 62, 254, 0.6)", customBorder: "4px solid rgba(240, 179, 255, 0.9)", iconColorHex: "#fdf2ff", bloomColor: "rgba(200, 62, 254, 0.95)", glitch: true, burst: ["#c83efe", "#f0b3ff", "#8a12d8", "#ffffff"] },

  // competitor_MYTHIC -- IMPERIAL SAPPHIRE. The family's LEGENDARY is struck
  // gold, so MYTHIC deliberately does NOT go "more gold": a brighter gold is
  // the exact "same badge, bigger text" failure this catalogue exists to avoid,
  // and it measured inside 12 of competitor_LEGENDARY anyway. The coronation
  // stone instead of the coronation metal -- and it is 56.4 dE00 off its own
  // LEGENDARY, the widest in-family MYTHIC step in this batch.
  // Nearest neighbour is perfectionist_LEGENDARY's azure at dE00 13.1 (WARN):
  // separated on chroma, 36.1 vs 58.6, i.e. a stone versus an instrument beam.
  "competitor_MYTHIC": { customBg: "linear-gradient(125deg, #1d7aaf 0%, #4aa8e8 26%, #d6ecff 46%, #0b4f77 74%, #03243a 100%)", customShadow: "0 10px 40px -3px rgba(29, 122, 175, 0.6)", customBorder: "4px solid rgba(214, 236, 255, 0.9)", iconColorHex: "#eff8ff", bloomColor: "rgba(74, 168, 232, 0.95)", glitch: true, burst: ["#1d7aaf", "#4aa8e8", "#d6ecff", "#ffffff"] },

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
  "comeback_kid_MYTHIC": { customBg: "linear-gradient(125deg, #b7591a 0%, #ff8c3c 26%, #ffb391 46%, #6d230f 76%, #2b0c05 100%)", customShadow: "0 10px 40px -3px rgba(183, 89, 26, 0.6)", customBorder: "4px solid rgba(255, 179, 145, 0.9)", iconColorHex: "#fff3ea", bloomColor: "rgba(255, 140, 60, 0.95)", glitch: true, burst: ["#b7591a", "#ff8c3c", "#ffb391", "#ffffff"] },

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
  "sharpshooter_MYTHIC": { customBg: "linear-gradient(125deg, #ff2989 0%, #ff7bb4 24%, #ffdcea 44%, #7c2748 76%, #2c0a1a 100%)", customShadow: "0 10px 40px -3px rgba(255, 41, 137, 0.6)", customBorder: "4px solid rgba(255, 220, 234, 0.9)", iconColorHex: "#fff0f6", bloomColor: "rgba(255, 41, 137, 0.95)", glitch: true, burst: ["#ff2989", "#ff7bb4", "#ffdcea", "#ffffff"] },

  // underdog_MYTHIC -- SUMMIT SKY. The family is deliberately the earthy one
  // (basalt, weathered tan, granite moss) because it is dirt and rope and rock.
  // MYTHIC is the first tier that LEAVES the ground, so it is the first tier
  // allowed off the earth palette entirely: thin, hard, high-altitude blue. The
  // in-family step is 37.8 / 42.8 / 46.1 dE00 -- nobody will read this as the
  // same badge. Nearest are unstoppable_streak_BASE's cobalt at 12.9 and the
  // level-mastery demo's indigo at 13.4 (WARN): cleared on chroma (61.8 vs
  // 44.9) and on this badge being 10 L* brighter than the cobalt.
  "underdog_MYTHIC": { customBg: "linear-gradient(125deg, #0058bd 0%, #8dbfff 30%, #eef5ff 48%, #16407a 76%, #06172e 100%)", customShadow: "0 10px 40px -3px rgba(0, 88, 189, 0.6)", customBorder: "4px solid rgba(238, 245, 255, 0.9)", iconColorHex: "#f2f7ff", bloomColor: "rgba(141, 191, 255, 0.95)", glitch: true, burst: ["#0058bd", "#8dbfff", "#eef5ff", "#ffffff"] },

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
  // REFERENCE BATCH (2026-07-27) -- brand-new codes, purely additive.
  // These two `code` values do not exist in the backend AchievementBadge
  // table yet -- staged ahead of the next badge-build phase (the temporary
  // /dev/badge-preview harness that used to exercise them was deleted
  // 2026-07-28 as part of shipping the existing-30 elevation; these config
  // entries themselves are left in place since they're real work product,
  // not dev-only scaffolding).
  // ===================================================================

  // Level Mastery -- its own visual axis (deep indigo -> emerald), kept
  // deliberately outside every skill-badge palette so a level badge can
  // never read as a reskinned skill badge. "Perfected" maps to LEGENDARY
  // in the existing tier enum for this preview.
  "level_mastery_intermediate_1_LEGENDARY": { customBg: "linear-gradient(to bottom right, #4338ca, #0f766e)", customShadow: "0 10px 25px -3px rgba(79, 70, 229, 0.45)", customBorder: "4px solid #5eead4", iconColorHex: "#ecfeff", bloomColor: "rgba(67, 56, 202, 0.9)", glitch: false, burst: ["#6366f1", "#14b8a6", "#a5f3fc", "#ffffff"] },

  // Unstoppable Streak, re-elevated as a fire orange -> crimson comet chain.
  // `letterbox: true` is read by BadgeInspectionModal and is scoped to THIS
  // entry on purpose -- making letterboxing a blanket LEGENDARY behaviour
  // would silently re-crop every existing LEGENDARY badge cinematic.
  "unstoppable_streak_chain_LEGENDARY": { customBg: "linear-gradient(to bottom right, #f97316, #7f1d1d)", customShadow: "0 10px 25px -3px rgba(249, 115, 22, 0.45)", customBorder: "4px solid #fed7aa", iconColorHex: "#fff7ed", bloomColor: "rgba(220, 38, 38, 0.9)", glitch: true, letterbox: true, burst: ["#f97316", "#dc2626", "#fed7aa", "#ffffff"] },
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
