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
        coreColor: '#b45309',
        glowColor: 'rgba(180, 83, 9, 0.8)',
        textColor: '#fef3c7',
        textShadow: '0px 2px 5px #78350f, 0px 0px 15px #f59e0b, 0px 0px 4px #000',
        shape: (
          <>
            <linearGradient id="grad-copper" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="25%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#b45309" />
              <stop offset="75%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>
            <linearGradient id="grad-copper-inset" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#451a03" stopOpacity="0.8" />
            </linearGradient>
            <radialGradient id="copper-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="1"/>
              <stop offset="100%" stopColor="#78350f" stopOpacity="0.9"/>
            </radialGradient>
            
            {/* L1: Deep Drop Shadow */}
            <path d="M 50 2 L 85 15 L 98 50 L 85 85 L 50 98 L 15 85 L 2 50 L 15 15 Z" fill="#2d1300" filter="url(#intense-blur)" transform="translate(0, 4)"/>
            {/* L2: Outer Heavy Gear Frame */}
            <path d="M 50 2 L 85 15 L 98 50 L 85 85 L 50 98 L 15 85 L 2 50 L 15 15 Z" fill="url(#grad-copper)" stroke="#78350f" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Extruded Inner Bevel */}
            <path d="M 50 8 L 80 19 L 92 50 L 80 81 L 50 92 L 20 81 L 8 50 L 20 19 Z" fill="url(#grad-copper-inset)" stroke="#fcd34d" strokeWidth="1" opacity="0.8"/>
            {/* L4: Base Plate */}
            <path d="M 50 12 L 76 22 L 88 50 L 76 78 L 50 88 L 24 78 L 12 50 L 24 22 Z" fill="#451a03" />
            {/* L5: Inner Gear Teeth */}
            <path d="M 50 15 L 72 25 L 82 50 L 72 75 L 50 85 L 28 75 L 18 50 L 28 25 Z" fill="url(#grad-copper)" stroke="#92400e" strokeWidth="1.5"/>
            {/* L6: Core Plate */}
            <circle cx="50" cy="50" r="30" fill="#2d1300" stroke="#d97706" strokeWidth="2"/>
            {/* L7: Core Glow */}
            <circle cx="50" cy="50" r="26" fill="url(#copper-core)" />
            {/* L8: Center Lattice */}
            <path d="M 50 24 L 76 50 L 50 76 L 24 50 Z" fill="none" stroke="#fcd34d" strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
            {/* L9: Industrial Rivets */}
            <circle cx="50" cy="8" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="50" cy="92" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="8" cy="50" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="92" cy="50" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="80" cy="20" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="20" cy="80" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="20" cy="20" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            <circle cx="80" cy="80" r="2.5" fill="#fef3c7" stroke="#78350f" strokeWidth="0.5"/>
            {/* L10: Volumetric Lighting Highlight */}
            <path d="M 50 2 L 85 15 L 98 50" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" style={{ filter: 'drop-shadow(0 0 4px #fff)' }}/>
            {/* L11: Animated Gear Ring (Outer) */}
            <motion.circle cx="50" cy="50" r="36" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 8" opacity="0.7" 
              animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} style={{ originX: '50px', originY: '50px' }}
            />
            {/* L12: Animated Gear Ring (Inner) */}
            <motion.circle cx="50" cy="50" r="22" fill="none" stroke="#fef3c7" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.5"
              animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} style={{ originX: '50px', originY: '50px' }}
            />
          </>
        )
      };
    case 'BRONZE':
      return {
        coreColor: '#9a3412',
        glowColor: 'rgba(154, 52, 18, 0.8)',
        textColor: '#ffedd5',
        textShadow: '0px 2px 6px #431407, 0px 0px 20px #ea580c, 0px 0px 4px #000',
        shape: (
          <>
            <linearGradient id="grad-bronze" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#fdba74" />
              <stop offset="30%" stopColor="#ea580c" />
              <stop offset="70%" stopColor="#9a3412" />
              <stop offset="100%" stopColor="#431407" />
            </linearGradient>
            <linearGradient id="grad-bronze-inset" x1="80%" y1="100%" x2="20%" y2="0%">
              <stop offset="0%" stopColor="#fdba74" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#431407" stopOpacity="0.8"/>
            </linearGradient>
            <radialGradient id="bronze-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fdba74" stopOpacity="0.9"/>
              <stop offset="50%" stopColor="#ea580c" stopOpacity="0.7"/>
              <stop offset="100%" stopColor="#431407" stopOpacity="0.1"/>
            </radialGradient>

            {/* L1: Deep Blur Shadow */}
            <path d="M 50 0 L 95 20 L 95 60 L 50 100 L 5 60 L 5 20 Z" fill="#290c04" filter="url(#intense-blur)" transform="translate(0, 5)"/>
            {/* L2: Shield Base */}
            <path d="M 50 0 L 95 20 L 95 60 L 50 100 L 5 60 L 5 20 Z" fill="url(#grad-bronze)" stroke="#431407" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Beveled Edge */}
            <path d="M 50 6 L 88 24 L 88 57 L 50 91 L 12 57 L 12 24 Z" fill="url(#grad-bronze-inset)" />
            {/* L4: Inner Shield Plate */}
            <path d="M 50 12 L 80 27 L 80 54 L 50 82 L 20 54 L 20 27 Z" fill="#431407" stroke="#ea580c" strokeWidth="2"/>
            {/* L5: Core Plate */}
            <path d="M 50 18 L 74 31 L 74 51 L 50 72 L 26 51 L 26 31 Z" fill="url(#grad-bronze)" />
            {/* L6: Epic Center Glow */}
            <circle cx="50" cy="45" r="25" fill="url(#bronze-glow)" style={{ mixBlendMode: 'screen' }}/>
            {/* L7: Geometric Cross */}
            <path d="M 50 12 L 50 82 M 20 40 L 80 40" stroke="#fdba74" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
            {/* L8: Engraved Runes/Details */}
            <path d="M 50 8 L 60 14 L 60 20 Z" fill="#fdba74" opacity="0.6"/>
            <path d="M 50 8 L 40 14 L 40 20 Z" fill="#fdba74" opacity="0.4"/>
            <circle cx="50" cy="45" r="15" fill="none" stroke="#fdba74" strokeWidth="2" opacity="0.9"/>
            <circle cx="50" cy="45" r="20" fill="none" stroke="#ea580c" strokeWidth="0.5" strokeDasharray="2 4"/>
            {/* L9: Spectacular Highlight */}
            <path d="M 50 0 L 95 20 L 95 40" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" style={{ filter: 'drop-shadow(0 0 5px #fff)' }}/>
            {/* L10: Pulsing Aura */}
            <motion.path d="M 50 18 L 74 31 L 74 51 L 50 72 L 26 51 L 26 31 Z" fill="none" stroke="#fdba74" strokeWidth="1"
              initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.1, opacity: 0 }} transition={{ duration: 2, repeat: Infinity }}
              style={{ originX: '50px', originY: '45px' }}
            />
          </>
        )
      };
    case 'SILVER':
      return {
        coreColor: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 0.8)',
        textColor: '#f0f9ff',
        textShadow: '0px 2px 6px #0369a1, 0px 0px 20px #38bdf8, 0px 0px 5px #fff',
        shape: (
          <>
            <linearGradient id="grad-silver" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="25%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="75%" stopColor="#475569" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="grad-silver-cyber" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8"/>
              <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.9"/>
            </linearGradient>

            {/* L1: Deep Shadow */}
            <path d="M 50 0 L 95 30 L 70 100 L 30 100 L 5 30 Z" fill="#020617" filter="url(#intense-blur)" transform="translate(0, 5)"/>
            {/* L2: Cybernetic Chevron Base */}
            <path d="M 50 0 L 100 35 L 75 100 L 25 100 L 0 35 Z" fill="url(#grad-silver)" stroke="#475569" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Extruded Inner Layer */}
            <path d="M 50 8 L 92 40 L 70 94 L 30 94 L 8 40 Z" fill="url(#grad-silver-cyber)" />
            {/* L4: Core Plate */}
            <path d="M 50 15 L 85 43 L 65 88 L 35 88 L 15 43 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="2"/>
            {/* L5: Inner Glowing Triangles */}
            <path d="M 50 25 L 75 48 L 50 80 L 25 48 Z" fill="url(#grad-silver)" opacity="0.9"/>
            <path d="M 50 35 L 65 52 L 50 70 L 35 52 Z" fill="#020617" />
            {/* L6: Cyber Grid Overlay */}
            <path d="M 50 15 L 50 88 M 15 43 L 85 43 M 35 88 L 85 43 M 65 88 L 15 43" stroke="#38bdf8" strokeWidth="1" opacity="0.3"/>
            {/* L7: Energy Nodes */}
            <circle cx="50" cy="25" r="3" fill="#bae6fd" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }}/>
            <circle cx="75" cy="48" r="3" fill="#bae6fd" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }}/>
            <circle cx="25" cy="48" r="3" fill="#bae6fd" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }}/>
            <circle cx="50" cy="80" r="3" fill="#bae6fd" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }}/>
            {/* L8: Laser Highlight Edge */}
            <path d="M 0 35 L 50 0 L 100 35" fill="none" stroke="#fff" strokeWidth="2" opacity="0.8" style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
            {/* L9: Cybernetic Pulse Rings */}
            <motion.circle cx="50" cy="50" r="20" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeDasharray="10 10"
              animate={{ rotate: 360, scale: [1, 1.1, 1] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} style={{ originX: '50px', originY: '50px' }}
            />
          </>
        )
      };
    case 'GOLD':
      return {
        coreColor: '#eab308',
        glowColor: 'rgba(234, 179, 8, 0.8)',
        textColor: '#fef08a',
        textShadow: '0px 2px 6px #713f12, 0px 0px 25px #eab308, 0px 0px 6px #fff',
        shape: (
          <>
            <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="25%" stopColor="#fde047" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#ca8a04" />
              <stop offset="100%" stopColor="#854d0e" />
            </linearGradient>
            <radialGradient id="gold-flare" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="1"/>
              <stop offset="30%" stopColor="#eab308" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#713f12" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="grad-gold-metal" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="10%" stopColor="#ca8a04" />
              <stop offset="50%" stopColor="#fde047" />
              <stop offset="90%" stopColor="#854d0e" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>

            {/* L1: Outer Blur Shadow */}
            <path d="M 50 0 L 98 38 L 78 98 L 22 98 L 2 38 Z" fill="#422006" filter="url(#intense-blur)" transform="translate(0, 5)"/>
            {/* L2: Spiked Crown Base */}
            <path d="M 50 0 L 65 25 L 98 38 L 75 60 L 78 98 L 50 80 L 22 98 L 25 60 L 2 38 L 35 25 Z" fill="url(#grad-gold-metal)" stroke="#854d0e" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Inner Extrusion */}
            <path d="M 50 10 L 61 30 L 88 40 L 70 58 L 72 88 L 50 73 L 28 88 L 30 58 L 12 40 L 39 30 Z" fill="#422006" />
            {/* L4: Sunburst Rays */}
            <path d="M 50 15 L 50 73 M 15 45 L 85 45 M 25 25 L 75 65 M 25 65 L 75 25" stroke="url(#grad-gold)" strokeWidth="3" opacity="0.6"/>
            {/* L5: Inner Plate */}
            <polygon points="50,20 75,45 65,80 35,80 25,45" fill="url(#grad-gold)" stroke="#fef08a" strokeWidth="1" />
            {/* L6: Core Jewel Void */}
            <circle cx="50" cy="52" r="22" fill="#291402" />
            {/* L7: Massive Golden Flare */}
            <circle cx="50" cy="52" r="35" fill="url(#gold-flare)" style={{ mixBlendMode: 'screen' }}/>
            {/* L8: Center Diamond Layer */}
            <polygon points="50,35 65,52 50,70 35,52" fill="#fef08a" filter="url(#drop-shadow)"/>
            {/* L9: Glowing Crown Jewels */}
            <circle cx="50" cy="5" r="4" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px #fff)' }}/>
            <circle cx="95" cy="38" r="3" fill="#fff" style={{ filter: 'drop-shadow(0 0 4px #fff)' }}/>
            <circle cx="5" cy="38" r="3" fill="#fff" style={{ filter: 'drop-shadow(0 0 4px #fff)' }}/>
            <circle cx="75" cy="95" r="3" fill="#fff" style={{ filter: 'drop-shadow(0 0 4px #fff)' }}/>
            <circle cx="25" cy="95" r="3" fill="#fff" style={{ filter: 'drop-shadow(0 0 4px #fff)' }}/>
            {/* L10: Animated Radiant Rays */}
            <motion.path d="M 50 20 L 75 45 L 65 80 L 35 80 L 25 45 Z" fill="none" stroke="#fff" strokeWidth="2"
              initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.2, opacity: 0 }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }} style={{ originX: '50px', originY: '52px' }}
            />
          </>
        )
      };
    case 'PLATINUM':
      return {
        coreColor: '#c084fc',
        glowColor: 'rgba(192, 132, 252, 0.9)',
        textColor: '#f3e8ff',
        textShadow: '0px 2px 6px #4c1d95, 0px 0px 30px #c084fc, 0px 0px 8px #fff',
        shape: (
          <>
            <linearGradient id="grad-plat" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f3e8ff" />
              <stop offset="25%" stopColor="#d8b4fe" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="75%" stopColor="#7e22ce" />
              <stop offset="100%" stopColor="#3b0764" />
            </linearGradient>
            <radialGradient id="plat-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f3e8ff" stopOpacity="1"/>
              <stop offset="50%" stopColor="#c084fc" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#3b0764" stopOpacity="0"/>
            </radialGradient>
            
            {/* L1: Deep Shadow */}
            <path d="M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z" fill="#1e013a" filter="url(#intense-blur)" transform="translate(0, 6)"/>
            {/* L2: Hexagonal Matrix Base */}
            <path d="M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z" fill="url(#grad-plat)" stroke="#581c87" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Extruded Inner Hex */}
            <path d="M 50 10 L 90 30 L 90 70 L 50 90 L 10 70 L 10 30 Z" fill="#2e1065" />
            {/* L4: Matrix Grid Lines */}
            <path d="M 50 10 L 50 90 M 10 30 L 90 70 M 10 70 L 90 30 M 10 50 L 90 50 M 30 10 L 70 90 M 70 10 L 30 90" stroke="#a855f7" strokeWidth="1" opacity="0.3"/>
            {/* L5: Inner Plate */}
            <path d="M 50 20 L 80 35 L 80 65 L 50 80 L 20 65 L 20 35 Z" fill="url(#grad-plat)" stroke="#f3e8ff" strokeWidth="1"/>
            {/* L6: Deep Core Void */}
            <circle cx="50" cy="50" r="20" fill="#1e013a" />
            {/* L7: Extreme Plasma Core */}
            <circle cx="50" cy="50" r="40" fill="url(#plat-core)" style={{ mixBlendMode: 'screen' }}/>
            {/* L8: Center Crystal */}
            <polygon points="50,35 60,50 50,65 40,50" fill="#fff" style={{ filter: 'drop-shadow(0 0 10px #fff)' }}/>
            {/* L9: Matrix Nodes */}
            <circle cx="50" cy="10" r="3" fill="#fff" />
            <circle cx="90" cy="30" r="3" fill="#fff" />
            <circle cx="90" cy="70" r="3" fill="#fff" />
            <circle cx="50" cy="90" r="3" fill="#fff" />
            <circle cx="10" cy="70" r="3" fill="#fff" />
            <circle cx="10" cy="30" r="3" fill="#fff" />
            {/* L10: Highlighting Specular Curve */}
            <path d="M 0 25 L 50 0 L 100 25" fill="none" stroke="#fff" strokeWidth="3" opacity="0.9" style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
            {/* L11: Animated Matrix Surge */}
            <motion.path d="M 50 20 L 80 35 L 80 65 L 50 80 L 20 65 L 20 35 Z" fill="none" stroke="#e9d5ff" strokeWidth="2"
              initial={{ scale: 1, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1.5, repeat: Infinity, ease: "circOut" }} style={{ originX: '50px', originY: '50px' }}
            />
          </>
        )
      };
    case 'EMERALD':
      return {
        coreColor: '#10b981',
        glowColor: 'rgba(16, 185, 129, 0.9)',
        textColor: '#d1fae5',
        textShadow: '0px 2px 6px #064e3b, 0px 0px 30px #10b981, 0px 0px 8px #fff',
        shape: (
          <>
            <linearGradient id="grad-emerald" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#a7f3d0" />
              <stop offset="30%" stopColor="#10b981" />
              <stop offset="70%" stopColor="#047857" />
              <stop offset="100%" stopColor="#022c22" />
            </linearGradient>
            <radialGradient id="emerald-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a7f3d0" stopOpacity="1"/>
              <stop offset="40%" stopColor="#10b981" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#022c22" stopOpacity="0"/>
            </radialGradient>
            
            {/* L1: Toxic Blur Shadow */}
            <polygon points="50,0 100,50 50,100 0,50" fill="#011812" filter="url(#intense-blur)" transform="translate(0, 6)"/>
            {/* L2: Mystic Diamond Base */}
            <polygon points="50,0 100,50 50,100 0,50" fill="url(#grad-emerald)" stroke="#064e3b" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Layered Inner Fractal */}
            <polygon points="50,12 88,50 50,88 12,50" fill="#022c22" />
            <polygon points="50,24 76,50 50,76 24,50" fill="url(#grad-emerald)" />
            {/* L4: Magical Engravings */}
            <path d="M 50 12 L 50 88 M 12 50 L 88 50 M 24 24 L 76 76 M 24 76 L 76 24" stroke="#a7f3d0" strokeWidth="1" opacity="0.4"/>
            {/* L5: Heavy Gem Core */}
            <polygon points="50,35 65,50 50,65 35,50" fill="#064e3b" stroke="#34d399" strokeWidth="2"/>
            {/* L6: Intense Emerald Radiance */}
            <circle cx="50" cy="50" r="45" fill="url(#emerald-glow)" style={{ mixBlendMode: 'screen' }}/>
            {/* L7: Fractal Light Beams */}
            <path d="M 50 0 L 65 50 L 50 100 L 35 50 Z" fill="#fff" opacity="0.1" style={{ mixBlendMode: 'screen' }}/>
            <path d="M 0 50 L 50 65 L 100 50 L 50 35 Z" fill="#fff" opacity="0.1" style={{ mixBlendMode: 'screen' }}/>
            {/* L8: Specular Glint */}
            <polygon points="50,0 100,50 90,50 50,10" fill="#fff" opacity="0.6" style={{ filter: 'drop-shadow(0 0 5px #fff)' }}/>
            {/* L9: Animated Toxic Particles */}
            <motion.circle cx="50" cy="50" r="28" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeDasharray="5 15"
              animate={{ rotate: 360, scale: [1, 1.2, 1] }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} style={{ originX: '50px', originY: '50px' }}
            />
            <motion.circle cx="50" cy="50" r="38" fill="none" stroke="#a7f3d0" strokeWidth="1" strokeDasharray="2 20"
              animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} style={{ originX: '50px', originY: '50px' }}
            />
          </>
        )
      };
    case 'DIAMOND':
      return {
        coreColor: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 1)',
        textColor: '#ffffff',
        textShadow: '0px 2px 8px #0284c7, 0px 0px 40px #7dd3fc, 0px 0px 10px #fff',
        shape: (
          <>
            <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="20%" stopColor="#bae6fd" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="80%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#082f49" />
            </linearGradient>
            <radialGradient id="diamond-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1"/>
              <stop offset="20%" stopColor="#7dd3fc" stopOpacity="0.9"/>
              <stop offset="60%" stopColor="#0284c7" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#082f49" stopOpacity="0"/>
            </radialGradient>
            
            {/* L1: Refractive Blur Shadow */}
            <polygon points="50,0 90,30 50,100 10,30" fill="#041b2e" filter="url(#intense-blur)" transform="translate(0, 8)"/>
            {/* L2: Prism Base */}
            <polygon points="50,0 90,30 50,100 10,30" fill="url(#grad-diamond)" stroke="#0c4a6e" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L3: Prism Facets (Top Left) */}
            <polygon points="50,0 10,30 50,30" fill="#ffffff" opacity="0.8"/>
            {/* L4: Prism Facets (Top Right) */}
            <polygon points="50,0 90,30 50,30" fill="#bae6fd" opacity="0.4"/>
            {/* L5: Prism Facets (Bottom Left) */}
            <polygon points="10,30 50,100 50,30" fill="#0284c7" opacity="0.6"/>
            {/* L6: Prism Facets (Bottom Right) */}
            <polygon points="90,30 50,100 50,30" fill="#082f49" opacity="0.8"/>
            {/* L7: Inner Diamond Core */}
            <polygon points="50,15 75,35 50,85 25,35" fill="url(#grad-diamond)" stroke="#fff" strokeWidth="1"/>
            {/* L8: God-Level Radiant Glow */}
            <circle cx="50" cy="40" r="50" fill="url(#diamond-glow)" style={{ mixBlendMode: 'screen' }}/>
            {/* L9: Sparkle Stars */}
            <path d="M 50 0 L 52 15 L 67 17 L 52 19 L 50 34 L 48 19 L 33 17 L 48 15 Z" fill="#fff" style={{ filter: 'drop-shadow(0 0 10px #fff)' }}/>
            <path d="M 85 25 L 86 32 L 93 33 L 86 34 L 85 41 L 84 34 L 77 33 L 84 32 Z" fill="#fff" style={{ filter: 'drop-shadow(0 0 5px #fff)' }}/>
            <path d="M 15 25 L 16 32 L 23 33 L 16 34 L 15 41 L 14 34 L 7 33 L 14 32 Z" fill="#fff" style={{ filter: 'drop-shadow(0 0 5px #fff)' }}/>
            {/* L10: Animated Prism Reflection */}
            <motion.polygon points="50,15 75,35 50,85 25,35" fill="none" stroke="#fff" strokeWidth="2"
              initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.4 }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} style={{ originX: '50px', originY: '45px' }}
            />
          </>
        )
      };
    case 'CHAMPION':
      return {
        coreColor: '#e11d48',
        glowColor: 'rgba(225, 29, 72, 1)',
        textColor: '#ffe4e6',
        textShadow: '0px 2px 10px #881337, 0px 0px 50px #e11d48, 0px 0px 15px #fff',
        shape: (
          <>
            <linearGradient id="grad-champ" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="15%" stopColor="#fda4af" />
              <stop offset="30%" stopColor="#f43f5e" />
              <stop offset="50%" stopColor="#e11d48" />
              <stop offset="80%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#4c0519" />
            </linearGradient>
            <radialGradient id="champ-nova" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1"/>
              <stop offset="20%" stopColor="#f43f5e" stopOpacity="0.9"/>
              <stop offset="50%" stopColor="#e11d48" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#4c0519" stopOpacity="0"/>
            </radialGradient>
            
            {/* L1: Supernova Shadow */}
            <path d="M 50 0 L 85 15 L 100 50 L 85 85 L 50 100 L 15 85 L 0 50 L 15 15 Z" fill="#2a030d" filter="url(#intense-blur)" transform="translate(0, 10) scale(1.1)"/>
            {/* L2: Winged Base Left */}
            <path d="M 50 50 L 0 20 L 10 70 Z" fill="#881337" opacity="0.8"/>
            {/* L3: Winged Base Right */}
            <path d="M 50 50 L 100 20 L 90 70 Z" fill="#881337" opacity="0.8"/>
            {/* L4: Core Star Base */}
            <path d="M 50 0 L 65 35 L 100 50 L 65 65 L 50 100 L 35 65 L 0 50 L 35 35 Z" fill="url(#grad-champ)" stroke="#fff" strokeWidth="2" filter="url(#drop-shadow)"/>
            {/* L5: Inner Singularity Void */}
            <path d="M 50 15 L 60 40 L 85 50 L 60 60 L 50 85 L 40 60 L 15 50 L 40 40 Z" fill="#2a030d" />
            {/* L6: Supernova Glow */}
            <circle cx="50" cy="50" r="60" fill="url(#champ-nova)" style={{ mixBlendMode: 'screen' }}/>
            {/* L7: Center Heart/Gem */}
            <polygon points="50,30 65,50 50,70 35,50" fill="#fff" style={{ filter: 'drop-shadow(0 0 15px #fff)' }}/>
            {/* L8: Angelic Wings (Right) */}
            <path d="M 65 50 Q 80 20 100 0 Q 90 40 100 60 Q 75 60 65 50" fill="#fda4af" opacity="0.6" style={{ filter: 'drop-shadow(0 0 10px #f43f5e)' }}/>
            <path d="M 65 50 Q 90 30 110 20 Q 95 50 105 70 Q 75 65 65 50" fill="#fff" opacity="0.8" style={{ filter: 'drop-shadow(0 0 15px #fff)' }}/>
            {/* L9: Angelic Wings (Left) */}
            <path d="M 35 50 Q 20 20 0 0 Q 10 40 0 60 Q 25 60 35 50" fill="#fda4af" opacity="0.6" style={{ filter: 'drop-shadow(0 0 10px #f43f5e)' }}/>
            <path d="M 35 50 Q 10 30 -10 20 Q 5 50 -5 70 Q 25 65 35 50" fill="#fff" opacity="0.8" style={{ filter: 'drop-shadow(0 0 15px #fff)' }}/>
            {/* L10: Animated God Rays */}
            <motion.path d="M 50 0 L 65 35 L 100 50 L 65 65 L 50 100 L 35 65 L 0 50 L 35 35 Z" fill="none" stroke="#fff" strokeWidth="3"
              initial={{ scale: 1, opacity: 1, rotate: 0 }} animate={{ scale: 1.6, opacity: 0, rotate: 45 }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} style={{ originX: '50px', originY: '50px' }}
            />
            {/* L11: Floating Orbs */}
            <motion.circle cx="20" cy="20" r="4" fill="#fff" animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
            <motion.circle cx="80" cy="20" r="4" fill="#fff" animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
            <motion.circle cx="20" cy="80" r="4" fill="#fff" animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }} style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
            <motion.circle cx="80" cy="80" r="4" fill="#fff" animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} style={{ filter: 'drop-shadow(0 0 8px #fff)' }}/>
          </>
        )
      };
    default:
      return null;
  }
};

