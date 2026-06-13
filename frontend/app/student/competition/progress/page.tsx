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

function ConceptProgress({ concept, accuracy, isStrong }: { concept: string; accuracy: number; isStrong: boolean }) {
  return (
    <div className={classNames(
      "group relative flex flex-col gap-2 rounded-2xl border p-4 transition-all hover:shadow-md",
      isStrong 
        ? "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20" 
        : "border-rose-100 bg-rose-50/50 hover:bg-rose-50 dark:border-rose-900/30 dark:bg-rose-900/10 dark:hover:bg-rose-900/20"
    )}>
      <div className="flex items-start justify-between gap-4">
        <span className={classNames(
          "text-sm font-bold leading-tight",
          isStrong ? "text-emerald-900 dark:text-emerald-100" : "text-rose-900 dark:text-rose-100"
        )}>
          {concept}
        </span>
        <span className={classNames(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums",
          isStrong 
            ? "bg-emerald-200/50 text-emerald-800 dark:bg-emerald-800/50 dark:text-emerald-200" 
            : "bg-rose-200/50 text-rose-800 dark:bg-rose-800/50 dark:text-rose-200"
        )}>
          {Math.round(accuracy)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-700/50">
        <div 
          className={classNames(
            "h-full rounded-full transition-all duration-1000",
            isStrong ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"
          )}
          style={{ width: `${accuracy}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, gradient, highlight }: { icon: ReactNode, label: string, value: string | number, gradient: string, highlight?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800/50 dark:bg-slate-900/50">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ backgroundImage: gradient }} />
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={classNames(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            highlight ? "bg-[var(--math-role-primary)] text-white shadow-lg shadow-[var(--math-role-primary)]/30" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          )}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</span>
        </div>
        <span className={classNames(
          "text-2xl font-black tabular-nums tracking-tight",
          highlight ? "text-[var(--math-role-primary)]" : "text-slate-900 dark:text-white"
        )}>
          {value}
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
      <section className="space-y-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-[var(--math-role-primary)]/10 bg-gradient-to-br from-white via-white to-[var(--math-role-primary)]/5 p-8 shadow-sm dark:from-slate-950 dark:via-slate-950 dark:to-[var(--math-role-primary)]/10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--math-role-primary)]/10 blur-[80px]" />
          
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--math-role-primary)]/10 text-[var(--math-role-primary)] backdrop-blur-md">
              <Trophy size={20} />
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-[var(--math-role-primary)]">Competition</p>
          </div>
          <h1 className="relative z-10 mt-6 text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Progress Insights
          </h1>
          <p className="relative z-10 mt-4 max-w-2xl text-base font-medium leading-relaxed text-slate-600 dark:text-slate-400">
            Track your mock exam trajectory. Master your strengths, eliminate your weaknesses, and perfect your timing.
          </p>
        </div>

        {!ready || query.isLoading ? (
          <LoadingState message="Analyzing your mock performances..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/50 bg-white p-16 text-center shadow-sm dark:border-slate-800/50 dark:bg-slate-900/50">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
              <BarChart3 size={40} strokeWidth={1.5} />
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-900 dark:text-white">No Insights Yet</h2>
            <p className="mt-3 text-base font-medium text-slate-500 dark:text-slate-400">
              Complete your first mock exam to unlock your personalized performance analytics dashboard.
            </p>
          </div>
        ) : query.data ? (
          <div className="grid gap-8 lg:grid-cols-12">
            
            {/* Overview Column */}
            <div className="space-y-6 lg:col-span-5 xl:col-span-4">
              <div className="flex items-center gap-3 px-1">
                <BarChart3 className="text-[var(--math-role-primary)]" size={20} />
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Track Record</h2>
              </div>
              
              <div className="space-y-4">
                <StatCard 
                  icon={<TrendingUp size={20} />} 
                  label="Average Score" 
                  value={query.data.overallScore} 
                  gradient="linear-gradient(to right, #3b82f6, #8b5cf6)" 
                  highlight
                />
                <StatCard 
                  icon={<Target size={20} />} 
                  label="Average Accuracy" 
                  value={`${query.data.overallAccuracy}%`} 
                  gradient="linear-gradient(to right, #10b981, #3b82f6)" 
                />
                <StatCard 
                  icon={<Trophy size={20} />} 
                  label="Total Attempts" 
                  value={query.data.totalMocksAttempted} 
                  gradient="linear-gradient(to right, #f59e0b, #ef4444)" 
                />
                <StatCard 
                  icon={<Clock size={20} />} 
                  label="Time / Question" 
                  value={FormatDuration(query.data.averageTimePerQuestion)} 
                  gradient="linear-gradient(to right, #6366f1, #ec4899)" 
                />
                <StatCard 
                  icon={<Gauge size={20} />} 
                  label="Time Utilization" 
                  value={`${query.data.overallTimeUtilization}%`} 
                  gradient="linear-gradient(to right, #14b8a6, #3b82f6)" 
                />
              </div>
            </div>

            {/* Concepts Column */}
            <div className="space-y-6 lg:col-span-7 xl:col-span-8">
              <div className="flex items-center gap-3 px-1">
                <BrainCircuit className="text-[var(--math-role-primary)]" size={20} />
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Concept Mastery</h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Strengths */}
                <div className="flex flex-col rounded-[2rem] border border-emerald-200/50 bg-white p-6 shadow-sm dark:border-emerald-900/30 dark:bg-slate-900/50">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Top Strengths</h3>
                      <p className="text-xs font-semibold text-slate-500">Mastered concepts (≥70%)</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    {query.data.strongConcepts.length > 0 ? (
                      query.data.strongConcepts.slice(0, 5).map((c) => (
                        <ConceptProgress key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={true} />
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                        <p className="text-sm font-medium text-slate-400">Keep practicing to build strengths.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Weaknesses */}
                <div className="flex flex-col rounded-[2rem] border border-rose-200/50 bg-white p-6 shadow-sm dark:border-rose-900/30 dark:bg-slate-900/50">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">Areas to Improve</h3>
                      <p className="text-xs font-semibold text-slate-500">Needs focus (&lt;70%)</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    {query.data.weakConcepts.length > 0 ? (
                      query.data.weakConcepts.slice(0, 5).map((c) => (
                        <ConceptProgress key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={false} />
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
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
