// MathPath rank medallions (2026-10-19, rank revamp Part 1).
//
// One forged 3D medallion per rank family, with the division (V..I) built
// into the object itself: studs on the rim, then laurels, then a crest gem.
// The same builder makes the dashboard / roadmap stills (rendered offline at
// their exact size by tools/rank-medals) and, in Part 2, the cut scene, so the
// student always sees one object.
//
// Everything is made here in code: geometry, surface detail (height fields
// turned into normal and colour maps) and the studio lighting. Nothing is
// downloaded.
import * as THREE from "three";

export const FAMILIES = ["COPPER", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "CHAMPION"];

// "BRONZE_III" -> { family: "BRONZE", numeral: "III", level: 2 }.
// level 0..4: how much the division adds (V = 0 ... I = 4). Diamond has only
// III, II, I; Champion has none and is always the full piece.
export function parseTier(tier) {
  const parts = String(tier || "").toUpperCase().split("_");
  const family = FAMILIES.includes(parts[0]) ? parts[0] : parts[0] === "SEALED" ? "SEALED" : "COPPER";
  const numeral = parts[1] || "";
  let level = 4;
  if (family === "DIAMOND") level = { III: 1, II: 3, I: 4 }[numeral] ?? 4;
  else if (family !== "CHAMPION" && family !== "SEALED") level = { V: 0, IV: 1, III: 2, II: 3, I: 4 }[numeral] ?? 4;
  return { family, numeral: family === "CHAMPION" || family === "SEALED" ? "" : numeral, level };
}

// ---------------------------------------------------------------------------
// 2D outlines
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
function ngon(n, r, rot = Math.PI / 2) { return Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; }); }
function star(points, ro, ri, rot = Math.PI / 2) { return Array.from({ length: points * 2 }, (_, i) => { const r = i % 2 ? ri : ro; const a = rot + (i / (points * 2)) * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; }); }
function circle(r, n = 128) { return ngon(n, r, 0); }
function scale(pts, k, dy = 0) { return pts.map(([x, y]) => [x * k, y * k + dy]); }
function shape(pts, holes = []) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    [...h].reverse().forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    s.holes.push(p);
  }
  return s;
}
function ring(outer, inner) { return shape(outer, [inner]); }
// Heater shield: broad shoulders, full sides, a point at the foot.
function shieldOutline(w = 0.92, top = 0.82, foot = -1.0) {
  const pts = [];
  const N = 36;
  pts.push([-w * 0.94, top]);
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([-w * 0.94 + t * w * 1.88, top + Math.sin(t * Math.PI) * 0.07]); }
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const y = top - t * (top - foot);
    const x = w * (1 - Math.pow(t, 2.4)) ** 0.62 * (t < 0.08 ? 0.94 + t * 0.75 : 1);
    pts.push([Math.max(0.0, x), y]);
  }
  const right = pts.slice(14);
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return [...pts.slice(1, 14), ...right, ...left];
}

// ---------------------------------------------------------------------------
// noise and surface maps
// ---------------------------------------------------------------------------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const EXT = 1.6;            // face maps cover x, y in [-EXT, EXT]
let SIZE = 1024;             // surface-map resolution (setSurfaceDetail)
// The cut scene shows the medallion full screen: it asks for 2048 maps on a
// desktop so the hammering, engraving and brushing stay crisp up close.
export function setSurfaceDetail(px) { SIZE = px; }
const CACHE = new Map();

