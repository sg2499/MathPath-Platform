"use client";

// 2026-09-14 batch (Shailesh): teacher-facing per-question Annual
// Competition attempt review -- the "View" action wired into both the
// Official results table and the Practice roster on
// app/teacher/competition/annual/page.tsx. Deliberately the same plain,
// professional audit view as the admin version
// (app/admin/competition/annual-result/[attemptId]/page.tsx) -- every
// section, every question, the student's typed answer next to the correct
// answer -- just teacher-scoped (own students only, enforced server-side)
// and without the admin-only "always visible" bypass: an OFFICIAL attempt
// stays locked here until an admin releases results, a PRACTICE attempt is
// visible the moment the student submits it (see
// GetCompetitionEventAttemptReviewForTeacher's own docstring on the
// backend for why that's the same is_released gate, not a new one).

import { ResultReviewTabs, ToAnnualReviewQuestions, ToAnnualReviewSections } from "@/components/common/ResultReviewTabs";
import { AppShell } from "@/components/common/AppShell";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { FormatCompetitionLevelLabel } from "@/lib/api/admin";
import {
  getTeacherAnnualCompetitionAttemptReview,
  type TeacherAnnualCompetitionAttemptReview,
  type TeacherAnnualCompetitionAttemptReviewQuestion,
} from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ListChecks,
  Target,
  Trophy,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

function FormatDurationSeconds(Value: number | null | undefined): string {
  if (Value === null || Value === undefined) return "—";
  const Total = Math.max(0, Math.round(Number(Value) || 0));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  if (Minutes && Seconds) return `${Minutes} Min${Minutes !== 1 ? "s" : ""} ${Seconds} Sec${Seconds !== 1 ? "s" : ""}`;
  if (Minutes) return `${Minutes} Min${Minutes !== 1 ? "s" : ""}`;
  return `${Seconds} Sec${Seconds !== 1 ? "s" : ""}`;
}

// 2026-09-17 (Shailesh): "the percentages shown every where should be
// following the round off logic and must show case whole numbers only no
// decimals whatsoever ... no decimals at all for practice and official both
// the competition flows." Mirrors the admin review page's own identical
// fix -- rounds to a whole number (was 2 decimal places) as a defensive
// second layer on top of the backend's own RoundPercentageForDisplay
// rounding.
function FormatNumber(Value: number | null | undefined): string {
  if (Value === null || Value === undefined || Number.isNaN(Number(Value))) return "—";
  return String(Math.round(Number(Value)));
}

