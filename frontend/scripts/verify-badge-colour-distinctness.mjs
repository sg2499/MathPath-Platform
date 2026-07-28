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
  { key: "level_mastery_intermediate_1_LEGENDARY", name: "Intermediate L1 Perfected", primary: "#6366f1", note: "indigo->emerald" },
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

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const GATED = [...BATCH1_NEW, ...BATCH1_FROZEN, ...REFERENCE_BATCH, ...BATCH2_NEW];
// Both batches count as "newly graded" for gating purposes, so re-running this
// script re-checks batch 1 as well as batch 2 rather than only the latest pass.
const NEW_KEYS = new Set([
  ...BATCH1_NEW.map((e) => e.key),
  ...BATCH2_NEW.map((e) => e.key),
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
console.log("BADGE COLOUR DISTINCTNESS -- all 30 mock-exam badges + 5 reference-batch demos");
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

process.exitCode = fails > 0 ? 1 : 0;
