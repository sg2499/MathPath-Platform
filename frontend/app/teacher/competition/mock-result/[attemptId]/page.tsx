"use client";

import { formatMathPathDateTime } from "@/lib/date";
import { ResultReviewTabs, ToMockReviewQuestions } from "@/components/common/ResultReviewTabs";
import { AppShell } from "@/components/common/AppShell";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherCompetitionMockResult, getTeacherStudents } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Clock3,
  Flame,
  Lightbulb,
  Megaphone,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
  return value ? formatMathPathDateTime(value) : "-";
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
  result: Awaited<ReturnType<typeof getTeacherCompetitionMockResult>>,
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
    .map((item: any) => item.concept)
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

// 2026-10 (teacher revamp): the coach panel spoke to the student ("Maintain
// your perfect form"). A teacher reads it about the student instead, with
// the same bands, focus topics and next target.
function buildTeacherCoachMessage(
  result: Awaited<ReturnType<typeof getTeacherCompetitionMockResult>>,
  FirstName: string,
): CompetitionMessage {
  const Base = buildCompetitionMessage(result);
  const Percentage = Number(result.percentage ?? result.accuracyPercentage ?? 0);
  const Band = competitionBandKey(Percentage);
  const Rounded = Math.round(Percentage);
  const Headline: Record<string, string> = {
    perfect: `${FirstName} Scored A Perfect ${Rounded}%`,
    champion: `${FirstName} Is In The Champion Zone At ${Rounded}%`,
    strong: `${FirstName} Had A Strong Mock At ${Rounded}%`,
    momentum: `${FirstName} Is Building Momentum At ${Rounded}%`,
    practice: `${FirstName} Needs More Practice At ${Rounded}%`,
    restart: `${FirstName} Needs A Fresh Start At ${Rounded}%`,
  };
  const Message: Record<string, string> = {
    perfect: `Every question was right. Keep ${FirstName} on full mocks to hold this form.`,
    champion: `${FirstName} is close to flawless. The few mistakes left are worth going through together.`,
    strong: `${FirstName} has a solid base. The weaker topics below are what stand between this and the Champion Zone.`,
    momentum: `${FirstName} is getting there. Section-wise practice on the topics below will lift the score fastest.`,
    practice: `${FirstName} is finding several topics hard. Go over the basics of the topics below before the next mock.`,
    restart: `${FirstName} struggled on this mock. Start with the weakest topic below and build up one section at a time.`,
  };
  const Unanswered = Number(result.unanswered || 0);
  const Utilisation = Number(result.timeUtilizationPercentage || 0);
  const Notes = [
    Unanswered > 0 ? `${Unanswered} question${Unanswered === 1 ? " was" : "s were"} left unanswered.` : "",
    Utilisation > 85
      ? `${FirstName} used most of the time, so watch for accuracy dropping near the end.`
      : Utilisation < 25
        ? `${FirstName} finished quickly; encourage using the spare time to check answers.`
        : `${FirstName}'s pace leaves room to balance speed with accuracy.`,
  ].filter(Boolean);
  const NextTarget =
    Percentage >= 100
      ? "Hold 100% on the next mock."
      : Percentage >= 95
        ? "Reach a flawless 100%."
        : Percentage >= 90
          ? "Reach 95% or more with no careless slips."
          : Percentage >= 75
            ? "Reach the 90% Champion Zone."
            : Percentage >= 60
              ? "Reach 75% or more by working on the weaker sections."
              : Percentage >= 40
                ? "Reach 60% or more with cleaner basics."
                : "A first big jump through section-wise practice.";
  return {
    ...Base,
    title: Headline[Band],
    message: Message[Band],
    coachNote: Notes.join(" "),
    focusAreas: Percentage >= 100 ? ["Keep practising full mocks"] : Base.focusAreas,
    nextTarget: NextTarget,
  };
}

