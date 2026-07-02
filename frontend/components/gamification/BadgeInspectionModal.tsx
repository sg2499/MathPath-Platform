"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, 
  Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun, 
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, 
  Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library 
} from "lucide-react";

// --- Icon Mapping ---
const IconMap: Record<string, React.ElementType> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal,
  Flag, Crown, Flame, Activity, Infinity: InfinityIcon, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star,
  Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library
};

export interface BadgeInspectionModalProps {
  badge: any;
  config: any;
  onClose: () => void;
}

// --- Global SVG Filters for AAA VFX ---
function AAAFilters() {
  return (
    <svg className="hidden">
      <defs>
        {/* Magma / Liquid Distortion */}
        <filter id="magma-distortion">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="50" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Void / Tear Distortion */}
        <filter id="void-tear">
          <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="turbulence" />
          <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="30" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Glitch / Chromatic Split */}
        <filter id="chromatic-aberration">
          <feOffset dx="5" dy="0" in="SourceGraphic" result="red-shift" />
          <feOffset dx="-5" dy="0" in="SourceGraphic" result="blue-shift" />
          <feBlend mode="screen" in="red-shift" in2="blue-shift" />
        </filter>
        {/* 1-Bit Matrix Crush */}
        <filter id="matrix-crush">
          <feColorMatrix type="matrix" values="
            0 0 0 0 0
            0 1 0 0 0
            0 1 0 0 0
            0 0 0 1 0" />
        </filter>
        {/* Heavy Shockwave Ripple */}
        <filter id="shockwave">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" result="noise">
             <animate attributeName="baseFrequency" values="0.02;0.1;0.02" dur="2s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

// --- 1. Perfectionist (Emerald) ---
function PerfectionistEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden [perspective:1000px]" style={{ filter: "url(#shockwave)" }}>
        {/* Blinding Center */}
        <motion.div animate={{ scale: [1, 2, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 0.5, repeat: Infinity }} className="absolute w-[100vw] h-[100vw] rounded-full blur-[150px] bg-emerald-500/50 mix-blend-screen" />
        {/* 3D Shattered Prisms Flying at Camera */}
        {[...Array(30)].map((_, i) => (
          <motion.div 
            key={i} 
            initial={{ z: -1000, x: 0, y: 0, rotateX: 0, rotateY: 0 }}
            animate={{ z: 1000, x: (Math.random() - 0.5) * 2000, y: (Math.random() - 0.5) * 2000, rotateX: 720, rotateY: 720 }}
            transition={{ duration: 1.5 + Math.random(), repeat: Infinity, ease: "easeIn", delay: Math.random() * 2 }}
            className="absolute w-16 h-16 md:w-32 md:h-32 bg-emerald-400/30 backdrop-blur-md border-[3px] border-emerald-300 shadow-[0_0_50px_#34d399] mix-blend-screen"
            style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
          />
        ))}
        {/* Insane God Rays */}
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0_10deg,rgba(16,185,129,0.8)_20deg,transparent_30deg,transparent_180deg,rgba(16,185,129,0.8)_190deg,transparent_200deg)] mix-blend-color-dodge" />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0_15deg,rgba(16,185,129,0.4)_30deg,transparent_45deg)] mix-blend-screen" />
        {[...Array(15)].map((_, i) => (
          <motion.div key={i} animate={{ y: [-50, 50, -50], rotate: 360 }} transition={{ duration: 4 + Math.random()*4, repeat: Infinity, ease: "easeInOut" }} className="absolute w-8 h-8 border-2 border-emerald-400/50" style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute w-[60vw] h-[60vw] rounded-full blur-[100px] bg-emerald-600/30" />
      {[...Array(20)].map((_, i) => (
        <motion.div key={i} animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.5, 1] }} transition={{ duration: 2 + Math.random()*2, repeat: Infinity }} className="absolute w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }} />
      ))}
    </div>
  );
}

