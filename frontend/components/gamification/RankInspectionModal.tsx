'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Award, Zap, Lock, CheckCircle2, ChevronRight } from 'lucide-react';
import { RankBadge } from './RankBadge';

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

  const currentIndex = RANK_LIST.indexOf(baseRank);

  // React Portal to body to bypass any parent styling constraints
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 md:p-8 pointer-events-auto">
          {/* Intense Cinematic Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/95 backdrop-blur-[30px]"
          />

          {/* Epic Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-7xl max-h-[90vh] bg-slate-950 border border-slate-800/80 rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col z-10"
          >
            {/* Top-Right Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 z-50 p-3 bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-full text-slate-400 hover:text-white transition-all hover:scale-105 shadow-xl hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Header Section */}
            <div className="relative p-10 md:p-14 pb-6 overflow-hidden border-b border-slate-800/60 bg-gradient-to-b from-slate-900/80 to-slate-950">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
              
              <div className="flex items-center gap-3 mb-3">
                <Award className="w-6 h-6 text-indigo-400" />
                <span className="text-sm font-black text-indigo-400 uppercase tracking-[0.2em] shadow-indigo-500/50">RANK CONQUEST ROADMAP</span>
              </div>
              <h2 className="text-5xl font-black text-white uppercase tracking-tighter drop-shadow-md">
                Division Pathway
              </h2>
              <p className="text-slate-400 text-lg mt-2 max-w-2xl">
                Track your ascension through the MathPath divisions. Conquer lessons to unlock legendary tiers.
              </p>
              
              <div className="absolute right-10 bottom-10 hidden md:block">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">TOTAL ACQUIRED XP</span>
                  <div className="text-4xl font-black text-white mt-1 tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {currentXp.toLocaleString()} <span className="text-lg text-slate-500">XP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Roadmap Body */}
            <div className="flex-1 overflow-y-auto p-10 md:p-14 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-black relative">
              {/* Background Grid Texture */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

              <div className="relative max-w-5xl mx-auto py-10">
                {/* Connecting Line (Underneath Badges) */}
                <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 bg-slate-900 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
                  {/* Glowing progress fill */}
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentIndex / (RANK_LIST.length - 1)) * 100}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.8)] relative"
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </motion.div>
                </div>

                {/* Rank Tiers Sequence */}
                <div className="relative flex justify-between items-center w-full">
                  {RANK_LIST.map((rankName, index) => {
                    const isCompleted = index < currentIndex;
                    const isActive = index === currentIndex;
                    const isLocked = index > currentIndex;

                    return (
                      <div key={rankName} className="flex flex-col items-center justify-center relative group">
                        
                        {/* Hover/Active Spotlight */}
                        {isActive && (
                          <div className="absolute -inset-10 bg-indigo-500/20 rounded-full blur-[40px] pointer-events-none animate-pulse" />
                        )}

                        <div className={cn(
                          "relative z-10 transition-all duration-500",
                          isLocked ? "grayscale opacity-40 scale-75 blur-[1px] hover:blur-none hover:grayscale-0 hover:opacity-100" : isActive ? "scale-125 z-20" : "scale-90 opacity-80"
                        )}>
                          <RankBadge 
                            tier={isActive ? currentRankTier : rankName} 
                            size={isActive ? "lg" : "md"} 
                            className={cn("pointer-events-auto", isActive && "drop-shadow-[0_0_30px_rgba(99,102,241,0.5)]")}
                          />
                          
                          {/* Status Icon Overlay */}
                          {isCompleted && (
                            <div className="absolute -bottom-2 -right-2 bg-slate-900 rounded-full p-1 border border-indigo-500 shadow-lg">
                              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            </div>
                          )}
                          {isLocked && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-950/80 rounded-full p-2.5 border border-slate-800 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                              <Lock className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                        </div>

                        {/* Rank Label Below */}
                        <div className={cn(
                          "mt-6 flex flex-col items-center transition-all duration-300",
                          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 absolute -bottom-12"
                        )}>
                          <span className={cn(
                            "text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap",
                            isActive ? "text-indigo-400" : isCompleted ? "text-slate-400" : "text-slate-600"
                          )}>
                            {rankName}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-md">
                              CURRENT
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Motivational Footer Banner */}
              <div className="mt-16 mx-auto max-w-3xl bg-gradient-to-r from-indigo-950/30 via-purple-900/20 to-indigo-950/30 border border-indigo-500/20 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6 shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-indigo-950/50 flex items-center justify-center border border-indigo-500/30 shrink-0">
                  <Zap className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white uppercase tracking-tight">The Grind Continues</h4>
                  <p className="text-sm text-indigo-200/70 leading-relaxed font-medium mt-1">
                    "Only those who commit to the grind of the equation will stand atop the Champion podium. Your path is set. Conquer the next lesson."
                  </p>
                </div>
                <div className="shrink-0 md:ml-auto">
                  <button onClick={onClose} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-colors shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center gap-2">
                    Back to Dashboard <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
