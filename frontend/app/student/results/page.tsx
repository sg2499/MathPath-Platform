"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  AnyRow,
  accuracyToneClass,
  currentWorkRows,
  isBelowBenchmark,
  isCompleted,
  latestActivity,
  levelCodeOf,
  NaturalCompare,
  requiredDpsForLevel,
} from "@/components/common/DetailWorkspaceViews";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { getStudentResults } from "@/lib/api/student";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useQuery } from "@tanstack/react-query";
import { ReactNode, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Layers3,
  Route,
  Search,
  Trophy,
} from "lucide-react";

function IsLevelProgressRow(Row: AnyRow) {
  return String(Row.recordKind || Row.assignmentType || "").toUpperCase() === "LEVEL_PROGRESS";
}

function IsPracticeResultRow(Row: AnyRow) {
  return !IsLevelProgressRow(Row);
}

function ModuleCodeOf(Row: AnyRow) {
  return String(Row.moduleCode || Row.moduleId || "MODULE");
}

function ModuleTitleFromRow(Row: AnyRow) {
  return `${Row.moduleCode || "Module"}${Row.moduleName ? ` · ${Row.moduleName}` : ""}`;
}

function LevelTitleFromRows(LevelCode: string, Rows: AnyRow[]) {
  const Sample = Rows.find((Row) => levelCodeOf(Row) === LevelCode) || Rows[0];
  return `${LevelCode}${Sample?.levelName ? ` · ${Sample.levelName}` : ""}`;
}

function NumberValue(Value: unknown, Fallback = 0) {
  const NumericValue = Number(Value);
  return Number.isNaN(NumericValue) ? Fallback : NumericValue;
}

function SortLevelCodes(LevelCodes: string[]) {
  return [...LevelCodes].sort(NaturalCompare);
}

function SortModules<ModuleItem extends { moduleCode: string }>(Modules: ModuleItem[]) {
  return [...Modules].sort((FirstModule, SecondModule) => NaturalCompare(FirstModule.moduleCode, SecondModule.moduleCode));
}

function LevelRowsFor(Rows: AnyRow[], LevelCode: string) {
  return Rows.filter((Row) => levelCodeOf(Row) === LevelCode);
}

function CompletedRows(Rows: AnyRow[]) {
  return Rows.filter((Row) => IsPracticeResultRow(Row) && isCompleted(Row) && !isBelowBenchmark(Row));
}

function HasAccuracyValue(Row: AnyRow) {
  const RawAccuracy = Row.accuracy ?? Row.accuracyPercentage ?? Row.averageAccuracy;
  return RawAccuracy !== null && RawAccuracy !== undefined && RawAccuracy !== "" && !Number.isNaN(Number(RawAccuracy));
}

function AccuracyValue(Row: AnyRow) {
  const RawAccuracy = Row.accuracy ?? Row.accuracyPercentage ?? Row.averageAccuracy;
  const NumericAccuracy = Number(RawAccuracy);
  return Number.isNaN(NumericAccuracy) ? 0 : NumericAccuracy;
}

function AverageValues(Values: number[]) {
  if (!Values.length) return 0;
  return Math.round(Values.reduce((Total, Value) => Total + Value, 0) / Values.length);
}

function AttemptAverageForRows(Rows: AnyRow[]) {
  const Values = Rows
    .filter((Row) => IsPracticeResultRow(Row) && isCompleted(Row) && HasAccuracyValue(Row))
    .map(AccuracyValue);
  return AverageValues(Values);
}

function HierarchyAverageForRows(Rows: AnyRow[]) {
  const AccuracyRows = Rows.filter((Row) => IsPracticeResultRow(Row) && isCompleted(Row) && HasAccuracyValue(Row));
  if (!AccuracyRows.length) return 0;

  const LevelCodes = SortLevelCodes(Array.from(new Set(AccuracyRows.map(levelCodeOf).filter(Boolean))));
  if (!LevelCodes.length) return AttemptAverageForRows(AccuracyRows);

  const LevelAverages = LevelCodes
    .map((LevelCode) => AttemptAverageForRows(AccuracyRows.filter((Row) => levelCodeOf(Row) === LevelCode)))
    .filter((Value) => Value > 0);

  return AverageValues(LevelAverages);
}

