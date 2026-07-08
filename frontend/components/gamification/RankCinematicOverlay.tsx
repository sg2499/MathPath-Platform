'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Float, 
  Environment, 
  Sparkles, 
  MeshTransmissionMaterial, 
  MeshDistortMaterial, 
  Stars, 
} from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette, Glitch } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
}

// ============================================================================
// CAMERA RIGS & CHOREOGRAPHY
// ============================================================================

const CopperCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    // 0.0 - 1.5s: Buildup. Camera is low and looking up.
    if (t < 1.5) {
      camera.position.lerp(new THREE.Vector3(0, -10, 15), 0.05);
      camera.lookAt(0, 10, 0); // looking up at the falling gear
    } 
    // 1.5 - 2.0s: The Drop Impact & Shake
    else if (t >= 1.5 && t < 2.0) {
      const shakeIntensity = 2.0 - (t - 1.5) * 4; // Fades out over 0.5s
      camera.position.set(
        (Math.random() - 0.5) * shakeIntensity,
        (Math.random() - 0.5) * shakeIntensity,
        10
      );
      camera.lookAt(0, 0, 0);
    } 
    // 2.0s onwards: The Cinematic Orbit
    else {
      const orbitSpeed = 0.5;
      const radius = 12;
      const targetX = Math.sin((t - 2.0) * orbitSpeed) * radius;
      const targetZ = Math.cos((t - 2.0) * orbitSpeed) * radius;
      camera.position.lerp(new THREE.Vector3(targetX, 0, targetZ), 0.05);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};

const ChampionCameraRig = () => {
  const { camera } = useThree();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    // 0.0 - 1.5s: Intense buildup. Camera starts INSIDE the geometry and rapidly pulls out.
    if (t < 1.5) {
      const z = THREE.MathUtils.lerp(1, 25, Math.pow(t / 1.5, 3)); // Cubic ease out
      camera.position.set(0, 0, z);
      (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(100, 45, t / 1.5);
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      
      // Intense violent vibration during pullback
      if (t > 1.0) {
         camera.position.x += (Math.random() - 0.5) * 0.5;
         camera.position.y += (Math.random() - 0.5) * 0.5;
      }
      camera.lookAt(0, 0, 0);
    } 
    // 1.5 - 2.5s: Void Explosion & Screen Shake
    else if (t >= 1.5 && t < 2.5) {
      const shake = (2.5 - t) * 1.5;
      camera.position.set(
        Math.sin(t * 50) * shake,
        Math.cos(t * 45) * shake,
        25
      );
      camera.lookAt(0, 0, 0);
    } 
    // 2.5s onwards: Slow dramatic drift
    else {
      camera.position.lerp(new THREE.Vector3(0, 2, 28), 0.01);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
};


// ============================================================================
// 3D SCENE MESHES (WebGL)
// ============================================================================

const CopperMesh = () => {
  const gearRef = useRef<THREE.Group>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (gearRef.current) {
      // Gear falls from above
      if (t < 1.5) {
        gearRef.current.position.y = 30 - Math.pow(t / 1.5, 3) * 30; // Accel downward
        gearRef.current.rotation.x = t * 5;
        gearRef.current.rotation.z = t * 2;
      } else {
        gearRef.current.position.y = 0;
        // Slow metallic drift after impact
        gearRef.current.rotation.x += 0.005;
        gearRef.current.rotation.y += 0.01;
      }
    }
    if (shockwaveRef.current) {
      if (t > 1.5 && t < 2.5) {
        shockwaveRef.current.scale.setScalar(1 + (t - 1.5) * 20);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = 1.0 - (t - 1.5);
      } else {
        shockwaveRef.current.scale.setScalar(0);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  });

  return (
    <>
      <CopperCameraRig />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} color="#f59e0b" />
      <pointLight position={[0, -5, 0]} intensity={10} color="#ea580c" distance={20} />
      
      <group ref={gearRef}>
        <mesh scale={2.5}>
          <torusGeometry args={[1.5, 0.6, 32, 16]} />
          <meshStandardMaterial 
            color="#78350f" 
            metalness={0.9} 
            roughness={0.2}
            emissive="#451a03"
            emissiveIntensity={0.5}
          />
        </mesh>
        <mesh scale={2.5} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[1.4, 1.4, 1.2, 8]} />
          <meshStandardMaterial 
            color="#451a03" 
            metalness={0.9} 
            roughness={0.4}
            wireframe
          />
        </mesh>
      </group>

      {/* Shockwave Ring */}
      <mesh ref={shockwaveRef} rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[1, 0.1, 16, 64]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>

      <Sparkles count={500} scale={20} size={6} speed={2} color="#fcd34d" opacity={0.8} />
    </>
  );
};

