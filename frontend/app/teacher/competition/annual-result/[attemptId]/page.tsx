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
  if (Value === null || Value === undefined) return "-";
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
  if (Value === null || Value === undefined || Number.isNaN(Number(Value))) return "-";
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

  const BackButton = (
    <button
      type="button"
      className="math-button-secondary mb-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm"
      onClick={() => Router.push("/teacher/competition/annual")}
    >
      <ArrowLeft size={14} />
      Back To Annual Competition
    </button>
  );

  if (!Review.released) {
    return (
      <AppShell title="Annual Competition Attempt Review">
        <section className="space-y-5">
          <div className="math-card p-6">
            {BackButton}
            <p className="math-block-header"><BookOpenCheck size={14} />Attempt Review</p>
            <h1 className="math-title">Not released yet</h1>
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">
              This attempt hasn't been submitted yet, or — for an official competition attempt — results haven't been
              released by an admin yet. Check back once that's done.
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
        <div className="math-card p-6">
          {BackButton}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-block-header"><BookOpenCheck size={14} />Attempt Review</p>
              <h1 className="math-title">{Review.studentName || Review.studentCode || Review.studentId}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {Review.studentCode ? <Chip label={Review.studentCode} /> : null}
                {Review.competitionLevelCode ? <Chip label={FormatCompetitionLevelLabel(Review.competitionLevelCode)} /> : null}
                {Review.attemptType ? (
                  <Chip tone={Review.attemptType === "PRACTICE" ? "amber" : "slate"}>{Review.attemptType}</Chip>
                ) : null}
              </div>
            </div>
            {Result ? (
              <div className="rounded-[24px] border border-[#2563eb]/25 bg-[#2563eb]/5 px-6 py-4 text-center dark:border-cyan-300/30 dark:bg-cyan-400/10">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb] dark:text-cyan-100">Score</p>
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
          <div className="grid gap-4 lg:grid-cols-4">
            <MetricCard icon={<Target size={18} />} label="ACCURACY" value={`${FormatNumber(Result.accuracyPercentage)}%`} helper={`${Result.correctCount} correct, ${Result.wrongCount} wrong`} />
            <MetricCard icon={<CheckCircle2 size={18} />} label="CORRECT" value={Result.correctCount} helper={`${Result.unansweredCount} unanswered`} />
            <MetricCard icon={<Trophy size={18} />} label="RANK" value={Result.rank ?? "-"} helper="Among ranked official attempts" />
            <MetricCard icon={<Clock3 size={18} />} label="TIME TAKEN" value={FormatDurationSeconds(Result.timeTakenSeconds)} helper="Across all sections" />
          </div>
        ) : null}

        {/* 2026-10-11: the same Answer Sheet (section blocks) and Scorecard
            tabs as every other result page (components/common/ResultReviewTabs). */}
        <ResultReviewTabs Questions={ToAnnualReviewQuestions(Review.sections)} Sections={ToAnnualReviewSections(Review.sections)} Viewer="TEACHER" />
      </section>
    </AppShell>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <article className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-[#2563eb]/5 p-2 text-[#2563eb] dark:bg-cyan-400/10 dark:text-cyan-100">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">{helper}</p>
    </article>
  );
}
