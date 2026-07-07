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
        coreColor: '#c2410c',
        glowColor: 'rgba(194, 65, 12, 0.6)',
        textColor: '#ffedd5',
        textShadow: '0px 2px 4px #431407, 0px 0px 10px #ea580c, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-copper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fdba74" />
            <stop offset="30%" stopColor="#ea580c" />
            <stop offset="70%" stopColor="#7c2d12" />
            <stop offset="100%" stopColor="#431407" />
          </linearGradient>
        ),
        shape: (
          <>
            <polygon points="50,10 90,30 90,70 50,90 10,70 10,30" fill="url(#grad-copper)" stroke="#fdba74" strokeWidth="2" filter="url(#intense-glow)"/>
            <polygon points="50,18 80,35 80,65 50,82 20,65 20,35" fill="rgba(67, 20, 7, 0.8)" stroke="#ea580c" strokeWidth="3" />
            <circle cx="50" cy="50" r="22" fill="none" stroke="#fdba74" strokeWidth="1" strokeDasharray="4 4" opacity="0.6"/>
          </>
        )
      };
    case 'BRONZE':
      return {
        coreColor: '#b45309',
        glowColor: 'rgba(217, 119, 6, 0.6)',
        textColor: '#fef3c7',
        textShadow: '0px 2px 4px #78350f, 0px 0px 10px #f59e0b, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-bronze" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="40%" stopColor="#d97706" />
            <stop offset="80%" stopColor="#78350f" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
        ),
        shape: (
          <>
            <path d="M 50 5 L 95 25 L 85 75 L 50 95 L 15 75 L 5 25 Z" fill="url(#grad-bronze)" stroke="#fcd34d" strokeWidth="2" filter="url(#intense-glow)"/>
            <path d="M 50 15 L 82 30 L 74 68 L 50 85 L 26 68 L 18 30 Z" fill="rgba(69, 26, 3, 0.8)" stroke="#f59e0b" strokeWidth="3" />
            <path d="M 35 40 L 50 25 L 65 40 M 35 60 L 50 75 L 65 60" fill="none" stroke="#fcd34d" strokeWidth="2" opacity="0.5"/>
          </>
        )
      };
    case 'SILVER':
      return {
        coreColor: '#64748b',
        glowColor: 'rgba(148, 163, 184, 0.7)',
        textColor: '#ffffff',
        textShadow: '0px 2px 4px #1e293b, 0px 0px 12px #cbd5e1, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="25%" stopColor="#e2e8f0" />
            <stop offset="70%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        ),
        shape: (
          <>
            <polygon points="50,5 90,20 95,50 90,80 50,95 10,80 5,50 10,20" fill="url(#grad-silver)" stroke="#f8fafc" strokeWidth="2" filter="url(#intense-glow)"/>
            <polygon points="50,15 80,28 85,50 80,72 50,85 20,72 15,50 20,28" fill="rgba(15, 23, 42, 0.85)" stroke="#94a3b8" strokeWidth="3" />
            <rect x="35" y="35" width="30" height="30" fill="none" stroke="#e2e8f0" strokeWidth="1" transform="rotate(45 50 50)" opacity="0.7"/>
          </>
        )
      };
    case 'GOLD':
      return {
        coreColor: '#ca8a04',
        glowColor: 'rgba(250, 204, 21, 0.7)',
        textColor: '#fef08a',
        textShadow: '0px 2px 4px #713f12, 0px 0px 15px #facc15, 0px 0px 2px #000',
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
            <path d="M 20 20 L 50 5 L 80 20 L 95 50 L 80 80 L 50 95 L 20 80 L 5 50 Z" fill="url(#grad-gold)" stroke="#fef08a" strokeWidth="2" filter="url(#intense-glow)"/>
            <path d="M 28 28 L 50 15 L 72 28 L 85 50 L 72 72 L 50 85 L 28 72 L 15 50 Z" fill="rgba(66, 32, 6, 0.85)" stroke="#eab308" strokeWidth="4" />
            <circle cx="50" cy="50" r="15" fill="none" stroke="#fef08a" strokeWidth="2" opacity="0.8"/>
            <polygon points="50,30 55,45 70,50 55,55 50,70 45,55 30,50 45,45" fill="#facc15" opacity="0.9"/>
          </>
        )
      };
    case 'PLATINUM':
      return {
        coreColor: '#0891b2',
        glowColor: 'rgba(34, 211, 238, 0.8)',
        textColor: '#cffafe',
        textShadow: '0px 2px 4px #164e63, 0px 0px 15px #22d3ee, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-platinum" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cffafe" />
            <stop offset="30%" stopColor="#06b6d4" />
            <stop offset="70%" stopColor="#155e75" />
            <stop offset="100%" stopColor="#083344" />
          </linearGradient>
        ),
        shape: (
          <>
            <polygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="url(#grad-platinum)" stroke="#a5f3fc" strokeWidth="3" filter="url(#intense-glow)"/>
            <polygon points="50,15 82,32 82,68 50,85 18,68 18,32" fill="rgba(8, 51, 68, 0.9)" stroke="#22d3ee" strokeWidth="4" />
            <line x1="50" y1="15" x2="50" y2="85" stroke="#a5f3fc" strokeWidth="1" opacity="0.5"/>
            <line x1="18" y1="32" x2="82" y2="68" stroke="#a5f3fc" strokeWidth="1" opacity="0.5"/>
            <line x1="18" y1="68" x2="82" y2="32" stroke="#a5f3fc" strokeWidth="1" opacity="0.5"/>
            <circle cx="50" cy="50" r="10" fill="#06b6d4" filter="url(#blur-glow)"/>
          </>
        )
      };
    case 'EMERALD':
      return {
        coreColor: '#047857',
        glowColor: 'rgba(16, 185, 129, 0.8)',
        textColor: '#d1fae5',
        textShadow: '0px 2px 4px #064e3b, 0px 0px 15px #34d399, 0px 0px 2px #000',
        gradient: (
          <linearGradient id="grad-emerald" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" />
            <stop offset="25%" stopColor="#10b981" />
            <stop offset="75%" stopColor="#047857" />
            <stop offset="100%" stopColor="#022c22" />
          </linearGradient>
        ),
        shape: (
          <>
            <polygon points="50,5 95,40 75,95 25,95 5,40" fill="url(#grad-emerald)" stroke="#6ee7b7" strokeWidth="3" filter="url(#intense-glow)"/>
            <polygon points="50,15 82,45 65,85 35,85 18,45" fill="rgba(2, 44, 34, 0.9)" stroke="#10b981" strokeWidth="4" />
            <path d="M 50 25 L 70 50 L 50 75 L 30 50 Z" fill="none" stroke="#a7f3d0" strokeWidth="2" opacity="0.8"/>
            <circle cx="50" cy="50" r="5" fill="#34d399" filter="url(#blur-glow)"/>
          </>
        )
      };
    case 'DIAMOND':
      return {
        coreColor: '#6366f1',
        glowColor: 'rgba(139, 92, 246, 0.9)',
        textColor: '#ffffff',
        textShadow: '0px 2px 6px #312e81, 0px 0px 20px #a855f7, 0px 0px 3px #000',
        gradient: (
          <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f3e8ff" />
            <stop offset="25%" stopColor="#c084fc" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="80%" stopColor="#312e81" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
        ),
        shape: (
          <>
            <polygon points="50,5 95,35 80,95 20,95 5,35" fill="url(#grad-diamond)" stroke="#e9d5ff" strokeWidth="4" filter="url(#intense-glow)"/>
            <polygon points="50,15 82,40 68,85 32,85 18,40" fill="rgba(30, 27, 75, 0.95)" stroke="#a855f7" strokeWidth="4" />
            {/* Inner crystalline facets */}
            <path d="M 50 15 L 82 40 L 50 60 Z" fill="url(#grad-diamond)" opacity="0.3"/>
            <path d="M 50 15 L 18 40 L 50 60 Z" fill="url(#grad-diamond)" opacity="0.1"/>
            <path d="M 18 40 L 32 85 L 50 60 Z" fill="url(#grad-diamond)" opacity="0.2"/>
            <path d="M 82 40 L 68 85 L 50 60 Z" fill="url(#grad-diamond)" opacity="0.4"/>
            <path d="M 32 85 L 68 85 L 50 60 Z" fill="url(#grad-diamond)" opacity="0.25"/>
            <circle cx="50" cy="50" r="30" fill="none" stroke="#d8b4fe" strokeWidth="1" strokeDasharray="2 4" opacity="0.8"/>
          </>
        )
      };
    case 'CHAMPION':
    default:
      return {
        coreColor: '#f43f5e',
        glowColor: 'rgba(225, 29, 72, 1)',
        textColor: '#ffffff',
        textShadow: '0px 2px 8px #4c0519, 0px 0px 25px #fb7185, 0px 0px 4px #000',
        gradient: (
          <radialGradient id="grad-champion" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#ffe4e6" />
            <stop offset="30%" stopColor="#fb7185" />
            <stop offset="70%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#881337" />
          </radialGradient>
        ),
        shape: (
          <>
            {/* Radiant core burst */}
            <path d="M 50 0 L 60 30 L 95 30 L 70 50 L 80 90 L 50 65 L 20 90 L 30 50 L 5 30 L 40 30 Z" fill="url(#grad-champion)" stroke="#fecdd3" strokeWidth="2" filter="url(#intense-glow)"/>
            {/* Dark inner crest */}
            <path d="M 50 15 L 56 38 L 80 38 L 62 52 L 68 78 L 50 62 L 32 78 L 38 52 L 20 38 L 44 38 Z" fill="rgba(76, 5, 25, 0.95)" stroke="#f43f5e" strokeWidth="4" />
            {/* Floating crown particles */}
            <circle cx="50" cy="5" r="3" fill="#ffe4e6" filter="url(#blur-glow)"/>
            <circle cx="85" cy="20" r="2.5" fill="#ffe4e6" filter="url(#blur-glow)"/>
            <circle cx="15" cy="20" r="2.5" fill="#ffe4e6" filter="url(#blur-glow)"/>
            <circle cx="50" cy="55" r="18" fill="none" stroke="#fda4af" strokeWidth="2" strokeDasharray="3 3"/>
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
