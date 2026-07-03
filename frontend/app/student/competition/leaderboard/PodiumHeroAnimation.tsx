"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshDistortMaterial, Stars, Cloud, Grid, Trail, Float } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise, GodRays } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'CUMULATIVE' | 'INDIVIDUAL';
  student?: any;
  onComplete: () => void;
}

// ============================================================================
// CAMERA CHOREOGRAPHY
// ============================================================================
function CinematicCamera({ targetZ = 15, targetY = 2, startZ = -5, speed = 0.015 }) {
  useFrame((state) => {
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, speed);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, speed);
    state.camera.lookAt(0, 0, 0);
  });
  
  useEffect(() => {
    // We let the default camera position handle the starting point (usually 0,0,5)
    // and let it lerp slowly to the target for a 10s cinematic reveal.
  }, []);
  
  return null;
}

// ============================================================================
// CUMULATIVE (OVERALL JOURNEY) 3D SCENES
// ============================================================================

// 🥇 RANK 1: THE GALAXY (Apex Grandmaster)
function CumulativeRank1() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.002;
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      ringRef.current.rotation.z -= 0.01;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={12} targetY={0} />
      <group ref={groupRef}>
        <Stars radius={20} depth={50} count={5000} factor={6} saturation={1} fade speed={1.5} />
        <mesh>
          <sphereGeometry args={[2.5, 64, 64]} />
          <MeshDistortMaterial color="#fcd34d" emissive="#fbbf24" emissiveIntensity={3} distort={0.4} speed={2} roughness={0} />
        </mesh>
        <mesh ref={ringRef}>
          <torusGeometry args={[5, 0.05, 16, 100]} />
          <meshStandardMaterial color="#ffffff" emissive="#f59e0b" emissiveIntensity={5} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} scale={1.2}>
          <torusGeometry args={[5, 0.02, 16, 100]} />
          <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={2} />
        </mesh>
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={3} />
        <ChromaticAberration offset={new THREE.Vector2(0.003, 0.003)} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
}

// 🥈 RANK 2: THE ENDLESS GRID (Phantom Strike)
function CumulativeRank2() {
  const gridRef = useRef<any>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    if (gridRef.current) {
      // Move grid towards camera
      gridRef.current.position.z = (state.clock.elapsedTime * 10) % 1;
    }
    if (lightRef.current) {
      if (Math.random() > 0.95) lightRef.current.intensity = 50 + Math.random() * 100;
      else lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.1);
    }
  });

  return (
    <>
      <CinematicCamera targetZ={8} targetY={2} />
      <pointLight ref={lightRef} color="#06b6d4" distance={50} position={[0, 5, 0]} />
      
      {/* Volumetric Fog effect */}
      <fog attach="fog" args={['#020617', 2, 20]} />
      
      <group ref={gridRef} position={[0, -2, 0]}>
        <Grid 
          args={[100, 100]} 
          cellSize={1} 
          cellThickness={1.5} 
          cellColor="#0ea5e9" 
          sectionSize={5} 
          sectionThickness={2} 
          sectionColor="#38bdf8" 
          fadeDistance={30} 
          fadeStrength={1} 
        />
      </group>

      <Float speed={2} rotationIntensity={1} floatIntensity={2}>
        <mesh position={[0, 2, -5]}>
          <octahedronGeometry args={[2, 0]} />
          <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={2} wireframe />
        </mesh>
      </Float>

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} intensity={4} />
        <Noise opacity={0.25} />
      </EffectComposer>
    </>
  );
}

