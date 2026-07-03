"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Text3D, Center, MeshDistortMaterial } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { EffectComposer, Bloom, ChromaticAberration, DepthOfField, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'CUMULATIVE' | 'INDIVIDUAL';
  student?: any;
  onComplete: () => void;
}

const FONT_URL = "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/helvetiker_bold.typeface.json";

// ============================================================================
// CAMERA CHOREOGRAPHY
// ============================================================================
function CinematicCamera({ targetZ = 15, targetY = 2, startZ = 2 }) {
  useFrame((state) => {
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, 0.03);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, 0.03);
    state.camera.lookAt(0, 0, 0);
  });
  
  useEffect(() => {
    // Reset camera position on mount to create the zoom-out effect
    // We can't access state.camera directly in useEffect without useThree, 
    // but the lerp will handle it smoothly if we just let it run from default.
  }, []);
  
  return null;
}

// ============================================================================
// CUMULATIVE (OVERALL JOURNEY) 3D SCENES
// ============================================================================

// 🥇 RANK 1: THE MONOLITH (Apex Grandmaster)
function CumulativeRank1({ student }: { student: any }) {
  return (
    <>
      <CinematicCamera targetZ={16} targetY={4} />
      <Physics>
        <RigidBody type="fixed" restitution={0.8}>
          <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[100, 100, 64, 64]} />
            <MeshDistortMaterial color="#fbbf24" emissive="#78350f" emissiveIntensity={0.5} distort={0.2} speed={1.5} metalness={1} roughness={0.1} />
          </mesh>
        </RigidBody>
        
        <RigidBody type="dynamic" position={[0, 15, 0]} mass={10} restitution={0.2}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2, 8, 2]} />
            <meshStandardMaterial color="#fcd34d" emissive="#f59e0b" emissiveIntensity={1.5} metalness={1} roughness={0.2} />
          </mesh>
        </RigidBody>

        {student?.name && (
          <RigidBody type="dynamic" position={[0, 25, 0]} restitution={0.4}>
            <Center position={[0, 0, 2]}>
              <Text3D font={FONT_URL} size={1.5} height={0.5} curveSegments={12} bevelEnabled bevelThickness={0.1} bevelSize={0.05}>
                {student.name.split(' ')[0].toUpperCase()}
                <meshStandardMaterial color="#ffffff" emissive="#fbbf24" emissiveIntensity={1} metalness={1} roughness={0.1} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={2} />
        <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} blendFunction={BlendFunction.NORMAL} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
}

// 🥈 RANK 2: THE STORM (Phantom Strike)
function CumulativeRank2({ student }: { student: any }) {
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame(() => {
    if (lightRef.current) {
      // Simulate lightning strikes
      if (Math.random() > 0.96) {
        lightRef.current.intensity = 100 + Math.random() * 200;
      } else {
        lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.1);
      }
    }
  });

  return (
    <>
      <CinematicCamera targetZ={18} targetY={3} />
      <pointLight ref={lightRef} color="#06b6d4" distance={100} />
      <Physics>
        <RigidBody type="fixed" friction={0.5}>
          <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.1} />
          </mesh>
        </RigidBody>
        
        {/* Halberd Striking Ground */}
        <RigidBody type="dynamic" position={[0, 20, 0]} restitution={0.1} linearVelocity={[0, -20, 0]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 10]} />
            <meshStandardMaterial color="#e2e8f0" emissive="#06b6d4" emissiveIntensity={2} metalness={1} roughness={0} />
          </mesh>
        </RigidBody>

        {student?.name && (
          <RigidBody type="dynamic" position={[0, 30, 2]} restitution={0.3}>
            <Center>
              <Text3D font={FONT_URL} size={1.5} height={0.5} curveSegments={12}>
                {student.name.split(' ')[0].toUpperCase()}
                <meshStandardMaterial color="#ffffff" emissive="#06b6d4" emissiveIntensity={1} metalness={1} roughness={0.1} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} intensity={3} />
        <Noise opacity={0.2} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
}

