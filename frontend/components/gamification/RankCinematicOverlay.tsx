'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  Float, 
  Environment, 
  Sparkles, 
  MeshTransmissionMaterial, 
  MeshDistortMaterial, 
  Stars, 
  Html,
  Instance,
  Instances
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
// 3D SCENE COMPONENTS (WebGL)
// ============================================================================

const CopperMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} color="#f59e0b" />
      <pointLight position={[0, 0, 0]} intensity={5} color="#ea580c" distance={10} />
      <Float speed={4} rotationIntensity={2} floatIntensity={2}>
        <mesh ref={meshRef} scale={1.5}>
          <torusGeometry args={[1.5, 0.6, 32, 16]} />
          <meshStandardMaterial 
            color="#78350f" 
            metalness={0.9} 
            roughness={0.2}
            emissive="#451a03"
            emissiveIntensity={0.5}
          />
        </mesh>
      </Float>
      <Sparkles count={200} scale={10} size={4} speed={0.4} color="#fcd34d" />
    </>
  );
};

const BronzeMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 2, 5]} intensity={10} color="#ea580c" distance={20} />
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh ref={meshRef} scale={2}>
          <cylinderGeometry args={[2, 0, 1, 6]} />
          <meshStandardMaterial 
            color="#9a3412" 
            metalness={0.8} 
            roughness={0.3}
            emissive="#431407"
            emissiveIntensity={0.5}
          />
        </mesh>
      </Float>
      <Sparkles count={100} scale={12} size={6} speed={0.2} color="#fdba74" />
    </>
  );
};

const SilverMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 1.5;
      meshRef.current.rotation.x += delta * 0.5;
    }
  });

  return (
    <>
      <ambientLight intensity={1} color="#e0f2fe" />
      <pointLight position={[0, 0, 0]} intensity={20} color="#38bdf8" distance={15} />
      <Float speed={5} rotationIntensity={1} floatIntensity={1}>
        <mesh ref={meshRef} scale={1.5}>
          <octahedronGeometry args={[2, 0]} />
          <meshStandardMaterial 
            color="#bae6fd" 
            metalness={1} 
            roughness={0.05}
          />
        </mesh>
      </Float>
      {/* Speed lines effect using elongated sparkles */}
      <Sparkles count={300} scale={[20, 2, 20]} size={2} speed={2} color="#0ea5e9" opacity={0.5} />
    </>
  );
};

const GoldenMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y -= delta * 0.5;
      meshRef.current.rotation.z += delta * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={1} color="#fef08a" />
      <pointLight position={[0, 0, 0]} intensity={50} color="#eab308" distance={30} />
      <Float speed={2} rotationIntensity={2} floatIntensity={2}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2.5, 2]} />
          <MeshDistortMaterial 
            color="#facc15" 
            emissive="#ca8a04"
            emissiveIntensity={2}
            distort={0.3} 
            speed={2} 
            roughness={0.1}
            metalness={1}
          />
        </mesh>
      </Float>
      <Sparkles count={500} scale={15} size={3} speed={0.5} color="#fef08a" />
    </>
  );
};

const PlatinumMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.4;
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} color="#d8b4fe" />
      <pointLight position={[0, 0, 0]} intensity={30} color="#a855f7" distance={20} />
      <Float speed={3} rotationIntensity={3} floatIntensity={2}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2.5, 0]} />
          <meshStandardMaterial 
            color="#f0abfc" 
            metalness={0.9} 
            roughness={0.1}
            wireframe={true}
            emissive="#c084fc"
            emissiveIntensity={2}
          />
        </mesh>
      </Float>
      <Stars radius={10} depth={50} count={1000} factor={4} saturation={1} fade speed={2} />
    </>
  );
};

const EmeraldMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y -= delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} color="#6ee7b7" />
      <pointLight position={[-5, 5, 5]} intensity={20} color="#10b981" />
      <pointLight position={[5, -5, -5]} intensity={20} color="#059669" />
      <Float speed={2} rotationIntensity={1} floatIntensity={1}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2.5, 0]} />
          <MeshTransmissionMaterial 
            backside
            samples={4}
            thickness={2}
            chromaticAberration={1}
            anisotropy={0.3}
            distortion={0.5}
            distortionScale={0.5}
            temporalDistortion={0.1}
            color="#34d399"
          />
        </mesh>
      </Float>
      <Sparkles count={200} scale={12} size={5} speed={0.3} color="#10b981" />
    </>
  );
};

const DiamondMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <>
      <ambientLight intensity={1} color="#ffffff" />
      <pointLight position={[0, 0, 0]} intensity={40} color="#7dd3fc" distance={20} />
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh ref={meshRef} scale={1.5}>
          <octahedronGeometry args={[2, 0]} />
          <MeshTransmissionMaterial 
            backside
            samples={6}
            thickness={3}
            chromaticAberration={2}
            anisotropy={1}
            clearcoat={1}
            clearcoatRoughness={0.1}
            envMapIntensity={3}
            color="#ffffff"
          />
        </mesh>
      </Float>
      <Stars radius={5} depth={30} count={2000} factor={6} saturation={0} fade speed={3} />
    </>
  );
};

const ChampionMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.1;
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.rotation.z += delta * 0.1;
    }
    if (coreRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.1;
      coreRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} color="#ff0000" />
      <pointLight position={[0, 0, 0]} intensity={100} color="#e11d48" distance={50} />
      <Float speed={5} rotationIntensity={2} floatIntensity={0.5}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[3, 1]} />
          <meshStandardMaterial 
            color="#4c0519" 
            metalness={1} 
            roughness={0.2}
            wireframe={true}
          />
        </mesh>
        <mesh ref={coreRef}>
          <icosahedronGeometry args={[2, 0]} />
          <meshStandardMaterial 
            color="#000000" 
            emissive="#e11d48"
            emissiveIntensity={5}
            metalness={1}
            roughness={0}
          />
        </mesh>
      </Float>
      <Sparkles count={500} scale={20} size={8} speed={3} color="#f43f5e" noise={2} />
    </>
  );
};

