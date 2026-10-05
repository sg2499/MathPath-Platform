// The 3D sign-in stage: one renderer and one camera, with a scene per role seen from three distances.
//   student  up close        a working soroban, with operators and numbers drifting around it
//   teacher  the classroom   fine rails, one softly lit bead per learner, level gates, a guiding light
//   admin    the institution modules as columns, levels as tiers, work moving through as light
// This module is loaded lazily, after the form is usable, so three.js never delays sign-in.
// It renders only while something is moving, and at half rate when only gentle drift is left.

import * as THREE from "three";
import { LOGIN_ROLES, RODS, ROLE_PALETTE } from "./shared";
import type { BeadKind, BeadTapHandler, DigitOptions, LoginRole, StageSignal } from "./shared";

interface SceneSize {
  w: number;
  h: number;
  floor: number;
}

interface LightLook {
  hemi: number;
  key: number;
  rim: number;
  fill: number;
  shadow: number;
  glow: number;
  rimColor: string;
  glowColor: string;
}

interface Tilt {
  x: number;
  y: number;
}

interface PointerState {
  ray: THREE.Ray | null;
  fresh: boolean;
  inside: boolean;
  at: number;
  nx: number;
  ny: number;
}

interface RoleScene {
  group: THREE.Group;
  size: SceneSize;
  base: { rx: number; ry: number };
  setLook(dark: boolean): void;
  lights(dark: boolean): LightLook;
  update(dt: number, time: number, tilt: Tilt, pointer: PointerState): void;
  layout(distance: number, aspect: number): void;
  setActive(active: boolean): void;
  signal(kind: StageSignal): void;
  hover(ray: THREE.Raycaster | null): boolean;
  click(ray: THREE.Raycaster): void;
}

interface StudentScene extends RoleScene {
  setDigits(digits: number[], options?: DigitOptions): void;
}

interface SceneContext {
  camera: THREE.PerspectiveCamera;
  poke(ms: number): void;
  roundedRect(w: number, h: number, r: number): THREE.Shape;
  radial(stops: Array<[number, string]>): THREE.CanvasTexture;
  onBead: BeadTapHandler;
}

export interface Stage3D {
  show(role: LoginRole, dark: boolean, instant?: boolean): void;
  fit(): void;
  run(active: boolean): void;
  setDigits(digits: number[], options?: DigitOptions): void;
  signal(kind: StageSignal): void;
  dispose(): void;
}

export interface Stage3DOptions {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  slot: HTMLElement;
  reducedMotion: boolean;
  /** Skip the software-renderer and frame-rate checks (used for QA only). */
  force: boolean;
  onBead: BeadTapHandler;
  /** Called once if the scene cannot hold a usable frame rate; the caller falls back to the illustrated stage. */
  onSlow(): void;
}

// three.js lights are in physical units; these scales keep the look tuned in the design preview.
const SUN_LIGHT_SCALE = Math.PI;
const RIM_LIGHT_SCALE = 90;
const FILL_LIGHT_SCALE = 70;
const GUIDE_LIGHT_SCALE = 2.6;

const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);

/* ------------------------------------------------------------------ student ------------------------------------------------------------------ */

interface Bead {
  mesh: THREE.Mesh;
  rod: number;
  kind: BeadKind;
  index: number;
  on: number;
  off: number;
  y: number;
  v: number;
  target: number;
  delay: number;
  min: number;
  max: number;
  hover: boolean;
}

interface Floater {
  object: THREE.Object3D;
  u: number;
  v: number;
  depth: number;
  frac: number;
  spin: number;
  phase: number;
  sprite: boolean;
  baseX: number;
  baseY: number;
  distance: number;
  amp: number;
}

