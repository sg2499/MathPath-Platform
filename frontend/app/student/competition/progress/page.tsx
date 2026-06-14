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
  Sparkles
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
    <div className="relative overflow-hidden rounded-[24px] border bg-white/40 p-5 shadow-lg backdrop-blur-2xl transition-all duration-300 group hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-slate-950/40" style={{ borderColor: 'var(--math-role-primary)' }}>
      {/* Subtle shine effect on hover */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100 dark:via-white/10" />
      
      <div className="relative z-10 flex items-center gap-3">
        <span 
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm border dark:bg-slate-900"
          style={{ color: 'var(--math-role-primary)', borderColor: 'var(--math-role-primary)' }}
        >
          {icon}
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="relative z-10 mt-4 truncate text-3xl font-black tracking-tight text-slate-900 drop-shadow-sm dark:text-white">{value}</p>
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
    <div className="group relative flex items-center justify-between rounded-2xl p-3 transition-all duration-300 hover:bg-white/60 dark:hover:bg-slate-800/40">
      <span className="relative z-10 truncate pr-4 text-sm font-bold text-slate-700 transition-colors group-hover:text-slate-950 dark:text-slate-300 dark:group-hover:text-white">
        {concept}
      </span>
      <div className="relative z-10 flex shrink-0 items-center gap-4">
        <div className="hidden h-2.5 w-28 overflow-hidden rounded-full bg-slate-200/50 shadow-inner dark:bg-slate-800 sm:block">
          <div
            className={classNames(
              "relative h-full rounded-full transition-all duration-1000 ease-out",
              isStrong ? "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400" : "bg-gradient-to-r from-rose-400 to-rose-500 dark:from-rose-500 dark:to-rose-400"
            )}
            style={{ width: `${width}%` }}
          >
            {/* Shimmer overlay */}
            <div 
              className="absolute inset-0 w-full"
              style={{
                backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                animation: 'mathShimmer 2.5s infinite linear'
              }}
            />
          </div>
        </div>
        <span className={classNames(
          "w-12 text-right text-sm font-black tabular-nums tracking-tight",
          isStrong ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
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
      <section className="relative mx-auto w-full max-w-[1680px] space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8 2xl:px-10">
        
        {/* Thematic Hero Header with Visual Magic */}
        <div 
          className="relative overflow-hidden rounded-[36px] border bg-white/60 p-6 shadow-2xl backdrop-blur-3xl transition duration-300 dark:border-slate-700/50 dark:bg-slate-900/60 sm:p-8"
          style={{ borderColor: 'var(--math-role-primary)' }}
        >
          
          {/* Animated Background Blobs */}
          <div className="absolute -left-20 top-0 h-64 w-64 rounded-full opacity-20 blur-[80px]" style={{ animation: 'mathBlobPulse 8s infinite alternate', backgroundColor: 'var(--math-role-primary)' }} />
          <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-amber-400 opacity-20 blur-[80px]" style={{ animation: 'mathBlobPulse 10s infinite alternate-reverse' }} />
          
          {/* CSS Noise Texture */}
          <div className="math-noise-bg mix-blend-soft-light" />

          <div className="relative z-10 mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/50 px-4 py-1.5 backdrop-blur-md" style={{ borderColor: 'var(--math-role-primary)', color: 'var(--math-role-primary)' }}>
              <Sparkles size={14} />
              <p className="text-[10px] font-black uppercase tracking-[0.24em]">Progress Insights</p>
            </div>
            <h1 
              className="mt-4 text-6xl font-black tracking-tight drop-shadow-sm sm:text-7xl"
              style={{ color: 'var(--ink)' }}
            >
              MOCK HISTORY
            </h1>
            <p className="mt-4 w-full text-base font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
              Overview of your mock exam performance and concept mastery. Uncover your strengths and target your areas for improvement.
            </p>
          </div>
          
          {query.data && query.data.totalMocksAttempted > 0 && (
            <div className="relative z-10 grid grid-cols-2 gap-3 xl:grid-cols-5">
              <CompactProgressMetric label="Average Score" value={query.data.overallScore} icon={<TrendingUp size={16} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Average Accuracy" value={`${query.data.overallAccuracy}%`} icon={<Target size={16} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Total Attempts" value={query.data.totalMocksAttempted} icon={<Trophy size={16} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Time / Question" value={FormatDuration(query.data.averageTimePerQuestion)} icon={<Clock size={16} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Time Utilization" value={`${query.data.overallTimeUtilization}%`} icon={<Gauge size={16} strokeWidth={2.5} />} />
            </div>
          )}
        </div>

        {!ready || query.isLoading ? (
          <LoadingState label="Conjuring your insights..." />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} />
        ) : query.data?.totalMocksAttempted === 0 ? (
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--math-role-primary)]/20 bg-white/60 p-12 text-center shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/60">
            <div className="math-noise-bg mix-blend-overlay" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[32px] bg-gradient-to-br from-white to-[var(--math-role-primary)]/20 shadow-lg ring-1 ring-[var(--math-role-primary)]/20 dark:from-slate-800 dark:to-[var(--math-role-primary)]/30">
                <BarChart3 className="text-[var(--math-role-primary)]" size={40} />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Awaiting Your First Challenge</h2>
              <p className="mt-3 max-w-md text-sm font-semibold text-slate-500 dark:text-slate-400">
                Complete your first mock exam to unlock magical insights, performance analytics, and mastery tracking.
              </p>
            </div>
          </div>
        ) : query.data ? (
          <div className="space-y-12">
            {query.data.moduleInsights.map((insight) => (
              <div key={`${insight.moduleId}-${insight.levelId}`} className="relative space-y-6">
                
                <div className="flex flex-col border-l-4 border-[var(--math-role-primary)] pl-4">
                   <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                     {insight.moduleCode} <span className="mx-1 text-slate-300 dark:text-slate-600">&bull;</span> {insight.moduleName}
                   </h3>
                   <p className="mt-1 text-xs font-black uppercase tracking-[0.25em] text-[var(--math-role-primary)]">
                     Level: {insight.levelCode}
                   </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Strengths Card */}
                  <div className="group relative flex flex-col overflow-hidden rounded-[32px] border border-emerald-500/20 bg-white/60 p-6 shadow-xl backdrop-blur-2xl transition-all duration-300 hover:shadow-emerald-500/10 dark:border-emerald-500/10 dark:bg-slate-950/60 sm:p-8">
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-[60px] transition-all duration-500 group-hover:bg-emerald-400/20" />
                    
                    <div className="relative z-10 mb-8 flex items-center gap-4 border-b border-emerald-100 pb-5 dark:border-emerald-900/30">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 shadow-sm ring-1 ring-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/40 dark:text-emerald-400 dark:ring-emerald-700/50">
                        <CheckCircle2 size={24} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Strengths</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600/70 dark:text-emerald-400/70">&ge; 70% Accuracy</p>
                      </div>
                    </div>
                    
                    <div className="relative z-10 flex min-h-[240px] flex-col gap-1">
                      {insight.strongConcepts.length > 0 ? (
                        insight.strongConcepts.map((c) => (
                          <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={true} />
                        ))
                      ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <Sparkles className="opacity-20" size={32} />
                            <p>No shining strengths identified yet. Keep practicing!</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Weaknesses Card */}
                  <div className="group relative flex flex-col overflow-hidden rounded-[32px] border border-rose-500/20 bg-white/60 p-6 shadow-xl backdrop-blur-2xl transition-all duration-300 hover:shadow-rose-500/10 dark:border-rose-500/10 dark:bg-slate-950/60 sm:p-8">
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-rose-400/10 blur-[60px] transition-all duration-500 group-hover:bg-rose-400/20" />
                    
                    <div className="relative z-10 mb-8 flex items-center gap-4 border-b border-rose-100 pb-5 dark:border-rose-900/30">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600 shadow-sm ring-1 ring-rose-200 dark:from-rose-900/40 dark:to-rose-800/40 dark:text-rose-400 dark:ring-rose-700/50">
                        <AlertTriangle size={24} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Areas to Improve</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600/70 dark:text-rose-400/70">&lt; 70% Accuracy</p>
                      </div>
                    </div>
                    
                    <div className="relative z-10 flex min-h-[240px] flex-col gap-1">
                      {insight.weakConcepts.length > 0 ? (
                        insight.weakConcepts.map((c) => (
                          <ConceptRow key={c.concept} concept={c.concept} accuracy={c.accuracy} isStrong={false} />
                        ))
                      ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="opacity-20" size={32} />
                            <p>No major weak areas detected. You're doing amazing!</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {query.data.moduleInsights.length === 0 && (
              <div className="relative overflow-hidden rounded-[32px] border border-[var(--math-role-primary)]/20 bg-white/60 py-20 px-4 text-center shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/60">
                <div className="math-noise-bg mix-blend-overlay" />
                <p className="relative z-10 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  No concept data available yet. Keep completing mock exams!
                </p>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
