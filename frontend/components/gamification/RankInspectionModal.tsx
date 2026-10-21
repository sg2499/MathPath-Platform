'use client';

// 2026-10-20 (rank revamp, Part 4): the rank roadmap is a ladder of all 34
// divisions, Copper V to Champion, each at its own XP mark. The divisions the
// student has reached show their medallion and replay their scene when
// tapped; the student's own division is marked "You Are Here" with the XP to
// the next one; the ones still ahead stay sealed (their XP marks show, their
// medallions do not). It runs across on larger screens and down on phones.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ChevronRight, ChevronLeft, Info, Lock, Play } from 'lucide-react';
import dynamic from 'next/dynamic';
import { RankBadge, RankMedalKey } from './RankBadge';
import { RankGuideModal } from './RankGuideModal';
import { RANK_TIERS } from '@/lib/rankTiers';

// 2026-10-11 (performance): the 3D / celebration scenes load only when shown.
const RankCinematicOverlay = dynamic(() => import('./RankCinematicOverlay').then((Module) => Module.RankCinematicOverlay), { ssr: false });
// warm the browser cache for the scene while the student looks at the roadmap
const WarmScene = (Tier: string) => { import('./RankCinematicOverlay').then((Module) => Module.PrefetchRankScene(Tier, 'replay')).catch(() => {}); };

export interface RankInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentXp: number;
  currentRankTier: string;
}

