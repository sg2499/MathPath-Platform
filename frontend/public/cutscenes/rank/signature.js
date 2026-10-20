// 2026-10-20 (rank revamp, Part 3): each rank's signature moment, at the strike.
//   Copper: anvil sparks.  Bronze: the shield rings out.  Silver: frost.
//   Gold: a sunburst.  Platinum: the core ignites.  Emerald: crystals grow.
//   Diamond: a prism throws rainbows.  Champion: red lightning, and the crown descends.
// Everything is drawn on the GPU: particle physics run in the vertex shader
// from a start position, a velocity and a birth time, so no frame allocates
// or moves a single particle on the CPU.
import * as THREE from "three";

let SEED = 1;
const rnd = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, at, dur) => clamp((t - at) / dur);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const back = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

// ---------------------------------------------------------------------------
// streaks: sparks and shards, drawn as quads stretched along their motion
// ---------------------------------------------------------------------------
const PHYS = /* glsl */ `
uniform float uTime, uDrag, uTail; uniform vec3 uGrav;
vec3 at(vec3 p0, vec3 v, float a) { float k = uDrag > 0.0 ? (1.0 - exp(-uDrag * a)) / uDrag : a; return p0 + v * k + 0.5 * uGrav * a * a; }
`;
function streaks(count, emit, { drag = 1.2, grav = [0, -4.5, 0], tail = 0.045, gain = 3.2 } = {}) {
  const base = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);   // x: tail 0 -> head 1, y: -1..1
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position;
  const P0 = new Float32Array(count * 3), V = new Float32Array(count * 3), TT = new Float32Array(count * 4), C = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const e = emit(i);
    P0.set(e.p, i * 3); V.set(e.v, i * 3); TT.set([e.birth, e.life, e.size, rnd()], i * 4); C.set(e.color, i * 3);
  }
  g.setAttribute("aP0", new THREE.InstancedBufferAttribute(P0, 3));
  g.setAttribute("aV", new THREE.InstancedBufferAttribute(V, 3));
  g.setAttribute("aT", new THREE.InstancedBufferAttribute(TT, 4));
  g.setAttribute("aC", new THREE.InstancedBufferAttribute(C, 3));
  g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDrag: { value: drag }, uTail: { value: tail }, uGrav: { value: new THREE.Vector3(...grav) }, uPx: { value: 0.002 }, uAspect: { value: 1 }, uGain: { value: gain }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      ${PHYS}
      attribute vec3 aP0, aV, aC; attribute vec4 aT;
      uniform float uPx, uAspect;
      varying vec2 vUv; varying float vFade; varying vec3 vCol;
      void main() {
        float age = uTime - aT.x, life = aT.y;
        float a1 = clamp(age, 0.0, life), a0 = max(0.0, a1 - uTail);
        vec4 ch = projectionMatrix * modelViewMatrix * vec4(at(aP0, aV, a1), 1.0);
        vec4 ct = projectionMatrix * modelViewMatrix * vec4(at(aP0, aV, a0), 1.0);
        vec2 sh = ch.xy / ch.w, st = ct.xy / ct.w;
        vec2 d = (sh - st) * vec2(uAspect, 1.0); float len = length(d); d = len > 1e-6 ? d / len : vec2(1.0, 0.0);
        vec2 n = vec2(-d.y, d.x);
        float w = aT.z * uPx;
        vec4 c = mix(ct, ch, position.x);
        vec2 off = (n * position.y + d * (position.x * 2.0 - 1.0)) * w;
        c.xy += off / vec2(uAspect, 1.0) * c.w;
        vUv = vec2(position.x, position.y);
        vFade = (age < 0.0 || age > life) ? 0.0 : pow(1.0 - age / life, 1.3);
        vCol = aC; gl_Position = c;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain, uAlpha; varying vec2 vUv; varying float vFade; varying vec3 vCol;
      void main() {
        float a = (1.0 - vUv.y * vUv.y) * mix(0.15, 1.0, vUv.x);
        vec3 c = mix(vCol, vec3(1.0), smoothstep(0.6, 1.0, vUv.x) * (1.0 - abs(vUv.y)) * 0.7);
        gl_FragColor = vec4(c * uGain, a * vFade * uAlpha);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  return mesh;
}

// soft or star-shaped points with the same physics (dust, frost flakes)
function motes(count, emit, { drag = 1.4, grav = [0, 0, 0], star = false, gain = 1.4 } = {}) {
  const g = new THREE.BufferGeometry();
  const P0 = new Float32Array(count * 3), V = new Float32Array(count * 3), TT = new Float32Array(count * 4), C = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const e = emit(i);
    P0.set(e.p, i * 3); V.set(e.v, i * 3); TT.set([e.birth, e.life, e.size, rnd() * 6.28], i * 4); C.set(e.color, i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(P0, 3));
  g.setAttribute("aV", new THREE.BufferAttribute(V, 3));
  g.setAttribute("aT", new THREE.BufferAttribute(TT, 4));
  g.setAttribute("aC", new THREE.BufferAttribute(C, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDrag: { value: drag }, uTail: { value: 0 }, uGrav: { value: new THREE.Vector3(...grav) }, uScale: { value: 600 }, uGain: { value: gain }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      ${PHYS}
      attribute vec3 aV, aC; attribute vec4 aT; uniform float uScale;
      varying float vFade, vRot; varying vec3 vCol;
      void main() {
        float age = uTime - aT.x, life = aT.y, k = clamp(age / life, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(at(position, aV, clamp(age, 0.0, life)), 1.0);
        gl_PointSize = aT.z * uScale / -mv.z * (0.6 + 0.4 * smoothstep(0.0, 0.15, k));
        vFade = (age < 0.0 || age > life) ? 0.0 : smoothstep(0.0, 0.08, k) * pow(1.0 - k, 1.2);
        vRot = aT.w + age * 0.8; vCol = aC;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain, uAlpha; varying float vFade, vRot; varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        ${star ? `float an = atan(d.y, d.x) + vRot;
        float arms = pow(abs(cos(3.0 * an)), 14.0) * smoothstep(1.0, 0.1, r) + smoothstep(0.32, 0.0, r);
        float a = clamp(arms, 0.0, 1.0);` : `float a = smoothstep(1.0, 0.0, r); a *= a;`}
        gl_FragColor = vec4(vCol * uGain, a * vFade * uAlpha);
      }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  return p;
}

// a flat ring wave in the medallion's plane
function ringWave(color, { width = 0.035, gain = 2.2 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, alpha: { value: 0 }, width: { value: width }, gain: { value: gain } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 color; uniform float alpha, width, gain; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float band = exp(-pow((r - 0.92) / width, 2.0)) + 0.4 * exp(-pow((r - 0.86) / (width * 2.6), 2.0)); gl_FragColor = vec4(color * gain, band * alpha); }",
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
}

// light behind the medallion: rays (Gold) or a spectral fan (Diamond)
function rays({ color = "#ffd34d", count = 28, spectral = false, size = 14 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uOpen: { value: 1 }, color: { value: new THREE.Color(color) } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmt, uOpen; uniform vec3 color; varying vec2 vP;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x);
        float n = ${count.toFixed(1)};
        float s = 0.5 + 0.5 * sin(a * n + uTime * 0.35) * (0.7 + 0.3 * sin(a * 3.0 - uTime * 0.2));
        float beam = pow(s, ${spectral ? "9.0" : "7.0"} / uOpen);
        float fall = exp(-r * ${spectral ? "0.42" : "0.55"}) * smoothstep(0.55, 1.3, r);
        vec3 c = ${spectral ? "hue(fract(a / 6.2832 * 2.0 + r * 0.06 + uTime * 0.03)) * 1.6 + 0.25" : "color * 1.6 + vec3(0.15)"};
        gl_FragColor = vec4(c, beam * fall * uAmt);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
}

// a glowing ribbon along a polyline (lightning), rebuilt for each bolt
function bolt(maxPts = 80) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(maxPts * 2 * 3), side = new Float32Array(maxPts * 2), along = new Float32Array(maxPts * 2);
  const idx = [];
  for (let i = 0; i < maxPts - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  g.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAlpha: { value: 0 }, color: { value: new THREE.Color("#ff2448") } },
    vertexShader: "attribute float aSide, aAlong; varying float vS, vA; void main(){ vS = aSide; vA = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uAlpha; uniform vec3 color; varying float vS, vA; void main(){ float core = exp(-vS * vS * 18.0); float glow = exp(-vS * vS * 2.5) * 0.6; vec3 c = color * 4.0 * glow + vec3(1.0, 0.85, 0.9) * 5.0 * core; gl_FragColor = vec4(c, (core + glow) * uAlpha * (0.6 + 0.4 * vA)); }",
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  mesh.userData.shape = (from, to, width, seed) => {
    SEED = seed;
    let pts = [from, to];
    let amp = Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.22;
    while (pts.length * 2 - 1 <= maxPts) {          // midpoint displacement: a jagged, natural bolt
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, o = (rnd() * 2 - 1) * amp;
        next.push([(ax + bx) / 2 - (dy / l) * o, (ay + by) / 2 + (dx / l) * o], pts[i]);
      }
      pts = next; amp *= 0.52;
    }
    const n = Math.min(maxPts, pts.length);
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i], [px, py] = pts[Math.max(0, i - 1)], [nx, ny] = pts[Math.min(n - 1, i + 1)];
      const dx = nx - px, dy = ny - py, l = Math.hypot(dx, dy) || 1;
      const w = width * (0.35 + 0.65 * (1 - i / n));
      for (const s of [-1, 1]) {
        const k = i * 2 + (s > 0 ? 1 : 0);
        pos[k * 3] = x + (-dy / l) * w * s; pos[k * 3 + 1] = y + (dx / l) * w * s; pos[k * 3 + 2] = 0.9;
        side[k] = s; along[k] = 1 - i / n;
      }
    }
    g.setDrawRange(0, (n - 1) * 6);
    g.attributes.position.needsUpdate = true; g.attributes.aSide.needsUpdate = true; g.attributes.aAlong.needsUpdate = true;
  };
  return mesh;
}

