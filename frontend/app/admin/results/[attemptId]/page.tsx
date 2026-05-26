"use client";

import { AppShell } from "@/components/common/AppShell";
import { BenchmarkBadge, BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
import { VerticalQuestion } from "@/components/student/VerticalQuestion";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getAdminAttemptResult } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, Clock, UserRound, XCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

function formatDate(value?: string | null) {
  return formatMathPathDateTime(value);
}

export default function AdminAttemptDetailPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["admin-attempt-result", params.attemptId],
    queryFn: () => getAdminAttemptResult(params.attemptId),
    enabled: ready && Boolean(params.attemptId),
  });

  if (!ready) return null;

  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState label="Loading detailed attempt review..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {query.data ? (
        <div className="math-admin-attempt-detail-page space-y-6">
          <section className="math-hero">
            <div className="relative z-10">
              <p className="math-kicker">Admin diagnostic review</p>
              <h1 className="math-title">Attempt Details</h1>
              <p className="math-subtitle">Review every submitted answer with attempt and completion dates.</p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <InfoCard icon={<UserRound size={20} />} label="Student" value={query.data.student?.studentName || "-"} subValue={`${query.data.student?.studentCode || "-"} · Class ${query.data.student?.className || "-"} ${query.data.student?.section || ""}`} />
            <InfoCard icon={<BookOpenCheck size={20} />} label="DPS" value={`Lesson ${query.data.dps?.lessonNumber ?? "-"} · DPS ${query.data.dps?.dpsNumber ?? "-"}`} subValue={query.data.dps?.dpsTitle || query.data.assignment?.title || "-"} />
            <InfoCard icon={<CalendarClock size={20} />} label="Attempt Date" value={formatDate(query.data.attemptDate || query.data.startedAt)} subValue="When the student started" />
            <InfoCard icon={<Clock size={20} />} label="Completion Date" value={formatDate(query.data.completedDate || query.data.submittedAt)} subValue={query.data.summary.timeTakenSeconds ? `Time: ${query.data.summary.timeTakenSeconds}s` : "Time: -"} />
          </section>

          <BenchmarkAlert show={query.data.requiresAttention || query.data.summary?.requiresAttention} message={query.data.benchmarkMessage || query.data.summary?.benchmarkMessage} />

          <ResultSummary result={query.data} />

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => router.back()}>
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
              Diagnostic review ready
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <BookOpenCheck size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Question Review</h2>
                <p className="text-slate-600">Question-wise student answer and correct answer.</p>
              </div>
            </div>

            <div className="space-y-5">
              {query.data.questionReview?.map((q) => {
                const statusLabel = q.selectedOption ? (q.isCorrect ? "Correct" : "Wrong") : "Unanswered";

                return (
                  <div key={q.questionId} className="math-card p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-xl font-black text-slate-950">Question {q.questionNumber}</h3>
                      <span className={`math-badge ${q.isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-700" : q.selectedOption ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {q.isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mt-5 rounded-[28px] bg-slate-50/90 p-6">
                      <VerticalQuestion operands={q.operands} operators={q.operators} />
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-2">
                      <div className={`rounded-[22px] p-4 ${q.isCorrect ? "bg-emerald-50 text-emerald-900" : q.selectedOption ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
                        <p className="text-xs font-extrabold uppercase tracking-[0.14em]">Student answer</p>
                        <p className="mt-2 text-lg font-black">
                          {q.selectedOption ? `${q.selectedOption.label}. ${q.selectedOption.value}` : "Not Answered"}
                        </p>
                      </div>

                      <div className="rounded-[22px] bg-emerald-50 p-4 text-emerald-900">
                        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Correct answer</p>
                        <p className="mt-2 text-lg font-black">{q.correctOption ? `${q.correctOption.label}. ${q.correctOption.value}` : "Hidden"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ icon, label, value, subValue }: { icon: React.ReactNode; label: string; value: string; subValue: string }) {
  return (
    <div className="math-card math-admin-attempt-info-card p-5">
      <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">{icon}</div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{subValue}</p>
    </div>
  );
}
