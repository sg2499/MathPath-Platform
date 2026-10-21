'use client';

// 2026-10-19 (rank revamp, Part 2). The rank cut scene: the student's own
// medallion is forged in front of them (public/cutscenes/rank.html, the same
// 3D model as the dashboard stills), then the title, the XP and the next
// division land below it, with Continue and See Roadmap.
//
// The scene runs in an iframe, so a scene that cannot start can never take
// the page around it down (the old overlay fetched its lighting from
// raw.githack.com and turned the page into "500 An unexpected error
// occurred" whenever that failed). If the device has no WebGL2, the scene
// reports an error, or it takes too long to arrive, the student sees the
// still medallion with the same title, XP and buttons instead.
//
// Callers: the practice sheet, mock and assessment result pages (a
// promotion) and the rank roadmap (a replay of a rank already reached).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RankStepFor } from '@/lib/rankTiers';
import { RankMedalKey, RankMedalSrc } from './RankBadge';
import { SupportsWebGl2 } from '@/components/competition/PodiumCutscenePlayer';

interface RankCinematicOverlayProps {
  tier: string;
  onComplete: () => void;
  /** promo: the student has just been promoted. replay: tapped on the roadmap. */
  mode?: 'promo' | 'replay';
  /** For a replay: the student's own rank, or a rank family already completed. */
  state?: 'current' | 'passed';
  /** The student's XP. Read from the economy when not given. */
  xp?: number | null;
  /** See Roadmap. Absent: from a result page, open the dashboard roadmap; hide it on the roadmap itself. */
  onRoadmap?: (() => void) | null;
}

// Bump to make browsers fetch a new scene after a change.
const SCENE_VERSION = '2026-10-21-s2';
const LOAD_TIMEOUT_MS = 12000;
const FADE_MS = 300;

// 2026-10-20 (live fixes): fetch the scene's files ahead of time (into the
// browser cache) when a scene is likely -- the roadmap opens, a promotion is
// on its way -- so the click itself waits only for the scene to be built.
const SCENE_FILES = [
  'scene.js', 'medallion.js', 'signature.js',
].map((F) => `/cutscenes/rank/${F}?v=${SCENE_VERSION}`).concat([
  'vendor/three.module.min.js', 'vendor/three.core.min.js',
  'vendor/postprocessing/EffectComposer.js', 'vendor/postprocessing/RenderPass.js', 'vendor/postprocessing/UnrealBloomPass.js', 'vendor/postprocessing/OutputPass.js',
  'vendor/postprocessing/Pass.js', 'vendor/postprocessing/ShaderPass.js', 'vendor/postprocessing/MaskPass.js',
  'vendor/shaders/CopyShader.js', 'vendor/shaders/LuminosityHighPassShader.js', 'vendor/shaders/OutputShader.js',
].map((F) => `/cutscenes/rank/${F}`));
const Prefetched = new Set<string>();
export function PrefetchRankScene(Tier: string, Mode: 'promo' | 'replay' = 'replay') {
  if (typeof document === 'undefined') return;
  const Family = RankMedalKey(Tier).split('_')[0];
  const Files = [...SCENE_FILES, `/cutscenes/rank/audio/${Family}-${Mode}.mp3?v=${SCENE_VERSION}`];
  for (const Href of Files) {
    if (Prefetched.has(Href)) continue;
    Prefetched.add(Href);
    const Link = document.createElement('link');
    Link.rel = 'prefetch';
    Link.href = Href;
    document.head.appendChild(Link);
  }
}

