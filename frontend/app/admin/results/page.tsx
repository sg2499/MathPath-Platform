"use client";

import { AppShell } from "@/components/common/AppShell";
import { BenchmarkBadge } from "@/components/common/BenchmarkBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { SortableHeader } from "@/components/common/SortableHeader";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  downloadAdminLearningPerformanceReport,
  downloadAdminStudentReport,
  getAdminLearningPerformance,
  getAdminStudents,
  getAdminTeachers,
  getDpsByLesson,
  getLessons,
  getLevels,
  getModules,
  getStudentReport,
} from "@/lib/api/admin";
import { formatMathPathDateTime } from "@/lib/date";
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
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Layers3,
  Search,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type AnyRecord = Record<string, unknown>;
type ResultsMode = "LEARNING" | "STUDENT";
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
type StudentHistoryDetailTab = "CURRENT" | "DPS" | "ASSESSMENT" | "PROMOTION";

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
  if (!Value || Value === "-") return "-";
  return formatMathPathDateTime(String(Value));
}

function FormatDateOnly(Value: unknown) {
  if (!Value || Value === "-") return "-";
  const DateValue = new Date(String(Value));
  if (Number.isNaN(DateValue.getTime())) return FormatDate(Value);
  return DateValue.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function FormatTimeTaken(Value: unknown) {
  const TotalSeconds = NumberValue(Value, Number.NaN);
  if (!Number.isFinite(TotalSeconds)) return "-";
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
    const ResolvedRow = SortedRows.find(IsBenchmarkMetAttempt) || SortedRows[0];
    return {
      Rows: GroupRows,
      CurrentRow: ResolvedRow,
      Status: AttemptDisplayStatus(ResolvedRow),
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
    IsBenchmarkMetAttempt(Group.CurrentRow),
  ).length;
}

function CurrentNeedsReAttemptCount(Rows: AnyRecord[]) {
  return BuildCurrentAttemptGroups(Rows).filter(
    (Group) =>
      !IsBenchmarkMetAttempt(Group.CurrentRow) &&
      IsCompletedAttempt(Group.CurrentRow),
  ).length;
}

function CurrentAverageAccuracy(Rows: AnyRecord[]) {
  const CurrentRows = BuildCurrentAttemptGroups(Rows).map(
    (Group) => Group.CurrentRow,
  );
  const Percentages = CurrentRows.map(RowPercent).filter((Value) =>
    Number.isFinite(Value),
  );
  if (!Percentages.length) return 0;
  return Math.round(
    Percentages.reduce((Total, Value) => Total + Value, 0) / Percentages.length,
  );
}


function VisibleAttemptAverageAccuracy(Rows: AnyRecord[]) {
  const Percentages = Rows.map(RowPercent).filter((Value) =>
    Number.isFinite(Value),
  );
  if (!Percentages.length) return 0;
  return Math.round(
    Percentages.reduce((Total, Value) => Total + Value, 0) / Percentages.length,
  );
}

function StudentAverageAccuracyKey(Row: AnyRecord, Index: number) {
  const StudentId = PickFirstString(Row, ["studentId"], "");
  if (StudentId && StudentId !== "-") return `student-id:${StudentId}`;

  const StudentCode = PickFirstString(Row, ["studentCode"], "");
  if (StudentCode && StudentCode !== "-") return `student-code:${StudentCode}`;

  const StudentName = PickFirstString(Row, ["studentName"], "");
  if (StudentName && StudentName !== "-") return `student-name:${StudentName}`;

  return `student-row:${Index}`;
}

function CurrentAverageAccuracyByStudent(Rows: AnyRecord[]) {
  const RowsByStudent = new Map<string, AnyRecord[]>();

  Rows.forEach((Row, Index) => {
    const StudentKey = StudentAverageAccuracyKey(Row, Index);
    const ExistingRows = RowsByStudent.get(StudentKey) ?? [];
    ExistingRows.push(Row);
    RowsByStudent.set(StudentKey, ExistingRows);
  });

  const StudentAverages = Array.from(RowsByStudent.values())
    .map((StudentRows) => CurrentAverageAccuracy(StudentRows))
    .filter((Value) => Number.isFinite(Value));

  if (!StudentAverages.length) return 0;

  return Math.round(
    StudentAverages.reduce((Total, Value) => Total + Value, 0) /
      StudentAverages.length,
  );
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
    IsBenchmarkMetAttempt(Group.CurrentRow),
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

export default function AdminResultsPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();

  const ResultsStateKey = CreatePersistedUiStateKey("admin", "performance-reports");
  const [Mode, SetMode] = usePersistentUiState<ResultsMode>(CreatePersistedUiStateKey(ResultsStateKey, "mode"), "LEARNING");
  const [SelectedTeacherId, SetSelectedTeacherId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "teacher-filter"), "");
  const [SelectedStudentId, SetSelectedStudentId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "student-filter"), "");
  const [SelectedModuleId, SetSelectedModuleId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "module-filter"), "");
  const [SelectedLevelId, SetSelectedLevelId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "level-filter"), "");
  const [SelectedLessonId, SetSelectedLessonId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "lesson-filter"), "");
  const [SelectedDpsId, SetSelectedDpsId] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "dps-filter"), "");
  const [SearchText, SetSearchText] = usePersistentUiState(CreatePersistedUiStateKey(ResultsStateKey, "search"), "");
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
    ],
    queryFn: () =>
      getAdminLearningPerformance({
        teacherId: IdForApi(SelectedTeacherId),
        moduleId: IdForApi(SelectedModuleId),
        levelId: IdForApi(SelectedLevelId),
        lessonId: IdForApi(SelectedLessonId),
        dpsId: IdForApi(SelectedDpsId),
      }),
    enabled: Ready && Mode === "LEARNING" && Boolean(SelectedModuleId),
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

  const StudentAssessmentScopeReportQuery = useQuery({
    queryKey: [
      "admin-results-student-assessment-scope-report",
      SelectedStudentId,
      SelectedModuleId,
      SelectedLevelId,
    ],
    queryFn: () =>
      getStudentReport({
        studentId: SelectedStudentId,
        moduleId: IdForApi(SelectedModuleId),
        levelId: IdForApi(SelectedLevelId),
      }),
    enabled:
      Ready &&
      Mode === "STUDENT" &&
      Boolean(SelectedStudentId) &&
      SelectedStudentId !== AllValue,
  });

  const ParentReportScopeQuery = useQuery({
    queryKey: [
      "admin-results-parent-report-scope",
      SelectedStudentId,
      SelectedModuleId,
    ],
    queryFn: () =>
      getStudentReport({
        studentId: SelectedStudentId,
        moduleId: IdForApi(SelectedModuleId),
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

  useEffect(() => {
    SetSelectedLevelId("");
    SetSelectedLessonId("");
    SetSelectedDpsId("");
  }, [SelectedModuleId]);

  useEffect(() => {
    SetSelectedLessonId("");
    SetSelectedDpsId("");
  }, [SelectedLevelId]);

  useEffect(() => SetSelectedDpsId(""), [SelectedLessonId]);

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
  const LearningSummary =
    (RawLearningData?.summary as AnyRecord | undefined) ?? {};

  const RawStudentData = StudentReportQuery.data as AnyRecord | undefined;
  const RawAssessmentScopeStudentData =
    StudentAssessmentScopeReportQuery.data as AnyRecord | undefined;
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
    () => AsArray(RawAssessmentScopeStudentData?.assessmentHistory),
    [RawAssessmentScopeStudentData],
  );
  const StudentPromotionRows = useMemo(
    () => AsArray(RawStudentData?.promotionHistory),
    [RawStudentData],
  );

  const RawParentReportScopeData = ParentReportScopeQuery.data as
    | AnyRecord
    | undefined;
  const StudentJourneyLevelRows = useMemo(
    () => AsArray(RawParentReportScopeData?.levelProgress),
    [RawParentReportScopeData],
  );
  const StudentJourneyPromotionRows = useMemo(
    () => AsArray(RawParentReportScopeData?.promotionHistory),
    [RawParentReportScopeData],
  );

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

  const StudentHistoryMetricValues = useMemo(() => {
    const DpsCurrentRows = BuildCurrentAttemptGroups(
      FilteredStudentAttempts,
    ).map((Group) => Group.CurrentRow);
    const AssessmentCurrentRows = BuildCurrentAttemptGroups(
      FilteredAssessmentRows,
    ).map((Group) => Group.CurrentRow);
    const DpsClearedCount = DpsCurrentRows.filter((Row) =>
      IsBenchmarkMetAttempt(Row),
    ).length;
    const AssessmentClearedCount = AssessmentCurrentRows.filter((Row) =>
      IsBenchmarkMetAttempt(Row),
    ).length;
    const LevelKeys = new Set(
      AssessmentCurrentRows.filter((Row) => IsBenchmarkMetAttempt(Row))
        .map((Row) => PickFirstString(Row, ["levelId", "levelCode"], ""))
        .filter(Boolean),
    );
    const ModuleKeys = new Set(
      AssessmentCurrentRows.filter((Row) => IsBenchmarkMetAttempt(Row))
        .map((Row) => PickFirstString(Row, ["moduleId", "moduleCode"], ""))
        .filter(Boolean),
    );

    return {
      dpsCleared: DpsClearedCount,
      assessmentsCleared: AssessmentClearedCount,
      levelsCleared:
        LevelKeys.size ||
        PickFirstNumber(
          StudentSummary,
          ["levelsCleared", "levelsCompleted"],
          0,
        ),
      modulesCleared:
        ModuleKeys.size ||
        PickFirstNumber(
          StudentSummary,
          ["modulesCleared", "modulesCompleted"],
          0,
        ),
      dpsAverageAccuracy: VisibleAttemptAverageAccuracy(FilteredStudentAttempts),
      assessmentAverageAccuracy: VisibleAttemptAverageAccuracy(FilteredAssessmentRows),
    };
  }, [FilteredStudentAttempts, FilteredAssessmentRows, StudentSummary]);

  const Error =
    TeachersQuery.error ||
    StudentsQuery.error ||
    ModulesQuery.error ||
    LevelsQuery.error ||
    LessonsQuery.error ||
    DpsQuery.error ||
    LearningPerformanceQuery.error ||
    StudentReportQuery.error ||
    StudentAssessmentScopeReportQuery.error;
  const IsLoading =
    TeachersQuery.isLoading ||
    StudentsQuery.isLoading ||
    ModulesQuery.isLoading ||
    LevelsQuery.isLoading ||
    LessonsQuery.isLoading ||
    DpsQuery.isLoading ||
    (Mode === "LEARNING" && LearningPerformanceQuery.isLoading) ||
    (Mode === "STUDENT" &&
      (StudentReportQuery.isLoading ||
        StudentAssessmentScopeReportQuery.isLoading));

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
    if (!SelectedModuleId) return "Choose Module";
    if (SelectedDps)
      return `DPS ${SelectedDps.dpsNumber}: ${SelectedDps.dpsTitle}`;
    if (SelectedLesson)
      return `Lesson ${SelectedLesson.lessonNumber}: ${SelectedLesson.lessonTitle}`;
    if (SelectedLevel)
      return `${SelectedLevel.levelCode}: ${SelectedLevel.levelName}`;
    if (SelectedModuleId === AllValue) return "All Modules";
    return SelectedModule
      ? `${SelectedModule.moduleCode}: ${SelectedModule.moduleName}`
      : "Learning Performance";
  }

  function LearningFileName() {
    const ScopeCode = SelectedDps
      ? `DPS-${SelectedDps.dpsNumber}`
      : SelectedLesson
        ? `Lesson-${SelectedLesson.lessonNumber}`
        : SelectedLevel?.levelCode || SelectedModule?.moduleCode || "Scope";
    return `${SafeSlug(["MP", "Learning", "Performance", ScopeCode, TodayLabel()].join("_"))}.xlsx`;
  }

  function StudentFileName() {
    return `${SafeSlug(["MP", "Student", "History", SelectedStudent?.studentCode || "Student", TodayLabel()].join("_"))}.xlsx`;
  }

  async function HandleExport() {
    try {
      SetExportingMode(Mode);
      if (Mode === "LEARNING") {
        if (!SelectedModuleId) return;
        const BlobValue = await downloadAdminLearningPerformanceReport({
          teacherId: IdForApi(SelectedTeacherId),
          moduleId: IdForApi(SelectedModuleId),
          levelId: IdForApi(SelectedLevelId),
          lessonId: IdForApi(SelectedLessonId),
          dpsId: IdForApi(SelectedDpsId),
          timezone: "Asia/Kolkata",
          timezoneOffsetMinutes: 330,
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
          timezone: "Asia/Kolkata",
          timezoneOffsetMinutes: 330,
        });
        DownloadBlob(BlobValue, StudentFileName());
      }
    } catch (ErrorValue) {
      const MessageValue =
        typeof ErrorValue === "object" &&
        ErrorValue !== null &&
        "message" in ErrorValue
          ? String(
              (ErrorValue as { message?: unknown }).message ??
                "Report export failed",
            )
          : "Report export failed";
      console.warn(`Report export could not be completed: ${MessageValue}`);
      window.alert(
        "Report export could not be completed. Please restart the backend and try again.",
      );
    } finally {
      SetExportingMode(null);
    }
  }

  if (!Ready) return null;

  const ExportDisabled =
    Mode === "LEARNING"
      ? !SelectedModuleId
      : !SelectedStudentId || SelectedStudentId === AllValue;
  const SearchPlaceholder =
    Mode === "LEARNING" ? "Search Performance" : "Search History";
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
  const CurrentLevelRow = RawCurrentLevelRow
    ? BuildCurrentLevelTrackerRow(RawCurrentLevelRow, StudentDpsAttempts)
    : undefined;
  const CurrentLevelProgress = CurrentLevelRow
    ? Math.round(
        (PickFirstNumber(CurrentLevelRow, ["completedDps"], 0) /
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
              : SelectedTeacherId === AllValue
                ? "All Teachers"
                : "Choose Teacher",
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
            SelectedLevelId === AllValue
              ? "All Levels"
              : SelectedLevel
                ? `${SelectedLevel.levelCode} - ${SelectedLevel.levelName}`
                : "Choose Level",
          ],
          [
            "Lesson",
            SelectedLessonId === AllValue
              ? "All Lessons"
              : SelectedLesson
                ? `Lesson ${SelectedLesson.lessonNumber} - ${SelectedLesson.lessonTitle}`
                : "Choose Lesson",
          ],
          [
            "DPS",
            SelectedDpsId === AllValue
              ? "All DPS"
              : SelectedDps
                ? `DPS ${SelectedDps.dpsNumber} - ${SelectedDps.dpsTitle}`
                : "Choose DPS",
          ],
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
            SelectedLevelId === AllValue
              ? "All Levels"
              : SelectedLevel
                ? `${SelectedLevel.levelCode} - ${SelectedLevel.levelName}`
                : "Choose Level",
          ],
          [
            "Lesson",
            SelectedLessonId === AllValue
              ? "All Lessons"
              : SelectedLesson
                ? `Lesson ${SelectedLesson.lessonNumber} - ${SelectedLesson.lessonTitle}`
                : "Choose Lesson",
          ],
          [
            "DPS",
            SelectedDpsId === AllValue
              ? "All DPS"
              : SelectedDps
                ? `DPS ${SelectedDps.dpsNumber} - ${SelectedDps.dpsTitle}`
                : "Choose DPS",
          ],
        ];

  return (
    <AppShell title="Performance Reports">
      <section className="math-hero math-slide-up py-7">
        <div className="relative z-10">
          <p className="math-kicker">Admin Reports</p>
          <h1 className="math-title">Performance Reports</h1>
          <p className="math-subtitle">
            Review learning performance and student history with
            hierarchy-aware, Excel-native reports.
          </p>
        </div>
      </section>

      <section className="math-report-mode-tabs-section mt-5 math-card p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <ModeButton
            active={Mode === "LEARNING"}
            icon={<ClipboardCheck size={16} />}
            kicker="Learning Scope"
            title="Learning Performance"
            text="Module, level, lesson, and DPS performance from one place."
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
            text="Complete student journey with module, level, lesson, and DPS drilldown."
            onClick={() => {
              SetMode("STUDENT");
              SetSearchText("");
            }}
          />
        </div>
      </section>

      {Error ? (
        <div className="mt-6">
          <ErrorState message={apiErrorMessage(Error)} />
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 xl:grid-cols-6">
        {Mode === "LEARNING" ? (
          <SelectCard
            label="Teacher"
            value={SelectedTeacherId}
            onChange={SetSelectedTeacherId}
            options={(TeachersQuery.data ?? []).map(
              (Teacher: AdminTeacher) => ({
                value: Teacher.teacherId,
                label: `${Teacher.teacherName} (${Teacher.teacherCode})`,
              }),
            )}
            placeholder="Choose Teacher"
            allOption={{ value: AllValue, label: "All Teachers" }}
          />
        ) : (
          <SelectCard
            label="Student"
            value={SelectedStudentId}
            onChange={SetSelectedStudentId}
            options={ReportStudents.map((Student: AdminStudent) => ({
              value: Student.studentId,
              label: `${Student.studentName || Student.fullName} (${Student.studentCode})`,
            }))}
            placeholder="Choose Student"
            allOption={{ value: AllValue, label: "All Students" }}
          />
        )}
        <SelectCard
          label="Module"
          value={SelectedModuleId}
          onChange={SetSelectedModuleId}
          options={(ModulesQuery.data ?? []).map((Module: ModuleItem) => ({
            value: Module.moduleId,
            label: `${Module.moduleCode} - ${Module.moduleName}`,
          }))}
          placeholder="Choose Module"
          allOption={
            Mode === "STUDENT"
              ? { value: AllValue, label: "All Modules" }
              : { value: AllValue, label: "All Modules" }
          }
        />
        <SelectCard
          label="Level"
          value={SelectedLevelId}
          onChange={SetSelectedLevelId}
          options={(LevelsQuery.data ?? []).map((Level: LevelItem) => ({
            value: Level.levelId,
            label: `${Level.levelCode} - ${Level.levelName}`,
          }))}
          placeholder="Choose Level"
          allOption={{ value: AllValue, label: "All Levels" }}
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
          placeholder="Choose Lesson"
          allOption={{ value: AllValue, label: "All Lessons" }}
          disabled={!SelectedLevelId || SelectedLevelId === AllValue}
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
          placeholder="Choose DPS"
          allOption={{ value: AllValue, label: "All DPS" }}
          disabled={!SelectedLessonId || SelectedLessonId === AllValue}
        />
        <div className="math-card p-4">
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

      <section className="mt-5 math-card math-selected-scope-card p-4 sm:p-5">
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="math-kicker">Selected Scope</p>
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
        </div>
      </section>

      <section
        className={`mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4 ${
          Mode === "LEARNING"
            ? "xl:grid-cols-7"
            : "xl:grid-cols-8 student-history-metric-row"
        }`}
      >
        {Mode === "LEARNING" ? (
          <>
            <MetricCard
              icon={<Users size={16} />}
              label="Students Covered"
              value={String(
                PickFirstNumber(
                  LearningSummary,
                  ["studentsCovered", "totalStudents"],
                  0,
                ),
              )}
            />
            <MetricCard
              icon={<ClipboardCheck size={16} />}
              label="Attempts Reviewed"
              value={String(
                PickFirstNumber(
                  LearningSummary,
                  ["attemptsReviewed", "completedAttempts"],
                  0,
                ),
              )}
            />
            <MetricCard
              icon={<Trophy size={16} />}
              label="Benchmark Met"
              value={String(CurrentBenchmarkMetCount(LearningRows))}
            />
            <MetricCard
              icon={<AlertTriangle size={16} />}
              label="Needs Re-Attempt"
              value={String(CurrentNeedsReAttemptCount(LearningRows))}
            />
            <MetricCard
              icon={<Sparkles size={16} />}
              label="Promotion Ready"
              value={String(
                PickFirstNumber(
                  LearningSummary,
                  ["promotionReady", "promotionReadyStudents"],
                  CurrentPromotionReadyCount(LearningRows),
                ),
              )}
            />
            <MetricCard
              icon={<GraduationCap size={16} />}
              label="Promoted Students"
              value={String(
                PickFirstNumber(LearningSummary, ["promotedStudents"], 0),
              )}
            />
            <MetricCard
              icon={<BarChart3 size={16} />}
              label="Average Accuracy"
              value={`${VisibleAttemptAverageAccuracy(FilteredLearningRows)}%`}
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
              icon={<Layers3 size={15} />}
              label="Modules Cleared"
              value={String(StudentHistoryMetricValues.modulesCleared)}
              compact
            />
            <MetricCard
              icon={<Trophy size={15} />}
              label="Levels Cleared"
              value={String(StudentHistoryMetricValues.levelsCleared)}
              compact
            />
            <MetricCard
              icon={<ClipboardCheck size={15} />}
              label="DPS Cleared"
              value={String(StudentHistoryMetricValues.dpsCleared)}
              compact
            />
            <MetricCard
              icon={<GraduationCap size={15} />}
              label="Assessments Cleared"
              value={String(StudentHistoryMetricValues.assessmentsCleared)}
              compact
            />
            <MetricCard
              icon={<Trophy size={15} />}
              label="Promoted Levels"
              value={String(
                PickFirstNumber(
                  StudentSummary,
                  ["promotedLevels", "promotionHistoryCount"],
                  0,
                ),
              )}
              compact
            />
            <MetricCard
              icon={<BarChart3 size={15} />}
              label="DPS Avg Accuracy"
              value={`${StudentHistoryMetricValues.dpsAverageAccuracy}%`}
              compact
            />
            <MetricCard
              icon={<Target size={15} />}
              label="Assessment Avg Accuracy"
              value={`${StudentHistoryMetricValues.assessmentAverageAccuracy}%`}
              compact
            />
          </>
        )}
      </section>

      <section className="mt-5 math-card p-4 sm:p-5">
        {IsLoading ? (
          <LoadingState message="Loading report data..." />
        ) : Mode === "LEARNING" ? (
          !SelectedModuleId ? (
            <EmptyState message="Choose Module to review Learning Performance." />
          ) : FilteredLearningRows.length ? (
            <LearningPerformanceTable
              Rows={FilteredLearningRows}
              SortKey={LearningSortKeyValue}
              SortDirectionValue={SortDirectionValue}
              ToggleSort={ToggleLearningSort}
              Router={Router}
            />
          ) : (
            <EmptyState message="No learning performance found for this scope." />
          )
        ) : !SelectedStudentId || SelectedStudentId === AllValue ? (
          <EmptyState message="Choose Student to review Student History." />
        ) : (
          <StudentHistoryView
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
  const DisplayRows = BuildDisplayAttemptRows(Rows);

  return (
    <div className="math-table math-learning-performance-table performance-report-table">
      <table>
        <colgroup>
          <col className="math-lp-col-student" />
          <col className="math-lp-col-teacher" />
          <col className="math-lp-col-scope" />
          <col className="math-lp-col-attempt" />
          <col className="math-lp-col-status" />
          <col className="math-lp-col-score" />
          <col className="math-lp-col-accuracy" />
          <col className="math-lp-col-benchmark" />
          <col className="math-lp-col-completed" />
          <col className="math-lp-col-time" />
          <col className="math-lp-col-review" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <SortableHeader
                active={SortKey === "student"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("student")}
              >
                Student
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "teacher"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("teacher")}
              >
                Teacher
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "scope"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("scope")}
              >
                Learning Scope
              </SortableHeader>
            </th>
            <th><span className="math-table-header-label math-table-header-label-nowrap">Attempt</span></th>
            <th>
              <SortableHeader
                active={SortKey === "status"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("status")}
              >
                Status
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "score"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("score")}
              >
                Score
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "accuracy"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("accuracy")}
              >
                Accuracy
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "benchmark"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("benchmark")}
              >
                Benchmark
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "completedDate"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("completedDate")}
              >
                Completion Date
              </SortableHeader>
            </th>
            <th>
              <SortableHeader
                active={SortKey === "timeTaken"}
                direction={SortDirectionValue}
                onClick={() => ToggleSort("timeTaken")}
              >
                <span className="math-table-header-label-wrap">Time<br />Taken</span>
              </SortableHeader>
            </th>
            <th><span className="math-table-header-label math-table-header-label-nowrap">Review</span></th>
          </tr>
        </thead>
        <tbody>
          {DisplayRows.map((Row, Index) => {
            const AttemptId = PickFirstString(
              Row,
              ["attemptId"],
              `attempt-${Index}`,
            );
            const Score = PickFirstNumber(
              Row,
              ["score", "totalScore"],
              Number.NaN,
            );
            const MaxScore = PickFirstNumber(
              Row,
              ["maxScore", "totalMarks"],
              Number.NaN,
            );
            const Accuracy = PickFirstNumber(
              Row,
              ["accuracyPercentage", "accuracy"],
              Number.NaN,
            );
            const RequiresAttention =
              String(PickFirstString(Row, ["requiresAttention"], "false")) ===
              "true";
            return (
              <tr key={AttemptId}>
                <td>
                  <p className="font-black">
                    {PickFirstString(Row, ["studentName"], "-")}
                  </p>
                  <p className="mt-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#2563eb] dark:text-cyan-100">
                                    {PickFirstString(Row, ["studentCode"], "-")}
                                  </p>
                </td>
                <td>
                  <p className="font-black">
                    {PickFirstString(Row, ["teacherName"], "Not Assigned")}
                  </p>
                  {PickFirstString(Row, ["teacherCode"], "") ? (
                    <p className="text-xs text-slate-500">
                      {PickFirstString(Row, ["teacherCode"], "")}
                    </p>
                  ) : null}
                </td>
                <td>
                  <p className="font-black">
                    {PickFirstString(Row, ["moduleCode"], "-")} →{" "}
                    {PickFirstString(Row, ["levelCode"], "-")}
                  </p>
                  <p className="text-xs text-slate-500">
                    Lesson {PickFirstNumber(Row, ["lessonNumber"], 0)} · DPS{" "}
                    {PickFirstNumber(Row, ["dpsNumber"], 0)}
                  </p>
                </td>
                <td className="math-table-chip-cell">
                  <AttemptChip Label={AttemptLabel(Row)} />
                </td>
                <td className="math-table-chip-cell">
                  <StatusChip Label={AttemptDisplayStatus(Row)} />
                </td>
                <td className="math-table-chip-cell math-lp-score-value-cell">
                  <ScoreValueChip Score={Score} MaxScore={MaxScore} />
                </td>
                <td className="math-table-chip-cell math-lp-accuracy-value-cell">
                  <AccuracyValueChip Accuracy={Accuracy} />
                </td>
                <td className="math-table-chip-cell">
                  <BenchmarkBadge
                    status={PickFirstString(
                      Row,
                      ["benchmarkStatus"],
                      "PENDING",
                    )}
                    requiresAttention={RequiresAttention}
                    percentage={PickFirstNumber(
                      Row,
                      ["benchmarkPercentage"],
                      70,
                    )}
                  />
                </td>
                <td className="math-lp-date-cell">
                  {FormatDate(
                    PickFirstString(Row, ["completedDate", "submittedAt"], "-"),
                  )}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Clock3 size={14} />
                    {FormatTimeTaken(
                      PickFirstNumber(
                        Row,
                        ["timeTakenSeconds", "durationSeconds", "timeTaken"],
                        Number.NaN,
                      ),
                    )}
                  </span>
                </td>
                <td>
                  <button
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
      `${PickFirstString(Row, ["moduleName"], "Module")}: ${PickFirstString(Row, ["moduleCode"], "-")}`,
      "Learning Module",
      Row,
    );

    const LevelMap = new Map(
      (ModuleGroup.Children ?? []).map((Child) => [Child.Key, Child]),
    );
    const LevelGroup = AddGroupedRow(
      LevelMap,
      LevelKey,
      `${PickFirstString(Row, ["levelCode"], "Level")} · ${PickFirstString(Row, ["levelName"], "-")}`,
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
      `Lesson ${LessonNumber || "-"}: ${PickFirstString(Row, ["lessonTitle"], "Learning Lesson")}`,
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
      `${PickFirstString(Row, ["moduleName"], "Assessment Module")}: ${PickFirstString(Row, ["moduleCode"], "-")}`,
      "Assessment Module",
      Row,
    );

    const LevelMap = new Map(
      (ModuleGroup.Children ?? []).map((Child) => [Child.Key, Child]),
    );
    const LevelGroup = AddGroupedRow(
      LevelMap,
      LevelKey,
      `${PickFirstString(Row, ["levelCode"], "Level")} · ${PickFirstString(Row, ["levelName"], "-")}`,
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
        Label: `${PickFirstString(Row, ["moduleName"], "Learning Module")} · ${PickFirstString(Row, ["moduleCode"], "-")}`,
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
  ToggleExpanded: (Key: string) => void;
  children: ReactNode;
}) {
  const Expanded = ExpandedKeys[Group.Key] === true;
  const Tone =
    Depth === 0
      ? "border-blue-100 bg-white"
      : Depth === 1
        ? "border-cyan-100 bg-cyan-50/40"
        : "border-slate-200 bg-white/80";
  const Kicker = Depth === 0 ? "Module" : Depth === 1 ? "Level" : "Lesson";

  return (
    <div className={`math-history-hierarchy-row math-history-depth-${Depth} rounded-[24px] border ${Tone} p-3 shadow-sm`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => ToggleExpanded(Group.Key)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <HierarchyToggle Expanded={Expanded} />
          <div className="min-w-0">
            <p className="math-kicker">{Kicker}</p>
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
  StudentName,
  StudentCode,
  CurrentLevelRow,
  LevelRows,
  AttemptRows,
  AssessmentRows,
  PromotionRows,
  SortKey: _SortKey,
  SortDirectionValue: _SortDirectionValue,
  ToggleSort: _ToggleSort,
  Router,
}: {
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
  const [ActiveStudentHistoryTab, SetActiveStudentHistoryTab] =
    usePersistentUiState<StudentHistoryDetailTab>(CreatePersistedUiStateKey(StudentHistoryStateKey, "active-tab"), "CURRENT");
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
  function ToggleDpsExpanded(Key: string) {
    SetDpsExpandedKeys((Current) => ({
      ...Current,
      [Key]: Current[Key] !== true,
    }));
  }

  function ToggleAssessmentExpanded(Key: string) {
    SetAssessmentExpandedKeys((Current) => ({
      ...Current,
      [Key]: Current[Key] !== true,
    }));
  }

  function ToggleCompletedLevelExpanded(Key: string) {
    SetCompletedLevelExpandedKeys((Current) => ({
      ...Current,
      [Key]: Current[Key] !== true,
    }));
  }

  function TogglePromotionExpanded(Key: string) {
    SetPromotionExpandedKeys((Current) => ({
      ...Current,
      [Key]: Current[Key] !== true,
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
      Key: "CURRENT",
      Label: "Current Level Tracker",
      Description: "Active level and completed level journey",
      CountLabel: `${CompletedLevelRows.length} Completed Level${CompletedLevelRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "DPS",
      Label: "DPS History",
      Description: "Practice attempts and DPS drilldown",
      CountLabel: `${AttemptRows.length} Attempt${AttemptRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "ASSESSMENT",
      Label: "Assessment History",
      Description: "Assessment attempts and results",
      CountLabel: `${AssessmentRows.length} Attempt${AssessmentRows.length === 1 ? "" : "s"}`,
    },
    {
      Key: "PROMOTION",
      Label: "Promotion Journey",
      Description: "Level movement and progression audit",
      CountLabel: `${PromotionRows.length} Promotion${PromotionRows.length === 1 ? "" : "s"}`,
    },
  ];

  function RenderCurrentLevelTrackerTab() {
    return (
      <div className="math-card p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="math-kicker">Current Level Tracker</p>
            <h3 className="text-2xl font-black text-slate-950">
              Current Level Progress
            </h3>
          </div>
          <span className="math-badge math-history-count-badge whitespace-nowrap border-blue-200 bg-blue-50 text-blue-700">
            {CompletedLevelRows.length} Completed Level
            {CompletedLevelRows.length === 1 ? "" : "s"}
          </span>
        </div>
        {CurrentLevelRow ? (
          <CurrentLevelProgressBlock Row={CurrentLevelRow} />
        ) : null}
        <div className="mt-4 rounded-[26px] border border-slate-200 bg-white/75 p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="math-kicker">Completed Level Journey</p>
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
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="math-kicker">DPS History</p>
            <h3 className="text-2xl font-black text-slate-950">
              Learning Attempts
            </h3>
          </div>
          <span className="math-badge whitespace-nowrap border-slate-200 bg-white text-slate-700">
            {AttemptRows.length} Attempt(s)
          </span>
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
            <p className="math-kicker">Assessment History</p>
            <h3 className="text-2xl font-black text-slate-950">
              Assessment Attempts
            </h3>
          </div>
          <span className="math-badge whitespace-nowrap border-slate-200 bg-white text-slate-700">
            {AssessmentRows.length} Attempt(s)
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
              <p className="math-kicker">Progression Audit</p>
              <h3 className="text-2xl font-black text-slate-950">
                Promotion History
              </h3>
            </div>
            <span className="math-badge whitespace-nowrap border-violet-200 bg-violet-50 text-violet-700">
              {PromotionRows.length} Promotion(s)
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {StudentHistoryTabs.map((Tab) => {
            const IsActive = ActiveStudentHistoryTab === Tab.Key;
            return (
              <button
                key={Tab.Key}
                type="button"
                className={`math-role-tab-card min-h-[96px] p-4 text-left ${IsActive ? "math-role-tab-card-active" : ""}`}
                onClick={() => SetActiveStudentHistoryTab(Tab.Key)}
              >
                <div className="flex h-full items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.78rem] font-black uppercase leading-5 tracking-[0.18em]"
                    >
                      {Tab.Label}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-5 text-slate-500">
                      {Tab.Description}
                    </p>
                  </div>
                  <span
                    className="math-badge shrink-0 whitespace-nowrap"
                  >
                    {Tab.CountLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "fromLevel"} direction={SortDirectionValue} onClick={() => ToggleSort("fromLevel")}>From Level</SortableHeader></th>
            <th><SortableHeader active={SortKey === "toLevel"} direction={SortDirectionValue} onClick={() => ToggleSort("toLevel")}>To Level</SortableHeader></th>
            <th><SortableHeader active={SortKey === "assessment"} direction={SortDirectionValue} onClick={() => ToggleSort("assessment")}>Assessment</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")}>Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "percentage"} direction={SortDirectionValue} onClick={() => ToggleSort("percentage")}>Percentage</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")}>Status</SortableHeader></th>
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
                  <p className="font-black">{PickFirstString(Row, ["fromLevelCode"], "-")}</p>
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["fromModuleCode"], "-")}</p>
                </td>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["toLevelCode"], "-")}</p>
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["toModuleCode"], "-")}</p>
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
  const ClassName =
    DisplayValue === "—"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
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
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "dps"} direction={SortDirectionValue} onClick={() => ToggleSort("dps")}>DPS</SortableHeader></th>
            <th><SortableHeader active={SortKey === "teacher"} direction={SortDirectionValue} onClick={() => ToggleSort("teacher")}>Teacher</SortableHeader></th>
            <th><SortableHeader active={SortKey === "attempt"} direction={SortDirectionValue} onClick={() => ToggleSort("attempt")}>Attempt</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")}>Status</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")}>Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "accuracy"} direction={SortDirectionValue} onClick={() => ToggleSort("accuracy")}>Accuracy</SortableHeader></th>
            <th><SortableHeader active={SortKey === "benchmark"} direction={SortDirectionValue} onClick={() => ToggleSort("benchmark")}>Benchmark</SortableHeader></th>
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
                <td><p className="font-black">DPS {PickFirstNumber(Row, ["dpsNumber"], 0) || "-"}</p></td>
                <td>
                  <p className="font-black">{PickFirstString(Row, ["teacherName"], "Not Assigned")}</p>
                  {PickFirstString(Row, ["teacherCode"], "") ? (
                    <p className="text-xs text-slate-500">{PickFirstString(Row, ["teacherCode"], "")}</p>
                  ) : null}
                </td>
                <td className="math-table-chip-cell"><AttemptChip Label={AttemptLabel(Row)} /></td>
                <td className="math-table-chip-cell"><StatusChip Label={AttemptDisplayStatus(Row)} /></td>
                <td className="math-table-chip-cell"><ScoreValueChip Score={Score} MaxScore={MaxScore} /></td>
                <td className="math-table-chip-cell"><AccuracyValueChip Accuracy={Accuracy} /></td>
                <td className="math-table-chip-cell">
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
      <table>
        <thead>
          <tr>
            <th><SortableHeader active={SortKey === "assessment"} direction={SortDirectionValue} onClick={() => ToggleSort("assessment")}>Assessment</SortableHeader></th>
            <th><SortableHeader active={SortKey === "attempt"} direction={SortDirectionValue} onClick={() => ToggleSort("attempt")}>Attempt</SortableHeader></th>
            <th><SortableHeader active={SortKey === "status"} direction={SortDirectionValue} onClick={() => ToggleSort("status")}>Status</SortableHeader></th>
            <th><SortableHeader active={SortKey === "score"} direction={SortDirectionValue} onClick={() => ToggleSort("score")}>Score</SortableHeader></th>
            <th><SortableHeader active={SortKey === "accuracy"} direction={SortDirectionValue} onClick={() => ToggleSort("accuracy")}>Accuracy</SortableHeader></th>
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
                  <p className="text-xs text-slate-500">{PickFirstString(Row, ["moduleCode"], "-")} → {PickFirstString(Row, ["levelCode"], "-")}</p>
                </td>
                <td className="math-table-chip-cell"><AttemptChip Label={AttemptLabel(Row)} /></td>
                <td className="math-table-chip-cell"><StatusChip Label={AttemptDisplayStatus(Row)} /></td>
                <td className="math-table-chip-cell"><ScoreValueChip Score={Score} MaxScore={MaxScore} /></td>
                <td className="math-table-chip-cell"><AccuracyValueChip Accuracy={Accuracy} /></td>
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
  const PromotedBy = PickFirstString(
    LatestPromotionRow,
    ["promotedByName"],
    "Admin",
  );

  return (
    <div className="overflow-hidden rounded-[30px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm ring-1 ring-violet-100">
            <GraduationCap size={22} />
          </div>
          <div>
            <p className="math-kicker text-violet-700">
              Level Progression Summary
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
            <p className="math-kicker">Module</p>
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
            <p className="math-kicker">Level</p>
            <h5 className="mt-1 text-base font-black text-slate-950">
              {PickFirstString(Row, ["levelCode"], "Level")} ·{" "}
              {PickFirstString(Row, ["levelName"], "-")}
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
  const CompletedDps = PickFirstNumber(Row, ["completedDps"], 0);
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
            {CompletedDps} of {RequiredDps} DPS completed in the current level
            scope.
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm transition dark:border-white/10 dark:bg-slate-900/80 dark:shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
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
    UpperLabel.includes("NEEDS") ||
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
}: {
  label: string;
  value: string;
  onChange: (Value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allOption?: { value: string; label: string };
  disabled?: boolean;
}) {
  return (
    <div className="math-card p-4">
      <label className="math-label">{label}</label>
      <select
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
  return (
    <div
      className={`math-metric flex min-w-0 flex-col ${compact ? "p-2.5" : "p-3"}`}
    >
      <div
        className={`inline-flex rounded-xl bg-blue-50 text-blue-700 ${compact ? "p-1.5" : "p-2"}`}
      >
        {icon}
      </div>
      <p
        className={`mt-2 font-black uppercase text-slate-700 ${
          compact
            ? "min-h-[2.05rem] text-[0.64rem] leading-[0.98rem] tracking-[0.095em]"
            : "break-words text-xs tracking-[0.12em]"
        }`}
      >
        {label}
      </p>
      <p
        className={`${compact ? "mt-auto pt-1 text-lg" : "mt-1 text-xl"} font-black leading-none text-slate-950`}
      >
        {value}
      </p>
    </div>
  );
}