const col = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ---------------------------------------------------------------------------
// the eight moments
// ---------------------------------------------------------------------------
export function signature(family, T, { light = false, glowTex } = {}) {
  SEED = 97 + family.length * 31;
  const S = T.strike;
  const group = new THREE.Group();
  const front = new THREE.Group(); front.position.z = 0.6; group.add(front);
  const behind = new THREE.Group(); behind.position.z = -0.9; group.add(behind);
  const q = light ? 0.5 : 1;                       // the light version draws fewer particles
  const updates = [];
  const sized = [];                                // particle systems told the screen size
  const add = (o, parent = front) => { parent.add(o); if (o.material?.uniforms?.uPx || o.material?.uniforms?.uScale) sized.push(o); return o; };
  const tick = (o, from = 0) => updates.push((t) => { o.material.uniforms.uTime.value = t - from; });

  if (family === "COPPER") {
    // the hammer meets the anvil: white-hot sparks spray and fall
    const hot = col("#fff1c9"), orange = col("#ff7a1a");
    const sp = add(streaks(Math.round(340 * q), (i) => {
      const a = rnd() * Math.PI * 2, up = rnd();
      const sp = 2.2 + rnd() * 5.2;
      return { p: [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0], v: [Math.cos(a) * sp, Math.sin(a) * sp * 0.75 + up * 2.6, (rnd() - 0.3) * 1.5],
        birth: S + rnd() * 0.07 + (i % 7 === 0 ? 0.25 + rnd() * 0.5 : 0), life: 0.5 + rnd() * 1.0, size: 1.4 + rnd() * 2.2, color: mixc(hot, orange, rnd() * 0.8) };
    }, { drag: 1.1, grav: [0, -6.5, 0], tail: 0.05, gain: 3.4 }));
    tick(sp);
  }

  if (family === "BRONZE") {
    // the shield rings out: ripples like a struck gong, and a breath of dust
    const rings = [0, 0.14, 0.32].map((d, i) => {
      const r = add(ringWave("#ffb547", { width: 0.03 + i * 0.012, gain: 2.4 - i * 0.5 }), group);
      r.position.z = 0.3;
      updates.push((t) => { const p = prog(t, S + d, 1.1 + i * 0.25); r.scale.setScalar(0.9 + easeOut(p) * (3.6 + i)); r.material.uniforms.alpha.value = p > 0 && p < 1 ? Math.pow(1 - p, 1.4) * (0.9 - i * 0.22) : 0; });
      return r;
    });
    const dust = add(motes(Math.round(150 * q), () => {
      const a = rnd() * Math.PI * 2, r0 = 0.9 + rnd() * 0.25, sp = 0.8 + rnd() * 1.6;
      return { p: [Math.cos(a) * r0, Math.sin(a) * r0, (rnd() - 0.5) * 0.4], v: [Math.cos(a) * sp, Math.sin(a) * sp + 0.2, (rnd() - 0.5) * 0.4],
        birth: S + rnd() * 0.12, life: 1.6 + rnd() * 1.6, size: 0.18 + rnd() * 0.3, color: mixc(col("#c58a3e"), col("#ffe0a8"), rnd()) };
    }, { drag: 1.6, grav: [0, 0.25, 0], gain: 0.55 }));
    tick(dust);
    void rings;
  }

  if (family === "SILVER") {
    // frost: shards of ice fly, then flakes bloom out and drift
    const ice = add(streaks(Math.round(140 * q), () => {
      const a = rnd() * Math.PI * 2, sp = 3 + rnd() * 6;
      return { p: [0, 0, 0], v: [Math.cos(a) * sp, Math.sin(a) * sp, (rnd() - 0.5) * 2], birth: S + rnd() * 0.05, life: 0.35 + rnd() * 0.5, size: 1.2 + rnd() * 1.6, color: mixc(col("#ffffff"), col("#7fd6ff"), rnd() * 0.7) };
    }, { drag: 3.2, grav: [0, 0, 0], tail: 0.035, gain: 3.0 }));
    tick(ice);
    const flakes = add(motes(Math.round(240 * q), () => {
      const a = rnd() * Math.PI * 2, r0 = 0.5 + rnd() * 0.7, sp = 0.4 + rnd() * 1.5;
      return { p: [Math.cos(a) * r0, Math.sin(a) * r0, (rnd() - 0.5) * 0.6], v: [Math.cos(a) * sp, Math.sin(a) * sp, (rnd() - 0.5) * 0.5],
        birth: S + 0.03 + rnd() * 0.5, life: 1.8 + rnd() * 2.2, size: 0.1 + Math.pow(rnd(), 2) * 0.22, color: mixc(col("#ffffff"), col("#9fe3ff"), rnd()) };
    }, { drag: 1.3, grav: [0, -0.18, 0], star: true, gain: 1.6 }));
    tick(flakes);
    const mist = add(ringWave("#bfefff", { width: 0.09, gain: 1.2 }), group); mist.position.z = 0.2;
    updates.push((t) => { const p = prog(t, S + 0.04, 1.6); mist.scale.setScalar(1 + easeOut(p) * 3.4); mist.material.uniforms.alpha.value = p > 0 && p < 1 ? Math.pow(1 - p, 1.6) * 0.7 : 0; });
  }

  if (family === "GOLD") {
    // a sunburst behind the star: rays flare at the strike and keep turning
    const r = add(rays({ color: "#ffd34d", count: 26 }), behind);
    updates.push((t) => { r.material.uniforms.uTime.value = t; const flare = Math.exp(-Math.max(0, t - S) * 2.2) * (t > S ? 1 : 0); r.material.uniforms.uAmt.value = clamp(prog(t, S - 0.05, 0.12)) * (0.12 + 0.75 * flare); r.rotation.z = t * 0.05; });
    const motesG = add(motes(Math.round(90 * q), () => {
      const a = rnd() * Math.PI * 2, sp = 0.6 + rnd() * 2.2;
      return { p: [0, 0, 0.2], v: [Math.cos(a) * sp, Math.sin(a) * sp, 0], birth: S + rnd() * 0.2, life: 1.2 + rnd() * 1.5, size: 0.05 + rnd() * 0.08, color: col("#fff2b8") };
    }, { drag: 1.2, gain: 2.6 }));
    tick(motesG);
  }

  if (family === "PLATINUM") {
    // the core ignites: a violet flare, then two rings of light take orbit
    const mk = (radius, tilt, spin) => {
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uHead: { value: 0 } },
        vertexShader: "varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uA, uHead; varying float vU; void main(){ float d = fract(vU - uHead); float trail = pow(1.0 - d, 2.5); gl_FragColor = vec4(vec3(0.75, 0.45, 1.0) * 3.2 * (0.35 + trail), uA * (0.25 + 0.75 * trail)); }" });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.011, 8, 220), m);
      const holder = new THREE.Group(); holder.rotation.set(tilt[0], tilt[1], 0); holder.add(ring);
      group.add(holder);
      updates.push((t) => { const p = prog(t, S, 0.5); ring.scale.setScalar(lerp(0.3, 1, easeOut(p))); m.uniforms.uA.value = p > 0 ? 0.95 * easeOut(p) : 0; m.uniforms.uHead.value = (t - S) * spin; ring.rotation.z = (t - S) * spin * 0.6; });
    };
    mk(1.42, [1.2, 0.35], 0.55); mk(1.6, [-1.05, -0.5], -0.42);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#c58bff", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    flare.position.z = 0.7; group.add(flare);
    updates.push((t) => { const k = t > S - 0.15 ? Math.exp(-Math.max(0, t - S) * 3) * clamp(prog(t, S - 0.15, 0.15)) : 0; flare.material.opacity = k * 0.9; flare.scale.setScalar(0.6 + k * 4.5); });
    const arcs = add(streaks(Math.round(110 * q), () => {
      const a = rnd() * Math.PI * 2, sp = 2 + rnd() * 3;
      return { p: [0, 0, 0], v: [Math.cos(a) * sp, Math.sin(a) * sp, 0], birth: S + rnd() * 0.12, life: 0.4 + rnd() * 0.5, size: 1.1 + rnd() * 1.2, color: mixc(col("#e6ccff"), col("#a855f7"), rnd()) };
    }, { drag: 2.2, grav: [0, 0, 0], gain: 3.2 }));
    tick(arcs);
  }

  if (family === "EMERALD") {
    // crystals grow out from behind the crown setting, one after another
    const mat = new THREE.MeshPhysicalMaterial({ color: "#0fae6e", metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0, emissive: "#077a48", emissiveIntensity: 0.3, flatShading: true, envMapIntensity: 2.6, iridescence: 0.35, iridescenceIOR: 1.8 });
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.7 + (rnd() - 0.5) * 0.12;
      const len = 0.7 + rnd() * 0.7, w = 0.13 + rnd() * 0.09;
      const geo = new THREE.CylinderGeometry(0, w, len, 6, 1).translate(0, len / 2, 0);
      const c = new THREE.Mesh(geo, mat);
      const holder = new THREE.Group(); holder.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, -0.25 - rnd() * 0.2); holder.rotation.z = a - Math.PI / 2; holder.add(c);
      group.add(holder);
      const at = S + 0.05 + i * 0.05 + rnd() * 0.05;
      updates.push((t) => { const p = prog(t, at, 0.42); c.visible = p > 0; c.scale.set(Math.max(1e-4, easeOut(p)), Math.max(1e-4, back(p, 1.8)), Math.max(1e-4, easeOut(p))); });
    }
    const glints = add(motes(Math.round(70 * q), () => {
      const a = Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.7, r0 = 1.0 + rnd() * 0.6;
      return { p: [Math.cos(a) * r0, Math.sin(a) * r0, 0.1], v: [Math.cos(a) * 0.3, Math.sin(a) * 0.3 + 0.2, 0], birth: S + 0.15 + rnd() * 0.8, life: 0.7 + rnd() * 1.0, size: 0.06 + rnd() * 0.07, color: col("#b8ffd9") };
    }, { drag: 1.0, star: true, gain: 2.4 }));
    tick(glints);
  }

  if (family === "DIAMOND") {
    // the stone catches the light and throws a fan of rainbows
    const fan = add(rays({ count: 7, spectral: true, size: 16 }), behind);
    updates.push((t) => { fan.material.uniforms.uTime.value = t; const p = prog(t, S - 0.02, 0.5); const flare = t > S ? Math.exp(-(t - S) * 1.4) : 0; fan.material.uniforms.uAmt.value = easeOut(p) * (0.28 + 0.7 * flare); fan.material.uniforms.uOpen.value = 0.35 + easeOut(p) * 0.65; fan.rotation.z = 0.3 - (t - S) * 0.08; });
    const prism = add(ringWave("#ffffff", { width: 0.05, gain: 1.6 }), group); prism.position.z = 0.4;
    prism.material.fragmentShader = "uniform vec3 color; uniform float alpha, width, gain; varying vec2 vUv; vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); } void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float band = exp(-pow((r - 0.9) / width, 2.0)); gl_FragColor = vec4(hue(fract(r * 2.0 + atan(d.y, d.x) / 6.2832)) * gain * 1.6, band * alpha); }";
    updates.push((t) => { const p = prog(t, S, 1.2); prism.scale.setScalar(0.9 + easeOut(p) * 4); prism.material.uniforms.alpha.value = p > 0 && p < 1 ? Math.pow(1 - p, 1.3) : 0; });
    const fire = add(motes(Math.round(120 * q), () => {
      const a = rnd() * Math.PI * 2, sp = 0.8 + rnd() * 2.6;
      const h = rnd(); const c = new THREE.Color().setHSL(h, 1, 0.7);
      return { p: [0, 0.2, 0.4], v: [Math.cos(a) * sp, Math.sin(a) * sp, 0], birth: S + rnd() * 0.25, life: 0.9 + rnd() * 1.4, size: 0.05 + rnd() * 0.08, color: [c.r, c.g, c.b] };
    }, { drag: 1.3, star: true, gain: 2.6 }));
    tick(fire);
  }

  if (family === "CHAMPION") {
    // red lightning: bolts strike the crest at the hit, again as it settles,
    // and once more as the crown comes down onto it
    const strikes = [
      { at: S - 0.04, from: [-2.6, 4.2], to: [-0.1, 0.6], w: 0.13 }, { at: S - 0.02, from: [2.8, 4.0], to: [0.15, 0.5], w: 0.11 },
      { at: S + 0.42, from: [-3.4, 2.4], to: [-0.6, 0.1], w: 0.09 }, { at: T.crest + 0.3, from: [0.4, 4.5], to: [0, 1.25], w: 0.13 },
      { at: T.crest + 0.36, from: [3.3, 2.0], to: [0.55, 1.0], w: 0.08 },
    ];
    const bolts = strikes.map((s, i) => { const b = bolt(); b.userData.shape(s.from, s.to, s.w, 1000 + i * 77); group.add(b); return b; });
    updates.push((t) => {
      strikes.forEach((s, i) => {
        const d = t - s.at;
        const on = d > 0 && d < 0.42 ? Math.exp(-d * 6) * (0.55 + 0.45 * Math.abs(Math.sin(d * 85 + i))) : 0;
        if (on > 0 && Math.floor(d * 24) !== bolts[i].userData.frame) { bolts[i].userData.frame = Math.floor(d * 24); bolts[i].userData.shape(s.from, s.to, s.w, 1000 + i * 77 + bolts[i].userData.frame * 13); }
        bolts[i].material.uniforms.uAlpha.value = on;
      });
    });
    const embers = add(streaks(Math.round(160 * q), () => {
      const a = rnd() * Math.PI * 2, sp = 2 + rnd() * 5;
      return { p: [0, 0.2, 0], v: [Math.cos(a) * sp, Math.sin(a) * sp + 1.2, (rnd() - 0.5)], birth: S + rnd() * 0.08, life: 0.5 + rnd() * 0.9, size: 1.2 + rnd() * 1.8, color: mixc(col("#ffd36b"), col("#ff1f4b"), rnd()) };
    }, { drag: 1.4, grav: [0, -3.5, 0], gain: 3.4 }));
    tick(embers);
  }

  return {
    group,
    update(t) { for (const u of updates) u(t); },
    size(heightPx, aspect, pixelRatio) {
      for (const o of sized) {
        const u = o.material.uniforms;
        if (u.uPx) { u.uPx.value = (2 / (heightPx * pixelRatio)) * pixelRatio; u.uAspect.value = aspect; }
        if (u.uScale) u.uScale.value = heightPx * pixelRatio * 0.9;
      }
    },
  };
}