function createStudentScene(ctx: SceneContext): StudentScene {
  const palette = ROLE_PALETTE.student;
  const group = new THREE.Group();
  const abacus = new THREE.Group();
  group.add(abacus);

  const innerWidth = 7.3;
  const heavenHeight = 0.95;
  const beamHeight = 0.16;
  const earthHeight = 2.2;
  const frameBar = 0.3;
  const beadPitch = 0.42;
  const yTop = beamHeight / 2 + heavenHeight;
  const yBottom = -(beamHeight / 2 + earthHeight);
  const innerHeight = yTop - yBottom;
  const centreY = (yTop + yBottom) / 2;
  const outerWidth = innerWidth + 2 * frameBar;
  const outerHeight = innerHeight + 2 * frameBar;
  abacus.position.y = -centreY;

  const beadMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
  beadMaterial.emissiveIntensity = 0;
  const heavenMaterial = beadMaterial.clone();
  const frameMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.36, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.22 });
  const beamMaterial = frameMaterial.clone();
  const rodMaterial = new THREE.MeshStandardMaterial({ roughness: 0.26, metalness: 0.92 });
  const dotMaterial = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 });
  const opA = beadMaterial.clone();
  const opB = beadMaterial.clone();
  const opC = beadMaterial.clone();
  const materials: Record<string, THREE.MeshStandardMaterial> = {
    bead: beadMaterial,
    heaven: heavenMaterial,
    frame: frameMaterial,
    beam: beamMaterial,
    rod: rodMaterial,
    dot: dotMaterial,
    opA,
    opB,
    opC,
  };
  const glossy = [beadMaterial, heavenMaterial, opA, opB, opC];
  const targets: Record<string, THREE.Color> = {};
  let looked = false;

  const outer = ctx.roundedRect(outerWidth, outerHeight, 0.3);
  outer.holes.push(ctx.roundedRect(innerWidth + 0.1, innerHeight + 0.1, 0.07));
  const frameGeometry = new THREE.ExtrudeGeometry(outer, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 5, curveSegments: 14 });
  frameGeometry.translate(0, centreY, -0.4);
  const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  abacus.add(frameMesh);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(innerWidth, beamHeight, 0.56), beamMaterial);
  beam.castShadow = true;
  beam.receiveShadow = true;
  abacus.add(beam);
  [0, 3, 6].forEach((rod) => {
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 20), dotMaterial);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(3 - rod, 0, 0.285);
    abacus.add(dot);
  });

  // A soroban bead is a double cone; the extra points round its rim so it catches the light.
  const profile = [
    [0.07, -0.198], [0.13, -0.204], [0.175, -0.19], [0.375, -0.048], [0.412, -0.018], [0.42, 0],
    [0.412, 0.018], [0.375, 0.048], [0.175, 0.19], [0.13, 0.204], [0.07, 0.198],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const beadGeometry = new THREE.LatheGeometry(profile, 64);
  const beads: Bead[] = [];
  const beadMeshes: THREE.Mesh[] = [];
  const heavenBeads: Bead[] = [];
  const earthBeads: Bead[][] = [];

  function addBead(x: number, off: number, on: number, material: THREE.Material, rod: number, kind: BeadKind, index: number): Bead {
    const mesh = new THREE.Mesh(beadGeometry, material);
    mesh.position.set(x, off, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    abacus.add(mesh);
    const bead: Bead = { mesh, rod, kind, index, on, off, y: off, v: 0, target: off, delay: 0, min: Math.min(on, off), max: Math.max(on, off), hover: false };
    mesh.userData.bead = bead;
    beads.push(bead);
    beadMeshes.push(mesh);
    return bead;
  }

  for (let rod = 0; rod < RODS; rod += 1) {
    const x = 3 - rod;
    const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, innerHeight, 14), rodMaterial);
    rodMesh.position.set(x, centreY, 0);
    rodMesh.castShadow = true;
    abacus.add(rodMesh);
    heavenBeads.push(addBead(x, yTop - beadPitch / 2, beamHeight / 2 + beadPitch / 2, heavenMaterial, rod, "h", 0));
    const column: Bead[] = [];
    for (let i = 0; i < 4; i += 1) {
      column.push(addBead(x, yBottom + beadPitch / 2 + (3 - i) * beadPitch, -(beamHeight / 2 + beadPitch / 2) - i * beadPitch, beadMaterial, rod, "e", i));
    }
    earthBeads.push(column);
  }

  // The world around the abacus: chunky operators and soft numbers drifting at different depths, stars at night.
  // They are parented to the camera so each one keeps its place on screen at any stage size.
  const hud = new THREE.Group();
  hud.visible = false;
  ctx.camera.add(hud);
  const barCache: Record<string, THREE.ExtrudeGeometry> = {};
  const bar = (w: number, h: number) => {
    const key = `${w}x${h}`;
    if (!barCache[key]) {
      const geometry = new THREE.ExtrudeGeometry(ctx.roundedRect(w, h, Math.min(w, h) * 0.46), { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 });
      geometry.translate(0, 0, -0.13);
      barCache[key] = geometry;
    }
    return barCache[key];
  };
  const dotGeometry = new THREE.SphereGeometry(0.17, 20, 16);
  function operator(kind: string, material: THREE.Material): THREE.Group {
    const shape = new THREE.Group();
    const add = (w: number, h: number, x = 0, y = 0, turn = 0) => {
      const mesh = new THREE.Mesh(bar(w, h), material);
      mesh.position.set(x, y, 0);
      mesh.rotation.z = turn;
      shape.add(mesh);
    };
    if (kind === "+") {
      add(1, 0.3);
      add(0.3, 1);
    } else if (kind === "-") {
      add(1, 0.3);
    } else if (kind === "x") {
      add(1, 0.3, 0, 0, Math.PI / 4);
      add(1, 0.3, 0, 0, -Math.PI / 4);
    } else if (kind === "=") {
      add(1, 0.27, 0, 0.23);
      add(1, 0.27, 0, -0.23);
    } else {
      add(1, 0.26);
      [0.42, -0.42].forEach((y) => {
        const dot = new THREE.Mesh(dotGeometry, material);
        dot.position.y = y;
        shape.add(dot);
      });
    }
    return shape;
  }

  const floaters: Floater[] = [];
  const digitSprites: Array<{ material: THREE.SpriteMaterial; text: string }> = [];
  const place = (object: THREE.Object3D, u: number, v: number, depth: number, frac: number, spin: number, sprite: boolean) => {
    hud.add(object);
    floaters.push({ object, u, v, depth, frac, spin, sprite, phase: floaters.length * 1.9, baseX: 0, baseY: 0, distance: 0, amp: 0 });
  };
  place(operator("x", opA), 0.055, 0.095, 0.25, 0.105, 1, false);
  place(operator("+", opB), 0.945, 0.11, 0.5, 0.115, -1, false);
  place(operator("-", opB), 0.012, 0.47, 0.4, 0.1, -1, false);
  place(operator("=", opA), 0.99, 0.4, 0.35, 0.095, 1, false);
  place(operator("/", opC), 0.29, 0.05, 0.6, 0.075, 1, false);
  place(operator("+", opC), 0.73, 0.045, 0.9, 0.07, 1, false);
  ([["7", 0.505, 0.05, 1.1, 0.14], ["3", 0.915, 0.66, 1.0, 0.13]] as Array<[string, number, number, number, number]>).forEach(([text, u, v, depth, frac]) => {
    const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 });
    digitSprites.push({ material, text });
    place(new THREE.Sprite(material), u, v, depth, frac, 0, true);
  });
  function drawDigits() {
    digitSprites.forEach((digit) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = '900 180px Gabarito, "Trebuchet MS", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#fff";
      context.shadowColor = "#fff";
      context.shadowBlur = 14;
      context.fillText(digit.text, 128, 136);
      digit.material.map?.dispose();
      digit.material.map = new THREE.CanvasTexture(canvas);
      digit.material.needsUpdate = true;
    });
    ctx.poke(200);
  }
  drawDigits();
  if (typeof document !== "undefined" && document.fonts?.load) {
    document.fonts.load("900 60px Gabarito").then(drawDigits, () => undefined);
  }

  const starPositions = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i += 1) {
    starPositions[i * 3] = (Math.random() - 0.5) * 150;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 90;
    starPositions[i * 3 + 2] = -70 - Math.random() * 60;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    size: 0.9,
    sizeAttenuation: true,
    map: ctx.radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,.6)"], [1, "rgba(255,255,255,0)"]]),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  hud.add(stars);

  // Bouncy on purpose: this is the one stage that is allowed to play.
  const stiffness = 250;
  const damping = 12;
  const restitution = 0.4;
  let emissive = 0;
  let envIntensity = 1;
  let digitOpacity = 0;
  let digitOpacityTarget = 0;
  let starOpacityTarget = 0;
  const digitColor = new THREE.Color();

  function setLook(dark: boolean) {
    const frame = dark ? "#9c2018" : "#6d1220";
    const look: Record<string, string> = dark
      ? { bead: mix(palette.primary, palette.secondary, 0.24), heaven: mix(palette.accent, "#ffffff", 0.06), frame, beam: mix(frame, "#000000", 0.3), rod: mix(palette.secondary, "#ffffff", 0.2), dot: palette.glow, opA: palette.accent, opB: palette.secondary, opC: mix(palette.primary, palette.secondary, 0.3) }
      : { bead: palette.primary, heaven: palette.accent, frame, beam: mix(frame, "#000000", 0.32), rod: mix(palette.secondary, "#ffffff", 0.3), dot: palette.glow, opA: palette.accent, opB: palette.secondary, opC: palette.primary };
    Object.keys(look).forEach((key) => {
      targets[key] = new THREE.Color(look[key]);
      if (!looked) materials[key].color.copy(targets[key]);
    });
    digitColor.set(dark ? palette.accent : palette.secondary);
    if (!looked) digitSprites.forEach((digit) => digit.material.color.copy(digitColor));
    emissive = dark ? 0.34 : 0;
    envIntensity = dark ? 0.5 : 1;
    digitOpacityTarget = dark ? 0.5 : 0.34;
    starOpacityTarget = dark ? 0.85 : 0;
    looked = true;
  }

  function lights(dark: boolean): LightLook {
    return dark
      ? { hemi: 0.14, key: 0.5, rim: 2.4, fill: 0.8, shadow: 0.6, glow: 0.5, rimColor: palette.secondary, glowColor: palette.primary }
      : { hemi: 0.5, key: 0.98, rim: 0.5, fill: 0, shadow: 0.26, glow: 0, rimColor: palette.secondary, glowColor: palette.glow };
  }

  function setDigits(digits: number[], options?: DigitOptions) {
    const stagger = options?.stagger ?? 0;
    let moved = 0;
    ctx.poke(2800);
    for (let rod = RODS - 1; rod >= 0; rod -= 1) {
      const digit = digits[rod];
      const heavenOn = digit >= 5;
      const earthOn = digit % 5;
      let changed = false;
      const heaven = heavenBeads[rod];
      const heavenTarget = heavenOn ? heaven.on : heaven.off;
      if (heavenTarget !== heaven.target) {
        heaven.target = heavenTarget;
        heaven.delay = moved * stagger;
        changed = true;
      }
      const moving: Array<[Bead, number]> = [];
      for (let i = 0; i < 4; i += 1) {
        const bead = earthBeads[rod][i];
        const target = i < earthOn ? bead.on : bead.off;
        if (target !== bead.target) moving.push([bead, target]);
      }
      if (moving.length) {
        // The leading bead goes first, so a stack never passes through itself.
        if (moving[0][1] !== moving[0][0].on) moving.reverse();
        moving.forEach(([bead, target], order) => {
          bead.target = target;
          bead.delay = moved * stagger + order * 0.03;
        });
        changed = true;
      }
      if (changed) moved += 1;
    }
  }

  function layout(distance: number, aspect: number) {
    const tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
    floaters.forEach((item) => {
      const d = distance * (1 + item.depth);
      const halfHeight = d * tan;
      const halfWidth = halfHeight * aspect;
      item.baseX = (item.u * 2 - 1) * halfWidth;
      item.baseY = (1 - item.v * 2) * halfHeight;
      item.distance = d;
      const size = item.frac * 2 * halfHeight;
      item.amp = size * 0.12;
      if (item.sprite) item.object.scale.set(size, size, 1);
      else item.object.scale.setScalar(size);
    });
  }

  let hovered: Bead | null = null;
  const pick = (ray: THREE.Raycaster): Bead | null => {
    const hit = ray.intersectObjects(beadMeshes, false)[0];
    return hit ? (hit.object.userData.bead as Bead) : null;
  };

  function update(dt: number, time: number, tilt: Tilt) {
    const colourEase = ease(4, dt);
    // Fixed small steps keep the beads on time at any frame rate.
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (const bead of beads) {
      for (let step = 0; step < steps; step += 1) {
        if (bead.delay > 0) {
          bead.delay -= h;
          continue;
        }
        const acceleration = stiffness * (bead.target - bead.y) - damping * bead.v;
        bead.v += acceleration * h;
        bead.y += bead.v * h;
        if (bead.y > bead.max) {
          bead.y = bead.max;
          bead.v = -bead.v * restitution;
        } else if (bead.y < bead.min) {
          bead.y = bead.min;
          bead.v = -bead.v * restitution;
        }
      }
      bead.mesh.position.y = bead.y;
      const scale = bead.mesh.scale.x + ((bead.hover ? 1.07 : 1) - bead.mesh.scale.x) * Math.min(1, dt * 14);
      bead.mesh.scale.set(scale, 1, scale);
    }
    Object.keys(materials).forEach((key) => materials[key].color.lerp(targets[key], colourEase));
    glossy.forEach((material) => {
      material.emissive.copy(material.color);
      material.emissiveIntensity += (emissive - material.emissiveIntensity) * colourEase;
      material.envMapIntensity += (envIntensity - material.envMapIntensity) * colourEase;
    });
    frameMaterial.envMapIntensity = beamMaterial.envMapIntensity = rodMaterial.envMapIntensity = beadMaterial.envMapIntensity;
    digitOpacity += (digitOpacityTarget - digitOpacity) * colourEase;
    starMaterial.opacity += (starOpacityTarget - starMaterial.opacity) * colourEase;
    digitSprites.forEach((digit) => {
      digit.material.color.lerp(digitColor, colourEase);
      digit.material.opacity = digitOpacity;
    });
    for (const item of floaters) {
      if (!item.distance) continue;
      const parallax = item.distance * 0.05 * (1 + item.depth);
      item.object.position.set(
        item.baseX - tilt.y * parallax * 6 + Math.sin(time * 0.31 + item.phase) * item.amp,
        item.baseY + tilt.x * parallax * 6 + Math.cos(time * 0.37 + item.phase) * item.amp,
        -item.distance,
      );
      if (!item.sprite) item.object.rotation.set(Math.sin(time * 0.4 + item.phase) * 0.5, time * 0.22 * item.spin + item.phase, Math.sin(time * 0.3 + item.phase) * 0.35);
    }
    stars.position.set(-tilt.y * 14, tilt.x * 10, 0);
    stars.rotation.z = time * 0.004;
  }

  return {
    group,
    size: { w: outerWidth * 1.17, h: outerHeight * 1.16, floor: 0.85 },
    base: { rx: -0.17, ry: 0.12 },
    setLook,
    lights,
    update,
    layout,
    setActive: (active) => {
      hud.visible = active;
    },
    signal: () => undefined,
    hover(ray) {
      const bead = ray ? pick(ray) : null;
      if (hovered && hovered !== bead) hovered.hover = false;
      hovered = bead;
      if (bead) bead.hover = true;
      return Boolean(bead);
    },
    click(ray) {
      const bead = pick(ray);
      if (bead) ctx.onBead(bead.rod, bead.kind, bead.index);
    },
    setDigits,
  };
}

