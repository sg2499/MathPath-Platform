"use client";

import { ResultReviewTabs, ToPracticeReviewQuestions } from "@/components/common/ResultReviewTabs";
import { AppShell } from "@/components/common/AppShell";
import { BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
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
              <p className="math-block-header">
                <FileQuestion size={14} />
                Teacher Result Detail
              </p>
              <h1 className="math-title">Attempt Review</h1>
              <p className="math-subtitle">Review the student, DPS, score, accuracy, benchmark outcome, and question-level details for this attempt.</p>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <SummaryMetric icon={<ShieldCheck size={20} />} label="Score" value={safeScore(data)} />
              <SummaryMetric icon={<Target size={20} />} label="Accuracy" value={`${safeAccuracy(data)}%`} />
              <SummaryMetric icon={<BookOpenCheck size={20} />} label="Benchmark" value={benchmarkText(data)} />
              <SummaryMetric icon={<FileQuestion size={20} />} label="Questions" value={data?.summary?.totalQuestions ?? questionReview.length ?? 0} />
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

          <ResultReviewTabs Questions={ToPracticeReviewQuestions(questionReview)} Viewer="TEACHER" />
        </div>
      ) : null}
    </AppShell>
  );
}

function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-5 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      <div className="math-teacher-icon-chip relative z-10 inline-flex rounded-2xl bg-rose-50 p-3 text-rose-700 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md dark:bg-rose-500/10 dark:text-rose-200">
        {icon}
      </div>
      <p className="relative z-10 mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 transition-colors duration-300 group-hover:text-[var(--mp-role-primary)]">{label}</p>
      <p className="relative z-10 mt-2 text-2xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--mp-role-primary)] dark:text-white">{value}</p>
    </div>
  );
}

function InfoCard({ icon, label, value, subValue }: { icon: ReactNode; label: string; value: string; subValue: ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl math-card border border-rose-200/70 p-5 ring-1 ring-rose-100/80 dark:border-slate-800 dark:ring-0">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      <div className="math-teacher-icon-chip relative z-10 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">{icon}</div>
      <p className="relative z-10 mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 transition-colors duration-300 group-hover:text-[var(--mp-role-primary)]">{label}</p>
      <p className="relative z-10 mt-2 text-xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--mp-role-primary)] dark:text-white">{value}</p>
      <p className="relative z-10 mt-1 text-sm text-slate-500">{subValue}</p>
    </div>
  );
}
