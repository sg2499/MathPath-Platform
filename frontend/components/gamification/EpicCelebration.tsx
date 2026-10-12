"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerBlaze, triggerSurge, triggerCrystal, triggerMythic, resetParticles } from "@/lib/utils/particles";
import { SupportsWebGl2 } from "@/components/competition/PodiumCutscenePlayer";
import { getStoredUser } from "@/lib/auth";

interface EpicCelebrationProps {
  accuracy: number;
  onComplete: () => void;
  allowSkip?: boolean;
}

const Tiers = [
  {
    min: 96,
    max: 100,
    id: "APEX",
    text: "Apex Flawless",
    shadowColor: "rgba(251,191,36,0.8)",
    extrusionColor: "#b45309",
    trigger: triggerMythic,
    duration: 6500,
  },
  {
    min: 91,
    max: 95,
    id: "IMMORTAL",
    text: "Immortal",
    shadowColor: "rgba(168,85,247,0.8)",
    extrusionColor: "#581c87",
    trigger: triggerCrystal,
    duration: 5000,
  },
  {
    min: 86,
    max: 90,
    id: "ASCENDANT",
    text: "Ascendant",
    shadowColor: "rgba(56,189,248,0.8)",
    extrusionColor: "#0369a1",
    trigger: triggerSurge,
    duration: 4500,
  },
  {
    min: 80,
    max: 85,
    id: "DOMINATING",
    text: "Dominating",
    shadowColor: "rgba(239,68,68,0.8)",
    extrusionColor: "#991b1b",
    trigger: triggerBlaze,
    duration: 4500,
  },
];

// --- TEXT RENDERERS ---

// Base text styles for extreme readability
// Phones: the size follows the screen width AND the length of the title
// (se-cel-title in student-elevate.css reads --cel-chars, set on the main
// container below), so every title fills the width of the phone on one line
// and never breaks in the middle of a word. The clamp here is only the
// fallback if that stylesheet is ever absent.
const TextBaseClass = "se-cel-title text-[clamp(1.75rem,10vw,3.75rem)] md:text-8xl lg:text-9xl font-black italic tracking-tighter uppercase text-white select-none relative z-20";
const TextStrokeStyle = { WebkitTextStroke: "2px rgba(0,0,0,0.5)" };

// Generates the 3D block extrusion
const generate3DShadow = (color: string) => {
  return Array.from({ length: 12 })
    .map((_, i) => `-${i + 1}px ${i + 1}px 0px ${color}`)
    .join(", ");
};

// 1. APEX FLAWLESS: Shattered Convergence
function ConvergeText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");

  return (
    <motion.div
      initial={{ scale: 1.1 }}
      animate={{ scale: [1.1, 0.98, 1] }}
      // The final screen shake when they snap. 2026-10: this was a spring, but a
      // spring can only run between two values and this has three (1.1 -> 0.98
      // -> 1), which made the animation library raise an error the moment a
      // 96-100% celebration started. A short eased tween plays all three.
      transition={{ delay: 1.8, duration: 0.4, ease: "easeOut", times: [0, 0.6, 1] }}
      className="flex flex-row flex-nowrap justify-center whitespace-nowrap p-4 sm:p-8"
      style={{ textShadow: generate3DShadow(extrusionColor) }}
    >
      {letters.map((char, i) => {
        // Random starting positions far off screen
        const startX = (Math.random() - 0.5) * 1000;
        const startY = (Math.random() - 0.5) * 1000;
        const startRotate = (Math.random() - 0.5) * 180;

        return (
          <motion.span
            key={i}
            initial={{ x: startX, y: startY, rotate: startRotate, opacity: 0, scale: 3, filter: "blur(10px)" }}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{
              duration: 1.8,
              ease: "anticipate", // Pulls back slowly then snaps hard
            }}
            className={TextBaseClass}
            style={TextStrokeStyle}
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        );
      })}
    </motion.div>
  );
}