/* ------------------------------------------------------------------ teacher ------------------------------------------------------------------ */

function createTeacherScene(ctx: SceneContext): RoleScene {
  const palette = ROLE_PALETTE.teacher;
  const group = new THREE.Group();
  const field = new THREE.Group();
  group.add(field);
  field.rotation.x = 0.8;

  const length = 10;
  const railCount = 9;
  const railGap = 0.6;
  const depth = (railCount - 1) * railGap;

  const slabMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.16, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const postMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const railMaterial = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.95 });
  const gateMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const gateEdgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });
  const gateNumbers: THREE.SpriteMaterial[] = [];

  const slab = new THREE.Mesh(new THREE.BoxGeometry(length + 1, 0.12, depth + 1.3), slabMaterial);
  slab.position.y = -0.34;
  slab.receiveShadow = true;
  slab.castShadow = true;
  field.add(slab);
  [-1, 1].forEach((side) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.52, depth + 0.8), postMaterial);
    post.position.set(side * (length / 2 + 0.1), -0.04, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    field.add(post);
  });
  const railGeometry = new THREE.CylinderGeometry(0.024, 0.024, length + 0.2, 10);
  railGeometry.rotateZ(Math.PI / 2);

  const gates = [-3, -1, 1, 3];
  gates.forEach((x) => {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(depth + 0.5, 0.78), gateMaterial);
    pane.rotation.y = Math.PI / 2;
    pane.position.set(x, 0.11, 0);
    field.add(pane);
    const edge = new THREE.BufferGeometry();
    edge.setAttribute("position", new THREE.BufferAttribute(new Float32Array([x, 0.5, -(depth + 0.5) / 2, x, 0.5, (depth + 0.5) / 2]), 3));
    field.add(new THREE.Line(edge, gateEdgeMaterial));
    const numberMaterial = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0.95 });
    const number = new THREE.Sprite(numberMaterial);
    number.scale.set(0.62, 0.62, 1);
    number.position.set(x, 0.92, -(depth + 0.5) / 2);
    field.add(number);
    gateNumbers.push(numberMaterial);
  });
  function drawNumbers() {
    gateNumbers.forEach((material, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = '800 92px Gabarito, "Trebuchet MS", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#fff";
      context.fillText(String(index + 1), 64, 70);
      material.map?.dispose();
      material.map = new THREE.CanvasTexture(canvas);
      material.needsUpdate = true;
    });
    ctx.poke(200);
  }
  drawNumbers();
  if (typeof document !== "undefined" && document.fonts?.load) {
    document.fonts.load("800 60px Gabarito").then(drawNumbers, () => undefined);
  }

  interface Pearl {
    mesh: THREE.Mesh;
    material: THREE.MeshPhysicalMaterial;
    z: number;
    x: number;
    speed: number;
    weight: number;
  }
  const pearlGeometry = new THREE.SphereGeometry(0.25, 40, 28);
  const pearls: Pearl[] = [];
  for (let i = 0; i < railCount; i += 1) {
    const z = (i - (railCount - 1) / 2) * railGap;
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, 0, z);
    rail.castShadow = true;
    field.add(rail);
    const material = new THREE.MeshPhysicalMaterial({ roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
    const mesh = new THREE.Mesh(pearlGeometry, material);
    mesh.castShadow = true;
    field.add(mesh);
    pearls.push({ mesh, material, z, x: -length / 2 + 0.5 + ((i * 3.7) % 9.2), speed: 0.13 + ((i * 5) % 7) * 0.035, weight: 0 });
  }

  // A soft ring each time a learner passes a level gate.
  const ringGeometry = new THREE.RingGeometry(0.24, 0.3, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; t: number }> = [];
  for (let i = 0; i < 8; i += 1) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.visible = false;
    field.add(mesh);
    rings.push({ mesh, material, t: 1 });
  }
  let ringIndex = 0;
  const ring = (x: number, z: number) => {
    const next = rings[ringIndex % rings.length];
    ringIndex += 1;
    next.t = 0;
    next.mesh.position.set(x, 0.02, z);
    next.mesh.visible = true;
  };

  const guide = new THREE.PointLight(0xffffff, 0, 7, 2);
  field.add(guide);
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: ctx.radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.4)"], [1, "rgba(255,255,255,0)"]]),
    transparent: true,
    depthWrite: false,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -0.275;
  field.add(pool);

  const targets: Record<string, THREE.Color> = {};
  let looked = false;
  let look = { emissive: 0.05, boost: 0.35, guide: 1.2, pool: 0.12, env: 1, gate: 0.16 };
  const guidePoint = new THREE.Vector3(-2, 0, 0);
  const guideTarget = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let signalKind: StageSignal = "idle";
  let signalTime = 0;

  function setLook(dark: boolean) {
    const next: Record<string, string> = dark
      ? { slab: "#1f0b24", post: "#5a234e", rail: palette.accent, pearl: "#f1d3c2", gate: palette.accent, number: palette.accent, ring: palette.accent, guide: palette.accent }
      : { slab: "#35123a", post: "#4d1c44", rail: palette.accent, pearl: "#f4dccd", gate: palette.accent, number: palette.primary, ring: palette.accent, guide: "#ffe9dc" };
    Object.keys(next).forEach((key) => {
      targets[key] = new THREE.Color(next[key]);
    });
    if (!looked) {
      slabMaterial.color.copy(targets.slab);
      postMaterial.color.copy(targets.post);
      railMaterial.color.copy(targets.rail);
      pearls.forEach((pearl) => pearl.material.color.copy(targets.pearl));
      gateMaterial.color.copy(targets.gate);
      gateEdgeMaterial.color.copy(targets.gate);
      guide.color.copy(targets.guide);
      poolMaterial.color.copy(targets.guide);
      gateNumbers.forEach((material) => material.color.copy(targets.number));
    }
    look = dark
      ? { emissive: 0.42, boost: 1.1, guide: 2.4, pool: 0.3, env: 0.6, gate: 0.14 }
      : { emissive: 0.05, boost: 0.35, guide: 1.2, pool: 0.12, env: 1, gate: 0.16 };
    looked = true;
  }

  function lights(dark: boolean): LightLook {
    return dark
      ? { hemi: 0.12, key: 0.42, rim: 1.8, fill: 0.5, shadow: 0.6, glow: 0.4, rimColor: palette.secondary, glowColor: palette.primary }
      : { hemi: 0.46, key: 0.82, rim: 0.5, fill: 0, shadow: 0.24, glow: 0, rimColor: palette.secondary, glowColor: palette.glow };
  }

  function update(dt: number, time: number, _tilt: Tilt, pointer: PointerState) {
    const colourEase = ease(4, dt);
    slabMaterial.color.lerp(targets.slab, colourEase);
    postMaterial.color.lerp(targets.post, colourEase);
    railMaterial.color.lerp(targets.rail, colourEase);
    gateMaterial.color.lerp(targets.gate, colourEase);
    gateEdgeMaterial.color.lerp(targets.gate, colourEase);
    guide.color.lerp(targets.guide, colourEase);
    poolMaterial.color.lerp(targets.guide, colourEase);
    gateNumbers.forEach((material) => material.color.lerp(targets.number, colourEase));
    railMaterial.envMapIntensity += (look.env - railMaterial.envMapIntensity) * colourEase;
    slabMaterial.envMapIntensity = postMaterial.envMapIntensity = railMaterial.envMapIntensity;
    gateMaterial.opacity += (look.gate - gateMaterial.opacity) * colourEase;
    guide.intensity += (look.guide * GUIDE_LIGHT_SCALE - guide.intensity) * colourEase;
    poolMaterial.opacity += (look.pool - poolMaterial.opacity) * colourEase;

    // Where the guide is: under the cursor when there is one, otherwise it wanders on its own.
    let found = false;
    if (pointer.ray && pointer.fresh) {
      field.updateMatrixWorld();
      inverse.copy(field.matrixWorld).invert();
      origin.copy(pointer.ray.origin).applyMatrix4(inverse);
      direction.copy(pointer.ray.direction).transformDirection(inverse);
      if (Math.abs(direction.y) > 1e-4) {
        const t = -origin.y / direction.y;
        if (t > 0) {
          guideTarget.set(
            Math.max(-length / 2, Math.min(length / 2, origin.x + direction.x * t)),
            0,
            Math.max(-depth / 2 - 0.4, Math.min(depth / 2 + 0.4, origin.z + direction.z * t)),
          );
          found = true;
        }
      }
    }
    if (!found) guideTarget.set(Math.sin(time * 0.33) * 3.7, 0, Math.sin(time * 0.21 + 1) * depth * 0.36);
    if (signalKind === "ok") {
      // A single sweep of light across the whole class.
      signalTime += dt;
      guideTarget.set(-length / 2 + (signalTime / 1.3) * length, 0, 0);
      if (signalTime > 1.9) signalKind = "idle";
    }
    guidePoint.lerp(guideTarget, ease(signalKind === "ok" ? 9 : 3.5, dt));
    guide.position.set(guidePoint.x, 0.95, guidePoint.z);
    pool.position.x = guidePoint.x;
    pool.position.z = guidePoint.z;

    const speedScale = signalKind === "busy" ? 6 : signalKind === "error" ? 0 : 1;
    if (signalKind === "error") {
      signalTime += dt;
      if (signalTime > 1.4) signalKind = "idle";
    }
    for (const pearl of pearls) {
      const dx = guidePoint.x - pearl.x;
      const dz = guidePoint.z - pearl.z;
      let weight = Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / 2.1);
      weight = weight * weight * (3 - 2 * weight);
      pearl.weight += (weight - pearl.weight) * Math.min(1, dt * 6);
      const before = pearl.x;
      pearl.x += (pearl.speed * speedScale + Math.max(-0.5, Math.min(0.5, dx)) * pearl.weight * 0.55) * dt;
      for (const gate of gates) if (before < gate && pearl.x >= gate) ring(gate, pearl.z);
      if (pearl.x > length / 2 - 0.3) pearl.x = -length / 2 + 0.3;
      const fade = Math.min(1, Math.max(0, (pearl.x + length / 2 - 0.3) / 0.7)) * Math.min(1, Math.max(0, (length / 2 - 0.3 - pearl.x) / 0.7));
      pearl.mesh.position.set(pearl.x, 0, pearl.z);
      pearl.mesh.scale.setScalar(Math.max(0.001, fade) * (1 + 0.2 * pearl.weight));
      pearl.material.color.lerp(targets.pearl, colourEase);
      pearl.material.emissive.copy(pearl.material.color);
      pearl.material.envMapIntensity = railMaterial.envMapIntensity;
      pearl.material.emissiveIntensity = look.emissive + pearl.weight * look.boost + (signalKind === "busy" ? 0.5 : 0) - (signalKind === "error" ? look.emissive * 0.7 : 0);
    }
    for (const item of rings) {
      if (item.t >= 1) {
        item.mesh.visible = false;
        continue;
      }
      item.t += dt / 1.1;
      const grow = 1 - Math.pow(1 - Math.min(item.t, 1), 3);
      item.mesh.scale.setScalar(1 + grow * 2.4);
      item.material.opacity = (1 - item.t) * 0.9;
      item.material.color.copy(targets.ring);
    }
  }

  return {
    group,
    size: { w: length + 1.7, h: 5.5, floor: 0.6 },
    base: { rx: -0.04, ry: 0.1 },
    setLook,
    lights,
    update,
    layout: () => undefined,
    setActive: () => undefined,
    signal(kind) {
      signalKind = kind;
      signalTime = 0;
    },
    hover: () => false,
    click: () => undefined,
  };
}