// Surface maps are drawn on the GPU (a few milliseconds each, where drawing a
// 2048 map in JavaScript took seconds). Height fields become normal maps by
// central differences, plus the exact slope of the dome; colour maps are
// written in linear light into an sRGB target so their mipmaps blend right.
// Normal maps are half float where the device allows it: 8-bit normals band
// into visible contours in the reflections of a polished, gently domed face.
let GPU = null;
function gpu() {
  if (!GPU) throw new Error("medallion: makeStudio(renderer) must run before buildMedallion");
  return GPU;
}
const GLSL_LIB = /* glsl */ `
precision highp float; precision highp int;
const float PI = 3.141592653589793;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
// offset so the cell index is never negative before it becomes a uint
float hash(vec2 q, uint seed) { ivec2 i = ivec2(floor(q)) + 65536; return float(pcg(uint(i.x) + pcg(uint(i.y) + seed))) / 4294967295.0; }
float hash(vec2 q) { return hash(q, 1013904223u); }
float vnoise(vec2 q) {
  vec2 i = floor(q), f = q - i, u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float fbm(vec2 q, int oct) { float s = 0.0, a = 0.5; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(q); q *= 2.03; a *= 0.5; } return s; }
float cells(vec2 q, float k) {
  q *= k; vec2 i = floor(q); float d1 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y); vec2 o = vec2(hash(c, 77u), hash(c, 191u));
    vec2 v = q - (c + o); d1 = min(d1, dot(v, v));
  }
  return sqrt(d1);
}
float lline(float v) { return smoothstep(0.0, 0.12, abs(sin(v))); }
// round, anti-aliased stars on a grid of n cells per unit
float stars(vec2 q, float n, float odds, float k) { vec2 g = floor(q * n), f = fract(q * n); return hash(g, 4099u) > odds ? k * (1.0 - smoothstep(0.12, 0.42, length(f - 0.5))) : 0.0; }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;
function genMap(kind, key, body, { strength = 1, dome = 0 } = {}) {
  const flat = kind === "n" && /^\s*0(\.0*)?\s*$/.test(body);
  const size = flat ? Math.min(SIZE, 512) : SIZE;   // a plain dome is smooth: 512 is exact
  const k = `${kind}:${key}:${strength}:${dome}:${size}`;
  if (CACHE.has(k)) return CACHE.get(k);
  const { renderer, scene, camera, quad, half } = gpu();
  const code = flat ? "return 0.0;" : /\breturn\b/.test(body) ? body : `return (${body});`;
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: kind === "n" && half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: kind === "c" ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  quad.material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { EXTENT: { value: EXT }, PXL: { value: (2 * EXT) / size }, STR: { value: strength }, DOME: { value: dome } },
    vertexShader: `precision highp float; in vec3 position; uniform float EXTENT; out vec2 vP; void main() { vP = position.xy * EXTENT; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `${GLSL_LIB}
uniform float PXL, STR, DOME; in vec2 vP; out vec4 outColor;
${kind === "n" ? "float" : "vec3"} F(vec2 p) { float x = p.x, y = p.y, r = length(p), a = atan(y, x == 0.0 ? 1e-7 : x); ${code} }
void main() {
${kind === "n" ? `  float e = PXL, l = F(vP - vec2(e, 0)), rr = F(vP + vec2(e, 0)), d = F(vP - vec2(0, e)), u = F(vP + vec2(0, e));
  float g = 0.02 * STR / (2.0 * e);
  vec3 n = normalize(vec3(-(rr - l) * g + 2.0 * DOME * vP.x, -(u - d) * g + 2.0 * DOME * vP.y, 1.0));
  outColor = vec4(n * 0.5 + 0.5, 1.0);` : `  outColor = vec4(toLinear(clamp(F(vP), 0.0, 1.0)), 1.0);`}
}`,
    depthTest: false, depthWrite: false,
  });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(prev);
  quad.material.dispose();
  const t = rt.texture;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / (2 * EXT), 1 / (2 * EXT)); t.offset.set(0.5, 0.5);
  t.userData.target = rt;
  CACHE.set(k, t);
  return t;
}
// A height field over the face (GLSL, in x, y, r, a, p) -> normal map. dome
// adds a gentle pillow so a flat face catches the light like a struck medal.
function bump(key, glsl, opts) { return genMap("n", key, glsl, opts); }
// GLSL returning vec3 sRGB 0..1 -> colour map.
function paint(key, glsl) { return genMap("c", key, glsl); }

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------
const v2 = (a) => new THREE.Vector2(a, a);
function metal(color, roughness = 0.28, extra = {}) { return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.2, ...extra }); }
function enamel(color, extra = {}) { return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1, ...extra }); }
function jewel(color, { glowAmt = 0.32, irid = 0.6, rough = 0.02, env = 2.4 } = {}) {
  // A cut stone: faceted, glossy, lit from within (a transmission pass would
  // only see the dark studio behind it and turn the stone black).
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, metalness: 0, roughness: rough, ior: 2.0, specularIntensity: 1, specularColor: new THREE.Color("#ffffff"),
    clearcoat: 1, clearcoatRoughness: 0, iridescence: irid, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 900],
    emissive: c, emissiveIntensity: glowAmt, envMapIntensity: env, flatShading: true,
  });
}
function diamondMat({ tint = "#eef7ff", fire = 1 } = {}) {
  // Almost no body colour: each facet is a little mirror that throws back the
  // black studio or a flash of a softbox, with thin-film fire on top. It sees
  // its own, brighter studio (the gem room: the full softboxes and a dense
  // field of small lights), whatever the scene's lighting: a diamond that
  // reflects a dim room is grey.
  const m = new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0.85, roughness: 0.0, envMapIntensity: 2.4, envMap: GPU?.gemEnv ?? null, flatShading: true, specularIntensity: 1, vertexColors: true,
    clearcoat: 1, clearcoatRoughness: 0, iridescence: fire, iridescenceIOR: 2.2, iridescenceThicknessRange: [120, 760],
    emissive: "#d8efff", emissiveIntensity: 0.55,
  });
  // The light a real stone returns from inside (its facets mirror each other):
  // each facet glows by its own brightness, cubed, so the bright ones shine and
  // the dark ones stay black -- the crisp mosaic a brilliant cut shows.
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive * vColor.rgb * vColor.rgb * vColor.rgb;"); };
  m.customProgramCacheKey = () => "diamond-facets";
  return m;
}
// A four-point star glint, drawn once into a texture.
let GLINT = null;
function glint(size, x, y, z, color = "#ffffff") {
  if (!GLINT) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.06, "rgba(255,255,255,0.95)"); grd.addColorStop(0.16, "rgba(220,240,255,0.35)"); grd.addColorStop(0.45, "rgba(200,230,255,0.06)"); grd.addColorStop(1, "rgba(200,230,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    for (const [w, h, a] of [[200, 8, 0.85], [8, 200, 0.85], [110, 4, 0.45], [4, 110, 0.45]]) {
      const lg = g.createLinearGradient(128 - w / 2, 128 - h / 2, 128 + w / 2, 128 + h / 2);
      lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, `rgba(255,255,255,${a})`); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.save(); g.translate(128, 128); if (w === 150 || w === 3) g.rotate(Math.PI / 4); g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    }
    GLINT = new THREE.CanvasTexture(cv); GLINT.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLINT, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false }));
  sp.scale.set(size, size, 1); sp.position.set(x, y, z); sp.renderOrder = 10; sp.userData.glint = true;
  return sp;
}
function light(color, intensity = 3) { return new THREE.MeshStandardMaterial({ color: "#000", emissive: color, emissiveIntensity: intensity, roughness: 0.5, metalness: 0 }); }

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------
function extrudeGeo(s, depth, bevel, segs = 6, curve = 48, size = bevel * 0.9) {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: size, bevelOffset: -size, bevelSegments: segs, curveSegments: curve });
  g.computeVertexNormals();
  return g;
}
// A layer from z to z + depth + 2 * bevel. Returns [mesh, frontZ].
function layer(group, s, z, depth, bevel, side, face = side, segs = 6) {
  const m = new THREE.Mesh(extrudeGeo(s, depth, bevel, segs), [face, side]);
  m.position.z = z + bevel;
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return [m, z + depth + 2 * bevel];
}
function bossStud(r, mat) {
  const g = new THREE.SphereGeometry(r, 32, 16, 0, TAU, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2); g.scale(1, 1, 0.7);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
// A round brilliant: table, star and kite facets on the crown, a girdle, and a
// pavilion running to a culet. Alternate rings are turned half a step, which
// is what gives a cut stone its zig-zag facets.
function brilliantGeo(sides = 16, { table = 0.54, crownH = 0.34, pavH = 0.9 } = {}) {
  const rings = [
    [table, crownH, 0], [0.8, crownH * 0.52, 0.5], [1.0, 0.04, 0], [1.0, -0.03, 0], [0.56, -pavH * 0.5, 0.5],
  ];
  const pos = [];
  const pt = (r, z, a) => [Math.cos(a) * r, Math.sin(a) * r, z];
  const step = TAU / sides;
  // table
  for (let i = 0; i < sides; i++) { const a0 = i * step, a1 = (i + 1) * step; pos.push(0, 0, crownH, ...pt(table, crownH, a0), ...pt(table, crownH, a1)); }
  for (let k = 0; k < rings.length - 1; k++) {
    const [r0, z0, o0] = rings[k], [r1, z1, o1] = rings[k + 1];
    for (let i = 0; i < sides; i++) {
      const a0 = (i + o0) * step, a1 = (i + 1 + o0) * step, b0 = (i + o1) * step, b1 = (i + 1 + o1) * step;
      if (o0 === o1) { pos.push(...pt(r0, z0, a0), ...pt(r1, z1, b0), ...pt(r1, z1, b1)); pos.push(...pt(r0, z0, a0), ...pt(r1, z1, b1), ...pt(r0, z0, a1)); }
      else if (o1 > o0) { pos.push(...pt(r0, z0, a0), ...pt(r1, z1, b0), ...pt(r0, z0, a1)); pos.push(...pt(r0, z0, a1), ...pt(r1, z1, b0), ...pt(r1, z1, b1 - 0)); }
      else { pos.push(...pt(r0, z0, a0), ...pt(r1, z1, b1), ...pt(r0, z0, a1)); pos.push(...pt(r0, z0, a0), ...pt(r1, z1, b0), ...pt(r1, z1, b1)); }
    }
  }
  // pavilion to the culet
  const [rl, zl, ol] = rings[rings.length - 1];
  for (let i = 0; i < sides; i++) { const a0 = (i + ol) * step, a1 = (i + 1 + ol) * step; pos.push(...pt(rl, zl, a1), ...pt(rl, zl, a0), 0, 0, -pavH); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // make every triangle face outwards
  const P = g.attributes.position.array;
  for (let t = 0; t < P.length; t += 9) {
    const ax = P[t], ay = P[t + 1], az = P[t + 2], bx = P[t + 3], by = P[t + 4], bz = P[t + 5], cx = P[t + 6], cy = P[t + 7], cz = P[t + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    if (nx * mx + ny * my + nz * (mz - 0.05) < 0) { for (let q = 0; q < 3; q++) { const tmp = P[t + 3 + q]; P[t + 3 + q] = P[t + 6 + q]; P[t + 6 + q] = tmp; } }
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
function withFire(geo, amount = 0.35) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const hues = [[1, 0.55, 0.6], [1, 0.85, 0.5], [0.6, 1, 0.7], [0.55, 0.8, 1], [0.8, 0.6, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]];
  for (let t = 0; t < n; t += 3) {
    const h = hues[Math.floor(hash(t, 9) * hues.length)];
    // A cut stone sparkles because neighbouring facets disagree: some throw
    // back a softbox, some the black room. Vary each facet's brightness so the
    // stone reads as a crisp mosaic of light and dark, never one grey mass.
    const b = hash(t, 13) < 0.3 ? 0.14 + hash(t, 17) * 0.16 : 0.62 + hash(t, 19) * 0.38;
    for (let q = 0; q < 3; q++) for (let k = 0; k < 3; k++) col[(t + q) * 3 + k] = b * (1 - amount + amount * h[k]);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
function brilliant(radius, mat, sides = 16) {
  const g = brilliantGeo(sides); g.scale(radius, radius, radius);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}

// Roman numerals as Trajan-like letters (em height 1).
const GLYPHS = {
  I: { w: 0.48, pts: [[-0.24, 0], [0.24, 0], [0.24, 0.055], [0.13, 0.085], [0.1, 0.14], [0.1, 0.86], [0.13, 0.915], [0.24, 0.945], [0.24, 1], [-0.24, 1], [-0.24, 0.945], [-0.13, 0.915], [-0.1, 0.86], [-0.1, 0.14], [-0.13, 0.085], [-0.24, 0.055]] },
  V: { w: 0.94, pts: [[-0.47, 1.0], [-0.08, 1.0], [-0.08, 0.955], [-0.16, 0.935], [0.045, 0.25], [0.29, 0.935], [0.21, 0.955], [0.21, 1.0], [0.47, 1.0], [0.47, 0.955], [0.385, 0.935], [0.035, 0.0], [-0.035, 0.0], [-0.36, 0.935], [-0.47, 0.955]] },
};
function numeralMesh(text, height, mat, depth = 0.05, bevel = 0.014) {
  const group = new THREE.Group();
  const gap = 0.06, kern = 0.1;
  const adv = [...text].map((c, i) => GLYPHS[c].w + (i < text.length - 1 ? gap - (c === "I" && text[i + 1] === "V" ? kern : 0) : 0));
  const total = adv.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  [...text].forEach((c, i) => {
    const G = GLYPHS[c];
    const s = shape(G.pts.map(([px, py]) => [(px + G.w / 2 + x) * height, (py - 0.5) * height]));
    const m = new THREE.Mesh(extrudeGeo(s, depth, bevel, 4, 12), mat); m.castShadow = true;
    group.add(m);
    x += adv[i];
  });
  return group;
}

function laurel(radius, mat, { from = -1.52, to = -0.2, leaves = 8, size = 0.12, z = 0.06 } = {}) {
  const group = new THREE.Group();
  const leafGeo = new THREE.SphereGeometry(1, 28, 14);
  leafGeo.scale(size, size * 0.34, size * 0.09);
  leafGeo.translate(size * 0.92, 0, 0);
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 48; i++) { const a = from + (to - from) * (i / 48); pts.push(new THREE.Vector3(Math.cos(a) * radius * side, Math.sin(a) * radius, z)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, size * 0.08, 10, false), mat));
    for (let i = 0; i < leaves; i++) {
      const t = 0.06 + (i / (leaves - 1)) * 0.9;
      const a = from + (to - from) * t;
      const px = Math.cos(a) * radius * side, py = Math.sin(a) * radius;
      // direction of travel along the branch (towards `to`)
      const dir = Math.atan2(Math.cos(a), -Math.sin(a) * side) ;
      const travel = side > 0 ? a + Math.PI / 2 : Math.PI - (a + Math.PI / 2);
      for (const out of [1, -1]) {
        const leaf = new THREE.Mesh(leafGeo, mat);
        leaf.position.set(px, py, z + 0.01);
        leaf.rotation.z = travel + out * 0.55 * side;
        leaf.rotation.x = out * 0.5;
        leaf.scale.setScalar(0.72 + 0.4 * Math.sin(t * Math.PI));
        leaf.castShadow = true;
        group.add(leaf);
      }
    }
    // a berry at the end
    const tip = bossStud(size * 0.28, mat); tip.position.set(Math.cos(to) * radius * side, Math.sin(to) * radius, z + 0.01); group.add(tip);
  }
  return group;
}

// ---------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------
const P = {
  COPPER: { base: "#c0713f", deep: "#6e361b", hi: "#ffc39a", rim: "#d98552", enamel: "#0d4f47", accent: "#ffd3b0", leaf: "#d98a58", gem: "#ff6a1a", glow: "#ff8a3d" },
  BRONZE: { base: "#a8722f", deep: "#4f2f12", hi: "#f3c982", rim: "#c58a3e", enamel: "#4a0d10", accent: "#ffe0a8", leaf: "#c8954f", gem: "#ffb020", glow: "#ffae42" },
  SILVER: { base: "#c7ced8", deep: "#5d6878", hi: "#ffffff", rim: "#e9eef4", enamel: "#0a1a3a", accent: "#f4f8fc", leaf: "#d7dde6", gem: "#9be7ff", glow: "#6fd6ff" },
  GOLD: { base: "#eab33a", deep: "#7e5208", hi: "#fff2b8", rim: "#ffcd57", enamel: "#5e0b1d", accent: "#fff1c2", leaf: "#f2c14e", gem: "#ff2152", glow: "#ffd34d" },
  PLATINUM: { base: "#dedde8", deep: "#6f6c88", hi: "#ffffff", rim: "#efeef6", enamel: "#f2f0f8", accent: "#ffffff", leaf: "#e6e4f0", gem: "#b36bff", glow: "#a855f7" },
  EMERALD: { base: "#e7b44a", deep: "#7c540f", hi: "#fff0b8", rim: "#f3c55e", enamel: "#03301f", accent: "#fff3c4", leaf: "#efc057", gem: "#07945a", glow: "#34d399" },
  DIAMOND: { base: "#e6ebf2", deep: "#6f7d93", hi: "#ffffff", rim: "#f5f8fc", enamel: "#06142c", accent: "#ffffff", leaf: "#e9eef5", gem: "#eaf8ff", glow: "#7dd3fc" },
  CHAMPION: { base: "#0f0d12", deep: "#050407", hi: "#ffd36b", rim: "#e9b23c", enamel: "#0a0709", accent: "#fff0b8", leaf: "#f0c04a", gem: "#e0113d", glow: "#ff1f4b" },
  SEALED: { base: "#2b2e36", deep: "#121318", hi: "#4f535e", rim: "#3c3f49", enamel: "#0b0c10", accent: "#7c8190", leaf: "#555", gem: "#8a8fa0", glow: "#9fb0ff" },
};

// ---------------------------------------------------------------------------
// the families. Each returns { group, face (z of the numeral seat), centre,
// studs (rim points, mirrored pairs), top (crest point) }.
// ---------------------------------------------------------------------------
function copper(c) {
  const g = new THREE.Group();
  const O = ngon(8, 1.0, Math.PI / 8);
  const hammer = bump("hammer", "cells(p, 8.5) * 1.2 + fbm(p * 7.0, 4) * 0.25", { strength: 2.4, dome: 0.06 });
  const patina = paint("copper-patina", `
    float n = fbm(vec2(x * 3.0 + 1.0, y * 3.0), 5), d = cells(p, 8.5);
    float q = smoothstep(0.55, 0.78, n + (1.0 - d) * 0.15) * 0.8;      // verdigris in the hollows
    return mix(vec3(0.75, 0.44, 0.26), vec3(0.22, 0.56, 0.5), q);`);
  const [, f0] = layer(g, shape(O), 0, 0.12, 0.06, metal(c.deep, 0.4), metal("#ffffff", 0.38, { map: patina, normalMap: hammer, normalScale: v2(1) }));
  // turned field
  const turned = bump("turned", "sin(r * 160.0) * 0.35 + cells(p, 11.0) * 0.3", { strength: 1.3, dome: 0.04 });
  const [, f1] = layer(g, shape(ngon(8, 0.8, Math.PI / 8)), f0, 0.008, 0.004, metal("#8b4a2b", 0.3), metal("#a95f38", 0.3, { normalMap: turned, normalScale: v2(1) }));
  // raised rim
  layer(g, ring(ngon(8, 0.985, Math.PI / 8), ngon(8, 0.8, Math.PI / 8)), f0, 0.05, 0.03, metal(c.rim, 0.24), metal(c.rim, 0.26, { normalMap: hammer, normalScale: v2(0.6) }));
  const rimTop = f0 + 0.11;
  const rivet = metal(c.hi, 0.16);
  for (const [x, y] of ngon(8, 0.895, Math.PI / 8)) { const r = bossStud(0.05, rivet); r.position.set(x, y, rimTop); g.add(r); }
  // the gear and its enamel heart
  const teeth = 16, gp = [];
  for (let i = 0; i < teeth * 4; i++) { const a = (i / (teeth * 4)) * TAU + Math.PI / 2; const r = i % 4 < 2 ? 0.62 : 0.53; gp.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const [, f2] = layer(g, ring(gp, circle(0.4)), f1, 0.07, 0.025, metal(c.deep, 0.28), metal(c.hi, 0.2, { normalMap: bump("gear", "sin(a * 64.0) * 0.2", { strength: 1, dome: 0.12 }), normalScale: v2(1) }));
  for (const a of [0, 1, 2, 3, 4, 5].map((i) => (i / 6) * TAU + Math.PI / 2)) { const h = bossStud(0.032, metal(c.deep, 0.3)); h.position.set(Math.cos(a) * 0.475, Math.sin(a) * 0.475, f2); g.add(h); }
  const [, f3] = layer(g, shape(circle(0.405)), f1, 0.06, 0.02, metal(c.deep, 0.3), enamel(c.enamel, { normalMap: bump("enamel-dome", "0", { dome: 0.5 }), normalScale: v2(1) }));
  return { group: g, face: f3, centre: [0, 0], studs: [[-0.83, 0], [0.83, 0], [-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]], studZ: rimTop, top: [0, 0.98] };
}

function bronze(c) {
  const g = new THREE.Group();
  const O = shieldOutline(0.92, 0.82, -1.04);
  const cast = bump("cast", "fbm(p * 5.0, 5) * 0.9 + cells(p, 16.0) * 0.3", { strength: 2.2, dome: 0.07 });
  const bronzeTone = paint("bronze-tone", "float n = fbm(p * 2.2, 4); return vec3(0.62 + n * 0.18, 0.42 + n * 0.12, 0.2 + n * 0.06);");
  const [, f0] = layer(g, shape(O), 0, 0.12, 0.06, metal(c.deep, 0.4), metal("#ffffff", 0.32, { map: bronzeTone, normalMap: cast, normalScale: v2(1) }));
  const I = scale(O, 0.8, 0.02);
  const engraved = bump("engraved-band", `
    float t = smoothstep(0.3, 0.4, sin(a * 44.0)) * smoothstep(0.0, 0.2, abs(sin(a * 11.0)));
    return t + fbm(p * 9.0, 4) * 0.25;`, { strength: 1.6, dome: 0.03 });
  layer(g, ring(scale(O, 0.985), I), f0, 0.05, 0.03, metal(c.rim, 0.24), metal(c.rim, 0.24, { normalMap: engraved, normalScale: v2(1) }));
  const rimTop = f0 + 0.11;
  const diaper = bump("diaper", "float k = 7.5; float lines = smoothstep(0.0, 0.14, abs(sin((x + y) * k))) * smoothstep(0.0, 0.14, abs(sin((x - y) * k))); float dt = length(vec2(cos((x + y) * k), cos((x - y) * k))); return lines - (1.0 - smoothstep(0.26, 0.34, dt)) * 0.5;", { strength: 1.1, dome: 0.12 });
  const [, f1] = layer(g, shape(I), f0, 0.008, 0.004, metal(c.deep, 0.3), enamel(c.enamel, { normalMap: diaper, normalScale: v2(1) }));
  // radiant engraved boss
  const rays = bump("boss-rays", "smoothstep(-0.08, 0.08, sin(a * 24.0)) * 0.5 * smoothstep(0.18, 0.32, r)", { strength: 1.4, dome: 0.22 });
  const [, f2] = layer(g, ring(circle(0.46), circle(0.37)), f1, 0.05, 0.022, metal(c.hi, 0.18), metal(c.hi, 0.18, { normalMap: bump("ringdome", "0", { dome: 0.2 }), normalScale: v2(1) }));
  const [, f3] = layer(g, shape(circle(0.375)), f1, 0.04, 0.015, metal(c.deep, 0.3), metal(c.base, 0.3, { normalMap: rays, normalScale: v2(1) }));
  const boss = metal(c.hi, 0.16);
  for (const x of [-0.66, 0.66]) { const s = bossStud(0.058, boss); s.position.set(x, 0.66, rimTop); g.add(s); }
  return { group: g, face: f3, centre: [0, 0.02], studs: [[-0.76, 0.2], [0.76, 0.2], [-0.5, -0.56], [0.5, -0.56], [-0.79, 0.48], [0.79, 0.48]], studZ: rimTop, top: [0, 0.9] };
}

function silver(c) {
  const g = new THREE.Group();
  const O = ngon(5, 1.04, Math.PI / 2);
  const brushed = bump("brushed", "vnoise(vec2(a * 260.0, r * 2.5)) * 0.6 + vnoise(vec2(a * 1100.0, 0.5)) * 0.4", { strength: 0.9, dome: 0.08 });
  const [, f0] = layer(g, shape(O), 0, 0.12, 0.07, metal(c.deep, 0.24), metal(c.base, 0.24, { normalMap: brushed, normalScale: v2(1), clearcoat: 0.5, clearcoatRoughness: 0.12 }));
  // ice blades behind
  for (const s of [1, -1]) {
    const blade = [[0.62 * s, 0.52], [1.38 * s, 0.8], [1.02 * s, 0.38], [1.26 * s, 0.26], [0.8 * s, 0.1]];
    layer(g, shape(blade), -0.06, 0.03, 0.025, metal(c.rim, 0.12), jewel(c.gem, { glowAmt: 0.18, irid: 0.9 }), 3);
  }
  const I = ngon(5, 0.8, Math.PI / 2);
  const stars = paint("midnight-stars", "float s = stars(p, 90.0, 0.992, 0.9), n = fbm(p * 2.0, 4) * 0.06; return vec3(0.03 + n + s, 0.07 + n + s, 0.18 + n * 2.0 + s);");
  const [, f1] = layer(g, shape(I), f0, 0.008, 0.004, metal(c.deep, 0.3), enamel("#ffffff", { map: stars, roughness: 0.2, normalMap: bump("enamel-dome-p", "0", { dome: 0.1 }), normalScale: v2(1) }));
  // frost inlay line + polished rim
  layer(g, ring(ngon(5, 0.84, Math.PI / 2), ngon(5, 0.815, Math.PI / 2)), f0, 0.004, 0.003, light(c.glow, 2.6));
  layer(g, ring(ngon(5, 1.02, Math.PI / 2), ngon(5, 0.86, Math.PI / 2)), f0, 0.05, 0.03, metal(c.rim, 0.12), metal(c.rim, 0.1, { clearcoat: 1, normalMap: bump("rimdome5", "0", { dome: 0.1 }), normalScale: v2(1) }));
  const rimTop = f0 + 0.11;
  // centre: faceted ice crystal cradled in a silver ring
  const [, f2] = layer(g, ring(circle(0.47), circle(0.39)), f1, 0.05, 0.022, metal(c.rim, 0.1), metal(c.rim, 0.1, { normalMap: bump("ringdome", "0", { dome: 0.2 }), normalScale: v2(1) }));
  const [, f3] = layer(g, shape(circle(0.395)), f1, 0.03, 0.012, metal(c.deep, 0.2), enamel(c.enamel, { normalMap: bump("enamel-dome", "0", { dome: 0.5 }), normalScale: v2(1) }));
  return { group: g, face: f3, centre: [0, 0], studs: [...ngon(5, 0.94, Math.PI / 2).filter(([x]) => Math.abs(x) > 0.01), [-0.62, -0.46], [0.62, -0.46]].sort((a, b) => b[1] - a[1]), studZ: rimTop, top: [0, 1.04] };
}

function gold(c) {
  const g = new THREE.Group();
  const rays = [];
  const n = 36;
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU + Math.PI / 2; const r = i % 2 ? 0.84 : (i % 4 === 0 ? 1.2 : 1.05); rays.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const sunGuil = bump("sun-lines", "sin(a * 72.0) * 0.5", { strength: 0.8, dome: 0.05 });
  layer(g, shape(rays), -0.06, 0.03, 0.02, metal(c.deep, 0.2), metal(c.rim, 0.14, { normalMap: sunGuil, normalScale: v2(1) }), 3);
  const guilloche = bump("guilloche", "sin(r * 70.0 + sin(a * 12.0) * 3.0) * 0.5", { strength: 1.0, dome: 0.1 });
  const S = star(5, 1.0, 0.47);
  const [, f0] = layer(g, shape(S), 0, 0.14, 0.075, metal(c.deep, 0.16), metal(c.base, 0.14, { normalMap: guilloche, normalScale: v2(1), clearcoat: 0.7, clearcoatRoughness: 0.06 }));
  // centre: a polished bezel and a crimson enamel heart
  const [, f1] = layer(g, ring(circle(0.45), circle(0.37)), f0, 0.05, 0.024, metal(c.hi, 0.08), metal(c.hi, 0.08, { normalMap: bump("ringdome", "0", { dome: 0.2 }), normalScale: v2(1) }));
  const ruby = paint("ruby-enamel", "return vec3(0.42 + sin(r * 120.0) * 0.04, 0.03, 0.09);");
  const [, f2] = layer(g, shape(circle(0.375)), f0, 0.03, 0.012, metal(c.deep, 0.2), enamel("#ffffff", { map: ruby, normalMap: bump("enamel-dome", "0", { dome: 0.5 }), normalScale: v2(1) }));
  return { group: g, face: f2, centre: [0, 0], studs: star(5, 0.62, 0.62, Math.PI / 2 + Math.PI / 5).filter(([x]) => Math.abs(x) > 0.01).concat(star(5, 0.56, 0.56, Math.PI / 2).filter(([x]) => Math.abs(x) > 0.01)), studZ: f0 + 0.005, top: [0, 1.0] };
}

function platinum(c) {
  const g = new THREE.Group();
  const O = ngon(6, 1.02, Math.PI / 2);
  const [, f0] = layer(g, shape(O), 0, 0.12, 0.07, metal(c.deep, 0.16), metal(c.base, 0.14, { clearcoat: 1, clearcoatRoughness: 0.05, normalMap: bump("dome6", "0", { dome: 0.08 }), normalScale: v2(1) }));
  const lattice = bump("lattice", "vec2 g = p * 8.5; return lline(g.x) * lline(g.x * 0.5 + g.y * 0.866) * lline(-g.x * 0.5 + g.y * 0.866);", { strength: 1.0, dome: 0.06 });
  const ceramic = paint("ceramic", "float v = 0.93 + fbm(p * 4.0, 4) * 0.04; return vec3(v, v * 0.985, v);");
  const [, f1] = layer(g, shape(ngon(6, 0.84, Math.PI / 2)), f0, 0.008, 0.004, metal(c.deep, 0.2), enamel("#ffffff", { map: ceramic, roughness: 0.36, normalMap: lattice, normalScale: v2(1) }));
  layer(g, ring(ngon(6, 1.0, Math.PI / 2), ngon(6, 0.86, Math.PI / 2)), f0, 0.05, 0.03, metal(c.rim, 0.1), metal(c.rim, 0.1, { normalMap: bump("rimdome6", "0", { dome: 0.1 }), normalScale: v2(1) }));
  const rimTop = f0 + 0.11;
  // the violet core
  const [, f2] = layer(g, ring(circle(0.52), circle(0.45)), f1, 0.05, 0.022, metal(c.rim, 0.08), metal(c.rim, 0.08, { normalMap: bump("ringdome", "0", { dome: 0.2 }), normalScale: v2(1) }));
  layer(g, ring(circle(0.445), circle(0.405)), f1, 0.006, 0.003, light(c.glow, 5));
  const core = paint("violet-core", "float k = max(0.0, 1.0 - r / 0.42); k *= k; return vec3(0.12 + 0.45 * k, 0.02 + 0.1 * k, 0.26 + 0.6 * k);");
  const [, f3] = layer(g, shape(circle(0.405)), f1, 0.03, 0.012, metal(c.deep, 0.2), enamel("#ffffff", { map: core, emissive: "#ffffff", emissiveMap: core, emissiveIntensity: 0.55, normalMap: bump("enamel-dome", "0", { dome: 0.5 }), normalScale: v2(1) }));
  const node = light(c.glow, 4);
  for (const [x, y] of ngon(6, 0.93, Math.PI / 2)) { const m = bossStud(0.034, node); m.position.set(x, y, rimTop); g.add(m); }
  return { group: g, face: f3, centre: [0, 0], numeralColor: "#f3eaff", studs: [[-0.8, 0], [0.8, 0], [-0.4, 0.69], [0.4, 0.69], [-0.4, -0.69], [0.4, -0.69]], studZ: rimTop, top: [0, 1.02] };
}

function emerald(c) {
  const g = new THREE.Group();
  const O = ngon(8, 1.0, Math.PI / 8);
  const [, f0] = layer(g, shape(O), 0, 0.1, 0.06, metal(c.deep, 0.2), metal(c.base, 0.16, { clearcoat: 0.6, normalMap: bump("filigree8", "sin(a * 16.0 + sin(r * 30.0) * 1.6) * smoothstep(0.82, 0.9, r) * 0.6", { strength: 1.2, dome: 0.05 }), normalScale: v2(1) }));
  layer(g, ring(ngon(8, 0.99, Math.PI / 8), ngon(8, 0.87, Math.PI / 8)), f0, 0.04, 0.025, metal(c.rim, 0.1), metal(c.rim, 0.1, { normalMap: bump("rimdome8", "0", { dome: 0.1 }), normalScale: v2(1) }));
  const rimTop = f0 + 0.09;
  // emerald cut: a rectangle with cut corners, stepped facets (big chamfers)
  const w = 0.55, h = 0.72, k = 0.17;
  const cut = [[-w + k, h], [w - k, h], [w, h - k], [w, -h + k], [w - k, -h], [-w + k, -h], [-w, -h + k], [-w, h - k]];
  const [, seat] = layer(g, shape(scale(cut, 1.1)), f0, 0.02, 0.012, metal(c.rim, 0.1), metal(c.hi, 0.1));
  const stone = jewel(c.gem, { glowAmt: 0.3, irid: 0.3 });
  const deep = jewel("#03442a", { glowAmt: 0.22, irid: 0.2 });
  let z = seat;
  [[1.0, 0.035, 0.07], [0.84, 0.03, 0.06], [0.68, 0.04, 0.06]].forEach(([s, d, b], i) => {
    const m = new THREE.Mesh(extrudeGeo(shape(scale(cut, s)), d, b, 1, 8, b * 1.6), i === 1 ? deep : stone);
    m.position.z = z + b; g.add(m); z += d + b * 1.2;
  });
  // claws
  const claw = metal(c.hi, 0.1);
  for (const [x, y] of cut.filter((_, i) => i % 2 === 1)) { const s = bossStud(0.06, claw); s.position.set(x * 1.07, y * 1.05, seat + 0.05); g.add(s); }
  return { group: g, face: z, plaque: [0, -0.86], plaqueZ: rimTop, centre: [0, 0], studs: [[-0.865, 0], [0.865, 0], [-0.612, 0.612], [0.612, 0.612], [-0.612, -0.612], [0.612, -0.612]], studZ: rimTop, top: [0, 0.99] };
}

function diamond(c) {
  const g = new THREE.Group();
  const K = [[0, 1.14], [0.8, 0.16], [0, -1.08], [-0.8, 0.16]];
  const [, f0] = layer(g, shape(K), 0, 0.1, 0.06, metal(c.deep, 0.14), metal(c.base, 0.1, { clearcoat: 1, normalMap: bump("kite", "0", { dome: 0.08 }), normalScale: v2(1) }));
  const night = paint("ice-night", "float s = stars(p, 120.0, 0.993, 0.8); return vec3(0.02 + s, 0.06 + s, 0.16 + s);");
  const [, f1] = layer(g, shape(scale(K, 0.84)), f0, 0.008, 0.004, metal(c.deep, 0.2), enamel("#ffffff", { map: night }));
  layer(g, ring(scale(K, 0.99), scale(K, 0.87)), f0, 0.04, 0.025, metal(c.rim, 0.06), metal(c.rim, 0.06, { clearcoat: 1 }));
  const rimTop = f0 + 0.09;
  // shard wings
  for (const s of [1, -1]) for (const [x, y, sc, r] of [[0.92, 0.5, 0.36, 0.55], [1.02, 0.12, 0.27, 0.95], [0.84, -0.26, 0.2, 1.35]]) {
    const sh = withFire(new THREE.OctahedronGeometry(1, 0).toNonIndexed(), 0.3); sh.scale(sc * 0.4, sc, sc * 0.18); sh.computeVertexNormals();
    const m = new THREE.Mesh(sh, diamondMat({ tint: "#dff2ff" })); m.position.set(x * s, y, 0.06); m.rotation.z = -r * s; g.add(m);
  }
  // the crystal: a brilliant drawn out into a kite, white fire on a night field
  // stood upright: crown on top, the pavilion running down to its point
  const stone = new THREE.Mesh(withFire(brilliantGeo(16, { table: 0.5, crownH: 0.34, pavH: 1.15 }), 0.45), diamondMat({ tint: "#f6fbff" }));
  stone.rotation.x = -Math.PI / 2 + 0.2;   // table tipped towards the viewer
  stone.scale.setScalar(0.6);
  stone.position.set(0, 0.22, f1 + 0.4);
  g.add(glint(0.5, -0.2, 0.56, f1 + 0.9), glint(0.32, 0.26, 0.3, f1 + 0.9));
  stone.castShadow = true;
  g.add(stone);
  return { group: g, face: f1 + 0.5, plaque: [0, -0.9], plaqueZ: rimTop, centre: [0, 0], studs: [[0.56, 0.5], [-0.56, 0.5], [0.44, -0.46], [-0.44, -0.46], [0.27, 0.8], [-0.27, 0.8]], studZ: rimTop, top: [0, 1.14] };
}

function champion(c) {
  const g = new THREE.Group();
  const veinField = "float v = abs(fbm(p * 3.0 + vec2(4.0, 2.0), 5) - 0.5);";
  const veins = bump("veins", `${veinField} return smoothstep(0.0, 0.04, v);`, { strength: 2.4, dome: 0.08 });
  const fire = paint("veins-fire", `${veinField} float e = max(0.0, 1.0 - v / 0.045); e *= e; return vec3(e, e * 0.08, e * 0.18);`);
  const obsidian = new THREE.MeshPhysicalMaterial({ color: c.base, metalness: 0.2, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: veins, normalScale: v2(1), emissive: "#ffffff", emissiveMap: fire, emissiveIntensity: 3.2, envMapIntensity: 1.5 });
  const goldM = metal(c.rim, 0.12, { clearcoat: 0.6, normalMap: bump("dome-g", "0", { dome: 0.1 }), normalScale: v2(1) });
  // sweeping wings: a row of long gold primaries, then obsidian coverts over them
  const feather = (L, W) => { const p = []; for (let i = 0; i <= 20; i++) { const t = i / 20; p.push([t * L, W * (Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.5)) + t * t * W * 0.9]); } for (let i = 20; i >= 0; i--) { const t = i / 20; p.push([t * L, -W * 0.6 * Math.sin(Math.PI * Math.pow(t, 0.85)) + t * t * W * 0.9]); } return p; };
  const quill = metal(c.hi, 0.14, { normalMap: bump("quill", "sin((x * 0.9 + y * 0.45) * 110.0) * 0.2", { strength: 1, dome: 0.05 }), normalScale: v2(1) });
  const place = (pts, ang, ox, oy, s) => pts.map(([x, y]) => { const ca = Math.cos(ang), sa = Math.sin(ang); return [(ox + x * ca - y * sa) * s, oy + x * sa + y * ca]; });
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const ang = 0.95 - i * 0.2, L = 1.22 - i * 0.07;
      layer(g, shape(place(feather(L, 0.2), ang, 0.3, 0.05, s)), -0.16 + i * 0.012, 0.02, 0.014, goldM, i % 2 ? metal(c.hi, 0.2) : goldM, 3);
    }
    for (let i = 0; i < 6; i++) {
      const ang = 0.78 - i * 0.24, L = 0.66 - i * 0.03;
      const pts = place(feather(L, 0.16), ang, 0.3, 0.08, s);
      layer(g, shape(pts), -0.03 + i * 0.01, 0.014, 0.012, metal(c.rim, 0.14), obsidian, 2);
    }
  }
  const crest = [[0, 1.02], [0.52, 0.74], [0.6, 0.04], [0.3, -0.66], [0, -1.02], [-0.3, -0.66], [-0.6, 0.04], [-0.52, 0.74]];
  const [, f0] = layer(g, shape(crest), 0, 0.14, 0.07, goldM, obsidian);
  layer(g, ring(crest, scale(crest, 0.89)), f0, 0.04, 0.024, goldM);
  // ruby heart on a bright foil
  layer(g, shape(scale([[0, 0.4], [0.32, 0.06], [0, -0.46], [-0.32, 0.06]], 1.08)), f0, 0.01, 0.006, metal("#ff6a85", 0.06));
  const heart = new THREE.OctahedronGeometry(1, 1).toNonIndexed(); heart.scale(0.3, 0.44, 0.17); heart.computeVertexNormals();
  const hm = new THREE.Mesh(heart, jewel(c.gem, { glowAmt: 0.55, irid: 0.5 })); hm.position.set(0, -0.01, f0 + 0.17); g.add(hm);
  // the crown: its own part, so the cut scene can bring it down onto the crest
  const crown = new THREE.Group();
  const cp = [[-0.48, 0.98], [-0.54, 1.38], [-0.31, 1.2], [-0.17, 1.54], [0, 1.27], [0.17, 1.54], [0.31, 1.2], [0.54, 1.38], [0.48, 0.98]];
  const [, cz] = layer(crown, shape(cp), -0.02, 0.08, 0.04, goldM, metal(c.hi, 0.24, { clearcoat: 0.6 }));
  layer(crown, shape([[-0.5, 0.96], [0.5, 0.96], [0.5, 1.06], [-0.5, 1.06]]), cz - 0.02, 0.03, 0.02, goldM);
  const ruby = jewel(c.gem, { glowAmt: 0.5, irid: 0.4 });
  for (const [x, y, r] of [[-0.54, 1.4, 0.055], [-0.17, 1.56, 0.06], [0.17, 1.56, 0.06], [0.54, 1.4, 0.055], [0, 1.15, 0.085], [-0.28, 1.01, 0.04], [0.28, 1.01, 0.04]]) { const m = brilliant(r, ruby, 12); m.position.set(x, y, cz + 0.02); crown.add(m); }
  return { group: g, crown, face: f0 + 0.3, centre: [0, 0], noNumeral: true, noDivision: true };
}

function sealed(c) {
  const g = new THREE.Group();
  const iron = bump("iron", "fbm(p * 6.0, 5) * 0.9 + cells(p, 13.0) * 0.35", { strength: 2.4, dome: 0.07 });
  const [, f0] = layer(g, shape(circle(1.0)), 0, 0.12, 0.07, metal(c.deep, 0.62), metal(c.base, 0.55, { normalMap: iron, normalScale: v2(1) }));
  layer(g, ring(circle(0.99), circle(0.84)), f0, 0.05, 0.03, metal(c.rim, 0.48), metal(c.rim, 0.5, { normalMap: iron, normalScale: v2(0.8) }));
  const top = f0 + 0.11;
  const linkGeo = new THREE.TorusGeometry(0.07, 0.021, 10, 28); linkGeo.scale(1.55, 1, 1);
  const linkMat = metal("#606571", 0.36);
  for (const a of [Math.PI / 4, -Math.PI / 4]) for (let i = -6; i <= 6; i++) {
    if (Math.abs(i) < 2) continue;
    const m = new THREE.Mesh(linkGeo, linkMat);
    m.position.set(Math.cos(a) * i * 0.145, Math.sin(a) * i * 0.145, top - 0.02);
    m.rotation.z = a; m.rotation.x = i % 2 ? Math.PI / 2 : 0; m.castShadow = true;
    g.add(m);
  }
  const [, f1] = layer(g, shape(circle(0.33)), f0, 0.07, 0.03, metal(c.hi, 0.34), metal(c.hi, 0.32, { normalMap: iron, normalScale: v2(0.8) }));
  const key = [...circle(0.085, 48).map(([x, y]) => [x, y + 0.07])];
  layer(g, shape(key), f1, 0.002, 0.001, light(c.glow, 1.6));
  layer(g, shape([[-0.04, 0.03], [0.04, 0.03], [0.065, -0.17], [-0.065, -0.17]]), f1, 0.002, 0.001, light(c.glow, 1.6));
  return { group: g, face: f1, centre: [0, 0], noNumeral: true, noDivision: true };
}

const BUILDERS = { COPPER: copper, BRONZE: bronze, SILVER: silver, GOLD: gold, PLATINUM: platinum, EMERALD: emerald, DIAMOND: diamond, CHAMPION: champion, SEALED: sealed };

// ---------------------------------------------------------------------------
// public: the medallion for a tier
// ---------------------------------------------------------------------------
export function buildMedallion(tier) {
  const { family, numeral, level } = parseTier(tier);
  const c = P[family];
  const built = BUILDERS[family](c);
  const root = new THREE.Group();
  root.name = `medallion-${family}`;
  root.userData = { family, numeral, level };
  built.group.userData.part = "body";
  root.add(built.group);
  if (built.crown) { built.crown.userData.part = "crown"; root.add(built.crown); }

  if (numeral && !built.noNumeral) {
    const letters = metal(built.numeralColor || c.accent, 0.22, { clearcoat: 1, clearcoatRoughness: 0.06 });
    if (built.plaque) {
      const [px, py] = built.plaque;
      const w = 0.17 + numeral.length * 0.16;
      const plate = [[-w, 0.15], [w, 0.15], [w + 0.11, 0], [w, -0.15], [-w, -0.15], [-w - 0.11, 0]];
      const pg = new THREE.Group(); pg.position.set(px, py, 0);
      const [, pz] = layer(pg, shape(plate), built.plaqueZ, 0.04, 0.025, metal(c.rim, 0.12), enamel(c.enamel, { normalMap: bump("enamel-dome-s", "0", { dome: 0.12 }), normalScale: v2(1) }));
      const n = numeralMesh(numeral, 0.23, letters, 0.035, 0.009); n.position.z = pz; pg.add(n);
      pg.userData.part = "numeral";
      root.add(pg);
    } else {
      // as large as the centre allows, so the division reads at dashboard size
      const n = numeralMesh(numeral, { 1: 0.52, 2: 0.48, 3: 0.4 }[numeral.length] ?? 0.4, letters);
      n.position.set(built.centre[0], built.centre[1], built.face);
      n.userData.part = "numeral";
      root.add(n);
    }
  }

  if (!built.noDivision) {
    // each division step sets another pair of stones in the rim
    const bezel = metal(c.rim, 0.12, { clearcoat: 1 });
    const stoneMat = jewel(c.gem === P.DIAMOND.gem ? "#cdeeff" : c.gem, { glowAmt: 0.3, irid: 0.8, env: 3 });
    const count = [0, 2, 4, 4, 6][level];
    pairs(built.studs || [], count).forEach(([x, y]) => {
      const set = new THREE.Group(); set.position.set(x, y, built.studZ ?? built.face);
      layer(set, ring(circle(0.078, 48), circle(0.06, 48)), -0.01, 0.02, 0.01, bezel);
      const st = brilliant(0.062, stoneMat, 12); st.rotation.x = 0.0; st.position.z = 0.02; set.add(st);
      set.userData.part = "stone";
      root.add(set);
    });
    if (level >= 3) {
      const leafMat = metal(c.leaf, 0.16, { clearcoat: 0.6 });
      const wreath = laurel(1.2, leafMat, level >= 4 ? { from: -1.48, to: 0.62, leaves: 11, size: 0.12, z: -0.02 } : { from: -1.44, to: -0.2, leaves: 7, size: 0.115, z: -0.02 });
      wreath.userData.part = "laurel";
      root.add(wreath);
    }
    if (level >= 4 && built.top) {
      const [tx, ty] = built.top;
      // the crest: a large stone in a crown setting above the medallion
      const seat = new THREE.Group(); seat.position.set(tx, ty + 0.13, 0.04);
      const prong = metal(c.rim, 0.1, { clearcoat: 1 });
      const cp = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * TAU; const r = i % 2 ? 0.13 : 0.19; cp.push([Math.cos(a) * r, Math.sin(a) * r]); }
      layer(seat, shape(cp), -0.03, 0.04, 0.02, prong, metal(c.hi, 0.12));
      const stoneM = jewel(c.gem === P.DIAMOND.gem ? "#d6f2ff" : c.gem, { glowAmt: 0.24, irid: 0.9, env: 3.2 });
      const stone = brilliant(0.15, stoneM, 16); stone.position.z = 0.1; seat.add(stone);
      seat.userData.part = "crest";
      root.add(seat);
    }
  }
  return root;
}

