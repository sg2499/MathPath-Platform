'use client';

import Link from "next/link";
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { RankBadge, RankMedalKey } from './RankBadge';
import { RankStepFor, RankTierForXp } from '@/lib/rankTiers';
import { Coins, Sparkles } from 'lucide-react';
import dynamic from "next/dynamic";

// 2026-10-11 (performance): the 3D / celebration scenes load only when shown.
const RankInspectionModal = dynamic(() => import("./RankInspectionModal").then((Module) => Module.RankInspectionModal), { ssr: false });
const RankCinematicOverlay = dynamic(() => import("./RankCinematicOverlay").then((Module) => Module.RankCinematicOverlay), { ssr: false });

// 2026-10-20 (rank revamp): a rank-up notification links here with
// ?rankup=<tier>&at=<click time>. Kept in its own small component so the page
// around it can still render ahead of the address (useSearchParams).
function RankUpLink({ onRankUp }: { onRankUp: (Tier: string) => void }) {
  const Params = useSearchParams();
  const Tier = Params.get('rankup');
  const At = Params.get('at');
  useEffect(() => {
    if (!Tier) return;
    onRankUp(Tier.toUpperCase());
    const Rest = new URLSearchParams(window.location.search);
    Rest.delete('rankup'); Rest.delete('at');
    const Query = Rest.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${Query ? `?${Query}` : ''}${window.location.hash}`);
  }, [Tier, At, onRankUp]);
  return null;
}

export interface StudentWalletProps {
  currentXp: number;
  currentRankTier?: string;
  coinBalance: number;
  className?: string;
  isLoading?: boolean;
}

// 2026-10-20 (rank revamp): the wallet uses the server's own ladder
// (lib/rankTiers). Its old copy here had drifted (Champion at 27,800 XP), so
// the bar under the rank showed the wrong span for almost every rank.

export function getRankTierFromXp(xp: number): string {
  return RankTierForXp(xp);
}

// The ring around the dashboard medallion: how far into this division the
// student is. Drawn in the rank's own colour.
const RING_GLOW: Record<string, [string, string]> = {
  COPPER: ['#b45309', '#ff9a52'], BRONZE: ['#a16207', '#ffc65c'], SILVER: ['#64748b', '#9fe3ff'], GOLD: ['#b7791f', '#ffe066'],
  PLATINUM: ['#7c3aed', '#d8b4fe'], EMERALD: ['#047857', '#5eead4'], DIAMOND: ['#0284c7', '#e0f2fe'], CHAMPION: ['#be123c', '#ffd36b'],
};
function RankProgressRing({ fraction, family, label }: { fraction: number; family: string; label: string }) {
  const R = 47, C = 2 * Math.PI * R;
  const [From, To] = RING_GLOW[family] ?? RING_GLOW.COPPER;
  const Id = `rank-ring-${family}`;
  return (
    <svg viewBox="0 0 100 100" className="se-rank-ring absolute pointer-events-none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={Id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={From} /><stop offset="1" stopColor={To} /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r={R} fill="none" className="se-rank-ring-track" strokeWidth="3" />
      <motion.circle
        cx="50" cy="50" r={R} fill="none" stroke={`url(#${Id})`} strokeWidth="3.2" strokeLinecap="round"
        strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - Math.max(0.02, Math.min(1, fraction))) }}
        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

export function StudentWallet({ currentXp, currentRankTier, coinBalance, className, isLoading }: StudentWalletProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Mounted from the first open on, so the 3D rank scene isn't downloaded
  // with the dashboard.
  const [modalWanted, setModalWanted] = useState(false);
  // The scene a rank-up notification asked for.
  const [rankUpScene, setRankUpScene] = useState<{ tier: string; promo: boolean } | null>(null);
  if (isModalOpen && !modalWanted) setModalWanted(true);

  // "See Roadmap" at the end of a rank-up scene on a result page lands on
  // /student/dashboard?roadmap=1: open the roadmap, then tidy the address.
  useEffect(() => {
    const Params = new URLSearchParams(window.location.search);
    if (Params.get('roadmap') !== '1') return;
    setIsModalOpen(true);
    Params.delete('roadmap');
    const Rest = Params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${Rest ? `?${Rest}` : ''}${window.location.hash}`);
  }, []);

  // Resolve rank tier dynamically if not explicitly provided
  const resolvedRankTier = currentRankTier || getRankTierFromXp(currentXp);

  // A rank-up notification: the promotion scene for that rank while it is
  // still the student's own; once they have moved on, their current rank.
  const ownKey = RankMedalKey(resolvedRankTier);
  const onRankUpLink = React.useCallback((Tier: string) => {
    const Promo = RankMedalKey(Tier) === ownKey;
    setRankUpScene({ tier: Promo ? RankMedalKey(Tier) : ownKey, promo: Promo });
  }, [ownKey]);

  // The ring: this division to the next (the server's own ladder)
  const ringStep = RankStepFor(RankMedalKey(resolvedRankTier));
  const ringFraction = ringStep.nextXp ? (currentXp - ringStep.start) / (ringStep.nextXp - ringStep.start) : 1;
  const ringFamily = RankMedalKey(resolvedRankTier).split('_')[0];
  const ringLabel = ringStep.next && ringStep.nextXp
    ? `${Math.round(Math.max(0, Math.min(1, ringFraction)) * 100)}% of the way to ${ringStep.next.charAt(0)}${ringStep.next.slice(1).toLowerCase().replace(/_(\w+)$/, (_m, n: string) => ` ${n.toUpperCase()}`)}`
    : 'The top rank';

  // Progress through this division, on the same ladder as the ring
  const xpProgress = Math.max(0, currentXp - ringStep.start);
  const xpNeeded = ringStep.nextXp ? ringStep.nextXp - ringStep.start : 0;
  const progressPercent = xpNeeded ? Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100)) : 100;
  // "COPPER_II" -> "Copper II": Init Caps for the rank word, the numeral stays as it is.
  const [rankWord, ...rankRest] = resolvedRankTier.split('_');
  const rankDisplayName = [rankWord.charAt(0) + rankWord.slice(1).toLowerCase(), ...rankRest].join(' ');

  // 3D HUD Mouse Tilt effect variables
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 20 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left - width / 2;
    const mouseY = event.clientY - rect.top - height / 2;
    x.set(mouseX / width);
    y.set(mouseY / height);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  if (isLoading) {
    return (
      <div className={cn(
        "flex flex-col sm:flex-row items-center gap-4 p-3 sm:p-4 rounded-[2rem] transition-all duration-300 select-none",
        "bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800",
        className
      )}>
        {/* Skeleton Badge */}
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-slate-200 dark:bg-slate-800/80 animate-pulse shrink-0 shadow-inner" />

        {/* Skeleton Center */}
        <div className="flex flex-col gap-4 flex-1 min-w-[280px] w-full">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <div className="w-12 h-3 bg-slate-200 dark:bg-slate-800/80 rounded animate-pulse" />
              <div className="w-32 h-8 bg-slate-200 dark:bg-slate-800/80 rounded animate-pulse" />
            </div>
            <div className="hidden sm:block w-px h-10 bg-slate-200 dark:bg-slate-800/50 mx-4" />
            <div className="flex flex-col items-end gap-2 mt-1">
              <div className="w-20 h-3 bg-slate-200 dark:bg-slate-800/80 rounded animate-pulse" />
              <div className="w-24 h-4 bg-slate-200 dark:bg-slate-800/80 rounded animate-pulse" />
            </div>
          </div>
          <div className="w-full h-6 bg-slate-200 dark:bg-slate-800/80 rounded-full animate-pulse shadow-inner" />
        </div>

        {/* Skeleton Coins */}
        <div className="min-w-[180px] h-[88px] rounded-[1.5rem] bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 animate-pulse shrink-0 shadow-inner" />
      </div>
    );
  }

  return (
    <>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "se-wallet flex flex-col sm:flex-row items-center gap-4 p-3 sm:p-4 rounded-[1.75rem] transition-all duration-300 select-none",
          className
        )}
      >

        {/* Left Side: Interactive Rank Badge Core */}
        <div
          onClick={() => setIsModalOpen(true)}
          className="relative flex items-center justify-center group cursor-pointer"
          style={{ transform: "translateZ(40px)" }}
        >
          {/* 2026-10-20 (rank revamp, Part 4): a ring around the medallion
              fills towards the next division; the metal catches a slow light
              sweep now and then. */}
          <RankProgressRing fraction={ringFraction} family={ringFamily} label={ringLabel} />
          <RankBadge tier={resolvedRankTier} size="md" eager sweep className="relative z-[1] transition-transform duration-300 group-hover:scale-[1.04]" />
        </div>

        {/* Center: HUD XP Bar info */}
        <div
          className="flex flex-col gap-4 flex-1 min-w-[280px] w-full"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="se-wallet-label">Rank</span>
              <span className="se-wallet-rank">{rankDisplayName}</span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-10 bg-slate-200 dark:bg-slate-700 mx-4" />

            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="se-wallet-accent w-4 h-4" />
                <span className="se-wallet-label se-wallet-accent">Acquired XP</span>
              </div>
              <span className="se-wallet-xp">{xpNeeded ? `${xpProgress.toLocaleString()} / ${xpNeeded.toLocaleString()} XP` : `${currentXp.toLocaleString()} XP`}</span>
            </div>
          </div>

          {/* Heavy Chiseled Shimmering Progress Bar */}
          <div className="se-xp-track relative w-full h-5 rounded-full overflow-hidden group transition-all">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="se-xp-fill h-full rounded-full relative"
            >
              {/* Inner highlight for 3D pop */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/20 rounded-t-full" />

              {/* Internal diagonal stripes for game-like texture */}
              <div className="absolute inset-0 opacity-[0.10]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)' }} />
            </motion.div>
          </div>
        </div>

        {/* Right Side: Game Ledger Coins Chip */}
        {/* 2026-10-18 (Rewards): the chip always looked clickable; it now
            opens the Reward Store. */}
        <Link
          href="/student/rewards"
          aria-label={`${coinBalance.toLocaleString()} MathCoins. Open the Reward Store`}
          title="Open the Reward Store"
          className="se-coins group flex flex-col md:flex-row items-center gap-4 px-5 md:px-6 py-3 md:py-4 rounded-[1.25rem] transition-all duration-300 hover:scale-105 hover:-translate-y-1 cursor-pointer overflow-hidden relative min-w-[160px]"
          style={{ transform: "translateZ(30px)" }}
        >
          {/* Shiny overlay sweep */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-400/10 dark:via-amber-400/5 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          <div className="w-14 h-14 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_6px_12px_rgba(249,115,22,0.4)] group-hover:rotate-[360deg] transition-transform duration-700 shrink-0">
             <Coins className="w-8 h-8 text-white drop-shadow-md" />
          </div>

          <div className="flex flex-col items-center md:items-start">
            <span className="se-wallet-label se-wallet-accent">MathCoins</span>
            <span className="se-wallet-coins">{coinBalance.toLocaleString()}</span>
          </div>
        </Link>

      </motion.div>

      <Suspense fallback={null}><RankUpLink onRankUp={onRankUpLink} /></Suspense>
      {rankUpScene ? (
        <RankCinematicOverlay
          tier={rankUpScene.tier}
          mode={rankUpScene.promo ? 'promo' : 'replay'}
          state="current"
          xp={currentXp}
          onRoadmap={() => setIsModalOpen(true)}
          onComplete={() => setRankUpScene(null)}
        />
      ) : null}

      {/* Cinematic Modal Overlay */}
      {modalWanted ? (
      <RankInspectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentXp={currentXp}
        currentRankTier={resolvedRankTier}
      />
      ) : null}
    </>
  );
}