function CurrentPracticeRows(Rows: AnyRow[]) {
  return currentWorkRows(Rows.filter(IsPracticeResultRow));
}

function LevelStatusFor(LevelRows: AnyRow[], LevelCode: string) {
  const ProgressRow = LevelRows.find(IsLevelProgressRow);
  const Role = String(ProgressRow?.progressionRole || "").toUpperCase();
  const PracticeRows = LevelRows.filter(IsPracticeResultRow);
  const CurrentRows = CurrentPracticeRows(LevelRows);
  const Completed = CompletedRows(CurrentRows).length;
  const Required = requiredDpsForLevel(LevelRows.length ? LevelRows : PracticeRows, LevelCode);
  const Average = HierarchyAverageForRows(PracticeRows);
  const BelowBenchmark = CurrentRows.filter(isBelowBenchmark).length;

  if (Role === "PROMOTED_FROM") {
    return { Average, Completed, Required, Status: "Promoted", Tone: "green" };
  }

  if (Role === "ACTIVE_LEVEL") {
    return {
      Average,
      Completed,
      Required,
      Status: Completed > 0 ? "In Progress" : "Active Level",
      Tone: Completed > 0 ? "blue" : "cyan",
    };
  }

  if (BelowBenchmark > 0) return { Average, Completed, Required, Status: "Needs Re-Attempt", Tone: "red" };
  if (Completed >= Required && Required > 0) return { Average, Completed, Required, Status: "Completed", Tone: "green" };
  if (Completed > 0) return { Average, Completed, Required, Status: "In Progress", Tone: "blue" };
  return { Average, Completed, Required, Status: "Not Started", Tone: "amber" };
}

