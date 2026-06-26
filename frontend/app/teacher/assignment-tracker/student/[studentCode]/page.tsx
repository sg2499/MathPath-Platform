"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import {
  AnyRow,
  Chip,
  CompactDpsLabel,
  CompactLessonLabel,
  CompactModuleLevelLabel,
  NaturalCompare,
  SortRowsByCurriculum,
  StandardViewButton,
  accuracy,
  accuracyTone,
  averageAccuracy,
  completedText,
  currentWorkRows,
  dpsLabel,
  isBelowBenchmark,
  isCompleted,
  levelCodeOf,
  levelLabel,
  moduleCodeOf,
  moduleTitle,
  needsReattempt,
  requiredDpsForLevel,
  scoreText,
  studentCodeOf,
  studentNameOf,
  timeTakenText,
  uniqueAssignedConceptCount,
  uniqueClearedConceptCount,
  uniqueNeedsReattemptCount,
  uniquePendingConceptCount,
} from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherAssignmentTracker } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Lightbulb,
  Search,
  Target,
  Trophy,
} from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";



type SortDirection = "asc" | "desc";
type SortState<Key extends string> = {
  Key: Key;
  Direction: SortDirection;
} | null;

function NextSortState<Key extends string>(Current: SortState<Key>, Key: Key): SortState<Key> {
  if (!Current || Current.Key !== Key) return { Key, Direction: "asc" };
  if (Current.Direction === "asc") return { Key, Direction: "desc" };
  return null;
}

function SortIndicator<Key extends string>({ SortState, SortKey }: { SortState: SortState<Key>; SortKey: Key }) {
  if (!SortState || SortState.Key !== SortKey) return <span className="opacity-35">↕</span>;
  return <span aria-hidden="true">{SortState.Direction === "asc" ? "▲" : "▼"}</span>;
}

function SortableHeader<Key extends string>({
  Label,
  SortKey,
  SortState,
  OnSort,
  align = "left",
}: {
  Label: string;
  SortKey: Key;
  SortState: SortState<Key>;
  OnSort: (Key: Key) => void;
  align?: "left" | "center" | "right";
}) {
  const justifyClass = align === "center" ? "justify-center text-center" : align === "right" ? "justify-end text-right" : "justify-start text-left";
  return (
    <button
      type="button"
      onClick={() => OnSort(SortKey)}
      className={`inline-flex items-center gap-1 font-black uppercase tracking-[0.14em] transition hover:text-[#7a1f58] dark:hover:text-rose-100 ${justifyClass}`}
    >
      <span>{Label}</span>
      <SortIndicator SortState={SortState} SortKey={SortKey} />
    </button>
  );
}

function CompareText(FirstValue: unknown, SecondValue: unknown) {
  return NaturalCompare(String(FirstValue ?? ""), String(SecondValue ?? ""));
}

function CompareNumber(FirstValue: unknown, SecondValue: unknown) {
  const FirstNumber = Number(FirstValue ?? 0);
  const SecondNumber = Number(SecondValue ?? 0);
  return (Number.isFinite(FirstNumber) ? FirstNumber : 0) - (Number.isFinite(SecondNumber) ? SecondNumber : 0);
}

function ApplyDirection(Value: number, Direction: SortDirection) {
  return Direction === "asc" ? Value : -Value;
}

type WorkspaceTab = "OVERVIEW" | "LESSON_INSIGHTS";
type LessonFilter = string;
type StatusFilter = "" | "ALL" | "PENDING" | "CLEARED" | "NEEDS_REATTEMPT";
type PerformanceFilter =
  | ""
  | "ALL"
  | "EXCELLENCE"
  | "GROWTH"
  | "NEEDS_REATTEMPT";
type Tone = "green" | "blue" | "amber" | "red" | "slate";

type LessonGroup = {
  GroupKey: string;
  ModuleCode: string;
  LevelCode: string;
  LessonLabel: string;
  Sample: AnyRow;
  Rows: AnyRow[];
};

type LevelGroup = {
  GroupKey: string;
  ModuleCode: string;
  LevelCode: string;
  Sample: AnyRow;
  Lessons: LessonGroup[];
  Rows: AnyRow[];
};

type ModulePracticeGroup = {
  GroupKey: string;
  ModuleCode: string;
  Sample: AnyRow;
  Lessons: LessonGroup[];
  Levels: LevelGroup[];
  Rows: AnyRow[];
};

function NormalizeRows(RawData: unknown): AnyRow[] {
  if (Array.isArray(RawData)) return RawData;
  const Data = RawData as any;
  if (Array.isArray(Data?.attempts)) return Data.attempts;
  if (Array.isArray(Data?.rows)) return Data.rows;
  if (Array.isArray(Data?.results)) return Data.results;
  return [];
}

function RowNeedsReattempt(Row: AnyRow) {
  return (
    needsReattempt(Row) ||
    (isCompleted(Row) && (isBelowBenchmark(Row) || accuracy(Row) < 70))
  );
}

function IsCleared(Row: AnyRow) {
  return isCompleted(Row) && accuracy(Row) >= 70 && !RowNeedsReattempt(Row);
}

function StatusKey(Row: AnyRow): Exclude<StatusFilter, "" | "ALL"> {
  if (!isCompleted(Row)) return "PENDING";
  if (RowNeedsReattempt(Row)) return "NEEDS_REATTEMPT";
  return "CLEARED";
}

