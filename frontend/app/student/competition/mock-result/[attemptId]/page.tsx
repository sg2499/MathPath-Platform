"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getCompetitionMockResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Flame,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins && secs) return `${mins} Mins ${secs} Secs`;
  if (mins) return `${mins} Mins`;
  return `${secs} Secs`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type CompetitionMessage = {
  title: string;
  badge: string;
  message: string;
  coachNote: string;
  focusAreas: string[];
  nextTarget: string;
  icon: "trophy" | "rocket" | "flame" | "sparkles";
};

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFrom<T>(pool: T[], seed: number, offset = 0): T {
  return pool[(seed + offset) % pool.length];
}

const competitionMessagePools = {
  champion: {
    titles: [
      "Champion Zone",
      "Elite Competition Control",
      "Top-Tier Finish",
      "Ceiling Chaser",
      "Mock Mastery Mode",
      "Podium-Level Attempt",
    ],
    messages: [
      "This is a powerful competition attempt. You showed control across the paper, and now the goal is to turn excellence into repeatable dominance.",
      "You are operating close to the ceiling. Keep sharpening speed, accuracy, and calm decision-making so this level becomes your normal standard.",
      "This score shows serious readiness. Your next step is not just getting marks; it is protecting every mark under time pressure.",
      "Outstanding work. You have built a strong competition base, and the next challenge is to reduce the few remaining avoidable slips.",
      "This attempt has the quality of a strong competitor. Keep training for consistency so your best performance is available on competition day.",
      "Excellent control. The target from here is precision under pressure: clean attempts, faster decisions, and no careless leakage.",
    ],
    notes: [
      "Train like you are defending a top rank.",
      "Your next gains will come from polishing the smallest errors.",
      "Use this result as your benchmark, not your limit.",
      "Now focus on consistency across multiple mocks.",
      "Push for accuracy that survives speed.",
      "Your ceiling is higher than this score. Keep climbing.",
    ],
    badge: "Champion Zone",
    icon: "trophy" as const,
  },
  strong: {
    titles: [
      "Strong Contender",
      "Competition Ready Push",
      "Sharp Progress",
      "Rank Builder",
      "Strong Base Formed",
      "Next-Level Chase",
    ],
    messages: [
      "This is a strong mock attempt. You have clear scoring strength, and the next jump will come from converting weaker sections into reliable marks.",
      "You are in a promising competition zone. A few cleaner decisions and stronger section control can quickly push this score higher.",
      "Good momentum. Your foundation is visible, and now the target is to remove the sections where marks are still slipping away.",
      "This attempt shows that you can compete. The next stage is to tighten accuracy and make your strong sections even faster.",
      "You handled a large part of the paper well. Focused practice on the low-scoring sections can move you into the next band.",
      "This is a solid performance with clear upside. Keep the strong areas steady and attack the sections that cost marks.",
    ],
    notes: [
      "You are close to a higher band. Push one section at a time.",
      "The next 10 percent will come from focused correction, not random practice.",
      "Strong competitors review mistakes quickly and train them immediately.",
      "Keep your speed, but protect accuracy first.",
      "Turn your weak areas into scoring opportunities.",
      "This is the stage where disciplined revision creates rank movement.",
    ],
    badge: "Strong Contender",
    icon: "rocket" as const,
  },
  momentum: {
    titles: [
      "Building Momentum",
      "Good Fight",
      "Growth Round",
      "Rising Competitor",
      "Training Gain",
      "Score Builder",
    ],
    messages: [
      "This attempt shows useful progress. You have scoring areas already, and the next goal is to make more sections dependable.",
      "You are building competition stamina. Keep reviewing mistakes section-wise and your score can climb quickly.",
      "There is a good base here. Now focus on reducing wrong answers and making your strong sections more automatic.",
      "This is a workable score with clear improvement routes. Target the weakest sections first and protect the marks you already know how to score.",
      "You are moving in the right direction. A structured review of this mock will help you turn effort into better competition results.",
      "The performance has promise. Your next mock should aim for cleaner accuracy and stronger section confidence.",
    ],
    notes: [
      "Momentum grows when every mistake becomes a practice target.",
      "Do not chase the full paper at once. Fix the highest-loss sections first.",
      "A few more correct answers can change the entire result band.",
      "Keep your review sharp and your next mock will feel different.",
      "Consistency is built section by section.",
      "This is the point where smart practice beats more practice.",
    ],
    badge: "Building Momentum",
    icon: "flame" as const,
  },
  practice: {
    titles: [
      "Practice Push",
      "Reset And Build",
      "Focus Round",
      "Comeback Setup",
      "Training Mode",
      "Foundation Builder",
    ],
    messages: [
      "This mock gives you a clear practice map. The result is not the finish line; it shows exactly where the next improvement should begin.",
      "You now know which sections need attention. Start with the weakest areas, build confidence, and come back stronger in the next mock.",
      "Every competitor has practice rounds like this. Use the result to plan your next steps instead of judging your ability.",
      "This attempt has valuable information. Fix the highest-loss sections first and your score can move up faster than you think.",
      "The path is clear: strengthen the basics, reduce avoidable errors, and rebuild speed after accuracy improves.",
      "This score is a starting point for a comeback. Review carefully, train the weak sections, and aim for a visible jump next time.",
    ],
    notes: [
      "One corrected section can change the next result.",
      "Focus beats pressure. Review first, then retry.",
      "Small improvements across sections create big score jumps.",
      "Your next mock should be about cleaner attempts, not rushing.",
      "Build accuracy first. Speed will follow.",
      "This result is feedback. Use it like a training plan.",
    ],
    badge: "Practice Push",
    icon: "sparkles" as const,
  },
  restart: {
    titles: [
      "Restart And Rise",
      "First Step Forward",
      "Bounce Back Round",
      "Fresh Start",
      "Growth Begins Here",
      "Fight Back Mode",
    ],
    messages: [
      "This mock is a starting signal, not a stop sign. Begin with the sections shown below and build your score one step at a time.",
      "The result shows where practice is needed most. Stay calm, review the paper, and use the next mock to prove your improvement.",
      "Competition preparation is built through repeated correction. This attempt gives you the exact sections to work on first.",
      "Do not let this score define you. Use it to choose your next practice targets and come back with stronger control.",
      "Every high performer has a rebuilding round. Start with the basics, reduce unanswered or rushed mistakes, and rise steadily.",
      "This is your reset point. The goal now is simple: understand the mistakes, train the weak sections, and improve the next score.",
    ],
    notes: [
      "Start small, but start immediately.",
      "Your next win is one section becoming stronger.",
      "Review calmly. Improvement begins with clarity.",
      "The next mock is a new chance to climb.",
      "Do not rush the comeback. Build it correctly.",
      "One focused practice session can change your next attempt.",
    ],
    badge: "Restart And Rise",
    icon: "sparkles" as const,
  },
};

