// The rank cut scene (2026-10-19, rank revamp Part 2).
//
// The student's own medallion -- the same 3D model as the dashboard stills --
// is forged in front of them: embers gather, the body spins in out of the
// dark, the numeral strikes with a flash and a shockwave, the stones, laurels
// and crest set themselves, a light sweeps across the metal, then the title
// lands below the medallion with the XP and the next step.
//
// Query: tier=BRONZE_III, mode=promo|replay, state=current|passed (replay),
//        xp, start (XP where this division began), next (tier), nextXp,
//        roadmap=0 (hide See Roadmap), motion=reduce, clock=manual (tests:
//        window.__rank.seek(t) renders the exact frame at t seconds).
// Messages to the app: mathpath-cutscene-ready, mathpath-rank-continue,
//        mathpath-rank-roadmap (and mathpath-cutscene-error from rank.html).
import { EffectComposer } from "./vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/postprocessing/OutputPass.js";
import { FXAAPass } from "./vendor/postprocessing/FXAAPass.js";
import { SMAAPass } from "./vendor/postprocessing/SMAAPass.js";

// 2026-10-20 (live fixes): this file is loaded as scene.js?v=<version>; our own
// modules and the music carry the same version, so a browser can never run an
// old medallion.js with a new scene after a deploy (they are cached for a day).
const V = new URL(import.meta.url).search;
const { buildMedallion, makeStudio, parseTier, setSurfaceDetail, THREE } = await import(`./medallion.js${V}`);
const { signature } = await import(`./signature.js${V}`);
const pause = () => new Promise((r) => setTimeout(r, 0));   // let the page breathe between the heavy steps
const TRACE = new URLSearchParams(location.search).get("trace") === "1";
const trace = (what) => { if (TRACE) console.log(`[rank] ${what} ${Math.round(performance.now())}`); };   // ?trace=1: start-up timings in the console
trace("modules");

const Q = new URLSearchParams(window.__rankQuery || location.search);
// A rank family on its own ("GOLD") means its finished medallion (GOLD_I).
const RAW_TIER = (Q.get("tier") || "COPPER_V").toUpperCase();
const TIER = /^(COPPER|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND)$/.test(RAW_TIER) ? `${RAW_TIER}_I` : RAW_TIER;
const MODE = Q.get("mode") === "replay" ? "replay" : "promo";
const STATE = Q.get("state") === "passed" ? "passed" : "current";
const MANUAL = Q.get("clock") === "manual";
const REDUCE = Q.get("motion") === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;
const num = (k) => (Q.get(k) !== null && Q.get(k) !== "" && Number.isFinite(Number(Q.get(k))) ? Number(Q.get(k)) : null);
const XP = num("xp"), START = num("start"), NEXT = (Q.get("next") || "").toUpperCase(), NEXT_XP = num("nextXp");
const { family, numeral } = parseTier(TIER);

// The music starts downloading straight away, alongside everything else.
const MUSIC = MANUAL ? null : fetch(new URL(`./audio/${family}-${MODE}.mp3${V}`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);

const LOOK = {
  COPPER: { name: "Copper", glow: "#ff8a3d", a: "#ffe7d1", b: "#f0a06a", c: "#8a4b22", bg: "#3a1606" },
  BRONZE: { name: "Bronze", glow: "#ffb547", a: "#fff1d6", b: "#e7b061", c: "#7d5320", bg: "#2e1606" },
  SILVER: { name: "Silver", glow: "#7fd6ff", a: "#ffffff", b: "#cfd8e4", c: "#6c7a8c", bg: "#0a1a2e" },
  GOLD: { name: "Gold", glow: "#ffd34d", a: "#fffbe0", b: "#f6c94e", c: "#8f6210", bg: "#2e1d02" },
  PLATINUM: { name: "Platinum", glow: "#b77bff", a: "#ffffff", b: "#e4defa", c: "#7a6aa8", bg: "#1b0a33" },
  EMERALD: { name: "Emerald", glow: "#38e09b", a: "#effff6", b: "#7fe7b5", c: "#0f6a43", bg: "#03251a" },
  DIAMOND: { name: "Diamond", glow: "#9fe3ff", a: "#ffffff", b: "#d9f3ff", c: "#6f9ab8", bg: "#061a33" },
  CHAMPION: { name: "Champion", glow: "#ff2e55", a: "#fff3cc", b: "#f2c24e", c: "#a01030", bg: "#2a0410" },
};
const L = LOOK[family] || LOOK.COPPER;
const root = document.documentElement.style;
root.setProperty("--glow", L.glow); root.setProperty("--metal-a", L.a); root.setProperty("--metal-b", L.b); root.setProperty("--metal-c", L.c);

// ---------------------------------------------------------------------------
// timeline (seconds). A replay is shorter: the embers are already near.
// ---------------------------------------------------------------------------
const K = MODE === "replay" ? 0.62 : 1;
const T = {
  gather: 0, body: 1.0 * K, strike: 2.25 * K, stones: 2.5 * K, laurel: 2.85 * K, crest: 3.3 * K,
  sweep: 3.6 * K, title: 4.3 * K, line: 4.75 * K, xp: 5.1 * K, actions: 5.4 * K,
};
const END = T.actions + 0.6;          // everything is in place
const AUTO_CLOSE = 12;                // seconds on the final card before it closes itself

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, d) => clamp((t - a) / d);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const back = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const bell = (t, at, w) => Math.exp(-Math.pow((t - at) / w, 2));
const hash = (i, k = 0) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

