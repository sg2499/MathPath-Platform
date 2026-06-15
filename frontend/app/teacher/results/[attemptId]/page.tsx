"use client";

import { AppShell } from "@/components/common/AppShell";
import { BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getTeacherAttemptResult } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  FileQuestion,
  ShieldCheck,
  Target,
  UserRound,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

function formatDate(value?: string | null) {
  return formatMathPathDateTime(value);
}

function safeScore(data: any) {
  const score = data?.summary?.score ?? data?.score ?? data?.totalScore ?? 0;
  const maxScore = data?.summary?.maxScore ?? data?.summary?.totalQuestions ?? data?.totalMarks ?? 0;
  return `${score} / ${maxScore}`;
}

function safeAccuracy(data: any) {
  return data?.summary?.accuracyPercentage ?? data?.accuracy ?? data?.accuracyPercentage ?? 0;
}

function benchmarkText(data: any) {
  if (data?.requiresAttention || data?.summary?.requiresAttention) return "Needs Re-Attempt";
  if (safeAccuracy(data) >= 90) return "Excellence Zone";
  if (safeAccuracy(data) >= 70) return "Benchmark Met";
  return "Needs Review";
}

export default function TeacherAttemptDetailPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["teacher-attempt-result", params.attemptId],
    queryFn: () => getTeacherAttemptResult(params.attemptId),
    enabled: ready && Boolean(params.attemptId),
  });

  const data: any = query.data;
  const questionReview = Array.isArray(data?.questionReview) ? data.questionReview : [];

  if (!ready) return null;

  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState label="Loading detailed attempt review..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {data ? (
        <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
          <section className="math-hero">
            <div className="relative z-10">
              <p className="math-kicker">Teacher Result Detail</p>
              <h1 className="math-title">Attempt Review</h1>
              <p className="math-subtitle">Review the student, DPS, score, accuracy, benchmark outcome, and question-level details for this attempt.</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <SummaryMetric icon={<ShieldCheck size={16} />} label="Score" value={safeScore(data)} />
              <SummaryMetric icon={<Target size={16} />} label="Accuracy" value={`${safeAccuracy(data)}%`} />
              <SummaryMetric icon={<BookOpenCheck size={16} />} label="Benchmark" value={benchmarkText(data)} />
              <SummaryMetric icon={<FileQuestion size={16} />} label="Questions" value={data?.summary?.totalQuestions ?? questionReview.length ?? 0} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <InfoCard
              icon={<UserRound size={20} />}
              label="Student"
              value={data.student?.studentName || "Student"}
              subValue={<><span className="text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">{data.student?.studentCode || "-"}</span> · Class {data.student?.className || "-"} {data.student?.section || ""}</>}
            />
            <InfoCard
              icon={<BookOpenCheck size={20} />}
              label="DPS / Assessment"
              value={`Lesson ${data.dps?.lessonNumber ?? "-"} · DPS ${data.dps?.dpsNumber ?? "-"}`}
              subValue={data.dps?.dpsTitle || data.assignment?.title || "Assigned work"}
            />
            <InfoCard icon={<Clock size={20} />} label="Attempt Date" value={formatDate(data.attemptDate || data.startedAt)} subValue="When practice was started" />
            <InfoCard
              icon={<Clock size={20} />}
              label="Completion Date"
              value={formatDate(data.completedDate || data.submittedAt)}
              subValue={data.summary?.timeTakenSeconds ? `Time: ${data.summary.timeTakenSeconds}s` : "Time: -"}
            />
          </section>

          <BenchmarkAlert show={data.requiresAttention || data.summary?.requiresAttention} message={data.benchmarkMessage || data.summary?.benchmarkMessage} />

          <ResultSummary result={data} />

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => router.push("/teacher/results")}>
              <ArrowLeft size={16} />
              Back to Results
            </button>
            <div className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
              Result detail ready
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <BookOpenCheck size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950 dark:text-white">Question Review</h2>
                <p className="text-slate-600 dark:text-slate-300">Use this section to identify strong areas and reinforcement needs.</p>
              </div>
            </div>

            {questionReview.length ? (
              <div className="space-y-5">
                {questionReview.map((q: any) => {
                  const statusLabel = q.selectedOption ? (q.isCorrect ? "Correct" : "Wrong") : "Unanswered";

                  return (
                    <div key={q.questionId || q.questionNumber} className="math-card p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">Question {q.questionNumber}</h3>
                        <span
                          className={`math-badge ${
                            q.isCorrect
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : q.selectedOption
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {q.isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {statusLabel}
                        </span>
                      </div>

                      <div className="mt-5 rounded-[28px] bg-slate-50/90 p-6 dark:bg-slate-900/70">
                        <MathQuestionDisplay operands={q.operands || []} operators={q.operators || []} displayType={(q as any).displayType ?? (q as any).display_type} questionText={(q as any).questionText ?? (q as any).question_text} />
                      </div>

                      <div className="mt-5 grid gap-3 xl:grid-cols-2">
                        <div className={`rounded-[22px] p-4 ${q.isCorrect ? "bg-emerald-50 text-emerald-900" : q.selectedOption ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
                          <p className="text-xs font-extrabold uppercase tracking-[0.14em]">Student answer</p>
                          <p className="mt-2 text-lg font-black">{q.selectedOption ? `${q.selectedOption.label}. ${q.selectedOption.value}` : "Not Answered"}</p>
                        </div>

                        <div className="rounded-[22px] bg-emerald-50 p-4 text-emerald-900">
                          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Correct answer</p>
                          <p className="mt-2 text-lg font-black">{q.correctOption ? `${q.correctOption.label}. ${q.correctOption.value}` : "Not available"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="Question review is not available yet. The attempt summary is available, but question-by-question review data was not returned for this record." />
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-teacher-light-metric-card rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function InfoCard({ icon, label, value, subValue }: { icon: ReactNode; label: string; value: string; subValue: ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card math-card border border-rose-200/70 p-5 ring-1 ring-rose-100/80 dark:border-slate-800 dark:ring-0">
      <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">{icon}</div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{subValue}</p>
    </div>
  );
}
