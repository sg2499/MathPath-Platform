"use client";

import { Award, Sparkles, Target } from "lucide-react";
import type { ReactNode } from "react";

export type PerformanceBand = "NEEDS_PRACTICE" | "GOOD_PROGRESS" | "EXCELLENT" | "PENDING";

type FeedbackTone = "success" | "warning" | "danger";

const BELOW_MESSAGES = [
  "This attempt shows exactly where more practice will help. Take it calmly, review your mistakes, and focus on the next practice sheet.",
  "You completed the work, and that matters. Now review the tricky sums calmly, strengthen the weak areas, and try again with confidence.",
  "This score is below the benchmark, but every mistake gives useful direction. Practice calmly, review carefully, and come back stronger.",
  "You are still building this skill. Review the incorrect answers patiently and strengthen the concept before the next attempt.",
  "More practice will help improve accuracy. Focus on the questions that went wrong and keep progressing one step at a time.",
];

const GOOD_MESSAGES = [
  "Good progress. You crossed the benchmark and can now focus on reducing small mistakes to move closer to the Excellence Zone.",
  "You are on track. Keep practicing carefully, improve speed with accuracy, and aim for 90% or higher next time.",
  "You met the benchmark. Now strengthen consistency and push your performance toward the next level.",
  "Solid effort. Your foundation is improving, and focused revision can help you reach stronger accuracy.",
  "You are doing well. Keep revising tricky sums and continue building confidence through steady practice.",
];

const EXCELLENT_MESSAGES = [
  "Excellent work. You reached the 90%+ Excellence Zone with strong focus, accuracy, and learning discipline.",
  "Fantastic performance. Keep this momentum and continue challenging yourself with calm, accurate practice.",
  "Great job. You are showing strong control of the concept and consistent mathematical confidence.",
  "Wonderful accuracy. Continue practicing regularly so this strong performance becomes a reliable habit.",
  "Outstanding effort. You are performing in the high-confidence zone and are ready to keep moving forward.",
];

const NEXT_STEPS: Record<Exclude<PerformanceBand, "PENDING">, string> = {
  NEEDS_PRACTICE: "Review your mistakes calmly and wait for your teacher to guide the next practice step.",
  GOOD_PROGRESS: "Review the missed questions and keep your practice rhythm steady.",
  EXCELLENT: "Celebrate the progress, then revise the tricky questions once more.",
};

function stableIndex(seed: string, size: number) {
  if (!size) return 0;
  let Hash = 0;
  for (let Index = 0; Index < seed.length; Index += 1) {
    Hash = (Hash * 31 + seed.charCodeAt(Index)) >>> 0;
  }
  return Hash % size;
}

export function performanceBand(accuracy: number | string | null | undefined): PerformanceBand {
  if (accuracy === null || accuracy === undefined || Number.isNaN(Number(accuracy))) return "PENDING";
  if (Number(accuracy) < 75) return "NEEDS_PRACTICE";
  if (Number(accuracy) < 90) return "GOOD_PROGRESS";
  return "EXCELLENT";
}

export function dynamicPerformanceMessage({
  accuracy,
  seed,
  previousAccuracy,
  attemptNumber = 0,
}: {
  accuracy?: number | null;
  seed: string;
  previousAccuracy?: number | null;
  attemptNumber?: number | null;
}) {
  const Band = performanceBand(accuracy);
  const CurrentAccuracy = Number(accuracy ?? 0);
  const PriorAccuracy = previousAccuracy === null || previousAccuracy === undefined ? null : Number(previousAccuracy);
  const IsRetry = Number(attemptNumber || 0) > 0;

  if (Band === "NEEDS_PRACTICE" && IsRetry && PriorAccuracy !== null && !Number.isNaN(PriorAccuracy)) {
    if (CurrentAccuracy > PriorAccuracy) {
      return `Your accuracy has improved from ${PriorAccuracy}% to ${CurrentAccuracy}%. The benchmark is still ahead, but this is progress. Review the remaining mistakes carefully and continue with calm focus.`;
    }
    if (CurrentAccuracy < PriorAccuracy) {
      return `This attempt is lower than your previous score of ${PriorAccuracy}%. Pause, revisit the concept steps, and focus on accuracy before speed in the next practice.`;
    }
    return `Your accuracy is steady at ${CurrentAccuracy}%. The benchmark has not been reached yet, so review the repeated mistake pattern before continuing.`;
  }

  if (Band === "NEEDS_PRACTICE") return BELOW_MESSAGES[stableIndex(seed, BELOW_MESSAGES.length)];
  if (Band === "GOOD_PROGRESS") return GOOD_MESSAGES[stableIndex(seed, GOOD_MESSAGES.length)];
  if (Band === "EXCELLENT") return EXCELLENT_MESSAGES[stableIndex(seed, EXCELLENT_MESSAGES.length)];
  return "Your performance feedback will appear after submission.";
}

