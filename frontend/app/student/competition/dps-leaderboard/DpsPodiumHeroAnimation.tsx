"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface DpsPodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'OVERALL' | 'SPECIFIC';
  student?: any;
  levelCode?: string | null;
  onComplete: () => void;
}

// ============================================================================
// DPS PODIUM CUTSCENES
// ============================================================================
// Same embedding convention as the mock-exam leaderboard's own
// PodiumHeroAnimation.tsx (../leaderboard/PodiumHeroAnimation.tsx) -- each
// cutscene is a fully self-contained page (its own WebGL2 crest rendering,
// its own matched/pre-trimmed audio, its own Skip button and
// Escape/Enter/Space/S handling, its own letterbox/vignette chrome), served
// as a static asset and mounted here via iframe rather than reimplemented
// in React, so nothing about the tested experience drifts on the way in.
//
// There is deliberately NO auto-dismiss timer -- each cutscene settles into
// a held "idle" state on its own and stays there (looping audio, gentle
// ambient motion) until the viewer explicitly skips. See the mock-exam
// version's header comment for the full rationale; identical behavior here.
//
// The real student's name is passed via `name`; for the Specific Level tab
// the selected level's code (e.g. "IM-L4") is also passed via `level` so
// the cutscene's title-sub line shows the student's actual curriculum
// level ("IM-L4 · Rank 1") instead of a generic label.
const DPS_PODIUM_CUTSCENE: Record<
  'OVERALL' | 'SPECIFIC',
  Record<1 | 2 | 3, { src: string }>
> = {
  OVERALL: {
    1: { src: '/cutscenes/dps-overall-rank1.html' },
    2: { src: '/cutscenes/dps-overall-rank2.html' },
    3: { src: '/cutscenes/dps-overall-rank3.html' },
  },
  SPECIFIC: {
    1: { src: '/cutscenes/dps-specific-rank1.html' },
    2: { src: '/cutscenes/dps-specific-rank2.html' },
    3: { src: '/cutscenes/dps-specific-rank3.html' },
  },
};

export function DpsPodiumHeroAnimation({ rank, viewMode = 'OVERALL', student, levelCode, onComplete }: DpsPodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Idempotency guard: the cutscene iframe's own Skip/Escape/Enter/Space
  // handling (via postMessage) and the parent-level keydown fallback below
  // can both race to call dismiss() for the same podium moment.
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setDismissed(true);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset for a new hero moment. No auto-dismiss timer is armed here.
  useEffect(() => {
    if (rank === null) return;
    dismissedRef.current = false;
    setDismissed(false);
  }, [rank]);

  // The cutscene iframe posts this the instant its own Skip button or
  // Escape/Enter/Space/S fires -- this is the primary dismiss path.
  useEffect(() => {
    if (rank === null) return;
    const handleMessage = (event: MessageEvent) => {
      if (event?.data?.type === 'mathpath-cutscene-ended') {
        dismiss();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [rank, dismiss]);

  // Fallback skip path for when keyboard focus is on the parent document
  // rather than inside the cutscene iframe.
  useEffect(() => {
    if (rank === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rank, dismiss]);

  if (!mounted || dismissed || rank === null) return null;

  const cutscene = DPS_PODIUM_CUTSCENE[viewMode]?.[rank];
  if (!cutscene) return null;

  const studentName = typeof student?.name === 'string' ? student.name.trim() : '';
  const params = new URLSearchParams();
  params.set('name', studentName || 'Champion');
  if (viewMode === 'SPECIFIC' && levelCode) {
    params.set('level', levelCode);
  }
  const src = `${cutscene.src}?${params.toString()}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Remounts on every new rank/tab so a second hero moment always gets
          a fresh iframe -- its own fresh audio/render/timeline state --
          rather than reusing a stale one. */}
      <iframe
        key={`${viewMode}-${rank}`}
        src={src}
        title="DPS podium cutscene"
        className="h-full w-full border-0"
        allow="autoplay"
      />
    </div>
  );
}
