"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerBlaze, triggerSurge, triggerCrystal, triggerMythic, resetParticles } from "@/lib/utils/particles";

interface EpicCelebrationProps {
  accuracy: number;
  onComplete: () => void;
  allowSkip?: boolean;
}

const Tiers = [
  {
    min: 96,
    max: 100,
    id: "APEX",
    text: "APEX FLAWLESS",
    shadowColor: "rgba(251,191,36,0.8)",
    extrusionColor: "#b45309",
    trigger: triggerMythic,
    duration: 6500,
  },
  {
    min: 91,
    max: 95,
    id: "IMMORTAL",
    text: "IMMORTAL",
    shadowColor: "rgba(168,85,247,0.8)",
    extrusionColor: "#581c87",
    trigger: triggerCrystal,
    duration: 5000,
  },
  {
    min: 86,
    max: 90,
    id: "ASCENDANT",
    text: "ASCENDANT",
    shadowColor: "rgba(56,189,248,0.8)",
    extrusionColor: "#0369a1",
    trigger: triggerSurge,
    duration: 4500,
  },
  {
    min: 80,
    max: 85,
    id: "DOMINATING",
    text: "DOMINATING",
    shadowColor: "rgba(239,68,68,0.8)",
    extrusionColor: "#991b1b",
    trigger: triggerBlaze,
    duration: 4500,
  },
];

// --- TEXT RENDERERS ---

// Base text styles for extreme readability
const TextBaseClass = "text-6xl md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-white select-none relative z-20";
const TextStrokeStyle = { WebkitTextStroke: "2px rgba(0,0,0,0.5)" };

// Generates the 3D block extrusion
const generate3DShadow = (color: string) => {
  return Array.from({ length: 12 })
    .map((_, i) => `-${i + 1}px ${i + 1}px 0px ${color}`)
    .join(", ");
};

// 1. APEX FLAWLESS: Shattered Convergence
function ConvergeText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");
  
  return (
    <motion.div
      initial={{ scale: 1.1 }}
      animate={{ scale: [1.1, 0.98, 1] }}
      transition={{ delay: 1.8, duration: 0.4, type: "spring", bounce: 0.6 }} // The final screen shake when they snap
      className="flex flex-row flex-wrap justify-center p-8"
      style={{ textShadow: generate3DShadow(extrusionColor) }}
    >
      {letters.map((char, i) => {
        // Random starting positions far off screen
        const startX = (Math.random() - 0.5) * 1000;
        const startY = (Math.random() - 0.5) * 1000;
        const startRotate = (Math.random() - 0.5) * 180;
        
        return (
          <motion.span
            key={i}
            initial={{ x: startX, y: startY, rotate: startRotate, opacity: 0, scale: 3, filter: "blur(10px)" }}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{
              duration: 1.8,
              ease: "anticipate", // Pulls back slowly then snaps hard
            }}
            className={TextBaseClass}
            style={TextStrokeStyle}
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        );
      })}
    </motion.div>
  );
}

// 2. IMMORTAL: Void Materialization
function RiseText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");

  return (
    <div className="flex flex-row p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      {letters.map((char, i) => (
        <motion.span
          key={i}
          initial={{ y: 150, opacity: 0, filter: "blur(20px)", scale: 0.8 }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
          transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
          className={TextBaseClass}
          style={TextStrokeStyle}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </div>
  );
}

// 3. ASCENDANT: Cybernetic Decrypt
function DecryptText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const [displayText, setDisplayText] = useState(text.replace(/./g, "█"));
  const [isDecrypted, setIsDecrypted] = useState(false);

  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+0123456789";
    let iterations = 0;
    
    const interval = setInterval(() => {
      setDisplayText((prev) => 
        prev.split("").map((letter, index) => {
          if (index < iterations / 2) return text[index];
          return text[index] === " " ? " " : chars[Math.floor(Math.random() * chars.length)];
        }).join("")
      );
      
      if (iterations >= text.length * 2) {
        clearInterval(interval);
        setIsDecrypted(true);
      }
      
      iterations++;
    }, 40); // Fast scrambling

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="relative p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      <motion.h1 
        className={`${TextBaseClass} ${isDecrypted ? "" : "text-cyan-200 drop-shadow-[0_0_10px_#22d3ee]"}`}
        style={TextStrokeStyle}
      >
        {displayText}
      </motion.h1>
      
      {/* Glitch flash on successful decrypt */}
      {isDecrypted && (
        <>
           <motion.div
            animate={{ x: [-10, 10, -10, 0], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.2, repeat: 2 }}
            className={`absolute top-8 left-8 ${TextBaseClass} text-cyan-400 translate-x-3 mix-blend-screen pointer-events-none`}
          >
            {text}
          </motion.div>
          <motion.div
            animate={{ x: [10, -10, 10, 0], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.2, repeat: 2 }}
            className={`absolute top-8 left-8 ${TextBaseClass} text-fuchsia-500 -translate-x-3 mix-blend-screen pointer-events-none`}
          >
            {text}
          </motion.div>
        </>
      )}
    </div>
  );
}

// 4. DOMINATING: Meteor Stomp
function MeteorText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");

  return (
    <div className="flex flex-row p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      {letters.map((char, i) => (
        <motion.span
          key={i}
          initial={{ y: -300, opacity: 0, scale: 2 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.5, 
            delay: i * 0.1, 
            type: "spring", 
            bounce: 0.5 // Heavy bounce when hitting the floor
          }}
          className={TextBaseClass}
          style={TextStrokeStyle}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </div>
  );
}


// --- MAIN CELEBRATION COMPONENT ---

export function EpicCelebration({ accuracy, onComplete, allowSkip }: EpicCelebrationProps) {
  const tier = Tiers.find((t) => accuracy >= t.min && accuracy <= t.max);

  useEffect(() => {
    if (!tier) return;
    tier.trigger();
    const timer = setTimeout(onComplete, tier.duration);
    return () => clearTimeout(timer);
  }, [tier, onComplete]);

  const handleSkip = React.useCallback(() => {
    resetParticles();
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!allowSkip) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowSkip, handleSkip]);

  if (!tier) return null;

  const isFlawless = tier.id === "APEX";

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
          className="relative flex flex-col items-center"
        >
            {/* Render the specific Text Mechanic for this Tier */}
            {tier.id === "APEX" && <ConvergeText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "IMMORTAL" && <RiseText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "ASCENDANT" && <DecryptText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "DOMINATING" && <MeteorText text={tier.text} extrusionColor={tier.extrusionColor} />}
            
            {/* Subtitle */}
            <motion.p 
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 2.2 }}
              className="text-white font-black tracking-[0.3em] mt-4 uppercase text-lg md:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            >
              {Math.round(accuracy)}% Accuracy
            </motion.p>
        </motion.div>
      </div>

      {/* Skip Button */}
      {allowSkip && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ delay: 1, duration: 0.5 }}
          onClick={handleSkip}
          className="absolute bottom-12 right-12 z-[10000] text-white font-bold text-lg tracking-widest uppercase pointer-events-auto flex items-center gap-3 px-8 py-4 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-white/20 hover:border-white/60 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all"
        >
          Skip Celebration <span className="text-xl">⏭</span>
        </motion.button>
      )}
    </motion.div>
  );
}
