"use client";

// The screen a student sees before each section of an Annual Competition
// paper, official or practice (2026-10-07, Shailesh):
//
//   "when a student submits one section or the section gets auto submitted
//    when the timer runs out, the next section pops up and starts without
//    any intimation ... each section has a method involved be it abacus or
//    visual ... show a slide or a screen when the student starts the paper
//    showing the first section name and the method and when they go on
//    submitting each section then the next screen should show the section
//    they submitted and the one coming up"
//
// While this is on screen the section has NOT started: the server holds its
// clock and has not sent its questions (see "The screen before each
// section" in backend/app/services/annual_competition_attempt_service.py).
// It ends when the student presses Start Section or the countdown runs out,
// whichever comes first; either way the page then asks the server to begin
// the section, and the clock runs from that moment.

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Calculator, CheckCircle2, Eye, ListChecks, Play, Shapes, Timer, Trophy } from "lucide-react";
import type { AnnualCompetitionSectionState } from "@/lib/api/student";

// "ABACUS" / "VISUAL" arrive in capitals; shown in Init Caps.
function FormatMode(Mode: string | null | undefined): string {
  const Text = String(Mode || "").trim();
  if (!Text) return "";
  return Text === Text.toUpperCase() ? Text.charAt(0) + Text.slice(1).toLowerCase() : Text;
}

function ModeIcon({ Mode, Size }: { Mode: string | null | undefined; Size: number }) {
  const Upper = String(Mode || "").toUpperCase();
  if (Upper === "ABACUS") return <Calculator size={Size} />;
  if (Upper === "VISUAL") return <Eye size={Size} />;
  return <Shapes size={Size} />;
}

// 300 -> "5 Minutes", 60 -> "1 Minute", 90 -> "1 Min 30 Sec", 45 -> "45 Seconds".
export function FormatSectionDuration(Seconds: number): string {
  const Total = Math.max(0, Math.round(Seconds || 0));
  const Minutes = Math.floor(Total / 60);
  const Rest = Total % 60;
  if (Minutes === 0) return `${Rest} Seconds`;
  if (Rest === 0) return Minutes === 1 ? "1 Minute" : `${Minutes} Minutes`;
  return `${Minutes} Min ${Rest} Sec`;
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function AnnualSectionBriefing({
  IsPractice,
  Upcoming,
  Previous,
  TotalSections,
  CountdownSeconds,
  CanStart,
  IsStarting,
  ErrorMessage,
  OnStart,
}: {
  IsPractice: boolean;
  // The section about to start.
  Upcoming: AnnualCompetitionSectionState;
  // The section just finished; null at the very start of the paper.
  Previous: AnnualCompetitionSectionState | null;
  TotalSections: number;
  CountdownSeconds: number;
  // False until the page holds the attempt's session token; the countdown
  // waits for it, so it can never run out with nothing to start.
  CanStart: boolean;
  IsStarting: boolean;
  // Set when starting the section failed even after the page's own retries.
  ErrorMessage: string | null;
  OnStart: () => void;
}) {
  const Total = Math.max(1, Math.round(CountdownSeconds || 15));
  const [MsLeft, SetMsLeft] = useState(Total * 1000);
  const OnStartRef = useRef(OnStart);
  OnStartRef.current = OnStart;
  const FiredRef = useRef(false);

  // A fresh countdown for each section.
  useEffect(() => {
    SetMsLeft(Total * 1000);
    FiredRef.current = false;
  }, [Upcoming.sectionNumber, Total]);

  // Counts only while the screen can actually be seen and the section can
  // actually be started: a child who has switched to another tab, or whose
  // start just failed, is not started behind their back.
  const Counting = CanStart && !IsStarting && !ErrorMessage;
  useEffect(() => {
    if (!Counting) return;
    let Last = performance.now();
    const Interval = window.setInterval(() => {
      const Now = performance.now();
      const Elapsed = Now - Last;
      Last = Now;
      if (document.hidden) return;
      // A long gap means the tab was asleep, not that time was spent
      // looking at this screen: count at most one tick of it.
      SetMsLeft((Value) => Math.max(0, Value - Math.min(Elapsed, 500)));
    }, 200);
    return () => window.clearInterval(Interval);
  }, [Counting]);

  useEffect(() => {
    if (MsLeft > 0 || !Counting || FiredRef.current) return;
    FiredRef.current = true;
    OnStartRef.current();
  }, [MsLeft, Counting]);

  const SecondsLeft = Math.ceil(MsLeft / 1000);
  const Fraction = Math.max(0, Math.min(1, MsLeft / (Total * 1000)));
  const UpcomingTitle = Upcoming.sectionTitle || `Section ${Upcoming.sectionNumber}`;
  const PreviousTimedOut = Previous?.status === "AUTO_SUBMITTED";

  return (
    <section className="se-test-card math-slide-up math-card mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7" aria-live="polite">
      <div className="math-block-header">
        <Trophy size={14} /> {IsPractice ? "Annual Competition Practice" : "Annual Competition"}
      </div>

      {Previous ? (
        <div className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
          <span className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300">
            {PreviousTimedOut ? <AlarmClock size={20} /> : <CheckCircle2 size={20} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">
              {PreviousTimedOut ? `Time Is Up. Section ${Previous.sectionNumber} Submitted` : `Section ${Previous.sectionNumber} Submitted`}
            </p>
            {Previous.sectionTitle ? (
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{Previous.sectionTitle}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-[color:var(--mp-role-primary)]">{Previous ? "Up Next" : "First Section"}</p>
          <p className="mt-1 text-base font-black text-slate-500 dark:text-slate-300">
            Section {Upcoming.sectionNumber} Of {TotalSections}
          </p>
          <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl" style={{ textWrap: "balance" }}>
            {UpcomingTitle}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {Upcoming.mode ? (
              <p className="se-chip se-chip-accent inline-flex items-center gap-1.5">
                <ModeIcon Mode={Upcoming.mode} Size={15} /> Method: {FormatMode(Upcoming.mode)}
              </p>
            ) : null}
            <p className="se-chip inline-flex items-center gap-1.5">
              <Timer size={15} /> {FormatSectionDuration(Upcoming.timeLimitSeconds)}
            </p>
            {Upcoming.questionCount ? (
              <p className="se-chip inline-flex items-center gap-1.5">
                <ListChecks size={15} /> {Upcoming.questionCount} Questions
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5 self-center">
          <p className="whitespace-nowrap text-sm font-black text-slate-600 dark:text-slate-300">Starts In</p>
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700" />
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                stroke="var(--mp-role-primary)"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH * (1 - Fraction)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black tabular-nums leading-none text-slate-950 dark:text-white">{SecondsLeft}</span>
              <span className="mt-1 text-xs font-black text-slate-500 dark:text-slate-300">{SecondsLeft === 1 ? "Second" : "Seconds"}</span>
            </div>
          </div>
        </div>
      </div>

      {ErrorMessage ? (
        <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200" role="alert">
          This section could not be started. Check your connection and press Start Section again. Your timer has not started.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Your timer starts when the section starts.
        </p>
        <button
          type="button"
          autoFocus
          className="math-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-base"
          onClick={OnStart}
          disabled={!CanStart || IsStarting}
        >
          <Play size={18} /> {IsStarting ? "Starting..." : "Start Section"}
        </button>
      </div>
    </section>
  );
}
