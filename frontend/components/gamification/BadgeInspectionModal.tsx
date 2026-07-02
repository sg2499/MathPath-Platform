"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, 
  Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun, 
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star, 
  Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library 
} from "lucide-react";

// Same Icon map from page.tsx to render the badge center
const IconMap: Record<string, React.ElementType> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal,
  Flag, Crown, Flame, Activity, Infinity: InfinityIcon, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Trophy, Star,
  Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library
};

interface BadgeInspectionModalProps {
  badge: any;
  config: any;
  onClose: () => void;
}

// --- Custom VFX Environments ---

// 1. Perfectionist (God Rays + Emerald Crystals)
function PerfectionistEnv({ intensity }: { intensity: number }) {
  return (
    <>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 30 / intensity, repeat: Infinity, ease: "linear" }} className="absolute inset-0 flex items-center justify-center opacity-40">
         <div className={`w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full blur-[100px]`} style={{ background: "radial-gradient(circle, rgba(16,185,129,0.8) 0%, transparent 70%)" }} />
         {/* Rays */}
         <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0_15deg,rgba(16,185,129,0.2)_30deg,transparent_45deg)]" />
      </motion.div>
      {[...Array(5 * intensity)].map((_, i) => (
         <motion.div key={i} animate={{ y: [0, -100, 0], rotate: [0, 90, 180] }} transition={{ duration: 5 + Math.random()*5, repeat: Infinity, ease: "easeInOut" }} className="absolute w-12 h-12 bg-emerald-400/20 rounded-lg blur-[2px] border border-emerald-300/30" style={{ top: `${Math.random()*100}%`, left: `${Math.random()*100}%` }} />
      ))}
    </>
  );
}

// 2. Speed Demon (Cyan Lightning + Hyperspeed)
function SpeedDemonEnv({ intensity }: { intensity: number }) {
  return (
    <>
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 0.5 / intensity, repeat: Infinity }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <div className={`w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full blur-[100px]`} style={{ background: "radial-gradient(circle, rgba(6,182,212,0.8) 0%, transparent 70%)" }} />
      </motion.div>
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(10 * intensity)].map((_, i) => (
           <motion.div key={i} animate={{ x: ["-100vw", "100vw"] }} transition={{ duration: 0.2 + Math.random()*0.3, repeat: Infinity, ease: "linear" }} className="absolute h-[2px] bg-cyan-300 shadow-[0_0_10px_#22d3ee]" style={{ width: `${50 + Math.random()*200}px`, top: `${Math.random()*100}%` }} />
        ))}
      </div>
      {/* Lightning Flashes */}
      <motion.div animate={{ opacity: [0, 0, 0.8, 0, 0] }} transition={{ duration: 1.5, repeat: Infinity, times: [0, 0.4, 0.5, 0.6, 1] }} className="absolute inset-0 bg-cyan-200 mix-blend-overlay pointer-events-none" />
    </>
  );
}

// 3. Competitor (Blue Stadium Spotlights + Confetti)
function CompetitorEnv({ intensity }: { intensity: number }) {
  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">
         <div className={`w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full blur-[100px]`} style={{ background: "radial-gradient(circle, rgba(37,99,235,0.8) 0%, transparent 70%)" }} />
      </div>
      {/* Sweeping Spotlights */}
      {[...Array(1 + intensity)].map((_, i) => (
        <motion.div key={i} animate={{ rotate: [-20, 20, -20] }} transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }} className="absolute top-[-20%] w-[100px] h-[150vh] bg-gradient-to-b from-blue-300/40 to-transparent blur-md origin-top mix-blend-screen" style={{ left: `${30 + (i * 20)}%` }} />
      ))}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20 * intensity)].map((_, i) => (
           <motion.div key={i} animate={{ y: ["-10vh", "110vh"], rotate: [0, 360] }} transition={{ duration: 2 + Math.random()*3, repeat: Infinity, ease: "linear" }} className="absolute w-3 h-4 bg-blue-400 rounded-sm" style={{ left: `${Math.random()*100}%` }} />
        ))}
      </div>
    </>
  );
}

