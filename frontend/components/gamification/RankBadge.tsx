'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// 2026-10-19 (rank revamp, Part 1): the medallions are forged 3D objects, one
// per rank family with the division built into the piece (stones set in the
// rim, then laurels, then a crowned crest). They are rendered offline from
// public/cutscenes/rank/medallion.js -- the same model the cut scene uses --
// into stills at 192, 384 and 768 px (public/assets/ranks/medals), so each
// screen gets a sharp picture at its own size. Re-render with
// tools/rank-medals after changing the model.

export interface RankBadgeProps {
  tier: string;
  globalRank?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * A CSS length (for example "var(--rm-size)"). When given, the medallion is
   * drawn at exactly that width and height.
   */
  fluid?: string;
  /** Kept for callers; the stills never move. */
  still?: boolean;
  /** A rank not reached yet: the sealed medallion, so it stays a mystery. */
  sealed?: boolean;
  /** Load straight away (above the fold) instead of lazily. */
  eager?: boolean;
  /** A slow light sweep across the metal now and then (the dashboard). */
  sweep?: boolean;
}

const FAMILIES = ['COPPER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'CHAMPION'];
const DIVISIONS: Record<string, string[]> = {
  DIAMOND: ['III', 'II', 'I'],
  CHAMPION: [],
};
const NAMES: Record<string, string> = { V: '5', IV: '4', III: '3', II: '2', I: '1' };

// "BRONZE_III" -> "BRONZE_III"; a family alone ("BRONZE") -> its top division,
// the finished medallion; anything unknown -> COPPER_V.
export function RankMedalKey(Tier: string): string {
  const [Family, Numeral] = String(Tier || '').toUpperCase().split('_');
  if (!FAMILIES.includes(Family)) return 'COPPER_V';
  if (Family === 'CHAMPION') return 'CHAMPION';
  const Allowed = DIVISIONS[Family] ?? ['V', 'IV', 'III', 'II', 'I'];
  if (Numeral && Allowed.includes(Numeral)) return `${Family}_${Numeral}`;
  return `${Family}_I`;
}

export function RankMedalSrc(Key: string, Px: 192 | 384 | 768 = 384): string {
  return `/assets/ranks/medals/${Key}-${Px}.webp`;
}

function RankLabel(Key: string): string {
  if (Key === 'SEALED') return 'A rank not reached yet';
  const [Family, Numeral] = Key.split('_');
  const Name = Family.charAt(0) + Family.slice(1).toLowerCase();
  return Numeral ? `${Name} ${Numeral} (division ${NAMES[Numeral] ?? Numeral})` : Name;
}

const SIZE_CLASSES = {
  sm: 'w-16 h-16',
  md: 'w-28 h-28 md:w-36 md:h-36',
  lg: 'w-36 h-36 md:w-48 md:h-48',
  xl: 'w-56 h-56 md:w-72 md:h-72',
};
// What the browser should assume when choosing from srcset.
const SIZES_ATTR = {
  sm: '64px',
  md: '(min-width: 768px) 144px, 112px',
  lg: '(min-width: 768px) 192px, 144px',
  xl: '(min-width: 768px) 288px, 224px',
};

export function RankBadge({ tier, globalRank, className, size = 'md', fluid, sealed, eager, sweep }: RankBadgeProps) {
  const Key = sealed ? 'SEALED' : RankMedalKey(tier);
  const Family = Key.split('_')[0];

  return (
    <div
      className={cn('se-rank relative group flex items-center justify-center shrink-0', sealed && 'se-rank-sealed', !fluid && SIZE_CLASSES[size], className)}
      data-rank-medal={Key}
      data-rank-family={Family}
      style={fluid ? { width: fluid, height: fluid } : undefined}
    >
      <img
        src={RankMedalSrc(Key, 384)}
        srcSet={`${RankMedalSrc(Key, 192)} 192w, ${RankMedalSrc(Key, 384)} 384w, ${RankMedalSrc(Key, 768)} 768w`}
        sizes={fluid ? '(min-width: 768px) 180px, 150px' : SIZES_ATTR[size]}
        alt={RankLabel(Key)}
        width={768}
        height={768}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="se-rank-img block w-full h-full select-none"
      />
      {/* the sweep is drawn through the medallion's own outline, so only the metal catches it */}
      {sweep && !sealed ? (
        <span aria-hidden="true" className="se-rank-sweep" style={{ WebkitMaskImage: `url(${RankMedalSrc(Key, 384)})`, maskImage: `url(${RankMedalSrc(Key, 384)})` }} />
      ) : null}

      {/* Global Rank Ribbon (if applicable) */}
      {globalRank && globalRank <= 100 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
          className="absolute -bottom-4 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 text-white text-xs font-black px-4 py-1.5 rounded-sm shadow-[0_0_20px_rgba(225,29,72,0.8)] border border-rose-300 z-30"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        >
          #{globalRank} GLOBAL
        </motion.div>
      )}
    </div>
  );
}
