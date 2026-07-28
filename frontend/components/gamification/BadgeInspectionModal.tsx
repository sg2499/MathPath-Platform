"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate, Variants } from "framer-motion";
import {
  // `Target` is imported for the render-time fallback further down
  // (`IconMap[badge.iconName] || Target`) -- it is deliberately NOT a key of
  // IconMap any more; see the note on that object. This is now the ONLY thing
  // this file takes from lucide: after the batch-2 pass every badge iconName
  // resolves to a hand-drawn mark.
  Target,
} from "lucide-react";
import {
  referenceBatchGlyphs,
  mockExamBatch1Glyphs,
  mockExamBatch2Glyphs,
  mythicPhase1Glyphs,
} from "@/lib/gamification/badgeGlyphs";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles, Stars, Torus, Octahedron, Icosahedron, Sphere, Grid, Box, Cone, Cylinder, TorusKnot, Tetrahedron } from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

// --- Icon Mapping ---
//
// NOTE (2026-07-27, batch-1 pass): the fifteen lucide entries this object used
// to open with -- Target, Focus, Scan, Zap, FastForward, Rocket, Medal, Flag,
// Crown, Flame, Activity, Infinity, Clock, Sun, AlarmClock -- were removed from
// the literal, not shadowed by the `...mockExamBatch1Glyphs` spread. Shadowing
// is a hard TS2783 error, and deleting them is behaviourally identical because
// the spread would have won for all fifteen. Mirrors BadgeIconMap in
// lib/gamification/badgeVisuals.ts exactly.
//
// NOTE (2026-07-27, batch-2 pass): the other fifteen lucide entries --
// TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, Sparkles (which was
// aliased `SparklesIcon` here to avoid colliding with drei's `Sparkles`),
// Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb,
// Library -- were removed for the same TS2783 reason now that
// `...mockExamBatch2Glyphs` defines all fifteen. The lucide/drei `Sparkles`
// name clash goes away with them.
const IconMap: Record<string, React.ElementType> = {
  // --- Reference batch (2026-07-27) --------------------------------------
  // New iconName keys only. Nothing above this line changed, so every badge
  // currently in the DB resolves to exactly the icon it resolved to before.
  //
  // CRAFT PASS: these five now resolve to hand-drawn marks rather than stock
  // lucide glyphs, and they are imported from the SAME source of truth that
  // badgeVisuals.ts uses so the card and the cinematic can never show two
  // different icons for one badge.
  ...referenceBatchGlyphs,

  // --- Mock-exam elevation, batch 1 (2026-07-27) --------------------------
  // Same object, same spread order, same rationale as BadgeIconMap in
  // lib/gamification/badgeVisuals.ts -- imported from the single source of
  // truth so the card and the cinematic can never disagree about which glyph a
  // badge uses. These 15 keys are the backend's own iconName strings and are
  // defined here and nowhere else in this object.
  ...mockExamBatch1Glyphs,

  // --- Mock-exam elevation, batch 2 (2026-07-27) --------------------------
  // The remaining 15 backend iconName strings, same contract and same single
  // source of truth. With this spread, IconMap contains no stock lucide glyph
  // at all -- every badge in the product renders a hand-drawn mark.
  ...mockExamBatch2Glyphs,

  // --- Phase-1 MYTHIC tier (2026-07-28) -----------------------------------
  // The 9 new MYTHIC iconName keys. Without this spread the cinematic would
  // fall through to the `IconMap[badge.iconName] || Target` fallback and show a
  // lucide Target over a bespoke MYTHIC environment, while the Trophy Room card
  // (which reads BadgeIconMap in lib/gamification/badgeVisuals.ts) showed the
  // correct hand-drawn mark -- exactly the card/cinematic disagreement these
  // shared glyph exports exist to make impossible. Same source of truth.
  ...mythicPhase1Glyphs
};

export interface BadgeInspectionModalProps {
  badge: any;
  config: any;
  onClose: () => void;
  /**
   * Synthesised unlock chime (2026-07-27). Defaults on. Pass `false` from any
   * surface that should stay silent (e.g. an auto-opened reveal that the user
   * did not explicitly trigger).
   */
  enableSound?: boolean;
}

// --- TRUE AAA 3D ENGINE (REACT THREE FIBER) ---

function TimeDilationEngine({ isLegendary }: { isLegendary: boolean }) {
  const [timeScale, setTimeScale] = useState(isLegendary ? 4.0 : 2.0);
  
  useEffect(() => {
    // Zack Snyder Slow Mo
    const timer = setTimeout(() => {
      setTimeScale(0.15); // Extreme slow motion
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  useFrame((state, delta) => {
    state.scene.rotation.y += delta * timeScale * 0.5;
  });

  return null;
}

// --- 30 BESPOKE PROCEDURAL ENVIRONMENTS ---

// 1. Target / Crosshair (Lock-On Concentric Rings)
const EnvTarget = ({ color }: { color: THREE.Color }) => (
  <Float speed={2} rotationIntensity={3}>
    <Torus args={[12, 0.2, 16, 100]} rotation={[Math.PI/2, 0, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
    </Torus>
    <Torus args={[18, 0.1, 16, 100]} rotation={[0, Math.PI/2, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} wireframe />
    </Torus>
    <Torus args={[24, 0.3, 16, 100]} rotation={[0, 0, Math.PI/2]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
    </Torus>
  </Float>
);

// 2. Brain (Neural Network / Plexus Core)
const EnvBrain = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={1.5}>
    <TorusKnot args={[10, 1.5, 200, 32]} rotation={[0,0,0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} wireframe />
    </TorusKnot>
    <Sparkles count={500} scale={30} size={5} speed={0.2} color={color} />
  </Float>
);

// 3. Flame (Inferno Volumetric Fire)
const EnvFlame = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.children.forEach((mesh, i) => {
        mesh.position.y += Math.sin(state.clock.elapsedTime * 2 + i) * 0.1;
        mesh.rotation.x += 0.01;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(20)].map((_, i) => (
        <Icosahedron key={i} args={[Math.random() * 5 + 2, 0]} position={[(Math.random()-0.5)*20, (Math.random()-0.5)*30, (Math.random()-0.5)*20]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.6} />
        </Icosahedron>
      ))}
      <Sparkles count={800} scale={[20, 50, 20]} size={10} speed={2} color={color} />
    </group>
  );
};

// 4. Rocket (Warp Drive)
const EnvRocket = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.z += 2;
        if (mesh.position.z > 50) mesh.position.z = -150;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(200)].map((_, i) => (
        <Box key={i} args={[0.2, 0.2, 10]} position={[(Math.random()-0.5)*100, (Math.random()-0.5)*100, -150 + Math.random()*200]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
        </Box>
      ))}
    </group>
  );
};

// 5. Mountain (Low-Poly Terrain)
const EnvMountain = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.z += 0.1;
  });
  return (
    <group position={[0, -20, -50]}>
      <group ref={ref}>
        {[...Array(50)].map((_, i) => (
          <Cone key={i} args={[10 + Math.random()*10, 20 + Math.random()*30, 4]} position={[(Math.random()-0.5)*100, 0, (Math.random()-0.5)*100 - i*5]}>
            <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={0.5} />
          </Cone>
        ))}
      </group>
    </group>
  );
};

// 6. Shield (Energy Forcefield)
const EnvShield = ({ color }: { color: THREE.Color }) => (
  <Float speed={0.5} floatIntensity={0}>
    <Cylinder args={[20, 20, 40, 6]} rotation={[Math.PI/2, 0, 0]}>
      <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={2} transparent opacity={0.3} />
    </Cylinder>
    <Icosahedron args={[18, 1]} rotation={[0, 0, 0]}>
      <meshStandardMaterial color={'#ffffff'} wireframe emissive={'#ffffff'} emissiveIntensity={1} transparent opacity={0.1} />
    </Icosahedron>
  </Float>
);

// 7. Activity (Data Matrix Rain)
const EnvActivity = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.y -= 1;
        if (mesh.position.y < -50) mesh.position.y = 50;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(150)].map((_, i) => (
        <Box key={i} args={[0.2, 5, 0.2]} position={[(Math.random()-0.5)*100, Math.random()*100, (Math.random()-0.5)*50 - 20]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} />
        </Box>
      ))}
    </group>
  );
};

// 8. Infinity (Mobius Knot)
const EnvInfinity = ({ color }: { color: THREE.Color }) => (
  <Float speed={1} rotationIntensity={2}>
    <TorusKnot args={[15, 0.5, 300, 20]} rotation={[0, 0, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
    </TorusKnot>
    <Sparkles count={500} scale={40} size={4} color={'#ffffff'} />
  </Float>
);

// 9. Clock / AlarmClock (Giant Gears)
const EnvClock = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.children[0].rotation.z = state.clock.elapsedTime * 0.5;
      ref.current.children[1].rotation.z = -state.clock.elapsedTime * 0.5;
    }
  });
  return (
    <group ref={ref}>
      <Torus args={[15, 2, 8, 20]} position={[-10, 10, -20]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
      </Torus>
      <Torus args={[10, 1.5, 8, 15]} position={[8, -5, -25]}>
        <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} wireframe />
      </Torus>
    </group>
  );
};

// 10. Sun (Supernova)
const EnvSun = ({ color }: { color: THREE.Color }) => (
  <group>
    <Sphere args={[10, 64, 64]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
    </Sphere>
    <Sphere args={[12, 32, 32]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={2} wireframe transparent opacity={0.5} />
    </Sphere>
    <Sparkles count={2000} scale={60} size={6} speed={3} color={color} />
  </group>
);

// 11. Scan / Radar (Grid Sweep)
const EnvScan = ({ color }: { color: THREE.Color }) => (
  <group position={[0, -15, 0]}>
    <Grid args={[100, 100]} cellColor={color} sectionColor={color} sectionThickness={1} cellThickness={0.5} fadeDistance={50} />
    <Float speed={3} floatIntensity={5}>
      <Cone args={[20, 40, 4]} rotation={[Math.PI, 0, 0]} position={[0, 30, 0]}>
        <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={1} />
      </Cone>
    </Float>
  </group>
);

// 12. Library (Spiraling Books)
const EnvLibrary = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });
  return (
    <group ref={ref}>
      {[...Array(80)].map((_, i) => {
        const radius = 10 + i * 0.2;
        const angle = i * 0.5;
        const y = -30 + i * 0.8;
        return (
          <Box key={i} args={[3, 4, 0.5]} position={[Math.cos(angle)*radius, y, Math.sin(angle)*radius]} rotation={[0, -angle, 0]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} wireframe={i % 3 === 0} />
          </Box>
        );
      })}
    </group>
  );
};

