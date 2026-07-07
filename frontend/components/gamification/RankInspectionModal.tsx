'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, Stars, OrbitControls } from '@react-three/drei';
import { X, Award, Zap } from 'lucide-react';
import * as THREE from 'three';

// 3D Scene to render the Rank Core
function RankCore3D({ rank }: { rank: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const rankColors: Record<string, { color: string; emissive: string }> = {
    COPPER: { color: '#ea580c', emissive: '#7c2d12' },
    BRONZE: { color: '#fbbf24', emissive: '#b45309' },
    SILVER: { color: '#cbd5e1', emissive: '#475569' },
    GOLD: { color: '#fbbf24', emissive: '#b45309' },
    PLATINUM: { color: '#22d3ee', emissive: '#155e75' },
    EMERALD: { color: '#10b981', emissive: '#064e3b' },
    DIAMOND: { color: '#c084fc', emissive: '#4f46e5' },
    CHAMPION: { color: '#f43f5e', emissive: '#9f1239' },
  };

  const { color, emissive } = rankColors[rank] || rankColors.COPPER;

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.35;
      meshRef.current.rotation.x += delta * 0.15;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
      {rank === 'DIAMOND' || rank === 'CHAMPION' || rank === 'PLATINUM' ? (
        <mesh ref={meshRef}>
          <torusKnotGeometry args={[1.4, 0.38, 150, 16]} />
          <meshStandardMaterial 
            color={color} 
            emissive={emissive} 
            emissiveIntensity={3} 
            metalness={0.95} 
            roughness={0.05} 
          />
        </mesh>
      ) : (
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[1.7, 1]} />
          <meshStandardMaterial 
            color={color} 
            emissive={emissive} 
            emissiveIntensity={2} 
            metalness={0.8} 
            roughness={0.15} 
            wireframe
          />
        </mesh>
      )}
      <Sparkles count={100} scale={6} size={4} speed={0.5} color={color} />
    </Float>
  );
}

export interface RankInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentXp: number;
  currentRankTier: string;
}

const RANK_LIST = ['COPPER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'CHAMPION'];

export function RankInspectionModal({ isOpen, onClose, currentXp, currentRankTier }: RankInspectionModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  const parts = currentRankTier.split('_');
  const baseRank = parts[0] || 'COPPER';
  const numeral = parts[1] || '';

  const rankColors: Record<string, string> = {
    COPPER: 'from-orange-600 to-red-900 border-orange-500/50 shadow-orange-500/20 text-orange-450',
    BRONZE: 'from-amber-500 to-amber-900 border-amber-500/50 shadow-amber-500/20 text-amber-450',
    SILVER: 'from-slate-400 to-slate-700 border-slate-400/50 shadow-slate-400/20 text-slate-350',
    GOLD: 'from-yellow-400 to-yellow-750 border-yellow-400/50 shadow-yellow-400/20 text-yellow-450',
    PLATINUM: 'from-cyan-400 to-cyan-800 border-cyan-400/50 shadow-cyan-400/20 text-cyan-450',
    EMERALD: 'from-emerald-400 to-emerald-800 border-emerald-400/50 shadow-emerald-400/20 text-emerald-450',
    DIAMOND: 'from-purple-400 to-indigo-850 border-purple-400/50 shadow-purple-400/20 text-purple-455',
    CHAMPION: 'from-rose-500 to-red-950 border-rose-500/50 shadow-rose-500/20 text-rose-450',
  };

  const activeColorClass = rankColors[baseRank] || rankColors.COPPER;

  // React Portal to body to completely bypass tilt/transform container context
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 md:p-10 pointer-events-auto">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 40 }}
            transition={{ type: 'spring', damping: 22, stiffness: 150 }}
            className="relative w-full max-w-5xl h-[85vh] bg-slate-950/90 border border-slate-800/80 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row z-10"
          >
            
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 z-50 p-3 bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-full text-slate-400 hover:text-white transition-all hover:scale-105"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Side: 3D Holographic Display */}
            <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-slate-950 overflow-hidden flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-800/80">
              <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
                  <ambientLight intensity={0.6} />
                  <pointLight position={[10, 10, 10]} intensity={1.8} />
                  <directionalLight position={[-5, 5, -5]} intensity={0.6} />
                  <RankCore3D rank={baseRank} />
                  <Stars radius={100} depth={50} count={400} factor={5} saturation={0.6} fade speed={1.2} />
                  <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.6} />
                </Canvas>
              </div>

              {/* Title Overlay inside Canvas */}
              <div className="absolute bottom-8 text-center z-10 pointer-events-none">
                <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase leading-none">HOLOGRAPHIC CORE</span>
                <h3 className="text-3xl font-black text-white mt-2 uppercase tracking-tighter drop-shadow-lg">
                  {baseRank} {numeral}
                </h3>
              </div>
            </div>

            {/* Right Side: Detailed Progression HUD */}
            <div className="w-full md:w-1/2 h-1/2 md:h-full p-8 md:p-12 flex flex-col justify-between overflow-y-auto bg-slate-950/80">
              
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5 text-indigo-500" />
                  <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest">RANK CONQUEST SYSTEM</span>
                </div>
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter">
                  Progression Intel
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Resolve assessments, exams, and DPS sheets to scale the division.
                </p>
              </div>

              {/* Current Stats */}
              <div className="my-8 space-y-6">
                <div className="bg-slate-900/60 border border-slate-800/60 p-5 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">TOTAL ACQUIRED XP</span>
                  <div className="text-3xl font-black text-white mt-1 tracking-tight">
                    {currentXp.toLocaleString()} <span className="text-sm font-bold text-slate-500">XP</span>
                  </div>
                </div>

                {/* Division Path Checklist */}
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">RANK PATHWAYS</span>
                  <div className="flex flex-wrap gap-2">
                    {RANK_LIST.map((r) => {
                      const isCompleted = RANK_LIST.indexOf(r) < RANK_LIST.indexOf(baseRank);
                      const isActive = r === baseRank;
                      return (
                        <div 
                          key={r}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-tight transition-all",
                            isActive 
                              ? `bg-gradient-to-r ${activeColorClass} border-transparent text-white shadow-lg` 
                              : isCompleted 
                                ? "bg-slate-900 border-indigo-500/20 text-indigo-400 opacity-60" 
                                : "bg-slate-950 border-slate-800 text-slate-600"
                          )}
                        >
                          {r}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Motivations Footer */}
              <div className="bg-gradient-to-r from-indigo-950/20 to-purple-950/15 border border-indigo-500/10 p-4 rounded-xl flex items-start gap-3">
                <Zap className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-200/80 leading-relaxed font-semibold">
                  "Only those who commit to the grind of the equation will stand atop the Champion podium. Your path is set. Conquer the next lesson."
                </p>
              </div>

            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
