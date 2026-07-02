"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerBlaze, triggerSurge, triggerCrystal, triggerMythic } from "@/lib/utils/particles";

interface EpicCelebrationProps {
  accuracy: number;
  onComplete: () => void;
}

const Tiers = [
  {
    min: 96,
    max: 100,
    text: "APEX FLAWLESS",
    gradient: "from-amber-200 via-yellow-400 to-amber-600",
    shadow: "drop-shadow-[0_0_40px_rgba(251,191,36,0.8)]",
    trigger: triggerMythic,
    duration: 5000,
  },
  {
    min: 91,
    max: 95,
    text: "IMMORTAL",
    gradient: "from-fuchsia-300 via-purple-500 to-indigo-600",
    shadow: "drop-shadow-[0_0_35px_rgba(168,85,247,0.8)]",
    trigger: triggerCrystal,
    duration: 3500,
  },
  {
    min: 86,
    max: 90,
    text: "ASCENDANT",
    gradient: "from-cyan-200 via-blue-500 to-blue-700",
    shadow: "drop-shadow-[0_0_30px_rgba(56,189,248,0.8)]",
    trigger: triggerSurge,
    duration: 3500,
  },
  {
    min: 80,
    max: 85,
    text: "DOMINATING",
    gradient: "from-orange-300 via-red-500 to-rose-700",
    shadow: "drop-shadow-[0_0_25px_rgba(239,68,68,0.8)]",
    trigger: triggerBlaze,
    duration: 3500,
  },
];

export function EpicCelebration({ accuracy, onComplete }: EpicCelebrationProps) {
  const tier = Tiers.find((t) => accuracy >= t.min && accuracy <= t.max);

  useEffect(() => {
    if (!tier) return;
    
    tier.trigger();

    const timer = setTimeout(() => {
      onComplete();
    }, tier.duration);

    return () => clearTimeout(timer);
  }, [tier, onComplete]);

  if (!tier) return null;

  const isFlawless = tier.min === 96;
  const isAscendant = tier.min === 86;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 1 } }}
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
    >
      {/* Background Dimming */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" />

      {/* God Rays (Rotating Light Burst) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center opacity-30"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: isFlawless ? 20 : 10, ease: "linear" }}
      >
        <div className={`w-[800px] h-[800px] rounded-full bg-gradient-radial ${tier.gradient} blur-[120px]`} />
      </motion.div>

      {/* Main Text Container with Screen Shake Impact */}
      <motion.div
        initial={{ scale: 3, opacity: 0, y: -100 }}
        animate={
          isFlawless 
            ? { scale: [3, 1, 1.05], opacity: 1, y: 0 } // Slow dramatic impact
            : { scale: [3, 0.9, 1], opacity: 1, y: 0 } // Fast aggressive impact
        }
        transition={
          isFlawless 
            ? { duration: 2, ease: "easeOut", times: [0, 0.8, 1] } 
            : { duration: 0.5, type: "spring", bounce: 0.5 }
        }
        className="relative z-10 flex flex-col items-center"
      >
        {/* Ghost Echo Expansion */}
        <motion.div
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 1.5, delay: isFlawless ? 1.6 : 0.3, ease: "easeOut" }}
          className={`absolute text-6xl md:text-8xl font-black italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b ${tier.gradient} ${tier.shadow} select-none`}
        >
          {tier.text}
        </motion.div>

        {/* Glitch Effect for Ascendant */}
        {isAscendant && (
          <>
            <motion.div
              animate={{ x: [-5, 5, -5, 0], opacity: [0, 0.8, 0] }}
              transition={{ duration: 0.2, delay: 0.4, repeat: 3 }}
              className={`absolute text-6xl md:text-8xl font-black italic tracking-tighter uppercase text-cyan-400 select-none translate-x-2`}
            >
              {tier.text}
            </motion.div>
            <motion.div
              animate={{ x: [5, -5, 5, 0], opacity: [0, 0.8, 0] }}
              transition={{ duration: 0.2, delay: 0.4, repeat: 3 }}
              className={`absolute text-6xl md:text-8xl font-black italic tracking-tighter uppercase text-fuchsia-500 select-none -translate-x-2`}
            >
              {tier.text}
            </motion.div>
          </>
        )}

        {/* Primary Text Layer */}
        <div className="relative overflow-hidden p-4">
          <h1 className={`text-6xl md:text-8xl font-black italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b ${tier.gradient} ${tier.shadow} select-none`}>
            {tier.text}
          </h1>
          
          {/* Diagonal Light Sweep */}
          <motion.div
            initial={{ x: "-100%", skewX: -20 }}
            animate={{ x: "200%" }}
            transition={{ duration: 0.8, delay: isFlawless ? 1.6 : 0.4, ease: "easeInOut" }}
            className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent opacity-40 mix-blend-overlay"
          />
        </div>
        
        {/* Subtle Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isFlawless ? 2 : 0.8 }}
          className="text-white/80 font-bold tracking-widest mt-2 uppercase text-sm md:text-base"
        >
          {accuracy}% Accuracy
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