// 13. Medal / Trophy (Golden Pantheon)
const EnvMedal = ({ color }: { color: THREE.Color }) => (
  <Float speed={1} rotationIntensity={0.5}>
    <Cylinder args={[20, 20, 2, 32]} position={[0, -15, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
    </Cylinder>
    <Cylinder args={[25, 25, 1, 32]} position={[0, -17, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} />
    </Cylinder>
    {[...Array(8)].map((_, i) => (
      <Cylinder key={i} args={[1, 1, 40, 8]} position={[Math.cos((i/8)*Math.PI*2)*18, 0, Math.sin((i/8)*Math.PI*2)*18]}>
        <meshStandardMaterial color={color} wireframe emissive={color} emissiveIntensity={1} />
      </Cylinder>
    ))}
  </Float>
);

// 14. Star (Celestial Geometry)
const EnvStar = ({ color }: { color: THREE.Color }) => (
  <Float speed={2} rotationIntensity={3}>
    <Icosahedron args={[15, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} wireframe />
    </Icosahedron>
    <Icosahedron args={[10, 0]} rotation={[Math.PI/4, Math.PI/4, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={5} />
    </Icosahedron>
  </Float>
);

// 15. Lightbulb (Filament Energy)
const EnvLightbulb = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={1}>
    <Sphere args={[20, 32, 32]}>
      <meshStandardMaterial color={'#ffffff'} transparent opacity={0.1} wireframe />
    </Sphere>
    <TorusKnot args={[5, 0.2, 100, 16]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} />
    </TorusKnot>
    <Sparkles count={200} scale={15} size={3} color={color} />
  </Float>
);

// 16. FastForward / ChevronsUp / ArrowUpRight (Hyper Speed Cones)
const EnvFastForward = ({ color }: { color: THREE.Color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((mesh) => {
        mesh.position.z += 1.5;
        if (mesh.position.z > 30) mesh.position.z = -100;
      });
    }
  });
  return (
    <group ref={ref}>
      {[...Array(60)].map((_, i) => (
        <Cone key={i} args={[2, 10, 4]} rotation={[Math.PI/2, 0, 0]} position={[(Math.random()-0.5)*80, (Math.random()-0.5)*80, -100 + Math.random()*130]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} wireframe />
        </Cone>
      ))}
    </group>
  );
};

// Default fallback for any other badges (Floating Monoliths)
const EnvDefault = ({ color }: { color: THREE.Color }) => (
  <Float speed={1.5} rotationIntensity={2} floatIntensity={2}>
    <Octahedron args={[15, 0]}>
      <meshStandardMaterial color={color} wireframe transparent opacity={0.4} emissive={color} emissiveIntensity={2} />
    </Octahedron>
    <Torus args={[22, 0.05, 16, 50]} rotation={[Math.PI/4, 0, 0]}>
      <meshStandardMaterial color={'#ffffff'} emissive={'#ffffff'} emissiveIntensity={1} />
    </Torus>
    <Torus args={[28, 0.05, 16, 50]} rotation={[-Math.PI/4, Math.PI/2, 0]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
    </Torus>
  </Float>
);


// ============================================================================
// REFERENCE BATCH -- 2026-07-27
// ----------------------------------------------------------------------------
// Five new bespoke environments built to establish a higher craft bar before it
// scales to the remaining ~94 badges. This whole block is PURELY ADDITIVE: no
// existing Env* component and no existing switch case is modified, so none of
// the 30 shipped badge cinematics can regress off the back of it.
//
// Craft notes that apply to all five (and should apply to the next 94):
//  * All randomness is generated once inside useMemo. The older envs call
//    Math.random() directly in JSX, which re-rolls the entire layout on every
//    React re-render -- that is why they subtly "pop". None of these do that.
//  * Each env owns its own time accumulator (`t`) instead of reading
//    state.clock, so its reveal choreography starts when the badge appears
//    rather than when the WebGL context was created.
//  * Emissive intensity, particle count, particle speed, geometry density and
//    colour temperature are all deliberately varied between the five so that
//    side-by-side none of them reads as a reskin of another.
// ----------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

// --- R1. "SpeedComet" -- Speed Demon, BASE tier -----------------------------
// This one is the baseline. It is deliberately the SIMPLEST of the five: one
// hero silhouette (a faceted crystalline hourglass shard), one supporting
// motif (a ring of tangential light streaks), one hard 2s settle, no shake.
// The point is that even the cheapest tier looks authored, not neglected --
// so the restraint here is the feature, not a shortcut.
const EnvSpeedComet = ({ color }: { color: THREE.Color }) => {
  const shardRef = useRef<THREE.Group>(null);
  const streakRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  // Cold, tight palette -- three steps of the same cyan so the whole frame
  // stays one colour temperature. (Contrast with R5, which is deliberately
  // split across orange/crimson/white-hot.)
  const tones = useMemo(() => ["#22d3ee", "#67e8f9", "#ecfeff"], []);

  // Partial-arc tori read as motion-blurred light streaks far more cheaply
  // than any real motion-blur pass would.
  const streaks = useMemo(
    () =>
      [...Array(28)].map((_, i) => ({
        radius: 15 + (i % 6) * 2.35,
        tube: 0.055 + (i % 4) * 0.05,
        arc: 0.16 + (i % 5) * 0.24,
        tilt: ((i % 9) - 4) * 0.15,
        phase: (i / 28) * Math.PI * 2,
        speed: 1.35 + (i % 7) * 0.36,
        tone: tones[i % 3],
        emissive: 2.2 + (i % 4) * 1.1
      })),
    [tones]
  );

  useFrame((_, delta) => {
    t.current += delta;
    // ~2s settle: a violent launch spin decaying into a controlled glide.
    const settle = easeOutCubic(clamp01(t.current / 2));

    if (shardRef.current) {
      shardRef.current.rotation.y += delta * THREE.MathUtils.lerp(15, 1.15, settle);
      shardRef.current.rotation.z = Math.sin(t.current * 0.55) * 0.13;
      shardRef.current.scale.setScalar(0.35 + 0.65 * settle);
    }

    if (streakRef.current) {
      const decay = THREE.MathUtils.lerp(3.4, 0.6, settle);
      streakRef.current.children.forEach((child, i) => {
        child.rotation.z = streaks[i].phase + t.current * streaks[i].speed * decay;
      });
    }
  });

  return (
    <group>
      {/* Faceted crystalline hourglass: two low-poly cones meeting apex-to-apex. */}
      <group ref={shardRef}>
        <Cone args={[5.4, 9, 6, 1]} rotation={[Math.PI, 0, 0]} position={[0, 4.55, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} flatShading transparent opacity={0.78} />
        </Cone>
        <Cone args={[5.4, 9, 6, 1]} position={[0, -4.55, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} flatShading transparent opacity={0.78} />
        </Cone>
        {/* Hot core at the waist -- the "sand" of the hourglass. */}
        <Icosahedron args={[2.1, 0]}>
          <meshStandardMaterial color={'#ffffff'} emissive={'#ecfeff'} emissiveIntensity={7} flatShading toneMapped={false} />
        </Icosahedron>
        {/* Crystalline edge highlight, one wireframe skin per cone. */}
        <Cone args={[5.5, 9.1, 6, 1]} rotation={[Math.PI, 0, 0]} position={[0, 4.55, 0]}>
          <meshStandardMaterial color={'#a5f3fc'} emissive={'#a5f3fc'} emissiveIntensity={3} wireframe />
        </Cone>
        <Cone args={[5.5, 9.1, 6, 1]} position={[0, -4.55, 0]}>
          <meshStandardMaterial color={'#a5f3fc'} emissive={'#a5f3fc'} emissiveIntensity={3} wireframe />
        </Cone>
      </group>

      {/* Streaking light-trail ring. */}
      <group ref={streakRef}>
        {streaks.map((s, i) => (
          <Torus key={i} args={[s.radius, s.tube, 6, 40, s.arc * Math.PI]} rotation={[s.tilt, 0, s.phase]}>
            <meshStandardMaterial color={s.tone} emissive={s.tone} emissiveIntensity={s.emissive} transparent opacity={0.85} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Moderate, fast, cold particulate -- ion wash, not fire. */}
      <Sparkles count={420} scale={[52, 26, 34]} size={5} speed={2.6} color={'#67e8f9'} opacity={0.7} />
    </group>
  );
};

// --- R2. "PerfectionistGem" -- Perfectionist, SUPER tier --------------------
// Jeweller's language, the exact opposite of R1: slow, orbital, precise. The
// motion budget goes into a single sweeping specular glint rather than speed.
//
// COLOUR IDENTITY (2026-07-27 craft pass): amethyst body + MAGENTA orbit
// rings. The rings used to be gold (#fbbf24) -- the same gold R3 below used --
// which is precisely the overlap that made SUPER and MYTHIC read as one badge
// with two amounts of sparkle. There is no gold anywhere in this environment
// any more; the whole frame is one precious-stone family.
const EnvPerfectionistGem = ({ color }: { color: THREE.Color }) => {
  const gemRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const MAGENTA = "#e0219c";
  const LILAC = "#f5a3ff";

  const rings = useMemo(
    () =>
      [
        { radius: 13.0, tube: 0.075, tilt: [Math.PI / 2.6, 0, 0.15], speed: 0.22, emissive: 5 },
        { radius: 15.4, tube: 0.05, tilt: [Math.PI / 2, Math.PI / 5, 0], speed: -0.14, emissive: 3.4 },
        { radius: 17.8, tube: 0.035, tilt: [Math.PI / 1.8, -Math.PI / 6, 0], speed: 0.09, emissive: 2.2 }
      ] as const,
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const reveal = easeOutBack(clamp01(t.current / 0.9));

    if (gemRef.current) {
      gemRef.current.rotation.y += delta * 0.55;
      gemRef.current.rotation.x = Math.sin(t.current * 0.35) * 0.14;
      gemRef.current.scale.setScalar(0.45 + 0.55 * reveal);
    }

    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        child.rotation.z += delta * rings[i].speed;
      });
    }

    // The glint: a sharp, infrequent specular spike rather than a sine pulse.
    // pow() keeps it dark most of the time so the flash actually reads.
    if (coreRef.current) {
      const glint = Math.pow(Math.max(0, Math.sin(t.current * 1.15)), 9);
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 4 + glint * 22;
    }
  });

  return (
    <group>
      <group ref={gemRef}>
        {/* Brilliant cut: an octahedron stretched on Y reads as a cut gem. */}
        <Octahedron args={[7, 0]} scale={[1, 1.5, 1]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} flatShading transparent opacity={0.62} />
        </Octahedron>
        {/* Facet edges. */}
        <Octahedron args={[7.05, 0]} scale={[1, 1.5, 1]}>
          <meshStandardMaterial color={LILAC} emissive={LILAC} emissiveIntensity={2.8} wireframe />
        </Octahedron>
        {/* Magenta girdle around the widest point of the stone. */}
        <Cylinder args={[7.2, 7.2, 0.28, 8, 1, true]}>
          <meshStandardMaterial color={MAGENTA} emissive={MAGENTA} emissiveIntensity={6} side={THREE.DoubleSide} toneMapped={false} />
        </Cylinder>
        {/* Inner core -- carries the glint. */}
        <Octahedron ref={coreRef} args={[3.1, 0]} scale={[1, 1.5, 1]}>
          <meshStandardMaterial color={'#ffffff'} emissive={LILAC} emissiveIntensity={4} flatShading toneMapped={false} />
        </Octahedron>
      </group>

      {/* Thin, slow magenta orbit rings. */}
      <group ref={ringsRef}>
        {rings.map((r, i) => (
          <Torus key={i} args={[r.radius, r.tube, 8, 160]} rotation={r.tilt as unknown as [number, number, number]}>
            <meshStandardMaterial color={MAGENTA} emissive={MAGENTA} emissiveIntensity={r.emissive} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Fine, slow magenta dust. Low count / small size on purpose -- this
          badge should feel expensive and still, not busy. */}
      <Sparkles count={260} scale={30} size={2.4} speed={0.16} color={MAGENTA} opacity={0.85} />
      <Sparkles count={90} scale={16} size={4} speed={0.05} color={LILAC} opacity={0.6} />
    </group>
  );
};

// --- R3. "PerfectionistGemMythic" -- Perfectionist, MYTHIC tier -------------
// COLOUR IDENTITY (2026-07-27 craft pass): OPAL / PRISMATIC, and nothing else
// in the batch looks remotely like it. This env used to be violet+gold -- the
// same violet+gold as R2 -- on the theory that "same badge, higher tier" means
// "same palette, more of it". That was wrong: it made the ceiling tier look
// like a brighter copy of the tier below it.
//
// The badge's own concept is the fix. "The stone splits and there is still
// light inside" is literally a description of an opal, so the signature look
// is now a milky pearl body carrying a live spectral fire (aqua / mint /
// amber / rose / periwinkle) that shifts as it turns -- an identity that is
// not a hue at all, and therefore cannot collide with any other badge's.
// The shell's edge wireframe hue-cycles on the CPU pre-fracture; the exposed
// core does it per-fragment and view-dependently in GLSL post-fracture.
//
// Escalated into a scripted three-beat cinematic: TENSION -> FRACTURE ->
// REVEAL.
//
//   t < 1.7s   the outer stone spins and visibly tightens, with a faint
//              chromatic fringe already separating at its edges
//   t = 1.7s   FRACTURE. The shell splits into shards, a white flash and an
//              expanding shockwave fire, and the RGB fringe blows apart into
//              a full prismatic dispersion
//   t > 1.7s   the nested inner core is exposed and hue-cycles iridescently
//
// PHYSICS NOTE: the shard/particle burst is a PROCEDURAL gravity-eased
// simulation, not a rigid-body solve. @react-three/rapier is in the project
// but wiring a <Physics> world inside this shared Canvas would change the
// scene graph for every other badge, which this batch is not allowed to do.
// The motion is closed-form per frame -- exponential-drag outward travel plus
// a quadratic gravity term -- which is stable, allocation-free, and
// deterministic on replay.
// --- Custom GLSL for R3's exposed core (2026-07-27) --------------------------
// The ONE hand-written shaderMaterial in this batch, deliberately scoped to a
// single mesh to prove the technique rather than sprinkling it thin. Everything
// else in the file uses stock three.js materials and is untouched.
//
// What it does that a meshStandardMaterial cannot:
//   * a real Fresnel/rim term computed per-fragment from the view vector, so
//     the silhouette lights up as the core turns instead of the whole surface
//     brightening uniformly
//   * VIEW-ANGLE-DEPENDENT hue. Physical iridescence is a thin-film effect --
//     the colour you see depends on the angle you see it from. Cycling
//     `material.emissive` on the CPU (what the rest of this env does) shifts
//     the whole mesh to one colour at a time; here the hue is offset by the
//     Fresnel term, so the facet you are looking straight through and the facet
//     at grazing angle are genuinely different colours in the same frame.
//   * a hard pow(rim, 6) specular lip on top, which is what reads as "polished
//     stone" once Bloom picks it up.
const MYTHIC_CORE_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const MYTHIC_CORE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHue;
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float facing = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
    float fres = 1.0 - facing;
    float rim = pow(fres, 2.4);

    // Thin-film read: hue is a function of viewing angle, not just time.
    vec3 body = hsv2rgb(vec3(fract(uHue + fres * 0.38), 0.85, 1.0));

    // Slow breathing band across the surface so the interior is never flat.
    float band = 0.5 + 0.5 * sin(fres * 14.0 - uTime * 2.1);

    vec3 col = body * (0.30 + band * 0.22 + rim * 2.10) * uIntensity;
    col += vec3(1.0) * pow(rim, 6.0) * 1.35 * uIntensity; // specular lip
    gl_FragColor = vec4(col, 1.0);
  }
`;

const EnvPerfectionistGemMythic = ({ color }: { color: THREE.Color }) => {
  const T_FRACTURE = 1.7;

  // Opal fire. Five stops, deliberately spanning the whole wheel -- an opal is
  // defined by carrying every hue at once, which is what stops this badge from
  // reading as "R2 again".
  const OPAL_AQUA = "#5ffbf1";
  const OPAL_MINT = "#7cff9e";
  const OPAL_FIRE = "#ffd166";
  const OPAL_ROSE = "#ff7bd5";
  const OPAL_PERI = "#8ea2ff";
  const OPAL_PEARL = "#eaf6ff";

  const shellRef = useRef<THREE.Group>(null);
  const shellEdgeRef = useRef<THREE.Mesh>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const dispersionRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const burstRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  // Shell shards -- 11 chunky pieces peeling off the stone.
  const shards = useMemo(
    () =>
      [...Array(11)].map(() => {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.35,
          Math.random() - 0.5
        ).normalize();
        return {
          dir,
          speed: 14 + Math.random() * 16,
          size: 1.5 + Math.random() * 2.4,
          spin: new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
          ),
          start: dir.clone().multiplyScalar(4 + Math.random() * 3)
        };
      }),
    []
  );

  // Fine debris -- 72 small pieces, faster and lighter than the shards so the
  // burst has two distinct mass classes instead of one uniform spray.
  const debris = useMemo(
    () =>
      [...Array(72)].map((_, i) => {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        return {
          dir,
          speed: 22 + Math.random() * 34,
          size: 0.25 + Math.random() * 0.7,
          // Five-stop cycle, not four: an odd stride against the 11 shards
          // means no two adjacent pieces of the burst share a colour.
          color: [OPAL_AQUA, OPAL_MINT, OPAL_FIRE, OPAL_ROSE, OPAL_PERI][i % 5]
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // The one bespoke GLSL material in this file. Created once per mount and
  // explicitly disposed -- a ShaderMaterial compiles its own program, so
  // leaking it would leak a GPU program per modal open.
  const coreMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: MYTHIC_CORE_VERT,
        fragmentShader: MYTHIC_CORE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uHue: { value: 0.09 },
          uIntensity: { value: 0.6 }
        },
        toneMapped: false
      }),
    []
  );
  useEffect(() => () => coreMaterial.dispose(), [coreMaterial]);

  // Prismatic dispersion: three copies of the same silhouette in offset R/G/B,
  // additively blended. Cheapest honest way to say "light splitting".
  const prisms = useMemo(
    () =>
      [
        { hex: "#ff2f4d", dir: -1 },
        { hex: "#2fff8f", dir: 0 },
        { hex: "#2f8fff", dir: 1 }
      ] as const,
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_FRACTURE);
    const e = Math.max(0, now - T_FRACTURE); // seconds since fracture
    const broken = now >= T_FRACTURE;

    // --- Beat 1: tension --------------------------------------------------
    if (shellRef.current) {
      shellRef.current.visible = !broken;
      if (!broken) {
        shellRef.current.rotation.y += delta * (0.8 + pre * 6.5);
        // Tightens, then flinches outward in the last 150ms before the break.
        const squeeze = 1 - pre * 0.16 + Math.pow(pre, 14) * 0.5;
        shellRef.current.scale.setScalar(squeeze);
      }
    }

    // Opal fire on the intact shell: the edge wireframe walks the full hue
    // wheel rather than sitting on one colour, and it walks FASTER as the
    // fracture approaches -- the stone is visibly straining, in colour.
    if (shellEdgeRef.current && !broken) {
      const mat = shellEdgeRef.current.material as THREE.MeshStandardMaterial;
      const h = (now * (0.14 + pre * 0.5)) % 1;
      mat.color.setHSL(h, 0.85, 0.68);
      mat.emissive.setHSL(h, 0.85, 0.68);
      mat.emissiveIntensity = 4 + pre * 4;
    }

    // --- Beat 2: fracture -------------------------------------------------
    if (shardsRef.current) {
      shardsRef.current.visible = broken;
      if (broken) {
        shardsRef.current.children.forEach((child, i) => {
          const s = shards[i];
          // Exponential drag: fast launch that asymptotes, so pieces "hang".
          const travel = (s.speed * (1 - Math.exp(-2.1 * e))) / 2.1;
          child.position.copy(s.start).addScaledVector(s.dir, travel);
          child.position.y -= 3.4 * e * e; // gravity
          child.rotation.set(s.spin.x * e, s.spin.y * e, s.spin.z * e);
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.opacity = Math.max(0, 1 - e / 2.4);
        });
      }
    }

    if (burstRef.current) {
      burstRef.current.visible = broken;
      if (broken) {
        burstRef.current.children.forEach((child, i) => {
          const d = debris[i];
          const travel = (d.speed * (1 - Math.exp(-3.0 * e))) / 3.0;
          child.position.copy(d.dir).multiplyScalar(travel);
          child.position.y -= 5.2 * e * e;
          const life = Math.max(0, 1 - e / 1.9);
          child.scale.setScalar(Math.max(0.001, life));
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.opacity = life;
        });
      }
    }

    if (flashRef.current) {
      const f = broken ? Math.max(0, 1 - e / 0.35) : 0;
      flashRef.current.visible = f > 0.01;
      flashRef.current.scale.setScalar(0.001 + f * 26);
      const mat = flashRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = f * 0.9;
    }

    if (shockRef.current) {
      const sw = broken ? clamp01(e / 1.1) : 0;
      shockRef.current.visible = broken && sw < 1;
      shockRef.current.scale.setScalar(0.001 + sw * 46);
      const mat = shockRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - sw) * 0.75;
      shockRef.current.rotation.z += delta * 0.6;
    }

    // --- Prismatic dispersion --------------------------------------------
    if (dispersionRef.current) {
      // A faint fringe pre-fracture, blown wide open after it.
      const spread = broken ? 0.5 + Math.min(e, 1.6) * 5.5 : 0.18 + pre * 0.5;
      const grow = broken ? 1 + Math.min(e, 1.6) * 0.75 : 1;
      // Decay pulled from exp(-0.8t) to exp(-1.7t) (2026-07-27): the old curve
      // still held ~15% alpha five seconds after the fracture, which -- three
      // additively-blended shells wide -- left a permanent soft pink/orange
      // wash across the lower frame where the description sits.
      const alpha = broken ? 0.6 * Math.exp(-e * 1.7) : 0.16 + pre * 0.14;
      dispersionRef.current.rotation.y += delta * (broken ? 0.5 : 1.6);
      dispersionRef.current.children.forEach((child, i) => {
        child.position.x = prisms[i].dir * spread;
        child.position.y = prisms[i].dir * spread * 0.35;
        child.scale.setScalar(grow * (1 + i * 0.05));
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = alpha;
      });
    }

    // --- Beat 3: the exposed iridescent core ------------------------------
    if (coreRef.current) {
      const emerge = broken ? easeOutBack(clamp01(e / 0.85)) : 0.28;
      coreRef.current.scale.setScalar(0.2 + 0.8 * emerge);
      coreRef.current.rotation.y += delta * (broken ? 1.5 : 0.4);
      coreRef.current.rotation.x += delta * 0.25;
      // Custom GLSL: drive uniforms, not material properties. The hue still
      // cycles on the CPU, but the shader offsets it per-fragment by the
      // Fresnel term, so the iridescence is view-dependent rather than a flat
      // colour swap across the whole mesh.
      const mat = coreRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = now;
      mat.uniforms.uHue.value = (0.09 + now * 0.11) % 1;
      mat.uniforms.uIntensity.value = broken
        ? 1.55 + Math.sin(now * 3) * 0.45
        : 0.6;
    }
  });

  return (
    <group>
      {/* Intact outer stone (beat 1). */}
      <group ref={shellRef}>
        <Octahedron args={[8, 0]} scale={[1, 1.5, 1]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} flatShading transparent opacity={0.55} />
        </Octahedron>
        <Octahedron ref={shellEdgeRef} args={[8.06, 0]} scale={[1, 1.5, 1]}>
          <meshStandardMaterial color={OPAL_AQUA} emissive={OPAL_AQUA} emissiveIntensity={5} wireframe />
        </Octahedron>
      </group>

      {/* Shell shards (beat 2). Each shard carries a different spectral stop,
          so the stone visibly comes apart INTO its colours. */}
      <group ref={shardsRef} visible={false}>
        {shards.map((s, i) => {
          const hex = [OPAL_ROSE, OPAL_AQUA, OPAL_FIRE, OPAL_PERI, OPAL_MINT][i % 5];
          return (
            <Tetrahedron key={i} args={[s.size, 0]}>
              <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={5} flatShading transparent opacity={1} />
            </Tetrahedron>
          );
        })}
      </group>

      {/* Fine debris burst (beat 2). */}
      <group ref={burstRef} visible={false}>
        {debris.map((d, i) => (
          <Octahedron key={i} args={[d.size, 0]}>
            <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={9} transparent opacity={1} toneMapped={false} />
          </Octahedron>
        ))}
      </group>

      {/* Prismatic RGB dispersion shells. */}
      <group ref={dispersionRef}>
        {prisms.map((p, i) => (
          <Octahedron key={i} args={[9.4, 0]} scale={[1, 1.5, 1]}>
            <meshBasicMaterial color={p.hex} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} wireframe toneMapped={false} />
          </Octahedron>
        ))}
      </group>

      {/* Fracture flash + shockwave. */}
      <Sphere ref={flashRef} args={[1, 24, 24]} visible={false}>
        <meshBasicMaterial color={'#ffffff'} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Sphere>
      <Torus ref={shockRef} args={[1, 0.045, 8, 96]} rotation={[Math.PI / 2.2, 0, 0]} visible={false}>
        <meshBasicMaterial color={OPAL_PEARL} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Torus>

      {/* Nested inner core (beat 3) -- the one custom-GLSL surface in the batch. */}
      <Octahedron ref={coreRef} args={[4.2, 0]} scale={[1, 1.5, 1]} material={coreMaterial} />

      {/* Twice R2's ring count, faster -- the family motif, escalated. Each
          ring is a different spectral stop rather than three shades of one
          metal, so the orbit itself reads as split light. */}
      <Float speed={2.5} rotationIntensity={0.6} floatIntensity={1.2}>
        <Torus args={[14, 0.06, 8, 160]} rotation={[Math.PI / 2.4, 0, 0]}>
          <meshStandardMaterial color={OPAL_AQUA} emissive={OPAL_AQUA} emissiveIntensity={7} toneMapped={false} />
        </Torus>
        <Torus args={[18, 0.045, 8, 160]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
          <meshStandardMaterial color={OPAL_ROSE} emissive={OPAL_ROSE} emissiveIntensity={5} toneMapped={false} />
        </Torus>
        <Torus args={[22, 0.03, 8, 160]} rotation={[Math.PI / 1.7, -Math.PI / 5, 0]}>
          <meshStandardMaterial color={OPAL_MINT} emissive={OPAL_MINT} emissiveIntensity={4} toneMapped={false} />
        </Torus>
      </Float>

      {/* Densest particulate of the five -- MYTHIC should feel over-budget.
          Trimmed 900/500 -> 640/340 on 2026-07-27 (repeat-open frame-budget
          fix); still the densest of the five by a clear margin. */}
      <Sparkles count={640} scale={44} size={4} speed={0.9} color={OPAL_PEARL} opacity={0.9} />
      <Sparkles count={340} scale={30} size={7} speed={0.4} color={OPAL_ROSE} opacity={0.8} />
    </group>
  );
};

// --- R4. "LevelMonument" -- Level Mastery: Intermediate L1, "Perfected" -----
// A brand-new badge CATEGORY, so it gets its own visual axis on purpose:
// architectural and vertical, where every skill badge is orbital or kinetic.
// Nothing here is borrowed from another env. Deep indigo at the base graduating
// to Intermediate-module emerald at the summit.
//
// The camera in the parent <Canvas> is fixed, so the "ascent" is expressed by
// the geometry itself rising into frame on a staggered per-slab delay over the
// first ~1.5s rather than by a camera move.
const EnvLevelMonument = ({ color }: { color: THREE.Color }) => {
  const slabsRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.Group>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const SLABS = 9;

  const slabs = useMemo(() => {
    const bottom = new THREE.Color("#4338ca"); // indigo
    const top = new THREE.Color("#10b981"); // emerald
    return [...Array(SLABS)].map((_, i) => {
      const k = i / (SLABS - 1);
      return {
        y: -17 + i * 4.4,
        w: 13.5 - i * 0.95,
        twist: i * 0.29, // rising spiral
        delay: i * 0.105, // staggered ascent
        // Each slab gets its own pulse phase + rate so the stack never reads
        // as nine identical copies of one prop.
        phase: i * 0.78,
        rate: 1.25 + (i % 3) * 0.32,
        hex: "#" + bottom.clone().lerp(top, k).getHexString()
      };
    });
  }, []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    const applyRise = (group: THREE.Group | null, edge: boolean) => {
      if (!group) return;
      group.children.forEach((child, i) => {
        const s = slabs[i];
        const p = clamp01((now - s.delay) / 0.75);
        const rise = easeOutBack(p);
        const grow = easeOutCubic(p);
        child.position.y = THREE.MathUtils.lerp(s.y - 26, s.y, rise);
        child.rotation.y = s.twist + now * 0.12;
        child.scale.setScalar(Math.max(0.001, grow));
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const pulse = Math.sin(now * s.rate + s.phase);
        mat.emissiveIntensity = edge ? 1.6 + pulse * 1.3 : 0.85 + pulse * 0.75;
        // Glass slabs breathe between ~0.18 and ~0.46 alpha; the edge skins
        // hold a steadier 0.55 so the silhouette never dissolves.
        mat.opacity = (edge ? 0.55 : 0.32 + pulse * 0.14) * grow;
      });
    };

    applyRise(slabsRef.current, false);
    applyRise(edgesRef.current, true);

    if (baseRef.current) {
      baseRef.current.rotation.y -= delta * 0.16;
    }
  });

  return (
    <Float speed={0.55} rotationIntensity={0.12} floatIntensity={0.9}>
      <group>
        {/* Translucent glass tablets. */}
        <group ref={slabsRef}>
          {slabs.map((s, i) => (
            <Box key={i} args={[s.w, 1.6, s.w * 0.72]}>
              <meshStandardMaterial color={s.hex} emissive={s.hex} emissiveIntensity={1} transparent opacity={0.4} />
            </Box>
          ))}
        </group>

        {/* Edge-lit wireframe skins -- this is what sells "glass slab" rather
            than "solid brick", and each one pulses off-phase from its slab. */}
        <group ref={edgesRef}>
          {slabs.map((s, i) => (
            <Box key={i} args={[s.w + 0.35, 1.85, s.w * 0.72 + 0.35]}>
              <meshStandardMaterial color={'#a5f3fc'} emissive={'#5eead4'} emissiveIntensity={2} wireframe transparent opacity={0.5} />
            </Box>
          ))}
        </group>

        {/* Hexagonal plinth. */}
        <Cylinder ref={baseRef} args={[18, 20, 1.4, 6]} position={[0, -21.5, 0]}>
          <meshStandardMaterial color={'#4338ca'} emissive={'#4338ca'} emissiveIntensity={2.2} flatShading transparent opacity={0.75} />
        </Cylinder>
        <Cylinder args={[21, 21, 0.35, 6]} position={[0, -22.6, 0]}>
          <meshStandardMaterial color={'#5eead4'} emissive={'#5eead4'} emissiveIntensity={3} wireframe />
        </Cylinder>

        {/* Axis of ascent -- a soft vertical light shaft through the stack. */}
        <Cylinder args={[1.5, 1.5, 56, 14, 1, true]} position={[0, 2, 0]}>
          <meshBasicMaterial color={'#67e8f9'} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </Cylinder>

        {/* Slow motes drifting UP a tall thin volume -- vertical, unhurried.
            Lowest particle speed of the five, by design. */}
        <Sparkles count={320} scale={[22, 56, 22]} size={3.2} speed={0.3} color={color} opacity={0.75} />
        <Sparkles count={120} scale={[10, 50, 10]} size={6} speed={0.12} color={'#5eead4'} opacity={0.5} />
      </group>
    </Float>
  );
};

// --- R5. "StreakChainLegendary" -- Unstoppable Streak, LEGENDARY ------------
// Full spectacle. A Mobius-twisted loop of interlocking chain links wrapped
// around a torus-knot ion trail, with two comets running the loop in opposition
// and dropping decaying spark tails. The only env of the five split across
// three colour temperatures (crimson body, orange body, white-hot comet head)
// so it reads as burning rather than glowing.
//
// This is also the only badge that opts into the letterbox crop -- see the
// `letterbox` flag on its badgeColorConfig entry.
const EnvStreakChain = ({ color }: { color: THREE.Color }) => {
  const R = 15;
  const LINKS = 18;
  const TAIL = 34;

  const chainRef = useRef<THREE.Group>(null);
  const cometARef = useRef<THREE.Group>(null);
  const cometBRef = useRef<THREE.Group>(null);
  const knotRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  // Parametric path both the links and the comets ride. Sharing one path is
  // what makes the sparks look like they belong to the chain.
  const pathAt = (a: number, out: THREE.Vector3) =>
    out.set(Math.cos(a) * R, Math.sin(a) * R * 0.62, Math.sin(a * 2) * 4.2);

  const links = useMemo(
    () =>
      [...Array(LINKS)].map((_, i) => {
        const a = (i / LINKS) * Math.PI * 2;
        const p = pathAt(a, new THREE.Vector3());
        return {
          a,
          pos: [p.x, p.y, p.z] as [number, number, number],
          // Alternating perpendicular planes == an actual interlocking chain.
          // The extra `a * 0.5` term adds a half-twist over the full loop,
          // which is the Mobius read.
          rot: [0, (i % 2) * (Math.PI / 2) + a * 0.5, a] as [number, number, number],
          // Colour temperature ramps around the loop instead of being uniform.
          hex: ["#dc2626", "#f97316", "#fb923c"][i % 3],
          emissive: 3.5 + (i % 3) * 1.8
        };
      }),
    []
  );

  const tail = useMemo(
    () =>
      [...Array(TAIL)].map((_, i) => {
        const k = i / TAIL;
        return {
          lag: i * 0.055,
          size: 1.5 * Math.pow(1 - k, 1.5) + 0.12,
          jitter: new THREE.Vector3(
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 2.2
          ),
          hex: k < 0.08 ? "#ffffff" : k < 0.3 ? "#fde68a" : k < 0.65 ? "#f97316" : "#dc2626"
        };
      }),
    []
  );

  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (chainRef.current) {
      chainRef.current.rotation.z = now * 0.28;
      chainRef.current.rotation.x = Math.sin(now * 0.4) * 0.22;
      chainRef.current.children.forEach((child, i) => {
        // Each link also spins on its own tangent -- the chain feels driven,
        // not carried.
        child.rotation.y = links[i].rot[1] + now * 0.9;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = links[i].emissive + Math.sin(now * 3.2 + i * 0.9) * 1.6;
      });
    }

    const driveComet = (group: THREE.Group | null, offset: number) => {
      if (!group) return;
      const head = now * 1.9 + offset;
      group.children.forEach((child, i) => {
        pathAt(head - tail[i].lag, scratch);
        child.position.copy(scratch).add(tail[i].jitter);
        const flicker = 0.85 + Math.sin(now * 14 + i) * 0.15;
        child.scale.setScalar(tail[i].size * flicker);
      });
    };
    driveComet(cometARef.current, 0);
    driveComet(cometBRef.current, Math.PI);

    if (knotRef.current) {
      knotRef.current.rotation.x += delta * 0.18;
      knotRef.current.rotation.y -= delta * 0.11;
    }
  });

  return (
    <group>
      {/* Ion-trail knot the chain is threaded onto. */}
      <TorusKnot ref={knotRef} args={[13.5, 0.22, 320, 12, 3, 4]}>
        <meshStandardMaterial color={'#fb923c'} emissive={'#fb923c'} emissiveIntensity={4.5} transparent opacity={0.55} toneMapped={false} />
      </TorusKnot>

      {/* Interlocking Mobius chain. */}
      <group ref={chainRef}>
        {links.map((l, i) => (
          <Torus key={i} args={[3.1, 0.45, 10, 30]} position={l.pos} rotation={l.rot}>
            <meshStandardMaterial color={l.hex} emissive={l.hex} emissiveIntensity={l.emissive} flatShading toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Two opposed comets with decaying spark tails. */}
      <group ref={cometARef}>
        {tail.map((s, i) => (
          <Icosahedron key={i} args={[1, 0]}>
            <meshBasicMaterial color={s.hex} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Icosahedron>
        ))}
      </group>
      <group ref={cometBRef}>
        {tail.map((s, i) => (
          <Icosahedron key={i} args={[1, 0]}>
            <meshBasicMaterial color={s.hex} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Icosahedron>
        ))}
      </group>

      {/* Heat haze shell. */}
      <Sphere args={[26, 24, 24]}>
        <meshBasicMaterial color={'#7f1d1d'} transparent opacity={0.12} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Sphere>

      {/* Embers: fastest, hottest, widest particulate of the five.
          Counts trimmed 1100/450 -> 780/340 on 2026-07-27 as part of the
          repeat-open frame-budget fix; visually indistinguishable because the
          embers are heavily overlapping at this scale. */}
      <Sparkles count={780} scale={[54, 40, 34]} size={8} speed={2.9} color={color} opacity={0.8} />
      <Sparkles count={340} scale={[38, 30, 26]} size={4} speed={1.4} color={'#fde68a'} opacity={0.9} />
    </group>
  );
};

// ============================================================================
// MOCK-EXAM ELEVATION -- BATCH 1 (2026-07-27)
// ----------------------------------------------------------------------------
// THREE new environments, and only three. The other twelve badges in this batch
// keep an EXISTING shared environment, because the geometry already fits and a
// distinct `color` prop is enough to make them read as different places:
//
//   Target      -> EnvTarget       concentric lock-on rings. Literally the icon.
//   Focus       -> EnvPerfectionistGem  (NEW CASE, was falling through to
//                                    EnvDefault) -- points the real backend
//                                    iconName at the approved reference-batch
//                                    gem environment.
//   Scan        -> EnvScan         grid sweep. Literally the icon.
//   Zap         -> EnvSpeedComet   (NEW CASE, was EnvDefault) -- same reasoning
//                                    as Focus, for the real Speed Demon BASE.
//   FastForward -> EnvFastForward  hyper-speed cones.
//   Rocket      -> EnvRocket       warp drive.
//   Medal       -> EnvMedal        golden pantheon / podium.
//   Flame       -> EnvFlame        volumetric fire, now tinted cobalt.
//   Activity    -> EnvActivity     data-matrix rain, reads as a monitor trace.
//   Infinity    -> EnvInfinity     mobius knot.
//   Clock       -> EnvClock        giant gears.
//   Sun         -> EnvSun          supernova.
//
// The three that DID need bespoke work:
//   Crown       -> EnvCrownVault      was sharing EnvMedal with Medal+Trophy.
//                                     Medal is in this batch too, so the two
//                                     would have shipped as the same set with a
//                                     recolour. Crown moves out; MEDAL AND
//                                     TROPHY KEEP EnvMedal COMPLETELY UNCHANGED.
//   Flag        -> EnvBannerField     had no case at all and was rendering the
//                                     generic EnvDefault octahedron.
//   AlarmClock  -> EnvAlarmResonance  was sharing EnvClock with Clock, and Clock
//                                     is in this batch too. Same problem as
//                                     Crown/Medal. CLOCK KEEPS EnvClock.
//
// Same craft rules as the reference batch: randomness resolved once in useMemo,
// per-env time accumulator so choreography starts at reveal, and deliberately
// different motion/density signatures so none of the three reads as a reskin.
// ----------------------------------------------------------------------------

// --- B1. "CrownVault" -- Competitor LEGENDARY -------------------------------
// A coronation rather than a podium: five spires rise on a stagger and lock
// into a ring, each capped by an orb, over a wide arched band. The distinction
// from EnvMedal is structural, not chromatic -- EnvMedal is a horizontal
// pantheon of vertical columns viewed side-on; this is a radial crown assembling
// in the air with nothing underneath it.
const EnvCrownVault = ({ color }: { color: THREE.Color }) => {
  const SPIRES = 5;
  const crownRef = useRef<THREE.Group>(null);
  const orbsRef = useRef<THREE.Group>(null);
  const bandRef = useRef<THREE.Mesh>(null);
  const motesRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const GOLD = "#f0c74a";
  const GOLD_HOT = "#fff6d8";

  const spires = useMemo(
    () =>
      [...Array(SPIRES)].map((_, i) => {
        const a = (i / SPIRES) * Math.PI * 2;
        // The front-centre spire is the tallest, exactly as in the glyph.
        const hero = i === 0;
        return {
          a,
          x: Math.cos(a) * 13,
          z: Math.sin(a) * 13,
          h: hero ? 20 : 14 + (i % 2) * 3,
          r: hero ? 2.9 : 2.3,
          delay: Math.abs(i - 0) * 0.16,
        };
      }),
    []
  );

  // Falling gold motes -- a curtain, not a cloud: tall thin volume, slow.
  const motes = useMemo(
    () =>
      [...Array(60)].map(() => ({
        x: (Math.random() - 0.5) * 46,
        y: Math.random() * 60 - 30,
        z: (Math.random() - 0.5) * 40,
        s: 0.25 + Math.random() * 0.6,
        v: 3 + Math.random() * 7,
      })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (crownRef.current) {
      crownRef.current.rotation.y = now * 0.28;
      crownRef.current.children.forEach((child, i) => {
        const s = spires[i];
        const p = clamp01((now - s.delay) / 0.9);
        const rise = easeOutBack(p);
        child.position.y = THREE.MathUtils.lerp(-26, 0, rise);
        child.scale.setScalar(Math.max(0.001, easeOutCubic(p)));
      });
    }

    if (orbsRef.current) {
      orbsRef.current.rotation.y = now * 0.28;
      orbsRef.current.children.forEach((child, i) => {
        const s = spires[i];
        const p = clamp01((now - s.delay - 0.35) / 0.7);
        child.scale.setScalar(Math.max(0.001, easeOutBack(p)));
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        // Each orb ignites off-phase so the ring never pulses as one unit.
        mat.emissiveIntensity = 6 + Math.sin(now * 2.1 + i * 1.3) * 3.5;
      });
    }

    if (bandRef.current) {
      bandRef.current.rotation.z = -now * 0.16;
      const p = clamp01(now / 1.1);
      bandRef.current.scale.setScalar(0.2 + 0.8 * easeOutCubic(p));
    }

    if (motesRef.current) {
      motesRef.current.children.forEach((child, i) => {
        child.position.y -= motes[i].v * delta;
        if (child.position.y < -32) child.position.y = 32;
        child.rotation.x += delta * 1.4;
      });
    }
  });

  return (
    <group position={[0, -2, 0]}>
      {/* Arched band the spires stand on -- open at the front (partial arc),
          so it reads as a crown seen slightly from above rather than a hoop. */}
      <Torus ref={bandRef} args={[13, 0.75, 10, 90, Math.PI * 1.75]} rotation={[Math.PI / 2.1, 0, 0]} position={[0, -8, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} flatShading toneMapped={false} />
      </Torus>
      <Torus args={[13, 0.18, 8, 90]} rotation={[Math.PI / 2.1, 0, 0]} position={[0, -6.6, 0]}>
        <meshStandardMaterial color={GOLD_HOT} emissive={GOLD_HOT} emissiveIntensity={5} toneMapped={false} />
      </Torus>

      {/* Spires. */}
      <group ref={crownRef}>
        {spires.map((s, i) => (
          <Cone key={i} args={[s.r, s.h, 4, 1]} position={[s.x, 0, s.z]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.8} flatShading transparent opacity={0.82} />
          </Cone>
        ))}
      </group>

      {/* Orb caps. */}
      <group ref={orbsRef}>
        {spires.map((s, i) => (
          <Icosahedron key={i} args={[s.r * 0.62, 1]} position={[s.x, s.h / 2 + 1.4, s.z]}>
            <meshStandardMaterial color={GOLD_HOT} emissive={GOLD_HOT} emissiveIntensity={7} flatShading toneMapped={false} />
          </Icosahedron>
        ))}
      </group>

      {/* Three gem lozenges set into the band, matching the glyph. */}
      <Float speed={1.4} rotationIntensity={0.8} floatIntensity={0.6}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 + 0.3;
          return (
            <Octahedron key={i} args={[2.1, 0]} position={[Math.cos(a) * 13, -8, Math.sin(a) * 13]}>
              <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={6} flatShading toneMapped={false} />
            </Octahedron>
          );
        })}
      </Float>

      {/* Gold-leaf curtain. Chunky discrete motes rather than a Sparkles field:
          this env should feel like falling gilding, not like dust. */}
      <group ref={motesRef}>
        {motes.map((m, i) => (
          <Tetrahedron key={i} args={[m.s, 0]} position={[m.x, m.y, m.z]}>
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={4} flatShading toneMapped={false} />
          </Tetrahedron>
        ))}
      </group>

      <Sparkles count={280} scale={[44, 50, 40]} size={3.4} speed={0.22} color={GOLD_HOT} opacity={0.7} />
    </group>
  );
};

// --- B2. "BannerField" -- Competitor SUPER ----------------------------------
// A field of planted banners with a wind wave travelling across it. The cloth
// ripple is faked with a vertical stack of thin slats per banner, each offset
// by a phase-lagged sine -- cheap, allocation-free, and it survives the low
// polygon budget far better than a subdivided plane would without a custom
// vertex shader (which this batch is not adding: the one hand-written
// ShaderMaterial in the file is deliberately scoped to the MYTHIC core).
const EnvBannerField = ({ color }: { color: THREE.Color }) => {
  const SLATS = 7;
  const fieldRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const RED_HOT = "#ff9c9c";
  const RED_DEEP = "#5a0303";

  const banners = useMemo(
    () =>
      [...Array(14)].map((_, i) => {
        const ring = Math.floor(i / 7);
        const k = i % 7;
        return {
          x: (k - 3) * 11 + (ring % 2) * 5.5,
          z: -18 - ring * 26,
          h: 26 - ring * 3,
          // Phase is seeded off world X so the ripple reads as ONE wind front
          // crossing the field rather than 14 independent flags.
          phase: (k - 3) * 0.55 + ring * 0.9,
          hero: i === 3,
        };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    if (!fieldRef.current) return;

    fieldRef.current.children.forEach((banner, bi) => {
      const b = banners[bi];
      // Reveal: banners plant themselves front-to-back.
      const p = clamp01((now - bi * 0.05) / 0.8);
      banner.scale.setScalar(Math.max(0.001, easeOutCubic(p)));

      const cloth = banner.children[1] as THREE.Group | undefined;
      if (!cloth) return;
      cloth.children.forEach((slat, si) => {
        const lag = si * 0.42;
        const amp = 0.9 + si * 0.42; // free edge travels further than the hoist
        slat.position.z = Math.sin(now * 2.6 + b.phase - lag) * amp;
        slat.rotation.y = Math.sin(now * 2.6 + b.phase - lag) * 0.34;
      });
    });
  });

  return (
    <group position={[0, -6, 0]}>
      <group ref={fieldRef}>
        {banners.map((b, i) => (
          <group key={i} position={[b.x, 0, b.z]}>
            {/* Mast. */}
            <Cylinder args={[0.26, 0.26, b.h, 6]} position={[0, b.h / 2 - 6, 0]}>
              <meshStandardMaterial color={RED_HOT} emissive={RED_HOT} emissiveIntensity={2.4} />
            </Cylinder>
            {/* Cloth: slats hung off the mast, widening away from it. */}
            <group>
              {[...Array(SLATS)].map((_, s) => (
                <Box
                  key={s}
                  args={[1.5, b.hero ? 7.5 : 5.4, 0.16]}
                  position={[1.1 + s * 1.5, b.h / 2 - 2 + (b.hero ? 1.2 : 0), 0]}
                >
                  <meshStandardMaterial
                    color={s % 2 === 0 ? color : RED_DEEP}
                    emissive={s % 2 === 0 ? color : RED_DEEP}
                    emissiveIntensity={s % 2 === 0 ? 3.6 : 1.4}
                    flatShading
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.92}
                  />
                </Box>
              ))}
            </group>
            {/* Finial. */}
            <Icosahedron args={[0.72, 0]} position={[0, b.h - 6, 0]}>
              <meshStandardMaterial color={'#ffffff'} emissive={RED_HOT} emissiveIntensity={7} flatShading toneMapped={false} />
            </Icosahedron>
          </group>
        ))}
      </group>

      {/* Ground plane the banners are planted in -- without it they float. */}
      <Grid args={[220, 220]} position={[0, -6.2, -40]} cellColor={RED_DEEP} sectionColor={color} sectionThickness={1.1} cellThickness={0.4} fadeDistance={130} />

      {/* Wind: fast, flat, horizontal. Widest/shallowest Sparkles volume of the
          three so it reads as a gust rather than an atmosphere. */}
      <Sparkles count={420} scale={[110, 18, 90]} size={5} speed={2.2} color={RED_HOT} opacity={0.55} />
    </group>
  );
};

// --- B3. "AlarmResonance" -- Early Bird LEGENDARY ---------------------------
// Sound made visible. Six shockwave rings fire on a staggered loop from a pair
// of struck bells, expanding and thinning until they leave frame. Nothing here
// rotates on a fixed axis -- the whole env is a repeating radial pulse, which
// is the one motion signature the other envs in this file do not use.
const EnvAlarmResonance = ({ color }: { color: THREE.Color }) => {
  const RINGS = 6;
  const PERIOD = 2.2;

  const ringsRef = useRef<THREE.Group>(null);
  const bellARef = useRef<THREE.Group>(null);
  const bellBRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const TEAL_HOT = "#8ff0ff";

  const rings = useMemo(
    () =>
      [...Array(RINGS)].map((_, i) => ({
        offset: (i / RINGS) * PERIOD,
        tilt: (i % 3) * 0.22 - 0.22,
        tube: 0.14 + (i % 2) * 0.16,
      })),
    []
  );

  // Suspended motes that get shoved outward on every pulse -- this is what
  // makes the rings read as pressure rather than as neon hoops.
  const dust = useMemo(
    () =>
      [...Array(90)].map(() => {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        return { dir, base: 8 + Math.random() * 26, size: 0.2 + Math.random() * 0.5, phase: Math.random() * PERIOD };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        const age = (now + rings[i].offset) % PERIOD;
        const p = age / PERIOD;
        child.scale.setScalar(0.4 + p * 34);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        // Sharp attack, long decay -- a struck bell, not a sine fade.
        mat.opacity = Math.pow(1 - p, 2.2) * 0.85;
      });
    }

    // Bells rock in opposition and hit hardest at the start of each period.
    const strike = Math.pow(1 - ((now % PERIOD) / PERIOD), 6);
    if (bellARef.current) bellARef.current.rotation.z = 0.28 + Math.sin(now * 9) * 0.16 * strike;
    if (bellBRef.current) bellBRef.current.rotation.z = -0.28 - Math.sin(now * 9) * 0.16 * strike;

    if (dustRef.current) {
      dustRef.current.children.forEach((child, i) => {
        const d = dust[i];
        const push = Math.pow(1 - (((now + d.phase) % PERIOD) / PERIOD), 3) * 7;
        child.position.copy(d.dir).multiplyScalar(d.base + push);
      });
    }
  });

  return (
    <group>
      {/* Expanding shockwaves. */}
      <group ref={ringsRef}>
        {rings.map((r, i) => (
          <Torus key={i} args={[1, r.tube, 6, 84]} rotation={[Math.PI / 2 + r.tilt, 0, 0]}>
            <meshBasicMaterial color={i % 2 ? TEAL_HOT : color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Twin bells. */}
      <group ref={bellARef} position={[-9.5, 8, 0]}>
        <Cone args={[5.2, 7.6, 12, 1, true]} rotation={[Math.PI, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.4} side={THREE.DoubleSide} flatShading transparent opacity={0.8} />
        </Cone>
        <Sphere args={[1.5, 12, 12]} position={[0, -3.4, 0]}>
          <meshStandardMaterial color={TEAL_HOT} emissive={TEAL_HOT} emissiveIntensity={8} toneMapped={false} />
        </Sphere>
      </group>
      <group ref={bellBRef} position={[9.5, 8, 0]}>
        <Cone args={[5.2, 7.6, 12, 1, true]} rotation={[Math.PI, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.4} side={THREE.DoubleSide} flatShading transparent opacity={0.8} />
        </Cone>
        <Sphere args={[1.5, 12, 12]} position={[0, -3.4, 0]}>
          <meshStandardMaterial color={TEAL_HOT} emissive={TEAL_HOT} emissiveIntensity={8} toneMapped={false} />
        </Sphere>
      </group>

      {/* The dial the bells sit on -- a bare ring, kept deliberately minimal so
          it never competes with EnvClock's gear stack. */}
      <Float speed={0.8} rotationIntensity={0.2} floatIntensity={0.7}>
        <Torus args={[11, 0.5, 10, 64]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} flatShading />
        </Torus>
        <Torus args={[9.2, 0.12, 8, 64]}>
          <meshStandardMaterial color={TEAL_HOT} emissive={TEAL_HOT} emissiveIntensity={4} toneMapped={false} />
        </Torus>
      </Float>

      {/* Pressure-shoved motes. */}
      <group ref={dustRef}>
        {dust.map((d, i) => (
          <Octahedron key={i} args={[d.size, 0]}>
            <meshStandardMaterial color={TEAL_HOT} emissive={TEAL_HOT} emissiveIntensity={5} toneMapped={false} />
          </Octahedron>
        ))}
      </group>

      {/* Cold, sparse, slow -- the pre-dawn air. Lowest particle count of the
          three new envs on purpose. */}
      <Sparkles count={220} scale={48} size={3} speed={0.35} color={color} opacity={0.6} />
    </group>
  );
};

// ============================================================================
// END MOCK-EXAM ELEVATION BATCH 1
// ============================================================================

// ============================================================================
// MOCK-EXAM ELEVATION -- BATCH 2 (2026-07-27)
// ----------------------------------------------------------------------------
// NINE new environments. Batch 1 only needed three because most of its badges
// already had a case of their own; batch 2's fifteen badges had never been
// given environments at all, and the audit found four separate COLLISIONS plus
// a four-way pile-up on the generic fallback:
//
//   BEFORE                                          AFTER
//   Target + Crosshair    -> EnvTarget              Crosshair -> EnvReticleLock
//   Scan + Radar          -> EnvScan                Radar     -> EnvRadarSweep
//   Medal + Trophy        -> EnvMedal               Trophy    -> EnvPodiumTiers
//   FastForward +                                   ChevronsUp   -> EnvSurgeColumn
//     ChevronsUp +        -> EnvFastForward         ArrowUpRight -> EnvBreakthroughBreach
//     ArrowUpRight
//   TrendingUp, Sparkles,                           TrendingUp -> EnvComebackArc
//     Aperture, Anchor    -> EnvDefault (no case)   Sparkles   -> EnvChampionWreath
//                                                   Aperture   -> EnvApertureIris
//                                                   Anchor     -> EnvAnchorDepths
//
// In every case the ALREADY-ELEVATED badge keeps its existing environment and
// the batch-2 badge is the one that moves -- Target keeps EnvTarget, Scan keeps
// EnvScan, Medal keeps EnvMedal, FastForward keeps EnvFastForward. That is the
// same rule batch 1 used when Crown moved off EnvMedal, and it is what
// guarantees this pass cannot regress a signed-off cinematic.
//
// The other six batch-2 badges (Star, Shield, Mountain, Brain, Lightbulb,
// Library) already had dedicated, non-colliding cases and are deliberately NOT
// rebuilt. They pick up their new identity colour automatically, because every
// Env* takes `color` and that value is burst[0] from badgeVisuals.
//
// Same craft rules as before: randomness resolved once in useMemo, a per-env
// time accumulator so choreography starts at reveal rather than at WebGL
// context creation, and a distinct motion signature per env (linear sweep /
// impulse / rise / stagger / assembly / snap / iris / rotation / fall) so no
// two read as reskins.
// ----------------------------------------------------------------------------

// --- C1. "ComebackArc" -- Comeback Kid BASE ---------------------------------
// The badge is a score curve, so the environment is one: a run of bars whose
// heights trace a dip and a recovery, standing up left-to-right, with a marker
// that travels the curve and a dashed datum plane at the previous score. The
// motion signature is a LEFT-TO-RIGHT SWEEP, which nothing else in the file
// uses (EnvActivity falls, EnvRocket flies at camera, EnvClock rotates).
const EnvComebackArc = ({ color }: { color: THREE.Color }) => {
  const COUNT = 30;
  const barsRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const EMBER = "#e8703f";
  const HOT = "#ffd9c9";

  // Curve: start high, fall to a trough at ~35%, then climb well past the
  // start. `y` here is the bar's top, in world units.
  const curve = useMemo(() => {
    const f = (u: number) => {
      const dip = Math.exp(-Math.pow((u - 0.34) / 0.22, 2)) * 17;
      return -8 + u * 30 - dip;
    };
    return [...Array(COUNT)].map((_, i) => {
      const u = i / (COUNT - 1);
      return { u, x: -34 + u * 68, y: f(u), delay: u * 1.15 };
    });
  }, []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (barsRef.current) {
      barsRef.current.children.forEach((child, i) => {
        const c = curve[i];
        const p = clamp01((now - c.delay) / 0.55);
        const h = Math.max(0.01, (c.y + 22) * easeOutCubic(p));
        child.scale.y = h;
        child.position.y = -22 + h / 2;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        // The recovering half of the curve burns hotter than the falling half.
        mat.emissiveIntensity = 1.4 + (c.u > 0.34 ? (c.u - 0.34) * 6 : 0);
      });
    }

    if (markerRef.current) {
      // Marker runs the curve on a loop, pausing at the trough.
      const cyc = (now * 0.42) % 1.35;
      const u = clamp01(cyc / 1.0);
      const idx = Math.min(COUNT - 1, Math.floor(u * (COUNT - 1)));
      const c = curve[idx];
      markerRef.current.position.set(c.x, c.y + 2.2, 0);
      markerRef.current.scale.setScalar(1 + Math.sin(now * 6) * 0.12);
    }
  });

  return (
    <group position={[0, 2, -6]}>
      {/* Datum plane at the previous score -- the thing being beaten. */}
      <Box args={[72, 0.14, 0.14]} position={[0, -8, 0]}>
        <meshBasicMaterial color={EMBER} transparent opacity={0.7} toneMapped={false} />
      </Box>
      <Grid args={[90, 60]} position={[0, -22.2, -14]} cellColor={'#2a0f0c'} sectionColor={color} sectionThickness={1} cellThickness={0.35} fadeDistance={120} />

      <group ref={barsRef}>
        {curve.map((c, i) => (
          <Box key={i} args={[1.5, 1, 1.5]} position={[c.x, -22, 0]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} flatShading transparent opacity={0.88} />
          </Box>
        ))}
      </group>

      {/* Travelling marker. */}
      <Icosahedron ref={markerRef} args={[1.5, 1]}>
        <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={7} flatShading toneMapped={false} />
      </Icosahedron>

      {/* Ember drift -- slow, sparse, low: this is the coldest of the three
          Comeback environments and should feel like it is only just alight. */}
      <Sparkles count={220} scale={[76, 34, 26]} size={4} speed={0.5} color={EMBER} opacity={0.6} />
    </group>
  );
};

// --- C2. "BreakthroughBreach" -- Comeback Kid SUPER -------------------------
// An IMPULSE env: a tiled ceiling slab that gets punched through from below on
// a hard 2.4s loop. Tiles nearest the breach are thrown outward and fall back,
// the wedge overshoots and resets, and shards spray on the frame of impact.
// Nothing here rotates -- the whole signature is a repeated hit, which is the
// one thing EnvFastForward (the env this badge used to share) never does.
const EnvBreakthroughBreach = ({ color }: { color: THREE.Color }) => {
  const PERIOD = 2.4;
  const tilesRef = useRef<THREE.Group>(null);
  const wedgeRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const DEEP = "#7a0d18";
  const HOT = "#ffe3e6";

  const tiles = useMemo(() => {
    const out: { x: number; z: number; d: number; spin: THREE.Vector3 }[] = [];
    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = -3; iz <= 3; iz++) {
        const x = ix * 7.4;
        const z = iz * 7.4;
        out.push({
          x,
          z,
          d: Math.hypot(x, z),
          spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3),
        });
      }
    }
    return out;
  }, []);

  const shards = useMemo(
    () =>
      [...Array(46)].map(() => {
        const a = Math.random() * Math.PI * 2;
        const s = 4 + Math.random() * 9;
        return {
          dir: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 7, Math.sin(a) * s),
          size: 0.5 + Math.random() * 1.1,
          phase: Math.random() * 0.25,
        };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const age = now % PERIOD;

    // Wedge: charges up from below, hits at 0.55s, coasts, then resets unseen.
    if (wedgeRef.current) {
      const p = clamp01(age / 0.55);
      const y = age < 0.55
        ? THREE.MathUtils.lerp(-34, 4, easeOutCubic(p))
        : 4 + (age - 0.55) * 7;
      wedgeRef.current.position.set(-y * 0.45, y, 0);
      wedgeRef.current.visible = age < 1.9;
    }

    if (tilesRef.current) {
      tilesRef.current.children.forEach((child, i) => {
        const tile = tiles[i];
        // Shock reaches a tile later the further out it is.
        const hit = 0.55 + tile.d * 0.012;
        const k = age < hit ? 0 : Math.max(0, 1 - (age - hit) / 1.15);
        const push = Math.pow(k, 1.6) * (26 / (1 + tile.d * 0.14));
        child.position.set(tile.x, push * 0.75, tile.z);
        child.rotation.set(tile.spin.x * push * 0.05, tile.spin.y * push * 0.05, tile.spin.z * push * 0.05);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.1 + k * 5;
      });
    }

    if (shardsRef.current) {
      const k = age < 0.55 ? 0 : clamp01((age - 0.55) / 1.5);
      shardsRef.current.children.forEach((child, i) => {
        const s = shards[i];
        const p = clamp01(k - s.phase);
        child.position.set(s.dir.x * p * 3, s.dir.y * p * 3 - 22 * p * p, s.dir.z * p * 3);
        child.rotation.x += delta * 5;
        child.rotation.z += delta * 4;
        child.visible = p > 0 && p < 1;
      });
    }
  });

  return (
    <group position={[0, -2, -8]}>
      {/* The ceiling. Tiles, not one plane, so the break is legible. */}
      <group ref={tilesRef}>
        {tiles.map((tile, i) => (
          <Box key={i} args={[6.6, 0.9, 6.6]} position={[tile.x, 0, tile.z]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={1.2} flatShading transparent opacity={0.9} />
          </Box>
        ))}
      </group>

      {/* The wedge. Two stacked cones so it has a hot tip and a body. */}
      <group ref={wedgeRef} rotation={[0, 0, -Math.PI / 5]}>
        <Cone args={[3.4, 12, 4, 1]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} flatShading toneMapped={false} />
        </Cone>
        <Cone args={[1.5, 5, 4, 1]} position={[0, 6.6, 0]}>
          <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={9} flatShading toneMapped={false} />
        </Cone>
      </group>

      {/* Impact shards. */}
      <group ref={shardsRef}>
        {shards.map((s, i) => (
          <Tetrahedron key={i} args={[s.size, 0]}>
            <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={5} flatShading toneMapped={false} />
          </Tetrahedron>
        ))}
      </group>

      {/* Dust kicked up under the slab. Wide and flat. */}
      <Sparkles count={340} scale={[80, 20, 60]} size={5} speed={1.1} color={color} opacity={0.55} />
    </group>
  );
};

// --- C3. "SurgeColumn" -- Comeback Kid LEGENDARY ----------------------------
// A continuous RISE, not a loop of hits: seven chevron rings climb a column,
// ACCELERATING as they go (velocity scales with height) and shrinking, so the
// column reads as tapering into the distance. The badge's own glyph is five
// decaying chevrons; this is that mark, extruded into a shaft of light.
const EnvSurgeColumn = ({ color }: { color: THREE.Color }) => {
  const RINGS = 9;
  const SPAN = 56;
  const ringsRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const INK = "#8c2247";
  const HOT = "#ffe0ea";

  const rings = useMemo(
    () =>
      [...Array(RINGS)].map((_, i) => ({
        offset: (i / RINGS) * SPAN,
        tilt: (i % 2 ? 1 : -1) * 0.12,
      })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        // Quadratic in height => visibly accelerating, not a conveyor belt.
        const raw = (now * 9 + rings[i].offset) % SPAN;
        const u = raw / SPAN;
        const y = -26 + Math.pow(u, 1.55) * SPAN;
        child.position.y = y;
        child.scale.setScalar(1 - u * 0.62);
        child.rotation.z = rings[i].tilt + u * 0.5;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 2 + u * 7;
        mat.opacity = 0.25 + Math.sin(u * Math.PI) * 0.72;
      });
    }

    if (coreRef.current) {
      coreRef.current.scale.set(1 + Math.sin(now * 3.1) * 0.08, 1, 1 + Math.cos(now * 2.7) * 0.08);
      coreRef.current.rotation.y = now * 0.5;
    }
  });

  return (
    <group position={[0, 0, -4]}>
      {/* Shaft of light the chevrons ride. Open-ended cone, tapering upward. */}
      <Cone ref={coreRef} args={[7.5, 58, 20, 1, true]} position={[0, 3, 0]}>
        <meshBasicMaterial color={color} transparent opacity={0.16} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Cone>

      {/* Chevron rings. A 120-degree torus arc reads as a chevron in profile
          and, unlike a full ring, keeps a clear direction. */}
      <group ref={ringsRef}>
        {rings.map((r, i) => (
          <Torus key={i} args={[9.5, 0.55, 8, 40, Math.PI * 0.66]} rotation={[Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color={i % 3 === 0 ? HOT : color} emissive={i % 3 === 0 ? HOT : color} emissiveIntensity={3} flatShading transparent opacity={0.8} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Base ring the surge leaves from. */}
      <Torus args={[11, 0.45, 8, 60]} rotation={[Math.PI / 2, 0, 0]} position={[0, -26, 0]}>
        <meshStandardMaterial color={INK} emissive={color} emissiveIntensity={4} flatShading />
      </Torus>

      {/* Two updraft fields at different speeds -- the fastest particulate in
          the Comeback trio, matching the tier. */}
      <Sparkles count={520} scale={[26, 62, 26]} size={6} speed={3.2} color={color} opacity={0.75} />
      <Sparkles count={200} scale={[16, 58, 16]} size={3} speed={1.6} color={HOT} opacity={0.9} />
    </group>
  );
};

// --- P1. "PodiumTiers" -- Podium Finisher BASE ------------------------------
// Trophy used to share EnvMedal with Medal (competitor BASE). EnvMedal is a
// circular colonnade seen side-on; this is deliberately the opposite reading:
// three rectangular blocks in a row, seen face-on, rising on a STAGGER with a
// spotlight over each. Structural difference, not a recolour.
const EnvPodiumTiers = ({ color }: { color: THREE.Color }) => {
  const blocksRef = useRef<THREE.Group>(null);
  const lightsRef = useRef<THREE.Group>(null);
  const leavesRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const LEAF = "#8b9470";
  const DEEP = "#3a4028";

  // 2nd, 1st, 3rd -- real podium order, centre tallest.
  const blocks = useMemo(
    () => [
      { x: -13.5, h: 15, delay: 0.28 },
      { x: 0, h: 23, delay: 0.0 },
      { x: 13.5, h: 10, delay: 0.5 },
    ],
    []
  );

  const leaves = useMemo(
    () =>
      [...Array(70)].map(() => ({
        x: (Math.random() - 0.5) * 60,
        y: Math.random() * 54 - 18,
        z: (Math.random() - 0.5) * 34,
        s: 0.4 + Math.random() * 0.7,
        v: 2.2 + Math.random() * 4.5,
        w: (Math.random() - 0.5) * 2.4,
      })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (blocksRef.current) {
      blocksRef.current.children.forEach((child, i) => {
        const b = blocks[i];
        const p = clamp01((now - b.delay) / 0.85);
        const s = easeOutBack(p);
        child.scale.y = Math.max(0.001, s);
        child.position.y = -20 + (b.h / 2) * Math.max(0.001, s);
      });
    }

    if (lightsRef.current) {
      lightsRef.current.children.forEach((child, i) => {
        const b = blocks[i];
        const p = clamp01((now - b.delay - 0.3) / 0.7);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        // Each cone breathes on its own phase so the three never pulse as one.
        mat.opacity = p * (0.13 + Math.sin(now * 1.6 + i * 2.1) * 0.045);
      });
    }

    if (leavesRef.current) {
      leavesRef.current.children.forEach((child, i) => {
        const l = leaves[i];
        child.position.y -= l.v * delta;
        child.position.x += Math.sin(now * 0.9 + i) * l.w * delta;
        if (child.position.y < -22) child.position.y = 36;
        child.rotation.z += delta * 1.1;
        child.rotation.x += delta * 0.7;
      });
    }
  });

  return (
    <group position={[0, -2, -6]}>
      {/* Arena floor. */}
      <Grid args={[160, 120]} position={[0, -20.2, -10]} cellColor={DEEP} sectionColor={color} sectionThickness={1.1} cellThickness={0.4} fadeDistance={140} />

      <group ref={blocksRef}>
        {blocks.map((b, i) => (
          <Box key={i} args={[12.4, b.h, 12.4]} position={[b.x, -20, 0]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={i === 1 ? 2.6 : 1.5} flatShading transparent opacity={0.9} />
          </Box>
        ))}
      </group>

      {/* Spotlight cones. Open-ended, additive: they are light, not geometry. */}
      <group ref={lightsRef}>
        {blocks.map((b, i) => (
          <Cone key={i} args={[9, 44, 22, 1, true]} position={[b.x, 6, 0]}>
            <meshBasicMaterial color={'#ffffff'} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Cone>
        ))}
      </group>

      {/* Drifting laurel leaves -- flat tetrahedra, slow, tumbling. */}
      <group ref={leavesRef}>
        {leaves.map((l, i) => (
          <Tetrahedron key={i} args={[l.s, 0]} position={[l.x, l.y, l.z]}>
            <meshStandardMaterial color={LEAF} emissive={LEAF} emissiveIntensity={2.4} flatShading />
          </Tetrahedron>
        ))}
      </group>

      <Sparkles count={260} scale={[70, 46, 40]} size={3.6} speed={0.4} color={color} opacity={0.55} />
    </group>
  );
};

// --- P2. "ChampionWreath" -- Podium Finisher LEGENDARY ----------------------
// "The Champion". An ASSEMBLY: sixteen leaves fly in one at a time and lock
// into a closed ring, then the whole wreath rotates and eight light spokes
// pulse outward from the clasp. Assembly-then-rotate is the signature; nothing
// else in the file builds an object out of parts in front of you except
// EnvCrownVault, and that one rises rather than converging.
const EnvChampionWreath = ({ color }: { color: THREE.Color }) => {
  const LEAVES = 16;
  const wreathRef = useRef<THREE.Group>(null);
  const spokesRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const HOT = "#a9e6b6";

  const leaves = useMemo(
    () =>
      [...Array(LEAVES)].map((_, i) => {
        const a = (i / LEAVES) * Math.PI * 2;
        return {
          a,
          x: Math.cos(a) * 15,
          y: Math.sin(a) * 15,
          // Each leaf starts far out on its own bearing and converges inward.
          from: new THREE.Vector3(Math.cos(a) * 60, Math.sin(a) * 60, (i % 2 ? 1 : -1) * 30),
          delay: i * 0.055,
          rot: a + Math.PI / 2,
        };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    if (wreathRef.current) {
      wreathRef.current.rotation.z = Math.max(0, now - 1.4) * 0.22;
      wreathRef.current.children.forEach((child, i) => {
        const l = leaves[i];
        const p = clamp01((now - l.delay) / 0.75);
        const e = easeOutCubic(p);
        child.position.set(
          THREE.MathUtils.lerp(l.from.x, l.x, e),
          THREE.MathUtils.lerp(l.from.y, l.y, e),
          THREE.MathUtils.lerp(l.from.z, 0, e)
        );
        child.rotation.z = l.rot + (1 - e) * 4;
        child.scale.setScalar(Math.max(0.001, e));
      });
    }

    if (spokesRef.current) {
      spokesRef.current.children.forEach((child, i) => {
        const phase = (now * 0.8 + i / 8) % 1;
        child.scale.y = 0.6 + phase * 0.9;
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.pow(1 - phase, 1.8) * 0.6 * clamp01(now - 1.0);
      });
    }

    if (coreRef.current) {
      const p = clamp01((now - 1.1) / 0.9);
      coreRef.current.scale.setScalar(Math.max(0.001, easeOutBack(p)));
      coreRef.current.rotation.z = now * 0.9;
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 6 + Math.sin(now * 2.4) * 2.5;
    }
  });

  return (
    <group>
      {/* Light spokes behind the wreath. */}
      <group ref={spokesRef}>
        {[...Array(8)].map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <Box key={i} args={[0.5, 22, 0.5]} position={[Math.cos(a) * 22, Math.sin(a) * 22, -6]} rotation={[0, 0, a - Math.PI / 2]}>
              <meshBasicMaterial color={HOT} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </Box>
          );
        })}
      </group>

      {/* The wreath itself. Each leaf is a flattened, elongated octahedron. */}
      <group ref={wreathRef}>
        {leaves.map((l, i) => (
          <Octahedron key={i} args={[2.4, 0]} scale={[0.42, 1, 0.42]}>
            <meshStandardMaterial color={i % 4 === 0 ? HOT : color} emissive={i % 4 === 0 ? HOT : color} emissiveIntensity={4.5} flatShading toneMapped={false} />
          </Octahedron>
        ))}
      </group>

      {/* Closing band -- appears only once the leaves have landed. */}
      <Torus args={[15, 0.22, 8, 96]}>
        <meshBasicMaterial color={HOT} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Torus>

      {/* The clasp jewel at the centre. */}
      <Icosahedron ref={coreRef} args={[3.6, 1]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} flatShading toneMapped={false} />
      </Icosahedron>

      <Sparkles count={420} scale={[52, 52, 34]} size={4.5} speed={0.55} color={HOT} opacity={0.7} />
    </group>
  );
};

// --- S1. "ReticleLock" -- Sharpshooter BASE ---------------------------------
// Crosshair used to share EnvTarget with Target (perfectionist BASE), which is
// three concentric wireframe tori. This is a SNAP: four corner brackets fly in
// from off-frame, converge on a drifting target, hold, then release and
// re-acquire on a 3.2s loop. The badge is also about clock discipline, so a
// time arc closes around the whole thing over the same period.
const EnvReticleLock = ({ color }: { color: THREE.Color }) => {
  const PERIOD = 3.2;
  const bracketsRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Mesh>(null);
  const arcRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const STEEL = "#8f97b8";
  const HOT = "#ffffff";

  const corners = useMemo(
    () =>
      [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
      ].map(([sx, sy], i) => ({ sx, sy, delay: i * 0.06 })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const age = now % PERIOD;
    // 0 -> 0.8s converge, 0.8 -> 2.6s locked, 2.6 -> 3.2s release.
    const conv = age < 0.8 ? easeOutCubic(clamp01(age / 0.8)) : age < 2.6 ? 1 : 1 - clamp01((age - 2.6) / 0.6);

    // Target drifts on a slow lissajous so the lock has to actually track it.
    const tx = Math.sin(now * 0.55) * 7;
    const ty = Math.cos(now * 0.41) * 5;
    if (targetRef.current) {
      targetRef.current.position.set(tx, ty, 0);
      targetRef.current.rotation.x = now * 0.7;
      targetRef.current.rotation.y = now * 0.9;
      const mat = targetRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2 + conv * 7;
    }

    if (bracketsRef.current) {
      bracketsRef.current.children.forEach((child, i) => {
        const c = corners[i];
        const spread = THREE.MathUtils.lerp(38, 9.5, clamp01(conv - c.delay));
        child.position.set(tx + c.sx * spread, ty + c.sy * spread, 0);
        child.scale.setScalar(0.75 + conv * 0.35);
      });
    }

    if (arcRef.current) {
      // Time arc fills over the whole period -- ">90% of your time".
      arcRef.current.rotation.z = -age * (Math.PI * 2) / PERIOD;
      const mat = arcRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + conv * 0.35;
    }
  });

  return (
    <group>
      {/* Range plane, well behind, so the reticle has something to sit over. */}
      <Grid args={[120, 120]} position={[0, 0, -30]} rotation={[Math.PI / 2, 0, 0]} cellColor={'#16161e'} sectionColor={STEEL} sectionThickness={0.9} cellThickness={0.3} fadeDistance={110} />

      {/* Closing time arc. */}
      <Torus ref={arcRef} args={[26, 0.28, 8, 90, Math.PI * 1.84]}>
        <meshBasicMaterial color={STEEL} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Torus>

      {/* Mil-dot ladder -- static, part of the optic rather than the lock. */}
      {[1, 2, 3].map((k) => (
        <Box key={k} args={[3.6 - k * 0.7, 0.3, 0.3]} position={[0, -6 - k * 3.4, 0]}>
          <meshBasicMaterial color={STEEL} transparent opacity={0.55} toneMapped={false} />
        </Box>
      ))}

      {/* Corner brackets: two bars each, forming an L. */}
      <group ref={bracketsRef}>
        {corners.map((c, i) => (
          <group key={i}>
            <Box args={[6.4, 0.6, 0.6]} position={[(-c.sx * 6.4) / 2, 0, 0]}>
              <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={5} toneMapped={false} />
            </Box>
            <Box args={[0.6, 6.4, 0.6]} position={[0, (-c.sy * 6.4) / 2, 0]}>
              <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={5} toneMapped={false} />
            </Box>
          </group>
        ))}
      </group>

      {/* The thing being tracked. */}
      <Octahedron ref={targetRef} args={[3.2, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} flatShading />
      </Octahedron>

      {/* Sparse, cold, slow -- an optic's field is empty on purpose. */}
      <Sparkles count={180} scale={[60, 46, 30]} size={2.8} speed={0.3} color={STEEL} opacity={0.5} />
    </group>
  );
};

// --- S2. "ApertureIris" -- Sharpshooter SUPER -------------------------------
// This badge had no case at all and was rendering the generic EnvDefault
// octahedron. Now: six real iris blades that open and close around a pupil on
// a slow breath, inside a stack of lens elements receding in Z. The signature
// is a SYNCHRONISED ROTATION-PLUS-TRANSLATE of identical parts, which reads as
// a mechanism -- deliberately mechanical where the rest of the batch is not.
const EnvApertureIris = ({ color }: { color: THREE.Color }) => {
  const BLADES = 6;
  const bladesRef = useRef<THREE.Group>(null);
  const elementsRef = useRef<THREE.Group>(null);
  const pupilRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const DEEP = "#24393e";
  const ICE = "#bfe2ea";

  const blades = useMemo(
    () => [...Array(BLADES)].map((_, i) => ({ a: (i / BLADES) * Math.PI * 2 })),
    []
  );
  const elements = useMemo(
    () => [...Array(5)].map((_, i) => ({ z: -8 - i * 9, r: 20 - i * 2.4 })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    // Breath: 0 = wide open, 1 = nearly closed. Slow in, quick out.
    const breath = Math.pow((Math.sin(now * 0.75) + 1) / 2, 1.6);
    const open = 1 - breath;

    if (bladesRef.current) {
      bladesRef.current.children.forEach((child, i) => {
        const b = blades[i];
        const r = 6 + open * 9;
        child.position.set(Math.cos(b.a) * r, Math.sin(b.a) * r, 0);
        child.rotation.z = b.a + Math.PI / 2 + breath * 0.55;
      });
    }

    if (elementsRef.current) {
      elementsRef.current.rotation.z = now * 0.12;
      elementsRef.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.1 + Math.abs(Math.sin(now * 0.6 + i * 0.8)) * 0.16;
      });
    }

    if (pupilRef.current) {
      const s = 0.9 + open * 3.4;
      pupilRef.current.scale.setScalar(s);
      const mat = pupilRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 3 + open * 9;
    }
  });

  return (
    <group>
      {/* Lens elements receding down the barrel. */}
      <group ref={elementsRef}>
        {elements.map((e, i) => (
          <Torus key={i} args={[e.r, 0.35, 8, 64]} position={[0, 0, e.z]}>
            <meshBasicMaterial color={ICE} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Barrel ring. */}
      <Torus args={[22, 1.1, 10, 72]}>
        <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={2.2} flatShading />
      </Torus>
      <Torus args={[19.6, 0.28, 8, 72]}>
        <meshBasicMaterial color={ICE} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Torus>

      {/* Blades. Thin, wide boxes -- a real iris blade is a flat plate. */}
      <group ref={bladesRef}>
        {blades.map((_, i) => (
          <Box key={i} args={[17, 7.4, 0.5]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={i % 2 ? 2.2 : 3.4} flatShading transparent opacity={0.86} side={THREE.DoubleSide} />
          </Box>
        ))}
      </group>

      {/* Pupil -- the light the blades are metering. */}
      <Sphere ref={pupilRef} args={[2.4, 24, 24]}>
        <meshStandardMaterial color={ICE} emissive={ICE} emissiveIntensity={6} toneMapped={false} />
      </Sphere>

      <Sparkles count={240} scale={[46, 46, 50]} size={3.2} speed={0.45} color={ICE} opacity={0.6} />
    </group>
  );
};

// --- S3. "RadarSweep" -- Sharpshooter LEGENDARY -----------------------------
// Radar used to share EnvScan with Scan (perfectionist LEGENDARY). EnvScan is
// CARTESIAN -- a flat grid with a cone descending onto it. This is POLAR: a
// horizontal scope face with range rings, a rotating sweep wedge, and contacts
// that flash as the wedge crosses their bearing and then decay. That "ping on
// pass" is the whole difference: EnvScan sweeps a surface, this one finds
// things.
const EnvRadarSweep = ({ color }: { color: THREE.Color }) => {
  const RPM = 0.55; // revolutions per second
  const sweepRef = useRef<THREE.Group>(null);
  const blipsRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const INK = "#0b3a30";
  const MID = "#17a184";

  const blips = useMemo(
    () =>
      [...Array(11)].map(() => {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 22;
        return { a, r, x: Math.cos(a) * r, z: Math.sin(a) * r, size: 0.9 + Math.random() * 1.5 };
      }),
    []
  );
  const rings = useMemo(() => [10, 18, 26, 34], []);

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const bearing = (now * RPM * Math.PI * 2) % (Math.PI * 2);

    if (sweepRef.current) sweepRef.current.rotation.y = -bearing;

    if (blipsRef.current) {
      blipsRef.current.children.forEach((child, i) => {
        const b = blips[i];
        // Angular distance BEHIND the sweep head, wrapped -- so brightness
        // spikes the instant the wedge passes and decays over one revolution.
        let d = bearing - b.a;
        while (d < 0) d += Math.PI * 2;
        const freshness = Math.pow(1 - d / (Math.PI * 2), 3);
        child.scale.setScalar(0.6 + freshness * 1.8);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.1 + freshness * 0.9;
      });
    }

    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.2 + Math.abs(Math.sin(now * 0.8 - i * 0.5)) * 0.22;
      });
    }
  });

  return (
    <group position={[0, -12, 0]} rotation={[-0.42, 0, 0]}>
      {/* Scope face. */}
      <Grid args={[90, 90]} cellColor={INK} sectionColor={color} sectionThickness={1} cellThickness={0.35} fadeDistance={90} />

      {/* Range rings, lying flat. */}
      <group ref={ringsRef}>
        {rings.map((r, i) => (
          <Torus key={i} args={[r, 0.22, 8, 90]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Sweep: a hard leading spoke plus a soft trailing wedge. */}
      <group ref={sweepRef}>
        <Box args={[36, 0.3, 0.5]} position={[18, 0.7, 0]}>
          <meshBasicMaterial color={'#ffffff'} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </Box>
        <Cone args={[36, 13, 3, 1, true]} rotation={[0, Math.PI / 6, -Math.PI / 2]} position={[6, 0.6, 0]}>
          <meshBasicMaterial color={MID} transparent opacity={0.16} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </Cone>
      </group>

      {/* Contacts. */}
      <group ref={blipsRef}>
        {blips.map((b, i) => (
          <Sphere key={i} args={[b.size, 12, 12]} position={[b.x, 0.9, b.z]}>
            <meshBasicMaterial color={'#ffffff'} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Sphere>
        ))}
      </group>

      {/* Mast at the origin, so the sweep has a source. */}
      <Cylinder args={[0.5, 0.9, 14, 8]} position={[0, 7, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} flatShading />
      </Cylinder>

      {/* Very sparse: a radar scope is mostly empty air. */}
      <Sparkles count={160} scale={[80, 24, 80]} size={2.6} speed={0.25} color={color} opacity={0.45} />
    </group>
  );
};

// --- U1. "AnchorDepths" -- Underdog SUPER -----------------------------------
// This badge had no case and was rendering the generic EnvDefault octahedron.
// Now: a chain descending out of frame into deep water, a heavy mass swinging
// at the bottom of it, silt rising past the camera and two slow light shafts
// raking down. The signature is DOWNWARD WEIGHT under an upward drift -- the
// only env in the file where the particulate and the geometry move in opposite
// directions, which is what sells depth.
const EnvAnchorDepths = ({ color }: { color: THREE.Color }) => {
  const LINKS = 16;
  const chainRef = useRef<THREE.Group>(null);
  const massRef = useRef<THREE.Group>(null);
  const siltRef = useRef<THREE.Group>(null);
  const shaftsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const DEEP = "#4b3626";
  const ROPE = "#e3c6ac";

  const links = useMemo(
    () => [...Array(LINKS)].map((_, i) => ({ y: 26 - i * 3.4, flip: i % 2 === 0 })),
    []
  );

  const silt = useMemo(
    () =>
      [...Array(80)].map(() => ({
        x: (Math.random() - 0.5) * 66,
        y: Math.random() * 70 - 34,
        z: (Math.random() - 0.5) * 44,
        s: 0.18 + Math.random() * 0.42,
        v: 1.2 + Math.random() * 3.4,
      })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    // The whole chain sways as one pendulum; each link lags the one above it,
    // which is what makes it read as a chain and not as a stack of rings.
    if (chainRef.current) {
      chainRef.current.children.forEach((child, i) => {
        const lag = i * 0.13;
        const swing = Math.sin(now * 0.85 - lag) * (0.7 + i * 0.16);
        child.position.x = swing;
        child.rotation.z = Math.sin(now * 0.85 - lag) * 0.09;
      });
    }

    if (massRef.current) {
      const lag = LINKS * 0.13;
      massRef.current.position.x = Math.sin(now * 0.85 - lag) * (0.7 + LINKS * 0.16);
      massRef.current.rotation.z = Math.sin(now * 0.85 - lag) * 0.14;
      massRef.current.rotation.y = now * 0.22;
    }

    if (siltRef.current) {
      siltRef.current.children.forEach((child, i) => {
        child.position.y += silt[i].v * delta;
        if (child.position.y > 36) child.position.y = -36;
      });
    }

    if (shaftsRef.current) {
      shaftsRef.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.05 + Math.abs(Math.sin(now * 0.4 + i * 1.7)) * 0.07;
        child.rotation.z = 0.16 * (i ? 1 : -1) + Math.sin(now * 0.25 + i) * 0.05;
      });
    }
  });

  return (
    <group position={[0, -4, -4]}>
      {/* Caustic light shafts from the surface. */}
      <group ref={shaftsRef}>
        {[-16, 15].map((x, i) => (
          <Box key={i} args={[7, 90, 0.4]} position={[x, 10, -22]}>
            <meshBasicMaterial color={ROPE} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Box>
        ))}
      </group>

      {/* Chain: interlocked torus links, alternating 90 degrees. */}
      <group ref={chainRef}>
        {links.map((l, i) => (
          <Torus key={i} args={[2.2, 0.62, 8, 26]} position={[0, l.y, 0]} rotation={[l.flip ? 0 : Math.PI / 2, 0, 0]} scale={[1, 1.5, 1]}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} flatShading />
          </Torus>
        ))}
      </group>

      {/* The anchor mass: a stock across a shank with two flukes. Built from
          primitives rather than a silhouette so it reads at any camera angle. */}
      <group ref={massRef} position={[0, -30, 0]}>
        <Cylinder args={[0.85, 0.85, 17, 8]} position={[0, 5, 0]}>
          <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={2} flatShading />
        </Cylinder>
        <Cylinder args={[0.6, 0.6, 15, 8]} rotation={[0, 0, Math.PI / 2]} position={[0, 11.5, 0]}>
          <meshStandardMaterial color={ROPE} emissive={ROPE} emissiveIntensity={2.6} flatShading />
        </Cylinder>
        <Cone args={[2.6, 6, 4, 1]} rotation={[0, 0, Math.PI / 2.4]} position={[-6.4, -1.6, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.2} flatShading />
        </Cone>
        <Cone args={[2.6, 6, 4, 1]} rotation={[0, 0, -Math.PI / 2.4]} position={[6.4, -1.6, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.2} flatShading />
        </Cone>
        <Torus args={[2.4, 0.5, 8, 22]} position={[0, 14.4, 0]}>
          <meshStandardMaterial color={ROPE} emissive={ROPE} emissiveIntensity={3} flatShading />
        </Torus>
      </group>

      {/* Silt: rising, because the anchor is what is going down. */}
      <group ref={siltRef}>
        {silt.map((s, i) => (
          <Octahedron key={i} args={[s.s, 0]} position={[s.x, s.y, s.z]}>
            <meshStandardMaterial color={ROPE} emissive={ROPE} emissiveIntensity={2.2} flatShading />
          </Octahedron>
        ))}
      </group>

      {/* Water column: tall, narrow, slow. */}
      <Sparkles count={300} scale={[54, 76, 40]} size={3.4} speed={0.7} color={color} opacity={0.5} />
    </group>
  );
};

// ============================================================================
// END MOCK-EXAM ELEVATION BATCH 2
// ============================================================================

// ============================================================================
// WEBGL LIFECYCLE GUARD (2026-07-27 crash fix)
// ----------------------------------------------------------------------------
// SYMPTOM: opening/closing this modal repeatedly (especially reopening while a
// previous close was still fading) eventually froze the whole browser tab.
//
// ROOT CAUSE: a browser allows a hard-capped number of live WebGL contexts
// (~16 in Chrome). React Three Fiber tears down its scene on unmount, but the
// underlying WebGL context is only reclaimed whenever the GC gets round to the
// detached <canvas> -- it is NOT released deterministically. Each open/close
// cycle therefore left a context alive. Once the cap was hit Chrome started
// force-losing the oldest contexts while new heavy scenes (up to ~7k Sparkles/
// Stars plus a mipmap Bloom pass) were still allocating render targets, and the
// tab wedged.
//
// FIX: deterministically dispose every geometry/material in the scene, drop the
// renderer's cached render lists/programs, and then FORCE the context loss on
// unmount so the slot is handed back immediately instead of at GC time.
// ============================================================================
function WebGLLifecycleGuard() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    // DELIBERATELY NO `webglcontextlost` HANDLER HERE.
    // Per the WebGL spec, calling preventDefault() on `webglcontextlost` is the
    // opt-in signal that the app wants the context RESTORED -- the browser then
    // allocates a fresh context for that canvas. An earlier revision of this fix
    // added such a handler to keep teardown quiet, and it made the freeze worse:
    // every forced context loss below was immediately answered with a brand-new
    // context on an already-detached canvas, so the GPU process churned through
    // contexts faster than they were being released and wedged the renderer
    // (and, because the GPU process is shared, other tabs with it). Letting the
    // loss go unhandled is what actually frees the slot.
    return () => {
      // DEFERRED ON PURPOSE. React runs effect cleanups top-down, and this
      // component sits above <EffectComposer> in the Canvas tree -- tearing the
      // renderer down synchronously here would pull the context out from under
      // postprocessing's own dispose() (it still has to release its bloom /
      // noise / vignette render targets), and a throw in one cleanup aborts the
      // cleanups queued behind it. Deferring by a macrotask lets R3F and
      // @react-three/postprocessing finish their own teardown first; we then
      // reclaim whatever is left.
      setTimeout(() => {
        try {
          scene.traverse((obj: THREE.Object3D) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material as
              | THREE.Material
              | THREE.Material[]
              | undefined;
            if (Array.isArray(mat)) mat.forEach((m) => m && m.dispose());
            else if (mat) mat.dispose();
          });
          scene.clear();
          gl.renderLists?.dispose?.();
          gl.dispose();
          // Hands the WebGL context slot back NOW rather than whenever GC gets
          // round to the detached <canvas>.
          gl.forceContextLoss?.();
          // Shrink the drawing buffer before the element is dropped so the
          // backing store (~1920x1080x4 bytes, times several render targets) is
          // released in the same tick.
          const el = gl.domElement;
          if (el) { el.width = 1; el.height = 1; }
        } catch {
          /* teardown is best-effort -- never let it throw */
        }
      }, 0);
    };
  }, [gl, scene]);

  return null;
}

// ============================================================================
// PHASE-1 MYTHIC ENVIRONMENTS (2026-07-28)
// ----------------------------------------------------------------------------
// Nine bespoke ceiling-tier cinematics, one per skill-badge family that did not
// already have a MYTHIC. (Perfectionist's EnvPerfectionistGemMythic shipped
// with the reference batch and is untouched.)
//
// THE ONE MECHANICAL RULE THEY ALL SHARE: every scene below has its own
// "something snaps" beat at T_REVEAL = 1.7s, which is the exact timestamp
// MythicCameraRig recoils on. The rig is generic and badge-agnostic -- it just
// pushes in until 1.7s and then gets shoved back -- so if a scene's own
// eruption did NOT land on that mark the camera would look like it was
// flinching at nothing. Each component therefore splits its useFrame into
// pre-reveal (tension: things converge, tighten, wind up) and post-reveal
// (release: things blow outward and then settle), with `now >= T_REVEAL` as
// the switch. `e` is always "seconds since the reveal".
//
// Craft level is EnvSurgeColumn's: procedural geometry assembled from the drei
// primitives already imported at the top of this file, animated per-frame, no
// custom shaders and no physics engine. Geometry counts are deliberately above
// each family's LEGENDARY -- the shared Sparkles/Stars/Bloom scaling for MYTHIC
// is handled elsewhere, so these fill the extra headroom with structure.
// ============================================================================

// --- M1. "SpeedCometMythic" -- Speed Demon MYTHIC ---------------------------
// BASE's EnvSpeedComet is a dart with trails. This is the same dart at the
// moment it stops being a dart: light-speed streaks compress into a wall ahead
// of it, and at 1.7s it punches THROUGH -- the Mach cone inverts, a shock ring
// snaps outward and the comet sheds a shell of crystalline shards. Same comet
// DNA (raked dart silhouette, cool electric palette), taken to rupture.
const EnvSpeedCometMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const HOT = "#f0b3ff";
  const CORE = "#ffffff";

  const streaksRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const dartRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const STREAKS = 54;
  const streaks = useMemo(
    () =>
      [...Array(STREAKS)].map((_, i) => {
        const a = (i / STREAKS) * Math.PI * 2 + (i % 3) * 0.21;
        const r = 5.5 + (i % 8) * 2.4;
        return { a, r, len: 9 + (i % 6) * 6, speed: 30 + (i % 5) * 11, phase: (i * 5.7) % 70 };
      }),
    []
  );

  const RINGS = 5;
  const shards = useMemo(
    () =>
      [...Array(34)].map((_, i) => {
        const a = (i / 34) * Math.PI * 2;
        const tilt = ((i % 5) - 2) * 0.42;
        return {
          dir: new THREE.Vector3(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)),
          size: 0.5 + (i % 4) * 0.28,
          spin: 1.4 + (i % 6) * 0.5,
        };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // Streaks: before the break they pile up AHEAD of the dart (compression).
    // After, they rip past it. Length and speed both jump on the beat.
    if (streaksRef.current) {
      streaksRef.current.children.forEach((child, i) => {
        const s = streaks[i];
        const spd = s.speed * (broken ? 2.6 : 0.55 + pre * 0.8);
        const z = ((now * spd + s.phase) % 90) - 52;
        child.position.set(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r, z);
        const stretch = broken ? 1 + Math.min(e * 5, 4.2) : 0.35 + pre * 0.5;
        child.scale.set(1, 1, stretch);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = broken ? 7 : 1.4 + pre * 3;
        mat.opacity = broken ? 0.85 : 0.2 + pre * 0.45;
      });
    }

    // Shock rings sit stacked and still until the beat, then fire outward in
    // sequence -- a cone of pressure leaving the impact point.
    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        const delay = i * 0.09;
        const k = broken ? Math.max(0, e - delay) : 0;
        const grow = 1 + k * 15;
        child.scale.setScalar(broken ? grow : 0.5 + pre * 0.32);
        child.position.z = broken ? 4 - k * 26 : 4 + i * 1.4;
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = broken ? Math.max(0, 0.85 - k * 0.72) : 0.1 + pre * 0.22;
      });
    }

    // The dart. Vibrates harder and harder against the barrier, then lurches
    // forward and settles into a slow hero roll.
    if (dartRef.current) {
      const jitter = broken ? 0 : Math.pow(pre, 3) * 0.55;
      dartRef.current.position.set(
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
        broken ? 6 - Math.min(e * 9, 10) : 8 - pre * 2
      );
      dartRef.current.rotation.z = now * (broken ? 0.9 : 0.25 + pre * 1.4);
      dartRef.current.rotation.x = Math.sin(now * 0.6) * 0.18;
      const sc = broken ? 1 + Math.min(e, 0.25) * 0.7 : 0.8 + pre * 0.2;
      dartRef.current.scale.setScalar(sc);
    }

    // Shell of shards: welded to the dart until the break, then blown off.
    if (shardsRef.current) {
      shardsRef.current.children.forEach((child, i) => {
        const s = shards[i];
        const d = broken ? 3.2 + e * (11 + i % 7) : 2.6 + pre * 0.5;
        child.position.set(s.dir.x * d, s.dir.y * d, s.dir.z * d + (broken ? -e * 5 : 7));
        child.rotation.x += delta * s.spin * (broken ? 3.1 : 0.4);
        child.rotation.y += delta * s.spin * (broken ? 2.3 : 0.3);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = broken ? Math.max(0, 1 - e * 0.32) : 0.55;
      });
    }

    // Single-frame-ish white blowout on the beat.
    if (flashRef.current) {
      const f = broken ? Math.max(0, 1 - e * 3.4) : 0;
      flashRef.current.scale.setScalar(0.1 + f * 30);
      ((flashRef.current.material as THREE.MeshBasicMaterial).opacity = f * 0.9);
    }
  });

  return (
    <group position={[0, 0, -2]}>
      {/* Light-speed streaks -- thin boxes stretched along the travel axis. */}
      <group ref={streaksRef}>
        {streaks.map((s, i) => (
          <Box key={i} args={[0.16, 0.16, s.len]}>
            <meshStandardMaterial
              color={i % 4 === 0 ? HOT : color}
              emissive={i % 4 === 0 ? HOT : color}
              emissiveIntensity={2}
              transparent
              opacity={0.4}
              toneMapped={false}
            />
          </Box>
        ))}
      </group>

      {/* Shock rings. Open tori, face-on to camera. */}
      <group ref={ringsRef}>
        {[...Array(RINGS)].map((_, i) => (
          <Torus key={i} args={[6.5, 0.22, 8, 72]}>
            <meshBasicMaterial
              color={i % 2 ? CORE : color}
              transparent
              opacity={0.2}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </Torus>
        ))}
      </group>

      {/* The comet itself: a raked cone with a faceted core, nose toward us. */}
      <group ref={dartRef}>
        <Cone args={[2.4, 9, 4]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.4} flatShading toneMapped={false} />
        </Cone>
        <Octahedron args={[1.5, 0]} position={[0, 0, 1.6]}>
          <meshStandardMaterial color={CORE} emissive={CORE} emissiveIntensity={6} flatShading toneMapped={false} />
        </Octahedron>
      </group>

      {/* Crystalline shell. */}
      <group ref={shardsRef}>
        {shards.map((s, i) => (
          <Tetrahedron key={i} args={[s.size, 0]}>
            <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={4.5} flatShading transparent opacity={0.55} toneMapped={false} />
          </Tetrahedron>
        ))}
      </group>

      {/* Rupture flash. */}
      <Sphere ref={flashRef} args={[1, 20, 20]} position={[0, 0, 2]}>
        <meshBasicMaterial color={CORE} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Sphere>

      <Sparkles count={620} scale={[54, 34, 90]} size={5} speed={4.2} color={color} opacity={0.7} />
      <Sparkles count={240} scale={[22, 18, 70]} size={3} speed={6.5} color={HOT} opacity={0.9} />
    </group>
  );
};

// --- M2. "CrownMythic" -- Competitor MYTHIC ---------------------------------
// LEGENDARY's EnvCrownVault is a crown held in a vault. Here the vault is gone
// and the crown is being PUT ON: it descends through a colonnade onto an empty
// throne dais, and at 1.7s it seats -- the dais rings ignite outward, every
// pillar fires a light shaft, and the crown's points strike alight one by one.
const EnvCrownMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const GOLD = "#d6ecff";
  const DEEP = "#0b4f77";

  const crownRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Group>(null);
  const pillarsRef = useRef<THREE.Group>(null);
  const shaftsRef = useRef<THREE.Group>(null);
  const daisRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const POINTS = 12;
  const PILLARS = 14;
  const pillars = useMemo(
    () =>
      [...Array(PILLARS)].map((_, i) => {
        const a = (i / PILLARS) * Math.PI * 2;
        return { a, x: Math.cos(a) * 20, z: Math.sin(a) * 20, h: 26 + (i % 4) * 5 };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // The crown falls the whole pre-roll and lands exactly on the beat.
    if (crownRef.current) {
      const drop = THREE.MathUtils.lerp(26, 2.4, easeOutCubic(pre));
      crownRef.current.position.y = broken ? 2.4 - Math.min(e, 0.12) * 3 + Math.sin(now * 1.2) * 0.25 * clamp01(e - 0.4) : drop;
      crownRef.current.rotation.y = now * (broken ? 0.32 : 1.5 - pre * 1.1);
      const squash = broken ? 1 + Math.max(0, 0.22 - e) * 1.4 : 1;
      crownRef.current.scale.set(squash, 2 - squash, squash);
    }

    // Crown points strike alight in sequence after the seating.
    if (pointsRef.current) {
      pointsRef.current.children.forEach((child, i) => {
        const lit = broken ? clamp01((e - i * 0.045) * 6) : 0;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1 + lit * 9;
        child.scale.setScalar(1 + lit * 0.28);
      });
    }

    // Pillars breathe upward before, then hold tall.
    if (pillarsRef.current) {
      pillarsRef.current.children.forEach((child, i) => {
        const p = pillars[i];
        const rise = broken ? 1 : 0.35 + pre * 0.65;
        child.scale.y = rise;
        child.position.y = -18 + (p.h * rise) / 2;
      });
    }

    // Light shafts only exist after the coronation.
    if (shaftsRef.current) {
      shaftsRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - i * 0.03) * 3.2) : 0;
        child.scale.set(k, 1, k);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * (0.34 + Math.sin(now * 2 + i) * 0.06);
      });
    }

    // Dais rings: tight and dim, then a hard outward pulse on the beat.
    if (daisRef.current) {
      daisRef.current.children.forEach((child, i) => {
        const delay = i * 0.11;
        const k = broken ? Math.max(0, e - delay) : 0;
        child.scale.setScalar(broken ? 1 + k * 3.6 : 0.7 + pre * 0.3);
        child.rotation.z = now * (0.1 + i * 0.05);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = broken ? Math.max(0, 0.8 - k * 0.5) : 0.12 + pre * 0.2;
      });
    }
  });

  return (
    <group position={[0, -2, -4]}>
      {/* Throne dais -- stacked slabs. */}
      {[...Array(4)].map((_, i) => (
        <Cylinder key={i} args={[13 - i * 2.2, 13.6 - i * 2.2, 1.6, 8]} position={[0, -17 + i * 1.6, 0]}>
          <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.7} flatShading />
        </Cylinder>
      ))}

      {/* Coronation rings on the dais floor. */}
      <group ref={daisRef} position={[0, -11.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[...Array(4)].map((_, i) => (
          <Torus key={i} args={[9 + i * 1.6, 0.24, 8, 80]}>
            <meshBasicMaterial color={GOLD} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Colonnade. */}
      <group ref={pillarsRef}>
        {pillars.map((p, i) => (
          <Cylinder key={i} args={[1.1, 1.4, p.h, 7]} position={[p.x, -18 + p.h / 2, p.z]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={1.1} flatShading />
          </Cylinder>
        ))}
      </group>

      {/* Light shafts, one per pillar. */}
      <group ref={shaftsRef}>
        {pillars.map((p, i) => (
          <Cylinder key={i} args={[1.9, 0.5, 44, 10, 1, true]} position={[p.x, 4, p.z]}>
            <meshBasicMaterial color={color} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Cylinder>
        ))}
      </group>

      {/* The crown: a band, twelve points, and an inner jewel. */}
      <group ref={crownRef} position={[0, 26, 0]}>
        <Torus args={[6.4, 0.85, 10, 60]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} flatShading toneMapped={false} />
        </Torus>
        <group ref={pointsRef}>
          {[...Array(POINTS)].map((_, i) => {
            const a = (i / POINTS) * Math.PI * 2;
            const tall = i % 2 === 0;
            return (
              <Cone
                key={i}
                args={[0.95, tall ? 6.4 : 4.1, 4]}
                position={[Math.cos(a) * 6.4, tall ? 3.2 : 2.05, Math.sin(a) * 6.4]}
              >
                <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={1} flatShading toneMapped={false} />
              </Cone>
            );
          })}
        </group>
        <Octahedron args={[2.1, 0]} position={[0, 1.4, 0]}>
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={5} flatShading toneMapped={false} />
        </Octahedron>
      </group>

      <Sparkles count={560} scale={[52, 50, 52]} size={5} speed={1.4} color={color} opacity={0.7} />
      <Sparkles count={220} scale={[26, 30, 26]} size={3} speed={2.6} color={GOLD} opacity={0.9} />
    </group>
  );
};

// --- M3. "InfinityMythic" -- Unstoppable Streak MYTHIC -----------------------
// LEGENDARY's Infinity is a ribbon that loops. MYTHIC is that loop EATING
// ITSELF: a torus knot spins up while nested figure-8 lobes tighten inward, and
// at 1.7s the whole thing collapses through its own centre and re-emerges as a
// recursive stack of shrinking loops -- a streak that has stopped being a count
// and become a singularity. Deliberately turquoise/cobalt, never fire: the
// separate `unstoppable_streak_chain` demo owns orange and must stay distinct.
const EnvInfinityMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const LIGHT = "#9ffbe6";
  const DEEP = "#06705d";

  const knotRef = useRef<THREE.Mesh>(null);
  const lobesRef = useRef<THREE.Group>(null);
  const nestRef = useRef<THREE.Group>(null);
  const motesRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const NEST = 9;
  const motes = useMemo(
    () =>
      [...Array(40)].map((_, i) => ({
        a: (i / 40) * Math.PI * 2,
        r: 9 + (i % 6) * 2.1,
        y: ((i % 9) - 4) * 1.7,
        spd: 0.5 + (i % 5) * 0.24,
      })),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // The knot winds up, then snaps to a fast, steady eternal spin.
    if (knotRef.current) {
      const spin = broken ? 1.5 : 0.35 + Math.pow(pre, 2.2) * 3.6;
      knotRef.current.rotation.x += delta * spin;
      knotRef.current.rotation.y += delta * spin * 0.62;
      // Collapse to a point on the beat, then rebound.
      const collapse = broken ? clamp01(e / 0.16) : 0;
      const rebound = broken ? easeOutCubic(clamp01((e - 0.16) / 0.5)) : 0;
      const s = broken ? THREE.MathUtils.lerp(1, 0.08, collapse) + rebound * 1.05 : 0.6 + pre * 0.4;
      knotRef.current.scale.setScalar(s);
    }

    // Two counter-rotating lobes make the figure-8 read.
    if (lobesRef.current) {
      lobesRef.current.children.forEach((child, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        child.rotation.z += delta * dir * (broken ? 1.1 : 0.3 + pre * 1.7);
        const tighten = broken ? 1 : 1 - pre * 0.34;
        child.scale.setScalar(tighten);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = broken ? 4.5 : 1.6 + pre * 2.2;
      });
    }

    // The recursion: rings that only exist after the collapse, each a scaled
    // copy of the last, drifting outward forever.
    if (nestRef.current) {
      nestRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - i * 0.07) * 2.4) : 0;
        const s = 0.22 + i * 0.26;
        child.scale.setScalar(k * s * 3.1);
        child.rotation.x = now * (0.3 + i * 0.09) * (i % 2 ? 1 : -1);
        child.rotation.y = now * (0.22 + i * 0.05);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * Math.max(0, 0.55 - i * 0.045);
      });
    }

    if (motesRef.current) {
      motesRef.current.children.forEach((child, i) => {
        const m = motes[i];
        const a = m.a + now * m.spd * (broken ? 1.6 : 0.5);
        const r = broken ? m.r + Math.sin(now * 0.9 + i) * 1.5 : m.r * (1 - pre * 0.3);
        child.position.set(Math.cos(a) * r, m.y + Math.sin(now * 0.7 + i) * 0.9, Math.sin(a) * r);
      });
    }
  });

  return (
    <group position={[0, 0, -3]}>
      {/* The singularity knot. p=2,q=3 gives a genuine self-threading loop. */}
      <TorusKnot ref={knotRef} args={[6.2, 1.15, 190, 26, 2, 3]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.2} flatShading toneMapped={false} />
      </TorusKnot>

      {/* Figure-8 lobes -- two offset tori sharing a waist. */}
      <group ref={lobesRef}>
        <Torus args={[5.4, 0.42, 10, 70]} position={[-4.6, 0, 0]} rotation={[0.5, 0.3, 0]}>
          <meshStandardMaterial color={LIGHT} emissive={LIGHT} emissiveIntensity={2} flatShading transparent opacity={0.8} toneMapped={false} />
        </Torus>
        <Torus args={[5.4, 0.42, 10, 70]} position={[4.6, 0, 0]} rotation={[-0.5, -0.3, 0]}>
          <meshStandardMaterial color={LIGHT} emissive={LIGHT} emissiveIntensity={2} flatShading transparent opacity={0.8} toneMapped={false} />
        </Torus>
      </group>

      {/* Recursive after-loops. */}
      <group ref={nestRef}>
        {[...Array(NEST)].map((_, i) => (
          <Torus key={i} args={[9, 0.2, 8, 64]}>
            <meshBasicMaterial color={i % 2 ? LIGHT : color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Orbiting motes -- the individual days in the streak. */}
      <group ref={motesRef}>
        {motes.map((_, i) => (
          <Octahedron key={i} args={[0.34, 0]}>
            <meshStandardMaterial color={DEEP} emissive={LIGHT} emissiveIntensity={3} flatShading toneMapped={false} />
          </Octahedron>
        ))}
      </group>

      <Sparkles count={600} scale={[46, 46, 46]} size={4.6} speed={1.9} color={color} opacity={0.72} />
      <Sparkles count={230} scale={[18, 18, 18]} size={3} speed={3.4} color={LIGHT} opacity={0.92} />
    </group>
  );
};

// --- M4. "DawnBreakMythic" -- Early Bird MYTHIC -----------------------------
// SUPER's Sun is a disc. This is a WORLD: a planet limb across the lower frame
// with the star still below it, atmosphere banding the horizon. At 1.7s the
// star breaches -- the corona ring snaps outward, ray fans sweep up over the
// curve, and the terminator line races across the surface. Genesis, not
// morning.
const EnvDawnBreakMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const PALE = "#fff0b8";
  const DEEP = "#7a4f00";

  const sunRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Group>(null);
  const raysRef = useRef<THREE.Group>(null);
  const worldRef = useRef<THREE.Mesh>(null);
  const bandsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const RAYS = 20;
  const rays = useMemo(
    () =>
      [...Array(RAYS)].map((_, i) => {
        const spread = (i / (RAYS - 1) - 0.5) * Math.PI * 1.05;
        return { spread, len: 34 + (i % 4) * 12, w: 0.7 + (i % 3) * 0.5 };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // The star climbs to the horizon line and breaks it exactly on the beat.
    if (sunRef.current) {
      const y = broken ? -6 + Math.min(e * 3.4, 5.6) : THREE.MathUtils.lerp(-19, -6, easeOutCubic(pre));
      sunRef.current.position.y = y;
      const s = broken ? 1 + Math.min(e * 0.5, 0.55) : 0.72 + pre * 0.28;
      sunRef.current.scale.setScalar(s);
      const mat = sunRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = broken ? 1 : 0.5 + pre * 0.5;
    }

    // Corona: nothing, then a hard expanding halo.
    if (coronaRef.current) {
      coronaRef.current.children.forEach((child, i) => {
        const k = broken ? Math.max(0, e - i * 0.1) : 0;
        child.scale.setScalar(broken ? 1 + k * 5.2 : 0.4);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = broken ? Math.max(0, 0.7 - k * 0.5) : 0;
      });
      coronaRef.current.position.y = sunRef.current ? sunRef.current.position.y : -6;
    }

    // Ray fan sweeps up and out of the breach point.
    if (raysRef.current) {
      raysRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - Math.abs(i - RAYS / 2) * 0.03) * 2.1) : 0;
        child.scale.set(1, k, 1);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * (0.3 + Math.sin(now * 1.7 + i * 0.6) * 0.09);
      });
      raysRef.current.position.y = sunRef.current ? sunRef.current.position.y : -6;
      raysRef.current.rotation.z = Math.sin(now * 0.16) * 0.06;
    }

    // The world turns, slowly, always.
    if (worldRef.current) {
      worldRef.current.rotation.y += delta * 0.055;
      const mat = worldRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = broken ? 0.85 + Math.min(e, 1) * 1.5 : 0.2 + pre * 0.45;
    }

    // Atmosphere bands brighten with the breach.
    if (bandsRef.current) {
      bandsRef.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const base = 0.06 + i * 0.035;
        mat.opacity = broken ? base + Math.min(e * 0.9, 0.42) : base * (0.4 + pre * 0.6);
        child.rotation.z = Math.sin(now * 0.1 + i) * 0.03;
      });
    }
  });

  return (
    <group position={[0, -4, -6]}>
      {/* The planet. Big enough that only its limb is in frame. */}
      <Sphere ref={worldRef} args={[30, 48, 48]} position={[0, -36, 0]}>
        <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.25} flatShading />
      </Sphere>

      {/* Atmosphere bands hugging the limb. */}
      <group ref={bandsRef} position={[0, -36, 0]}>
        {[...Array(4)].map((_, i) => (
          <Torus key={i} args={[30.4 + i * 0.9, 0.36 + i * 0.16, 8, 96]} rotation={[Math.PI / 2, 0, 0]}>
            <meshBasicMaterial color={i < 2 ? PALE : color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Ray fan -- long thin cones pinned at the breach point. */}
      <group ref={raysRef}>
        {rays.map((r, i) => (
          <Cone key={i} args={[r.w, r.len, 3]} position={[Math.sin(r.spread) * (r.len / 2), Math.cos(r.spread) * (r.len / 2), -2]} rotation={[0, 0, -r.spread]}>
            <meshBasicMaterial color={i % 3 === 0 ? PALE : color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Cone>
        ))}
      </group>

      {/* Corona halos. */}
      <group ref={coronaRef}>
        {[...Array(3)].map((_, i) => (
          <Torus key={i} args={[7.5, 0.3, 8, 84]}>
            <meshBasicMaterial color={PALE} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* The star. */}
      <Sphere ref={sunRef} args={[6.2, 36, 36]} position={[0, -19, 0]}>
        <meshBasicMaterial color={PALE} transparent opacity={0.5} toneMapped={false} />
      </Sphere>

      <Sparkles count={620} scale={[80, 44, 60]} size={5} speed={0.9} color={color} opacity={0.68} />
      <Sparkles count={240} scale={[40, 24, 40]} size={3.2} speed={1.8} color={PALE} opacity={0.9} />
    </group>
  );
};

// --- M5. "PhoenixSurgeMythic" -- Comeback Kid MYTHIC ------------------------
// LEGENDARY's EnvSurgeColumn is a rising column of chevrons -- momentum. This
// is the literal source of that momentum: a bed of dead ash sits cold and
// sinking for the whole pre-roll, and at 1.7s the bird comes OUT of it. Wings
// unfurl as two swept torus arcs, the body lances upward, and the ash bed is
// blown apart from underneath.
const EnvPhoenixSurgeMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const HOT = "#ffb391";
  const DEEP = "#6d230f";

  const ashRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  const plumesRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const ash = useMemo(
    () =>
      [...Array(64)].map((_, i) => {
        const a = (i / 64) * Math.PI * 2 * 3.3;
        const r = 2 + (i % 11) * 1.5;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: -20 + (i % 4) * 0.7,
          size: 0.35 + (i % 5) * 0.22,
          out: new THREE.Vector3(Math.cos(a), 0.5 + (i % 6) * 0.22, Math.sin(a)),
          spin: 0.8 + (i % 7) * 0.4,
        };
      }),
    []
  );

  const PLUMES = 14;

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // Ash: settles and dims, then is thrown outward and upward.
    if (ashRef.current) {
      ashRef.current.children.forEach((child, i) => {
        const a = ash[i];
        if (broken) {
          const d = e * (9 + (i % 9) * 2.4);
          child.position.set(a.x + a.out.x * d, a.y + a.out.y * d - e * e * 1.6, a.z + a.out.z * d);
          child.rotation.x += delta * a.spin * 3;
          child.rotation.z += delta * a.spin * 2.2;
        } else {
          child.position.set(a.x, a.y - pre * 0.9, a.z);
          child.rotation.y += delta * 0.2;
        }
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = broken ? Math.max(0.4, 6 - e * 2.2) : 0.35 + pre * 0.5;
        mat.opacity = broken ? Math.max(0, 1 - e * 0.26) : 0.85;
      });
    }

    // The bird. Hidden inside the bed, then a hard vertical launch.
    if (bodyRef.current) {
      const y = broken ? -19 + Math.min(e * 14, 20) - Math.max(0, e - 1.4) * 2.2 : -21;
      bodyRef.current.position.y = y;
      bodyRef.current.rotation.y = now * (broken ? 0.55 : 0);
      const s = broken ? clamp01(e * 5) : 0;
      bodyRef.current.scale.setScalar(s);
    }

    // Wings sweep open on the beat and then beat slowly.
    const openK = broken ? easeOutCubic(clamp01(e / 0.45)) : 0;
    const flap = broken ? Math.sin(Math.max(0, e - 0.45) * 2.6) * 0.22 : 0;
    if (wingLRef.current) {
      wingLRef.current.rotation.z = THREE.MathUtils.lerp(-0.1, 0.95, openK) + flap;
      wingLRef.current.scale.setScalar(0.2 + openK * 0.8);
    }
    if (wingRRef.current) {
      wingRRef.current.rotation.z = THREE.MathUtils.lerp(0.1, -0.95, openK) - flap;
      wingRRef.current.scale.setScalar(0.2 + openK * 0.8);
    }

    // Tail plumes trail the launch.
    if (plumesRef.current) {
      plumesRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - i * 0.035) * 3) : 0;
        child.scale.set(k, k * (1 + i * 0.16), k);
        child.rotation.y = now * 0.7 + i * 0.5;
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * Math.max(0, 0.6 - e * 0.11);
      });
      plumesRef.current.position.y = bodyRef.current ? bodyRef.current.position.y - 5 : -19;
    }
  });

  return (
    <group position={[0, 1, -4]}>
      {/* The ash bed. */}
      <group ref={ashRef}>
        {ash.map((a, i) => (
          <Tetrahedron key={i} args={[a.size, 0]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.4} flatShading transparent opacity={0.85} toneMapped={false} />
          </Tetrahedron>
        ))}
      </group>

      {/* Cold floor the ash sits on. */}
      <Torus args={[15, 0.4, 8, 80]} rotation={[Math.PI / 2, 0, 0]} position={[0, -20.6, 0]}>
        <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={1.4} flatShading />
      </Torus>

      {/* The phoenix. */}
      <group ref={bodyRef} position={[0, -21, 0]}>
        <Cone args={[2.2, 11, 5]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4.2} flatShading toneMapped={false} />
        </Cone>
        <Octahedron args={[1.7, 0]} position={[0, 4.4, 0]}>
          <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={7} flatShading toneMapped={false} />
        </Octahedron>
        {/* Wings -- half-tori read as swept feathers in silhouette. */}
        <Torus ref={wingLRef} args={[7.5, 0.5, 8, 44, Math.PI * 0.72]} position={[-1.2, 1.2, 0]} rotation={[0, 0.35, -0.1]}>
          <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={3.4} flatShading transparent opacity={0.9} toneMapped={false} />
        </Torus>
        <Torus ref={wingRRef} args={[7.5, 0.5, 8, 44, Math.PI * 0.72]} position={[1.2, 1.2, 0]} rotation={[0, -0.35, 0.1]}>
          <meshStandardMaterial color={HOT} emissive={HOT} emissiveIntensity={3.4} flatShading transparent opacity={0.9} toneMapped={false} />
        </Torus>
      </group>

      {/* Tail plumes. */}
      <group ref={plumesRef}>
        {[...Array(PLUMES)].map((_, i) => {
          const a = (i / PLUMES) * Math.PI * 2;
          return (
            <Cone key={i} args={[0.75, 9, 4]} position={[Math.cos(a) * 2.4, -4, Math.sin(a) * 2.4]} rotation={[Math.PI, 0, 0]}>
              <meshBasicMaterial color={i % 2 ? HOT : color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </Cone>
          );
        })}
      </group>

      <Sparkles count={640} scale={[44, 60, 44]} size={5} speed={3.4} color={color} opacity={0.72} />
      <Sparkles count={260} scale={[20, 44, 20]} size={3} speed={5.2} color={HOT} opacity={0.92} />
    </group>
  );
};

// --- M6. "LaurelCrownMythic" -- Podium Finisher MYTHIC ("The Immortal") -----
// LEGENDARY is "The Champion" (EnvChampionWreath): a wreath, awarded. MYTHIC is
// what happens to a champion who is never unseated -- they stop being a winner
// and become a MONUMENT. A plinth stands in an empty colonnade; the wreath
// descends and at 1.7s locks onto it, and the stone lights up from the inside
// as the name is cut into it. Nothing is thrown; this beat is a SEAL, which is
// deliberately the quietest reveal of the nine.
const EnvLaurelCrownMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const PALE = "#eeffc4";
  const DEEP = "#41521a";

  const wreathRef = useRef<THREE.Group>(null);
  const leavesRef = useRef<THREE.Group>(null);
  const monumentRef = useRef<THREE.Mesh>(null);
  const glyphsRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const LEAVES = 30;
  const leaves = useMemo(
    () =>
      [...Array(LEAVES)].map((_, i) => {
        const a = (i / LEAVES) * Math.PI * 2;
        return { a, side: i % 2 === 0 ? 1 : -1, len: 1.5 + (i % 4) * 0.42 };
      }),
    []
  );

  const GLYPHS = 16;

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // Wreath descends onto the plinth and seats on the beat.
    if (wreathRef.current) {
      const y = broken ? 8.6 : THREE.MathUtils.lerp(30, 8.6, easeOutCubic(pre));
      wreathRef.current.position.y = y + (broken ? Math.sin(now * 0.9) * 0.16 * clamp01(e - 0.5) : 0);
      wreathRef.current.rotation.y = now * (broken ? 0.14 : 0.9 - pre * 0.74);
    }

    // Leaves flare open at the moment of seating and then hold, gilded.
    if (leavesRef.current) {
      leavesRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - i * 0.012) * 5) : 0;
        child.scale.setScalar(0.75 + k * 0.45);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.2 + k * 6;
      });
    }

    // The monument lights from within once sealed.
    if (monumentRef.current) {
      const mat = monumentRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = broken ? 0.5 + Math.min(e * 1.6, 2.6) + Math.sin(now * 1.3) * 0.18 : 0.14 + pre * 0.22;
    }

    // Inscription marks cut themselves into the plinth, one after another.
    if (glyphsRef.current) {
      glyphsRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - 0.15 - i * 0.05) * 7) : 0;
        child.scale.set(k, 1, 1);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * 0.85;
      });
    }

    // A slow eternal halo, the only thing still moving at the end.
    if (haloRef.current) {
      haloRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - 0.3 - i * 0.14) * 1.6) : 0;
        child.scale.setScalar(1 + k * (0.5 + i * 0.32));
        child.rotation.z = now * (0.08 + i * 0.04) * (i % 2 ? 1 : -1);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * (0.3 - i * 0.06);
      });
    }
  });

  return (
    <group position={[0, -3, -4]}>
      {/* Colonnade, wide and sparse -- this is a hall, not an arena. */}
      {[...Array(10)].map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <Cylinder key={i} args={[0.85, 1.05, 30, 6]} position={[Math.cos(a) * 24, -2, Math.sin(a) * 24]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.5} flatShading />
          </Cylinder>
        );
      })}

      {/* The plinth. */}
      <Cylinder ref={monumentRef} args={[5, 5.8, 18, 8]} position={[0, -8, 0]}>
        <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.2} flatShading />
      </Cylinder>
      <Cylinder args={[7.4, 8, 1.8, 8]} position={[0, -17.2, 0]}>
        <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.7} flatShading />
      </Cylinder>

      {/* Inscription bands around the plinth. */}
      <group ref={glyphsRef}>
        {[...Array(GLYPHS)].map((_, i) => {
          const a = (i / GLYPHS) * Math.PI * 2;
          const y = -4 - (i % 4) * 2.4;
          return (
            <Box key={i} args={[1.7, 0.3, 0.2]} position={[Math.cos(a) * 5.2, y, Math.sin(a) * 5.2]} rotation={[0, -a, 0]}>
              <meshBasicMaterial color={PALE} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </Box>
          );
        })}
      </group>

      {/* Eternal halo rings above the monument. */}
      <group ref={haloRef} position={[0, 9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[...Array(3)].map((_, i) => (
          <Torus key={i} args={[10 + i * 2.4, 0.18, 8, 90]}>
            <meshBasicMaterial color={PALE} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* The wreath: an open ring of paired leaves. */}
      <group ref={wreathRef} position={[0, 30, 0]}>
        <Torus args={[8, 0.34, 8, 80]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} flatShading toneMapped={false} />
        </Torus>
        <group ref={leavesRef}>
          {leaves.map((l, i) => (
            <Cone
              key={i}
              args={[0.6, l.len * 2.6, 4]}
              position={[Math.cos(l.a) * 8, 0, Math.sin(l.a) * 8]}
              rotation={[Math.PI / 2, 0, -l.a + l.side * 0.55]}
            >
              <meshStandardMaterial color={PALE} emissive={PALE} emissiveIntensity={1.2} flatShading toneMapped={false} />
            </Cone>
          ))}
        </group>
      </group>

      <Sparkles count={560} scale={[54, 56, 54]} size={4.4} speed={0.75} color={color} opacity={0.66} />
      <Sparkles count={210} scale={[24, 30, 24]} size={2.8} speed={1.3} color={PALE} opacity={0.88} />
    </group>
  );
};

// --- M7. "PrecisionCoreMythic" -- Sharpshooter MYTHIC -----------------------
// The family's three tiers are all about AIMING (reticle, iris, radar). MYTHIC
// is the shot. Nine reticle rings hang at different depths and different
// angles, tumbling out of true, while a lattice of space bends inward around
// them; at 1.7s every ring snaps coaxial in a single frame and a lance fires
// straight down the barrel. The reveal here is ALIGNMENT, not explosion.
const EnvPrecisionCoreMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const LIGHT = "#ffdcea";
  const DEEP = "#7c2748";

  const ringsRef = useRef<THREE.Group>(null);
  const latticeRef = useRef<THREE.Group>(null);
  const lanceRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ticksRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const RINGS = 9;
  const rings = useMemo(
    () =>
      [...Array(RINGS)].map((_, i) => ({
        z: -22 + i * 5.2,
        r: 3.4 + i * 1.15,
        rx: ((i % 5) - 2) * 0.5,
        ry: ((i % 3) - 1) * 0.62,
        spin: 0.4 + (i % 4) * 0.33,
      })),
    []
  );

  const lattice = useMemo(
    () =>
      [...Array(52)].map((_, i) => {
        const a = (i / 52) * Math.PI * 2 * 2.7;
        const r = 14 + (i % 7) * 2.6;
        return { a, r, y: ((i % 11) - 5) * 3.1, size: 0.4 + (i % 3) * 0.24 };
      }),
    []
  );

  const TICKS = 24;

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);
    // Snap is near-instant: 90ms from tumbling to perfectly coaxial.
    const lock = broken ? easeOutCubic(clamp01(e / 0.09)) : 0;

    if (ringsRef.current) {
      ringsRef.current.children.forEach((child, i) => {
        const r = rings[i];
        // Pre-roll: drifting off-axis and tumbling. Post: dead true.
        const wob = (1 - lock) * (1 - pre * 0.45);
        child.rotation.x = r.rx * wob + Math.sin(now * r.spin + i) * 0.22 * wob;
        child.rotation.y = r.ry * wob + Math.cos(now * r.spin * 0.8 + i) * 0.22 * wob;
        child.rotation.z = broken ? now * 0.22 * (i % 2 ? 1 : -1) : now * r.spin * 0.5;
        child.position.x = Math.sin(now * 0.6 + i) * 1.9 * wob;
        child.position.y = Math.cos(now * 0.5 + i * 1.3) * 1.9 * wob;
        child.position.z = r.z + (broken ? 0 : Math.sin(now * 0.4 + i) * 1.2);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.4 + lock * 7 + pre * 1.6;
      });
    }

    // Lattice pulls inward under the aim, then holds bent.
    if (latticeRef.current) {
      latticeRef.current.children.forEach((child, i) => {
        const l = lattice[i];
        const pull = broken ? 0.55 : 1 - pre * 0.34;
        const a = l.a + now * 0.12;
        child.position.set(Math.cos(a) * l.r * pull, l.y * pull, Math.sin(a) * l.r * pull);
        child.rotation.x += delta * 0.5;
        child.rotation.y += delta * 0.35;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = broken ? 3.4 : 0.7 + pre * 1.2;
      });
    }

    // The lance: exists only after the lock.
    if (lanceRef.current) {
      const k = broken ? clamp01(e / 0.12) : 0;
      const decay = Math.max(0, 1 - Math.max(0, e - 0.3) * 0.5);
      lanceRef.current.scale.set(k * decay, 1, k * decay);
      (lanceRef.current.material as THREE.MeshBasicMaterial).opacity = k * decay * 0.9;
    }

    if (coreRef.current) {
      const s = broken ? 1 + Math.max(0, 0.4 - e) * 3.4 : 0.35 + pre * 0.35;
      coreRef.current.scale.setScalar(s);
      coreRef.current.rotation.y += delta * (broken ? 2.4 : 0.7);
      coreRef.current.rotation.x += delta * 0.5;
    }

    // Range ticks around the outermost ring count in, then lock.
    if (ticksRef.current) {
      ticksRef.current.rotation.z = broken ? 0 : -now * 0.5 * (1 - pre);
      ticksRef.current.children.forEach((child, i) => {
        const on = broken ? 1 : (i / TICKS < pre ? 1 : 0);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = on * (broken ? 0.85 : 0.4);
        child.scale.setScalar(0.8 + on * 0.5);
      });
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Reticle rings receding down the barrel. */}
      <group ref={ringsRef}>
        {rings.map((r, i) => (
          <Torus key={i} args={[r.r, 0.16, 8, 64, Math.PI * (i % 3 === 0 ? 1.7 : 2)]}>
            <meshStandardMaterial color={i % 3 === 0 ? LIGHT : color} emissive={i % 3 === 0 ? LIGHT : color} emissiveIntensity={1.4} flatShading toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Bent space. */}
      <group ref={latticeRef}>
        {lattice.map((l, i) => (
          <Box key={i} args={[l.size, l.size, l.size * 3.4]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={0.8} flatShading toneMapped={false} />
          </Box>
        ))}
      </group>

      {/* Range ticks. */}
      <group ref={ticksRef} position={[0, 0, -22]}>
        {[...Array(TICKS)].map((_, i) => {
          const a = (i / TICKS) * Math.PI * 2;
          return (
            <Box key={i} args={[0.22, 1.5, 0.22]} position={[Math.cos(a) * 15.5, Math.sin(a) * 15.5, 0]} rotation={[0, 0, -a]}>
              <meshBasicMaterial color={LIGHT} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </Box>
          );
        })}
      </group>

      {/* The shot. */}
      <Cylinder ref={lanceRef} args={[0.55, 0.55, 90, 14, 1, true]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color={LIGHT} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </Cylinder>

      {/* Singularity at the focus. */}
      <Icosahedron ref={coreRef} args={[2.4, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} flatShading toneMapped={false} />
      </Icosahedron>

      <Sparkles count={580} scale={[44, 44, 70]} size={4.4} speed={1.5} color={color} opacity={0.7} />
      <Sparkles count={220} scale={[14, 14, 60]} size={2.6} speed={3.1} color={LIGHT} opacity={0.92} />
    </group>
  );
};

// --- M8. "SummitMythic" -- Underdog MYTHIC ----------------------------------
// LEGENDARY's Mountain is a peak seen from outside. Here we are ON it and above
// the weather: a stacked ridge climbs out of a cloud deck that is still closed
// over the top for the whole pre-roll. At 1.7s the summit BREAKS the deck --
// the cloud ring blows outward, the sun clears behind the peak, and a marker
// plants itself on the highest stone. The one badge whose reveal is a view.
const EnvSummitMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const SNOW = "#eef5ff";
  const DEEP = "#16407a";

  const ridgeRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);
  const burstRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const RIDGE = 7;
  const ridge = useMemo(
    () =>
      [...Array(RIDGE)].map((_, i) => {
        const off = (i - (RIDGE - 1) / 2);
        return {
          x: off * 5.6 + (i % 2 ? 1.4 : -1.4),
          z: -Math.abs(off) * 3.2 - 2,
          h: 26 - Math.abs(off) * 4.4,
          r: 5.2 - Math.abs(off) * 0.5,
        };
      }),
    []
  );

  const CLOUDS = 22;
  const clouds = useMemo(
    () =>
      [...Array(CLOUDS)].map((_, i) => {
        const a = (i / CLOUDS) * Math.PI * 2;
        return { a, r: 15 + (i % 5) * 3.4, y: -4 + (i % 3) * 1.5, s: 4 + (i % 6) * 1.6 };
      }),
    []
  );

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);

    // Ridge pushes up through the whole pre-roll -- the climb.
    if (ridgeRef.current) {
      ridgeRef.current.children.forEach((child, i) => {
        const r = ridge[i];
        const rise = broken ? 1 : easeOutCubic(pre) * 0.88;
        child.position.y = -20 + (r.h * rise) / 2;
        child.scale.y = Math.max(0.06, rise);
      });
    }

    // Cloud deck: closed and churning, then blown outward and down.
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((child, i) => {
        const c = clouds[i];
        const a = c.a + now * 0.11;
        const push = broken ? 1 + e * 1.5 : 1 - pre * 0.12;
        child.position.set(Math.cos(a) * c.r * push, c.y - (broken ? e * 3.1 : 0) + Math.sin(now * 0.5 + i) * 0.5, Math.sin(a) * c.r * push);
        child.rotation.y = a;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = broken ? Math.max(0, 0.5 - e * 0.16) : 0.42 + pre * 0.16;
      });
    }

    // Sun clears from behind the peak on the beat.
    if (sunRef.current) {
      const y = broken ? 10 + Math.min(e * 2.4, 5) : 1.5;
      sunRef.current.position.y = y;
      const mat = sunRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = broken ? Math.min(1, e * 2.2) : 0.1;
      sunRef.current.scale.setScalar(broken ? 1 + Math.min(e * 0.3, 0.4) : 0.8);
    }

    // Marker plants on the highest stone.
    if (markerRef.current) {
      const k = broken ? easeOutCubic(clamp01((e - 0.1) / 0.35)) : 0;
      markerRef.current.scale.setScalar(k);
      markerRef.current.position.y = 8 + (1 - k) * 12;
      markerRef.current.rotation.y = now * 0.5;
    }

    // Shock ring across the cloud tops.
    if (burstRef.current) {
      burstRef.current.children.forEach((child, i) => {
        const k = broken ? Math.max(0, e - i * 0.12) : 0;
        child.scale.setScalar(broken ? 1 + k * 6.5 : 0.3);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = broken ? Math.max(0, 0.6 - k * 0.42) : 0;
      });
    }
  });

  return (
    <group position={[0, -1, -5]}>
      {/* The ridge -- a stack of faceted cones, tallest at centre. */}
      <group ref={ridgeRef}>
        {ridge.map((r, i) => (
          <Cone key={i} args={[r.r, r.h, 5]} position={[r.x, -20 + r.h / 2, r.z]} rotation={[0, i * 0.4, 0]}>
            <meshStandardMaterial color={DEEP} emissive={color} emissiveIntensity={i === Math.floor(RIDGE / 2) ? 1.6 : 0.8} flatShading />
          </Cone>
        ))}
      </group>

      {/* Snow caps on the three tallest. */}
      {[2, 3, 4].map((i) => (
        <Cone key={i} args={[ridge[i].r * 0.42, ridge[i].h * 0.2, 5]} position={[ridge[i].x, -20 + ridge[i].h * 0.9, ridge[i].z]}>
          <meshStandardMaterial color={SNOW} emissive={SNOW} emissiveIntensity={1.4} flatShading />
        </Cone>
      ))}

      {/* Cloud deck. Flattened spheres read as cloud at this scale. */}
      <group ref={cloudsRef}>
        {clouds.map((c, i) => (
          <Sphere key={i} args={[c.s, 10, 8]} scale={[1, 0.32, 1]}>
            <meshStandardMaterial color={SNOW} emissive={color} emissiveIntensity={0.35} flatShading transparent opacity={0.45} />
          </Sphere>
        ))}
      </group>

      {/* Breach shock rings, flat across the deck. */}
      <group ref={burstRef} position={[0, -2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[...Array(3)].map((_, i) => (
          <Torus key={i} args={[13, 0.3, 8, 90]}>
            <meshBasicMaterial color={SNOW} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* The sun behind the peak. */}
      <Sphere ref={sunRef} args={[7, 32, 32]} position={[0, 1.5, -26]}>
        <meshBasicMaterial color={SNOW} transparent opacity={0.1} toneMapped={false} />
      </Sphere>

      {/* Summit marker. */}
      <group ref={markerRef} position={[ridge[3].x, 8, ridge[3].z]}>
        <Cylinder args={[0.22, 0.22, 7, 6]}>
          <meshStandardMaterial color={SNOW} emissive={SNOW} emissiveIntensity={3} flatShading toneMapped={false} />
        </Cylinder>
        <Octahedron args={[1.5, 0]} position={[0, 4.4, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} flatShading toneMapped={false} />
        </Octahedron>
      </group>

      <Sparkles count={600} scale={[70, 46, 60]} size={4.6} speed={1.1} color={color} opacity={0.68} />
      <Sparkles count={240} scale={[34, 26, 34]} size={3} speed={2.2} color={SNOW} opacity={0.9} />
    </group>
  );
};

// --- M9. "OracleMythic" -- High Achiever (`polymath`) MYTHIC -----------------
// The family goes private thought (Brain) -> single insight (Lightbulb) ->
// collected knowledge (Library). MYTHIC is knowing it ALL AT ONCE, so the scene
// is a great closed eye inside a shell of archive nodes. For the whole pre-roll
// the lids are shut and the nodes orbit at random; at 1.7s the eye OPENS -- the
// lids sweep apart, the iris rings spin up, and every node snaps onto a single
// lattice shell and points inward at the pupil.
const EnvOracleMythic = ({ color }: { color: THREE.Color }) => {
  const T_REVEAL = 1.7;
  const PALE = "#f6e2ff";
  const MID = "#9d5cc8";

  const lidTopRef = useRef<THREE.Mesh>(null);
  const lidBotRef = useRef<THREE.Mesh>(null);
  const irisRef = useRef<THREE.Group>(null);
  const pupilRef = useRef<THREE.Mesh>(null);
  const nodesRef = useRef<THREE.Group>(null);
  const raysRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const NODES = 46;
  const nodes = useMemo(
    () =>
      [...Array(NODES)].map((_, i) => {
        // Fibonacci sphere -- the "settled" target position for each node.
        const y = 1 - (i / (NODES - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = i * 2.399963;
        return {
          target: new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad),
          chaosA: (i * 1.7) % (Math.PI * 2),
          chaosR: 10 + (i % 9) * 2.2,
          chaosY: ((i % 13) - 6) * 2.2,
          spd: 0.3 + (i % 6) * 0.19,
          size: 0.36 + (i % 4) * 0.18,
        };
      }),
    []
  );

  const RAYS = 16;

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;
    const pre = clamp01(now / T_REVEAL);
    const broken = now >= T_REVEAL;
    const e = Math.max(0, now - T_REVEAL);
    const open = broken ? easeOutCubic(clamp01(e / 0.4)) : 0;

    // Lids sweep apart. Before the beat they only twitch, which reads as
    // something about to wake rather than something asleep.
    const twitch = Math.sin(now * 3.1) * 0.05 * Math.pow(pre, 3);
    if (lidTopRef.current) {
      lidTopRef.current.position.y = open * 11 + twitch;
      lidTopRef.current.rotation.z = open * 0.16;
    }
    if (lidBotRef.current) {
      lidBotRef.current.position.y = -open * 11 - twitch;
      lidBotRef.current.rotation.z = -open * 0.16;
    }

    // Iris rings spin up hard on opening.
    if (irisRef.current) {
      irisRef.current.children.forEach((child, i) => {
        const dir = i % 2 ? 1 : -1;
        child.rotation.z += delta * dir * (0.2 + open * (1.4 + i * 0.5));
        child.scale.setScalar(0.45 + open * 0.55);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1 + open * 6;
      });
    }

    if (pupilRef.current) {
      const s = broken ? 1 + Math.max(0, 0.3 - e) * 4 : 0.25 + pre * 0.3;
      pupilRef.current.scale.setScalar(s);
      pupilRef.current.rotation.y += delta * 0.9;
      pupilRef.current.rotation.x += delta * 0.4;
    }

    // Nodes: chaotic orbit -> snapped onto one shell, all facing the pupil.
    if (nodesRef.current) {
      const SHELL = 15.5;
      nodesRef.current.children.forEach((child, i) => {
        const n = nodes[i];
        const a = n.chaosA + now * n.spd;
        const cx = Math.cos(a) * n.chaosR;
        const cy = n.chaosY + Math.sin(now * 0.4 + i) * 1.4;
        const cz = Math.sin(a) * n.chaosR;
        const k = broken ? easeOutCubic(clamp01((e - i * 0.006) / 0.5)) : 0;
        // Settled shell also rotates slowly, so the lattice is never static.
        const sa = now * 0.14;
        const tx = n.target.x * Math.cos(sa) - n.target.z * Math.sin(sa);
        const tz = n.target.x * Math.sin(sa) + n.target.z * Math.cos(sa);
        child.position.set(
          THREE.MathUtils.lerp(cx, tx * SHELL, k),
          THREE.MathUtils.lerp(cy, n.target.y * SHELL, k),
          THREE.MathUtils.lerp(cz, tz * SHELL, k)
        );
        child.lookAt(0, 0, 0);
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.2 + k * 5;
      });
    }

    // Rays of regard, out from the open eye.
    if (raysRef.current) {
      raysRef.current.rotation.z = now * 0.09;
      raysRef.current.children.forEach((child, i) => {
        const k = broken ? clamp01((e - 0.2 - i * 0.02) * 2.4) : 0;
        child.scale.set(1, k, 1);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = k * (0.22 + Math.sin(now * 1.4 + i) * 0.07);
      });
    }
  });

  return (
    <group position={[0, 0, -3]}>
      {/* Rays of regard. */}
      <group ref={raysRef}>
        {[...Array(RAYS)].map((_, i) => {
          const a = (i / RAYS) * Math.PI * 2;
          const len = i % 2 === 0 ? 40 : 28;
          return (
            <Cone key={i} args={[1.1, len, 3]} position={[Math.cos(a) * (len / 2), Math.sin(a) * (len / 2), -3]} rotation={[0, 0, -a + Math.PI / 2]}>
              <meshBasicMaterial color={i % 2 ? PALE : color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </Cone>
          );
        })}
      </group>

      {/* Archive nodes. */}
      <group ref={nodesRef}>
        {nodes.map((n, i) => (
          <Box key={i} args={[n.size * 2.6, n.size * 3.4, n.size]}>
            <meshStandardMaterial color={MID} emissive={color} emissiveIntensity={1.2} flatShading toneMapped={false} />
          </Box>
        ))}
      </group>

      {/* Iris rings. */}
      <group ref={irisRef}>
        {[...Array(4)].map((_, i) => (
          <Torus key={i} args={[5 + i * 1.5, 0.24, 8, 72, Math.PI * (i % 2 ? 1.55 : 2)]}>
            <meshStandardMaterial color={i % 2 ? PALE : color} emissive={i % 2 ? PALE : color} emissiveIntensity={1} flatShading toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Pupil. */}
      <Icosahedron ref={pupilRef} args={[3, 0]}>
        <meshStandardMaterial color={MID} emissive={PALE} emissiveIntensity={5} flatShading toneMapped={false} />
      </Icosahedron>

      {/* Lids -- wide flattened spheres that meet across the middle. */}
      <Sphere ref={lidTopRef} args={[13, 28, 16]} scale={[1.5, 0.42, 0.5]} position={[0, 0, 0]}>
        <meshStandardMaterial color={MID} emissive={color} emissiveIntensity={0.8} flatShading />
      </Sphere>
      <Sphere ref={lidBotRef} args={[13, 28, 16]} scale={[1.5, 0.42, 0.5]} position={[0, 0, 0]}>
        <meshStandardMaterial color={MID} emissive={color} emissiveIntensity={0.8} flatShading />
      </Sphere>

      <Sparkles count={620} scale={[52, 44, 44]} size={4.4} speed={1.2} color={color} opacity={0.7} />
      <Sparkles count={240} scale={[26, 22, 22]} size={2.8} speed={2.4} color={PALE} opacity={0.9} />
    </group>
  );
};

// ============================================================================
// MYTHIC CAMERA CHOREOGRAPHY (2026-07-27)
// ----------------------------------------------------------------------------
// The parent <Canvas> camera is otherwise fixed at [0,0,30]/fov 45 and never
// moves, which is what every one of the 30 shipped badges expects. This rig is
// mounted for the PerfectionistGemMythic badge ONLY, so no other cinematic's
// framing changes by a single pixel.
//
// Its beats are locked to the same T_FRACTURE = 1.7s timeline the gem's own
// three-beat animation uses:
//   0.00 - 1.70s  slow push-in + fov squeeze  (tension, the stone fills frame)
//   1.70 - 2.05s  hard recoil pull-back + fov kick  (the break shoves us away)
//   2.05 - 5.00s  eased settle to a slightly high 3/4 hero angle
//   5.00s +       near-imperceptible idle orbit so the frame never feels frozen
// ============================================================================
const MythicCameraRig = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const t = useRef(0);
  const T_FRACTURE = 1.7;

  useFrame((_, delta) => {
    t.current += delta;
    const now = t.current;

    let z: number;
    let y: number;
    let x: number;
    let fov: number;

    if (now < T_FRACTURE) {
      // Beat 1 -- push in. Easing is deliberately linear-ish early and only
      // bites near the end so the approach feels like it is accelerating into
      // the break rather than braking before it.
      const p = clamp01(now / T_FRACTURE);
      const k = Math.pow(p, 1.7);
      z = THREE.MathUtils.lerp(44, 21, k);
      y = THREE.MathUtils.lerp(-1.5, 1.5, k);
      x = Math.sin(now * 0.7) * 0.8 * (1 - k);
      fov = THREE.MathUtils.lerp(52, 41, k);
    } else if (now < T_FRACTURE + 0.35) {
      // Beat 2 -- recoil. Fast, with a decaying handheld shake on top.
      const p = clamp01((now - T_FRACTURE) / 0.35);
      const k = easeOutCubic(p);
      const shake = (1 - p) * 1.4;
      z = THREE.MathUtils.lerp(21, 37, k) + (Math.random() - 0.5) * shake;
      y = THREE.MathUtils.lerp(1.5, 3.2, k) + (Math.random() - 0.5) * shake;
      x = (Math.random() - 0.5) * shake * 1.5;
      fov = THREE.MathUtils.lerp(41, 58, k);
    } else {
      // Beat 3 -- settle, then idle orbit.
      const p = clamp01((now - (T_FRACTURE + 0.35)) / 2.95);
      const k = easeOutCubic(p);
      const settleZ = THREE.MathUtils.lerp(37, 30, k);
      const settleY = THREE.MathUtils.lerp(3.2, 1.2, k);
      const settleFov = THREE.MathUtils.lerp(58, 45, k);
      // Idle drift only fades in once the settle is essentially done.
      const idle = k;
      z = settleZ + Math.sin(now * 0.23) * 1.1 * idle;
      y = settleY + Math.sin(now * 0.17) * 0.55 * idle;
      x = Math.sin(now * 0.19) * 2.2 * idle;
      fov = settleFov;
    }

    camera.position.set(x, y, z);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  });

  return null;
};

// ============================================================================
// END REFERENCE BATCH
// ============================================================================

function BadgeEnvironment3D({ iconName, tier, colorHex }: { iconName: string, tier: string, colorHex: string }) {
  const isLegendary = tier === "LEGENDARY";
  // MYTHIC is a new ceiling tier introduced by the 2026-07-27 reference batch.
  // `isApex` is false for every tier that existed before, so every shipped
  // badge keeps its exact previous bloom / particle / time-dilation settings.
  const isMythic = tier === "MYTHIC";
  const isApex = isLegendary || isMythic;
  const color = new THREE.Color(colorHex);

  const renderScene = () => {
    switch (iconName) {
      // "Crosshair" moved OUT of this case in the 2026-07-27 batch-2 pass --
      // see EnvReticleLock. Target (perfectionist BASE, already elevated and
      // signed off) keeps EnvTarget completely unchanged.
      case "Target": return <EnvTarget color={color} />;
      case "Brain": return <EnvBrain color={color} />;
      case "Flame": return <EnvFlame color={color} />;
      case "Rocket": return <EnvRocket color={color} />;
      case "Mountain": return <EnvMountain color={color} />;
      case "Shield": return <EnvShield color={color} />;
      case "Activity": return <EnvActivity color={color} />;
      case "Infinity": return <EnvInfinity color={color} />;
      // "AlarmClock" moved OUT of this case in the 2026-07-27 batch-1 pass --
      // see EnvAlarmResonance. Clock's own mapping is untouched.
      case "Clock": return <EnvClock color={color} />;
      case "Sun": return <EnvSun color={color} />;
      // "Radar" moved OUT of this case in the 2026-07-27 batch-2 pass -- see
      // EnvRadarSweep. Scan (perfectionist LEGENDARY) keeps EnvScan unchanged:
      // EnvScan is a cartesian grid sweep, and Radar needed a polar one.
      case "Scan": return <EnvScan color={color} />;
      case "Library": return <EnvLibrary color={color} />;
      // "Crown" moved OUT of this case in the 2026-07-27 batch-1 pass -- see
      // EnvCrownVault. "Trophy" moved out in the batch-2 pass -- see
      // EnvPodiumTiers. Medal (competitor BASE) still resolves to EnvMedal
      // exactly as it always did; both times the already-elevated badge stayed
      // put and the newcomer moved.
      case "Medal": return <EnvMedal color={color} />;
      case "Star": return <EnvStar color={color} />;
      case "Lightbulb": return <EnvLightbulb color={color} />;
      // "ChevronsUp" and "ArrowUpRight" (both comeback_kid) moved OUT of this
      // case in the 2026-07-27 batch-2 pass -- see EnvSurgeColumn and
      // EnvBreakthroughBreach. This case was carrying three unrelated badges
      // across two families; FastForward (speed_demon SUPER, already elevated)
      // keeps EnvFastForward unchanged.
      case "FastForward": return <EnvFastForward color={color} />;

      // --- Reference batch (2026-07-27), new keys only -------------------
      case "SpeedComet": return <EnvSpeedComet color={color} />;
      case "PerfectionistGem": return <EnvPerfectionistGem color={color} />;
      case "PerfectionistGemMythic": return <EnvPerfectionistGemMythic color={color} />;
      case "LevelMonument": return <EnvLevelMonument color={color} />;
      case "StreakChainLegendary": return <EnvStreakChain color={color} />;

      // --- Mock-exam elevation, batch 1 (2026-07-27) ---------------------
      // Three bespoke environments, plus two cases that previously fell
      // through to EnvDefault and now reach the already-approved
      // reference-batch environments for the badge they actually belong to.
      case "Crown": return <EnvCrownVault color={color} />;
      case "Flag": return <EnvBannerField color={color} />;
      case "AlarmClock": return <EnvAlarmResonance color={color} />;
      case "Focus": return <EnvPerfectionistGem color={color} />;
      case "Zap": return <EnvSpeedComet color={color} />;

      // --- Mock-exam elevation, batch 2 (2026-07-27) ---------------------
      // Nine bespoke environments. Five of these keys were previously SHARING
      // an environment with an already-elevated badge (Crosshair/Target,
      // Radar/Scan, Trophy/Medal, ChevronsUp+ArrowUpRight/FastForward) and
      // four had no case at all and were falling through to EnvDefault
      // (TrendingUp, Sparkles, Aperture, Anchor). See the block comment above
      // EnvComebackArc for the full before/after table.
      //
      // The other six batch-2 badges are deliberately absent from this block
      // because they already had dedicated cases that collided with nothing:
      // Star -> EnvStar, Shield -> EnvShield, Mountain -> EnvMountain,
      // Brain -> EnvBrain, Lightbulb -> EnvLightbulb, Library -> EnvLibrary.
      // They pick up their new identity colour through the `color` prop.
      case "TrendingUp": return <EnvComebackArc color={color} />;
      case "ArrowUpRight": return <EnvBreakthroughBreach color={color} />;
      case "ChevronsUp": return <EnvSurgeColumn color={color} />;
      case "Trophy": return <EnvPodiumTiers color={color} />;
      case "Sparkles": return <EnvChampionWreath color={color} />;
      case "Crosshair": return <EnvReticleLock color={color} />;
      case "Aperture": return <EnvApertureIris color={color} />;
      case "Radar": return <EnvRadarSweep color={color} />;
      case "Anchor": return <EnvAnchorDepths color={color} />;

      // --- Phase-1 MYTHIC tier (2026-07-28) ------------------------------
      // The 9 new ceiling-tier badges. All nine iconName strings are brand-new
      // (seeded by the backend with the 9 new MYTHIC rows) so none of these
      // cases can shadow or steal an existing badge's environment -- every case
      // above still resolves exactly as it did before.
      //
      // Each of these scenes has its own reveal beat at T_REVEAL = 1.7s to line
      // up with MythicCameraRig's recoil; see the block comment above
      // EnvSpeedCometMythic for why that timing is load-bearing rather than
      // decorative. PerfectionistGemMythic (the 10th family) already has its
      // case further up and is untouched.
      case "SpeedCometMythic": return <EnvSpeedCometMythic color={color} />;
      case "CrownMythic": return <EnvCrownMythic color={color} />;
      case "InfinityMythic": return <EnvInfinityMythic color={color} />;
      case "DawnBreakMythic": return <EnvDawnBreakMythic color={color} />;
      case "PhoenixSurgeMythic": return <EnvPhoenixSurgeMythic color={color} />;
      case "LaurelCrownMythic": return <EnvLaurelCrownMythic color={color} />;
      case "PrecisionCoreMythic": return <EnvPrecisionCoreMythic color={color} />;
      case "SummitMythic": return <EnvSummitMythic color={color} />;
      case "OracleMythic": return <EnvOracleMythic color={color} />;

      default: return <EnvDefault color={color} />;
    }
  };

  return (
    <>
      <color attach="background" args={['#020617']} />

      {/* Deterministic WebGL teardown -- see WebGLLifecycleGuard. Must live
          inside the Canvas so it can reach the renderer + scene. */}
      <WebGLLifecycleGuard />

      <ambientLight intensity={0.5} />
      <pointLight position={[0, 0, 0]} intensity={100} color={color} distance={150} />
      <pointLight position={[30, 30, 30]} intensity={20} color={'#ffffff'} />
      <pointLight position={[-30, -30, -30]} intensity={20} color={color} />

      <TimeDilationEngine isLegendary={isApex} />

      {/* Scripted camera move. Generalized 2026-07-28 (Phase 1) from a single
          hardcoded iconName check to `isMythic`: the rig itself was already
          badge-agnostic (orbits/pushes relative to world origin, no geometry
          references), and its T_FRACTURE=1.7s "push-in then recoil" beat is a
          generic reveal-impact timing, not something specific to the
          Perfectionist gem. Every MYTHIC badge's environment is expected to
          have its own "something snaps/ignites/erupts" moment around that
          same beat so the camera recoil reads as reacting to it. LEGENDARY
          and below are untouched -- this only widens the MYTHIC set, and the
          only MYTHIC badge that existed before this change
          (PerfectionistGemMythic) keeps exactly the camera move it had. */}
      {isMythic && <MythicCameraRig />}

      {/* Render the specific procedural environment for this badge */}
      {renderScene()}

      {/* Global Ambient Particles.
          NOTE (2026-07-27): the MYTHIC counts were trimmed (700 -> 480 sparkles,
          5000 -> 3200 stars) after the repeat-open freeze. LEGENDARY and BASE
          numbers are byte-for-byte unchanged, so no shipped badge moves. */}
      <Sparkles
         count={isMythic ? 480 : isLegendary ? 400 : 150}
         scale={60}
         size={4}
         speed={0.5}
         color={colorHex}
         opacity={0.5}
      />
      <Stars radius={60} depth={50} count={isMythic ? 3200 : isLegendary ? 3000 : 1000} factor={4} saturation={0} fade speed={1} />

      {/* Hollywood Post Processing Engine.
          MYTHIC bloom pulled 4.2 -> 3.4: at 4.2 the mipmap bloom halo bled a
          long way down-frame and was a real contributor to the title/description
          legibility failure. Non-MYTHIC values untouched. */}
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.1} mipmapBlur intensity={isMythic ? 3.4 : isLegendary ? 3.0 : 1.5} />
         <Noise opacity={0.03} />
         <Vignette eskil={false} offset={0.3} darkness={1.2} />
      </EffectComposer>
    </>
  );
}

// #region unlock-chime
// ============================================================================
// UNLOCK CHIME (2026-07-27, rewritten in the craft pass)
// ----------------------------------------------------------------------------
// Deliberately built on the raw WebAudio API rather than pulling in `tone`
// (~200kB gzipped). Everything is synthesised at runtime -- no audio asset,
// matching the "100% procedural, no assets" rule the visuals follow.
//
// WHAT WAS ACTUALLY WRONG (the "all five badges sound the same" report)
// ----------------------------------------------------------------------------
// The tier argument was reaching this function correctly and all four branches
// were being taken correctly. The bug was MUSICAL, not structural: every tier
// was voiced from the SAME A-major material, in the same octave, on the same
// two waveforms --
//     BASE       A4 + E5                         (sine)
//     SUPER      A4 + C#5 + E5                   (sine/triangle)
//     LEGENDARY  A3 + A4 + C#5 + E5 + A5         (sine/triangle)
//     MYTHIC     A2 + A3 + E4 + A4 + C#5 + E5 + A5 + C#6 + E6
// -- i.e. each tier was a strict SUPERSET of the tier below it, in one key, at
// one pitch centre (A), with one attack shape, and peak gains only 0.20 ->
// 0.34 apart. Every badge therefore played "an A major chord with a slightly
// different number of notes in it", which a listener correctly hears as one
// sound. Technically distinct parameters, perceptually identical output.
//
// The rewrite gives each tier its own KEY, REGISTER, WAVEFORM, MELODIC
// DIRECTION, ATTACK and FILTER, so the tiers differ on five independent axes
// instead of on note count alone:
//
//   BASE       D#6/A#6 sine,   rising 5th,      6ms attack, 9kHz open   0.85s
//   SUPER      Ab, square,      rising arpeggio, 22ms attack, 2.8kHz reedy 1.7s
//   LEGENDARY  C,  sawtooth,    rising fanfare + deep sub, 55ms, 2.2kHz brass 2.7s
//   MYTHIC     F#, whole-tone,  DESCENDING cascade + rising sub glissando,
//                               130ms bloom, 12kHz, 3.6s
//
// MYTHIC is whole-tone on purpose: it contains no perfect fifth and no major
// third, so it cannot be confused with the three triadic tiers no matter how
// they are stacked. It is also the only tier whose melody moves downwards and
// the only one with pitch glides.
//
// The four tiers also occupy four separate REGISTERS -- amplitude-weighted
// spectral centroids come out at roughly 1474 / 520 / 270 / 654 Hz, every
// adjacent pair at least ~1.3x apart. This was measured, not assumed: BASE was
// first written at D5/A5 and the verification harness flagged it as sitting on
// top of MYTHIC's centroid (709 vs 653 Hz), so it was moved up an octave to
// D#6/A#6 where it now reads as a thin high "tick" that cannot be mistaken for
// MYTHIC's wide shimmer.
//
// TIER-KEYED, NOT BADGE-KEYED: the score is looked up by `tier` and nothing
// else, so Level Monument and Streak Chain -- both LEGENDARY -- are guaranteed
// byte-identical to each other, which is the required behaviour.
//
// Autoplay policy: an AudioContext created outside a user gesture starts
// `suspended`. resume() is now called BEFORE the schedule is laid down (it used
// to be the last statement in the function), so `ctx.currentTime` is already
// running when the note times are computed.
// ============================================================================
type ChimeVoice = {
  /** Start frequency in Hz. */
  f: number;
  /** Glide target in Hz; 0 = no glide. */
  to: number;
  /** Onset, seconds after the chime starts. */
  at: number;
  /** Sounding length in seconds (attack + sustain + release, all included). */
  dur: number;
  /** Peak gain for this voice. */
  lvl: number;
  wave: OscillatorType;
  /** Detune in cents. */
  det: number;
  /** Fraction of `dur` held flat at `lvl` before the release ramp begins.
   *  Defaults to 0.4. This is what gives a voice a real "body" instead of
   *  starting to die the instant it attacks. */
  sustainFrac?: number;
};

/** A filtered-noise element -- risers (build-up whooshes), impact cracks, and
 *  sub-bass thumps. This is what turns a chime into something that feels like
 *  it belongs UNDER a cinematic instead of bolted on top of it: real cinema
 *  sound design leans on noise-based whooshes and hits at least as much as
 *  tonal content, and the melodic voices alone (no matter how well enveloped)
 *  always read as "a synth ding" without this layer. */
type NoiseHit = {
  /** Onset, seconds after the chime starts. */
  at: number;
  /** Length in seconds. */
  dur: number;
  /** Peak gain. */
  lvl: number;
  filterType: BiquadFilterType;
  /** Filter cutoff at onset. */
  freqStart: number;
  /** Filter cutoff at `at + dur` (exponential sweep between the two). */
  freqEnd: number;
  q: number;
  /** Fraction of `dur` spent rising to `lvl` before falling back to silence.
   *  Small (~0.08) for a percussive hit/crack; large (~0.85) for a riser --
   *  the crescendo itself IS the sound, cut off right as the impact lands. */
  riseFrac?: number;
};

/** A genuine LFO-modulated filter wobble -- the "wub wub" bass that's the
 *  signature of an EDM drop. A carrier oscillator runs through a lowpass
 *  filter whose cutoff is itself modulated by a second (inaudible, low-rate)
 *  oscillator wired directly into the filter's frequency AudioParam. This is
 *  real synthesis technique, not a volume tremolo standing in for one. */
type WobbleBass = {
  at: number;
  dur: number;
  baseFreq: number;
  wave: OscillatorType;
  lvl: number;
  filterBase: number;
  /** Wobble speed in Hz -- how many "wubs" per second. */
  lfoRate: number;
  /** How far the cutoff swings around `filterBase`, in Hz. */
  lfoDepth: number;
  q: number;
};

/** A synth "pluck": fast attack (a few ms, percussive -- not the soft bloom a
 *  chime voice uses), through its OWN per-note lowpass filter that starts
 *  bright and sweeps down over `filterDecay`. That filter-sweep-per-note is
 *  what separates a real synth bass/lead pluck from "an oscillator playing a
 *  pitch" -- a fixed-timbre tone with a soft envelope is what reads as a
 *  chime no matter how it's rhythmically arranged. Used for every tier's
 *  bassline and lead line. */
type PluckNote = {
  f: number;
  at: number;
  dur: number;
  lvl: number;
  wave: OscillatorType;
  /** Filter cutoff right at the attack -- bright/open. */
  filterStart: number;
  /** Filter cutoff it settles to -- the "pluck" closing down. */
  filterEnd: number;
  /** How fast the filter sweeps from `filterStart` to `filterEnd`. */
  filterDecay: number;
  q: number;
  det?: number;
  /** Unison voice count -- the actual "supersaw" technique big-room/electro
   *  leads are built from (Garrix/Guetta-style): several oscillators at the
   *  same pitch, each detuned slightly apart and summed, instead of one thin
   *  oscillator. 1 (default) = no stacking. */
  unison?: number;
  /** Spread in cents across the unison stack (only used if unison > 1). */
  unisonDetune?: number;
  /** 0-1 soft-clip saturation amount -- the aggressive growl on drop
   *  basses (Skrillex-style). 0/undefined = clean. */
  drive?: number;
};

/** One hit in a synthesized drum machine -- kick, snare/clap, or hat. Real
 *  percussion synthesis (pitched-sweep kick, filtered-noise snare/hat), not
 *  a fourth melodic voice standing in for drums. This is the single biggest
 *  thing that turns a sequence of notes into an actual TRACK: a beat you can
 *  feel underneath the melody. */
type DrumHit = {
  at: number;
  kind: "kick" | "snare" | "hat" | "tom";
  lvl: number;
};

/** A single audio-RATE FM-modulated growl-bass HIT -- SUPER's signature
 *  low-end technique. Rebuilt in the NINTH pass: the eighth pass made this
 *  one long (4-8s) sustained FM note, which -- despite the FM buzz on top
 *  -- is still structurally "one held tone with an envelope", the exact
 *  recipe that reads as a chime/drone no matter what's modulating it. Now
 *  `buildGrowlSequence` fires a RHYTHMIC SEQUENCE of short, re-triggered
 *  hits (each with its own fast attack + decay), which is what makes a real
 *  dubstep bassline feel percussive/sequenced rather than a single moaning
 *  drone. Two independent FM modulators (`modRate`/`modDepth` and
 *  `modRate2`/`modDepth2`) are summed into the carrier's pitch -- real growl
 *  basses layer more than one modulator for a genuinely inharmonic snarl,
 *  not a single clean FM operator -- and an optional `crush` stacks a
 *  bitcrush-style quantization after the analog `drive` for extra digital
 *  aggression. */
type GrowlBass = {
  at: number;
  dur: number;
  baseFreq: number;
  wave: OscillatorType;
  lvl: number;
  filterBase: number;
  filterQ: number;
  modRateStart: number;
  modRateEnd: number;
  modDepth: number;
  /** Second, independent FM modulator, summed with the first. 0 = off. */
  modRate2: number;
  modDepth2: number;
  drive: number;
  /** 0-1 -- bitcrush-style quantization stacked after `drive`. 0 = none. */
  crush: number;
};

/** A rhythmically GATED chord PLUCK -- LEGENDARY's signature texture.
 *  Rebuilt in the NINTH pass: the eighth pass ran the oscillators
 *  CONTINUOUSLY and only chopped the output GAIN externally, which left the
 *  underlying tone itself smooth and static between chops -- still close
 *  enough to a held pad to read as bell-like. Now every gate step is a
 *  freshly triggered note with its OWN fast attack and its OWN per-step
 *  filter sweep (bright at the attack, closing by the end of the step,
 *  exactly like a real synth "pluck"), and steps alternate full-velocity
 *  "downbeat" hits with quieter "ghost" hits -- the actual trance
 *  gated-pluck arpeggio technique (Above & Beyond/Armin-style), not a
 *  chopped drone. */
type TranceGatePad = {
  at: number;
  dur: number;
  notes: number[];
  wave: OscillatorType;
  lvl: number;
  gateRate: number;
  /** 0-1 -- how much quieter the alternating "ghost" steps are vs the
   *  full-velocity downbeat steps (the bounce/groove of the arpeggio). */
  gateDepth: number;
  filterStart: number;
  filterEnd: number;
  q: number;
};

/** A cinematic "BRAAM" -- the deep, slow-swelling stacked-low-oscillator
 *  hit trailer music uses for its big impact moments. MYTHIC-only. Multiple
 *  detuned low oscillators, a slow attack (this is a swell, not a pluck),
 *  an optional slow downward pitch bend across the tail for the sense of
 *  physical mass/decay a plain sustained tone never has, `drive` for real
 *  brass-like grit instead of a clean tone, and a slow amplitude tremolo so
 *  the sustain itself has movement rather than sitting as one static
 *  level. */
type Braam = {
  at: number;
  dur: number;
  freqs: number[];
  wave: OscillatorType;
  lvl: number;
  filterStart: number;
  filterEnd: number;
  pitchBendSemitones: number;
  drive: number;
  tremoloRate: number;
  tremoloDepth: number;
};

/** A swelling "choir" chord -- MYTHIC-only. Rebuilt in the NINTH pass: the
 *  eighth pass built every voice from pure sine/triangle oscillators, which
 *  -- soft-attack plus the purest waveforms available -- is the textbook
 *  recipe for a synthesized bell/chime, exactly the problem this whole
 *  system exists to avoid. Now every chord tone runs a sawtooth (real
 *  harmonic content) alongside a triangle through its OWN lowpass filter
 *  that slowly opens across the swell (the classic warm analog-pad
 *  technique, real choir/string patches are always filtered, never a raw
 *  tone), on top of the existing two-voice detune + vibrato thickness. */
type ChoirVoice = {
  at: number;
  dur: number;
  freqs: number[];
  lvl: number;
  vibratoRate: number;
  vibratoDepthCents: number;
  filterStart: number;
  filterEnd: number;
};

type ChimeScore = {
  /** Master peak gain. */
  peak: number;
  /** Master lowpass cutoff in Hz -- the main timbral fingerprint per tier. */
  cutoff: number;
  q: number;
  /** Per-voice attack in seconds -- percussive at BASE, a bloom at MYTHIC. */
  attack: number;
  /** Total chime length in seconds, INCLUDING the procedural reverb tail. */
  total: number;
  /** Length in seconds of the generated impulse-response reverb (the tail
   *  that keeps the chime present after the direct notes stop, instead of
   *  cutting to dead air). */
  reverbTime: number;
  /** 0-1 send level into that reverb -- the tier's sense of "space". */
  reverbWet: number;
  /** Risers, impacts, sub-thumps, and buildup rolls -- the sound-design layer. */
  noiseHits: NoiseHit[];
  /** Sustained pads/drones ONLY -- long, soft-attack atmosphere. No melodic
   *  content lives here anymore (that was the "chime" problem: arpeggios
   *  built from this same soft-bloom envelope always sound like a bell no
   *  matter how they're sequenced). */
  voices: ChimeVoice[];
  /** The bassline and lead line -- real synth plucks (fast attack, per-note
   *  filter sweep), not chime tones. */
  plucks: PluckNote[];
  /** The drum machine: kick/snare/hat, BPM-locked, running through the drop.
   *  This is what makes it a track instead of a sequence of pitches. */
  drums: DrumHit[];
  /** LFO-modulated wobble bass(es) -- an extra growl layer under the pluck
   *  bassline during the drop. Optional: BASE deliberately has none (it's
   *  the "clean pop" tier, not the "bass drop" tier). */
  wobbles?: WobbleBass[];
  /** SUPER-only: FM growl bass. SUPER's defining low-end texture is this,
   *  not a filter wobble -- deliberately a different synthesis technique
   *  from LEGENDARY/MYTHIC's `wobbles` so the two "heavy bass" tiers don't
   *  share their signature sound. */
  growls?: GrowlBass[];
  /** LEGENDARY-only: rhythmically gated chord pad(s), its defining texture. */
  tranceGates?: TranceGatePad[];
  /** MYTHIC-only: cinematic braam impact(s). */
  braams?: Braam[];
  /** MYTHIC-only: swelling choir chord(s). */
  choirs?: ChoirVoice[];
};

/** Algorithmically generates a rhythmic melodic phrase: cycles through
 *  `notes` at a fixed `gap` between onsets from `startAt` to `endAt`. This is
 *  what a real short musical line is built from -- notes landing one after
 *  another -- rather than every pitch being hand-placed. Used for every
 *  tier's "theme" and "climax" sections so a ~17s composition can be
 *  authored and re-tuned without hand-writing dozens of note objects. */
function buildArpeggioPhrase(
  notes: number[],
  startAt: number,
  endAt: number,
  noteDur: number,
  gap: number,
  lvl: number,
  wave: OscillatorType,
  det: number = 0,
  sustainFrac: number = 0.45
): ChimeVoice[] {
  const out: ChimeVoice[] = [];
  let t = startAt;
  let i = 0;
  while (t < endAt) {
    out.push({ f: notes[i % notes.length], to: 0, at: t, dur: noteDur, lvl, wave, det, sustainFrac });
    t += gap;
    i += 1;
  }
  return out;
}

/** Generates an EDM-style buildup roll: a series of discrete noise hits whose
 *  gap between onsets shrinks from `startGap` down to `endGap` and whose
 *  level rises as it accelerates -- the classic "riser roll" that creates
 *  tension right up to the drop, rather than one static swell. */
function buildNoiseRoll(
  startAt: number,
  endAt: number,
  startGap: number,
  endGap: number,
  lvl: number,
  filterType: BiquadFilterType,
  freqStart: number,
  freqEnd: number,
  q: number
): NoiseHit[] {
  const out: NoiseHit[] = [];
  const span = endAt - startAt;
  let t = startAt;
  while (t < endAt) {
    const progress = span > 0 ? (t - startAt) / span : 0;
    const gap = startGap + (endGap - startGap) * progress;
    const hitLvl = lvl * (0.45 + 0.55 * progress);
    out.push({
      at: t,
      dur: Math.min(gap * 0.9, 0.2),
      lvl: hitLvl,
      filterType,
      freqStart,
      freqEnd,
      q,
      riseFrac: 0.15,
    });
    t += Math.max(gap, 0.05);
  }
  return out;
}

/** Generates a rhythmic bassline/lead line of real synth PLUCKS -- fast
 *  attack, per-note filter sweep -- instead of chime-style tones. This is
 *  the direct replacement for `buildArpeggioPhrase` wherever the result
 *  needs to sound like an instrument being played, not a bell being rung. */
function buildPluckPhrase(
  notes: number[],
  startAt: number,
  endAt: number,
  noteDur: number,
  gap: number,
  lvl: number,
  wave: OscillatorType,
  filterStart: number,
  filterEnd: number,
  filterDecay: number,
  q: number = 3,
  det: number = 0,
  unison: number = 1,
  unisonDetune: number = 14,
  drive: number = 0
): PluckNote[] {
  const out: PluckNote[] = [];
  let t = startAt;
  let i = 0;
  while (t < endAt) {
    out.push({
      f: notes[i % notes.length],
      at: t,
      dur: noteDur,
      lvl,
      wave,
      filterStart,
      filterEnd,
      filterDecay,
      q,
      det,
      unison,
      unisonDetune,
      drive,
    });
    t += gap;
    i += 1;
  }
  return out;
}

/** Lays out a BPM-locked drum pattern: kick/snare/hat/tom step arrays (0-15
 *  within a 16-step bar), repeated every bar from `startAt` to `endAt`. This
 *  is what actually makes something a TRACK -- a felt beat under the melody
 *  -- rather than a well-arranged sequence of pitches. `tomSteps`/`lvlTom`
 *  are new (MYTHIC only, default empty/0 so every existing call is
 *  unaffected) -- they let MYTHIC layer tribal/orchestral-hybrid toms into
 *  the same grid as the kick, and calling this twice at TWO DIFFERENT `bpm`
 *  values over the same time window (one for kick/snare, a second at double
 *  tempo for hats only) is how MYTHIC gets a genuine half-time-kick /
 *  double-time-hat hybrid-trailer feel that none of the other three tiers
 *  use. */
function buildDrumPattern(
  startAt: number,
  endAt: number,
  bpm: number,
  kickSteps: number[],
  snareSteps: number[],
  hatSteps: number[],
  lvlKick: number,
  lvlSnare: number,
  lvlHat: number,
  tomSteps: number[] = [],
  lvlTom: number = 0
): DrumHit[] {
  const stepSec = 60 / bpm / 4; // 16th note
  const barSec = stepSec * 16;
  const hits: DrumHit[] = [];
  let bar = startAt;
  while (bar < endAt) {
    for (const s of kickSteps) {
      const at = bar + s * stepSec;
      if (at < endAt) hits.push({ at, kind: "kick", lvl: lvlKick });
    }
    for (const s of snareSteps) {
      const at = bar + s * stepSec;
      if (at < endAt) hits.push({ at, kind: "snare", lvl: lvlSnare });
    }
    for (const s of hatSteps) {
      const at = bar + s * stepSec;
      if (at < endAt) hits.push({ at, kind: "hat", lvl: lvlHat });
    }
    for (const s of tomSteps) {
      const at = bar + s * stepSec;
      if (at < endAt) hits.push({ at, kind: "tom", lvl: lvlTom });
    }
    bar += barSec;
  }
  return hits;
}

/** Cycles through a list of CHORDS (each an array of simultaneous note
 *  frequencies), firing every note in a chord together as one stab per
 *  step -- the future-bass/pop "chord stab" texture. Reuses the `PluckNote`
 *  envelope (fast attack, per-note filter sweep) so a stab still sounds
 *  like a played instrument, but the harmonic content is a full chord
 *  landing at once rather than a single-note line -- BASE's defining
 *  texture, and one none of the other three tiers use. */
function buildChordStabPhrase(
  chords: number[][],
  startAt: number,
  endAt: number,
  noteDur: number,
  gap: number,
  lvl: number,
  wave: OscillatorType,
  filterStart: number,
  filterEnd: number,
  filterDecay: number,
  q: number = 2.5
): PluckNote[] {
  const out: PluckNote[] = [];
  let t = startAt;
  let i = 0;
  while (t < endAt) {
    const chord = chords[i % chords.length];
    for (const f of chord) {
      out.push({ f, at: t, dur: noteDur, lvl, wave, filterStart, filterEnd, filterDecay, q, det: 0, unison: 1, unisonDetune: 0, drive: 0 });
    }
    t += gap;
    i += 1;
  }
  return out;
}

/** Fires a RHYTHMIC SEQUENCE of short, re-triggered `GrowlBass` hits from
 *  `startAt` to `endAt` -- the direct fix for the ninth-pass finding that a
 *  single long FM-modulated note, no matter how much growl is layered onto
 *  it, is still structurally "one held tone with an envelope" and reads as
 *  a drone/chime. A rhythmically SEQUENCED bass (real dubstep wobble
 *  rhythms are programmed, not one continuous moan) is what actually
 *  separates a bassline from a pad. */
function buildGrowlSequence(
  startAt: number,
  endAt: number,
  gap: number,
  hitDur: number,
  baseFreq: number,
  wave: OscillatorType,
  lvl: number,
  filterBase: number,
  filterQ: number,
  modRateStart: number,
  modRateEnd: number,
  modDepth: number,
  modRate2: number,
  modDepth2: number,
  drive: number,
  crush: number
): GrowlBass[] {
  const out: GrowlBass[] = [];
  let t = startAt;
  while (t < endAt) {
    out.push({ at: t, dur: hitDur, baseFreq, wave, lvl, filterBase, filterQ, modRateStart, modRateEnd, modDepth, modRate2, modDepth2, drive, crush });
    t += gap;
  }
  return out;
}

/** Bitcrush-style stair-step quantization curve for a WaveShaperNode --
 *  stacked AFTER `makeDriveCurve`'s analog-style soft-clip, this adds the
 *  harsher, more digital/robotic edge real aggressive dubstep growls layer
 *  on top of plain saturation. `levels` is how many discrete steps the
 *  signal is quantized to (fewer = harsher). */
function makeCrushCurve(amount: number): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const levels = Math.max(2, Math.round(32 - amount * 28));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

// Rebuilt 2026-07-28 (EIGHTH pass, full genre rewrite): Shailesh listened to
// all 7 prior passes and rejected every one of them with the same verdict --
// "still sounds similar, still has that chiming sound." That verdict was
// correct even after pass 6/7 added a real drum machine and pluck-based
// bass/lead: every tier still shared the exact same STRUCTURAL SHAPE (intro
// swell -> buildup roll -> one drop -> outro), the exact same instrumentation
// FORMULA (pluck bassline + pluck lead + kick/snare/hat + optional filter
// wobble), and every tier still leaned on `ChimeVoice` pads -- including a
// soft-attack "sparkle" tone near the end of BASE/SUPER/LEGENDARY -- which is
// where the residual "chime" DNA was actually coming from. Four tracks built
// from one template with different knobs turned will always converge back to
// "the same track" no matter how far the knobs are turned, because the
// listener is hearing the shared FORM, not the parameters.
//
// This pass throws out the "one template, four parameter sets" approach
// entirely. Each tier is now a different GENRE with different structural
// DNA and at least one synthesis primitive none of the other three tiers use
// at all, so there is no shared skeleton left to notice:
//
//   BASE (100bpm, future-bass pop anthem, C major, brightest/shortest, 15.5s)
//     Signature: CHORD STABS (`buildChordStabPhrase` -- a full triadic chord
//     landing on every hit, not a single-note line). One drop, no wobble/
//     growl/gate at all -- deliberately the "clean pop" tier. No trailing
//     pad "ding": ends on the chord's own natural decay.
//   SUPER (140bpm halftime dubstep, F#/Ab minor, darkest, aggressive, 18.8s)
//     Signature: `GrowlBass` -- audio-rate FM modulation on the bass
//     oscillator's own pitch (a genuinely different technique from a filter
//     LFO), with the modulator rate rising mid-note for the classic
//     "accelerating snarl". TWO separate drops with a hard half-beat SILENCE
//     cut between them (10.0-10.3s) -- the dubstep "stutter stop". Short,
//     dry reverb tail -- a hard robotic cutoff, not a lush ring-out.
//   LEGENDARY (128bpm big-room trance, A minor, 26.0s)
//     Signature: `TranceGatePad` -- a sustained chord rhythmically CHOPPED
//     into a repeating on/off gate, the real trance "gated pad" technique.
//     Drop -> full breakdown (drums drop out entirely, gate slows, riser
//     rebuilds) -> a bigger second drop -> an outro where the gate itself
//     decelerates into the fade. This drop/breakdown/second-drop arc is a
//     three-act shape none of the other tiers have.
//   MYTHIC (86bpm cinematic hybrid-trailer, D minor, longest/most epic,
//     ~31.5s)
//     Signature: `Braam` (deep detuned cinematic impact hits with a downward
//     pitch-bend tail) + `ChoirVoice` (multi-voice detuned+vibrato chord
//     swells) + tribal `tom` hits layered into the drum grid via
//     `buildDrumPattern`'s new `tomSteps`. Structurally unique in TWO ways
//     no other tier uses: (1) a genuine HALF-TIME-kick / DOUBLE-TIME-hat
//     hybrid, built by calling `buildDrumPattern` twice over the same
//     window at two different `bpm` values; (2) a real half-second hard
//     SILENCE (14.5-15.0s) before the second, biggest braam+choir climax --
//     the cinematic "beat drop" pause, distinct from SUPER's stutter-cut.
//
// `ChimeVoice` (the `voices` array) is now used ONLY for a single low,
// near-inaudible sub-drone per tier (plus MYTHIC's pre-existing rising-sub/
// falling-shimmer glide motifs, which are pitch-glide sound design, not a
// melodic bell tone) -- never a soft-attack melodic "sparkle" anywhere. That
// removes the one element that was making every tier's ending sound like the
// same instrument.
const BASE_LEAD_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77]; // C5 D5 E5 G5 A5 B5
const BASE_BASS_NOTES = [65.41, 73.42, 82.41, 87.31]; // C2 D2 E2 F2 -- roots under BASE_CHORDS
const BASE_CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [293.66, 349.23, 440.0, 523.25], // Dm7
  [329.63, 392.0, 493.88, 587.33], // Em7
  [349.23, 440.0, 523.25, 659.25], // Fmaj7
];
const SUPER_SCALE = [207.65, 233.08, 277.18, 311.13, 349.23, 415.3, 466.16, 554.37];
const LEGENDARY_SCALE = [196, 261.63, 329.63, 392, 523.25, 659.25, 783.99];
const LEGENDARY_AM_CHORD = [220.0, 261.63, 329.63, 440.0]; // Am
const LEGENDARY_LIFT_CHORD = [261.63, 329.63, 392.0, 523.25]; // Cmaj (breakdown "lift")
const MYTHIC_SCALE = [659.25, 739.99, 932.33, 1046.5, 1174.66, 1318.51];
const MYTHIC_CHOIR_CHORD = [293.66, 349.23, 440.0, 587.33]; // Dm
const MYTHIC_CHOIR_CHORD_WIDE = [293.66, 349.23, 440.0, 587.33, 698.46]; // Dm, wider for the climax

const CHIME_SCORES: Record<string, ChimeScore> = {
  // BASE -- future-bass pop anthem. Riff intro (0.4-2.0s) -> snare-roll
  // build (2.0-4.0s) -> DROP (4.0s): chord stabs + weaving top-line lead +
  // sub-octave bass pulse + syncopated groove (4.0-12.0s) -> a single
  // longer final chord ring-out, no separate "ding" (12.0-13.8s). The
  // shortest, brightest, punchiest tier -- deliberately: BASE is the most
  // common badge, it should feel like a quick pop hook, not an overstayed
  // cinematic.
  "BASE": {
    "peak": 0.42,
    "cutoff": 10000,
    "q": 0.3,
    "attack": 0.01,
    "total": 15.5,
    "reverbTime": 1.0,
    "reverbWet": 0.16,
    "noiseHits": [
      { "at": 0, "dur": 1.0, "lvl": 0.1, "filterType": "bandpass", "freqStart": 4500, "freqEnd": 6500, "q": 0.7, "riseFrac": 0.8 },
      ...buildNoiseRoll(2.0, 4.0, 0.4, 0.06, 0.3, "bandpass", 2000, 3800, 1.2),
      { "at": 4.0, "dur": 0.3, "lvl": 0.45, "filterType": "bandpass", "freqStart": 3400, "freqEnd": 1400, "q": 1.5, "riseFrac": 0.05 },
      { "at": 4.0, "dur": 0.25, "lvl": 0.3, "filterType": "lowpass", "freqStart": 320, "freqEnd": 70, "q": 1.0, "riseFrac": 0.05 }
    ],
    "voices": [
      { "f": 130.81, "to": 0, "at": 0, "dur": 14.5, "lvl": 0.1, "wave": "sine", "det": 0, "sustainFrac": 0.7 }
    ],
    "plucks": [
      ...buildPluckPhrase(BASE_LEAD_SCALE.slice(0, 4), 0.4, 2.0, 0.22, 0.4, 0.14, "triangle", 4200, 1400, 0.16),
      ...buildChordStabPhrase(BASE_CHORDS, 4.0, 12.0, 0.26, 0.6, 0.15, "triangle", 5200, 1700, 0.22, 2.4),
      ...buildPluckPhrase(BASE_LEAD_SCALE, 4.3, 12.0, 0.18, 0.6, 0.13, "square", 6000, 2200, 0.1, 3),
      ...buildPluckPhrase(BASE_BASS_NOTES, 4.0, 12.0, 0.2, 0.6, 0.26, "sawtooth", 1400, 300, 0.18, 2),
      ...buildChordStabPhrase([BASE_CHORDS[0]], 12.0, 12.1, 1.8, 5, 0.22, "triangle", 4500, 900, 0.9, 1.8)
    ],
    "drums": [
      ...buildDrumPattern(2.0, 4.0, 100, [], [], [0, 2, 4, 6, 8, 10, 12, 14], 0, 0, 0.08),
      ...buildDrumPattern(4.0, 12.0, 100, [0, 3, 8, 11], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], 0.48, 0.3, 0.13)
    ]
  },
  // SUPER -- halftime dubstep. Sub riser + robotic constant-rate stutter
  // gate (0-3.0s) -> accelerating build roll (3.0-6.0s) -> DROP 1 (6.0s):
  // halftime kick/snare + FM growl bass + sparse aggressive stabs
  // (6.0-10.0s) -> a second short stutter gate leading into a hard half-beat
  // SILENCE (9.6-10.3s) -- the dubstep "stutter stop" -- -> DROP 2 (10.3s):
  // bigger/denser halftime kit + hotter growl + denser stabs (10.3-18.0s).
  // Short, dry reverb tail -- a hard robotic cutoff, not a ring-out.
  "SUPER": {
    "peak": 0.32,
    "cutoff": 2400,
    "q": 0.85,
    "attack": 0.02,
    "total": 18.8,
    "reverbTime": 0.6,
    "reverbWet": 0.1,
    "noiseHits": [
      { "at": 0, "dur": 2.5, "lvl": 0.09, "filterType": "lowpass", "freqStart": 80, "freqEnd": 600, "q": 1.0, "riseFrac": 0.85 },
      ...buildNoiseRoll(1.0, 3.0, 0.15, 0.15, 0.16, "bandpass", 5500, 5000, 3),
      ...buildNoiseRoll(3.0, 6.0, 0.4, 0.06, 0.3, "highpass", 400, 3500, 1.0),
      { "at": 6.0, "dur": 0.4, "lvl": 0.5, "filterType": "bandpass", "freqStart": 1300, "freqEnd": 450, "q": 1.6, "riseFrac": 0.05 },
      { "at": 6.0, "dur": 0.35, "lvl": 0.38, "filterType": "lowpass", "freqStart": 380, "freqEnd": 45, "q": 1.0, "riseFrac": 0.05 },
      ...buildNoiseRoll(9.6, 10.0, 0.08, 0.08, 0.22, "bandpass", 6000, 5500, 3),
      { "at": 10.3, "dur": 0.45, "lvl": 0.6, "filterType": "bandpass", "freqStart": 1500, "freqEnd": 400, "q": 1.7, "riseFrac": 0.04 },
      { "at": 10.3, "dur": 0.4, "lvl": 0.44, "filterType": "lowpass", "freqStart": 420, "freqEnd": 40, "q": 1.0, "riseFrac": 0.04 }
    ],
    "voices": [
      { "f": 51.91, "to": 0, "at": 0, "dur": 18.0, "lvl": 0.08, "wave": "sine", "det": 0, "sustainFrac": 0.7 }
    ],
    "plucks": [
      ...buildPluckPhrase(SUPER_SCALE.slice(0, 3), 6.0, 10.0, 0.16, 1.0, 0.16, "sawtooth", 3200, 900, 0.14, 4, 0, 1, 0, 0.35),
      ...buildPluckPhrase(SUPER_SCALE, 10.3, 18.0, 0.14, 0.7, 0.17, "sawtooth", 3600, 800, 0.12, 4, -6, 1, 0, 0.55)
    ],
    "drums": [
      ...buildDrumPattern(6.0, 10.0, 140, [0], [8], [2, 6, 10, 14], 0.5, 0.4, 0.12),
      ...buildDrumPattern(10.3, 18.0, 140, [0, 8], [8], [0, 2, 4, 6, 8, 10, 12, 14], 0.58, 0.46, 0.16)
    ],
    "growls": [
      ...buildGrowlSequence(6.0, 10.0, 0.5, 0.42, 51.91, "sawtooth", 0.4, 550, 5, 30, 60, 190, 13, 90, 0.55, 0.25),
      ...buildGrowlSequence(10.3, 18.0, 0.35, 0.3, 51.91, "sawtooth", 0.46, 650, 5.5, 45, 90, 260, 19, 140, 0.75, 0.45)
    ]
  },
  // LEGENDARY -- big-room trance. Pad-swell intro (0-4.0s) -> build roll
  // (4.0-8.0s) -> DROP 1 (8.0s): four-on-the-floor + supersaw arpeggio lead
  // + gated Am pad + pulsed bass (8.0-13.0s) -> full BREAKDOWN (13.0-16.0s):
  // drums drop to sparse hats only, lead thins to one sustained note, the
  // gated pad shifts to a slower/wider Cmaj "lift" chord, riser rebuilds ->
  // DROP 2 (16.0s), bigger than drop 1: full kit + supersaw + doubled-octave
  // lead + gated Am pad at full rate (16.0-21.5s) -> outro where the gate
  // itself decelerates into the fade (21.0-23.3s).
  "LEGENDARY": {
    "peak": 0.36,
    "cutoff": 2600,
    "q": 1.0,
    "attack": 0.05,
    "total": 26.0,
    "reverbTime": 2.8,
    "reverbWet": 0.38,
    "noiseHits": [
      { "at": 0, "dur": 4.0, "lvl": 0.09, "filterType": "bandpass", "freqStart": 4800, "freqEnd": 7200, "q": 0.6, "riseFrac": 0.88 },
      ...buildNoiseRoll(4.0, 8.0, 0.5, 0.07, 0.34, "highpass", 280, 3800, 0.7),
      { "at": 8.0, "dur": 0.5, "lvl": 0.55, "filterType": "lowpass", "freqStart": 420, "freqEnd": 38, "q": 1.0, "riseFrac": 0.05 },
      { "at": 8.0, "dur": 0.35, "lvl": 0.38, "filterType": "bandpass", "freqStart": 2100, "freqEnd": 800, "q": 1.5, "riseFrac": 0.05 },
      ...buildNoiseRoll(13.0, 16.0, 0.6, 0.09, 0.3, "bandpass", 1200, 4200, 0.8),
      { "at": 16.0, "dur": 0.55, "lvl": 0.62, "filterType": "lowpass", "freqStart": 460, "freqEnd": 34, "q": 1.0, "riseFrac": 0.04 },
      { "at": 16.0, "dur": 0.4, "lvl": 0.44, "filterType": "bandpass", "freqStart": 2300, "freqEnd": 900, "q": 1.5, "riseFrac": 0.04 }
    ],
    "voices": [
      { "f": 55.0, "to": 0, "at": 0, "dur": 23.0, "lvl": 0.14, "wave": "sine", "det": 0, "sustainFrac": 0.7 }
    ],
    "plucks": [
      ...buildPluckPhrase(LEGENDARY_SCALE, 8.0, 13.0, 0.24, 0.227, 0.2, "sawtooth", 6000, 1400, 0.12, 3, 4, 5, 18),
      ...buildPluckPhrase([440], 13.0, 16.0, 2.8, 3.0, 0.12, "sawtooth", 3000, 1200, 1.5, 2),
      ...buildPluckPhrase(LEGENDARY_SCALE, 16.0, 21.5, 0.22, 0.227, 0.22, "sawtooth", 6500, 1500, 0.11, 3, 5, 6, 20),
      ...buildPluckPhrase(LEGENDARY_SCALE.map((f) => f * 2), 16.0, 21.5, 0.2, 0.227, 0.09, "triangle", 8000, 2500, 0.1, 3),
      ...buildPluckPhrase([55.0], 8.0, 13.0, 0.3, 0.46875, 0.3, "sawtooth", 1200, 160, 0.2, 2.5),
      ...buildPluckPhrase([55.0], 16.0, 21.5, 0.3, 0.46875, 0.32, "sawtooth", 1300, 160, 0.2, 2.5)
    ],
    "drums": [
      ...buildDrumPattern(8.0, 13.0, 128, [0, 4, 8, 12], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], 0.52, 0.38, 0.16),
      ...buildDrumPattern(13.0, 16.0, 128, [], [], [0, 4, 8, 12], 0, 0, 0.07),
      ...buildDrumPattern(16.0, 21.5, 128, [0, 4, 8, 12], [4, 12], [0, 1, 2, 4, 6, 8, 9, 10, 12, 14], 0.58, 0.42, 0.18)
    ],
    "wobbles": [
      { "at": 8.0, "dur": 5.0, "baseFreq": 55.0, "wave": "sawtooth", "lvl": 0.22, "filterBase": 600, "lfoRate": 3.2, "lfoDepth": 400, "q": 5 },
      { "at": 16.0, "dur": 5.5, "baseFreq": 55.0, "wave": "sawtooth", "lvl": 0.26, "filterBase": 650, "lfoRate": 3.2, "lfoDepth": 420, "q": 5 }
    ],
    "tranceGates": [
      { "at": 8.0, "dur": 5.0, "notes": LEGENDARY_AM_CHORD, "wave": "sawtooth", "lvl": 0.18, "gateRate": 4, "gateDepth": 0.55, "filterStart": 4200, "filterEnd": 1400, "q": 2.0 },
      { "at": 13.0, "dur": 3.0, "notes": LEGENDARY_LIFT_CHORD, "wave": "sawtooth", "lvl": 0.14, "gateRate": 1.3, "gateDepth": 0.4, "filterStart": 3000, "filterEnd": 1000, "q": 1.5 },
      { "at": 16.0, "dur": 5.0, "notes": LEGENDARY_AM_CHORD, "wave": "sawtooth", "lvl": 0.22, "gateRate": 8, "gateDepth": 0.6, "filterStart": 5000, "filterEnd": 1600, "q": 2.2 },
      { "at": 21.0, "dur": 2.3, "notes": LEGENDARY_AM_CHORD, "wave": "sawtooth", "lvl": 0.17, "gateRate": 2, "gateDepth": 0.45, "filterStart": 3200, "filterEnd": 900, "q": 1.5 }
    ]
  },
  // MYTHIC -- epic cinematic hybrid-trailer. Wide riser + distant tom roll
  // building tension (0-8.5s) -> choir swell layered in over the last 3.5s
  // of the build -> BRAAM IMPACT + DROP 1 (8.5s): hybrid half-time
  // kick+tom (deliberately no hats yet -- trailer restraint, not a
  // dancefloor drop), sustained choir, rising lead motif, sub pulse
  // (8.5-14.5s) -> a real half-second hard SILENCE (14.5-15.0s), the
  // cinematic "beat drop" pause -> DROP 2 / the climax (15.0s), the
  // biggest moment of all four tiers: a second bigger braam, full choir,
  // doubled-octave lead, sub wobble, and a genuine HALF-TIME-kick /
  // DOUBLE-TIME-hat hybrid (two `buildDrumPattern` calls over the same
  // window at 86bpm and 172bpm) (15.0-24.0s) -> epic choir-tail outro,
  // longest reverb of all four tiers (24.0-28.5s).
  "MYTHIC": {
    "peak": 0.4,
    "cutoff": 12000,
    "q": 0.25,
    "attack": 0.15,
    "total": 31.5,
    "reverbTime": 3.6,
    "reverbWet": 0.44,
    "noiseHits": [
      { "at": 0, "dur": 5.0, "lvl": 0.1, "filterType": "bandpass", "freqStart": 4200, "freqEnd": 7800, "q": 0.6, "riseFrac": 0.9 },
      { "at": 0.6, "dur": 4.2, "lvl": 0.08, "filterType": "highpass", "freqStart": 280, "freqEnd": 4200, "q": 0.5, "riseFrac": 0.85 },
      ...buildNoiseRoll(5.0, 8.5, 0.55, 0.08, 0.3, "highpass", 260, 5200, 0.6),
      ...buildNoiseRoll(5.3, 8.5, 0.45, 0.07, 0.2, "bandpass", 4200, 8200, 0.9),
      { "at": 8.5, "dur": 1.0, "lvl": 0.68, "filterType": "lowpass", "freqStart": 600, "freqEnd": 28, "q": 1.0, "riseFrac": 0.05 },
      { "at": 8.5, "dur": 0.5, "lvl": 0.42, "filterType": "bandpass", "freqStart": 3200, "freqEnd": 1100, "q": 1.6, "riseFrac": 0.05 },
      ...buildNoiseRoll(13.6, 14.5, 0.12, 0.03, 0.36, "bandpass", 2000, 6500, 1.0),
      { "at": 15.0, "dur": 1.1, "lvl": 0.75, "filterType": "lowpass", "freqStart": 650, "freqEnd": 26, "q": 1.0, "riseFrac": 0.04 },
      { "at": 15.0, "dur": 0.55, "lvl": 0.46, "filterType": "bandpass", "freqStart": 3400, "freqEnd": 1200, "q": 1.7, "riseFrac": 0.04 }
    ],
    "voices": [
      { "f": 41.2, "to": 0, "at": 0, "dur": 27.5, "lvl": 0.16, "wave": "sine", "det": 0, "sustainFrac": 0.7 },
      { "f": 2959.96, "to": 1479.98, "at": 15.0, "dur": 4.5, "lvl": 0.1, "wave": "sine", "det": 0, "sustainFrac": 0.4 }
    ],
    "plucks": [
      ...buildPluckPhrase(MYTHIC_SCALE, 9.0, 14.5, 0.7, 1.2, 0.11, "sine", 3200, 950, 0.4),
      ...buildPluckPhrase([73.42], 8.5, 14.5, 0.32, 0.5, 0.34, "sawtooth", 1400, 170, 0.22, 2.5, 0, 1, 0, 0.28),
      ...buildPluckPhrase(MYTHIC_SCALE, 15.0, 24.0, 0.28, 0.242, 0.2, "triangle", 7200, 1800, 0.15, 3, 0, 7, 22),
      ...buildPluckPhrase(MYTHIC_SCALE.map((f) => f * 2), 15.0, 24.0, 0.24, 0.242, 0.09, "sine", 9200, 2800, 0.12, 3),
      ...buildPluckPhrase([73.42], 15.0, 24.0, 0.3, 0.484, 0.36, "sawtooth", 1500, 170, 0.22, 2.5, 0, 1, 0, 0.35)
    ],
    "drums": [
      ...buildDrumPattern(2.0, 8.5, 86, [], [], [], 0, 0, 0, [0, 7, 13, 14, 15], 0.3),
      ...buildDrumPattern(8.5, 14.5, 86, [0, 8], [], [], 0.52, 0, 0, [4, 12, 15], 0.42),
      ...buildDrumPattern(15.0, 24.0, 86, [0, 8], [4, 12], [], 0.6, 0.46, 0, [2, 6, 10, 14], 0.36),
      ...buildDrumPattern(15.0, 24.0, 172, [], [], [0, 2, 4, 6, 8, 10, 12, 14], 0, 0, 0.15)
    ],
    "wobbles": [
      { "at": 15.0, "dur": 9.0, "baseFreq": 36.71, "wave": "sawtooth", "lvl": 0.24, "filterBase": 700, "lfoRate": 2.2, "lfoDepth": 460, "q": 5 }
    ],
    "braams": [
      { "at": 8.5, "dur": 5.5, "freqs": [36.71, 55.0, 73.42, 36.85], "wave": "sawtooth", "lvl": 0.5, "filterStart": 900, "filterEnd": 180, "pitchBendSemitones": 1.5, "drive": 0.35, "tremoloRate": 5, "tremoloDepth": 0.15 },
      { "at": 15.0, "dur": 6.0, "freqs": [36.71, 55.0, 73.42, 110.0, 36.85], "wave": "sawtooth", "lvl": 0.58, "filterStart": 1100, "filterEnd": 200, "pitchBendSemitones": 2, "drive": 0.5, "tremoloRate": 6, "tremoloDepth": 0.18 }
    ],
    "choirs": [
      { "at": 5.0, "dur": 4.3, "freqs": MYTHIC_CHOIR_CHORD, "lvl": 0.16, "vibratoRate": 4.5, "vibratoDepthCents": 12, "filterStart": 800, "filterEnd": 2600 },
      { "at": 8.5, "dur": 6.5, "freqs": MYTHIC_CHOIR_CHORD, "lvl": 0.2, "vibratoRate": 5, "vibratoDepthCents": 14, "filterStart": 1000, "filterEnd": 3000 },
      { "at": 15.0, "dur": 9.5, "freqs": MYTHIC_CHOIR_CHORD_WIDE, "lvl": 0.26, "vibratoRate": 5.5, "vibratoDepthCents": 16, "filterStart": 1400, "filterEnd": 4200 },
      { "at": 24.0, "dur": 4.5, "freqs": MYTHIC_CHOIR_CHORD, "lvl": 0.18, "vibratoRate": 3.5, "vibratoDepthCents": 10, "filterStart": 900, "filterEnd": 1800 }
    ]
  }
};

/** Builds a synthesized impulse response for a ConvolverNode: exponentially
 *  decaying white noise. This is what gives every chime tier a real reverb
 *  tail without any sampled/recorded audio asset -- 100% generated in code,
 *  same principle already used for every badge's visuals. */
function createImpulseResponse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * durationSec));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/** Plain (un-decayed) white noise -- the raw material for `NoiseHit`s. Shape
 *  comes entirely from the filter sweep + gain envelope applied when it's
 *  scheduled, not from the buffer itself. */
function createWhiteNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * durationSec));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Soft-clip saturation curve for a WaveShaperNode -- real analog-style
 *  drive/growl (Skrillex-style bass aggression), not a volume boost. */
function makeDriveCurve(amount: number): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + amount * 20;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

// --- Synthesized drum machine ------------------------------------------
// Real percussion synthesis, not a fourth melodic voice standing in for it.
// Kick is now layered (a pitched sine thump PLUS a short high transient
// "click" -- real kick drums have both a low body and a high attack, which
// is what makes them punch through a mix instead of just being a soft
// thud). "Snare" is synthesized as a proper EDM CLAP -- three tightly
// spaced, slightly randomized noise bursts -- since a single snare hit
// reads as rock/pop percussion, not dance music.
function scheduleKick(ctx: AudioContext, destination: AudioNode, at: number, lvl: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(155, at);
  osc.frequency.exponentialRampToValueAtTime(40, at + 0.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(lvl, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
  osc.connect(g);
  g.connect(destination);
  osc.start(at);
  osc.stop(at + 0.3);

  // The click: a very short, bright, highpassed noise transient right at
  // the attack -- this is what gives a synthesized kick real punch instead
  // of just a soft low thump.
  const click = ctx.createBufferSource();
  click.buffer = createWhiteNoiseBuffer(ctx, 0.015);
  const clickFilt = ctx.createBiquadFilter();
  clickFilt.type = "highpass";
  clickFilt.frequency.value = 2500;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(lvl * 0.6, at);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
  click.connect(clickFilt);
  clickFilt.connect(clickGain);
  clickGain.connect(destination);
  click.start(at);
  click.stop(at + 0.03);
}

function scheduleSnare(ctx: AudioContext, destination: AudioNode, at: number, lvl: number) {
  // A real EDM clap: 3 quick bursts, a few ms apart, each independently
  // filtered -- the characteristic "flam" texture a clap has that a single
  // noise hit never does.
  const offsets = [0, 0.011, 0.024];
  for (const off of offsets) {
    const t = at + off;
    const src = ctx.createBufferSource();
    src.buffer = createWhiteNoiseBuffer(ctx, 0.14);
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1500 + Math.random() * 500;
    filt.Q.value = 1.3;
    const g = ctx.createGain();
    const burstLvl = lvl * (off === 0 ? 0.85 : 1.0);
    g.gain.setValueAtTime(burstLvl, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(filt);
    filt.connect(g);
    g.connect(destination);
    src.start(t);
    src.stop(t + 0.16);
  }
  // A short tail burst for body, a touch longer and darker.
  const tail = ctx.createBufferSource();
  tail.buffer = createWhiteNoiseBuffer(ctx, 0.22);
  const tailFilt = ctx.createBiquadFilter();
  tailFilt.type = "bandpass";
  tailFilt.frequency.value = 1100;
  tailFilt.Q.value = 0.9;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(lvl * 0.5, at + 0.02);
  tailGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  tail.connect(tailFilt);
  tailFilt.connect(tailGain);
  tailGain.connect(destination);
  tail.start(at + 0.02);
  tail.stop(at + 0.24);
}

function scheduleTom(ctx: AudioContext, destination: AudioNode, at: number, lvl: number) {
  // A resonant, higher-pitched, much-slower-decaying hit than the kick --
  // a taiko-style tribal tom. MYTHIC-only, layered into the same step grid
  // as the kick via `buildDrumPattern`'s `tomSteps`, giving MYTHIC's
  // pre-drop buildup and hybrid-trailer drop a percussion identity none of
  // the other three tiers' straight kick/snare/hat kit has.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, at);
  osc.frequency.exponentialRampToValueAtTime(70, at + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(lvl, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  osc.connect(g);
  g.connect(destination);
  osc.start(at);
  osc.stop(at + 0.6);
}

function scheduleHat(ctx: AudioContext, destination: AudioNode, at: number, lvl: number) {
  const src = ctx.createBufferSource();
  src.buffer = createWhiteNoiseBuffer(ctx, 0.06);
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 7500;
  filt.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(lvl, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  src.connect(filt);
  filt.connect(g);
  g.connect(destination);
  src.start(at);
  src.stop(at + 0.08);
}

// Returns a stop function that kills the sound immediately (closing the
// AudioContext halts every scheduled oscillator/noise node at once,
// regardless of how far into the composition playback has gotten) -- this is
// what lets a "Skip" action cut the chime instantly instead of waiting for
// its own scheduled fade-out.
function playUnlockChime(tier: string): () => void {
  try {
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return () => {};
    const ctx: AudioContext = new Ctor();
    // Resume FIRST. Scheduling against a suspended context's frozen
    // currentTime is how chimes end up compressed into a single click.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    // Tier is the ONLY key. Two different badges on the same tier are the same
    // sound by construction, and an unknown tier falls back to BASE rather
    // than to silence.
    const score = CHIME_SCORES[tier] || CHIME_SCORES.BASE;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = score.cutoff;
    tone.Q.value = score.q;

    // Mastering bus: a real DynamicsCompressorNode glueing the final mix
    // together, the way an actual EDM record is mastered (loud, controlled,
    // no single element poking out) rather than left as raw synth voltage.
    const masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -16;
    masterComp.knee.value = 10;
    masterComp.ratio.value = 5;
    masterComp.attack.value = 0.003;
    masterComp.release.value = 0.18;

    // Procedural reverb send (see createImpulseResponse above) -- runs in
    // parallel with the dry path so the chime keeps a real tail after the
    // direct notes stop, instead of hard-cutting to silence the way the
    // pre-fix version did.
    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulseResponse(ctx, score.reverbTime, 2.2);
    const wetGain = ctx.createGain();
    wetGain.gain.value = score.reverbWet;

    master.connect(tone);
    tone.connect(masterComp);
    tone.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(masterComp);
    masterComp.connect(ctx.destination);

    // Sidechain duck bus: every melodic layer (pads, plucks, wobble bass)
    // routes through this instead of straight to `master`. Every kick hit
    // pulls this bus's gain down hard and springs it back -- the actual
    // "pump" that's the single most recognizable signature of a real dance
    // record, not a synth demo. Drums bypass this bus entirely so a kick
    // never ducks itself.
    const duckBus = ctx.createGain();
    duckBus.gain.value = 1.0;
    duckBus.connect(master);

    const now0 = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now0);
    master.gain.exponentialRampToValueAtTime(score.peak, now0 + 0.025);

    let lastEventEnd = 0;

    // Sound-design layer: risers (build-up) + impact crack/sub-thump. This is
    // what makes the reveal feel scored rather than just "a ding played over
    // a video" -- real cinematic stings live or die on this layer.
    for (const nh of score.noiseHits) {
      const src = ctx.createBufferSource();
      src.buffer = createWhiteNoiseBuffer(ctx, nh.dur);
      const filt = ctx.createBiquadFilter();
      filt.type = nh.filterType;
      filt.Q.value = nh.q;
      filt.frequency.setValueAtTime(nh.freqStart, now0 + nh.at);
      filt.frequency.exponentialRampToValueAtTime(Math.max(20, nh.freqEnd), now0 + nh.at + nh.dur);

      const g = ctx.createGain();
      const riseFrac = nh.riseFrac ?? 0.08;
      const riseEnd = nh.at + nh.dur * riseFrac;
      g.gain.setValueAtTime(0.0001, now0 + nh.at);
      g.gain.exponentialRampToValueAtTime(nh.lvl, now0 + riseEnd);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + nh.at + nh.dur);

      src.connect(filt);
      filt.connect(g);
      g.connect(master);
      src.start(now0 + nh.at);
      src.stop(now0 + nh.at + nh.dur + 0.05);
      lastEventEnd = Math.max(lastEventEnd, nh.at + nh.dur);
    }

    // Musical layer: a sustained pad/drone plus a real rhythmic phrase --
    // notes with staggered onsets that land one after another as an actual
    // short line, not a chord that all fires at once.
    for (const v of score.voices) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.f, now0 + v.at);
      if (v.to > 0) {
        // Pitch glide -- MYTHIC only. The rising sub and the falling shimmer
        // are the two most identifiable things in the whole chime set.
        osc.frequency.exponentialRampToValueAtTime(v.to, now0 + v.at + v.dur);
      }
      osc.detune.value = v.det;

      // Attack -> sustain plateau -> release, so a voice actually holds
      // through most of its life before releasing instead of starting to
      // die the instant it attacks.
      const sustainFrac = v.sustainFrac ?? 0.4;
      const sustainEnd = v.at + v.dur * sustainFrac;
      const releaseEnd = v.at + v.dur;
      g.gain.setValueAtTime(0.0001, now0 + v.at);
      g.gain.exponentialRampToValueAtTime(v.lvl, now0 + v.at + score.attack);
      g.gain.setValueAtTime(v.lvl, now0 + sustainEnd);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + releaseEnd);

      osc.connect(g);
      g.connect(duckBus);
      osc.start(now0 + v.at);
      osc.stop(now0 + releaseEnd + 0.08);
      lastEventEnd = Math.max(lastEventEnd, releaseEnd);
    }

    // Bassline + lead: real synth PLUCKS. Fast (~6ms) percussive attack,
    // through the note's own lowpass filter that sweeps bright -> dark over
    // `filterDecay`. Lead notes with `unison > 1` are stacked SUPERSAWS --
    // several detuned oscillators sharing one filter/envelope, the actual
    // technique big-room/electro leads (Garrix/Guetta) are built from,
    // instead of one thin oscillator. Notes with `drive` get a WaveShaper
    // soft-clip for aggressive growl (Skrillex-style bass character).
    for (const p of score.plucks) {
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.Q.value = p.q;
      filt.frequency.setValueAtTime(p.filterStart, now0 + p.at);
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, p.filterEnd), now0 + p.at + p.filterDecay);

      let filterOut: AudioNode = filt;
      if (p.drive && p.drive > 0) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDriveCurve(p.drive) as unknown as Float32Array<ArrayBuffer>;
        shaper.oversample = "2x";
        filt.connect(shaper);
        filterOut = shaper;
      }

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now0 + p.at);
      g.gain.exponentialRampToValueAtTime(p.lvl, now0 + p.at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + p.at + p.dur);
      filterOut.connect(g);
      g.connect(duckBus);

      const unison = Math.max(1, p.unison ?? 1);
      const spread = p.unisonDetune ?? 14;
      for (let u = 0; u < unison; u++) {
        const osc = ctx.createOscillator();
        osc.type = p.wave;
        osc.frequency.setValueAtTime(p.f, now0 + p.at);
        const voiceDetune =
          unison === 1 ? (p.det ?? 0) : (p.det ?? 0) + (-spread / 2 + (spread * u) / (unison - 1));
        osc.detune.value = voiceDetune;
        osc.connect(filt);
        osc.start(now0 + p.at);
        osc.stop(now0 + p.at + p.dur + 0.05);
      }
      lastEventEnd = Math.max(lastEventEnd, p.at + p.dur);
    }

    // The drum machine -- BPM-locked kick/snare/hat, connected DIRECTLY to
    // `master` (bypassing the duck bus, since a kick can't sidechain
    // itself). Every kick hit also schedules the sidechain pump on
    // `duckBus` -- the actual "wub-thump-wub" pump heard in every real EDM
    // drop.
    for (const d of score.drums) {
      const at = now0 + d.at;
      if (d.kind === "kick") {
        scheduleKick(ctx, master, at, d.lvl);
        duckBus.gain.cancelScheduledValues(at);
        duckBus.gain.setValueAtTime(1.0, at);
        duckBus.gain.linearRampToValueAtTime(0.32, at + 0.045);
        duckBus.gain.exponentialRampToValueAtTime(1.0, at + 0.32);
      } else if (d.kind === "snare") {
        scheduleSnare(ctx, master, at, d.lvl);
      } else if (d.kind === "tom") {
        scheduleTom(ctx, master, at, d.lvl);
      } else {
        scheduleHat(ctx, master, at, d.lvl);
      }
      lastEventEnd = Math.max(lastEventEnd, d.at + 0.3);
    }

    // Wobble bass -- the drop's rhythmic low end. A genuine LFO oscillator
    // (inaudible on its own, a few Hz) is wired directly into the filter's
    // `frequency` AudioParam, so the cutoff itself oscillates while a
    // sawtooth carrier plays through it. This is what makes a drop actually
    // "wub" instead of just being a held bass note.
    for (const w of score.wobbles ?? []) {
      const osc = ctx.createOscillator();
      osc.type = w.wave;
      osc.frequency.setValueAtTime(w.baseFreq, now0 + w.at);

      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = w.filterBase;
      filt.Q.value = w.q;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = w.lfoRate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = w.lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(filt.frequency);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now0 + w.at);
      g.gain.exponentialRampToValueAtTime(w.lvl, now0 + w.at + 0.06);
      g.gain.setValueAtTime(w.lvl, now0 + w.at + w.dur * 0.88);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + w.at + w.dur);

      osc.connect(filt);
      filt.connect(g);
      g.connect(duckBus);
      osc.start(now0 + w.at);
      osc.stop(now0 + w.at + w.dur + 0.05);
      lfo.start(now0 + w.at);
      lfo.stop(now0 + w.at + w.dur + 0.05);
      lastEventEnd = Math.max(lastEventEnd, w.at + w.dur);
    }

    // SUPER's growl bass -- NINTH-pass rebuild. Each `GrowlBass` entry is
    // now one short, re-triggered HIT (part of a rhythmic sequence built by
    // `buildGrowlSequence`), not one long sustained note -- a sequenced
    // bassline, not a drone. Two independent audio-rate FM modulators are
    // summed into the carrier's own pitch for a genuinely inharmonic snarl
    // (real growl basses layer more than one modulator), and an optional
    // bitcrush stage stacks after the analog drive for extra digital
    // aggression.
    for (const gr of score.growls ?? []) {
      const carrier = ctx.createOscillator();
      carrier.type = gr.wave;
      carrier.frequency.setValueAtTime(gr.baseFreq, now0 + gr.at);

      const modulator = ctx.createOscillator();
      modulator.type = "sine";
      modulator.frequency.setValueAtTime(gr.modRateStart, now0 + gr.at);
      modulator.frequency.exponentialRampToValueAtTime(Math.max(1, gr.modRateEnd), now0 + gr.at + gr.dur);
      const modGain = ctx.createGain();
      modGain.gain.value = gr.modDepth;
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      let modulator2: OscillatorNode | null = null;
      if (gr.modRate2 > 0 && gr.modDepth2 > 0) {
        modulator2 = ctx.createOscillator();
        modulator2.type = "sine";
        modulator2.frequency.value = gr.modRate2;
        const modGain2 = ctx.createGain();
        modGain2.gain.value = gr.modDepth2;
        modulator2.connect(modGain2);
        modGain2.connect(carrier.frequency);
      }

      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = gr.filterBase;
      filt.Q.value = gr.filterQ;

      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDriveCurve(gr.drive) as unknown as Float32Array<ArrayBuffer>;
      shaper.oversample = "2x";

      let lastNode: AudioNode = shaper;
      if (gr.crush > 0) {
        const crusher = ctx.createWaveShaper();
        crusher.curve = makeCrushCurve(gr.crush) as unknown as Float32Array<ArrayBuffer>;
        shaper.connect(crusher);
        lastNode = crusher;
      }

      // Short, punchy per-hit envelope -- fast attack, most of the hit at
      // full level, a real decay before the next hit re-triggers. This is
      // what turns "one long modulated tone" into "a played bass hit".
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now0 + gr.at);
      g.gain.exponentialRampToValueAtTime(gr.lvl, now0 + gr.at + 0.012);
      g.gain.exponentialRampToValueAtTime(gr.lvl * 0.55, now0 + gr.at + gr.dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + gr.at + gr.dur);

      carrier.connect(filt);
      filt.connect(shaper);
      lastNode.connect(g);
      g.connect(duckBus);

      carrier.start(now0 + gr.at);
      carrier.stop(now0 + gr.at + gr.dur + 0.05);
      modulator.start(now0 + gr.at);
      modulator.stop(now0 + gr.at + gr.dur + 0.05);
      if (modulator2) {
        modulator2.start(now0 + gr.at);
        modulator2.stop(now0 + gr.at + gr.dur + 0.05);
      }
      lastEventEnd = Math.max(lastEventEnd, gr.at + gr.dur);
    }

    // LEGENDARY's trance-gated PLUCK -- NINTH-pass rebuild. Every gate step
    // now triggers a genuinely fresh note per chord tone -- its own fast
    // attack, its own filter sweep from `filterStart` down to `filterEnd`
    // across the step -- instead of externally chopping the gain on
    // continuously-running oscillators. Steps alternate a full-velocity
    // "downbeat" hit with a quieter "ghost" hit (`gateDepth` controls how
    // much quieter), the real bounce/groove a trance gated arpeggio has.
    for (const tg of score.tranceGates ?? []) {
      const stepSec = 1 / tg.gateRate;
      let t = tg.at;
      let stepIdx = 0;
      while (t < tg.at + tg.dur) {
        const isGhost = stepIdx % 2 === 1;
        const stepLvl = isGhost ? tg.lvl * (1 - tg.gateDepth) : tg.lvl;
        const hitDur = stepSec * 0.92;

        for (const f of tg.notes) {
          const filt = ctx.createBiquadFilter();
          filt.type = "lowpass";
          filt.Q.value = tg.q;
          filt.frequency.setValueAtTime(tg.filterStart, now0 + t);
          filt.frequency.exponentialRampToValueAtTime(Math.max(80, tg.filterEnd), now0 + t + hitDur);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now0 + t);
          g.gain.exponentialRampToValueAtTime(stepLvl, now0 + t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, now0 + t + hitDur);

          const osc = ctx.createOscillator();
          osc.type = tg.wave;
          osc.frequency.value = f;
          osc.connect(filt);
          filt.connect(g);
          g.connect(duckBus);
          osc.start(now0 + t);
          osc.stop(now0 + t + hitDur + 0.03);
        }
        t += stepSec;
        stepIdx += 1;
      }
      lastEventEnd = Math.max(lastEventEnd, tg.at + tg.dur);
    }

    // MYTHIC's braam -- stacked detuned low oscillators with a slow swell
    // attack (this is a cinematic impact, not a pluck), an optional slow
    // downward pitch bend across the tail for a real sense of physical
    // mass, real drive/grit instead of a clean tone (NINTH pass: real brass
    // hits are never clean sine/saw, they distort), and a slow amplitude
    // tremolo so the sustain has movement instead of sitting as one static
    // level.
    for (const br of score.braams ?? []) {
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(br.filterStart, now0 + br.at);
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, br.filterEnd), now0 + br.at + br.dur);
      filt.Q.value = 0.8;

      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDriveCurve(br.drive) as unknown as Float32Array<ArrayBuffer>;
      shaper.oversample = "2x";

      const g = ctx.createGain();
      const swell = br.dur * 0.18;
      g.gain.setValueAtTime(0.0001, now0 + br.at);
      g.gain.exponentialRampToValueAtTime(br.lvl, now0 + br.at + swell);
      g.gain.setValueAtTime(br.lvl, now0 + br.at + br.dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + br.at + br.dur);

      if (br.tremoloRate > 0 && br.tremoloDepth > 0) {
        const tremLfo = ctx.createOscillator();
        tremLfo.type = "sine";
        tremLfo.frequency.value = br.tremoloRate;
        const tremGain = ctx.createGain();
        tremGain.gain.value = br.lvl * br.tremoloDepth;
        tremLfo.connect(tremGain);
        tremGain.connect(g.gain);
        tremLfo.start(now0 + br.at + swell);
        tremLfo.stop(now0 + br.at + br.dur + 0.05);
      }

      filt.connect(shaper);
      shaper.connect(g);
      g.connect(duckBus);

      for (const f of br.freqs) {
        const osc = ctx.createOscillator();
        osc.type = br.wave;
        osc.frequency.setValueAtTime(f, now0 + br.at);
        if (br.pitchBendSemitones) {
          const target = f * Math.pow(2, -br.pitchBendSemitones / 12);
          osc.frequency.exponentialRampToValueAtTime(target, now0 + br.at + br.dur);
        }
        osc.connect(filt);
        osc.start(now0 + br.at);
        osc.stop(now0 + br.at + br.dur + 0.05);
      }
      lastEventEnd = Math.max(lastEventEnd, br.at + br.dur);
    }

    // MYTHIC's choir -- NINTH-pass rebuild. The eighth pass built every
    // voice from pure sine/triangle oscillators straight to the bus, which
    // is the textbook synthesized-bell recipe (soft attack + the purest
    // waveforms available). Now every chord tone runs a SAWTOOTH (real
    // harmonic content) alongside the triangle, both through their OWN
    // lowpass filter that slowly opens across the swell -- the standard
    // warm analog-pad/choir-patch technique -- on top of the existing
    // two-voice detune + vibrato thickness.
    for (const ch of score.choirs ?? []) {
      const g = ctx.createGain();
      const sustainEnd = ch.at + ch.dur * 0.7;
      g.gain.setValueAtTime(0.0001, now0 + ch.at);
      g.gain.exponentialRampToValueAtTime(ch.lvl, now0 + ch.at + ch.dur * 0.3);
      g.gain.setValueAtTime(ch.lvl, now0 + sustainEnd);
      g.gain.exponentialRampToValueAtTime(0.0001, now0 + ch.at + ch.dur);
      g.connect(duckBus);

      ch.freqs.forEach((f) => {
        for (const wave of ["sawtooth", "triangle"] as OscillatorType[]) {
          for (const det of [-6, 6]) {
            const filt = ctx.createBiquadFilter();
            filt.type = "lowpass";
            filt.Q.value = 0.7;
            filt.frequency.setValueAtTime(ch.filterStart, now0 + ch.at);
            filt.frequency.exponentialRampToValueAtTime(Math.max(200, ch.filterEnd), now0 + ch.at + ch.dur * 0.6);

            const osc = ctx.createOscillator();
            osc.type = wave;
            osc.frequency.value = f;
            osc.detune.value = det;

            const lfo = ctx.createOscillator();
            lfo.type = "sine";
            lfo.frequency.value = ch.vibratoRate;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = ch.vibratoDepthCents;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.detune);

            osc.connect(filt);
            filt.connect(g);
            osc.start(now0 + ch.at);
            osc.stop(now0 + ch.at + ch.dur + 0.05);
            lfo.start(now0 + ch.at);
            lfo.stop(now0 + ch.at + ch.dur + 0.05);
          }
        }
      });
      lastEventEnd = Math.max(lastEventEnd, ch.at + ch.dur);
    }

    // Master hold spans however long the composition is actually sounding
    // (voices AND noise hits), then eases out through the reverb tail to
    // `total`.
    master.gain.setValueAtTime(score.peak, now0 + lastEventEnd * 0.9);
    master.gain.exponentialRampToValueAtTime(0.0001, now0 + score.total);

    const teardown = () => {
      ctx.close().catch(() => {});
    };
    window.setTimeout(teardown, (score.total + 0.6) * 1000);

    // Idempotent -- closing an already-closed context just rejects the
    // promise, which is swallowed the same way `teardown` above swallows it.
    return () => {
      try {
        ctx.close().catch(() => {});
      } catch {
        /* already closed */
      }
    };
  } catch {
    /* audio is a garnish -- never let it break the reveal */
    return () => {};
  }
}

// Real produced audio, per tier (2026-07-28, pass 10). Nine passes of
// procedurally synthesizing EDM from raw oscillators, blind (this system has
// no way to actually hear its own output -- every prior pass was verified
// structurally, never by ear), landed short of "authentic, engaging, real
// EDM" on 3 of 4 tiers even after real production techniques (sidechain,
// supersaw, FM growl, bitcrush, gated plucks, choir/braam synthesis) were
// genuinely implemented. That's a signal about the ceiling of blind
// procedural synthesis, not a parameter to keep tuning. This is the fix:
// real finished audio files replace the synthesized chime as the primary
// path, with `playUnlockChime` (above) kept as an automatic fallback for any
// tier whose file hasn't been supplied yet -- so nothing breaks and nothing
// goes silent while tracks are being sourced/generated one at a time.
//
// Drop a file at `/public/audio/badge-unlock/<tier>.mp3` (lowercase) for
// each tier to activate it -- BASE/SUPER/LEGENDARY/MYTHIC. No code change
// needed per file; this just tries to load+play it and silently falls back
// to the synth chime on a 404/decode error.
const AUDIO_FILE_BY_TIER: Record<string, string> = {
  BASE: "/audio/badge-unlock/base.mp3",
  SUPER: "/audio/badge-unlock/super.mp3",
  LEGENDARY: "/audio/badge-unlock/legendary.mp3",
  MYTHIC: "/audio/badge-unlock/mythic.mp3",
};

// Sourced tracks are now purpose-picked short cuts (58-73s natively), not
// trimmed-down 2-5 minute stock tracks -- so these caps are a safety ceiling
// above each real track's own length, not a forced trim. In normal operation
// the track ends naturally via the `ended` event well before hitting its cap;
// this only kicks in as a guard if a longer file ever gets dropped in later.
const AUDIO_MAX_PLAY_MS: Record<string, number> = {
  BASE: 70000, // Energetic Upbeat Future Bass Version 2 (~60s)
  SUPER: 65000, // Dubstep Version 2 (~60s)
  LEGENDARY: 80000, // Digital Technology (~73s)
  MYTHIC: 65000, // Epic (Orchestral, ~58s)
};
const AUDIO_FADE_MS = 900;

// Returns a stop function so a "Skip" action can kill whatever's actually
// sounding right now -- the real file, or (if it 404'd/failed to decode and
// fell back mid-flight) the synthesized chime -- instantly, rather than
// letting either one's own fade/teardown timer run out on its own schedule.
function playUnlockAudio(tier: string): () => void {
  let stopped = false;
  let activeStop: () => void = () => {};
  let fadeTimeoutId: number | null = null;
  let fadeIntervalId: number | null = null;

  const stop = () => {
    if (stopped) return; // idempotent: Escape + Skip click racing is fine
    stopped = true;
    if (fadeTimeoutId !== null) window.clearTimeout(fadeTimeoutId);
    if (fadeIntervalId !== null) window.clearInterval(fadeIntervalId);
    activeStop();
  };

  try {
    const src = AUDIO_FILE_BY_TIER[tier] ?? AUDIO_FILE_BY_TIER.BASE;
    const el = new Audio(src);
    el.preload = "auto";
    const targetVolume = 0.85;
    el.volume = targetVolume;
    activeStop = () => {
      try {
        el.pause();
      } catch {
        /* element already gone */
      }
    };

    let fellBack = false;
    const fallback = () => {
      if (fellBack || stopped) return;
      fellBack = true;
      // playUnlockChime starts a brand-new AudioContext right away, so only
      // kick it off if we haven't already been told to stop in the meantime
      // (e.g. the 404 and a Skip click landing in the same tick).
      activeStop = playUnlockChime(tier);
    };

    // No real file at this path yet (404) or the browser can't decode it --
    // fall back to the synthesized chime rather than playing nothing.
    el.addEventListener("error", fallback, { once: true });

    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(fallback);
    }

    // Fade out and stop after the cap, regardless of how long the real
    // source file actually is -- keeps every tier's unlock moment roughly
    // as long as its old synthesized counterpart was, without needing the
    // source file pre-trimmed.
    const maxMs = AUDIO_MAX_PLAY_MS[tier] ?? AUDIO_MAX_PLAY_MS.BASE;
    const fadeStartMs = Math.max(0, maxMs - AUDIO_FADE_MS);
    fadeTimeoutId = window.setTimeout(() => {
      if (stopped || el.paused || el.ended) return;
      const fadeStartedAt = performance.now();
      fadeIntervalId = window.setInterval(() => {
        const elapsed = performance.now() - fadeStartedAt;
        const remaining = Math.max(0, 1 - elapsed / AUDIO_FADE_MS);
        el.volume = targetVolume * remaining;
        if (remaining <= 0) {
          if (fadeIntervalId !== null) window.clearInterval(fadeIntervalId);
          el.pause();
        }
      }, 40);
    }, fadeStartMs);
  } catch {
    activeStop = playUnlockChime(tier);
  }

  return stop;
}
// #endregion unlock-chime

// --- MAIN MODAL COMPONENT ---

export function BadgeInspectionModal({ badge, config, onClose, enableSound = true }: BadgeInspectionModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Portal-mount to document.body (2026-07-25 fix): AppShell's nav header and
  // its dropdowns live in their own stacking contexts (z-[120]/z-[140]) that
  // are siblings of this modal's actual DOM ancestor, not descendants of it.
  // A high z-index alone (z-[9999]) can't escape a parent's stacking context,
  // so the header was rendering on top of this modal in production even
  // though this component's own z-index is far larger. Portaling to <body>
  // makes this modal a true top-level sibling of the header, which fixes it
  // for good instead of an endless z-index arms race.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // --- WebGL single-context discipline (2026-07-27 crash fix) --------------
  // The Canvas is torn down the instant a close is requested, BEFORE any
  // parent-owned exit transition has had a chance to run. Without this, a
  // consumer that keeps this modal mounted for a 300ms fade-out (which is
  // exactly what the outer AnimatePresence pattern encourages) could have the
  // outgoing Canvas and a freshly-opened one alive at the same time -- two
  // heavy WebGL contexts competing for the same GPU budget. Nothing here relies
  // on the parent unmounting us promptly.
  const [canvasLive, setCanvasLive] = useState(true);
  const closingRef = useRef(false);
  // Holds whatever `playUnlockAudio` handed back -- real <audio> element or
  // synth-fallback AudioContext, it doesn't matter which, `stop()` kills
  // either instantly. Skipping (X / Escape) must never leave the unlock
  // track playing on into the rest of the app.
  const stopAudioRef = useRef<() => void>(() => {});
  const handleClose = React.useCallback(() => {
    if (closingRef.current) return; // idempotent: double-Esc / click spam
    closingRef.current = true;
    stopAudioRef.current();
    setCanvasLive(false);
    onClose();
  }, [onClose]);

  // Escape-to-close, and lock background scroll while open -- neither existed
  // before, so the only way to dismiss was the small close button (easy to
  // miss, and now doubly important since the click-through bug is fixed).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleClose]);

  // Unlock chime -- fires exactly ONCE per mount. The ref guard means a
  // re-render (mouse move, spring tick, parent state change) can never retrigger
  // it, and the empty dep array means a prop change cannot either.
  const chimedRef = useRef(false);
  useEffect(() => {
    if (!enableSound || chimedRef.current) return;
    chimedRef.current = true;
    stopAudioRef.current = playUnlockAudio(badge?.tier ?? "BASE");
    // Deliberately NO cleanup return here. This effect fires exactly once
    // per mount by design (the chimedRef guard is what makes that true even
    // under React 18/19 Strict Mode's dev-only double-invoke, which runs
    // setup -> cleanup -> setup back to back on first mount). A cleanup
    // function would fire on that synthetic first cleanup too, stopping the
    // audio a few ms after it started -- and since chimedRef is already
    // true by then, the second setup bails out without restarting it, so
    // sound would never actually play in dev. handleClose (Skip button +
    // Escape) is the only intended way to stop this audio early; that's a
    // real, deliberate user action, not an effect cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // High-performance Framer Motion Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 100, mass: 1.5 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const rx = useTransform(smoothY, [-0.5, 0.5], [30, -30]);
  const ry = useTransform(smoothX, [-0.5, 0.5], [-30, 30]);

  const glareX = useTransform(smoothX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(smoothY, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.6) 0%, transparent 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const tier = badge.tier;
  const isLegendary = tier === "LEGENDARY";
  // MYTHIC: new ceiling tier added by the 2026-07-27 reference batch. No badge
  // in the DB carries it today, so every branch below that keys off `isMythic`
  // is dead code for existing badges -- nothing shipped changes.
  const isMythic = tier === "MYTHIC";
  // Opt-in, per-badge treatments. Both are config-driven rather than
  // tier-driven on purpose: gating either on the tier alone would silently
  // restyle every other badge that shares that tier.
  const hasRevealPulse = config.revealPulse === true;   // short SUPER-tier shake
  const hasLetterbox = config.letterbox === true;       // 15vh cinematic crop
  const Icon = (IconMap[badge.iconName] || Target) as any;
  const primaryColor = config.burst[0] || "#ffffff";

  const getShapeStyles = (iconName: string) => {
    const shapes: Record<string, { clipPath: string, w: string, h: string }> = {
      "Target": { clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Focus": { clipPath: "polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Scan": { clipPath: "polygon(50% 0%, 65% 25%, 100% 25%, 75% 50%, 85% 90%, 50% 70%, 15% 90%, 25% 50%, 0% 25%, 35% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Zap": { clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "FastForward": { clipPath: "polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Rocket": { clipPath: "polygon(50% 0%, 100% 40%, 80% 100%, 50% 80%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Medal": { clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Flag": { clipPath: "polygon(0% 0%, 100% 0%, 80% 50%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Crown": { clipPath: "polygon(0% 0%, 25% 30%, 50% 0%, 75% 30%, 100% 0%, 90% 100%, 10% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Flame": { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Activity": { clipPath: "polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Infinity": { clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Clock": { clipPath: "polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Sun": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "AlarmClock": { clipPath: "polygon(30% 0%, 70% 0%, 100% 20%, 100% 80%, 70% 100%, 30% 100%, 0% 80%, 0% 20%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "TrendingUp": { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ArrowUpRight": { clipPath: "polygon(50% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ChevronsUp": { clipPath: "polygon(50% 0%, 100% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Trophy": { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Star": { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Sparkles": { clipPath: "polygon(50% 0%, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0% 50%, 45% 45%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Crosshair": { clipPath: "polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Aperture": { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Radar": { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Shield": { clipPath: "polygon(0% 10%, 100% 10%, 100% 60%, 50% 100%, 0% 60%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Anchor": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Mountain": { clipPath: "polygon(50% 0%, 100% 20%, 90% 80%, 50% 100%, 10% 80%, 0% 20%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Brain": { clipPath: "polygon(20% 20%, 80% 20%, 100% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Lightbulb": { clipPath: "polygon(30% 0%, 70% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Library": { clipPath: "polygon(0% 0%, 100% 0%, 90% 50%, 100% 100%, 0% 100%, 10% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },

      // --- Reference batch (2026-07-27), new keys only ---------------------
      // Forward-raked crystal shard -- leans into the direction of travel.
      "SpeedComet": { clipPath: "polygon(52% 0%, 90% 20%, 100% 60%, 60% 100%, 16% 90%, 0% 42%)", w: "w-52 md:w-64", h: "h-56 md:h-72" },
      // Brilliant-cut gem: crown, girdle, pavilion point.
      "PerfectionistGem": { clipPath: "polygon(50% 0%, 82% 20%, 100% 40%, 50% 100%, 0% 40%, 18% 20%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      // Same gem, fractured crown -- reads as the broken-open version of it.
      "PerfectionistGemMythic": { clipPath: "polygon(50% 0%, 66% 13%, 84% 5%, 91% 28%, 100% 44%, 68% 76%, 50% 100%, 32% 76%, 0% 44%, 9% 28%, 16% 5%, 34% 13%)", w: "w-56 md:w-72", h: "h-60 md:h-80" },
      // Stepped ziggurat -- architectural, deliberately unlike any skill badge.
      "LevelMonument": { clipPath: "polygon(38% 0%, 62% 0%, 62% 18%, 78% 18%, 78% 42%, 92% 42%, 92% 68%, 100% 68%, 100% 100%, 0% 100%, 0% 68%, 8% 68%, 8% 42%, 22% 42%, 22% 18%, 38% 18%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      // Wide horizontal chevron -- the only landscape silhouette of the five,
      // which is what lets it survive the 15vh letterbox crop.
      "StreakChainLegendary": { clipPath: "polygon(14% 0%, 100% 0%, 86% 50%, 100% 100%, 14% 100%, 0% 50%)", w: "w-64 md:w-80", h: "h-40 md:h-52" }
    };
    return shapes[iconName] || shapes["Target"];
  };
  const shape = getShapeStyles(badge.iconName);

  // Kinetic Typography Animation (Fixed word wrapping)
  const containerVars: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.8 }
    }
  };
  const letterVars: Variants = {
    hidden: { opacity: 0, x: -20, filter: "blur(10px)" },
    visible: {
      opacity: 1,
      x: 0,
      filter: "blur(0px)",
      transition: { type: "spring", damping: 12, stiffness: 200 }
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-transparent overflow-hidden"
      >

        {/* TRUE 3D R3F CANVAS BACKGROUND
            `canvasLive` gates the entire WebGL layer: on close it flips false
            synchronously, so the context is disposed before any exit fade
            begins rather than 300ms into it. `dpr` is capped because on a 2x/3x
            display the mipmap Bloom pass was allocating render targets 4-9x
            larger than needed, which is what turned a context-limit warning
            into a wedged tab. */}
        {canvasLive && (
          <div className="absolute inset-0 z-0 pointer-events-none">
             <Canvas
                camera={{ position: [0, 0, 30], fov: 45 }}
                dpr={[1, 1.75]}
                gl={{ antialias: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
             >
                <BadgeEnvironment3D iconName={badge.iconName} tier={tier} colorHex={primaryColor} />
             </Canvas>
          </div>
        )}

        {/* Cinematic letterbox -- OPT-IN PER BADGE, never per tier.
            Gated on config.letterbox so it applies only to the one badge whose
            config sets it. Making this blanket LEGENDARY behaviour would
            re-crop every existing LEGENDARY cinematic, which is a regression. */}
        {hasLetterbox && (
          <>
            <motion.div
              initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-0 w-full h-[15vh] bg-black z-30 shadow-[0_20px_50px_rgba(0,0,0,1)] pointer-events-none"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-0 w-full h-[15vh] bg-black z-30 shadow-[0_-20px_50px_rgba(0,0,0,1)] pointer-events-none"
            />
          </>
        )}

        {/* Dynamic Screen Shake, scaled by rarity.
            MYTHIC > LEGENDARY > opt-in SUPER pulse > (unchanged) everything
            else. The final branch is byte-for-byte the previous behaviour, so
            badges that are neither apex-tier nor flagged do not move. */}
        <motion.div
          initial={{ x: 0, y: 0, scale: 1.05 }}
          animate={
            isMythic
              ? { x: [-20, 18, -14, 11, -7, 4, 0], y: [16, -18, 12, -9, 5, -3, 0], scale: 1 }
              : isLegendary
                ? { x: [-10, 10, -5, 5, -2, 2, 0], y: [-10, 10, -5, 5, -2, 2, 0], scale: 1 }
                : hasRevealPulse
                  ? { x: [0, -6, 5, -2, 0], y: [0, 5, -4, 1, 0], scale: 1 }
                  : { scale: 1 }
          }
          transition={
            isMythic
              ? { duration: 1.5, ease: "easeOut", scale: { duration: 2.4, ease: "circOut" } }
              : isLegendary
                ? { duration: 1, ease: "easeOut", scale: { duration: 2, ease: "circOut" } }
                : hasRevealPulse
                  ? { duration: 0.3, ease: "easeOut", scale: { duration: 1.4, ease: "circOut" } }
                  : { duration: 1 }
          }
          className="absolute inset-0 z-[1] pointer-events-none"
        >
          {/* Heavy Vignette Mask for Text Legibility (Crucial for AAA polish) */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.8)_100%)]" />
          <div className="absolute bottom-0 w-full h-[40vh] pointer-events-none bg-gradient-to-t from-slate-950 to-transparent" />
        </motion.div>

        {/* 3D Interactive Badge Container */}
        <motion.div
           initial={{ scale: 0.2, y: 200, rotateY: -180 }}
           animate={{ scale: 1, y: 0, rotateY: 0 }}
           transition={{ type: "spring", bounce: 0.3, duration: 1.5 }} // Heavy mass
           className="relative z-10 [perspective:2000px] flex flex-col items-center justify-center mb-8"
        >
           <motion.div
             ref={cardRef}
             onMouseMove={handleMouseMove}
             onMouseLeave={handleMouseLeave}
             className="relative flex items-center justify-center cursor-pointer transition-transform duration-100 ease-out transform-gpu"
             style={{
                rotateX: rx,
                rotateY: ry,
                // MYTHIC-ONLY change (2026-07-27): its bloomColor is full-alpha
                // (rgba(217,119,6,1)), and a 60px-down / 80px-blur drop-shadow
                // of a fully opaque colour bleeds ~140px below the card --
                // straight through the title. Tightened for MYTHIC only; every
                // other tier keeps the original 60/80 values exactly.
                filter: isMythic
                  ? `drop-shadow(0 16px 44px ${config.bloomColor}) drop-shadow(0 20px 40px rgba(0,0,0,0.85))`
                  : `drop-shadow(0 60px 80px ${config.bloomColor}) drop-shadow(0 20px 40px rgba(0,0,0,0.8))`
             }}
           >
              {/* Giant Clipped Polygon (Frosted Glass simulation) */}
              <div
                className={`relative flex items-center justify-center ${shape.w} ${shape.h} shadow-[inset_0_10px_20px_rgba(255,255,255,0.4)] backdrop-blur-md`}
                style={{ clipPath: shape.clipPath, background: config.customBg || config.unlockedBg }}
              >
                 <Icon size={120} style={{ color: config.iconColorHex }} className={`drop-shadow-2xl z-20 relative ${config.glitch ? 'animate-pulse' : ''}`} />

                 {/* Internal AAA Glare tracking mouse */}
                 <motion.div
                    className="absolute inset-0 pointer-events-none z-30 mix-blend-overlay"
                    style={{ background: glareBackground }}
                  />
              </div>

              {/* Legendary Conic Ring Wrapper inside the 3D card */}
              {isLegendary && (
                 <div className="absolute inset-[-60%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(255,255,255,0.5)_360deg)] z-[-1] rounded-full pointer-events-none mix-blend-color-dodge blur-[4px]" />
              )}

              {/* MYTHIC halo: two counter-rotating conic sweeps at different
                  speeds, one iridescent and one white-hot. Reads as a prism
                  turning rather than a single spotlight, which is what
                  separates it from the LEGENDARY ring above. */}
              {isMythic && (
                 // 2026-07-27 legibility fix: these two color-dodge conic sweeps
                 // used to run at FULL opacity forever, while every other
                 // element in the scene settles. Blurred + dodged at inset
                 // -85% they reach far past the card and were the single
                 // biggest source of the persistent pink/orange wash behind the
                 // title. They now bloom to full on the reveal and then settle
                 // to a low, sustained ~22% -- still clearly a turning prism,
                 // no longer a light source aimed at the copy.
                 <motion.div
                    className="absolute inset-0 z-[-1] pointer-events-none"
                    initial={{ opacity: 0.85 }}
                    animate={{ opacity: [0.85, 1, 0.22] }}
                    transition={{ duration: 4.4, times: [0, 0.34, 1], ease: "easeOut" }}
                 >
                   {/* 2026-07-27 craft pass: this sweep used to be gold ->
                       violet -> pink, i.e. the SUPER palette again. It is now
                       the full opal spectrum, so the halo is literally the
                       badge's identity turning rather than a second badge's
                       colours borrowed for the ceiling tier. */}
                   <div className="absolute inset-[-85%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_40deg,rgba(95,251,241,0.5)_95deg,rgba(124,255,158,0.5)_150deg,rgba(255,209,102,0.5)_205deg,rgba(255,123,213,0.55)_260deg,rgba(142,162,255,0.5)_315deg,transparent_360deg)] rounded-full pointer-events-none mix-blend-color-dodge blur-[6px]" />
                   <div className="absolute inset-[-55%] animate-[spin_7s_linear_infinite_reverse] bg-[conic-gradient(from_180deg,transparent_0_200deg,rgba(234,246,255,0.75)_360deg)] rounded-full pointer-events-none mix-blend-color-dodge blur-[3px]" />
                 </motion.div>
              )}
           </motion.div>
        </motion.div>

        {/* Floating Text Info (Kinetic Typography with Word Wrapping Fix) */}
        <motion.div
           initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
           animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
           transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
           className="relative z-10 text-center max-w-5xl px-4 flex flex-col items-center"
        >
            {/* ============================================================
                TEXT LEGIBILITY BACKPLATE (2026-07-27)
                ------------------------------------------------------------
                The pre-existing scrim was a soft full-screen radial vignette
                plus a bottom gradient. Both are *relative* darkeners: they
                subtract a fixed amount of light, so against a bright enough
                scene (Perfectionist MYTHIC's dodge halos, Unstoppable Streak's
                white-hot comet heads passing directly behind the title) the
                copy still lost contrast.

                This is an *absolute* surface instead. It is sized to the text
                block's own footprint -- it is a child of the text container, so
                it tracks the real content box at every breakpoint rather than
                guessing a vh height -- and it is near-opaque (0.96) through the
                middle where the glyphs actually sit, feathering to nothing at
                the edges so it never reads as a rectangle pasted on the scene.

                Deliberately NOT backdrop-blur: a full-frame backdrop-filter
                over a live WebGL canvas costs a composite pass every frame, and
                this batch is simultaneously fixing a frame-budget crash.
                ============================================================ */}
            <div
               aria-hidden
               className="pointer-events-none absolute -left-[12%] -right-[12%] -top-12 -bottom-14 -z-10 blur-[36px] bg-[radial-gradient(ellipse_at_center,rgba(2,6,23,0.97)_0%,rgba(2,6,23,0.95)_38%,rgba(2,6,23,0.74)_62%,rgba(2,6,23,0.32)_82%,transparent_100%)]"
            />
            {/* A second, tighter plate directly under the headline only. The
                title is the largest, thinnest-stroked type on screen and is the
                element the comet chain passes behind, so it gets its own
                guarantee on top of the block-level plate above. */}
            <div
               aria-hidden
               className="pointer-events-none absolute -left-[8%] -right-[8%] -top-8 h-[52%] -z-10 blur-[28px] bg-[radial-gradient(ellipse_at_center,rgba(2,6,23,0.94)_0%,rgba(2,6,23,0.82)_46%,rgba(2,6,23,0.42)_74%,transparent_100%)]"
            />

            <motion.h1
               variants={containerVars}
               initial="hidden"
               animate="visible"
               className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black italic uppercase text-white mb-4 tracking-tighter flex flex-wrap justify-center gap-x-4 md:gap-x-6"
               style={{ textShadow: "0 2px 6px rgba(0,0,0,0.95), 0 5px 20px rgba(0,0,0,0.9), 0 0 40px rgba(255,255,255,0.2)" }}
            >
               {badge.name.split(' ').map((word: string, wordIndex: number) => (
                 <span key={wordIndex} className="inline-block whitespace-nowrap">
                   {word.split('').map((char: string, charIndex: number) => (
                     <motion.span key={charIndex} variants={letterVars} className="inline-block">
                       {char}
                     </motion.span>
                   ))}
                 </span>
               ))}
            </motion.h1>

            <motion.p 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1.5, duration: 1 }}
               className="text-lg md:text-2xl text-slate-100 [text-shadow:0_2px_4px_rgba(0,0,0,1),0_0_18px_rgba(2,6,23,0.95)] font-medium leading-relaxed max-w-3xl mx-auto"
            >
               {badge.description}
            </motion.p>
            
            <motion.div 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 1.8, type: "spring" }}
               className="mt-8 flex items-center justify-center space-x-3"
            >
               {/* MYTHIC gets its own pill: gradient fill + animated glow, so
                   it out-ranks the flat LEGENDARY gold at a glance. Re-graded
                   to the opal spectrum (2026-07-27 craft pass) -- it used to
                   be amber/fuchsia/violet, which was the SUPER palette. */}
               <span className={`px-5 py-2 rounded-full text-sm md:text-base font-black uppercase tracking-[0.2em] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border ${tier === 'MYTHIC' ? 'text-cyan-50 border-white/70 bg-gradient-to-r from-cyan-300/30 via-amber-200/30 to-pink-300/30 shadow-[0_0_30px_rgba(120,220,255,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] animate-pulse' : tier === 'LEGENDARY' ? 'bg-slate-900/80 text-yellow-400 border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.2)]' : tier === 'SUPER' ? 'bg-slate-900/80 text-indigo-400 border-indigo-400/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-slate-900/80 text-slate-300 border-slate-500/50'}`}>
                 {tier} TIER
               </span>
               <span className="px-5 py-2 rounded-full text-sm md:text-base font-black text-emerald-400 uppercase tracking-[0.2em] bg-emerald-950/80 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_15px_rgba(16,185,129,0.2)] border border-emerald-500/50">
                 UNLOCKED
               </span>
            </motion.div>
        </motion.div>

        {/* Skip Button -- the only two exit paths from this cutscene (this
            button and Escape) both go through handleClose, so audio-stop
            behavior can never drift between them. Explicitly labeled "Skip"
            (2026-07-28) rather than a bare icon-only X: a student mid-
            animation needs to immediately recognize they *can* skip it, not
            infer that from a small corner glyph. Available the entire time
            the cutscene is on screen -- pressing it at any point, including
            before the entrance animation finishes, exits right away and
            kills the unlock track instantly (see stopAudioRef). Leaving it
            alone lets the full cutscene and full track play out untouched. */}
        <button
           onClick={handleClose}
           aria-label="Skip unlock animation"
           className="absolute top-8 right-8 z-50 flex items-center gap-2 text-slate-300 hover:text-white bg-slate-900/50 hover:bg-slate-800 rounded-full pl-5 pr-4 py-3 transition-all duration-300 backdrop-blur-md border border-slate-700/50 hover:border-slate-500 hover:scale-105 active:scale-95"
        >
           <span className="text-sm md:text-base font-black uppercase tracking-[0.2em]">Skip</span>
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
