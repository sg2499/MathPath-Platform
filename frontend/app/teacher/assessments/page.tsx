"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getTeacherAssessments,
  type TeacherAssessmentRow,
} from "@/lib/api/teacher";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  formatMathPathDateTime,
  getFirstMathPathTimestamp,
} from "@/lib/date";
import { CompareStudentCodes } from "@/lib/studentSort";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type StatusFilter = "" | "ALL" | "PENDING" | "CLEARED" | "NEEDS_REATTEMPT";

type StudentAssessmentGroup = {
  StudentKey: string;
  StudentId: string;
  StudentName: string;
  StudentCode: string;
  ClassLabel: string;
  Rows: TeacherAssessmentRow[];
};

type AssessmentDeepLinkTarget = {
  Student?: string;
  Module?: string;
  Level?: string;
  AssignmentId?: string;
  AssessmentId?: string;
  AttemptId?: string;
  Highlight?: string;
  HasTarget: boolean;
};

function DeepLinkValue(Params: { get(Name: string): string | null }, Names: string[]) {
  for (const Name of Names) {
    const Value = Params.get(Name);
    if (Value && Value.trim()) return Value.trim();
  }
  return "";
}

function BuildAssessmentDeepLinkTarget(Params: { get(Name: string): string | null }): AssessmentDeepLinkTarget {
  const Target = {
    Student: DeepLinkValue(Params, ["studentCode", "student", "studentId"]),
    Module: DeepLinkValue(Params, ["moduleCode", "module", "moduleId"]),
    Level: DeepLinkValue(Params, ["levelCode", "level", "levelId"]),
    AssignmentId: DeepLinkValue(Params, ["assignmentId"]),
    AssessmentId: DeepLinkValue(Params, ["assessmentId"]),
    AttemptId: DeepLinkValue(Params, ["attemptId"]),
    Highlight: DeepLinkValue(Params, ["highlight", "recordId"]),
  };
  return { ...Target, HasTarget: Object.values(Target).some(Boolean) };
}

function NormalizeDeepLinkText(Value: unknown) {
  return String(Value || "").trim().toLowerCase();
}