function DisplayStatus(Row: AnyRow) {
  const Key = StatusKey(Row);
  if (Key === "PENDING") return "Pending";
  if (Key === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  return "Cleared";
}

function RowCompletionTime(Row: AnyRow) {
  const Value = getFirstMathPathTimestamp(Row, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return Value ? mathPathTimestampValue(Value) : 0;
}

function RowTimeTakenSeconds(Row: AnyRow) {
  const Record = Row as any;
  const RawValue = Record.timeTakenSeconds ?? Record.durationSeconds ?? Record.timeTaken ?? Record.elapsedSeconds ?? Record.secondsSpent ?? 0;
  const NumberValue = Number(RawValue);
  return Number.isFinite(NumberValue) ? NumberValue : 0;
}

function IsActionNeeded(Row: AnyRow) {
  return StatusKey(Row) === "PENDING" || StatusKey(Row) === "NEEDS_REATTEMPT";
}

function MatchesStatusFilter(Row: AnyRow, FilterValue: StatusFilter) {
  if (!FilterValue || FilterValue === "ALL") return true;
  return StatusKey(Row) === FilterValue;
}

function AttemptedRows(Rows: AnyRow[]) {
  return Rows.filter(isCompleted);
}


function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
}) {
  return (
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      {icon && (
        <div className="math-teacher-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-300">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {value}
      </p>
    </div>
  );
}



function ScopedCompletedAttemptRows(Rows: AnyRow[]) {
  return ExpandAttemptHistoryRows(Rows).filter(
    (Row) => isCompleted(Row) && Number.isFinite(accuracy(Row)),
  );
}

function AverageValues(Values: number[]) {
  if (!Values.length) return 0;
  return Math.round(Values.reduce((Total, Value) => Total + Value, 0) / Values.length);
}

function AttemptAverageAccuracy(Rows: AnyRow[]) {
  return AverageValues(ScopedCompletedAttemptRows(Rows).map(accuracy));
}

function HierarchyAverageAccuracy(Rows: AnyRow[]) {
  const AccuracyRows = ScopedCompletedAttemptRows(Rows);
  if (!AccuracyRows.length) return 0;

  const LevelCodes = Array.from(new Set(AccuracyRows.map(levelCodeOf).filter(Boolean))).sort(NaturalCompare);
  if (!LevelCodes.length) return AttemptAverageAccuracy(AccuracyRows);

  const LevelAverages = LevelCodes
    .map((LevelCode) => AttemptAverageAccuracy(AccuracyRows.filter((Row) => levelCodeOf(Row) === LevelCode)))
    .filter((Value) => Value > 0);

  return AverageValues(LevelAverages);
}

function ScopedAverageAccuracy(Rows: AnyRow[]) {
  return HierarchyAverageAccuracy(Rows);
}

function AverageAccuracyDisplay(Rows: AnyRow[]) {
  const ReviewedRows = ScopedCompletedAttemptRows(Rows);
  return ReviewedRows.length ? `${ScopedAverageAccuracy(Rows)}%` : "—";
}

function MatchesPerformanceFilter(Row: AnyRow, FilterValue: PerformanceFilter) {
  if (!FilterValue || FilterValue === "ALL") return true;
  if (!isCompleted(Row)) return false;
  const RowAccuracy = accuracy(Row);
  if (FilterValue === "EXCELLENCE")
    return RowAccuracy >= 90 && !RowNeedsReattempt(Row);
  if (FilterValue === "GROWTH")
    return RowAccuracy >= 70 && RowAccuracy < 90 && !RowNeedsReattempt(Row);
  return RowNeedsReattempt(Row);
}

function PerformanceBand(Rows: AnyRow[]) {
  const ReviewedRows = ScopedCompletedAttemptRows(Rows);
  if (!ReviewedRows.length) {
    return {
      Label: "Pending",
      Tone: "amber" as Tone,
      Guidance:
        "Practice is assigned but not yet attempted in the selected filters.",
    };
  }

  const Average = ScopedAverageAccuracy(Rows);
  if (Average < 70) {
    return {
      Label: "Needs Re-Attempt",
      Tone: "red" as Tone,
      Guidance:
        "Overall average is below benchmark. Re-attempt work should be reviewed first.",
    };
  }
  if (Average >= 90) {
    return {
      Label: "Excellence Zone",
      Tone: "green" as Tone,
      Guidance:
        "Overall average is in the excellence range. Keep challenge practice active.",
    };
  }
  return {
    Label: "Growth Zone",
    Tone: "amber" as Tone,
    Guidance:
      "Overall average is at benchmark. Monitor consistency and challenge practice.",
  };
}

function BestAccuracy(Rows: AnyRow[]) {
  const Values = Rows.map(accuracy).filter((Value) => Value >= 0);
  return Values.length ? Math.max(...Values) : 0;
}

function BestAccuracyDisplay(Rows: AnyRow[]) {
  return Rows.length ? `${BestAccuracy(Rows)}%` : "—";
}

function LowestAccuracy(Rows: AnyRow[]) {
  const Values = Rows.filter(isCompleted)
    .map(accuracy)
    .filter((Value) => Value >= 0);
  return Values.length ? Math.min(...Values) : 0;
}

function LowestAccuracyDisplay(Rows: AnyRow[]) {
  return Rows.filter(isCompleted).length ? `${LowestAccuracy(Rows)}%` : "—";
}

function LessonKey(Row: AnyRow) {
  return [moduleCodeOf(Row), levelCodeOf(Row), CompactLessonLabel(Row)].join(
    "|",
  );
}

function BuildLessonGroups(Rows: AnyRow[]): LessonGroup[] {
  const GroupMap = new Map<string, AnyRow[]>();
  SortRowsByCurriculum(Rows).forEach((Row) => {
    const Key = LessonKey(Row);
    if (!GroupMap.has(Key)) GroupMap.set(Key, []);
    GroupMap.get(Key)!.push(Row);
  });

  return Array.from(GroupMap.entries())
    .map(([GroupKey, GroupRows]) => ({
      GroupKey,
      ModuleCode: moduleCodeOf(GroupRows[0] || {}),
      LevelCode: levelCodeOf(GroupRows[0] || {}),
      LessonLabel: CompactLessonLabel(GroupRows[0] || {}),
      Sample: GroupRows[0] || {},
      Rows: GroupRows,
    }))
    .sort(
      (FirstGroup, SecondGroup) =>
        NaturalCompare(FirstGroup.ModuleCode, SecondGroup.ModuleCode) ||
        NaturalCompare(FirstGroup.LevelCode, SecondGroup.LevelCode) ||
        NaturalCompare(FirstGroup.LessonLabel, SecondGroup.LessonLabel),
    );
}

function BuildModulePracticeGroups(
  LessonGroups: LessonGroup[],
): ModulePracticeGroup[] {
  const ModuleMap = new Map<string, LessonGroup[]>();
  LessonGroups.forEach((Group) => {
    if (!ModuleMap.has(Group.ModuleCode)) ModuleMap.set(Group.ModuleCode, []);
    ModuleMap.get(Group.ModuleCode)!.push(Group);
  });

  return Array.from(ModuleMap.entries())
    .map(([ModuleCode, Lessons]) => {
      const LevelMap = new Map<string, LessonGroup[]>();
      Lessons.forEach((Lesson) => {
        if (!LevelMap.has(Lesson.LevelCode)) LevelMap.set(Lesson.LevelCode, []);
        LevelMap.get(Lesson.LevelCode)!.push(Lesson);
      });

      const Levels = Array.from(LevelMap.entries())
        .map(([LevelCode, LevelLessons]) => ({
          GroupKey: `${ModuleCode}|${LevelCode}`,
          ModuleCode,
          LevelCode,
          Sample: LevelLessons[0]?.Sample || LevelLessons[0]?.Rows[0] || {},
          Lessons: LevelLessons.sort((FirstLesson, SecondLesson) =>
            NaturalCompare(FirstLesson.LessonLabel, SecondLesson.LessonLabel),
          ),
          Rows: LevelLessons.flatMap((Lesson) => Lesson.Rows),
        }))
        .sort((FirstLevel, SecondLevel) =>
          NaturalCompare(FirstLevel.LevelCode, SecondLevel.LevelCode),
        );

      return {
        GroupKey: ModuleCode,
        ModuleCode,
        Sample: Lessons[0]?.Sample || Lessons[0]?.Rows[0] || {},
        Lessons,
        Levels,
        Rows: Lessons.flatMap((Lesson) => Lesson.Rows),
      };
    })
    .sort((FirstModule, SecondModule) =>
      NaturalCompare(FirstModule.ModuleCode, SecondModule.ModuleCode),
    );
}

function LevelCoverageItems(Rows: AnyRow[]) {
  const LevelCodes = Array.from(
    new Set(Rows.map(levelCodeOf).filter(Boolean)),
  ).sort(NaturalCompare);
  return LevelCodes.map((LevelCode) => {
    const LevelRows = Rows.filter((Row) => levelCodeOf(Row) === LevelCode);
    const Required = requiredDpsForLevel(
      LevelRows.length ? LevelRows : Rows,
      LevelCode,
    );
    const Cleared = LevelRows.filter(IsCleared).length;
    const Pending = Math.max(Required - Cleared, 0);
    const Percent = Required
      ? Math.min(100, Math.round((Cleared / Required) * 100))
      : 0;
    return { LevelCode, Required, Cleared, Pending, Percent };
  });
}

function RowActivityTime(Row: AnyRow) {
  const Value = getFirstMathPathTimestamp(
    Row,
    MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  );
  return Value ? mathPathTimestampValue(Value) : 0;
}

function LessonOptions(Rows: AnyRow[]) {
  return Array.from(new Set(Rows.map(CompactLessonLabel).filter(Boolean))).sort(
    NaturalCompare,
  );
}

function RecentRows(Rows: AnyRow[]) {
  return [...Rows]
    .sort(
      (FirstRow, SecondRow) =>
        RowActivityTime(SecondRow) - RowActivityTime(FirstRow),
    )
    .slice(0, 4);
}

function TabButton({
  Active,
  children,
  OnClick,
}: {
  Active: boolean;
  children: ReactNode;
  OnClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={OnClick}
      className={`math-role-tab-button math-teacher-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${
        Active ? "is-active math-teacher-tab-force-selected" : ""
      }`}
      aria-selected={Active}
      data-active={Active ? "true" : "false"}
    >
      {children}
    </button>
  );
}



export default function TeacherStudentTrackerWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <TeacherStudentTrackerWorkspacePageContent />
    </Suspense>
  );
}

