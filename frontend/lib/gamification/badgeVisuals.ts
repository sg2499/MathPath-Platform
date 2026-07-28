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
};

export function getBadgeVisualConfig(code: string | undefined, tier: string | undefined) {
  const configKey = code ? `${code}_${tier}` : "";
  return (
    badgeColorConfig[configKey] ||
    fallbackBadgeConfig[tier as keyof typeof fallbackBadgeConfig] ||
    fallbackBadgeConfig.BASE
  );
}