// ---------------------------------------------------------------------------
// renderer, studio, medallion
// ---------------------------------------------------------------------------
// Quality: phones (small screens, weaker GPUs) get 1024 maps and a 512 studio;
// everything else 2048 maps and a 1024 studio. The canvas renders at the
// screen's own pixel density, and at least 1.5x on a 1x screen (supersampling).
// The light version, for weak devices (few cores and little memory, or an
// old or software GPU), draws 1024 maps, a 512 studio, a 1x canvas, 4x MSAA
// and half the particles -- the same scene, kept smooth. ?quality=light|full
// forces either.
const SMALL = Math.min(screen.width, screen.height) < 600;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
const LIGHT = Q.get("quality") === "light" || (Q.get("quality") !== "full" && (() => {
  const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
  let gpu = "";
  try { const gl = renderer.getContext(); const ext = gl.getExtension("WEBGL_debug_renderer_info"); gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ""; } catch (e) { /* unknown GPU */ }
  return (cores <= 4 && mem <= 3) || /swiftshader|llvmpipe|softpipe|mali-[34t]\d\d\b|mali-g(31|51|52)\b|adreno \(tm\) [345]\d\d\b|powervr|sgx|intel\(r\) hd graphics [2-5]\d{2}\b/i.test(gpu);
})());
setSurfaceDetail(Number(Q.get("detail")) || (SMALL || LIGHT ? 1024 : 2048));   // ?detail= is for the test tools (software rendering)
// How sharply it is drawn is not guessed: see QUALITY below, measured on this
// device before the scene starts. ?scale= / ?msaa= (test tools) fix it instead.
const DPR = window.devicePixelRatio || 1;
renderer.setPixelRatio(Number(Q.get("scale")) || Math.min(2, DPR));
document.body.prepend(renderer.domElement);
// No shadow pass: the scene's only shadow-casting light (the key) is off here,
// so a shadow map would cost a full extra render every frame for nothing.
trace("renderer");
await pause();
trace("studio start");
const studio = makeStudio(renderer, { exposure: 1.12, shadows: false, boxes: 0.62, sparkle: 0.08, envSize: Q.get("detail") ? 256 : SMALL || LIGHT ? 512 : 1024 });
const scene = studio.scene;
// The stills are lit for a small picture; in the scene the medallion fills the
// screen, so the key light is eased and only real light sources bloom.
// A direct light on mirror-polished gold or a glossy clearcoat makes one tiny,
// blinding highlight that bloom spreads into a flare; the studio's softboxes
// light the metal here, plus a soft fill and the moving sweep.
studio.lights.key.intensity = 0;
studio.lights.rim.intensity *= 0.35;
studio.lights.fill.intensity *= 1.2;

scene.background = (() => {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 512;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(256, 210, 0, 256, 256, 360);
  grd.addColorStop(0, L.bg); grd.addColorStop(0.55, "#07060a"); grd.addColorStop(1, "#000000");
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const rig = new THREE.Group();          // floats and turns
trace("studio done");
await pause();
const medal = buildMedallion(TIER);
trace("medallion");
rig.add(medal);
scene.add(rig);
const parts = { body: [], numeral: [], stone: [], laurel: [], crest: [], crown: [] };
medal.children.forEach((c) => { const p = c.userData.part; if (parts[p]) parts[p].push(c); });
const rest = new Map(medal.children.map((c) => [c, { p: c.position.clone(), s: c.scale.clone() }]));

// the forge glow behind the medallion
const glowTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,0.45)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: L.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
aura.position.set(0, 0, -1.2); aura.scale.set(6, 6, 1);
rig.add(aura);
const core = new THREE.PointLight(L.glow, 0, 6, 2); core.position.set(0, -0.4, 1.6); rig.add(core);
const sweep = new THREE.DirectionalLight("#ffffff", 0); scene.add(sweep); scene.add(sweep.target);

// shockwave ring
const wave = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { color: { value: new THREE.Color(L.glow) }, alpha: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 color; uniform float alpha; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float band = exp(-pow((r - 0.9) / 0.035, 2.0)) + 0.35 * exp(-pow((r - 0.84) / 0.09, 2.0)); gl_FragColor = vec4(color * 1.6 + 0.3, band * alpha); }",
}));
wave.position.z = 0.5; rig.add(wave);

// the rank's own moment at the strike (signature.js)
await pause();
const sig = signature(family, T, { light: LIGHT, glowTex });
rig.add(sig.group);

