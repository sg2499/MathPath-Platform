"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshDistortMaterial, Stars, Cloud, Grid, Float } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'CUMULATIVE' | 'INDIVIDUAL';
  student?: any;
  onComplete: () => void;
}

// ============================================================================
// GLOBAL TIME DILATION & CINEMATIC CAMERA
// ============================================================================
function CinematicCamera({ targetZ = 15, targetY = 2, speed = 0.015 }) {
  useFrame((state) => {
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, speed);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, speed);
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

// Global Speed Multiplier for Time Dilation Effect
const useTimeDilation = () => {
  const speedRef = useRef(3.0); // Start fast
  useFrame(() => {
    // Aggressively slow down to 0.2 (extreme slow mo) over time
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0.2, 0.015);
  });
  return speedRef;
};

// ============================================================================
// CUMULATIVE (OVERALL JOURNEY) 3D SCENES
// ============================================================================

// 🥇 RANK 1: THE GALAXY (Apex Grandmaster)
function CumulativeRank1() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const timeSpeed = useTimeDilation();

  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.001 * timeSpeed.current;
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      ringRef.current.rotation.z -= 0.005 * timeSpeed.current;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={12} targetY={0} />
      <group ref={groupRef}>
        {/* Pushed stars WAY back (radius 40, depth 100) to act as subtle gold dust, not blinding glitter */}
        <Stars radius={40} depth={100} count={3000} factor={3} saturation={1} fade speed={0.5} />
        
        {/* Dark, monolithic core instead of a blinding light bulb */}
        <mesh>
          <sphereGeometry args={[2.5, 64, 64]} />
          <MeshDistortMaterial color="#1a1a1a" emissive="#fbbf24" emissiveIntensity={0.5} distort={0.2} speed={1} roughness={0.2} />
        </mesh>
        
        <mesh ref={ringRef}>
          <torusGeometry args={[5, 0.02, 16, 100]} />
          <meshStandardMaterial color="#ffffff" emissive="#f59e0b" emissiveIntensity={3} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} scale={1.2}>
          <torusGeometry args={[5, 0.01, 16, 100]} />
          <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={1.5} />
        </mesh>
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.3} darkness={1.2} />
      </EffectComposer>
    </>
  );
}

