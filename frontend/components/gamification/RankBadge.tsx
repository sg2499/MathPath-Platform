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

// AAA Quality Immersive Badges using complex overlapping SVGs and intense glow filters
const getRankBadgeDesign = (rank: string) => {
  switch (rank) {
    case 'COPPER':
      return {
        coreColor: '#b45309',
        glowColor: 'rgba(180, 83, 9, 0.7)',
        textColor: '#fef3c7',
        textShadow: '0px 2px 4px #78350f, 0px 0px 10px #f59e0b, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-copper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="30%" stopColor="#d97706" />
            <stop offset="70%" stopColor="#92400e" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Gear-like industrial base */}
            <path d="M 30 10 L 70 10 L 90 30 L 90 70 L 70 90 L 30 90 L 10 70 L 10 30 Z" fill="#451a03" stroke="#92400e" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 30 10 L 70 10 L 90 30 L 90 70 L 70 90 L 30 90 L 10 70 L 10 30 Z" fill="url(#grad-copper)" opacity="0.9" />
            {/* Inner extruded plate */}
            <path d="M 35 20 L 65 20 L 80 35 L 80 65 L 65 80 L 35 80 L 20 65 L 20 35 Z" fill="#78350f" stroke="#f59e0b" strokeWidth="2" />
            {/* Rivets */}
            <circle cx="25" cy="50" r="3" fill="#fcd34d" />
            <circle cx="75" cy="50" r="3" fill="#fcd34d" />
            <circle cx="50" cy="25" r="3" fill="#fcd34d" />
            <circle cx="50" cy="75" r="3" fill="#fcd34d" />
            <circle cx="50" cy="50" r="28" fill="none" stroke="#b45309" strokeWidth="1" strokeDasharray="4 4"/>
          </>
        )
      };
    case 'BRONZE':
      return {
        coreColor: '#9a3412',
        glowColor: 'rgba(154, 52, 18, 0.7)',
        textColor: '#ffedd5',
        textShadow: '0px 2px 4px #431407, 0px 0px 10px #ea580c, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-bronze" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#fdba74" />
            <stop offset="40%" stopColor="#ea580c" />
            <stop offset="80%" stopColor="#9a3412" />
            <stop offset="100%" stopColor="#431407" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Spartan Shield */}
            <path d="M 50 5 L 90 20 L 85 60 C 85 80 50 95 50 95 C 50 95 15 80 15 60 L 10 20 Z" fill="#431407" stroke="#9a3412" strokeWidth="5" filter="url(#intense-glow)"/>
            <path d="M 50 5 L 90 20 L 85 60 C 85 80 50 95 50 95 C 50 95 15 80 15 60 L 10 20 Z" fill="url(#grad-bronze)" />
            {/* Inner layer */}
            <path d="M 50 15 L 80 28 L 75 58 C 75 75 50 85 50 85 C 50 85 25 75 25 58 L 20 28 Z" fill="#7c2d12" stroke="#fdba74" strokeWidth="2" />
            {/* Center cross/engraving */}
            <path d="M 50 15 L 50 85 M 25 45 L 75 45" stroke="#ea580c" strokeWidth="2" opacity="0.6"/>
          </>
        )
      };
    case 'SILVER':
      return {
        coreColor: '#0ea5e9',
        glowColor: 'rgba(14, 165, 233, 0.7)',
        textColor: '#f0f9ff',
        textShadow: '0px 2px 4px #0c4a6e, 0px 0px 15px #38bdf8, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#e0f2fe" />
            <stop offset="70%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#082f49" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Futuristic Chevron Base */}
            <path d="M 10 40 L 50 5 L 90 40 L 90 60 L 50 95 L 10 60 Z" fill="#082f49" stroke="#0ea5e9" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 10 40 L 50 5 L 90 40 L 90 60 L 50 95 L 10 60 Z" fill="url(#grad-silver)" opacity="0.9" />
            {/* Inner cutouts */}
            <path d="M 25 45 L 50 20 L 75 45 L 75 55 L 50 80 L 25 55 Z" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="3" />
            {/* Cyber lines */}
            <path d="M 50 20 L 50 80 M 25 45 L 75 45 M 25 55 L 75 55" stroke="#38bdf8" strokeWidth="1" opacity="0.5"/>
            <polygon points="45,45 55,45 55,55 45,55" fill="#38bdf8" />
          </>
        )
      };
    case 'GOLD':
      return {
        coreColor: '#eab308',
        glowColor: 'rgba(234, 179, 8, 0.8)',
        textColor: '#fefce8',
        textShadow: '0px 2px 5px #713f12, 0px 0px 18px #facc15, 0px 0px 2px #000',
        gradient: (
          <radialGradient id="grad-gold" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="80%" stopColor="#854d0e" />
            <stop offset="100%" stopColor="#422006" />
          </radialGradient>
        ),
        shape: (
          <>
            {/* Majestic Crown Star */}
            <path d="M 50 0 L 65 30 L 95 20 L 75 45 L 95 70 L 60 70 L 50 95 L 40 70 L 5 70 L 25 45 L 5 20 L 35 30 Z" fill="#422006" stroke="#ca8a04" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 50 0 L 65 30 L 95 20 L 75 45 L 95 70 L 60 70 L 50 95 L 40 70 L 5 70 L 25 45 L 5 20 L 35 30 Z" fill="url(#grad-gold)" />
            {/* Inner gem */}
            <circle cx="50" cy="50" r="22" fill="#713f12" stroke="#fde047" strokeWidth="3" />
            <circle cx="50" cy="50" r="16" fill="url(#grad-gold)" />
            {/* Sun rays */}
            <path d="M 50 20 L 50 10 M 80 50 L 90 50 M 50 80 L 50 90 M 20 50 L 10 50" stroke="#fef08a" strokeWidth="3" opacity="0.8" strokeLinecap="round" />
          </>
        )
      };
    case 'PLATINUM':
      return {
        coreColor: '#c084fc',
        glowColor: 'rgba(192, 132, 252, 0.9)',
        textColor: '#faf5ff',
        textShadow: '0px 2px 5px #4c1d95, 0px 0px 20px #d8b4fe, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-platinum" x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#f3e8ff" />
            <stop offset="25%" stopColor="#d8b4fe" />
            <stop offset="50%" stopColor="#9333ea" />
            <stop offset="80%" stopColor="#4c1d95" />
            <stop offset="100%" stopColor="#2e1065" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Crystalline matrix */}
            <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill="#2e1065" stroke="#c084fc" strokeWidth="4" filter="url(#intense-glow)"/>
            <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill="url(#grad-platinum)" opacity="0.8"/>
            <path d="M 50 15 L 80 32 L 80 68 L 50 85 L 20 68 L 20 32 Z" fill="#4c1d95" stroke="#f3e8ff" strokeWidth="2" />
            {/* Internal lattice */}
            <path d="M 50 15 L 50 85 M 20 32 L 80 68 M 20 68 L 80 32" stroke="#d8b4fe" strokeWidth="1.5" opacity="0.6"/>
            <circle cx="50" cy="50" r="15" fill="#f3e8ff" filter="url(#blur-glow)"/>
            <circle cx="50" cy="50" r="10" fill="#a855f7" />
          </>
        )
      };
    case 'EMERALD':
      return {
        coreColor: '#10b981',
        glowColor: 'rgba(16, 185, 129, 0.9)',
        textColor: '#ecfdf5',
        textShadow: '0px 2px 6px #064e3b, 0px 0px 20px #34d399, 0px 0px 3px #000',
        gradient: (
          <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="20%" stopColor="#34d399" />
            <stop offset="60%" stopColor="#059669" />
            <stop offset="100%" stopColor="#022c22" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Fractal emerald cluster */}
            <path d="M 50 0 L 80 30 L 95 60 L 50 95 L 5 60 L 20 30 Z" fill="#022c22" stroke="#10b981" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 50 0 L 80 30 L 95 60 L 50 95 L 5 60 L 20 30 Z" fill="url(#grad-emerald)" opacity="0.9"/>
            <path d="M 50 15 L 70 35 L 80 55 L 50 80 L 20 55 L 30 35 Z" fill="#064e3b" stroke="#6ee7b7" strokeWidth="2" />
            {/* Fractal lines */}
            <path d="M 50 0 L 50 95 M 5 60 L 95 60 M 20 30 L 80 30" stroke="#a7f3d0" strokeWidth="2" opacity="0.4"/>
            {/* Toxic glowing core */}
            <polygon points="50,25 65,45 50,70 35,45" fill="#34d399" filter="url(#blur-glow)"/>
            <polygon points="50,30 60,45 50,60 40,45" fill="#ecfdf5" />
          </>
        )
      };
    case 'DIAMOND':
      return {
        coreColor: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 1)',
        textColor: '#ffffff',
        textShadow: '0px 2px 6px #082f49, 0px 0px 25px #bae6fd, 0px 0px 3px #000',
        gradient: (
          <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="15%" stopColor="#e0f2fe" />
            <stop offset="40%" stopColor="#7dd3fc" />
            <stop offset="70%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#082f49" />
          </linearGradient>
        ),
        shape: (
          <>
            {/* Flawless prismatic 3D diamond */}
            <path d="M 50 5 L 95 35 L 50 95 L 5 35 Z" fill="#082f49" stroke="#bae6fd" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 50 5 L 95 35 L 50 95 L 5 35 Z" fill="url(#grad-diamond)" opacity="0.8"/>
            <path d="M 50 5 L 75 35 L 50 95 L 25 35 Z" fill="rgba(2, 132, 199, 0.4)" stroke="#e0f2fe" strokeWidth="2" />
            {/* Diamond facets */}
            <path d="M 25 35 L 75 35" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
            <path d="M 50 5 L 50 35" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
            <path d="M 50 35 L 50 95" stroke="#ffffff" strokeWidth="2" opacity="0.5" />
            <circle cx="50" cy="35" r="15" fill="none" stroke="#bae6fd" strokeWidth="1" strokeDasharray="2 2" opacity="0.9" />
          </>
        )
      };
    case 'CHAMPION':
    default:
      return {
        coreColor: '#f43f5e',
        glowColor: 'rgba(225, 29, 72, 1)',
        textColor: '#ffffff',
        textShadow: '0px 2px 8px #4c0519, 0px 0px 30px #fb7185, 0px 0px 4px #000',
        gradient: (
          <radialGradient id="grad-champion" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#ffe4e6" />
            <stop offset="20%" stopColor="#fda4af" />
            <stop offset="50%" stopColor="#e11d48" />
            <stop offset="85%" stopColor="#881337" />
            <stop offset="100%" stopColor="#22000c" />
          </radialGradient>
        ),
        shape: (
          <>
            {/* Ethereal angelic wings / crown hybrid */}
            <path d="M 50 0 L 70 20 L 95 10 L 85 40 L 100 65 L 70 80 L 50 100 L 30 80 L 0 65 L 15 40 L 5 10 L 30 20 Z" fill="#22000c" stroke="#fecdd3" strokeWidth="4" filter="url(#intense-glow)"/>
            <path d="M 50 0 L 70 20 L 95 10 L 85 40 L 100 65 L 70 80 L 50 100 L 30 80 L 0 65 L 15 40 L 5 10 L 30 20 Z" fill="url(#grad-champion)" opacity="0.9"/>
            {/* Inner shielded core */}
            <path d="M 50 15 L 65 30 L 80 55 L 50 85 L 20 55 L 35 30 Z" fill="#881337" stroke="#fb7185" strokeWidth="3" />
            {/* Intense hyper-glowing core orb */}
            <circle cx="50" cy="50" r="18" fill="#ffe4e6" filter="url(#blur-glow)" opacity="0.9"/>
            <circle cx="50" cy="50" r="10" fill="#ffffff" />
            {/* Floating majestic particles/stars */}
            <path d="M 50 -5 L 55 5 L 65 5 L 55 12 L 58 22 L 50 15 L 42 22 L 45 12 L 35 5 L 45 5 Z" fill="#ffe4e6" filter="url(#blur-glow)" transform="scale(0.5) translate(50, -10)" />
            <path d="M 50 -5 L 55 5 L 65 5 L 55 12 L 58 22 L 50 15 L 42 22 L 45 12 L 35 5 L 45 5 Z" fill="#ffe4e6" filter="url(#blur-glow)" transform="scale(0.5) translate(-30, 70)" />
            <path d="M 50 -5 L 55 5 L 65 5 L 55 12 L 58 22 L 50 15 L 42 22 L 45 12 L 35 5 L 45 5 Z" fill="#ffe4e6" filter="url(#blur-glow)" transform="scale(0.5) translate(130, 70)" />
          </>
        )
      };
  }
};

