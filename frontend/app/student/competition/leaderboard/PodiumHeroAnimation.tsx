"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Sparkles, Stars, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'CUMULATIVE' | 'INDIVIDUAL';
  onComplete: () => void;
}

// ============================================================================
// CUMULATIVE (OVERALL) 3D SCENES
// ============================================================================

// 🥇 RANK 1: 3D Golden Crown & Sacred Geometry
function Rank1Scene() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.02;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={1} floatIntensity={2}>
        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[1.5, 0.3, 16, 6]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={2} metalness={1} roughness={0.1} />
        </mesh>
        <mesh rotation={[Math.PI / 4, 0, 0]}>
          <torusGeometry args={[3, 0.05, 16, 100]} />
          <meshStandardMaterial color="#fcd34d" emissive="#fbbf24" emissiveIntensity={1} wireframe />
        </mesh>
        <mesh rotation={[-Math.PI / 4, Math.PI / 4, 0]}>
          <torusGeometry args={[3, 0.05, 16, 100]} />
          <meshStandardMaterial color="#fcd34d" emissive="#fbbf24" emissiveIntensity={1} wireframe />
        </mesh>
        <Sparkles count={200} scale={10} size={4} speed={0.4} color="#fef08a" />
      </Float>
    </group>
  );
}

// 🥈 RANK 2: 3D Phantom Warp Shurikens
function Rank2Scene() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.x -= 0.1;
      groupRef.current.rotation.y += 0.15;
    }
  });

  return (
    <group>
      <Float speed={4} rotationIntensity={2} floatIntensity={1}>
        <group ref={groupRef}>
          <mesh position={[0, 1, 0]}>
            <coneGeometry args={[0.5, 3, 4]} />
            <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={3} metalness={1} roughness={0} />
          </mesh>
          <mesh position={[-0.866, -0.5, 0]} rotation={[0, 0, (2 * Math.PI) / 3]}>
            <coneGeometry args={[0.5, 3, 4]} />
            <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={3} metalness={1} roughness={0} />
          </mesh>
          <mesh position={[0.866, -0.5, 0]} rotation={[0, 0, (-2 * Math.PI) / 3]}>
            <coneGeometry args={[0.5, 3, 4]} />
            <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={3} metalness={1} roughness={0} />
          </mesh>
        </group>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={3} />
      </Float>
    </group>
  );
}

// 🥉 RANK 3: 3D Magma Meteor Impact
function Rank3Scene() {
  const meshRef = useRef<THREE.Mesh>(null);
  const fragmentsRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x += 0.005;
    }
    if (fragmentsRef.current) {
      fragmentsRef.current.rotation.y -= 0.02;
    }
  });

  return (
    <group>
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1.5}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[2, 4]} />
          <MeshDistortMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={1} distort={0.4} speed={2} roughness={0.2} metalness={0.8} />
        </mesh>
        <group ref={fragmentsRef}>
          {[...Array(15)].map((_, i) => (
            <mesh 
              key={i} 
              position={[(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6]}
              rotation={[Math.random() * Math.PI, Math.random() * Math.PI, 0]}
            >
              <tetrahedronGeometry args={[0.5]} />
              <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={1} roughness={0.5} metalness={0.5} />
            </mesh>
          ))}
        </group>
      </Float>
    </group>
  );
}

// ============================================================================
// SPECIFIC EXAM 3D SCENES
// ============================================================================

// 🥇 SPECIFIC RANK 1: 3D Diamond Crystal (Exam Prodigy)
function SpecificRank1Scene() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.02;
    }
  });
  return (
    <group>
      <Float speed={2} rotationIntensity={1} floatIntensity={2}>
        <mesh ref={meshRef}>
          <octahedronGeometry args={[2, 0]} />
          <meshStandardMaterial color="#ffffff" emissive="#06b6d4" emissiveIntensity={1.5} metalness={1} roughness={0} />
        </mesh>
        <Sparkles count={300} scale={12} size={3} speed={0.8} color="#a5f3fc" />
      </Float>
    </group>
  );
}

// 🥈 SPECIFIC RANK 2: 3D Electric Octahedron (Sharp Scholar)
function SpecificRank2Scene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.z -= 0.05;
      groupRef.current.rotation.x += 0.02;
    }
  });
  return (
    <group ref={groupRef}>
      <Float speed={3} rotationIntensity={2} floatIntensity={1.5}>
        <mesh>
          <octahedronGeometry args={[2.5, 1]} />
          <meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={2} wireframe />
        </mesh>
        <mesh rotation={[Math.PI / 4, 0, 0]}>
          <octahedronGeometry args={[1.5, 0]} />
          <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={1} metalness={1} roughness={0} />
        </mesh>
      </Float>
    </group>
  );
}