// 4. Unstoppable Streak (Red Inferno)
function UnstoppableStreakEnv({ intensity }: { intensity: number }) {
  return (
    <>
      <motion.div animate={{ scale: [1, 1.05, 1], filter: ["hue-rotate(0deg)", "hue-rotate(10deg)", "hue-rotate(0deg)"] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 flex items-center justify-center">
         <div className={`w-[100vw] h-[100vw] md:w-[60vw] md:h-[60vw] rounded-full blur-[120px]`} style={{ background: "radial-gradient(circle, rgba(220,38,38,0.9) 0%, transparent 70%)" }} />
      </motion.div>
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(15 * intensity)].map((_, i) => (
           <motion.div key={i} animate={{ y: ["110vh", "-10vh"], x: [0, Math.random()*100 - 50, 0] }} transition={{ duration: 1 + Math.random()*2, repeat: Infinity, ease: "easeIn" }} className="absolute w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_10px_#facc15]" style={{ left: `${Math.random()*100}%` }} />
        ))}
        {intensity >= 2 && (
          <motion.div animate={{ y: ["0%", "-50%"] }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} className="absolute bottom-0 left-0 right-0 h-[200vh] bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 mix-blend-overlay" style={{ backgroundSize: "100px" }} />
        )}
      </div>
    </>
  );
}

