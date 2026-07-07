'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { RankBadge } from './RankBadge';
import { RankInspectionModal } from './RankInspectionModal';
import { Coins, Sparkles } from 'lucide-react';

export interface StudentWalletProps {
  currentXp: number;
  currentRankTier?: string;
  coinBalance: number;
  className?: string;
}

const TIER_THRESHOLDS = [
  { xp: 27800, tier: 'CHAMPION' },
  { xp: 26300, tier: 'DIAMOND_I' },
  { xp: 24800, tier: 'DIAMOND_II' },
  { xp: 23300, tier: 'DIAMOND_III' },
  { xp: 22200, tier: 'EMERALD_I' },
  { xp: 21100, tier: 'EMERALD_II' },
  { xp: 20000, tier: 'EMERALD_III' },
  { xp: 18900, tier: 'EMERALD_IV' },
  { xp: 17800, tier: 'EMERALD_V' },
  { xp: 16800, tier: 'PLATINUM_I' },
  { xp: 15850, tier: 'PLATINUM_II' },
  { xp: 14900, tier: 'PLATINUM_III' },
  { xp: 13950, tier: 'PLATINUM_IV' },
  { xp: 13000, tier: 'PLATINUM_V' },
  { xp: 12200, tier: 'GOLD_I' },
  { xp: 11400, tier: 'GOLD_II' },
  { xp: 10600, tier: 'GOLD_III' },
  { xp: 9800,  tier: 'GOLD_IV' },
  { xp: 9000,  tier: 'GOLD_V' },
  { xp: 8300,  tier: 'SILVER_I' },
  { xp: 7600,  tier: 'SILVER_II' },
  { xp: 6900,  tier: 'SILVER_III' },
  { xp: 6200,  tier: 'SILVER_IV' },
  { xp: 5500,  tier: 'SILVER_V' },
  { xp: 4900,  tier: 'BRONZE_I' },
  { xp: 4300,  tier: 'BRONZE_II' },
  { xp: 3700,  tier: 'BRONZE_III' },
  { xp: 3100,  tier: 'BRONZE_IV' },
  { xp: 2500,  tier: 'BRONZE_V' },
  { xp: 2000,  tier: 'COPPER_I' },
  { xp: 1500,  tier: 'COPPER_II' },
  { xp: 1000,  tier: 'COPPER_III' },
  { xp: 500,   tier: 'COPPER_IV' },
  { xp: 0,     tier: 'COPPER_V' }
];

export function getRankTierFromXp(xp: number): string {
  for (const entry of TIER_THRESHOLDS) {
    if (xp >= entry.xp) {
      return entry.tier;
    }
  }
  return 'COPPER_V';
}

export function StudentWallet({ currentXp, currentRankTier, coinBalance, className }: StudentWalletProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Resolve rank tier dynamically if not explicitly provided
  const resolvedRankTier = currentRankTier || getRankTierFromXp(currentXp);

  // Find progress towards next tier
  let currentTierMinXp = 0;
  let nextTierMinXp = 1000;

  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (currentXp >= TIER_THRESHOLDS[i].xp) {
      currentTierMinXp = TIER_THRESHOLDS[i].xp;
      nextTierMinXp = i > 0 ? TIER_THRESHOLDS[i - 1].xp : currentTierMinXp + 2000;
    }
  }

  const xpProgress = currentXp - currentTierMinXp;
  const xpNeeded = nextTierMinXp - currentTierMinXp;
  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100));
  const rankDisplayName = resolvedRankTier.replace('_', ' ');

  // 3D HUD Mouse Tilt effect variables
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), { stiffness: 300, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-10, 10]), { stiffness: 300, damping: 20 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left - width / 2;
    const mouseY = event.clientY - rect.top - height / 2;
    x.set(mouseX / width);
    y.set(mouseY / height);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "flex flex-col sm:flex-row items-center gap-6 p-5 rounded-3xl transition-all duration-300 select-none",
          "bg-slate-950/90 light:bg-slate-950/85 border border-slate-800/80 dark:border-indigo-500/30",
          "shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] dark:shadow-[0_0_50px_rgba(99,102,241,0.15)] hover:border-slate-700 dark:hover:border-indigo-400/50",
          className
        )}
      >
        
        {/* Left Side: Interactive Rank Badge Core */}
        <div 
          onClick={() => setIsModalOpen(true)}
          className="relative flex items-center justify-center group cursor-pointer"
          style={{ transform: "translateZ(30px)" }}
        >
          {/* Neon energy rings around badge */}
          <div className="absolute w-28 h-28 border-2 border-indigo-500/30 rounded-full animate-ping pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute w-24 h-24 border border-purple-500/40 rounded-full animate-spin pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <RankBadge 
            tier={resolvedRankTier} 
            size="lg" 
            className="drop-shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-transform duration-500 group-hover:scale-110" 
          />
          
          {/* Micro-interaction label */}
          <div className="absolute -bottom-2 px-2 py-0.5 bg-indigo-600 rounded text-[8px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            INSPECT
          </div>
        </div>

        {/* Center: HUD XP Bar info */}
        <div 
          className="flex flex-col gap-3 flex-1 min-w-[220px] w-full"
          style={{ transform: "translateZ(15px)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">DIVISION LEVEL</span>
              <span className="text-xl font-black uppercase text-white tracking-tighter drop-shadow-sm mt-1.5">{rankDisplayName}</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-black text-indigo-400">XP METRIC</span>
              </div>
              <span className="text-[10px] font-black text-slate-400 mt-1.5">{xpProgress.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
            </div>
          </div>

          {/* Heavy Chiseled Shimmering Progress Bar */}
          <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner group hover:ring-2 hover:ring-indigo-500/40 transition-all">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 rounded-full relative"
            >
              {/* Animated glass shine */}
              <div className="absolute inset-0 w-[200%] bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[mathShimmer_2.5s_infinite]" />
            </motion.div>
          </div>
        </div>

        {/* Right Side: Game Ledger Coins Chip */}
        <div 
          className="group flex items-center gap-4 px-6 py-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700/60 shadow-lg hover:shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-all duration-300 hover:scale-105 hover:-translate-y-1 cursor-pointer overflow-hidden relative min-w-[160px]"
          style={{ transform: "translateZ(20px)" }}
        >
          {/* Shiny overlay sweep */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-400/5 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <div className="w-11 h-11 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_4px_10px_rgba(249,115,22,0.4)] group-hover:rotate-[360deg] transition-transform duration-700">
             <Coins className="w-6 h-6 text-white drop-shadow-md" />
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest leading-none">MATHCOINS</span>
            <span className="text-2xl font-black text-white mt-1.5 drop-shadow-sm tracking-tight">{coinBalance.toLocaleString()}</span>
          </div>
        </div>
        
      </motion.div>

      {/* Cinematic Modal Overlay */}
      <RankInspectionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        currentXp={currentXp} 
        currentRankTier={resolvedRankTier} 
      />
    </>
  );
}
