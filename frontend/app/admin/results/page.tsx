"use client";

import { AppShell } from "@/components/common/AppShell";
import { BenchmarkBadge } from "@/components/common/BenchmarkBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { SortableHeader } from "@/components/common/SortableHeader";
import { StatePill } from "@/components/common/DetailWorkspaceViews";
import { InlineError } from "@/components/payments/PaymentsUi";
import { PerformanceOverview } from "@/components/admin/PerformanceOverview";
import { StudentPicker } from "@/components/admin/StudentPicker";
import { StudentSummary } from "@/components/admin/StudentSummary";
import {
  LEARNING_PERIODS,
  LEARNING_VIEWS,
  LearningBreadcrumb,
  LearningContentTable,
  LearningDpsStudentsTable,
  LearningStudentsTable,
  LearningTeachersTable,
  LearningViewBar,
  PeriodLabel,
} from "@/components/admin/LearningViews";
import type { LearningContentRow, LearningRollup, LearningStudentRow, LearningTeacherRow, OverviewPeriod } from "@/lib/api/admin";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useUrlParamState, useUrlTabState } from "@/hooks/useUrlTabState";
import { apiErrorMessage } from "@/lib/api";
import {
  downloadAdminLearningPerformanceReport,
  downloadAdminStudentReport,
  getAdminLearningPerformance,
  getAdminLearningRollup,
  getAdminStudents,
  getAdminTeachers,
  getDpsByLesson,
  getLessons,
  getLevels,
  getModules,
  getStudentReport,
} from "@/lib/api/admin";
import { formatMathPathDateTime, formatMathPathDate } from "@/lib/date";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import type {
  DpsItem,
  LessonItem,
  LevelItem,
  ModuleItem,
} from "@/types/curriculum";
import type { AdminStudent } from "@/types/student";
import type { AdminTeacher } from "@/types/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpCircle,
  BarChart3,
  BookText,
  Boxes,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  Eye,
  FileClock,
  FileSpreadsheet,
  Filter,
  Gauge,
  GraduationCap,
  History,
  Layers3,
  Route,
  Search,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type AnyRecord = Record<string, unknown>;
type ResultsMode = "OVERVIEW" | "LEARNING" | "STUDENT";
type LearningSortKey =
  | "student"
  | "teacher"
  | "scope"
  | "status"
  | "score"
  | "accuracy"
  | "benchmark"
  | "completedDate"
  | "timeTaken";
type StudentAttemptSortKey =
  | "scope"
  | "teacher"
  | "status"
  | "score"
  | "accuracy"
  | "benchmark"
  | "completedDate"
  | "timeTaken";
type DpsHistorySortKey =
  | "dps"
  | "teacher"
  | "attempt"
  | "status"
  | "score"
  | "accuracy"
  | "benchmark"
  | "completedDate"
  | "timeTaken";
type AssessmentHistorySortKey =
  | "assessment"
  | "attempt"
  | "status"
  | "score"
  | "accuracy"
  | "completedDate"
  | "timeTaken";
type PromotionHistorySortKey =
  | "fromLevel"
  | "toLevel"
  | "assessment"
  | "score"
  | "percentage"
  | "status"
  | "promotionDate"
  | "promotedBy";
type SortDirection = "asc" | "desc";
type StudentHistoryDetailTab = "SUMMARY" | "CURRENT" | "DPS" | "ASSESSMENT" | "PROMOTION";

const LEARNING_SORT_FIELDS: { Key: LearningSortKey; Label: string }[] = [
  { Key: "student", Label: "Student" },
  { Key: "teacher", Label: "Teacher" },
  { Key: "scope", Label: "Scope" },
  { Key: "status", Label: "Status" },
  { Key: "score", Label: "Score" },
  { Key: "accuracy", Label: "Accuracy" },
  { Key: "completedDate", Label: "Completed Date" },
  { Key: "timeTaken", Label: "Time Taken" },
];

const STUDENT_ATTEMPT_SORT_FIELDS: { Key: StudentAttemptSortKey; Label: string }[] = [
  { Key: "scope", Label: "Scope" },
  { Key: "teacher", Label: "Teacher" },
  { Key: "status", Label: "Status" },
  { Key: "score", Label: "Score" },
  { Key: "accuracy", Label: "Accuracy" },
  { Key: "benchmark", Label: "Benchmark" },
  { Key: "completedDate", Label: "Completed Date" },
  { Key: "timeTaken", Label: "Time Taken" },
];

const DPS_HISTORY_SORT_FIELDS: { Key: DpsHistorySortKey; Label: string }[] = [
  { Key: "dps", Label: "DPS" },
  { Key: "teacher", Label: "Teacher" },
  { Key: "attempt", Label: "Attempt" },
  { Key: "status", Label: "Status" },
  { Key: "score", Label: "Score" },
  { Key: "accuracy", Label: "Accuracy" },
  { Key: "benchmark", Label: "Benchmark" },
  { Key: "completedDate", Label: "Completed Date" },
  { Key: "timeTaken", Label: "Time Taken" },
];

const ASSESSMENT_HISTORY_SORT_FIELDS: { Key: AssessmentHistorySortKey; Label: string }[] = [
  { Key: "assessment", Label: "Assessment" },
  { Key: "attempt", Label: "Attempt" },
  { Key: "status", Label: "Status" },
  { Key: "score", Label: "Score" },
  { Key: "accuracy", Label: "Accuracy" },
  { Key: "completedDate", Label: "Completed Date" },
  { Key: "timeTaken", Label: "Time Taken" },
];

const PROMOTION_HISTORY_SORT_FIELDS: { Key: PromotionHistorySortKey; Label: string }[] = [
  { Key: "fromLevel", Label: "From Level" },
  { Key: "toLevel", Label: "To Level" },
  { Key: "assessment", Label: "Assessment" },
  { Key: "score", Label: "Score" },
  { Key: "percentage", Label: "Percentage" },
  { Key: "status", Label: "Status" },
  { Key: "promotionDate", Label: "Promotion Date" },
  { Key: "promotedBy", Label: "Promoted By" },
];

const AllValue = "__ALL__";
const CompletedStatuses = new Set(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]);

