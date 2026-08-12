/* ==========================================================================
 * BADGE COLOUR DISTINCTNESS VERIFIER
 * --------------------------------------------------------------------------
 * Written 2026-07-27 for the "mock-exam badge elevation, batch 1" pass (the
 * first 15 of the 30 real mock-exam badges).
 *
 * WHY THIS EXISTS
 * The design rule for badge elevation is: every tier of every badge gets its
 * own colour identity -- no two badges may read as "the same thing with
 * different text". That is a perceptual claim, and eyeballing swatches in a
 * code editor is not evidence. This script turns it into a measurement.
 *
 * WHAT IT MEASURES, per unordered pair of badge primary colours:
 *   1. CIEDE2000 (dE00) -- AUTHORITATIVE. The CIE's current perceptual
 *      difference metric, computed through sRGB -> linear -> XYZ (D65) ->
 *      CIELAB. Thresholds:
 *         dE00 < 12  FAIL  -- would read as the same chip
 *         dE00 < 18  WARN  -- separable side by side, risky as isolated chips
 *         dE00 >= 18 PASS
 *   2. HSL deltas       -- hue (wrap-aware), saturation, lightness. ADVISORY.
 *      The project shorthand rule is "suspect if hue within ~20 deg AND
 *      saturation within 0.18 AND lightness within 0.15". It is annotated but
 *      it does NOT by itself fail a pair, because HSL is not a perceptual
 *      space and this run proved it misfires in both directions:
 *
 *        - FALSE POSITIVE, blue region. perfectionist_LEGENDARY #149bf5 vs
 *          speed_demon_BASE #22d3ee trips all three HSL conditions
 *          (dH 16.1, dS 0.06, dL 0.01) yet measures dE00 22.9. Azure and cyan
 *          sit 28 CIELAB b* units apart; the blue arc of the hue wheel is
 *          perceptually EXPANDED relative to its degree count, so 16 degrees
 *          there is a large real difference.
 *        - FALSE POSITIVE, yellow region. speed_demon_SUPER #f2fa05 vs
 *          competitor_LEGENDARY #c19915 trips it too (dH 15.9, dS 0.16,
 *          dL 0.08) and measures dE00 25.6 -- because HSL calls them both
 *          "lightness ~0.46" while their CIELAB L* is 95 vs 65 and their WCAG
 *          relative luminance is 0.85 vs 0.34. HSL L is not lightness.
 *        - FALSE NEGATIVE, green region. The first hand-picked draft of this
 *          palette had vital green at hue 100 and green-flash emerald at hue
 *          132 -- 32 degrees apart, comfortably "passing" the HSL rule -- and
 *          they measured dE00 5.9, i.e. genuinely the same chip. Green is
 *          perceptually COMPRESSED. That collision is the reason this file
 *          exists rather than an eyeball sign-off.
 *
 *      So: dE00 decides, HSL annotates, and a pair is only failed on the HSL
 *      rule when dE00 independently agrees it is close.
 *
 * SCOPE (2026-07-27, extended by the batch-2 pass to cover EVERYTHING):
 *   - the 13 newly graded batch-1 colours + the 2 batch-1 carry-overs
 *   - the 15 newly graded batch-2 colours (comeback_kid, podium_finisher,
 *     sharpshooter, underdog, polymath) -- these used to sit in a CONTEXT_ONLY
 *     set that did not gate anything; that set no longer exists
 *   - perfectionist SUPER + MYTHIC and the 3 reference-batch demos, including
 *     `unstoppable_streak_chain` whose orange-crimson the REAL unstoppable
 *     streak family must not be mistaken for
 *
 * So the comparison set is now every badge colour in the product: 33 distinct
 * primaries across 35 rendered badges (perfectionist SUPER and speed_demon
 * BASE each appear in both the reference batch and a real family).
 *
 * WHAT IS GATED: every pair involving a colour graded by batch 1 or batch 2.
 * The only ungated pairs are frozen-vs-frozen ones that pre-date both passes;
 * they are printed in their own section rather than omitted.
 *
 * RUN:  node scripts/verify-badge-colour-distinctness.mjs
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const rgbToHex = ([r, g, b]) =>
  "#" +
  [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");

/** HSL with h in [0,360), s/l in [0,1]. */
function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return rgb.map((v) => (v + m) * 255);
}

const hsl = (h, s, l) => rgbToHex(hslToRgb(h, s, l));