/* ------------------------------------------------------------------ admin ------------------------------------------------------------------ */

function createAdminScene(ctx: SceneContext): RoleScene {
  const palette = ROLE_PALETTE.admin;
  const group = new THREE.Group();
  const field = new THREE.Group();
  group.add(field);
  field.rotation.x = 0.44;
  field.position.y = 0.55;

  const tiersByColumn = [
    [3, 5, 7, 4, 6, 8, 4],
    [2, 4, 5, 6, 3, 5, 3],
    [1, 2, 3, 2, 4, 2, 1],
  ];
  const rowZ = [-1.45, 0, 1.45];
  const spacing = 1.34;
  const pitch = 0.34;
  const thickness = 0.15;
  const footprint = 0.98;
  const baseY = -1.2;

  interface Column {
    column: number;
    row: number;
    x: number;
    z: number;
    tiers: number;
    first: number;
  }
  const columns: Column[] = [];
  let total = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      columns.push({ column, row, x: (column - 3) * spacing, z: rowZ[row], tiers: tiersByColumn[row][column], first: total });
      total += tiersByColumn[row][column];
    }
  }

  const slabMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.1, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.74 });
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(footprint, thickness, footprint), slabMaterial, total);
  slabs.castShadow = true;
  slabs.receiveShadow = true;
  field.add(slabs);
  const rodMaterial = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.95 });
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), rodMaterial, columns.length * 4);
  field.add(rods);
  const baseMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.14, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(7 * spacing + 0.9, 0.14, 3 * 1.45 + 1.1), baseMaterial);
  base.position.y = baseY - 0.07;
  base.receiveShadow = true;
  base.castShadow = true;
  field.add(base);

  const matrix = new THREE.Matrix4();
  const flash = new Float32Array(total);
  const edgePositions = new Float32Array(total * 72);
  const edgeColors = new Float32Array(total * 72);
  const corners = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const halfWidth = footprint / 2;
  const halfHeight = thickness / 2;
  let slabIndex = 0;
  let edgeCursor = 0;
  let rodIndex = 0;
  columns.forEach((column) => {
    for (let tier = 0; tier < column.tiers; tier += 1) {
      const y = baseY + thickness / 2 + 0.06 + tier * pitch;
      matrix.makeTranslation(column.x, y, column.z);
      slabs.setMatrixAt(slabIndex, matrix);
      edges.forEach((edge) => {
        edge.forEach((vertex) => {
          const corner = corners[vertex];
          edgePositions[edgeCursor++] = column.x + corner[0] * halfWidth;
          edgePositions[edgeCursor++] = y + corner[1] * halfHeight;
          edgePositions[edgeCursor++] = column.z + corner[2] * halfWidth;
        });
      });
      slabIndex += 1;
    }
    const height = 0.06 + column.tiers * pitch - (pitch - thickness) + 0.14;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
      matrix.makeScale(1, height, 1);
      matrix.setPosition(column.x + sx * (halfWidth - 0.05), baseY + height / 2, column.z + sz * (halfWidth - 0.05));
      rods.setMatrixAt(rodIndex, matrix);
      rodIndex += 1;
    });
  });
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  field.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  // The floor grid the work travels along.
  const gridY = baseY + 0.012;
  const gridPoints: number[] = [];
  columns.forEach((column) => {
    if (column.row === 0) gridPoints.push(column.x, gridY, rowZ[0] - 0.9, column.x, gridY, rowZ[2] + 0.9);
  });
  rowZ.forEach((z) => gridPoints.push(-3 * spacing - 0.9, gridY, z, 3 * spacing + 0.9, gridY, z));
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gridPoints), 3));
  const gridMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
  field.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  interface Pulse {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    column: Column | null;
    t: number;
    wait: number;
    magenta: boolean;
    side: number;
    length: number;
  }
  const dotTexture = ctx.radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,.75)"], [1, "rgba(255,255,255,0)"]]);
  const pulses: Pulse[] = [];
  for (let i = 0; i < 9; i += 1) {
    const material = new THREE.SpriteMaterial({ map: dotTexture, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.5);
    field.add(sprite);
    pulses.push({ sprite, material, column: null, t: 0, wait: i * 0.55, magenta: i % 3 === 0, side: 1, length: 1 });
  }

  const targets: Record<string, THREE.Color> = {};
  let looked = false;
  let look = { env: 1, edge: 0.7, opacity: 0.82, grid: 0.5, dot: 0.95 };
  const navy = new THREE.Color();
  const cyan = new THREE.Color();
  const magenta = new THREE.Color();
  const edgeColor = new THREE.Color();
  const scratch = new THREE.Color();
  let signalKind: StageSignal = "idle";
  let signalTime = 0;

  function setLook(dark: boolean) {
    const next: Record<string, string> = dark
      ? { navy: "#16306e", cyan: palette.secondary, magenta: mix(palette.accent, "#ffffff", 0.2), edge: palette.secondary, base: "#0a1533", rod: "#9fb4d9", grid: palette.secondary }
      : { navy: "#27489a", cyan: "#38c6ee", magenta: mix(palette.accent, "#ffffff", 0.1), edge: "#1d4ed8", base: "#1b2f66", rod: "#c5d2ea", grid: "#7dd3fc" };
    Object.keys(next).forEach((key) => {
      targets[key] = new THREE.Color(next[key]);
    });
    if (!looked) {
      navy.copy(targets.navy);
      cyan.copy(targets.cyan);
      magenta.copy(targets.magenta);
      edgeColor.copy(targets.edge);
      baseMaterial.color.copy(targets.base);
      rodMaterial.color.copy(targets.rod);
      gridMaterial.color.copy(targets.grid);
    }
    look = dark ? { env: 0.6, edge: 0.95, opacity: 0.7, grid: 0.4, dot: 1 } : { env: 1, edge: 0.7, opacity: 0.82, grid: 0.5, dot: 0.95 };
    // Glow reads as light on a dark ground and as ink on a light one.
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    edgeMaterial.blending = blending;
    edgeMaterial.needsUpdate = true;
    pulses.forEach((pulse) => {
      pulse.material.blending = blending;
      pulse.material.needsUpdate = true;
    });
    looked = true;
  }

  function lights(dark: boolean): LightLook {
    return dark
      ? { hemi: 0.16, key: 0.5, rim: 1.2, fill: 0.7, shadow: 0.6, glow: 0.45, rimColor: palette.secondary, glowColor: palette.primary }
      : { hemi: 0.5, key: 0.85, rim: 0.5, fill: 0, shadow: 0.24, glow: 0, rimColor: palette.secondary, glowColor: palette.glow };
  }

  function update(dt: number, time: number) {
    const colourEase = ease(4, dt);
    navy.lerp(targets.navy, colourEase);
    cyan.lerp(targets.cyan, colourEase);
    magenta.lerp(targets.magenta, colourEase);
    edgeColor.lerp(targets.edge, colourEase);
    baseMaterial.color.lerp(targets.base, colourEase);
    rodMaterial.color.lerp(targets.rod, colourEase);
    gridMaterial.color.lerp(targets.grid, colourEase);
    rodMaterial.envMapIntensity += (look.env - rodMaterial.envMapIntensity) * colourEase;
    slabMaterial.envMapIntensity = baseMaterial.envMapIntensity = rodMaterial.envMapIntensity;
    edgeMaterial.opacity += (look.edge - edgeMaterial.opacity) * colourEase;
    slabMaterial.opacity += (look.opacity - slabMaterial.opacity) * colourEase;
    gridMaterial.opacity += (look.grid - gridMaterial.opacity) * colourEase;
    // It turns, slowly, and never spins.
    field.rotation.y = 0.5 + Math.sin(time * 0.13) * 0.2;

    const rate = signalKind === "busy" ? 3.2 : 1;
    for (const pulse of pulses) {
      if (!pulse.column) {
        pulse.wait -= dt * rate;
        pulse.material.opacity = 0;
        if (pulse.wait <= 0) {
          pulse.column = columns[Math.floor(Math.random() * columns.length)];
          pulse.t = 0;
          pulse.side = Math.random() < 0.5 ? -1 : 1;
          pulse.length = 1.1 + pulse.column.tiers * 0.16;
        }
        continue;
      }
      pulse.t += (dt * rate) / pulse.length;
      const column = pulse.column;
      const run = 0.45;
      let y = gridY + 0.03;
      let z = column.z;
      // First along the floor to the column, then up through its levels.
      if (pulse.t < run) {
        const start = pulse.side * (rowZ[2] + 0.9);
        z = start + (column.z - start) * (pulse.t / run);
      } else {
        const climb = (pulse.t - run) / (1 - run);
        y = baseY + 0.06 + climb * column.tiers * pitch;
        if (climb < 1) flash[column.first + Math.min(column.tiers - 1, Math.floor(climb * column.tiers))] = pulse.magenta ? -1 : 1;
      }
      pulse.sprite.position.set(column.x, y, z);
      pulse.material.color.copy(pulse.magenta ? magenta : cyan);
      pulse.material.opacity = look.dot * Math.min(1, pulse.t * 8) * Math.min(1, (1 - pulse.t) * 6);
      if (pulse.t >= 1) {
        pulse.column = null;
        pulse.wait = 0.3 + Math.random() * 1.6;
      }
    }
    if (signalKind === "ok") {
      // Every column lights from the ground up, left to right.
      signalTime += dt;
      columns.forEach((column) => {
        for (let tier = 0; tier < column.tiers; tier += 1) {
          const at = column.column * 0.09 + tier * 0.07;
          if (signalTime > at && signalTime < at + 0.12) flash[column.first + tier] = 1;
        }
      });
      if (signalTime > 2) signalKind = "idle";
    }
    if (signalKind === "error") {
      signalTime += dt;
      if (signalTime < 0.12) flash.fill(-1);
      if (signalTime > 1) signalKind = "idle";
    }
    const decay = Math.exp(-dt * 2.6);
    for (let i = 0; i < total; i += 1) {
      const value = flash[i];
      const amount = Math.abs(value);
      const source = value < 0 ? magenta : cyan;
      scratch.copy(navy).lerp(source, amount * 0.9);
      slabs.setColorAt(i, scratch);
      scratch.copy(edgeColor).lerp(source, amount).multiplyScalar(0.75 + amount * 0.9);
      const start = i * 72;
      for (let vertex = 0; vertex < 24; vertex += 1) {
        edgeColors[start + vertex * 3] = scratch.r;
        edgeColors[start + vertex * 3 + 1] = scratch.g;
        edgeColors[start + vertex * 3 + 2] = scratch.b;
      }
      flash[i] = amount < 0.004 ? 0 : value * decay;
    }
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    edgeGeometry.attributes.color.needsUpdate = true;
  }

  slabs.setColorAt(0, new THREE.Color(1, 1, 1));

  return {
    group,
    size: { w: 11.4, h: 6.4, floor: 0.5 },
    base: { rx: -0.02, ry: 0 },
    setLook,
    lights,
    update,
    layout: () => undefined,
    setActive: () => undefined,
    signal(kind) {
      signalKind = kind;
      signalTime = 0;
    },
    hover: () => false,
    click: () => undefined,
  };
}