function isDeepLinkInternalId(Value: unknown) {
  const Text = String(Value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(Text) || /^\d+$/.test(Text);
}

function userFacingDeepLinkParam(Params: { get(Name: string): string | null }, Names: string[]) {
  for (const Name of Names) {
    const Value = Params.get(Name);
    if (Value && Value.trim() && !isDeepLinkInternalId(Value)) return Value.trim();
  }
  return "";
}

function RowMatchesDeepLink(Row: TeacherAssessmentRow, Target?: AssessmentDeepLinkTarget) {
  if (!Target?.HasTarget) return false;
  const StudentTarget = NormalizeDeepLinkText(Target.Student);
  const ModuleTarget = NormalizeDeepLinkText(Target.Module);
  const LevelTarget = NormalizeDeepLinkText(Target.Level);
  const AssignmentTarget = NormalizeDeepLinkText(Target.AssignmentId || Target.AssessmentId);
  const AttemptTarget = NormalizeDeepLinkText(Target.AttemptId || Target.Highlight);
  const RowAny = Row as any;

  const StudentMatches = !StudentTarget || [Row.studentCode, Row.studentId, Row.studentName].some((Value) => NormalizeDeepLinkText(Value) === StudentTarget);
  const ModuleMatches = !ModuleTarget || [Row.moduleCode, Row.moduleId, RowModuleKey(Row)].some((Value) => NormalizeDeepLinkText(Value) === ModuleTarget);
  const LevelMatches = !LevelTarget || [Row.levelCode, Row.levelId, RowLevelKey(Row)].some((Value) => NormalizeDeepLinkText(Value) === LevelTarget);
  const AssignmentMatches = !AssignmentTarget || [RowAny.assignmentId, RowAny.assessmentAssignmentId, RowAny.assessmentId, RowAny.id].some((Value) => NormalizeDeepLinkText(Value) === AssignmentTarget);
  const AttemptMatches = !AttemptTarget || [AssessmentAttemptId(Row), RowAny.attemptId, RowAny.assessmentAttemptId, RowAny.latestAttemptId, RowAny.resultAttemptId, RowAny.assignmentId, RowAny.assessmentAssignmentId].some((Value) => NormalizeDeepLinkText(Value) === AttemptTarget);

  return StudentMatches && ModuleMatches && LevelMatches && AssignmentMatches && AttemptMatches;
}

function RowModuleKey(Row: TeacherAssessmentRow) {
  return String(Row.moduleId || Row.moduleCode || "Module");
}

function RowModuleLabel(Row: TeacherAssessmentRow) {
  const ModuleCode = String(Row.moduleCode || "Module");
  const ModuleName = String(Row.moduleName || "");
  return ModuleName && ModuleName !== ModuleCode
    ? `${ModuleCode} · ${ModuleName}`
    : ModuleCode;
}

function RowLevelKey(Row: TeacherAssessmentRow) {
  return String(Row.levelId || Row.levelCode || "Level");
}

function RowLevelLabel(Row: TeacherAssessmentRow) {
  const LevelCode = String(Row.levelCode || "Level");
  const LevelName = String(Row.levelName || "");
  return LevelName && LevelName !== LevelCode
    ? `${LevelCode} · ${LevelName}`
    : LevelCode;
}

function RowLevelSortValue(Row: TeacherAssessmentRow) {
  return String(Row.levelCode || Row.levelName || RowLevelLabel(Row) || RowLevelKey(Row));
}

function TeacherLevelGroupSortValue(Group: TeacherAssessmentLevelGroup) {
  const SampleRow = Group.Rows[0];
  return SampleRow ? RowLevelSortValue(SampleRow) : Group.LevelLabel || Group.LevelKey;
}

function NormalizedStatus(Row: TeacherAssessmentRow) {
  const RowAny = Row as any;
  const StatusText = String(
    Row.status ?? RowAny.resultStatus ?? Row.benchmarkStatus ?? "",
  ).toUpperCase();
  const Accuracy = Number(
    Row.accuracy ?? RowAny.accuracyPercentage ?? RowAny.percentage,
  );
  const Score = Number(Row.score ?? RowAny.totalScore);
  const MaxScore = Number(Row.totalMarks ?? RowAny.maxScore ?? 100);
  const ScorePercentage =
    Number.isFinite(Score) && Number.isFinite(MaxScore) && MaxScore > 0
      ? (Score / MaxScore) * 100
      : Number.NaN;
  const Percentage = Number.isFinite(Accuracy) ? Accuracy : ScorePercentage;

  if (
    ["PENDING", "NOT_STARTED", "ASSIGNED", "IN_PROGRESS"].includes(
      StatusText,
    ) ||
    StatusText.includes("PENDING") ||
    StatusText.includes("AWAITING") ||
    !StatusText
  )
    return "PENDING";
  if (
    StatusText.includes("CLEARED") ||
    StatusText.includes("PASS") ||
    StatusText.includes("BENCHMARK_MET")
  )
    return "CLEARED";
  if (
    StatusText.includes("REATTEMPT") ||
    StatusText.includes("RE_ATTEMPT") ||
    StatusText.includes("NEEDS") ||
    StatusText.includes("BELOW") ||
    StatusText.includes("FAILED")
  )
    return "NEEDS_REATTEMPT";
  if (Number.isFinite(Percentage))
    return Percentage >= 70 ? "CLEARED" : "NEEDS_REATTEMPT";
  if (["SUBMITTED", "COMPLETED", "AUTO_SUBMITTED"].includes(StatusText))
    return "CLEARED";
  return "PENDING";
}

function StatusChip({ Status }: { Status: string }) {
  if (Status === "CLEARED") return <Chip Tone="green">Cleared</Chip>;
  if (Status === "NEEDS_REATTEMPT")
    return <Chip Tone="red">Needs Re-Attempt</Chip>;
  return <Chip Tone="amber">Pending</Chip>;
}

function Chip({
  children,
  Tone = "slate",
}: {
  children: ReactNode;
  Tone?: "blue" | "green" | "amber" | "red" | "slate" | "purple";
}) {
  const ToneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  }[Tone];
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${ToneClass}`}
    >
      {children}
    </span>
  );
}

function Metric({
  Label,
  Value,
  Icon,
}: {
  Label: string;
  Value: string | number;
  Icon: ReactNode;
}) {
  return (
    <div className="math-teacher-light-metric-card rounded-[22px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-slate-800 dark:bg-slate-950/70 dark:ring-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-800 dark:text-slate-100">
            {Label}
          </p>
          <p className="mt-2 text-3xl font-black leading-none text-slate-950 dark:text-white">
            {Value}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
          {Icon}
        </span>
      </div>
    </div>
  );
}

function CleanNumber(Value: unknown) {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return "0";
  return String(Math.round(NumberValue));
}

function RowAccuracy(Row: TeacherAssessmentRow) {
  const RowAny = Row as any;
  const Accuracy = Number(
    Row.accuracy ?? RowAny.accuracyPercentage ?? RowAny.percentage,
  );
  if (!Number.isFinite(Accuracy)) return null;
  return Math.min(100, Math.max(0, Accuracy));
}

function RowTimestampMs(Row: TeacherAssessmentRow) {
  const Timestamp = getFirstMathPathTimestamp(
    Row,
    MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  );
  const Time = Timestamp ? new Date(String(Timestamp)).getTime() : Number.NaN;
  return Number.isFinite(Time) ? Time : 0;
}

function CurrentAccuracy(Rows: TeacherAssessmentRow[]) {
  const AttemptedRows = Rows.filter(
    (Row) => NormalizedStatus(Row) !== "PENDING" && RowAccuracy(Row) !== null,
  );
  if (!AttemptedRows.length) return null;
  const LatestRow = [...AttemptedRows].sort(
    (First, Second) => RowTimestampMs(Second) - RowTimestampMs(First),
  )[0];
  return RowAccuracy(LatestRow);
}
function LatestAssessmentRow(Rows: TeacherAssessmentRow[]) {
  if (!Rows.length) return null;
  return (
    [...Rows].sort(
      (First, Second) => RowTimestampMs(Second) - RowTimestampMs(First),
    )[0] || null
  );
}

function CurrentAssessmentRows(Rows: TeacherAssessmentRow[]) {
  const RowMap = new Map<string, TeacherAssessmentRow[]>();
  Rows.forEach((Row) => {
    const Key = [
      String(Row.studentCode || Row.studentId || Row.studentName || "Student"),
      RowModuleKey(Row),
      RowLevelKey(Row),
    ].join("::");
    const ExistingRows = RowMap.get(Key) ?? [];
    ExistingRows.push(Row);
    RowMap.set(Key, ExistingRows);
  });
  return Array.from(RowMap.values())
    .map((GroupRows) => LatestAssessmentRow(GroupRows))
    .filter(Boolean) as TeacherAssessmentRow[];
}

function AverageAssessmentAccuracy(Rows: TeacherAssessmentRow[]) {
  const Values = Rows.filter((Row) => NormalizedStatus(Row) !== "PENDING")
    .map(RowAccuracy)
    .filter(
      (Value): Value is number => Value !== null && Number.isFinite(Value),
    );
  if (!Values.length) return null;
  return Values.reduce((Total, Value) => Total + Value, 0) / Values.length;
}

function StudentAssessmentAverageAccuracy(Rows: TeacherAssessmentRow[]) {
  const CurrentRows = CurrentAssessmentRows(Rows);
  return AverageAssessmentAccuracy(CurrentRows) ?? 0;
}

function VisibleStudentsAssessmentAverageAccuracy(Students: StudentAssessmentGroup[]) {
  if (!Students.length) return null;
  const Values = Students.map((Student) => StudentAssessmentAverageAccuracy(Student.Rows));
  return Values.reduce((Total, Value) => Total + Value, 0) / Values.length;
}

function AccuracyDisplay(Value: number | null) {
  if (Value === null || !Number.isFinite(Value)) return "—";
  return `${CleanNumber(Value)}%`;
}

function LastActivity(Rows: TeacherAssessmentRow[]) {
  const Times = Rows.map((Row) =>
    getFirstMathPathTimestamp(Row, MATHPATH_ACTIVITY_TIMESTAMP_KEYS),
  )
    .filter(Boolean)
    .map((Value) => new Date(String(Value)).getTime())
    .filter(Number.isFinite);
  if (!Times.length) return "—";
  return formatMathPathDateTime(new Date(Math.max(...Times)).toISOString());
}

function SearchBlob(Row: TeacherAssessmentRow) {
  return [
    Row.assessmentTitle,
    Row.assignmentTitle,
    Row.studentName,
    Row.studentCode,
    Row.moduleCode,
    Row.moduleName,
    Row.levelCode,
    Row.levelName,
    NormalizedStatus(Row),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function AssessmentTitle(Row: TeacherAssessmentRow) {
  return String(
    Row.assessmentTitle ||
      Row.assignmentTitle ||
      (Row as any).title ||
      "Assessment",
  );
}

function AttemptLabel(Row: TeacherAssessmentRow) {
  const RowAny = Row as any;
  const ExplicitLabel = String(
    RowAny.attemptLabel || RowAny.assessmentAttemptLabel || "",
  ).trim();
  if (ExplicitLabel) return ExplicitLabel;
  const AssignmentType = String(
    RowAny.assessmentAssignmentType ||
      Row.assignmentType ||
      RowAny.attemptType ||
      "",
  ).toUpperCase();
  const AttemptType = String(
    RowAny.attemptType || RowAny.resultAttemptType || "",
  ).toUpperCase();
  const AttemptNumber = Number(
    RowAny.attemptNumber ||
      RowAny.reattemptNumber ||
      RowAny.nextAttemptNumber ||
      1,
  );
  if (AssignmentType.includes("RE") || AttemptType.includes("RE"))
    return `Re-Attempt ${Number.isFinite(AttemptNumber) && AttemptNumber > 0 ? AttemptNumber : 1}`;
  return "Original";
}

function PromotionStatus(Row: TeacherAssessmentRow) {
  const RowAny = Row as any;
  const RawStatus = String(RowAny.progressionStatus || "").toUpperCase();
  if (RawStatus === "PROMOTED" || RowAny.isPromoted) return "PROMOTED";
  if (
    RowAny.isReadyForNextLevel ||
    RowAny.readyForNextLevel ||
    RawStatus === "READY_FOR_NEXT_LEVEL"
  )
    return "AVAILABLE";
  return "NOT_AVAILABLE";
}

function ReadyForNextLevel(Row: TeacherAssessmentRow) {
  return PromotionStatus(Row) === "AVAILABLE";
}

function PromotionChip({ Row }: { Row: TeacherAssessmentRow }) {
  const Status = PromotionStatus(Row);
  if (Status === "PROMOTED") return <Chip Tone="green">Promoted</Chip>;
  if (Status === "AVAILABLE") return <Chip Tone="purple">Available</Chip>;
  return <Chip Tone="slate">Not Available</Chip>;
}

function StatusLabel(Row: TeacherAssessmentRow) {
  const Status = NormalizedStatus(Row);
  if (Status === "CLEARED")
    return AttemptLabel(Row).startsWith("Re-Attempt")
      ? "Re-Attempt Cleared"
      : "Cleared";
  if (Status === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  return AttemptLabel(Row).startsWith("Re-Attempt")
    ? "Re-Attempt Pending"
    : "Pending";
}

function StatusTone(
  Row: TeacherAssessmentRow,
): "blue" | "green" | "amber" | "red" | "slate" {
  const Status = NormalizedStatus(Row);
  if (Status === "CLEARED") return "green";
  if (Status === "NEEDS_REATTEMPT") return "red";
  return "amber";
}

function AssessmentAttemptId(Row: TeacherAssessmentRow) {
  return String(
    (Row as any).attemptId ||
      (Row as any).assessmentAttemptId ||
      (Row as any).latestAttemptId ||
      (Row as any).resultAttemptId ||
      "",
  );
}

function ScoreLabel(Row: TeacherAssessmentRow) {
  if (NormalizedStatus(Row) === "PENDING") return "—";
  const RowAny = Row as any;
  const Score = Number(Row.score ?? RowAny.totalScore ?? RowAny.resultScore);
  const MaxScore = Number(
    Row.totalMarks ?? RowAny.maxScore ?? RowAny.maximumScore ?? 100,
  );
  if (!Number.isFinite(Score)) return "—";
  const SafeMax = Number.isFinite(MaxScore) && MaxScore > 0 ? MaxScore : 100;
  const SafeScore = Math.min(Math.max(Score, 0), SafeMax);
  return `${CleanNumber(SafeScore)} / ${CleanNumber(SafeMax)}`;
}

function ScoreTone(
  Row: TeacherAssessmentRow,
): "green" | "amber" | "red" | "slate" {
  if (NormalizedStatus(Row) === "PENDING") return "slate";
  const Accuracy = RowAccuracy(Row);
  if (Accuracy === null) return "slate";
  if (Accuracy >= 70) return "green";
  return "red";
}

function DateTimeLabel(Row: TeacherAssessmentRow, Keys: string[]) {
  const RowAny = Row as any;
  for (const Key of Keys) {
    const Value = RowAny[Key];
    if (Value) return formatMathPathDateTime(String(Value));
  }
  return "—";
}

function BuildStudents(Rows: TeacherAssessmentRow[]) {
  const StudentMap = new Map<string, StudentAssessmentGroup>();
  Rows.forEach((Row) => {
    const StudentKey = String(
      Row.studentId || Row.studentCode || Row.studentName || "Student",
    );
    if (!StudentMap.has(StudentKey)) {
      StudentMap.set(StudentKey, {
        StudentKey,
        StudentId: String(Row.studentId || ""),
        StudentName: String(Row.studentName || "Student"),
        StudentCode: String(Row.studentCode || "—"),
        ClassLabel:
          [Row.className, Row.section].filter(Boolean).join(" ") || "—",
        Rows: [],
      });
    }
    StudentMap.get(StudentKey)!.Rows.push(Row);
  });
  return Array.from(StudentMap.values()).sort((First, Second) =>
    CompareStudentCodes(First.StudentCode, Second.StudentCode),
  );
}

function StudentStats(Rows: TeacherAssessmentRow[]) {
  const Assigned = Rows.length;
  const Cleared = Rows.filter(
    (Row) => NormalizedStatus(Row) === "CLEARED",
  ).length;
  const Pending = Rows.filter(
    (Row) => NormalizedStatus(Row) === "PENDING",
  ).length;
  const Reattempt = Rows.filter(
    (Row) => NormalizedStatus(Row) === "NEEDS_REATTEMPT",
  ).length;
  const Accuracy = CurrentAccuracy(Rows);
  return {
    Assigned,
    Cleared,
    Pending,
    Reattempt,
    Accuracy,
    LastActivity: LastActivity(Rows),
  };
}

type TeacherAssessmentLevelGroup = {
  ModuleKey: string;
  ModuleLabel: string;
  LevelKey: string;
  LevelLabel: string;
  Rows: TeacherAssessmentRow[];
};

type TeacherAssessmentModuleGroup = {
  ModuleKey: string;
  ModuleLabel: string;
  Levels: TeacherAssessmentLevelGroup[];
};

function SortedTeacherAssessmentRows(Rows: TeacherAssessmentRow[]) {
  return [...Rows].sort(
    (First, Second) => RowTimestampMs(First) - RowTimestampMs(Second),
  );
}

function GroupTeacherAssessmentRowsByModuleLevel(
  Rows: TeacherAssessmentRow[],
): TeacherAssessmentModuleGroup[] {
  const ModuleMap = new Map<string, TeacherAssessmentModuleGroup>();
  Rows.forEach((Row) => {
    const ModuleKey = RowModuleKey(Row);
    const LevelKey = RowLevelKey(Row);
    if (!ModuleMap.has(ModuleKey)) {
      ModuleMap.set(ModuleKey, {
        ModuleKey,
        ModuleLabel: RowModuleLabel(Row),
        Levels: [],
      });
    }
    const ModuleGroup = ModuleMap.get(ModuleKey)!;
    let LevelGroup = ModuleGroup.Levels.find(
      (Item) => Item.LevelKey === LevelKey,
    );
    if (!LevelGroup) {
      LevelGroup = {
        ModuleKey,
        ModuleLabel: RowModuleLabel(Row),
        LevelKey,
        LevelLabel: RowLevelLabel(Row),
        Rows: [],
      };
      ModuleGroup.Levels.push(LevelGroup);
    }
    LevelGroup.Rows.push(Row);
  });

  return Array.from(ModuleMap.values())
    .sort((First, Second) =>
      First.ModuleKey.localeCompare(Second.ModuleKey, undefined, {
        numeric: true,
      }),
    )
    .map((ModuleGroup) => ({
      ...ModuleGroup,
      Levels: ModuleGroup.Levels.sort((First, Second) =>
        TeacherLevelGroupSortValue(First).localeCompare(
          TeacherLevelGroupSortValue(Second),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      ).map((LevelGroup) => ({
        ...LevelGroup,
        Rows: SortedTeacherAssessmentRows(LevelGroup.Rows),
      })),
    }));
}

function TeacherAssessmentHierarchyRecords({
  Rows,
  OnOpenAttempt,
  FocusTarget,
}: {
  Rows: TeacherAssessmentRow[];
  OnOpenAttempt: (Row: TeacherAssessmentRow) => void;
  FocusTarget?: AssessmentDeepLinkTarget;
}) {
  const Groups = GroupTeacherAssessmentRowsByModuleLevel(Rows);
  const TeacherAssessmentHierarchyStateKey = CreatePersistedUiStateKey("teacher", "assessment-tracker", "hierarchy-records");
  const [ExpandedModules, SetExpandedModules] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(TeacherAssessmentHierarchyStateKey, "open-modules"), {});
  const [ExpandedLevels, SetExpandedLevels] = usePersistentUiState<Record<string, boolean>>(
    CreatePersistedUiStateKey(TeacherAssessmentHierarchyStateKey, "open-levels"),
    {},
  );

  const ToggleModule = (Key: string) => {
    SetExpandedModules((Current) => ({ ...Current, [Key]: !Current[Key] }));
  };

  const ToggleLevel = (Key: string) => {
    SetExpandedLevels((Current) => ({ ...Current, [Key]: !Current[Key] }));
  };

  useEffect(() => {
    if (!FocusTarget?.HasTarget) return;
    const MatchingRow = Rows.find((Row) => RowMatchesDeepLink(Row, FocusTarget));
    if (!MatchingRow) return;
    const ModuleKey = RowModuleKey(MatchingRow);
    const LevelKey = `${ModuleKey}-${RowLevelKey(MatchingRow)}`;
    SetExpandedModules((Current) => ({ ...Current, [ModuleKey]: true }));
    SetExpandedLevels((Current) => ({ ...Current, [LevelKey]: true }));
    window.setTimeout(() => {
      document.getElementById(`teacher-assessment-record-${AssessmentAttemptId(MatchingRow) || (MatchingRow as any).assignmentId || (MatchingRow as any).assessmentAssignmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  }, [Rows, FocusTarget]);

  return (
    <div className="space-y-4">
      {Groups.map((ModuleGroup) => {
        const ModuleExpanded = Boolean(ExpandedModules[ModuleGroup.ModuleKey]);
        return (
          <div
            key={ModuleGroup.ModuleKey}
            className="math-hierarchy-panel-soft"
          >
            <button
              type="button"
              onClick={() => ToggleModule(ModuleGroup.ModuleKey)}
              className="math-hierarchy-row-compact py-4"
              title={
                ModuleExpanded ? "Hide Module Levels" : "Show Module Levels"
              }
              aria-label={
                ModuleExpanded ? "Hide Module Levels" : "Show Module Levels"
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="math-hierarchy-icon">
                  {ModuleExpanded ? (
                    <ChevronDown size={17} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] math-role-text">
                    Assessment Module
                  </p>
                  <h4 className="truncate text-lg font-black text-slate-950 dark:text-white">
                    {ModuleGroup.ModuleLabel}
                  </h4>
                </div>
              </div>
              <Chip Tone="blue">
                {ModuleGroup.Levels.length} Level
                {ModuleGroup.Levels.length === 1 ? "" : "s"}
              </Chip>
            </button>
            {ModuleExpanded ? (
              <div className="math-hierarchy-child space-y-3">
                {ModuleGroup.Levels.map((LevelGroup) => {
                  const LevelToggleKey = `${ModuleGroup.ModuleKey}-${LevelGroup.LevelKey}`;
                  const LevelExpanded = Boolean(ExpandedLevels[LevelToggleKey]);
                  return (
                    <div
                      key={LevelToggleKey}
                      className="math-hierarchy-panel-soft rounded-[22px]"
                    >
                      <button
                        type="button"
                        onClick={() => ToggleLevel(LevelToggleKey)}
                        className="math-hierarchy-row-compact"
                        title={
                          LevelExpanded
                            ? "Hide Attempt Records"
                            : "Show Attempt Records"
                        }
                        aria-label={
                          LevelExpanded
                            ? "Hide Attempt Records"
                            : "Show Attempt Records"
                        }
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="math-hierarchy-icon-sm">
                            {LevelExpanded ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] math-role-text">
                              Level Assessment
                            </p>
                            <h5 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-white">
                              {LevelGroup.LevelLabel}
                            </h5>
                          </div>
                        </div>
                        <Chip Tone="blue">
                          {LevelGroup.Rows.length} Attempt
                          {LevelGroup.Rows.length === 1 ? "" : "s"}
                        </Chip>
                      </button>
                      {LevelExpanded ? (
                        <div className="overflow-hidden border-t border-slate-200 dark:border-slate-800">
                          <div className="math-teacher-assessment-tracker-table-header grid grid-cols-[1.08fr_.58fr_.76fr_.56fr_.56fr_.88fr_.88fr_104px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900">
                            <div>Assessment</div>
                            <div>Attempt</div>
                            <div>Status</div>
                            <div>Score</div>
                            <div>Accuracy</div>
                            <div>Assigned Date</div>
                            <div>Completion Date</div>
                            <div>Action</div>
                          </div>
                          <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
                            {LevelGroup.Rows.map((Row, Index) => {
                              const AccuracyValue = RowAccuracy(Row);
                              const RowKey = String(
                                (Row as any).assignmentId ||
                                  (Row as any).assessmentAssignmentId ||
                                  (Row as any).attemptId ||
                                  `${LevelGroup.LevelKey}-${Index}`,
                              );
                              const IsFocused = RowMatchesDeepLink(Row, FocusTarget);
                              const FocusId = `teacher-assessment-record-${AssessmentAttemptId(Row) || (Row as any).assignmentId || (Row as any).assessmentAssignmentId || RowKey}`;
                              return (
                                <div
                                  id={FocusId}
                                  key={RowKey}
                                  className={`grid grid-cols-[1.08fr_.58fr_.76fr_.56fr_.56fr_.88fr_.88fr_104px] items-center gap-3 px-4 py-3 ${IsFocused ? "ring-2 ring-[color:var(--mp-role-border-strong)] bg-[color:var(--mp-role-softer)]" : ""}`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                      {AssessmentTitle(Row)}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                      {Row.levelCode || "Level"}
                                    </p>
                                  </div>
                                  <div>
                                    <Chip Tone="blue">{AttemptLabel(Row)}</Chip>
                                  </div>
                                  <div>
                                    <Chip Tone={StatusTone(Row)}>
                                      {StatusLabel(Row)}
                                    </Chip>
                                  </div>
                                  <div>
                                    <Chip Tone={ScoreTone(Row)}>
                                      {ScoreLabel(Row)}
                                    </Chip>
                                  </div>
                                  <div>
                                    <Chip
                                      Tone={
                                        AccuracyValue === null
                                          ? "slate"
                                          : AccuracyValue >= 70
                                            ? "green"
                                            : "red"
                                      }
                                    >
                                      {AccuracyValue === null
                                        ? "—"
                                        : `${CleanNumber(AccuracyValue)}%`}
                                    </Chip>
                                  </div>
                                  <div className="text-sm font-bold text-slate-600">
                                    {DateTimeLabel(Row, [
                                      "assignedAt",
                                      "assignedDate",
                                      "createdAt",
                                    ])}
                                  </div>
                                  <div className="text-sm font-bold text-slate-600">
                                    {DateTimeLabel(Row, [
                                      "completedAt",
                                      "completedDate",
                                      "completionDate",
                                      "submittedAt",
                                      "submittedDate",
                                      "latestCompletedAt",
                                      "latestSubmittedAt",
                                    ])}
                                  </div>
                                  <div className="flex justify-start">
                                    <button
                                      className="math-role-action-button px-3 py-2 text-xs"
                                      onClick={() => OnOpenAttempt(Row)}
                                      title="Open assessment result"
                                      aria-label="Open assessment result"
                                    >
                                      <Eye size={15} /> View
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
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
  );
}

function AssessmentRecordTable({
  Rows,
  OnOpenAttempt,
  FocusTarget,
}: {
  Rows: TeacherAssessmentRow[];
  OnOpenAttempt: (Row: TeacherAssessmentRow) => void;
  FocusTarget?: AssessmentDeepLinkTarget;
}) {
  const TeacherAssessmentStudentStateKey = CreatePersistedUiStateKey("teacher", "assessment-tracker", "students");
  const [ExpandedStudents, SetExpandedStudents] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(TeacherAssessmentStudentStateKey, "open-students"), {});
  const Students = useMemo(() => BuildStudents(Rows), [Rows]);

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  useEffect(() => {
    if (!FocusTarget?.HasTarget) return;
    const MatchingStudent = Students.find((Student) =>
      Student.Rows.some((Row) => RowMatchesDeepLink(Row, FocusTarget)),
    );
    if (!MatchingStudent) return;
    SetExpandedStudents((Current) => ({ ...Current, [MatchingStudent.StudentKey]: true }));
  }, [Students, FocusTarget]);

  return (
    <div className="grid gap-3">
      {!Students.length ? (
        <EmptyState message="Adjust search or filters to review assessment assignments." />
      ) : null}
      {Students.map((Student) => {
        const Stats = StudentStats(Student.Rows);
        const IsExpanded = Boolean(ExpandedStudents[Student.StudentKey]);
        return (
          <div
            key={Student.StudentKey}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => ToggleStudent(Student.StudentKey)}
              onKeyDown={(Event) => {
                if (Event.key === "Enter" || Event.key === " ")
                  ToggleStudent(Student.StudentKey);
              }}
              className="math-hierarchy-row flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  className="math-hierarchy-icon h-10 w-10"
                  onClick={(Event) => {
                    Event.stopPropagation();
                    ToggleStudent(Student.StudentKey);
                  }}
                  title={
                    IsExpanded
                      ? "Hide Assessment Hierarchy"
                      : "Show Assessment Hierarchy"
                  }
                  aria-label={
                    IsExpanded
                      ? "Hide Assessment Hierarchy"
                      : "Show Assessment Hierarchy"
                  }
                >
                  {IsExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-left text-base font-black text-slate-950 dark:text-white">
                    {Student.StudentName}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {Student.StudentCode}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Last Activity
                </span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {Stats.LastActivity}
                </span>
              </div>
            </div>
            {IsExpanded ? (
              <div className="math-hierarchy-child">
                <TeacherAssessmentHierarchyRecords
                  Rows={Student.Rows}
                  OnOpenAttempt={OnOpenAttempt}
                  FocusTarget={FocusTarget}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TeacherAssessmentAssignmentsContent() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  const SearchParams = useSearchParams();
  const DeepLinkTarget = useMemo(() => BuildAssessmentDeepLinkTarget(SearchParams), [SearchParams]);
  const TeacherAssessmentStateKey = CreatePersistedUiStateKey("teacher", "assessment-tracker");
  const [SearchText, SetSearchText] = usePersistentUiState(CreatePersistedUiStateKey(TeacherAssessmentStateKey, "search"), "");
  const [ModuleFilter, SetModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(TeacherAssessmentStateKey, "module-filter"), "");
  const [LevelFilter, SetLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(TeacherAssessmentStateKey, "level-filter"), "");
  const [StatusFilterValue, SetStatusFilterValue] = usePersistentUiState<StatusFilter>(CreatePersistedUiStateKey(TeacherAssessmentStateKey, "status-filter"), "");

  useEffect(() => {
    if (!DeepLinkTarget.HasTarget) return;

    const StudentSearchTarget = userFacingDeepLinkParam(SearchParams, ["studentCode", "studentName", "student"]);
    if (StudentSearchTarget) SetSearchText(StudentSearchTarget);

    const ModuleFilterTarget = userFacingDeepLinkParam(SearchParams, ["moduleCode", "moduleName", "module"]);
    if (ModuleFilterTarget) SetModuleFilter(ModuleFilterTarget);

    const LevelFilterTarget = userFacingDeepLinkParam(SearchParams, ["levelCode", "levelName", "level"]);
    if (LevelFilterTarget) SetLevelFilter(LevelFilterTarget);
  }, [DeepLinkTarget, SearchParams]);

  const AssessmentsQuery = useQuery({
    queryKey: ["teacher-assessments"],
    queryFn: getTeacherAssessments,
    enabled: Ready,
  });
  const Rows = AssessmentsQuery.data?.rows ?? [];

  const Modules = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    Rows.forEach((Row) =>
      ModuleMap.set(RowModuleKey(Row), RowModuleLabel(Row)),
    );
    return Array.from(ModuleMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [Rows]);

  const Levels = useMemo(() => {
    const SourceRows =
      ModuleFilter && ModuleFilter !== "ALL"
        ? Rows.filter((Row) => RowModuleKey(Row) === ModuleFilter)
        : Rows;
    const LevelMap = new Map<string, string>();
    SourceRows.forEach((Row) =>
      LevelMap.set(RowLevelKey(Row), RowLevelLabel(Row)),
    );
    return Array.from(LevelMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [Rows, ModuleFilter]);

  const FilteredRows = useMemo(() => {
    const Query = SearchText.trim().toLowerCase();
    return Rows.filter((Row) => {
      const MatchesSearch = !Query || SearchBlob(Row).includes(Query);
      const NormalizedModuleFilter = NormalizeDeepLinkText(ModuleFilter);
      const NormalizedLevelFilter = NormalizeDeepLinkText(LevelFilter);
      const MatchesModule =
        !ModuleFilter ||
        ModuleFilter === "ALL" ||
        [RowModuleKey(Row), Row.moduleCode, Row.moduleName, RowModuleLabel(Row)].some(
          (Value) => NormalizeDeepLinkText(Value) === NormalizedModuleFilter,
        );
      const MatchesLevel =
        !LevelFilter ||
        LevelFilter === "ALL" ||
        [RowLevelKey(Row), Row.levelCode, Row.levelName, RowLevelLabel(Row)].some(
          (Value) => NormalizeDeepLinkText(Value) === NormalizedLevelFilter,
        );
      const MatchesStatus =
        !StatusFilterValue ||
        StatusFilterValue === "ALL" ||
        NormalizedStatus(Row) === StatusFilterValue;
      return MatchesSearch && MatchesModule && MatchesLevel && MatchesStatus;
    });
  }, [Rows, SearchText, ModuleFilter, LevelFilter, StatusFilterValue]);

  const NotificationTargetRow = useMemo(
    () => Rows.find((Row) => RowMatchesDeepLink(Row, DeepLinkTarget)),
    [Rows, DeepLinkTarget],
  );

  const VisibleRows = useMemo(() => {
    if (FilteredRows.length > 0) return FilteredRows;
    if (DeepLinkTarget.HasTarget && NotificationTargetRow) return [NotificationTargetRow];
    return FilteredRows;
  }, [FilteredRows, DeepLinkTarget.HasTarget, NotificationTargetRow]);

  const VisibleStudents = useMemo(() => BuildStudents(VisibleRows), [VisibleRows]);

  const CurrentMetricRows = useMemo(
    () => CurrentAssessmentRows(VisibleRows),
    [VisibleRows],
  );

  const ClearedCount = CurrentMetricRows.filter(
    (Row) => NormalizedStatus(Row) === "CLEARED",
  ).length;
  const PendingCount = CurrentMetricRows.filter(
    (Row) => NormalizedStatus(Row) === "PENDING",
  ).length;
  const ReattemptCount = CurrentMetricRows.filter(
    (Row) => NormalizedStatus(Row) === "NEEDS_REATTEMPT",
  ).length;
  const AverageAccuracyValue = VisibleStudentsAssessmentAverageAccuracy(VisibleStudents);
  const PromotionReadyCount = BuildStudents(CurrentMetricRows).filter(
    (Student) => {
      const LatestRow = LatestAssessmentRow(Student.Rows) || Student.Rows[0];
      return LatestRow ? ReadyForNextLevel(LatestRow) : false;
    },
  ).length;

  if (!Ready || AssessmentsQuery.isLoading)
    return <LoadingState label="Loading assessment tracker..." />;
  if (AssessmentsQuery.isError)
    return <ErrorState message={apiErrorMessage(AssessmentsQuery.error)} />;

  return (
    <AppShell title="Assessment Tracker">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Assessment Tracking</p>
            <h1 className="math-title">Assessment Tracker</h1>
            <p className="math-subtitle">
              Track assigned level assessments, completion dates, and student
              outcomes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric
              Label="Students"
              Value={VisibleStudents.length}
              Icon={<UsersRound size={17} />}
            />
            <Metric
              Label="Assigned Assessments"
              Value={VisibleRows.length}
              Icon={<BookOpenCheck size={17} />}
            />
            <Metric
              Label="Cleared Assessments"
              Value={ClearedCount}
              Icon={<CheckCircle2 size={17} />}
            />
            <Metric
              Label="Pending Assessments"
              Value={PendingCount}
              Icon={<Clock3 size={17} />}
            />
            <Metric
              Label="Re-Attempt Needed"
              Value={ReattemptCount}
              Icon={<AlertTriangle size={17} />}
            />
            <Metric
              Label="Promotion Ready"
              Value={PromotionReadyCount}
              Icon={<ShieldCheck size={17} />}
            />
            <Metric
              Label="Average Accuracy"
              Value={AccuracyDisplay(AverageAccuracyValue)}
              Icon={<Sparkles size={17} />}
            />
          </div>
        </div>

        <div className="math-operation-panel">
          <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_220px]">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="math-input pl-11"
                value={SearchText}
                onChange={(Event) => SetSearchText(Event.target.value)}
                placeholder="Search Assessment Tracker"
              />
            </div>
            <select
              className="math-input"
              value={ModuleFilter || "__CHOOSE__"}
              onChange={(Event) => {
                const NextValue =
                  Event.target.value === "ALL" ||
                  Event.target.value === "__CHOOSE__"
                    ? ""
                    : Event.target.value;
                SetModuleFilter(NextValue);
                SetLevelFilter("");
              }}
              title="Choose Module"
              aria-label="Choose Module"
            >
              <option value="__CHOOSE__" disabled>
                Choose Module
              </option>
              <option value="ALL">All Modules</option>
              {Modules.map(([Value, Label]) => (
                <option key={Value} value={Value}>
                  {Label}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={LevelFilter || "__CHOOSE__"}
              onChange={(Event) =>
                SetLevelFilter(
                  Event.target.value === "ALL" ||
                    Event.target.value === "__CHOOSE__"
                    ? ""
                    : Event.target.value,
                )
              }
              title="Choose Level"
              aria-label="Choose Level"
            >
              <option value="__CHOOSE__" disabled>
                Choose Level
              </option>
              <option value="ALL">All Levels</option>
              {Levels.map(([Value, Label]) => (
                <option key={Value} value={Value}>
                  {Label}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={StatusFilterValue || "__CHOOSE__"}
              onChange={(Event) =>
                SetStatusFilterValue(
                  Event.target.value === "__CHOOSE__"
                    ? ""
                    : (Event.target.value as StatusFilter),
                )
              }
              title="Choose Status"
              aria-label="Choose Status"
            >
              <option value="__CHOOSE__" disabled>
                Choose Status
              </option>
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CLEARED">Cleared</option>
              <option value="NEEDS_REATTEMPT">Needs Re-Attempt</option>
            </select>
          </div>
        </div>

        {NotificationTargetRow ? (
          <NotificationTargetBanner
            tone="purple"
            label="Assessment"
            title="Assessment Record Highlighted"
            description={`${String((NotificationTargetRow as any).studentName || "Student")} · ${String(NotificationTargetRow.moduleCode || "Module")} · ${String(NotificationTargetRow.levelCode || "Level")} · ${String((NotificationTargetRow as any).assessmentTitle || (NotificationTargetRow as any).title || "Assessment")}`}
            actionLabel={AssessmentAttemptId(NotificationTargetRow) ? "View Attempt" : undefined}
            onAction={
              AssessmentAttemptId(NotificationTargetRow)
                ? () => {
                    localStorage.setItem("mathpath_active_role", "TEACHER");
                    window.dispatchEvent(new Event("mathpath-auth-changed"));
                    Router.push(
                      `/assessment-result/${encodeURIComponent(AssessmentAttemptId(NotificationTargetRow)!)}?viewer=teacher`,
                    );
                  }
                : undefined
            }
          />
        ) : null}

        <AssessmentRecordTable
          Rows={VisibleRows}
          FocusTarget={DeepLinkTarget}
          OnOpenAttempt={(Row) => {
            const AttemptId = AssessmentAttemptId(Row);
            if (AttemptId) {
              localStorage.setItem("mathpath_active_role", "TEACHER");
              window.dispatchEvent(new Event("mathpath-auth-changed"));
              Router.push(
                `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=teacher`,
              );
            }
          }}
        />
      </section>
    </AppShell>
  );
}

export default function TeacherAssessmentAssignmentsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading assessment tracker..." />}>
      <TeacherAssessmentAssignmentsContent />
    </Suspense>
  );
}