const SIZE_CLASSES = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-32 h-32',
  xl: 'w-48 h-48',
};

const FONT_SIZES = {
  sm: 'text-xs',
  md: 'text-lg',
  lg: 'text-3xl',
  xl: 'text-5xl',
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
        filter: `drop-shadow(0 0 35px ${design.glowColor}) drop-shadow(0 0 15px ${design.coreColor})`
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      className={cn(
        'relative flex items-center justify-center select-none cursor-pointer group',
        sizeClass,
        className
      )}
      style={{
        filter: `drop-shadow(0 15px 25px rgba(0, 0, 0, 0.6)) drop-shadow(0 5px 10px ${design.glowColor})`
      }}
    >
      {/* Dynamic Immersive SVG Render */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full drop-shadow-2xl overflow-visible transition-transform duration-500 group-hover:rotate-3"
      >
        <defs>
          {design.gradient}
          <filter id="intense-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComponentTransfer in="blur" result="boost">
              <feFuncA type="linear" slope="2"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="boost" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="blur-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Floating Aura Core */}
        <circle cx="50" cy="50" r="48" fill="none" stroke={design.coreColor} strokeWidth="1" opacity="0.3" filter="url(#blur-glow)" />

        {/* Render complex multilayered geometry */}
        {design.shape}

        {/* Ambient Specular Highlight */}
        <path
          d="M 20 20 L 80 80"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.3"
          style={{ mixBlendMode: 'overlay' }}
        />
      </svg>

      {/* Flawlessly Contrasting Roman Numeral */}
      <div 
        className={cn(
          "relative z-10 font-black tracking-tight select-none pointer-events-none uppercase",
          fontSizeClass
        )}
        style={{
          fontFamily: 'serif',
          color: design.textColor,
          textShadow: design.textShadow,
          letterSpacing: '-0.05em'
        }}
      >
        {displayNumeral}
      </div>

      {/* Hover Light Flare Particle */}
      <div 
        className="absolute inset-0 rounded-full mix-blend-screen opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, ${design.coreColor} 0%, transparent 60%)`,
          filter: 'blur(8px)'
        }}
      />
    </motion.div>
  );
}
