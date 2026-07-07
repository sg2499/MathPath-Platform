'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { RankBadge } from './RankBadge';
import { Coins } from 'lucide-react';

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
  // Resolve rank tier dynamically if not explicitly provided
  const resolvedRankTier = currentRankTier || getRankTierFromXp(currentXp);

  // Find progress towards next tier
  // Finding closest threshold bounds
  let currentTierMinXp = 0;
  let nextTierMinXp = 1000;

  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (currentXp >= TIER_THRESHOLDS[i].xp) {
      currentTierMinXp = TIER_THRESHOLDS[i].xp;
      nextTierMinXp = i > 0 ? TIER_THRESHOLDS[i - 1].xp : currentTierMinXp + 2000; // default range for Champion
    }
  }

  const xpProgress = currentXp - currentTierMinXp;
  const xpNeeded = nextTierMinXp - currentTierMinXp;
  const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100));

  const rankDisplayName = resolvedRankTier.replace('_', ' ');

  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-6 p-4 bg-white/20 dark:bg-slate-900/35 border border-white/40 dark:border-white/10 rounded-3xl shadow-xl backdrop-blur-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] select-none", className)}>
      
      {/* Huge, Detailed Rank Badge on Left */}
      <div className="relative flex items-center justify-center group">
        <RankBadge tier={resolvedRankTier} size="lg" className="drop-shadow-[0_0_15px_rgba(253,224,71,0.3)] transition-transform duration-500 group-hover:scale-110" />
        
        {/* Glow behind badge */}
        <div className="absolute inset-0 -z-10 bg-indigo-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      {/* Level details & XP bar */}
      <div className="flex flex-col gap-3 flex-1 min-w-[220px] w-full">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">CURRENT RANK</span>
            <span className="text-xl font-black uppercase text-slate-800 dark:text-white tracking-tighter drop-shadow-sm mt-1">{rankDisplayName}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">LEVEL PROGRESS</span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">{xpProgress.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
          </div>
        </div>

        {/* Thick, Highly Interactive Progress Bar */}
        <div className="relative w-full h-4 bg-slate-200 dark:bg-slate-800/80 rounded-full overflow-hidden border border-slate-300/40 dark:border-slate-700/50 shadow-inner group cursor-pointer hover:ring-2 hover:ring-indigo-500/30 transition-all">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 rounded-full relative"
          >
            {/* Moving glow sheen */}
            <div className="absolute inset-0 w-[200%] bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[mathShimmer_2.5s_infinite]" />
          </motion.div>
        </div>
      </div>

      {/* Reconstructed clean and proper Coins Chip with absolute game-tier styles */}
      <div className="group flex items-center gap-4 px-6 py-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-orange-950/40 dark:to-orange-900/20 border border-orange-200/60 dark:border-orange-500/30 shadow-md hover:shadow-[0_15px_40px_rgba(245,158,11,0.25)] transition-all duration-500 hover:scale-105 hover:-translate-y-1 cursor-pointer overflow-hidden relative min-w-[160px]">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-400/10 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        {/* Large pulsing coin container */}
        <div className="w-11 h-11 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_4px_10px_rgba(249,115,22,0.4)] group-hover:scale-110 transition-transform duration-300">
           <Coins className="w-6 h-6 text-white drop-shadow-md animate-pulse" />
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest leading-none">MATHCOINS</span>
          <span className="text-2xl font-black text-orange-900 dark:text-orange-400 mt-1 drop-shadow-sm tracking-tight">{coinBalance.toLocaleString()}</span>
        </div>
      </div>
      
    </div>
  );
}
