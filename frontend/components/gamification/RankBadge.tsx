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

const getRankBadgeDesign = (rank: string) => {
  switch (rank) {
    case 'COPPER':
      return {
        gradientId: 'grad-copper',
        gradient: (
          <linearGradient id="grad-copper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c2410c" />
            <stop offset="30%" stopColor="#9a3412" />
            <stop offset="70%" stopColor="#431407" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
        ),
        glowColor: 'rgba(194, 65, 12, 0.5)',
        path: "M 50 8 L 88 25 L 88 75 L 50 92 L 12 75 L 12 25 Z",
        innerPath: "M 50 16 L 80 30 L 80 70 L 50 84 L 20 70 L 20 30 Z",
        textColor: 'text-orange-200 font-extrabold',
        strokeColor: '#ea580c',
        extraElements: (
          <g opacity="0.8">
            <line x1="20" y1="50" x2="80" y2="50" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="50" cy="50" r="18" fill="none" stroke="#ea580c" strokeWidth="3" />
          </g>
        )
      };
    case 'BRONZE':
      return {
        gradientId: 'grad-bronze',
        gradient: (
          <linearGradient id="grad-bronze" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="40%" stopColor="#b45309" />
            <stop offset="80%" stopColor="#78350f" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        ),
        glowColor: 'rgba(217, 119, 6, 0.5)',
        path: "M 50 8 L 85 22 L 80 68 L 50 92 L 20 68 L 15 22 Z",
        innerPath: "M 50 16 L 77 28 L 73 63 L 50 83 L 27 63 L 23 28 Z",
        textColor: 'text-amber-200 font-extrabold',
        strokeColor: '#f59e0b',
        extraElements: (
          <g opacity="0.9">
            <path d="M 30 40 L 50 25 L 70 40" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
            <path d="M 30 48 L 50 33 L 70 48" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
          </g>
        )
      };
    case 'SILVER':
      return {
        gradientId: 'grad-silver',
        gradient: (
          <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="70%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        ),
        glowColor: 'rgba(148, 163, 184, 0.5)',
        path: "M 50 12 L 78 22 L 88 52 L 78 62 L 50 88 L 22 62 L 12 52 L 22 22 Z",
        innerPath: "M 50 20 L 72 28 L 80 50 L 72 58 L 50 78 L 28 58 L 20 50 L 28 28 Z",
        textColor: 'text-slate-150 font-extrabold',
        strokeColor: '#e2e8f0',
        extraElements: (
          <g>
            <path d="M 8 52 L 25 52 M 75 52 L 92 52" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
            <path d="M 50 25 L 50 75" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
          </g>
        )
      };
    case 'GOLD':
      return {
        gradientId: 'grad-gold',
        gradient: (
          <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="30%" stopColor="#fbbf24" />
            <stop offset="70%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
        ),
        glowColor: 'rgba(250, 204, 21, 0.6)',
        path: "M 20 28 L 35 15 L 50 28 L 65 15 L 80 28 L 80 65 L 50 92 L 20 65 Z",
        innerPath: "M 26 34 L 37 25 L 50 35 L 63 25 L 74 34 L 74 60 L 50 82 L 26 60 Z",
        textColor: 'text-yellow-950 font-black',
        strokeColor: '#fef08a',
        extraElements: (
          <g>
            <polygon points="50,18 53,24 60,24 55,28 57,34 50,30 43,34 45,28 40,24 47,24" fill="#fef08a" />
            <circle cx="20" cy="28" r="3" fill="#fef08a" />
            <circle cx="50" cy="28" r="3" fill="#fef08a" />
            <circle cx="80" cy="28" r="3" fill="#fef08a" />
          </g>
        )
      };
    case 'PLATINUM':
      return {
        gradientId: 'grad-platinum',
        gradient: (
          <linearGradient id="grad-platinum" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="40%" stopColor="#06b6d4" />
            <stop offset="70%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#164e63" />
          </linearGradient>
        ),
        glowColor: 'rgba(6, 182, 212, 0.7)',
        path: "M 50 6 L 86 26 L 86 74 L 50 94 L 14 74 L 14 26 Z",
        innerPath: "M 50 14 L 80 30 L 80 70 L 50 86 L 20 70 L 20 30 Z",
        textColor: 'text-cyan-950 font-black',
        strokeColor: '#67e8f9',
        extraElements: (
          <g>
            <circle cx="50" cy="50" r="28" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.4" />
            <path d="M 50 14 L 50 86 M 14 50 L 86 50" stroke="#0891b2" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
          </g>
        )
      };
    case 'EMERALD':
      return {
        gradientId: 'grad-emerald',
        gradient: (
          <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="30%" stopColor="#10b981" />
            <stop offset="70%" stopColor="#047857" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>
        ),
        glowColor: 'rgba(16, 185, 129, 0.7)',
        path: "M 50 6 L 88 34 L 72 82 L 50 94 L 28 82 L 12 34 Z",
        innerPath: "M 50 15 L 80 38 L 68 76 L 50 85 L 32 76 L 20 38 Z",
        textColor: 'text-emerald-950 font-black',
        strokeColor: '#34d399',
        extraElements: (
          <g>
            <polygon points="50,15 54,35 74,35 58,47 64,67 50,55 36,67 42,47 26,35 46,35" fill="none" stroke="#a7f3d0" strokeWidth="2" opacity="0.7" />
          </g>
        )
      };
    case 'DIAMOND':
      return {
        gradientId: 'grad-diamond',
        gradient: (
          <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f3e8ff" />
            <stop offset="30%" stopColor="#c084fc" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#312e81" />
          </linearGradient>
        ),
        glowColor: 'rgba(168, 85, 247, 0.8)',
        path: "M 50 6 L 86 28 L 86 72 L 50 94 L 14 72 L 14 28 Z",
        innerPath: "M 50 15 L 78 33 L 78 67 L 50 85 L 22 67 L 22 33 Z",
        textColor: 'text-white font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]',
        strokeColor: '#e9d5ff',
        extraElements: (
          <g>
            {/* Prismatic gemstone facet lines */}
            <line x1="50" y1="6" x2="50" y2="94" stroke="#c084fc" strokeWidth="1" opacity="0.5" />
            <line x1="14" y1="28" x2="86" y2="72" stroke="#c084fc" strokeWidth="1" opacity="0.5" />
            <line x1="14" y1="72" x2="86" y2="28" stroke="#c084fc" strokeWidth="1" opacity="0.5" />
          </g>
        )
      };
    case 'CHAMPION':
    default:
      return {
        gradientId: 'grad-champion',
        gradient: (
          <linearGradient id="grad-champion" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe4e6" />
            <stop offset="25%" stopColor="#fb7185" />
            <stop offset="60%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4c0519" />
          </linearGradient>
        ),
        glowColor: 'rgba(225, 29, 72, 0.9)',
        path: "M 12 38 L 30 22 L 50 38 L 70 22 L 88 38 L 80 76 L 50 94 L 20 76 Z",
        innerPath: "M 20 44 L 32 32 L 50 44 L 68 32 L 80 44 L 73 70 L 50 85 L 27 70 Z",
        textColor: 'text-white font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]',
        strokeColor: '#fda4af',
        extraElements: (
          <g>
            <path d="M 12 38 C 5 50, 5 70, 20 76" fill="none" stroke="#f43f5e" strokeWidth="3" />
            <path d="M 88 38 C 95 50, 95 70, 80 76" fill="none" stroke="#f43f5e" strokeWidth="3" />
            <circle cx="50" cy="58" r="10" fill="none" stroke="#ffe4e6" strokeWidth="2.5" />
          </g>
        )
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
        scale: 1.15, 
        rotate: [0, -3, 3, 0],
        filter: `drop-shadow(0 0 25px ${design.glowColor})`
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      className={cn(
        'relative flex items-center justify-center select-none cursor-pointer',
        sizeClass,
        className
      )}
      style={{
        filter: `drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4))`
      }}
    >
      {/* Dynamic SVG Emblem Asset */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full drop-shadow-2xl overflow-visible"
      >
        <defs>
          {design.gradient}
          <filter id="ultra-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComponentTransfer in="blur" result="boost">
              <feFuncA type="linear" slope="1.5"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="boost" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Ring Glow */}
        <circle cx="50" cy="50" r="46" fill="none" stroke={design.strokeColor} strokeWidth="1" opacity="0.1" />

        {/* Outer 3D Shield Base */}
        <path
          d={design.path}
          fill={`url(#${design.gradientId})`}
          stroke={design.strokeColor}
          strokeWidth="3"
          filter="url(#ultra-glow)"
        />

        {/* Inner Plate for 3D Bevel/Chisel Effect */}
        <path
          d={design.innerPath}
          fill="rgba(15, 23, 42, 0.75)"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="2"
        />

        {/* Extra vector styling per rank (wings, stars, crosshairs) */}
        {design.extraElements}

        {/* Shiny Highlight Sheen Overlay */}
        <path
          d="M 25 25 L 75 75"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>

      {/* Centered Metallic Roman Numeral */}
      <div 
        className={cn(
          "relative z-10 font-black tracking-tight select-none pointer-events-none drop-shadow-[0_3px_5px_rgba(0,0,0,0.9)] uppercase",
          design.textColor,
          fontSizeClass
        )}
        style={{
          fontFamily: 'serif',
          textShadow: '0px 2px 4px rgba(0,0,0,0.8), 0px 0px 10px rgba(255,255,255,0.2)'
        }}
      >
        {displayNumeral}
      </div>
    </motion.div>
  );
}