// 🥉 RANK 3: THE CRATER (Titan Impact)
function CumulativeRank3({ student }: { student: any }) {
  return (
    <>
      <CinematicCamera targetZ={18} targetY={6} />
      <Physics>
        <RigidBody type="fixed">
          <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </RigidBody>
        
        {/* Magma Meteor */}
        <RigidBody type="dynamic" position={[0, 30, 0]} restitution={0.2} mass={50}>
          <mesh>
            <icosahedronGeometry args={[3, 1]} />
            <meshStandardMaterial color="#ea580c" emissive="#f97316" emissiveIntensity={3} metalness={0.8} roughness={0.2} />
          </mesh>
        </RigidBody>

        {/* Scattered Rocks */}
        {[...Array(30)].map((_, i) => (
          <RigidBody key={i} type="dynamic" position={[(Math.random() - 0.5) * 20, 25 + Math.random() * 10, (Math.random() - 0.5) * 20]} restitution={0.5}>
            <mesh>
              <boxGeometry args={[0.5 + Math.random(), 0.5 + Math.random(), 0.5 + Math.random()]} />
              <meshStandardMaterial color="#f97316" emissive="#9a3412" emissiveIntensity={1} />
            </mesh>
          </RigidBody>
        ))}

        {student?.name && (
          <RigidBody type="dynamic" position={[0, 40, 4]} restitution={0.1}>
            <Center>
              <Text3D font={FONT_URL} size={2} height={0.8} curveSegments={12}>
                {student.name.split(' ')[0].toUpperCase()}
                <meshStandardMaterial color="#ffedd5" emissive="#ea580c" emissiveIntensity={2} metalness={1} roughness={0.2} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} intensity={2.5} />
        <ChromaticAberration offset={new THREE.Vector2(0.005, 0.005)} blendFunction={BlendFunction.NORMAL} />
        <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />
      </EffectComposer>
    </>
  );
}

// ============================================================================
// SPECIFIC EXAM 3D SCENES
// ============================================================================

// 🥇 SPECIFIC RANK 1: THE TESSERACT (Exam Prodigy)
function SpecificRank1({ student }: { student: any }) {
  const meshRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.015;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={15} targetY={0} />
      <Physics gravity={[0, 0, 0]}>
        <RigidBody type="kinematicPosition" position={[0, 0, 0]}>
          <group ref={meshRef}>
            <mesh>
              <boxGeometry args={[4, 4, 4]} />
              <meshStandardMaterial color="#ffffff" emissive="#06b6d4" emissiveIntensity={1} wireframe />
            </mesh>
            <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
              <octahedronGeometry args={[3, 0]} />
              <meshStandardMaterial color="#ffffff" emissive="#0ea5e9" emissiveIntensity={2} metalness={1} roughness={0} opacity={0.8} transparent />
            </mesh>
          </group>
        </RigidBody>

        {student?.name && (
          <RigidBody type="dynamic" position={[0, 5, 5]} restitution={1}>
            <Center>
              <Text3D font={FONT_URL} size={1.2} height={0.2}>
                {student.name.toUpperCase()}
                <meshStandardMaterial color="#ffffff" emissive="#38bdf8" emissiveIntensity={2} metalness={1} roughness={0} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={3} />
        <ChromaticAberration offset={new THREE.Vector2(0.01, 0.01)} blendFunction={BlendFunction.NORMAL} />
      </EffectComposer>
    </>
  );
}

// 🥈 SPECIFIC RANK 2: THE CYBER-CORE (Sharp Scholar)
function SpecificRank2({ student }: { student: any }) {
  const ringsRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ringsRef.current) {
      ringsRef.current.rotation.z -= 0.02;
    }
  });

  return (
    <>
      <CinematicCamera targetZ={14} targetY={0} />
      <Physics gravity={[0, 0, 0]}>
        <group ref={ringsRef}>
          <RigidBody type="fixed" position={[0, 0, 0]}>
            <mesh>
              <torusGeometry args={[4, 0.1, 16, 100]} />
              <meshStandardMaterial color="#3b82f6" emissive="#2563eb" emissiveIntensity={3} />
            </mesh>
          </RigidBody>
          <RigidBody type="fixed" position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <torusGeometry args={[3.5, 0.1, 16, 100]} />
              <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={2} />
            </mesh>
          </RigidBody>
        </group>

        {student?.name && (
          <RigidBody type="dynamic" position={[0, 0, 0]} restitution={1} linearVelocity={[0, 0, 0]} angularVelocity={[0.1, 0.2, 0.1]}>
            <Center>
              <Text3D font={FONT_URL} size={1} height={0.3}>
                {student.name.toUpperCase()}
                <meshStandardMaterial color="#ffffff" emissive="#1d4ed8" emissiveIntensity={2} metalness={0.8} roughness={0.2} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} intensity={2.5} />
        <Noise opacity={0.3} />
      </EffectComposer>
    </>
  );
}

