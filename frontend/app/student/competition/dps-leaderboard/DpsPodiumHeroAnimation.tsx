"use client";

import React, { useEffect, useState } from 'react';
import { PodiumCutscenePlayer } from '@/components/competition/PodiumCutscenePlayer';

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

// The scene address for a podium place (name, and level on the Specific tab).
export function DpsPodiumSceneSource(viewMode: 'OVERALL' | 'SPECIFIC', rank: 1 | 2 | 3, student?: any, levelCode?: string | null): string | null {
  const cutscene = DPS_PODIUM_CUTSCENE[viewMode]?.[rank];
  if (!cutscene) return null;
  const studentName = typeof student?.name === 'string' ? student.name.trim() : '';
  const params = new URLSearchParams();
  params.set('v', '3');
  params.set('name', studentName || 'Champion');
  if (viewMode === 'SPECIFIC' && levelCode) params.set('level', levelCode);
  return `${cutscene.src}?${params.toString()}`;
}

// 2026-10-12: played through the shared PodiumCutscenePlayer (device check,
// loading screen, non-3D fallback instead of a black screen).
export function DpsPodiumHeroAnimation({ rank, viewMode = 'OVERALL', student, levelCode, onComplete }: DpsPodiumHeroAnimationProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || rank === null) return null;
  const src = DpsPodiumSceneSource(viewMode, rank, student, levelCode);
  if (!src) return null;
  const studentName = typeof student?.name === 'string' && student.name.trim() ? student.name.trim() : 'Champion';
  return (
    <PodiumCutscenePlayer
      key={`${viewMode}-${rank}`}
      Source={src}
      Rank={rank}
      StudentName={studentName}
      Subtitle={viewMode === 'SPECIFIC' && levelCode ? levelCode : 'Overall Journey'}
      Title="DPS podium cutscene"
      OnDismiss={onComplete}
    />
  );
}
