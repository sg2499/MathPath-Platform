"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherAssignmentTracker } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardList,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AnyRow,
  Chip,
  CompactDpsLabel,
  CompactLessonLabel,
  Metric,
  NaturalCompare,
  StandardViewButton,
  StudentNode,
  accuracy,
  averageAccuracy,
  buildStudents,
  currentWorkRows,
  isBelowBenchmark,
  isCompleted,
  latestActivity,
  levelCodeOf,
  moduleCodeOf,
  needsReattempt,
  searchText,
  uniqueAssignedConceptCount,
  uniqueClearedConceptCount,
  uniquePendingConceptCount,
  studentCodeOf,
  studentNameOf,
  uniqueNeedsReattemptCount,
} from "@/components/common/DetailWorkspaceViews";

type ModuleFilter = string;
type LevelFilter = string;
type StudentFilter = string;
type StatusFilter =
  | ""
  | "ALL"
  | "PENDING"
  | "CLEARED"
  | "NEEDS_REATTEMPT"
  | "ACTION_NEEDED";
type PerformanceFilter =
  | ""
  | "ALL"
  | "EXCELLENCE"
  | "GROWTH"
  | "NEEDS_REATTEMPT";
type TrackerTab =
  | "OVERVIEW"
  | "ACTION_QUEUE"
  | "STUDENT_REVIEW"
  | "EXCELLENCE_HIGHLIGHTS"
  | "RECENT_PRACTICE";
type Tone = "green" | "blue" | "amber" | "red" | "slate";

type ExcellenceHighlightGroup = {
  GroupKey: string;
  ModuleCode: string;
  LevelCode: string;
  LessonLabel: string;
  DpsLabel: string;
  Rows: AnyRow[];
};

function RowActivityTime(Row: AnyRow) {
  const Value = getFirstMathPathTimestamp(
    Row,
    MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  );
  return Value ? mathPathTimestampValue(Value) : 0;
}

function NormalizeRows(RawData: unknown): AnyRow[] {
  if (Array.isArray(RawData)) return RawData;
  const Data = RawData as any;
  if (Array.isArray(Data?.attempts)) return Data.attempts;
  if (Array.isArray(Data?.rows)) return Data.rows;
  if (Array.isArray(Data?.results)) return Data.results;
  return [];
}

function RowLevelCode(Row: AnyRow) {
  return levelCodeOf(Row);
}

function ModuleOptions(Rows: AnyRow[]) {
  return Array.from(new Set(Rows.map(moduleCodeOf).filter(Boolean))).sort(
    NaturalCompare,
  );
}

function LevelOptions(Rows: AnyRow[]) {
  return Array.from(new Set(Rows.map(RowLevelCode).filter(Boolean))).sort(
    NaturalCompare,
  );
}