function TeacherCompetitionResultDarkHoverStyles() {
  return (
    <style>{`
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-surface,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-row,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-control,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-tab,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-analysis-row {
        transition-property: background-color, border-color, color, box-shadow, transform;
        transition-duration: 180ms;
        transition-timing-function: ease;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-surface:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-surface:focus-visible,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-soft:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-soft:focus-visible {
        background-color: rgba(122, 31, 88, 0.42) !important;
        border-color: rgba(251, 207, 232, 0.72) !important;
        box-shadow: 0 0 0 1px rgba(251, 207, 232, 0.20), 0 18px 42px rgba(88, 28, 63, 0.34) !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-row:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-row:focus-visible {
        background-color: rgba(122, 31, 88, 0.55) !important;
        border-color: rgba(251, 207, 232, 0.78) !important;
        box-shadow: inset 4px 0 0 rgba(251, 207, 232, 0.80), 0 14px 34px rgba(88, 28, 63, 0.32) !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-control:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-control:focus-visible,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-surface:hover .tc-dark-hover-control,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-row:hover .tc-dark-hover-control {
        background-color: #7a1f58 !important;
        border-color: rgba(251, 207, 232, 0.92) !important;
        color: #ffffff !important;
        box-shadow: 0 10px 24px rgba(88, 28, 63, 0.46) !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-control:hover *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-control:focus-visible *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-surface:hover .tc-dark-hover-control *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-row:hover .tc-dark-hover-control * {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-tab:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-tab:focus-visible,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-analysis-row:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-analysis-row:focus-visible {
        background-color: #7a1f58 !important;
        border-color: rgba(251, 207, 232, 0.92) !important;
        color: #ffffff !important;
        box-shadow: 0 12px 28px rgba(88, 28, 63, 0.42) !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-tab:hover *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-tab:focus-visible *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-analysis-row:hover *,
      .dark .teacher-competition-dark-hover-scope .tc-dark-hover-analysis-row:focus-visible * {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      .dark .teacher-competition-dark-hover-scope .tc-dark-filter:hover,
      .dark .teacher-competition-dark-hover-scope .tc-dark-filter:focus,
      .dark .teacher-competition-dark-hover-scope .tc-dark-filter:focus-within {
        background-color: rgba(122, 31, 88, 0.36) !important;
        border-color: rgba(251, 207, 232, 0.82) !important;
        box-shadow: 0 0 0 3px rgba(251, 207, 232, 0.16) !important;
      }
    `}</style>
  );
}

export default function TeacherCompetitionMockResultPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;
  // Focus-area buttons open a section in the review (ResultReviewTabs).
  const [focusRequest, setFocusRequest] = useState<{ Title: string; Nonce: number } | null>(null);

  const query = useQuery({
    queryKey: ["teacher-competition-mock-result", attemptId],
    queryFn: () => getTeacherCompetitionMockResult(attemptId),
    enabled: ready && Boolean(attemptId),
  });
  // The result carries only the student's id; the name comes from the
  // teacher's own list (the same query My Students uses, usually cached).
  const studentsQuery = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: ready });

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
  const student = (studentsQuery.data || []).find((item) => item.studentId === result.studentId);
  const studentName = student?.studentName || "";
  const firstName = studentName.split(" ")[0] || "The student";
  const competitionMessage = buildTeacherCoachMessage(result, firstName);
  const backHref = `/teacher/competition/mock-tracker?studentId=${result.studentId || ""}&moduleCode=${mock.moduleCode || ""}&levelCode=${mock.levelCode || ""}`;

  // Focus-area buttons pass a concept name (e.g. "BODMAS"), not a section
  // title -- several concepts share one section -- so map the concept back to
  // its section and ask the review to open that section.
  const conceptToSectionTitle = new Map<string, string>(
    (result.conceptPerformance || []).map((item: any): [string, string] => [item.concept, item.sectionTitle || item.concept]),
  );
  const jumpToSection = (nameOrConcept: string) => {
    const sectionTarget = conceptToSectionTitle.get(nameOrConcept) || nameOrConcept;
    setFocusRequest({ Title: sectionTarget, Nonce: Date.now() });
  };

  return (
    <AppShell title="Competition Mock Result">
      <TeacherCompetitionResultDarkHoverStyles />
      <section className="teacher-competition-dark-hover-scope space-y-5">
        <div className="te-back-row">
          <button type="button" className="te-back" onClick={() => router.push(backHref)}>
            <ArrowLeft size={16} />
            Back To Mock Tracker
          </button>
        </div>
        <div className="math-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="math-block-header">
                <CheckCircle2 size={14} />
                Mock Result
              </p>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              {studentName ? (
                <p className="te-result-student">
                  <span className="te-name">{studentName}</span>
                  {student?.studentCode ? <span className="te-code-inline">{student.studentCode}</span> : null}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip
                  label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`}
                />
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                Submitted {formatDate(result.completedAt || result.submittedAt)}. Below are{" "}
                {studentName ? `${firstName}'s` : "the student's"} answers, the correct solutions and how each section went.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#7a1f58]/25 bg-[#7a1f58]/5 px-6 py-4 text-center dark:border-rose-300/30 dark:bg-rose-400/10">
              <p className="te-mini-label">Score</p>
              <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">
                {formatNumber(result.score)}/{formatNumber(result.maxScore)}
              </p>
              <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">
                {formatNumber(result.percentage)}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Target size={18} />}
            label="Accuracy"
            value={`${formatNumber(result.accuracyPercentage)}%`}
            helper="Attempted answers"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="Correct"
            value={result.correct}
            helper={`${result.totalQuestions} total questions`}
          />
          <MetricCard
            icon={<XCircle size={18} />}
            label="Unanswered"
            value={result.unanswered}
            helper="Scored as zero"
          />
          <MetricCard
            icon={<Clock3 size={18} />}
            label="Time Taken"
            value={formatDuration(result.timeTakenSeconds)}
            helper={`${formatNumber(result.timeUtilizationPercentage)}% time used`}
          />
        </div>

        <CompetitionMessageBox
          message={competitionMessage}
          onSectionSelect={jumpToSection}
        />

        {/* 2026-10-11: Answer Sheet (section blocks) and Scorecard, the same
            two tabs on every result page. The old Result Analysis tab's
            section rows, strengths and weak areas live in the Scorecard. */}
        <ResultReviewTabs Questions={ToMockReviewQuestions(questionReview as any)} Viewer="TEACHER" FocusRequest={focusRequest} />
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
    <article className="relative overflow-hidden rounded-[32px] border border-[#7a1f58]/25 bg-gradient-to-br from-white via-[#7a1f58]/5 to-[#e6b8a2]/10 p-5 shadow-xl shadow-[#7a1f58]/10 dark:border-rose-300/30 dark:from-slate-950 dark:via-rose-950/20 dark:to-slate-900 dark:shadow-rose-950/20">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-[#7a1f58]/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7a1f58] to-[#b76e79] text-white shadow-lg shadow-[#7a1f58]/20 dark:shadow-rose-950/40">
            <Icon size={26} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="math-block-header">
                <Megaphone size={14} />
                Coach&apos;s Read
              </p>
              <span className="rounded-full border border-[#7a1f58]/20 bg-white px-3 py-1 text-xs font-black text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">
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
          <div className="rounded-[24px] border border-[#7a1f58]/20 bg-white/90 p-4 dark:border-rose-300/30 dark:bg-slate-950/70">
            <p className="te-mini-label">Focus Next</p>
            <div className="mt-3 grid gap-2">
              {message.focusAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => onSectionSelect(area)}
                  className="tc-dark-hover-analysis-row rounded-[16px] border border-[#7a1f58]/15 bg-[#7a1f58]/5 px-3 py-2.5 text-left text-sm font-black text-slate-900 transition hover:border-[#7a1f58] hover:bg-[#7a1f58] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7a1f58]/40 dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-white dark:hover:border-rose-100 dark:hover:bg-rose-500/35 dark:hover:text-white dark:hover:shadow-md dark:hover:shadow-rose-950/30 dark:focus:ring-rose-300/40"
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-[#e6b8a2]/50 bg-[#e6b8a2]/15 p-4 dark:border-[#e6b8a2]/30 dark:bg-[#e6b8a2]/10">
            <p className="te-mini-label">Next Target</p>
            <p className="mt-2 text-base font-black leading-6 text-slate-950 dark:text-white">
              {message.nextTarget}
            </p>
          </div>
        </div>
      </div>
    </article>
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
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      {icon && (
        <div className="math-teacher-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black text-slate-700 transition-colors duration-300 group-hover:text-[var(--mp-role-primary)] dark:text-slate-300">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--mp-role-primary)] dark:text-white">
        {value}
      </p>
      <p className="relative z-10 mt-2 text-xs font-extrabold text-slate-600 dark:text-slate-300">
        {helper}
      </p>
    </div>
  );
}
