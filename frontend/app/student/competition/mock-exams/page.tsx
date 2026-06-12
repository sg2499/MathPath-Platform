"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getStudentCompetitionMockAssignments,
  startCompetitionMockAttempt,
  type StudentCompetitionMockAssignment,
} from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ClipboardPlus,
  Eye,
  Layers3,
  PlayCircle,
  Search,
  Target,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function FormatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) return `${minutes} Mins ${secs} Secs`;
  if (minutes) return `${minutes} Mins`;
  return `${secs} Secs`;
}

function FormatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function FormatScore(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function IsCompleted(assignment: StudentCompetitionMockAssignment) {
  return assignment.status === "COMPLETED" || assignment.latestAttemptStatus === "SUBMITTED";
}

function IsInProgress(assignment: StudentCompetitionMockAssignment) {
  return assignment.status === "IN_PROGRESS" && Boolean(assignment.latestAttemptId);
}

function AccuracyValue(assignment: StudentCompetitionMockAssignment) {
  const result = assignment.latestResult;
  if (!IsCompleted(assignment) || !result) return null;
  const value = result.accuracyPercentage ?? result.percentage;
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function ScoreValue(assignment: StudentCompetitionMockAssignment) {
  const result = assignment.latestResult;
  if (!IsCompleted(assignment) || !result) return null;
  if (result.score === null || result.score === undefined || Number.isNaN(Number(result.score))) return null;
  return Number(result.score);
}

function Average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function AccuracyChipClasses(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  if (value < 60) return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200";
  if (value < 80) return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200";
  if (value < 90) return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-200";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200";
}

function ScoreChipClasses(value: number | null) {
  return AccuracyChipClasses(value);
}

type LevelGroup = {
  key: string;
  levelCode: string;
  levelName: string;
  assignments: StudentCompetitionMockAssignment[];
  avgAccuracy: number | null;
};

type ModuleGroup = {
  key: string;
  moduleCode: string;
  moduleName: string;
  levels: LevelGroup[];
  avgAccuracy: number | null;
};

function BuildHierarchy(assignments: StudentCompetitionMockAssignment[]): ModuleGroup[] {
  const moduleMap = new Map<string, Map<string, StudentCompetitionMockAssignment[]>>();

  assignments.forEach((assignment) => {
    const exam = assignment.mockExam;
    const moduleKey = exam.moduleId || exam.moduleCode || "module";
    const levelKey = exam.levelId || exam.levelCode || "level";
    if (!moduleMap.has(moduleKey)) moduleMap.set(moduleKey, new Map());
    const levelMap = moduleMap.get(moduleKey)!;
    if (!levelMap.has(levelKey)) levelMap.set(levelKey, []);
    levelMap.get(levelKey)!.push(assignment);
  });

  return Array.from(moduleMap.entries()).map(([moduleKey, levelMap]) => {
    const allModuleAssignments = Array.from(levelMap.values()).flat();
    const firstModuleExam = allModuleAssignments[0]?.mockExam;
    const levels = Array.from(levelMap.entries()).map(([levelKey, levelAssignments]) => {
      const firstLevelExam = levelAssignments[0]?.mockExam;
      return {
        key: `${moduleKey}-${levelKey}`,
        levelCode: firstLevelExam?.levelCode || "Level",
        levelName: firstLevelExam?.levelName || firstLevelExam?.levelCode || "Level",
        assignments: [...levelAssignments].sort((left, right) => new Date(right.assignedAt || 0).getTime() - new Date(left.assignedAt || 0).getTime()),
        avgAccuracy: Average(levelAssignments.map(AccuracyValue)),
      };
    });
    return {
      key: moduleKey,
      moduleCode: firstModuleExam?.moduleCode || "Module",
      moduleName: firstModuleExam?.moduleName || firstModuleExam?.moduleCode || "Module",
      levels,
      avgAccuracy: Average(allModuleAssignments.map(AccuracyValue)),
    };
  });
}

export default function StudentCompetitionMockExamsPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const router = useRouter();
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const query = useQuery({
    queryKey: ["student-competition-mock-assignments"],
    queryFn: getStudentCompetitionMockAssignments,
    enabled: ready,
  });

  const startMutation = useMutation({
    mutationFn: (assignmentId: string) => startCompetitionMockAttempt({ assignmentId }),
    onSuccess: (attempt) => router.push(`/student/competition/mock-attempt/${attempt.attemptId}`),
  });

  const assignments = query.data || [];

  const moduleOptions = useMemo(() => {
    const options = new Map<string, string>();
    assignments.forEach((assignment) => {
      const exam = assignment.mockExam;
      const value = exam.moduleCode || exam.moduleName || "Module";
      options.set(value, exam.moduleName ? `${exam.moduleCode || exam.moduleName}` : value);
    });
    return Array.from(options.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [assignments]);

  const levelOptions = useMemo(() => {
    const options = new Map<string, string>();
    assignments
      .filter((assignment) => moduleFilter === "ALL" || assignment.mockExam.moduleCode === moduleFilter || assignment.mockExam.moduleName === moduleFilter)
      .forEach((assignment) => {
        const exam = assignment.mockExam;
        const value = exam.levelCode || exam.levelName || "Level";
        options.set(value, exam.levelName ? `${exam.levelCode || exam.levelName}` : value);
      });
    return Array.from(options.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [assignments, moduleFilter]);

  const filteredAssignments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return assignments.filter((assignment) => {
      const exam = assignment.mockExam;
      const completed = IsCompleted(assignment);
      const statusLabel = completed ? "completed" : "pending";
      const moduleMatches = moduleFilter === "ALL" || exam.moduleCode === moduleFilter || exam.moduleName === moduleFilter;
      const levelMatches = levelFilter === "ALL" || exam.levelCode === levelFilter || exam.levelName === levelFilter;
      const statusMatches = statusFilter === "ALL" || statusLabel === statusFilter.toLowerCase();
      const searchMatches = !normalizedSearch || [
        exam.title,
        exam.mockCode,
        exam.moduleCode,
        exam.moduleName,
        exam.levelCode,
        exam.levelName,
        statusLabel,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      return moduleMatches && levelMatches && statusMatches && searchMatches;
    });
  }, [assignments, searchTerm, moduleFilter, levelFilter, statusFilter]);

  const completedCount = filteredAssignments.filter(IsCompleted).length;
  const pendingCount = Math.max(0, filteredAssignments.length - completedCount);
  const avgScore = Average(filteredAssignments.map(ScoreValue));
  const avgAccuracy = Average(filteredAssignments.map(AccuracyValue));
  const hierarchy = BuildHierarchy(filteredAssignments);

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Competition Mock Exams">
        <LoadingState label="Loading competition mocks..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Exams">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Competition Mock Exams">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Mock Exams</h1>
          <p className="mt-3 max-w-5xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Attempt Admin-assigned mock exams for your current level. Mock preparation is independent from regular Practice, Assessment Readiness, and Promotion.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<ClipboardPlus size={18} />} label="ASSIGNED" value={assignments.length} />
          <MetricCard icon={<PlayCircle size={18} />} label="PENDING" value={pendingCount} />
          <MetricCard icon={<CheckCircle2 size={18} />} label="COMPLETED" value={completedCount} />
          <MetricCard icon={<Trophy size={18} />} label="AVG SCORE" value={avgScore === null ? "-" : FormatScore(avgScore)} />
          <MetricCard icon={<BarChart3 size={18} />} label="AVG ACCURACY" value={avgAccuracy === null ? "-" : `${FormatScore(avgAccuracy)}%`} />
        </div>

        <div className="math-card overflow-hidden p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="math-kicker">Assigned Mocks</p>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Competition Mock Library</h2>
            </div>
            <div className="grid w-full gap-3 lg:w-auto lg:grid-cols-[minmax(220px,1fr)_160px_160px_160px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-700 dark:text-orange-200" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search mock, code, module, level"
                  className="h-12 w-full rounded-2xl border border-orange-100 bg-white/90 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-orange-500 dark:focus:ring-orange-950/40"
                />
              </label>
              <select
                value={moduleFilter}
                onChange={(event) => {
                  setModuleFilter(event.target.value);
                  setLevelFilter("ALL");
                }}
                className="h-12 rounded-2xl border border-orange-100 bg-white/90 px-4 text-sm font-black text-slate-800 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-orange-500 dark:focus:ring-orange-950/40"
              >
                <option value="ALL">All Modules</option>
                {moduleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="h-12 rounded-2xl border border-orange-100 bg-white/90 px-4 text-sm font-black text-slate-800 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-orange-500 dark:focus:ring-orange-950/40"
              >
                <option value="ALL">All Levels</option>
                {levelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-12 rounded-2xl border border-orange-100 bg-white/90 px-4 text-sm font-black text-slate-800 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-orange-500 dark:focus:ring-orange-950/40"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-orange-200 bg-orange-50/70 p-6 text-sm font-bold text-slate-700 dark:border-orange-800/60 dark:bg-orange-950/20 dark:text-slate-200">
              No competition mocks are assigned for your current level yet.
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-orange-200 bg-orange-50/70 p-6 text-sm font-bold text-slate-700 dark:border-orange-800/60 dark:bg-orange-950/20 dark:text-slate-200">
              No competition mocks match the selected filters.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {hierarchy.map((moduleGroup) => {
                const moduleOpen = expandedModules[moduleGroup.key] ?? true;
                return (
                  <div key={moduleGroup.key} className="overflow-hidden rounded-[26px] border border-orange-100 bg-white/88 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-orange-50/80 dark:hover:bg-orange-950/20"
                      onClick={() => setExpandedModules((previous) => ({ ...previous, [moduleGroup.key]: !moduleOpen }))}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200">
                          {moduleOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">MODULE</span>
                          <span className="block truncate text-lg font-black text-slate-950 dark:text-white">{moduleGroup.moduleCode}</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap justify-end gap-2">
                        <AvgAccuracyChip value={moduleGroup.avgAccuracy} />
                        <CountChip value={moduleGroup.levels.reduce((sum, level) => sum + level.assignments.length, 0)} label="Mock" />
                      </span>
                    </button>

                    {moduleOpen ? (
                      <div className="space-y-3 border-t border-orange-100 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-950/20">
                        {moduleGroup.levels.map((levelGroup) => {
                          const levelOpen = expandedLevels[levelGroup.key] ?? true;
                          return (
                            <div key={levelGroup.key} className="overflow-hidden rounded-[22px] border border-orange-100 bg-white/88 dark:border-slate-700 dark:bg-slate-900/70">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-orange-50/80 dark:hover:bg-orange-950/20"
                                onClick={() => setExpandedLevels((previous) => ({ ...previous, [levelGroup.key]: !levelOpen }))}
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200">
                                    {levelOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">LEVEL</span>
                                    <span className="block truncate text-base font-black text-slate-950 dark:text-white">{levelGroup.levelCode}</span>
                                  </span>
                                </span>
                                <span className="flex flex-wrap justify-end gap-2">
                                  <AvgAccuracyChip value={levelGroup.avgAccuracy} />
                                  <CountChip value={levelGroup.assignments.length} label="Mock" />
                                  <StatusCountChip value={levelGroup.assignments.filter(IsCompleted).length} label="Completed" tone="green" />
                                  <StatusCountChip value={Math.max(0, levelGroup.assignments.length - levelGroup.assignments.filter(IsCompleted).length)} label="Pending" tone="orange" />
                                </span>
                              </button>

                              {levelOpen ? (
                                <MockRecordsTable
                                  assignments={levelGroup.assignments}
                                  starting={startMutation.isPending}
                                  onStart={(assignment) => startMutation.mutate(assignment.assignmentId)}
                                  onResume={(assignment) => assignment.latestAttemptId && router.push(`/student/competition/mock-attempt/${assignment.latestAttemptId}`)}
                                  onViewResult={(assignment) => assignment.latestAttemptId && router.push(`/student/competition/mock-result/${assignment.latestAttemptId}`)}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <article className="rounded-[24px] border border-orange-200 bg-gradient-to-br from-white/95 via-orange-50/50 to-amber-50/45 p-5 shadow-sm dark:border-orange-800/55 dark:from-slate-950/85 dark:via-slate-900/80 dark:to-orange-950/25">
      <div className="inline-flex rounded-2xl border border-orange-200 bg-orange-50 p-2 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
    </article>
  );
}

function AvgAccuracyChip({ value }: { value: number | null }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black ${AccuracyChipClasses(value)}`}>
      Avg Accuracy {value === null ? "-" : `${FormatScore(value)}%`}
    </span>
  );
}

function CountChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200">
      {value} {label}{value === 1 ? "" : "s"}
    </span>
  );
}

function StatusCountChip({ value, label, tone }: { value: number; label: string; tone: "green" | "orange" }) {
  const classes = tone === "green"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200"
    : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200";
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${classes}`}>{value} {label}</span>;
}

function MockRecordsTable({
  assignments,
  starting,
  onStart,
  onResume,
  onViewResult,
}: {
  assignments: StudentCompetitionMockAssignment[];
  starting: boolean;
  onStart: (assignment: StudentCompetitionMockAssignment) => void;
  onResume: (assignment: StudentCompetitionMockAssignment) => void;
  onViewResult: (assignment: StudentCompetitionMockAssignment) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-orange-100 dark:border-slate-700">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-orange-100/70 text-[11px] font-black uppercase tracking-[0.16em] text-orange-800 dark:bg-orange-950/35 dark:text-orange-100">
          <tr>
            <th className="px-4 py-3">MOCK</th>
            <th className="px-4 py-3">MOCK CODE</th>
            <th className="px-4 py-3">STATUS</th>
            <th className="px-4 py-3">SCORE</th>
            <th className="px-4 py-3">ACCURACY</th>
            <th className="px-4 py-3">TIME TAKEN</th>
            <th className="px-4 py-3">ASSIGNED DATE</th>
            <th className="px-4 py-3">COMPLETION DATE</th>
            <th className="px-4 py-3">ACTION</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-orange-100 bg-white/80 dark:divide-slate-700 dark:bg-slate-950/20">
          {assignments.map((assignment) => {
            const exam = assignment.mockExam;
            const completed = IsCompleted(assignment);
            const inProgress = IsInProgress(assignment);
            const result = assignment.latestResult;
            const score = ScoreValue(assignment);
            const accuracy = AccuracyValue(assignment);
            const actionLabel = completed ? "View Result" : inProgress ? "Continue Mock" : "Start Mock";
            return (
              <tr key={assignment.assignmentId} className="transition hover:bg-orange-50/70 dark:hover:bg-orange-950/20">
                <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{exam.title}</td>
                <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{exam.mockCode || "-"}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${completed ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200" : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200"}`}>
                    {completed ? "Completed" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${ScoreChipClasses(accuracy)}`}>{score === null ? "-" : FormatScore(score)}</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${AccuracyChipClasses(accuracy)}`}>{accuracy === null ? "-" : `${FormatScore(accuracy)}%`}</span>
                </td>
                <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{completed ? FormatDuration(result?.timeTakenSeconds) : "-"}</td>
                <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{FormatDate(assignment.assignedAt)}</td>
                <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{completed ? FormatDate(result?.completedAt) : "-"}</td>
                <td className="px-4 py-4">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-orange-700 transition hover:border-orange-500 hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-800 dark:bg-slate-950 dark:text-orange-200 dark:hover:border-orange-400 dark:hover:bg-orange-500/25 dark:hover:text-orange-100"
                    disabled={starting || (completed && !assignment.latestAttemptId)}
                    onClick={() => completed ? onViewResult(assignment) : inProgress ? onResume(assignment) : onStart(assignment)}
                  >
                    {completed ? <Eye size={14} /> : <PlayCircle size={14} />}
                    {starting ? "Opening..." : actionLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