function LessonOptions(Rows: AnyRow[]) {
  return Array.from(new Set(Rows.map(CompactLessonLabel).filter(Boolean))).sort(
    NaturalCompare,
  );
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

function StatusKey(
  Row: AnyRow,
): Exclude<StatusFilter, "" | "ALL" | "ACTION_NEEDED"> {
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

function IsActionNeeded(Row: AnyRow) {
  return StatusKey(Row) === "PENDING" || StatusKey(Row) === "NEEDS_REATTEMPT";
}

function MatchesStatusFilter(Row: AnyRow, FilterValue: StatusFilter) {
  if (!FilterValue || FilterValue === "ALL") return true;
  if (FilterValue === "ACTION_NEEDED") return IsActionNeeded(Row);
  return StatusKey(Row) === FilterValue;
}

function AttemptedRows(Rows: AnyRow[]) {
  return Rows.filter(isCompleted);
}

function AverageAccuracyDisplay(Rows: AnyRow[]) {
  const ReviewedRows = AttemptedRows(Rows);
  return ReviewedRows.length ? `${averageAccuracy(ReviewedRows)}%` : "—";
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
  const ReviewedRows = AttemptedRows(Rows);
  if (!ReviewedRows.length) return { Label: "Pending", Tone: "amber" as Tone };
  const Average = averageAccuracy(ReviewedRows);
  if (Average < 70) return { Label: "Needs Re-Attempt", Tone: "red" as Tone };
  if (Average >= 90) return { Label: "Excellence Zone", Tone: "green" as Tone };
  return { Label: "Growth Zone", Tone: "amber" as Tone };
}

function StudentMatchesPerformance(
  Student: StudentNode,
  FilterValue: PerformanceFilter,
) {
  if (!FilterValue || FilterValue === "ALL") return true;
  return Student.rows.some((Row) => MatchesPerformanceFilter(Row, FilterValue));
}

function BestAccuracy(Rows: AnyRow[]) {
  const Values = Rows.map(accuracy).filter((Value) => Value >= 0);
  return Values.length ? Math.max(...Values) : 0;
}

function StudentPrimaryModule(Student: StudentNode) {
  const Modules = Array.from(
    new Set(Student.rows.map(moduleCodeOf).filter(Boolean)),
  ).sort(NaturalCompare);
  return Modules[0] || "Module";
}

function StudentPrimaryLevel(Student: StudentNode) {
  const Levels = Array.from(
    new Set(Student.rows.map(levelCodeOf).filter(Boolean)),
  ).sort(NaturalCompare);
  return Levels[0] || "Level";
}

function StudentOperationalStats(Rows: AnyRow[]) {
  const CurrentRows = currentWorkRows(Rows);
  const Assigned = CurrentRows.length;
  const Cleared = uniqueClearedConceptCount(CurrentRows);
  const Completed = CurrentRows.filter(isCompleted).length;
  const Pending = uniquePendingConceptCount(CurrentRows);
  const Reattempt = uniqueNeedsReattemptCount(CurrentRows);
  const NeedsReattempt = uniqueNeedsReattemptCount(CurrentRows);
  const ActionNeeded = CurrentRows.filter(IsActionNeeded).length;
  return {
    Assigned,
    Cleared,
    Completed,
    Pending,
    Reattempt,
    NeedsReattempt,
    ActionNeeded,
    Average: averageAccuracy(Rows),
    Best: BestAccuracy(Rows),
    Last: latestActivity(Rows),
  };
}

function SortRowsByPriority(FirstRow: AnyRow, SecondRow: AnyRow) {
  const FirstPending = isCompleted(FirstRow) ? 1 : 0;
  const SecondPending = isCompleted(SecondRow) ? 1 : 0;
  return (
    FirstPending - SecondPending ||
    accuracy(FirstRow) - accuracy(SecondRow) ||
    NaturalCompare(levelCodeOf(FirstRow), levelCodeOf(SecondRow)) ||
    NaturalCompare(
      CompactLessonLabel(FirstRow),
      CompactLessonLabel(SecondRow),
    ) ||
    NaturalCompare(CompactDpsLabel(FirstRow), CompactDpsLabel(SecondRow)) ||
    NaturalCompare(studentCodeOf(FirstRow), studentCodeOf(SecondRow))
  );
}

function LessonKey(Row: AnyRow) {
  return [moduleCodeOf(Row), levelCodeOf(Row), CompactLessonLabel(Row)].join(
    "|",
  );
}

function BuildExcellenceHighlightGroups(
  Rows: AnyRow[],
): ExcellenceHighlightGroup[] {
  const BestByStudentDps = new Map<string, AnyRow>();

  Rows.filter((Row) => accuracy(Row) >= 90 && !RowNeedsReattempt(Row)).forEach(
    (Row) => {
      const Key = [
        moduleCodeOf(Row),
        levelCodeOf(Row),
        CompactLessonLabel(Row),
        CompactDpsLabel(Row),
        studentCodeOf(Row),
      ].join("|");
      const CurrentRow = BestByStudentDps.get(Key);
      if (!CurrentRow || accuracy(Row) > accuracy(CurrentRow)) {
        BestByStudentDps.set(Key, Row);
      }
    },
  );

  const GroupMap = new Map<string, ExcellenceHighlightGroup>();
  Array.from(BestByStudentDps.values()).forEach((Row) => {
    const GroupKey = [
      moduleCodeOf(Row),
      levelCodeOf(Row),
      CompactLessonLabel(Row),
      CompactDpsLabel(Row),
    ].join("|");
    if (!GroupMap.has(GroupKey)) {
      GroupMap.set(GroupKey, {
        GroupKey,
        ModuleCode: moduleCodeOf(Row),
        LevelCode: levelCodeOf(Row),
        LessonLabel: CompactLessonLabel(Row),
        DpsLabel: CompactDpsLabel(Row),
        Rows: [],
      });
    }
    GroupMap.get(GroupKey)!.Rows.push(Row);
  });

  return Array.from(GroupMap.values()).sort(
    (FirstGroup, SecondGroup) =>
      NaturalCompare(FirstGroup.ModuleCode, SecondGroup.ModuleCode) ||
      NaturalCompare(FirstGroup.LevelCode, SecondGroup.LevelCode) ||
      NaturalCompare(FirstGroup.LessonLabel, SecondGroup.LessonLabel) ||
      NaturalCompare(FirstGroup.DpsLabel, SecondGroup.DpsLabel),
  );
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

export default function TeacherPracticeTrackerPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  const [SearchValue, SetSearchValue] = useState("");
  const [StudentFilterValue, SetStudentFilterValue] =
    useState<StudentFilter>("");
  const [ModuleFilterValue, SetModuleFilterValue] = useState<ModuleFilter>("");
  const [StatusFilterValue, SetStatusFilterValue] = useState<StatusFilter>("");
  const [LevelFilterValue, SetLevelFilterValue] = useState<LevelFilter>("");
  const [PerformanceFilterValue, SetPerformanceFilterValue] =
    useState<PerformanceFilter>("");
  const [ActiveTab, SetActiveTab] = useState<TrackerTab>("OVERVIEW");
  const [ExpandedViewLessonFilterValue, SetExpandedViewLessonFilterValue] =
    useState<string>("");

  const Query = useQuery({
    queryKey: ["teacher-tracker"],
    queryFn: getTeacherAssignmentTracker,
    enabled: Ready,
  });

  const Rows = useMemo(() => NormalizeRows(Query.data), [Query.data]);
  const AllStudents = useMemo(() => buildStudents(Rows), [Rows]);
  const ModuleFilterOptions = useMemo(() => ModuleOptions(Rows), [Rows]);
  const LevelFilterOptions = useMemo(() => LevelOptions(Rows), [Rows]);

  const BaseFilteredRows = useMemo(() => {
    const SearchTerm = SearchValue.trim().toLowerCase();
    return Rows.filter(
      (Row) =>
        (!StudentFilterValue ||
          StudentFilterValue === "ALL" ||
          studentCodeOf(Row) === StudentFilterValue) &&
        (!ModuleFilterValue ||
          ModuleFilterValue === "ALL" ||
          moduleCodeOf(Row) === ModuleFilterValue) &&
        (!LevelFilterValue ||
          LevelFilterValue === "ALL" ||
          RowLevelCode(Row) === LevelFilterValue) &&
        MatchesStatusFilter(Row, StatusFilterValue) &&
        MatchesPerformanceFilter(Row, PerformanceFilterValue) &&
        (!SearchTerm || searchText(Row).includes(SearchTerm)),
    );
  }, [
    Rows,
    SearchValue,
    StudentFilterValue,
    ModuleFilterValue,
    LevelFilterValue,
    StatusFilterValue,
    PerformanceFilterValue,
  ]);

  const BaseStudents = useMemo(
    () => buildStudents(BaseFilteredRows),
    [BaseFilteredRows],
  );
  const Students = BaseStudents;
  const VisibleStudentCodes = useMemo(
    () => new Set(Students.map((Student) => Student.studentCode)),
    [Students],
  );
  const FilteredRows = useMemo(
    () =>
      BaseFilteredRows.filter((Row) =>
        VisibleStudentCodes.has(studentCodeOf(Row)),
      ),
    [BaseFilteredRows, VisibleStudentCodes],
  );
  const CurrentFilteredRows = useMemo(
    () => currentWorkRows(FilteredRows),
    [FilteredRows],
  );

  const ExpandedViewLessonOptions = useMemo(
    () => LessonOptions(FilteredRows),
    [FilteredRows],
  );
  const ExpandedViewRows = useMemo(
    () =>
      FilteredRows.filter(
        (Row) =>
          !ExpandedViewLessonFilterValue ||
          ExpandedViewLessonFilterValue === "ALL" ||
          CompactLessonLabel(Row) === ExpandedViewLessonFilterValue,
      ),
    [FilteredRows, ExpandedViewLessonFilterValue],
  );
  const ActionRows = useMemo(
    () => FilteredRows.filter(IsActionNeeded).sort(SortRowsByPriority),
    [FilteredRows],
  );
  const ExcellenceGroups = useMemo(
    () => BuildExcellenceHighlightGroups(FilteredRows),
    [FilteredRows],
  );
  const ExcellenceStudents = useMemo(
    () =>
      Students.filter(
        (Student) => PerformanceBand(Student.rows).Label === "Excellence Zone",
      ),
    [Students],
  );
  const GrowthStudents = useMemo(
    () =>
      Students.filter(
        (Student) => PerformanceBand(Student.rows).Label === "Growth Zone",
      ),
    [Students],
  );
  const OpenStudent = (StudentCode: string) => {
    const Params = new URLSearchParams();
    if (ModuleFilterValue && ModuleFilterValue !== "ALL") {
      Params.set("moduleCode", ModuleFilterValue);
    }
    if (LevelFilterValue && LevelFilterValue !== "ALL") {
      Params.set("levelCode", LevelFilterValue);
    }
    const QueryString = Params.toString();
    Router.push(
      `/teacher/assignment-tracker/student/${encodeURIComponent(StudentCode)}${QueryString ? `?${QueryString}` : ""}`,
    );
  };

  if (!Ready || Query.isLoading)
    return <LoadingState label="Loading practice tracker..." />;
  if (Query.isError)
    return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Practice Tracker">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Teacher Practice</p>
            <h1 className="math-title">Practice Tracker</h1>
            <p className="math-subtitle">
              Track DPS completion, improvement needs, accuracy bands, and
              student practice performance from one workspace.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Students"
              value={Students.length}
              icon={<UsersRound size={15} />}
            />
            <Metric
              label="Assigned DPS"
              value={uniqueAssignedConceptCount(CurrentFilteredRows)}
              icon={<ClipboardList size={15} />}
            />
            <Metric
              label="Cleared DPS"
              value={uniqueClearedConceptCount(CurrentFilteredRows)}
              icon={<ShieldCheck size={15} />}
            />
            <Metric
              label="Pending DPS"
              value={uniquePendingConceptCount(CurrentFilteredRows)}
              icon={<ClipboardList size={15} />}
            />
            <Metric
              label="Average Accuracy"
              value={AverageAccuracyDisplay(CurrentFilteredRows)}
              icon={<BarChart3 size={15} />}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InsightCard
            Title="Excellence Zone"
            Value={ExcellenceStudents.length}
            Subtitle="Students averaging 90% or above."
            Tone="green"
            Icon={<Trophy size={20} />}
          />
          <InsightCard
            Title="Growth Zone"
            Value={GrowthStudents.length}
            Subtitle="Students at benchmark and improving."
            Tone="amber"
            Icon={<Sparkles size={20} />}
          />
          <InsightCard
            Title="Needs Re-Attempt"
            Value={uniqueNeedsReattemptCount(CurrentFilteredRows)}
            Subtitle="DPS attempts requiring focused re-attempt."
            Tone="red"
            Icon={<Target size={20} />}
          />
        </div>

        <div className="mt-6 math-operation-panel">
          <div className="grid gap-3 xl:grid-cols-[1fr_220px_210px_180px_210px_210px]">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="math-input pl-11"
                value={SearchValue}
                onChange={(Event) => SetSearchValue(Event.target.value)}
                placeholder="Search Practice Tracker"
              />
            </div>
            <select
              className="math-input"
              value={StudentFilterValue}
              onChange={(Event) => SetStudentFilterValue(Event.target.value)}
              title="Filter by student"
              aria-label="Filter by student"
            >
              <option value="" disabled>
                Choose Student
              </option>
              <option value="ALL">All Students</option>
              {AllStudents.map((Student) => (
                <option key={Student.studentCode} value={Student.studentCode}>
                  {Student.studentName} ({Student.studentCode})
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={ModuleFilterValue}
              onChange={(Event) => SetModuleFilterValue(Event.target.value)}
              title="Filter by module"
              aria-label="Filter by module"
            >
              <option value="" disabled>
                Choose Module
              </option>
              <option value="ALL">All Modules</option>
              {ModuleFilterOptions.map((ModuleCode) => (
                <option key={ModuleCode} value={ModuleCode}>
                  {ModuleCode}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={LevelFilterValue}
              onChange={(Event) => SetLevelFilterValue(Event.target.value)}
              title="Filter by level"
              aria-label="Filter by level"
            >
              <option value="" disabled>
                Choose Level
              </option>
              <option value="ALL">All Levels</option>
              {LevelFilterOptions.map((LevelCode) => (
                <option key={LevelCode} value={LevelCode}>
                  {LevelCode}
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
              OnClick={() => SetActiveTab("OVERVIEW")}
            >
              Overview
            </TabButton>
            <TabButton
              Active={ActiveTab === "ACTION_QUEUE"}
              OnClick={() => SetActiveTab("ACTION_QUEUE")}
            >
              Action Queue
            </TabButton>
            <TabButton
              Active={ActiveTab === "STUDENT_REVIEW"}
              OnClick={() => SetActiveTab("STUDENT_REVIEW")}
            >
              Student Review
            </TabButton>
          </div>
        </div>

        <div className="mt-6">
          {FilteredRows.length ? (
            ActiveTab === "OVERVIEW" ? (
              <OverviewTab
                ActionRows={ActionRows}
                ExcellenceGroups={ExcellenceGroups}
                Rows={FilteredRows}
                OnOpenStudent={OpenStudent}
                OnOpenActionQueue={() => SetActiveTab("ACTION_QUEUE")}
                OnOpenExcellenceHighlights={() =>
                  SetActiveTab("EXCELLENCE_HIGHLIGHTS")
                }
                OnOpenRecentPractice={() => SetActiveTab("RECENT_PRACTICE")}
              />
            ) : ActiveTab === "ACTION_QUEUE" ? (
              <ActionQueueTab Rows={ActionRows} OnOpenStudent={OpenStudent} />
            ) : ActiveTab === "STUDENT_REVIEW" ? (
              <StudentReviewTab
                Students={Students}
                OnOpenStudent={OpenStudent}
              />
            ) : ActiveTab === "EXCELLENCE_HIGHLIGHTS" ? (
              <ExpandedExcellenceHighlightsView
                Groups={BuildExcellenceHighlightGroups(ExpandedViewRows)}
                LessonOptions={ExpandedViewLessonOptions}
                LessonFilterValue={ExpandedViewLessonFilterValue}
                OnLessonFilterChange={SetExpandedViewLessonFilterValue}
                OnBack={() => SetActiveTab("OVERVIEW")}
                OnOpenStudent={OpenStudent}
              />
            ) : (
              <ExpandedRecentPracticeView
                Rows={ExpandedViewRows}
                LessonOptions={ExpandedViewLessonOptions}
                LessonFilterValue={ExpandedViewLessonFilterValue}
                OnLessonFilterChange={SetExpandedViewLessonFilterValue}
                OnBack={() => SetActiveTab("OVERVIEW")}
                OnOpenStudent={OpenStudent}
              />
            )
          ) : (
            <EmptyState message="No assigned work found. Adjust search or filters to review assigned DPS work." />
          )}
        </div>
      </section>
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
  Tone: "green" | "blue" | "amber" | "red";
  Icon: ReactNode;
}) {
  const Tones = {
    green:
      "border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    blue: "border-blue-200 bg-blue-50/85 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
    amber:
      "border-amber-200 bg-amber-50/85 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    red: "border-rose-200 bg-rose-50/85 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  };

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${Tones[Tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm dark:bg-slate-950/50">
          {Icon}
        </div>
        <p className="text-3xl font-black">{Value}</p>
      </div>
      <h3 className="mt-4 text-lg font-black">{Title}</h3>
      <p className="mt-1 text-sm font-semibold opacity-75">{Subtitle}</p>
    </div>
  );
}

function OverviewTab({
  Rows,
  ActionRows,
  ExcellenceGroups,
  OnOpenStudent,
  OnOpenActionQueue,
  OnOpenExcellenceHighlights,
  OnOpenRecentPractice,
}: {
  Rows: AnyRow[];
  ActionRows: AnyRow[];
  ExcellenceGroups: ExcellenceHighlightGroup[];
  OnOpenStudent: (StudentCode: string) => void;
  OnOpenActionQueue: () => void;
  OnOpenExcellenceHighlights: () => void;
  OnOpenRecentPractice: () => void;
}) {
  const RecentRows = [...Rows]
    .sort(
      (FirstRow, SecondRow) =>
        RowActivityTime(SecondRow) - RowActivityTime(FirstRow),
    )
    .slice(0, 4);
  const PreviewActionRows = ActionRows.slice(0, 4);
  const PreviewExcellenceGroups = ExcellenceGroups.slice(0, 3).map((Group) => ({
    ...Group,
    Rows: Group.Rows.slice(0, 2),
  }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
        <CompactPracticeList
          Title="Priority Queue"
          Description="Practice work requiring teacher follow-up first."
          Rows={PreviewActionRows}
          Empty="No priority work found for the selected filters."
          Count={ActionRows.length}
          Tone="red"
          OnViewAll={OnOpenActionQueue}
          OnOpenStudent={OnOpenStudent}
        />
        <ExcellenceHighlightsList
          Groups={PreviewExcellenceGroups}
          TotalCount={ExcellenceGroups.reduce(
            (Total, Group) => Total + Group.Rows.length,
            0,
          )}
          OnOpenStudent={OnOpenStudent}
          OnViewAll={OnOpenExcellenceHighlights}
        />
      </div>

      <CompactPracticeList
        Title="Recent Practice"
        Description="Latest visible practice activity."
        Rows={RecentRows}
        Empty="No recent practice found for the selected filters."
        Count={RecentRows.length}
        Tone="blue"
        OnOpenStudent={OnOpenStudent}
        OnViewAll={OnOpenRecentPractice}
      />
    </div>
  );
}

function CompactPracticeList({
  Title,
  Description,
  Rows,
  Empty,
  Count,
  Tone,
  OnOpenStudent,
  OnViewAll,
}: {
  Title: string;
  Description: string;
  Rows: AnyRow[];
  Empty: string;
  Count: number;
  Tone: "blue" | "red";
  OnOpenStudent: (StudentCode: string) => void;
  OnViewAll?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">
            {Title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {Description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone={Tone}>{Count}</Chip>
          {OnViewAll && Count ? (
            <button
              type="button"
              onClick={OnViewAll}
              className="math-mini-action rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800"
            >
              View All
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {Rows.length ? (
          Rows.map((Row, Index) => (
            <CompactPracticeRow
              key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
              Row={Row}
              OnOpenStudent={OnOpenStudent}
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
  OnOpenStudent,
}: {
  Row: AnyRow;
  OnOpenStudent: (StudentCode: string) => void;
}) {
  const StudentCode = studentCodeOf(Row);
  const RowAccuracy = accuracy(Row);
  const NeedsReattempt = RowNeedsReattempt(Row);
  return (
    <div className="rounded-[20px] border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {studentNameOf(Row)}{" "}
            <span className="text-slate-400">({StudentCode})</span>
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {moduleCodeOf(Row)} · {levelCodeOf(Row)} · {CompactLessonLabel(Row)}{" "}
            · {CompactDpsLabel(Row)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip
            tone={
              NeedsReattempt
                ? "red"
                : RowAccuracy >= 90
                  ? "green"
                  : RowAccuracy >= 70
                    ? "blue"
                    : "amber"
            }
          >
            {isCompleted(Row) ? `${RowAccuracy}%` : "Pending"}
          </Chip>
          <StandardViewButton
            label="Review"
            tooltip="Open student practice review"
            onClick={() => OnOpenStudent(StudentCode)}
            compact
          />
        </div>
      </div>
    </div>
  );
}

function ExcellenceHighlightsList({
  Groups,
  TotalCount,
  OnOpenStudent,
  OnViewAll,
}: {
  Groups: ExcellenceHighlightGroup[];
  TotalCount: number;
  OnOpenStudent: (StudentCode: string) => void;
  OnViewAll?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">
            Excellence Highlights
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Best reviewed practice grouped by lesson and DPS.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone="green">{TotalCount}</Chip>
          {OnViewAll ? (
            <button
              type="button"
              onClick={OnViewAll}
              className="math-mini-action rounded-full bg-white px-4 py-2 text-xs font-black text-emerald-700 shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-950 dark:text-emerald-200 dark:ring-emerald-900/70"
            >
              View All
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {Groups.length ? (
          Groups.map((Group) => (
            <div
              key={Group.GroupKey}
              className="rounded-[20px] border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">
                <span>{Group.ModuleCode}</span>
                <span className="opacity-45">→</span>
                <span>{Group.LevelCode}</span>
                <span className="opacity-45">→</span>
                <span>{Group.LessonLabel}</span>
                <span className="opacity-45">→</span>
                <span>{Group.DpsLabel}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {Group.Rows.map((Row, Index) => (
                  <div
                    key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
                    className="flex flex-col gap-3 rounded-2xl bg-white/75 p-3 shadow-sm dark:bg-slate-950/40 xl:flex-row xl:items-center xl:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950 dark:text-white">
                        {studentNameOf(Row)}{" "}
                        <span className="text-slate-400">
                          ({studentCodeOf(Row)})
                        </span>
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Excellence-level practice
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip tone="green">{accuracy(Row)}%</Chip>
                      <StandardViewButton
                        label="Review"
                        tooltip="Open student practice review"
                        onClick={() => OnOpenStudent(studentCodeOf(Row))}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[20px] bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">
            No excellence-level practice found for the selected filters.
          </p>
        )}
      </div>
    </div>
  );
}

function ExpandedViewHeader({
  Title,
  Description,
  LessonOptions,
  LessonFilterValue,
  OnLessonFilterChange,
  OnBack,
}: {
  Title: string;
  Description: string;
  LessonOptions: string[];
  LessonFilterValue: string;
  OnLessonFilterChange: (Value: string) => void;
  OnBack: () => void;
}) {
  return (
    <div className="mb-5 math-operation-panel">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="math-kicker">Expanded Practice View</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">
            {Title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {Description}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[220px_120px]">
          <select
            className="math-input"
            value={LessonFilterValue}
            onChange={(Event) => OnLessonFilterChange(Event.target.value)}
            title="Filter by lesson"
            aria-label="Filter by lesson"
          >
            <option value="" disabled>
              Choose Lesson
            </option>
            <option value="ALL">All Lessons</option>
            {LessonOptions.map((LessonCode) => (
              <option key={LessonCode} value={LessonCode}>
                {LessonCode}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={OnBack}
            className="math-role-action-button px-4 py-3 text-sm"
          >
            Overview
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandedExcellenceHighlightsView({
  Groups,
  LessonOptions,
  LessonFilterValue,
  OnLessonFilterChange,
  OnBack,
  OnOpenStudent,
}: {
  Groups: ExcellenceHighlightGroup[];
  LessonOptions: string[];
  LessonFilterValue: string;
  OnLessonFilterChange: (Value: string) => void;
  OnBack: () => void;
  OnOpenStudent: (StudentCode: string) => void;
}) {
  return (
    <div>
      <ExpandedViewHeader
        Title="Excellence Highlights"
        Description="All excellence-level practice records for the selected scope. Use the lesson filter to inspect one lesson."
        LessonOptions={LessonOptions}
        LessonFilterValue={LessonFilterValue}
        OnLessonFilterChange={OnLessonFilterChange}
        OnBack={OnBack}
      />
      <ExcellenceHighlightsList
        Groups={Groups}
        TotalCount={Groups.reduce(
          (Total, Group) => Total + Group.Rows.length,
          0,
        )}
        OnOpenStudent={OnOpenStudent}
      />
    </div>
  );
}

function ExpandedRecentPracticeView({
  Rows,
  LessonOptions,
  LessonFilterValue,
  OnLessonFilterChange,
  OnBack,
  OnOpenStudent,
}: {
  Rows: AnyRow[];
  LessonOptions: string[];
  LessonFilterValue: string;
  OnLessonFilterChange: (Value: string) => void;
  OnBack: () => void;
  OnOpenStudent: (StudentCode: string) => void;
}) {
  const OrderedRecentRows = [...Rows].sort(
    (FirstRow, SecondRow) =>
      RowActivityTime(SecondRow) - RowActivityTime(FirstRow),
  );

  return (
    <div>
      <ExpandedViewHeader
        Title="Recent Practice"
        Description="All latest visible practice activity for the selected scope. Use the lesson filter to inspect one lesson."
        LessonOptions={LessonOptions}
        LessonFilterValue={LessonFilterValue}
        OnLessonFilterChange={OnLessonFilterChange}
        OnBack={OnBack}
      />
      <CompactPracticeList
        Title="Recent Practice"
        Description="Latest visible practice activity."
        Rows={OrderedRecentRows}
        Empty="No recent practice found for the selected filters."
        Count={OrderedRecentRows.length}
        Tone="blue"
        OnOpenStudent={OnOpenStudent}
      />
    </div>
  );
}

function ActionQueueTab({
  Rows,
  OnOpenStudent,
}: {
  Rows: AnyRow[];
  OnOpenStudent: (StudentCode: string) => void;
}) {
  if (!Rows.length)
    return (
      <EmptyState message="No practice work currently needs teacher action." />
    );
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-[1.1fr_.55fr_.55fr_.5fr_.5fr_.55fr_.7fr_120px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <div>Student</div>
        <div>Module</div>
        <div>Level</div>
        <div>Lesson</div>
        <div>DPS</div>
        <div>Accuracy</div>
        <div>Status</div>
        <div className="text-right">Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Rows.map((Row, Index) => {
          const StudentCode = studentCodeOf(Row);
          const RowCompleted = isCompleted(Row);
          const StatusText = DisplayStatus(Row);
          return (
            <div
              key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
              className="grid grid-cols-[1.1fr_.55fr_.55fr_.5fr_.5fr_.55fr_.7fr_120px] items-center gap-3 px-5 py-4 transition hover:bg-rose-50/40 dark:hover:bg-slate-900/70"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  className="truncate text-left text-sm font-black text-slate-950 transition hover:text-blue-700 dark:text-white"
                  onClick={() => OnOpenStudent(StudentCode)}
                >
                  {studentNameOf(Row)}
                </button>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {StudentCode}
                </p>
              </div>
              <div className="text-sm font-bold text-slate-600">
                {moduleCodeOf(Row)}
              </div>
              <div className="text-sm font-bold text-slate-600">
                {levelCodeOf(Row)}
              </div>
              <div>
                <Chip tone="slate">{CompactLessonLabel(Row)}</Chip>
              </div>
              <div>
                <Chip tone="slate">{CompactDpsLabel(Row)}</Chip>
              </div>
              <div>
                <Chip
                  tone={
                    RowCompleted && accuracy(Row) >= 70
                      ? "green"
                      : RowCompleted
                        ? "red"
                        : "slate"
                  }
                >
                  {RowCompleted ? `${accuracy(Row)}%` : "—"}
                </Chip>
              </div>
              <div>
                <Chip
                  tone={
                    StatusText === "Cleared"
                      ? "green"
                      : StatusText === "Pending"
                        ? "amber"
                        : "red"
                  }
                >
                  {StatusText}
                </Chip>
              </div>
              <div className="flex justify-end">
                <StandardViewButton
                  label="Review"
                  tooltip="Open student practice review"
                  onClick={() => OnOpenStudent(StudentCode)}
                  compact
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudentReviewTab({
  Students,
  OnOpenStudent,
}: {
  Students: StudentNode[];
  OnOpenStudent: (StudentCode: string) => void;
}) {
  if (!Students.length)
    return (
      <EmptyState message="Change the filters to view matching students." />
    );
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-[minmax(160px,1fr)_minmax(72px,.42fr)_minmax(90px,.46fr)_minmax(102px,.5fr)_minmax(102px,.5fr)_minmax(102px,.5fr)_minmax(128px,.58fr)_minmax(104px,.5fr)_minmax(150px,.7fr)_minmax(150px,.68fr)_120px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <div>Student</div>
        <div>Module</div>
        <div>Level</div>
        <div>Assigned DPS</div>
        <div>Cleared DPS</div>
        <div>Pending DPS</div>
        <div>Needs Re-Attempt</div>
        <div>Average Accuracy</div>
        <div>Performance</div>
        <div>Last Activity</div>
        <div>Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Students.map((Student) => {
          const Stats = StudentOperationalStats(Student.rows);
          const Band = PerformanceBand(Student.rows);
          return (
            <div
              key={Student.key}
              className="grid grid-cols-[minmax(160px,1fr)_minmax(72px,.42fr)_minmax(90px,.46fr)_minmax(102px,.5fr)_minmax(102px,.5fr)_minmax(102px,.5fr)_minmax(128px,.58fr)_minmax(104px,.5fr)_minmax(150px,.7fr)_minmax(150px,.68fr)_120px] items-center gap-3 px-5 py-4 transition hover:bg-blue-50/45 dark:hover:bg-slate-900/70"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  className="truncate text-left text-base font-black text-slate-950 transition hover:text-blue-700 dark:text-white"
                  onClick={() => OnOpenStudent(Student.studentCode)}
                >
                  {Student.studentName}
                </button>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {Student.studentCode}
                </p>
              </div>
              <div className="text-sm font-bold text-slate-600">
                {StudentPrimaryModule(Student)}
              </div>
              <div className="text-sm font-bold text-slate-600">
                {StudentPrimaryLevel(Student)}
              </div>
              <div>
                <Chip tone="blue">{Stats.Assigned}</Chip>
              </div>
              <div>
                <Chip tone="green">{Stats.Cleared}</Chip>
              </div>
              <div>
                <Chip tone={Stats.Pending ? "amber" : "green"}>
                  {Stats.Pending}
                </Chip>
              </div>
              <div>
                <Chip tone={Stats.NeedsReattempt ? "red" : "green"}>
                  {Stats.NeedsReattempt}
                </Chip>
              </div>
              <div>
                <Chip tone={Stats.Average >= 70 ? "green" : "red"}>
                  {Stats.Average}%
                </Chip>
              </div>
              <div>
                <Chip tone={Band.Tone}>{Band.Label}</Chip>
              </div>
              <div className="text-sm font-bold text-slate-600">
                {Stats.Last}
              </div>
              <div className="flex justify-start">
                <StandardViewButton
                  label="Review"
                  tooltip="Open student practice review"
                  onClick={() => OnOpenStudent(Student.studentCode)}
                  compact
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