/* ------------------------------------------------------------------ stage ------------------------------------------------------------------ */

function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export function createStage3D(options: Stage3DOptions): Stage3D {
  const { canvas, stage, slot } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  if (!options.force && isSoftwareRenderer(renderer)) {
    renderer.dispose();
    throw new Error("Software renderer: using the illustrated sign-in stage instead.");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 400);
  scene.add(camera);

  // A small photo studio for lacquer and glass to reflect: a dark room, one large softbox, two strips.
  {
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x23262d, side: THREE.BackSide })));
    const panel = (w: number, h: number, x: number, y: number, z: number, power: number) => {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      material.color.setScalar(power);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
    };
    panel(16, 8, 0, 14, 9, 4.2);
    panel(4, 12, -15, 3, 6, 2.4);
    panel(3, 10, 15, 2, -3, 1.4);
    const generator = new THREE.PMREMGenerator(renderer);
    scene.environment = generator.fromScene(studio, 0.04).texture;
    generator.dispose();
    studio.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
  }

  function roundedRect(w: number, h: number, r: number): THREE.Shape {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }
  function radial(stops: Array<[number, string]>): THREE.CanvasTexture {
    const element = document.createElement("canvas");
    element.width = 256;
    element.height = 256;
    const context = element.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
      stops.forEach(([at, colour]) => gradient.addColorStop(at, colour));
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(element);
  }

  let wake = 0;
  const poke = (ms: number) => {
    wake = Math.max(wake, performance.now() + ms);
  };

  const world = new THREE.Group();
  const rig = new THREE.Group();
  scene.add(world);
  world.add(rig);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(0,0,0,1)"], [0.5, "rgba(0,0,0,.5)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, opacity: 0.26 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);
  const glowMaterial = new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,.38)"], [1, "rgba(255,255,255,0)"]]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  world.add(glow);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a93a6, 0.5 * SUN_LIGHT_SCALE);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.9 * SUN_LIGHT_SCALE);
  key.position.set(-4.5, 6.5, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const shadowCamera = key.shadow.camera;
  shadowCamera.left = -7;
  shadowCamera.right = 7;
  shadowCamera.top = 5;
  shadowCamera.bottom = -5;
  shadowCamera.near = 1;
  shadowCamera.far = 40;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 0, 0, 2);
  rim.position.set(5.5, 2.5, -4.5);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffffff, 0, 0, 2);
  fill.position.set(-2, -1.5, 5.5);
  scene.add(fill);

  const ctx: SceneContext = { camera, poke, roundedRect, radial, onBead: options.onBead };
  const student = createStudentScene(ctx);
  const scenes: Record<LoginRole, RoleScene> = { student, teacher: createTeacherScene(ctx), admin: createAdminScene(ctx) };
  LOGIN_ROLES.forEach((role) => {
    scenes[role].group.visible = false;
    rig.add(scenes[role].group);
  });

  let current: RoleScene | null = null;
  let currentRole: LoginRole | null = null;
  let dark = false;
  let lightNow: LightLook | null = null;
  let lightGoal: LightLook | null = null;
  const rimGoal = new THREE.Color();
  const glowGoal = new THREE.Color();

  function applyLook() {
    if (!current) return;
    current.setLook(dark);
    lightGoal = current.lights(dark);
    rimGoal.set(lightGoal.rimColor);
    glowGoal.set(lightGoal.glowColor);
    if (!lightNow) {
      lightNow = { ...lightGoal };
      rim.color.copy(rimGoal);
      fill.color.copy(glowGoal);
      glowMaterial.color.copy(glowGoal);
    }
    poke(2200);
  }

  let pixelsPerUnit = 60;
  let cameraDistance = 17;
  let introStart = performance.now();

  function fit() {
    if (!current) return;
    const stageRect = stage.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const width = stageRect.width;
    const height = stageRect.height;
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const size = current.size;
    const slotWidth = slotRect.width;
    const slotHeight = slotRect.height + 12;
    pixelsPerUnit = Math.max(8, Math.min(slotWidth / (size.w * 1.04), slotHeight / (size.h + size.floor)));
    poke(300);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    cameraDistance = height / (2 * tan * pixelsPerUnit);
    camera.position.set(0, cameraDistance * 0.1, cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    world.position.set(
      (slotRect.left - stageRect.left + slotWidth / 2 - width / 2) / pixelsPerUnit,
      -((slotRect.top - stageRect.top + slotHeight / 2 - height / 2) / pixelsPerUnit) + size.floor / 2,
      0,
    );
    const floorY = -size.h / 2 - 0.5;
    floor.scale.set(size.w * 1.25, 5.4, 1);
    floor.position.set(0.25, floorY, -0.6);
    glow.scale.set(size.w * 1.6, 9, 1);
    glow.position.set(0, floorY + 0.02, -1);
    current.layout(cameraDistance, camera.aspect);
  }

  function swap(role: LoginRole) {
    if (current) {
      current.group.visible = false;
      current.setActive(false);
    }
    current = scenes[role];
    currentRole = role;
    current.group.visible = true;
    current.setActive(true);
    applyLook();
    fit();
    introStart = performance.now();
    poke(2200);
  }

  let swapTimer = 0;
  function show(role: LoginRole, isDark: boolean, instant?: boolean) {
    dark = isDark;
    if (role === currentRole) {
      applyLook();
      return;
    }
    window.clearTimeout(swapTimer);
    if (!current || instant || options.reducedMotion) {
      swap(role);
      canvas.style.opacity = "1";
      return;
    }
    canvas.style.opacity = "0";
    swapTimer = window.setTimeout(() => {
      swap(role);
      canvas.style.opacity = "1";
    }, 260);
  }

  const raycaster = new THREE.Raycaster();
  const pointerRaycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer: PointerState = { ray: null, fresh: false, inside: false, at: 0, nx: 0, ny: 0 };
  let tiltGoalX = 0;
  let tiltGoalY = 0;
  let tiltX = 0;
  let tiltY = 0;
  const aim = (event: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster;
  };
  const onCanvasMove = (event: PointerEvent) => {
    if (!current) return;
    canvas.style.cursor = current.hover(aim(event)) ? "pointer" : "";
    poke(500);
  };
  const onCanvasLeave = () => {
    current?.hover(null);
    poke(500);
  };
  const onCanvasClick = (event: MouseEvent) => {
    current?.click(aim(event));
  };
  const onWindowMove = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const nx = Math.max(-1.1, Math.min(1.25, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1.2, Math.min(1.2, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    tiltGoalY = nx * 0.15;
    tiltGoalX = ny * 0.07;
    pointer.at = performance.now();
    pointer.inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    const canvasRect = canvas.getBoundingClientRect();
    pointer.nx = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointer.ny = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    poke(1400);
  };
  canvas.addEventListener("pointermove", onCanvasMove);
  canvas.addEventListener("pointerleave", onCanvasLeave);
  canvas.addEventListener("click", onCanvasClick);
  window.addEventListener("pointermove", onWindowMove);

  let last = performance.now();
  let frameId = 0;
  let running = false;
  let wasActive = false;
  let measuredTime = 0;
  let measuredFrames = 0;
  let skip = false;
  let disposed = false;
  const tilt: Tilt = { x: 0, y: 0 };

  function frame(now: number) {
    if (disposed) return;
    frameId = requestAnimationFrame(frame);
    if (!current) {
      last = now;
      return;
    }
    const active = now < wake;
    if (!active) {
      // Only gentle drift is left: half the frame rate is plenty.
      skip = !skip;
      if (skip) return;
    }
    if (active && wasActive && measuredTime < 1.5 && !options.force) {
      measuredTime += (now - last) / 1000;
      measuredFrames += 1;
      if (measuredTime >= 1.5 && measuredFrames / measuredTime < 14) {
        options.onSlow();
        return;
      }
    }
    wasActive = active;
    const dt = Math.min((now - last) / 1000, 0.3);
    last = now;
    const time = (now - introStart) / 1000;
    const follow = ease(5, dt);
    const colourEase = ease(4, dt);
    tiltX += (tiltGoalX - tiltX) * follow;
    tiltY += (tiltGoalY - tiltY) * follow;
    tilt.x = tiltX;
    tilt.y = tiltY;
    // One arrival: the stage turns in and settles.
    const progress = Math.min(time / 1.4, 1);
    const intro = options.reducedMotion ? 1 : 1 - Math.pow(1 - progress, 3);
    rig.rotation.set(current.base.rx + tiltX, current.base.ry + tiltY - (1 - intro) * 0.7, 0);
    rig.scale.setScalar(0.9 + 0.1 * intro);
    pointer.fresh = pointer.inside && now - pointer.at < 4000;
    if (pointer.fresh) {
      ndc.set(pointer.nx, pointer.ny);
      pointerRaycaster.setFromCamera(ndc, camera);
      pointer.ray = pointerRaycaster.ray;
    }
    current.update(dt, time, tilt, pointer);
    if (lightNow && lightGoal) {
      rim.color.lerp(rimGoal, colourEase);
      fill.color.lerp(glowGoal, colourEase);
      glowMaterial.color.lerp(glowGoal, colourEase);
      lightNow.hemi += (lightGoal.hemi - lightNow.hemi) * colourEase;
      lightNow.key += (lightGoal.key - lightNow.key) * colourEase;
      lightNow.rim += (lightGoal.rim - lightNow.rim) * colourEase;
      lightNow.fill += (lightGoal.fill - lightNow.fill) * colourEase;
      lightNow.shadow += (lightGoal.shadow - lightNow.shadow) * colourEase;
      lightNow.glow += (lightGoal.glow - lightNow.glow) * colourEase;
      hemi.intensity = lightNow.hemi * SUN_LIGHT_SCALE;
      key.intensity = lightNow.key * SUN_LIGHT_SCALE;
      rim.intensity = lightNow.rim * RIM_LIGHT_SCALE;
      fill.intensity = lightNow.fill * FILL_LIGHT_SCALE;
      shadowMaterial.opacity = lightNow.shadow;
      glowMaterial.opacity = lightNow.glow;
    }
    renderer.render(scene, camera);
  }

  function run(active: boolean) {
    if (disposed) return;
    if (active && !running) {
      running = true;
      last = performance.now();
      poke(400);
      frameId = requestAnimationFrame(frame);
    } else if (!active && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  }

  function dispose() {
    disposed = true;
    running = false;
    cancelAnimationFrame(frameId);
    window.clearTimeout(swapTimer);
    canvas.removeEventListener("pointermove", onCanvasMove);
    canvas.removeEventListener("pointerleave", onCanvasLeave);
    canvas.removeEventListener("click", onCanvasClick);
    window.removeEventListener("pointermove", onWindowMove);
    const seenGeometry = new Set<THREE.BufferGeometry>();
    const seenMaterial = new Set<THREE.Material>();
    scene.traverse((object) => {
      const item = object as THREE.Mesh;
      if (item.geometry) seenGeometry.add(item.geometry);
      const material = item.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => seenMaterial.add(entry));
      else if (material) seenMaterial.add(material);
    });
    seenGeometry.forEach((geometry) => geometry.dispose());
    seenMaterial.forEach((material) => {
      const map = (material as THREE.MeshBasicMaterial).map;
      if (map) map.dispose();
      material.dispose();
    });
    scene.environment?.dispose();
    renderer.dispose();
  }

  poke(2000);

  return {
    show,
    fit,
    run,
    setDigits: (digits, digitOptions) => student.setDigits(digits, digitOptions),
    signal(kind) {
      current?.signal(kind);
      poke(2500);
    },
    dispose,
  };
}
