"use client";

// 2026-10-12 (Shailesh: "in some of the student accounts the leaderboard
// podium cut scenes ... were not appearing at all"). One player for every
// podium scene (DPS and Mock leaderboards), built so a student always sees
// something:
//
// - The scenes are WebGL2 pages. On a device or browser without WebGL2 (or
//   with graphics acceleration off) they used to stop on a black screen. The
//   player checks first, and each scene now also reports a failed start
//   ("mathpath-cutscene-error"); either way the student gets the built-in
//   fallback scene below instead.
// - The scene files are large (1-5 MB). A loading screen shows until the
//   scene is ready, and if it still isn't after 15 seconds (very slow
//   connection) the fallback plays. PreloadPodiumScenes() fetches the three
//   podium scenes while the leaderboard is open, so a tap usually plays at
//   once.
// - Skip / Escape / Enter / Space always close it, in every state.
import { RisingParticles } from "@/components/common/RisingParticles";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "loading" | "playing" | "fallback";

const LOAD_TIMEOUT_MS = 15000;

const RANK_STYLE: Record<1 | 2 | 3, { label: string; ink: string; glow: string; ring: string; speck: string }> = {
  1: { label: "1st", ink: "#fde68a", glow: "rgba(251,191,36,0.55)", ring: "#f59e0b", speck: "bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]" },
  2: { label: "2nd", ink: "#e2e8f0", glow: "rgba(148,163,184,0.5)", ring: "#94a3b8", speck: "bg-slate-200 shadow-[0_0_10px_rgba(226,232,240,0.9)]" },
  3: { label: "3rd", ink: "#fed7aa", glow: "rgba(234,88,12,0.5)", ring: "#ea580c", speck: "bg-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.9)]" },
};

let WebGl2Support: boolean | null = null;
export function SupportsWebGl2(): boolean {
  if (WebGl2Support !== null) return WebGl2Support;
  try {
    const Canvas = document.createElement("canvas");
    const Context = Canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null;
    WebGl2Support = Boolean(Context);
    Context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    WebGl2Support = false;
  }
  return WebGl2Support;
}

// Warm the browser's cache with the exact scene addresses the podium will
// open (the student's name is part of the address, so it must match).
const Preloaded = new Set<string>();
export function PreloadPodiumScenes(Sources: string[]) {
  if (typeof window === "undefined" || !SupportsWebGl2()) return;
  const Connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (Connection?.saveData) return;
  const Pending = Sources.filter((Source) => Source && !Preloaded.has(Source));
  if (!Pending.length) return;
  const Start = () =>
    Pending.forEach((Source) => {
      Preloaded.add(Source);
      fetch(Source, { credentials: "same-origin" }).catch(() => Preloaded.delete(Source));
    });
  const IdleWindow = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (IdleWindow.requestIdleCallback) IdleWindow.requestIdleCallback(Start, { timeout: 3000 });
  else window.setTimeout(Start, 1200);
}

