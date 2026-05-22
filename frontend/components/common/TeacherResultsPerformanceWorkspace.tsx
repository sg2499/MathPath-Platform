"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Search as SearchIcon,
  Target,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AnyRow,
  Chip,
  completedText as CompletedText,
  dpsLabel as DpsLabel,
  isBelowBenchmark as IsBelowBenchmark,
  lessonLabel as LessonLabel,
  Metric,
  rowDate as RowDate,
  scoreText as ScoreText,
  searchText as SearchText,
  accuracy as Accuracy,
  averageAccuracy as AverageAccuracy,
  StandardViewButton,
  SortRowsByCurriculum,
  uniqueNeedsReattemptCount,
  uniqueCompletedConceptCount,
  moduleCodeOf as ModuleCodeOf,
  levelCodeOf as LevelCodeOf,
  DpsSequenceValue,
  NaturalCompare,
} from "@/components/common/DetailWorkspaceViews";

type Tone = "green" | "red" | "amber" | "blue";

type LessonGroup = {
  Key: string;
  Rows: AnyRow[];
  Sample: AnyRow;
};

function BestAccuracy(Rows: AnyRow[]) {
  const Values = Rows.map(Accuracy).filter((Value) => Value >= 0);
  return Values.length ? Math.max(...Values) : 0;
}

function LowestAccuracy(Rows: AnyRow[]) {
  const Values = Rows.map(Accuracy).filter((Value) => Value >= 0);
  return Values.length ? Math.min(...Values) : 0;
}

function BenchmarkLabel(Row: AnyRow) {
  if (IsBelowBenchmark(Row)) return "Benchmark Not Met";
  if (Accuracy(Row) >= 90) return "Excellence Zone";
  if (Accuracy(Row) >= 70) return "Benchmark Met";
  return "Benchmark Not Met";
}

function BenchmarkTone(Row: AnyRow): Tone {
  if (IsBelowBenchmark(Row)) return "red";
  if (Accuracy(Row) >= 90) return "green";
  if (Accuracy(Row) >= 70) return "blue";
  return "amber";
}

function PerformanceBand(Rows: AnyRow[]) {
  const Avg = AverageAccuracy(Rows);
  if (Avg < 70) {
    return {
      Label: "Needs Re-Attempt",
      Tone: "red" as const,
      Guidance:
        "Overall average is needs improvement. Review improvement work first.",
    };
  }
  if (Avg >= 90) {
    return {
      Label: "Excellence Zone",
      Tone: "green" as const,
      Guidance:
        "Overall average is in the excellence range. Keep challenge practice active.",
    };
  }
  return {
    Label: "Growth Zone",
    Tone: "blue" as const,
    Guidance:
      "Overall average is at benchmark. Monitor consistency and improvement items.",
  };
}

function LessonInsight(Rows: AnyRow[]) {
  const Avg = AverageAccuracy(Rows);
  const Below = uniqueNeedsReattemptCount(Rows);
  if (Below > 0 || Avg < 70) {
    return {
      Label: "Suggested Focus",
      Text: "Revisit concept rules and plan improvement practice.",
      Tone: "amber" as const,
    };
  }
  if (Avg >= 90) {
    return {
      Label: "Strength",
      Text: "Strong accuracy pattern. Student is ready for challenge practice.",
      Tone: "green" as const,
    };
  }
  return {
    Label: "Steady",
    Text: "Benchmark is clear. Continue regular accuracy-building practice.",
    Tone: "blue" as const,
  };
}

function AttemptTime(Row: AnyRow) {
  const Value =
    Row.completedAt ||
    Row.submittedAt ||
    Row.latestCompletedAt ||
    Row.attemptDate ||
    Row.createdAt ||
    0;
  const Time = new Date(String(Value)).getTime();
  return Number.isNaN(Time) ? 0 : Time;
}

function AttemptSequence(Row: AnyRow) {
  return (
    Number(Row.attemptNumber || Row.reattemptNumber || Row.sequence || 0) || 0
  );
}

