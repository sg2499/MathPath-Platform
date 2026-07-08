'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
}

// ----------------------------------------------------------------------
// COPPER: Heavy industrial gear drop, sparks, and slam.
// ----------------------------------------------------------------------
const CopperSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#0a0500]">
      {/* Background ambient glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(180,83,9,0.3)_0%,transparent_60%)] mix-blend-screen"
      />

      {/* The Gear Drop */}
      <motion.div
        initial={{ y: -800, rotate: -90 }}
        animate={{ y: 0, rotate: 0 }}
        transition={{ type: "spring", bounce: 0.4, duration: 1 }}
        className="absolute z-10 drop-shadow-[0_20px_30px_rgba(180,83,9,0.8)]"
      >
        <svg width="300" height="300" viewBox="0 0 100 100" className="opacity-90">
          <path d="M 50 5 L 65 15 L 95 50 L 65 85 L 50 95 L 35 85 L 5 50 L 35 15 Z" fill="#78350f" stroke="#f59e0b" strokeWidth="2" />
          <circle cx="50" cy="50" r="25" fill="#451a03" stroke="#d97706" strokeWidth="4" />
          <circle cx="50" cy="50" r="10" fill="#fef3c7" />
        </svg>
      </motion.div>

      {/* Sparks (triggered upon impact at ~0.6s) */}
      {[...Array(12)].map((_, i) => {
        const angle = (i * 360) / 12;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ 
              x: Math.cos(angle * Math.PI / 180) * 400, 
              y: Math.sin(angle * Math.PI / 180) * 400,
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0]
            }}
            transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
            className="absolute z-20 w-3 h-3 bg-orange-400 rounded-full blur-[2px] shadow-[0_0_10px_#f59e0b]"
          />
        );
      })}

      {/* Shockwave */}
      <motion.div
        initial={{ scale: 0, opacity: 0.8, borderWidth: "20px" }}
        animate={{ scale: 3, opacity: 0, borderWidth: "1px" }}
        transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
        className="absolute z-0 w-96 h-96 border-orange-500 rounded-full"
      />

      {/* Text Reveal */}
      <motion.h1
        initial={{ scale: 2, opacity: 0, y: 100 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.8, type: "spring", bounce: 0.5, duration: 0.8 }}
        className="text-8xl md:text-[9rem] font-black uppercase text-amber-100 z-30 tracking-tight"
        style={{
          textShadow: '0 10px 0 #78350f, 0 20px 40px #f59e0b, 0 0 100px #ea580c',
          WebkitTextStroke: '2px #fcd34d'
        }}
      >
        COPPER
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// BRONZE: Heavy shield, sweeping light rays.
// ----------------------------------------------------------------------
const BronzeSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#0d0402]">
      {/* Light Rays */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(234,88,12,0.2)_45deg,transparent_90deg,transparent_180deg,rgba(234,88,12,0.2)_225deg,transparent_270deg)] mix-blend-screen blur-xl"
      />

      {/* Shield Formation */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, filter: "brightness(5) blur(20px)" }}
        animate={{ scale: 1, opacity: 1, filter: "brightness(1) blur(0px)" }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute z-10"
      >
        <svg width="400" height="400" viewBox="0 0 100 100" className="drop-shadow-[0_0_50px_rgba(154,52,18,0.6)]">
          <path d="M 50 0 L 95 20 L 95 60 L 50 100 L 5 60 L 5 20 Z" fill="#431407" stroke="#ea580c" strokeWidth="1" />
          <path d="M 50 10 L 80 25 L 80 55 L 50 85 L 20 55 L 20 25 Z" fill="none" stroke="#fdba74" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      </motion.div>

      {/* Core Glow */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2, 1.5], opacity: [0, 1, 0.8] }}
        transition={{ delay: 1, duration: 1.5 }}
        className="absolute z-20 w-64 h-64 bg-orange-500 rounded-full blur-[80px] mix-blend-screen"
      />

      {/* Typography */}
      <motion.h1
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.2, duration: 1, ease: "backOut" }}
        className="text-8xl md:text-[10rem] font-black uppercase text-orange-100 z-30 tracking-wide"
        style={{
          textShadow: '0 8px 0 #431407, 0 15px 30px #9a3412, 0 0 80px #ea580c',
        }}
      >
        BRONZE
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// SILVER: Cyber-lines, flash, extreme tracking.
// ----------------------------------------------------------------------
const SilverSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#020617]">
      {/* Cyber lines shooting horizontally */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ x: "-100vw", opacity: 0 }}
          animate={{ x: "100vw", opacity: [0, 1, 0] }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: "linear" }}
          className="absolute h-[2px] bg-cyan-400 blur-[1px]"
          style={{ 
            top: `${10 + Math.random() * 80}%`,
            width: `${100 + Math.random() * 300}px`,
            boxShadow: '0 0 10px #22d3ee'
          }}
        />
      ))}

      {/* Screen Flash */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
        className="absolute inset-0 bg-white z-20 mix-blend-overlay"
      />

      {/* Silver Core */}
      <motion.div
        initial={{ scale: 0, rotate: 180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, type: "spring", bounce: 0.3, duration: 1.5 }}
        className="absolute z-10 drop-shadow-[0_0_60px_#0284c7]"
      >
        <svg width="500" height="500" viewBox="0 0 100 100">
          <polygon points="50,5 95,50 50,95 5,50" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="1 3" />
          <polygon points="50,15 85,50 50,85 15,50" fill="#0c4a6e" stroke="#e0f2fe" strokeWidth="1" />
        </svg>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, letterSpacing: "-0.5em", filter: "blur(20px)" }}
        animate={{ opacity: 1, letterSpacing: "0.2em", filter: "blur(0px)" }}
        transition={{ delay: 1, duration: 1.2, ease: "easeOut" }}
        className="text-7xl md:text-[9rem] font-black uppercase text-sky-50 z-30"
        style={{
          textShadow: '0 0 20px #bae6fd, 0 0 60px #0284c7, 0 5px 0 #082f49'
        }}
      >
        SILVER
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// GOLDEN: Sunburst, floating particles.
// ----------------------------------------------------------------------
const GoldenSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#1a1100]">
      {/* Sunburst Rays */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1.5, opacity: 1, rotate: 360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(234,179,8,0.1)_15deg,transparent_30deg,rgba(234,179,8,0.1)_45deg,transparent_60deg)] mix-blend-screen"
      />

      {/* Golden Particles */}
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: "100vh", opacity: 0, x: `${Math.random() * 100}vw` }}
          animate={{ y: "-10vh", opacity: [0, 1, 0] }}
          transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 1.5, repeat: Infinity }}
          className="absolute w-2 h-2 rounded-full bg-yellow-300 blur-[2px] shadow-[0_0_15px_#facc15]"
        />
      ))}

      {/* Massive Aura */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute z-10 w-[600px] h-[600px] bg-yellow-500 rounded-full blur-[120px] mix-blend-screen opacity-60"
      />

      <motion.h1
        initial={{ opacity: 0, scale: 0.5, filter: "brightness(0)" }}
        animate={{ opacity: 1, scale: 1, filter: "brightness(1.5)" }}
        transition={{ delay: 0.5, duration: 1.5, type: "spring" }}
        className="text-8xl md:text-[11rem] font-black uppercase text-yellow-100 z-30"
        style={{
          textShadow: '0 5px 0 #713f12, 0 20px 40px #ca8a04, 0 0 100px #eab308'
        }}
      >
        GOLDEN
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// PLATINUM: 3D Grid Matrix, laser reveal.
// ----------------------------------------------------------------------
const PlatinumSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#0c001a] perspective-[1000px]">
      {/* 3D Grid */}
      <motion.div
        initial={{ rotateX: 80, y: 200, opacity: 0 }}
        animate={{ rotateX: 60, y: 100, opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute inset-[-50%] bg-[linear-gradient(rgba(192,132,252,0.2)_2px,transparent_2px),linear-gradient(90deg,rgba(192,132,252,0.2)_2px,transparent_2px)] bg-[size:50px_50px]"
        style={{ transformOrigin: "center top" }}
      />

      {/* Laser Scan Line */}
      <motion.div
        initial={{ top: "-20%" }}
        animate={{ top: "120%" }}
        transition={{ duration: 2, ease: "easeInOut" }}
        className="absolute left-0 right-0 h-2 bg-fuchsia-400 blur-[2px] shadow-[0_0_30px_#e879f9] z-20 mix-blend-screen"
      />

      {/* Geometry */}
      <motion.div
        initial={{ scale: 0, rotateY: -180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ delay: 0.5, duration: 1.5, type: "spring" }}
        className="absolute z-10"
      >
        <svg width="400" height="400" viewBox="0 0 100 100" className="drop-shadow-[0_0_40px_#a855f7]">
          <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill="#2e1065" stroke="#d8b4fe" strokeWidth="1" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="#f0abfc" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, clipPath: "polygon(0 0, 100% 0, 100% 0, 0 0)" }}
        animate={{ opacity: 1, clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}
        transition={{ delay: 1, duration: 1, ease: "easeOut" }}
        className="text-7xl md:text-[9rem] font-black uppercase text-fuchsia-100 z-30 tracking-widest"
        style={{
          textShadow: '0 0 20px #e879f9, 0 0 60px #9333ea, 0 10px 0 #3b0764'
        }}
      >
        PLATINUM
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// EMERALD: Shattering fractals.
// ----------------------------------------------------------------------
const EmeraldSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#001509]">
      {/* Spinning Outer Fractals */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute z-0"
      >
        <svg width="800" height="800" viewBox="0 0 100 100" className="opacity-20 blur-[2px]">
          <polygon points="50,0 100,86.6 0,86.6" fill="none" stroke="#10b981" strokeWidth="0.2" />
          <polygon points="50,100 0,13.4 100,13.4" fill="none" stroke="#34d399" strokeWidth="0.2" />
        </svg>
      </motion.div>

      {/* Shatter Impact Center */}
      <motion.div
        initial={{ scale: 0.1, opacity: 1 }}
        animate={{ scale: [0.1, 1.2, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="absolute z-10 w-96 h-96 border-4 border-emerald-400 rounded-full"
      />

      <motion.div
        initial={{ scale: 0, filter: "brightness(3)" }}
        animate={{ scale: 1, filter: "brightness(1)" }}
        transition={{ delay: 0.8, type: "spring", bounce: 0.6 }}
        className="absolute z-20 drop-shadow-[0_0_80px_#059669]"
      >
        <svg width="400" height="400" viewBox="0 0 100 100">
          <polygon points="50,5 90,50 50,95 10,50" fill="#064e3b" stroke="#6ee7b7" strokeWidth="2" />
          <polygon points="50,20 75,50 50,80 25,50" fill="#022c22" stroke="#34d399" strokeWidth="1" />
        </svg>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.8, ease: "backOut" }}
        className="text-7xl md:text-[9rem] font-black uppercase text-emerald-50 z-30 tracking-tight"
        style={{
          textShadow: '0 8px 0 #022c22, 0 20px 40px #059669, 0 0 80px #10b981'
        }}
      >
        EMERALD
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// DIAMOND: Prismatic light, crystalline explosion.
// ----------------------------------------------------------------------
const DiamondSequence = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#000a14]">
      {/* Crystalline Splinters */}
      {[...Array(8)].map((_, i) => {
        const angle = (i * 360) / 8;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ 
              x: Math.cos(angle * Math.PI / 180) * 800, 
              y: Math.sin(angle * Math.PI / 180) * 800,
              scale: [0, 2, 0],
              rotate: 180
            }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute z-10 w-2 h-40 bg-gradient-to-t from-transparent via-cyan-300 to-transparent blur-[1px] mix-blend-screen"
            style={{ transform: `rotate(${angle + 90}deg)` }}
          />
        );
      })}

      <motion.div
        initial={{ scale: 0, rotateZ: -180 }}
        animate={{ scale: 1, rotateZ: 0 }}
        transition={{ delay: 0.5, duration: 1.5, ease: "backOut" }}
        className="absolute z-20 drop-shadow-[0_0_100px_#0ea5e9]"
      >
        <svg width="500" height="500" viewBox="0 0 100 100">
          <polygon points="50,0 100,30 50,100 0,30" fill="#082f49" stroke="#bae6fd" strokeWidth="1" />
          <polygon points="50,15 80,35 50,85 20,35" fill="none" stroke="#7dd3fc" strokeWidth="0.5" />
          <line x1="0" y1="30" x2="100" y2="30" stroke="#38bdf8" strokeWidth="1" />
        </svg>
      </motion.div>

      {/* Core Flare */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 4, 0], opacity: [0, 1, 0] }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute z-30 w-[800px] h-4 bg-white rounded-full blur-[4px] mix-blend-overlay"
      />

      <motion.h1
        initial={{ opacity: 0, scale: 0.8, filter: "brightness(5) blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "brightness(1) blur(0px)" }}
        transition={{ delay: 1, duration: 1.2, ease: "easeOut" }}
        className="text-8xl md:text-[10rem] font-black uppercase text-sky-50 z-40 tracking-[0.1em]"
        style={{
          textShadow: '0 0 30px #7dd3fc, 0 0 80px #0284c7, 0 8px 0 #082f49'
        }}
      >
        DIAMOND
      </motion.h1>
    </div>
  );
};

// ----------------------------------------------------------------------
// CHAMPION: Absolute God-Tier explosion, intense screen shake.
// ----------------------------------------------------------------------
const ChampionSequence = () => {
  return (
    <motion.div 
      initial={{ x: 0, y: 0 }}
      animate={{ 
        x: [0, -20, 20, -15, 15, -10, 10, -5, 5, 0], 
        y: [0, 20, -20, 15, -15, 10, -10, 5, -5, 0] 
      }}
      transition={{ duration: 0.8, ease: "linear" }}
      className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden bg-[#0a0002]"
    >
      {/* Background Pulse Aura */}
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 2], opacity: [1, 0] }}
        transition={{ duration: 1.2, ease: "easeOut", repeat: Infinity, repeatDelay: 1 }}
        className="absolute w-[800px] h-[800px] rounded-full border-[10px] border-rose-600 mix-blend-screen blur-[10px]"
      />

      {/* God Rays (Rotating) */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(225,29,72,0.3)_30deg,transparent_60deg,rgba(225,29,72,0.3)_120deg,transparent_150deg,rgba(225,29,72,0.3)_210deg,transparent_240deg,rgba(225,29,72,0.3)_300deg,transparent_330deg)] mix-blend-screen blur-xl"
      />

      {/* Demonic Core Geometry */}
      <motion.div
        initial={{ scale: 0.1, rotate: 180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, type: "spring", bounce: 0.2, duration: 1.5 }}
        className="absolute z-20 drop-shadow-[0_0_120px_#e11d48]"
      >
        <svg width="600" height="600" viewBox="0 0 100 100">
          <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill="#4c0519" stroke="#fda4af" strokeWidth="0.5" />
          <polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="50" cy="50" r="10" fill="#fff" filter="blur(4px)" />
        </svg>
      </motion.div>

      {/* Typography with extreme weight and shadow */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.1, letterSpacing: "-0.5em" }}
        animate={{ opacity: 1, scale: 1, letterSpacing: "0.1em" }}
        transition={{ delay: 1, duration: 1, ease: "backOut" }}
        className="text-8xl md:text-[12rem] font-black uppercase text-rose-50 z-40"
        style={{
          textShadow: '0 15px 0 #4c0519, 0 30px 60px #881337, 0 0 150px #e11d48',
          WebkitTextStroke: '3px #fda4af'
        }}
      >
        CHAMPION
      </motion.h1>
    </motion.div>
  );
};


// ----------------------------------------------------------------------
// MAIN OVERLAY RENDERER
// ----------------------------------------------------------------------
export function RankCinematicOverlay({ tier, onComplete }: RankCinematicOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Extended duration for AAA cutscenes
    const timer = setTimeout(() => {
      onComplete();
    }, 5500); 
    return () => {
      setMounted(false);
      clearTimeout(timer);
    };
  }, [onComplete]);

  if (!mounted) return null;

  const renderCinematic = () => {
    switch (tier) {
      case 'COPPER': return <CopperSequence />;
      case 'BRONZE': return <BronzeSequence />;
      case 'SILVER': return <SilverSequence />;
      case 'GOLD': return <GoldenSequence />;
      case 'PLATINUM': return <PlatinumSequence />;
      case 'EMERALD': return <EmeraldSequence />;
      case 'DIAMOND': return <DiamondSequence />;
      case 'CHAMPION': return <ChampionSequence />;
      default: return null;
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/95 backdrop-blur-2xl pointer-events-auto"
        onClick={onComplete}
      >
        {renderCinematic()}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
