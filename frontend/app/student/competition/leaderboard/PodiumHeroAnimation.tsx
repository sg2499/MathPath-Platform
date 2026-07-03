"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  onComplete: () => void;
}

// A robust component to fetch and render Lottie JSON from a URL
function RemoteLottie({ url, className }: { url: string, className?: string }) {
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch(url)
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error("Lottie fetch failed:", err));
  }, [url]);

  if (!animationData) {
    return (
       <div className={`flex items-center justify-center ${className}`}>
         <div className="w-32 h-32 border-4 border-t-transparent border-white rounded-full animate-spin opacity-50" />
       </div>
    );
  }

  return <Lottie animationData={animationData} loop={true} autoplay={true} className={className} />;
}

export function PodiumHeroAnimation({ rank, onComplete }: PodiumHeroAnimationProps) {
  useEffect(() => {
    if (rank !== null) {
      const timer = setTimeout(() => {
        onComplete();
      }, 5000); // 5 seconds for full Lottie cutscene
      return () => clearTimeout(timer);
    }
  }, [rank, onComplete]);

  // Replace these URLs with the exact Spartan/Ninja/Titan Lottie files your team prefers
  const LOTTIE_URLS = {
    1: "https://assets9.lottiefiles.com/packages/lf20_x62chJ.json", // Grandmaster / Spartan
    2: "https://assets3.lottiefiles.com/packages/lf20_jR229r.json", // Phantom / Ninja
    3: "https://assets2.lottiefiles.com/packages/lf20_bXEGle.json", // Titan / Gladiator
  };

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
          {/* RANK 1: THE ABACUS GRANDMASTER (TELEPORT & SHOCKWAVE)           */}
          {/* ============================================================== */}
          {rank === 1 && (
            <>
              {/* Massive Golden Teleport Pillar */}
              <motion.div
                initial={{ scaleY: 0, scaleX: 3, opacity: 0 }}
                animate={{ scaleY: 1, scaleX: 1, opacity: [0, 1, 0.5, 0] }}
                transition={{ duration: 1.5, times: [0, 0.2, 0.8, 1], ease: "easeOut" }}
                className="absolute w-[400px] h-[200vh] bg-yellow-300/80 blur-3xl mix-blend-screen z-0"
              />

              {/* Nuclear Golden Shockwave */}
              <motion.div
                initial={{ scale: 0, opacity: 1, rotate: 0 }}
                animate={{ scale: 8, opacity: 0, rotate: 90 }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                className="absolute w-[300px] h-[300px] rounded-full border-[30px] border-yellow-400/80 mix-blend-screen z-0"
              />

              {/* Orbiting Abacus Beads */}
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0, rotate: 0 }}
                  animate={{ 
                    opacity: [0, 1, 1, 0], 
                    scale: [0, 1.5, 1, 0],
                    rotate: 360,
                    x: Math.cos((i * 30) * Math.PI / 180) * 400,
                    y: Math.sin((i * 30) * Math.PI / 180) * 400
                  }}
                  transition={{ duration: 2.5, delay: 0.3, ease: "easeOut" }}
                  className="absolute w-8 h-8 rounded-full bg-yellow-400 shadow-[0_0_20px_#facc15] blur-[1px] z-20"
                />
              ))}

              {/* Lottie Character Reveal & Screen Shake */}
              <motion.div
                initial={{ scale: 0, y: -200, opacity: 0 }}
                animate={{ 
                  scale: 1.2, 
                  opacity: 1,
                  x: [0, -30, 30, -20, 20, -10, 10, 0],
                  y: [0, -30, 30, -20, 20, -10, 10, 0]
                }}
                transition={{ 
                  scale: { type: "spring", bounce: 0.4, duration: 0.8 },
                  x: { delay: 0.2, duration: 0.5, ease: "easeInOut" },
                  y: { delay: 0.2, duration: 0.5, ease: "easeInOut" },
                }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center drop-shadow-[0_0_80px_rgba(250,204,21,1)]"
              >
                <RemoteLottie url={LOTTIE_URLS[1]} className="w-full h-full" />
              </motion.div>
              
              {/* Cinematic Title Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
                 animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                 transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                 className="absolute bottom-[20vh] z-20"
              >
                <h1 className="text-7xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_0_30px_rgba(250,204,21,1)] uppercase">
                  The Abacus Grandmaster
                </h1>
              </motion.div>
            </>
          )}

          {/* ============================================================== */}
          {/* RANK 2: THE SPEED MATH PHANTOM (TRIPLE DASH & AFTERIMAGES)     */}
          {/* ============================================================== */}
          {rank === 2 && (
            <>
              {/* High-Velocity Slash Vectors */}
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleX: 0, x: "-100vw", opacity: 1 }}
                  animate={{ scaleX: 1, x: "100vw", opacity: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.1, ease: "linear" }}
                  className={`absolute h-[2px] bg-cyan-400 blur-sm w-[150vw] rotate-[-15deg] top-[${20 + i * 15}%] z-20`}
                />
              ))}

              {/* Lottie Phantom Reveal with Time Freeze Effect */}
              <motion.div
                initial={{ scale: 1.5, opacity: 0, filter: 'blur(20px)', x: -1000, skewX: -30 }}
                animate={{ scale: 1.2, opacity: 1, filter: 'blur(0px)', x: 0, skewX: 0 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center drop-shadow-[0_0_60px_rgba(34,211,238,0.9)]"
              >
                {/* Time Freeze Core Blast */}
                <motion.div 
                   initial={{ scale: 0, opacity: 1 }}
                   animate={{ scale: 5, opacity: 0 }}
                   transition={{ duration: 1.2, delay: 0.3 }}
                   className="absolute w-64 h-64 bg-cyan-400 rounded-full blur-[100px] z-[-1]"
                />
                <RemoteLottie url={LOTTIE_URLS[2]} className="w-full h-full" />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, x: -300, skewX: -30 }}
                 animate={{ opacity: 1, x: 0, skewX: 0 }}
                 transition={{ delay: 0.8, type: "spring", bounce: 0.6 }}
                 className="absolute bottom-[20vh] z-20"
              >
                <h1 className="text-7xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-100 via-cyan-400 to-cyan-600 drop-shadow-[0_0_30px_rgba(34,211,238,1)] uppercase">
                  The Speed Math Phantom
                </h1>
              </motion.div>
            </>
          )}

          {/* ============================================================== */}
          {/* RANK 3: THE LOGIC TITAN (METEOR DROP & CRATER IMPACT)          */}
          {/* ============================================================== */}
          {rank === 3 && (
            <>
              {/* Atmospheric Entry Heatwave */}
              <motion.div
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: [0, 0.8, 0], scaleY: 1 }}
                transition={{ duration: 0.6, ease: "easeIn" }}
                className="absolute top-0 w-full h-[150vh] bg-gradient-to-b from-red-600 to-transparent mix-blend-color-dodge z-0 origin-top"
              />

              {/* Meteor Impact Crater Shockwave */}
              <motion.div
                initial={{ scale: 0, opacity: 1, y: 300, rotateX: 60 }}
                animate={{ scale: 5, opacity: 0, y: 300 }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
                className="absolute w-[800px] h-[800px] rounded-[100%] border-[40px] border-orange-600/60 mix-blend-screen z-0"
              />

              {/* Exploding Magma Debris */}
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 400, x: 0, scale: 0, opacity: 1 }}
                  animate={{ 
                    y: 400 - Math.random() * 800, 
                    x: (Math.random() - 0.5) * 1500,
                    scale: Math.random() * 2 + 0.5,
                    opacity: 0,
                    rotate: Math.random() * 720
                  }}
                  transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
                  className="absolute w-4 h-4 bg-orange-500 rounded-sm shadow-[0_0_20px_#f97316] z-20"
                />
              ))}

              {/* Lottie Titan Drop */}
              <motion.div
                initial={{ y: -1500, scale: 1.5, opacity: 0 }}
                animate={{ 
                  y: 0, scale: 1.2, opacity: 1 
                }}
                transition={{ y: { type: "spring", bounce: 0, duration: 0.5, ease: "easeIn" }, opacity: { duration: 0.1 } }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center drop-shadow-[0_0_80px_rgba(249,115,22,0.9)]"
              >
                <RemoteLottie url={LOTTIE_URLS[3]} className="w-full h-full" />
                
                {/* Secondary Shake triggered instantly after landing */}
                <motion.div
                  animate={{ x: [0, -40, 40, -30, 30, -20, 20, 0], y: [0, 40, -40, 30, -30, 20, -20, 0] }}
                  transition={{ delay: 0.45, duration: 0.5 }}
                  className="absolute inset-0 z-[-1] bg-orange-600/30 blur-[100px] rounded-full"
                />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 3, y: -100 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 transition={{ delay: 0.8, type: "spring", bounce: 0.6 }}
                 className="absolute bottom-[20vh] z-20"
              >
                <h1 className="text-7xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-orange-200 via-orange-500 to-red-600 drop-shadow-[0_0_30px_rgba(239,68,68,1)] uppercase">
                  The Logic Titan
                </h1>
              </motion.div>
            </>
          )}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