// ============================================================================
// MAIN SCENE MANAGER
// ============================================================================
const Scene = ({ tier }: { tier: string }) => {
  // Post-processing configuration based on tier
  const getEffects = () => {
    switch(tier) {
      case 'COPPER':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={2} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        );
      case 'BRONZE':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={1.5} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        );
      case 'SILVER':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={3} />
            <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        );
      case 'GOLD':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={4} />
          </EffectComposer>
        );
      case 'PLATINUM':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={3} />
            <ChromaticAberration offset={new THREE.Vector2(0.005, 0.005)} blendFunction={BlendFunction.NORMAL} />
            <Noise opacity={0.1} />
          </EffectComposer>
        );
      case 'EMERALD':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={2} />
            <ChromaticAberration offset={new THREE.Vector2(0.004, 0.004)} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        );
      case 'DIAMOND':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={5} />
            <ChromaticAberration offset={new THREE.Vector2(0.008, 0.008)} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        );
      case 'CHAMPION':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0} luminanceSmoothing={0.1} intensity={8} />
            <ChromaticAberration offset={new THREE.Vector2(0.015, 0.015)} blendFunction={BlendFunction.NORMAL} />
            <Noise opacity={0.3} />
            <Vignette eskil={false} offset={0.1} darkness={1.5} />
          </EffectComposer>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Environment preset="city" />
      {getEffects()}
      
      {tier === 'COPPER' && <CopperMesh />}
      {tier === 'BRONZE' && <BronzeMesh />}
      {tier === 'SILVER' && <SilverMesh />}
      {tier === 'GOLD' && <GoldenMesh />}
      {tier === 'PLATINUM' && <PlatinumMesh />}
      {tier === 'EMERALD' && <EmeraldMesh />}
      {tier === 'DIAMOND' && <DiamondMesh />}
      {tier === 'CHAMPION' && <ChampionMesh />}
    </>
  );
};

// ============================================================================
// TYPOGRAPHY / UI OVERLAY (DOM)
// ============================================================================
const TypographyOverlay = ({ tier }: { tier: string }) => {
  const getTypography = () => {
    switch (tier) {
      case 'COPPER':
        return {
          title: "COPPER FORGED",
          className: "text-amber-100",
          shadow: "0 10px 0 #78350f, 0 20px 40px #f59e0b, 0 0 100px #ea580c"
        };
      case 'BRONZE':
        return {
          title: "BRONZE SHIELD",
          className: "text-orange-100",
          shadow: "0 8px 0 #431407, 0 15px 30px #9a3412, 0 0 80px #ea580c"
        };
      case 'SILVER':
        return {
          title: "SILVER",
          className: "text-sky-50 tracking-[0.2em]",
          shadow: "0 0 20px #bae6fd, 0 0 60px #0284c7, 0 5px 0 #082f49"
        };
      case 'GOLD':
        return {
          title: "GOLDEN ASCENT",
          className: "text-yellow-100",
          shadow: "0 5px 0 #713f12, 0 20px 40px #ca8a04, 0 0 100px #eab308"
        };
      case 'PLATINUM':
        return {
          title: "PLATINUM MATRIX",
          className: "text-fuchsia-100 tracking-widest",
          shadow: "0 0 20px #e879f9, 0 0 60px #9333ea, 0 10px 0 #3b0764"
        };
      case 'EMERALD':
        return {
          title: "EMERALD FRACTAL",
          className: "text-emerald-50",
          shadow: "0 8px 0 #022c22, 0 20px 40px #059669, 0 0 80px #10b981"
        };
      case 'DIAMOND':
        return {
          title: "DIAMOND CORE",
          className: "text-sky-50 tracking-[0.1em]",
          shadow: "0 0 30px #7dd3fc, 0 0 80px #0284c7, 0 8px 0 #082f49"
        };
      case 'CHAMPION':
        return {
          title: "CHAMPION",
          className: "text-rose-50 tracking-[0.1em]",
          shadow: "0 15px 0 #4c0519, 0 30px 60px #881337, 0 0 150px #e11d48",
          stroke: "3px #fda4af"
        };
      default:
        return { title: "", className: "", shadow: "" };
    }
  };

  const typo = getTypography();

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <motion.h1
        initial={{ opacity: 0, scale: 2, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.5, type: "spring", bounce: 0.5, duration: 1.5 }}
        className={`text-6xl md:text-8xl lg:text-[10rem] font-black uppercase text-center w-full px-4 ${typo.className}`}
        style={{
          textShadow: typo.shadow,
          WebkitTextStroke: typo.stroke
        }}
      >
        {typo.title}
      </motion.h1>
    </div>
  );
};

// ============================================================================
// MAIN WRAPPER
// ============================================================================
export function RankCinematicOverlay({ tier, onComplete }: RankCinematicOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Extreme 3D cinematics deserve an extended view time.
    const timer = setTimeout(() => {
      onComplete();
    }, 8000); 
    return () => {
      setMounted(false);
      clearTimeout(timer);
    };
  }, [onComplete]);

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
        {/* The 3D WebGL Canvas */}
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
            <Scene tier={tier} />
          </Canvas>
        </div>

        {/* The DOM Typography Overlay */}
        <TypographyOverlay tier={tier} />

        {/* Click to skip helper */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 3, duration: 2 }}
          className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm font-medium tracking-widest uppercase pointer-events-none z-50"
        >
          Click anywhere to skip
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
