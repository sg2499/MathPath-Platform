'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
}

export function RankCinematicOverlay({ tier, onComplete }: RankCinematicOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      onComplete();
    }, 4500); // 4.5 second cinematic
    return () => {
      setMounted(false);
      clearTimeout(timer);
    };
  }, [onComplete]);

  if (!mounted) return null;

  const renderCinematic = () => {
    switch (tier) {
      case 'COPPER':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              initial={{ scale: 3, opacity: 0, y: -200 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.6 }}
              className="w-96 h-96 bg-orange-900 rounded-full blur-[100px] absolute mix-blend-screen"
            />
            <motion.h1 
              initial={{ scale: 1.5, opacity: 0, letterSpacing: "2rem" }}
              animate={{ scale: 1, opacity: 1, letterSpacing: "0.5rem" }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
              className="text-7xl font-black text-orange-200 uppercase drop-shadow-[0_0_30px_#ea580c] z-10"
            >
              Copper Forged
            </motion.h1>
          </motion.div>
        );
      case 'BRONZE':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              initial={{ scale: 0.1, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
              className="absolute w-full h-full border-[40px] border-amber-800/30 rounded-full max-w-[800px] max-h-[800px] blur-sm"
            />
            <motion.h1 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              className="text-8xl font-black text-amber-100 uppercase drop-shadow-[0_0_40px_#b45309] z-10"
            >
              Bronze Shield
            </motion.h1>
          </motion.div>
        );
      case 'SILVER':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative overflow-hidden">
            <motion.div 
              initial={{ x: "-100%", skewX: -45 }}
              animate={{ x: "100%", skewX: -45 }}
              transition={{ duration: 1, ease: "easeInOut" }}
              className="absolute w-[200%] h-32 bg-cyan-400/50 blur-xl z-0 mix-blend-screen"
            />
            <motion.h1 
              initial={{ opacity: 0, filter: "blur(20px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-8xl font-black text-white uppercase drop-shadow-[0_0_50px_#0ea5e9] tracking-[1em] z-10"
            >
              SILVER
            </motion.h1>
          </motion.div>
        );
      case 'GOLD':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: [0, 2, 1.5] }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute w-[600px] h-[600px] bg-yellow-400/40 rounded-full blur-[80px]"
            />
            <motion.h1 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="text-9xl font-black text-yellow-100 uppercase drop-shadow-[0_0_60px_#eab308] z-10"
            >
              GOLDEN ASCENT
            </motion.h1>
          </motion.div>
        );
      case 'PLATINUM':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_49%,rgba(192,132,252,0.3)_50%,transparent_51%)] bg-[size:20px_20px]" />
            <motion.h1 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-8xl font-black text-purple-100 uppercase drop-shadow-[0_0_40px_#c084fc] tracking-widest z-10"
            >
              PLATINUM MATRIX
            </motion.h1>
          </motion.div>
        );
      case 'EMERALD':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 4, ease: "linear", repeat: Infinity }}
              className="absolute w-[500px] h-[500px] border-8 border-emerald-500 border-dashed rounded-full blur-md opacity-50"
            />
            <motion.h1 
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "backOut" }}
              className="text-8xl font-black text-emerald-100 uppercase drop-shadow-[0_0_50px_#10b981] z-10"
            >
              EMERALD FRACTAL
            </motion.h1>
          </motion.div>
        );
      case 'DIAMOND':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              initial={{ opacity: 1 }}
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.2, repeat: 3 }}
              className="absolute inset-0 bg-cyan-400/20 mix-blend-screen"
            />
            <motion.h1 
              initial={{ opacity: 0, filter: "brightness(5)" }}
              animate={{ opacity: 1, filter: "brightness(1)" }}
              transition={{ duration: 1 }}
              className="text-[8rem] font-black text-white uppercase drop-shadow-[0_0_80px_#38bdf8] z-10 tracking-[0.2em]"
            >
              DIAMOND CORE
            </motion.h1>
          </motion.div>
        );
      case 'CHAMPION':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full w-full relative">
            <motion.div 
              initial={{ scale: 0.1, opacity: 1 }}
              animate={{ scale: 5, opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="absolute w-64 h-64 bg-rose-600 rounded-full"
            />
            <motion.h1 
              initial={{ opacity: 0, scale: 0.5, letterSpacing: "-0.2em" }}
              animate={{ opacity: 1, scale: 1, letterSpacing: "0.1em" }}
              transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
              className="text-[10rem] font-black text-white uppercase drop-shadow-[0_0_100px_#e11d48] z-10"
            >
              CHAMPION
            </motion.h1>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/90 backdrop-blur-xl pointer-events-auto"
        onClick={onComplete}
      >
        {renderCinematic()}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
