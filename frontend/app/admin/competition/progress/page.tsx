"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { StandardViewButton } from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminCompetitionMockTracker, type AdminCompetitionTrackerRow } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Clock3, Eye, Search, ShieldCheck, Trophy, UsersRound, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";

type StatusFilter = "ALL" | "COMPLETED" | "PENDING";



function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
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

function computeLevelInsights(rows: any[]) {
  const conceptStats = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    if (String(row.status || "ASSIGNED").toUpperCase() !== "COMPLETED") continue;
    
    // The backend returns sectionPerformance as a flat array of { concept, correct, total, percentage }
    if (!row.sectionPerformance || !Array.isArray(row.sectionPerformance)) continue;
    for (const cp of row.sectionPerformance) {
      if (!cp.concept) continue;
      const stats = conceptStats.get(cp.concept) || { total: 0, correct: 0 };
      stats.total += Number(cp.total || 0);
      stats.correct += Number(cp.correct || 0);
      conceptStats.set(cp.concept, stats);
    }
  }

  const concepts: { name: string; accuracy: number; total: number }[] = [];
  for (const [name, stats] of conceptStats.entries()) {
    if (stats.total > 0) {
      concepts.push({ name, accuracy: Math.round((stats.correct / stats.total) * 100), total: stats.total });
    }
  }

  const strongConcepts = concepts.filter((c) => c.accuracy >= 70).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  const weakConcepts = concepts.filter((c) => c.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);

  return { strongConcepts, weakConcepts };
}


