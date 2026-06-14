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
  Sparkles,
  ChevronDown
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
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
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
        {icon}
      </div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {value}
      </p>
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
    <div className="group relative flex items-center justify-between rounded-2xl p-3 transition-all duration-300 hover:bg-white/80 dark:hover:bg-slate-800/60">
      <span className="relative z-10 truncate pr-4 text-sm font-bold text-slate-700 transition-all duration-300 group-hover:translate-x-1 group-hover:text-slate-950 dark:text-slate-300 dark:group-hover:text-white">
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

  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});

  const groupedInsights = useMemo(() => {
    if (!query.data?.moduleInsights) return [];
    
    const modulesMap = new Map<string, {
      moduleId: string;
      moduleCode: string;
      moduleName: string;
      levels: typeof query.data.moduleInsights;
    }>();

    for (const insight of query.data.moduleInsights) {
      if (!modulesMap.has(insight.moduleId)) {
        modulesMap.set(insight.moduleId, {
          moduleId: insight.moduleId,
          moduleCode: insight.moduleCode,
          moduleName: insight.moduleName,
          levels: []
        });
      }
      modulesMap.get(insight.moduleId)!.levels.push(insight);
    }

    return Array.from(modulesMap.values());
  }, [query.data?.moduleInsights]);

  return (
    <AppShell title="Competition Progress">
      <section className="relative mx-auto w-full max-w-[1680px] space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8 2xl:px-10">
        
        {/* Thematic Hero Header */}
        <section className="math-hero relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out" style={{ animationFillMode: 'both' }}>
          {/* Subtle Gamified Shimmer across the hero */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60" style={{ animation: 'mathShimmer 6s infinite linear' }} />
          
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 shadow-sm backdrop-blur-md dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400">
            <Sparkles size={13} strokeWidth={2.5} />
            <span>Progress Insights</span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Mock History
          </h1>
          <p className="mt-2 w-full text-sm leading-6 text-slate-600 dark:text-slate-300">
            Overview of your mock exam performance and concept mastery. Uncover your strengths and target your areas for improvement.
          </p>

          {query.data && query.data.totalMocksAttempted > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <CompactProgressMetric label="Average Score" value={Math.round(query.data.overallScore)} icon={<TrendingUp size={20} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Average Accuracy" value={`${Math.round(query.data.overallAccuracy)}%`} icon={<Target size={20} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Total Attempts" value={query.data.totalMocksAttempted} icon={<Trophy size={20} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Time / Question" value={FormatDuration(query.data.averageTimePerQuestion)} icon={<Clock size={20} strokeWidth={2.5} />} />
              <CompactProgressMetric label="Time Utilization" value={`${query.data.overallTimeUtilization}%`} icon={<Gauge size={20} strokeWidth={2.5} />} />
            </div>
          )}
        </section>

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
          <div className="math-card overflow-hidden p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="math-kicker">Mock Insights</p>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">Competition Mock Performance</h2>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {groupedInsights.map((moduleGroup, mIdx) => {
                const moduleOpen = expandedModules[moduleGroup.moduleId] ?? true;
                
                return (
                  <div key={moduleGroup.moduleId} className="math-hierarchy-panel p-5 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out" style={{ animationFillMode: 'both', animationDelay: `${mIdx * 150}ms` }}>
                    <button
                      type="button"
                      className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                      onClick={() => setExpandedModules((prev) => ({ ...prev, [moduleGroup.moduleId]: !moduleOpen }))}
                    >
                      <div className="text-left">
                        <p className="math-kicker">Module</p>
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">
                          {moduleGroup.moduleCode}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                          <ChevronDown className={moduleOpen ? "rotate-180 transition" : "transition"} size={18} />
                        </span>
                      </div>
                    </button>

                    {moduleOpen && (
                      <div className="mt-4 grid gap-4">
                        {moduleGroup.levels.map((insight, lIdx) => {
                          const levelKey = `${insight.moduleId}-${insight.levelId}`;
                          const levelOpen = expandedLevels[levelKey] ?? true;
                          
                          return (
                            <div key={levelKey} className="math-hierarchy-panel-soft p-4">
                              <button
                                type="button"
                                className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                                onClick={() => setExpandedLevels((prev) => ({ ...prev, [levelKey]: !levelOpen }))}
                              >
                                <div className="text-left">
                                  <p className="math-kicker">Level</p>
                                  <h4 className="text-base font-black text-slate-950 dark:text-white">
                                    {insight.levelCode}
                                  </h4>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                                    <ChevronDown className={levelOpen ? "rotate-180 transition" : "transition"} size={18} />
                                  </span>
                                </div>
                              </button>

                              {levelOpen && (
                                <div className="mt-6 grid gap-6 lg:grid-cols-2 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
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
