"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  onComplete: () => void;
}

export function PodiumHeroAnimation({ rank, onComplete }: PodiumHeroAnimationProps) {
  useEffect(() => {
    if (rank !== null) {
      const timer = setTimeout(() => {
        onComplete();
      }, 3500); // 3.5 seconds duration
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
          {/* Global Darkener */}
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

          {/* Rank 1: Gold Paladin */}
          {rank === 1 && (
            <>
              {/* Holy Pillars */}
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: [0, 1, 0.8, 0] }}
                transition={{ duration: 1.5, times: [0, 0.1, 0.2, 1] }}
                className="absolute top-0 bottom-0 left-1/3 w-32 bg-yellow-300/40 blur-2xl origin-top"
              />
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: [0, 1, 0.8, 0] }}
                transition={{ duration: 1.5, delay: 0.1, times: [0, 0.1, 0.2, 1] }}
                className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-48 bg-white/60 blur-3xl origin-top"
              />
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: [0, 1, 0.8, 0] }}
                transition={{ duration: 1.5, delay: 0.2, times: [0, 0.1, 0.2, 1] }}
                className="absolute top-0 bottom-0 right-1/3 w-32 bg-yellow-300/40 blur-2xl origin-top"
              />

              {/* Shockwave */}
              <motion.div
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                className="absolute w-[500px] h-[500px] rounded-full border-[20px] border-yellow-400/50"
              />

              {/* Camera Shake Container for Image */}
              <motion.div
                initial={{ scale: 2, y: -500, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  x: [0, -20, 20, -20, 20, 0],
                  y: [0, -20, 20, -20, 20, 0]
                }}
                transition={{ 
                  scale: { type: "spring", bounce: 0.2, duration: 0.6 },
                  y: { type: "spring", bounce: 0.2, duration: 0.6 },
                  x: { delay: 0.3, duration: 0.4, ease: "easeInOut" },
                  opacity: { duration: 0.2 }
                }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center mix-blend-screen"
              >
                <img 
                  src="/assets/gamification/paladin.png" 
                  alt="Apex Paladin" 
                  className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(250,204,21,0.8)]"
                />
              </motion.div>
              
              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 0.5, y: 100 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 transition={{ delay: 0.6, type: "spring", bounce: 0.5 }}
                 className="absolute bottom-20 z-20"
              >
                <h1 className="text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-600 drop-shadow-[0_0_20px_rgba(250,204,21,1)] uppercase">
                  The Apex Paladin
                </h1>
              </motion.div>
            </>
          )}

          {/* Rank 2: Silver Assassin */}
          {rank === 2 && (
            <>
              {/* Slashes */}
              <motion.div
                initial={{ scaleX: 0, opacity: 1, rotate: -30 }}
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute w-[150vw] h-4 bg-cyan-400 blur-sm origin-left z-20"
              />
              <motion.div
                initial={{ scaleX: 0, opacity: 1, rotate: -20 }}
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
                className="absolute w-[150vw] h-8 bg-cyan-300 blur-md origin-right z-20"
              />
              <motion.div
                initial={{ scaleX: 0, opacity: 1, rotate: -40 }}
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
                className="absolute w-[150vw] h-2 bg-white blur-sm origin-left z-20"
              />

              {/* Character Glitch */}
              <motion.div
                initial={{ scale: 1.5, opacity: 0, filter: 'hue-rotate(90deg) blur(10px)' }}
                animate={{ 
                  scale: 1, 
                  opacity: 1, 
                  filter: 'hue-rotate(0deg) blur(0px)',
                  x: [0, 50, -50, 0]
                }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center mix-blend-screen"
              >
                <img 
                  src="/assets/gamification/assassin.png" 
                  alt="Silent Assassin" 
                  className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(6,182,212,0.8)]"
                />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, x: -200, skewX: -20 }}
                 animate={{ opacity: 1, x: 0, skewX: 0 }}
                 transition={{ delay: 0.4, type: "spring", bounce: 0.5 }}
                 className="absolute bottom-20 z-20"
              >
                <h1 className="text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 to-cyan-600 drop-shadow-[0_0_20px_rgba(6,182,212,1)] uppercase">
                  The Silent Assassin
                </h1>
              </motion.div>
            </>
          )}

          {/* Rank 3: Bronze Gladiator */}
          {rank === 3 && (
            <>
              {/* Heatwave Gradient */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 1 }}
                className="absolute inset-0 bg-gradient-to-t from-orange-900 to-transparent mix-blend-color-dodge z-0"
              />

              {/* Ground Slam Shockwave */}
              <motion.div
                initial={{ scale: 0, opacity: 1, y: 300 }}
                animate={{ scale: 3, opacity: 0, y: 300 }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                className="absolute w-[600px] h-[200px] rounded-[100%] bg-orange-600 blur-2xl z-0"
              />

              {/* Character Rise */}
              <motion.div
                initial={{ y: 500, opacity: 0 }}
                animate={{ 
                  y: [500, -50, 0],
                  opacity: 1
                }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
                className="relative z-10 w-[800px] h-[800px] flex items-center justify-center mix-blend-screen"
              >
                <img 
                  src="/assets/gamification/gladiator.png" 
                  alt="Relentless Gladiator" 
                  className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(249,115,22,0.8)]"
                />
              </motion.div>

              {/* Text */}
              <motion.div
                 initial={{ opacity: 0, scale: 2, y: 50 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 transition={{ delay: 0.5, type: "spring", bounce: 0.7 }}
                 className="absolute bottom-20 z-20"
              >
                <h1 className="text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-orange-200 to-red-600 drop-shadow-[0_0_20px_rgba(239,68,68,1)] uppercase">
                  The Relentless Gladiator
                </h1>
              </motion.div>
            </>
          )}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