export default function TeacherAnnualCompetitionAttemptReviewPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const AttemptId = Params.attemptId;

  const ReviewQuery = useQuery({
    queryKey: ["teacher-annual-competition-attempt-review", AttemptId],
    queryFn: () => getTeacherAnnualCompetitionAttemptReview(AttemptId),
    enabled: Ready && Boolean(AttemptId),
  });

  if (!Ready) return null;

  if (ReviewQuery.isLoading) {
    return (
      <AppShell title="Annual Competition Attempt Review">
        <LoadingState label="Loading attempt review..." />
      </AppShell>
    );
  }

  if (ReviewQuery.error) {
    return (
      <AppShell title="Annual Competition Attempt Review">
        <ErrorState message={apiErrorMessage(ReviewQuery.error)} />
      </AppShell>
    );
  }

  const Review = ReviewQuery.data;
  if (!Review) {
    return (
      <AppShell title="Annual Competition Attempt Review">
        <LoadingState label="Preparing attempt review..." />
      </AppShell>
    );
  }

  // 2026-10 (teacher revamp): Back sits above the card, at the right, as on
  // every other teacher result page.
  const BackButton = (
    <div className="te-back-row">
      <button type="button" className="te-back" onClick={() => Router.push("/teacher/competition/annual")}>
        <ArrowLeft size={16} />
        Back To Annual Competition
      </button>
    </div>
  );

  if (!Review.released) {
    return (
      <AppShell title="Annual Competition Attempt Review">
        <section className="space-y-5">
          {BackButton}
          <div className="math-card p-6">
            <p className="math-block-header"><BookOpenCheck size={14} />Attempt Review</p>
            <h1 className="math-title">Results Not Released Yet</h1>
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">
              This attempt has not been submitted yet, or the admin has not released the official results yet.
              They show here once that is done.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const Result = Review.result;

  return (
    <AppShell title="Annual Competition Attempt Review">
      <section className="space-y-5">
        {BackButton}
        <div className="math-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="math-block-header"><BookOpenCheck size={14} />Attempt Review</p>
              <h1 className="math-title">{Review.studentName || Review.studentCode || Review.studentId}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {Review.studentCode ? <Chip label={Review.studentCode} /> : null}
                {Review.competitionLevelCode ? <Chip label={FormatCompetitionLevelLabel(Review.competitionLevelCode)} /> : null}
                {Review.attemptType ? (
                  <Chip tone={Review.attemptType === "PRACTICE" ? "amber" : "slate"}>{Review.attemptType === "PRACTICE" ? "Practice" : "Official"}</Chip>
                ) : null}
              </div>
            </div>
            {Result ? (
              <div className="rounded-[24px] border border-[#7a1f58]/25 bg-[#7a1f58]/5 px-6 py-4 text-center dark:border-rose-300/30 dark:bg-rose-400/10">
                <p className="te-mini-label">Score</p>
                <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">
                  {FormatNumber(Result.score)}/{FormatNumber(Result.maxScore)}
                </p>
                {/* 2026-09-14 (Shailesh): see the matching comment on the
                    admin review page (annual-result/[attemptId]/page.tsx)
                    -- this headline "%" must be the student's actual
                    accuracy against what they attempted, not
                    Result.percentage (score ÷ the whole paper's question
                    count), on both Official and Practice attempts. This
                    screen already serves both. */}
                <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{FormatNumber(Result.accuracyPercentage)}%</p>
              </div>
            ) : null}
          </div>
        </div>

        {Result ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Target size={18} />} label="Accuracy" value={`${FormatNumber(Result.accuracyPercentage)}%`} helper={`${Result.correctCount} correct, ${Result.wrongCount} wrong`} />
            <MetricCard icon={<CheckCircle2 size={18} />} label="Correct" value={Result.correctCount} helper={`${Result.unansweredCount} unanswered`} />
            <MetricCard icon={<Trophy size={18} />} label="Rank" value={Result.rank ?? "—"} helper={Review.attemptType === "PRACTICE" ? "Practice is not ranked" : "Among ranked official attempts"} />
            <MetricCard icon={<Clock3 size={18} />} label="Time Taken" value={FormatDurationSeconds(Result.timeTakenSeconds)} helper="Across all sections" />
          </div>
        ) : null}

        {/* 2026-10-11: the same Answer Sheet (section blocks) and Scorecard
            tabs as every other result page (components/common/ResultReviewTabs). */}
        <ResultReviewTabs Questions={ToAnnualReviewQuestions(Review.sections)} Sections={ToAnnualReviewSections(Review.sections)} Viewer="TEACHER" ScorecardContent={<ScorecardTab Review={Review} />} />
      </section>
    </AppShell>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <article className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-5">
      <div className="math-teacher-icon-chip">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">{helper}</p>
    </article>
  );
}