// embers: gather to the forge, burst at the strike, then drift
const N = LIGHT ? 450 : 900;
const emberGeo = new THREE.BufferGeometry();
const ePos = new Float32Array(N * 3), eSize = new Float32Array(N), eAlpha = new Float32Array(N);
emberGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
emberGeo.setAttribute("size", new THREE.BufferAttribute(eSize, 1));
emberGeo.setAttribute("alpha", new THREE.BufferAttribute(eAlpha, 1));
const embers = new THREE.Points(emberGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { color: { value: new THREE.Color(L.glow) }, scale: { value: 1 } },
  vertexShader: "attribute float size; attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }",
  fragmentShader: "uniform vec3 color; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(mix(color, vec3(1.0), smoothstep(0.25,0.0,r) * 0.6) * 1.15, a * vA); }",  // kept under the bloom threshold: one ember must never become a flare
}));
rig.add(embers);
const seeds = Array.from({ length: N }, (_, i) => ({
  dir: new THREE.Vector3(hash(i, 1) * 2 - 1, hash(i, 2) * 2 - 1, (hash(i, 3) * 2 - 1) * 0.6).normalize(),
  r0: 5 + hash(i, 4) * 6, spin: (hash(i, 5) - 0.5) * 3, size: 0.035 + Math.pow(hash(i, 6), 3) * 0.09,
  v: 2 + hash(i, 7) * 5, drift: hash(i, 8), ambient: i % 3 === 0, phase: hash(i, 10) * 6.28,
}));
function placeEmbers(t) {
  for (let i = 0; i < N; i++) {
    const s = seeds[i];
    let x, y, z, a, size = s.size;
    if (t < T.strike) {
      const g = easeIn(prog(t, T.gather, T.strike));
      const r = s.r0 * (1 - g) + 0.35 + hash(i, 9) * 0.5 * (1 - g * 0.6);
      // turn around the view axis without allocating (no per-frame garbage)
      const ang = s.spin * g * 2.4 + s.phase, ca = Math.cos(ang), sa = Math.sin(ang);
      x = (s.dir.x * ca - s.dir.y * sa) * r; y = (s.dir.x * sa + s.dir.y * ca) * r; z = s.dir.z * r * 0.5;
      a = clamp(prog(t, T.gather + hash(i, 11) * 0.6, 0.5)) * (0.55 + 0.45 * g);
    } else {
      const dt = t - T.strike;
      const out = 0.4 + s.v * (1 - Math.exp(-dt * 1.8));
      x = s.dir.x * out; y = s.dir.y * out + dt * 0.25 * s.drift; z = s.dir.z * out * 0.4;
      a = Math.exp(-dt * (s.ambient ? 0.25 : 0.9));
      if (s.ambient && dt > 1.5) {  // a slow rising drift that stays
        const k = (dt * (0.12 + s.drift * 0.2) + hash(i, 12)) % 1;
        x = (hash(i, 13) * 2 - 1) * 4.2; y = -2.6 + k * 5.4; z = (hash(i, 14) - 0.5) * 2;
        a = Math.sin(k * Math.PI) * 0.55; size = s.size * 0.8;
      }
    }
    ePos[i * 3] = x; ePos[i * 3 + 1] = y; ePos[i * 3 + 2] = z; eAlpha[i] = a; eSize[i] = size;
  }
  emberGeo.attributes.position.needsUpdate = true; emberGeo.attributes.alpha.needsUpdate = true; emberGeo.attributes.size.needsUpdate = true;
}

// post: bloom
// The bloom pipeline renders into its own buffer, which by default has no
// anti-aliasing: every metal edge stair-stepped. Multisample it (8x where the
// device allows), in half float so highlights keep their range.
const MAX_SAMPLES = renderer.capabilities.maxSamples || 4;
const target = (samples) => new THREE.WebGLRenderTarget(Math.max(1, Math.round(window.innerWidth * renderer.getPixelRatio())), Math.max(1, Math.round(window.innerHeight * renderer.getPixelRatio())), { type: THREE.HalfFloatType, samples: Math.min(samples, MAX_SAMPLES) });
let MSAA = Number(Q.get("msaa")) || 4;
const composer = new EffectComposer(renderer, target(MSAA));
composer.addPass(new RenderPass(scene, camera));
// A tight, gentle bloom: light sources glow without veiling the metal in haze.
// It is soft by nature, so on lighter settings it is worked out at a lower
// resolution (BLOOM_SCALE) -- the glow looks the same and costs a fraction.
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.2, 2.0);  // only real light sources (emissive lines, the strike) bloom, never a bright reflection
let BLOOM_SCALE = 1;
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * BLOOM_SCALE)), Math.max(2, Math.round(h * BLOOM_SCALE)));
let BLOOM_ON = Q.get("bloom") !== "0";
composer.addPass(bloom);
bloom.enabled = BLOOM_ON;
composer.addPass(new OutputPass());
// Edge smoothing that costs far less than multisampling on laptop and phone
// GPUs (where a multisampled half-float buffer is most of the frame): SMAA,
// or the lighter FXAA, after the colours are final.
const smaa = new SMAAPass(); smaa.enabled = false; composer.addPass(smaa);
const fxaa = new FXAAPass(); fxaa.enabled = false; composer.addPass(fxaa);

