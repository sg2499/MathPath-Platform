'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PackItem {
  id: string;
  name: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

interface AlphaPackUnboxCinematicProps {
  pack: PackItem;
  onComplete: () => void;
}

export function AlphaPackUnboxCinematic({ pack, onComplete }: AlphaPackUnboxCinematicProps) {
  const [phase, setPhase] = useState<'IDLE' | 'SHAKING' | 'FLASH' | 'REVEAL'>('IDLE');

  // Hardcoded colors matching Siege style for the flash and particle bursts
  const RarityColors = {
    COMMON: 'rgba(148, 163, 184, 1)',
    UNCOMMON: 'rgba(16, 185, 129, 1)',
    RARE: 'rgba(6, 182, 212, 1)',
    EPIC: 'rgba(168, 85, 247, 1)',
    LEGENDARY: 'rgba(234, 179, 8, 1)',
  };

  const flashColor = RarityColors[pack.rarity] || RarityColors.COMMON;

  // The Unboxing State Machine Sequence
  useEffect(() => {
    // 1. Shaking builds anticipation
    setPhase('SHAKING');
    
    // 2. The massive Rarity color flash (2.5 seconds later)
    const flashTimer = setTimeout(() => {
      setPhase('FLASH');
    }, 2500);

    // 3. The actual item reveal
    const revealTimer = setTimeout(() => {
      setPhase('REVEAL');
    }, 3000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(revealTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-center overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black opacity-80" />

      {/* The Pack / Chest Object */}
      {phase !== 'REVEAL' && (
        <motion.div
          animate={
            phase === 'SHAKING' ? {
              x: [-10, 10, -15, 15, -20, 20, -5, 5, 0],
              y: [-5, 5, -10, 10, -5, 5, 0],
              scale: [1, 1.05, 1, 1.1, 1.05],
              filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)']
            } : {}
          }
          transition={
            phase === 'SHAKING' ? {
              duration: 2.5,
              ease: "easeInOut",
              times: [0, 0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1]
            } : {}
          }
          className="relative z-20 w-64 h-80 bg-slate-800 rounded-lg border-4 border-slate-600 shadow-2xl flex items-center justify-center"
        >
          {/* Faux 3D details for the pack */}
          <div className="absolute inset-2 border-2 border-slate-700 rounded-sm" />
          <div className="w-16 h-16 bg-slate-900 rounded-full border-4 border-slate-500 shadow-inner flex items-center justify-center">
            <div className="w-8 h-8 bg-indigo-500 rounded-full animate-pulse" />
          </div>
        </motion.div>
      )}

      {/* The Blinding Rarity Flash */}
      {phase === 'FLASH' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 5 }}
          className="absolute z-30 w-full h-full rounded-full blur-3xl"
          style={{ backgroundColor: flashColor }}
        />
      )}

      {/* The Reveal */}
      {phase === 'REVEAL' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 1 }}
          className="relative z-40 flex flex-col items-center"
        >
          {/* Intense Backlight Halo */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 blur-[100px] opacity-70 pointer-events-none"
            style={{ backgroundColor: flashColor }}
          />

          {/* The Item */}
          <div className="w-64 h-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex items-center justify-center relative overflow-hidden">
             {/* Faux 3D Pedestal reflection */}
             <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-white/10 to-transparent" />
             <div className="text-6xl z-10 drop-shadow-2xl">🏆</div>
          </div>

          <div className="mt-12 text-center z-10">
            <h2 className="text-6xl font-black uppercase tracking-tighter text-white drop-shadow-xl mb-2">
              {pack.name}
            </h2>
            <div 
              className="px-6 py-2 rounded-full inline-block font-bold uppercase tracking-widest text-black shadow-lg"
              style={{ backgroundColor: flashColor }}
            >
              {pack.rarity}
            </div>
          </div>

          <button
            onClick={onComplete}
            className="mt-16 px-8 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full font-bold uppercase tracking-widest backdrop-blur-md transition-all"
          >
            Continue
          </button>
        </motion.div>
      )}

    </div>
  );
}