// --- 2. Speed Demon (Cyan) ---
function SpeedDemonEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden bg-slate-950">
        <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.1, repeat: Infinity }} className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,rgba(6,182,212,0.4)_100%)]" />
        {[...Array(40)].map((_, i) => (
          <motion.div key={i} animate={{ x: ["-10vw", "110vw"], scaleX: [1, 10, 1] }} transition={{ duration: 0.1 + Math.random()*0.2, repeat: Infinity, ease: "linear" }} className="absolute h-1 bg-cyan-300 shadow-[0_0_20px_#22d3ee] mix-blend-screen" style={{ width: `${Math.random()*200}px`, top: `${Math.random()*100}%` }} />
        ))}
        {/* Flashing Lightning */}
        <motion.div animate={{ opacity: [0, 1, 0, 0, 1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} className="absolute inset-0 bg-white mix-blend-overlay" />
        <svg className="absolute inset-0 w-full h-full opacity-80" style={{ filter: "drop-shadow(0 0 20px #06b6d4)" }}>
           <motion.path animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }} transition={{ duration: 0.3, repeat: Infinity, repeatType: "mirror" }} d="M0,500 L200,300 L400,600 L600,200 L800,700 L1200,400" fill="none" stroke="#67e8f9" strokeWidth="8" />
           <motion.path animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }} transition={{ duration: 0.4, repeat: Infinity, delay: 0.1 }} d="M1200,100 L900,400 L700,100 L400,500 L200,100 L0,400" fill="none" stroke="#22d3ee" strokeWidth="12" />
        </svg>
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <motion.div key={i} animate={{ scale: [0, 10], opacity: [1, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.1, ease: "easeIn" }} className="absolute w-[100px] h-[100px] rounded-full border-4 border-cyan-400/50 shadow-[0_0_30px_#22d3ee_inset]" />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute w-[80vw] h-[80vw] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] bg-cyan-600/20" />
      {[...Array(20)].map((_, i) => (
        <motion.div key={i} animate={{ x: ["-10vw", "110vw"] }} transition={{ duration: 0.5 + Math.random(), repeat: Infinity, ease: "linear" }} className="absolute h-[2px] bg-cyan-400" style={{ width: `${50 + Math.random()*100}px`, top: `${Math.random()*100}%` }} />
      ))}
    </div>
  );
}

