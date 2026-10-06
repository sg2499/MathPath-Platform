'use client';

import React, { useEffect, useState, useRef, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import {
  Environment,
  Sparkles,
  Stars,
  Float,
  useProgress
} from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
}

// ============================================================================
// COMBINED RIG (Camera + Mesh) - Ensures timeline syncs perfectly with Suspense
// ============================================================================
const CinematicMasterRig = ({ tier }: { tier: string }) => {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Preload the AI Master Asset. Suspense will block rendering until this is ready!
  const texture = useLoader(THREE.TextureLoader, `/assets/ranks/${tier}.png`);

  // VERY IMPORTANT: Set correct color space so the image is perfectly clear and not washed out!
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }, [texture]);

  const uniforms = useMemo(() => ({
    tex: { value: texture },
    opacity: { value: 0.0 } // Start fully transparent to prevent pop-in
  }), [texture]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // --- CAMERA MATHEMATICS ---
    // 0.0s - 1.5s: The Intense Buildup (Rapid Pullback)
    if (t < 1.5) {
      const z = THREE.MathUtils.lerp(1, 15, Math.pow(t / 1.5, 3)); // Cubic ease out
      const fov = THREE.MathUtils.lerp(120, 50, Math.pow(t / 1.5, 2));

      // Absolute deterministic shake (Fixes the extreme stutter/lag)
      let shakeX = 0;
      let shakeY = 0;
      if (t > 1.0) {
         shakeX = (Math.random() - 0.5) * 0.8;
         shakeY = (Math.random() - 0.5) * 0.8;
      }
      camera.position.set(shakeX, shakeY, z);
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
    }
    // 1.5s - 2.5s: The Impact Shake
    else if (t >= 1.5 && t < 2.5) {
      const shake = (2.5 - t) * 1.5;
      camera.position.set(
        Math.sin(t * 50) * shake,
        Math.cos(t * 45) * shake,
        15
      );
      camera.lookAt(0, 0, 0);
    }
    // 2.5s onwards: The God-Tier Cinematic Drift
    else {
      camera.position.lerp(new THREE.Vector3(Math.sin(t * 0.2) * 2, Math.cos(t * 0.1) * 1, 16), 0.01);
      camera.lookAt(0, 0, 0);
    }

    // --- MESH ANIMATION ---
    if (meshRef.current) {
      if (t < 1.5) {
        // Slam into the screen
        const s = THREE.MathUtils.lerp(10, 1, Math.pow(t / 1.5, 4));
        meshRef.current.scale.set(s, s, s);
      } else {
        meshRef.current.scale.set(1, 1, 1);
        meshRef.current.position.y = Math.sin(t * 2) * 0.2;
      }
    }

    // Fade the image opacity perfectly with the timeline to prevent pop-in
    if (materialRef.current) {
      if (t < 0.2) {
        materialRef.current.uniforms.opacity.value = t / 0.2; // Fade in over 200ms
      } else {
        materialRef.current.uniforms.opacity.value = 1.0;
      }
    }
  });

  const getColors = () => {
    switch (tier) {
      case 'COPPER': return { spark: "#ea580c", light: "#f59e0b" };
      case 'BRONZE': return { spark: "#d97706", light: "#b45309" };
      case 'SILVER': return { spark: "#38bdf8", light: "#e0f2fe" };
      case 'GOLD': return { spark: "#facc15", light: "#fef08a" };
      case 'PLATINUM': return { spark: "#d8b4fe", light: "#c084fc" };
      case 'EMERALD': return { spark: "#10b981", light: "#6ee7b7" };
      case 'DIAMOND': return { spark: "#ffffff", light: "#7dd3fc" };
      case 'CHAMPION': return { spark: "#e11d48", light: "#fda4af" };
      default: return { spark: "#ffffff", light: "#ffffff" };
    }
  };
  const colors = getColors();

  return (
    <>
      <ambientLight intensity={1} />
      <pointLight position={[0, 0, 5]} intensity={50} color={colors.light} distance={20} />

      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh ref={meshRef}>
          <planeGeometry args={[12, 12]} />
          {/* Custom GLSL Shader to perfectly key out the black background while keeping shadows/clarity! */}
          <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            transparent={true}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform sampler2D tex;
              uniform float opacity;
              varying vec2 vUv;
              void main() {
                vec4 c = texture2D(tex, vUv);
                // Calculate brightness to isolate pure black background
                float b = max(max(c.r, c.g), c.b);
                // Smoothstep to create a perfect alpha mask without washing out the image
                float a = smoothstep(0.01, 0.15, b);
                gl_FragColor = vec4(c.rgb, a * opacity);
              }
            `}
          />
        </mesh>
      </Float>

      {/* Optimized Physics Systems (Lowered count to fix lag, maintained scale) */}
      <Sparkles count={200} scale={20} size={5} speed={tier === 'CHAMPION' ? 5 : 2} color={colors.spark} opacity={0.8} />
      <Stars radius={10} depth={50} count={500} factor={6} saturation={1} fade speed={tier === 'CHAMPION' ? 5 : 2} />
    </>
  );
};


// ============================================================================
// MAIN SCENE MANAGER
// ============================================================================
const Scene = ({ tier }: { tier: string }) => {
  return (
    <>
      <Environment preset="city" />
      {/* We are removing ChromaticAberration and Noise, and lowering Bloom so the AI asset remains CRYSTAL CLEAR */}
      <EffectComposer multisampling={8}>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={0.5} />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
      </EffectComposer>

      <Suspense fallback={null}>
        <CinematicMasterRig tier={tier} />
      </Suspense>
    </>
  );
};

// ============================================================================
// TYPOGRAPHY / UI OVERLAY (DOM)
// ============================================================================
// The server names a rank with its division ("BRONZE_III"); the artwork,
// colours and title exist once per rank family ("BRONZE"). Callers may pass
// either form. Before this split the result pages handed the full name
// straight through, the picture /assets/ranks/BRONZE_III.png did not exist,
// and a real rank-up crashed the result page instead of playing.
const RANK_FAMILIES = ["COPPER", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "CHAMPION"];

function SplitRankTier(tier: string): { family: string; division: string } {
  const Parts = String(tier || "").trim().toUpperCase().split("_");
  const Family = RANK_FAMILIES.includes(Parts[0]) ? Parts[0] : "COPPER";
  return { family: Family, division: Parts.slice(1).join(" ") };
}

const TypographyOverlay = ({ tier, division }: { tier: string; division: string }) => {
  const [showText, setShowText] = useState(false);
  const { active } = useProgress(); // Waits for suspense to finish!

  useEffect(() => {
    // Only start the 1.5s countdown AFTER all assets are completely loaded
    if (!active) {
      const t = setTimeout(() => setShowText(true), 1500);
      return () => clearTimeout(t);
    }
  }, [active]);

  const getTypography = () => {
    switch (tier) {
      case 'COPPER': return { title: "Copper Forged", className: "text-amber-100", shadow: "0 10px 0 #78350f, 0 20px 40px #f59e0b, 0 0 100px #ea580c" };
      case 'BRONZE': return { title: "Bronze Shield", className: "text-orange-100", shadow: "0 8px 0 #431407, 0 15px 30px #9a3412, 0 0 80px #ea580c" };
      case 'SILVER': return { title: "Silver", className: "text-sky-50 tracking-[0.2em]", shadow: "0 0 20px #bae6fd, 0 0 60px #0284c7, 0 5px 0 #082f49" };
      case 'GOLD': return { title: "Golden Ascent", className: "text-yellow-100", shadow: "0 5px 0 #713f12, 0 20px 40px #ca8a04, 0 0 100px #eab308" };
      case 'PLATINUM': return { title: "Platinum Matrix", className: "text-fuchsia-100 tracking-widest", shadow: "0 0 20px #e879f9, 0 0 60px #9333ea, 0 10px 0 #3b0764" };
      case 'EMERALD': return { title: "Emerald Fractal", className: "text-emerald-50", shadow: "0 8px 0 #022c22, 0 20px 40px #059669, 0 0 80px #10b981" };
      case 'DIAMOND': return { title: "Diamond Core", className: "text-sky-50 tracking-[0.1em]", shadow: "0 0 30px #7dd3fc, 0 0 80px #0284c7, 0 8px 0 #082f49" };
      case 'CHAMPION': return { title: "Champion", className: "text-rose-50 tracking-[0.1em]", shadow: "0 15px 0 #4c0519, 0 30px 60px #881337, 0 0 150px #e11d48", stroke: "3px #fda4af" };
      default: return { title: tier, className: "text-white tracking-widest", shadow: "0 0 20px #ffffff" };
    }
  };

  const typo = getTypography();
  // Longest word of the title: on phones the size follows it (se-rank-title in
  // student-elevate.css), so a word such as "Platinum" never runs off the side.
  const LongestWord = Math.max(...typo.title.split(" ").map((Word) => Word.length));
  // "Bronze III" -- the exact rank reached, under the family title. Absent
  // when the caller passed a family only (the rank roadmap replay).
  const RankLine = division ? `${tier.charAt(0)}${tier.slice(1).toLowerCase()} ${division}` : "";

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50">
      <AnimatePresence>
        {showText && (
          <motion.h1
            initial={{ opacity: 0, scale: 2, filter: "blur(20px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
            className={`se-rank-title text-6xl md:text-8xl lg:text-[10rem] font-black uppercase text-center w-full px-4 ${typo.className}`}
            style={{ textShadow: typo.shadow, WebkitTextStroke: typo.stroke, ["--rank-chars" as string]: LongestWord } as React.CSSProperties}
          >
            {typo.title}
          </motion.h1>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showText && RankLine && (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="se-rank-line mt-4 md:mt-6 px-4 text-center text-xl md:text-3xl font-black tracking-[0.3em] text-white"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.85)" }}
          >
            {RankLine}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// MAIN WRAPPER
// ============================================================================
export function RankCinematicOverlay({ tier: RawTier, onComplete }: RankCinematicOverlayProps) {
  const { family: tier, division } = SplitRankTier(RawTier);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Removed the 8-second auto-close. The overlay will now stay on screen permanently until the user clicks it.
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
        className="fixed inset-0 z-[999999] bg-black pointer-events-auto overflow-hidden"
        onClick={onComplete}
      >
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
            <Scene tier={tier} />
          </Canvas>
        </div>
        <TypographyOverlay tier={tier} division={division} />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 3, duration: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm font-medium tracking-widest uppercase pointer-events-none z-50"
        >
          Click Anywhere To Skip
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
