"use client";

// The slide a student sees as they reach each section of a level assessment
// (2026-10-11, Shailesh: "section slides on starting, like the annual
// competition"). Same look as the Annual Competition's own section screen
// (components/competition/AnnualSectionBriefing.tsx), with one difference
// that matters: an assessment has ONE timer for the whole paper, and it keeps
// running while this slide is up. So the slide never holds the student for
// long: it moves on by itself after a short countdown, and Start Section
// moves on at once. It is shown the first time a section is reached; going
// back to an earlier section shows no slide.

import { useEffect, useRef, useState } from "react";
import { Award, CheckCircle2, ClipboardCheck, Hash, ListChecks, Play, Timer } from "lucide-react";
import type { AssessmentSection } from "@/lib/api/student";

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function FormatClock(Seconds: number): string {
  const Total = Math.max(0, Math.floor(Seconds || 0));
  const Hours = Math.floor(Total / 3600);
  const Minutes = Math.floor((Total % 3600) / 60);
  const Rest = Total % 60;
  const Pad = (Value: number) => String(Value).padStart(2, "0");
  return Hours > 0 ? `${Hours}:${Pad(Minutes)}:${Pad(Rest)}` : `${Pad(Minutes)}:${Pad(Rest)}`;
}

function MarksLabel(Value: number): string {
  return Value === 1 ? "1 Mark Each" : `${Value} Marks Each`;
}

export function AssessmentSectionBriefing({
  Title,
  Upcoming,
  Previous,
  PreviousAnswered,
  TotalSections,
  RemainingSeconds,
  CountdownSeconds = 10,
  OnStart,
}: {
  // The assessment's own title, e.g. "PM-L3 Level Assessment".
  Title: string;
  Upcoming: AssessmentSection;
  // The section the student has just come from; null at the start of the paper.
  Previous: AssessmentSection | null;
  // How many of Previous's questions are answered.
  PreviousAnswered: number;
  TotalSections: number;
  // The whole assessment's time left. It does not stop for this slide.
  RemainingSeconds: number;
  CountdownSeconds?: number;
  OnStart: () => void;
}) {
  const Total = Math.max(1, Math.round(CountdownSeconds));
  const [MsLeft, SetMsLeft] = useState(Total * 1000);
  const OnStartRef = useRef(OnStart);
  OnStartRef.current = OnStart;
  const FiredRef = useRef(false);

  useEffect(() => {
    SetMsLeft(Total * 1000);
    FiredRef.current = false;
  }, [Upcoming.sectionNumber, Total]);

  useEffect(() => {
    let Last = performance.now();
    const Interval = window.setInterval(() => {
      const Now = performance.now();
      const Elapsed = Now - Last;
      Last = Now;
      SetMsLeft((Value) => Math.max(0, Value - Math.min(Elapsed, 500)));
    }, 200);
    return () => window.clearInterval(Interval);
  }, [Upcoming.sectionNumber]);

  useEffect(() => {
    if (MsLeft > 0 || FiredRef.current) return;
    FiredRef.current = true;
    OnStartRef.current();
  }, [MsLeft]);

  // Enter starts the section, the same key that moves between questions.
  useEffect(() => {
    function HandleKey(Event: KeyboardEvent) {
      if (Event.key !== "Enter" || Event.repeat) return;
      Event.preventDefault();
      if (FiredRef.current) return;
      FiredRef.current = true;
      OnStartRef.current();
    }
    window.addEventListener("keydown", HandleKey);
    return () => window.removeEventListener("keydown", HandleKey);
  }, []);

  const SecondsLeft = Math.ceil(MsLeft / 1000);
  const Fraction = Math.max(0, Math.min(1, MsLeft / (Total * 1000)));
  const UpcomingTitle = Upcoming.title || `Section ${Upcoming.sectionNumber}`;
  const Range =
    Upcoming.firstQuestionNumber === Upcoming.lastQuestionNumber
      ? `Question ${Upcoming.firstQuestionNumber}`
      : `Questions ${Upcoming.firstQuestionNumber} To ${Upcoming.lastQuestionNumber}`;

  return (
    <section className="se-test-card math-slide-up math-card mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7" aria-live="polite">
      <div className="math-block-header">
        <ClipboardCheck size={14} /> {Title}
      </div>

      {Previous ? (
        <div className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
          <span className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">
              Section {Previous.sectionNumber}
              {Previous.title ? `: ${Previous.title}` : ""}
            </p>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {PreviousAnswered} of {Previous.questionCount} answered. You can come back to it before you submit.
            </p>
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
            <p className="se-chip se-chip-accent inline-flex items-center gap-1.5">
              <ListChecks size={15} /> {Upcoming.questionCount} {Upcoming.questionCount === 1 ? "Question" : "Questions"}
            </p>
            <p className="se-chip inline-flex items-center gap-1.5">
              <Award size={15} /> {MarksLabel(Upcoming.marksPerQuestion)}
            </p>
            <p className="se-chip inline-flex items-center gap-1.5">
              <Hash size={15} /> {Range}
            </p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <Timer size={16} className="shrink-0" />
          <span>
            Assessment time left <span className="font-black tabular-nums text-slate-900 dark:text-white">{FormatClock(RemainingSeconds)}</span>. The timer keeps running.
          </span>
        </p>
        <button
          type="button"
          autoFocus
          className="math-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-base"
          onClick={() => {
            if (FiredRef.current) return;
            FiredRef.current = true;
            OnStart();
          }}
        >
          <Play size={18} /> Start Section
        </button>
      </div>
    </section>
  );
}