function CompactLessonLabel(Row: AnyRow) {
  const LessonNumber =
    Row.lessonNumber ??
    String(Row.lessonCode || Row.lessonId || "").match(/\d+/)?.[0] ??
    "-";
  return `Lesson-${LessonNumber}`;
}

function CompactDpsLabel(Row: AnyRow) {
  const IsAssessment = String(
    Row.assessmentTitle ||
      Row.assessmentName ||
      Row.workType ||
      Row.resultType ||
      "",
  )
    .toLowerCase()
    .includes("assessment");
  if (IsAssessment || Row.assessmentId || Row.assessmentCode || Row.blueprintId)
    return "Assessment";
  const DpsNumber =
    Row.dpsNumber ??
    Row.dpsNo ??
    Row.sheetNumber ??
    Row.sheetNo ??
    String(Row.dpsTitle || Row.title || "").match(/\d+/)?.[0] ??
    "-";
  return `DPS-${DpsNumber}`;
}

function CompareRowsForAttemptHistory(FirstRow: AnyRow, SecondRow: AnyRow) {
  return (
    NaturalCompare(ModuleCodeOf(FirstRow), ModuleCodeOf(SecondRow)) ||
    NaturalCompare(LevelCodeOf(FirstRow), LevelCodeOf(SecondRow)) ||
    (Number(FirstRow.lessonNumber || 999999) || 999999) -
      (Number(SecondRow.lessonNumber || 999999) || 999999) ||
    DpsSequenceValue(FirstRow) - DpsSequenceValue(SecondRow) ||
    NaturalCompare(DpsLabel(FirstRow), DpsLabel(SecondRow)) ||
    AttemptSequence(FirstRow) - AttemptSequence(SecondRow) ||
    AttemptTime(FirstRow) - AttemptTime(SecondRow)
  );
}

function SortedAttemptRows(Rows: AnyRow[]) {
  return [...Rows].sort(CompareRowsForAttemptHistory);
}

function LessonKey(Row: AnyRow) {
  return [
    ModuleCodeOf(Row),
    LevelCodeOf(Row),
    String(Row.lessonNumber ?? "-"),
    String(Row.lessonTitle || LessonLabel(Row)),
  ].join("|");
}

function BuildLessonGroups(Rows: AnyRow[]) {
  const MapByLesson = new Map<string, AnyRow[]>();
  SortRowsByCurriculum(Rows).forEach((Row) => {
    const Key = LessonKey(Row);
    if (!MapByLesson.has(Key)) MapByLesson.set(Key, []);
    MapByLesson.get(Key)!.push(Row);
  });
  return Array.from(MapByLesson.entries())
    .map(([Key, GroupRows]) => ({
      Key,
      Rows: SortedAttemptRows(GroupRows),
      Sample: GroupRows[0],
    }))
    .sort((FirstGroup, SecondGroup) =>
      CompareRowsForAttemptHistory(FirstGroup.Sample, SecondGroup.Sample),
    );
}

function ToggleKey(CurrentKeys: string[], Key: string) {
  return CurrentKeys.includes(Key)
    ? CurrentKeys.filter((CurrentKey) => CurrentKey !== Key)
    : [...CurrentKeys, Key];
}

