"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { StandardViewButton } from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminCompetitionMockTracker, deleteAdminCompetitionMockAssignment, deleteAdminCompetitionMockStudent, type AdminCompetitionTrackerRow } from "@/lib/api/admin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Clock3, Eye, Search, ShieldCheck, Trash2, Trophy, UsersRound } from "lucide-react";
import { useMemo, useState, useEffect, Suspense } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type StatusFilter = "ALL" | "COMPLETED" | "PENDING";

type SortKey = "mock" | "mockCode" | "status" | "score" | "accuracy" | "timeTaken" | "assignedDate" | "completionDate";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;

const MockTableColumns: Array<{ label: string; key?: SortKey; className?: string }> = [
  { label: "MOCK", key: "mock" },
  { label: "MOCK CODE", key: "mockCode" },
  { label: "STATUS", key: "status" },
  { label: "SCORE", key: "score" },
  { label: "ACCURACY", key: "accuracy" },
  { label: "TIME TAKEN", key: "timeTaken" },
  { label: "ASSIGNED DATE", key: "assignedDate" },
  { label: "COMPLETION DATE", key: "completionDate" },
  { label: "REVIEW" },
];

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
      <Chip tone="amber">Pending</Chip>
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


function SortValue(Row: AdminCompetitionTrackerRow, Key: SortKey): string | number {
  if (Key === "mock") return Row.mockExam.title || "";
  if (Key === "mockCode") return Row.mockExam.mockCode || "";
  if (Key === "status") return IsCompleted(Row) ? 1 : 0;
  if (Key === "score") return ScorePercentage(Row) ?? -1;
  if (Key === "accuracy") return IsCompleted(Row) && Row.accuracyPercentage != null ? Number(Row.accuracyPercentage) : -1;
  if (Key === "timeTaken") return IsCompleted(Row) && Row.timeTakenSeconds != null ? Number(Row.timeTakenSeconds) : -1;
  if (Key === "assignedDate") {
    const Time = Row.assignedAt ? new Date(Row.assignedAt).getTime() : 0;
    return Number.isNaN(Time) ? 0 : Time;
  }
  if (Key === "completionDate") {
    const Time = Row.submittedAt ? new Date(Row.submittedAt).getTime() : 0;
    return Number.isNaN(Time) ? 0 : Time;
  }
  return "";
}

function ChronologicalSortValue(Row: AdminCompetitionTrackerRow): number {
  const AssignedTime = Row.assignedAt ? new Date(Row.assignedAt).getTime() : 0;
  return Number.isNaN(AssignedTime) ? 0 : AssignedTime;
}

