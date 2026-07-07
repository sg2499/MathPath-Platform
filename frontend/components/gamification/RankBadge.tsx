'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface RankBadgeProps {
  tier: string;
  globalRank?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Helper to determine the SVG shape/paths and gradients for each Rank
const getRankBadgeDesign = (rank: string) => {
  switch (rank) {
    case 'COPPER':
      return {
        gradientId: 'grad-copper',
        gradient: (
          <linearGradient id="grad-copper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c2d12" />
            <stop offset="50%" stopColor="#c2410c" />
            <stop offset="100%" stopColor="#431407" />
          </linearGradient>
        ),
        glowColor: 'rgba(249, 115, 22, 0.4)',
        // Rough octagon shape
        path: "M 50 8 L 88 25 L 88 75 L 50 92 L 12 75 L 12 25 Z",
        innerPath: "M 50 15 L 80 30 L 80 70 L 50 85 L 20 70 L 20 30 Z",
        textColor: 'text-orange-100',
        strokeColor: '#ea580c',
      };
    case 'BRONZE':
      return {
        gradientId: 'grad-bronze',
        gradient: (
          <linearGradient id="grad-bronze" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="50%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
        ),
        glowColor: 'rgba(217, 119, 6, 0.4)',
        // Heavy shield shape
        path: "M 50 8 L 85 22 L 80 68 L 50 92 L 20 68 L 15 22 Z",
        innerPath: "M 50 16 L 77 28 L 73 63 L 50 83 L 27 63 L 23 28 Z",
        textColor: 'text-amber-100',
        strokeColor: '#f59e0b',
      };
    case 'SILVER':
      return {
        gradientId: 'grad-silver',
        gradient: (
          <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        ),
        glowColor: 'rgba(148, 163, 184, 0.4)',
        // Winged chevron shield
        path: "M 50 12 L 78 22 L 88 52 L 78 62 L 50 88 L 22 62 L 12 52 L 22 22 Z",
        innerPath: "M 50 20 L 72 28 L 80 50 L 72 58 L 50 78 L 28 58 L 20 50 L 28 28 Z",
        textColor: 'text-slate-100',
        strokeColor: '#cbd5e1',
      };
    case 'GOLD':
      return {
        gradientId: 'grad-gold',
        gradient: (
          <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#854d0e" />
          </linearGradient>
        ),
        glowColor: 'rgba(234, 179, 8, 0.5)',
        // Crowned shield
        path: "M 20 28 L 35 15 L 50 28 L 65 15 L 80 28 L 80 65 L 50 92 L 20 65 Z",
        innerPath: "M 26 34 L 37 25 L 50 35 L 63 25 L 74 34 L 74 60 L 50 82 L 26 60 Z",
        textColor: 'text-yellow-950 font-black',
        strokeColor: '#facc15',
      };
    case 'PLATINUM':
      return {
        gradientId: 'grad-platinum',
        gradient: (
          <linearGradient id="grad-platinum" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="50%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#155e75" />
          </linearGradient>
        ),
        glowColor: 'rgba(6, 182, 212, 0.6)',
        // Sharp star/hex design
        path: "M 50 6 L 86 26 L 86 74 L 50 94 L 14 74 L 14 26 Z",
        innerPath: "M 50 14 L 80 30 L 80 70 L 50 86 L 20 70 L 20 30 Z",
        textColor: 'text-cyan-950 font-black',
        strokeColor: '#22d3ee',
      };
    case 'EMERALD':
      return {
        gradientId: 'grad-emerald',
        gradient: (
          <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>
        ),
        glowColor: 'rgba(16, 185, 129, 0.6)',
        // Sharp crystal shard
        path: "M 50 6 L 88 34 L 72 82 L 50 94 L 28 82 L 12 34 Z",
        innerPath: "M 50 15 L 80 38 L 68 76 L 50 85 L 32 76 L 20 38 Z",
        textColor: 'text-emerald-950 font-black',
        strokeColor: '#34d399',
      };
    case 'DIAMOND':
      return {
        gradientId: 'grad-diamond',
        gradient: (
          <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="40%" stopColor="#818cf8" />
            <stop offset="70%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#312e81" />
          </linearGradient>
        ),
        glowColor: 'rgba(99, 102, 241, 0.7)',
        // Prismatic diamond cut
        path: "M 50 6 L 86 28 L 86 72 L 50 94 L 14 72 L 14 28 Z",
        innerPath: "M 50 15 L 78 33 L 78 67 L 50 85 L 22 67 L 22 33 Z",
        textColor: 'text-white font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]',
        strokeColor: '#a5b4fc',
      };
    case 'CHAMPION':
    default:
      return {
        gradientId: 'grad-champion',
        gradient: (
          <linearGradient id="grad-champion" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fda4af" />
            <stop offset="30%" stopColor="#f43f5e" />
            <stop offset="70%" stopColor="#be123c" />
            <stop offset="100%" stopColor="#4c0519" />
          </linearGradient>
        ),
        glowColor: 'rgba(244, 63, 94, 0.8)',
        // Winged Royal Crown
        path: "M 12 38 L 30 22 L 50 38 L 70 22 L 88 38 L 80 76 L 50 94 L 20 76 Z",
        innerPath: "M 20 44 L 32 32 L 50 44 L 68 32 L 80 44 L 73 70 L 50 85 L 27 70 Z",
        textColor: 'text-white font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]',
        strokeColor: '#f43f5e',
      };
  }
};

