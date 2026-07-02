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
    shadowColor: "rgba(251,191,36,0.8)",
    extrusionColor: "#b45309",
    trigger: triggerMythic,
    duration: 5500,
  },
  {
    min: 91,
    max: 95,
    text: "IMMORTAL",
    gradient: "from-fuchsia-300 via-purple-500 to-indigo-600",
    shadowColor: "rgba(168,85,247,0.8)",
    extrusionColor: "#581c87",
    trigger: triggerCrystal,
    duration: 4000,
  },
  {
    min: 86,
    max: 90,
    text: "ASCENDANT",
    gradient: "from-cyan-200 via-blue-500 to-blue-700",
    shadowColor: "rgba(56,189,248,0.8)",
    extrusionColor: "#0369a1",
    trigger: triggerSurge,
    duration: 3500,
  },
  {
    min: 80,
    max: 85,
    text: "DOMINATING",
    gradient: "from-orange-300 via-red-500 to-rose-700",
    shadowColor: "rgba(239,68,68,0.8)",
    extrusionColor: "#991b1b",
    trigger: triggerBlaze,
    duration: 3500,
  },
];

export function EpicCelebration({ accuracy, onComplete }: EpicCelebrationProps) {
  const tier = Tiers.find((t) => accuracy >= t.min && accuracy <= t.max);

  useEffect(() => {
    if (!tier) return;
    tier.trigger();
    const timer = setTimeout(onComplete, tier.duration);
    return () => clearTimeout(timer);
  }, [tier, onComplete]);

  if (!tier) return null;

  const isFlawless = tier.min === 96;
  const isAscendant = tier.min === 86;

  // 3D Extrusion Generator
  const textShadow3D = Array.from({ length: 12 })
    .map((_, i) => `-${i + 1}px ${i + 1}px 0px ${tier.extrusionColor}`)
    .join(", ");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 1 } }}
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none overflow-hidden"
    >
      {/* Background Dimming */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md pointer-events-auto" />

      {/* Cinematic Letterboxing */}
      <motion.div 
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        exit={{ y: "-100%", transition: { duration: 0.8, ease: "easeInOut" } }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute top-0 left-0 right-0 h-[15vh] bg-black z-0 pointer-events-none"
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", transition: { duration: 0.8, ease: "easeInOut" } }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute bottom-0 left-0 right-0 h-[15vh] bg-black z-0 pointer-events-none"
      />

      {/* God Rays (Rotating Light Burst) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center opacity-40 z-0"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: isFlawless ? 25 : 12, ease: "linear" }}
      >
        <div 
          className="w-[1000px] h-[1000px] rounded-full blur-[140px]" 
          style={{ background: `radial-gradient(circle, ${tier.shadowColor} 0%, transparent 70%)` }}
        />
      </motion.div>

      {/* Main Container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Pulsing Aura Drop Shadow */}
        <motion.div
          animate={{ filter: [`drop-shadow(0px 0px 30px ${tier.shadowColor})`, `drop-shadow(0px 0px 80px ${tier.shadowColor})`, `drop-shadow(0px 0px 30px ${tier.shadowColor})`] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          {/* Main Text Container with Screen Shake & Motion Blur */}
          <motion.div
            initial={{ scale: 4, opacity: 0, y: -200, filter: "blur(20px)" }}
            animate={
              isFlawless 
                ? { scale: [4, 1, 1.05], opacity: 1, y: 0, filter: ["blur(20px)", "blur(0px)", "blur(0px)"] } 
                : { scale: [4, 0.9, 1], opacity: 1, y: 0, filter: ["blur(20px)", "blur(0px)", "blur(0px)"] }
            }
            transition={
              isFlawless 
                ? { duration: 2.5, ease: "easeOut", times: [0, 0.8, 1] } 
                : { duration: 0.6, type: "spring", bounce: 0.6 }
            }
            className="relative flex flex-col items-center"
          >
            {/* Ghost Echo Expansion */}
            <motion.div
              initial={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              animate={{ scale: 3, opacity: 0, filter: "blur(10px)" }}
              transition={{ duration: 1.5, delay: isFlawless ? 2.0 : 0.3, ease: "easeOut" }}
              className="absolute text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-transparent bg-clip-text select-none"
              style={{ backgroundImage: `linear-gradient(to bottom, var(--tw-gradient-stops))` }}
              /* Need to rely on classes for gradients or apply them inline if needed. We use tailwind classes via the tiers. */
            >
              <span className={`bg-gradient-to-b ${tier.gradient} bg-clip-text text-transparent`}>
                {tier.text}
              </span>
            </motion.div>

            {/* Glitch Effect for Ascendant */}
            {isAscendant && (
              <>
                <motion.div
                  animate={{ x: [-8, 8, -8, 0], opacity: [0, 0.9, 0] }}
                  transition={{ duration: 0.2, delay: 0.5, repeat: 4 }}
                  className="absolute text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-cyan-400 select-none translate-x-3 translate-y-1 mix-blend-screen"
                >
                  {tier.text}
                </motion.div>
                <motion.div
                  animate={{ x: [8, -8, 8, 0], opacity: [0, 0.9, 0] }}
                  transition={{ duration: 0.2, delay: 0.5, repeat: 4 }}
                  className="absolute text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-fuchsia-500 select-none -translate-x-3 -translate-y-1 mix-blend-screen"
                >
                  {tier.text}
                </motion.div>
              </>
            )}

            {/* Primary Text Layer with 3D Extrusion */}
            <div className="relative overflow-hidden p-8">
              <h1 
                className="text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-white select-none relative z-10"
                style={{ textShadow: textShadow3D }}
              >
                <span className={`bg-gradient-to-b ${tier.gradient} bg-clip-text text-transparent block relative z-20`}>
                  {tier.text}
                </span>
                {/* Fallback to render the white text for the shadow to attach to if clip-text acts up, handled natively by CSS but we ensure it works. */}
              </h1>
              
              {/* Diagonal Light Sweep over the text surface */}
              <motion.div
                initial={{ x: "-100%", skewX: -30 }}
                animate={{ x: "200%" }}
                transition={{ duration: 0.8, delay: isFlawless ? 2.0 : 0.5, ease: "easeInOut" }}
                className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent opacity-60 mix-blend-overlay z-30"
              />
            </div>
            
            {/* Subtitle */}
            <motion.p 
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: isFlawless ? 2.5 : 0.8 }}
              className="text-white font-black tracking-[0.3em] mt-4 uppercase text-lg md:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            >
              {accuracy}% Accuracy
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
