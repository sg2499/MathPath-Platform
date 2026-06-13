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
import { useState, useEffect } from "react";
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

function CompactProgressMetric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="math-student-metric-card p-4">
      <div className="flex items-center gap-2">
        <span className="math-student-icon-chip flex h-8 w-8 items-center justify-center rounded-xl">
          {icon}
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 dark:text-white">{label}</p>
      </div>
      <p className="mt-3 truncate text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function ConceptRow({ concept, accuracy, isStrong }: { concept: string; accuracy: number; isStrong: boolean }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(accuracy), 100);
    return () => clearTimeout(timer);
  }, [accuracy]);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50">
      <span className="text-sm font-semibold text-slate-700 truncate pr-4 dark:text-slate-300">
        {concept}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:block w-24 h-2 bg-slate-100/80 rounded-full overflow-hidden shadow-inner dark:bg-slate-800">
          <div
            className={classNames(
              "h-full rounded-full transition-all duration-1000 ease-out",
              isStrong ? "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-600 dark:to-emerald-400" : "bg-gradient-to-r from-rose-400 to-rose-500 dark:from-rose-600 dark:to-rose-400"
            )}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className={classNames(
          "text-sm font-black tabular-nums w-12 text-right",
          isStrong ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
        )}>
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
      <section className="w-full space-y-5 pb-12">
        
        {/* Thematic Hero Header */}
        <div className="math-hero">
          <div>
            <p className="math-kicker">Competition History</p>
            <h1 className="math-title">Progress Insights</h1>
            <p className="math-subtitle">
              Overview of your mock exam performance and concept mastery.
            </p>
          </div>
          
          {query.data && query.data.totalMocksAttempted > 0 && (
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
              <CompactProgressMetric label="Avg Score" value={query.data.overallScore} icon={<TrendingUp size={14} />} />
              <CompactProgressMetric label="Accuracy" value={`${query.data.overallAccuracy}%`} icon={<Target size={14} />} />
              <CompactProgressMetric label="Total Attempts" value={query.data.totalMocksAttempted} icon={<Trophy size={14} />} />
              <CompactProgressMetric label="Time / Q" value={FormatDuration(query.data.averageTimePerQuestion)} icon={<Clock size={14} />} />
              <CompactProgressMetric label="Time Util" value={`${query.data.overallTimeUtilization}%`} icon={<Gauge size={14} />} />
            </div>
          )}
        </div>

        {!ready || query.isLoading ? (
          <LoadingState label="Loading insights..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-[var(--math-role-primary)]/20 bg-white/85 py-20 px-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="math-student-icon-chip flex h-16 w-16 items-center justify-center rounded-2xl mb-4">
              <BarChart3 size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">No data available</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Complete your first mock exam to generate performance analytics.
            </p>
          </div>
        ) : query.data ? (
          <div className="grid gap-5 lg:grid-cols-2">
            
            {/* Strengths */}
            <div className="flex flex-col rounded-[28px] border border-[var(--math-role-primary)]/20 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Strengths</h3>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">&ge; 70% Accuracy</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-1 min-h-[200px]">
                {query.data.strongConcepts.length > 0 ? (
                  query.data.strongConcepts.map((c) => (
                    <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={true} />
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center p-6 text-sm font-semibold text-slate-400">
                    No strengths identified yet. Keep practicing!
                  </div>
                )}
              </div>
            </div>

            {/* Weaknesses */}
            <div className="flex flex-col rounded-[28px] border border-[var(--math-role-primary)]/20 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Areas to Improve</h3>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">&lt; 70% Accuracy</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-1 min-h-[200px]">
                {query.data.weakConcepts.length > 0 ? (
                  query.data.weakConcepts.map((c) => (
                    <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={false} />
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center p-6 text-sm font-semibold text-slate-400">
                    No major weak areas detected. Great job!
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
