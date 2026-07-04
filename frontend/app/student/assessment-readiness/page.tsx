"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { formatMathPathDateTime } from "@/lib/date";
import {
  getStudentAssessmentEligibility,
  type StudentAssessmentEligibility,
} from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  GraduationCap,
  Layers3,
  ListChecks,
  Maximize2,
  Minimize2,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";

type Filter = "" | "ALL" | "READY" | "NOT_READY";

function matchesFilter(row: StudentAssessmentEligibility, filter: Filter) {
  if (!filter || filter === "ALL") return true;
  if (filter === "READY") return row.eligible;
  if (filter === "NOT_READY") return !row.eligible;
  return row.status === filter;
}

function statusTone(row: StudentAssessmentEligibility) {
  if (row.eligible) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (row.status === "NEEDS_DPS_REATTEMPT")
    return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function progressTone(row: StudentAssessmentEligibility) {
  if (row.eligible) return "bg-emerald-500";
  if (row.belowBenchmarkDpsCount) return "bg-rose-500";
  return "bg-amber-500";
}

function moduleKey(row: StudentAssessmentEligibility) {
  return `module:${row.moduleId || row.moduleCode || "module"}`;
}

function levelKey(row: StudentAssessmentEligibility) {
  return `level:${row.moduleId || row.moduleCode || "module"}:${row.levelId || row.levelCode || "level"}`;
}

function levelFilterValue(row: {
  levelId?: string | number | null;
  levelCode?: string | null;
}) {
  return String(row.levelCode || row.levelId || "Level");
}

function levelFilterLabel(row: {
  levelId?: string | number | null;
  levelCode?: string | null;
  levelName?: string | null;
}) {
  const LevelCode = String(row.levelCode || row.levelId || "Level");
  return row.levelName ? `${LevelCode} · ${row.levelName}` : LevelCode;
}

export default function StudentAssessmentReadinessPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const ReadinessStateKey = CreatePersistedUiStateKey("student", "assessment-readiness");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(ReadinessStateKey, "search"), "");
  const [levelFilter, setLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(ReadinessStateKey, "level-filter"), "");
  const [filter, setFilter] = usePersistentUiState<Filter>(CreatePersistedUiStateKey(ReadinessStateKey, "status-filter"), "");
  const [open, setOpen] = usePersistentUiState<Record<string, boolean>>(CreatePersistedUiStateKey(ReadinessStateKey, "open-rows"), {});

  const query = useQuery({
    queryKey: ["student-assessment-eligibility"],
    queryFn: getStudentAssessmentEligibility,
    enabled: ready,
  });

  const row = query.data;

  const levelOptions = useMemo(() => {
    if (!row) return [] as Array<[string, string]>;
    return [[levelFilterValue(row), levelFilterLabel(row)]];
  }, [row]);

  const visibleRow = useMemo(() => {
    if (!row) return null;
    const QueryText = search.trim().toLowerCase();
    const SearchMatch =
      !QueryText ||
      [
        row.moduleCode,
        row.moduleName,
        row.levelCode,
        row.levelName,
        row.statusLabel,
        row.message,
        ...(row.lessons || []).map((lesson) => lesson.lessonTitle),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(QueryText);
    const LevelMatch =
      !levelFilter ||
      levelFilter === "ALL" ||
      levelFilterValue(row) === levelFilter;
    return SearchMatch && LevelMatch && matchesFilter(row, filter) ? row : null;
  }, [row, search, levelFilter, filter]);

  function setBranch(key: string, value: boolean) {
    setOpen((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: string) {
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function expandAll() {
    if (!row) return;
    setOpen({
      [moduleKey(row)]: true,
      [levelKey(row)]: true,
    });
  }

  function collapseAll() {
    setOpen({});
  }

  if (!ready) return null;

  return (
    <AppShell>
      <section className="math-hero">
        <div className="relative z-10">
          <div className="math-block-header mb-2"><Radar size={14} /> Readiness Overview</div>
          <h1 className="math-title">Am I Ready for Assessment?</h1>
          <p className="math-subtitle">
            Track your level readiness and remaining practice work.
          </p>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_200px_auto_auto] xl:items-center">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="math-input pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Assessment Readiness"
            />
          </div>
          <select
            className="math-select"
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
          >
            <option value="" disabled>
              Choose Level
            </option>
            <option value="ALL">All Levels</option>
            {levelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="math-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            <option value="" disabled>
              Choose Readiness Status
            </option>
            <option value="ALL">All Readiness Statuses</option>
            <option value="READY">Ready</option>
            <option value="NOT_READY">Not Ready</option>
          </select>
          <button
            type="button"
            className="math-role-action-button math-role-row-action math-readiness-control-button whitespace-nowrap"
            onClick={expandAll}
          >
            Expand All
          </button>
          <button
            type="button"
            className="math-role-action-button math-role-row-action math-readiness-control-button whitespace-nowrap"
            onClick={collapseAll}
          >
            Collapse All
          </button>
        </div>
      </section>

      <section className="mt-6">
        {query.isLoading ? (
          <LoadingState label="Checking your readiness..." />
        ) : null}
        {query.error ? (
          <ErrorState
            title="Unable to check readiness"
            message={apiErrorMessage(query.error)}
          />
        ) : null}
        {!query.isLoading && !query.error && !row ? (
          <EmptyState
            title="No readiness record found"
            message="Your assigned level readiness will appear here once practice data is available."
          />
        ) : null}
        {!query.isLoading && !query.error && row && !visibleRow ? (
          <EmptyState
            title="No readiness records found"
            message="Adjust the filters to review your readiness details."
          />
        ) : null}

        {visibleRow ? (
          <div>
            <NodeCard
              open={!!open[moduleKey(visibleRow)]}
              onToggle={() => toggle(moduleKey(visibleRow))}
              onExpand={() => setBranch(moduleKey(visibleRow), true)}
              onCollapse={() => setBranch(moduleKey(visibleRow), false)}
              title={visibleRow.moduleName || visibleRow.moduleCode || "Module"}
              subtitle="Module"
              chips={
                <>
                  <Chip tone="blue">{visibleRow.requiredDpsCount} DPS</Chip>
                  <Chip tone={visibleRow.eligible ? "green" : "amber"}>
                    {visibleRow.statusLabel}
                  </Chip>
                  <Chip
                    tone={visibleRow.belowBenchmarkDpsCount ? "red" : "green"}
                  >
                    {visibleRow.progressPercentage}% progress
                  </Chip>
                </>
              }
            >
              <NodeCard
                open={!!open[levelKey(visibleRow)]}
                onToggle={() => toggle(levelKey(visibleRow))}
                onExpand={() => setBranch(levelKey(visibleRow), true)}
                onCollapse={() => setBranch(levelKey(visibleRow), false)}
                title={
                  <span className="flex items-center gap-2">
                    {`${visibleRow.levelCode || "Level"}${visibleRow.levelName ? ` - ${visibleRow.levelName}` : ""}`}
                    {visibleRow.eligible && (
                      <span title="Level Unlocked!" className="animate-pulse text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
                        🔓
                      </span>
                    )}
                  </span>
                }
                subtitle="Level"
                chips={
                  <>
                    <Chip tone="blue">
                      {visibleRow.completedDpsCount}/
                      {visibleRow.requiredDpsCount} cleared
                    </Chip>
                    {visibleRow.missingDpsCount ? (
                      <Chip tone="amber">
                        {visibleRow.missingDpsCount} missing
                      </Chip>
                    ) : null}
                    {visibleRow.belowBenchmarkDpsCount ? (
                      <Chip tone="red">
                        Needs Re-Attempt: {visibleRow.belowBenchmarkDpsCount}
                      </Chip>
                    ) : null}
                  </>
                }
                compact
              >
                <ReadinessDetails row={visibleRow} persistenceKey={CreatePersistedUiStateKey(ReadinessStateKey, levelKey(visibleRow), "sheet-breakdown")} />
              </NodeCard>
            </NodeCard>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

type SheetFilter = "ALL" | "PENDING" | "NEEDS_REATTEMPT" | "CLEARED";

type SheetRow = {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  dpsId: string;
  dpsNumber: number | null;
  dpsTitle: string | null;
  status: string;
  isCompleted: boolean;
  isPassed: boolean;
  bestAccuracy: number | null;
  latestAccuracy: number | null;
  latestScore: number | null;
  latestMaxScore: number | null;
  latestSubmittedAt: string | null;
};

function allSheets(row: {
  lessons: Array<{
    lessonId: string;
    lessonNumber: number;
    lessonTitle: string;
    dps: Array<Record<string, any>>;
  }>;
}) {
  return row.lessons.flatMap((lesson) =>
    (lesson.dps || []).map((sheet) => ({
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.lessonTitle,
      dpsId: String(sheet.dpsId ?? ""),
      dpsNumber: typeof sheet.dpsNumber === "number" ? sheet.dpsNumber : null,
      dpsTitle: String(sheet.dpsTitle ?? "DPS"),
      status: String(sheet.status ?? ""),
      isCompleted: Boolean(sheet.isCompleted),
      isPassed: Boolean(sheet.isPassed),
      bestAccuracy:
        typeof sheet.bestAccuracy === "number" ? sheet.bestAccuracy : null,
      latestAccuracy:
        typeof sheet.latestAccuracy === "number" ? sheet.latestAccuracy : null,
      latestScore:
        typeof sheet.latestScore === "number" ? sheet.latestScore : null,
      latestMaxScore:
        typeof sheet.latestMaxScore === "number" ? sheet.latestMaxScore : null,
      latestSubmittedAt:
        typeof sheet.latestSubmittedAt === "string"
          ? sheet.latestSubmittedAt
          : null,
    })),
  );
}

function sheetCategory(sheet: SheetRow) {
  if (sheet.isPassed) return "CLEARED";
  if (sheet.isCompleted && !sheet.isPassed) return "NEEDS_REATTEMPT";
  return "PENDING";
}

function sheetStatusLabel(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "Cleared";
  if (category === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  return "Pending";
}

function sheetStatusClasses(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "bg-emerald-100 text-emerald-700";
  if (category === "NEEDS_REATTEMPT") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function sheetDot(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "bg-emerald-500";
  if (category === "NEEDS_REATTEMPT") return "bg-rose-500";
  return "bg-amber-500";
}

function sheetProgress(sheet: SheetRow) {
  if (sheet.isPassed) return 100;
  if (sheet.isCompleted && !sheet.isPassed)
    return Math.max(
      5,
      Math.round(sheet.bestAccuracy ?? sheet.latestAccuracy ?? 0),
    );
  return 0;
}

function dpsLabel(sheet: SheetRow) {
  return `${sheet.dpsNumber ? `DPS ${sheet.dpsNumber}` : "DPS"}`;
}

function groupSheetsByLesson(sheets: SheetRow[]) {
  const map = new Map<
    string,
    {
      lessonId: string;
      lessonNumber: number;
      lessonTitle: string;
      sheets: SheetRow[];
    }
  >();
  sheets.forEach((sheet) => {
    const key = sheet.lessonId || `lesson-${sheet.lessonNumber}`;
    const existing = map.get(key);
    if (existing) {
      existing.sheets.push(sheet);
    } else {
      map.set(key, {
        lessonId: key,
        lessonNumber: sheet.lessonNumber,
        lessonTitle: sheet.lessonTitle,
        sheets: [sheet],
      });
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => a.lessonNumber - b.lessonNumber,
  );
}

function filterSheets(sheets: SheetRow[], filter: SheetFilter) {
  if (filter === "ALL") return sheets;
  return sheets.filter((sheet) => sheetCategory(sheet) === filter);
}

function ReadinessDetails({ row, persistenceKey }: { row: StudentAssessmentEligibility; persistenceKey: string }) {
  const [showSheets, setShowSheets] = usePersistentUiState(
    CreatePersistedUiStateKey(persistenceKey, "show-sheets"),
    false,
  );
  const [sheetFilter, setSheetFilter] = usePersistentUiState<SheetFilter>(
    CreatePersistedUiStateKey(persistenceKey, "sheet-filter"),
    "ALL",
  );

  const sheets = allSheets(row);
  const pendingCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "PENDING",
  ).length;
  const needsReattemptCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "NEEDS_REATTEMPT",
  ).length;
  const clearedCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "CLEARED",
  ).length;
  const visibleSheets = filterSheets(sheets, sheetFilter);
  const grouped = groupSheetsByLesson(visibleSheets);

  return (
    <div className="rounded-[28px] bg-white/40 dark:bg-slate-900/40 border border-white/50 dark:border-white/10 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusTone(row)}`}
            >
              {row.statusLabel}
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
            {row.message}
          </p>
        </div>
        <div className="min-w-[160px] rounded-[24px] bg-slate-50 p-4 text-center dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Progress
          </p>
          <p className="mt-2 text-4xl font-black text-slate-950 dark:text-white">
            {row.progressPercentage}%
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Info label="Required DPS" value={row.requiredDpsCount} icon={<Layers3 size={18} />} />
        <Info label="Cleared DPS" value={row.completedDpsCount} icon={<CheckCircle2 size={18} />} />
        <Info label="Pending DPS" value={pendingCount} icon={<Clock3 size={18} />} />
        <Info label="Needs Re-Attempt" value={needsReattemptCount} icon={<AlertTriangle size={18} />} />
      </div>

      <div className="mt-5 h-3 math-role-progress-track">
        <div
          className="h-full rounded-full math-role-progress-fill"
          style={{
            width: `${Math.min(100, Math.max(0, row.progressPercentage))}%`,
          }}
        />
      </div>

      <section className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="math-block-header mb-2"><ListChecks size={14} /> Sheet Breakdown</div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">
              DPS Clearance Tracker
            </h3>
            <p className="math-subtitle !mt-1">
              Review pending, cleared, and re-attempt sheets for this level.
            </p>
          </div>
          <button
            type="button"
            className="math-role-action-button math-role-row-action"
            onClick={() => setShowSheets((current) => !current)}
          >
            {showSheets ? "Hide Sheet Details" : "Show Sheet Details"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SheetFilterChip
            active={sheetFilter === "ALL"}
            icon={<ListChecks size={14} strokeWidth={2.5} />}
            onClick={() => setSheetFilter("ALL")}
          >
            All Sheets{" "}
            <span className="ml-1 opacity-70">({sheets.length})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "PENDING"}
            icon={<Clock3 size={14} strokeWidth={2.5} />}
            onClick={() => setSheetFilter("PENDING")}
          >
            Pending <span className="ml-1 opacity-70">({pendingCount})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "NEEDS_REATTEMPT"}
            icon={<RefreshCcw size={14} strokeWidth={2.5} />}
            onClick={() => setSheetFilter("NEEDS_REATTEMPT")}
          >
            Needs Re-Attempt{" "}
            <span className="ml-1 opacity-70">({needsReattemptCount})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "CLEARED"}
            icon={<CheckCircle2 size={14} strokeWidth={2.5} />}
            onClick={() => setSheetFilter("CLEARED")}
          >
            Cleared <span className="ml-1 opacity-70">({clearedCount})</span>
          </SheetFilterChip>
        </div>

        {showSheets ? (
          <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="max-h-[460px] overflow-y-auto">
              {grouped.length ? (
                grouped.map((lesson) => (
                  <section
                    key={lesson.lessonId}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <div className="math-student-readiness-sheet-table-header sticky top-0 z-20 grid gap-3 border-b border-slate-100 bg-slate-50/95 px-4 py-3 backdrop-blur lg:grid-cols-[1fr_96px_160px_170px] lg:items-end dark:border-slate-800 dark:bg-slate-900/95">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">
                          Lesson {lesson.lessonNumber}
                        </p>
                        <h4 className="text-sm font-black text-slate-950 dark:text-white">
                          {lesson.lessonTitle}
                        </h4>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {lesson.sheets.length} sheet
                          {lesson.sheets.length === 1 ? "" : "s"} in this view
                        </p>
                      </div>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Score
                      </p>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Status
                      </p>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Completion Date
                      </p>
                    </div>

                    {lesson.sheets.map((sheet) => (
                      <div
                        key={
                          sheet.dpsId || `${lesson.lessonId}-${sheet.dpsNumber}`
                        }
                        className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 lg:grid-cols-[1fr_96px_160px_170px] lg:items-center dark:border-slate-800"
                      >
                        <div className="min-w-0 w-full">
                          <div className="flex w-full items-start gap-3">
                            <span
                              className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${sheetDot(sheet)}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                {dpsLabel(sheet)}
                              </p>
                              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {row.moduleCode || "Module"} · {row.levelCode || "Level"}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Best:{" "}
                                {sheet.bestAccuracy !== null
                                  ? `${Math.round(sheet.bestAccuracy)}%`
                                  : "-"}{" "}
                                · Latest:{" "}
                                {sheet.latestAccuracy !== null
                                  ? `${Math.round(sheet.latestAccuracy)}%`
                                  : "-"}
                              </p>
                              <div className="mt-2 h-2 w-full math-role-progress-track">
                                <div
                                  className="h-full rounded-full math-role-progress-fill"
                                  style={{ width: `${sheetProgress(sheet)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm font-black text-slate-950 dark:text-white">
                          {sheet.latestScore !== null &&
                          sheet.latestMaxScore !== null
                            ? `${sheet.latestScore} / ${sheet.latestMaxScore}`
                            : "- / -"}
                        </div>

                        <div>
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${sheetStatusClasses(sheet)}`}
                          >
                            {sheetStatusLabel(sheet)}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-500">
                          {sheet.latestSubmittedAt
                            ? formatMathPathDateTime(sheet.latestSubmittedAt)
                            : "Not submitted yet"}
                        </div>
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <div className="p-6 text-sm font-semibold text-slate-500">
                  No sheets match this filter.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function NodeCard({
  open,
  onToggle,
  onExpand,
  onCollapse,
  title,
  subtitle,
  chips,
  compact,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`overflow-hidden rounded-[30px] border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 ${compact ? "mt-4" : ""}`}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-4 text-left"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-6 text-slate-950 dark:text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {subtitle}
              </p>
            ) : null}
            {chips ? (
              <div className="mt-3 flex flex-wrap gap-2">{chips}</div>
            ) : null}
          </div>
        </button>
        <BranchButtons onExpand={onExpand} onCollapse={onCollapse} />
      </div>
      {open ? (
        <div className="border-t border-slate-100 p-4 sm:p-5 dark:border-slate-800">
          {children}
        </div>
      ) : null}
    </article>
  );
}

function BranchButtons({
  onExpand,
  onCollapse,
}: {
  onExpand: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title="Expand this branch"
        aria-label="Expand this branch"
        className="math-readiness-branch-button"
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
      >
        <Maximize2 size={15} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        title="Collapse this branch"
        aria-label="Collapse this branch"
        className="math-readiness-branch-button"
        onClick={(event) => {
          event.stopPropagation();
          onCollapse();
        }}
      >
        <Minimize2 size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "blue" | "green" | "amber" | "red";
  children: React.ReactNode;
}) {
  const classes = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function SheetFilterChip({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`math-readiness-sheet-filter ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <span className="math-readiness-sheet-filter-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="math-readiness-sheet-filter-label">{children}</span>
    </button>
  );
}

function Info({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      {icon && (
        <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {value}
      </p>
    </div>
  );
}