// 2026-10-11 (Shailesh): the Annual Competition keeps its own plain
// scorecard -- no strengths or weak areas, and no accuracy for students.
// Section-by-section marks table, derived from the exact same `sections`
// data the Answer Sheet tab already renders -- mirrors the admin page's own
// ScorecardTab (same reasoning: this tab's totals must never drift from
// what the Answer Sheet tab visibly shows above it).
function ScorecardTab({ Review }: { Review: TeacherAnnualCompetitionAttemptReview }) {
  const Sections = Review.sections || [];
  const Rows = Sections.map((SectionReview) => ({
    sectionNumber: SectionReview.sectionNumber,
    sectionTitle: SectionReview.sectionTitle || `Section ${SectionReview.sectionNumber}`,
    totalQuestions: SectionReview.questions.length,
    // 2026-09-27 (Shailesh, Scorecard "Total Attempted" feature): a
    // question already carries isUnanswered on this exact review payload
    // (mirrored verbatim across student/admin/teacher), so "attempted" is
    // derivable with no new backend field or fetch.
    attemptedCount: SectionReview.questions.filter((QuestionReview) => !QuestionReview.isUnanswered).length,
    correctCount: SectionReview.questions.filter((QuestionReview) => QuestionReview.isCorrect).length,
  }));
  const TotalQuestions = Rows.reduce((Sum, Row) => Sum + Row.totalQuestions, 0);
  const TotalAttempted = Rows.reduce((Sum, Row) => Sum + Row.attemptedCount, 0);
  const TotalMarksObtained = Rows.reduce((Sum, Row) => Sum + Row.correctCount, 0);
  const ResultForBreakdown = Review.result;
  const AttemptedCountForBreakdown = ResultForBreakdown ? ResultForBreakdown.correctCount + ResultForBreakdown.wrongCount : 0;

  return (
    <div className="math-card p-5">
      <div className="mb-4">
        <p className="math-block-header"><ListChecks size={14} />Scorecard</p>
        <h3 className="text-lg font-black text-slate-950 dark:text-white">Section-Wise Marks</h3>
      </div>

      {Rows.length === 0 ? (
        <p className="rounded-[20px] border border-[#7a1f58]/15 bg-[#7a1f58]/5 p-4 text-sm font-bold text-slate-700 dark:border-rose-300/25 dark:bg-rose-400/10 dark:text-slate-300">
          No section data is available for this attempt yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Section</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Total Questions</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Questions Attempted</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Correct Answers</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Marks Obtained</th>
              </tr>
            </thead>
            <tbody>
              {Rows.map((Row) => (
                <tr key={Row.sectionNumber} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">
                    Section {Row.sectionNumber} — {Row.sectionTitle}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{Row.totalQuestions}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{Row.attemptedCount}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{Row.correctCount}</td>
                  <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{Row.correctCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#7a1f58]/30 dark:border-rose-300/30">
                <td className="px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#7a1f58] dark:text-rose-100">Total</td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{TotalQuestions}</td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{TotalAttempted}</td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{TotalMarksObtained}</td>
                <td className="px-3 py-3 text-right text-lg font-black text-[#7a1f58] dark:text-rose-100">{TotalMarksObtained}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 rounded-[22px] border border-[#7a1f58]/25 bg-[#7a1f58]/5 px-5 py-4 text-center dark:border-rose-300/30 dark:bg-rose-400/10">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a1f58] dark:text-rose-100">Total Marks Obtained</p>
        <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">
          {TotalMarksObtained}/{TotalQuestions}
        </p>
      </div>

      {ResultForBreakdown ? (
        <div className="mt-4 rounded-[22px] border border-emerald-500/25 bg-emerald-500/5 p-5 dark:border-emerald-400/25 dark:bg-emerald-400/10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Accuracy Breakdown</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Attempted</p>
              <p className="text-lg font-black text-slate-950 dark:text-white">{AttemptedCountForBreakdown}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Correct</p>
              <p className="text-lg font-black text-slate-950 dark:text-white">{ResultForBreakdown.correctCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Wrong</p>
              <p className="text-lg font-black text-slate-950 dark:text-white">{ResultForBreakdown.wrongCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Unanswered</p>
              <p className="text-lg font-black text-slate-950 dark:text-white">{ResultForBreakdown.unansweredCount}</p>
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">
            Accuracy = Correct ÷ Attempted = {ResultForBreakdown.correctCount}/{AttemptedCountForBreakdown} = {FormatNumber(ResultForBreakdown.accuracyPercentage)}%
          </p>
        </div>
      ) : null}
    </div>
  );
}
