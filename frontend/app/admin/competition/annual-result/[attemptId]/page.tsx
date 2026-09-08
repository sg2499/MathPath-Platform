"use client";

// Point 7 (Shailesh, 2026-09-08): admin per-question Annual Competition
// attempt review. Deliberately a plain, professional audit view -- not the
// gamified Competition Mock result page (mock-result/[attemptId]/page.tsx)
// with its coach messages/concept-analysis tabs, which is aimed at student
// motivation, not admin auditing. What an admin actually needs here is
// exactly what the client's own review requests ask for: every section,
// every question, the student's typed answer next to the correct answer,
// clearly marked correct/wrong/unanswered -- reusing MathQuestionDisplay
// (same component DPS/Competition Mock reviews already use) so the
// question itself renders identically to how the student saw it.

import { AppShell } from "@/components/common/AppShell";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getAnnualCompetitionAttemptReview,
  type AnnualCompetitionAttemptReviewQuestion,
} from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Target,
  Trophy,
  XCircle,
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

function FormatNumber(Value: number | null | undefined): string {
  if (Value === null || Value === undefined || Number.isNaN(Number(Value))) return "-";
  return String(Math.round(Number(Value) * 100) / 100);
}

function FormatDateTime(Value: string | null | undefined): string {
  if (!Value) return "-";
  const DateValue = new Date(Value);
  if (Number.isNaN(DateValue.getTime())) return "-";
  return DateValue.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminAnnualCompetitionAttemptReviewPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const AttemptId = Params.attemptId;

  const ReviewQuery = useQuery({
    queryKey: ["annual-competition-attempt-review", AttemptId],
    queryFn: () => getAnnualCompetitionAttemptReview(AttemptId),
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

  const Result = Review.result;

  return (
    <AppShell title="Annual Competition Attempt Review">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button
            type="button"
            className="math-button-secondary mb-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm"
            onClick={() => Router.push(`/admin/competition/annual-studio/${Review.eventId}`)}
          >
            <ArrowLeft size={14} />
            Back To Event
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-block-header"><BookOpenCheck size={14} />Attempt Review</p>
              <h1 className="math-title">{Review.studentName || Review.studentCode || Review.studentId}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {Review.studentCode ? <Chip label={Review.studentCode} /> : null}
                {Review.assignedLevelCode ? <Chip label={Review.assignedLevelCode} /> : null}
                {Review.eventName ? <Chip label={Review.eventName} /> : null}
                <Chip tone={Review.status === "SUBMITTED" || Review.status === "FINALIZED" ? "green" : "slate"}>{Review.status}</Chip>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                Started {FormatDateTime(Review.startedAt)} · Submitted {FormatDateTime(Review.submittedAt)}
              </p>
            </div>
            {Result ? (
              <div className="rounded-[24px] border border-[#2563eb]/25 bg-[#2563eb]/5 px-6 py-4 text-center dark:border-cyan-300/30 dark:bg-cyan-400/10">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb] dark:text-cyan-100">Score</p>
                <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">
                  {FormatNumber(Result.score)}/{FormatNumber(Result.maxScore)}
                </p>
                <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{FormatNumber(Result.percentage)}%</p>
              </div>
            ) : null}
          </div>
        </div>

        {Result ? (
          <div className="grid gap-4 lg:grid-cols-4">
            <MetricCard icon={<Target size={18} />} label="ACCURACY" value={`${FormatNumber(Result.accuracyPercentage)}%`} helper={`${Result.correctCount} correct, ${Result.wrongCount} wrong`} />
            <MetricCard icon={<CheckCircle2 size={18} />} label="CORRECT" value={Result.correctCount} helper={`${Result.unansweredCount} unanswered`} />
            <MetricCard icon={<Trophy size={18} />} label="RANK" value={Result.rank ?? "-"} helper={Result.isReleased ? "Released to student" : "Not yet released"} />
            <MetricCard icon={<Clock3 size={18} />} label="TIME TAKEN" value={FormatDurationSeconds(Result.timeTakenSeconds)} helper={Result.isVoided ? "Result voided" : "Across all sections"} />
          </div>
        ) : (
          <div className="math-card p-5 text-sm font-bold text-slate-700 dark:text-slate-300">
            This attempt has not been scored yet -- results appear automatically once the student's last section closes.
          </div>
        )}

        {Review.sections.length === 0 ? (
          <div className="math-card p-5 text-sm font-bold text-slate-700 dark:text-slate-300">
            No section data is available for this attempt yet.
          </div>
        ) : (
          Review.sections.map((SectionReview) => (
            <div key={SectionReview.sectionNumber} className="math-card p-5">
              <div className="mb-4 flex flex-col gap-2 rounded-[22px] border border-[#2563eb]/15 bg-[#2563eb]/5 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb] dark:text-cyan-100">Section {SectionReview.sectionNumber}</p>
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">
                    {SectionReview.sectionTitle || `Section ${SectionReview.sectionNumber}`}
                    {SectionReview.mode ? ` · ${SectionReview.mode}` : ""}
                  </h3>
                </div>
                <Chip tone="slate">{SectionReview.questions.length} Questions</Chip>
              </div>

              {SectionReview.questions.length === 0 ? (
                <p className="rounded-[20px] border border-[#2563eb]/15 bg-[#2563eb]/5 p-4 text-sm font-bold text-slate-700 dark:border-cyan-300/25 dark:bg-cyan-400/10 dark:text-slate-300">
                  No questions found for this section.
                </p>
              ) : (
                <div className="space-y-5">
                  {SectionReview.questions.map((QuestionReview) => (
                    <QuestionReviewCard key={QuestionReview.questionId} Question={QuestionReview} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}

function QuestionReviewCard({ Question }: { Question: AnnualCompetitionAttemptReviewQuestion }) {
  return (
    <article className="rounded-[28px] border border-[#2563eb]/15 bg-white/86 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-black text-slate-950 dark:text-white">Question {Question.questionNumber}</h3>
        <Chip tone={Question.isUnanswered ? "slate" : Question.isCorrect ? "green" : "red"}>
          {Question.isUnanswered ? "Unanswered" : Question.isCorrect ? "Correct" : "Wrong"}
        </Chip>
      </div>

      <div className="mt-5 rounded-[24px] bg-slate-50/90 p-5 dark:bg-slate-950/60">
        <MathQuestionDisplay
          operands={Question.operands}
          operators={Question.operators}
          displayType={Question.displayType}
          questionText={Question.questionText}
        />
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        <AnswerBox title="Student Answer" tone={Question.isUnanswered ? "neutral" : Question.isCorrect ? "correct" : "wrong"}>
          {Question.studentAnswer ?? "Not Answered"}
        </AnswerBox>
        <AnswerBox title="Correct Answer" tone="correct">
          {Question.correctAnswer ?? "Not Available"}
        </AnswerBox>
      </div>
    </article>
  );
}

function AnswerBox({ title, children, tone }: { title: string; children: React.ReactNode; tone: "correct" | "wrong" | "neutral" }) {
  const ClassName =
    tone === "correct"
      ? "border-emerald-100 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100"
      : tone === "wrong"
        ? "border-cyan-100 bg-cyan-50/80 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/25 dark:text-cyan-100"
        : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";
  return (
    <div className={`rounded-[22px] border p-4 ${ClassName}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">{title}</p>
      <p className="mt-2 text-lg font-black">{children}</p>
    </div>
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