function competitionBandKey(percentage: number) {
  if (percentage >= 90) return "champion";
  if (percentage >= 75) return "strong";
  if (percentage >= 60) return "momentum";
  if (percentage >= 40) return "practice";
  return "restart";
}

function buildCompetitionMessage(
  result: Awaited<ReturnType<typeof getCompetitionMockResult>>,
): CompetitionMessage {
  const percentage = Number(
    result.percentage ?? result.accuracyPercentage ?? 0,
  );
  const bandKey = competitionBandKey(percentage);
  const pool = competitionMessagePools[bandKey];
  const weaknesses = (result.conceptWeaknesses || [])
    .map((item) => item.concept)
    .filter(Boolean);
  const strengths = (result.conceptStrengths || [])
    .map((item) => item.concept)
    .filter(Boolean);
  const focusAreas =
    weaknesses.length > 0 ? weaknesses.slice(0, 3) : strengths.slice(0, 2);
  const seed = stableHash(
    [
      result.attemptId,
      result.mockExam?.mockCode,
      result.score,
      result.maxScore,
      result.percentage,
      result.correct,
      result.unanswered,
      result.timeTakenSeconds,
      focusAreas.join("|"),
    ].join("-"),
  );
  const nextBandTarget =
    percentage >= 90
      ? "Aim for 95%+ with zero careless errors."
      : percentage >= 75
        ? "Push into the 90% Champion Zone."
        : percentage >= 60
          ? "Target 75%+ by converting weak sections."
          : percentage >= 40
            ? "Push toward 60%+ with cleaner basics."
            : "Target your first strong jump with section-wise practice.";
  const unansweredNote =
    Number(result.unanswered || 0) > 0
      ? ` Also reduce unanswered questions; every attempted question is a chance to gain marks.`
      : "";
  const timeNote =
    Number(result.timeUtilizationPercentage || 0) > 85
      ? " Keep watching time pressure so accuracy does not drop near the end."
      : Number(result.timeUtilizationPercentage || 0) < 25
        ? " You finished quickly, so use review time to catch avoidable mistakes."
        : " Your time usage gives you room to balance speed with accuracy.";

  return {
    title: `${pickFrom(pool.titles, seed)} ${bandKey === "champion" ? "🏆" : bandKey === "strong" ? "🚀" : bandKey === "momentum" ? "🔥" : bandKey === "practice" ? "✨" : "🌱"}`,
    badge: pool.badge,
    message: `${pickFrom(pool.messages, seed, 3)}${unansweredNote}`,
    coachNote: `${pickFrom(pool.notes, seed, 7)}${timeNote}`,
    focusAreas:
      focusAreas.length > 0
        ? focusAreas
        : ["Review the question paper section by section"],
    nextTarget: nextBandTarget,
    icon: pool.icon,
  };
}