function FormatDate(Value?: string | null) {
  if (!Value) return "-";
  const DateValue = new Date(Value);
  if (Number.isNaN(DateValue.getTime())) return "-";
  return DateValue.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusLabel(Status?: string | null) {
  const Value = String(Status || "ASSIGNED").toUpperCase();
  if (Value === "COMPLETED") return "Completed";
  if (Value === "IN_PROGRESS") return "Pending";
  return "Pending";
}

function StatusTone(Status?: string | null): "green" | "amber" {
  const Value = String(Status || "ASSIGNED").toUpperCase();
  if (Value === "COMPLETED") return "green";
  return "amber";
}

function IsCompleted(Row: AdminCompetitionTrackerRow) {
  return String(Row.status || "ASSIGNED").toUpperCase() === "COMPLETED";
}

function PercentValue(Value?: number | null) {
  return Value != null ? `${Value}%` : "-";
}

function AverageAccuracyValue(Rows: AdminCompetitionTrackerRow[]) {
  const CompletedRows = Rows.filter((Row) => IsCompleted(Row) && Row.accuracyPercentage != null);
  if (CompletedRows.length === 0) return null;
  const Total = CompletedRows.reduce((Sum, Row) => Sum + Number(Row.accuracyPercentage || 0), 0);
  return Math.round(Total / CompletedRows.length);
}


function AverageScoreValue(Rows: AdminCompetitionTrackerRow[]) {
  const CompletedRows = Rows.filter((Row) => IsCompleted(Row) && Row.score != null);
  if (CompletedRows.length === 0) return 0;
  const Total = CompletedRows.reduce((Sum, Row) => Sum + Number(Row.score || 0), 0);
  return Math.round(Total / CompletedRows.length);
}

function AverageOfStudentAccuracyValues(Rows: AdminCompetitionTrackerRow[]) {
  const StudentMap = new Map<string, AdminCompetitionTrackerRow[]>();
  Rows.forEach((Row) => {
    const StudentKey = Row.student.studentId || Row.student.studentCode || "student";
    if (!StudentMap.has(StudentKey)) StudentMap.set(StudentKey, []);
    StudentMap.get(StudentKey)!.push(Row);
  });

  const StudentAverages = Array.from(StudentMap.values())
    .map((StudentRows) => AverageAccuracyValue(StudentRows))
    .filter((Value): Value is number => Value != null);

  if (StudentAverages.length === 0) return 0;
  const Total = StudentAverages.reduce((Sum, Value) => Sum + Value, 0);
  return Math.round(Total / StudentAverages.length);
}

import { Chip } from "@/components/common/DetailWorkspaceViews";

function AccuracyBandTone(Value: number | null): "slate" | "green" | "red" | "amber" | "blue" | "cyan" | "purple" {
  if (Value == null) return "slate";
  if (Value < 60) return "red";
  if (Value < 80) return "amber";
  if (Value < 90) return "purple";
  return "green";
}

function AverageAccuracyChip(Rows: AdminCompetitionTrackerRow[]) {
  const Value = AverageAccuracyValue(Rows);
  return (
    <Chip tone={AccuracyBandTone(Value)}>
      Avg Accuracy {Value == null ? "-" : `${Value}%`}
    </Chip>
  );
}

function ScorePercentage(Row: AdminCompetitionTrackerRow) {
  if (!IsCompleted(Row) || Row.score == null || Row.maxScore == null || Number(Row.maxScore) === 0) return null;
  return Math.round((Number(Row.score) / Number(Row.maxScore)) * 100);
}

function ScoreText(Row: AdminCompetitionTrackerRow) {
  if (!IsCompleted(Row) || Row.score == null || Row.maxScore == null) return "-";
  return `${Row.score}/${Row.maxScore}`;
}

function ReviewButton({ Row }: { Row: AdminCompetitionTrackerRow }) {
  const router = useRouter();
  if (!Row.attemptId) {
    return (
      <Chip tone="slate">Pending</Chip>
    );
  }

  return (
    <StandardViewButton
      label="View Details"
      tooltip="View Mock Details"
      onClick={() => router.push(`/admin/competition/mock-result/${Row.attemptId}`)}
      compact
    />
  );
}

function SafeModuleLabel(Row: AdminCompetitionTrackerRow) {
  return Row.mockExam.moduleCode || "Module";
}

function SafeLevelLabel(Row: AdminCompetitionTrackerRow) {
  return Row.mockExam.levelCode || "Level";
}

function ToggleExpanded(Setter: Dispatch<SetStateAction<Set<string>>>, Key: string) {
  Setter((Previous) => {
    const Next = new Set(Previous);
    if (Next.has(Key)) {
      Next.delete(Key);
    } else {
      Next.add(Key);
    }
    return Next;
  });
}




function ChronologicalSortValue(Row: AdminCompetitionTrackerRow): number {
  const AssignedTime = Row.assignedAt ? new Date(Row.assignedAt).getTime() : 0;
  return Number.isNaN(AssignedTime) ? 0 : AssignedTime;
}







type MockLevelGroup = {
  key: string;
  label: string;
  rows: AdminCompetitionTrackerRow[];
};

type MockModuleGroup = {
  key: string;
  label: string;
  levels: MockLevelGroup[];
};

type StudentMockGroup = {
  key: string;
  student: AdminCompetitionTrackerRow["student"];
  rows: AdminCompetitionTrackerRow[];
  modules: MockModuleGroup[];
};

function MetricCard({ Icon, Label, Value }: { Icon: typeof Trophy; Label: string; Value: string | number }) {
  return (
    <article className="math-admin-light-metric-card rounded-[24px] border border-cyan-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-cyan-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <span className="tc-dark-hover-control inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/5 text-[#2563eb] dark:border-cyan-300/30 dark:bg-cyan-400/10 dark:text-cyan-100">
          <Icon size={15} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#2563eb] dark:text-cyan-100">
          {Label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
        {Value}
      </p>
    </article>
  );
}


function AdminCompetitionDarkHoverStyles() {
  return (
    <style>{`
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-surface,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-row,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-control,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-tab,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-analysis-row {
        transition-property: background-color, border-color, color, box-shadow, transform;
        transition-duration: 180ms;
        transition-timing-function: ease;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-surface:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-surface:focus-visible,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-soft:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-soft:focus-visible {
        background-color: rgba(37, 99, 235, 0.42) !important;
        border-color: rgba(34, 211, 238, 0.72) !important;
        box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.20), 0 18px 42px rgba(30, 58, 138, 0.34) !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-row:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-row:focus-visible {
        background-color: rgba(37, 99, 235, 0.55) !important;
        border-color: rgba(34, 211, 238, 0.78) !important;
        box-shadow: inset 4px 0 0 rgba(34, 211, 238, 0.80), 0 14px 34px rgba(30, 58, 138, 0.32) !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-control:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-control:focus-visible,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-surface:hover .tc-dark-hover-control,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-row:hover .tc-dark-hover-control {
        background-color: #2563eb !important;
        border-color: rgba(34, 211, 238, 0.92) !important;
        color: #ffffff !important;
        box-shadow: 0 10px 24px rgba(30, 58, 138, 0.46) !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-control:hover *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-control:focus-visible *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-surface:hover .tc-dark-hover-control *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-row:hover .tc-dark-hover-control * {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-tab:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-tab:focus-visible,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-analysis-row:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-analysis-row:focus-visible {
        background-color: #2563eb !important;
        border-color: rgba(34, 211, 238, 0.92) !important;
        color: #ffffff !important;
        box-shadow: 0 12px 28px rgba(30, 58, 138, 0.42) !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-hover-tab:hover *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-tab:focus-visible *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-analysis-row:hover *,
      .dark .admin-competition-dark-hover-scope .tc-dark-hover-analysis-row:focus-visible * {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      .dark .admin-competition-dark-hover-scope .tc-dark-filter:hover,
      .dark .admin-competition-dark-hover-scope .tc-dark-filter:focus,
      .dark .admin-competition-dark-hover-scope .tc-dark-filter:focus-within {
        background-color: rgba(37, 99, 235, 0.36) !important;
        border-color: rgba(34, 211, 238, 0.82) !important;
        box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.16) !important;
      }
    `}</style>
  );
}

function AdminCompetitionProgressContent() {
  useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [SearchText, SetSearchText] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("ALL");
  const [LevelFilter, SetLevelFilter] = useState("ALL");
  const [TeacherFilter, SetTeacherFilter] = useState("ALL");
  const [Status, SetStatus] = useState<StatusFilter>("ALL");
  const [ExpandedStudents, SetExpandedStudents] = useState<Set<string>>(() => new Set());
  const [ExpandedModules, SetExpandedModules] = useState<Set<string>>(() => new Set());
  const [ExpandedLevels, SetExpandedLevels] = useState<Set<string>>(() => new Set());
    const router = useRouter();

  const Query = useQuery({ queryKey: ["admin", "competition", "progress"], queryFn: getAdminCompetitionMockTracker });

  const Rows = Query.data?.rows || [];

  const ModuleOptions = useMemo(() => {
    const Values = new Set<string>();
    Rows.forEach((Row) => Values.add(SafeModuleLabel(Row)));
    return Array.from(Values).sort((Left, Right) => Left.localeCompare(Right, undefined, { numeric: true, sensitivity: "base" }));
  }, [Rows]);

  const LevelOptions = useMemo(() => {
    const Values = new Set<string>();
    Rows.forEach((Row) => {
      if (ModuleFilter !== "ALL" && SafeModuleLabel(Row) !== ModuleFilter) return;
      Values.add(SafeLevelLabel(Row));
    });
    return Array.from(Values).sort((Left, Right) => Left.localeCompare(Right, undefined, { numeric: true, sensitivity: "base" }));
  }, [Rows, ModuleFilter]);

  const TeacherOptions = useMemo(() => {
    const TeacherMap = new Map<string, string>();
    Rows.forEach((Row) => {
      const Key = String(Row.teacherCode || Row.teacherName || "Unassigned");
      const Label = String(Row.teacherName || Row.teacherCode || "Unassigned Teacher");
      if (!TeacherMap.has(Key)) TeacherMap.set(Key, Label);
    });
    return Array.from(TeacherMap.entries()).sort((Left, Right) => Left[1].localeCompare(Right[1]));
  }, [Rows]);

  const FilteredRows = useMemo(() => {
    const Term = SearchText.trim().toLowerCase();
    return Rows.filter((Row) => {
      const RowStatus = String(Row.status || "ASSIGNED").toUpperCase();
      const RowTeacherKey = String(Row.teacherCode || Row.teacherName || "Unassigned");
      if (ModuleFilter !== "ALL" && SafeModuleLabel(Row) !== ModuleFilter) return false;
      if (LevelFilter !== "ALL" && SafeLevelLabel(Row) !== LevelFilter) return false;
      if (TeacherFilter !== "ALL" && RowTeacherKey !== TeacherFilter) return false;
      if (Status === "COMPLETED" && RowStatus !== "COMPLETED") return false;
      if (Status === "PENDING" && RowStatus === "COMPLETED") return false;
      if (!Term) return true;
      const Haystack = [
        Row.student.studentName,
        Row.student.studentCode,
        Row.mockExam.title,
        Row.mockExam.mockCode,
        Row.mockExam.levelCode,
        Row.mockExam.moduleCode,
        Row.teacherName,
        Row.teacherCode,
      ].join(" ").toLowerCase();
      return Haystack.includes(Term);
    });
  }, [Rows, SearchText, ModuleFilter, LevelFilter, TeacherFilter, Status]);

  const FilteredSummary = useMemo(() => {
    const AssignedCount = FilteredRows.length;
    const CompletedCount = FilteredRows.filter(IsCompleted).length;
    return {
      assignedCount: AssignedCount,
      completedCount: CompletedCount,
      pendingCount: Math.max(AssignedCount - CompletedCount, 0),
      averageScore: AverageScoreValue(FilteredRows),
      averageAccuracy: AverageOfStudentAccuracyValues(FilteredRows),
    };
  }, [FilteredRows]);

  const GroupedRows = useMemo<StudentMockGroup[]>(() => {
    const StudentMap = new Map<string, StudentMockGroup>();

    FilteredRows.forEach((Row) => {
      const StudentKey = Row.student.studentId || Row.student.studentCode || "student";
      if (!StudentMap.has(StudentKey)) {
        StudentMap.set(StudentKey, { key: StudentKey, student: Row.student, rows: [], modules: [] });
      }
      StudentMap.get(StudentKey)!.rows.push(Row);
    });

    return Array.from(StudentMap.values()).map((StudentGroup) => {
      const ModuleMap = new Map<string, MockModuleGroup>();

      StudentGroup.rows.forEach((Row) => {
        const ModuleLabel = SafeModuleLabel(Row);
        const ModuleKey = `${StudentGroup.key}::${ModuleLabel}`;
        if (!ModuleMap.has(ModuleKey)) {
          ModuleMap.set(ModuleKey, { key: ModuleKey, label: ModuleLabel, levels: [] });
        }

        const ModuleGroup = ModuleMap.get(ModuleKey)!;
        const LevelLabel = SafeLevelLabel(Row);
        const LevelKey = `${ModuleKey}::${LevelLabel}`;
        let LevelGroup = ModuleGroup.levels.find((Item) => Item.key === LevelKey);
        if (!LevelGroup) {
          LevelGroup = { key: LevelKey, label: LevelLabel, rows: [] };
          ModuleGroup.levels.push(LevelGroup);
        }
        LevelGroup.rows.push(Row);
      });

      return { ...StudentGroup, modules: Array.from(ModuleMap.values()) };
    });
  }, [FilteredRows]);


  return (
    <AppShell title="Mock Performance Insights">
      <AdminCompetitionDarkHoverStyles />
      <section className="admin-competition-dark-hover-scope space-y-6">
        <div className="math-card p-6 sm:p-8">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Mock Performance Insights</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
            Monitor student performance, strengths, and areas to improve across the platform.
          </p>
        </div>

        {Query.isLoading ? (
          <LoadingState label="Loading competition tracker" message="Fetching assigned mocks and student outcomes." />
        ) : Query.isError ? (
          <ErrorState title="Could not load competition tracker" message={apiErrorMessage(Query.error)} />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
              <MetricCard Icon={UsersRound} Label="Assigned" Value={FilteredSummary.assignedCount} />
              <MetricCard Icon={ShieldCheck} Label="Completed" Value={FilteredSummary.completedCount} />
              <MetricCard Icon={Clock3} Label="Pending" Value={FilteredSummary.pendingCount} />
              <MetricCard Icon={Trophy} Label="Avg Score" Value={FilteredSummary.averageScore} />
              <MetricCard Icon={BarChart3} Label="Avg Accuracy" Value={`${FilteredSummary.averageAccuracy}%`} />
            </div>

            <div className="grid gap-5">
              <div className="math-card overflow-hidden p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="math-kicker">Monitor</p>
                    <h2 className="text-2xl font-black text-slate-950 dark:text-white">Student Mock Outcomes</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Review completion status, score, accuracy, and time taken for your students.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_210px_180px_180px_180px] xl:w-[980px]">
                    {/* The search and filters remain identical */}
                    <label className="tc-dark-filter flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-[var(--math-role-primary)] focus-within:border-[var(--math-role-primary)] focus-within:ring-2 focus-within:ring-[var(--math-role-primary)]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus-within:border-cyan-300 dark:focus-within:bg-cyan-500/20 dark:focus-within:ring-cyan-300/25">
                      <Search size={16} className="text-[var(--math-role-primary)] dark:text-cyan-100" />
                      <input
                        value={SearchText}
                        onChange={(Event) => SetSearchText(Event.target.value)}
                        placeholder="Search student, mock, code, or level"
                        className="w-full bg-transparent outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <select
                      value={TeacherFilter}
                      onChange={(Event) => SetTeacherFilter(Event.target.value)}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[var(--math-role-primary)] focus:border-[var(--math-role-primary)] focus:ring-2 focus:ring-[var(--math-role-primary)]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Teachers</option>
                      {TeacherOptions.map(([Key, Label]) => (
                        <option key={Key} value={Key}>{Label}</option>
                      ))}
                    </select>
                    <select
                      value={ModuleFilter}
                      onChange={(Event) => {
                        SetModuleFilter(Event.target.value);
                        SetLevelFilter("ALL");
                      }}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[var(--math-role-primary)] focus:border-[var(--math-role-primary)] focus:ring-2 focus:ring-[var(--math-role-primary)]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Modules</option>
                      {ModuleOptions.map((Module) => (
                        <option key={Module} value={Module}>{Module}</option>
                      ))}
                    </select>
                    <select
                      value={LevelFilter}
                      onChange={(Event) => SetLevelFilter(Event.target.value)}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[var(--math-role-primary)] focus:border-[var(--math-role-primary)] focus:ring-2 focus:ring-[var(--math-role-primary)]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Levels</option>
                      {LevelOptions.map((Level) => (
                        <option key={Level} value={Level}>{Level}</option>
                      ))}
                    </select>
                    <select
                      value={Status}
                      onChange={(Event) => SetStatus(Event.target.value as StatusFilter)}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[var(--math-role-primary)] focus:border-[var(--math-role-primary)] focus:ring-2 focus:ring-[var(--math-role-primary)]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {GroupedRows.length === 0 ? (
                    <EmptyState title="No competition mock records" message="Assigned competition mock outcomes for your students will appear here." />
                  ) : (
                    GroupedRows.map((StudentGroup, sIdx) => {
                      const StudentOpen = ExpandedStudents.has(StudentGroup.key);
                      return (
                        <div key={StudentGroup.key} className="math-hierarchy-panel p-5 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out" style={{ animationFillMode: 'both', animationDelay: `${sIdx * 100}ms` }}>
                          <button
                            type="button"
                            className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between w-full"
                            onClick={() => ToggleExpanded(SetExpandedStudents, StudentGroup.key)}
                          >
                            <div className="text-left">
                              <h3 className="text-xl font-black text-slate-950 dark:text-white">
                                {StudentGroup.student.studentName}
                              </h3>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--math-role-primary)] dark:text-[var(--math-role-primary)]">
                                {StudentGroup.student.studentCode}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                                <ChevronDown className={StudentOpen ? "rotate-180 transition" : "transition"} size={18} />
                              </span>
                            </div>
                          </button>

                          {StudentOpen && (
                            <div className="mt-4 grid gap-4">
                              {StudentGroup.modules.map((ModuleGroup) => {
                                const ModuleOpen = ExpandedModules.has(ModuleGroup.key);
                                return (
                                  <div key={ModuleGroup.key} className="math-hierarchy-panel-soft p-4 border border-slate-200/50 dark:border-white/5">
                                    <button
                                      type="button"
                                      className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between w-full"
                                      onClick={() => ToggleExpanded(SetExpandedModules, ModuleGroup.key)}
                                    >
                                      <div className="text-left">
                                        <p className="math-kicker">Module</p>
                                        <h4 className="text-base font-black text-slate-950 dark:text-white">
                                          {ModuleGroup.label}
                                        </h4>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                                          <ChevronDown className={ModuleOpen ? "rotate-180 transition" : "transition"} size={18} />
                                        </span>
                                      </div>
                                    </button>

                                    {ModuleOpen && (
                                      <div className="mt-4 grid gap-4">
                                        {ModuleGroup.levels.map((LevelGroup) => {
                                          const LevelOpen = ExpandedLevels.has(LevelGroup.key);
                                          return (
                                            <div key={LevelGroup.key} className="math-hierarchy-panel-soft bg-white/50 dark:bg-slate-950/50 p-4 border border-slate-200/50 dark:border-white/5">
                                              <button
                                                type="button"
                                                className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between w-full"
                                                onClick={() => ToggleExpanded(SetExpandedLevels, LevelGroup.key)}
                                              >
                                                <div className="text-left">
                                                  <p className="math-kicker">Level</p>
                                                  <h5 className="text-base font-black text-slate-950 dark:text-white">
                                                    {LevelGroup.label}
                                                  </h5>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                                                    <ChevronDown className={LevelOpen ? "rotate-180 transition" : "transition"} size={18} />
                                                  </span>
                                                </div>
                                              </button>

                                              {LevelOpen ? (
                                                <div className="mt-6 border-t border-slate-100 pt-6 dark:border-white/10 space-y-4">
                                                  {(() => {
                                                    const insight = computeLevelInsights(LevelGroup.rows);
                                                    if (insight.strongConcepts.length === 0 && insight.weakConcepts.length === 0) return (
                                                        <div className="relative overflow-hidden rounded-[32px] border border-[var(--math-role-primary)]/20 bg-white/60 py-12 px-4 text-center shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/60">
                                                          <div className="math-noise-bg mix-blend-overlay" />
                                                          <p className="relative z-10 text-sm font-semibold text-slate-500 dark:text-slate-400">
                                                            No concept data available yet. Student must complete mock exams.
                                                          </p>
                                                        </div>
                                                    );
                                                    return (
                                                      <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
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
                                                              insight.strongConcepts.map((concept, idx) => (
                                                                <div key={idx} className="animate-in slide-in-from-right-4 fade-in fill-mode-backwards" style={{ animationDelay: `${idx * 100}ms` }}>
                                                                  <ConceptRow concept={concept.name} accuracy={concept.accuracy} isStrong={true} />
                                                                </div>
                                                              ))
                                                            ) : (
                                                              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                                                                <div className="flex flex-col items-center gap-2">
                                                                  <Sparkles className="opacity-20" size={32} />
                                                                  <p>No shining strengths identified yet.</p>
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
                                                              insight.weakConcepts.map((concept, idx) => (
                                                                <div key={idx} className="animate-in slide-in-from-right-4 fade-in fill-mode-backwards" style={{ animationDelay: `${idx * 100}ms` }}>
                                                                  <ConceptRow concept={concept.name} accuracy={concept.accuracy} isStrong={false} />
                                                                </div>
                                                              ))
                                                            ) : (
                                                              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                                                                <div className="flex flex-col items-center gap-2">
                                                                  <CheckCircle2 className="opacity-20" size={32} />
                                                                  <p>No major weak areas detected.</p>
                                                                </div>
                                                              </div>
                                                            )}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

function MiniMetric({ Label, Value }: { Label: string; Value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#2563eb] dark:text-cyan-100">{Label}</p>
      <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}


export default function AdminCompetitionProgressPage() {
  return <AdminCompetitionProgressContent />;
}

