'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Check, Sparkles, Coins, ArrowRight } from 'lucide-react';

// Mirrors EconomyService.evaluate_activity_performance()'s "reward_breakdown"
// dict (backend/app/services/economy_service.py) -- every number here is an
// ADDITION (base + accuracyBonus + speedBonus = total), never a multiplier,
// so this modal can show a student or parent "why" in plain arithmetic. See
// that function's module-level comment for the full two-layer design and
// why speedBonus is a remainder rather than an independently-rounded figure
// (base + accuracyBonus + speedBonus always sums to exactly `total`).
export interface RewardBreakdownLine {
  base: number;
  accuracyBonus: number;
  speedBonus: number;
  total: number;
}

export type RewardAccuracyTier = 'PERFECT' | 'EXCELLENT' | 'GREAT' | 'FAIR' | 'NEEDS_PRACTICE';
export type RewardSpeedTier = 'LIGHTNING' | 'FAST' | 'STEADY';
export type RewardActivityType = 'DPS' | 'ASSESSMENT' | 'MOCK';

export interface RewardBreakdown {
  xp: RewardBreakdownLine;
  coins: RewardBreakdownLine;
  accuracyTier: RewardAccuracyTier;
  accuracyPercent: number;
  speedTier: RewardSpeedTier;
  timeTakenSeconds: number | null;
  allottedSeconds: number | null;
  activityType: RewardActivityType;
}

export interface RewardEarnedModalProps {
  breakdown: RewardBreakdown;
  onContinue: () => void;
}

const ACCURACY_TIER_LABEL: Record<string, string> = {
  PERFECT: 'Perfect',
  EXCELLENT: 'Excellent',
  GREAT: 'Great',
  FAIR: 'Fair',
  NEEDS_PRACTICE: 'Needs practice',
};

const SPEED_TIER_LABEL: Record<string, string> = {
  LIGHTNING: 'Lightning',
  FAST: 'Fast',
  STEADY: 'Steady',
};

// "Practice Sheet" (not "DPS") on purpose -- the eyebrow is student-facing
// copy, and DPS is an internal/admin name for the practice sheet activity
// type everywhere else on the platform.
const ACTIVITY_EYEBROW: Record<RewardActivityType, string> = {
  DPS: 'Practice Sheet',
  ASSESSMENT: 'Assessment',
  MOCK: 'Mock Exam',
};

const ACTIVITY_BASE_LABEL: Record<RewardActivityType, string> = {
  DPS: 'Base for this sheet',
  ASSESSMENT: 'Base for this assessment',
  MOCK: 'Base for this mock exam',
};

const ACTIVITY_FOOTNOTE_NOUN: Record<RewardActivityType, string> = {
  DPS: 'sheet',
  ASSESSMENT: 'assessment',
  MOCK: 'mock exam',
};

function toWholeMinutes(seconds: number | null): number {
  if (!seconds || seconds <= 0) return 0;
  return Math.round(seconds / 60);
}

/**
 * The reward-earned modal shown right after an activity's completion
 * celebration (confetti) and before any badge reveals / rank-up cinematic --
 * see docs/project-memory for the full DPS/Assessment/Mock celebration
 * sequencing. Purely presentational: the parent owns when this mounts
 * (conditionally rendered, matching EpicCelebration / BadgeInspectionModal's
 * own convention) and what happens on Continue.
 */