const SIZE_CLASSES = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
  xl: 'w-36 h-36',
};

const FONT_SIZES = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-lg',
  xl: 'text-2xl',
};

export function RankBadge({ tier, globalRank, className, size = 'md' }: RankBadgeProps) {
  const parts = tier.split('_');
  const baseRank = parts[0] || 'COPPER';
  const numeral = parts[1] || '';

  const isChampion = baseRank === 'CHAMPION';
  const displayNumeral = isChampion && globalRank ? `#${globalRank}` : numeral;

  const design = getRankBadgeDesign(baseRank);
  const sizeClass = SIZE_CLASSES[size];
  const fontSizeClass = FONT_SIZES[size];

  return (
    <motion.div
      whileHover={{ 
        scale: 1.1, 
        rotate: [0, -3, 3, 0],
        filter: `drop-shadow(0 0 16px ${design.glowColor})`
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      className={cn(
        'relative flex items-center justify-center select-none cursor-pointer',
        sizeClass,
        className
      )}
      style={{
        filter: `drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))`
      }}
    >
      {/* Dynamic SVG Emblem Asset */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full drop-shadow-lg"
      >
        <defs>
          {design.gradient}
          <filter id="badge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Pulsing Aura Ring for Elite Tiers */}
        {(baseRank === 'DIAMOND' || baseRank === 'CHAMPION' || baseRank === 'PLATINUM' || baseRank === 'EMERALD') && (
          <motion.path
            d={design.path}
            fill="none"
            stroke={design.strokeColor}
            strokeWidth="3"
            opacity="0.3"
            animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: '50% 50%' }}
          />
        )}

        {/* Outer 3D Shield Base */}
        <path
          d={design.path}
          fill={`url(#${design.gradientId})`}
          stroke={design.strokeColor}
          strokeWidth="2.5"
          filter="url(#badge-glow)"
        />

        {/* Inner Plate for 3D Bevel/Chisel Effect */}
        <path
          d={design.innerPath}
          fill="rgba(0, 0, 0, 0.25)"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="1.5"
        />

        {/* Highlight sheen lines */}
        <path
          d="M 50 10 L 80 25"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Centered Metallic Roman Numeral */}
      <div 
        className={cn(
          "relative z-10 font-black tracking-tight select-none pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]",
          design.textColor,
          fontSizeClass
        )}
      >
        {displayNumeral}
      </div>
    </motion.div>
  );
}