// 🥈 RANK 2: THE ENDLESS GRID (Phantom Strike)
function CumulativeRank2() {
  const gridRef = useRef<any>(null);
  const timeSpeed = useTimeDilation();

  useFrame((state) => {
    if (gridRef.current) {
      gridRef.current.position.z = (state.clock.elapsedTime * 5 * timeSpeed.current) % 1;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={8} targetY={2} />
      <fog attach="fog" args={['#020617', 2, 20]} />
      
      <group ref={gridRef} position={[0, -2, 0]}>
        <Grid 
          args={[100, 100]} 
          cellSize={1} cellThickness={1} cellColor="#0284c7" 
          sectionSize={5} sectionThickness={2} sectionColor="#0ea5e9" 
          fadeDistance={30} fadeStrength={1} 
        />
      </group>

      <Float speed={1} rotationIntensity={0.5} floatIntensity={1}>
        <mesh position={[0, 2, -5]}>
          <octahedronGeometry args={[2, 0]} />
          <meshStandardMaterial color="#020617" emissive="#0ea5e9" emissiveIntensity={1} wireframe />
        </mesh>
      </Float>

      <EffectComposer>
        <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} height={300} intensity={2} />
        <Noise opacity={0.15} />
        <Vignette eskil={false} offset={0.2} darkness={1.3} />
      </EffectComposer>
    </>
  );
}

// 🥉 RANK 3: ANTI-GRAVITY SHARDS (Titan Impact)
function CumulativeRank3() {
  const shardsRef = useRef<THREE.InstancedMesh>(null);
  const timeSpeed = useTimeDilation();
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const shards = useMemo(() => Array.from({ length: 100 }, () => ({
    x: (Math.random() - 0.5) * 30, y: -10 - Math.random() * 20, z: (Math.random() - 0.5) * 30,
    speed: 1 + Math.random() * 2, rx: Math.random() * Math.PI, ry: Math.random() * Math.PI,
  })), []);

  useFrame(() => {
    if (shardsRef.current) {
      shards.forEach((shard, i) => {
        shard.y += shard.speed * 0.05 * timeSpeed.current;
        if (shard.y > 20) shard.y = -10;
        shard.rx += 0.005 * timeSpeed.current;
        shard.ry += 0.01 * timeSpeed.current;
        dummy.position.set(shard.x, shard.y, shard.z);
        dummy.rotation.set(shard.rx, shard.ry, 0);
        const scale = 0.5 + Math.random() * 1;
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
      
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1, 10, 64]} />
        <meshStandardMaterial color="#9a3412" emissive="#ea580c" emissiveIntensity={2} side={THREE.DoubleSide} />
      </mesh>

      <instancedMesh ref={shardsRef} args={[undefined, undefined, 100]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </instancedMesh>
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={2} />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
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
  const timeSpeed = useTimeDilation();
  
  useFrame(() => {
    if (blackHoleRef.current) {
      blackHoleRef.current.rotation.y += 0.02 * timeSpeed.current;
      blackHoleRef.current.rotation.x += 0.01 * timeSpeed.current;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={10} targetY={0} />
      <mesh ref={blackHoleRef}>
        <sphereGeometry args={[2, 64, 64]} />
        <MeshDistortMaterial color="#000000" distort={0.3} speed={2} roughness={0.5} />
      </mesh>
      
      {/* Muted Accretion Disk */}
      <mesh rotation={[Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[2.5, 5, 64]} />
        <meshStandardMaterial color="#000000" emissive="#0ea5e9" emissiveIntensity={1.5} side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>
      
      {/* Stars pushed back so they don't blind the text */}
      <Stars radius={40} depth={100} count={2000} factor={3} saturation={0} fade speed={1} />
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} intensity={2} />
        <ChromaticAberration offset={new THREE.Vector2(0.01, 0.01)} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.4} darkness={1.4} />
      </EffectComposer>
    </>
  );
}

// 🥈 SPECIFIC RANK 2: THE DATA STREAM (Sharp Scholar)
function SpecificRank2() {
  const streamRef = useRef<THREE.Group>(null);
  const timeSpeed = useTimeDilation();
  
  useFrame(() => {
    if (streamRef.current) {
      streamRef.current.rotation.y += 0.02 * timeSpeed.current;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={15} targetY={0} />
      {/* Deep Violet background contrast for icy cyan text */}
      <fog attach="fog" args={['#1e1b4b', 5, 30]} />
      
      <group ref={streamRef}>
        <mesh>
          <cylinderGeometry args={[4, 4, 20, 32, 1, true]} />
          <meshStandardMaterial color="#312e81" emissive="#3730a3" emissiveIntensity={1} wireframe transparent opacity={0.3} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[2, 2, 20, 16, 1, true]} />
          <meshStandardMaterial color="#4338ca" emissive="#4f46e5" emissiveIntensity={1.5} wireframe />
        </mesh>
      </group>
      
      {[...Array(40)].map((_, i) => (
        <Float key={i} speed={2} rotationIntensity={1} floatIntensity={2}>
          <mesh position={[(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 6]}>
            <boxGeometry args={[0.1, Math.random() * 1.5, 0.1]} />
            <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={2} />
          </mesh>
        </Float>
      ))}

      <EffectComposer>
        <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        <Vignette eskil={false} offset={0.2} darkness={1.2} />
      </EffectComposer>
    </>
  );
}

// 🥉 SPECIFIC RANK 3: THE NEBULA (Rising Challenger)
function SpecificRank3() {
  const coreRef = useRef<THREE.Mesh>(null);
  const timeSpeed = useTimeDilation();
  
  useFrame((state) => {
    if (coreRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 1 * timeSpeed.current) * 0.1;
      coreRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <>
      <CinematicCamera targetZ={20} targetY={0} />
      <pointLight color="#059669" intensity={50} distance={50} />
      
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#022c22" emissive="#059669" emissiveIntensity={2} />
      </mesh>
      
      <Cloud position={[-4, 0, -5]} speed={0.1} opacity={0.3} color="#064e3b" scale={10} />
      <Cloud position={[4, 0, -5]} speed={0.1} opacity={0.3} color="#022c22" scale={10} />
      
      <Stars radius={30} depth={50} count={1000} factor={2} saturation={1} fade />

      <EffectComposer>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        <Vignette eskil={false} offset={0.2} darkness={1.3} />
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
          transition={{ duration: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-3xl"
        >
          {/* ============================================================== */}
          {/* 3D CANVAS LAYER (Muted & Pushed Back)                          */}
          {/* ============================================================== */}
          <div className="absolute inset-0 z-10 pointer-events-auto">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
              <ambientLight intensity={0.1} />
              
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
          {/* VIGNETTE MASK FOR ABSOLUTE TEXT LEGIBILITY                     */}
          {/* ============================================================== */}
          {/* This darkens the center heavily behind the text, blocking bright 3D elements */}
          <div className="absolute inset-0 z-20 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0)_60%)]" />

          {/* ============================================================== */}
          {/* FOREGROUND LIGHT LEAKS                                         */}
          {/* ============================================================== */}
          <motion.div 
            animate={{ 
              opacity: [0.1, 0.3, 0.1],
              x: ['-20%', '20%'] 
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            className="absolute top-[20%] left-[20%] w-[40vw] h-[40vh] bg-blue-500/10 blur-[100px] rounded-full z-40 pointer-events-none mix-blend-screen"
          />
          <motion.div 
            animate={{ 
              opacity: [0.1, 0.4, 0.1],
              y: ['20%', '-20%'] 
            }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[20%] right-[20%] w-[30vw] h-[30vh] bg-yellow-500/10 blur-[100px] rounded-full z-40 pointer-events-none mix-blend-screen"
          />

          {/* ============================================================== */}
          {/* CINEMATIC LETTERBOX BARS                                       */}
          {/* ============================================================== */}
          <motion.div 
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 w-full h-[15vh] bg-black z-30 shadow-[0_20px_50px_rgba(0,0,0,1)] pointer-events-none" 
          />
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 w-full h-[15vh] bg-black z-30 shadow-[0_-20px_50px_rgba(0,0,0,1)] pointer-events-none" 
          />

          {/* ============================================================== */}
          {/* KINETIC TYPOGRAPHY WITH SCREEN SHAKE                           */}
          {/* ============================================================== */}
          <motion.div 
            // SCREEN SHAKE HAPPENS AT 1.5s exactly when the text slams in
            animate={{ x: [0, -15, 15, -10, 10, -5, 5, 0] }}
            transition={{ delay: 1.5, duration: 0.6, type: "spring", bounce: 0.8 }}
            className="absolute inset-0 z-50 pointer-events-none flex flex-col items-center justify-between py-[18vh]"
          >
            
            {/* STUDENT NAME (TOP) */}
            {student && (
              <motion.div
                initial={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ delay: 1.5, duration: 0.8, type: "spring", bounce: 0.4 }}
                className="flex flex-col items-center justify-center"
              >
                <motion.h2 
                  initial={{ letterSpacing: "2em", opacity: 0 }}
                  animate={{ letterSpacing: "0.3em", opacity: 1 }}
                  transition={{ delay: 1.6, duration: 1, ease: "easeOut" }}
                  className="text-2xl md:text-4xl text-white/90 font-medium uppercase mb-4 drop-shadow-[0_4px_4px_rgba(0,0,0,1)]"
                >
                  Awarded To
                </motion.h2>

                {/* KINETIC NAME REVEAL */}
                <motion.h1 
                  initial={{ letterSpacing: "-0.1em", opacity: 0, y: 50 }}
                  animate={{ letterSpacing: "normal", opacity: 1, y: 0 }}
                  transition={{ delay: 1.5, duration: 1, type: "spring", bounce: 0.5 }}
                  className="text-7xl md:text-9xl lg:text-[12rem] font-black italic text-white leading-none text-center"
                  style={{
                    textShadow: "0px 10px 30px rgba(0,0,0,1), 0px 4px 10px rgba(0,0,0,0.8), 0px 0px 60px rgba(255,255,255,0.6)"
                  }}
                >
                  {student.name.split(' ')[0]}
                </motion.h1>
              </motion.div>
            )}

            {/* AWARD TITLE (BOTTOM) */}
            <div className="w-full flex justify-center mt-auto">
              <motion.div
                  initial={{ opacity: 0, scale: 0.8, filter: "blur(20px)", y: 50 }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                  transition={{ delay: 2, duration: 1.5, type: "spring", bounce: 0.3 }}
              >
                {rank === 1 && (
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE' 
                      ? 'bg-gradient-to-b from-white via-yellow-300 to-yellow-600' 
                      : 'bg-gradient-to-b from-white via-cyan-300 to-cyan-600'
                  }`}
                  style={{ filter: "drop-shadow(0px 10px 20px rgba(0,0,0,1)) drop-shadow(0px 2px 5px rgba(0,0,0,1))" }}
                  >
                    {viewMode === 'CUMULATIVE' ? 'Apex Grandmaster' : 'Exam Prodigy'}
                  </h1>
                )}

                {rank === 2 && (
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE'
                      ? 'bg-gradient-to-b from-white via-cyan-300 to-cyan-600'
                      : 'bg-gradient-to-b from-white via-blue-300 to-blue-700'
                  }`}
                  style={{ filter: "drop-shadow(0px 10px 20px rgba(0,0,0,1)) drop-shadow(0px 2px 5px rgba(0,0,0,1))" }}
                  >
                    {viewMode === 'CUMULATIVE' ? 'Phantom Strike' : 'Sharp Scholar'}
                  </h1>
                )}

                {rank === 3 && (
                  <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                    viewMode === 'CUMULATIVE'
                      ? 'bg-gradient-to-b from-white via-orange-400 to-red-600'
                      : 'bg-gradient-to-b from-white via-emerald-400 to-emerald-700'
                  }`}
                  style={{ filter: "drop-shadow(0px 10px 20px rgba(0,0,0,1)) drop-shadow(0px 2px 5px rgba(0,0,0,1))" }}
                  >
                    {viewMode === 'CUMULATIVE' ? 'Titan Impact' : 'Rising Challenger'}
                  </h1>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