export function RankBadge({ tier, globalRank, className, size = 'md' }: RankBadgeProps) {
  const parts = tier.split('_');
  const baseRank = parts[0] || 'COPPER';
  const numeral = parts[1] || '';

  const design = getRankBadgeDesign(baseRank);
  
  if (!design) return null;

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24 md:w-32 md:h-32',
    lg: 'w-36 h-36 md:w-48 md:h-48',
    xl: 'w-56 h-56 md:w-72 md:h-72'
  };

  const numeralSizeClasses = {
    sm: 'text-lg',
    md: 'text-3xl md:text-4xl',
    lg: 'text-5xl md:text-6xl',
    xl: 'text-7xl md:text-8xl'
  };

  return (
    <div className={cn('relative group flex items-center justify-center transform-gpu will-change-transform', sizeClasses[size], className)}>
      <svg 
        viewBox="-10 -10 120 120" 
        className="w-full h-full drop-shadow-2xl overflow-visible"
        style={{ filter: `drop-shadow(0 0 30px ${design.glowColor})` }}
      >
        <defs>
          <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.8"/>
          </filter>
          <filter id="intense-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
          </filter>
        </defs>
        
        {/* Render the insanely complex SVG shape layers */}
        {design.shape}
      </svg>

      {/* 3D Roman Numeral Rendering with deep text-shadow */}
      {numeral && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <motion.span 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.6 }}
            className={cn(
              "font-black uppercase tracking-tighter mix-blend-plus-lighter",
              numeralSizeClasses[size]
            )}
            style={{ 
              color: design.textColor,
              textShadow: design.textShadow,
              fontFamily: 'serif'
            }}
          >
            {numeral}
          </motion.span>
        </div>
      )}
      
      {/* Global Rank Ribbon (if applicable) */}
      {globalRank && globalRank <= 100 && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
          className="absolute -bottom-4 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 text-white text-xs font-black px-4 py-1.5 rounded-sm shadow-[0_0_20px_rgba(225,29,72,0.8)] border border-rose-300 z-30"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        >
          #{globalRank} GLOBAL
        </motion.div>
      )}
    </div>
  );
}