const NAMES: Record<string, string> = { COPPER: 'Copper', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond', CHAMPION: 'Champion' };
const GLOW: Record<string, string> = { COPPER: '#ff8a3d', BRONZE: '#ffb547', SILVER: '#7fd6ff', GOLD: '#ffd34d', PLATINUM: '#b77bff', EMERALD: '#38e09b', DIAMOND: '#9fe3ff', CHAMPION: '#ff2e55' };

function TierLabel(Tier: string): string {
  const [Family, Numeral] = String(Tier || '').toUpperCase().split('_');
  return Numeral ? `${NAMES[Family] ?? Family} ${Numeral}` : (NAMES[Family] ?? Family);
}

type Phase = 'loading' | 'playing' | 'fallback';

export function RankCinematicOverlay({ tier, onComplete, mode = 'promo', state = 'current', xp, onRoadmap }: RankCinematicOverlayProps) {
  const router = useRouter();
  const [Mounted, SetMounted] = useState(false);
  const [PhaseState, SetPhase] = useState<Phase>('loading');
  const FrameRef = useRef<HTMLIFrameElement | null>(null);
  const DoneRef = useRef(false);

  useEffect(() => {
    SetMounted(true);
    if (!SupportsWebGl2()) SetPhase('fallback');
  }, []);

  // The student's XP: given by the caller, or read from the economy (fresh,
  // so a promotion shows the XP that earned it).
  const NeedsXp = (xp === undefined || xp === null) && state !== 'passed';
  const Economy = useQuery({
    queryKey: ['student-economy'],
    queryFn: async () => (await api.get('/student/economy')).data,
    enabled: NeedsXp,
    staleTime: 0,
  });
  const Xp: number | null = typeof xp === 'number' ? xp : NeedsXp ? (Economy.data?.currentXp ?? null) : null;
  const Waiting = NeedsXp && Economy.isLoading;

  const Key = RankMedalKey(tier);
  const Family = Key.split('_')[0];
  const Step = RankStepFor(Key);
  const ShowRoadmap = onRoadmap !== null && !(mode === 'replay' && onRoadmap === undefined);

  const Done = useCallback(() => {
    if (DoneRef.current) return;
    DoneRef.current = true;
    onComplete();
  }, [onComplete]);
  const Roadmap = useCallback(() => {
    if (DoneRef.current) return;
    DoneRef.current = true;
    if (onRoadmap) onRoadmap();
    else router.push('/student/dashboard?roadmap=1');
    onComplete();
  }, [onComplete, onRoadmap, router]);

  const Source = useMemo(() => {
    const Q = new URLSearchParams({ tier: Key, mode, state, v: SCENE_VERSION });
    if (Xp !== null) Q.set('xp', String(Xp));
    Q.set('start', String(Step.start));
    if (Step.next) { Q.set('next', Step.next); Q.set('nextXp', String(Step.nextXp)); }
    if (!ShowRoadmap) Q.set('roadmap', '0');
    return `/cutscenes/rank.html?${Q.toString()}`;
  }, [Key, mode, state, Xp, Step, ShowRoadmap]);

  // Messages from this scene only.
  useEffect(() => {
    const OnMessage = (Event: MessageEvent) => {
      if (!FrameRef.current || Event.source !== FrameRef.current.contentWindow) return;
      const Kind = Event?.data?.type;
      if (Kind === 'mathpath-cutscene-ready') SetPhase((Current) => (Current === 'loading' ? 'playing' : Current));
      else if (Kind === 'mathpath-cutscene-error') SetPhase('fallback');
      else if (Kind === 'mathpath-rank-continue' || Kind === 'mathpath-cutscene-ended') Done();
      else if (Kind === 'mathpath-rank-roadmap') Roadmap();
    };
    window.addEventListener('message', OnMessage);
    return () => window.removeEventListener('message', OnMessage);
  }, [Done, Roadmap]);

  // Too slow to arrive: show the still medallion rather than a long dark wait.
  useEffect(() => {
    if (PhaseState !== 'loading' || Waiting) return;
    const Timer = window.setTimeout(() => SetPhase((Current) => (Current === 'loading' ? 'fallback' : Current)), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(Timer);
  }, [PhaseState, Waiting]);

  // Escape always closes, even before the scene has focus.
  useEffect(() => {
    const OnKey = (Event: KeyboardEvent) => { if (Event.key === 'Escape') { Event.preventDefault(); Done(); } };
    window.addEventListener('keydown', OnKey);
    return () => window.removeEventListener('keydown', OnKey);
  }, [Done]);

  // The scene takes keyboard focus once it plays (Enter / Space / Escape work
  // inside it), and starts only once it is fully faded in, so the student sees
  // it from the first ember.
  useEffect(() => {
    if (PhaseState !== 'playing') return;
    FrameRef.current?.focus();
    const Timer = window.setTimeout(() => {
      try { FrameRef.current?.contentWindow?.postMessage({ type: 'mathpath-rank-start' }, window.location.origin); } catch { /* the scene starts itself */ }
    }, FADE_MS + 30);
    return () => window.clearTimeout(Timer);
  }, [PhaseState]);

  // its files, as early as possible
  useEffect(() => { PrefetchRankScene(tier, mode); }, [tier, mode]);

  // The scene covers the whole screen, so the page behind it is hidden while it
  // is open: the device then spends nothing redrawing a page nobody can see
  // (on a weak graphics chip that work was slowing the scene's own build).
  useEffect(() => {
    if (!Mounted) return;
    const Root = document.documentElement;
    Root.setAttribute('data-rank-scene', 'open');
    return () => Root.removeAttribute('data-rank-scene');
  }, [Mounted]);

  if (!Mounted) return null;

  const Glow = GLOW[Family] ?? '#ffb547';
  const Numeral = Key.split('_')[1] ?? '';
  const DivisionDone = state === 'passed' && Numeral !== '' && Numeral !== 'I';
  const Eyebrow = mode === 'promo' ? 'New Rank Reached' : state === 'passed' ? (DivisionDone ? 'Division Completed' : 'Rank Completed') : 'Your Rank';
  const Line = Family === 'CHAMPION' ? 'The highest rank' : DivisionDone ? `Division ${Numeral} complete` : Numeral && state !== 'passed' ? `Division ${Numeral}` : 'All divisions complete';

  return createPortal(
    <div className="se-rank-scene fixed inset-0 z-[999999] bg-black" role="dialog" aria-modal="true" aria-label={`${TierLabel(Key)} rank`}>
      {PhaseState !== 'fallback' && !Waiting ? (
        <iframe
          ref={FrameRef}
          src={Source}
          title={`${TierLabel(Key)} rank`}
          className="h-full w-full border-0 transition-opacity duration-300"
          style={{ opacity: PhaseState === 'playing' ? 1 : 0 }}
          allow="autoplay"
        />
      ) : null}

      {PhaseState === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
          <div className="se-rank-spinner h-14 w-14 rounded-full border-4 border-white/10" style={{ borderTopColor: Glow }} />
          <span className="sr-only">Loading your rank</span>
        </div>
      ) : null}

      {PhaseState === 'fallback' ? (
        <div className="se-rankfall absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center" style={{ ['--rank-glow' as string]: Glow }}>
          <img src={RankMedalSrc(Key, 768)} alt="" className="se-rankfall-medal" width={768} height={768} />
          <p className="se-rankfall-eyebrow">{Eyebrow}</p>
          <h2 className="se-rankfall-title">{NAMES[Family] ?? Family}</h2>
          <p className="se-rankfall-line">{Line}</p>
          {Xp !== null && state !== 'passed' ? (
            <p className="se-rankfall-xp">
              <b>{Xp.toLocaleString('en-IN')} XP</b>
              {Step.next && Step.nextXp !== null ? ` · ${Math.max(0, Step.nextXp - Xp).toLocaleString('en-IN')} XP to ${TierLabel(Step.next)}` : ' · The top of MathPath'}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={Done} className="se-rankfall-continue" autoFocus>Continue</button>
            {ShowRoadmap ? <button type="button" onClick={Roadmap} className="se-rankfall-roadmap">See Roadmap</button> : null}
          </div>
        </div>
      ) : null}

      {PhaseState === 'loading' ? (
        <button type="button" onClick={Done} className="absolute right-5 top-5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white">
          Skip
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