// 5. Early Bird (Orange Sunrise / Quasar)
function EarlyBirdEnv({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end overflow-hidden pb-10">
      <motion.div animate={{ scale: [1, 1.1 + (intensity*0.1), 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-[-20%] w-[150vw] h-[100vw] rounded-full blur-[100px]" style={{ background: "radial-gradient(circle, rgba(234,88,12,1) 0%, rgba(251,146,60,0.5) 40%, transparent 70%)" }} />
      {[...Array(10 * intensity)].map((_, i) => (
           <motion.div key={i} animate={{ y: [0, -200, 0], scale: [1, 0, 1] }} transition={{ duration: 3 + Math.random()*4, repeat: Infinity, ease: "easeInOut" }} className="absolute w-3 h-3 bg-orange-200 rounded-full blur-[1px]" style={{ bottom: `${Math.random()*50}%`, left: `${Math.random()*100}%` }} />
        ))}
    </div>
  );
}

// 6. Comeback Kid (Indigo Galaxy / Void Rift)
function ComebackKidEnv({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <motion.div animate={{ rotate: -360, scale: intensity === 3 ? [1, 1.2, 1] : 1 }} transition={{ duration: 40 / intensity, repeat: Infinity, ease: "linear" }} className="absolute w-[120vw] h-[120vw] rounded-full opacity-60" style={{ background: "conic-gradient(from 0deg, transparent 0%, rgba(79,70,229,0.4) 25%, transparent 50%, rgba(147,51,234,0.4) 75%, transparent 100%)", filter: "blur(40px)" }} />
      <div className={`w-[60vw] h-[60vw] rounded-full blur-[80px]`} style={{ background: "radial-gradient(circle, rgba(49,46,129,1) 0%, transparent 70%)" }} />
    </div>
  );
}

// 7. Podium Finisher (Gold Royal Treasury)
function PodiumFinisherEnv({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
      <div className={`absolute w-[100vw] h-[100vw] rounded-full blur-[120px]`} style={{ background: "radial-gradient(circle, rgba(202,138,4,0.6) 0%, transparent 60%)" }} />
      {[...Array(2 * intensity)].map((_, i) => (
        <motion.div key={i} animate={{ x: ["-100%", "100%"] }} transition={{ duration: 6 + i, repeat: Infinity, ease: "linear" }} className="absolute top-0 bottom-0 w-[200px] bg-gradient-to-r from-transparent via-yellow-200/20 to-transparent skew-x-[-20deg]" />
      ))}
      {[...Array(15 * intensity)].map((_, i) => (
           <motion.div key={i} animate={{ y: ["-10vh", "110vh"], rotate: [0, 720] }} transition={{ duration: 2 + Math.random()*3, repeat: Infinity, ease: "linear" }} className="absolute w-8 h-8 rounded-full bg-yellow-400/80 shadow-[0_0_15px_#facc15] border-4 border-yellow-200" style={{ left: `${Math.random()*100}%` }} />
        ))}
    </div>
  );
}

// 8. Sharpshooter (Pink Cyberpunk Grid)
function SharpshooterEnv({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden flex flex-col justify-end perspective-1000">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-[80vw] h-[80vw] rounded-full blur-[100px]`} style={{ background: "radial-gradient(circle, rgba(219,39,119,0.7) 0%, transparent 70%)" }} />
      </div>
      {/* 3D Scrolling Grid */}
      <motion.div animate={{ y: ["0%", "50%"] }} transition={{ duration: 1 / intensity, repeat: Infinity, ease: "linear" }} className="absolute bottom-0 w-full h-[150vh] border-t-2 border-pink-500/50" style={{ backgroundImage: "linear-gradient(rgba(236,72,153,0.3) 2px, transparent 2px), linear-gradient(90deg, rgba(236,72,153,0.3) 2px, transparent 2px)", backgroundSize: "100px 100px", transform: "rotateX(75deg)", transformOrigin: "bottom center" }} />
      {/* Targeting Reticles */}
      {intensity >= 2 && (
        <motion.div animate={{ scale: [1, 0.8, 1.2, 1], opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-pink-400 rounded-full border-dashed" />
      )}
    </div>
  );
}

// 9. Underdog (Fuchsia Dark Magic)
function UnderdogEnv({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
       <motion.div animate={{ filter: ["hue-rotate(0deg)", "hue-rotate(20deg)", "hue-rotate(0deg)"] }} transition={{ duration: 0.5, repeat: Infinity }} className="absolute inset-0">
          <div className={`w-[80vw] h-[80vw] rounded-full blur-[100px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`} style={{ background: "radial-gradient(circle, rgba(162,28,175,0.8) 0%, transparent 70%)" }} />
       </motion.div>
       {/* Glitch overlays */}
       {[...Array(3 * intensity)].map((_, i) => (
          <motion.div key={i} animate={{ opacity: [0, 0.8, 0], x: [0, 20, -20, 0] }} transition={{ duration: 0.2, repeat: Infinity, repeatDelay: Math.random()*2 }} className="absolute w-[200vw] h-4 bg-fuchsia-400 mix-blend-screen" style={{ top: `${Math.random()*100}%` }} />
       ))}
    </div>
  );
}

// 10. High Achiever (Teal Digital Rain)
function PolymathEnv({ intensity }: { intensity: number }) {
  const chars = "010101ACHIEVEMATHPATH010101";
  return (
    <div className="absolute inset-0 bg-teal-950/80 overflow-hidden">
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full blur-[100px]`} style={{ background: "radial-gradient(circle, rgba(13,148,136,0.6) 0%, transparent 70%)" }} />
      {[...Array(20 * intensity)].map((_, col) => (
        <div key={col} className="absolute top-[-100%] text-teal-400/70 font-mono text-xl md:text-3xl font-bold flex flex-col items-center" style={{ left: `${(col / (20 * intensity)) * 100}%` }}>
          <motion.div animate={{ y: ["0vh", "200vh"] }} transition={{ duration: 1 + Math.random()*2, repeat: Infinity, ease: "linear" }}>
             {[...Array(10)].map((_, i) => (
               <div key={i} className={i === 9 ? "text-teal-200 text-shadow-[0_0_10px_#5eead4]" : ""}>{chars[Math.floor(Math.random() * chars.length)]}</div>
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
  const intensity = tier === "LEGENDARY" ? 3 : tier === "SUPER" ? 2 : 1;
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
        {/* Dynamic Screen Shake for Legendary */}
        <motion.div 
          animate={isLegendary ? { x: [-3, 3, -3, 3, 0], y: [-3, 3, -3, 3, 0] } : {}}
          transition={isLegendary ? { duration: 0.5, repeat: Infinity, ease: "linear" } : {}}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {badge.code === "perfectionist" && <PerfectionistEnv intensity={intensity} />}
          {badge.code === "speed_demon" && <SpeedDemonEnv intensity={intensity} />}
          {badge.code === "competitor" && <CompetitorEnv intensity={intensity} />}
          {badge.code === "unstoppable_streak" && <UnstoppableStreakEnv intensity={intensity} />}
          {badge.code === "early_bird" && <EarlyBirdEnv intensity={intensity} />}
          {badge.code === "comeback_kid" && <ComebackKidEnv intensity={intensity} />}
          {badge.code === "podium_finisher" && <PodiumFinisherEnv intensity={intensity} />}
          {badge.code === "sharpshooter" && <SharpshooterEnv intensity={intensity} />}
          {badge.code === "underdog" && <UnderdogEnv intensity={intensity} />}
          {badge.code === "polymath" && <PolymathEnv intensity={intensity} />}
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
