/* Throwaway solver: maximise the minimum CIEDE2000 across the badge palette,
 * holding the 5 already-approved colours fixed. Not shipped. */
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../frontend/scripts/verify-badge-colour-distinctness.mjs", import.meta.url),
  "utf8"
);
// reuse the maths from the verifier by eval-ing its pure functions
const pick = (name) => {
  const i = src.indexOf(`function ${name}`);
  if (i < 0) throw new Error(name);
  let depth = 0, j = src.indexOf("{", i);
  const start = i;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
};
const arrow = (name) => {
  const i = src.indexOf(`const ${name} =`);
  const end = src.indexOf("\n};", i) >= 0 && src.indexOf("\n};", i) < src.indexOf("\n\n", i)
    ? src.indexOf("\n};", i) + 3 : src.indexOf(";\n", i) + 1;
  return src.slice(i, end);
};
const mod = await import("data:text/javascript," + encodeURIComponent(
  [arrow("hexToRgb"), arrow("rgbToHex"), pick("rgbToHsl"), pick("hslToRgb"), arrow("hsl"), pick("rgbToLab"), pick("deltaE2000")].join("\n") +
  "\nexport {hexToRgb,rgbToHex,rgbToHsl,hslToRgb,hsl,rgbToLab,deltaE2000};"
));
const { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hsl, rgbToLab, deltaE2000 } = mod;

const ANCHORS = ["#22d3ee", "#9b1fd6", "#eaf6ff", "#6366f1", "#f97316"].map((h) => rgbToLab(hexToRgb(h)));

// Soft thematic constraints per slot: [hueRanges|null, sRange, lRange]
const SLOTS = [
  { k: "perfectionist_BASE",           h: [[146, 168]],     s: [0.62, 0.95], l: [0.38, 0.54] }, // jade
  { k: "perfectionist_LEGENDARY",      h: [[204, 228]],     s: [0.68, 0.95], l: [0.44, 0.58] }, // azure scan beam
  { k: "speed_demon_SUPER",            h: [[62, 88]],       s: [0.85, 1.00], l: [0.44, 0.56] }, // acid lime
  { k: "speed_demon_LEGENDARY",        h: [[314, 342]],     s: [0.72, 1.00], l: [0.44, 0.62] }, // plasma magenta
  { k: "competitor_BASE",              h: null,             s: [0.08, 0.24], l: [0.50, 0.68] }, // silver metal
  { k: "competitor_SUPER",             h: [[346, 8]],       s: [0.68, 0.95], l: [0.42, 0.58] }, // signal crimson
  { k: "competitor_LEGENDARY",         h: [[40, 52]],       s: [0.80, 1.00], l: [0.42, 0.56] }, // crown = gold
  { k: "unstoppable_streak_BASE",      h: [[232, 268]],     s: [0.62, 0.95], l: [0.38, 0.54] }, // cold flame
  { k: "unstoppable_streak_SUPER",     h: [[100, 138]],     s: [0.62, 0.95], l: [0.40, 0.58] }, // vital green
  { k: "unstoppable_streak_LEGENDARY", h: [[286, 312]],     s: [0.68, 0.95], l: [0.50, 0.66] }, // orchid
  { k: "early_bird_BASE",              h: [[14, 34]],       s: [0.50, 0.82], l: [0.32, 0.44] }, // bronze / copper
  { k: "early_bird_SUPER",             h: [[20, 50]],       s: [0.78, 1.00], l: [0.74, 0.84] }, // dawn light (high key)
  { k: "early_bird_LEGENDARY",         h: [[176, 198]],     s: [0.75, 1.00], l: [0.24, 0.36] }, // deep "blue hour" petrol
];

const inH = (slot, h) => !slot.h || slot.h.some(([a, b]) => (a <= b ? h >= a && h <= b : h >= a || h <= b));

function candidates(slot) {
  const out = [];
  for (let h = 0; h < 360; h += 2)
    for (let s = 0.08; s <= 1.001; s += 0.04)
      for (let l = 0.24; l <= 0.86; l += 0.02) {
        if (!inH(slot, h)) continue;
        if (s < slot.s[0] || s > slot.s[1]) continue;
        if (l < slot.l[0] || l > slot.l[1]) continue;
        const hex = hsl(h, s, l);
        out.push({ hex, lab: rgbToLab(hexToRgb(hex)) });
      }
  return out;
}

const POOLS = SLOTS.map(candidates);

function minDist(labs) {
  let m = Infinity;
  for (let i = 0; i < labs.length; i++)
    for (let j = i + 1; j < labs.length; j++) m = Math.min(m, deltaE2000(labs[i], labs[j]));
  return m;
}

let best = null;
for (let restart = 0; restart < 8; restart++) {
  let cur = POOLS.map((p) => p[Math.floor(Math.random() * p.length)]);
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    for (let i = 0; i < SLOTS.length; i++) {
      const others = [...ANCHORS, ...cur.filter((_, j) => j !== i).map((c) => c.lab)];
      let bestScore = -1, bestC = cur[i];
      for (const c of POOLS[i]) {
        let m = Infinity;
        for (const o of others) { const d = deltaE2000(c.lab, o); if (d < m) m = d; if (m <= bestScore) break; }
        if (m > bestScore) { bestScore = m; bestC = c; }
      }
      if (bestC.hex !== cur[i].hex) { cur[i] = bestC; improved = true; }
    }
    if (!improved) break;
  }
  const score = minDist([...ANCHORS, ...cur.map((c) => c.lab)]);
  if (!best || score > best.score) best = { score, cur: cur.map((c) => c.hex) };
  process.stderr.write(`restart ${restart}: minDE=${score.toFixed(2)}\n`);
}

console.log(`\nBEST min dE00 across all 18 = ${best.score.toFixed(2)}\n`);
{
  const names = ["ANCHOR:speed_demon_BASE", "ANCHOR:perfectionist_SUPER", "ANCHOR:perfectionist_MYTHIC", "ANCHOR:level_mastery", "ANCHOR:streak_chain_demo", ...SLOTS.map((s) => s.k)];
  const labs = [...ANCHORS, ...best.cur.map((h) => rgbToLab(hexToRgb(h)))];
  const pairs = [];
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) pairs.push([deltaE2000(labs[i], labs[j]), names[i], names[j]]);
  pairs.sort((a, b) => a[0] - b[0]);
  console.log("tightest 8 pairs:");
  for (const [d, a, b] of pairs.slice(0, 8)) console.log("   " + d.toFixed(2).padStart(6) + "  " + a + "  <->  " + b);
  console.log("");
}
for (let i = 0; i < SLOTS.length; i++) {
  const [h, s, l] = rgbToHsl(hexToRgb(best.cur[i]));
  console.log(
    SLOTS[i].k.padEnd(34) + best.cur[i] + "   hsl(" +
    h.toFixed(0).padStart(3) + ", " + (s * 100).toFixed(0).padStart(3) + "%, " + (l * 100).toFixed(0).padStart(3) + "%)"
  );
}
