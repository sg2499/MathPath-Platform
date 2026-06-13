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
  TrendingUp,
  Target,
  Trophy,
  Clock,
  Gauge,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { ReactNode } from "react";

function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

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

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl p-5 shadow-sm dark:bg-slate-900/50 dark:border-slate-800">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        <div className="[&>svg]:h-4 [&>svg]:w-4">{icon}</div>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function ConceptRow({ concept, accuracy, isStrong }: { concept: string; accuracy: number; isStrong: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50">
      <span className="text-sm font-medium text-slate-700 truncate pr-4 dark:text-slate-300">
        {concept}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:block w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
          <div
            className={classNames(
              "h-full rounded-full",
              isStrong ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"
            )}
            style={{ width: `${accuracy}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-slate-900 tabular-nums w-10 text-right dark:text-white">
          {Math.round(accuracy)}%
        </span>
      </div>
    </div>
  );
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
      <div className="mx-auto max-w-6xl space-y-8 pb-12">
        
        {/* Header - No box, just clean text */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={16} className="text-[var(--math-role-primary)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--math-role-primary)]">
              Competition
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Progress Insights
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Overview of your mock exam performance and concept mastery.
          </p>
        </div>

        {!ready || query.isLoading ? (
          <LoadingState message="Loading insights..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-20 px-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4 dark:bg-slate-800/50 dark:text-slate-500">
              <BarChart3 size={24} />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No data available</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Complete your first mock exam to generate performance analytics.
            </p>
          </div>
        ) : query.data ? (
          <div className="space-y-8">
            
            {/* Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <MetricCard label="Average Score" value={query.data.overallScore} icon={<TrendingUp />} />
              <MetricCard label="Average Accuracy" value={`${query.data.overallAccuracy}%`} icon={<Target />} />
              <MetricCard label="Total Attempts" value={query.data.totalMocksAttempted} icon={<Trophy />} />
              <MetricCard label="Time / Question" value={FormatDuration(query.data.averageTimePerQuestion)} icon={<Clock />} />
              <MetricCard label="Time Utilization" value={`${query.data.overallTimeUtilization}%`} icon={<Gauge />} />
            </div>

            {/* Concept Mastery Columns */}
            <div className="grid gap-6 lg:grid-cols-2">
              
              {/* Strengths */}
              <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/80">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Strengths</h3>
                  <span className="text-xs text-slate-500 ml-auto">&ge; 70%</span>
                </div>
                <div className="p-2 flex flex-col min-h-[200px]">
                  {query.data.strongConcepts.length > 0 ? (
                    query.data.strongConcepts.map((c) => (
                      <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={true} />
                    ))
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-400">
                      No strengths identified yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Weaknesses */}
              <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/80">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Areas to Improve</h3>
                  <span className="text-xs text-slate-500 ml-auto">&lt; 70%</span>
                </div>
                <div className="p-2 flex flex-col min-h-[200px]">
                  {query.data.weakConcepts.length > 0 ? (
                    query.data.weakConcepts.map((c) => (
                      <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={false} />
                    ))
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-400">
                      No major weak areas detected.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