// ---------------------------------------------------------------------------
// framing: the medallion sits in the upper part, the card below it
// ---------------------------------------------------------------------------
const S = 2.9;                 // medallion size in world units, laurels and crest included
let baseY = 0, viewH = 1;
function fit() {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = aspect;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const portrait = aspect < 0.9;
  // The card's own height decides how much room the medallion gets, so the
  // title, XP and buttons always fit, on a tall phone or a short laptop window.
  const card = document.getElementById("card");
  const kids = [...card.children].filter((e) => !e.hidden);
  const cs = getComputedStyle(card);
  const need = kids.reduce((sum, e) => sum + e.offsetHeight + parseFloat(getComputedStyle(e).marginTop || 0), 0)
    + parseFloat(cs.rowGap || cs.gap || 10) * (kids.length - 1) + parseFloat(cs.paddingBottom || 24);
  const top = Math.max(12, h * 0.03);
  const room = Math.max(h * 0.3, h - need - top - 8);           // height left for the medallion
  const hFrac = Math.min(portrait ? 0.44 : 0.56, (room * 0.94) / h), wFrac = portrait ? 0.86 : 0.62;
  const d = Math.max(S / (hFrac * 2 * tan), S / (wFrac * 2 * tan * aspect));
  camera.position.set(0, 0, d);
  camera.updateProjectionMatrix();
  viewH = 2 * d * tan;
  const centre = (top + room / 2) / h;                          // medallion centre, from the top
  baseY = viewH * (0.5 - centre);
  root.setProperty("--card-top", `${Math.round(((top + room) / h) * 1000) / 10}%`);
  embers.material.uniforms.scale.value = h * renderer.getPixelRatio() * 0.9;
  sig.size(h, aspect, renderer.getPixelRatio());
}
window.addEventListener("resize", () => { fit(); if (MANUAL || paused) draw(now); });

// ---------------------------------------------------------------------------
// the card
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString("en-IN");
const tierName = (k) => { const p = parseTier(k); const n = LOOK[p.family]?.name || p.family; return p.numeral ? `${n} ${p.numeral}` : n; };
// a division passed on the way (Bronze IV, now at Bronze II) reads as that
// division done; the top division of a family (I) means the whole rank is done
const DIVISION_DONE = STATE === "passed" && numeral && numeral !== "I";
$("eyebrow").textContent = MODE === "promo" ? "New Rank Reached" : STATE === "passed" ? (DIVISION_DONE ? "Division Completed" : "Rank Completed") : "Your Rank";
$("title").textContent = L.name;
$("line").textContent = family === "CHAMPION" ? "The highest rank" : DIVISION_DONE ? `Division ${numeral} complete` : numeral && STATE !== "passed" ? `Division ${numeral}` : "All divisions complete";
const showXp = XP !== null && STATE !== "passed";
if (showXp) {
  $("xp").hidden = false;
  $("xpNow").innerHTML = `<b>${fmt(XP)} XP</b>`;
  if (NEXT && NEXT_XP !== null) $("xpNext").textContent = `${fmt(Math.max(0, NEXT_XP - XP))} XP to ${tierName(NEXT)}`;
  else $("xpNext").textContent = "The top of MathPath";
}
const fillTo = showXp && START !== null && NEXT_XP !== null && NEXT_XP > START ? clamp((XP - START) / (NEXT_XP - START)) : 1;
if (Q.get("roadmap") === "0") $("roadmap").hidden = true;
document.title = `${tierName(TIER)} rank`;

