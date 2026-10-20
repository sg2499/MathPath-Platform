'use client';

// 2026-10-20 (rank revamp, Part 4): "How Ranks Work", in plain words. The
// numbers here are the economy's own: the rank ladder (lib/rankTiers, kept
// equal to the server's), and the XP formula in backend economy_service
// (5 XP a minute of the work's allotted time; assessments x1.3, mock exams
// x1.5; the accuracy bands; the speed and on-time bonuses). Change them
// there and here together.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { RANK_TIERS } from '@/lib/rankTiers';

interface RankGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FAMILIES = [
  { key: 'COPPER', name: 'Copper', color: '#e07a3f' }, { key: 'BRONZE', name: 'Bronze', color: '#d29a3c' }, { key: 'SILVER', name: 'Silver', color: '#a9c6e0' }, { key: 'GOLD', name: 'Gold', color: '#f4c542' },
  { key: 'PLATINUM', name: 'Platinum', color: '#b77bff' }, { key: 'EMERALD', name: 'Emerald', color: '#2fcf8c' }, { key: 'DIAMOND', name: 'Diamond', color: '#9fe3ff' }, { key: 'CHAMPION', name: 'Champion', color: '#ff2e55' },
];
const fmt = (N: number) => N.toLocaleString('en-IN');
const ROWS = FAMILIES.map((F) => {
  const Steps = RANK_TIERS.filter((R) => R.tier.split('_')[0] === F.key);
  return { ...F, from: Steps[0].xp, divisions: Steps.length };
});

const ACCURACY = [
  { band: 'Below 50%', pays: 'Half' },
  { band: '50% to 74%', pays: 'The full amount' },
  { band: '75% to 89%', pays: '1.5 times' },
  { band: '90% to 99%', pays: 'Double' },
  { band: '100%', pays: '2.5 times' },
];

export function RankGuideModal({ isOpen, onClose }: RankGuideModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const OnKey = (Event: KeyboardEvent) => { if (Event.key === 'Escape') { Event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', OnKey, true);
    return () => window.removeEventListener('keydown', OnKey, true);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 md:p-8 pointer-events-auto" role="dialog" aria-modal="true" aria-label="How ranks work">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="se-ladder se-guide relative w-full max-w-3xl max-h-[92vh] rounded-[1.75rem] overflow-hidden flex flex-col z-10"
          >
            <div className="se-ladder-head shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-7 md:pb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="se-ladder-eyebrow">Rank Roadmap</p>
                <h2 className="se-ladder-title">How Ranks Work</h2>
              </div>
              <button type="button" onClick={onClose} className="se-ladder-close shrink-0" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 md:px-8 md:py-6 se-guide-body">
              <section>
                <h3>Eight Ranks, 34 Steps</h3>
                <p>
                  Everyone starts at Copper V. As you earn XP you climb through eight ranks, from Copper to Champion.
                  Copper to Emerald each have five divisions, from V up to I. Diamond has three, III to I. Champion is the top.
                </p>
                <div className="se-guide-table" role="table" aria-label="Where each rank starts">
                  {ROWS.map((Row) => (
                    <div key={Row.key} role="row" className="se-guide-row">
                      <span role="cell" className="se-guide-dot" style={{ background: Row.color }} aria-hidden="true" />
                      <span role="cell" className="se-guide-name whitespace-nowrap">{Row.name}</span>
                      <span role="cell" className="se-guide-div whitespace-nowrap">{Row.divisions === 1 ? 'The top rank' : `${Row.divisions} divisions`}</span>
                      <span role="cell" className="se-guide-xp whitespace-nowrap tabular-nums">From {fmt(Row.from)} XP</span>
                    </div>
                  ))}
                </div>
                <p className="se-guide-note">The medallions of ranks you have not reached yet stay sealed until you get there.</p>
              </section>

              <section>
                <h3>How You Earn XP</h3>
                <p>
                  Every practice sheet, assessment and mock exam you finish earns XP. A 20-minute practice sheet is worth 100 XP before
                  bonuses, and longer work is worth more. Minute for minute, an assessment pays 1.3 times as much as a practice sheet,
                  and a mock exam 1.5 times.
                </p>
                <p>Your accuracy matters most:</p>
                <div className="se-guide-bands" role="table" aria-label="What accuracy pays">
                  {ACCURACY.map((A) => (
                    <div key={A.band} role="row" className="se-guide-band">
                      <span role="cell" className="whitespace-nowrap">{A.band}</span>
                      <b role="cell" className="whitespace-nowrap">{A.pays}</b>
                    </div>
                  ))}
                </div>
                <ul>
                  <li>Finish in half the time and you get 15% more. In three quarters of the time, 8% more. Using all the time never costs you anything.</li>
                  <li>Finish a practice sheet on the day it opens and you get 20% more.</li>
                </ul>
              </section>

              <section>
                <h3>Moving Up</h3>
                <ul>
                  <li>The moment your XP reaches the next mark, you move up. Your new medallion is forged in front of you, and you get a notification you can open to watch it again.</li>
                  <li>XP is never taken away, so you never drop a rank.</li>
                  <li>On the roadmap, tap any medallion you have reached to watch its scene again.</li>
                </ul>
              </section>
            </div>

            <div className="se-ladder-foot shrink-0 px-5 py-3 md:px-8 md:py-4 flex justify-end">
              <button type="button" onClick={onClose} className="se-ladder-back whitespace-nowrap">Got It</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
