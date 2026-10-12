"use client";

import React, { useEffect, useState } from 'react';
import { PodiumCutscenePlayer } from '@/components/competition/PodiumCutscenePlayer';

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

// The scene address for a podium place (the student's name is part of it).
export function PodiumSceneSource(viewMode: 'CUMULATIVE' | 'INDIVIDUAL', rank: 1 | 2 | 3, student?: any): string | null {
  const cutscene = PODIUM_CUTSCENE[viewMode]?.[rank];
  if (!cutscene) return null;
  const studentName = typeof student?.name === 'string' ? student.name.trim() : '';
  return `${cutscene.src}?v=3&name=${encodeURIComponent(studentName || 'Champion')}`;
}

// 2026-10-12: played through the shared PodiumCutscenePlayer, which checks
// the device can run the 3D scene, shows a loading screen, and falls back to
// a non-3D podium scene instead of a black screen (see that file).
export function PodiumHeroAnimation({ rank, viewMode = 'CUMULATIVE', student, onComplete }: PodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || rank === null) return null;
  const src = PodiumSceneSource(viewMode, rank, student);
  if (!src) return null;
  const studentName = typeof student?.name === 'string' && student.name.trim() ? student.name.trim() : 'Champion';
  return (
    <PodiumCutscenePlayer
      key={`${viewMode}-${rank}`}
      Source={src}
      Rank={rank}
      StudentName={studentName}
      Subtitle={viewMode === 'CUMULATIVE' ? 'Overall Journey' : 'Specific Exam'}
      Title="Podium cutscene"
      OnDismiss={onComplete}
    />
  );
}
