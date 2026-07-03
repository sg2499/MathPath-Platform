"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  onComplete: () => void;
}

// ============================================================================
// SVG ASSETS (Forged dynamically via Framer Motion)
// ============================================================================
const ForgedCrown = () => (
  <svg viewBox="0 0 100 100" className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] drop-shadow-[0_0_50px_rgba(250,204,21,1)]">
    <motion.path
      initial={{ pathLength: 0, fill: "rgba(250,204,21,0)" }}
      animate={{ pathLength: 1, fill: "rgba(250,204,21,1)" }}
      transition={{ duration: 1.5, ease: "easeInOut", fill: { delay: 1, duration: 1 } }}
      d="M10 90 L20 40 L35 60 L50 20 L65 60 L80 40 L90 90 Z"
      stroke="#FEF08A"
      strokeWidth="2"
    />
    <motion.circle initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} cx="20" cy="35" r="4" fill="#FEF08A" />
    <motion.circle initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} cx="50" cy="15" r="6" fill="#FFFFFF" />
    <motion.circle initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} cx="80" cy="35" r="4" fill="#FEF08A" />
  </svg>
);

const ForgedLightning = () => (
  <svg viewBox="0 0 100 100" className="w-[250px] h-[250px] md:w-[300px] md:h-[300px] drop-shadow-[0_0_50px_rgba(34,211,238,1)]">
    <motion.path
      initial={{ pathLength: 0, fill: "rgba(34,211,238,0)" }}
      animate={{ pathLength: 1, fill: "rgba(34,211,238,1)" }}
      transition={{ duration: 0.8, ease: "easeOut", fill: { delay: 0.5, duration: 0.5 } }}
      d="M60 10 L30 50 L50 50 L40 90 L80 40 L55 40 Z"
      stroke="#CFFAFE"
      strokeWidth="2"
    />
  </svg>
);

const ForgedShield = () => (
  <svg viewBox="0 0 100 100" className="w-[250px] h-[250px] md:w-[350px] md:h-[350px] drop-shadow-[0_0_50px_rgba(249,115,22,1)]">
    <motion.path
      initial={{ pathLength: 0, fill: "rgba(249,115,22,0)" }}
      animate={{ pathLength: 1, fill: "rgba(249,115,22,1)" }}
      transition={{ duration: 1.2, ease: "easeInOut", fill: { delay: 0.8, duration: 0.5 } }}
      d="M50 10 L90 25 L90 60 C90 80 50 95 50 95 C50 95 10 80 10 60 L10 25 Z"
      stroke="#FFEDD5"
      strokeWidth="2"
    />
    <motion.path
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1, duration: 0.5 }}
      d="M50 10 L50 95" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5"
    />
    <motion.path
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.2, duration: 0.5 }}
      d="M20 40 L80 40" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.5"
    />
  </svg>
);