export function RewardEarnedModal({ breakdown, onContinue }: RewardEarnedModalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { xp, coins, accuracyTier, accuracyPercent, speedTier, timeTakenSeconds, allottedSeconds, activityType } = breakdown;

  const accuracyLabel = ACCURACY_TIER_LABEL[accuracyTier] ?? accuracyTier;
  const speedLabel = SPEED_TIER_LABEL[speedTier] ?? speedTier;
  const eyebrow = ACTIVITY_EYEBROW[activityType] ?? 'Activity';
  const baseLabel = ACTIVITY_BASE_LABEL[activityType] ?? 'Base for this activity';
  const footnoteNoun = ACTIVITY_FOOTNOTE_NOUN[activityType] ?? 'activity';

  // STEADY never gets a "X of Y min" qualifier -- it's the "no bonus, no
  // penalty" tier and can also mean timing data was missing entirely, so a
  // fabricated-looking time range would be misleading rather than helpful.
  const takenMin = toWholeMinutes(timeTakenSeconds);
  const allottedMin = toWholeMinutes(allottedSeconds);
  const showSpeedTime = speedTier !== 'STEADY' && !!timeTakenSeconds && !!allottedSeconds;

  if (!mounted) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* ambient cinematic backdrop -- deliberately a fixed dark world (not
          theme-adaptive), matching EpicCelebration / RankCinematicOverlay's
          full-screen celebration overlays elsewhere on the platform */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 4% 0%, rgba(6,182,212,0.20), transparent 26%), ' +
            'radial-gradient(circle at 96% 12%, rgba(124,58,237,0.17), transparent 28%), ' +
            'radial-gradient(circle at 60% 110%, rgba(37,99,235,0.15), transparent 26%), ' +
            'linear-gradient(135deg, #040915 0%, #081224 46%, #090f1d 100%)',
        }}
      />
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[7px]" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute top-24 left-44 h-1.5 w-1.5 rounded-full bg-cyan-300/60 shadow-[0_0_12px_3px_rgba(103,232,249,0.5)]" />
        <span className="absolute top-40 right-56 h-1 w-1 rounded-full bg-violet-300/60 shadow-[0_0_10px_3px_rgba(196,181,253,0.5)]" />
        <span className="absolute bottom-32 left-36 h-1.5 w-1.5 rounded-full bg-amber-400/50 shadow-[0_0_12px_3px_rgba(251,191,36,0.45)]" />
        <span className="absolute bottom-20 right-24 h-1.5 w-1.5 rounded-full bg-indigo-400/50 shadow-[0_0_12px_3px_rgba(129,140,248,0.45)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-[640px] rounded-[2rem] border border-indigo-500/20 p-8 pb-10 sm:p-11"
        style={{
          background: 'linear-gradient(180deg, rgba(17,24,45,0.98) 0%, rgba(9,14,28,0.99) 100%)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.06), 0 40px 120px rgba(0,0,0,0.55), 0 0 90px rgba(79,70,229,0.16)',
        }}
      >
        <button
          type="button"
          onClick={onContinue}
          aria-label="Close"
          className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/55 backdrop-blur-md transition-colors hover:bg-slate-800"
        >
          <X className="h-4 w-4 text-slate-400" strokeWidth={2.4} />
        </button>

        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
            <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-400">
            {eyebrow} &middot; Complete
          </span>
        </div>

        <h1 className="mb-7 text-xl font-extrabold leading-tight text-slate-50 sm:text-[23px]">
          Nice work &mdash; here&apos;s what you earned
        </h1>

        {/* hero: XP + coins totals */}
        <div className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="px-2 py-1.5 text-center">
            <div className="bg-gradient-to-r from-indigo-400 via-purple-500 to-indigo-500 bg-clip-text text-5xl font-black leading-none tracking-tight tabular-nums text-transparent sm:text-6xl">
              {xp.total}
            </div>
            <div className="mt-2.5 flex items-center justify-center gap-1.5">
              <Sparkles className="h-[13px] w-[13px] text-indigo-300" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-300">XP Earned</span>
            </div>
          </div>

          <div className="h-16 w-px bg-slate-600/50" />

          <div className="px-2 py-1.5 text-center">
            <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-orange-600 bg-clip-text text-5xl font-black leading-none tracking-tight tabular-nums text-transparent sm:text-6xl">
              {coins.total}
            </div>
            <div className="mt-2.5 flex items-center justify-center gap-1.5">
              <Coins className="h-[13px] w-[13px] text-orange-300" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-orange-300">Coins Earned</span>
            </div>
          </div>
        </div>

        {/* addition-only breakdown -- base + accuracyBonus + speedBonus
            always sums to total, guaranteed by economy_service.py's
            remainder-based rounding, so there's never an off-by-one here */}
        <div className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-slate-500">
          How this was calculated
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between py-3.5">
            <span className="text-[14.5px] font-semibold text-slate-300">{baseLabel}</span>
            <span className="text-[14.5px] font-extrabold tabular-nums text-slate-200">
              {xp.base} XP &middot; {coins.base} coins
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-dashed border-slate-700/70 py-3.5">
            <span className="flex items-center gap-2.5">
              <span className="text-[14.5px] font-semibold text-slate-300">Accuracy bonus</span>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-[3px] text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-amber-300">
                {accuracyLabel} &middot; {Math.round(accuracyPercent)}%
              </span>
            </span>
            <span className="text-[14.5px] font-extrabold tabular-nums text-slate-200">
              + {xp.accuracyBonus} XP &middot; + {coins.accuracyBonus} coins
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-dashed border-slate-700/70 py-3.5">
            <span className="flex items-center gap-2.5">
              <span className="text-[14.5px] font-semibold text-slate-300">Speed bonus</span>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-[3px] text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-cyan-300">
                {speedLabel}
                {showSpeedTime ? ` · ${takenMin} of ${allottedMin} min` : ''}
              </span>
            </span>
            <span className="text-[14.5px] font-extrabold tabular-nums text-slate-200">
              + {xp.speedBonus} XP &middot; + {coins.speedBonus} coins
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between border-t-2 border-slate-500/45 pb-1 pt-5">
            <span className="text-base font-black text-slate-50">Total</span>
            <span className="text-[19px] font-black tabular-nums">
              <span className="text-indigo-300">{xp.total} XP</span>
              <span className="mx-1 font-bold text-slate-600">&middot;</span>
              <span className="text-orange-300">{coins.total} coins</span>
            </span>
          </div>
        </div>

        <p className="mb-6 mt-5 text-[12.5px] leading-relaxed text-slate-500">
          Base scales with the {footnoteNoun}. Accuracy is the bigger reward &mdash; speed only adds a smaller nudge on
          top, never a penalty for taking your time.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-[14.5px] font-black uppercase tracking-[0.04em] text-slate-50 shadow-[0_14px_34px_rgba(79,70,229,0.38),inset_0_1px_0_rgba(255,255,255,0.16)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          Continue
          <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}