// 🥉 RANK 3: ANTI-GRAVITY SHARDS (Titan Impact)
function CumulativeRank3() {
  const shardsRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const shards = useMemo(() => {
    return Array.from({ length: 150 }, () => ({
      x: (Math.random() - 0.5) * 30,
      y: -10 - Math.random() * 20,
      z: (Math.random() - 0.5) * 30,
      speed: 2 + Math.random() * 4,
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
    }));
  }, []);

  useFrame((state) => {
    if (shardsRef.current) {
      shards.forEach((shard, i) => {
        shard.y += shard.speed * 0.05;
        if (shard.y > 20) shard.y = -10;
        shard.rx += 0.01;
        shard.ry += 0.02;
        dummy.position.set(shard.x, shard.y, shard.z);
        dummy.rotation.set(shard.rx, shard.ry, 0);
        const scale = 0.5 + Math.random() * 1.5;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        shardsRef.current!.setMatrixAt(i, dummy.matrix);
      });
      shardsRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={15} targetY={5} />
      <fog attach="fog" args={['#000000', 5, 40]} />
      
      {/* Glowing Portal Floor */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 10, 64]} />
        <meshStandardMaterial color="#ea580c" emissive="#f97316" emissiveIntensity={5} side={THREE.DoubleSide} />
      </mesh>

      <instancedMesh ref={shardsRef} args={[undefined, undefined, 150]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </instancedMesh>
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} height={300} intensity={3} />
        <ChromaticAberration offset={new THREE.Vector2(0.005, 0.005)} blendFunction={BlendFunction.NORMAL} />
      </EffectComposer>
    </>
  );
}

// ============================================================================
// SPECIFIC EXAM 3D SCENES
// ============================================================================

// 🥇 SPECIFIC RANK 1: THE SINGULARITY (Exam Prodigy)
function SpecificRank1() {
  const blackHoleRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (blackHoleRef.current) {
      blackHoleRef.current.rotation.y += 0.05;
      blackHoleRef.current.rotation.x += 0.02;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={10} targetY={0} />
      <mesh ref={blackHoleRef}>
        <sphereGeometry args={[2, 64, 64]} />
        {/* Creating a black hole effect by using absolute black emissive and severe distortion */}
        <MeshDistortMaterial color="#000000" distort={0.5} speed={4} roughness={0.1} />
      </mesh>
      {/* Accretion Disk */}
      <mesh rotation={[Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[2.5, 6, 64]} />
        <meshStandardMaterial color="#000000" emissive="#38bdf8" emissiveIntensity={3} side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={3} />
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} intensity={4} />
        <ChromaticAberration offset={new THREE.Vector2(0.015, 0.015)} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.3} darkness={1.5} />
      </EffectComposer>
    </>
  );
}

// 🥈 SPECIFIC RANK 2: THE DATA STREAM (Sharp Scholar)
function SpecificRank2() {
  const streamRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (streamRef.current) {
      streamRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={15} targetY={0} />
      <group ref={streamRef}>
        <mesh>
          <cylinderGeometry args={[4, 4, 20, 32, 1, true]} />
          <meshStandardMaterial color="#3b82f6" emissive="#2563eb" emissiveIntensity={2} wireframe transparent opacity={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[2, 2, 20, 16, 1, true]} />
          <meshStandardMaterial color="#60a5fa" emissive="#93c5fd" emissiveIntensity={3} wireframe />
        </mesh>
      </group>
      
      {/* Vertical floating binary-like data */}
      {[...Array(50)].map((_, i) => (
        <Float key={i} speed={5} rotationIntensity={2} floatIntensity={5}>
          <mesh position={[(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 6]}>
            <boxGeometry args={[0.2, Math.random() * 2, 0.2]} />
            <meshStandardMaterial color="#ffffff" emissive="#1d4ed8" emissiveIntensity={5} />
          </mesh>
        </Float>
      ))}

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} intensity={3} />
      </EffectComposer>
    </>
  );
}