// 2. IMMORTAL: Void Materialization
function RiseText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");

  return (
    <div className="flex flex-row flex-nowrap whitespace-nowrap p-4 sm:p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      {letters.map((char, i) => (
        <motion.span
          key={i}
          initial={{ y: 150, opacity: 0, filter: "blur(20px)", scale: 0.8 }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
          transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
          className={TextBaseClass}
          style={TextStrokeStyle}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </div>
  );
}

// 3. ASCENDANT: Cybernetic Decrypt
function DecryptText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const [displayText, setDisplayText] = useState(text.replace(/./g, "█"));
  const [isDecrypted, setIsDecrypted] = useState(false);

  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+0123456789";
    let iterations = 0;

    const interval = setInterval(() => {
      setDisplayText((prev) =>
        prev.split("").map((letter, index) => {
          if (index < iterations / 2) return text[index];
          return text[index] === " " ? " " : chars[Math.floor(Math.random() * chars.length)];
        }).join("")
      );

      if (iterations >= text.length * 2) {
        clearInterval(interval);
        setIsDecrypted(true);
      }

      iterations++;
    }, 40); // Fast scrambling

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="relative p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      <motion.h1
        className={`${TextBaseClass} ${isDecrypted ? "" : "text-cyan-200 drop-shadow-[0_0_10px_#22d3ee]"}`}
        style={TextStrokeStyle}
      >
        {displayText}
      </motion.h1>

      {/* Glitch flash on successful decrypt */}
      {isDecrypted && (
        <>
           <motion.div
            animate={{ x: [-10, 10, -10, 0], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.2, repeat: 2 }}
            className={`absolute top-8 left-8 ${TextBaseClass} text-cyan-400 translate-x-3 mix-blend-screen pointer-events-none`}
          >
            {text}
          </motion.div>
          <motion.div
            animate={{ x: [10, -10, 10, 0], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.2, repeat: 2 }}
            className={`absolute top-8 left-8 ${TextBaseClass} text-fuchsia-500 -translate-x-3 mix-blend-screen pointer-events-none`}
          >
            {text}
          </motion.div>
        </>
      )}
    </div>
  );
}

// 4. DOMINATING: Meteor Stomp
function MeteorText({ text, extrusionColor }: { text: string; extrusionColor: string }) {
  const letters = text.split("");

  return (
    <div className="flex flex-row flex-nowrap whitespace-nowrap p-4 sm:p-8" style={{ textShadow: generate3DShadow(extrusionColor) }}>
      {letters.map((char, i) => (
        <motion.span
          key={i}
          initial={{ y: -300, opacity: 0, scale: 2 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{
            duration: 0.5,
            delay: i * 0.1,
            type: "spring",
            bounce: 0.5 // Heavy bounce when hitting the floor
          }}
          className={TextBaseClass}
          style={TextStrokeStyle}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </div>
  );
}


// --- CLASSIC CELEBRATION (fallback when the 3D scene cannot play) ---

function ClassicCelebration({ accuracy, onComplete, allowSkip }: EpicCelebrationProps) {
  const tier = Tiers.find((t) => accuracy >= t.min && accuracy <= t.max);

  useEffect(() => {
    if (!tier) return;
    tier.trigger();
    const timer = setTimeout(onComplete, tier.duration);
    return () => clearTimeout(timer);
  }, [tier, onComplete]);

  const handleSkip = React.useCallback(() => {
    resetParticles();
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!allowSkip) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowSkip, handleSkip]);

  if (!tier) return null;

  const isFlawless = tier.id === "APEX";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 1 } }}
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none overflow-hidden"
    >
      {/* Background Dimming */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md pointer-events-auto" />

      {/* Cinematic Letterboxing */}
      <motion.div
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        exit={{ y: "-100%", transition: { duration: 0.8, ease: "easeInOut" } }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute top-0 left-0 right-0 h-[15vh] bg-black z-0 pointer-events-none"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", transition: { duration: 0.8, ease: "easeInOut" } }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute bottom-0 left-0 right-0 h-[15vh] bg-black z-0 pointer-events-none"
      />

      {/* God Rays (Rotating Light Burst) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center opacity-40 z-0"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: isFlawless ? 25 : 12, ease: "linear" }}
      >
        <div
          className="w-[1000px] h-[1000px] rounded-full blur-[140px]"
          style={{ background: `radial-gradient(circle, ${tier.shadowColor} 0%, transparent 70%)` }}
        />
      </motion.div>

      {/* Main Container */}
      <div className="relative z-10 flex flex-col items-center" style={{ ["--cel-chars" as string]: tier.text.length } as React.CSSProperties}>
        {/* Pulsing Aura Drop Shadow */}
        <motion.div
          animate={{ filter: [`drop-shadow(0px 0px 30px ${tier.shadowColor})`, `drop-shadow(0px 0px 80px ${tier.shadowColor})`, `drop-shadow(0px 0px 30px ${tier.shadowColor})`] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="relative flex flex-col items-center"
        >
            {/* Render the specific Text Mechanic for this Tier */}
            {tier.id === "APEX" && <ConvergeText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "IMMORTAL" && <RiseText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "ASCENDANT" && <DecryptText text={tier.text} extrusionColor={tier.extrusionColor} />}
            {tier.id === "DOMINATING" && <MeteorText text={tier.text} extrusionColor={tier.extrusionColor} />}

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 2.2 }}
              className="text-white font-black tracking-[0.3em] mt-4 uppercase text-lg md:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            >
              {Math.round(accuracy)}% Accuracy
            </motion.p>
        </motion.div>
      </div>

      {/* Skip Button */}
      {allowSkip && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ delay: 1, duration: 0.5 }}
          onClick={handleSkip}
          className="absolute bottom-6 right-4 md:bottom-12 md:right-12 z-[10000] text-white font-bold text-sm md:text-lg tracking-widest uppercase pointer-events-auto flex items-center gap-2 md:gap-3 px-4 py-2.5 md:px-8 md:py-4 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-white/20 hover:border-white/60 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all"
        >
          Skip Celebration <span className="text-base md:text-xl">⏭</span>
        </motion.button>
      )}
    </motion.div>
  );
}