export function PodiumCutscenePlayer({
  Source,
  Rank,
  StudentName,
  Subtitle,
  Title,
  OnDismiss,
}: {
  Source: string;
  Rank: 1 | 2 | 3;
  StudentName: string;
  // e.g. "Overall Journey" or "IM-L4"
  Subtitle: string;
  // accessible name of the scene
  Title: string;
  OnDismiss: () => void;
}) {
  const [PhaseState, SetPhase] = useState<Phase>(() => (typeof window !== "undefined" && !SupportsWebGl2() ? "fallback" : "loading"));
  const FrameRef = useRef<HTMLIFrameElement | null>(null);
  const DismissedRef = useRef(false);

  const Dismiss = useCallback(() => {
    if (DismissedRef.current) return;
    DismissedRef.current = true;
    OnDismiss();
  }, [OnDismiss]);

  // Messages from this scene only (never another frame on the page).
  useEffect(() => {
    const HandleMessage = (Event: MessageEvent) => {
      if (FrameRef.current && Event.source !== FrameRef.current.contentWindow) return;
      const Kind = Event?.data?.type;
      if (Kind === "mathpath-cutscene-ended") Dismiss();
      else if (Kind === "mathpath-cutscene-error") SetPhase("fallback");
      else if (Kind === "mathpath-cutscene-ready") SetPhase((Current) => (Current === "loading" ? "playing" : Current));
    };
    window.addEventListener("message", HandleMessage);
    return () => window.removeEventListener("message", HandleMessage);
  }, [Dismiss]);

  // Too slow to arrive: play the fallback rather than a long dark wait.
  useEffect(() => {
    if (PhaseState !== "loading") return;
    const Timer = window.setTimeout(() => SetPhase((Current) => (Current === "loading" ? "fallback" : Current)), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(Timer);
  }, [PhaseState]);

  // Keyboard skip when focus is on this page rather than inside the scene.
  useEffect(() => {
    const HandleKeyDown = (Event: KeyboardEvent) => {
      if (Event.key === "Escape" || Event.key === "Enter" || Event.key === " ") {
        Event.preventDefault();
        Dismiss();
      }
    };
    window.addEventListener("keydown", HandleKeyDown);
    return () => window.removeEventListener("keydown", HandleKeyDown);
  }, [Dismiss]);

  const Style = RANK_STYLE[Rank];

  return (
    <div className="fixed inset-0 z-[100] bg-black" role="dialog" aria-modal="true" aria-label={Title}>
      {PhaseState !== "fallback" ? (
        <iframe
          ref={FrameRef}
          src={Source}
          title={Title}
          className="h-full w-full border-0 transition-opacity duration-500"
          style={{ opacity: PhaseState === "playing" ? 1 : 0 }}
          allow="autoplay"
          onLoad={() => SetPhase((Current) => (Current === "loading" ? "playing" : Current))}
        />
      ) : null}

      {PhaseState === "loading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center" aria-live="polite">
          <div
            className="h-16 w-16 animate-spin rounded-full border-4 border-white/10"
            style={{ borderTopColor: Style.ring, animationDuration: "900ms" }}
          />
          <p className="text-sm font-black uppercase tracking-[0.3em]" style={{ color: Style.ink }}>
            Loading Your Moment
          </p>
        </div>
      ) : null}

      {PhaseState === "fallback" ? <FallbackScene Rank={Rank} StudentName={StudentName} Subtitle={Subtitle} /> : null}

      {PhaseState !== "playing" ? (
        <button
          type="button"
          onClick={Dismiss}
          className="absolute bottom-6 right-5 z-10 rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-white/20 md:bottom-10 md:right-10"
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}

// The podium moment without WebGL: the rank crest, the name and a shower of
// sparks, drawn with CSS so it plays on any device.
function FallbackScene({ Rank, StudentName, Subtitle }: { Rank: 1 | 2 | 3; StudentName: string; Subtitle: string }) {
  const Style = RANK_STYLE[Rank];
  return (
    <div
      className="mp-podium-fallback absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{ background: `radial-gradient(60% 55% at 50% 45%, ${Style.glow}, transparent 70%), radial-gradient(120% 100% at 50% 100%, #0b1020, #02040a)` }}
    >
      <RisingParticles count={46} seed={Rank * 17} className={Style.speck} />
      <div className="mp-podium-rays" aria-hidden="true" style={{ ["--mp-ray" as string]: Style.glow }} />
      <div className="mp-podium-crest relative z-10" style={{ ["--mp-ink" as string]: Style.ink, ["--mp-ring" as string]: Style.ring }}>
        <span className="mp-podium-crest-num">{Rank}</span>
      </div>
      <p className="mp-podium-label relative z-10 mt-8 text-xs font-black uppercase tracking-[0.5em] md:text-sm" style={{ color: Style.ink }}>
        {Style.label} Place · {Subtitle}
      </p>
      <h2 className="mp-podium-name relative z-10 mt-3 max-w-[22ch] text-[clamp(2.2rem,8vw,5.5rem)] font-black leading-[0.95] tracking-tight text-white [text-wrap:balance]">
        {StudentName}
      </h2>
      <div className="mp-podium-sweep" aria-hidden="true" />
    </div>
  );
}