function cardAt(t) {
  const show = (el, at, dur = 0.5, rise = 18) => { const p = easeOut(prog(t, at, dur)); el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * rise}px)`; };
  show($("eyebrow"), T.title - 0.2, 0.5, 10);
  const tp = prog(t, T.title, 0.55);
  $("title").style.opacity = easeOut(tp);
  $("title").style.transform = `scale(${1 + (1 - easeOut(tp)) * 0.35})`;
  $("title").style.letterSpacing = `${0.06 + (1 - easeOut(tp)) * 0.3}em`;
  show($("line"), T.line, 0.5, 12);
  show($("xp"), T.xp, 0.5, 12);
  $("xpFill").style.width = `${easeOut(prog(t, T.xp + 0.15, 0.9)) * fillTo * 100}%`;
  show($("actions"), T.actions, 0.45, 10);
  $("actions").style.pointerEvents = t >= T.actions ? "auto" : "none";
  $("skip").hidden = t >= T.actions;
  $("flash").style.opacity = MODE === "promo" ? bell(t, T.strike + 0.02, 0.06) * 0.6 : bell(t, T.strike + 0.02, 0.05) * 0.35;
}

// ---------------------------------------------------------------------------
// one frame at time t
// ---------------------------------------------------------------------------
function show(list, visible) { list.forEach((o) => (o.visible = visible)); }
function draw(t, render = true) {
  // the body spins in out of the dark and settles
  const b = prog(t, T.body, T.strike - T.body);
  rig.scale.setScalar(Math.max(0.0001, back(easeOut(b), 0.9)));
  const idle = Math.max(0, t - END);
  const sweepTurn = Math.sin(prog(t, T.sweep, 1.4) * Math.PI) * 0.42;
  rig.rotation.y = -Math.PI * 1.6 * Math.pow(1 - easeOut(b), 1.4) + sweepTurn + Math.sin(idle * 0.55) * 0.16 * clamp(idle);
  rig.rotation.x = -0.1 + Math.sin(idle * 0.4) * 0.03;
  rig.position.y = baseY + Math.sin(idle * 1.1) * 0.05;

  // the numeral strikes
  const n = prog(t, T.strike - 0.28, 0.28);
  parts.numeral.forEach((o) => { const r = rest.get(o); o.visible = t >= T.strike - 0.28; o.position.set(r.p.x, r.p.y, r.p.z + (1 - easeIn(n)) * 3.2); o.scale.copy(r.s).multiplyScalar(1 + (1 - easeIn(n)) * 1.6); });
  // stones, one after another; laurels grow; the crest drops in
  parts.stone.forEach((o, i) => { const r = rest.get(o); const p = prog(t, T.stones + i * 0.12, 0.3); o.visible = p > 0; o.scale.copy(r.s).multiplyScalar(Math.max(0.0001, back(p, 2.2))); });
  parts.laurel.forEach((o) => { const r = rest.get(o); const p = easeOut(prog(t, T.laurel, 0.65)); o.visible = p > 0; o.scale.set(r.s.x * Math.max(0.0001, p), r.s.y * Math.max(0.0001, p), r.s.z); o.rotation.z = (1 - p) * 0.5; });
  parts.crest.forEach((o) => { const r = rest.get(o); const p = prog(t, T.crest, 0.45); o.visible = p > 0; o.position.set(r.p.x, r.p.y + (1 - back(p, 1.4)) * 1.4, r.p.z); });
  // the Champion's crown comes down onto the crest, and lands with lightning
  parts.crown.forEach((o) => { const r = rest.get(o); const p = prog(t, T.crest - 0.25, 0.55); o.visible = p > 0; o.position.set(r.p.x, r.p.y + (1 - back(p, 1.2)) * 2.2, r.p.z + (1 - easeOut(p)) * 0.6); });

  // light: the forge glow, the strike, the sweep
  const hit = bell(t, T.strike + 0.05, 0.22);
  const heat = easeIn(prog(t, 0.2, T.strike)) * (1 - 0.92 * prog(t, T.strike, 1.2));
  aura.material.opacity = 0.1 + 0.32 * heat + hit * 0.35;
  aura.scale.setScalar(5.5 + hit * 2.5);
  core.intensity = 2.2 * heat + hit * 9;
  const sw = prog(t, T.sweep, 1.3);
  sweep.intensity = Math.sin(sw * Math.PI) * 5;
  sweep.position.set(-8 + sw * 16, 3, 4); sweep.target.position.set(0, baseY, 0);
  bloom.strength = (0.3 + hit * 1.2) * (BLOOM_SCALE < 1 ? 1.3 : 1);   // a lower-resolution bloom spreads thinner: give it back its weight
  const waveP = prog(t, T.strike, 0.9);
  wave.scale.setScalar(0.7 + easeOut(waveP) * 5.5);
  wave.material.uniforms.alpha.value = waveP > 0 && waveP < 1 ? Math.pow(1 - waveP, 1.5) * 0.85 : 0;
  // a short shake at the strike
  const shake = bell(t, T.strike + 0.06, 0.16) * 0.06 * (MODE === "promo" ? 1 : 0.5);
  camera.position.x = Math.sin(t * 91) * shake; camera.position.y = Math.cos(t * 83) * shake;
  camera.lookAt(0, camera.position.y * 0.5, 0);

  placeEmbers(t);
  sig.update(t);
  cardAt(t);
  if (render) composer.render();
}

// ---------------------------------------------------------------------------
// the soundtrack: the rank's own piece (composed for this timeline; replays
// have their own, shorter cut), played through Web Audio so it starts on the
// scene's first frame. It needs a click to have happened -- the student
// clicked to get here -- and when a browser still refuses, the sound button
// shows "off" and one tap starts it in step. The choice is remembered.
// ---------------------------------------------------------------------------
const Sound = (() => {
  const KEY = "mp_rank_sound";
  let wanted = true;
  try { wanted = localStorage.getItem(KEY) !== "off"; } catch (e) { /* storage blocked */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = !MANUAL && AC ? new AC({ latencyHint: "interactive" }) : null;
  let buffer = null, src = null, startedAt = 0, offsetAt = 0, playing = false, startWanted = null;
  let lastFollow = 0;
  const gain = ctx ? ctx.createGain() : null;
  if (gain) { gain.gain.value = 0.85; gain.connect(ctx.destination); }
  // decoded as soon as it arrives; the scene waits for it (briefly) so the
  // picture and the music start together
  const decoded = ctx && MUSIC ? MUSIC.then((b) => (b ? ctx.decodeAudioData(b) : null)).then((b) => { buffer = b; if (b && startWanted !== null && !playing) play(startWanted()); return b; }).catch(() => null) : Promise.resolve(null);
  const btn = document.getElementById("sound");
  const paint = () => { const on = wanted && ctx && ctx.state === "running"; btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.setAttribute("aria-label", on ? "Sound on" : "Sound off"); btn.title = on ? "Sound on" : "Sound off"; };
  if (ctx) {
    // a browser that held the sound back lets it go on the next tap: start in step then
    ctx.onstatechange = () => { paint(); if (ctx.state === "running" && wanted && !playing && startWanted) play(startWanted()); };
    document.addEventListener("pointerdown", () => { if (wanted && ctx.state !== "running") ctx.resume().catch(() => {}); }, true);
  }
  if (!ctx) btn.hidden = true;
  else if (REDUCE) paint();          // reduced motion: no music unless asked for
  function stop() { if (src) { try { src.stop(); } catch (e) { /* already stopped */ } src.disconnect(); src = null; } playing = false; }
  function play(offset) {
    if (!ctx || !buffer || !wanted || offset >= buffer.duration - 0.05) { paint(); return; }
    stop();
    src = ctx.createBufferSource(); src.buffer = buffer; src.connect(gain);
    gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0.85, ctx.currentTime);
    src.start(ctx.currentTime + 0.005, Math.max(0, offset));
    startedAt = ctx.currentTime; offsetAt = offset; playing = true; paint();
  }
  const at = () => (playing ? offsetAt + ctx.currentTime - startedAt : null);
  window.__rankSound = () => ({ state: ctx && ctx.state, wanted, playing, loaded: !!buffer, at: at() });   // for the tests
  // A tab in the background stops drawing; the music waits with it.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (wanted) ctx.resume().catch(() => {});
  });
  return {
    ready: decoded,
    at,
    // start with the clock: clockNow() gives the scene's time when the sound can actually begin
    begin(clockNow) {
      startWanted = clockNow;
      if (!ctx || !wanted) { paint(); return; }
      ctx.resume().catch(() => {});      // may wait for a tap; onstatechange starts the music then
      paint();
      if (ctx.state === "running") play(clockNow());
    },
    seek(t) { if (playing) play(t); },
    // the picture is the clock: if the music has drifted from it (a stalled
    // frame), bring the music back in step
    // (at most once every two seconds, so a struggling device never chops the music up)
    follow(t) { const a = at(); const n = performance.now(); if (a !== null && Math.abs(a - t) > 0.15 && t < buffer.duration - 0.2 && n - lastFollow > 2000) { lastFollow = n; play(t); } },
    fadeOut() { if (ctx && playing) { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(stop, 500); } },
    toggle(clockNow) {
      wanted = !(wanted && ctx && ctx.state === "running");
      try { localStorage.setItem(KEY, wanted ? "on" : "off"); } catch (e) { /* storage blocked */ }
      if (!wanted) { stop(); paint(); return; }
      if (ctx.state === "running") play(clockNow()); else ctx.resume().catch(() => {});
      paint();
    },
  };
})();

// ---------------------------------------------------------------------------
// QUALITY: measured on this device. Each step is drawn at the scene's busiest
// moment (the strike: the flash, the bloom, the moment's particles) and timed
// with the GPU finished; the sharpest one that fits comfortably in a frame is
// kept. It is decided before anything moves, and never changed mid-scene.
// A device that cannot draw even the lightest step smoothly gets the still
// medallion instead of a stuttering scene.
// ---------------------------------------------------------------------------
// ?debug=1: a small readout of the quality chosen and the frames drawn
const DEBUG = Q.get("debug") === "1";
let debugEl = null, dbg = { n: 0, slow: 0, worst: 0, last: 0, sum: 0 };
function debugFrame(ms) {
  if (!debugEl) { debugEl = document.createElement("pre"); debugEl.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9;margin:0;padding:8px 10px;font:12px/1.4 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.7);border-radius:8px;pointer-events:none;white-space:pre"; document.body.appendChild(debugEl); }
  if (dbg.last) { const d = ms - dbg.last; dbg.n++; dbg.sum += d; if (d > 20) dbg.slow++; if (d > dbg.worst && dbg.n > 2) dbg.worst = d; }
  dbg.last = ms;
  if (dbg.n % 10 === 0) debugEl.textContent = `quality ${quality.name} (${quality.ms ?? "-"} ms)  canvas ${renderer.domElement.width}x${renderer.domElement.height}  aa ${AA}${MSAA ? MSAA : ""}  bloom ${BLOOM_SCALE}\ntried: ${TRIALS.join(", ")}\nframes ${dbg.n}  avg ${(dbg.sum / Math.max(1, dbg.n)).toFixed(1)} ms  over 20 ms: ${dbg.slow}  worst ${dbg.worst.toFixed(0)} ms  t ${now.toFixed(2)}`;
}
const SHARP = Math.min(2, DPR);                 // the screen's own pixels
const STEPS = [
  { name: "ultra", pr: Math.min(2, Math.max(DPR, 1.5)), msaa: 4, aa: "msaa", bloom: 1 },
  { name: "high", pr: SHARP, msaa: 4, aa: "msaa", bloom: 1 },
  { name: "sharp-smaa", pr: SHARP, msaa: 0, aa: "smaa", bloom: 0.5 },
  { name: "sharp-fxaa", pr: SHARP, msaa: 0, aa: "fxaa", bloom: 0.5 },
  { name: "mid", pr: Math.min(1.5, DPR), msaa: 0, aa: "fxaa", bloom: 0.5 },
  { name: "low", pr: Math.min(1, DPR), msaa: 0, aa: "fxaa", bloom: 0.5 },
  { name: "lower", pr: Math.min(1, DPR) * 0.85, msaa: 0, aa: "fxaa", bloom: 0.35 },
  { name: "lowest", pr: Math.min(1, DPR) * 0.7, msaa: 0, aa: "fxaa", bloom: 0.35 },
].filter((st, i, all) => i === 0 || all.slice(0, i).every((o) => o.pr !== st.pr || o.aa !== st.aa || o.bloom !== st.bloom));   // on a 1x screen some steps are the same
const BUDGET_MS = 12;        // timed at the busiest moment with the GPU forced to finish: real frames run lighter than this (60 fps is 16.7 ms)
const QUALITY_KEY = `mp_rank_quality_v2:${innerWidth}x${innerHeight}@${DPR}`;
let quality = { name: "fixed", ms: null };
let AA = "msaa";
const TRIALS = [];
function applyStep(st) {
  renderer.setPixelRatio(st.pr);
  composer.setPixelRatio(st.pr);
  MSAA = st.msaa; BLOOM_SCALE = st.bloom; AA = st.aa;
  smaa.enabled = st.aa === "smaa"; fxaa.enabled = st.aa === "fxaa";
  composer.reset(target(MSAA));
  fit();
}
const px = new Uint8Array(4);
function timeStep() {
  const gl = renderer.getContext();
  const busy = T.strike + 0.08;
  draw(busy); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);      // first draw at a new size sets things up: not timed
  let total = 0;
  for (let i = 0; i < 3; i++) { const a = performance.now(); draw(busy + i * 0.03); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); total += performance.now() - a; }
  TRIALS.push(`${STEPS.find((st) => st.pr === renderer.getPixelRatio() && st.aa === AA && st.bloom === BLOOM_SCALE)?.name || "?"} ${(total / 3).toFixed(1)}`);
  return total / 3;
}
async function chooseQuality() {
  if (Q.get("scale") || Q.get("msaa")) return { name: "fixed", ms: null };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(QUALITY_KEY) || "null"); } catch (e) { /* storage blocked */ }
  if (DEBUG) {
    saved = null;
    // ?debug=1: time every step on this device, for the record
    for (const st of STEPS) { applyStep(st); await pause(); timeStep(); }
    TRIALS.push("|");
  }
  let from = 1;
  if (saved && Number.isInteger(saved.step)) from = Math.max(0, Math.min(STEPS.length - 1, saved.step));
  let chosen = null;
  for (let i = from; i < STEPS.length; i++) {
    applyStep(STEPS[i]);
    await pause();
    const ms = timeStep();
    if (ms <= BUDGET_MS) {
      chosen = { step: i, ms };
      // plenty of room: try one step sharper (once)
      if (i > 0 && ms < BUDGET_MS * 0.42 && from === i) {
        applyStep(STEPS[i - 1]); await pause();
        const up = timeStep();
        if (up <= BUDGET_MS) chosen = { step: i - 1, ms: up }; else applyStep(STEPS[i]);
      }
      break;
    }
    if (ms > BUDGET_MS * 4 && i < STEPS.length - 2) i += 1;      // far over: skip a step
  }
  if (!chosen) return { name: "too-slow", ms: null };
  applyStep(STEPS[chosen.step]);
  try { localStorage.setItem(QUALITY_KEY, JSON.stringify({ step: chosen.step })); } catch (e) { /* storage blocked */ }
  return { name: STEPS[chosen.step].name, step: chosen.step, ms: Math.round(chosen.ms * 10) / 10 };
}

// ---------------------------------------------------------------------------
// clock, skip, the buttons
// ---------------------------------------------------------------------------
let now = 0, started = false, paused = false, closed = false, cardSince = null;
const post = (type) => { try { parent.postMessage({ type }, "*"); } catch (e) { /* standalone */ } };
const finish = (type) => { if (closed) return; closed = true; Sound.fadeOut(); post(type); };
// skipping lands the music on the title: the motif and the final chord
function skip() { if (now < END) { now = END; Sound.seek(T.title - 0.02); } }
$("sound").addEventListener("click", () => Sound.toggle(() => (REDUCE || paused ? T.title - 0.02 : Math.max(0, now))));
$("skip").addEventListener("click", skip);
$("continue").addEventListener("click", () => finish("mathpath-rank-continue"));
$("roadmap").addEventListener("click", () => finish("mathpath-rank-roadmap"));
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("button")) skip(); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); finish("mathpath-rank-continue"); }
  else if (e.key === " " || e.key === "Enter") { if (document.activeElement && document.activeElement.tagName === "BUTTON" && now >= T.actions) return; e.preventDefault(); if (now < END) skip(); else finish("mathpath-rank-continue"); }
});

fit();
window.__rankBuildMs = Math.round(performance.now());
trace("built");
if (MANUAL) {
  // test tools: the exact frame at any time, at the size the test asks for
  // ?step=<name> (tools: compare the steps frame for frame)
  if (Q.get("step")) applyStep(STEPS.find((st) => st.name === Q.get("step")) || STEPS[1]);
  else if (!Q.get("scale") && !Q.get("msaa")) applyStep(STEPS[1]);
  window.__rank = { seek: (t) => { now = t; draw(t); return true; }, end: END, times: T };
  draw(0);
  post("mathpath-cutscene-ready");
} else if (REDUCE) {
  // reduced motion: the finished medallion and the card, nothing flying
  if (!Q.get("scale") && !Q.get("msaa")) applyStep(STEPS[Math.min(2, STEPS.length - 1)]);
  now = END + 0.01; draw(now); paused = true;
  post("mathpath-cutscene-ready");
  $("continue").focus({ preventScroll: true });
} else {
  // Warm up: pose the finished medallion and compile every material, then
  // measure this device (QUALITY), all before anything moves -- otherwise
  // parts stall a frame as they first appear, and a slow first second eats
  // into the scene.
  draw(END + 0.01, false);
  try { await (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))); } catch (e) { renderer.compile(scene, camera); }
  await pause();
  // and draw that finished pose once for real: every part's geometry and
  // textures go up to the GPU now, not in the frame where the part first
  // appears (a stall of tens of milliseconds, mid-scene)
  draw(END + 0.01);
  { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
  trace("warm");
  await pause();
  quality = await chooseQuality();
  trace(`quality ${quality.name}`);
  window.__rankQuality = quality; quality.trials = TRIALS;
  if (DEBUG) {
    // ?debug=1: draw every frame of the scene, 60 a second, each one timed
    // with the GPU finished -- what this device spends on each frame,
    // whatever the browser is doing with this window
    const gl = renderer.getContext(), times = [];
    for (let t = 0; t <= END; t += 1 / 60) { const a = performance.now(); draw(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - a); if (times.length % 30 === 0) await pause(); }
    const sorted = [...times].sort((x, y) => x - y), q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
    TRIALS.push(`| all ${times.length} frames: median ${q(0.5).toFixed(1)}, 90% ${q(0.9).toFixed(1)}, 99% ${q(0.99).toFixed(1)}, worst ${sorted.at(-1).toFixed(1)} ms, over 16.7 ms: ${times.filter((x) => x > 16.7).length} (${times.map((x, i) => [x, i / 60]).filter(([x]) => x > 16.7).map(([x, t]) => `${t.toFixed(2)}s ${x.toFixed(0)}`).join(", ")})`);
  }
  if (quality.name === "too-slow") {
    // the still medallion is better than a stuttering scene
    try { parent.postMessage({ type: "mathpath-cutscene-error", message: "too slow" }, "*"); } catch (e) { /* standalone */ }
  }
  now = 0; draw(0);                                  // the opening frame, waiting
  // The scene starts when the app has faded it in (mathpath-rank-start), with
  // the music if it is ready by then; on its own (no app around it) at once.
  const embedded = window.parent !== window;
  let go = null;
  const startSignal = new Promise((resolve) => {
    go = resolve;
    window.addEventListener("message", (e) => { if (e.source === window.parent && e.data && e.data.type === "mathpath-rank-start") resolve(); });
    setTimeout(resolve, embedded ? 2500 : 0);
  });
  window.__rankTime = () => ({ now, started });     // for the tests
  post("mathpath-cutscene-ready");
  await startSignal;
  await Promise.race([Sound.ready, new Promise((r) => setTimeout(r, 400))]);
  let focused = false, last = 0, last0 = 0;
  const slowFrames = [];
  const loop = (ms) => {
    if (closed) return;
    // The picture is the clock. Each frame moves it on by the time since the
    // last one, but never by more than a thirtieth of a second: a slow frame
    // (or a tab in the background) slows the motion for a moment instead of
    // skipping part of the scene.
    if (!started) { started = true; last = ms; last0 = ms; Sound.begin(() => now); }
    const dt = Math.min(1 / 30, Math.max(0, (ms - last) / 1000)); last = ms;
    if (now < END + 30) now += dt;
    // a slow frame, while on screen (a tab in the background is held to one
    // frame a second by the browser: that says nothing about this device)
    const raw = (ms - last0) / 1000; last0 = ms;
    if (!document.hidden && raw > 0.024 && raw < 0.2 && slowFrames.length < 400) slowFrames.push(raw);
    draw(now);
    Sound.follow(now);
    if (DEBUG) debugFrame(ms);
    if (now >= T.actions) {
      if (!focused) {
        focused = true; $("continue").focus({ preventScroll: true });
        // most frames slow on this device: start one step lighter next time
        if (quality.step !== undefined && slowFrames.length > 60 && quality.step < STEPS.length - 1) {
          try { localStorage.setItem(QUALITY_KEY, JSON.stringify({ step: quality.step + 1 })); } catch (e) { /* storage blocked */ }
        }
      }
      cardSince ??= now;
      const left = clamp((now - cardSince) / AUTO_CLOSE);
      $("timer").style.width = `${left * 100}%`;
      if (left >= 1) return finish("mathpath-rank-continue");
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