function SortRows(Rows: AdminCompetitionTrackerRow[], Sort: SortState) {
  const ChronologicalRows = [...Rows].sort((Left, Right) => {
    const DateResult = ChronologicalSortValue(Left) - ChronologicalSortValue(Right);
    if (DateResult !== 0) return DateResult;

    const MockCodeResult = String(Left.mockExam.mockCode || "").localeCompare(String(Right.mockExam.mockCode || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (MockCodeResult !== 0) return MockCodeResult;

    return String(Left.mockExam.title || "").localeCompare(String(Right.mockExam.title || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  if (!Sort) return ChronologicalRows;

  return ChronologicalRows.sort((Left, Right) => {
    const LeftValue = SortValue(Left, Sort.key);
    const RightValue = SortValue(Right, Sort.key);
    let Result = 0;

    if (typeof LeftValue === "number" && typeof RightValue === "number") {
      Result = LeftValue - RightValue;
    } else {
      Result = String(LeftValue).localeCompare(String(RightValue), undefined, { numeric: true, sensitivity: "base" });
    }

    return Sort.direction === "asc" ? Result : -Result;
  });
}

function NextSortState(Current: SortState, Key: SortKey): SortState {
  if (!Current || Current.key !== Key) return { key: Key, direction: "asc" };
  if (Current.direction === "asc") return { key: Key, direction: "desc" };
  return null;
}

function SortIndicator({ Sort, ColumnKey }: { Sort: SortState; ColumnKey: SortKey }) {
  if (!Sort || Sort.key !== ColumnKey) {
    return <span className="math-tc-mock-header-sort-inactive">↕</span>;
  }
  return <span className="math-tc-mock-header-sort-active">{Sort.direction === "asc" ? "↑" : "↓"}</span>;
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
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2563eb] dark:text-cyan-100">
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

function AdminCompetitionMockTrackerContent() {
  useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [SearchText, SetSearchText] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("ALL");
  const [LevelFilter, SetLevelFilter] = useState("ALL");
  const [TeacherFilter, SetTeacherFilter] = useState("ALL");
  const [Status, SetStatus] = useState<StatusFilter>("ALL");
  const [ExpandedStudents, SetExpandedStudents] = useState<Set<string>>(() => new Set());
  const [ExpandedModules, SetExpandedModules] = useState<Set<string>>(() => new Set());
  const [ExpandedLevels, SetExpandedLevels] = useState<Set<string>>(() => new Set());
  const [MockTableSort, SetMockTableSort] = useState<SortState>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const targetStudentId = searchParams.get("studentId");
  const targetModuleCode = searchParams.get("moduleCode");
  const targetLevelCode = searchParams.get("levelCode");

  useEffect(() => {
    if (targetStudentId) {
      SetExpandedStudents((prev) => new Set([...prev, targetStudentId]));
    }
    if (targetStudentId && targetModuleCode) {
      SetModuleFilter(targetModuleCode);
      SetExpandedModules((prev) => new Set([...prev, `${targetStudentId}::${targetModuleCode}`]));
    }
    if (targetStudentId && targetModuleCode && targetLevelCode) {
      SetLevelFilter(targetLevelCode);
      SetExpandedLevels((prev) => new Set([...prev, `${targetStudentId}::${targetModuleCode}::${targetLevelCode}`]));
    }
  }, [targetStudentId, targetModuleCode, targetLevelCode]);

  const [AttemptToDelete, SetAttemptToDelete] = useState<AdminCompetitionTrackerRow | null>(null);
  const [StudentToDelete, SetStudentToDelete] = useState<{ studentId: string; studentName: string; studentCode: string } | null>(null);
  const [StudentDeleteConfirmText, SetStudentDeleteConfirmText] = useState("");

  const deleteAssignmentMutation = useMutation({
    mutationFn: deleteAdminCompetitionMockAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
      SetAttemptToDelete(null);
    },
  });

  const deleteStudentMutation = useMutation({
    mutationFn: deleteAdminCompetitionMockStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
      SetStudentToDelete(null);
      SetStudentDeleteConfirmText("");
    },
  });

  const Query = useQuery({ queryKey: ["admin", "competition", "mock-tracker"], queryFn: getAdminCompetitionMockTracker });

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
    <AppShell title="Competition Mock Tracker">
      <AdminCompetitionDarkHoverStyles />
      <section className="admin-competition-dark-hover-scope space-y-6">
        <div className="math-card p-6 sm:p-8">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Tracker</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
            Monitor Admin-assigned mock exams, student completion, scores, accuracy, timing, strengths, and weak areas. Monitor all student mock exams, completion status, scores, accuracy, timing, strengths, and weak areas across the platform.
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
              <article className="math-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="math-kicker">Monitor</p>
                    <h2 className="text-2xl font-black text-slate-950 dark:text-white">Student Mock Outcomes</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Review completion status, score, accuracy, and time taken for your students.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_210px_180px_180px_180px] xl:w-[980px]">
                    <label className="tc-dark-filter flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-[#2563eb] focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus-within:border-cyan-300 dark:focus-within:bg-cyan-500/20 dark:focus-within:ring-cyan-300/25">
                      <Search size={16} className="text-[#2563eb] dark:text-cyan-100" />
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
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#2563eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
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
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#2563eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Modules</option>
                      {ModuleOptions.map((Module) => (
                        <option key={Module} value={Module}>{Module}</option>
                      ))}
                    </select>
                    <select
                      value={LevelFilter}
                      onChange={(Event) => SetLevelFilter(Event.target.value)}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#2563eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Levels</option>
                      {LevelOptions.map((Level) => (
                        <option key={Level} value={Level}>{Level}</option>
                      ))}
                    </select>
                    <select
                      value={Status}
                      onChange={(Event) => SetStatus(Event.target.value as StatusFilter)}
                      className="tc-dark-filter rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#2563eb] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-cyan-200/90 dark:hover:bg-cyan-500/20 dark:focus:border-cyan-300 dark:focus:bg-cyan-500/20 dark:focus:ring-cyan-300/25"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {GroupedRows.length === 0 ? (
                    <EmptyState title="No competition mock records" message="Assigned competition mock outcomes for your students will appear here." />
                  ) : (
                    GroupedRows.map((StudentGroup) => {
                      const StudentOpen = ExpandedStudents.has(StudentGroup.key);
                      const CompletedCount = StudentGroup.rows.filter(IsCompleted).length;
                      const PendingCountForStudent = StudentGroup.rows.length - CompletedCount;
                      return (
                        <div key={StudentGroup.key} className="overflow-hidden rounded-3xl border border-[#2563eb]/15 bg-white shadow-sm ring-1 ring-cyan-100/70 dark:border-cyan-300/15 dark:bg-slate-950/35 dark:ring-white/10">
                          <button
                            type="button"
                            onClick={() => ToggleExpanded(SetExpandedStudents, StudentGroup.key)}
                            className="tc-dark-hover-surface group flex w-full flex-col gap-3 bg-[#2563eb]/[0.025] px-4 py-4 text-left transition hover:bg-[#2563eb]/[0.055] sm:flex-row sm:items-center sm:justify-between dark:bg-cyan-400/5 dark:hover:bg-cyan-500/25 dark:hover:shadow-lg dark:hover:shadow-cyan-950/30 dark:focus-visible:ring-2 dark:focus-visible:ring-cyan-300/30"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="tc-dark-hover-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#2563eb]/25 bg-white text-[#2563eb] shadow-sm ring-1 ring-[#2563eb]/10 transition group-hover:bg-[#2563eb]/5 dark:border-cyan-300/30 dark:bg-slate-950/50 dark:text-cyan-100 dark:ring-cyan-300/10 dark:group-hover:bg-cyan-500/25">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">{StudentGroup.student.studentName}</h3>
                                <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#2563eb] dark:text-cyan-100">{StudentGroup.student.studentCode}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                              {AverageAccuracyChip(StudentGroup.rows)}
                              <Chip tone="amber">{StudentGroup.rows.length} Mock{StudentGroup.rows.length === 1 ? "" : "s"}</Chip>
                              <Chip tone="green">{CompletedCount} Completed</Chip>
                              <Chip tone="amber">{PendingCountForStudent} Pending</Chip>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  SetStudentToDelete({
                                    studentId: StudentGroup.student.studentId || "",
                                    studentName: StudentGroup.student.studentName || "",
                                    studentCode: StudentGroup.student.studentCode || "",
                                  });
                                }}
                                className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                                title="Delete entire student history"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </button>

                          {StudentOpen ? (
                            <div className="space-y-3 border-t border-[#2563eb]/10 p-4 dark:border-cyan-300/10">
                              {StudentGroup.modules.map((ModuleGroup) => {
                                const ModuleOpen = ExpandedModules.has(ModuleGroup.key);
                                const ModuleRows = ModuleGroup.levels.flatMap((Level) => Level.rows);
                                return (
                                  <div key={ModuleGroup.key} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/5">
                                    <button
                                      type="button"
                                      onClick={() => ToggleExpanded(SetExpandedModules, ModuleGroup.key)}
                                      className="tc-dark-hover-soft flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#2563eb]/[0.045] dark:hover:bg-cyan-500/25 dark:hover:shadow-md dark:hover:shadow-cyan-950/25 dark:focus-visible:ring-2 dark:focus-visible:ring-cyan-300/30"
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <span className="tc-dark-hover-control inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#2563eb]/20 bg-white text-[#2563eb] dark:border-cyan-300/30 dark:bg-slate-950/50 dark:text-cyan-100">
                                          {ModuleOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </span>
                                        <div>
                                          <p className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#2563eb] dark:text-cyan-100">Module</p>
                                          <p className="text-sm font-black text-slate-950 dark:text-white">{ModuleGroup.label}</p>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap justify-end gap-2 text-xs font-black">
                                        {AverageAccuracyChip(ModuleRows)}
                                        <Chip tone="amber">{ModuleRows.length} Mock{ModuleRows.length === 1 ? "" : "s"}</Chip>
                                      </div>
                                    </button>

                                    {ModuleOpen ? (
                                      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-white/10">
                                        {ModuleGroup.levels.map((LevelGroup) => {
                                          const LevelOpen = ExpandedLevels.has(LevelGroup.key);
                                          const LevelCompleted = LevelGroup.rows.filter(IsCompleted).length;
                                          return (
                                            <div key={LevelGroup.key} className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35">
                                              <button
                                                type="button"
                                                onClick={() => ToggleExpanded(SetExpandedLevels, LevelGroup.key)}
                                                className="tc-dark-hover-soft flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#2563eb]/[0.04] dark:hover:bg-cyan-500/25 dark:hover:shadow-md dark:hover:shadow-cyan-950/25 dark:focus-visible:ring-2 dark:focus-visible:ring-cyan-300/30"
                                              >
                                                <div className="flex min-w-0 items-center gap-3">
                                                  <span className="tc-dark-hover-control inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#2563eb]/20 bg-[#2563eb]/5 text-[#2563eb] dark:border-cyan-300/30 dark:bg-cyan-400/10 dark:text-cyan-100">
                                                    {LevelOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                  </span>
                                                  <div>
                                                    <p className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#2563eb] dark:text-cyan-100">Level</p>
                                                    <p className="text-sm font-black text-slate-950 dark:text-white">{LevelGroup.label}</p>
                                                  </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs font-black">
                                                  {AverageAccuracyChip(LevelGroup.rows)}
                                                  <Chip tone="amber">{LevelGroup.rows.length} Mock{LevelGroup.rows.length === 1 ? "" : "s"}</Chip>
                                                  <Chip tone="green">{LevelCompleted} Completed</Chip>
                                                </div>
                                              </button>

                                              {LevelOpen ? (
                                                <div className="border-t border-slate-100 p-3 dark:border-white/10">
                                                  <div className="overflow-hidden rounded-2xl border border-[#2563eb]/15 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35">
                                                    <div className="math-admin-light-student-summary-header grid grid-cols-[1.15fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.85fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                                      {MockTableColumns.map((Column) => (
                                                        <div key={Column.label} className="flex items-center gap-1.5">
                                                          {Column.key ? (
                                                            <button
                                                              type="button"
                                                              onClick={() => SetMockTableSort((Current) => NextSortState(Current, Column.key!))}
                                                              className="inline-flex items-center gap-1.5 text-left font-black uppercase tracking-[0.14em] text-inherit transition hover:text-[#2563eb] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:hover:text-cyan-400"
                                                              aria-label={`Sort by ${Column.label}`}
                                                            >
                                                              <span>{Column.label}</span>
                                                              <SortIndicator Sort={MockTableSort} ColumnKey={Column.key} />
                                                            </button>
                                                          ) : (
                                                            <span>{Column.label}</span>
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                                                      {SortRows(LevelGroup.rows, MockTableSort).map((Row) => (
                                                        <div
                                                          key={Row.assignmentId}
                                                          className="math-admin-light-student-summary-row group grid grid-cols-[1.15fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.85fr] items-center gap-3 px-5 py-4 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                                                        >
                                                          <div className="text-sm font-black text-slate-950 dark:text-white">{Row.mockExam.title}</div>
                                                          <div className="text-xs font-black text-slate-950 dark:text-white">{Row.mockExam.mockCode || "-"}</div>
                                                          <div>
                                                            <Chip tone={StatusTone(Row.status)}>{StatusLabel(Row.status)}</Chip>
                                                          </div>
                                                          <div>
                                                            <Chip tone={AccuracyBandTone(ScorePercentage(Row))}>
                                                              {ScoreText(Row)}
                                                            </Chip>
                                                          </div>
                                                          <div>
                                                            <Chip tone={AccuracyBandTone(IsCompleted(Row) && Row.accuracyPercentage != null ? Number(Row.accuracyPercentage) : null)}>
                                                              {IsCompleted(Row) ? PercentValue(Row.accuracyPercentage) : "-"}
                                                            </Chip>
                                                          </div>
                                                          <div className="text-sm font-bold text-slate-950 dark:text-white">{IsCompleted(Row) ? (Row.timeTakenText || "-") : "-"}</div>
                                                          <div className="text-sm font-bold text-slate-950 dark:text-white">{FormatDate(Row.assignedAt)}</div>
                                                          <div className="text-sm font-bold text-slate-950 dark:text-white">{IsCompleted(Row) ? FormatDate(Row.submittedAt) : "-"}</div>
                                                          <div className="flex items-center gap-2">
                                                            <ReviewButton Row={Row} />
                                                            <button
                                                              type="button"
                                                              onClick={() => SetAttemptToDelete(Row)}
                                                              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                                                              title="Delete this attempt"
                                                            >
                                                              <Trash2 size={14} />
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </div>
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
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            </div>
          </>
        )}

        {AttemptToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/10">
              <div className="px-6 py-6 sm:p-8">
                <h3 className="text-xl font-black text-slate-950 dark:text-white">Delete Attempt</h3>
                <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-400">
                  Are you sure you want to delete this attempt for {AttemptToDelete.mockExam?.mockCode}? This action cannot be undone.
                </p>
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => SetAttemptToDelete(null)}
                    disabled={deleteAssignmentMutation.isPending}
                    className="rounded-2xl px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAssignmentMutation.mutate(AttemptToDelete.assignmentId)}
                    disabled={deleteAssignmentMutation.isPending}
                    className="flex items-center justify-center rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteAssignmentMutation.isPending ? "Deleting..." : "Delete Attempt"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {StudentToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/10">
              <div className="px-6 py-6 sm:p-8">
                <h3 className="text-xl font-black text-slate-950 dark:text-white">Delete Student Records</h3>
                <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-400">
                  You are about to delete all mock records for <span className="text-slate-950 dark:text-white">{StudentToDelete.studentName}</span>. This will remove their history entirely.
                </p>
                <div className="mt-6">
                  <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Type "{StudentToDelete.studentCode}" to confirm
                  </label>
                  <input
                    type="text"
                    value={StudentDeleteConfirmText}
                    onChange={(e) => SetStudentDeleteConfirmText(e.target.value)}
                    placeholder={StudentToDelete.studentCode}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:focus:border-red-500"
                  />
                </div>
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      SetStudentToDelete(null);
                      SetStudentDeleteConfirmText("");
                    }}
                    disabled={deleteStudentMutation.isPending}
                    className="rounded-2xl px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteStudentMutation.mutate(StudentToDelete.studentId)}
                    disabled={deleteStudentMutation.isPending || StudentDeleteConfirmText !== StudentToDelete.studentCode}
                    className="flex items-center justify-center rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteStudentMutation.isPending ? "Deleting..." : "Delete All Records"}
                  </button>
                </div>
              </div>
            </div>
          </div>
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


export default function AdminCompetitionMockTrackerPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading tracker..." />}>
      <AdminCompetitionMockTrackerContent />
    </Suspense>
  );
}

