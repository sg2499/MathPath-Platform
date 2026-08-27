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
// blank).
//
// There is deliberately NO auto-dismiss timer here. Each cutscene settles
// into a held "idle" state on its own (gentle camera drift, looping audio)
// once its internal beat timeline reaches its designed settle point, and
// it stays there indefinitely -- the soundtrack keeps looping and the
// completed crest with the student's name stays on screen. The ONLY way
// out is the viewer explicitly skipping: the cutscene's own Skip button /
// Escape/Enter/Space/S handling (which posts 'mathpath-cutscene-ended'),
// or the parent-level keydown fallback below. Cutting this short on a
// timer was the previous behavior and is exactly what we removed -- it
// abruptly kicked the student back to the leaderboard mid-soundtrack.
const PODIUM_CUTSCENE: Record<
  'CUMULATIVE' | 'INDIVIDUAL',
  Record<1 | 2 | 3, { src: string }>
> = {
  CUMULATIVE: {
    1: { src: '/cutscenes/overall-journey-rank1.html' },
    2: { src: '/cutscenes/overall-journey-rank2.html' },
    3: { src: '/cutscenes/overall-journey-rank3.html' },
  },
  INDIVIDUAL: {
    1: { src: '/cutscenes/specific-exam-rank1.html' },
    2: { src: '/cutscenes/specific-exam-rank2.html' },
    3: { src: '/cutscenes/specific-exam-rank3.html' },
  },
};

export function PodiumHeroAnimation({ rank, viewMode = 'CUMULATIVE', student, onComplete }: PodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Idempotency guard: the cutscene iframe's own Skip/Escape/Enter/Space
  // handling (via postMessage) and the parent-level keydown fallback below
  // can both race to call dismiss() for the same podium moment -- e.g. the
  // viewer presses Escape while focus is on the parent document at the
  // same instant the iframe's own key handler also fires. Without this,
  // that would call onComplete() twice for the same rank.
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

  // Reset for a new hero moment. No auto-dismiss timer is armed here --
  // the cutscene stays open (looping soundtrack, held idle crest) until
  // the viewer explicitly skips.
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
