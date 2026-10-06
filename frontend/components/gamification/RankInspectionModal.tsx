'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Award, Zap, Lock, CheckCircle2, ChevronRight, ChevronLeft, Info } from 'lucide-react';
import { RankBadge } from './RankBadge';
import { RankCinematicOverlay } from './RankCinematicOverlay';
import { RankGuideModal } from './RankGuideModal';
import { InitCaps } from "@/lib/initCaps";

export interface RankInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentXp: number;
  currentRankTier: string;
}

const RANK_LIST = ['COPPER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'CHAMPION'];

export function RankInspectionModal({ isOpen, onClose, currentXp, currentRankTier }: RankInspectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeCinematicTier, setActiveCinematicTier] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The side arrows are only useful when the strip is wider than the window.
  const [stripScrolls, setStripScrolls] = useState(false);
  // Where the progress line ends: the middle of the student's own medallion.
  const [ownRankAt, setOwnRankAt] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    const Strip = scrollContainerRef.current;
    if (!Strip) return;
    const Measure = () => {
      setStripScrolls(Strip.scrollWidth > Strip.clientWidth + 1);
      const Track = Strip.querySelector('[data-rank-track]')?.getBoundingClientRect();
      const Own = Strip.querySelector('[data-rank-current="true"]')?.getBoundingClientRect();
      if (Track && Own && Track.width > 0) {
        setOwnRankAt(((Own.left + Own.width / 2 - Track.left) / Track.width) * 100);
      }
    };
    Measure();
    // Bring the student's own rank into view when the strip does scroll.
    Strip.querySelector('[data-rank-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (typeof ResizeObserver === 'undefined') return;
    const Observer = new ResizeObserver(Measure);
    Observer.observe(Strip);
    return () => Observer.disconnect();
  }, [isOpen, mounted]);

  if (!mounted) return null;

  const parts = currentRankTier.split('_');
  const baseRank = parts[0] || 'COPPER';
  const numeral = parts[1] || '';

  const currentIndex = RANK_LIST.indexOf(baseRank);

  // React Portal to body to bypass any parent styling constraints
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 md:p-8 pointer-events-auto">
          {/* Intense Cinematic Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-[40px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950/80 to-black"
          />

          {/* Epic Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-[95vw] lg:max-w-7xl max-h-[90vh] bg-slate-950/60 border border-indigo-500/30 rounded-[2rem] shadow-[0_0_100px_rgba(79,70,229,0.15)] overflow-hidden flex flex-col z-10 backdrop-blur-md"
          >
            {/* Top-Right Action Buttons */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-2 md:gap-4">
              <button
                onClick={() => setShowGuide(true)}
                className="px-4 py-2 bg-indigo-600/20 border border-indigo-500/50 hover:bg-indigo-600/40 rounded-full text-indigo-300 hover:text-white transition-all hover:scale-105 shadow-xl hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] flex items-center gap-2 backdrop-blur-md"
              >
                <Info className="w-5 h-5" />
                <span className="text-sm font-black uppercase tracking-widest hidden md:block">System Guide</span>
              </button>
              <button
                onClick={onClose}
                className="p-3 bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-full text-slate-400 hover:text-white transition-all hover:scale-105 shadow-xl hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] backdrop-blur-md"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Header Section */}
            <div className="relative p-6 md:p-8 pb-6 overflow-hidden border-b border-slate-800/60 bg-gradient-to-b from-slate-900/80 to-slate-950">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />

              <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <Award className="w-6 h-6 text-indigo-400" />
                    <span className="text-xs md:text-sm font-black text-indigo-400 uppercase tracking-[0.08em] md:tracking-[0.2em] whitespace-nowrap">Rank Conquest Roadmap</span>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter drop-shadow-md">
                    Division Pathway
                  </h2>
                  <p className="text-slate-400 text-base md:text-lg mt-2">
                    Track your ascension through the MathPath divisions. Conquer lessons to unlock legendary tiers.
                  </p>
                </div>

                {/* Sits on the title row, clear of the buttons in the corner. */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-black text-indigo-300/90 uppercase tracking-[0.12em] whitespace-nowrap">Total Acquired XP</span>
                  <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl px-5 py-2 flex items-center gap-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                    <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                      {currentXp.toLocaleString()}
                    </span>
                    <span className="text-sm font-black text-indigo-300 mt-1">XP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Roadmap Body */}
            <div className="se-rank-dark flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5 md:px-8 md:py-6 relative bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-indigo-950/20 via-transparent to-transparent flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Background Grid Texture */}
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

              {/* Navigation Arrows */}
              <button
                onClick={() => scrollContainerRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
                className={cn("absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-slate-900/90 border border-indigo-500/50 hover:bg-indigo-600 rounded-full text-indigo-400 hover:text-white transition-colors shadow-[0_0_20px_rgba(79,70,229,0.3)]", stripScrolls ? "hidden md:block" : "hidden")}
                aria-label="Earlier ranks"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={() => scrollContainerRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
                className={cn("absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-slate-900/90 border border-indigo-500/50 hover:bg-indigo-600 rounded-full text-indigo-400 hover:text-white transition-colors shadow-[0_0_20px_rgba(79,70,229,0.3)]", stripScrolls ? "hidden md:block" : "hidden")}
                aria-label="Later ranks"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              <div
                ref={scrollContainerRef}
                className="relative w-full my-auto shrink-0 overflow-x-auto pb-24 pt-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rank-roadmap-strip"
              >
                <div
                  className="relative w-full mx-auto px-10"
                  style={{ minWidth: 'calc(var(--rm-size) * 7 + var(--rm-own) + 7 * 14px + 5rem)' }}
                >
                  {/* Connecting Line (Underneath Badges) */}
                <div data-rank-track className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 bg-slate-900 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
                  {/* Glowing progress fill */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${ownRankAt ?? (currentIndex / (RANK_LIST.length - 1)) * 100}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.8)] relative"
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </motion.div>
                </div>

                {/* Rank Tiers Sequence */}
                <div className="relative flex justify-between items-center w-full">
                  {RANK_LIST.map((rankName, index) => {
                    const isCompleted = index < currentIndex;
                    const isActive = index === currentIndex;
                    const isLocked = index > currentIndex;

                    return (
                      <div key={rankName} className="flex flex-col items-center justify-center relative group">

                        {/* The student's own rank: a soft pool of light behind it */}
                        {isActive && (
                          <div className="absolute -inset-10 rounded-full pointer-events-none bg-[radial-gradient(closest-side,rgba(99,102,241,0.30),rgba(99,102,241,0.10)_55%,transparent)]" />
                        )}

                        <div
                          data-rank-current={isActive ? "true" : undefined}
                          className={cn(
                            "relative z-10 transition-transform duration-300",
                            isLocked
                              ? "se-rank-locked cursor-not-allowed"
                              : "hover:-translate-y-1.5 cursor-pointer",
                            isActive && "z-20"
                          )}
                          onClick={() => {
                            // Lock logic: Only allow cinematic if the tier is unlocked (active or completed)
                            if (!isLocked) {
                              setActiveCinematicTier(rankName);
                            }
                          }}
                        >
                          <RankBadge
                            tier={isActive ? currentRankTier : rankName}
                            fluid={isActive ? "var(--rm-own)" : "var(--rm-size)"}
                            className="pointer-events-none"
                          />

                          {/* Status Icon Overlay */}
                          {isCompleted && (
                            <div className="absolute bottom-0 right-0 bg-slate-900 rounded-full p-1 border border-indigo-500 shadow-lg pointer-events-none">
                              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            </div>
                          )}
                          {isLocked && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-950/85 rounded-full p-2.5 border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <Lock className="w-5 h-5 text-slate-300" />
                            </div>
                          )}
                        </div>

                        {/* Isometric Pedestal & Label */}
                        <div className={cn(
                          "absolute -bottom-24 flex flex-col items-center transition-all duration-500 w-full",
                          isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 group-hover:opacity-100 group-hover:translate-y-4"
                        )}>
                          {isActive && (
                            <div className="relative w-24 h-8 mb-4">
                              {/* 3D Isometric Pedestal */}
                              <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-full animate-pulse" />
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-800 rounded-[50%] border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.4)]" />
                              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-900 rounded-[50%] border border-slate-700 shadow-[inset_0_-5px_10px_rgba(0,0,0,0.8)]" />
                              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[2px] h-32 bg-gradient-to-t from-indigo-500/0 via-indigo-400/80 to-indigo-500/0 -z-10 blur-[1px]" />
                            </div>
                          )}
                          <span className={cn(
                            "text-[10px] md:text-sm font-black uppercase tracking-widest whitespace-nowrap",
                            isActive ? "text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" : isCompleted ? "text-slate-400" : "text-slate-600"
                          )}>
                            {InitCaps(rankName)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Motivational Footer Banner */}
              <div className="mt-4 mx-auto w-full max-w-4xl shrink-0 bg-gradient-to-r from-indigo-950/30 via-purple-900/20 to-indigo-950/30 border border-indigo-500/20 px-6 py-5 rounded-2xl flex flex-col md:flex-row items-center gap-6 shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-indigo-950/50 flex items-center justify-center border border-indigo-500/30 shrink-0">
                  <Zap className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white uppercase tracking-tight">The Grind Continues</h4>
                  <p className="text-sm text-indigo-200/70 leading-relaxed font-medium mt-1">
                    "Only those who commit to the grind of the equation will stand atop the Champion podium. Your path is set. Conquer the next lesson."
                  </p>
                </div>
                <div className="shrink-0 md:ml-auto">
                  <button onClick={onClose} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-colors shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center gap-2">
                    Back To Dashboard <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      )}
      {activeCinematicTier && (
        <RankCinematicOverlay
          tier={activeCinematicTier}
          onComplete={() => setActiveCinematicTier(null)}
        />
      )}
      <RankGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </AnimatePresence>,
    document.body
  );
}
