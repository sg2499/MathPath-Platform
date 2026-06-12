"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherCompetitionMockTracker, type TeacherCompetitionTrackerRow } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Clock3, Eye, Search, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";

type StatusFilter = "ALL" | "COMPLETED" | "PENDING";

type SortKey = "mock" | "mockCode" | "status" | "score" | "accuracy" | "timeTaken" | "assignedDate" | "completionDate";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;

const MockTableColumns: Array<{ label: string; key?: SortKey; className?: string }> = [
  { label: "Mock", key: "mock" },
  { label: "Mock Code", key: "mockCode" },
  { label: "Status", key: "status" },
  { label: "Score", key: "score" },
  { label: "Accuracy", key: "accuracy" },
  { label: "Time Taken", key: "timeTaken" },
  { label: "Assigned Date", key: "assignedDate" },
  { label: "Completion Date", key: "completionDate" },
  { label: "Review" },
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

function StatusClass(Status?: string | null) {
  const Value = String(Status || "ASSIGNED").toUpperCase();
  if (Value === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200";
  return "border-[#7a1f58]/20 bg-[#7a1f58]/5 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100";
}

function IsCompleted(Row: TeacherCompetitionTrackerRow) {
  return String(Row.status || "ASSIGNED").toUpperCase() === "COMPLETED";
}

function PercentValue(Value?: number | null) {
  return Value != null ? `${Value}%` : "-";
}

function AverageAccuracyValue(Rows: TeacherCompetitionTrackerRow[]) {
  const CompletedRows = Rows.filter((Row) => IsCompleted(Row) && Row.accuracyPercentage != null);
  if (CompletedRows.length === 0) return null;
  const Total = CompletedRows.reduce((Sum, Row) => Sum + Number(Row.accuracyPercentage || 0), 0);
  return Math.round(Total / CompletedRows.length);
}


function AverageScoreValue(Rows: TeacherCompetitionTrackerRow[]) {
  const CompletedRows = Rows.filter((Row) => IsCompleted(Row) && ScorePercentage(Row) != null);
  if (CompletedRows.length === 0) return 0;
  const Total = CompletedRows.reduce((Sum, Row) => Sum + Number(ScorePercentage(Row) || 0), 0);
  return Math.round(Total / CompletedRows.length);
}

function AverageOfStudentAccuracyValues(Rows: TeacherCompetitionTrackerRow[]) {
  const StudentMap = new Map<string, TeacherCompetitionTrackerRow[]>();
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

function AccuracyBandClass(Value: number | null) {
  if (Value == null) {
    return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
  }
  if (Value < 60) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-200";
  }
  if (Value < 80) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200";
  }
  if (Value < 90) {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-200";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200";
}

function AverageAccuracyChip(Rows: TeacherCompetitionTrackerRow[]) {
  const Value = AverageAccuracyValue(Rows);
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black ${AccuracyBandClass(Value)}`}>
      Avg Accuracy {Value == null ? "-" : `${Value}%`}
    </span>
  );
}

function ScorePercentage(Row: TeacherCompetitionTrackerRow) {
  if (!IsCompleted(Row) || Row.score == null || Row.maxScore == null || Number(Row.maxScore) === 0) return null;
  return Math.round((Number(Row.score) / Number(Row.maxScore)) * 100);
}

function ScoreText(Row: TeacherCompetitionTrackerRow) {
  if (!IsCompleted(Row) || Row.score == null || Row.maxScore == null) return "-";
  return `${Row.score}/${Row.maxScore}`;
}

function ReviewButton({ Row }: { Row: TeacherCompetitionTrackerRow }) {
  if (!Row.attemptId) {
    return (
      <span className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500">
        Pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#7a1f58]/25 bg-white px-4 py-2 text-xs font-black text-[#7a1f58] transition group-hover:border-[#7a1f58] group-hover:bg-[#7a1f58] group-hover:text-white dark:border-rose-300/30 dark:bg-slate-950/40 dark:text-rose-100 dark:group-hover:border-rose-300 dark:group-hover:bg-rose-300 dark:group-hover:text-slate-950">
      <Eye size={14} /> Review
    </span>
  );
}

function SafeModuleLabel(Row: TeacherCompetitionTrackerRow) {
  return Row.mockExam.moduleCode || "Module";
}

function SafeLevelLabel(Row: TeacherCompetitionTrackerRow) {
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


function SortValue(Row: TeacherCompetitionTrackerRow, Key: SortKey): string | number {
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

function SortRows(Rows: TeacherCompetitionTrackerRow[], Sort: SortState) {
  if (!Sort) return Rows;
  return [...Rows].sort((Left, Right) => {
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
    return <span className="text-[#7a1f58]/45 dark:text-rose-100/45">↕</span>;
  }
  return <span className="text-[#7a1f58] dark:text-rose-100">{Sort.direction === "asc" ? "↑" : "↓"}</span>;
}

type MockLevelGroup = {
  key: string;
  label: string;
  rows: TeacherCompetitionTrackerRow[];
};

type MockModuleGroup = {
  key: string;
  label: string;
  levels: MockLevelGroup[];
};

type StudentMockGroup = {
  key: string;
  student: TeacherCompetitionTrackerRow["student"];
  rows: TeacherCompetitionTrackerRow[];
  modules: MockModuleGroup[];
};

function MetricCard({ Icon, Label, Value }: { Icon: typeof Trophy; Label: string; Value: string | number }) {
  return (
    <article className="math-teacher-light-metric-card rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-[#7a1f58]/20 bg-[#7a1f58]/5 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">
          <Icon size={15} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7a1f58] dark:text-rose-100">
          {Label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
        {Value}
      </p>
    </article>
  );
}

function TeacherCompetitionMockTrackerContent() {
  useProtectedPage(["TEACHER"]);
  const [SearchText, SetSearchText] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("ALL");
  const [LevelFilter, SetLevelFilter] = useState("ALL");
  const [Status, SetStatus] = useState<StatusFilter>("ALL");
  const [ExpandedStudents, SetExpandedStudents] = useState<Set<string>>(() => new Set());
  const [ExpandedModules, SetExpandedModules] = useState<Set<string>>(() => new Set());
  const [ExpandedLevels, SetExpandedLevels] = useState<Set<string>>(() => new Set());
  const [MockTableSort, SetMockTableSort] = useState<SortState>(null);
  const router = useRouter();

  const Query = useQuery({ queryKey: ["teacher", "competition", "mock-tracker"], queryFn: getTeacherCompetitionMockTracker });

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

  const FilteredRows = useMemo(() => {
    const Term = SearchText.trim().toLowerCase();
    return Rows.filter((Row) => {
      const RowStatus = String(Row.status || "ASSIGNED").toUpperCase();
      if (ModuleFilter !== "ALL" && SafeModuleLabel(Row) !== ModuleFilter) return false;
      if (LevelFilter !== "ALL" && SafeLevelLabel(Row) !== LevelFilter) return false;
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
      ].join(" ").toLowerCase();
      return Haystack.includes(Term);
    });
  }, [Rows, SearchText, ModuleFilter, LevelFilter, Status]);

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
      <section className="space-y-6">
        <div className="math-card p-6 sm:p-8">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Tracker</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
            Monitor Admin-assigned mock exams, student completion, scores, accuracy, timing, strengths, and weak areas. Teachers review only; assignment remains Admin-controlled.
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
              <MetricCard Icon={Trophy} Label="Avg Score" Value={`${FilteredSummary.averageScore}%`} />
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
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.35fr_180px_180px_180px] xl:w-[820px]">
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200">
                      <Search size={16} className="text-[#7a1f58] dark:text-rose-100" />
                      <input
                        value={SearchText}
                        onChange={(Event) => SetSearchText(Event.target.value)}
                        placeholder="Search student, mock, code, or level"
                        className="w-full bg-transparent outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <select
                      value={ModuleFilter}
                      onChange={(Event) => {
                        SetModuleFilter(Event.target.value);
                        SetLevelFilter("ALL");
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#7a1f58] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
                    >
                      <option value="ALL">All Modules</option>
                      {ModuleOptions.map((Module) => (
                        <option key={Module} value={Module}>{Module}</option>
                      ))}
                    </select>
                    <select
                      value={LevelFilter}
                      onChange={(Event) => SetLevelFilter(Event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#7a1f58] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
                    >
                      <option value="ALL">All Levels</option>
                      {LevelOptions.map((Level) => (
                        <option key={Level} value={Level}>{Level}</option>
                      ))}
                    </select>
                    <select
                      value={Status}
                      onChange={(Event) => SetStatus(Event.target.value as StatusFilter)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#7a1f58] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
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
                        <div key={StudentGroup.key} className="overflow-hidden rounded-3xl border border-[#7a1f58]/15 bg-white shadow-sm ring-1 ring-rose-100/70 dark:border-rose-300/15 dark:bg-slate-950/35 dark:ring-white/10">
                          <button
                            type="button"
                            onClick={() => ToggleExpanded(SetExpandedStudents, StudentGroup.key)}
                            className="group flex w-full flex-col gap-3 bg-[#7a1f58]/[0.025] px-4 py-4 text-left transition hover:bg-[#7a1f58]/[0.055] sm:flex-row sm:items-center sm:justify-between dark:bg-rose-400/5 dark:hover:bg-rose-400/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#7a1f58]/25 bg-white text-[#7a1f58] shadow-sm ring-1 ring-[#7a1f58]/10 transition group-hover:bg-[#7a1f58]/5 dark:border-rose-300/30 dark:bg-slate-950/50 dark:text-rose-100 dark:ring-rose-300/10 dark:group-hover:bg-rose-400/10">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">{StudentGroup.student.studentName}</h3>
                                <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">{StudentGroup.student.studentCode}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-black">
                              {AverageAccuracyChip(StudentGroup.rows)}
                              <span className="rounded-full border border-[#7a1f58]/20 bg-white px-3 py-1 text-[#7a1f58] dark:border-rose-300/30 dark:bg-slate-950/50 dark:text-rose-100">{StudentGroup.rows.length} Mock{StudentGroup.rows.length === 1 ? "" : "s"}</span>
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200">{CompletedCount} Completed</span>
                              <span className="rounded-full border border-[#7a1f58]/20 bg-[#7a1f58]/5 px-3 py-1 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">{PendingCountForStudent} Pending</span>
                            </div>
                          </button>

                          {StudentOpen ? (
                            <div className="space-y-3 border-t border-[#7a1f58]/10 p-4 dark:border-rose-300/10">
                              {StudentGroup.modules.map((ModuleGroup) => {
                                const ModuleOpen = ExpandedModules.has(ModuleGroup.key);
                                const ModuleRows = ModuleGroup.levels.flatMap((Level) => Level.rows);
                                return (
                                  <div key={ModuleGroup.key} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/5">
                                    <button
                                      type="button"
                                      onClick={() => ToggleExpanded(SetExpandedModules, ModuleGroup.key)}
                                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#7a1f58]/[0.045] dark:hover:bg-rose-400/10"
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#7a1f58]/20 bg-white text-[#7a1f58] dark:border-rose-300/30 dark:bg-slate-950/50 dark:text-rose-100">
                                          {ModuleOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </span>
                                        <div>
                                          <p className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#7a1f58] dark:text-rose-100">Module</p>
                                          <p className="text-sm font-black text-slate-950 dark:text-white">{ModuleGroup.label}</p>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap justify-end gap-2 text-xs font-black">
                                        {AverageAccuracyChip(ModuleRows)}
                                        <span className="rounded-full border border-[#7a1f58]/20 bg-white px-3 py-1 text-[#7a1f58] dark:border-rose-300/30 dark:bg-slate-950/50 dark:text-rose-100">{ModuleRows.length} Mock{ModuleRows.length === 1 ? "" : "s"}</span>
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
                                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#7a1f58]/[0.04] dark:hover:bg-rose-400/10"
                                              >
                                                <div className="flex min-w-0 items-center gap-3">
                                                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#7a1f58]/20 bg-[#7a1f58]/5 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">
                                                    {LevelOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                  </span>
                                                  <div>
                                                    <p className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#7a1f58] dark:text-rose-100">Level</p>
                                                    <p className="text-sm font-black text-slate-950 dark:text-white">{LevelGroup.label}</p>
                                                  </div>
                                                </div>
                                                <div className="flex flex-wrap justify-end gap-2 text-xs font-black">
                                                  {AverageAccuracyChip(LevelGroup.rows)}
                                                  <span className="rounded-full border border-[#7a1f58]/20 bg-[#7a1f58]/5 px-3 py-1 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">{LevelGroup.rows.length} Mock{LevelGroup.rows.length === 1 ? "" : "s"}</span>
                                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200">{LevelCompleted} Completed</span>
                                                </div>
                                              </button>

                                              {LevelOpen ? (
                                                <div className="border-t border-slate-100 p-3 dark:border-white/10">
                                                  <div className="overflow-hidden rounded-2xl border border-[#7a1f58]/15 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35">
                                                    <div className="grid grid-cols-[1.15fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.85fr] gap-0 bg-[#7a1f58]/10 text-[#7a1f58] dark:bg-rose-300/15 dark:text-rose-100">
                                                      {MockTableColumns.map((Column) => (
                                                        <div key={Column.label} className="px-3 py-3 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#5f123f] dark:text-rose-50">
                                                          {Column.key ? (
                                                            <button
                                                              type="button"
                                                              onClick={() => SetMockTableSort((Current) => NextSortState(Current, Column.key!))}
                                                              className="inline-flex items-center gap-1.5 rounded-lg text-left transition hover:text-[#7a1f58] focus:outline-none focus:ring-2 focus:ring-[#7a1f58]/25 dark:hover:text-rose-100 dark:focus:ring-rose-300/25"
                                                              aria-label={`Sort by ${Column.label}`}
                                                            >
                                                              <span>{Column.label}</span>
                                                              <SortIndicator Sort={MockTableSort} ColumnKey={Column.key} />
                                                            </button>
                                                          ) : (
                                                            Column.label
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                                                      {SortRows(LevelGroup.rows, MockTableSort).map((Row) => (
                                                        <div
                                                          key={Row.assignmentId}
                                                          role={Row.attemptId ? "button" : undefined}
                                                          tabIndex={Row.attemptId ? 0 : -1}
                                                          onClick={() => Row.attemptId ? router.push(`/teacher/competition/mock-result/${Row.attemptId}`) : undefined}
                                                          onKeyDown={(Event) => {
                                                            if (Row.attemptId && (Event.key === "Enter" || Event.key === " ")) {
                                                              Event.preventDefault();
                                                              router.push(`/teacher/competition/mock-result/${Row.attemptId}`);
                                                            }
                                                          }}
                                                          className={`group grid grid-cols-[1.15fr_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1fr_0.85fr] items-center gap-0 transition ${Row.attemptId ? "cursor-pointer hover:bg-[#7a1f58]/[0.035] dark:hover:bg-rose-400/10" : "bg-slate-50/40 dark:bg-white/[0.02]"}`}
                                                        >
                                                          <div className="px-3 py-4 text-sm font-black text-slate-950 dark:text-white">{Row.mockExam.title}</div>
                                                          <div className="px-3 py-4 text-xs font-black text-slate-950 dark:text-white">{Row.mockExam.mockCode || "-"}</div>
                                                          <div className="px-3 py-4">
                                                            <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] ${StatusClass(Row.status)}`}>{StatusLabel(Row.status)}</span>
                                                          </div>
                                                          <div className="px-3 py-4">
                                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${AccuracyBandClass(ScorePercentage(Row))}`}>
                                                              {ScoreText(Row)}
                                                            </span>
                                                          </div>
                                                          <div className="px-3 py-4">
                                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${AccuracyBandClass(IsCompleted(Row) && Row.accuracyPercentage != null ? Number(Row.accuracyPercentage) : null)}`}>
                                                              {IsCompleted(Row) ? PercentValue(Row.accuracyPercentage) : "-"}
                                                            </span>
                                                          </div>
                                                          <div className="px-3 py-4 text-sm font-bold text-slate-950 dark:text-white">{IsCompleted(Row) ? (Row.timeTakenText || "-") : "-"}</div>
                                                          <div className="px-3 py-4 text-sm font-bold text-slate-950 dark:text-white">{FormatDate(Row.assignedAt)}</div>
                                                          <div className="px-3 py-4 text-sm font-bold text-slate-950 dark:text-white">{IsCompleted(Row) ? FormatDate(Row.submittedAt) : "-"}</div>
                                                          <div className="px-3 py-4">
                                                            <ReviewButton Row={Row} />
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
      </section>
    </AppShell>
  );
}

function MiniMetric({ Label, Value }: { Label: string; Value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#7a1f58] dark:text-rose-100">{Label}</p>
      <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}


export default function TeacherCompetitionMockTrackerPage() {
  return <TeacherCompetitionMockTrackerContent />;
}
