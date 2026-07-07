'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { RankBadge } from './RankBadge';
import { Coins, Trophy } from 'lucide-react';

export interface StudentWalletProps {
  currentXp: number;
  currentRankTier: string;
  coinBalance: number;
  className?: string;
}

export function StudentWallet({ currentXp, currentRankTier, coinBalance, className }: StudentWalletProps) {
  // Simplified mock of XP to next tier for visual progress bar.
  // In a real scenario, this would come from the backend's XP thresholds.
  const progressPercent = (currentXp % 1000) / 1000 * 100;

  return (
    <div className={cn("flex items-center gap-3 bg-slate-100 dark:bg-slate-900/50 p-1.5 pr-4 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md", className)}>
      
      {/* The Rank Badge */}
      <div className="relative group cursor-pointer">
        <RankBadge tier={currentRankTier} size="sm" className="rounded-full" />
        {/* Tooltip on hover */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-slate-900 text-white text-[10px] uppercase font-bold py-1 px-2 rounded-md whitespace-nowrap shadow-xl">
          {currentRankTier.replace('_', ' ')} • {currentXp} XP
        </div>
      </div>

      <div className="flex flex-col gap-1 w-24">
        {/* XP Bar */}
        <div className="w-full h-1.5 bg-slate-300 dark:bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-indigo-500 rounded-full"
          />
        </div>
        
        {/* Coin Balance */}
        <div className="flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-amber-500 drop-shadow-[0_0_2px_rgba(245,158,11,0.5)]" />
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 tracking-tight">
            {coinBalance.toLocaleString()}
          </span>
        </div>
      </div>
      
    </div>
  );
}