const ChampionMesh = () => {
  const monolithRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (monolithRef.current) {
      monolithRef.current.rotation.y = t * 0.2;
      monolithRef.current.rotation.z = Math.sin(t * 0.5) * 0.2;
    }
    
    // Core throbs violently
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 15) * 0.15;
      coreRef.current.scale.setScalar(pulse);
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 5 + Math.sin(t * 20) * 5;
    }

    // Outer shell shatters/expands after 1.5s
    if (shellRef.current) {
      if (t > 1.5) {
        const expansion = 1 + Math.min((t - 1.5) * 0.5, 1);
        shellRef.current.scale.setScalar(expansion);
        shellRef.current.rotation.x += 0.05;
        shellRef.current.rotation.y -= 0.03;
      }
    }
  });

  return (
    <>
      <ChampionCameraRig />
      <ambientLight intensity={0.1} color="#ff0000" />
      <pointLight position={[0, 0, 0]} intensity={100} color="#e11d48" distance={50} />
      
      <group ref={monolithRef}>
        {/* Core Energy */}
        <mesh ref={coreRef} scale={1.5}>
          <icosahedronGeometry args={[2, 2]} />
          <MeshDistortMaterial 
            color="#000000" 
            emissive="#e11d48"
            emissiveIntensity={10}
            metalness={1}
            roughness={0}
            distort={0.4}
            speed={10}
          />
        </mesh>
        
        {/* Shattered Outer Shell */}
        <mesh ref={shellRef} scale={2}>
          <icosahedronGeometry args={[2.5, 1]} />
          <meshStandardMaterial 
            color="#1a0000" 
            metalness={0.9} 
            roughness={0.1}
            wireframe={true}
            emissive="#4c0519"
            emissiveIntensity={1}
          />
        </mesh>
      </group>

      <Stars radius={50} depth={50} count={3000} factor={10} saturation={1} fade speed={5} />
      {/* Violent red space dust */}
      <Sparkles count={1000} scale={40} size={10} speed={4} color="#f43f5e" noise={5} />
    </>
  );
};


// Fallbacks for other ranks to maintain operability while proving PoC
const FallbackMesh = ({ color, name }: { color: string, name: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (meshRef.current) { meshRef.current.rotation.y += delta; }
  });
  return (
    <>
      <ambientLight intensity={1} color={color} />
      <mesh ref={meshRef} scale={2}>
        <octahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
      </mesh>
    </>
  );
};


// ============================================================================
// MAIN SCENE MANAGER
// ============================================================================
const Scene = ({ tier }: { tier: string }) => {
  const getEffects = () => {
    switch(tier) {
      case 'COPPER':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={2} />
            <Vignette eskil={false} offset={0.1} darkness={1.3} />
          </EffectComposer>
        );
      case 'CHAMPION':
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0} luminanceSmoothing={0.1} intensity={5} />
            <ChromaticAberration offset={new THREE.Vector2(0.015, 0.015)} blendFunction={BlendFunction.NORMAL} />
            <Noise opacity={0.4} />
            <Vignette eskil={false} offset={0.1} darkness={1.5} />
          </EffectComposer>
        );
      default:
        return (
          <EffectComposer>
            <Bloom luminanceThreshold={0.5} intensity={1} />
          </EffectComposer>
        );
    }
  };

  return (
    <>
      <Environment preset="city" />
      {getEffects()}
      
      {tier === 'COPPER' ? <CopperMesh /> :
       tier === 'CHAMPION' ? <ChampionMesh /> :
       tier === 'BRONZE' ? <FallbackMesh color="#ea580c" name="Bronze" /> :
       tier === 'SILVER' ? <FallbackMesh color="#38bdf8" name="Silver" /> :
       tier === 'GOLD' ? <FallbackMesh color="#eab308" name="Gold" /> :
       tier === 'PLATINUM' ? <FallbackMesh color="#c084fc" name="Platinum" /> :
       tier === 'EMERALD' ? <FallbackMesh color="#10b981" name="Emerald" /> :
       tier === 'DIAMOND' ? <FallbackMesh color="#7dd3fc" name="Diamond" /> : null}
    </>
  );
};

// ============================================================================
// TYPOGRAPHY / UI OVERLAY (DOM)
// ============================================================================
const TypographyOverlay = ({ tier }: { tier: string }) => {
  const [showText, setShowText] = useState(false);
  
  useEffect(() => {
    // Reveal text exactly at impact (1.5s for Copper/Champion sequence)
    const t = setTimeout(() => setShowText(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const getTypography = () => {
    switch (tier) {
      case 'COPPER': return { title: "COPPER FORGED", className: "text-amber-100", shadow: "0 10px 0 #78350f, 0 20px 40px #f59e0b, 0 0 100px #ea580c" };
      case 'CHAMPION': return { title: "CHAMPION", className: "text-rose-50 tracking-[0.1em]", shadow: "0 15px 0 #4c0519, 0 30px 60px #881337, 0 0 150px #e11d48", stroke: "3px #fda4af" };
      default: return { title: tier, className: "text-white tracking-widest", shadow: "0 0 20px #ffffff" };
    }
  };

  const typo = getTypography();

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <AnimatePresence>
        {showText && (
          <motion.h1
            initial={{ opacity: 0, scale: 2, filter: "blur(20px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
            className={`text-6xl md:text-8xl lg:text-[10rem] font-black uppercase text-center w-full px-4 ${typo.className}`}
            style={{ textShadow: typo.shadow, WebkitTextStroke: typo.stroke }}
          >
            {typo.title}
          </motion.h1>
        )}
      </AnimatePresence>
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
        <div className="absolute inset-0 z-0">
          {/* Base camera position initialized here, but immediately overridden by CameraRig inside Scene */}
          <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
            <Scene tier={tier} />
          </Canvas>
        </div>

        <TypographyOverlay tier={tier} />

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