const NAMES: Record<string, string> = { COPPER: 'Copper', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond', CHAMPION: 'Champion' };
const GLOW: Record<string, string> = { COPPER: '#ff8a3d', BRONZE: '#ffb547', SILVER: '#7fd6ff', GOLD: '#ffd34d', PLATINUM: '#b77bff', EMERALD: '#38e09b', DIAMOND: '#9fe3ff', CHAMPION: '#ff2e55' };

const fmt = (N: number) => N.toLocaleString('en-IN');
export function TierName(Tier: string): string {
  const [Family, Numeral] = String(Tier).split('_');
  return Numeral ? `${NAMES[Family] ?? Family} ${Numeral}` : (NAMES[Family] ?? Family);
}

type Step = { tier: string; xp: number; family: string; index: number };
const STEPS: Step[] = RANK_TIERS.map((Row, Index) => ({ tier: Row.tier, xp: Row.xp, family: Row.tier.split('_')[0], index: Index }));
const FAMILY_GROUPS: { family: string; steps: Step[] }[] = [];
for (const S of STEPS) {
  const Last = FAMILY_GROUPS[FAMILY_GROUPS.length - 1];
  if (Last && Last.family === S.family) Last.steps.push(S);
  else FAMILY_GROUPS.push({ family: S.family, steps: [S] });
}

export function RankInspectionModal({ isOpen, onClose, currentXp, currentRankTier }: RankInspectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeCinematic, setActiveCinematic] = useState<{ tier: string; state: 'current' | 'passed' } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, on: false });
  // The progress line: from the first division to exactly where the student stands.
  const [fill, setFill] = useState<{ size: number; vertical: boolean } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const ownKey = RankMedalKey(currentRankTier);
  const ownIndex = Math.max(0, STEPS.findIndex((S) => S.tier === ownKey));
  const own = STEPS[ownIndex];
  const next = STEPS[ownIndex + 1] ?? null;
  const intoStep = next ? Math.min(1, Math.max(0, (currentXp - own.xp) / (next.xp - own.xp))) : 1;
  const toNext = next ? Math.max(0, next.xp - currentXp) : 0;

  const measure = useCallback(() => {
    const Scroller = scrollRef.current, Track = trackRef.current;
    if (!Scroller || !Track) return;
    const Vertical = window.matchMedia('(max-width: 767px)').matches;
    const Box = Track.getBoundingClientRect();
    const Centre = (Tier: string) => {
      const El = Track.querySelector(`[data-rank-node="${Tier}"] [data-rank-dot]`)?.getBoundingClientRect();
      if (!El) return null;
      return Vertical ? El.top + El.height / 2 - Box.top : El.left + El.width / 2 - Box.left;
    };
    const A = Centre(own.tier);
    const B = next ? Centre(next.tier) : null;
    if (A !== null) setFill({ size: A + (B !== null ? (B - A) * intoStep : 0), vertical: Vertical });
    setCanScroll({ back: Scroller.scrollLeft > 4, on: Scroller.scrollLeft + Scroller.clientWidth < Scroller.scrollWidth - 4 });
  }, [own.tier, next, intoStep]);

  useEffect(() => { if (isOpen) WarmScene(currentRankTier); }, [isOpen, currentRankTier]);

  useLayoutEffect(() => {
    if (!isOpen || !mounted) return;
    const Scroller = scrollRef.current;
    if (!Scroller) return;
    // Bring the student's own division into the middle of the view (once
    // laid out: the box is still growing in on the first frame).
    const Centre = () => {
      const Own = Scroller.querySelector('[data-rank-current="true"]') as HTMLElement | null;
      if (!Own) return;
      const O = Own.getBoundingClientRect(), Sc = Scroller.getBoundingClientRect();
      if (window.matchMedia('(max-width: 767px)').matches) Scroller.scrollTop += O.top + O.height / 2 - (Sc.top + Sc.height / 2);
      else Scroller.scrollLeft += O.left + O.width / 2 - (Sc.left + Sc.width / 2);
      measure();
    };
    measure();
    Centre();
    const Later = window.setTimeout(Centre, 380);
    const OnScroll = () => setCanScroll({ back: Scroller.scrollLeft > 4, on: Scroller.scrollLeft + Scroller.clientWidth < Scroller.scrollWidth - 4 });
    Scroller.addEventListener('scroll', OnScroll, { passive: true });
    const Observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    Observer?.observe(Scroller);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(Later); Scroller.removeEventListener('scroll', OnScroll); Observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [isOpen, mounted, measure]);

  // Escape closes the roadmap (the scene and the guide handle their own).
  useEffect(() => {
    if (!isOpen || activeCinematic || showGuide) return;
    const OnKey = (Event: KeyboardEvent) => { if (Event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', OnKey);
    return () => window.removeEventListener('keydown', OnKey);
  }, [isOpen, activeCinematic, showGuide, onClose]);

  const subline = useMemo(() => {
    if (!next) return `You are a Champion, the top of MathPath, with ${fmt(currentXp)} XP.`;
    return `You are at ${TierName(own.tier)}. ${fmt(toNext)} XP more and you reach ${TierName(next.tier)}.`;
  }, [next, own.tier, toNext, currentXp]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 md:p-8 pointer-events-auto" role="dialog" aria-modal="true" aria-label="Rank roadmap">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="se-ladder relative w-full max-w-[96vw] lg:max-w-7xl max-h-[92vh] h-[92vh] md:h-auto rounded-[1.75rem] overflow-hidden flex flex-col z-10"
          >
            {/* Header */}
            <div className="se-ladder-head relative shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-7 md:pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="se-ladder-eyebrow">Rank Roadmap</p>
                  <h2 className="se-ladder-title">Copper To Champion</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setShowGuide(true)} className="se-ladder-chip" aria-label="How ranks work">
                    <Info className="w-4 h-4" />
                    <span className="hidden sm:inline whitespace-nowrap">How Ranks Work</span>
                  </button>
                  <button type="button" onClick={onClose} className="se-ladder-close" aria-label="Close the roadmap">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="se-ladder-sub">{subline}</p>
              <div className="se-ladder-stats mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="whitespace-nowrap"><b className="tabular-nums">{fmt(currentXp)}</b> XP Earned</span>
                {next ? <span className="whitespace-nowrap"><b className="tabular-nums">{fmt(toNext)}</b> XP To {TierName(next.tier)}</span> : <span className="whitespace-nowrap">The Top Rank</span>}
                <span className="whitespace-nowrap"><b className="tabular-nums">{ownIndex + 1}</b> Of 34 Divisions</span>
              </div>
            </div>

            {/* The ladder */}
            <div className="relative flex-1 min-h-0">
              <button type="button" aria-label="Earlier divisions" onClick={() => scrollRef.current?.scrollBy({ left: -560, behavior: 'smooth' })}
                className={cn('se-ladder-arrow left-3', canScroll.back ? 'hidden md:flex' : 'hidden')}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" aria-label="Later divisions" onClick={() => scrollRef.current?.scrollBy({ left: 560, behavior: 'smooth' })}
                className={cn('se-ladder-arrow right-3', canScroll.on ? 'hidden md:flex' : 'hidden')}>
                <ChevronRight className="w-5 h-5" />
              </button>

              <div ref={scrollRef} className="se-ladder-scroll se-rank-dark h-full overflow-y-auto overflow-x-hidden md:overflow-x-auto md:overflow-y-hidden">
                <div ref={trackRef} className="se-ladder-track relative flex flex-col md:flex-row md:items-stretch md:w-max">
                  {/* the line under the medallions, and how far along it the student is */}
                  <div className="se-ladder-line" aria-hidden="true">
                    <motion.div
                      className="se-ladder-line-fill"
                      initial={false}
                      animate={fill ? (fill.vertical ? { height: fill.size, width: '100%' } : { width: fill.size, height: '100%' }) : {}}
                      transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
                    />
                  </div>

                  {FAMILY_GROUPS.map((Group) => (
                    <section key={Group.family} className="se-ladder-family relative flex flex-col md:flex-row" aria-label={NAMES[Group.family]} style={{ ['--glow' as string]: GLOW[Group.family] }}>
                      <header className="se-ladder-family-head">
                        <span className="se-ladder-family-name whitespace-nowrap">{NAMES[Group.family]}</span>
                        <span className="se-ladder-family-xp whitespace-nowrap tabular-nums">From {fmt(Group.steps[0].xp)} XP</span>
                      </header>
                      <ol className="flex flex-col md:flex-row">
                        {Group.steps.map((S) => {
                          const State = S.index < ownIndex ? 'done' : S.index === ownIndex ? 'current' : 'ahead';
                          const Reached = State !== 'ahead';
                          return (
                            <li key={S.tier} data-rank-node={S.tier} data-rank-current={State === 'current' ? 'true' : undefined} data-state={State} className="se-ladder-step relative">
                              <button
                                type="button"
                                disabled={!Reached}
                                onClick={() => Reached && setActiveCinematic({ tier: S.tier, state: State === 'current' ? 'current' : 'passed' })}
                                className="se-ladder-node group"
                                aria-label={Reached ? `${TierName(S.tier)}, ${fmt(S.xp)} XP. Play its scene` : `A division still ahead, at ${fmt(S.xp)} XP`}
                              >
                                {State === 'current' ? <span className="se-ladder-here whitespace-nowrap">You Are Here</span> : null}
                                <span data-rank-dot className="se-ladder-medal">
                                  <RankBadge tier={S.tier} sealed={!Reached} eager={State === 'current'} fluid={State === 'current' ? 'var(--lad-own)' : 'var(--lad-size)'} className="pointer-events-none" />
                                  {State === 'done' ? <CheckCircle2 className="se-ladder-done" aria-hidden="true" /> : null}
                                  {State === 'ahead' ? <Lock className="se-ladder-lock" aria-hidden="true" /> : null}
                                  {Reached ? <span className="se-ladder-play" aria-hidden="true"><Play className="w-3.5 h-3.5" /></span> : null}
                                </span>
                                <span className="se-ladder-text">
                                  <span className="se-ladder-name whitespace-nowrap">{Reached ? TierName(S.tier) : S.tier === 'CHAMPION' ? 'Champion' : (S.tier.split('_')[1] ?? '')}</span>
                                  <span className="se-ladder-xp whitespace-nowrap tabular-nums">{fmt(S.xp)} XP</span>
                                  {State === 'current' && next ? (
                                    <span className="se-ladder-progress" aria-label={`${Math.round(intoStep * 100)} percent of the way to ${TierName(next.tier)}`}>
                                      <span style={{ width: `${Math.max(4, intoStep * 100)}%` }} />
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="se-ladder-foot shrink-0 px-5 py-3 md:px-8 md:py-4 flex items-center justify-between gap-4">
              <p className="se-ladder-foot-note min-w-0">Tap a medallion you have reached to watch its scene again.</p>
              <button type="button" onClick={onClose} className="se-ladder-back shrink-0 whitespace-nowrap">
                Back To Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {activeCinematic && (
        <RankCinematicOverlay
          tier={activeCinematic.tier}
          mode="replay"
          state={activeCinematic.state}
          xp={currentXp}
          onRoadmap={null}
          onComplete={() => setActiveCinematic(null)}
        />
      )}
      <RankGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </AnimatePresence>,
    document.body
  );
}