function TeacherStudentTrackerWorkspacePageContent() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  const Pathname = usePathname();
  const Params = useParams();
  const SearchParams = useSearchParams();
  const StudentCode = decodeURIComponent(String(Params.studentCode || ""));
  const [ActiveTab, SetActiveTab] = useState<WorkspaceTab>(() => SearchParams.get("tab") === "lesson-insights" ? "LESSON_INSIGHTS" : "OVERVIEW");
  const [SearchValue, SetSearchValue] = useState("");
  const [LessonFilterValue, SetLessonFilterValue] = useState<LessonFilter>("");
  const [StatusFilterValue, SetStatusFilterValue] = useState<StatusFilter>("");
  const [PerformanceFilterValue, SetPerformanceFilterValue] =
    useState<PerformanceFilter>("");
  const [ExpandedModuleKeys, SetExpandedModuleKeys] = useState<Set<string>>(
    new Set(),
  );
  const [ExpandedLevelKeys, SetExpandedLevelKeys] = useState<Set<string>>(
    new Set(),
  );
  const [ExpandedLessonKeys, SetExpandedLessonKeys] = useState<Set<string>>(
    new Set(),
  );


  const ChangeWorkspaceTab = useCallback((NextTab: WorkspaceTab) => {
    SetActiveTab(NextTab);
    const NextParams = new URLSearchParams(SearchParams.toString());
    if (NextTab === "OVERVIEW") NextParams.delete("tab");
    else NextParams.set("tab", "lesson-insights");
    const NextQuery = NextParams.toString();
    Router.replace(`${Pathname}${NextQuery ? `?${NextQuery}` : ""}`, { scroll: false });
  }, [Pathname, Router, SearchParams]);

  const Query = useQuery({
    queryKey: ["teacher-tracker"],
    queryFn: getTeacherAssignmentTracker,
    enabled: Ready,
  });

  const Rows = useMemo(() => NormalizeRows(Query.data), [Query.data]);
  const ScopeModuleCode = SearchParams.get("moduleCode") || "";
  const ScopeLevelCode = SearchParams.get("levelCode") || "";
  const AllStudentRows = useMemo(
    () => Rows.filter((Row) => studentCodeOf(Row) === StudentCode),
    [Rows, StudentCode],
  );
  const StudentRows = useMemo(
    () =>
      AllStudentRows.filter((Row) => {
        const ModuleMatch =
          !ScopeModuleCode || moduleCodeOf(Row) === ScopeModuleCode;
        const LevelMatch =
          !ScopeLevelCode || levelCodeOf(Row) === ScopeLevelCode;
        return ModuleMatch && LevelMatch;
      }),
    [AllStudentRows, ScopeModuleCode, ScopeLevelCode],
  );
  const StudentName = AllStudentRows[0]
    ? studentNameOf(AllStudentRows[0])
    : StudentCode;
  const QuickTarget = useMemo(() => {
    const AssignmentId = SearchParams.get("assignmentId") || "";
    const AttemptId = SearchParams.get("attemptId") || "";
    const DpsId = SearchParams.get("dpsId") || "";
    const ModuleCode = SearchParams.get("moduleCode") || "";
    const LevelCode = SearchParams.get("levelCode") || "";

    return StudentRows.find((Row) => {
      const AssignmentMatch =
        AssignmentId &&
        String(Row.assignmentId || Row.id || "") === AssignmentId;
      const AttemptMatch =
        AttemptId &&
        String(Row.attemptId || Row.latestAttemptId || "") === AttemptId;
      const DpsMatch = DpsId && String(Row.dpsId || Row.dps_id || "") === DpsId;
      const ModuleMatch =
        !ModuleCode || String(moduleCodeOf(Row)) === ModuleCode;
      const LevelMatch = !LevelCode || String(levelCodeOf(Row)) === LevelCode;
      return (
        (AssignmentMatch || AttemptMatch || DpsMatch) &&
        ModuleMatch &&
        LevelMatch
      );
    });
  }, [SearchParams, StudentRows]);
  const TargetDpsCount = Number(
    SearchParams.get("dpsCount") || SearchParams.get("assignmentCount") || 0,
  );
  const HasGroupedPracticeTarget =
    TargetDpsCount > 1 || SearchParams.get("isGrouped") === "true";
  const OrderedRows = useMemo(
    () => SortRowsByCurriculum(StudentRows),
    [StudentRows],
  );
  const LessonFilterOptions = useMemo(
    () => LessonOptions(OrderedRows),
    [OrderedRows],
  );

  const FilteredRows = useMemo(() => {
    const QueryValue = SearchValue.trim().toLowerCase();
    return OrderedRows.filter(
      (Row) =>
        (!LessonFilterValue ||
          LessonFilterValue === "ALL" ||
          CompactLessonLabel(Row) === LessonFilterValue) &&
        MatchesStatusFilter(Row, StatusFilterValue) &&
        MatchesPerformanceFilter(Row, PerformanceFilterValue) &&
        (!QueryValue ||
          String(
            [
              moduleCodeOf(Row),
              levelCodeOf(Row),
              CompactLessonLabel(Row),
              CompactDpsLabel(Row),
              CompactModuleLevelLabel(Row),
              DisplayStatus(Row),
              scoreText(Row),
              accuracy(Row),
            ].join(" "),
          )
            .toLowerCase()
            .includes(QueryValue)),
    );
  }, [
    OrderedRows,
    SearchValue,
    LessonFilterValue,
    StatusFilterValue,
    PerformanceFilterValue,
  ]);

  const CurrentFilteredRows = useMemo(
    () => currentWorkRows(FilteredRows),
    [FilteredRows],
  );

  const LessonGroups = useMemo(
    () => BuildLessonGroups(FilteredRows),
    [FilteredRows],
  );
  const ModuleGroups = useMemo(
    () => BuildModulePracticeGroups(LessonGroups),
    [LessonGroups],
  );
  const TargetAction = SearchParams.get("targetAction") || SearchParams.get("focus") || "";

  useEffect(() => {
    if (!StudentRows.length) return;
    const ShouldOpenLessonInsights =
      TargetAction.toLowerCase().includes("lesson-insights") ||
      TargetAction.toLowerCase().includes("pending") ||
      SearchParams.has("lessonId") ||
      SearchParams.has("dpsId") ||
      SearchParams.has("assignmentId") ||
      SearchParams.has("attemptId");
    if (!ShouldOpenLessonInsights) return;

    ChangeWorkspaceTab("LESSON_INSIGHTS");

    const AssignmentId = SearchParams.get("assignmentId") || "";
    const AttemptId = SearchParams.get("attemptId") || "";
    const DpsId = SearchParams.get("dpsId") || "";
    const LessonId = SearchParams.get("lessonId") || "";
    const ModuleCode = SearchParams.get("moduleCode") || "";
    const LevelCode = SearchParams.get("levelCode") || "";

    const TargetRow =
      StudentRows.find((Row) => {
        const AssignmentMatch = AssignmentId && String(Row.assignmentId || Row.id || "") === AssignmentId;
        const AttemptMatch = AttemptId && String(Row.attemptId || Row.latestAttemptId || "") === AttemptId;
        const DpsMatch = DpsId && String(Row.dpsId || Row.dps_id || "") === DpsId;
        const LessonMatch = LessonId && String(Row.lessonId || Row.lesson_id || "") === LessonId;
        const ModuleMatch = !ModuleCode || moduleCodeOf(Row) === ModuleCode;
        const LevelMatch = !LevelCode || levelCodeOf(Row) === LevelCode;
        return (AssignmentMatch || AttemptMatch || DpsMatch || LessonMatch || (!AssignmentId && !AttemptId && !DpsId && !LessonId)) && ModuleMatch && LevelMatch;
      }) || StudentRows[0];

    const ModuleKey = moduleCodeOf(TargetRow);
    const LevelKey = `${moduleCodeOf(TargetRow)}|${levelCodeOf(TargetRow)}`;
    const LessonGroupKey = LessonKey(TargetRow);

    SetExpandedModuleKeys((Current) => new Set([...Array.from(Current), ModuleKey]));
    SetExpandedLevelKeys((Current) => new Set([...Array.from(Current), LevelKey]));
    SetExpandedLessonKeys((Current) => new Set([...Array.from(Current), LessonGroupKey]));
  }, [SearchParams, StudentRows, TargetAction]);
  const Band = PerformanceBand(FilteredRows);
  const AssignedCount = uniqueAssignedConceptCount(CurrentFilteredRows);
  const ClearedCount = uniqueClearedConceptCount(CurrentFilteredRows);
  const CompletedCount = CurrentFilteredRows.filter(isCompleted).length;
  const PendingCount = uniquePendingConceptCount(CurrentFilteredRows);
  const ReattemptCount = uniqueNeedsReattemptCount(CurrentFilteredRows);
  const NeedsReattemptCount = uniqueNeedsReattemptCount(CurrentFilteredRows);
  const ActionRows = useMemo(
    () => FilteredRows.filter(IsActionNeeded),
    [FilteredRows],
  );
  const VisibleRecentRows = useMemo(
    () => RecentRows(FilteredRows),
    [FilteredRows],
  );

  const ToggleModule = (GroupKey: string) => {
    SetExpandedModuleKeys((CurrentKeys) => {
      const NextKeys = new Set(CurrentKeys);
      if (NextKeys.has(GroupKey)) NextKeys.delete(GroupKey);
      else NextKeys.add(GroupKey);
      return NextKeys;
    });
  };

  const ToggleLevel = (GroupKey: string) => {
    SetExpandedLevelKeys((CurrentKeys) => {
      const NextKeys = new Set(CurrentKeys);
      if (NextKeys.has(GroupKey)) NextKeys.delete(GroupKey);
      else NextKeys.add(GroupKey);
      return NextKeys;
    });
  };

  const ToggleLesson = (GroupKey: string) => {
    SetExpandedLessonKeys((CurrentKeys) => {
      const NextKeys = new Set(CurrentKeys);
      if (NextKeys.has(GroupKey)) NextKeys.delete(GroupKey);
      else NextKeys.add(GroupKey);
      return NextKeys;
    });
  };

  const OpenAttempt = (Row: AnyRow) => {
    if (Row.attemptId) Router.push(`/teacher/result/${Row.attemptId}`);
  };

  if (!Ready || Query.isLoading)
    return <LoadingState label="Loading practice workspace..." />;
  if (Query.isError)
    return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Practice Tracker">
      {StudentRows.length ? (
        <section className="w-full space-y-6">
          <div className="math-hero">
            <div>
              <p className="math-kicker">Student Practice Review</p>
              <h1 className="math-title">{StudentName}</h1>
              <p className="math-subtitle">
                Review assigned practice, completion date, accuracy bands,
                lesson insights, and attempt history for this student.
              </p>
              <p className="mt-2 text-sm font-bold text-slate-500">
                Student Code: {StudentCode}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Assigned DPS"
                value={AssignedCount}
                icon={<ClipboardList size={15} />}
              />
              <Metric
                label="Cleared DPS"
                value={ClearedCount}
                icon={<CheckCircle2 size={15} />}
              />
              <Metric
                label="Pending DPS"
                value={PendingCount}
                icon={<AlertTriangle size={15} />}
              />
              <Metric
                label="Needs Re-Attempt"
                value={NeedsReattemptCount}
                icon={<Target size={15} />}
              />
              <Metric
                label="Average Accuracy"
                value={AverageAccuracyDisplay(FilteredRows)}
                icon={<BarChart3 size={15} />}
              />
            </div>
          </div>

          {QuickTarget ? (
            <NotificationTargetBanner
              className="mt-5"
              label="Practice"
              title={
                HasGroupedPracticeTarget
                  ? `${TargetDpsCount} DPS Records Highlighted`
                  : "DPS Record Highlighted"
              }
              description={
                HasGroupedPracticeTarget
                  ? `${StudentName} · ${String(QuickTarget.moduleCode || "Module")} · ${String(QuickTarget.levelCode || "Level")} has ${TargetDpsCount} assigned DPS records in focus.`
                  : `${StudentName} · ${String(QuickTarget.moduleCode || "Module")} · ${String(QuickTarget.levelCode || "Level")} · ${String(QuickTarget.lessonTitle || (QuickTarget as any).lessonName || "Lesson")} · ${String(QuickTarget.dpsTitle || (QuickTarget as any).dpsName || "DPS")}`
              }
              actionLabel={QuickTarget.attemptId ? "View Attempt" : undefined}
              onAction={
                QuickTarget.attemptId
                  ? () =>
                      Router.push(`/teacher/result/${QuickTarget.attemptId}`)
                  : undefined
              }
            />
          ) : null}

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <InsightCard
              Title="Performance Band"
              Value={Band.Label}
              Subtitle={Band.Guidance}
              Tone={Band.Tone === "slate" ? "blue" : Band.Tone}
              Icon={<Target size={20} />}
            />
            <InsightCard
              Title="Best Accuracy"
              Value={BestAccuracyDisplay(AttemptedRows(FilteredRows))}
              Subtitle="Strongest reviewed work for the selected filters."
              Tone="green"
              Icon={<Trophy size={20} />}
            />
            <InsightCard
              Title="Lowest Accuracy"
              Value={LowestAccuracyDisplay(AttemptedRows(FilteredRows))}
              Subtitle="Lowest attempted accuracy for the selected filters."
              Tone={
                LowestAccuracy(AttemptedRows(FilteredRows)) < 70
                  ? "red"
                  : "blue"
              }
              Icon={<Lightbulb size={20} />}
            />
          </div>

          <div className="mt-6 math-operation-panel">
            <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_230px]">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="math-input pl-11"
                  value={SearchValue}
                  onChange={(Event) => SetSearchValue(Event.target.value)}
                  placeholder="Search Practice"
                />
              </div>
              <select
                className="math-input"
                value={LessonFilterValue}
                onChange={(Event) => SetLessonFilterValue(Event.target.value)}
                title="Filter by lesson"
                aria-label="Filter by lesson"
              >
                <option value="" disabled>
                  Choose Lesson
                </option>
                <option value="ALL">All Lessons</option>
                {LessonFilterOptions.map((LessonCode) => (
                  <option key={LessonCode} value={LessonCode}>
                    {LessonCode}
                  </option>
                ))}
              </select>
              <select
                className="math-input"
                value={StatusFilterValue}
                onChange={(Event) =>
                  SetStatusFilterValue(Event.target.value as StatusFilter)
                }
                title="Filter by work status"
                aria-label="Filter by work status"
              >
                <option value="" disabled>
                  Choose Status
                </option>
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CLEARED">Cleared</option>
                <option value="NEEDS_REATTEMPT">Needs Re-Attempt</option>
              </select>
              <select
                className="math-input"
                value={PerformanceFilterValue}
                onChange={(Event) =>
                  SetPerformanceFilterValue(
                    Event.target.value as PerformanceFilter,
                  )
                }
                title="Filter by performance"
                aria-label="Filter by performance"
              >
                <option value="" disabled>
                  Choose Performance
                </option>
                <option value="ALL">All Performance</option>
                <option value="EXCELLENCE">Excellence Zone</option>
                <option value="GROWTH">Growth Zone</option>
                <option value="NEEDS_REATTEMPT">Needs Re-Attempt</option>
              </select>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <TabButton
                Active={ActiveTab === "OVERVIEW"}
                OnClick={() => ChangeWorkspaceTab("OVERVIEW")}
              >
                Overview
              </TabButton>
              <TabButton
                Active={ActiveTab === "LESSON_INSIGHTS"}
                OnClick={() => ChangeWorkspaceTab("LESSON_INSIGHTS")}
              >
                Lesson Insights
              </TabButton>
            </div>
          </div>

          <div className="mt-6">
            {ActiveTab === "OVERVIEW" ? (
              <OverviewTab
                Rows={FilteredRows}
                AssignedCount={AssignedCount}
                PendingCount={PendingCount}
                ReattemptCount={ReattemptCount}
                ClearedCount={ClearedCount}
                NeedsReattemptCount={NeedsReattemptCount}
                ActionRows={ActionRows.slice(0, 4)}
                RecentRows={VisibleRecentRows}
                OnView={OpenAttempt}
              />
            ) : (
              <LessonInsightsTab
                Groups={ModuleGroups}
                ExpandedModuleKeys={ExpandedModuleKeys}
                ExpandedLevelKeys={ExpandedLevelKeys}
                ExpandedLessonKeys={ExpandedLessonKeys}
                OnToggleModule={ToggleModule}
                OnToggleLevel={ToggleLevel}
                OnToggleLesson={ToggleLesson}
                OnView={OpenAttempt}
              />
            )}
          </div>
        </section>
      ) : (
        <section className="w-full">
          <EmptyState message="No matching practice records are available for this student." />
        </section>
      )}
    </AppShell>
  );
}