function sectionAnchorKey(
  sectionTitle?: string | null,
  sectionNumber?: number | string | null,
) {
  const base = sectionTitle || `Section ${sectionNumber || "unknown"}`;
  return `competition-section-${String(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

type ResultTab = "questions" | "analysis";

export default function StudentCompetitionMockResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;
  const [activeTab, setActiveTab] = useState<ResultTab>("questions");

  const query = useQuery({
    queryKey: ["student-competition-mock-result", attemptId],
    queryFn: () => getCompetitionMockResult(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Loading mock result..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Result">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  const result = query.data;
  if (!result) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Preparing result summary..." />
      </AppShell>
    );
  }

  const mock = result.mockExam || {};
  const questionReview = result.questionReview || [];
  const competitionMessage = buildCompetitionMessage(result);

  const jumpToSection = (sectionName: string) => {
    setActiveTab("questions");
    window.setTimeout(() => {
      const target = document.getElementById(sectionAnchorKey(sectionName));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  return (
    <AppShell title="Competition Mock Result">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button
            className="math-button-secondary mb-4 px-4 py-2 text-sm"
            onClick={() => router.push("/student/competition/mock-exams")}
          >
            Back To Mock Exams
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-kicker">Mock Result</p>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip
                  label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`}
                />
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                Submitted {formatDate(result.completedAt || result.submittedAt)}
                . Review your mock answers, correct solutions, and section
                performance below.
              </p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/70 px-6 py-4 text-center dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">
                Score
              </p>
              <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">
                {formatNumber(result.score)}/{formatNumber(result.maxScore)}
              </p>
              <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">
                {formatNumber(result.percentage)}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricCard
            icon={<Target size={18} />}
            label="ACCURACY"
            value={`${formatNumber(result.accuracyPercentage)}%`}
            helper="Attempted answers"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="CORRECT"
            value={result.correct}
            helper={`${result.totalQuestions} total questions`}
          />
          <MetricCard
            icon={<XCircle size={18} />}
            label="UNANSWERED"
            value={result.unanswered}
            helper="Scored as zero"
          />
          <MetricCard
            icon={<Clock3 size={18} />}
            label="TIME TAKEN"
            value={formatDuration(result.timeTakenSeconds)}
            helper={`${formatNumber(result.timeUtilizationPercentage)}% time used`}
          />
        </div>

        <CompetitionMessageBox
          message={competitionMessage}
          onSectionSelect={jumpToSection}
        />

        <div className="math-card p-2">
          <div className="flex flex-wrap gap-2">
            <ResultTabButton
              active={activeTab === "questions"}
              onClick={() => setActiveTab("questions")}
              label="Question Review"
            />
            <ResultTabButton
              active={activeTab === "analysis"}
              onClick={() => setActiveTab("analysis")}
              label="Result Analysis"
            />
          </div>
        </div>

        {activeTab === "questions" ? (
          <QuestionReviewTab questions={questionReview} />
        ) : null}
        {activeTab === "analysis" ? (
          <ResultAnalysisTab result={result} onSectionSelect={jumpToSection} />
        ) : null}
      </section>
    </AppShell>
  );
}