function feedbackToneClasses(Tone: FeedbackTone) {
  if (Tone === "danger") {
    return {
      Card: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-950 shadow-amber-100/70 dark:border-amber-300/30 dark:from-amber-950/45 dark:via-slate-950 dark:to-orange-950/40 dark:text-amber-50 dark:shadow-black/20",
      Icon: "bg-amber-100 text-amber-700 dark:bg-amber-300/15 dark:text-amber-100",
      Kicker: "text-amber-700/80 dark:text-amber-200",
      Title: "text-amber-950 dark:text-amber-50",
      Message: "text-slate-800 dark:text-amber-50",
      Step: "text-amber-950 dark:text-amber-100",
    };
  }

  if (Tone === "warning") {
    return {
      Card: "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-blue-950 shadow-blue-100/70 dark:border-blue-300/30 dark:from-blue-950/45 dark:via-slate-950 dark:to-indigo-950/40 dark:text-blue-50 dark:shadow-black/20",
      Icon: "bg-blue-100 text-blue-700 dark:bg-blue-300/15 dark:text-blue-100",
      Kicker: "text-blue-700/80 dark:text-blue-200",
      Title: "text-blue-950 dark:text-blue-50",
      Message: "text-slate-800 dark:text-blue-50",
      Step: "text-blue-950 dark:text-blue-100",
    };
  }

  return {
    Card: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 text-emerald-950 shadow-emerald-100/70 dark:border-emerald-300/30 dark:from-emerald-950/45 dark:via-slate-950 dark:to-cyan-950/40 dark:text-emerald-50 dark:shadow-black/20",
    Icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-100",
    Kicker: "text-emerald-700/80 dark:text-emerald-200",
    Title: "text-emerald-950 dark:text-emerald-50",
    Message: "text-slate-800 dark:text-emerald-50",
    Step: "text-emerald-950 dark:text-emerald-100",
  };
}

export function PremiumResultFeedbackCard({
  Kicker,
  Title,
  Message,
  NextStep,
  Icon,
  Tone,
  ShowNextStep = true,
}: {
  Kicker: string;
  Title: string;
  Message: string;
  NextStep: string;
  Icon: ReactNode;
  Tone: FeedbackTone;
  ShowNextStep?: boolean;
}) {
  const Classes = feedbackToneClasses(Tone);

  return (
    <section className={`relative overflow-hidden rounded-[28px] border px-5 py-4 shadow-xl sm:px-6 ${Classes.Card}`}>
      <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-white/70 blur-2xl" />
      <div className="relative z-10 flex min-w-0 items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${Classes.Icon}`}>{Icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${Classes.Kicker}`}>{Kicker}</p>
          <h2 className={`mt-0.5 text-xl font-black leading-tight sm:text-2xl ${Classes.Title}`}>{Title}</h2>
          <div className="mt-2 space-y-1.5 text-sm font-bold leading-6 sm:text-[15px]">
            <p className={`${Classes.Message}`}>{Message}</p>
            {ShowNextStep ? (
              <p className={`${Classes.Step}`}>
                <span className="font-black">Next Step:</span> {NextStep}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StudentPerformanceFeedback({
  accuracy,
  seed,
  previousAccuracy,
  attemptNumber = 0,
  showNeedsPracticeNextStep = true,
}: {
  accuracy?: number | null;
  seed: string;
  previousAccuracy?: number | null;
  attemptNumber?: number | null;
  showNeedsPracticeNextStep?: boolean;
}) {
  const Band = performanceBand(accuracy);
  if (Band === "PENDING") return null;

  const Tone: FeedbackTone =
    Band === "NEEDS_PRACTICE"
      ? "danger"
      : Band === "GOOD_PROGRESS"
        ? "warning"
        : "success";

  const Title =
    Band === "NEEDS_PRACTICE"
      ? "Keep Going — You’re Learning!"
      : Band === "GOOD_PROGRESS"
        ? "Great Progress!"
        : "Brilliant Work!";

  const Kicker =
    Band === "NEEDS_PRACTICE"
      ? "Focused Practice Needed"
      : Band === "GOOD_PROGRESS"
        ? "Benchmark Met"
        : "90%+ Performance";

  const Icon = Band === "NEEDS_PRACTICE" ? <Target size={22} strokeWidth={2.4} /> : Band === "GOOD_PROGRESS" ? <Sparkles size={22} strokeWidth={2.4} /> : <Award size={22} strokeWidth={2.4} />;

  return (
    <PremiumResultFeedbackCard
      Kicker={Kicker}
      Title={Title}
      Message={dynamicPerformanceMessage({ accuracy, seed, previousAccuracy, attemptNumber })}
      NextStep={NEXT_STEPS[Band]}
      Icon={Icon}
      Tone={Tone}
      ShowNextStep={Band !== "NEEDS_PRACTICE" || showNeedsPracticeNextStep}
    />
  );
}