// 🥉 SPECIFIC RANK 3: 3D Emerald Sphere (Rising Challenger)
function SpecificRank3Scene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.03;
      groupRef.current.rotation.x += 0.01;
    }
  });
  return (
    <group ref={groupRef}>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={1}>
        <mesh>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={1.5} roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.5, 0.05, 16, 100]} />
          <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={2} />
        </mesh>
        <mesh rotation={[0, Math.PI / 3, 0]}>
          <torusGeometry args={[3, 0.02, 16, 100]} />
          <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1} />
        </mesh>
      </Float>
    </group>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PodiumHeroAnimation({ rank, viewMode = 'CUMULATIVE', onComplete }: PodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (rank !== null) {
      const timer = setTimeout(() => {
        onComplete();
      }, 5500); 
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
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-3xl"
        >
          {/* ============================================================== */}
          {/* 3D CANVAS LAYER (Underneath Text)                              */}
          {/* ============================================================== */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <Canvas camera={{ position: [0, 0, 10], fov: 45 }} gl={{ antialias: true, alpha: true }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={2} />
              <Environment preset="city" />
              
              {viewMode === 'CUMULATIVE' ? (
                <>
                  {rank === 1 && <Rank1Scene />}
                  {rank === 2 && <Rank2Scene />}
                  {rank === 3 && <Rank3Scene />}
                </>
              ) : (
                <>
                  {rank === 1 && <SpecificRank1Scene />}
                  {rank === 2 && <SpecificRank2Scene />}
                  {rank === 3 && <SpecificRank3Scene />}
                </>
              )}
            </Canvas>
          </div>

          {/* ============================================================== */}
          {/* CINEMATIC LETTERBOX BARS                                       */}
          {/* ============================================================== */}
          <motion.div 
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 w-full h-[15vh] bg-black z-20 border-b border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] pointer-events-none" 
          />
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 w-full h-[15vh] bg-black z-20 border-t border-white/5 shadow-[0_-20px_50px_rgba(0,0,0,0.9)] pointer-events-none" 
          />

          {/* ============================================================== */}
          {/* 2D VFX OVERLAYS & TEXT (Above 3D Canvas)                       */}
          {/* ============================================================== */}
          
          {/* -------------------- RANK 1 -------------------- */}
          {rank === 1 && (
            <>
              {viewMode === 'CUMULATIVE' ? (
                <>
                  <motion.div
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: [0, 20], opacity: [1, 0] }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    className="absolute w-32 h-32 rounded-full bg-yellow-300 blur-[60px] mix-blend-screen z-0 pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, scale: 2, filter: "blur(30px)", y: 50 }}
                     animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                     transition={{ delay: 1, duration: 1.5, type: "spring", bounce: 0.3 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_0_50px_rgba(250,204,21,0.8)] uppercase text-center leading-none">
                      Apex Grandmaster
                    </h1>
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: [0, 20], opacity: [1, 0] }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    className="absolute w-32 h-32 rounded-full bg-cyan-300 blur-[60px] mix-blend-screen z-0 pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, scale: 2, filter: "blur(30px)", y: 50 }}
                     animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                     transition={{ delay: 1, duration: 1.5, type: "spring", bounce: 0.3 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-200 to-cyan-500 drop-shadow-[0_0_50px_rgba(6,182,212,0.8)] uppercase text-center leading-none">
                      Exam Prodigy
                    </h1>
                  </motion.div>
                </>
              )}
            </>
          )}

          {/* -------------------- RANK 2 -------------------- */}
          {rank === 2 && (
            <>
              {viewMode === 'CUMULATIVE' ? (
                <>
                  <motion.div 
                     initial={{ opacity: 0, scaleZ: 0 }}
                     animate={{ opacity: [0, 1, 0] }}
                     transition={{ duration: 0.5, delay: 0.5 }}
                     className="absolute inset-0 bg-cyan-200 z-10 mix-blend-screen pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, x: 500, skewX: -40, filter: "blur(20px)" }}
                     animate={{ opacity: 1, x: 0, skewX: 0, filter: "blur(0px)" }}
                     transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.4 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-100 via-cyan-400 to-cyan-600 drop-shadow-[0_0_50px_rgba(34,211,238,0.8)] uppercase text-center leading-none">
                      Phantom Strike
                    </h1>
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div 
                     initial={{ opacity: 0, scaleZ: 0 }}
                     animate={{ opacity: [0, 1, 0] }}
                     transition={{ duration: 0.5, delay: 0.5 }}
                     className="absolute inset-0 bg-blue-400 z-10 mix-blend-screen pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, x: -500, skewX: 40, filter: "blur(20px)" }}
                     animate={{ opacity: 1, x: 0, skewX: 0, filter: "blur(0px)" }}
                     transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.4 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-blue-100 via-blue-400 to-blue-700 drop-shadow-[0_0_50px_rgba(59,130,246,0.8)] uppercase text-center leading-none">
                      Sharp Scholar
                    </h1>
                  </motion.div>
                </>
              )}
            </>
          )}

          {/* -------------------- RANK 3 -------------------- */}
          {rank === 3 && (
            <>
              {viewMode === 'CUMULATIVE' ? (
                <>
                  <motion.div
                    initial={{ scale: 0, opacity: 1, rotateX: 70 }}
                    animate={{ scale: [0, 15], opacity: [1, 0] }}
                    transition={{ duration: 2, ease: "easeOut", delay: 0.2 }}
                    className="absolute w-[500px] h-[500px] rounded-full border-[30px] border-orange-500/80 mix-blend-screen z-0 pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, scale: 0.5, y: 150, filter: "blur(20px)" }}
                     animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                     transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.5 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-orange-100 via-orange-400 to-red-600 drop-shadow-[0_0_50px_rgba(249,115,22,0.8)] uppercase text-center leading-none">
                      Titan Impact
                    </h1>
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0, opacity: 1, rotateX: 70 }}
                    animate={{ scale: [0, 15], opacity: [1, 0] }}
                    transition={{ duration: 2, ease: "easeOut", delay: 0.2 }}
                    className="absolute w-[500px] h-[500px] rounded-full border-[30px] border-emerald-500/80 mix-blend-screen z-0 pointer-events-none"
                  />
                  <motion.div
                     initial={{ opacity: 0, scale: 0.5, y: 150, filter: "blur(20px)" }}
                     animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                     transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.5 }}
                     className="absolute bottom-[20vh] z-30 pointer-events-none"
                  >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-emerald-100 via-emerald-400 to-emerald-700 drop-shadow-[0_0_50px_rgba(16,185,129,0.8)] uppercase text-center leading-none">
                      Rising Challenger
                    </h1>
                  </motion.div>
                </>
              )}
            </>
          )}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