function CompetitionMessageBox({
  message,
  onSectionSelect,
}: {
  message: CompetitionMessage;
  onSectionSelect: (sectionName: string) => void;
}) {
  const Icon =
    message.icon === "trophy"
      ? Trophy
      : message.icon === "rocket"
        ? Rocket
        : message.icon === "flame"
          ? Flame
          : Sparkles;
  return (
    <article className="relative overflow-hidden rounded-[32px] border border-orange-200 bg-gradient-to-br from-white via-orange-50/70 to-amber-50/60 p-5 shadow-xl shadow-orange-100/60 dark:border-orange-800 dark:from-slate-950 dark:via-orange-950/20 dark:to-slate-900 dark:shadow-orange-950/20">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-orange-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-200 dark:shadow-orange-950/40">
            <Icon size={26} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="math-kicker">Competition Coach</p>
              <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                {message.badge}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {message.title}
            </h2>
            <p className="mt-3 max-w-5xl text-sm font-semibold leading-6 text-slate-800 dark:text-slate-200">
              {message.message}
            </p>
            <p className="mt-2 max-w-5xl text-sm font-bold leading-6 text-slate-700 dark:text-slate-300">
              {message.coachNote}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 lg:w-[360px]">
          <div className="rounded-[24px] border border-orange-200 bg-white/90 p-4 dark:border-orange-800 dark:bg-slate-950/70">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 dark:text-orange-200">
              Focus Next
            </p>
            <div className="mt-3 grid gap-2">
              {message.focusAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => onSectionSelect(area)}
                  className="rounded-[16px] border border-orange-100 bg-orange-50/70 px-3 py-2 text-left text-xs font-black text-slate-800 transition hover:border-orange-400 hover:bg-orange-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-orange-900 dark:bg-orange-950/30 dark:text-slate-100 dark:hover:border-orange-500 dark:hover:bg-orange-600 dark:hover:text-white"
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
              Next Target
            </p>
            <p className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
              {message.nextTarget}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function ResultTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-orange-200 transition dark:shadow-orange-950/30"
          : "inline-flex items-center justify-center rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-black text-orange-700 transition hover:border-orange-500 hover:bg-orange-600 hover:text-white hover:shadow-md hover:shadow-orange-100 dark:border-slate-700 dark:bg-slate-950 dark:text-orange-200 dark:hover:border-orange-500 dark:hover:bg-orange-600 dark:hover:text-white"
      }
    >
      {label}
    </button>
  );
}