function pairs(points, count) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < points.length && out.length < count; i++) {
    if (used.has(i)) continue;
    const [x, y] = points[i];
    const j = points.findIndex(([a, b], k) => k !== i && !used.has(k) && Math.abs(a + x) < 1e-3 && Math.abs(b - y) < 1e-3);
    if (j < 0) continue;
    used.add(i); used.add(j); out.push(points[i], points[j]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// public: a jeweller's studio -- a black room with a few softboxes. Metal
// reads as metal when it reflects contrast, not a white room.
// ---------------------------------------------------------------------------
function studioRoom(boxes = 1, sparkle = 1) {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: "#050507", side: THREE.BackSide })));
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k * boxes), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); room.add(m);
  };
  panel(9, 6, "#fff2e2", 3.0, [-7, 7, 8]);     // warm key, top left
  panel(4, 10, "#dfe9ff", 1.5, [9, 1, 5]);     // cool strip, right
  panel(14, 2, "#ffffff", 2.4, [0, 10, -3]);   // top rim strip
  panel(10, 3, "#ffe6c8", 0.6, [0, -9, 6]);    // floor bounce
  panel(3, 3, "#ffffff", 4.0, [3, 5, 10]);     // sparkle box
  panel(18, 12, "#fff8ef", 0.5, [0, 3, 16]);   // big soft front box
  // a field of small point lights: what makes facets and polished edges sparkle
  for (let i = 0; i < 40; i++) {
    const a = hash(i, 1) * TAU, e = 0.15 + hash(i, 2) * 1.2, r = 15;
    const pos = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * (hash(i, 3) > 0.25 ? 1 : -0.4), Math.abs(Math.sin(a)) * r * 0.6 + 4];
    panel(0.5 + hash(i, 4) * 0.6, 0.5 + hash(i, 5) * 0.6, "#ffffff", (6 + hash(i, 6) * 8) * sparkle / boxes, pos);
  }
  return room;
}

