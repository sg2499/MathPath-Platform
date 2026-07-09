'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Compass, Pyramid, Orbit, Anvil, ChevronRight } from 'lucide-react';

interface RankGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RankGuideModal({ isOpen, onClose }: RankGuideModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 md:p-8 pointer-events-auto">
          {/* Intense Cinematic Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950/90 to-black"
          />

          {/* Epic Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950/80 border border-indigo-500/30 rounded-[2rem] shadow-[0_0_100px_rgba(79,70,229,0.2)] overflow-hidden flex flex-col z-10"
          >
            {/* Top-Right Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 z-50 p-3 bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-full text-slate-400 hover:text-white transition-all hover:scale-105 shadow-xl hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Header Section */}
            <div className="relative p-8 md:p-10 pb-8 overflow-hidden border-b border-slate-800/60 bg-gradient-to-b from-slate-900/80 to-slate-950 shrink-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                  <Compass className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="text-sm font-black text-indigo-400 uppercase tracking-[0.2em] shadow-indigo-500/50">SYSTEM DIRECTIVE</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter drop-shadow-md">
                The Ecosystem Guide
              </h2>
              <p className="text-slate-400 text-lg mt-3 max-w-2xl leading-relaxed">
                Welcome to the proving grounds. Understanding the hierarchy of Ascension, XP acquisition, and the Collector's Vault is vital to your dominance.
              </p>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain transform-gpu will-change-scroll p-8 md:p-10 relative bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-indigo-950/10 via-transparent to-transparent [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              
              <div className="flex flex-col gap-8">
                
                {/* Rule 1: The Ascension Hierarchy */}
                <div className="group relative bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-8 transition-all duration-300 hover:shadow-[0_0_40px_rgba(79,70,229,0.15)] hover:-translate-y-1 overflow-hidden transform-gpu">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/40 flex items-center justify-center shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                      <Pyramid className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">1. The Ascension Hierarchy</h3>
                      <p className="text-slate-400 leading-relaxed text-lg">
                        You begin your journey at <strong className="text-amber-500">Copper V</strong>. By proving your mathematical dominance, you will ascend through 8 legendary tiers: <strong className="text-amber-500">Copper, Bronze, Silver, Gold, Platinum, Emerald, Diamond,</strong> and ultimately, <strong className="text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]">Champion</strong>.
                        <br/><br/>
                        Each tier from Copper through Emerald consists of <strong className="text-white">5 specific ranks (V, IV, III, II, I)</strong>, where V is the entry point and I is the peak of that tier. The elite <strong className="text-cyan-400">Diamond</strong> tier consists of only <strong className="text-white">3 ranks (III, II, I)</strong>, leading to the ultimate, infinite apex: <strong className="text-rose-500">Champion</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rule 2: Acquiring XP */}
                <div className="group relative bg-slate-900/40 border border-slate-800 hover:border-fuchsia-500/50 rounded-3xl p-8 transition-all duration-300 hover:shadow-[0_0_40px_rgba(217,70,239,0.15)] hover:-translate-y-1 overflow-hidden transform-gpu">
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-900 to-slate-900 border border-fuchsia-500/40 flex items-center justify-center shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                      <Orbit className="w-8 h-8 text-fuchsia-400" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">2. Acquiring XP & Evolution</h3>
                      <p className="text-slate-400 leading-relaxed text-lg">
                        Ascension is fueled by Experience Points (XP). You acquire XP by completing lessons, destroying equations with perfect accuracy, and maintaining daily streaks. The faster and more accurately you solve, the greater your XP bounty.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rule 3: The Collector's Vault */}
                <div className="group relative bg-slate-900/40 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-8 transition-all duration-300 hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] hover:-translate-y-1 overflow-hidden transform-gpu">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-900 to-slate-900 border border-amber-500/40 flex items-center justify-center shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                      <Anvil className="w-8 h-8 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">3. The Collector's Vault</h3>
                      <p className="text-slate-400 leading-relaxed text-lg">
                        Dominance is rewarded. As you shatter rank ceilings, you will unlock High-Tech Loot Crates. Access the <strong className="text-amber-500">Collector's Vault</strong> from your dashboard to physically unbox these crates and extract ultra-rare badges for your profile.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="p-6 md:p-8 border-t border-slate-800/60 bg-slate-950 shrink-0 flex justify-end">
              <button 
                onClick={onClose} 
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-base font-black uppercase tracking-widest rounded-xl transition-colors shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center gap-2"
              >
                Acknowledge Directive <ChevronRight className="w-5 h-5" />
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