function LevelToneClass(Tone: string) {
  if (Tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (Tone === "red") return "border-rose-200 bg-rose-50 text-rose-700";
  if (Tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  if (Tone === "cyan") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

type ModuleProgress = {
  moduleCode: string;
  moduleTitle: string;
  rows: AnyRow[];
  levelCodes: string[];
};

function BuildModuleProgress(Rows: AnyRow[]): ModuleProgress[] {
  const MapByModule = new Map<string, ModuleProgress>();
  Rows.forEach((Row) => {
    const ModuleCode = ModuleCodeOf(Row);
    const Existing = MapByModule.get(ModuleCode);
    if (Existing) {
      Existing.rows.push(Row);
      return;
    }
    MapByModule.set(ModuleCode, {
      moduleCode: ModuleCode,
      moduleTitle: ModuleTitleFromRow(Row),
      rows: [Row],
      levelCodes: [],
    });
  });

  const Modules = Array.from(MapByModule.values()).map((ModuleItem) => ({
    ...ModuleItem,
    levelCodes: SortLevelCodes(Array.from(new Set(ModuleItem.rows.map(levelCodeOf).filter(Boolean)))),
  }));

  return SortModules(Modules);
}

function ActiveLevelForModule(ModuleRows: AnyRow[]) {
  const ActiveProgressRow = ModuleRows.find(
    (Row) => IsLevelProgressRow(Row) && String(Row.progressionRole || "").toUpperCase() === "ACTIVE_LEVEL",
  );
  if (ActiveProgressRow) return levelCodeOf(ActiveProgressRow);

  const LevelCodes = SortLevelCodes(Array.from(new Set(ModuleRows.map(levelCodeOf).filter(Boolean))));
  const FirstOpenLevel = LevelCodes.find((LevelCode) => {
    const LevelStatus = LevelStatusFor(LevelRowsFor(ModuleRows, LevelCode), LevelCode);
    return !["Completed", "Promoted"].includes(LevelStatus.Status);
  });
  return FirstOpenLevel || LevelCodes[LevelCodes.length - 1] || "Level";
}



function PrimaryActiveLevel(Rows: AnyRow[]) {
  const Modules = BuildModuleProgress(Rows);
  const ActiveLevels = Modules
    .map((ModuleItem) => ActiveLevelForModule(ModuleItem.rows))
    .filter(Boolean);
  const UniqueActiveLevels = Array.from(new Set(ActiveLevels));
  if (UniqueActiveLevels.length === 0) return "—";
  if (UniqueActiveLevels.length === 1) return UniqueActiveLevels[0];
  return `${UniqueActiveLevels.length} Active`;
}

function TotalVisibleLevels(Rows: AnyRow[]) {
  return SortLevelCodes(Array.from(new Set(Rows.map(levelCodeOf).filter(Boolean)))).length;
}

function RowsForLevelScope(Rows: AnyRow[], LevelCode: string) {
  return Rows.filter((Row) => levelCodeOf(Row) === LevelCode);
}


function CompactProgressMetric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="math-student-metric-card p-3">
      <div className="flex items-center gap-2">
        <span className="math-student-icon-chip h-8 w-8 items-center justify-center rounded-xl">
          {icon}
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 dark:text-white">{label}</p>
      </div>
      <p className="mt-2 truncate text-xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function ScopeMatches(Row: AnyRow, ModuleFilter: string, LevelFilter: string, SearchTerm: string) {
  const MatchesModule = ModuleFilter === "ALL" || ModuleCodeOf(Row) === ModuleFilter;
  const MatchesLevel = LevelFilter === "ALL" || levelCodeOf(Row) === LevelFilter;
  const Search = SearchTerm.trim().toLowerCase();
  const MatchesSearch = !Search || [Row.moduleCode, Row.moduleName, Row.levelCode, Row.levelName, Row.dpsTitle, Row.assignmentTitle]
    .filter(Boolean)
    .some((Value) => String(Value).toLowerCase().includes(Search));
  return MatchesModule && MatchesLevel && MatchesSearch;
}

export default function StudentResultsPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();
  const Query = useQuery({ queryKey: ["student-results"], queryFn: getStudentResults, enabled: Ready, retry: 1 });
  const Rows: AnyRow[] = Query.data ?? [];
  const StudentProgressStateKey = CreatePersistedUiStateKey("student", "progress-tracker", "overview");
  const [ExpandedModules, SetExpandedModules] = usePersistentUiState<Record<string, boolean>>(
    CreatePersistedUiStateKey(StudentProgressStateKey, "expanded-modules"),
    {},
  );
  const [SelectedModule, SetSelectedModule] = usePersistentUiState(
    CreatePersistedUiStateKey(StudentProgressStateKey, "selected-module"),
    "ALL",
  );
  const [SelectedLevel, SetSelectedLevel] = usePersistentUiState(
    CreatePersistedUiStateKey(StudentProgressStateKey, "selected-level"),
    "ALL",
  );
  const [SearchTerm, SetSearchTerm] = usePersistentUiState(
    CreatePersistedUiStateKey(StudentProgressStateKey, "search"),
    "",
  );

  const ModuleOptions = useMemo(() => BuildModuleProgress(Rows), [Rows]);
  const LevelOptions = useMemo(() => {
    const SourceRows = SelectedModule === "ALL" ? Rows : Rows.filter((Row) => ModuleCodeOf(Row) === SelectedModule);
    return SortLevelCodes(Array.from(new Set(SourceRows.map(levelCodeOf).filter(Boolean))));
  }, [Rows, SelectedModule]);
  const VisibleRows = useMemo(
    () => Rows.filter((Row) => ScopeMatches(Row, SelectedModule, SelectedLevel, SearchTerm)),
    [Rows, SelectedModule, SelectedLevel, SearchTerm],
  );
  const VisibleModules = useMemo(() => BuildModuleProgress(VisibleRows), [VisibleRows]);
  const OverallStudentAverage = useMemo(
    () => HierarchyAverageForRows(Rows),
    [Rows],
  );
  const TotalModules = ModuleOptions.length;
  const TotalLevels = TotalVisibleLevels(Rows);
  const ActiveLevelLabel = PrimaryActiveLevel(Rows);

  const ToggleModule = (ModuleCode: string) => {
    SetExpandedModules((Current) => ({ ...Current, [ModuleCode]: !(Current[ModuleCode] ?? false) }));
  };

  if (!Ready || Query.isLoading) return <LoadingState label="Loading progress..." />;
  if (Query.isError) return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Progress">
      <section className="w-full space-y-5">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Performance History</p>
            <h1 className="math-title">My Progress</h1>
            <p className="math-subtitle">Track your module journey, active levels, completed practice, accuracy, and learning history.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <CompactProgressMetric label="Modules" value={TotalModules} icon={<Layers3 size={14} />} />
            <CompactProgressMetric label="Total Levels" value={TotalLevels} icon={<Route size={14} />} />
            <CompactProgressMetric label="Active Level" value={ActiveLevelLabel} icon={<Trophy size={14} />} />
            <CompactProgressMetric label="Average Accuracy" value={`${OverallStudentAverage}%`} icon={<BarChart3 size={14} />} />
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
            <label className="relative block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={SearchTerm}
                onChange={(Event) => SetSearchTerm(Event.target.value)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Search Progress"
              />
            </label>
            <select
              value={SelectedModule}
              onChange={(Event) => {
                SetSelectedModule(Event.target.value);
                SetSelectedLevel("ALL");
              }}
              className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Choose Module</option>
              <option value="ALL">All Modules</option>
              {ModuleOptions.map((ModuleItem) => (
                <option key={ModuleItem.moduleCode} value={ModuleItem.moduleCode}>{ModuleItem.moduleTitle}</option>
              ))}
            </select>
            <select
              value={SelectedLevel}
              onChange={(Event) => SetSelectedLevel(Event.target.value)}
              className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Choose Level</option>
              <option value="ALL">All Levels</option>
              {LevelOptions.map((LevelCode) => (
                <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {VisibleModules.length ? VisibleModules.map((ModuleItem) => {
            const IsExpanded = ExpandedModules[ModuleItem.moduleCode] ?? false;
            const ActiveLevel = ActiveLevelForModule(ModuleItem.rows);
            const ModuleMetricRows = SelectedLevel === "ALL" ? RowsForLevelScope(ModuleItem.rows, ActiveLevel) : ModuleItem.rows;
            const ModulePracticeRows = CurrentPracticeRows(ModuleMetricRows);
            const ModuleCompleted = CompletedRows(ModulePracticeRows).length;
            const ModuleRequired = SelectedLevel === "ALL"
              ? requiredDpsForLevel(ModuleMetricRows, ActiveLevel)
              : ModuleItem.levelCodes.reduce((Total, LevelCode) => Total + requiredDpsForLevel(LevelRowsFor(ModuleItem.rows, LevelCode), LevelCode), 0);
            const ActiveLevelStatus = LevelStatusFor(ModuleMetricRows, ActiveLevel).Status;
            const ModuleStatus = ["Active Level", "Not Started"].includes(ActiveLevelStatus) ? "In Progress" : ActiveLevelStatus;
            const ModulePercent = ModuleRequired > 0 ? Math.min(100, Math.round((ModuleCompleted / ModuleRequired) * 100)) : 0;
            const ModuleAverage = HierarchyAverageForRows(ModuleItem.rows);

            return (
              <section key={ModuleItem.moduleCode} className="math-hierarchy-panel rounded-[30px]">
                <button
                  type="button"
                  className="math-hierarchy-row flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                  onClick={() => ToggleModule(ModuleItem.moduleCode)}
                  aria-expanded={IsExpanded}
                  title={IsExpanded ? "Collapse module progress" : "Expand module progress"}
                >
                  <div className="flex items-start gap-3">
                    <span className="math-hierarchy-icon mt-1 rounded-2xl">
                      <ChevronRight className={IsExpanded ? "rotate-90 transition" : "transition"} size={16} />
                    </span>
                    <div>
                      <p className="math-kicker">Module Progress</p>
                      <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{ModuleItem.moduleTitle}</h2>
                      <p className="mt-2 text-sm font-semibold text-slate-500">
                        Current Level: <span className="font-black text-slate-800 dark:text-slate-200">{ActiveLevel}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
                      <Trophy size={14} /> {ActiveLevel} · {ModuleStatus}
                    </span>
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${accuracyToneClass(ModuleAverage)}`}>
                      {ModuleAverage}% Avg
                    </span>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <ChevronDown className={IsExpanded ? "rotate-180 transition" : "transition"} size={15} />
                      {IsExpanded ? "Hide Levels" : "Show Levels"}
                    </span>
                  </div>
                </button>

                <div className="grid gap-2 border-t border-slate-100 p-4 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-5">
                  <CompactProgressMetric label="Module Status" value={ModuleStatus} icon={<Trophy size={14} />} />
                  <CompactProgressMetric label="Current Level" value={ActiveLevel} icon={<Route size={14} />} />
                  <CompactProgressMetric label="DPS Cleared" value={`${ModuleCompleted}/${ModuleRequired}`} icon={<FileText size={14} />} />
                  <CompactProgressMetric label="Average Accuracy" value={`${ModuleAverage}%`} icon={<BarChart3 size={14} />} />
                  <CompactProgressMetric label="Last Activity" value={latestActivity(ModuleMetricRows)} icon={<Clock3 size={14} />} />
                  <div className="md:col-span-2 xl:col-span-5 rounded-[20px] border border-slate-100 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                      <span>Current Level Progress</span>
                      <span className="text-slate-900 dark:text-white">{ModulePercent}%</span>
                    </div>
                    <div className="math-role-progress-track mt-3 h-3">
                      <div className="math-role-progress-fill" style={{ width: `${ModulePercent}%` }} />
                    </div>
                  </div>
                </div>

                {IsExpanded ? (
                  <div className="math-hierarchy-child space-y-3">
                    {ModuleItem.levelCodes.map((LevelCode) => {
                      const LevelRows = LevelRowsFor(ModuleItem.rows, LevelCode);
                      const LevelStatus = LevelStatusFor(LevelRows, LevelCode);
                      const LevelPercent = LevelStatus.Required > 0 ? Math.min(100, Math.round((LevelStatus.Completed / LevelStatus.Required) * 100)) : 0;
                      const IsCurrentLevel = LevelCode === ActiveLevel;
                      return (
                        <button
                          key={`${ModuleItem.moduleCode}-${LevelCode}`}
                          type="button"
                          className={`w-full rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${IsCurrentLevel ? "border-blue-200 bg-blue-50/60" : "border-slate-100 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-900/70"}`}
                          onClick={() => Router.push(`/student/results/module/${encodeURIComponent(ModuleItem.moduleCode)}?level=${encodeURIComponent(LevelCode)}`)}
                          title="Open level progress details"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">Level</p>
                              <h3 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{LevelTitleFromRows(LevelCode, LevelRows)}</h3>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full border px-3 py-1 text-xs font-black ${LevelToneClass(LevelStatus.Tone)}`}>{LevelStatus.Status}</span>
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{LevelStatus.Completed}/{LevelStatus.Required} DPS</span>
                              <span className={`rounded-full border px-3 py-1 text-xs font-black ${accuracyToneClass(LevelStatus.Average)}`}>{LevelStatus.Average}% Avg</span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600">{LevelRows.filter(IsPracticeResultRow).length} Record(s)</span>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-3">
                            <div className="math-role-progress-track h-2.5 flex-1">
                              <div className="math-role-progress-fill" style={{ width: `${LevelPercent}%` }} />
                            </div>
                            <span className="shrink-0 text-xs font-black text-slate-700 dark:text-slate-100">{LevelPercent}%</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          }) : <EmptyState title="No progress found" description="No module or level records match the selected progress scope." />}
        </div>
      </section>
    </AppShell>
  );
}