/** sRGB -> CIELAB (D65, 2 deg observer). */
function rgbToLab([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  // sRGB D65 matrix
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000. Reference implementation (Sharma et al. 2005 formulation). */
function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (bb, aa) => {
    if (aa === 0 && bb === 0) return 0;
    let h = Math.atan2(bb, aa) * deg;
    if (h < 0) h += 360;
    return h;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;

  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else {
    const d = Math.abs(h1p - h2p);
    if (d <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);

  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh)
  );
}

const hueDelta = (h1, h2) => {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
};

// ---------------------------------------------------------------------------
// THE PALETTE UNDER TEST
// ---------------------------------------------------------------------------
// `primary` is the badge's identity colour: it is burst[0] in badgeVisuals.ts,
// which is also what BadgeInspectionModal feeds to the 3D scene lights, the
// ambient particle colour and the star field. It is therefore the single value
// that most determines "what colour is this badge", which makes it the right
// thing to run the distinctness test on.

/**
 * 13 newly graded batch-1 badges.
 *
 * These hexes are not hand-picked. They came out of a constrained max-min
 * CIEDE2000 search (scripts/_badge_palette_solver.mjs, throwaway) that held the
 * 5 already-approved colours below fixed and gave each badge a soft thematic
 * hue/chroma window, then maximised the smallest pairwise perceptual distance
 * across the whole 18-colour set. Hand-picking was tried first and failed here:
 * an eyeballed "vital green at 100 deg vs green-flash emerald at 132 deg" looked
 * 32 degrees apart in HSL and measured dE00 = 5.9, i.e. the same chip. Green is
 * perceptually compressed and hue degrees are not perceptual distance.
 */
const BATCH1_NEW = [
  { key: "perfectionist_BASE",            name: "The Perfectionist",       primary: "#239f82", note: "jade" },
  { key: "perfectionist_LEGENDARY",       name: "Legendary Perfectionist", primary: "#149bf5", note: "azure scan-beam" },
  { key: "speed_demon_SUPER",             name: "Super Speed Demon",       primary: "#f2fa05", note: "electric citron" },
  { key: "speed_demon_LEGENDARY",         name: "Legendary Speed Demon",   primary: "#c11f65", note: "plasma rose" },
  { key: "competitor_BASE",               name: "The Competitor",          primary: "#9591a1", note: "pewter (only near-neutral in the set)" },
  { key: "competitor_SUPER",              name: "Super Competitor",        primary: "#ce0909", note: "signal red" },
  { key: "competitor_LEGENDARY",          name: "Legendary Competitor",    primary: "#c19915", note: "imperial gold" },
  { key: "unstoppable_streak_BASE",       name: "Unstoppable Streak",      primary: "#23339f", note: "cobalt cold-flame" },
  { key: "unstoppable_streak_SUPER",      name: "Super Unstoppable Streak",primary: "#1ae657", note: "vital green" },
  { key: "unstoppable_streak_LEGENDARY",  name: "Legendary Streak",        primary: "#f84fd6", note: "orchid" },
  { key: "early_bird_BASE",               name: "Early Bird",              primary: "#7f5824", note: "antique bronze" },
  { key: "early_bird_SUPER",              name: "Super Early Bird",        primary: "#f6caac", note: "dawn peach (only high-key warm)" },
  { key: "early_bird_LEGENDARY",          name: "Legendary Early Bird",    primary: "#0f626c", note: "blue-hour petrol" },
];

/** Batch-1 badges deliberately LEFT ALONE by this pass. */
const BATCH1_FROZEN = [
  { key: "speed_demon_BASE",  name: "Speed Demon",         primary: "#22d3ee", note: "cyan -- kept from reference batch" },
  { key: "perfectionist_SUPER", name: "Super Perfectionist", primary: "#9b1fd6", note: "amethyst -- frozen by brief" },
];

/** Already-graded reference-batch entries this pass must clear. */
const REFERENCE_BATCH = [
  { key: "perfectionist_MYTHIC",                 name: "Perfectionist (Mythic)",  primary: "#eaf6ff", note: "opal pearl (prismatic)" },
  // "level_mastery_intermediate_1_LEGENDARY" (indigo->emerald demo) removed
  // 2026-07-29 -- its badgeVisuals.ts config entry was deleted, superseded
  // by the real Level Mastery build (level_mastery_{level_code}, see
  // LEVEL_MASTERY_NEW below). IconLevelMonument/EnvLevelMonument components
  // themselves are untouched -- still real reference-batch work product,
  // just no longer wired to a config key that pretends to be a real badge.
  { key: "unstoppable_streak_chain_LEGENDARY",   name: "Unstoppable Streak (demo chain)", primary: "#f97316", note: "orange-crimson fire" },
];

/**
 * 15 newly graded batch-2 badges (2026-07-27). These used to live in a
 * CONTEXT_ONLY set here -- the not-yet-elevated single-hue-per-family ramps
 * (comeback_kid indigo, podium_finisher gold, sharpshooter pink, underdog
 * fuchsia, polymath teal). That set is gone: all 15 are now graded and GATED,
 * so this script covers every badge in the product.
 *
 * These hexes came out of the same constrained max-min CIEDE2000 search, with
 * the 18 colours above held fixed. The problem is materially harder than batch
 * 1's: those 18 already occupy the whole of bright yellow, orange, red, cyan,
 * azure, cobalt, jade, vital green, magenta, orchid, gold, bronze, peach,
 * petrol, pewter and pearl. A free farthest-point search (no thematic
 * constraints at all) puts the ceiling for 15 more colours at dE00 19.08; this
 * palette reaches 18.56 while also keeping every badge inside a hue window its
 * theme can survive. Two family themes moved as a direct result of the
 * measurement rather than of taste -- see the batch-2 block comment in
 * lib/gamification/badgeVisuals.ts for the champagne/platinum and
 * three-cold-colours findings.
 */
const BATCH2_NEW = [
  { key: "comeback_kid_BASE",         name: "The Comeback Kid",         primary: "#6f302a", note: "ember rust" },
  { key: "comeback_kid_SUPER",        name: "Super Comeback Kid",       primary: "#ff606c", note: "vermillion flare" },
  { key: "comeback_kid_LEGENDARY",    name: "Legendary Comeback Kid",   primary: "#ffb7cf", note: "incandescent rose (ink glyph)" },
  { key: "podium_finisher_BASE",      name: "Podium Finisher",          primary: "#bdc6a5", note: "pale laurel (ink glyph)" },
  { key: "podium_finisher_SUPER",     name: "Super Podium Finisher",    primary: "#7ea503", note: "gilt laurel" },
  { key: "podium_finisher_LEGENDARY", name: "The Champion",             primary: "#00600c", note: "imperial laurel" },
  { key: "sharpshooter_BASE",         name: "The Sharpshooter",         primary: "#3f3f51", note: "gunmetal" },
  { key: "sharpshooter_SUPER",        name: "Super Sharpshooter",       primary: "#668d96", note: "steel" },
  { key: "sharpshooter_LEGENDARY",    name: "Legendary Sharpshooter",   primary: "#81ffe1", note: "ice (ink glyph)" },
  { key: "underdog_BASE",             name: "The Underdog",             primary: "#484536", note: "basalt (lowest chroma in the set)" },
  { key: "underdog_SUPER",            name: "Super Underdog",           primary: "#a8876f", note: "weathered tan" },
  { key: "underdog_LEGENDARY",        name: "Legendary Underdog",       primary: "#787e5d", note: "granite moss" },
  { key: "polymath_BASE",             name: "The High Achiever",        primary: "#7e638d", note: "lapis ink" },
  { key: "polymath_SUPER",            name: "Super Achiever",           primary: "#bd9fff", note: "periwinkle" },
  { key: "polymath_LEGENDARY",        name: "Legendary Achiever",       primary: "#6c1260", note: "imperial violet" },
];

/**
 * 9 newly graded PHASE-1 MYTHIC badges (2026-07-28) -- the MYTHIC tier for the
 * 9 skill-badge families that did not already have one. (The 10th,
 * perfectionist_MYTHIC, shipped with the reference batch and is a frozen input
 * here; it stays in REFERENCE_BATCH above and is NOT re-graded.)
 *
 * METHOD INVERTED FROM BATCHES 1 AND 2, and it matters for reading these hexes.
 * Those batches solved for colour and then drew glyphs. Here the hand-drawn
 * MYTHIC glyphs already existed in lib/gamification/badgeGlyphs.tsx with a
 * palette baked into their accent constants (tachyon violet, imperial
 * sapphire, eternal turquoise, singularity rose, summit sky, ...) and with
 * three of the nine annotated "DRAWN FOR A LIGHT CARD". The committed artwork
 * was therefore the fixed input, and each hex below is the best-separated
 * point available inside its own glyph's hue family at the lightness that
 * glyph assumes -- a constrained search, not a free one.
 *
 * WHY THIS SET DOES NOT REACH dE00 18, AND WHY THAT IS NOT A REGRESSION.
 * The gate is now 42 colours. A free farthest-point CIEDE2000 search over the
 * whole colour solid -- 9 points placed anywhere, no thematic constraint at
 * all, holding the existing 33 fixed -- maximises the smallest new distance at
 * dE00 16.06. Batch 1's ">= 18 for every gated pair" is thus arithmetically
 * impossible at this catalogue size for ANY 9 colours, thematic or not, and no
 * choice of hexes here could have produced 0 WARN. This palette reaches 12.50
 * while also respecting the nine glyphs. Every pair still clears the FAIL line
 * (dE00 >= 12, and no pair is simultaneously HSL-triple-near and < 18), which
 * is the property that actually means "these cannot be confused".
 *
 * The WARN band is populated deliberately, and every WARN pair is justified
 * per-entry in the phase-1 MYTHIC block of lib/gamification/badgeVisuals.ts
 * (which axis holds it apart: lightness, chroma, or hue). This follows the
 * precedent batch 2 already set with sharpshooter_SUPER at 18.6 -- name the
 * tight pair, show the axis, do not move the threshold.
 */
const PHASE1_MYTHIC_NEW = [
  { key: "speed_demon_MYTHIC",         name: "Mythic Speed Demon",  primary: "#c83efe", note: "tachyon violet (highest chroma in catalogue)" },
  { key: "competitor_MYTHIC",          name: "Mythic Competitor",   primary: "#1d7aaf", note: "imperial sapphire (stone, not the metal)" },
  { key: "unstoppable_streak_MYTHIC",  name: "Mythic Streak",       primary: "#0ccf98", note: "eternal turquoise (still not fire; 59.1 off the demo chain)" },
  { key: "early_bird_MYTHIC",          name: "Mythic Early Bird",   primary: "#fed671", note: "genesis solar (ink glyph)" },
  { key: "comeback_kid_MYTHIC",        name: "Mythic Comeback Kid", primary: "#b7591a", note: "phoenix ember" },
  { key: "podium_finisher_MYTHIC",     name: "The Immortal",        primary: "#d4ffa4", note: "immortal laurel (ink glyph)" },
  { key: "sharpshooter_MYTHIC",        name: "Mythic Sharpshooter", primary: "#ff2989", note: "singularity rose (family's only warm tier)" },
  { key: "underdog_MYTHIC",            name: "Mythic Underdog",     primary: "#0058bd", note: "summit sky (family's only non-earth tier)" },
  { key: "polymath_MYTHIC",            name: "Mythic Achiever",     primary: "#ded3f8", note: "oracle violet (ink glyph)" },
];

/**
 * 20 newly graded PHASE-2 badges (2026-07-28) -- five BRAND-NEW families
 * (Marathoner, Iron Wall, The Veteran, Last-Minute Hero, Section Specialist),
 * four tiers each. Every one of the 42 colours above is a FIXED INPUT and none
 * of them is re-graded.
 *
 * THE ARITHMETIC, STATED UP FRONT. The gate is now 62 colours. A free
 * farthest-point CIEDE2000 search -- 20 points placed anywhere in sRGB with the
 * existing 42 held fixed, no thematic constraint whatsoever -- maximises the
 * smallest new distance at dE00 13.50 (greedy over a 23k-point grid restricted
 * to CIELAB L* 22..97, i.e. excluding the near-blacks and near-whites that
 * cannot light a 3D scene). This palette lands at 13.46, which is 99.7% of that
 * unconstrained ceiling WHILE ALSO keeping every badge inside a hue window its
 * theme can survive. There is no set of 20 hexes, thematic or not, that could
 * have done materially better, and >= 18 has been arithmetically out of reach
 * since phase 1 (which measured its own ceiling at 16.06 for 9 colours).
 *
 * So: the WARN band is heavily populated by construction, exactly as phase 1
 * documented, and the property that actually matters is the one this palette
 * does hold -- every gated pair clears the FAIL line (dE00 >= 12, and no pair is
 * simultaneously HSL-triple-near and < 18).
 *
 * WHERE THE COLOURS CAME FROM. Seeded from that same free farthest-point run
 * (i.e. from the holes actually left in sRGB), then each seed was assigned to
 * the badge whose theme could justify it, then re-optimised by coordinate
 * ascent inside a per-badge thematic box (max dE00 drift from the seed, plus an
 * L* window set by the card's intended polarity). Two allocations moved during
 * that pass and are worth naming:
 *   * THE AMBER went to last_minute_hero_BASE, not to marathoner_SUPER. Only
 *     two genuinely hot holes were left in the whole catalogue and Last-Minute
 *     Hero is the heat family, so it got first claim; Marathoner's SUPER took
 *     the softer sun-baked ochre above it (L* 71.3 vs 53.5).
 *   * LAST-MINUTE HERO IS NOT FOUR HOT COLOURS, for the same reason batch 2
 *     found "sharpshooter cannot be three cold colours". After signal red,
 *     vermillion, incandescent rose, orange, ember rust, phoenix ember, plasma
 *     rose, singularity rose, dawn peach, citron, gold, genesis solar, bronze
 *     and tan, the warm band is full. The family is therefore struck amber ->
 *     flashbulb lime -> scorched gold -> eclipse plum: a DEADLINE arc (spark,
 *     blown-out flash, fire seen through smoke, and the dark of the deadline
 *     itself) rather than a heat ramp. The brief's own MYTHIC direction --
 *     an eclipse, dark-before-light -- is what made that arc available.
 *
 * IRON WALL is likewise three near-neutrals plus one: brick, quarry stone and
 * limestone are the masonry, and MYTHIC leaves the neutral band for verdigris
 * because the neutral band cannot hold a fourth entry next to pewter, gunmetal
 * and basalt. iron_wall SUPER->LEGENDARY (15.0) and section_specialist
 * BASE->SUPER (15.8) are the two tightest in-family steps here; both are
 * carried by L* (63.0 vs 79.6, and 65.2 vs 73.1) plus chroma.
 */
const PHASE2_NEW = [
  { key: "marathoner_BASE",              name: "Marathoner",                    primary: "#6e6969", note: "trail grey (lowest chroma in the catalogue, C 2.1)" },
  { key: "marathoner_SUPER",             name: "Super Marathoner",              primary: "#e6a055", note: "sun-baked ochre" },
  { key: "marathoner_LEGENDARY",         name: "Legendary Marathoner",          primary: "#a0c8fa", note: "horizon blue (ink glyph)" },
  { key: "marathoner_MYTHIC",            name: "Mythic Marathoner",             primary: "#fff5e1", note: "endless dawn (ink glyph)" },
  { key: "iron_wall_BASE",               name: "Iron Wall",                     primary: "#4b2d0a", note: "fired brick" },
  { key: "iron_wall_SUPER",              name: "Super Iron Wall",               primary: "#999990", note: "quarry stone" },
  { key: "iron_wall_LEGENDARY",          name: "Legendary Iron Wall",           primary: "#cdc3c3", note: "pale limestone (ink glyph)" },
  { key: "iron_wall_MYTHIC",             name: "Mythic Iron Wall",              primary: "#3c735a", note: "verdigris (the family's only non-masonry tier)" },
  { key: "veteran_BASE",                 name: "The Veteran",                   primary: "#233700", note: "olive drab" },
  { key: "veteran_SUPER",                name: "Super Veteran",                 primary: "#a55f5a", note: "campaign crimson (ribbon, not metal)" },
  { key: "veteran_LEGENDARY",            name: "Legendary Veteran",             primary: "#0f4637", note: "regimental bottle green" },
  { key: "veteran_MYTHIC",               name: "Mythic Veteran",                primary: "#b97d9b", note: "honour mauve" },
  { key: "last_minute_hero_BASE",        name: "Last-Minute Hero",              primary: "#b07300", note: "struck amber" },
  { key: "last_minute_hero_SUPER",       name: "Super Last-Minute Hero",        primary: "#a2d824", note: "flashbulb lime (ink glyph)" },
  { key: "last_minute_hero_LEGENDARY",   name: "Legendary Last-Minute Hero",    primary: "#646400", note: "scorched gold (fire through smoke)" },
  { key: "last_minute_hero_MYTHIC",      name: "Mythic Last-Minute Hero",       primary: "#694655", note: "eclipse plum" },
  { key: "section_specialist_BASE",      name: "Section Specialist",            primary: "#7daa73", note: "dim phosphor" },
  { key: "section_specialist_SUPER",     name: "Super Section Specialist",      primary: "#87beb4", note: "grid cyan-green (ink glyph)" },
  { key: "section_specialist_LEGENDARY", name: "Legendary Section Specialist",  primary: "#0f9128", note: "matrix green" },
  { key: "section_specialist_MYTHIC",    name: "Mythic Section Specialist",     primary: "#e1ffeb", note: "nexus white (ink glyph)" },
];

// PHASE 3 (2026-07-29) -- Level Mastery, built in small batches so Shailesh
// can review each one live before the next starts. This array grows with
// each batch (now: BM-L1, MM-L1) rather than being replaced, so re-running
// this script re-checks every prior batch too.
const LEVEL_MASTERY_NEW = [
  { key: "level_mastery_bm_l1_BASE",      name: "BM L1 -- Cleared",   primary: "#590d2b", note: "deep plum (twilight-crossing identity, dusk begins) -- 2nd pick, see badgeVisuals.ts comment for why teal->violet failed" },
  { key: "level_mastery_bm_l1_SUPER",     name: "BM L1 -- Mastered",  primary: "#cf17aa", note: "rich magenta, deep twilight" },
  { key: "level_mastery_bm_l1_LEGENDARY", name: "BM L1 -- Perfected", primary: "#dfa69f", note: "pale dusty rose -- apex-tier high-key jump, same motif as this palette's other LEGENDARY/MYTHIC pastels" },
  { key: "level_mastery_mm_l1_BASE",      name: "MM L1 -- Cleared",   primary: "#100637", note: "obsidian-indigo night -- ascent-into-the-night-sky identity, MM's capstone motif, blue-violet register chosen for breathing room on a saturated wheel" },
  { key: "level_mastery_mm_l1_SUPER",     name: "MM L1 -- Mastered",  primary: "#7578d7", note: "royal sapphire climb, mid-tier" },
  { key: "level_mastery_mm_l1_LEGENDARY", name: "MM L1 -- Perfected", primary: "#a9bec6", note: "pale icy silver-blue frost/starlight summit -- apex-tier high-key jump, same motif as this palette's other LEGENDARY/MYTHIC pastels" },
  { key: "level_mastery_ylm_l1_BASE",      name: "YLM L1 -- Cleared",   primary: "#350d03", note: "dark rust/burnt-umber -- seed/sprout/blossom identity, YLM is the first module in every path; shifted off amber (30-80deg) after the real script's HSL-triple-near check FAILed the first dE00-only pick there -- that whole band had zero safe dark candidates" },
  { key: "level_mastery_ylm_l1_SUPER",     name: "YLM L1 -- Mastered",  primary: "#c1bb44", note: "muted mustard-gold spark" },
  { key: "level_mastery_ylm_l1_LEGENDARY", name: "YLM L1 -- Perfected", primary: "#ceb785", note: "pale warm wheat dawn -- apex-tier high-key jump" },
  // 2026-08-12: YLM collapsed from 3 levels down to a single YLM-L1 level
  // (matching the BM/MM one-level-per-module pattern) -- the ylm_l2/ylm_l3
  // colour entries that used to live here were removed along with those
  // levels and their now-deleted badgeVisuals.ts entries.
  { key: "level_mastery_pm_l1_BASE",      name: "PM L1 -- Cleared",    primary: "#473632", note: "quarry earth" },
  { key: "level_mastery_pm_l1_SUPER",     name: "PM L1 -- Mastered",   primary: "#7f3301", note: "fired clay" },
  { key: "level_mastery_pm_l1_LEGENDARY", name: "PM L1 -- Perfected",  primary: "#d1755a", note: "forge spark" },
  { key: "level_mastery_pm_l2_BASE",      name: "PM L2 -- Cleared",    primary: "#515f5a", note: "basalt pillar" },
  { key: "level_mastery_pm_l2_SUPER",     name: "PM L2 -- Mastered",   primary: "#5e6b87", note: "slate column" },
  { key: "level_mastery_pm_l2_LEGENDARY", name: "PM L2 -- Perfected",  primary: "#3a3bff", note: "lapis lazuli" },
  { key: "level_mastery_pm_l3_BASE",      name: "PM L3 -- Cleared",    primary: "#6a4192", note: "dusk steps" },
  { key: "level_mastery_pm_l3_SUPER",     name: "PM L3 -- Mastered",   primary: "#4a0381", note: "deep royal purple" },
  { key: "level_mastery_pm_l3_LEGENDARY", name: "PM L3 -- Perfected",  primary: "#c0a4c1", note: "pale amethyst" },
  { key: "level_mastery_pm_l4_BASE",      name: "PM L4 -- Cleared",    primary: "#485935", note: "dark bronze" },
  { key: "level_mastery_pm_l4_SUPER",     name: "PM L4 -- Mastered",   primary: "#8b8529", note: "tarnished brass" },
  { key: "level_mastery_pm_l4_LEGENDARY", name: "PM L4 -- Perfected",  primary: "#a2dead", note: "pale verdigris" },
];

// DPS_NEW (2026-08-03) -- full 40-badge repalette of the 10 DPS practice-sheet
// families (Ironclad Discipline, Pure Crystal, Boundless Tome, Lightning
// Quill, The Midnight Oil, The Golden Compass, Sage's Eye, Unbroken Chain,
// The Rising Phoenix, The Master's Anvil). The 07-31 original had 8
// byte-identical duplicate pairs (dps_midnight/dps_compass/dps_sage were
// near-total copy-pastes of each other, plus 2 more exact matches against
// dps_phoenix/dps_chain/dps_crystal/dps_discipline) and dozens more sub-12
// dE00 collisions -- this script was never run against it before it shipped.
// Regenerated via the same max-min CIEDE2000 solver methodology as every
// other batch here (see scripts/_badge_palette_solver.mjs): every family
// keeps one thematic hue lane with real tier-to-tier drift, verified
// mutually distinct (worst DPS-vs-DPS pair dE00 15.99, zero FAILs).
// NOT chased to a strict pass against the other ~88 badges below -- DPS and
// non-DPS badges only ever co-occurred in the mock-exam leaderboard's
// topBadges chips, and that leaderboard now excludes DPS badges entirely
// (backend/app/api/routes_student.py), so cross-category similarity is no
// longer user-visible. Full numbers in
// docs/project-memory/DPS_BADGE_COLOR_AUDIT_2026-08-03.md.
const DPS_NEW = [
  { key: "dps_discipline_BASE",      name: "Ironclad Discipline -- Base",      primary: "#1e4048", note: "cold steel-blue" },
  { key: "dps_discipline_SUPER",     name: "Ironclad Discipline -- Super",     primary: "#32cef5", note: "electric steel-cyan (ink glyph)" },
  { key: "dps_discipline_LEGENDARY", name: "Ironclad Discipline -- Legendary", primary: "#1c7287", note: "deep tempered steel" },
  { key: "dps_discipline_MYTHIC",    name: "Ironclad Discipline -- Mythic",    primary: "#8c9dde", note: "pale periwinkle steel-shine (ink glyph)" },
  { key: "dps_crystal_BASE",         name: "Pure Crystal -- Base",             primary: "#30a1a1", note: "teal gem" },
  { key: "dps_crystal_SUPER",        name: "Pure Crystal -- Super",            primary: "#0a96d1", note: "sapphire facet" },
  { key: "dps_crystal_LEGENDARY",    name: "Pure Crystal -- Legendary",        primary: "#0b7a64", note: "deep emerald-teal" },
  { key: "dps_crystal_MYTHIC",       name: "Pure Crystal -- Mythic",           primary: "#22fcfc", note: "brilliant cyan prism (ink glyph)" },
  { key: "dps_tome_BASE",            name: "Boundless Tome -- Base",           primary: "#4b331b", note: "aged leather brown" },
  { key: "dps_tome_SUPER",           name: "Boundless Tome -- Super",          primary: "#f57724", note: "burning page ember (ink glyph)" },
  { key: "dps_tome_LEGENDARY",       name: "Boundless Tome -- Legendary",      primary: "#8c5217", note: "rich oxblood-brown binding" },
  { key: "dps_tome_MYTHIC",          name: "Boundless Tome -- Mythic",         primary: "#dead8c", note: "sunlit parchment (ink glyph)" },
  { key: "dps_quill_BASE",           name: "Lightning Quill -- Base",          primary: "#888849", note: "faded gold-olive ink" },
  { key: "dps_quill_SUPER",          name: "Lightning Quill -- Super",         primary: "#bdaf2e", note: "bright gold ink (ink glyph)" },
  { key: "dps_quill_LEGENDARY",      name: "Lightning Quill -- Legendary",     primary: "#aa7909", note: "deep amber ink" },
  { key: "dps_quill_MYTHIC",         name: "Lightning Quill -- Mythic",        primary: "#fbb104", note: "radiant gold flourish (ink glyph)" },
  { key: "dps_midnight_BASE",        name: "The Midnight Oil -- Base",         primary: "#78447e", note: "twilight violet (fully redesigned, was a copy of dps_compass/dps_sage)" },
  { key: "dps_midnight_SUPER",       name: "The Midnight Oil -- Super",        primary: "#d80bef", note: "witching-hour magenta (ink glyph)" },
  { key: "dps_midnight_LEGENDARY",   name: "The Midnight Oil -- Legendary",    primary: "#620ce4", note: "deep indigo night" },
  { key: "dps_midnight_MYTHIC",      name: "The Midnight Oil -- Mythic",       primary: "#c788e2", note: "pale cosmic lilac (ink glyph)" },
  { key: "dps_compass_BASE",         name: "The Golden Compass -- Base",       primary: "#545a1b", note: "aged brass (fully redesigned, was a copy of dps_midnight/dps_sage)" },
  { key: "dps_compass_SUPER",        name: "The Golden Compass -- Super",      primary: "#e0f524", note: "verdigris-bright patina (ink glyph)" },
  { key: "dps_compass_LEGENDARY",    name: "The Golden Compass -- Legendary",  primary: "#2a7e07", note: "polished brass-green" },
  { key: "dps_compass_MYTHIC",       name: "The Golden Compass -- Mythic",     primary: "#71b30f", note: "starburst chartreuse (ink glyph)" },
  { key: "dps_sage_BASE",            name: "Sage's Eye -- Base",               primary: "#1e482f", note: "forest jade (fully redesigned, was a copy of dps_midnight/dps_compass)" },
  { key: "dps_sage_SUPER",           name: "Sage's Eye -- Super",              primary: "#28a466", note: "owl-eye emerald (ink glyph)" },
  { key: "dps_sage_LEGENDARY",       name: "Sage's Eye -- Legendary",          primary: "#0ce4a3", note: "luminous jade" },
  { key: "dps_sage_MYTHIC",          name: "Sage's Eye -- Mythic",             primary: "#04fb1d", note: "mystic insight green (ink glyph)" },
  { key: "dps_chain_BASE",           name: "Unbroken Chain -- Base",           primary: "#2d2442", note: "slate-violet forged link" },
  { key: "dps_chain_SUPER",          name: "Unbroken Chain -- Super",          primary: "#7b65d2", note: "bright chain-glint violet (ink glyph)" },
  { key: "dps_chain_LEGENDARY",      name: "Unbroken Chain -- Legendary",      primary: "#07077e", note: "deep cobalt-indigo" },
  { key: "dps_chain_MYTHIC",         name: "Unbroken Chain -- Mythic",         primary: "#26499c", note: "royal chain-blue (ink glyph)" },
  { key: "dps_phoenix_BASE",         name: "The Rising Phoenix -- Base",       primary: "#4f171d", note: "charred ember" },
  { key: "dps_phoenix_SUPER",        name: "The Rising Phoenix -- Super",      primary: "#d55360", note: "living flame red (ink glyph)" },
  { key: "dps_phoenix_LEGENDARY",    name: "The Rising Phoenix -- Legendary",  primary: "#8d1507", note: "deep blood-fire" },
  { key: "dps_phoenix_MYTHIC",       name: "The Rising Phoenix -- Mythic",     primary: "#dd2f03", note: "solar rebirth orange-red (ink glyph)" },
  { key: "dps_anvil_BASE",           name: "The Master's Anvil -- Base",       primary: "#161513", note: "cold charcoal forge" },
  { key: "dps_anvil_SUPER",          name: "The Master's Anvil -- Super",      primary: "#535053", note: "worked steel-grey (ink glyph)" },
  { key: "dps_anvil_LEGENDARY",      name: "The Master's Anvil -- Legendary",  primary: "#a40e4a", note: "quenched ember-red" },
  { key: "dps_anvil_MYTHIC",         name: "The Master's Anvil -- Mythic",     primary: "#de8ca5", note: "molten rose-gold glow (ink glyph)" },
];

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const GATED = [...BATCH1_NEW, ...BATCH1_FROZEN, ...REFERENCE_BATCH, ...BATCH2_NEW, ...PHASE1_MYTHIC_NEW, ...PHASE2_NEW, ...LEVEL_MASTERY_NEW, ...DPS_NEW];
// Both batches count as "newly graded" for gating purposes, so re-running this
// script re-checks batch 1 as well as batch 2 rather than only the latest pass.
const NEW_KEYS = new Set([
  ...BATCH1_NEW.map((e) => e.key),
  ...BATCH2_NEW.map((e) => e.key),
  ...PHASE1_MYTHIC_NEW.map((e) => e.key),
  ...PHASE2_NEW.map((e) => e.key),
  ...LEVEL_MASTERY_NEW.map((e) => e.key),
  ...DPS_NEW.map((e) => e.key),
]);

const decorate = (e) => {
  const rgb = hexToRgb(e.primary);
  const [h, s, l] = rgbToHsl(rgb);
  return { ...e, rgb, h, s, l, lab: rgbToLab(rgb) };
};

const gated = GATED.map(decorate);

const HUE_NEAR = 20;   // degrees
const SAT_NEAR = 0.18;
const LIG_NEAR = 0.15;
const DE_FAIL = 12;
const DE_WARN = 18;

console.log("=".repeat(96));
console.log("BADGE COLOUR DISTINCTNESS -- 15 skill-badge families x up to 4 tiers + 2 demos");
console.log("=".repeat(96));

console.log("\nPALETTE UNDER TEST\n" + "-".repeat(96));
console.log(
  "key".padEnd(44) + "hex".padEnd(10) + "H".padStart(7) + "S".padStart(7) + "hslL".padStart(7) +
  "  |" + "LabL*".padStart(7) + "a*".padStart(7) + "b*".padStart(7) + "   note"
);
for (const e of gated) {
  const tag = NEW_KEYS.has(e.key) ? "" : "  (unchanged)";
  console.log(
    e.key.padEnd(44) +
      e.primary.padEnd(10) +
      e.h.toFixed(1).padStart(7) +
      e.s.toFixed(2).padStart(7) +
      e.l.toFixed(2).padStart(7) +
      "  |" +
      e.lab[0].toFixed(1).padStart(7) +
      e.lab[1].toFixed(1).padStart(7) +
      e.lab[2].toFixed(1).padStart(7) +
      "   " + (e.note || "") + tag
  );
}

let fails = 0;
let warns = 0;
const rows = [];

for (let i = 0; i < gated.length; i++) {
  for (let j = i + 1; j < gated.length; j++) {
    const A = gated[i], B = gated[j];
    // Only pairs that involve at least one NEWLY graded colour are gated. The
    // ungated remainder is exactly the set of FROZEN-vs-FROZEN pairs -- the two
    // batch-1 carry-overs and the three reference-batch demos, all of which
    // were signed off before either mock-exam pass and none of which this work
    // is allowed to change. They are reported separately below rather than
    // silently dropped, so "0 FAIL / 0 WARN" is a claim about the gate and not
    // a claim that every hex in the file is >= 18 apart.
    const involvesNew = NEW_KEYS.has(A.key) || NEW_KEYS.has(B.key);
    if (!involvesNew) continue;

    const dh = hueDelta(A.h, B.h);
    const ds = Math.abs(A.s - B.s);
    const dl = Math.abs(A.l - B.l);
    const de = deltaE2000(A.lab, B.lab);

    // Advisory only -- see the header note on why this misfires in the blue
    // and yellow regions. It can only escalate a pair that dE00 already
    // considers marginal.
    const hslSuspect = dh < HUE_NEAR && ds < SAT_NEAR && dl < LIG_NEAR;
    let verdict = "PASS";
    if (de < DE_FAIL || (hslSuspect && de < DE_WARN)) { verdict = "FAIL"; fails++; }
    else if (de < DE_WARN) { verdict = "WARN"; warns++; }

    rows.push({ A: A.key, B: B.key, dh, ds, dl, de, verdict, hslSuspect });
  }
}

rows.sort((a, b) => a.de - b.de);

console.log("\nPAIRWISE DISTANCES -- every pair involving a newly graded colour");
console.log("(sorted closest-first; dE00 = CIEDE2000)\n" + "-".repeat(96));
console.log(
  "A".padEnd(34) + "B".padEnd(34) + "dHue".padStart(7) + "dSat".padStart(7) + "dLig".padStart(7) + "dE00".padStart(8) + "  verdict"
);
for (const r of rows) {
  console.log(
    r.A.padEnd(34) +
      r.B.padEnd(34) +
      r.dh.toFixed(1).padStart(7) +
      r.ds.toFixed(2).padStart(7) +
      r.dl.toFixed(2).padStart(7) +
      r.de.toFixed(1).padStart(8) +
      "  " + r.verdict +
      (r.hslSuspect ? "  <-- HSL triple-near" : "")
  );
}

console.log("\n" + "-".repeat(96));
console.log(`pairs checked: ${rows.length}   FAIL: ${fails}   WARN: ${warns}`);
console.log(`closest pair: ${rows[0].A} <-> ${rows[0].B}  dE00=${rows[0].de.toFixed(1)}`);
console.log(`smallest hue gap: ${(() => {
  const m = rows.reduce((acc, r) => (r.dh < acc.dh ? r : acc), rows[0]);
  return `${m.A} <-> ${m.B}  dHue=${m.dh.toFixed(1)} (dSat=${m.ds.toFixed(2)}, dLig=${m.dl.toFixed(2)}, dE00=${m.de.toFixed(1)})`;
})()}`);

// Frozen-vs-frozen pairs: not gated (nothing in either mock-exam pass may move
// them), but printed so the file never hides a number.
const frozenRows = [];
for (let i = 0; i < gated.length; i++) {
  for (let j = i + 1; j < gated.length; j++) {
    const A = gated[i], B = gated[j];
    if (NEW_KEYS.has(A.key) || NEW_KEYS.has(B.key)) continue;
    frozenRows.push({ A: A.key, B: B.key, de: deltaE2000(A.lab, B.lab) });
  }
}
frozenRows.sort((a, b) => a.de - b.de);
console.log("\nUNGATED (frozen vs frozen) -- pre-dates both mock-exam passes\n" + "-".repeat(96));
for (const r of frozenRows.slice(0, 5)) {
  console.log(r.A.padEnd(44) + r.B.padEnd(44) + r.de.toFixed(1).padStart(8));
}
console.log(
  `${frozenRows.length} ungated pairs; closest = ${frozenRows[0].de.toFixed(1)}` +
    (frozenRows[0].de < DE_WARN
      ? "  <-- below the WARN line, but both colours are frozen inputs to this work"
      : "")
);

console.log("\nGENERATED HEX (paste-ready primaries)\n" + "-".repeat(96));
console.log("-- batch 1 --");
for (const e of BATCH1_NEW.map(decorate)) {
  console.log(`${e.key.padEnd(34)} ${e.primary}   ${e.note}`);
}
console.log("-- batch 2 --");
for (const e of BATCH2_NEW.map(decorate)) {
  console.log(`${e.key.padEnd(34)} ${e.primary}   ${e.note}`);
}
console.log("-- phase-1 mythic --");
for (const e of PHASE1_MYTHIC_NEW.map(decorate)) {
  console.log(`${e.key.padEnd(34)} ${e.primary}   ${e.note}`);
}
console.log("-- phase-2 (5 new families) --");
for (const e of PHASE2_NEW.map(decorate)) {
  console.log(`${e.key.padEnd(34)} ${e.primary}   ${e.note}`);
}

process.exitCode = fails > 0 ? 1 : 0;