function InsightCard({
  Title,
  Value,
  Subtitle,
  Tone,
  Icon,
}: {
  Title: string;
  Value: string | number;
  Subtitle: string;
  Tone: "teacher" | "green" | "blue" | "amber" | "red";
  Icon: ReactNode;
}) {
  const Tones = {
    teacher:
      "border-[#d8a7bb] bg-gradient-to-br from-[#fff7fb] via-[#fffaf5] to-[#f4e6ef] text-[#4b1238] dark:border-[#8a4b67] dark:from-[#2a1020] dark:via-[#25101d] dark:to-[#35182a] dark:text-[#ffd8e8]",
    green:
      "border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    blue: "border-blue-200 bg-blue-50/85 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
    amber:
      "border-amber-200 bg-amber-50/85 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    red: "border-rose-200 bg-rose-50/85 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  };
  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${Tones[Tone]}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm dark:bg-slate-950/50">
          {Icon}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] opacity-70">
            {Title}
          </p>
          <h3 className="mt-1 text-2xl font-black">{Value}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm font-bold opacity-80">{Subtitle}</p>
    </div>
  );
}

function OverviewTab({
  Rows,
  AssignedCount,
  PendingCount,
  ReattemptCount,
  ClearedCount,
  NeedsReattemptCount,
  ActionRows,
  RecentRows,
  OnView,
}: {
  Rows: AnyRow[];
  AssignedCount: number;
  PendingCount: number;
  ReattemptCount: number;
  ClearedCount: number;
  NeedsReattemptCount: number;
  ActionRows: AnyRow[];
  RecentRows: AnyRow[];
  OnView: (Row: AnyRow) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="math-kicker">Practice Control</p>
        <h2 className="math-teacher-block-title text-2xl font-black text-slate-950 dark:text-white">
          What Needs Attention Now?
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniMetric
            Title="Assigned DPS"
            Value={AssignedCount}
            Tone="blue"
            Icon={<ClipboardList className="h-5 w-5" />}
          />
          <MiniMetric
            Title="Cleared DPS"
            Value={ClearedCount}
            Tone="green"
            Icon={<CheckCircle2 className="h-5 w-5" />}
          />
          <MiniMetric
            Title="Pending DPS"
            Value={PendingCount}
            Tone="amber"
            Icon={<Clock3 className="h-5 w-5" />}
          />
          <MiniMetric
            Title="Needs Re-Attempt"
            Value={ReattemptCount}
            Tone="red"
            Icon={<AlertTriangle className="h-5 w-5" />}
          />
        </div>
        <LevelCoverageCard Rows={Rows} />
      </div>
      <div className="grid gap-6">
        <PracticeList
          Title="Priority Queue"
          Description="Practice requiring follow-up appears here."
          Rows={ActionRows}
          Empty="No priority work detected."
          OnView={OnView}
        />
        <PracticeList
          Title="Recent Practice"
          Description="Latest visible practice for this student."
          Rows={RecentRows}
          Empty="No recent practice detected."
          OnView={OnView}
        />
      </div>
    </div>
  );
}