// 🥉 SPECIFIC RANK 3: THE VORTEX (Rising Challenger)
function SpecificRank3({ student }: { student: any }) {
  return (
    <>
      <CinematicCamera targetZ={16} targetY={2} />
      <Physics gravity={[0, 5, 0]}>
        <RigidBody type="fixed" position={[0, 0, 0]}>
          <mesh>
            <sphereGeometry args={[2, 32, 32]} />
            <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={2} wireframe />
          </mesh>
        </RigidBody>
        
        {/* Cubes sucked into vortex */}
        {[...Array(40)].map((_, i) => (
          <RigidBody key={i} type="dynamic" position={[(Math.random() - 0.5) * 15, -10 - Math.random() * 10, (Math.random() - 0.5) * 15]} linearVelocity={[0, 10, 0]}>
            <mesh>
              <boxGeometry args={[0.4, 0.4, 0.4]} />
              <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={1} />
            </mesh>
          </RigidBody>
        ))}

        {student?.name && (
          <RigidBody type="dynamic" position={[0, -10, 3]} linearVelocity={[0, 5, 0]}>
            <Center>
              <Text3D font={FONT_URL} size={1.2} height={0.3}>
                {student.name.toUpperCase()}
                <meshStandardMaterial color="#ffffff" emissive="#10b981" emissiveIntensity={2} />
              </Text3D>
            </Center>
          </RigidBody>
        )}
      </Physics>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={2} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
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
          <div className="absolute inset-0 z-10 pointer-events-auto">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={2} />
              <Environment preset="city" />
              
              {viewMode === 'CUMULATIVE' ? (
                <>
                  {rank === 1 && <CumulativeRank1 student={student} />}
                  {rank === 2 && <CumulativeRank2 student={student} />}
                  {rank === 3 && <CumulativeRank3 student={student} />}
                </>
              ) : (
                <>
                  {rank === 1 && <SpecificRank1 student={student} />}
                  {rank === 2 && <SpecificRank2 student={student} />}
                  {rank === 3 && <SpecificRank3 student={student} />}
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
          
          <div className="absolute bottom-[20vh] z-30 pointer-events-none w-full flex justify-center">
            {rank === 1 && (
              <motion.div
                 initial={{ opacity: 0, scale: 2, filter: "blur(30px)", y: 50 }}
                 animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                 transition={{ delay: 1, duration: 1.5, type: "spring", bounce: 0.3 }}
              >
                <h1 className={`text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
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
                 transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.4 }}
              >
                <h1 className={`text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
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
                 transition={{ delay: 1, duration: 1, type: "spring", bounce: 0.5 }}
              >
                <h1 className={`text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase text-center leading-none ${
                  viewMode === 'CUMULATIVE'
                    ? 'bg-gradient-to-b from-orange-100 via-orange-400 to-red-600 drop-shadow-[0_0_50px_rgba(249,115,22,0.8)]'
                    : 'bg-gradient-to-b from-emerald-100 via-emerald-400 to-emerald-700 drop-shadow-[0_0_50px_rgba(16,185,129,0.8)]'
                }`}>
                  {viewMode === 'CUMULATIVE' ? 'Titan Impact' : 'Rising Challenger'}
                </h1>
              </motion.div>
            )}
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
