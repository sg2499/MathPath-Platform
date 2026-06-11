"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getCompetitionMockResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Clock3, Target, Trophy, XCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

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
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StudentCompetitionMockResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

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

  return (
    <AppShell title="Competition Mock Result">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button className="math-button-secondary mb-4 px-4 py-2 text-sm" onClick={() => router.push("/student/competition/mock-exams")}>
            Back To Mock Exams
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-kicker">Competition Result</p>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`} />
                <Chip label={result.performanceBand || "Completed"} />
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                Submitted {formatDate(result.completedAt || result.submittedAt)}. Competition mocks remain independent from Practice, Assessment Readiness, and Promotion.
              </p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/70 px-6 py-4 text-center dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">Score</p>
              <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">{formatNumber(result.score)}/{formatNumber(result.maxScore)}</p>
              <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{formatNumber(result.percentage)}%</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricCard icon={<Target size={18} />} label="ACCURACY" value={`${formatNumber(result.accuracyPercentage)}%`} helper="Attempted answers" />
          <MetricCard icon={<CheckCircle2 size={18} />} label="CORRECT" value={result.correct} helper={`${result.totalQuestions} total questions`} />
          <MetricCard icon={<XCircle size={18} />} label="UNANSWERED" value={result.unanswered} helper="Scored as zero" />
          <MetricCard icon={<Clock3 size={18} />} label="TIME TAKEN" value={formatDuration(result.timeTakenSeconds)} helper={`${formatNumber(result.timeUtilizationPercentage)}% time used`} />
        </div>

        <div className="math-card overflow-hidden p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="math-kicker">Concept Analysis</p>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Section And Concept Performance</h2>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-orange-100 dark:border-slate-700">
            {(result.conceptPerformance || []).length === 0 ? (
              <div className="p-5 text-sm font-bold text-slate-700 dark:text-slate-300">No concept analysis is available for this mock yet.</div>
            ) : (
              <div className="divide-y divide-orange-100 dark:divide-slate-700">
                {result.conceptPerformance.map((item) => (
                  <div key={item.concept} className="grid gap-2 p-4 text-sm font-bold text-slate-800 dark:text-slate-100 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span>{item.concept}</span>
                    <span>{item.correct}/{item.total} Correct</span>
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                      {formatNumber(item.percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <InsightCard title="Strengths" items={result.conceptStrengths || []} empty="No strong areas identified yet." />
          <InsightCard title="Weak Areas" items={result.conceptWeaknesses || []} empty="No weak areas identified from this mock." />
        </div>
      </section>
    </AppShell>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
      {label}
    </span>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <article className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-orange-50 p-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">{helper}</p>
    </article>
  );
}

function InsightCard({ title, items, empty }: { title: string; items: Array<{ concept: string; correct: number; total: number; percentage: number }>; empty: string }) {
  return (
    <article className="math-card p-5">
      <p className="math-kicker">Result Insight</p>
      <h3 className="text-lg font-black text-slate-950 dark:text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-4 rounded-[20px] border border-orange-100 bg-orange-50/50 p-4 text-sm font-bold text-slate-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-slate-300">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <div key={item.concept} className="flex items-center justify-between rounded-[18px] border border-orange-100 bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
              <span>{item.concept}</span>
              <span>{formatNumber(item.percentage)}%</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