// --- 3. Competitor (Blue) ---
function CompetitorEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden [perspective:800px]">
        {/* Paparazzi Flashes */}
        {[...Array(10)].map((_, i) => (
          <motion.div key={i} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.1, repeat: Infinity, repeatDelay: Math.random()*1.5, delay: Math.random() }} className="absolute w-32 h-32 bg-white rounded-full blur-[20px] mix-blend-overlay" style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }} />
        ))}
        {/* Violent Strobe */}
        <motion.div animate={{ opacity: [0, 0.8, 0, 0.8, 0] }} transition={{ duration: 0.2, repeat: Infinity }} className="absolute inset-0 bg-blue-500 mix-blend-color-dodge pointer-events-none" />
        {/* 3D Confetti Explosion */}
        {[...Array(80)].map((_, i) => (
          <motion.div key={i} initial={{ x: "50vw", y: "50vh", z: 0 }} animate={{ x: `${Math.random()*100}vw`, y: `${Math.random()*100}vh`, z: Math.random()*500, rotateX: 1080, rotateY: 1080 }} transition={{ duration: 1.5 + Math.random(), repeat: Infinity, ease: "easeOut" }} className="absolute w-4 h-6" style={{ backgroundColor: ['#3b82f6', '#60a5fa', '#93c5fd', '#ffffff'][i%4] }} />
        ))}
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <motion.div key={i} animate={{ rotate: [-30, 30, -30] }} transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-[-10%] w-[150px] h-[150vh] origin-bottom bg-gradient-to-t from-blue-400/50 to-transparent blur-[10px] mix-blend-screen" style={{ left: `${20 + i*30}%` }} />
        ))}
        {[...Array(40)].map((_, i) => (
          <motion.div key={i} animate={{ y: ["-10vh", "110vh"], rotate: 360, x: [0, 50, -50, 0] }} transition={{ duration: 2 + Math.random()*3, repeat: Infinity, ease: "linear" }} className="absolute w-3 h-4 bg-blue-300" style={{ left: `${Math.random()*100}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
      <div className="absolute w-[60vw] h-[60vw] rounded-full blur-[100px] bg-blue-600/30" />
      <motion.div animate={{ rotate: [-10, 10, -10] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-[-20%] w-[200px] h-[150vh] origin-bottom bg-gradient-to-t from-blue-500/20 to-transparent blur-[20px]" />
    </div>
  );
}

// --- 4. Unstoppable Streak (Red) ---
function UnstoppableStreakEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden flex items-center justify-center" style={{ filter: "url(#magma-distortion)" }}>
        {/* Core Detonation */}
        <motion.div animate={{ scale: [1, 2, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 2, repeat: Infinity }} className="absolute w-[120vw] h-[120vw] bg-[radial-gradient(circle,rgba(239,68,68,1)_0%,rgba(245,158,11,0.8)_40%,transparent_70%)] rounded-full blur-[50px] mix-blend-screen" />
        {/* Magma Pillars */}
        {[...Array(5)].map((_, i) => (
          <motion.div key={i} animate={{ y: ["100vh", "-100vh"] }} transition={{ duration: 1.5 + Math.random(), repeat: Infinity, ease: "linear" }} className="absolute w-[10vw] h-[150vh] bg-gradient-to-t from-yellow-300 via-red-500 to-transparent blur-[20px]" style={{ left: `${i*20 + 10}%` }} />
        ))}
        {/* Supernova Shockwaves */}
        <motion.div animate={{ scale: [0, 3], opacity: [1, 0], borderWidth: ["50px", "0px"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }} className="absolute w-[500px] h-[500px] rounded-full border-yellow-400" />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 overflow-hidden flex items-end">
        <motion.div animate={{ y: ["0%", "-50%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute w-full h-[200%] bg-gradient-to-t from-red-600 via-orange-500/50 to-transparent blur-[30px]" />
        {[...Array(30)].map((_, i) => (
          <motion.div key={i} animate={{ y: ["110vh", "-10vh"], x: [0, Math.random()*100-50, 0] }} transition={{ duration: 1 + Math.random()*2, repeat: Infinity, ease: "easeIn" }} className="absolute w-3 h-3 bg-yellow-300 rounded-full shadow-[0_0_15px_#facc15]" style={{ left: `${Math.random()*100}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden flex items-end">
      <div className="absolute bottom-[-20%] w-[100vw] h-[50vh] bg-[radial-gradient(ellipse_at_bottom,rgba(220,38,38,0.5)_0%,transparent_70%)] blur-[50px]" />
      {[...Array(15)].map((_, i) => (
        <motion.div key={i} animate={{ y: ["110vh", "-10vh"], x: [0, 20, -20, 0], opacity: [1, 0] }} transition={{ duration: 3 + Math.random()*3, repeat: Infinity }} className="absolute w-1.5 h-1.5 bg-orange-300 rounded-full shadow-[0_0_5px_#fb923c]" style={{ left: `${Math.random()*100}%` }} />
      ))}
    </div>
  );
}

// --- 5. Early Bird (Orange) ---
function EarlyBirdEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
        {/* Stellar Eruption Base */}
        <motion.div animate={{ scale: [1, 3, 1], filter: ["hue-rotate(0deg)", "hue-rotate(30deg)", "hue-rotate(0deg)"] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute w-[80vw] h-[80vw] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(249,115,22,1)_20%,transparent_60%)] blur-[40px] mix-blend-screen" />
        {/* Violent Solar Wind (Horizontal) */}
        {[...Array(50)].map((_, i) => (
          <motion.div key={i} animate={{ x: ["-10vw", "110vw"], scaleY: [1, 5, 1] }} transition={{ duration: 0.2 + Math.random()*0.3, repeat: Infinity, ease: "linear" }} className="absolute h-1 bg-orange-300 mix-blend-overlay shadow-[0_0_20px_#f97316]" style={{ width: `${Math.random()*300}px`, top: `${Math.random()*100}%` }} />
        ))}
        {/* Chromatic Split Flash */}
        <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity, ease: "circIn" }} className="absolute inset-0 bg-white mix-blend-exclusion" />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <motion.div animate={{ rotate: 360, scale: [1, 1.1, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute w-[150vw] h-[150vw] bg-[conic-gradient(from_0deg,rgba(249,115,22,0.8)_0deg,transparent_45deg,rgba(251,146,60,0.8)_90deg,transparent_135deg,rgba(249,115,22,0.8)_180deg,transparent_225deg,rgba(251,146,60,0.8)_270deg,transparent_315deg)] blur-[30px] mix-blend-screen" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-end justify-center overflow-hidden">
      <motion.div animate={{ opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 4, repeat: Infinity }} className="absolute bottom-[-30%] w-[150vw] h-[80vh] rounded-[100%] bg-gradient-to-t from-orange-500 via-orange-400/50 to-transparent blur-[60px]" />
    </div>
  );
}

// --- 6. Comeback Kid (Indigo) ---
function ComebackKidEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {/* Black Hole Singularity */}
        <div className="absolute w-[150vw] h-[150vw] bg-slate-950 z-[-2]" />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} className="absolute w-[100vw] h-[100vw] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(79,70,229,1)_90deg,transparent_180deg,rgba(147,51,234,1)_270deg,transparent_360deg)] rounded-full blur-[30px] mix-blend-screen" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-black shadow-[0_0_100px_#4338ca_inset,0_0_100px_#4338ca] z-[-1] backdrop-filter backdrop-blur-[100px] hue-rotate-180" />
        {/* Suction Particles */}
        {[...Array(60)].map((_, i) => (
          <motion.div key={i} initial={{ scale: 0, x: (Math.random()-0.5)*2000, y: (Math.random()-0.5)*2000 }} animate={{ scale: 1, x: 0, y: 0 }} transition={{ duration: 1 + Math.random(), repeat: Infinity, ease: "easeIn" }} className="absolute w-2 h-10 bg-indigo-300 rounded-full shadow-[0_0_20px_#818cf8]" style={{ transform: `rotate(${Math.atan2(0 - (Math.random()-0.5)*2000, 0 - (Math.random()-0.5)*2000)}rad)` }} />
        ))}
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <motion.div animate={{ scale: [1, 0.5], opacity: [0, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeIn" }} className="absolute w-[80vw] h-[80vw] rounded-full border-[20px] border-indigo-500/50 blur-[10px]" />
        <motion.div animate={{ scale: [1, 0.5], opacity: [0, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 1, ease: "easeIn" }} className="absolute w-[80vw] h-[80vw] rounded-full border-[20px] border-purple-500/50 blur-[10px]" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }} className="absolute w-[120vw] h-[120vw] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-screen" />
      <div className="absolute w-[60vw] h-[60vw] bg-indigo-900/50 rounded-full blur-[100px]" />
    </div>
  );
}

// --- 7. Podium Finisher (Gold) ---
function PodiumFinisherEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden [perspective:800px] flex items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(202,138,4,0.6)_0%,transparent_70%)] mix-blend-screen" />
        {/* Massive 3D Volumetric Gold Pillars */}
        {[...Array(8)].map((_, i) => (
          <motion.div key={i} animate={{ y: ["-150vh", "150vh"] }} transition={{ duration: 1.5, repeat: Infinity, delay: i*0.2, ease: "linear" }} className="absolute w-[10vw] h-[100vh] bg-gradient-to-b from-yellow-200 via-yellow-500 to-yellow-700 shadow-[0_0_50px_#facc15]" style={{ left: `${10 + i*10}%`, transform: "rotateX(20deg) rotateY(10deg) translateZ(-200px)" }} />
        ))}
        {/* 360 Fireworks */}
        {[...Array(50)].map((_, i) => (
          <motion.div key={i} initial={{ x: 0, y: 0, scale: 0 }} animate={{ x: (Math.random()-0.5)*1500, y: (Math.random()-0.5)*1500, scale: [0, 1, 0] }} transition={{ duration: 1 + Math.random(), repeat: Infinity, ease: "easeOut" }} className="absolute w-4 h-4 bg-yellow-100 rounded-full shadow-[0_0_20px_#fef08a]" />
        ))}
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 overflow-hidden flex justify-center">
        <div className="absolute top-0 w-full h-[50vh] bg-gradient-to-b from-yellow-500/40 to-transparent blur-[30px]" />
        {[...Array(40)].map((_, i) => (
          <motion.div key={i} animate={{ y: ["-10vh", "110vh"], rotate: 720 }} transition={{ duration: 2 + Math.random()*2, repeat: Infinity, ease: "linear" }} className="absolute w-8 h-8 rounded-full bg-yellow-400 border-[4px] border-yellow-200 shadow-[0_0_15px_#facc15]" style={{ left: `${Math.random()*100}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
      <div className="absolute w-[80vw] h-[80vw] rounded-full bg-yellow-600/20 blur-[100px]" />
      <motion.div animate={{ x: ["-100vw", "100vw"] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute top-0 bottom-0 w-[50vw] bg-gradient-to-r from-transparent via-yellow-300/10 to-transparent skew-x-[-20deg]" />
    </div>
  );
}

// --- 8. Sharpshooter (Pink) ---
function SharpshooterEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden flex flex-col justify-end [perspective:500px]">
        {/* Glitched Accelerating Grid */}
        <motion.div animate={{ backgroundPositionY: ["0px", "200px"] }} transition={{ duration: 0.1, repeat: Infinity, ease: "linear" }} className="absolute bottom-0 w-full h-[150vh] border-t-[5px] border-pink-500 shadow-[0_0_50px_#ec4899_inset]" style={{ backgroundImage: "linear-gradient(rgba(236,72,153,0.8) 4px, transparent 4px), linear-gradient(90deg, rgba(236,72,153,0.8) 4px, transparent 4px)", backgroundSize: "100px 100px", transform: "rotateX(80deg)", transformOrigin: "bottom center" }} />
        {/* Massive Laser Sweeps */}
        <motion.div animate={{ x: ["-150vw", "150vw"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 bottom-0 w-[20vw] bg-pink-400 mix-blend-screen shadow-[0_0_100px_#f472b6]" style={{ transform: "skewX(-30deg)" }} />
        <motion.div animate={{ opacity: [0, 1, 0], scale: [1, 1.05, 1] }} transition={{ duration: 0.3, repeat: Infinity }} className="absolute inset-0 bg-pink-600/30 mix-blend-color-dodge pointer-events-none" />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 overflow-hidden flex flex-col justify-end [perspective:1000px]">
        <motion.div animate={{ y: ["0%", "50%"] }} transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }} className="absolute bottom-0 w-full h-[150vh] border-t-2 border-pink-500/50" style={{ backgroundImage: "linear-gradient(rgba(236,72,153,0.4) 2px, transparent 2px), linear-gradient(90deg, rgba(236,72,153,0.4) 2px, transparent 2px)", backgroundSize: "100px 100px", transform: "rotateX(75deg)", transformOrigin: "bottom center" }} />
        <motion.div animate={{ scale: [1, 0.8, 1.2, 1], rotate: [0, 90, 180, 360] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-1/4 left-1/4 w-40 h-40 border-[4px] border-pink-400 rounded-full border-dashed shadow-[0_0_20px_#f472b6]" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden flex flex-col justify-end [perspective:1000px]">
      <div className="absolute bottom-0 w-full h-[100vh]" style={{ backgroundImage: "linear-gradient(rgba(236,72,153,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(236,72,153,0.2) 1px, transparent 1px)", backgroundSize: "50px 50px", transform: "rotateX(60deg)", transformOrigin: "bottom center" }} />
    </div>
  );
}

// --- 9. Underdog (Fuchsia) ---
function UnderdogEnv({ tier }: { tier: string }) {
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ filter: "url(#void-tear)" }}>
        {/* Dimensional Tear Portal */}
        <motion.div animate={{ scaleY: [1, 0.8, 1.2, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 0.3, repeat: Infinity }} className="absolute w-[40vw] h-[150vh] bg-black shadow-[0_0_150px_#a21caf_inset,0_0_150px_#a21caf] rounded-[100%]" />
        {/* Dark Magic Tendrils */}
        <svg className="absolute inset-0 w-full h-full">
          {[...Array(10)].map((_, i) => (
            <motion.path key={i} animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }} transition={{ duration: 0.5 + Math.random(), repeat: Infinity }} d={`M500,500 Q${Math.random()*1000},${Math.random()*1000} ${Math.random()*1500},${Math.random()*1500}`} fill="none" stroke="#d946ef" strokeWidth="15" style={{ filter: "drop-shadow(0 0 20px #e879f9)" }} />
          ))}
        </svg>
        <div className="absolute inset-0 bg-fuchsia-900/30 mix-blend-color-dodge" style={{ filter: "url(#chromatic-aberration)" }} />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="absolute w-[80vw] h-[80vw] rounded-full blur-[100px] bg-fuchsia-700/40" />
        {[...Array(5)].map((_, i) => (
          <motion.div key={i} animate={{ opacity: [0, 1, 0], x: [0, 20, -20, 0] }} transition={{ duration: 0.1, repeat: Infinity, repeatDelay: Math.random() }} className="absolute w-[200vw] h-8 bg-fuchsia-400 mix-blend-screen" style={{ top: `${Math.random()*100}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute w-[60vw] h-[60vw] rounded-full blur-[80px] bg-fuchsia-800/30" />
    </div>
  );
}

// --- 10. High Achiever (Teal) ---
function PolymathEnv({ tier }: { tier: string }) {
  const chars = "010101ACHIEVEMATHPATH010101";
  if (tier === "LEGENDARY") {
    return (
      <div className="absolute inset-0 overflow-hidden bg-teal-950" style={{ filter: "url(#matrix-crush)" }}>
        {/* 3D High Density Data Streams */}
        <div className="absolute inset-0 [perspective:600px] flex items-center justify-center">
          {[...Array(40)].map((_, i) => (
            <motion.div key={i} animate={{ z: [-1000, 1000] }} transition={{ duration: 0.5 + Math.random()*0.5, repeat: Infinity, ease: "linear" }} className="absolute text-teal-300 font-mono text-4xl md:text-6xl font-black whitespace-nowrap" style={{ left: `${(Math.random()-0.5)*200}%`, top: `${(Math.random()-0.5)*200}%` }}>
              {chars.substring(0, 5 + Math.floor(Math.random()*10))}
            </motion.div>
          ))}
        </div>
        <motion.div animate={{ opacity: [0, 0.8, 0] }} transition={{ duration: 0.1, repeat: Infinity }} className="absolute inset-0 bg-teal-500 mix-blend-overlay" />
      </div>
    );
  }
  if (tier === "SUPER") {
    return (
      <div className="absolute inset-0 bg-teal-950/90 overflow-hidden">
        {[...Array(30)].map((_, col) => (
          <div key={col} className="absolute top-[-100%] text-teal-400 font-mono text-2xl font-bold flex flex-col items-center" style={{ left: `${(col / 30) * 100}%` }}>
            <motion.div animate={{ y: ["0vh", "200vh"] }} transition={{ duration: 0.8 + Math.random(), repeat: Infinity, ease: "linear" }}>
               {[...Array(15)].map((_, i) => (
                 <div key={i} className={i === 14 ? "text-teal-100 text-shadow-[0_0_15px_#5eead4]" : ""}>{chars[Math.floor(Math.random() * chars.length)]}</div>
               ))}
            </motion.div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-teal-950/80 overflow-hidden">
      <div className="absolute w-[60vw] h-[60vw] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] bg-teal-600/30" />
      {[...Array(10)].map((_, col) => (
        <div key={col} className="absolute top-[-100%] text-teal-600/50 font-mono text-lg flex flex-col items-center" style={{ left: `${(col / 10) * 100}%` }}>
          <motion.div animate={{ y: ["0vh", "200vh"] }} transition={{ duration: 3 + Math.random()*2, repeat: Infinity, ease: "linear" }}>
             {[...Array(5)].map((_, i) => (
               <div key={i}>{chars[Math.floor(Math.random() * chars.length)]}</div>
             ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}


// --- MAIN MODAL COMPONENT ---

export function BadgeInspectionModal({ badge, config, onClose }: BadgeInspectionModalProps) {
  // Setup 3D Mouse Physics inside the modal
  const [physics, setPhysics] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Rotate (Max 25deg)
    const ry = ((x / rect.width) - 0.5) * 50; 
    const rx = ((0.5 - (y / rect.height))) * 50; 

    // Glare % (0 to 100)
    const gx = (x / rect.width) * 100;
    const gy = (y / rect.height) * 100;
    
    setPhysics({ rx, ry, gx, gy });
  };

  const handleMouseLeave = () => {
    setPhysics({ rx: 0, ry: 0, gx: 50, gy: 50 });
  };

  const tier = badge.tier;
  const isLegendary = tier === "LEGENDARY";

  const Icon = IconMap[badge.iconName] || Target;

  const getShapeStyles = (iconName: string) => {
    const shapes: Record<string, { clipPath: string, w: string, h: string }> = {
      "Target": { clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Focus": { clipPath: "polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Scan": { clipPath: "polygon(50% 0%, 65% 25%, 100% 25%, 75% 50%, 85% 90%, 50% 70%, 15% 90%, 25% 50%, 0% 25%, 35% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Zap": { clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "FastForward": { clipPath: "polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Rocket": { clipPath: "polygon(50% 0%, 100% 40%, 80% 100%, 50% 80%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Medal": { clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Flag": { clipPath: "polygon(0% 0%, 100% 0%, 80% 50%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Crown": { clipPath: "polygon(0% 0%, 25% 30%, 50% 0%, 75% 30%, 100% 0%, 90% 100%, 10% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Flame": { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Activity": { clipPath: "polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Infinity": { clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Clock": { clipPath: "polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Sun": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)", w: "w-56 md:w-72", h: "h-40 md:h-48" },
      "AlarmClock": { clipPath: "polygon(30% 0%, 70% 0%, 100% 20%, 100% 80%, 70% 100%, 30% 100%, 0% 80%, 0% 20%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "TrendingUp": { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ArrowUpRight": { clipPath: "polygon(50% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "ChevronsUp": { clipPath: "polygon(50% 0%, 100% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Trophy": { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Star": { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Sparkles": { clipPath: "polygon(50% 0%, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0% 50%, 45% 45%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Crosshair": { clipPath: "polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)", w: "w-48 md:w-64", h: "h-48 md:h-64" },
      "Aperture": { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Radar": { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", w: "w-56 md:w-72", h: "h-56 md:h-72" },
      "Shield": { clipPath: "polygon(0% 10%, 100% 10%, 100% 60%, 50% 100%, 0% 60%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Anchor": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Mountain": { clipPath: "polygon(50% 0%, 100% 20%, 90% 80%, 50% 100%, 10% 80%, 0% 20%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Brain": { clipPath: "polygon(20% 20%, 80% 20%, 100% 80%, 0% 80%)", w: "w-56 md:w-72", h: "h-48 md:h-64" },
      "Lightbulb": { clipPath: "polygon(30% 0%, 70% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)", w: "w-48 md:w-64", h: "h-56 md:h-72" },
      "Library": { clipPath: "polygon(0% 0%, 100% 0%, 90% 50%, 100% 100%, 0% 100%, 10% 50%)", w: "w-48 md:w-64", h: "h-56 md:h-72" }
    };
    return shapes[iconName] || shapes["Target"];
  };
  const shape = getShapeStyles(badge.iconName);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-3xl overflow-hidden"
      >
        <AAAFilters />

        {/* Dynamic Screen Shake for Legendary */}
        <motion.div 
          animate={isLegendary ? { x: [-3, 3, -3, 3, 0], y: [-3, 3, -3, 3, 0] } : {}}
          transition={isLegendary ? { duration: 0.5, repeat: Infinity, ease: "linear" } : {}}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {badge.code === "perfectionist" && <PerfectionistEnv tier={tier} />}
          {badge.code === "speed_demon" && <SpeedDemonEnv tier={tier} />}
          {badge.code === "competitor" && <CompetitorEnv tier={tier} />}
          {badge.code === "unstoppable_streak" && <UnstoppableStreakEnv tier={tier} />}
          {badge.code === "early_bird" && <EarlyBirdEnv tier={tier} />}
          {badge.code === "comeback_kid" && <ComebackKidEnv tier={tier} />}
          {badge.code === "podium_finisher" && <PodiumFinisherEnv tier={tier} />}
          {badge.code === "sharpshooter" && <SharpshooterEnv tier={tier} />}
          {badge.code === "underdog" && <UnderdogEnv tier={tier} />}
          {badge.code === "polymath" && <PolymathEnv tier={tier} />}
        </motion.div>

        {/* 3D Interactive Badge Container */}
        <motion.div 
           initial={{ scale: 0.5, y: 100, rotateY: -180 }}
           animate={{ scale: 1, y: 0, rotateY: 0 }}
           transition={{ type: "spring", bounce: 0.5, duration: 1 }}
           className="relative z-10 [perspective:2000px] flex flex-col items-center justify-center mb-8"
        >
           <div 
             ref={cardRef}
             onMouseMove={handleMouseMove}
             onMouseLeave={handleMouseLeave}
             className="relative flex items-center justify-center cursor-pointer transition-transform duration-100 ease-out transform-gpu"
             style={{
                transform: `rotateX(${physics.rx}deg) rotateY(${physics.ry}deg)`,
                filter: `drop-shadow(0 40px 60px ${config.bloomColor})`
             }}
           >
              {/* Giant Clipped Polygon */}
              <div 
                className={`relative flex items-center justify-center ${shape.w} ${shape.h}`} 
                style={{ clipPath: shape.clipPath, background: config.customBg || config.unlockedBg, border: config.customBorder }}
              >
                 <Icon size={120} style={{ color: config.iconColorHex }} className={`drop-shadow-lg ${config.glitch ? 'animate-pulse' : ''}`} />
                 
                 {/* Internal AAA Glare */}
                 <div 
                    className="absolute inset-0 pointer-events-none z-10 mix-blend-overlay"
                    style={{
                       background: `linear-gradient(105deg, transparent ${physics.gx - 20}%, rgba(255,255,255,1) ${physics.gx}%, transparent ${physics.gx + 20}%)`,
                    }}
                  />
              </div>

              {/* Legendary Conic Ring Wrapper inside the 3D card */}
              {isLegendary && (
                 <div className="absolute inset-[-40%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(255,255,255,0.4)_360deg)] z-[-1] rounded-full pointer-events-none mix-blend-color-dodge blur-[2px]" />
              )}
           </div>
        </motion.div>

        {/* Floating Text Info */}
        <motion.div 
           initial={{ opacity: 0, y: 50 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.5, duration: 0.5 }}
           className="relative z-10 text-center max-w-2xl px-6"
        >
            <h1 className="text-5xl md:text-7xl font-black italic uppercase text-white mb-4 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-tight">
               {badge.name}
            </h1>
            <p className="text-xl md:text-3xl text-slate-200/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-medium">
               {badge.description}
            </p>
            <div className="mt-8 flex items-center justify-center space-x-2">
               <span className={`px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-md border ${tier === 'LEGENDARY' ? 'text-yellow-400 border-yellow-400/50' : tier === 'SUPER' ? 'text-indigo-400 border-indigo-400/50' : 'text-slate-300 border-slate-500/50'}`}>
                 {tier} TIER
               </span>
               <span className="px-4 py-1.5 rounded-full text-sm font-black text-emerald-400 uppercase tracking-widest bg-emerald-950/50 backdrop-blur-md border border-emerald-500/50">
                 UNLOCKED
               </span>
            </div>
        </motion.div>

        {/* Close Button */}
        <button 
           onClick={onClose}
           className="absolute top-8 right-8 z-50 text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-800 rounded-full p-3 transition-colors backdrop-blur-md border border-slate-700"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

      </motion.div>
    </AnimatePresence>
  );
}