// boxes / sparkle scale the softboxes and the small sparkle lights: the stills
// use the full studio; the cut scene, where the medallion fills the screen and
// bright reflections bloom, uses a gentler one.
// envSize: the resolution of the reflected studio. Polished metal is a mirror,
// so a low one (three's default 256) shows up as blocks in the reflections.
export function makeStudio(renderer, { exposure = 1.0, shadows = true, boxes = 1, sparkle = 1, envSize = 1024 } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // the surface-map generator draws on this renderer
  if (!GPU || GPU.renderer !== renderer) {
    CACHE.clear();
    const quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false; quadScene.add(quad);
    const half = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    GPU = { renderer, scene: quadScene, camera: new THREE.Camera(), quad, half, gemEnv: null };
  }
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioRoom(boxes, sparkle), 0.02, 0.1, 100, { size: envSize }).texture;
  GPU.gemEnv ??= pmrem.fromScene(studioRoom(1.15, 1.8), 0, 0.1, 100, { size: Math.min(envSize, 1024) }).texture;
  const key = new THREE.DirectionalLight("#fff4e6", 2.4); key.position.set(-2.5, 3.5, 6);
  key.castShadow = shadows; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 15 });
  scene.add(key);
  const fill = new THREE.DirectionalLight("#cfe0ff", 0.6); fill.position.set(4, -1, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight("#ffffff", 1.2); rim.position.set(0, 3, -4); scene.add(rim);
  return { scene, lights: { key, fill, rim } };
}

export { THREE };
