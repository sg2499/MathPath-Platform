"use client";

import { AppShell } from "@/components/common/AppShell";
import { Chip as StandardChip } from "@/components/common/DetailWorkspaceViews";
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
import { useMemo, useState, useEffect, useRef } from "react";
import { EpicCelebration } from "@/components/gamification/EpicCelebration";
import { AnimatePresence } from "framer-motion";
import { CompetitionMessage, competitionMessagePools } from "@/lib/utils/competitionMessages";

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins && secs) {
    return `${mins} Min${mins !== 1 ? "s" : ""} ${secs} Sec${secs !== 1 ? "s" : ""}`;
  }
  if (mins) {
    return `${mins} Min${mins !== 1 ? "s" : ""}`;
  }
  return `${secs} Sec${secs !== 1 ? "s" : ""}`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "-";
  const numeric = Number(value);
  return String(Math.round(numeric));
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

function AccuracyChipTone(value: number | null): "slate" | "green" | "red" | "amber" | "blue" | "cyan" | "purple" {
  if (value === null) return "slate";
  if (value < 60) return "red";
  if (value < 80) return "amber";
  if (value < 90) return "purple";
  return "green";
}

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



function competitionBandKey(percentage: number) {
  if (percentage >= 100) return "perfect";
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
    percentage >= 100
      ? ["Maintain your perfect form and consistency"]
      : weaknesses.length > 0
        ? weaknesses.slice(0, 3)
        : strengths.slice(0, 2);
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
    percentage >= 100
      ? "Maintain 100% accuracy and keep setting the standard."
      : percentage >= 95
        ? "Aim for a flawless 100% next time."
      : percentage >= 90
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
    title: `${pickFrom(pool.titles, seed)} ${bandKey === "perfect" ? "🌟" : bandKey === "champion" ? "🏆" : bandKey === "strong" ? "🚀" : bandKey === "momentum" ? "🔥" : bandKey === "practice" ? "✨" : "🌱"}`,
    badge: pool.badge,
    message: `${pickFrom(pool.messages, seed, 3)}${unansweredNote}`,
    coachNote: `${pickFrom(pool.notes, seed, 7)}${timeNote}`,
    focusAreas:
      focusAreas.length > 0
        ? focusAreas
        : ["Review the question paper section by section"],
    nextTarget: nextBandTarget,
    icon: pool.icon as any,
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

// The section title persisted at generation time already has its own real
// section number baked in (e.g. "Section 7 - Positional and Placement"),
// while this page separately renders the renumbered display number (1, 2...
// with gaps closed for whatever sections a level omits) right next to it.
// Concatenating the two produced "Section 1 - Section 7 - Positional and
// Placement". Stripping any leading "Section <n> -" here mirrors the same
// cleanup Mock Studio already does (getCleanMmSectionName) so only one,
// correct section number is ever shown.
function stripSectionNumberPrefix(title: string): string {
  return title.replace(/^section\s*\d+\s*[-–—:]\s*/i, "").trim();
}

type ResultTab = "questions" | "analysis";

export default function StudentCompetitionMockResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;
  const [activeTab, setActiveTab] = useState<ResultTab>("questions");
  const [showCelebration, setShowCelebration] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false);
  const hasExploded = useRef(false);

  const query = useQuery({
    queryKey: ["student-competition-mock-result", attemptId],
    queryFn: () => getCompetitionMockResult(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  useEffect(() => {
    if (query.data && !hasExploded.current) {
      hasExploded.current = true;
      const accuracy = query.data.accuracyPercentage || 0;
      if (accuracy >= 80) {
        try {
          const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
          if (viewed.includes(attemptId)) {
            setAllowSkip(true);
          }
        } catch (e) {
          console.error("Failed to parse viewed_celebrations from localStorage", e);
        }
        setShowCelebration(true);
      }
    }
  }, [query.data, attemptId]);

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    try {
      const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
      if (!viewed.includes(attemptId)) {
        localStorage.setItem("viewed_celebrations", JSON.stringify([...viewed, attemptId]));
      }
    } catch (e) {
      console.error("Failed to save viewed_celebrations to localStorage", e);
    }
  };

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

  // Strengths/Areas to Improve/focus-area buttons pass an individual concept
  // name (e.g. "BODMAS"), not a section title (2026-07-19, Shailesh) -- the
  // Question Review tab's anchors are still built per-section (several
  // concepts share one section), so resolve the concept back to its parent
  // section here before scrolling, rather than threading section identity
  // through every caller/prop. Falls back to using the passed value directly
  // for anything that's already a section title (or an unmapped legacy
  // value), so this stays safe even if a caller is missed.
  const conceptToSectionTitle = new Map(
    (result.conceptPerformance || []).map((item) => [item.concept, item.sectionTitle || item.concept]),
  );
  const jumpToSection = (nameOrConcept: string) => {
    setActiveTab("questions");
    const sectionTarget = conceptToSectionTitle.get(nameOrConcept) || nameOrConcept;
    window.setTimeout(() => {
      const target = document.getElementById(sectionAnchorKey(sectionTarget));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  return (
    <>
      <AnimatePresence>
        {showCelebration && (
          <EpicCelebration
            accuracy={result.accuracyPercentage || 0}
            onComplete={handleCelebrationComplete}
            allowSkip={allowSkip}
          />
        )}
      </AnimatePresence>
      <AppShell title="Competition Mock Result">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button
            className="math-button-secondary mb-4 px-4 py-2 text-sm"
            onClick={() => router.push(`/student/competition/mock-exams?moduleCode=${mock.moduleCode || ""}&levelCode=${mock.levelCode || ""}`)}
          >
            Back To Mock Exams
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="math-block-header mb-2"><Trophy size={14} /> Mock Result</div>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip
                  label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`}
                />
              </div>
              <p className="math-subtitle">
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
    </>
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
              <div className="math-block-header mb-2"><Rocket size={14} /> Competition Coach</div>
              <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
                {message.badge}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {message.title}
            </h2>
            <p className="mt-4 max-w-5xl text-lg font-black leading-8 text-slate-950 dark:text-white">
              {message.message}
            </p>
            <p className="mt-3 max-w-5xl text-base font-black leading-7 text-slate-900 dark:text-slate-100">
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
                  className="rounded-[16px] border border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] px-3 py-2.5 text-left text-sm font-black text-slate-900 transition hover:border-[var(--mp-role-primary)] hover:bg-[var(--mp-role-primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--mp-role-primary)] dark:text-white dark:hover:bg-[var(--mp-role-primary)]"
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
            <p className="mt-2 text-base font-black leading-6 text-slate-950 dark:text-white">
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
      data-active={active ? "true" : undefined}
      className={`math-role-tab ${active ? "math-role-tab-active" : ""}`}
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
      const rawTitle =
        question.sectionTitle || question.concept || "Competition Mock";
      const title = stripSectionNumberPrefix(rawTitle);
      const key = sectionAnchorKey(rawTitle, question.sectionNumber);
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
      <div className="mb-5">
        <div className="math-block-header mb-2"><BookOpenCheck size={14} /> Question Review</div>
        <h2 className="text-2xl font-black text-slate-950 dark:text-white">
          Questions, Student Answers And Correct Answers
        </h2>
        <p className="math-subtitle !mt-1">
          Review every mock question with the selected answer and the correct
          answer.
        </p>
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
                <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
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
                          <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
                            Section {question.sectionNumber || "-"}
                          </span>
                          <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
                            {stripSectionNumberPrefix(question.sectionTitle || "Competition Mock")}
                          </span>
                        </div>
                      </div>
                      <StandardChip
                        tone={
                          question.isUnanswered
                            ? "slate"
                            : question.isCorrect
                              ? "green"
                              : "red"
                        }
                      >
                        {question.isUnanswered
                          ? "Unanswered"
                          : question.isCorrect
                            ? "Correct"
                            : "Wrong"}
                      </StandardChip>
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
            <div className="math-block-header mb-2"><Flame size={14} /> Concept Analysis</div>
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
                  className="grid w-full gap-2 p-4 text-left text-sm font-bold text-slate-800 transition hover:bg-[var(--mp-role-softer)] hover:text-[var(--mp-role-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--mp-role-primary)] dark:text-slate-100 dark:hover:bg-[var(--mp-role-softer)] dark:hover:text-[var(--mp-role-readable)] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <span>{item.concept}</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {item.correct}/{item.total} Correct
                  </span>
                  <StandardChip tone={AccuracyChipTone(item.percentage)}>
                    {formatNumber(item.percentage)}%
                  </StandardChip>
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
    <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
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
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
        {icon}
      </div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {value}
      </p>
      <p className="relative z-10 mt-1 text-sm font-bold text-slate-700 transition-colors duration-300 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">
        {helper}
      </p>
    </div>
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
      <div className="math-block-header mb-2"><Sparkles size={14} /> Result Insight</div>
      <h3 className="text-lg font-black text-slate-950 dark:text-white">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-4 rounded-[20px] border border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] p-4 text-sm font-bold text-slate-700 dark:text-slate-300">
          {empty}
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <button
              key={item.concept}
              type="button"
              onClick={() => onSectionSelect(item.concept)}
              className="flex w-full items-center justify-between rounded-[18px] border border-[var(--mp-role-border)] bg-white/80 px-4 py-3 text-left text-sm font-bold text-slate-800 transition hover:border-[var(--mp-role-primary)] hover:bg-[var(--mp-role-softer)] hover:text-[var(--mp-role-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--mp-role-primary)] dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-[var(--mp-role-primary)] dark:hover:bg-[var(--mp-role-softer)] dark:hover:text-[var(--mp-role-readable)]"
            >
              <span>{item.concept}</span>
              <StandardChip tone={AccuracyChipTone(item.percentage)}>{formatNumber(item.percentage)}%</StandardChip>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
