'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import { Icosahedron, Sphere, Sparkles, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

interface PackItem {
  id: string;
  name: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
}

interface Props {
  pack: PackItem;
  onComplete: () => void;
}

const RarityColors: Record<string, string> = {
  COMMON: '#94a3b8',
  UNCOMMON: '#10b981',
  RARE: '#06b6d4',
  EPIC: '#a855f7',
  LEGENDARY: '#eab308',
  MYTHIC: '#ef4444',
};

// Procedural 3D Quantum Core
function QuantumCore({ progress, phase, color }: { progress: number, phase: string, color: string }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!coreRef.current || !shellRef.current) return;
    const time = state.clock.getElapsedTime();
    
    // Rotation speeds up as progress increases
    const speed = 1 + (progress / 20);
    coreRef.current.rotation.x = time * speed;
    coreRef.current.rotation.y = time * speed * 1.5;
    
    shellRef.current.rotation.x = -time * (speed * 0.5);
    shellRef.current.rotation.y = -time * (speed * 0.5);

    // Scale pulses intensely near completion
    if (phase === 'DECRYPTING') {
      const pulse = 1 + Math.sin(time * 20) * (progress / 1000);
      coreRef.current.scale.setScalar(pulse);
      
      // Shake
      const shakeX = (Math.random() - 0.5) * (progress / 500);
      const shakeY = (Math.random() - 0.5) * (progress / 500);
      coreRef.current.position.set(shakeX, shakeY, 0);
      shellRef.current.position.set(shakeX, shakeY, 0);
    }
  });

  if (phase === 'REVEAL') return null; // Hide container during reveal

  return (
    <group>
      {/* Outer Shell */}
      <Icosahedron ref={shellRef} args={[2, 1]} position={[0, 0, 0]}>
        <meshStandardMaterial 
          color="#0f172a" 
          wireframe={progress > 50} 
          roughness={0.2} 
          metalness={0.8}
          transparent
          opacity={1 - (progress/200)}
        />
      </Icosahedron>

      {/* Inner Glowing Core */}
      <Sphere ref={coreRef} args={[1.5, 32, 32]}>
        <MeshDistortMaterial 
          color={color} 
          emissive={color}
          emissiveIntensity={1 + (progress / 10)}
          distort={0.2 + (progress / 200)} 
          speed={2 + (progress / 10)} 
          roughness={0}
        />
      </Sphere>

      {/* Sparks flying off as it decrypts */}
      {progress > 10 && (
        <Sparkles 
          count={Math.floor(progress * 2)} 
          scale={5} 
          size={4} 
          speed={2} 
          color={color} 
          opacity={0.8} 
        />
      )}
    </group>
  );
}

function RevealItem({ item, color }: { item: PackItem, color: string }) {
  const ref = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.01;
      ref.current.position.y = Math.sin(state.clock.elapsedTime) * 0.2;
    }
  });

  return (
    <group ref={ref}>
      <Float speed={2} rotationIntensity={1} floatIntensity={2}>
        <Icosahedron args={[1.5, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive={color} 
            emissiveIntensity={0.5} 
            roughness={0.1} 
            metalness={1} 
          />
        </Icosahedron>
      </Float>
      <Sparkles count={100} scale={10} size={5} color={color} speed={0.5} />
      <ambientLight intensity={2} color={color} />
      <pointLight position={[0, 0, 0]} intensity={50} color={color} distance={10} />
    </group>
  );
}

export function AlphaPackUnboxCinematic({ pack, onComplete }: Props) {
  const [phase, setPhase] = useState<'IDLE' | 'DECRYPTING' | 'FLASH' | 'REVEAL'>('IDLE');
  const [progress, setProgress] = useState(0);
  const color = RarityColors[pack.rarity] || RarityColors.COMMON;

  // Hold to Decrypt mechanic
  useEffect(() => {
    let animationFrame: number;
    let currentProgress = progress;

    const loop = () => {
      if (phase === 'DECRYPTING') {
        currentProgress += 1.5; // Speed of hold
        if (currentProgress >= 100) {
          setPhase('FLASH');
          currentProgress = 100;
        }
      } else if (phase === 'IDLE' && currentProgress > 0) {
        currentProgress -= 3; // Fast decay if let go
        if (currentProgress < 0) currentProgress = 0;
      }
      
      setProgress(currentProgress);
      
      if (phase === 'DECRYPTING' || (phase === 'IDLE' && currentProgress > 0)) {
        animationFrame = requestAnimationFrame(loop);
      }
    };

    if (phase === 'DECRYPTING' || (phase === 'IDLE' && progress > 0)) {
      animationFrame = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [phase]);

  // Flash Sequence
  useEffect(() => {
    if (phase === 'FLASH') {
      const t1 = setTimeout(() => setPhase('REVEAL'), 2000); // Massive whiteout flash duration
      return () => clearTimeout(t1);
    }
  }, [phase]);

  return (
    <div 
      className="fixed inset-0 z-[99999] bg-black select-none overflow-hidden touch-none"
      onPointerDown={() => phase === 'IDLE' && setPhase('DECRYPTING')}
      onPointerUp={() => phase === 'DECRYPTING' && setPhase('IDLE')}
      onPointerLeave={() => phase === 'DECRYPTING' && setPhase('IDLE')}
    >
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
          <color attach="background" args={['#020617']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} />
          
          <QuantumCore progress={progress} phase={phase} color={color} />
          
          {phase === 'REVEAL' && <RevealItem item={pack} color={color} />}

          <EffectComposer>
            <Bloom 
              luminanceThreshold={0.2} 
              luminanceSmoothing={0.9} 
              intensity={phase === 'FLASH' ? 50 : 2 + (progress / 20)} 
            />
            <ChromaticAberration 
              offset={new THREE.Vector2(
                (progress / 5000) + (phase === 'FLASH' ? 0.05 : 0), 
                (progress / 5000)
              )} 
            />
            <Noise opacity={0.2 + (progress / 500)} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Overlay UI */}
      <AnimatePresence>
        {(phase === 'IDLE' || phase === 'DECRYPTING') && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-32 pointer-events-none"
          >
            <h2 className="text-3xl font-black uppercase tracking-[0.3em] text-white/50 mb-8 animate-pulse">
              {phase === 'IDLE' ? 'Hold to Decrypt' : 'Overloading Core...'}
            </h2>
            
            {/* Progress Bar */}
            <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden border border-white/20">
              <div 
                className="h-full transition-all duration-75 ease-out"
                style={{ 
                  width: `${progress}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 20px ${color}`
                }}
              />
            </div>
          </motion.div>
        )}

        {phase === 'FLASH' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-white"
          />
        )}

        {phase === 'REVEAL' && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-end pb-32 pointer-events-none"
          >
            <h3 className="text-xl font-bold uppercase tracking-[0.4em] text-white/50 mb-2">
              {pack.rarity}
            </h3>
            <h1 className="text-6xl font-black uppercase tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)] mb-12 text-center max-w-3xl">
              {pack.name}
            </h1>

            <button
              onClick={onComplete}
              className="pointer-events-auto px-12 py-4 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-black uppercase tracking-widest rounded-full backdrop-blur-md transition-all hover:scale-105"
            >
              Collect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
