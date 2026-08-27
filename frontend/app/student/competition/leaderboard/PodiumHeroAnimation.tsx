"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface PodiumHeroAnimationProps {
  rank: 1 | 2 | 3 | null;
  viewMode?: 'CUMULATIVE' | 'INDIVIDUAL';
  student?: any;
  onComplete: () => void;
}

// ============================================================================
// PODIUM CUTSCENES -- full swap-in of the built cutscenes (2026-08-27)
// ============================================================================
// Each cutscene is a fully self-contained page -- its own WebGL2 crest
// rendering, its own matched/pre-trimmed audio, its own Skip button and
// Escape/Enter/Space/S handling, its own letterbox/vignette chrome -- built
// and reviewed as a standalone artifact, then patched for embedding rather
// than reimplemented in React, so nothing about the tested experience
// drifts on the way in. It's served as a static asset and mounted here via
// iframe.
//
// The real student's name is passed in through a `name` query param (the
// file reads it at boot and falls back to a demo name if it's missing or
// blank). `idleAtMs` is each scene's own designed "settled" timestamp (from
// its internal beat timeline, e.g. `B.idle` in the source) plus a ~2.5s
// buffer -- used as the auto-dismiss fallback if the viewer never hits
// Skip. Each scene has a different natural length, so this is per-rank/tab,
// not one shared constant.
const PODIUM_CUTSCENE: Record<
  'CUMULATIVE' | 'INDIVIDUAL',
  Record<1 | 2 | 3, { src: string; idleAtMs: number }>
> = {
  CUMULATIVE: {
    1: { src: '/cutscenes/overall-journey-rank1.html', idleAtMs: (15.6 + 2.5) * 1000 },
    2: { src: '/cutscenes/overall-journey-rank2.html', idleAtMs: (14.2 + 2.5) * 1000 },
    3: { src: '/cutscenes/overall-journey-rank3.html', idleAtMs: (12.6 + 2.5) * 1000 },
  },
  INDIVIDUAL: {
    1: { src: '/cutscenes/specific-exam-rank1.html', idleAtMs: (9.2 + 2.5) * 1000 },
    2: { src: '/cutscenes/specific-exam-rank2.html', idleAtMs: (8.1 + 2.5) * 1000 },
    3: { src: '/cutscenes/specific-exam-rank3.html', idleAtMs: (6.7 + 2.5) * 1000 },
  },
};

export function PodiumHeroAnimation({ rank, viewMode = 'CUMULATIVE', student, onComplete }: PodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Idempotency guard: the cutscene iframe's own Skip/Escape/Enter/Space
  // handling, the parent-level keydown fallback below, and the settle
  // timeout can all race to call dismiss() for the same podium moment.
  // Without this, a late arrival (e.g. a postMessage that was already
  // in-flight when the timeout also fired) would call onComplete() a
  // second time for the same rank.
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

  // Reset for a new hero moment, arm the settle-timeout fallback.
  useEffect(() => {
    if (rank === null) return;
    dismissedRef.current = false;
    setDismissed(false);
    const cutscene = PODIUM_CUTSCENE[viewMode]?.[rank];
    const timer = window.setTimeout(dismiss, cutscene?.idleAtMs ?? 15000);
    return () => window.clearTimeout(timer);
  }, [rank, viewMode, dismiss]);

  // The cutscene iframe posts this the instant its own Skip button or
  // Escape/Enter/Space/S fires -- dismiss immediately rather than waiting
  // for the settle-timeout above.
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
  // rather than inside the cutscene iframe (e.g. the iframe hasn't finished
  // loading yet, or the viewer never clicked into it). The iframe has its
  // own identical key handling for when focus IS inside it.
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

  const cutscene = PODIUM_CUTSCENE[viewMode]?.[rank];
  if (!cutscene) return null;

  const studentName = typeof student?.name === 'string' ? student.name.trim() : '';
  const src = `${cutscene.src}?name=${encodeURIComponent(studentName || 'Champion')}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Remounts on every new rank/tab so a second hero moment always gets
          a fresh iframe -- its own fresh audio/render/timeline state -- rather
          than reusing a stale one. */}
      <iframe
        key={`${viewMode}-${rank}`}
        src={src}
        title="Podium cutscene"
        className="h-full w-full border-0"
        allow="autoplay"
      />
    </div>
  );
}
