'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// Tier formats e.g. "COPPER_V", "DIAMOND_I", "CHAMPION"
export interface RankBadgeProps {
  tier: string;
  globalRank?: number; // For Champion leaderboards
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const RANK_BASE_STYLES: Record<string, string> = {
  COPPER: 'bg-gradient-to-br from-red-900 to-orange-900 border-orange-800/50 shadow-orange-900/40 text-orange-200',
  BRONZE: 'bg-gradient-to-br from-amber-700 to-amber-950 border-amber-600/50 shadow-amber-900/40 text-amber-200',
  SILVER: 'bg-gradient-to-br from-slate-300 to-slate-500 border-slate-200/50 shadow-slate-400/40 text-slate-100',
  GOLD: 'bg-gradient-to-br from-yellow-300 to-yellow-600 border-yellow-200/50 shadow-yellow-500/50 text-yellow-950',
  PLATINUM: 'bg-gradient-to-br from-cyan-300 to-cyan-600 border-cyan-200/50 shadow-cyan-500/50 text-cyan-950',
  EMERALD: 'bg-gradient-to-br from-emerald-400 to-emerald-700 border-emerald-300/50 shadow-emerald-500/50 text-emerald-950',
  DIAMOND: 'bg-gradient-to-br from-indigo-300 via-purple-400 to-purple-600 border-indigo-200/50 shadow-purple-500/50 text-white',
  CHAMPION: 'bg-gradient-to-br from-rose-500 via-pink-600 to-red-700 border-pink-300/50 shadow-rose-600/60 text-white',
};

const SIZE_STYLES = {
  sm: 'w-8 h-8 text-[10px] border',
  md: 'w-12 h-12 text-sm border-2',
  lg: 'w-20 h-20 text-xl border-4',
  xl: 'w-32 h-32 text-3xl border-4',
};

export function RankBadge({ tier, globalRank, className, size = 'md' }: RankBadgeProps) {
  const parts = tier.split('_');
  const baseRank = parts[0] || 'COPPER';
  const numeral = parts[1] || '';

  const isChampion = baseRank === 'CHAMPION';
  const displayNumeral = isChampion && globalRank ? `#${globalRank}` : numeral;
  
  const baseStyle = RANK_BASE_STYLES[baseRank] || RANK_BASE_STYLES.COPPER;
  const sizeStyle = SIZE_STYLES[size];

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'relative flex items-center justify-center font-black flex-col uppercase tracking-tighter',
        'rounded-md shadow-lg transform transition-all duration-300 backdrop-blur-sm',
        baseStyle,
        sizeStyle,
        className
      )}
    >
      {/* 3D Inner Glare */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent rounded-sm pointer-events-none" />
      
      {/* The Numerals / Rank Text */}
      <span className="relative z-10 drop-shadow-md">
        {displayNumeral}
      </span>
    </motion.div>
  );
}