// --- MAIN CELEBRATION: the 3D accuracy-band scenes ---
//
// 2026-10-12 (Phase 2 scene revamp). A result of 80% or more plays one of
// the 12 scenes of its band (public/cutscenes/accuracy-<band>.html), each
// 6.6-8 s with its own wording and music, Skip always available inside the
// scene. A student sees every scene of a band once before any repeats
// (remembered per student on this device). If the device cannot run the
// scene (no WebGL2, a start error, or it takes over 12 s to load) the classic
// celebration above plays instead, so the result page always continues.

const ACCURACY_BANDS: { min: number; key: string; tier: string }[] = [
  { min: 96, key: "apex", tier: "APEX" },
  { min: 91, key: "immortal", tier: "IMMORTAL" },
  { min: 86, key: "ascendant", tier: "ASCENDANT" },
  { min: 80, key: "dominating", tier: "DOMINATING" },
];
const SCENES_PER_BAND = 12;
const SCENE_VERSION = "3";
const SCENE_LOAD_TIMEOUT_MS = 12000;
// Longest scene is 8 s; if the scene never reports its end, close anyway.
const SCENE_SAFETY_MS = 14000;

function NextSceneNumber(band: string): number {
  let who = "guest";
  try {
    const User = getStoredUser();
    who = User?.student?.studentCode || User?.id || "guest";
  } catch {
    // no stored user: rotate under "guest"
  }
  const Key = `mp-accuracy-scenes:${who}:${band}`;
  let Seen: number[] = [];
  try {
    const Raw = JSON.parse(localStorage.getItem(Key) || "[]");
    if (Array.isArray(Raw)) Seen = Raw.filter((N) => Number.isInteger(N) && N >= 1 && N <= SCENES_PER_BAND);
  } catch {
    Seen = [];
  }
  // All 12 seen: start a new round, but never open it with the scene just played.
  if (Seen.length >= SCENES_PER_BAND) Seen = Seen.slice(-1);
  const Options = Array.from({ length: SCENES_PER_BAND }, (_, I) => I + 1).filter((N) => !Seen.includes(N));
  const Pick = Options[Math.floor(Math.random() * Options.length)] || 1;
  try {
    localStorage.setItem(Key, JSON.stringify([...Seen, Pick]));
  } catch {
    // storage blocked: the pick is still random
  }
  return Pick;
}