// 🥉 SPECIFIC RANK 3: THE NEBULA (Rising Challenger)
function SpecificRank3() {
  const coreRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (coreRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      coreRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <>
      <CinematicCamera targetZ={20} targetY={0} />
      <pointLight color="#10b981" intensity={100} distance={50} />
      
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#10b981" emissiveIntensity={5} />
      </mesh>
      
      <Cloud position={[-4, 0, -5]} speed={0.2} opacity={0.5} color="#059669" scale={10} />
      <Cloud position={[4, 0, -5]} speed={0.2} opacity={0.5} color="#34d399" scale={10} />
      <Cloud position={[0, 4, -5]} speed={0.2} opacity={0.5} color="#047857" scale={10} />
      <Cloud position={[0, -4, -5]} speed={0.2} opacity={0.5} color="#059669" scale={10} />

      <Stars radius={20} depth={50} count={2000} factor={4} saturation={1} fade />

      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} intensity={2} />
      </EffectComposer>
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PodiumHeroAnimation({ rank, viewMode = 'CUMULATIVE', student, onComplete }: PodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (rank !== null) {
      const timer = setTimeout(() => {
        onComplete();
      }, 10000); // 10 FULL SECONDS of AAA glory
      return () => clearTimeout(timer);
    }
  }, [rank, onComplete]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {rank !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }} // Slow, dramatic fade in
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-3xl"
        >
          {/* ============================================================== */}
          {/* 3D CANVAS LAYER                                                */}
          {/* ============================================================== */}
          <div className="absolute inset-0 z-10 pointer-events-auto">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
              <ambientLight intensity={0.2} />
              
              {viewMode === 'CUMULATIVE' ? (
                <>
                  {rank === 1 && <CumulativeRank1 />}
                  {rank === 2 && <CumulativeRank2 />}
                  {rank === 3 && <CumulativeRank3 />}
                </>
              ) : (
                <>
                  {rank === 1 && <SpecificRank1 />}
                  {rank === 2 && <SpecificRank2 />}
                  {rank === 3 && <SpecificRank3 />}
                </>
              )}
            </Canvas>
          </div>

          {/* ============================================================== */}
          {/* CINEMATIC LETTERBOX BARS                                       */}
          {/* ============================================================== */}
          <motion.div 
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 w-full h-[15vh] bg-black z-20 border-b border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] pointer-events-none" 
          />
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 w-full h-[15vh] bg-black z-20 border-t border-white/5 shadow-[0_-20px_50px_rgba(0,0,0,0.9)] pointer-events-none" 
          />

          {/* ============================================================== */}
          {/* 2D VFX OVERLAYS & TEXT (MASSIVE HTML LEGIBILITY)               */}
          {/* ============================================================== */}
          
          <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-between py-[18vh]">
            
            {/* STUDENT NAME (TOP) */}
            {student && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: -50, filter: "blur(20px)" }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 1.5, duration: 2, type: "spring", bounce: 0.4 }}
                className="flex flex-col items-center justify-center drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
              >
                <h2 className="text-3xl md:text-5xl text-white/90 font-medium tracking-[0.3em] uppercase mb-4 drop-shadow-md">
                  Awarded To
                </h2>
                <h1 className="text-7xl md:text-9xl lg:text-[12rem] font-black italic tracking-tighter text-white drop-shadow-[0_0_60px_rgba(255,255,255,1)] leading-none text-center">
                  {student.name.split(' ')[0]}
                </h1>
              </motion.div>
            )}

            {/* AWARD TITLE (BOTTOM) */}
            <div className="w-full flex justify-center mt-auto">
              {rank === 1 && (
                <motion.div
                   initial={{ opacity: 0, scale: 1.5, filter: "blur(30px)", y: 50 }}
                   animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                   transition={{ delay: 1, duration: 2, type: "spring", bounce: 0.3 }}
                >
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE' 
                      ? 'bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_0_50px_rgba(250,204,21,0.8)]' 
                      : 'bg-gradient-to-b from-white via-cyan-200 to-cyan-500 drop-shadow-[0_0_50px_rgba(6,182,212,0.8)]'
                  }`}>
                    {viewMode === 'CUMULATIVE' ? 'Apex Grandmaster' : 'Exam Prodigy'}
                  </h1>
                </motion.div>
              )}

              {rank === 2 && (
                <motion.div
                   initial={{ opacity: 0, x: viewMode === 'CUMULATIVE' ? 500 : -500, skewX: viewMode === 'CUMULATIVE' ? -40 : 40, filter: "blur(20px)" }}
                   animate={{ opacity: 1, x: 0, skewX: 0, filter: "blur(0px)" }}
                   transition={{ delay: 1, duration: 1.5, type: "spring", bounce: 0.4 }}
                >
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE'
                      ? 'bg-gradient-to-b from-cyan-100 via-cyan-400 to-cyan-600 drop-shadow-[0_0_50px_rgba(34,211,238,0.8)]'
                      : 'bg-gradient-to-b from-blue-100 via-blue-400 to-blue-700 drop-shadow-[0_0_50px_rgba(59,130,246,0.8)]'
                  }`}>
                    {viewMode === 'CUMULATIVE' ? 'Phantom Strike' : 'Sharp Scholar'}
                  </h1>
                </motion.div>
              )}

              {rank === 3 && (
                <motion.div
                   initial={{ opacity: 0, scale: 0.5, y: 150, filter: "blur(20px)" }}
                   animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                   transition={{ delay: 1, duration: 1.5, type: "spring", bounce: 0.5 }}
                >
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE'
                      ? 'bg-gradient-to-b from-orange-100 via-orange-400 to-red-600 drop-shadow-[0_0_50px_rgba(249,115,22,0.8)]'
                      : 'bg-gradient-to-b from-emerald-100 via-emerald-400 to-emerald-700 drop-shadow-[0_0_50px_rgba(16,185,129,0.8)]'
                  }`}>
                    {viewMode === 'CUMULATIVE' ? 'Titan Impact' : 'Rising Challenger'}
                  </h1>
                </motion.div>
              )}
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