function IsRecord(Value: unknown): Value is AnyRecord {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

function AsArray(Value: unknown): AnyRecord[] {
  if (!Array.isArray(Value)) return [];
  return Value.filter(IsRecord);
}

function NumberValue(Value: unknown, Fallback = 0) {
  const Parsed = Number(Value);
  return Number.isFinite(Parsed) ? Parsed : Fallback;
}

function PickFirstNumber(
  RecordValue: AnyRecord | undefined | null,
  Keys: string[],
  Fallback = 0,
) {
  if (!RecordValue) return Fallback;
  for (const Key of Keys) {
    const Value = RecordValue[Key];
    if (Value !== undefined && Value !== null && Value !== "")
      return NumberValue(Value, Fallback);
  }
  return Fallback;
}

function PickFirstString(
  RecordValue: AnyRecord | undefined | null,
  Keys: string[],
  Fallback = "-",
) {
  if (!RecordValue) return Fallback;
  for (const Key of Keys) {
    const Value = RecordValue[Key];
    if (Value !== undefined && Value !== null && String(Value).trim())
      return String(Value);
  }
  return Fallback;
}

function FormatDate(Value: unknown) {
  if (!Value || Value === "-") return "—";
  return formatMathPathDateTime(String(Value));
}

function FormatDateOnly(Value: unknown) {
  if (!Value || Value === "-") return "—";
  return formatMathPathDate(String(Value));
}

function FormatTimeTaken(Value: unknown) {
  const TotalSeconds = NumberValue(Value, Number.NaN);
  if (!Number.isFinite(TotalSeconds)) return "—";
  const RoundedSeconds = Math.max(0, Math.round(TotalSeconds));
  if (RoundedSeconds < 60) return `${RoundedSeconds} Sec`;
  const Minutes = Math.floor(RoundedSeconds / 60);
  const Seconds = RoundedSeconds % 60;
  return Seconds
    ? `${Minutes} Min ${String(Seconds).padStart(2, "0")} Sec`
    : `${Minutes} Min`;
}

function NormalizeSortValue(Value: unknown): string | number {
  if (Value === null || Value === undefined) return "";
  if (typeof Value === "number") return Value;
  const Text = String(Value).trim();
  const DateValue = Date.parse(Text);
  if (Text && !Number.isNaN(DateValue) && /\d{4}|\d{1,2}\/\d{1,2}/.test(Text))
    return DateValue;
  return Text.toLowerCase();
}

function CompareSortValues(FirstValue: unknown, SecondValue: unknown) {
  const First = NormalizeSortValue(FirstValue);
  const Second = NormalizeSortValue(SecondValue);
  if (typeof First === "number" && typeof Second === "number")
    return First - Second;
  return String(First).localeCompare(String(Second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function SortDirectionFor<Key extends string>(
  Key: Key,
  ActiveKey: Key,
  Direction: SortDirection,
  DefaultKey: Key,
  DefaultDirection: SortDirection,
): { Key: Key; Direction: SortDirection } {
  if (ActiveKey !== Key) return { Key, Direction: "asc" };
  if (Direction === "asc") return { Key, Direction: "desc" };
  return { Key: DefaultKey, Direction: DefaultDirection };
}

// 2026-08-12: "Sort by" dropdown paired with the existing header-arrow
// SortableHeader cycle on every table in this file. This page's tables reset
// their 3rd click to a named default column+direction (not a raw "natural
// order" sentinel), unlike lib/sortable.ts's shared engine used elsewhere --
// so this stays a small local component matching that existing model rather
// than being force-fit onto the shared one.
function ResultsSortDropdown<Key extends string>({
  Fields,
  SortKey,
  SortDirectionValue,
  OnSelectField,
  OnToggleDirection,
  ClassName = "",
}: {
  Fields: { Key: Key; Label: string }[];
  SortKey: Key;
  SortDirectionValue: SortDirection;
  OnSelectField: (Key: Key) => void;
  OnToggleDirection: () => void;
  ClassName?: string;
}) {
  // 2026-08-13: fixed "Sort By" trigger label + plain option text (no
  // "Sort by ..." prefix), matching the shared components/common/
  // SortByDropdown.tsx used elsewhere in the app.
  const [Open, SetOpen] = useState(false);
  const ContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!Open) return;
    function HandlePointerDown(Event: MouseEvent) {
      if (ContainerRef.current && !ContainerRef.current.contains(Event.target as Node)) {
        SetOpen(false);
      }
    }
    function HandleKeyDown(Event: KeyboardEvent) {
      if (Event.key === "Escape") SetOpen(false);
    }
    document.addEventListener("mousedown", HandlePointerDown);
    document.addEventListener("keydown", HandleKeyDown);
    return () => {
      document.removeEventListener("mousedown", HandlePointerDown);
      document.removeEventListener("keydown", HandleKeyDown);
    };
  }, [Open]);

  return (
    <div ref={ContainerRef} className={`flex items-stretch gap-2 ${ClassName}`}>
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => SetOpen((Current) => !Current)}
          className="math-select flex w-full items-center justify-between gap-2"
          aria-haspopup="listbox"
          aria-expanded={Open}
        >
          <span>Sort By</span>
          <ChevronDown size={16} className={`shrink-0 transition ${Open ? "rotate-180" : ""}`} />
        </button>
        {Open ? (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {Fields.map((Field) => {
              const Active = SortKey === Field.Key;
              return (
                <li key={Field.Key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={Active}
                    onClick={() => {
                      OnSelectField(Field.Key);
                      SetOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-sm font-bold transition ${
                      Active
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {Field.Label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        onClick={OnToggleDirection}
        title={SortDirectionValue === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
        aria-label={SortDirectionValue === "asc" ? "Sort ascending" : "Sort descending"}
        className="math-select inline-flex w-11 shrink-0 items-center justify-center px-0"
      >
        {SortDirectionValue === "asc" ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
      </button>
    </div>
  );
}

function FilterSearchRows(Rows: AnyRecord[], SearchText: string) {
  const Query = SearchText.trim().toLowerCase();
  if (!Query) return Rows;
  return Rows.filter((Row) =>
    JSON.stringify(Row).toLowerCase().includes(Query),
  );
}

function RowPercent(Row: AnyRecord) {
  const Accuracy = PickFirstNumber(
    Row,
    ["accuracy", "accuracyPercentage"],
    Number.NaN,
  );
  if (Number.isFinite(Accuracy)) return Accuracy;
  const Score = PickFirstNumber(Row, ["score", "totalScore"], Number.NaN);
  const MaxScore = PickFirstNumber(
    Row,
    ["maxScore", "maximumScore", "totalMarks"],
    Number.NaN,
  );
  if (Number.isFinite(Score) && Number.isFinite(MaxScore) && MaxScore > 0)
    return (Score / MaxScore) * 100;
  return Number.NaN;
}

function IsBenchmarkMetAttempt(Row: AnyRecord) {
  const BenchmarkStatus = PickFirstString(
    Row,
    ["benchmarkStatus", "benchmark"],
    "",
  ).toUpperCase();
  if (
    BenchmarkStatus.includes("MET") ||
    BenchmarkStatus.includes("CLEARED") ||
    BenchmarkStatus.includes("PASS")
  )
    return true;
  if (
    BenchmarkStatus.includes("NEEDS") ||
    BenchmarkStatus.includes("BELOW") ||
    BenchmarkStatus.includes("FAIL")
  )
    return false;
  const Percent = RowPercent(Row);
  return Number.isFinite(Percent) ? Percent >= 70 : false;
}

function IsCompletedAttempt(Row: AnyRecord) {
  const Status = PickFirstString(
    Row,
    ["status", "attemptStatus"],
    "",
  ).toUpperCase();
  if (
    CompletedStatuses.has(Status) ||
    Status.includes("SUBMITTED") ||
    Status.includes("COMPLETED") ||
    Status.includes("CLEARED")
  )
    return true;
  return (
    PickFirstString(
      Row,
      ["completedDate", "submittedAt", "attemptDate"],
      "",
    ) !== ""
  );
}

function IsReAttemptRow(Row: AnyRecord) {
  const AttemptText = PickFirstString(
    Row,
    [
      "attempt",
      "attemptType",
      "attemptLabel",
      "attemptName",
      "status",
      "displayStatus",
    ],
    "",
  ).toUpperCase();
  const AttemptNumber = PickFirstNumber(
    Row,
    [
      "__attemptSequence",
      "attemptNumber",
      "attemptNo",
      "attemptSequence",
      "sequence",
      "reattemptNumber",
      "reAttemptNumber",
    ],
    1,
  );
  const ExplicitFlag =
    String(
      Row.__isReattemptDisplay ?? Row.isReattempt ?? Row.isReAttempt ?? "false",
    ).toLowerCase() === "true";
  return (
    ExplicitFlag ||
    AttemptNumber > 1 ||
    AttemptText.includes("RE-ATTEMPT") ||
    AttemptText.includes("REATTEMPT") ||
    AttemptText.includes("RE ATTEMPT")
  );
}

function AttemptDisplayStatus(Row: AnyRecord) {
  // 2026-10-13: the server's shared DPS state names this attempt (current
  // step, or history such as "Below Benchmark").
  if (typeof Row.chainRowLabel === "string" && Row.chainRowLabel) return Row.chainRowLabel;
  const ExplicitDisplayStatus = PickFirstString(
    Row,
    ["__displayStatus", "displayStatus", "attemptDisplayStatus"],
    "",
  );
  if (ExplicitDisplayStatus && ExplicitDisplayStatus !== "-")
    return ExplicitDisplayStatus;
  if (!IsCompletedAttempt(Row))
    return IsReAttemptRow(Row) ? "Re-Attempt Pending" : "Pending";
  const BenchmarkMet = IsBenchmarkMetAttempt(Row);
  if (IsReAttemptRow(Row))
    return BenchmarkMet ? "Re-Attempt Cleared" : "Needs Re-Attempt";
  return BenchmarkMet ? "Cleared" : "Needs Re-Attempt";
}

function CurrentStateKey(Row: AnyRecord) {
  return [
    PickFirstString(Row, ["studentId", "studentCode"], "student"),
    PickFirstString(Row, ["moduleId", "moduleCode"], "module"),
    PickFirstString(Row, ["levelId", "levelCode"], "level"),
    PickFirstString(Row, ["lessonId", "lessonNumber"], "lesson"),
    PickFirstString(Row, ["dpsId", "dpsNumber"], "dps"),
  ].join("|");
}

function AttemptSortTime(Row: AnyRecord) {
  const DateText = PickFirstString(
    Row,
    ["completedDate", "submittedAt", "attemptDate", "startedAt"],
    "",
  );
  const DateValue = Date.parse(DateText);
  return Number.isNaN(DateValue) ? 0 : DateValue;
}

function BuildCurrentAttemptGroups(Rows: AnyRecord[]) {
  const Groups = new Map<string, AnyRecord[]>();
  Rows.forEach((Row) => {
    const Key = CurrentStateKey(Row);
    if (!Groups.has(Key)) Groups.set(Key, []);
    Groups.get(Key)!.push(Row);
  });
  return Array.from(Groups.values()).map((GroupRows) => {
    const SortedRows = GroupRows.slice().sort(
      (A, B) => AttemptSortTime(B) - AttemptSortTime(A),
    );
    const ChainCurrent = SortedRows.find((Row) => (Row as any).isCurrentChainRow === true);
    const ResolvedRow = ChainCurrent || SortedRows.find(IsBenchmarkMetAttempt) || SortedRows[0];
    const ChainRow = SortedRows.find((Row) => (Row as any).dpsChain && (Row as any).dpsChain.bucket) as any;
    return {
      Rows: GroupRows,
      CurrentRow: ResolvedRow,
      Bucket: ChainRow ? String(ChainRow.dpsChain.bucket) : null,
      Status: ChainRow ? String(ChainRow.dpsChain.label) : AttemptDisplayStatus(ResolvedRow),
    };
  });
}

function BuildDisplayAttemptRows(Rows: AnyRecord[]) {
  const MetaByAttemptId = new Map<
    string,
    { AttemptSequence: number; IsReattempt: boolean; DisplayStatus: string }
  >();
  const Groups = new Map<string, AnyRecord[]>();
  Rows.forEach((Row, Index) => {
    const Key = CurrentStateKey(Row);
    if (!Groups.has(Key)) Groups.set(Key, []);
    Groups.get(Key)!.push({ ...Row, __sourceIndex: Index });
  });

  Groups.forEach((GroupRows) => {
    GroupRows.slice()
      .sort((A, B) => {
        const TimeDifference = AttemptSortTime(A) - AttemptSortTime(B);
        if (TimeDifference !== 0) return TimeDifference;
        return (
          PickFirstNumber(A, ["__sourceIndex"], 0) -
          PickFirstNumber(B, ["__sourceIndex"], 0)
        );
      })
      .forEach((Row, Index) => {
        const AttemptSequence = Index + 1;
        const IsReattempt = AttemptSequence > 1;
        const BenchmarkMet = IsBenchmarkMetAttempt(Row);
        const Completed = IsCompletedAttempt(Row);
        const DisplayStatus = !Completed
          ? IsReattempt
            ? "Re-Attempt Pending"
            : "Pending"
          : IsReattempt
            ? BenchmarkMet
              ? "Re-Attempt Cleared"
              : "Needs Re-Attempt"
            : BenchmarkMet
              ? "Cleared"
              : "Needs Re-Attempt";
        MetaByAttemptId.set(
          PickFirstString(
            Row,
            ["attemptId"],
            `${CurrentStateKey(Row)}-${Index}`,
          ),
          {
            AttemptSequence,
            IsReattempt,
            DisplayStatus,
          },
        );
      });
  });

  return Rows.map((Row, Index) => {
    const AttemptId = PickFirstString(
      Row,
      ["attemptId"],
      `${CurrentStateKey(Row)}-${Index}`,
    );
    const Meta = MetaByAttemptId.get(AttemptId);
    if (!Meta) return Row;
    return {
      ...Row,
      __attemptSequence: Meta.AttemptSequence,
      __isReattemptDisplay: Meta.IsReattempt,
      __displayStatus: Meta.DisplayStatus,
    };
  });
}

function CurrentBenchmarkMetCount(Rows: AnyRecord[]) {
  return BuildCurrentAttemptGroups(Rows).filter((Group) =>
    Group.Bucket ? Group.Bucket === "CLEARED" : IsBenchmarkMetAttempt(Group.CurrentRow),
  ).length;
}

function CurrentNeedsReAttemptCount(Rows: AnyRecord[]) {
  return BuildCurrentAttemptGroups(Rows).filter(
    (Group) =>
      Group.Bucket
        ? Group.Bucket === "NEEDS_REATTEMPT"
        : !IsBenchmarkMetAttempt(Group.CurrentRow) && IsCompletedAttempt(Group.CurrentRow),
  ).length;
}

function VisibleAttemptAverageAccuracy(Rows: AnyRecord[]): number | null {
  const Percentages = Rows.map(RowPercent).filter((Value) =>
    Number.isFinite(Value),
  );
  if (!Percentages.length) return null;
  return Math.round(
    Percentages.reduce((Total, Value) => Total + Value, 0) / Percentages.length,
  );
}

function FormatAccuracyOrDash(Value: number | null | undefined) {
  return typeof Value === "number" && Number.isFinite(Value) ? `${Value}%` : "—";
}


function NormalizeScopeValue(Value: unknown) {
  return String(Value ?? "")
    .trim()
    .toLowerCase();
}

function ScopeValueMatches(FirstValue: unknown, SecondValue: unknown) {
  const First = NormalizeScopeValue(FirstValue);
  const Second = NormalizeScopeValue(SecondValue);
  return Boolean(First && Second && First === Second);
}

function RowMatchesLevelScope(Row: AnyRecord, LevelRow: AnyRecord) {
  const LevelId = PickFirstString(LevelRow, ["levelId"], "");
  const LevelCode = PickFirstString(LevelRow, ["levelCode"], "");
  return (
    ScopeValueMatches(PickFirstString(Row, ["levelId"], ""), LevelId) ||
    ScopeValueMatches(PickFirstString(Row, ["levelCode"], ""), LevelCode)
  );
}

function CurrentClearedDpsCountForLevel(
  AttemptRows: AnyRecord[],
  LevelRow: AnyRecord,
) {
  const LevelAttemptRows = AttemptRows.filter((Row) =>
    RowMatchesLevelScope(Row, LevelRow),
  );
  return BuildCurrentAttemptGroups(LevelAttemptRows).filter((Group) =>
    Group.Bucket ? Group.Bucket === "CLEARED" : IsBenchmarkMetAttempt(Group.CurrentRow),
  ).length;
}

function BuildCurrentLevelTrackerRow(
  LevelRow: AnyRecord,
  AttemptRows: AnyRecord[],
) {
  const CompletedDps = CurrentClearedDpsCountForLevel(AttemptRows, LevelRow);
  return {
    ...LevelRow,
    completedDps: CompletedDps,
    passedDps: CompletedDps,
  };
}

function RowPromotionStatus(Row: AnyRecord) {
  const Explicit = PickFirstString(
    Row,
    [
      "promotionStatus",
      "progressionStatus",
      "promotionStatusLabel",
      "progressionStatusLabel",
    ],
    "",
  ).toUpperCase();
  const IsPromoted =
    String(Row.isPromoted ?? Row.promoted ?? "false").toLowerCase() === "true";
  const IsReady =
    String(
      Row.isReadyForNextLevel ??
        Row.readyForNextLevel ??
        Row.promotionAvailable ??
        "false",
    ).toLowerCase() === "true";
  if (IsPromoted || Explicit.includes("PROMOTED")) return "Promoted";
  if (IsReady || Explicit.includes("AVAILABLE") || Explicit.includes("READY"))
    return "Available";
  return "Not Available";
}

function CurrentPromotionReadyCount(Rows: AnyRecord[]) {
  const CurrentRows = BuildCurrentAttemptGroups(Rows).map(
    (Group) => Group.CurrentRow,
  );
  return CurrentRows.filter((Row) => RowPromotionStatus(Row) === "Available")
    .length;
}

function ViewerTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function ViewerTimezoneOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function SafeSlug(Value: string) {
  return (
    Value.replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "Report"
  );
}

function SafeLevelSlug(Value: string) {
  return (
    Value.replace(/[^a-zA-Z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "Level"
  );
}

function TodayLabel() {
  return new Date()
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(/ /g, "-");
}

function DownloadBlob(BlobValue: Blob, FileName: string) {
  const Url = URL.createObjectURL(BlobValue);
  const Link = document.createElement("a");
  Link.href = Url;
  Link.download = FileName;
  document.body.appendChild(Link);
  Link.click();
  Link.remove();
  URL.revokeObjectURL(Url);
}

function IdForApi(Value: string) {
  return Value && Value !== AllValue ? Value : undefined;
}

const RESULTS_TABS = ["overview", "learning", "student"] as const;

// 2026-10-21 (Performance Reports, Part 1): the sub-tab and every filter live
// in the page address (?tab=&teacher=&module=...), so a refresh, back/forward
// and a copied link open exactly the same report.
export default function AdminResultsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading report data..." />}>
      <AdminResultsPageInner />
    </Suspense>
  );
}

function AdminResultsPageInner() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();

  const ResultsStateKey = CreatePersistedUiStateKey("admin", "performance-reports");
  const [ModeTab, SetModeTab] = useUrlTabState("tab", RESULTS_TABS, "overview");
  const Mode: ResultsMode = ModeTab === "student" ? "STUDENT" : ModeTab === "learning" ? "LEARNING" : "OVERVIEW";
  const SetMode = (Next: ResultsMode) => SetModeTab(Next === "STUDENT" ? "student" : Next === "LEARNING" ? "learning" : "overview");
  // one period for the Overview and Learning Performance (Learning also has All Time)
  const [PeriodValue, SetPeriodValue] = useUrlTabState("period", LEARNING_PERIODS, "30d");
  const OverviewPeriodValue: OverviewPeriod = PeriodValue === "all" ? "30d" : PeriodValue;
  const SetOverviewPeriod = (Next: OverviewPeriod) => SetPeriodValue(Next);
  // 2026-10-21 (Part 3): Learning Performance's view; the drill-down first
  const [LearningViewValue, SetLearningView] = useUrlTabState("lp", LEARNING_VIEWS, "content");
  const [SelectedTeacherId, SetSelectedTeacherId] = useUrlParamState("teacher", "");
  const [SelectedStudentId, SetSelectedStudentId] = useUrlParamState("student", "");
  const [SelectedModuleId, SetSelectedModuleId] = useUrlParamState("module", "");
  const [SelectedLevelId, SetSelectedLevelId] = useUrlParamState("level", "");
  const [SelectedLessonId, SetSelectedLessonId] = useUrlParamState("lesson", "");
  const [SelectedDpsId, SetSelectedDpsId] = useUrlParamState("dps", "");
  const [SearchText, SetSearchText] = useUrlParamState("q", "");
  const [ExportError, SetExportError] = useState<unknown>(null);
  const [LearningSortKeyValue, SetLearningSortKeyValue] =
    usePersistentUiState<LearningSortKey>(CreatePersistedUiStateKey(ResultsStateKey, "learning-sort-key"), "completedDate");
  const [StudentSortKeyValue, SetStudentSortKeyValue] =
    usePersistentUiState<StudentAttemptSortKey>(CreatePersistedUiStateKey(ResultsStateKey, "student-sort-key"), "completedDate");
  const [SortDirectionValue, SetSortDirectionValue] =
    usePersistentUiState<SortDirection>(CreatePersistedUiStateKey(ResultsStateKey, "sort-direction"), "desc");
  const [ExportingMode, SetExportingMode] = useState<ResultsMode | null>(null);

  const TeachersQuery = useQuery({
    queryKey: ["admin-results-teachers"],
    queryFn: getAdminTeachers,
    enabled: Ready,
  });
  const StudentsQuery = useQuery({
    queryKey: ["admin-results-students"],
    queryFn: getAdminStudents,
    enabled: Ready,
  });
  const ModulesQuery = useQuery({
    queryKey: ["admin-results-modules"],
    queryFn: getModules,
    enabled: Ready,
  });
  const LevelsQuery = useQuery({
    queryKey: ["admin-results-levels", SelectedModuleId],
    queryFn: () => getLevels(SelectedModuleId),
    enabled:
      Ready && Boolean(SelectedModuleId) && SelectedModuleId !== AllValue,
  });
  const LessonsQuery = useQuery({
    queryKey: ["admin-results-lessons", SelectedLevelId],
    queryFn: () => getLessons(SelectedLevelId),
    enabled: Ready && Boolean(SelectedLevelId) && SelectedLevelId !== AllValue,
  });
  const DpsQuery = useQuery({
    queryKey: ["admin-results-dps", SelectedLessonId],
    queryFn: () => getDpsByLesson(SelectedLessonId),
    enabled:
      Ready && Boolean(SelectedLessonId) && SelectedLessonId !== AllValue,
  });

  const LearningPerformanceQuery = useQuery({
    queryKey: [
      "admin-learning-performance",
      SelectedTeacherId,
      SelectedModuleId,
      SelectedLevelId,
      SelectedLessonId,
      SelectedDpsId,
      PeriodValue,
    ],
    queryFn: () =>
      getAdminLearningPerformance({
        teacherId: IdForApi(SelectedTeacherId),
        moduleId: IdForApi(SelectedModuleId),
        levelId: IdForApi(SelectedLevelId),
        lessonId: IdForApi(SelectedLessonId),
        dpsId: IdForApi(SelectedDpsId),
        period: PeriodValue,
      }),
    enabled: Ready && Mode === "LEARNING" && LearningViewValue === "attempts",
  });

  const LearningRollupQuery = useQuery({
    queryKey: [
      "admin-learning-rollup",
      LearningViewValue,
      PeriodValue,
      SelectedTeacherId,
      SelectedModuleId,
      SelectedLevelId,
      SelectedLessonId,
      SelectedDpsId,
    ],
    queryFn: () =>
      getAdminLearningRollup({
        view: LearningViewValue,
        period: PeriodValue,
        teacherId: IdForApi(SelectedTeacherId),
        moduleId: IdForApi(SelectedModuleId),
        levelId: IdForApi(SelectedLevelId),
        lessonId: IdForApi(SelectedLessonId),
        dpsId: IdForApi(SelectedDpsId),
      }),
    enabled: Ready && Mode === "LEARNING" && LearningViewValue !== "attempts",
    placeholderData: (Previous) => Previous,
  });

  const StudentReportQuery = useQuery({
    queryKey: [
      "admin-results-student-report",
      SelectedStudentId,
      SelectedModuleId,
      SelectedLevelId,
      SelectedLessonId,
      SelectedDpsId,
    ],
    queryFn: () =>
      getStudentReport({
        studentId: SelectedStudentId,
        moduleId: IdForApi(SelectedModuleId),
        levelId: IdForApi(SelectedLevelId),
        lessonId: IdForApi(SelectedLessonId),
        dpsId: IdForApi(SelectedDpsId),
      }),
    enabled:
      Ready &&
      Mode === "STUDENT" &&
      Boolean(SelectedStudentId) &&
      SelectedStudentId !== AllValue,
  });

  const ReportStudents = useMemo(
    () => StudentsQuery.data ?? [],
    [StudentsQuery.data],
  );
  // 2026-10-21 (Part 4): a picker you can type into
  const PickerStudents = useMemo(
    () =>
      ReportStudents.filter((Student: AdminStudent) => Student.isActive !== false || Student.studentId === SelectedStudentId)
        .map((Student: AdminStudent) => ({
          studentId: Student.studentId,
          name: Student.studentName || Student.fullName,
          code: Student.studentCode,
          teacher: Student.teacherName || Student.teacher,
          level: Student.currentLevelCode,
        }))
        .sort((First, Second) => First.name.localeCompare(Second.name)),
    [ReportStudents, SelectedStudentId],
  );

  // A narrower filter is cleared when a wider one changes -- but not when the
  // page opens from an address that already holds them all.
  const PreviousScope = useRef({ Module: SelectedModuleId, Level: SelectedLevelId, Lesson: SelectedLessonId, Student: SelectedStudentId });
  useEffect(() => {
    if (PreviousScope.current.Module === SelectedModuleId) return;
    PreviousScope.current.Module = SelectedModuleId;
    SetSelectedLevelId("");
    SetSelectedLessonId("");
    SetSelectedDpsId("");
  }, [SelectedModuleId]);

  useEffect(() => {
    if (PreviousScope.current.Level === SelectedLevelId) return;
    PreviousScope.current.Level = SelectedLevelId;
    SetSelectedLessonId("");
    SetSelectedDpsId("");
  }, [SelectedLevelId]);

  useEffect(() => {
    if (PreviousScope.current.Lesson === SelectedLessonId) return;
    PreviousScope.current.Lesson = SelectedLessonId;
    SetSelectedDpsId("");
  }, [SelectedLessonId]);

  // Choosing a student opens their current module (the admin can then pick
  // another one); a module already in the address is kept.
  useEffect(() => {
    if (Mode !== "STUDENT") return;
    if (!SelectedStudentId || SelectedStudentId === AllValue) return;
    const Student = StudentsQuery.data?.find(
      (Item) => Item.studentId === SelectedStudentId,
    );
    if (!Student) return;
    const Changed = PreviousScope.current.Student !== SelectedStudentId;
    PreviousScope.current.Student = SelectedStudentId;
    if (!Changed && SelectedModuleId) return;
    const StudentModuleId = Student.currentModuleId || "";
    if (StudentModuleId !== SelectedModuleId) {
      SetSelectedModuleId(StudentModuleId);
    }
  }, [Mode, SelectedStudentId, StudentsQuery.data]);

  const SelectedTeacher = TeachersQuery.data?.find(
    (Teacher) => Teacher.teacherId === SelectedTeacherId,
  );
  const SelectedStudent = StudentsQuery.data?.find(
    (Student) => Student.studentId === SelectedStudentId,
  );
  const SelectedModule = ModulesQuery.data?.find(
    (Item) => Item.moduleId === SelectedModuleId,
  );
  const SelectedLevel = LevelsQuery.data?.find(
    (Item) => Item.levelId === SelectedLevelId,
  );
  const SelectedLesson = LessonsQuery.data?.find(
    (Item) => Item.lessonId === SelectedLessonId,
  );
  const SelectedDps = DpsQuery.data?.find(
    (Item) => Item.dpsId === SelectedDpsId,
  );

  const RawLearningData = LearningPerformanceQuery.data as
    | AnyRecord
    | undefined;
  const LearningRows = useMemo(
    () => AsArray(RawLearningData?.results),
    [RawLearningData],
  );
  const RollupData = LearningRollupQuery.data as LearningRollup | undefined;
  const LearningSummary =
    ((LearningViewValue === "attempts" ? RawLearningData?.summary : RollupData?.summary) as AnyRecord | undefined) ?? {};
  const LearningHasPractice = PickFirstNumber(LearningSummary, ["completedAttempts"], 0) > 0;
  const RollupStudentRows = useMemo(() => {
    if (!RollupData || RollupData.view !== "students") return RollupData;
    const Query = SearchText.trim().toLowerCase();
    if (!Query) return RollupData;
    return { ...RollupData, rows: (RollupData.rows as LearningStudentRow[]).filter((Row) => `${Row.studentName ?? ""} ${Row.studentCode ?? ""} ${Row.teacherName ?? ""}`.toLowerCase().includes(Query)) };
  }, [RollupData, SearchText]);

  const RawStudentData = StudentReportQuery.data as AnyRecord | undefined;
  const StudentSummary =
    (RawStudentData?.summary as AnyRecord | undefined) ?? {};
  const StudentLevelRows = useMemo(
    () => AsArray(RawStudentData?.levelProgress),
    [RawStudentData],
  );
  const StudentDpsAttempts = useMemo(
    () => AsArray(RawStudentData?.dpsAttempts),
    [RawStudentData],
  );
  const StudentAssessmentRows = useMemo(
    () => AsArray(RawStudentData?.assessmentHistory),
    [RawStudentData],
  );
  const StudentPromotionRows = useMemo(
    () => AsArray(RawStudentData?.promotionHistory),
    [RawStudentData],
  );

  // the journey (levels and promotions) is always the module's, from the same payload
  const StudentJourneyLevelRows = StudentLevelRows;
  const StudentJourneyPromotionRows = StudentPromotionRows;

  const FilteredLearningRows = useMemo(() => {
    const FilteredRows = FilterSearchRows(LearningRows, SearchText);
    return FilteredRows.slice().sort((First, Second) => {
      const ValueFor = (Row: AnyRecord) => {
        if (LearningSortKeyValue === "student")
          return `${PickFirstString(Row, ["studentName"], "")} ${PickFirstString(Row, ["studentCode"], "")}`;
        if (LearningSortKeyValue === "teacher")
          return `${PickFirstString(Row, ["teacherName"], "")} ${PickFirstString(Row, ["teacherCode"], "")}`;
        if (LearningSortKeyValue === "scope")
          return `${PickFirstString(Row, ["moduleCode"], "")} ${PickFirstString(Row, ["levelCode"], "")} ${PickFirstNumber(Row, ["lessonNumber"], 0)} ${PickFirstNumber(Row, ["dpsNumber"], 0)}`;
        if (LearningSortKeyValue === "status")
          return PickFirstString(Row, ["status"], "");
        if (LearningSortKeyValue === "score")
          return PickFirstNumber(Row, ["score", "totalScore"], -1);
        if (LearningSortKeyValue === "accuracy")
          return PickFirstNumber(Row, ["accuracy", "accuracyPercentage"], -1);
        if (LearningSortKeyValue === "benchmark")
          return PickFirstString(Row, ["benchmarkStatus"], "");
        if (LearningSortKeyValue === "timeTaken")
          return PickFirstNumber(
            Row,
            ["timeTakenSeconds", "durationSeconds", "timeTaken"],
            -1,
          );
        return PickFirstString(
          Row,
          ["completedDate", "submittedAt", "startedAt"],
          "",
        );
      };
      const Result = CompareSortValues(ValueFor(First), ValueFor(Second));
      return SortDirectionValue === "asc" ? Result : -Result;
    });
  }, [LearningRows, SearchText, LearningSortKeyValue, SortDirectionValue]);

  const FilteredStudentAttempts = useMemo(() => {
    const FilteredRows = FilterSearchRows(StudentDpsAttempts, SearchText);
    return FilteredRows.slice().sort((First, Second) => {
      const ValueFor = (Row: AnyRecord) => {
        if (StudentSortKeyValue === "scope")
          return `${PickFirstString(Row, ["moduleCode"], "")} ${PickFirstString(Row, ["levelCode"], "")} ${PickFirstNumber(Row, ["lessonNumber"], 0)} ${PickFirstNumber(Row, ["dpsNumber"], 0)}`;
        if (StudentSortKeyValue === "teacher")
          return `${PickFirstString(Row, ["teacherName"], "")} ${PickFirstString(Row, ["teacherCode"], "")}`;
        if (StudentSortKeyValue === "status")
          return PickFirstString(Row, ["status"], "");
        if (StudentSortKeyValue === "score")
          return PickFirstNumber(Row, ["score"], -1);
        if (StudentSortKeyValue === "accuracy")
          return PickFirstNumber(Row, ["accuracyPercentage"], -1);
        if (StudentSortKeyValue === "benchmark")
          return PickFirstString(Row, ["benchmarkStatus"], "");
        if (StudentSortKeyValue === "timeTaken")
          return PickFirstNumber(
            Row,
            ["timeTakenSeconds", "durationSeconds", "timeTaken"],
            -1,
          );
        return PickFirstString(
          Row,
          ["completedDate", "submittedAt", "attemptDate", "startedAt"],
          "",
        );
      };
      const Result = CompareSortValues(ValueFor(First), ValueFor(Second));
      return SortDirectionValue === "asc" ? Result : -Result;
    });
  }, [StudentDpsAttempts, SearchText, StudentSortKeyValue, SortDirectionValue]);

  const FilteredAssessmentRows = useMemo(
    () => FilterSearchRows(StudentAssessmentRows, SearchText),
    [StudentAssessmentRows, SearchText],
  );
  const FilteredPromotionRows = useMemo(
    () => FilterSearchRows(StudentPromotionRows, SearchText),
    [StudentPromotionRows, SearchText],
  );

  // Every tile is the server's count (each DPS once, by its shared state;
  // a level completed when the student is promoted out of it), so the page,
  // the Excel and the trackers always agree. Search narrows the tables only.
  const StudentHistoryMetricValues = {
    dpsCleared: PickFirstNumber(StudentSummary, ["dpsCleared"], 0),
    needsReattempt: PickFirstNumber(StudentSummary, ["needsReattempt"], 0),
    assessmentsCleared: PickFirstNumber(StudentSummary, ["assessmentsCleared"], 0),
    levelsCleared: PickFirstNumber(StudentSummary, ["levelsCleared", "levelsCompleted"], 0),
    modulesCleared: PickFirstNumber(StudentSummary, ["modulesCleared", "modulesCompleted"], 0),
    dpsAverageAccuracy: StudentDpsAttempts.length ? PickFirstNumber(StudentSummary, ["dpsAverageAccuracy"], Number.NaN) : null,
    assessmentAverageAccuracy: StudentAssessmentRows.length ? PickFirstNumber(StudentSummary, ["assessmentAverageAccuracy"], Number.NaN) : null,
  };

  const Error =
    TeachersQuery.error ||
    StudentsQuery.error ||
    ModulesQuery.error ||
    LevelsQuery.error ||
    LessonsQuery.error ||
    DpsQuery.error ||
    LearningPerformanceQuery.error ||
    (Mode === "LEARNING" && LearningViewValue !== "attempts" ? LearningRollupQuery.error : null) ||
    StudentReportQuery.error;
  const IsLoading =
    TeachersQuery.isLoading ||
    StudentsQuery.isLoading ||
    ModulesQuery.isLoading ||
    LevelsQuery.isLoading ||
    LessonsQuery.isLoading ||
    DpsQuery.isLoading ||
    (Mode === "LEARNING" && LearningViewValue === "attempts" && LearningPerformanceQuery.isLoading) ||
    (Mode === "LEARNING" && LearningViewValue !== "attempts" && LearningRollupQuery.isLoading) ||
    (Mode === "STUDENT" && StudentReportQuery.isLoading);

  function ToggleLearningSort(Key: LearningSortKey) {
    const Next = SortDirectionFor(
      Key,
      LearningSortKeyValue,
      SortDirectionValue,
      "completedDate",
      "desc",
    );
    SetLearningSortKeyValue(Next.Key);
    SetSortDirectionValue(Next.Direction);
  }

  function ToggleStudentSort(Key: StudentAttemptSortKey) {
    const Next = SortDirectionFor(
      Key,
      StudentSortKeyValue,
      SortDirectionValue,
      "completedDate",
      "desc",
    );
    SetStudentSortKeyValue(Next.Key);
    SetSortDirectionValue(Next.Direction);
  }

  function ScopeLabel() {
    if (Mode === "STUDENT")
      return SelectedStudent
        ? `${SelectedStudent.studentName || SelectedStudent.fullName} (${SelectedStudent.studentCode})`
        : "Choose Student";
    if (SelectedDps)
      return `DPS ${SelectedDps.dpsNumber}: ${SelectedDps.dpsTitle}`;
    if (SelectedLesson)
      return `Lesson ${SelectedLesson.lessonNumber}: ${SelectedLesson.lessonTitle}`;
    if (SelectedLevel)
      return `${SelectedLevel.levelCode}: ${SelectedLevel.levelName}`;
    return SelectedModule
      ? `${SelectedModule.moduleCode}: ${SelectedModule.moduleName}`
      : "All Modules";
  }

  function LearningFileName() {
    const ScopeCode = SelectedDps
      ? `DPS-${SelectedDps.dpsNumber}`
      : SelectedLesson
        ? `Lesson-${SelectedLesson.lessonNumber}`
        : SelectedLevel?.levelCode || SelectedModule?.moduleCode || "All-Modules";
    const ViewName = { content: "Drill-Down", students: "By-Student", teachers: "By-Teacher", attempts: "Attempts" }[LearningViewValue];
    return `${SafeSlug(["MP", "Learning", "Performance", ViewName, ScopeCode, TodayLabel()].join("_"))}.xlsx`;
  }

  function StudentFileName() {
    return `${SafeSlug(["MP", "Student", "History", SelectedStudent?.studentCode || "Student", TodayLabel()].join("_"))}.xlsx`;
  }

  async function HandleExport() {
    try {
      SetExportError(null);
      SetExportingMode(Mode);
      if (Mode === "LEARNING") {
        const BlobValue = await downloadAdminLearningPerformanceReport({
          view: LearningViewValue,
          period: PeriodValue,
          teacherId: IdForApi(SelectedTeacherId),
          moduleId: IdForApi(SelectedModuleId),
          levelId: IdForApi(SelectedLevelId),
          lessonId: IdForApi(SelectedLessonId),
          dpsId: IdForApi(SelectedDpsId),
          timezone: ViewerTimezone(),
          timezoneOffsetMinutes: ViewerTimezoneOffsetMinutes(),
        });
        DownloadBlob(BlobValue, LearningFileName());
      } else {
        if (!SelectedStudentId || SelectedStudentId === AllValue) return;
        const BlobValue = await downloadAdminStudentReport({
          studentId: SelectedStudentId,
          moduleId: IdForApi(SelectedModuleId),
          levelId: IdForApi(SelectedLevelId),
          lessonId: IdForApi(SelectedLessonId),
          dpsId: IdForApi(SelectedDpsId),
          timezone: ViewerTimezone(),
          timezoneOffsetMinutes: ViewerTimezoneOffsetMinutes(),
        });
        DownloadBlob(BlobValue, StudentFileName());
      }
    } catch (ErrorValue) {
      // shown under the button, as everywhere else on the platform
      SetExportError(ErrorValue);
    } finally {
      SetExportingMode(null);
    }
  }

  if (!Ready) return null;

  const ExportDisabled =
    Mode === "LEARNING"
      ? false
      : !SelectedStudentId || SelectedStudentId === AllValue;
  const SearchPlaceholder =
    Mode === "LEARNING" ? (LearningViewValue === "students" ? "Search Students" : "Search Attempts") : "Search History";
  const ShowSearch = Mode === "STUDENT" || (Mode === "LEARNING" && (LearningViewValue === "attempts" || LearningViewValue === "students"));
  const LearningScopeType = PickFirstString(
    LearningSummary,
    ["scopeType"],
    "Learning Scope",
  );
  const StudentCurrentRecord =
    (RawStudentData?.student as AnyRecord | undefined) ?? {};
  const StudentCurrentLevelId =
    PickFirstString(StudentCurrentRecord, ["currentLevelId"], "") ||
    String(SelectedStudent?.currentLevelId ?? "");
  const CurrentLevelSourceRows = StudentJourneyLevelRows.length
    ? StudentJourneyLevelRows
    : StudentLevelRows;
  const RawCurrentLevelRow =
    CurrentLevelSourceRows.find(
      (Row) => PickFirstString(Row, ["levelId"], "") === StudentCurrentLevelId,
    ) ??
    CurrentLevelSourceRows.find((Row) => {
      const LevelStatus = PickFirstString(
        Row,
        ["status", "levelStatus", "progressionStatus"],
        "",
      ).toUpperCase();
      const PromotionStatus = PickFirstString(
        Row,
        ["promotionStatus"],
        "",
      ).toUpperCase();
      return (
        LevelStatus.includes("ACTIVE") || PromotionStatus.includes("ACTIVE")
      );
    }) ??
    CurrentLevelSourceRows[0];
  const CurrentLevelRow =
    CurrentLevelSourceRows.find((Row) => Row.isCurrentLevel === true) ?? RawCurrentLevelRow;
  const CurrentLevelProgress = CurrentLevelRow
    ? Math.round(
        (PickFirstNumber(CurrentLevelRow, ["clearedDps", "completedDps"], 0) /
          Math.max(PickFirstNumber(CurrentLevelRow, ["requiredDps"], 0), 1)) *
          100,
      )
    : 0;
  const SelectedScopeItems =
    Mode === "LEARNING"
      ? [
          [
            "Teacher",
            SelectedTeacher
              ? `${SelectedTeacher.teacherName} (${SelectedTeacher.teacherCode})`
              : "All Teachers",
          ],
          [
            "Module",
            SelectedModule
              ? `${SelectedModule.moduleCode} - ${SelectedModule.moduleName}`
              : "All Modules",
          ],
          [
            "Level",
            SelectedLevel
              ? `${SelectedLevel.levelCode} - ${SelectedLevel.levelName}`
              : "All Levels",
          ],
          [
            "Lesson",
            SelectedLesson
              ? `Lesson ${SelectedLesson.lessonNumber} - ${SelectedLesson.lessonTitle}`
              : "All Lessons",
          ],
          [
            "DPS",
            SelectedDps
              ? `DPS ${SelectedDps.dpsNumber} - ${SelectedDps.dpsTitle}`
              : "All DPS",
          ],
          ["Period", PeriodLabel(PeriodValue)],
        ]
      : [
          [
            "Student",
            SelectedStudent
              ? `${SelectedStudent.studentName || SelectedStudent.fullName} (${SelectedStudent.studentCode})`
              : SelectedStudentId === AllValue
                ? "All Students"
                : "Choose Student",
          ],
          [
            "Module",
            SelectedModuleId === AllValue
              ? "All Modules"
              : SelectedModule
                ? `${SelectedModule.moduleCode} - ${SelectedModule.moduleName}`
                : "Choose Module",
          ],
          [
            "Level",
            SelectedLevel
              ? `${SelectedLevel.levelCode} - ${SelectedLevel.levelName}`
              : "All Levels",
          ],
          [
            "Lesson",
            SelectedLesson
              ? `Lesson ${SelectedLesson.lessonNumber} - ${SelectedLesson.lessonTitle}`
              : "All Lessons",
          ],
          [
            "DPS",
            SelectedDps
              ? `DPS ${SelectedDps.dpsNumber} - ${SelectedDps.dpsTitle}`
              : "All DPS",
          ],
        ];

  return (
    <AppShell title="Performance Reports">
      <section className="math-hero math-slide-up py-7">
        <div className="relative z-10">
          <p className="math-block-header"><BarChart3 size={14} />Admin Reports</p>
          <h1 className="math-title">Performance Reports</h1>
          <p className="math-subtitle">
            How students are doing on their practice, by module, level, lesson and DPS, and each student&apos;s full learning history.
          </p>
        </div>
      </section>

      <section className="math-report-mode-tabs-section mt-5 math-card p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <ModeButton
            active={Mode === "OVERVIEW"}
            icon={<BarChart3 size={16} />}
            kicker={OverviewPeriodValue === "7d" ? "Last 7 Days" : OverviewPeriodValue === "90d" ? "Last 90 Days" : "Last 30 Days"}
            title="Overview"
            text="How practice is going and who needs following up."
            onClick={() => {
              SetMode("OVERVIEW");
              SetSearchText("");
            }}
          />
          <ModeButton
            active={Mode === "LEARNING"}
            icon={<ClipboardCheck size={16} />}
            kicker="Learning Scope"
            title="Learning Performance"
            text="Every practice attempt, by module, level, lesson and DPS."
            onClick={() => {
              SetMode("LEARNING");
              SetSearchText("");
              SetSelectedModuleId(SelectedModuleId || "");
            }}
          />
          <ModeButton
            active={Mode === "STUDENT"}
            icon={<UserRound size={16} />}
            kicker="Learner Journey"
            title="Student History"
            text="One student's levels, practice, assessments and promotions."
            onClick={() => {
              SetMode("STUDENT");
              SetSearchText("");
            }}
          />
        </div>
      </section>

      {Mode === "LEARNING" ? (
        <div className="mt-5">
          <LearningViewBar
            View={LearningViewValue}
            OnView={(Next) => {
              SetLearningView(Next);
              SetSearchText("");
            }}
            Period={PeriodValue}
            OnPeriod={SetPeriodValue}
          />
        </div>
      ) : null}

      {Error ? (
        <div className="mt-6">
          <ErrorState message={apiErrorMessage(Error)} />
        </div>
      ) : null}

      {/* the person filter gets the most room (long names); two to a row on phones */}
      <section
        className={
          Mode === "OVERVIEW"
            ? "pr-filters mt-5 grid grid-cols-2 gap-3 md:grid-cols-3"
            : ShowSearch
              ? Mode === "STUDENT"
                ? "pr-filters mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)]"
                : "pr-filters mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)]"
              : "pr-filters mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]"
        }
      >
        {Mode !== "STUDENT" ? (
          <SelectCard
            className={Mode === "OVERVIEW" ? "col-span-2 md:col-span-1" : undefined}
            label="Teacher"
            value={SelectedTeacherId}
            onChange={SetSelectedTeacherId}
            options={(TeachersQuery.data ?? []).map(
              (Teacher: AdminTeacher) => ({
                value: Teacher.teacherId,
                label: `${Teacher.teacherName} (${Teacher.teacherCode})`,
              }),
            )}
            placeholder="All Teachers"
          />
        ) : (
          <StudentPicker
            Students={PickerStudents}
            Value={SelectedStudentId === AllValue ? "" : SelectedStudentId}
            OnChange={SetSelectedStudentId}
          />
        )}
        <SelectCard
          label="Module"
          value={Mode !== "STUDENT" && SelectedModuleId === AllValue ? "" : SelectedModuleId}
          onChange={SetSelectedModuleId}
          options={(ModulesQuery.data ?? []).map((Module: ModuleItem) => ({
            value: Module.moduleId,
            label: `${Module.moduleCode} - ${Module.moduleName}`,
          }))}
          placeholder={Mode !== "STUDENT" ? "All Modules" : "Choose Module"}
          allOption={Mode !== "STUDENT" ? undefined : { value: AllValue, label: "All Modules" }}
        />
        <SelectCard
          label="Level"
          value={SelectedLevelId}
          onChange={SetSelectedLevelId}
          options={(LevelsQuery.data ?? []).map((Level: LevelItem) => ({
            value: Level.levelId,
            label: `${Level.levelCode} - ${Level.levelName}`,
          }))}
          placeholder="All Levels"
          disabled={!SelectedModuleId || SelectedModuleId === AllValue}
        />
        <SelectCard
          label="Lesson"
          value={SelectedLessonId}
          onChange={SetSelectedLessonId}
          options={(LessonsQuery.data ?? []).map((Lesson: LessonItem) => ({
            value: Lesson.lessonId,
            label: `Lesson ${Lesson.lessonNumber} - ${Lesson.lessonTitle}`,
          }))}
          placeholder="All Lessons"
          disabled={!SelectedLevelId || SelectedLevelId === AllValue}
          hidden={Mode === "OVERVIEW"}
        />
        <SelectCard
          label="DPS"
          value={SelectedDpsId}
          onChange={SetSelectedDpsId}
          options={(DpsQuery.data ?? [])
            .slice()
            .sort(
              (First, Second) =>
                Number(First.dpsNumber || 0) - Number(Second.dpsNumber || 0),
            )
            .map((Dps: DpsItem) => ({
              value: Dps.dpsId,
              label: `DPS ${Dps.dpsNumber} - ${Dps.dpsTitle}`,
            }))}
          placeholder="All DPS"
          disabled={!SelectedLessonId || SelectedLessonId === AllValue}
          hidden={Mode === "OVERVIEW"}
        />
        <div className="math-card col-span-2 min-w-0 p-4 md:col-span-1" hidden={!ShowSearch}>
          <label className="math-label">Search</label>
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="math-input pl-9"
              value={SearchText}
              onChange={(Event) => SetSearchText(Event.target.value)}
              placeholder={SearchPlaceholder}
            />
          </div>
        </div>
      </section>

      {Mode === "OVERVIEW" ? (
        <div className="mt-5">
          <PerformanceOverview
            Period={OverviewPeriodValue}
            OnPeriod={SetOverviewPeriod}
            TeacherId={IdForApi(SelectedTeacherId)}
            ModuleId={IdForApi(SelectedModuleId)}
            LevelId={IdForApi(SelectedLevelId)}
            Enabled={Ready}
          />
        </div>
      ) : (
      <>
      <section className="mt-5 math-card math-selected-scope-card p-4 sm:p-5">
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="math-block-header"><Filter size={14} />Selected Scope</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
              {ScopeLabel()}
            </h2>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {SelectedScopeItems.map(([Label, Value]) => (
                <ScopeChip
                  key={`${Label}-${Value}`}
                  Label={Label}
                  Value={Value}
                />
              ))}
            </div>

            <button
              className="math-button-primary math-selected-scope-export-button min-w-0 justify-center px-4 py-3 text-center sm:flex-none xl:px-5"
              onClick={HandleExport}
              disabled={ExportDisabled || ExportingMode !== null}
            >
              <FileSpreadsheet size={16} />
              {ExportingMode
                ? "Preparing Excel"
                : Mode === "LEARNING"
                  ? "Export Learning Performance"
                  : "Export Student History"}
            </button>
          </div>
          {ExportError ? <InlineError error={ExportError} /> : null}
        </div>
      </section>

      <section
        // four tiles a row on wide screens; a short last row stretches to fill
        className="mt-5 flex flex-wrap gap-3 [&>*]:min-w-[150px] [&>*]:flex-1 [&>*]:basis-[calc(25%-0.75rem)]"
      >
        {Mode === "LEARNING" ? (
          <>
            <MetricCard
              icon={<Users size={16} />}
              label="Students Covered"
              value={String(PickFirstNumber(LearningSummary, ["studentsCovered", "totalStudents"], 0))}
            />
            <MetricCard
              icon={<Layers3 size={16} />}
              label="DPS Covered"
              value={String(PickFirstNumber(LearningSummary, ["dpsCovered"], 0))}
            />
            <MetricCard
              icon={<Trophy size={16} />}
              label="DPS Cleared"
              value={String(PickFirstNumber(LearningSummary, ["dpsCleared", "benchmarkMet"], 0))}
            />
            <MetricCard
              icon={<AlertTriangle size={16} />}
              label="Needs Re-Attempt"
              value={String(PickFirstNumber(LearningSummary, ["dpsNeedsReattempt", "needsImprovement"], 0))}
            />
            <MetricCard
              icon={<ClipboardCheck size={16} />}
              label="Attempts Reviewed"
              value={String(PickFirstNumber(LearningSummary, ["attemptsReviewed", "completedAttempts"], 0))}
            />
            <MetricCard
              icon={<BarChart3 size={16} />}
              label="Average Accuracy"
              value={LearningHasPractice ? `${PickFirstNumber(LearningSummary, ["averageAccuracy"], 0)}%` : "—"}
            />
            <MetricCard
              icon={<Sparkles size={16} />}
              label="Promotion Ready"
              value={String(PickFirstNumber(LearningSummary, ["promotionReady"], 0))}
            />
            <MetricCard
              icon={<GraduationCap size={16} />}
              label="Promoted Students"
              value={String(PickFirstNumber(LearningSummary, ["promotedStudents"], 0))}
            />
          </>
        ) : (
          <>
            <MetricCard
              icon={<Target size={15} />}
              label="Current Level Progress"
              value={`${CurrentLevelProgress}%`}
              compact
            />
            <MetricCard
              icon={<Trophy size={15} />}
              label="Levels Completed"
              value={String(StudentHistoryMetricValues.levelsCleared)}
              compact
            />
            <MetricCard
              icon={<Layers3 size={15} />}
              label="Modules Completed"
              value={String(StudentHistoryMetricValues.modulesCleared)}
              compact
            />
            <MetricCard
              icon={<ClipboardCheck size={15} />}
              label="DPS Cleared"
              value={String(StudentHistoryMetricValues.dpsCleared)}
              compact
            />
            <MetricCard
              icon={<AlertTriangle size={15} />}
              label="Needs Re-Attempt"
              value={String(StudentHistoryMetricValues.needsReattempt)}
              compact
            />
            <MetricCard
              icon={<GraduationCap size={15} />}
              label="Assessments Cleared"
              value={String(StudentHistoryMetricValues.assessmentsCleared)}
              compact
            />
            <MetricCard
              icon={<BarChart3 size={15} />}
              label="DPS Avg Accuracy"
              value={FormatAccuracyOrDash(StudentHistoryMetricValues.dpsAverageAccuracy)}
              compact
            />
            <MetricCard
              icon={<Target size={15} />}
              label="Assessment Avg Accuracy"
              value={FormatAccuracyOrDash(StudentHistoryMetricValues.assessmentAverageAccuracy)}
              compact
            />
          </>
        )}
      </section>

      <section className="mt-5 math-card p-4 sm:p-5">
        {IsLoading ? (
          <LoadingState message="Loading report data..." />
        ) : Mode === "LEARNING" && LearningViewValue !== "attempts" ? (
          !RollupData ? null : RollupData.view === "content" ? (
            <div className="space-y-4" aria-busy={LearningRollupQuery.isFetching || undefined}>
              <LearningBreadcrumb
                Path={RollupData.path}
                OnCrumb={(Kind) => {
                  if (Kind === "all") SetSelectedModuleId("");
                  else if (Kind === "module") SetSelectedLevelId("");
                  else if (Kind === "level") SetSelectedLessonId("");
                  else if (Kind === "lesson") SetSelectedDpsId("");
                }}
              />
              {!RollupData.rows.length ? (
                <EmptyState title="No Practice In This Period" message="No DPS was practised in this scope and period. Try All Time or a wider scope." />
              ) : RollupData.level === "student" ? (
                <LearningDpsStudentsTable Data={RollupData} />
              ) : (
                <LearningContentTable
                  Data={RollupData}
                  OnOpen={(Row: LearningContentRow) => {
                    if (Row.kind === "module") SetSelectedModuleId(Row.id);
                    else if (Row.kind === "level") SetSelectedLevelId(Row.id);
                    else if (Row.kind === "lesson") SetSelectedLessonId(Row.id);
                    else SetSelectedDpsId(Row.id);
                  }}
                />
              )}
            </div>
          ) : RollupData.view === "students" && RollupStudentRows ? (
            !RollupStudentRows.rows.length ? (
              <EmptyState title={SearchText.trim() ? "No Matching Students" : "No Practice In This Period"} message={SearchText.trim() ? "No student in this scope matches the search." : "No student practised in this scope and period. Try All Time or a wider scope."} />
            ) : (
              <LearningStudentsTable
                Data={RollupStudentRows}
                OnOpen={(Row: LearningStudentRow) => {
                  SetSelectedStudentId(Row.studentId);
                  SetMode("STUDENT");
                  SetSearchText("");
                }}
              />
            )
          ) : RollupData.view === "teachers" ? (
            !RollupData.rows.length ? (
              <EmptyState title="No Teachers" message="No active teacher in this scope." />
            ) : (
              <LearningTeachersTable
                Data={RollupData}
                OnOpen={(Row: LearningTeacherRow) => {
                  if (!Row.teacherId) return;
                  SetSelectedTeacherId(Row.teacherId);
                  SetLearningView("content");
                }}
              />
            )
          ) : null
        ) : Mode === "LEARNING" ? (
          FilteredLearningRows.length ? (
            <LearningPerformanceTable
              Rows={FilteredLearningRows}
              SortKey={LearningSortKeyValue}
              SortDirectionValue={SortDirectionValue}
              ToggleSort={ToggleLearningSort}
              Router={Router}
            />
          ) : (
            <EmptyState title="No Practice In This Period" message="No DPS attempts in this scope and period. Try All Time, a wider scope or another teacher." />
          )
        ) : !SelectedStudentId || SelectedStudentId === AllValue ? (
          <EmptyState title="Choose A Student" message="Pick a student to see their levels, practice, assessments and promotions." />
        ) : (
          <StudentHistoryView
            StudentId={SelectedStudentId}
            ModuleId={IdForApi(SelectedModuleId)}
            PromotionReady={StudentSummary.promotionReady === true}
            StudentName={
              SelectedStudent?.studentName ||
              SelectedStudent?.fullName ||
              "This Learner"
            }
            StudentCode={SelectedStudent?.studentCode || ""}
            CurrentLevelRow={CurrentLevelRow}
            LevelRows={CurrentLevelSourceRows}
            AttemptRows={FilteredStudentAttempts}
            AssessmentRows={FilteredAssessmentRows}
            PromotionRows={
              StudentJourneyPromotionRows.length
                ? StudentJourneyPromotionRows
                : FilteredPromotionRows
            }
            SortKey={StudentSortKeyValue}
            SortDirectionValue={SortDirectionValue}
            ToggleSort={ToggleStudentSort}
            Router={Router}
          />
        )}
      </section>
      </>
      )}
    </AppShell>
  );
}

function ScopeChip({ Label, Value }: { Label: string; Value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs shadow-sm">
      <span className="font-black uppercase tracking-[0.16em] text-slate-500">
        {Label}
      </span>
      <span className="truncate font-bold text-slate-950">{Value}</span>
    </span>
  );
}

function ModeButton({
  active,
  icon,
  kicker,
  title,
  text,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  kicker: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`math-report-scope-tab math-role-tab-card ${active ? "math-report-scope-tab-active math-role-tab-card-active" : "math-report-scope-tab-inactive"}`}
    >
      <div className="flex items-start gap-3">
        <span className="math-report-scope-tab-icon">{icon}</span>
        <span className="min-w-0">
          <span className="math-report-scope-tab-kicker">{kicker}</span>
          <span className="math-report-scope-tab-title">{title}</span>
          <span className="math-report-scope-tab-text">{text}</span>
        </span>
      </div>
    </button>
  );
}

const LEARNING_PAGE_SIZE = 50;

// The status of one attempt, as the trackers name it (the server's shared DPS
// state); the page's own reading only for an attempt without one.
function AttemptStatusPill({ Row }: { Row: AnyRecord }) {
  const Label = typeof Row.chainRowLabel === "string" && Row.chainRowLabel ? Row.chainRowLabel : "";
  if (Label) {
    const Tone = (typeof Row.chainRowTone === "string" && Row.chainRowTone ? Row.chainRowTone : "slate") as Parameters<typeof StatePill>[0]["tone"];
    return <StatePill tone={Tone}>{Label}</StatePill>;
  }
  return <StatusChip Label={AttemptDisplayStatus(Row)} />;
}

function ScoreAndAccuracy({ Row }: { Row: AnyRecord }) {
  const Score = PickFirstNumber(Row, ["score", "totalScore"], Number.NaN);
  const MaxScore = PickFirstNumber(Row, ["maxScore", "totalMarks"], Number.NaN);
  const Accuracy = PickFirstNumber(Row, ["accuracyPercentage", "accuracy"], Number.NaN);
  if (!IsCompletedAttempt(Row) || !Number.isFinite(Accuracy)) return <span className="pr-muted">—</span>;
  const Met = Accuracy >= PickFirstNumber(Row, ["benchmarkPercentage"], 70);
  return (
    <span className="pr-score">
      <span className="pr-score-marks">{Number.isFinite(Score) && Number.isFinite(MaxScore) ? `${WholeNumberLabel(Score)} / ${WholeNumberLabel(MaxScore)}` : "—"}</span>
      <span className="pr-score-accuracy" data-met={Met ? "true" : "false"}>{`${WholeNumberLabel(Accuracy)}%`}</span>
    </span>
  );
}

function CompletedWhen({ Value }: { Value: string }) {
  if (!Value || Value === "-") return <span className="pr-muted">—</span>;
  return (
    <span className="pr-when">
      <span>{FormatDateOnly(Value)}</span>
      <span className="pr-when-time">{formatMathPathDateTime(Value).split(", ").slice(-1)[0]}</span>
    </span>
  );
}

function LearningPerformanceTable({
  Rows,
  SortKey,
  SortDirectionValue,
  ToggleSort,
  Router,
}: {
  Rows: AnyRecord[];
  SortKey: LearningSortKey;
  SortDirectionValue: SortDirection;
  ToggleSort: (Key: LearningSortKey) => void;
  Router: ReturnType<typeof useRouter>;
}) {
  const DisplayRows = useMemo(() => BuildDisplayAttemptRows(Rows), [Rows]);
  // 2026-10-21: a page of rows at a time (all of them made the page take
  // seconds to draw); a new scope, search or sort starts at the first page.
  const [PageIndex, SetPageIndex] = useState(0);
  useEffect(() => SetPageIndex(0), [Rows]);
  const PageCount = Math.max(1, Math.ceil(DisplayRows.length / LEARNING_PAGE_SIZE));
  const SafePage = Math.min(PageIndex, PageCount - 1);
  const PageRows = DisplayRows.slice(SafePage * LEARNING_PAGE_SIZE, (SafePage + 1) * LEARNING_PAGE_SIZE);
  const First = DisplayRows.length ? SafePage * LEARNING_PAGE_SIZE + 1 : 0;
  const Last = Math.min(DisplayRows.length, (SafePage + 1) * LEARNING_PAGE_SIZE);
  const Header = (Key: LearningSortKey, Label: ReactNode) => (
    <SortableHeader active={SortKey === Key} direction={SortDirectionValue} onClick={() => ToggleSort(Key)}>
      {Label}
    </SortableHeader>
  );

  return (
    <div className="pr-attempts">
      <div className="pr-attempts-bar">
        <p className="pr-attempts-count">
          {`Showing ${First.toLocaleString("en-IN")}–${Last.toLocaleString("en-IN")} of ${DisplayRows.length.toLocaleString("en-IN")} Attempts`}
        </p>
        <ResultsSortDropdown
          ClassName="w-full sm:w-auto sm:min-w-[260px]"
          Fields={LEARNING_SORT_FIELDS}
          SortKey={SortKey}
          SortDirectionValue={SortDirectionValue}
          OnSelectField={ToggleSort}
          OnToggleDirection={() => ToggleSort(SortKey)}
        />
      </div>
      <div className="math-table pr-attempts-table">
        <table className="ad-cards">
          <colgroup>
            <col className="pr-col-student" />
            <col className="pr-col-teacher" />
            <col className="pr-col-scope" />
            <col className="pr-col-attempt" />
            <col className="pr-col-status" />
            <col className="pr-col-score" />
            <col className="pr-col-when" />
            <col className="pr-col-time" />
            <col className="pr-col-review" />
          </colgroup>
          <thead>
            <tr>
              <th>{Header("student", "Student")}</th>
              <th>{Header("teacher", "Teacher")}</th>
              <th>{Header("scope", "Learning Scope")}</th>
              <th className="pr-center"><span className="math-table-header-label">Attempt</span></th>
              <th className="pr-center">{Header("status", "Status")}</th>
              <th className="pr-center">{Header("accuracy", "Score")}</th>
              <th>{Header("completedDate", "Completed")}</th>
              <th>{Header("timeTaken", "Time Taken")}</th>
              <th className="pr-center"><span className="math-table-header-label">Review</span></th>
            </tr>
          </thead>
          <tbody>
            {PageRows.map((Row, Index) => {
              const AttemptId = PickFirstString(Row, ["attemptId"], `attempt-${Index}`);
              const TeacherCode = PickFirstString(Row, ["teacherCode"], "");
              return (
                <tr key={AttemptId}>
                  <td className="ad-card-title" data-label="Student">
                    <p className="pr-name">{PickFirstString(Row, ["studentName"], "—")}</p>
                    <p className="pr-code">{PickFirstString(Row, ["studentCode"], "—")}</p>
                  </td>
                  <td data-label="Teacher">
                    <p className="pr-name">{PickFirstString(Row, ["teacherName"], "Not Assigned")}</p>
                    {TeacherCode ? <p className="pr-sub">{TeacherCode}</p> : null}
                  </td>
                  <td data-label="Learning Scope">
                    <p className="pr-name">{`${PickFirstString(Row, ["moduleCode"], "—")} → ${PickFirstString(Row, ["levelCode"], "—")}`}</p>
                    <p className="pr-sub">{`Lesson ${PickFirstNumber(Row, ["lessonNumber"], 0)} · DPS ${PickFirstNumber(Row, ["dpsNumber"], 0)}`}</p>
                  </td>
                  <td className="pr-center" data-label="Attempt"><AttemptChip Label={AttemptLabel(Row)} /></td>
                  <td className="pr-center" data-label="Status"><AttemptStatusPill Row={Row} /></td>
                  <td className="pr-center" data-label="Score"><ScoreAndAccuracy Row={Row} /></td>
                  <td data-label="Completed"><CompletedWhen Value={PickFirstString(Row, ["completedDate", "submittedAt"], "")} /></td>
                  <td data-label="Time Taken">
                    {IsCompletedAttempt(Row)
                      ? FormatTimeTaken(PickFirstNumber(Row, ["timeTakenSeconds", "durationSeconds", "timeTaken"], Number.NaN))
                      : <span className="pr-muted">—</span>}
                  </td>
                  <td className="pr-center ad-card-wide" data-label="Review">
                    <button
                      type="button"
                      className="math-role-action-button math-history-review-button"
                      onClick={() => Router.push(`/admin/results/${AttemptId}`)}
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {PageCount > 1 ? (
        <nav className="pr-pager" aria-label="Pages">
          <button type="button" className="math-button-secondary" disabled={SafePage === 0} onClick={() => SetPageIndex(SafePage - 1)}>
            <ChevronLeft size={16} />
            Previous
          </button>
          <span className="pr-pager-text">{`Page ${SafePage + 1} Of ${PageCount}`}</span>
          <button type="button" className="math-button-secondary" disabled={SafePage >= PageCount - 1} onClick={() => SetPageIndex(SafePage + 1)}>
            Next
            <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

type HistoryGroup = {
  Key: string;
  Label: string;
  SubLabel?: string;
  Count: number;
  Rows?: AnyRecord[];
  Children?: HistoryGroup[];
};

function StableGroupKey(
  Row: AnyRecord,
  Keys: string[],
  FallbackPrefix: string,
) {
  const Value = PickFirstString(Row, Keys, "");
  if (Value && Value !== "-") return Value;
  return `${FallbackPrefix}-${Keys.map((Key) => String(Row[Key] ?? "")).join("-")}`;
}

function AddGroupedRow(
  MapValue: Map<string, HistoryGroup>,
  Key: string,
  Label: string,
  SubLabel: string | undefined,
  Row: AnyRecord,
) {
  if (!MapValue.has(Key)) {
    MapValue.set(Key, {
      Key,
      Label,
      SubLabel,
      Count: 0,
      Children: [],
    });
  }
  const Group = MapValue.get(Key)!;
  Group.Count += 1;
  Group.Rows = [...(Group.Rows ?? []), Row];
  return Group;
}

function BuildDpsHistoryHierarchy(Rows: AnyRecord[]) {
  const ModuleMap = new Map<string, HistoryGroup>();

  Rows.forEach((Row) => {
    const ModuleKey = StableGroupKey(Row, ["moduleId", "moduleCode"], "module");
    const LevelKey = `${ModuleKey}|${StableGroupKey(Row, ["levelId", "levelCode"], "level")}`;
    const LessonKey = `${LevelKey}|${StableGroupKey(Row, ["lessonId", "lessonNumber"], "lesson")}`;

    const ModuleGroup = AddGroupedRow(
      ModuleMap,
      ModuleKey,
      `${PickFirstString(Row, ["moduleName"], "Module")}: ${PickFirstString(Row, ["moduleCode"], "—")}`,
      "Learning Module",
      Row,
    );

    const LevelMap = new Map(
      (ModuleGroup.Children ?? []).map((Child) => [Child.Key, Child]),
    );
    const LevelGroup = AddGroupedRow(
      LevelMap,
      LevelKey,
      `${PickFirstString(Row, ["levelCode"], "Level")} · ${PickFirstString(Row, ["levelName"], "—")}`,
      "Level",
      Row,
    );
    ModuleGroup.Children = Array.from(LevelMap.values());

    const LessonMap = new Map(
      (LevelGroup.Children ?? []).map((Child) => [Child.Key, Child]),
    );
    const LessonNumber = PickFirstNumber(Row, ["lessonNumber"], 0);
    const LessonGroup = AddGroupedRow(
      LessonMap,
      LessonKey,
      `Lesson ${LessonNumber || "—"}: ${PickFirstString(Row, ["lessonTitle"], "Learning Lesson")}`,
      "Lesson Block",
      Row,
    );
    LevelGroup.Children = Array.from(LessonMap.values());

    LessonGroup.Children = undefined;
  });

  return Array.from(ModuleMap.values());
}

function BuildAssessmentHistoryHierarchy(Rows: AnyRecord[]) {
  const ModuleMap = new Map<string, HistoryGroup>();

  Rows.forEach((Row) => {
    const ModuleKey = StableGroupKey(Row, ["moduleId", "moduleCode"], "module");
    const LevelKey = `${ModuleKey}|${StableGroupKey(Row, ["levelId", "levelCode"], "level")}`;

    const ModuleGroup = AddGroupedRow(
      ModuleMap,
      ModuleKey,
      `${PickFirstString(Row, ["moduleName"], "Assessment Module")}: ${PickFirstString(Row, ["moduleCode"], "—")}`,
      "Assessment Module",
      Row,
    );

    const LevelMap = new Map(
      (ModuleGroup.Children ?? []).map((Child) => [Child.Key, Child]),
    );
    const LevelGroup = AddGroupedRow(
      LevelMap,
      LevelKey,
      `${PickFirstString(Row, ["levelCode"], "Level")} · ${PickFirstString(Row, ["levelName"], "—")}`,
      "Level Assessment",
      Row,
    );
    LevelGroup.Children = undefined;
    ModuleGroup.Children = Array.from(LevelMap.values());
  });

  return Array.from(ModuleMap.values());
}

function BuildPromotionHistoryHierarchy(Rows: AnyRecord[]) {
  const ModuleMap = new Map<string, HistoryGroup>();

  Rows.forEach((Row) => {
    const ModuleCode = PickFirstString(
      Row,
      ["fromModuleCode", "moduleCode", "toModuleCode"],
      "-",
    );
    const ModuleName = PickFirstString(
      Row,
      ["fromModuleName", "moduleName", "toModuleName"],
      "Promotion Module",
    );
    const ModuleKey = StableGroupKey(
      Row,
      ["fromModuleId", "moduleId", "fromModuleCode", "moduleCode"],
      "promotion-module",
    );

    const ModuleGroup = AddGroupedRow(
      ModuleMap,
      ModuleKey,
      `${ModuleName} · ${ModuleCode}`,
      "Promotion Module",
      Row,
    );
    ModuleGroup.Children = undefined;
  });

  return Array.from(ModuleMap.values()).sort((First, Second) =>
    CompareSortValues(First.Label, Second.Label),
  );
}

function SortHistoryGroups(Groups: HistoryGroup[]): HistoryGroup[] {
  return Groups.slice()
    .sort((First, Second) => CompareSortValues(First.Label, Second.Label))
    .map((Group) => ({
      ...Group,
      Children: Group.Children ? SortHistoryGroups(Group.Children) : undefined,
    }));
}

type CompletedLevelModuleGroup = {
  Key: string;
  Label: string;
  SubLabel: string;
  Levels: AnyRecord[];
};

function LevelSortValue(Row: AnyRecord) {
  return PickFirstString(Row, ["levelCode", "levelName", "levelId"], "");
}

function IsCompletedPromotedLevel(Row: AnyRecord, CurrentLevelId?: string) {
  const LevelIdValue = PickFirstString(Row, ["levelId"], "");
  if (CurrentLevelId && LevelIdValue === CurrentLevelId) return false;

  const LevelCode = PickFirstString(Row, ["levelCode"], "");
  const FromLevelCode = PickFirstString(Row, ["fromLevelCode"], "");
  if (
    FromLevelCode &&
    FromLevelCode !== "-" &&
    LevelCode &&
    FromLevelCode !== LevelCode
  ) {
    return false;
  }

  const PromotionStatus = PickFirstString(
    Row,
    ["promotionStatus"],
    "",
  ).toUpperCase();
  const PromotedAt = PickFirstString(Row, ["promotedAt"], "");
  return (
    PromotionStatus.includes("PROMOTED") ||
    Boolean(PromotedAt && PromotedAt !== "-")
  );
}

function BuildCompletedLevelHierarchy(Rows: AnyRecord[]) {
  const ModuleMap = new Map<string, CompletedLevelModuleGroup>();

  Rows.forEach((Row) => {
    const ModuleKey = StableGroupKey(Row, ["moduleId", "moduleCode"], "module");
    if (!ModuleMap.has(ModuleKey)) {
      ModuleMap.set(ModuleKey, {
        Key: ModuleKey,
        Label: `${PickFirstString(Row, ["moduleName"], "Learning Module")} · ${PickFirstString(Row, ["moduleCode"], "—")}`,
        SubLabel: "Completed Level Module",
        Levels: [],
      });
    }
    ModuleMap.get(ModuleKey)!.Levels.push(Row);
  });

  return Array.from(ModuleMap.values())
    .sort((First, Second) => CompareSortValues(First.Label, Second.Label))
    .map((ModuleGroup) => ({
      ...ModuleGroup,
      Levels: ModuleGroup.Levels.slice().sort((First, Second) =>
        LevelSortValue(First).localeCompare(LevelSortValue(Second), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    }));
}

function HierarchyToggle({ Expanded }: { Expanded: boolean }) {
  return (
    <span className="math-hierarchy-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 transition">
      <ChevronDown
        size={16}
        className={`transition-transform ${Expanded ? "rotate-0" : "-rotate-90"}`}
      />
    </span>
  );
}

function HistoryHierarchyRow({
  Group,
  Depth,
  ExpandedKeys,
  ToggleExpanded,
  children,
}: {
  Group: HistoryGroup;
  Depth: number;
  ExpandedKeys: Record<string, boolean>;
  ToggleExpanded: (Key: string, Was?: boolean) => void;
  children: ReactNode;
}) {
  // the module and level open by default, so the lessons show at once;
  // whatever the admin opens or closes is remembered
  const Expanded = ExpandedKeys[Group.Key] ?? Depth < 2;
  const Tone =
    Depth === 0
      ? "border-blue-100 bg-white"
      : Depth === 1
        ? "border-cyan-100 bg-cyan-50/40"
        : "border-slate-200 bg-white/80";
  const Kicker = Depth === 0 ? "Module" : Depth === 1 ? "Level" : "Lesson";
  const KickerIcon = Depth === 0 ? Boxes : Depth === 1 ? Route : BookText;

  return (
    <div className={`math-history-hierarchy-row math-history-depth-${Depth} rounded-[24px] border ${Tone} p-3 shadow-sm`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={Expanded}
        onClick={() => ToggleExpanded(Group.Key, Expanded)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <HierarchyToggle Expanded={Expanded} />
          <div className="min-w-0">
            <p className="math-block-header"><KickerIcon size={14} />{Kicker}</p>
            <h4 className="mt-1 truncate text-base font-black text-slate-950">
              {Group.Label}
            </h4>
            {Group.SubLabel ? (
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {Group.SubLabel}
              </p>
            ) : null}
          </div>
        </div>
        <span className="math-badge math-history-count-badge whitespace-nowrap border-blue-200 bg-blue-50 text-blue-700">
          {Group.Count} Record{Group.Count === 1 ? "" : "s"}
        </span>
      </button>
      {Expanded ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

function StudentHistoryView({
  StudentId,
  ModuleId,
  PromotionReady = false,
  StudentName,
  StudentCode,
  CurrentLevelRow,
  LevelRows,
  AttemptRows,
  AssessmentRows,
  PromotionRows,
  SortKey,
  SortDirectionValue,
  ToggleSort,
  Router,
}: {
  StudentId: string;
  ModuleId?: string;
  PromotionReady?: boolean;
  StudentName: string;
  StudentCode: string;
  CurrentLevelRow?: AnyRecord;
  LevelRows: AnyRecord[];
  AttemptRows: AnyRecord[];
  AssessmentRows: AnyRecord[];
  PromotionRows: AnyRecord[];
  SortKey: StudentAttemptSortKey;
  SortDirectionValue: SortDirection;
  ToggleSort: (Key: StudentAttemptSortKey) => void;
  Router: ReturnType<typeof useRouter>;
}) {
  const StudentHistoryStateKey = CreatePersistedUiStateKey("admin", "student-history", StudentCode);
  const [DpsExpandedKeys, SetDpsExpandedKeys] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(StudentHistoryStateKey, "dps-expanded"), {});
  const [AssessmentExpandedKeys, SetAssessmentExpandedKeys] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(StudentHistoryStateKey, "assessment-expanded"), {});
  const [CompletedLevelExpandedKeys, SetCompletedLevelExpandedKeys] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(StudentHistoryStateKey, "completed-level-expanded"), {});
  const [PromotionExpandedKeys, SetPromotionExpandedKeys] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(StudentHistoryStateKey, "promotion-expanded"), {});
  // the open section is kept in the address too (?view=dps), like the sub-tab
  const [HistoryView, SetHistoryView] = useUrlTabState("view", ["summary", "current", "dps", "assessment", "promotion"] as const, "summary");
  const ActiveStudentHistoryTab = HistoryView.toUpperCase() as StudentHistoryDetailTab;
  const SetActiveStudentHistoryTab = (Next: StudentHistoryDetailTab) => SetHistoryView(Next.toLowerCase() as typeof HistoryView);
  const DisplayAttemptRows = BuildDisplayAttemptRows(AttemptRows);
  const DisplayAssessmentRows = BuildDisplayAttemptRows(AssessmentRows);
  const DpsHierarchy = useMemo(
    () => SortHistoryGroups(BuildDpsHistoryHierarchy(DisplayAttemptRows)),
    [DisplayAttemptRows],
  );
  const AssessmentHierarchy = useMemo(
    () =>
      SortHistoryGroups(BuildAssessmentHistoryHierarchy(DisplayAssessmentRows)),
    [DisplayAssessmentRows],
  );
  const PromotionHierarchy = useMemo(
    () => SortHistoryGroups(BuildPromotionHistoryHierarchy(PromotionRows)),
    [PromotionRows],
  );
  const CurrentLevelId = PickFirstString(CurrentLevelRow, ["levelId"], "");
  const CompletedLevelRows = useMemo(
    () =>
      LevelRows.filter((Row) => IsCompletedPromotedLevel(Row, CurrentLevelId)),
    [LevelRows, CurrentLevelId],
  );
  const CompletedLevelHierarchy = useMemo(
    () => BuildCompletedLevelHierarchy(CompletedLevelRows),
    [CompletedLevelRows],
  );
  const LatestPromotionRow = PromotionRows.slice().sort(
    (First, Second) =>
      Date.parse(PickFirstString(Second, ["promotedAt"], "")) -
      Date.parse(PickFirstString(First, ["promotedAt"], "")),
  )[0];
  function ToggleDpsExpanded(Key: string, Was?: boolean) {
    SetDpsExpandedKeys((Current) => ({
      ...Current,
      [Key]: Was === undefined ? Current[Key] !== true : !Was,
    }));
  }

  function ToggleAssessmentExpanded(Key: string, Was?: boolean) {
    SetAssessmentExpandedKeys((Current) => ({
      ...Current,
      [Key]: Was === undefined ? Current[Key] !== true : !Was,
    }));
  }

  function ToggleCompletedLevelExpanded(Key: string, Was?: boolean) {
    SetCompletedLevelExpandedKeys((Current) => ({
      ...Current,
      [Key]: Was === undefined ? Current[Key] !== true : !Was,
    }));
  }

  function TogglePromotionExpanded(Key: string, Was?: boolean) {
    SetPromotionExpandedKeys((Current) => ({
      ...Current,
      [Key]: Was === undefined ? Current[Key] !== true : !Was,
    }));
  }

  function RenderDpsGroup(Group: HistoryGroup, Depth = 0): ReactNode {
    const IsLeaf = !Group.Children?.length;
    return (
      <HistoryHierarchyRow
        key={Group.Key}
        Group={Group}
        Depth={Depth}
        ExpandedKeys={DpsExpandedKeys}
        ToggleExpanded={ToggleDpsExpanded}
      >
        {IsLeaf ? (
          <DpsAttemptRecordsTable Rows={Group.Rows ?? []} Router={Router} />
        ) : (
          Group.Children?.map((Child) => RenderDpsGroup(Child, Depth + 1))
        )}
      </HistoryHierarchyRow>
    );
  }

  function RenderAssessmentGroup(Group: HistoryGroup, Depth = 0): ReactNode {
    const IsLeaf = !Group.Children?.length;
    return (
      <HistoryHierarchyRow
        key={Group.Key}
        Group={Group}
        Depth={Depth}
        ExpandedKeys={AssessmentExpandedKeys}
        ToggleExpanded={ToggleAssessmentExpanded}
      >
        {IsLeaf ? (
          <AssessmentAttemptRecordsTable
            Rows={Group.Rows ?? []}
            Router={Router}
          />
        ) : (
          Group.Children?.map((Child) =>
            RenderAssessmentGroup(Child, Depth + 1),
          )
        )}
      </HistoryHierarchyRow>
    );
  }

  function RenderPromotionGroup(Group: HistoryGroup, Depth = 0): ReactNode {
    const IsLeaf = !Group.Children?.length;
    return (
      <HistoryHierarchyRow
        key={Group.Key}
        Group={Group}
        Depth={Depth}
        ExpandedKeys={PromotionExpandedKeys}
        ToggleExpanded={TogglePromotionExpanded}
      >
        {IsLeaf ? (
          <PromotionHistoryRecordsTable Rows={Group.Rows ?? []} />
        ) : (
          Group.Children?.map((Child) => RenderPromotionGroup(Child, Depth + 1))
        )}
      </HistoryHierarchyRow>
    );
  }

  const StudentHistoryTabs: Array<{
    Key: StudentHistoryDetailTab;
    Label: string;
    Description: string;
    CountLabel: string;
  }> = [
    {
      Key: "SUMMARY",
      Label: "Summary",
      Description: "Streak, accuracy, strengths and the journey",
      CountLabel: "At A Glance",
    },
    {
      Key: "CURRENT",
      Label: "Current Level Tracker",
      Description: "The level they are on and the levels they finished",
      CountLabel: `${CompletedLevelRows.length} Completed Level${CompletedLevelRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "DPS",
      Label: "DPS History",
      Description: "Every practice attempt, by lesson and DPS",
      CountLabel: `${AttemptRows.length} Attempt${AttemptRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "ASSESSMENT",
      Label: "Assessment History",
      Description: "Level assessments and their results",
      CountLabel: `${AssessmentRows.length} Attempt${AssessmentRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "PROMOTION",
      Label: "Promotion Journey",
      Description: "Each promotion to the next level",
      CountLabel: `${PromotionRows.length} Promotion${PromotionRows.length === 1 ? "" : "s"}`,
    },
  ];

  function RenderCurrentLevelTrackerTab() {
    return (
      <div className="math-card p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="math-block-header"><Gauge size={14} />Current Level Tracker</p>
            <h3 className="text-2xl font-black text-slate-950">
              Current Level Progress
            </h3>
          </div>
          <span className="math-badge math-history-count-badge whitespace-nowrap border-blue-200 bg-blue-50 text-blue-700">
            {CompletedLevelRows.length} Completed Level
            {CompletedLevelRows.length === 1 ? "" : "s"}
          </span>
        </div>
        {PromotionReady ? (
          <p className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200">
            Level assessment cleared: ready to promote. Promote from Assessment Control.
          </p>
        ) : null}
        {CurrentLevelRow ? (
          <CurrentLevelProgressBlock Row={CurrentLevelRow} />
        ) : null}
        <div className="mt-4 rounded-[26px] border border-slate-200 bg-white/75 p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="math-block-header"><CheckCheck size={14} />Completed Level Journey</p>
              <h4 className="text-xl font-black text-slate-950">
                Cleared Level History
              </h4>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Completed levels are grouped by module and sorted in level
                order.
              </p>
            </div>
            <span className="math-badge whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-700">
              {CompletedLevelRows.length} Level
              {CompletedLevelRows.length === 1 ? "" : "s"}
            </span>
          </div>
          {!CompletedLevelRows.length ? (
            <EmptyState message="No completed level history found for this student and scope." />
          ) : (
            <div className="space-y-3">
              {CompletedLevelHierarchy.map((ModuleGroup) => (
                <CompletedLevelModuleBlock
                  key={ModuleGroup.Key}
                  ModuleGroup={ModuleGroup}
                  ExpandedKeys={CompletedLevelExpandedKeys}
                  ToggleExpanded={ToggleCompletedLevelExpanded}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function RenderDpsHistoryTab() {
    return (
      <div className="math-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="math-block-header"><Database size={14} />DPS History</p>
            <h3 className="text-2xl font-black text-slate-950">
              Learning Attempts
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="math-badge whitespace-nowrap border-slate-200 bg-white text-slate-700">
              {AttemptRows.length} {AttemptRows.length === 1 ? "Attempt" : "Attempts"}
            </span>
            <ResultsSortDropdown
              ClassName="w-full sm:w-auto sm:min-w-[260px]"
              Fields={STUDENT_ATTEMPT_SORT_FIELDS}
              SortKey={SortKey}
              SortDirectionValue={SortDirectionValue}
              OnSelectField={ToggleSort}
              OnToggleDirection={() => ToggleSort(SortKey)}
            />
          </div>
        </div>
        {!AttemptRows.length ? (
          <EmptyState message="No DPS attempts found for this student and scope." />
        ) : (
          <div className="space-y-3">
            {DpsHierarchy.map((Group) => RenderDpsGroup(Group))}
          </div>
        )}
      </div>
    );
  }

  function RenderAssessmentHistoryTab() {
    return (
      <div className="math-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="math-block-header"><FileClock size={14} />Assessment History</p>
            <h3 className="text-2xl font-black text-slate-950">
              Assessment Attempts
            </h3>
          </div>
          <span className="math-badge whitespace-nowrap border-slate-200 bg-white text-slate-700">
            {AssessmentRows.length} {AssessmentRows.length === 1 ? "Attempt" : "Attempts"}
          </span>
        </div>
        {!AssessmentRows.length ? (
          <p className="mt-4 text-sm text-slate-600">
            No assessment attempts are available for this student and scope.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {AssessmentHierarchy.map((Group) => RenderAssessmentGroup(Group))}
          </div>
        )}
      </div>
    );
  }

  function RenderPromotionJourneyTab() {
    return (
      <div className="space-y-6">
        <LevelProgressionSummary
          CurrentLevelRow={CurrentLevelRow}
          LatestPromotionRow={LatestPromotionRow}
          PromotionCount={PromotionRows.length}
        />
        <div className="math-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="math-block-header"><History size={14} />Progression Audit</p>
              <h3 className="text-2xl font-black text-slate-950">
                Promotion History
              </h3>
            </div>
            <span className="math-badge whitespace-nowrap border-violet-200 bg-violet-50 text-violet-700">
              {PromotionRows.length} {PromotionRows.length === 1 ? "Promotion" : "Promotions"}
            </span>
          </div>
          {!PromotionRows.length ? (
            <div className="mt-4 rounded-[24px] border border-violet-100 bg-violet-50/70 p-5">
              <p className="text-sm font-black text-slate-950">
                No Promotion Recorded Yet
              </p>
              <p className="mt-2 max-w-5xl text-sm font-semibold leading-6 text-slate-600">
                Promotion history will appear here after Admin promotes this
                student for the selected scope.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {PromotionHierarchy.map((Group) => RenderPromotionGroup(Group))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="math-card p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {StudentHistoryTabs.map((Tab) => {
            const IsActive = ActiveStudentHistoryTab === Tab.Key;
            return (
              <button
                key={Tab.Key}
                type="button"
                className={`math-role-tab-card min-h-[88px] p-4 text-left ${IsActive ? "math-role-tab-card-active" : ""}`}
                aria-pressed={IsActive}
                onClick={() => SetActiveStudentHistoryTab(Tab.Key)}
              >
                {/* the label and its count share the top line; the
                    description has the card's full width under them */}
                <div className="flex h-full flex-col gap-2">
                  <div className="flex flex-col items-start gap-1">
                    <p className="text-[0.82rem] font-black leading-5">
                      {Tab.Label}
                    </p>
                    <span className="math-badge shrink-0 whitespace-nowrap">
                      {Tab.CountLabel}
                    </span>
                  </div>
                  <p className="text-sm font-semibold leading-5 text-slate-500">
                    {Tab.Description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {ActiveStudentHistoryTab === "SUMMARY" ? (
        <StudentSummary
          StudentId={StudentId}
          ModuleId={ModuleId}
          OnAssessments={() => SetActiveStudentHistoryTab("ASSESSMENT")}
        />
      ) : null}
      {ActiveStudentHistoryTab === "CURRENT"
        ? RenderCurrentLevelTrackerTab()
        : null}
      {ActiveStudentHistoryTab === "DPS" ? RenderDpsHistoryTab() : null}
      {ActiveStudentHistoryTab === "ASSESSMENT"
        ? RenderAssessmentHistoryTab()
        : null}
      {ActiveStudentHistoryTab === "PROMOTION"
        ? RenderPromotionJourneyTab()
        : null}
    </div>
  );
}

function PromotionHistoryRecordsTable({ Rows }: { Rows: AnyRecord[] }) {
  const DefaultSortKey: PromotionHistorySortKey = "promotionDate";
  const DefaultSortDirection: SortDirection = "desc";
  const [SortKey, SetSortKey] = useState<PromotionHistorySortKey>(DefaultSortKey);
  const [SortDirectionValue, SetSortDirectionValue] =
    useState<SortDirection>(DefaultSortDirection);

  function ToggleSort(Key: PromotionHistorySortKey) {
    const Next = SortDirectionFor(
      Key,
      SortKey,
      SortDirectionValue,
      DefaultSortKey,
      DefaultSortDirection,
    );
    SetSortKey(Next.Key);
    SetSortDirectionValue(Next.Direction);
  }

  const SortedRows = useMemo(() => {
    const ValueFor = (Row: AnyRecord) => {
      if (SortKey === "fromLevel")
        return `${PickFirstString(Row, ["fromModuleCode"], "")} ${PickFirstString(Row, ["fromLevelCode"], "")}`;
      if (SortKey === "toLevel")
        return `${PickFirstString(Row, ["toModuleCode"], "")} ${PickFirstString(Row, ["toLevelCode"], "")}`;
      if (SortKey === "assessment")
        return PickFirstString(Row, ["assessmentTitle"], "");
      if (SortKey === "score") return PickFirstNumber(Row, ["score"], -1);
      if (SortKey === "percentage")
        return PickFirstNumber(Row, ["percentage"], -1);
      if (SortKey === "status")
        return PickFirstString(Row, ["promotionStatus", "statusLabel"], "");
      if (SortKey === "promotedBy")
        return PickFirstString(Row, ["promotedByName"], "");
      return PickFirstString(Row, ["promotedAt"], "");
    };
    return Rows.slice().sort((First, Second) => {
      const Result = CompareSortValues(ValueFor(First), ValueFor(Second));
      return SortDirectionValue === "asc" ? Result : -Result;
    });
  }, [Rows, SortKey, SortDirectionValue]);

  return (
    <div className="math-table math-student-history-table math-promotion-history-table">
      <div className="flex justify-end border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <ResultsSortDropdown
          ClassName="w-full sm:w-auto sm:min-w-[260px]"
          Fields={PROMOTION_HISTORY_SORT_FIELDS}
          SortKey={SortKey}
          SortDirectionValue={SortDirectionValue}
          OnSelectField={ToggleSort}
          OnToggleDirection={() => ToggleSort(SortKey)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "fromLevel"} direction={SortDirectionValue} onClick={() => ToggleSort("fromLevel")}>From Level</SortableHeader></th>
            <th><SortableHeader active={SortKey === "toLevel"} direction={SortDirectionValue} onClick={() => ToggleSort("toLevel")}>To Level</SortableHeader></th>
            <th><SortableHeader active={SortKey === "assessment"} direction={SortDirectionValue} onClick={() => ToggleSort("assessment")}>Assessment</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")} align="center">Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "percentage"} direction={SortDirectionValue} onClick={() => ToggleSort("percentage")}>Percentage</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")} align="center">Status</SortableHeader></th>
            <th><SortableHeader active={SortKey === "promotionDate"} direction={SortDirectionValue} onClick={() => ToggleSort("promotionDate")}>Promotion Date</SortableHeader></th>
            <th><SortableHeader active={SortKey === "promotedBy"} direction={SortDirectionValue} onClick={() => ToggleSort("promotedBy")}>Promoted By</SortableHeader></th>
          </tr>
        </thead>
        <tbody>
          {SortedRows.map((Row, Index) => {
            const Score = PickFirstNumber(Row, ["score"], Number.NaN);
            const MaxScore = PickFirstNumber(Row, ["maxScore"], 100);
            const Percentage = PickFirstNumber(Row, ["percentage"], Number.NaN);
            return (
              <tr key={`${PickFirstString(Row, ["promotionId"], "promotion")}-${Index}`}>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["fromLevelCode"], "—")}</p>
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["fromModuleCode"], "—")}</p>
                </td>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["toLevelCode"], "—")}</p>
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["toModuleCode"], "—")}</p>
                </td>
                <td><p className="font-black">{PickFirstString(Row, ["assessmentTitle"], "Assessment")}</p></td>
                <td><ScoreValueChip Score={Score} MaxScore={MaxScore} /></td>
                <td><AccuracyValueChip Accuracy={Percentage} /></td>
                <td className="math-table-chip-cell">
                  <PromotionChip Label={PickFirstString(Row, ["promotionStatus", "statusLabel"], "Promoted")} />
                </td>
                <td className="math-history-date-cell">{FormatDate(PickFirstString(Row, ["promotedAt"], "-"))}</td>
                <td className="math-history-owner-cell math-promoted-by-cell">{PickFirstString(Row, ["promotedByName"], "Admin")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AttemptLabel(Row: AnyRecord) {
  const ExplicitLabel = PickFirstString(
    Row,
    ["attemptLabel", "attemptType", "attempt"],
    "",
  );
  if (ExplicitLabel && ExplicitLabel !== "-") return ExplicitLabel;
  const AttemptSequence = PickFirstNumber(
    Row,
    [
      "__attemptSequence",
      "attemptNumber",
      "attemptNo",
      "attemptSequence",
      "sequence",
      "reattemptNumber",
      "reAttemptNumber",
    ],
    1,
  );
  return AttemptSequence > 1 ? `Re-Attempt ${AttemptSequence - 1}` : "Original";
}

function AttemptChip({ Label }: { Label: string }) {
  return (
    <span className="math-badge math-attempt-chip whitespace-nowrap border-blue-200 bg-blue-50 text-blue-700">
      {Label}
    </span>
  );
}

function WholeNumberLabel(Value: number) {
  return Number.isFinite(Value) ? String(Math.round(Value)) : "—";
}

function ScoreValueChip({
  Score,
  MaxScore,
}: {
  Score: number;
  MaxScore: number;
}) {
  const DisplayValue =
    Number.isFinite(Score) && Number.isFinite(MaxScore)
      ? `${WholeNumberLabel(Score)} / ${WholeNumberLabel(MaxScore)}`
      : "—";
  const ClassName =
    DisplayValue === "—"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={`math-badge whitespace-nowrap ${ClassName}`}>
      {DisplayValue}
    </span>
  );
}

function AccuracyValueChip({ Accuracy }: { Accuracy: number }) {
  const DisplayValue = Number.isFinite(Accuracy)
    ? `${WholeNumberLabel(Accuracy)}%`
    : "—";
  // green only at or above the benchmark (a 0% used to show green)
  const ClassName =
    DisplayValue === "—"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : Accuracy >= 70
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <span className={`math-badge whitespace-nowrap ${ClassName}`}>
      {DisplayValue}
    </span>
  );
}

function DpsAttemptRecordsTable({
  Rows,
  Router,
}: {
  Rows: AnyRecord[];
  Router: ReturnType<typeof useRouter>;
}) {
  const DefaultSortKey: DpsHistorySortKey = "completedDate";
  const DefaultSortDirection: SortDirection = "desc";
  const [SortKey, SetSortKey] = useState<DpsHistorySortKey>(DefaultSortKey);
  const [SortDirectionValue, SetSortDirectionValue] =
    useState<SortDirection>(DefaultSortDirection);

  function ToggleSort(Key: DpsHistorySortKey) {
    const Next = SortDirectionFor(
      Key,
      SortKey,
      SortDirectionValue,
      DefaultSortKey,
      DefaultSortDirection,
    );
    SetSortKey(Next.Key);
    SetSortDirectionValue(Next.Direction);
  }

  const SortedRows = useMemo(() => {
    const ValueFor = (Row: AnyRecord) => {
      if (SortKey === "dps") return PickFirstNumber(Row, ["dpsNumber"], 0);
      if (SortKey === "teacher")
        return `${PickFirstString(Row, ["teacherName"], "")} ${PickFirstString(Row, ["teacherCode"], "")}`;
      if (SortKey === "attempt") return AttemptLabel(Row);
      if (SortKey === "status") return AttemptDisplayStatus(Row);
      if (SortKey === "score") return PickFirstNumber(Row, ["score"], -1);
      if (SortKey === "accuracy")
        return PickFirstNumber(Row, ["accuracyPercentage"], -1);
      if (SortKey === "benchmark")
        return PickFirstString(Row, ["benchmarkStatus"], "");
      if (SortKey === "timeTaken")
        return PickFirstNumber(Row, ["timeTakenSeconds", "durationSeconds", "timeTaken"], -1);
      return PickFirstString(Row, ["completedDate", "submittedAt"], "");
    };
    return Rows.slice().sort((First, Second) => {
      const Result = CompareSortValues(ValueFor(First), ValueFor(Second));
      return SortDirectionValue === "asc" ? Result : -Result;
    });
  }, [Rows, SortKey, SortDirectionValue]);

  return (
    <div className="math-table math-student-history-table math-dps-history-table">
      <div className="flex justify-end border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <ResultsSortDropdown
          ClassName="w-full sm:w-auto sm:min-w-[260px]"
          Fields={DPS_HISTORY_SORT_FIELDS}
          SortKey={SortKey}
          SortDirectionValue={SortDirectionValue}
          OnSelectField={ToggleSort}
          OnToggleDirection={() => ToggleSort(SortKey)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "dps"} direction={SortDirectionValue} onClick={() => ToggleSort("dps")}>DPS</SortableHeader></th>
            <th><SortableHeader active={SortKey === "teacher"} direction={SortDirectionValue} onClick={() => ToggleSort("teacher")}>Teacher</SortableHeader></th>
            <th><SortableHeader active={SortKey === "attempt"} direction={SortDirectionValue} onClick={() => ToggleSort("attempt")} align="center">Attempt</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")} align="center">Status</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")} align="center">Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "accuracy"} direction={SortDirectionValue} onClick={() => ToggleSort("accuracy")} align="center">Accuracy</SortableHeader></th>
            <th><SortableHeader active={SortKey === "benchmark"} direction={SortDirectionValue} onClick={() => ToggleSort("benchmark")} align="center">Benchmark</SortableHeader></th>
            <th><SortableHeader active={SortKey === "completedDate"} direction={SortDirectionValue} onClick={() => ToggleSort("completedDate")}>Completion Date</SortableHeader></th>
            <th><SortableHeader active={SortKey === "timeTaken"} direction={SortDirectionValue} onClick={() => ToggleSort("timeTaken")}><span className="math-table-header-label-wrap">Time<br />Taken</span></SortableHeader></th>
            <th><span className="math-table-header-label math-table-header-label-nowrap">Review</span></th>
          </tr>
        </thead>
        <tbody>
          {SortedRows.map((Row, Index) => {
            const AttemptId = PickFirstString(Row, ["attemptId"], `attempt-${Index}`);
            const Score = PickFirstNumber(Row, ["score"], Number.NaN);
            const MaxScore = PickFirstNumber(Row, ["maxScore"], Number.NaN);
            const Accuracy = PickFirstNumber(Row, ["accuracyPercentage"], Number.NaN);
            const RequiresAttention = String(PickFirstString(Row, ["requiresAttention"], "false")) === "true";
            return (
              <tr key={AttemptId}>
                <td><p className="font-black">DPS {PickFirstNumber(Row, ["dpsNumber"], 0) || "—"}</p></td>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["teacherName"], "Not Assigned")}</p>
                  {PickFirstString(Row, ["teacherCode"], "") ? (
                    <p className="text-xs text-slate-500">{PickFirstString(Row, ["teacherCode"], "")}</p>
                  ) : null}
                </td>
                <td className="math-table-chip-cell text-center"><AttemptChip Label={AttemptLabel(Row)} /></td>
                <td className="math-table-chip-cell text-center"><AttemptStatusPill Row={Row} /></td>
                <td className="math-table-chip-cell text-center"><ScoreValueChip Score={Score} MaxScore={MaxScore} /></td>
                <td className="math-table-chip-cell text-center"><AccuracyValueChip Accuracy={Accuracy} /></td>
                <td className="math-table-chip-cell text-center">
                  <BenchmarkBadge
                    status={PickFirstString(Row, ["benchmarkStatus"], "PENDING")}
                    requiresAttention={RequiresAttention}
                    percentage={PickFirstNumber(Row, ["benchmarkPercentage"], 70)}
                  />
                </td>
                <td className="math-history-date-cell">{FormatDate(PickFirstString(Row, ["completedDate", "submittedAt"], "-"))}</td>
                <td>{FormatTimeTaken(PickFirstNumber(Row, ["timeTakenSeconds", "durationSeconds", "timeTaken"], Number.NaN))}</td>
                <td>
                  <button className="math-role-action-button math-history-review-button" onClick={() => Router.push(`/admin/results/${AttemptId}`)}>
                    <Eye size={14} />
                    <span>View</span>
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

function AssessmentAttemptRecordsTable({
  Rows,
  Router,
}: {
  Rows: AnyRecord[];
  Router: ReturnType<typeof useRouter>;
}) {
  const DefaultSortKey: AssessmentHistorySortKey = "completedDate";
  const DefaultSortDirection: SortDirection = "desc";
  const [SortKey, SetSortKey] = useState<AssessmentHistorySortKey>(DefaultSortKey);
  const [SortDirectionValue, SetSortDirectionValue] =
    useState<SortDirection>(DefaultSortDirection);

  function ToggleSort(Key: AssessmentHistorySortKey) {
    const Next = SortDirectionFor(
      Key,
      SortKey,
      SortDirectionValue,
      DefaultSortKey,
      DefaultSortDirection,
    );
    SetSortKey(Next.Key);
    SetSortDirectionValue(Next.Direction);
  }

  const SortedRows = useMemo(() => {
    const ValueFor = (Row: AnyRecord) => {
      if (SortKey === "assessment")
        return PickFirstString(Row, ["assessmentTitle", "assignmentTitle"], "Assessment");
      if (SortKey === "attempt") return AttemptLabel(Row);
      if (SortKey === "status") return AttemptDisplayStatus(Row);
      if (SortKey === "score") return PickFirstNumber(Row, ["score"], -1);
      if (SortKey === "accuracy")
        return PickFirstNumber(Row, ["accuracyPercentage", "percentage"], -1);
      if (SortKey === "timeTaken")
        return PickFirstNumber(Row, ["timeTakenSeconds", "durationSeconds", "timeTaken"], -1);
      return PickFirstString(Row, ["completedDate", "submittedAt"], "");
    };
    return Rows.slice().sort((First, Second) => {
      const Result = CompareSortValues(ValueFor(First), ValueFor(Second));
      return SortDirectionValue === "asc" ? Result : -Result;
    });
  }, [Rows, SortKey, SortDirectionValue]);

  return (
    <div className="math-table math-student-history-table math-assessment-history-table">
      <div className="flex justify-end border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <ResultsSortDropdown
          ClassName="w-full sm:w-auto sm:min-w-[260px]"
          Fields={ASSESSMENT_HISTORY_SORT_FIELDS}
          SortKey={SortKey}
          SortDirectionValue={SortDirectionValue}
          OnSelectField={ToggleSort}
          OnToggleDirection={() => ToggleSort(SortKey)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "assessment"} direction={SortDirectionValue} onClick={() => ToggleSort("assessment")}>Assessment</SortableHeader></th>
            <th><SortableHeader active={SortKey === "attempt"} direction={SortDirectionValue} onClick={() => ToggleSort("attempt")} align="center">Attempt</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")} align="center">Status</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")} align="center">Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "accuracy"} direction={SortDirectionValue} onClick={() => ToggleSort("accuracy")} align="center">Accuracy</SortableHeader></th>
            <th><SortableHeader active={SortKey === "completedDate"} direction={SortDirectionValue} onClick={() => ToggleSort("completedDate")}>Completion Date</SortableHeader></th>
            <th><SortableHeader active={SortKey === "timeTaken"} direction={SortDirectionValue} onClick={() => ToggleSort("timeTaken")}><span className="math-table-header-label-wrap">Time<br />Taken</span></SortableHeader></th>
            <th><span className="math-table-header-label math-table-header-label-nowrap">Review</span></th>
          </tr>
        </thead>
        <tbody>
          {SortedRows.map((Row, Index) => {
            const Score = PickFirstNumber(Row, ["score"], Number.NaN);
            const MaxScore = PickFirstNumber(Row, ["maxScore", "totalMarks"], Number.NaN);
            const Accuracy = PickFirstNumber(Row, ["accuracyPercentage", "percentage"], Number.NaN);
            const AttemptId = PickFirstString(Row, ["attemptId", "assessmentAttemptId"], "");
            return (
              <tr key={`${PickFirstString(Row, ["attemptId", "assessmentAttemptId"], "assessment")}-${Index}`}>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["assessmentTitle", "assignmentTitle"], "Assessment")}</p>
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["moduleCode"], "—")} → {PickFirstString(Row, ["levelCode"], "—")}</p>
                </td>
                <td className="math-table-chip-cell text-center"><AttemptChip Label={AttemptLabel(Row)} /></td>
                <td className="math-table-chip-cell text-center"><StatusChip Label={AttemptDisplayStatus(Row)} /></td>
                <td className="math-table-chip-cell text-center"><ScoreValueChip Score={Score} MaxScore={MaxScore} /></td>
                <td className="math-table-chip-cell text-center"><AccuracyValueChip Accuracy={Accuracy} /></td>
                <td className="math-history-date-cell">{FormatDate(PickFirstString(Row, ["completedDate", "submittedAt"], "-"))}</td>
                <td>{FormatTimeTaken(PickFirstNumber(Row, ["timeTakenSeconds", "durationSeconds", "timeTaken"], Number.NaN))}</td>
                <td>
                  {AttemptId ? (
                    <button
                      className="math-role-action-button math-history-review-button"
                      onClick={() => Router.push(`/assessment-result/${AttemptId}?viewer=admin`)}
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>
                  ) : (
                    <span className="text-sm font-bold text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LevelProgressionSummary({
  CurrentLevelRow,
  LatestPromotionRow,
  PromotionCount,
}: {
  CurrentLevelRow?: AnyRecord;
  LatestPromotionRow?: AnyRecord;
  PromotionCount: number;
}) {
  const HasPromotion = Boolean(LatestPromotionRow);
  const CurrentLevel = PickFirstString(
    CurrentLevelRow,
    ["levelCode"],
    "Current Level",
  );
  const FromLevel = PickFirstString(LatestPromotionRow, ["fromLevelCode"], "—");
  const ToLevel = PickFirstString(LatestPromotionRow, ["toLevelCode"], "—");
  const PromotedDate = FormatDate(
    PickFirstString(LatestPromotionRow, ["promotedAt"], "-"),
  );
  const PromotedBy = HasPromotion
    ? PickFirstString(LatestPromotionRow, ["promotedByName"], "Admin")
    : "—";

  return (
    <div className="overflow-hidden rounded-[30px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm ring-1 ring-violet-100">
            <GraduationCap size={22} />
          </div>
          <div>
            <p className="math-block-header text-violet-700">
              <ArrowUpCircle size={14} />Level Progression Summary
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {HasPromotion
                ? "Promotion Journey Recorded"
                : "No Promotion Recorded Yet"}
            </h3>
            <p className="mt-2 max-w-5xl text-sm font-semibold leading-6 text-slate-600">
              {HasPromotion
                ? "This student's level movement record is preserved with assessment result and admin action details."
                : "Promotion history will appear here after Admin promotes this student for the selected scope."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <PromotionChip Label={HasPromotion ? "Promoted" : "Not Available"} />
          <span className="math-badge whitespace-nowrap border-violet-200 bg-white text-violet-700">
            {PromotionCount} Promotion{PromotionCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label="Current Level" value={CurrentLevel} />
        <MiniMetric label="From Level" value={FromLevel} />
        <MiniMetric label="To Level" value={ToLevel} />
        <MiniMetric label="Promoted Date" value={PromotedDate} />
        <MiniMetric label="Promoted By" value={PromotedBy} />
      </div>
    </div>
  );
}

function CompletedLevelModuleBlock({
  ModuleGroup,
  ExpandedKeys,
  ToggleExpanded,
}: {
  ModuleGroup: CompletedLevelModuleGroup;
  ExpandedKeys: Record<string, boolean>;
  ToggleExpanded: (Key: string) => void;
}) {
  const Expanded = ExpandedKeys[ModuleGroup.Key] === true;
  return (
    <div className="math-completed-level-module-block rounded-[24px] border border-blue-100 bg-blue-50/35 p-3 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => ToggleExpanded(ModuleGroup.Key)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <HierarchyToggle Expanded={Expanded} />
          <div className="min-w-0">
            <p className="math-block-header"><Boxes size={14} />Module</p>
            <h4 className="mt-1 truncate text-base font-black text-slate-950">
              {ModuleGroup.Label}
            </h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {ModuleGroup.SubLabel}
            </p>
          </div>
        </div>
        <span className="math-badge whitespace-nowrap border-blue-200 bg-white text-blue-700">
          {ModuleGroup.Levels.length} Level
          {ModuleGroup.Levels.length === 1 ? "" : "s"}
        </span>
      </button>
      {Expanded ? (
        <div className="mt-3 space-y-3">
          {ModuleGroup.Levels.map((Row, Index) => {
            const LevelKey = `${ModuleGroup.Key}|completed-level-${PickFirstString(Row, ["levelId", "levelCode"], "level")}-${Index}`;
            return (
              <CompletedLevelSummaryBlock
                key={LevelKey}
                Row={Row}
                LevelKey={LevelKey}
                ExpandedKeys={ExpandedKeys}
                ToggleExpanded={ToggleExpanded}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CompletedLevelSummaryBlock({
  Row,
  LevelKey,
  ExpandedKeys,
  ToggleExpanded,
}: {
  Row: AnyRecord;
  LevelKey: string;
  ExpandedKeys: Record<string, boolean>;
  ToggleExpanded: (Key: string) => void;
}) {
  const Expanded = ExpandedKeys[LevelKey] === true;
  const RequiredDps = PickFirstNumber(Row, ["requiredDps"], 0);
  const ClearedDps = PickFirstNumber(Row, ["completedDps", "passedDps"], 0);
  const AverageAccuracy = Math.round(
    PickFirstNumber(Row, ["averageAccuracy", "accuracyPercentage"], 0),
  );
  return (
    <div className="math-completed-level-summary-block rounded-[22px] border border-cyan-100 bg-white/90 p-3">
      <button
        type="button"
        className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between"
        onClick={() => ToggleExpanded(LevelKey)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <HierarchyToggle Expanded={Expanded} />
          <div className="min-w-0">
            <p className="math-block-header"><Route size={14} />Level</p>
            <h5 className="mt-1 text-base font-black text-slate-950">
              {PickFirstString(Row, ["levelCode"], "Level")} ·{" "}
              {PickFirstString(Row, ["levelName"], "—")}
            </h5>
          </div>
        </div>
        <PromotionChip Label="Promoted" />
      </button>
      {Expanded ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Total DPS" value={String(RequiredDps)} />
          <MiniMetric label="DPS Cleared" value={String(ClearedDps)} />
          <MiniMetric label="Average Accuracy" value={`${AverageAccuracy}%`} />
          <MiniMetric label="Status" value="Promoted" />
        </div>
      ) : null}
    </div>
  );
}

function CurrentLevelProgressBlock({ Row }: { Row: AnyRecord }) {
  // the server's counts: each DPS once, by its shared state
  const CompletedDps = PickFirstNumber(Row, ["clearedDps", "completedDps"], 0);
  const NeedsReattempt = PickFirstNumber(Row, ["needsReattempt"], 0);
  const AttemptedDps = PickFirstNumber(Row, ["attemptedDps"], 0);
  const RequiredDps = Math.max(PickFirstNumber(Row, ["requiredDps"], 0), 1);
  const ProgressValue = Math.min(
    100,
    Math.round((CompletedDps / RequiredDps) * 100),
  );
  return (
    <div className="math-current-level-progress-block rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Active Learning Level
          </p>
          <h4 className="mt-1 text-lg font-black text-slate-950">
            {PickFirstString(Row, ["levelCode"], "Level")} ·{" "}
            {PickFirstString(Row, ["levelName"], "Current Level")}
          </h4>
          <p className="mt-1 text-sm text-slate-600">
            {`${CompletedDps} of ${RequiredDps} DPS cleared`}
            {NeedsReattempt ? ` · ${NeedsReattempt} need a re-attempt` : ""}
            {AttemptedDps > CompletedDps + NeedsReattempt ? ` · ${AttemptedDps - CompletedDps - NeedsReattempt} in progress` : ""}
          </p>
        </div>
        <div className="min-w-[180px] text-right">
          <p className="text-2xl font-black text-slate-950">{ProgressValue}%</p>
          <p className="text-xs font-bold text-slate-500">Level Progress</p>
        </div>
      </div>
      <div className="math-progress-track mt-4 h-3 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${ProgressValue}%` }}
        />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-900/80 dark:shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function PerformanceChip({ Label }: { Label: string }) {
  const ClassName =
    Label === "Excellence Zone"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : Label === "Growth Zone"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : Label === "Needs Re-Attempt"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`math-badge whitespace-nowrap ${ClassName}`}>{Label}</span>
  );
}

function ReadinessChip({ Label }: { Label: string }) {
  const ClassName =
    Label === "Ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`math-badge whitespace-nowrap ${ClassName}`}>{Label}</span>
  );
}

function PromotionChip({ Label }: { Label: string }) {
  const UpperLabel = Label.toUpperCase();
  const DisplayLabel = UpperLabel === "PROMOTED" ? "Promoted" : Label;
  const ClassName = UpperLabel.includes("PROMOTED")
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : UpperLabel.includes("AVAILABLE")
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`math-badge whitespace-nowrap ${ClassName}`}>
      {DisplayLabel}
    </span>
  );
}

function StatusChip({ Label }: { Label: string }) {
  const NormalizedLabel = Label.replace(/_/g, " ").replace(/\b\w/g, (Value) =>
    Value.toUpperCase(),
  );
  const UpperLabel = Label.toUpperCase();
  const ClassName =
    UpperLabel.includes("AWAITING") ||
    UpperLabel.includes("NOT YET ASSIGNED")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : UpperLabel.includes("RE-ATTEMPT") && (UpperLabel.includes("OPEN") || UpperLabel.includes("IN PROGRESS"))
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : UpperLabel === "IN PROGRESS" || UpperLabel === "NOT STARTED"
          ? "border-amber-200 bg-amber-50 text-amber-700"
        : UpperLabel === "BELOW BENCHMARK" || UpperLabel === "NOT SUBMITTED" || UpperLabel === "NOT ATTEMPTED"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : UpperLabel.includes("NEEDS") ||
    UpperLabel.includes("BELOW") ||
    UpperLabel.includes("FAIL")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : UpperLabel.includes("PENDING")
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : CompletedStatuses.has(UpperLabel) ||
            UpperLabel.includes("CLEARED") ||
            UpperLabel.includes("BENCHMARK")
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`math-badge math-status-chip whitespace-nowrap ${ClassName}`}>
      {NormalizedLabel}
    </span>
  );
}

function SelectCard({
  label,
  value,
  onChange,
  options,
  placeholder,
  allOption,
  disabled,
  className,
  hidden,
}: {
  className?: string;
  hidden?: boolean;
  label: string;
  value: string;
  onChange: (Value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allOption?: { value: string; label: string };
  disabled?: boolean;
}) {
  return (
    <div className={`math-card min-w-0 p-4 ${className ?? ""}`} hidden={hidden}>
      <label className="math-label">{label}</label>
      <select
        aria-label={label}
        className="math-select mt-3"
        value={value}
        onChange={(Event) => onChange(Event.target.value)}
        disabled={disabled}
      >
        {placeholder && placeholder !== allOption?.label ? (
          <option value="">{placeholder}</option>
        ) : null}
        {!allOption && !placeholder ? (
          <option value="">{`Choose ${label}`}</option>
        ) : null}
        {allOption ? (
          <option value={allOption.value}>{allOption.label}</option>
        ) : null}
        {options.map((Option) => (
          <option key={Option.value} value={Option.value}>
            {Option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  compact?: boolean;
}) {
  // the admin number tile (2026-10, admin revamp)
  return (
    <div className={`math-teacher-light-metric-card relative min-w-0 overflow-hidden rounded-[22px] border p-5`} data-compact={compact || undefined}>
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </div>
  );
}