function QuestionReviewTab({
  questions,
}: {
  questions: NonNullable<
    Awaited<ReturnType<typeof getCompetitionMockResult>>["questionReview"]
  >;
}) {
  const groupedSections = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      sectionNumber?: number | string | null;
      questions: typeof questions;
    }> = [];

    questions.forEach((question) => {
      const title =
        question.sectionTitle || question.concept || "Competition Mock";
      const key = sectionAnchorKey(title, question.sectionNumber);
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.questions.push(question);
      } else {
        groups.push({
          key,
          title,
          sectionNumber: question.sectionNumber,
          questions: [question],
        });
      }
    });

    return groups;
  }, [questions]);

  return (
    <section className="math-card p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
          <BookOpenCheck size={22} />
        </div>
        <div>
          <p className="math-kicker">Question Review</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">
            Questions, Student Answers And Correct Answers
          </h2>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Review every mock question with the selected answer and the correct
            answer.
          </p>
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-[22px] border border-orange-100 bg-orange-50/50 p-5 text-sm font-bold text-slate-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-slate-300">
          Question review is not available for this submitted mock yet.
        </p>
      ) : (
        <div className="space-y-6">
          {groupedSections.map((section) => (
            <div
              key={section.key}
              id={section.key}
              className="scroll-mt-28 rounded-[30px] border border-orange-100 bg-orange-50/25 p-4 dark:border-slate-700 dark:bg-slate-950/30"
            >
              <div className="mb-4 flex flex-col gap-2 rounded-[22px] border border-orange-100 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 dark:text-orange-200">
                    Section Review
                  </p>
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">
                    {section.sectionNumber
                      ? `Section ${section.sectionNumber} - `
                      : ""}
                    {section.title}
                  </h3>
                </div>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                  {section.questions.length} Questions
                </span>
              </div>

              <div className="space-y-5">
                {section.questions.map((question) => (
                  <article
                    key={question.questionId}
                    className="rounded-[28px] border border-orange-100 bg-white/86 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">
                          Question {question.questionNumber}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                            Section {question.sectionNumber || "-"}
                          </span>
                          <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-black text-orange-700 dark:border-slate-700 dark:bg-slate-950 dark:text-orange-200">
                            {question.sectionTitle || "Competition Mock"}
                          </span>
                        </div>
                      </div>
                      <span
                        className={
                          question.isUnanswered
                            ? "math-badge border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            : question.isCorrect
                              ? "math-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                              : "math-badge border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
                        }
                      >
                        {question.isUnanswered
                          ? "Unanswered"
                          : question.isCorrect
                            ? "Correct"
                            : "Wrong"}
                      </span>
                    </div>

                    <div className="mt-5 rounded-[24px] bg-slate-50/90 p-5 dark:bg-slate-950/60">
                      <MathQuestionDisplay
                        operands={(question.operands || []) as any}
                        operators={(question.operators || []) as any}
                        displayType={
                          (question as any).displayType ??
                          (question as any).display_type
                        }
                        questionText={
                          (question as any).questionText ??
                          (question as any).question_text
                        }
                      />
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-2">
                      <AnswerBox
                        title="Student Answer"
                        tone={
                          question.isCorrect
                            ? "correct"
                            : question.isUnanswered
                              ? "neutral"
                              : "wrong"
                        }
                      >
                        {question.selectedOption
                          ? `${question.selectedOption.label}. ${question.selectedOption.value}`
                          : "Not Answered"}
                      </AnswerBox>
                      <AnswerBox title="Correct Answer" tone="correct">
                        {question.correctOption
                          ? `${question.correctOption.label}. ${question.correctOption.value}`
                          : "Not Available"}
                      </AnswerBox>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AnswerBox({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: "correct" | "wrong" | "neutral";
}) {
  const className =
    tone === "correct"
      ? "border-emerald-100 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100"
      : tone === "wrong"
        ? "border-rose-100 bg-rose-50/80 text-rose-950 dark:border-rose-800 dark:bg-rose-950/25 dark:text-rose-100"
        : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";
  return (
    <div className={`rounded-[22px] border p-4 ${className}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">
        {title}
      </p>
      <p className="mt-2 text-lg font-black">{children}</p>
    </div>
  );
}

function ResultAnalysisTab({
  result,
  onSectionSelect,
}: {
  result: Awaited<ReturnType<typeof getCompetitionMockResult>>;
  onSectionSelect: (sectionName: string) => void;
}) {
  return (
    <>
      <div className="math-card overflow-hidden p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="math-kicker">Concept Analysis</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Section Performance
            </h2>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-orange-100 dark:border-slate-700">
          {(result.conceptPerformance || []).length === 0 ? (
            <div className="p-5 text-sm font-bold text-slate-700 dark:text-slate-300">
              No concept analysis is available for this mock yet.
            </div>
          ) : (
            <div className="divide-y divide-orange-100 dark:divide-slate-700">
              {result.conceptPerformance.map((item) => (
                <button
                  key={item.concept}
                  type="button"
                  onClick={() => onSectionSelect(item.concept)}
                  className="grid w-full gap-2 p-4 text-left text-sm font-bold text-slate-800 transition hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:text-slate-100 dark:hover:bg-orange-950/30 dark:hover:text-orange-100 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <span>{item.concept}</span>
                  <span>
                    {item.correct}/{item.total} Correct
                  </span>
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                    {formatNumber(item.percentage)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard
          title="Strengths"
          items={result.conceptStrengths || []}
          empty="No strong areas identified yet."
          onSectionSelect={onSectionSelect}
        />
        <InsightCard
          title="Weak Areas"
          items={result.conceptWeaknesses || []}
          empty="No weak areas identified from this mock."
          onSectionSelect={onSectionSelect}
        />
      </div>
    </>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
      {label}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <article className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-orange-50 p-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
        {icon}
      </div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">
        {helper}
      </p>
    </article>
  );
}

function InsightCard({
  title,
  items,
  empty,
  onSectionSelect,
}: {
  title: string;
  items: Array<{
    concept: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
  empty: string;
  onSectionSelect: (sectionName: string) => void;
}) {
  return (
    <article className="math-card p-5">
      <p className="math-kicker">Result Insight</p>
      <h3 className="text-lg font-black text-slate-950 dark:text-white">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-4 rounded-[20px] border border-orange-100 bg-orange-50/50 p-4 text-sm font-bold text-slate-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-slate-300">
          {empty}
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <button
              key={item.concept}
              type="button"
              onClick={() => onSectionSelect(item.concept)}
              className="flex w-full items-center justify-between rounded-[18px] border border-orange-100 bg-white/80 px-4 py-3 text-left text-sm font-bold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-orange-500 dark:hover:bg-orange-950/30 dark:hover:text-orange-100"
            >
              <span>{item.concept}</span>
              <span>{formatNumber(item.percentage)}%</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