type ScenePhase = "loading" | "playing" | "fallback";

export function EpicCelebration({ accuracy, onComplete, allowSkip }: EpicCelebrationProps) {
  const Rounded = Math.round(accuracy);
  const Band = ACCURACY_BANDS.find((B) => Rounded >= B.min && Rounded <= 100) || null;
  const [Source] = useState<string | null>(() =>
    Band ? `/cutscenes/accuracy-${Band.key}.html?v=${SCENE_VERSION}&scene=${NextSceneNumber(Band.key)}&acc=${Rounded}` : null,
  );
  const [Phase, SetPhase] = useState<ScenePhase>(() => (typeof window !== "undefined" && !SupportsWebGl2() ? "fallback" : "loading"));
  const FrameRef = useRef<HTMLIFrameElement | null>(null);
  const DoneRef = useRef(false);

  const Finish = useCallback(() => {
    if (DoneRef.current) return;
    DoneRef.current = true;
    onComplete();
  }, [onComplete]);

  // Below 80% there is nothing to celebrate: hand straight back.
  useEffect(() => {
    if (!Band) Finish();
  }, [Band, Finish]);

  // Messages from this scene only.
  useEffect(() => {
    const HandleMessage = (Event: MessageEvent) => {
      if (!FrameRef.current || Event.source !== FrameRef.current.contentWindow) return;
      const Kind = Event?.data?.type;
      if (Kind === "mathpath-cutscene-ended") Finish();
      else if (Kind === "mathpath-cutscene-error") SetPhase("fallback");
      else if (Kind === "mathpath-cutscene-ready") SetPhase((Current) => (Current === "loading" ? "playing" : Current));
    };
    window.addEventListener("message", HandleMessage);
    return () => window.removeEventListener("message", HandleMessage);
  }, [Finish]);

  useEffect(() => {
    if (Phase === "loading") {
      const Timer = window.setTimeout(() => SetPhase((Current) => (Current === "loading" ? "fallback" : Current)), SCENE_LOAD_TIMEOUT_MS);
      return () => window.clearTimeout(Timer);
    }
    if (Phase === "playing") {
      const Timer = window.setTimeout(Finish, SCENE_SAFETY_MS);
      return () => window.clearTimeout(Timer);
    }
    return undefined;
  }, [Phase, Finish]);

  // Keyboard skip when focus is on this page rather than inside the scene.
  useEffect(() => {
    if (Phase === "fallback") return;
    const HandleKeyDown = (Event: KeyboardEvent) => {
      if (Event.key === "Escape" || Event.key === "Enter" || Event.key === " ") {
        Event.preventDefault();
        Finish();
      }
    };
    window.addEventListener("keydown", HandleKeyDown);
    return () => window.removeEventListener("keydown", HandleKeyDown);
  }, [Phase, Finish]);

  if (!Band || !Source) return null;
  if (Phase === "fallback") return <ClassicCelebration accuracy={accuracy} onComplete={Finish} allowSkip={allowSkip} />;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      className="fixed inset-0 z-[9999] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`${Band.tier.charAt(0)}${Band.tier.slice(1).toLowerCase()} celebration, ${Rounded}% accuracy`}
    >
      <iframe
        ref={FrameRef}
        src={Source}
        title={`${Rounded}% accuracy celebration`}
        className="h-full w-full border-0 transition-opacity duration-500"
        style={{ opacity: Phase === "playing" ? 1 : 0 }}
        allow="autoplay"
        onLoad={() => SetPhase((Current) => (Current === "loading" ? "playing" : Current))}
      />
      {Phase === "loading" ? (
        <>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center" aria-live="polite">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-white/80" style={{ animationDuration: "900ms" }} />
            <p className="text-sm font-black uppercase tracking-[0.3em] text-white/85">Loading Your Moment</p>
          </div>
          <button
            type="button"
            onClick={Finish}
            className="absolute bottom-6 right-5 z-10 rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-white/20 md:bottom-10 md:right-10"
          >
            Skip
          </button>
        </>
      ) : null}
    </motion.div>
  );
}