export function PodiumHeroAnimation({ rank, onComplete }: PodiumHeroAnimationProps) {
  useEffect(() => {
    if (rank !== null) {
      const timer = setTimeout(() => {
        onComplete();
      }, 5500); 
      return () => clearTimeout(timer);
    }
  }, [rank, onComplete]);

  return (
    <AnimatePresence>
      {rank !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none"
        >
          {/* Global Cinematic Letterbox & Darkener */}
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
          <motion.div 
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 0.5 }}
            className="absolute top-0 w-full h-[15vh] bg-black z-0 border-b border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)]" 
          />
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.5 }}
            className="absolute bottom-0 w-full h-[15vh] bg-black z-0 border-t border-white/10 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]" 
          />

          {/* ============================================================== */}
          {/* RANK 1: THE APEX SUPERNOVA                                     */}
          {/* ============================================================== */}
          {rank === 1 && (
            <>
              {/* Massive Golden Supernova Core */}
              <motion.div
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: [0, 15, 20], opacity: [1, 1, 0] }}
                transition={{ duration: 2.5, ease: "easeOut" }}
                className="absolute w-32 h-32 rounded-full bg-yellow-300 blur-[50px] mix-blend-screen z-0"
              />

              {/* Supernova Shockwaves */}
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 1, rotate: Math.random() * 90 }}
                  animate={{ scale: 10, opacity: 0, rotate: Math.random() * 180 }}
                  transition={{ duration: 2, ease: "easeOut", delay: i * 0.3 }}
                  className="absolute w-[400px] h-[400px] rounded-full border-[10px] border-yellow-400/80 mix-blend-screen z-0"
                  style={{ filter: 'blur(4px)' }}
                />
              ))}

              {/* Orbiting Sacred Geometry Rings */}
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0, rotateX: 60, rotateY: i * 60, rotateZ: 0 }}
                  animate={{ 
                    scale: [0, 2, 1.5], 
                    opacity: [0, 1, 1],
                    rotateZ: 360
                  }}
                  transition={{ duration: 4, ease: "easeOut" }}
                  className="absolute w-[600px] h-[600px] rounded-full border border-yellow-200/50 mix-blend-screen z-10"
                  style={{ transformStyle: 'preserve-3d' }}
                />
              ))}

              {/* The Forged Crown & Screen Shake */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  x: [0, -20, 20, -10, 10, 0],
                  y: [0, -20, 20, -10, 10, 0]
                }}
                transition={{ 
                  scale: { delay: 1, type: "spring", bounce: 0.6, duration: 1 },
                  opacity: { delay: 1, duration: 0.5 },
                  x: { delay: 1, duration: 0.5, ease: "easeInOut" },
                  y: { delay: 1, duration: 0.5, ease: "easeInOut" }
                }}
                className="relative z-20 flex items-center justify-center"
              >
                <ForgedCrown />
              </motion.div>
              
              {/* Cinematic Title Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 2, filter: "blur(30px)" }}
                 animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                 transition={{ delay: 1.5, type: "spring", bounce: 0.4 }}
                 className="absolute bottom-[20vh] z-30"
              >
                <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_0_40px_rgba(250,204,21,1)] uppercase text-center">
                  Apex Grandmaster
                </h1>
              </motion.div>
            </>
          )}

          {/* ============================================================== */}
          {/* RANK 2: THE PHANTOM WARP-DRIVE                                 */}
          {/* ============================================================== */}
          {rank === 2 && (
            <>
              {/* Hyper-Speed Warp Tunnel (Lasers) */}
              {[...Array(40)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleZ: 0, z: -2000, opacity: 0, x: (Math.random() - 0.5) * 2000, y: (Math.random() - 0.5) * 1000 }}
                  animate={{ 
                    scaleZ: [0, 2, 0], 
                    z: 1000, 
                    opacity: [0, 1, 0] 
                  }}
                  transition={{ duration: 1, delay: Math.random() * 1.5, repeat: 2, ease: "linear" }}
                  className="absolute w-[2px] h-[400px] bg-cyan-400 blur-[1px] z-0"
                  style={{ transformOrigin: 'center center', transformStyle: 'preserve-3d' }}
                />
              ))}

              {/* Time Freeze Flash */}
              <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: [0, 1, 0] }}
                 transition={{ duration: 0.5, delay: 1.2 }}
                 className="absolute inset-0 bg-cyan-100 z-10 mix-blend-screen"
              />

              {/* The Forged Lightning Crest */}
              <motion.div
                initial={{ scale: 3, opacity: 0, filter: 'blur(50px)', x: -500 }}
                animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', x: 0 }}
                transition={{ delay: 1.2, duration: 0.6, type: "spring", bounce: 0.5 }}
                className="relative z-20 flex items-center justify-center"
              >
                <ForgedLightning />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, x: 500, skewX: -40 }}
                 animate={{ opacity: 1, x: 0, skewX: 0 }}
                 transition={{ delay: 1.6, type: "spring", bounce: 0.6 }}
                 className="absolute bottom-[20vh] z-30"
              >
                <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-100 via-cyan-400 to-cyan-600 drop-shadow-[0_0_30px_rgba(34,211,238,1)] uppercase text-center">
                  Phantom Strike
                </h1>
              </motion.div>
            </>
          )}

          {/* ============================================================== */}
          {/* RANK 3: THE MAGMA IMPACT                                       */}
          {/* ============================================================== */}
          {rank === 3 && (
            <>
              {/* Atmospheric Entry Heatwave (Falling) */}
              <motion.div
                initial={{ y: "-100vh", opacity: 0 }}
                animate={{ y: 0, opacity: [0, 1, 0] }}
                transition={{ duration: 0.8, ease: "easeIn" }}
                className="absolute w-[400px] h-[200vh] bg-gradient-to-b from-transparent via-red-600 to-orange-400 mix-blend-color-dodge z-0 blur-[40px]"
              />

              {/* Ground Shatter Shockwave */}
              <motion.div
                initial={{ scale: 0, opacity: 1, rotateX: 70 }}
                animate={{ scale: 8, opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.8 }}
                className="absolute w-[500px] h-[500px] rounded-full border-[20px] border-orange-500/80 mix-blend-screen z-0"
              />

              {/* Anti-Gravity Magma Glass Shards */}
              {[...Array(30)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 200, scale: 0, opacity: 1, rotate: 0 }}
                  animate={{ 
                    y: -500 - Math.random() * 500,
                    x: (Math.random() - 0.5) * 800,
                    scale: Math.random() * 1.5 + 0.5,
                    opacity: 0,
                    rotate: Math.random() * 720
                  }}
                  transition={{ duration: 3, delay: 0.8 + Math.random() * 0.5, ease: "easeOut" }}
                  className="absolute w-8 h-8 bg-orange-600 shadow-[0_0_30px_#f97316] z-10"
                  style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
                />
              ))}

              {/* The Forged Bronze Shield */}
              <motion.div
                initial={{ scale: 1.5, opacity: 0, y: -500 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.8, type: "spring", bounce: 0.6, duration: 0.8 }}
                className="relative z-20 flex items-center justify-center"
              >
                <ForgedShield />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 0.5, y: 100 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 transition={{ delay: 1.5, type: "spring", bounce: 0.5 }}
                 className="absolute bottom-[20vh] z-30"
              >
                <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-orange-100 via-orange-400 to-red-600 drop-shadow-[0_0_30px_rgba(249,115,22,1)] uppercase text-center">
                  Titan Impact
                </h1>
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
