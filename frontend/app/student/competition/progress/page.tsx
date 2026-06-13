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

function Metric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="flex flex-col justify-center p-6 sm:p-8 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-4">
        <div className="[&>svg]:h-4 [&>svg]:w-4">{icon}</div>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{label}</span>
      </div>
      <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function ConceptRow({ concept, accuracy, isStrong }: { concept: string; accuracy: number; isStrong: boolean }) {
  return (
    <div className="group flex items-center justify-between py-5 border-b border-slate-100 last:border-0 dark:border-slate-800/50">
      <div className="flex-1 pr-6">
        <h4 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{concept}</h4>
        <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800/80">
          <div
            className={classNames(
              "h-full rounded-full transition-all duration-1000",
              isStrong ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"
            )}
            style={{ width: `${accuracy}%` }}
          />
        </div>
      </div>
      <span
        className={classNames(
          "text-sm font-black tabular-nums",
          isStrong ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        )}
      >
        {Math.round(accuracy)}%
      </span>
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
      <section className="mx-auto max-w-7xl space-y-10">
        
        {/* Header Section */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-200/50 p-8 shadow-sm dark:bg-slate-900/50 dark:border-slate-800/50">
          <div className="absolute top-0 right-0 h-full w-full bg-gradient-to-br from-transparent to-[var(--math-role-primary)]/5 dark:to-[var(--math-role-primary)]/10" />
          
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-[var(--math-role-primary)]" />
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--math-role-primary)]">
                Competition
              </p>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              Progress Insights
            </h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400 mt-2">
              Track your mock exam trajectory. Master your strengths, eliminate your weaknesses, and perfect your timing.
            </p>
          </div>
        </div>

        {!ready || query.isLoading ? (
          <LoadingState message="Analyzing your mock performances..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="rounded-[2rem] border border-slate-200/50 bg-white p-16 text-center shadow-sm dark:border-slate-800/50 dark:bg-slate-900/50">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
              <BarChart3 size={32} strokeWidth={1.5} />
            </div>
            <h2 className="mt-6 text-xl font-black tracking-tight text-slate-900 dark:text-white">No Insights Yet</h2>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              Complete your first mock exam to unlock your personalized performance analytics.
            </p>
          </div>
        ) : query.data ? (
          <div className="space-y-10">
            
            {/* Track Record / Metric Grid */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2 px-2">
                <BarChart3 className="text-[var(--math-role-primary)]" size={16} /> Track Record
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border border-slate-200/60 rounded-[2rem] bg-white overflow-hidden shadow-sm dark:divide-slate-800/60 dark:border-slate-800/60 dark:bg-slate-900/40">
                <Metric label="Score" value={query.data.overallScore} icon={<TrendingUp />} />
                <Metric label="Accuracy" value={`${query.data.overallAccuracy}%`} icon={<Target />} />
                <Metric label="Attempts" value={query.data.totalMocksAttempted} icon={<Trophy />} />
                <Metric label="Time / Q" value={FormatDuration(query.data.averageTimePerQuestion)} icon={<Clock />} />
                <Metric label="Time Util" value={`${query.data.overallTimeUtilization}%`} icon={<Gauge />} />
              </div>
            </div>

            {/* Concept Mastery Lists */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2 px-2">
                <BrainCircuit className="text-[var(--math-role-primary)]" size={16} /> Concept Mastery
              </h2>

              <div className="grid gap-6 lg:grid-cols-2">
                
                {/* Strengths */}
                <div className="flex flex-col rounded-[2rem] border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Top Strengths</h3>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">Mastered (≥70%)</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 size={20} />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    {query.data.strongConcepts.length > 0 ? (
                      query.data.strongConcepts.slice(0, 5).map((c) => (
                        <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={true} />
                      ))
                    ) : (
                      <div className="flex items-center justify-center py-12">
                        <p className="text-sm font-medium text-slate-400">Keep practicing to build strengths.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Weaknesses */}
                <div className="flex flex-col rounded-[2rem] border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Areas to Improve</h3>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">Needs Focus (&lt;70%)</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                      <AlertTriangle size={20} />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    {query.data.weakConcepts.length > 0 ? (
                      query.data.weakConcepts.slice(0, 5).map((c) => (
                        <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={false} />
                      ))
                    ) : (
                      <div className="flex items-center justify-center py-12">
                        <p className="text-sm font-medium text-slate-400">No major weak areas detected!</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
