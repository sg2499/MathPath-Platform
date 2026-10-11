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
import { getAdminAttemptResult } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, Clock, Stethoscope, UserRound } from "lucide-react";
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
              <p className="math-block-header"><Stethoscope size={14} />Admin diagnostic review</p>
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

          <ResultReviewTabs Questions={ToPracticeReviewQuestions(query.data.questionReview as any)} Viewer="ADMIN" />
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
