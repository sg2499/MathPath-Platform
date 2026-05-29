"use client";

import { EmptyState } from "@/components/common/EmptyState";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  MATHPATH_COMPLETION_TIMESTAMP_KEYS,
  formatMathPathDateTime,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  Layers3,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export type AssessmentRow = Record<string, any>;

type WorkspaceRole = "admin" | "teacher" | "student";

type Tone = "slate" | "green" | "red" | "amber" | "blue" | "cyan";

function AccuracyTone(Value: number): "green" | "amber" | "red" {
  if (Value > 70) return "green";
  if (Value >= 60) return "amber";
  return "red";
}

function NaturalCompare(FirstValue: unknown, SecondValue: unknown) {
  return String(FirstValue ?? "").localeCompare(String(SecondValue ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function NumberValue(Value: unknown, Fallback = 0) {
  if (Value === null || Value === undefined || Value === "" || Number.isNaN(Number(Value))) return Fallback;
  return Number(Value);
}

export function AssessmentStudentCode(Row: AssessmentRow) {
  return String(Row.studentCode || Row.targetStudentCode || Row.assignedToId || "GROUP");
}

export function AssessmentStudentName(Row: AssessmentRow) {
  return String(Row.studentName || Row.targetStudentName || Row.assignedToLabel?.replace(/\s*\([^)]*\)\s*$/, "") || "Student");
}

function ModuleCode(Row: AssessmentRow) {
  return String(Row.moduleCode || Row.moduleId || "MODULE");
}

function ModuleLabel(Row: AssessmentRow) {
  const Code = String(Row.moduleCode || "Module");
  const Name = String(Row.moduleName || "");
  return Name && Name !== Code ? `${Name} · ${Code}` : Code;
}

function LevelCode(Row: AssessmentRow) {
  return String(Row.levelCode || Row.levelId || "Level");
}

function LevelLabel(Row: AssessmentRow) {
  const Code = String(Row.levelCode || "Level");
  const Name = String(Row.levelName || "");
  return Name && Name !== Code ? `${Code} · ${Name}` : Code;
}

function AssessmentTitle(Row: AssessmentRow) {
  return String(Row.assessmentTitle || Row.assignmentTitle || Row.title || "Assessment");
}

function AssessmentScopeCode(Row: AssessmentRow) {
  return `${ModuleCode(Row)} · ${LevelCode(Row)}`;
}

function AttemptNumber(Row: AssessmentRow) {
  return NumberValue(Row.attemptNumber ?? Row.reattemptNumber ?? Row.attemptSequence, 0);
}

function IsReattempt(Row: AssessmentRow) {
  const Text = [Row.attemptLabel, Row.attemptType, Row.status, Row.reattemptStatus].filter(Boolean).join(" ").toUpperCase();
  return Boolean(Row.isReattempt || Row.reattemptPermissionId || AttemptNumber(Row) > 1 || Text.includes("RE-ATTEMPT") || Text.includes("REATTEMPT"));
}

function AttemptLabel(Row: AssessmentRow) {
  if (!IsReattempt(Row)) return "Original";
  const Number = Math.max(AttemptNumber(Row) - 1, NumberValue(Row.reattemptNumber, 1), 1);
  return `Re-Attempt ${Number}`;
}

function Accuracy(Row: AssessmentRow) {
  return NumberValue(Row.accuracy ?? Row.accuracyPercentage ?? Row.percentage, 0);
}

function HasResult(Row: AssessmentRow) {
  const Status = String(Row.status || Row.attemptStatus || "").toUpperCase();
  return Boolean(
    Row.completedDate ||
      Row.submittedAt ||
      Row.score !== null && Row.score !== undefined ||
      Status === "COMPLETED" ||
      Status === "CLEARED" ||
      Status === "SUBMITTED" ||
      Status === "AUTO_SUBMITTED" ||
      Status === "NEEDS_RE_ATTEMPT" ||
      Status === "REATTEMPT_AVAILABLE",
  );
}

function IsCleared(Row: AssessmentRow) {
  const Status = String(Row.status || Row.attemptStatus || "").toUpperCase();
  const Benchmark = String(Row.benchmarkStatus || "").toUpperCase();
  return Status === "CLEARED" || Status === "COMPLETED" || Benchmark === "PASS" || (HasResult(Row) && Accuracy(Row) >= 70);
}

function NeedsReattempt(Row: AssessmentRow) {
  const Status = String(Row.status || Row.attemptStatus || "").toUpperCase();
  const Benchmark = String(Row.benchmarkStatus || "").toUpperCase();
  return Status.includes("REATTEMPT") || Status.includes("RE_ATTEMPT") || Status === "NEEDS_RE_ATTEMPT" || Benchmark.includes("BELOW") || (HasResult(Row) && Accuracy(Row) < 70);
}

function IsPending(Row: AssessmentRow) {
  return !HasResult(Row) && !NeedsReattempt(Row) && !IsCleared(Row);
}

function StatusLabel(Row: AssessmentRow) {
  if (IsReattempt(Row) && IsPending(Row)) return "Re-Attempt Pending";
  if (IsReattempt(Row) && IsCleared(Row)) return "Re-Attempt Cleared";
  if (NeedsReattempt(Row)) return "Needs Re-Attempt";
  if (IsCleared(Row)) return "Cleared";
  return "Pending";
}

function StatusTone(Row: AssessmentRow): Tone {
  const Label = StatusLabel(Row);
  if (Label.includes("Cleared")) return "green";
  if (Label === "Needs Re-Attempt") return "red";
  if (Label.includes("Pending")) return "amber";
  return "slate";
}

function ScoreText(Row: AssessmentRow) {
  const Score = Row.score ?? Row.totalScore ?? Row.scoreObtained ?? Row.marksObtained;
  const Max = Row.totalMarks ?? Row.maxScore ?? Row.outOf ?? Row.totalQuestions ?? Row.questionCount ?? 100;
  if (Score !== null && Score !== undefined && Score !== "") return `${Score} / ${Max}`;
  if (IsPending(Row)) return "—";
  if (Accuracy(Row) > 0) return `${Math.round((Number(Max) * Accuracy(Row)) / 100)} / ${Max}`;
  return "—";
}

function AccuracyText(Row: AssessmentRow) {
  return IsPending(Row) ? "—" : `${Accuracy(Row)}%`;
}

function BenchmarkText(Row: AssessmentRow) {
  if (IsPending(Row)) return "Pending";
  return IsCleared(Row) ? "Benchmark Met" : "Needs Re-Attempt";
}

function CompletionText(Row: AssessmentRow) {
  if (IsPending(Row)) return "Pending";
  const DateValue = getFirstMathPathTimestamp(Row, MATHPATH_COMPLETION_TIMESTAMP_KEYS);
  return DateValue ? formatMathPathDateTime(DateValue) : "Pending";
}

function RowTime(Row: AssessmentRow) {
  const Value = getFirstMathPathTimestamp(Row, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return Value ? mathPathTimestampValue(Value) : 0;
}

function CompareAssessmentRows(First: AssessmentRow, Second: AssessmentRow) {
  return (
    NaturalCompare(ModuleCode(First), ModuleCode(Second)) ||
    NaturalCompare(LevelCode(First), LevelCode(Second)) ||
    NaturalCompare(AssessmentTitle(First), AssessmentTitle(Second)) ||
    AttemptNumber(First) - AttemptNumber(Second) ||
    RowTime(First) - RowTime(Second)
  );
}

function SearchBlob(Row: AssessmentRow) {
  return [
    AssessmentTitle(Row),
    Row.studentName,
    Row.studentCode,
    Row.moduleCode,
    Row.moduleName,
    Row.levelCode,
    Row.levelName,
    StatusLabel(Row),
    ScoreText(Row),
    AccuracyText(Row),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function Stats(Rows: AssessmentRow[]) {
  const Cleared = Rows.filter(IsCleared).length;
  const Pending = Rows.filter(IsPending).length;
  const Reattempt = Rows.filter(NeedsReattempt).length;
  const AccuracyValues = Rows.filter((Row) => HasResult(Row)).map(Accuracy).filter((Value) => Value > 0);
  const Average = AccuracyValues.length ? Math.round(AccuracyValues.reduce((Sum, Value) => Sum + Value, 0) / AccuracyValues.length) : 0;
  return { Total: Rows.length, Cleared, Pending, Reattempt, Average };
}

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  const Tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${Tones[tone]}`}>{children}</span>;
}

function Metric({ Label, Value, Icon }: { Label: string; Value: string | number; Icon: ReactNode }) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm dark:bg-slate-950/75">
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        {Icon}
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{Label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}

function OverviewStat({ Icon, Label, Value, Tone }: { Icon: ReactNode; Label: string; Value: string | number; Tone: Tone }) {
  const Tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  };
  return (
    <div className={`rounded-[22px] border p-4 ${Tones[Tone]}`}>
      <div className="flex items-center gap-2 opacity-85">
        {Icon}
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{Label}</p>
      </div>
      <p className="mt-2 text-2xl font-black">{Value}</p>
    </div>
  );
}

function LevelKey(Row: AssessmentRow) {
  return `${ModuleCode(Row)}|${LevelCode(Row)}`;
}

function BuildModuleLevelGroups(Rows: AssessmentRow[]) {
  const MapByModule = new Map<string, { Key: string; Sample: AssessmentRow; Levels: Map<string, AssessmentRow[]> }>();
  [...Rows].sort(CompareAssessmentRows).forEach((Row) => {
    const ModuleKey = ModuleCode(Row);
    if (!MapByModule.has(ModuleKey)) MapByModule.set(ModuleKey, { Key: ModuleKey, Sample: Row, Levels: new Map() });
    const ModuleGroup = MapByModule.get(ModuleKey)!;
    const LKey = LevelKey(Row);
    if (!ModuleGroup.Levels.has(LKey)) ModuleGroup.Levels.set(LKey, []);
    ModuleGroup.Levels.get(LKey)!.push(Row);
  });

  return Array.from(MapByModule.values()).map((ModuleGroup) => ({
    ...ModuleGroup,
    LevelGroups: Array.from(ModuleGroup.Levels.entries()).map(([Key, Rows]) => ({ Key, Sample: Rows[0], Rows })),
  }));
}

function ReviewButton({ onClick, label = "View Details" }: { onClick?: () => void; label?: string }) {
  if (!onClick) return null;
  return (
    <button type="button" className="math-role-action-button px-3 py-2 text-xs" onClick={onClick} title={label} aria-label={label}>
      <Eye size={14} /> {label}
    </button>
  );
}

export function AssessmentInsightWorkspace({
  title,
  subtitle,
  rows,
  role,
  onView,
  onArchive,
  onRestore,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  rows: AssessmentRow[];
  role: WorkspaceRole;
  onView?: (row: AssessmentRow) => void;
  onArchive?: (row: AssessmentRow) => void;
  onRestore?: (row: AssessmentRow) => void;
  onDelete?: (row: AssessmentRow) => void;
}) {
  const [Tab, SetTab] = useState<"overview" | "insights" | "manage">("overview");
  const [SearchQuery, SetSearchQuery] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("");
  const [LevelFilter, SetLevelFilter] = useState("");
  const [StatusFilter, SetStatusFilter] = useState("");
  const [OpenModules, SetOpenModules] = useState<Record<string, boolean>>({});
  const [OpenLevels, SetOpenLevels] = useState<Record<string, boolean>>({});

  const Modules = useMemo(() => {
    const OptionMap = new globalThis.Map<string, string>();
    rows.forEach((Row) => OptionMap.set(ModuleCode(Row), ModuleLabel(Row)));
    return Array.from(OptionMap.entries()).sort((First, Second) => NaturalCompare(First[1], Second[1]));
  }, [rows]);

  const Levels = useMemo(() => {
    const Source = ModuleFilter && ModuleFilter !== "ALL" ? rows.filter((Row) => ModuleCode(Row) === ModuleFilter) : rows;
    const OptionMap = new globalThis.Map<string, string>();
    Source.forEach((Row) => OptionMap.set(LevelCode(Row), LevelLabel(Row)));
    return Array.from(OptionMap.entries()).sort((First, Second) => NaturalCompare(First[0], Second[0]));
  }, [rows, ModuleFilter]);

  const FilteredRows = useMemo(() => {
    const Query = SearchQuery.trim().toLowerCase();
    return rows.filter((Row) => {
      const ModuleOk = !ModuleFilter || ModuleFilter === "ALL" || ModuleCode(Row) === ModuleFilter;
      const LevelOk = !LevelFilter || LevelFilter === "ALL" || LevelCode(Row) === LevelFilter;
      const StatusOk = !StatusFilter || StatusFilter === "ALL" || StatusLabel(Row).toUpperCase() === StatusFilter;
      const SearchOk = !Query || SearchBlob(Row).includes(Query);
      return ModuleOk && LevelOk && StatusOk && SearchOk;
    });
  }, [rows, SearchQuery, ModuleFilter, LevelFilter, StatusFilter]);

  const CurrentStats = Stats(FilteredRows.length ? FilteredRows : rows);
  const Groups = useMemo(() => BuildModuleLevelGroups(FilteredRows), [FilteredRows]);
  const Tabs = role === "admin" ? [["overview", "Overview"], ["insights", "Assessment Insights"], ["manage", "Manage"]] as const : [["overview", "Overview"], ["insights", "Assessment Insights"]] as const;

  function ToggleModule(Key: string) {
    SetOpenModules((Current) => ({ ...Current, [Key]: !(Current[Key] ?? false) }));
  }

  function ToggleLevel(Key: string) {
    SetOpenLevels((Current) => ({ ...Current, [Key]: !(Current[Key] ?? false) }));
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-8">
      <div className="math-hero">
        <div>
          <p className="math-kicker">{role === "student" ? "Student Assessment Review" : role === "teacher" ? "Student Assessment Review" : "Student Assessment Profile"}</p>
          <h1 className="math-title">{title}</h1>
          <p className="math-subtitle">Review module-level assessment completion, outcomes, and re-attempt history for this student.</p>
          {subtitle ? <p className="mt-2 text-sm font-bold text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Metric Label="Assigned Assessments" Value={CurrentStats.Total} Icon={<Layers3 size={15} />} />
          <Metric Label="Cleared" Value={CurrentStats.Cleared} Icon={<CheckCircle2 size={15} />} />
          <Metric Label="Pending" Value={CurrentStats.Pending} Icon={<CalendarClock size={15} />} />
          <Metric Label="Needs Re-Attempt" Value={CurrentStats.Reattempt} Icon={<AlertTriangle size={15} />} />
        </div>
      </div>

      <div className="mt-6 rounded-[30px] border border-slate-200 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="grid gap-3 xl:grid-cols-[1fr_190px_190px_210px]">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={SearchQuery} onChange={(Event) => SetSearchQuery(Event.target.value)} placeholder="Search Assessment Insights" />
          </div>
          <select className="math-input" value={ModuleFilter || "__CHOOSE__"} onChange={(Event) => { const Next = Event.target.value === "__CHOOSE__" ? "" : Event.target.value; SetModuleFilter(Next); SetLevelFilter(""); }} title="Choose Module" aria-label="Choose Module">
            <option value="__CHOOSE__" disabled>Choose Module</option>
            <option value="ALL">All Modules</option>
            {Modules.map(([Key, Label]) => <option key={Key} value={Key}>{Label}</option>)}
          </select>
          <select className="math-input" value={LevelFilter || "__CHOOSE__"} onChange={(Event) => SetLevelFilter(Event.target.value === "__CHOOSE__" ? "" : Event.target.value)} title="Choose Level" aria-label="Choose Level">
            <option value="__CHOOSE__" disabled>Choose Level</option>
            <option value="ALL">All Levels</option>
            {Levels.map(([Key, Label]) => <option key={Key} value={Key}>{Label}</option>)}
          </select>
          <select className="math-input" value={StatusFilter || "__CHOOSE__"} onChange={(Event) => SetStatusFilter(Event.target.value === "__CHOOSE__" ? "" : Event.target.value)} title="Choose Status" aria-label="Choose Status">
            <option value="__CHOOSE__" disabled>Choose Status</option>
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CLEARED">Cleared</option>
            <option value="NEEDS RE-ATTEMPT">Needs Re-Attempt</option>
            <option value="RE-ATTEMPT CLEARED">Re-Attempt Cleared</option>
          </select>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {Tabs.map(([Key, Label]) => (
            <button key={Key} className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${Tab === Key ? "is-active" : ""}`} aria-selected={Tab === Key} data-active={Tab === Key ? "true" : "false"} onClick={() => SetTab(Key)} title={`Open ${Label}`} aria-label={`Open ${Label}`}>
              {Label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {Tab === "overview" ? (
          <AssessmentOverview Rows={FilteredRows} onView={onView} />
        ) : null}

        {Tab === "insights" ? (
          <AssessmentInsights Groups={Groups} OpenModules={OpenModules} OpenLevels={OpenLevels} ToggleModule={ToggleModule} ToggleLevel={ToggleLevel} onView={onView} />
        ) : null}

        {Tab === "manage" && role === "admin" ? (
          <AssessmentManageRows Rows={FilteredRows} onView={onView} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />
        ) : null}
      </div>
    </div>
  );
}

function AssessmentOverview({ Rows, onView }: { Rows: AssessmentRow[]; onView?: (row: AssessmentRow) => void }) {
  const CurrentStats = Stats(Rows);
  const PriorityRows = Rows.filter((Row) => IsPending(Row) || NeedsReattempt(Row));
  const RecentRows = [...Rows].sort((First, Second) => RowTime(Second) - RowTime(First)).slice(0, 4);
  const Levels = new Set(Rows.map(LevelKey)).size;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="math-kicker">Assessment Control Summary</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Assessment Snapshot</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Review assigned assessments, completion dates, and assessment outcomes.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <OverviewStat Icon={<ClipboardList size={18} />} Label="Assigned Assessments" Value={CurrentStats.Total} Tone="blue" />
          <OverviewStat Icon={<CheckCircle2 size={18} />} Label="Cleared" Value={CurrentStats.Cleared} Tone="green" />
          <OverviewStat Icon={<AlertTriangle size={18} />} Label="Needs Re-Attempt" Value={CurrentStats.Reattempt} Tone={CurrentStats.Reattempt ? "red" : "green"} />
          <OverviewStat Icon={<Target size={18} />} Label="Levels Reviewed" Value={Levels} Tone="slate" />
        </div>
      </section>

      <section className="grid gap-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-700"><AlertTriangle size={20} /></div>
            <div>
              <p className="math-kicker">Priority Queue</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Assessment Action Queue</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">Pending assessments and re-attempt needs appear here.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {PriorityRows.length ? PriorityRows.slice(0, 4).map((Row, Index) => <AssessmentSignalRow key={`${Row.assignmentId || Row.assessmentAssignmentId || Index}`} Row={Row} onView={onView} />) : (
              <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4 text-emerald-800">
                <h4 className="font-black">No Follow-Up Needed</h4>
                <p className="mt-1 text-sm font-bold opacity-80">Visible assessment records are on track.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><CalendarClock size={20} /></div>
            <div>
              <p className="math-kicker">Recent Activity</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Recent Assessments</h3>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {RecentRows.length ? RecentRows.map((Row, Index) => <AssessmentSignalRow key={`${Row.assignmentId || Row.assessmentAssignmentId || Index}`} Row={Row} onView={onView} />) : <p className="rounded-[22px] bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">No Recent Assessment Found.</p>}
          </div>
        </section>
      </section>
    </div>
  );
}

function AssessmentSignalRow({ Row, onView }: { Row: AssessmentRow; onView?: (row: AssessmentRow) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-slate-100 bg-slate-50/75 p-4 dark:border-slate-800 dark:bg-slate-900/70 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-black text-slate-950 dark:text-white">{LevelCode(Row)} · {AssessmentTitle(Row)}</h4>
          <Chip tone={StatusTone(Row)}>{StatusLabel(Row)}</Chip>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">{AssessmentScopeCode(Row)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Chip tone={IsCleared(Row) ? "green" : NeedsReattempt(Row) ? "red" : "amber"}>{AccuracyText(Row)}</Chip>
        <ReviewButton onClick={onView ? () => onView(Row) : undefined} />
      </div>
    </div>
  );
}

function AssessmentInsights({ Groups, OpenModules, OpenLevels, ToggleModule, ToggleLevel, onView }: { Groups: ReturnType<typeof BuildModuleLevelGroups>; OpenModules: Record<string, boolean>; OpenLevels: Record<string, boolean>; ToggleModule: (key: string) => void; ToggleLevel: (key: string) => void; onView?: (row: AssessmentRow) => void }) {
  if (!Groups.length) return <EmptyState message="Assessment records will appear here once assigned." />;

  return (
    <div className="grid gap-5">
      {Groups.map((ModuleGroup) => {
        const IsModuleOpen = OpenModules[ModuleGroup.Key] ?? false;
        const ModuleRows = ModuleGroup.LevelGroups.flatMap((Level) => Level.Rows);
        return (
        <section key={ModuleGroup.Key} className="rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
          <button type="button" className="mb-4 flex w-full flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between" onClick={() => ToggleModule(ModuleGroup.Key)} aria-expanded={IsModuleOpen} title={IsModuleOpen ? "Collapse assessment module" : "Expand assessment module"}>
            <div>
              <p className="math-kicker">Assessment Module</p>
              <h3 className="text-xl font-black text-slate-950 dark:text-white">{ModuleLabel(ModuleGroup.Sample)}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="blue">{ModuleGroup.LevelGroups.length} Level(s)</Chip>
              <Chip tone="green">{ModuleRows.filter(IsCleared).length} Cleared</Chip>
              <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"><ChevronDown className={IsModuleOpen ? "rotate-180 transition" : "transition"} size={18} /></span>
            </div>
          </button>

          {IsModuleOpen ? <div className="grid gap-4">
            {ModuleGroup.LevelGroups.map((LevelGroup) => {
              const IsOpen = OpenLevels[LevelGroup.Key] ?? false;
              const GroupStats = Stats(LevelGroup.Rows);
              return (
                <div key={LevelGroup.Key} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <button type="button" className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between" onClick={() => ToggleLevel(LevelGroup.Key)} aria-expanded={IsOpen} title={IsOpen ? "Collapse assessment insight" : "Expand assessment insight"}>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">Level Assessment</p>
                      <h4 className="mt-1 text-lg font-black">{LevelLabel(LevelGroup.Sample)}</h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="blue">{LevelGroup.Rows.length} Assessment(s)</Chip>
                      <Chip tone="green">{GroupStats.Cleared} Cleared</Chip>
                      <Chip tone={GroupStats.Reattempt ? "red" : "green"}>{GroupStats.Reattempt} Needs Re-Attempt</Chip>
                      <Chip tone={AccuracyTone(GroupStats.Average)}>{GroupStats.Average}% Avg</Chip>
                      <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"><ChevronDown className={IsOpen ? "rotate-180 transition" : "transition"} size={18} /></span>
                    </div>
                  </button>
                  {IsOpen ? <AssessmentRecordTable Rows={LevelGroup.Rows} onView={onView} /> : null}
                </div>
              );
            })}
          </div> : null}
        </section>
      );})}
    </div>
  );
}

function AssessmentRecordTable({ Rows, onView }: { Rows: AssessmentRow[]; onView?: (row: AssessmentRow) => void }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 dark:border-slate-800">
      <div className="grid grid-cols-[1.25fr_.75fr_.8fr_.65fr_.65fr_.8fr_.95fr_120px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/70">
        <div>Assessment</div>
        <div>Attempt</div>
        <div>Status</div>
        <div>Score</div>
        <div>Accuracy</div>
        <div>Benchmark</div>
        <div>Completion Date</div>
        <div>Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {[...Rows].sort(CompareAssessmentRows).map((Row, Index) => (
          <div key={`${Row.assessmentAssignmentId || Row.assignmentId || Index}-${Row.attemptId || Index}`} className="grid grid-cols-[1.25fr_.75fr_.8fr_.65fr_.65fr_.8fr_.95fr_120px] items-center gap-3 px-4 py-4 text-sm">
            <div className="min-w-0">
              <p className="font-black text-slate-950 dark:text-white">{AssessmentTitle(Row)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{AssessmentScopeCode(Row)}</p>
            </div>
            <div><Chip tone={IsReattempt(Row) ? "amber" : "blue"}>{AttemptLabel(Row)}</Chip></div>
            <div><Chip tone={StatusTone(Row)}>{StatusLabel(Row)}</Chip></div>
            <div className="font-black">{ScoreText(Row)}</div>
            <div><Chip tone={Accuracy(Row) >= 70 ? "green" : HasResult(Row) ? "red" : "slate"}>{AccuracyText(Row)}</Chip></div>
            <div><Chip tone={IsCleared(Row) ? "green" : NeedsReattempt(Row) ? "red" : "amber"}>{BenchmarkText(Row)}</Chip></div>
            <div className="font-bold text-slate-600 dark:text-slate-300">{CompletionText(Row)}</div>
            <div className="flex justify-start"><ReviewButton onClick={onView && Row.attemptId ? () => onView(Row) : undefined} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentManageRows({ Rows, onView, onArchive, onRestore, onDelete }: { Rows: AssessmentRow[]; onView?: (row: AssessmentRow) => void; onArchive?: (row: AssessmentRow) => void; onRestore?: (row: AssessmentRow) => void; onDelete?: (row: AssessmentRow) => void }) {
  if (!Rows.length) return <EmptyState message="Assessment records will appear here once assigned." />;

  return (
    <div className="grid gap-3">
      {[...Rows].sort(CompareAssessmentRows).map((Row, Index) => {
        const Archived = Row.isActive === false;
        return (
          <div key={`${Row.assessmentAssignmentId || Row.assignmentId || Index}`} className="group flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-white/95 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/90 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-1 rounded-2xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"><ShieldCheck size={18} /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-black text-slate-950 dark:text-white">{AssessmentTitle(Row)}</h4>
                  <Chip tone={StatusTone(Row)}>{StatusLabel(Row)}</Chip>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500">{AssessmentScopeCode(Row)}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <ReviewButton onClick={onView ? () => onView(Row) : undefined} />
              {onArchive && !Archived ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  onClick={() => onArchive(Row)}
                  title="Archive assessment assignment"
                  aria-label="Archive assessment assignment"
                >
                  <Archive size={15} /> Archive
                </button>
              ) : null}
              {onRestore && Archived ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  onClick={() => onRestore(Row)}
                  title="Restore assessment assignment"
                  aria-label="Restore assessment assignment"
                >
                  <RotateCcw size={15} /> Restore
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                  onClick={() => onDelete(Row)}
                  title="Delete assessment assignment"
                  aria-label="Delete assessment assignment"
                >
                  <Trash2 size={15} /> Delete
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
