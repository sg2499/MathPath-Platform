"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getCompetitionProgressInsights } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Gauge,
  Target,
  TrendingUp,
  BrainCircuit,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "@/components/common/DetailWorkspaceViews";

function FormatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) {
    return `${minutes}m ${secs}s`;
  }
  if (minutes) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}

export default function StudentCompetitionProgressPage() {
  const ready = useProtectedPage(["STUDENT"]);

  const query = useQuery({
    queryKey: ["student-competition-progress-insights"],
    queryFn: getCompetitionProgressInsights,
    enabled: ready,
  });

  return (
    <AppShell title="Competition Progress">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Progress</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Review mock-exam performance, strengths, weak areas, speed, accuracy, and improvement trends for competition preparation.
          </p>
        </div>

        {!ready || query.isLoading ? (
          <LoadingState message="Loading insights..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="math-card flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <Trophy size={32} />
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-900 dark:text-white">No Mock Exams Completed</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Complete your first mock exam to unlock detailed performance insights.
            </p>
          </div>
        ) : query.data ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <FeatureCard
              icon={<BarChart3 size={18} />}
              title="Performance Summary"
              description="Your overall mock exam track record."
            >
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="text-[var(--math-role-primary)]" size={20} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Average Score</span>
                  </div>
                  <span className="text-xl font-black text-slate-950 dark:text-white">
                    {query.data.overallScore}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <Target className="text-[var(--math-role-primary)]" size={20} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Average Accuracy</span>
                  </div>
                  <span className="text-xl font-black text-slate-950 dark:text-white">
                    {query.data.overallAccuracy}%
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <Trophy className="text-[var(--math-role-primary)]" size={20} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Total Attempts</span>
                  </div>
                  <span className="text-xl font-black text-slate-950 dark:text-white">
                    {query.data.totalMocksAttempted}
                  </span>
                </div>
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<BrainCircuit size={18} />}
              title="Strengths & Weak Areas"
              description="Concept-wise performance breakdown."
            >
              <div className="mt-6 space-y-6">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={16} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Strong Concepts</h3>
                  </div>
                  {query.data.strongConcepts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {query.data.strongConcepts.slice(0, 5).map((c) => (
                        <Chip key={c.concept} label={`${c.concept} (${Math.round(c.accuracy)}%)`} tone="green" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Not enough data to determine strengths.</p>
                  )}
                </div>
                <div>
                  <div className="mb-3 flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={16} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Areas to Improve</h3>
                  </div>
                  {query.data.weakConcepts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {query.data.weakConcepts.slice(0, 5).map((c) => (
                        <Chip key={c.concept} label={`${c.concept} (${Math.round(c.accuracy)}%)`} tone="red" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No major weak areas detected yet!</p>
                  )}
                </div>
              </div>
            </FeatureCard>

            <FeatureCard
              icon={<Gauge size={18} />}
              title="Time Utilization"
              description="How effectively you manage exam time."
            >
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <Clock className="text-[var(--math-role-primary)]" size={20} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Time Per Question</span>
                  </div>
                  <span className="text-xl font-black text-slate-950 dark:text-white">
                    {FormatDuration(query.data.averageTimePerQuestion)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <Gauge className="text-[var(--math-role-primary)]" size={20} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Time Utilization</span>
                  </div>
                  <span className="text-xl font-black text-slate-950 dark:text-white">
                    {query.data.overallTimeUtilization}%
                  </span>
                </div>
              </div>
            </FeatureCard>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <article className="math-card flex flex-col p-5">
      <div className="flex items-center gap-3 text-[var(--math-role-primary)]">
        {icon}
        <h2 className="text-base font-black text-slate-950 dark:text-white">{title}</h2>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      <div className="mt-auto flex-1">{children}</div>
    </article>
  );
}