function LevelCoverageCard({ Rows }: { Rows: AnyRow[] }) {
  const Items = LevelCoverageItems(Rows);
  return (
    <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="math-kicker">Level Coverage</p>
          <h3 className="math-teacher-block-title mt-1 text-lg font-black text-slate-950 dark:text-white">
            Cleared DPS Out Of Available Sheets
          </h3>
        </div>
        <Chip tone="blue">{Items.length} Level(s)</Chip>
      </div>
      <div className="mt-4 grid gap-3">
        {Items.length ? (
          Items.map((Item) => (
            <div key={Item.LevelCode}>
              <div className="flex items-center justify-between gap-3 text-sm font-black text-slate-800 dark:text-slate-100">
                <span>{Item.LevelCode}</span>
                <span>
                  {Item.Cleared}/{Item.Required}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#6d1b4c] via-[#a43b70] to-[#d8a7bb] shadow-[0_0_14px_rgba(164,59,112,0.35)]"
                  style={{ width: `${Item.Percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {Item.Pending} DPS pending from the full level requirement.
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-[18px] bg-white p-3 text-sm font-bold text-slate-500 dark:bg-slate-950">
            No level coverage available for the selected filters.
          </p>
        )}
      </div>
    </div>
  );
}

function MiniMetric({
  Title,
  Value,
  Tone,
  Icon,
}: {
  Title: string;
  Value: number;
  Tone: "blue" | "green" | "amber" | "red";
  Icon: ReactNode;
}) {
  const Tones = {
    blue:
      "border-blue-200 bg-blue-50 text-blue-800 shadow-[0_14px_34px_rgba(37,99,235,0.10)] dark:border-[#8a4b67] dark:bg-gradient-to-br dark:from-[#2a1020] dark:via-[#25101d] dark:to-[#35182a] dark:text-[#ffd8e8]",
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  };
  const IconTones = {
    blue:
      "bg-white/80 text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-[#3a1730] dark:text-[#ffd8e8] dark:ring-[#8a4b67]",
    green:
      "bg-white/80 text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-slate-950/40 dark:text-emerald-200 dark:ring-emerald-900",
    amber:
      "bg-white/80 text-amber-700 shadow-sm ring-1 ring-amber-200 dark:bg-slate-950/40 dark:text-amber-200 dark:ring-amber-900",
    red: "bg-white/80 text-rose-700 shadow-sm ring-1 ring-rose-200 dark:bg-slate-950/40 dark:text-rose-200 dark:ring-rose-900",
  };
  return (
    <div className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[22px] border p-4 ${Tones[Tone]}`}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${IconTones[Tone]}`}
          aria-hidden="true"
        >
          {Icon}
        </div>
      </div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] opacity-75 transition-colors duration-300 group-hover:text-[var(--math-role-primary)]">
        {Title}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)]">
        {Value}
      </p>
    </div>
  );
}

function PracticeList({
  Title,
  Description,
  Rows,
  Empty,
  OnView,
}: {
  Title: string;
  Description: string;
  Rows: AnyRow[];
  Empty: string;
  OnView: (Row: AnyRow) => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <h2 className="math-teacher-block-title text-xl font-black text-slate-950 dark:text-white">
        {Title}
      </h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">{Description}</p>
      <div className="mt-4 grid gap-3">
        {Rows.length ? (
          Rows.map((Row, Index) => (
            <CompactPracticeRow
              key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
              Row={Row}
              OnView={OnView}
            />
          ))
        ) : (
          <p className="rounded-[20px] bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">
            {Empty}
          </p>
        )}
      </div>
    </div>
  );
}

function CompactPracticeRow({
  Row,
  OnView,
}: {
  Row: AnyRow;
  OnView: (Row: AnyRow) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-slate-50/80 p-4 dark:bg-slate-900/70 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <p className="text-sm font-black text-slate-950 dark:text-white">
          {CompactDpsLabel(Row)}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {moduleCodeOf(Row)} · {levelCodeOf(Row)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Chip
          tone={
            StatusKey(Row) === "CLEARED"
              ? "green"
              : StatusKey(Row) === "PENDING"
                ? "amber"
                : "red"
          }
        >
          {DisplayStatus(Row)}
        </Chip>
        {isCompleted(Row) ? (
          <Chip tone={accuracy(Row) >= 70 ? "green" : "red"}>
            {accuracy(Row)}%
          </Chip>
        ) : null}
        {!isCompleted(Row) ? (
          <Chip tone="amber">Pending</Chip>
        ) : (
          <StandardViewButton
            label="View Details"
            tooltip="Open attempt detail"
            onClick={() => OnView(Row)}
            compact
          />
        )}
      </div>
    </div>
  );
}

function LessonInsightsTab({
  Groups,
  ExpandedModuleKeys,
  ExpandedLevelKeys,
  ExpandedLessonKeys,
  OnToggleModule,
  OnToggleLevel,
  OnToggleLesson,
  OnView,
}: {
  Groups: ModulePracticeGroup[];
  ExpandedModuleKeys: Set<string>;
  ExpandedLevelKeys: Set<string>;
  ExpandedLessonKeys: Set<string>;
  OnToggleModule: (GroupKey: string) => void;
  OnToggleLevel: (GroupKey: string) => void;
  OnToggleLesson: (GroupKey: string) => void;
  OnView: (Row: AnyRow) => void;
}) {
  if (!Groups.length)
    return (
      <EmptyState message="No lesson insights found for the selected filters." />
    );
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="math-kicker">Lesson Insights</p>
      <h2 className="text-2xl font-black text-slate-950 dark:text-white">
        Module, Level, Lesson And DPS Records
      </h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">
        Module, level, and lesson rows are collapsed by default. Expand the path
        to review exact DPS attempt records.
      </p>
      <div className="mt-5 grid gap-4">
        {Groups.map((Group) => (
          <ModulePracticeBlock
            key={Group.GroupKey}
            Group={Group}
            ExpandedModuleKeys={ExpandedModuleKeys}
            ExpandedLevelKeys={ExpandedLevelKeys}
            ExpandedLessonKeys={ExpandedLessonKeys}
            OnToggleModule={OnToggleModule}
            OnToggleLevel={OnToggleLevel}
            OnToggleLesson={OnToggleLesson}
            OnView={OnView}
          />
        ))}
      </div>
    </div>
  );
}

function ModulePracticeBlock({
  Group,
  ExpandedModuleKeys,
  ExpandedLevelKeys,
  ExpandedLessonKeys,
  OnToggleModule,
  OnToggleLevel,
  OnToggleLesson,
  OnView,
}: {
  Group: ModulePracticeGroup;
  ExpandedModuleKeys: Set<string>;
  ExpandedLevelKeys: Set<string>;
  ExpandedLessonKeys: Set<string>;
  OnToggleModule: (GroupKey: string) => void;
  OnToggleLevel: (GroupKey: string) => void;
  OnToggleLesson: (GroupKey: string) => void;
  OnView: (Row: AnyRow) => void;
}) {
  const IsExpanded = ExpandedModuleKeys.has(Group.GroupKey);
  const ClearedCount = uniqueClearedConceptCount(Group.Rows);
  const ReviewedRows = ScopedCompletedAttemptRows(Group.Rows);
  const Average = ReviewedRows.length ? HierarchyAverageAccuracy(Group.Rows) : null;
  return (
    <section className="math-operation-panel-compact">
      <button
        type="button"
        onClick={() => OnToggleModule(Group.GroupKey)}
        className="flex w-full flex-col gap-4 text-left xl:flex-row xl:items-center xl:justify-between"
      >
        <div>
          <p className="math-kicker">Module</p>
          <h3 className="text-xl font-black text-slate-950 dark:text-white">
            {moduleTitle(Group.Sample)}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {Group.Levels.length} level(s) and {Group.Lessons.length} lesson(s)
            in the selected scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="blue">{Group.Levels.length} Level(s)</Chip>
          <Chip tone="blue">{uniqueAssignedConceptCount(Group.Rows)} DPS</Chip>
          <Chip tone="green">{ClearedCount} Cleared</Chip>
          {Average === null ? null : (
            <Chip tone={accuracyTone(Average)}>{Average}% Avg</Chip>
          )}
          <span
            className={`rounded-full border border-slate-200 bg-white p-2 shadow-sm transition dark:border-slate-800 dark:bg-slate-950 ${IsExpanded ? "rotate-180" : ""}`}
          >
            <ChevronDown size={16} />
          </span>
        </div>
      </button>
      {IsExpanded ? (
        <div className="mt-4 grid gap-3">
          {Group.Levels.map((Level) => (
            <LevelPracticeBlock
              key={Level.GroupKey}
              Group={Level}
              IsExpanded={ExpandedLevelKeys.has(Level.GroupKey)}
              ExpandedLessonKeys={ExpandedLessonKeys}
              OnToggleLevel={() => OnToggleLevel(Level.GroupKey)}
              OnToggleLesson={OnToggleLesson}
              OnView={OnView}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LevelPracticeBlock({
  Group,
  IsExpanded,
  ExpandedLessonKeys,
  OnToggleLevel,
  OnToggleLesson,
  OnView,
}: {
  Group: LevelGroup;
  IsExpanded: boolean;
  ExpandedLessonKeys: Set<string>;
  OnToggleLevel: () => void;
  OnToggleLesson: (GroupKey: string) => void;
  OnView: (Row: AnyRow) => void;
}) {
  const ReviewedRows = ScopedCompletedAttemptRows(Group.Rows);
  const Average = ReviewedRows.length ? AttemptAverageAccuracy(Group.Rows) : null;
  const ClearedCount = uniqueClearedConceptCount(Group.Rows);
  return (
    <div className="rounded-[24px] border border-cyan-100 bg-cyan-50/35 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/10">
      <button
        type="button"
        onClick={OnToggleLevel}
        className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <p className="math-kicker">Level</p>
          <h4 className="text-lg font-black text-slate-950 dark:text-white">
            {levelLabel(Group.Sample)}
          </h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="blue">{Group.Lessons.length} Lesson(s)</Chip>
          <Chip tone="green">{ClearedCount} Cleared</Chip>
          {Average === null ? null : (
            <Chip tone={accuracyTone(Average)}>{Average}% Avg</Chip>
          )}
          <span
            className={`rounded-full border border-slate-200 bg-white p-2 shadow-sm transition dark:border-slate-800 dark:bg-slate-950 ${IsExpanded ? "rotate-180" : ""}`}
          >
            <ChevronDown size={16} />
          </span>
        </div>
      </button>
      {IsExpanded ? (
        <div className="mt-4 grid gap-3">
          {Group.Lessons.map((Lesson) => (
            <LessonInsightBlock
              key={Lesson.GroupKey}
              Group={Lesson}
              IsExpanded={ExpandedLessonKeys.has(Lesson.GroupKey)}
              OnToggle={() => OnToggleLesson(Lesson.GroupKey)}
              OnView={OnView}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LessonInsightBlock({
  Group,
  IsExpanded,
  OnToggle,
  OnView,
}: {
  Group: LessonGroup;
  IsExpanded: boolean;
  OnToggle: () => void;
  OnView: (Row: AnyRow) => void;
}) {
  const ReviewedRows = ScopedCompletedAttemptRows(Group.Rows);
  const Average = ReviewedRows.length ? AttemptAverageAccuracy(Group.Rows) : null;
  const ClearedCount = uniqueClearedConceptCount(Group.Rows);
  const PendingCount = uniquePendingConceptCount(Group.Rows);
  const NeedsReattemptCount = uniqueNeedsReattemptCount(Group.Rows);
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={OnToggle}
        className="flex w-full flex-col gap-4 text-left xl:flex-row xl:items-start xl:justify-between"
      >
        <div>
          <p className="math-kicker">Lesson</p>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">
            {Group.LessonLabel}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            DPS records under this lesson.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="blue">{uniqueAssignedConceptCount(Group.Rows)} DPS</Chip>
          {Average === null ? null : (
            <Chip tone={accuracyTone(Average)}>{Average}% Avg</Chip>
          )}
          <Chip tone="green">Cleared: {ClearedCount}</Chip>
          {PendingCount ? (
            <Chip tone="amber">Pending: {PendingCount}</Chip>
          ) : null}
          {NeedsReattemptCount ? (
            <Chip tone="red">Needs Re-Attempt: {NeedsReattemptCount}</Chip>
          ) : null}
          <span
            className={`rounded-full border border-slate-200 bg-white p-2 shadow-sm transition dark:border-slate-800 dark:bg-slate-950 ${IsExpanded ? "rotate-180" : ""}`}
          >
            <ChevronDown size={16} />
          </span>
        </div>
      </button>
      {IsExpanded ? (
        <PracticeRowsTable Rows={Group.Rows} OnView={OnView} ShowBenchmark />
      ) : null}
    </div>
  );
}

function ExpandAttemptHistoryRows(Rows: AnyRow[]) {
  return Rows.flatMap((Row) => {
    const History = Array.isArray(Row.attemptHistory) ? Row.attemptHistory : [];
    if (!History.length) return [Row];
    return History.map((AttemptRow: AnyRow, Index: number) => ({
      ...Row,
      ...AttemptRow,
      attemptNumber: AttemptRow.attemptNumber ?? Index + 1,
      attemptSequence: AttemptRow.attemptSequence ?? Index + 1,
      isReattempt: Boolean(AttemptRow.isReattempt ?? Index > 0),
      parentAssignmentId: Row.assignmentId ?? Row.id,
    }));
  });
}

function AttemptTypeLabel(Row: AnyRow, DpsAttemptIndex: number) {
  const Record = Row as any;
  const ExplicitLabel = String(Record.attemptLabel ?? Record.attempt ?? "").trim();
  if (ExplicitLabel) return ExplicitLabel;

  const RetryNumber = Number(Record.retryAttemptNumber ?? Record.reattemptNumber ?? Record.retryNumber ?? 0);
  if (Number.isFinite(RetryNumber) && RetryNumber > 0) return `Re-Attempt ${RetryNumber}`;

  const RawAttemptNumber = Number(
    Record.attemptNumber ??
      Record.attemptNo ??
      Record.attemptIndex ??
      0,
  );
  const ExplicitReattempt = Boolean(
    Record.isReattempt ||
    Record.reattemptOfAttemptId ||
    Record.parentAttemptId ||
    String(Record.attemptType ?? Record.type ?? "")
      .toUpperCase()
      .includes("RE"),
  );

  if (ExplicitReattempt || RawAttemptNumber > 1 || DpsAttemptIndex > 0) {
    const ReattemptNumber = Math.max(
      RawAttemptNumber > 1 ? RawAttemptNumber - 1 : 1,
      DpsAttemptIndex || 1,
    );
    return `Re-Attempt ${ReattemptNumber}`;
  }

  return "Original";
}

function AttemptStatusLabel(Row: AnyRow, AttemptType: string) {
  if (!AttemptType.startsWith("Re-Attempt")) return DisplayStatus(Row);
  if (!isCompleted(Row)) return "Re-Attempt Pending";
  return accuracy(Row) >= 70 && !isBelowBenchmark(Row)
    ? "Re-Attempt Cleared"
    : "Needs Re-Attempt";
}

type TeacherPracticeDetailSortKey = "dps" | "attempt" | "status" | "score" | "accuracy" | "benchmark" | "timeTaken" | "completionDate";

function ComparePracticeDetailRows(FirstRow: AnyRow, SecondRow: AnyRow, SortState: SortState<TeacherPracticeDetailSortKey>) {
  if (!SortState) return SortRowsByCurriculum([FirstRow, SecondRow])[0] === FirstRow ? -1 : 1;
  const FirstAttemptType = AttemptTypeLabel(FirstRow, 0);
  const SecondAttemptType = AttemptTypeLabel(SecondRow, 0);
  let Result = 0;
  if (SortState.Key === "dps") Result = CompareText(CompactDpsLabel(FirstRow), CompactDpsLabel(SecondRow));
  if (SortState.Key === "attempt") Result = CompareText(FirstAttemptType, SecondAttemptType);
  if (SortState.Key === "status") Result = CompareText(AttemptStatusLabel(FirstRow, FirstAttemptType), AttemptStatusLabel(SecondRow, SecondAttemptType));
  if (SortState.Key === "score") Result = CompareText(scoreText(FirstRow), scoreText(SecondRow));
  if (SortState.Key === "accuracy") Result = CompareNumber(isCompleted(FirstRow) ? accuracy(FirstRow) : -1, isCompleted(SecondRow) ? accuracy(SecondRow) : -1);
  if (SortState.Key === "benchmark") {
    const FirstBenchmark = isCompleted(FirstRow) ? (RowNeedsReattempt(FirstRow) ? "Benchmark Not Met" : "Benchmark Met") : "Pending";
    const SecondBenchmark = isCompleted(SecondRow) ? (RowNeedsReattempt(SecondRow) ? "Benchmark Not Met" : "Benchmark Met") : "Pending";
    Result = CompareText(FirstBenchmark, SecondBenchmark);
  }
  if (SortState.Key === "timeTaken") Result = CompareNumber(RowTimeTakenSeconds(FirstRow), RowTimeTakenSeconds(SecondRow));
  if (SortState.Key === "completionDate") Result = CompareNumber(RowCompletionTime(FirstRow), RowCompletionTime(SecondRow));
  return ApplyDirection(Result || (SortRowsByCurriculum([FirstRow, SecondRow])[0] === FirstRow ? -1 : 1), SortState.Direction);
}

function PracticeRowsTable({
  Rows,
  OnView,
  ShowBenchmark,
}: {
  Rows: AnyRow[];
  OnView: (Row: AnyRow) => void;
  ShowBenchmark?: boolean;
}) {
  const [SortStateValue, SetSortStateValue] = useState<SortState<TeacherPracticeDetailSortKey>>(null);
  const BaseRows = useMemo(() => SortRowsByCurriculum(ExpandAttemptHistoryRows(Rows)), [Rows]);
  const DisplayRows = useMemo(
    () => SortStateValue ? [...BaseRows].sort((FirstRow, SecondRow) => ComparePracticeDetailRows(FirstRow, SecondRow, SortStateValue)) : BaseRows,
    [BaseRows, SortStateValue],
  );
  const HandleSort = useCallback((Key: TeacherPracticeDetailSortKey) => {
    SetSortStateValue((Current) => NextSortState(Current, Key));
  }, []);
  const DpsAttemptCounts = new Map<string, number>();
  const GridColumns = ShowBenchmark
    ? "grid-cols-[minmax(142px,.96fr)_minmax(100px,.5fr)_minmax(118px,.58fr)_minmax(82px,.4fr)_minmax(90px,.44fr)_minmax(124px,.58fr)_minmax(100px,.48fr)_minmax(142px,.66fr)_136px]"
    : "grid-cols-[minmax(142px,1fr)_minmax(100px,.52fr)_minmax(118px,.62fr)_minmax(82px,.42fr)_minmax(90px,.46fr)_minmax(100px,.5fr)_minmax(142px,.7fr)_136px]";

  return (
    <div className="math-teacher-practice-lesson-insights-table mt-4 overflow-hidden rounded-[20px] border border-slate-200 dark:border-slate-800">
      <div
        className={`math-teacher-practice-lesson-insights-table-header grid ${GridColumns} gap-3 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/70`}
      >
        <SortableHeader Label="DPS" SortKey="dps" SortState={SortStateValue} OnSort={HandleSort} />
        <SortableHeader Label="Attempt" SortKey="attempt" SortState={SortStateValue} OnSort={HandleSort} align="center" />
        <SortableHeader Label="Status" SortKey="status" SortState={SortStateValue} OnSort={HandleSort} align="center" />
        <SortableHeader Label="Score" SortKey="score" SortState={SortStateValue} OnSort={HandleSort} align="center" />
        <SortableHeader Label="Accuracy" SortKey="accuracy" SortState={SortStateValue} OnSort={HandleSort} align="center" />
        {ShowBenchmark ? <SortableHeader Label="Benchmark" SortKey="benchmark" SortState={SortStateValue} OnSort={HandleSort} align="center" /> : null}
        <SortableHeader Label="Time Taken" SortKey="timeTaken" SortState={SortStateValue} OnSort={HandleSort} />
        <SortableHeader Label="Completion Date" SortKey="completionDate" SortState={SortStateValue} OnSort={HandleSort} />
        <div className="text-center">Review</div>
      </div>
      {DisplayRows.map((Row, Index) => {
        const RowAccuracy = accuracy(Row);
        const BenchmarkText = isCompleted(Row)
          ? RowNeedsReattempt(Row)
            ? "Benchmark Not Met"
            : "Benchmark Met"
          : "Pending";
        const DpsKey = CompactDpsLabel(Row);
        const DpsAttemptIndex = DpsAttemptCounts.get(DpsKey) ?? 0;
        DpsAttemptCounts.set(DpsKey, DpsAttemptIndex + 1);
        const AttemptType = AttemptTypeLabel(Row, DpsAttemptIndex);
        const DisplayStatus = AttemptStatusLabel(Row, AttemptType);
        const StatusTone =
          DisplayStatus === "Cleared" || DisplayStatus === "Re-Attempt Cleared"
            ? "green"
            : DisplayStatus === "Pending" || DisplayStatus.includes("Pending")
              ? "amber"
              : "red";
        return (
          <div
            key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
            className={`grid ${GridColumns} items-center gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800`}
          >
            <div>
              <p className="font-black text-slate-950 dark:text-white">
                {CompactDpsLabel(Row)}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {CompactModuleLevelLabel(Row)}
              </p>
            </div>
            <div className="flex justify-center">
              <Chip tone="blue">
                {AttemptType}
              </Chip>
            </div>
            <div className="flex justify-center">
              <Chip tone={StatusTone}>{DisplayStatus}</Chip>
            </div>
            <div className="flex justify-center">
              {isCompleted(Row) ? (
                <Chip tone={isBelowBenchmark(Row) ? "red" : "green"}>{scoreText(Row)}</Chip>
              ) : (
                <Chip tone="slate">—</Chip>
              )}
            </div>
            <div className="flex justify-center">
              {isCompleted(Row) ? (
                <Chip tone={isBelowBenchmark(Row) ? "red" : "green"}>
                  {RowAccuracy}%
                </Chip>
              ) : (
                <span className="font-black text-slate-400">—</span>
              )}
            </div>
            {ShowBenchmark ? (
              <div className="flex justify-center">
                <Chip
                  tone={
                    BenchmarkText === "Benchmark Met"
                      ? "green"
                      : BenchmarkText === "Pending"
                        ? "amber"
                        : "red"
                  }
                >
                  {BenchmarkText}
                </Chip>
              </div>
            ) : null}
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {timeTakenText(Row)}
            </div>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isCompleted(Row) ? completedText(Row) : "Pending"}
            </div>
            <div className="flex justify-start">
              {!isCompleted(Row) ? (
                <Chip tone="amber">Pending</Chip>
              ) : (
                <StandardViewButton
                  label="View Details"
                  tooltip="Open attempt detail"
                  onClick={() => OnView(Row)}
                  compact
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
