'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import { Icosahedron, Sphere, Sparkles, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { api, apiErrorMessage } from '@/lib/api';

interface PackItem {
  id: string;
  name: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
}

interface WonItem extends PackItem {
  is_duplicate?: boolean;
  fragments_awarded?: number;
  description?: string;
  type?: string;
  series?: string;
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
  const [wonItem, setWonItem] = useState<WonItem | null>(null);
  const [unboxError, setUnboxError] = useState<string | null>(null);
  
  // The color starts as the pack's rarity color, but changes to the won item's rarity color if available
  const displayRarity = wonItem?.rarity || pack.rarity;
  const color = RarityColors[displayRarity] || RarityColors.COMMON;

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
      let isMounted = true;
      
      const doUnbox = async () => {
        try {
          const res = await api.post('/student/gamification/vault/unbox', {
            lootbox_id: pack.id
          });
          
          if (isMounted) {
            const data = res.data;
            setWonItem({
              id: data.item.id,
              name: data.item.name,
              rarity: data.item.rarity,
              is_duplicate: data.is_duplicate,
              fragments_awarded: data.fragments_awarded,
              description: data.item.description,
              type: data.item.type,
              series: data.item.series
            });
            setTimeout(() => setPhase('REVEAL'), 1000); 
          }
        } catch (err) {
          if (isMounted) {
            setUnboxError(apiErrorMessage(err));
            setTimeout(() => setPhase('REVEAL'), 1000);
          }
        }
      };
      
      doUnbox();
      return () => { isMounted = false; };
    }
  }, [phase, pack.id]);

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
          
          {phase === 'REVEAL' && wonItem && <RevealItem item={wonItem} color={color} />}

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
          >
            <div className="text-center w-full max-w-2xl mx-auto flex flex-col gap-8 items-center">
              {unboxError ? (
                <h2 className="text-4xl font-black text-red-500">{unboxError}</h2>
              ) : wonItem ? (
                <>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1, duration: 0.8, type: 'spring' }}
                    className="flex flex-col items-center gap-3"
                  >
                    <span 
                      className="text-sm font-black uppercase tracking-[0.3em] drop-shadow-md"
                      style={{ color }}
                    >
                      {wonItem.rarity} {wonItem.type}
                    </span>
                    <h2 className="text-6xl font-black text-white drop-shadow-2xl">
                      {wonItem.name}
                    </h2>
                    {wonItem.series && (
                      <p className="text-lg text-slate-300 italic">
                        {wonItem.series}
                      </p>
                    )}
                  </motion.div>
                  
                  {wonItem.is_duplicate && (
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 1.5 }}
                      className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mt-4 max-w-md w-full"
                    >
                      <h3 className="text-orange-400 font-bold mb-2 uppercase tracking-wider text-sm flex justify-center items-center gap-2">
                        Duplicate Converted
                      </h3>
                      <p className="text-white text-lg">
                        +{wonItem.fragments_awarded} Quantum Fragments
                      </p>
                      <p className="text-slate-400 text-xs mt-2">
                        Use fragments in The Forge to craft specific caches.
                      </p>
                    </motion.div>
                  )}
                </>
              ) : (
                <h2 className="text-6xl font-black text-white drop-shadow-2xl">
                  {pack.name}
                </h2>
              )}
              
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.5 }}
                onClick={onComplete}
                className="mt-12 px-12 py-4 rounded-full bg-white text-slate-950 font-black tracking-widest uppercase hover:scale-105 hover:bg-orange-500 hover:text-white transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)]"
              >
                Claim & Continue
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