export function TeacherResultsPerformanceWorkspace({
  title,
  subtitle,
  rows,
  onView,
}: {
  title: string;
  subtitle: string;
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
}) {
  const [Tab, SetTab] = useState<"overview" | "lessons" | "attempts">(
    "overview",
  );
  const [LevelFilter, SetLevelFilter] = useState("");
  const [LessonFilter, SetLessonFilter] = useState("");
  const [StatusFilter, SetStatusFilter] = useState("");
  const [Search, SetSearch] = useState("");
  const [ExpandedOverviewLessons, SetExpandedOverviewLessons] = useState<
    string[]
  >([]);
  const [ExpandedLessonInsights, SetExpandedLessonInsights] = useState<
    string[]
  >([]);

  const OrderedRows = useMemo(() => SortRowsByCurriculum(rows), [rows]);

  const Levels = useMemo(
    () =>
      Array.from(
        new Set(OrderedRows.map((Row) => LevelCodeOf(Row)).filter(Boolean)),
      ).sort(NaturalCompare),
    [OrderedRows],
  );

  const Lessons = useMemo(() => {
    const Source =
      !LevelFilter || LevelFilter === "ALL"
        ? OrderedRows
        : OrderedRows.filter((Row) => LevelCodeOf(Row) === LevelFilter);
    return Array.from(
      new Set(
        Source.map((Row) => String(Row.lessonNumber ?? "-")).filter(Boolean),
      ),
    ).sort(NaturalCompare);
  }, [OrderedRows, LevelFilter]);

  const FilteredRows = useMemo(() => {
    const Query = Search.trim().toLowerCase();
    return OrderedRows.filter((Row) => {
      const LevelOk = !LevelFilter || LevelFilter === "ALL" || LevelCodeOf(Row) === LevelFilter;
      const LessonOk =
        !LessonFilter ||
          LessonFilter === "ALL" ||
        String(Row.lessonNumber ?? "-") === LessonFilter;
      const RowAccuracy = Accuracy(Row);
      const StatusOk =
        !StatusFilter ||
          StatusFilter === "ALL" ||
        (StatusFilter === "EXCELLENCE" &&
          RowAccuracy >= 90 &&
          !IsBelowBenchmark(Row)) ||
        (StatusFilter === "BENCHMARK" &&
          RowAccuracy >= 70 &&
          RowAccuracy < 90 &&
          !IsBelowBenchmark(Row)) ||
        (StatusFilter === "SUPPORT" &&
          (IsBelowBenchmark(Row) || RowAccuracy < 70));
      const SearchOk = !Query || SearchText(Row).includes(Query);
      return LevelOk && LessonOk && StatusOk && SearchOk;
    });
  }, [OrderedRows, LevelFilter, LessonFilter, StatusFilter, Search]);

  const LessonGroups = useMemo(
    () => BuildLessonGroups(FilteredRows),
    [FilteredRows],
  );
  const BelowBenchmarkCount = uniqueNeedsReattemptCount(FilteredRows);
  const Band = PerformanceBand(
    FilteredRows.length ? FilteredRows : OrderedRows,
  );
  const ExcellenceCount = FilteredRows.filter(
    (Row) => Accuracy(Row) >= 90 && !IsBelowBenchmark(Row),
  ).length;
  const SupportCount = FilteredRows.filter(
    (Row) => IsBelowBenchmark(Row) || Accuracy(Row) < 70,
  ).length;

  const ToggleOverviewLesson = (Key: string) =>
    SetExpandedOverviewLessons((CurrentKeys) => ToggleKey(CurrentKeys, Key));
  const ToggleLessonInsight = (Key: string) =>
    SetExpandedLessonInsights((CurrentKeys) => ToggleKey(CurrentKeys, Key));

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-8">
      <div className="math-hero">
        <div>
          <p className="math-kicker">Performance Review</p>
          <h1 className="math-title">{title}</h1>
          <p className="math-subtitle">
            Review accuracy bands, lesson strengths, support needs, and
            benchmark outcomes for this student.
          </p>
          {subtitle ? (
            <p className="mt-2 text-sm font-bold text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Average Accuracy"
            value={`${AverageAccuracy(FilteredRows)}%`}
            icon={<BarChart3 size={15} />}
          />
          <Metric
            label="Needs Re-Attempt"
            value={SupportCount || BelowBenchmarkCount}
            icon={<AlertTriangle size={15} />}
          />
          <Metric
            label="Excellence Band"
            value={ExcellenceCount}
            icon={<Trophy size={15} />}
          />
          <Metric
            label="Practice Reviewed"
            value={FilteredRows.length}
            icon={<Target size={15} />}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <InsightCard
          title="Performance Band"
          value={Band.Label}
          description={Band.Guidance}
          tone={Band.Tone}
          icon={<Target size={20} />}
        />
        <InsightCard
          title="Best Accuracy"
          value={`${BestAccuracy(FilteredRows)}%`}
          description="Strongest reviewed work for the selected filters."
          tone="green"
          icon={<Trophy size={20} />}
        />
        <InsightCard
          title="Improvement Focus"
          value={`${LowestAccuracy(FilteredRows)}%`}
          description="Lowest reviewed accuracy for the selected filters."
          tone={LowestAccuracy(FilteredRows) < 70 ? "red" : "blue"}
          icon={<Lightbulb size={20} />}
        />
      </div>

      <div className="mt-6 rounded-[30px] border border-slate-200 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_210px]">
          <div className="relative">
            <SearchIcon
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="math-input pl-11"
              value={Search}
              onChange={(Event) => SetSearch(Event.target.value)}
              placeholder="Search Lesson Insights"
            />
          </div>
          <select
            className="math-input"
            value={LevelFilter}
            onChange={(Event) => {
              SetLevelFilter(Event.target.value);
              SetLessonFilter("");
            }}
            title="Filter by level"
            aria-label="Filter by level"
          >
            <option value="" disabled>Choose Level</option>
            <option value="ALL">All Levels</option>
            {Levels.map((Level) => (
              <option key={Level} value={Level}>
                {Level}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={LessonFilter}
            onChange={(Event) => SetLessonFilter(Event.target.value)}
            title="Filter by lesson"
            aria-label="Filter by lesson"
          >
            <option value="" disabled>Choose Lesson</option>
            <option value="ALL">All Lessons</option>
            {Lessons.map((Lesson) => (
              <option key={Lesson} value={Lesson}>
                Lesson {Lesson}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={StatusFilter}
            onChange={(Event) => SetStatusFilter(Event.target.value)}
            title="Filter by performance"
            aria-label="Filter by performance"
          >
            <option value="" disabled>Choose Performance</option>
            <option value="ALL">All Performance</option>
            <option value="EXCELLENCE">Excellence Zone</option>
            <option value="BENCHMARK">Benchmark Met</option>
            <option value="SUPPORT">Needs Re-Attempt</option>
          </select>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["overview", "Performance Overview"],
            ["lessons", "Lesson Insights"],
            ["attempts", "Attempt History"],
          ].map(([Key, Label]) => (
            <button
              key={Key}
              className={`rounded-2xl px-4 py-2 text-sm font-black transition ${Tab === Key ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300"}`}
              onClick={() => SetTab(Key as "overview" | "lessons" | "attempts")}
              title={`Open ${Label}`}
              aria-label={`Open ${Label}`}
            >
              {Label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {Tab === "overview" ? (
          <div className="grid gap-6 xl:grid-cols-[1.05fr_1.15fr]">
            <LessonPerformanceDrilldown
              Title="Lesson performance drilldown"
              Description="Expand a lesson to review focused practice and assessment priorities for this student."
              LessonGroups={LessonGroups}
              ExpandedLessons={ExpandedOverviewLessons}
              OnToggleLesson={ToggleOverviewLesson}
              OnView={onView}
            />
            <StudentPerformanceQueues Rows={FilteredRows} OnView={onView} />
          </div>
        ) : null}

        {Tab === "lessons" ? (
          <LessonPerformanceDrilldown
            Title="Lesson insights"
            Description="Lessons are collapsed by default. Expand only the lesson you need to inspect."
            LessonGroups={LessonGroups}
            ExpandedLessons={ExpandedLessonInsights}
            OnToggleLesson={ToggleLessonInsight}
            OnView={onView}
            FullWidth
          />
        ) : null}

        {Tab === "attempts" ? (
          <PerformanceAttemptTable
            Rows={SortedAttemptRows(FilteredRows)}
            OnView={onView}
          />
        ) : null}
      </div>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  tone,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  tone: "green" | "blue" | "red";
  icon: ReactNode;
}) {
  const Tones = {
    green: "border-emerald-200 bg-emerald-50/85 text-emerald-800",
    blue: "border-blue-200 bg-blue-50/85 text-blue-800",
    red: "border-rose-200 bg-rose-50/85 text-rose-800",
  };

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${Tones[tone]}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/70 p-3">{icon}</div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] opacity-70">
            {title}
          </p>
          <h3 className="mt-1 text-2xl font-black">{value}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm font-bold opacity-80">{description}</p>
    </div>
  );
}

function LessonPerformanceDrilldown({
  Title,
  Description,
  LessonGroups,
  ExpandedLessons,
  OnToggleLesson,
  OnView,
  FullWidth = false,
}: {
  Title: string;
  Description: string;
  LessonGroups: LessonGroup[];
  ExpandedLessons: string[];
  OnToggleLesson: (Key: string) => void;
  OnView?: (Row: AnyRow) => void;
  FullWidth?: boolean;
}) {
  return (
    <div
      className={`rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${FullWidth ? "" : "h-fit"}`}
    >
      <p className="math-kicker">Lesson Insights</p>
      <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
        {Title}
      </h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {Description}
      </p>
      <div className="mt-5 grid gap-3">
        {LessonGroups.length ? (
          LessonGroups.map((Lesson) => (
            <LessonDrilldownCard
              key={Lesson.Key}
              Lesson={Lesson}
              IsOpen={ExpandedLessons.includes(Lesson.Key)}
              OnToggle={() => OnToggleLesson(Lesson.Key)}
              OnView={OnView}
            />
          ))
        ) : (
          <p className="rounded-[20px] bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">
            No lesson insight is available for the selected filters.
          </p>
        )}
      </div>
    </div>
  );
}

function LessonDrilldownCard({
  Lesson,
  IsOpen,
  OnToggle,
  OnView,
}: {
  Lesson: LessonGroup;
  IsOpen: boolean;
  OnToggle: () => void;
  OnView?: (Row: AnyRow) => void;
}) {
  const Insight = LessonInsight(Lesson.Rows);
  const BelowCount = uniqueNeedsReattemptCount(Lesson.Rows);

  return (
    <div className="rounded-[22px] border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <button
        type="button"
        onClick={OnToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
        title="Expand lesson details"
        aria-label="Expand lesson details"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">
            {ModuleCodeOf(Lesson.Sample)} · {LevelCodeOf(Lesson.Sample)}
          </p>
          <h4 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
            {LessonLabel(Lesson.Sample)}
          </h4>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-500">
            {Insight.Text}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="blue">Practice Reviewed: {Lesson.Rows.length}</Chip>
            <Chip tone={AverageAccuracy(Lesson.Rows) >= 70 ? "green" : "red"}>
              Average Accuracy: {AverageAccuracy(Lesson.Rows)}%
            </Chip>
            {BelowCount ? (
              <Chip tone="red">Needs Re-Attempt: {BelowCount}</Chip>
            ) : (
              <Chip tone="green">Benchmark Met</Chip>
            )}
            <Chip tone={Insight.Tone}>{Insight.Label}</Chip>
          </div>
        </div>
        <span className="mt-1 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {IsOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </span>
      </button>
      {IsOpen ? (
        <div className="mt-4">
          <PerformanceAttemptTable Rows={Lesson.Rows} OnView={OnView} Dense />
        </div>
      ) : null}
    </div>
  );
}

function StudentPerformanceQueues({
  Rows,
  OnView,
}: {
  Rows: AnyRow[];
  OnView?: (Row: AnyRow) => void;
}) {
  const Source = Rows.length ? SortedAttemptRows(Rows) : [];
  const BelowRows = Source.filter(
    (Row) => IsBelowBenchmark(Row) || Accuracy(Row) < 70,
  ).slice(0, 4);
  const RecentRows = [...Source]
    .sort(
      (FirstRow, SecondRow) => AttemptTime(SecondRow) - AttemptTime(FirstRow),
    )
    .slice(0, 4);

  return (
    <div className="grid min-w-0 gap-6">
      <IndicatorList
        Title="Improvement Queue"
        Description="Priority attempts that need review first."
        Rows={BelowRows}
        Empty="No improvement attempt detected."
        OnView={OnView}
        Tone="red"
      />
      <IndicatorList
        Title="Recent Activity"
        Description="Latest visible performance for this student."
        Rows={RecentRows}
        Empty="No recent activity found."
        OnView={OnView}
        Tone="blue"
      />
    </div>
  );
}

function IndicatorList({
  Title,
  Description,
  Rows,
  Empty,
  OnView,
  Tone,
}: {
  Title: string;
  Description: string;
  Rows: AnyRow[];
  Empty: string;
  OnView?: (Row: AnyRow) => void;
  Tone: "red" | "blue";
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-black text-slate-950 dark:text-white">
            {Title}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {Description}
          </p>
        </div>
        <Chip tone={Tone}>{Rows.length}</Chip>
      </div>
      <div className="mt-4 grid min-w-0 gap-3">
        {Rows.length ? (
          Rows.map((Row, Index) => (
            <div
              key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
              className="min-w-0 rounded-[20px] border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
            >
              <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-black leading-5 text-slate-950 dark:text-white">
                    {CompactLessonLabel(Row)}
                  </p>
                  <p className="mt-1 break-words text-xs font-bold leading-5 text-slate-500">
                    {CompactDpsLabel(Row)} · {CompletedText(Row)}
                  </p>
                </div>
                <div className="shrink-0">
                  <Chip tone={BenchmarkTone(Row)}>{Accuracy(Row)}%</Chip>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <Chip tone={BenchmarkTone(Row)}>{BenchmarkLabel(Row)}</Chip>
                {OnView ? (
                  <StandardViewButton
                    label="View Details"
                    tooltip="Review result details"
                    onClick={() => OnView(Row)}
                    compact
                  />
                ) : null}
              </div>
            </div>
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

function PerformanceAttemptTable({
  Rows,
  OnView,
  Dense = false,
}: {
  Rows: AnyRow[];
  OnView?: (Row: AnyRow) => void;
  Dense?: boolean;
}) {
  const DisplayRows = useMemo(() => SortedAttemptRows(Rows), [Rows]);

  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-[1.15fr_1.1fr_.55fr_.55fr_.75fr_.75fr_130px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <div>Lesson</div>
        <div>DPS / Assessment</div>
        <div>Score</div>
        <div>Accuracy</div>
        <div>Benchmark</div>
        <div>Attempt Date</div>
        <div>Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {DisplayRows.map((Row, Index) => (
          <div
            key={`${Row.attemptId || Row.assignmentId || Row.id || Index}`}
            className={`grid grid-cols-[1.15fr_1.1fr_.55fr_.55fr_.75fr_.75fr_130px] items-center gap-3 px-4 ${Dense ? "py-3" : "py-4"}`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {CompactLessonLabel(Row)}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {LevelCodeOf(Row)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                {CompactDpsLabel(Row)}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {CompletedText(Row)}
              </p>
            </div>
            <div>
              <Chip tone={ScoreText(Row) === "—" ? "slate" : "blue"}>
                {ScoreText(Row)}
              </Chip>
            </div>
            <div>
              <Chip tone={Accuracy(Row) >= 70 ? "green" : "red"}>
                {Accuracy(Row)}%
              </Chip>
            </div>
            <div>
              <Chip tone={BenchmarkTone(Row)}>{BenchmarkLabel(Row)}</Chip>
            </div>
            <div className="text-sm font-semibold text-slate-600">
              {RowDate(Row, [
                "completedAt",
                "submittedAt",
                "latestCompletedAt",
                "attemptDate",
                "createdAt",
              ])}
            </div>
            <div className="flex justify-start">
              {OnView ? (
                <StandardViewButton
                  label="View Details"
                  tooltip="Review result details"
                  onClick={() => OnView(Row)}
                  compact
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
