"use client";

import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  MATHPATH_COMPLETION_TIMESTAMP_KEYS,
  formatMathPathActivityDateTime,
  formatMathPathDateTime,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import { CompareStudentCodes } from "@/lib/studentSort";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Eye,
  Layers3,
  RotateCcw,
  Search,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type AnyRow = Record<string, any>;

export type StudentNode = {
  key: string;
  studentName: string;
  studentCode: string;
  classLabel?: string;
  rows: AnyRow[];
};

export type ModuleNode = {
  key: string;
  title: string;
  moduleCode: string;
  rows: AnyRow[];
};

export function NaturalCompare(FirstValue: unknown, SecondValue: unknown) {
  return String(FirstValue ?? "").localeCompare(
    String(SecondValue ?? ""),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

export function NumericSequenceValue(Value: unknown, Fallback = 999999) {
  const Direct = Number(Value);
  if (!Number.isNaN(Direct)) return Direct;
  const Match = String(Value ?? "").match(/\d+/);
  return Match ? Number(Match[0]) : Fallback;
}

export function DpsSequenceValue(Row: AnyRow) {
  return NumericSequenceValue(
    Row.dpsNumber ??
      Row.dpsNo ??
      Row.sheetNumber ??
      Row.sheetNo ??
      Row.dpsTitle ??
      Row.assignmentTitle ??
      Row.title,
  );
}

export function WorkTypeWeight(Row: AnyRow) {
  const WorkText = String(
    Row.workType ||
      Row.resultType ||
      Row.assignmentType ||
      Row.activityType ||
      Row.type ||
      Row.assessmentTitle ||
      Row.title ||
      "",
  ).toLowerCase();
  if (WorkText.includes("assessment")) return 2;
  return 1;
}

export function CompareRowsByCurriculum(FirstRow: AnyRow, SecondRow: AnyRow) {
  return (
    NaturalCompare(moduleCodeOf(FirstRow), moduleCodeOf(SecondRow)) ||
    NaturalCompare(levelCodeOf(FirstRow), levelCodeOf(SecondRow)) ||
    NumericSequenceValue(FirstRow.lessonNumber) -
      NumericSequenceValue(SecondRow.lessonNumber) ||
    NaturalCompare(FirstRow.lessonTitle || "", SecondRow.lessonTitle || "") ||
    WorkTypeWeight(FirstRow) - WorkTypeWeight(SecondRow) ||
    DpsSequenceValue(FirstRow) - DpsSequenceValue(SecondRow) ||
    NaturalCompare(dpsLabel(FirstRow), dpsLabel(SecondRow)) ||
    attemptNumber(FirstRow) - attemptNumber(SecondRow) ||
    rowTime(FirstRow) - rowTime(SecondRow)
  );
}

export function SortRowsByCurriculum(Rows: AnyRow[]) {
  return [...Rows].sort(CompareRowsByCurriculum);
}

const LEVEL_DPS_REQUIREMENTS: Record<string, number> = {
  "YLM-L1": 40,
};

export function levelCodeOf(row: AnyRow) {
  return String(row.levelCode || row.levelId || "Level");
}

export function requiredDpsForLevel(rows: AnyRow[], levelCode?: string) {
  const selectedLevel = levelCode || levelCodeOf(rows[0] || {});
  const directValue = rows
    .map(
      (row) =>
        row.requiredDpsCount ??
        row.requiredDPSCount ??
        row.totalDpsCount ??
        row.totalDPSCount ??
        row.levelDpsCount ??
        row.levelDPSCount ??
        row.requiredDps ??
        row.requiredDPS,
    )
    .find((value) => value !== null && value !== undefined && value !== "");

  const numericDirect = Number(directValue);
  if (!Number.isNaN(numericDirect) && numericDirect > 0) return numericDirect;

  return LEVEL_DPS_REQUIREMENTS[selectedLevel] ?? Math.max(rows.length, 0);
}

export function sortLevelCodes(LevelCodes: string[]) {
  return [...LevelCodes].sort(NaturalCompare);
}

export function levelProgressSummary(rows: AnyRow[]) {
  const CurrentRows = currentWorkRows(rows);
  const SourceRows = CurrentRows.length ? CurrentRows : rows;
  const levels = sortLevelCodes(
    Array.from(new Set(SourceRows.map(levelCodeOf).filter(Boolean))),
  );
  const safeLevels = levels.length ? levels : ["Level"];

  const levelSummaries = safeLevels.map((levelCode) => {
    const levelRows = SourceRows.filter((row) => levelCodeOf(row) === levelCode);
    const MetricRows = levelRows.length ? levelRows : SourceRows;
    const completed = uniqueClearedConceptCount(MetricRows);
    const required = uniqueAssignedConceptCount(MetricRows);
    const below = uniqueNeedsReattemptCount(MetricRows);
    const pending = Math.max(required - completed, 0);
    const status =
      below > 0
        ? "Needs Re-Attempt"
        : pending > 0
          ? "Pending"
          : completed >= required && required > 0
            ? "Completed"
            : completed > 0
              ? "In Progress"
              : "Not Started";
    return { levelCode, completed, required, below, pending, status };
  });

  const current =
    levelSummaries.find((item) => item.status !== "Completed") ||
    levelSummaries[levelSummaries.length - 1];
  const completedLevels = levelSummaries.filter(
    (item) => item.status === "Completed",
  ).length;

  return {
    levels: levelSummaries,
    totalLevels: levelSummaries.length,
    completedLevels,
    currentLevel: current?.levelCode || "Level",
    currentStatus: current?.status || "Not Started",
    currentCompleted: current?.completed || 0,
    currentRequired: current?.required || 0,
    currentBelow: current?.below || 0,
  };
}

export function toneForLevelStatus(
  status: string,
): "slate" | "green" | "red" | "amber" | "blue" | "cyan" {
  if (status === "Completed") return "green";
  if (status === "Needs Re-Attempt") return "red";
  if (status === "In Progress") return "blue";
  return "amber";
}

export function studentCodeOf(row: AnyRow) {
  return String(
    row.studentCode ||
      row.targetStudentCode ||
      row.assignedToLabel?.match(/\(([^)]+)\)/)?.[1] ||
      row.assignedToId ||
      "GROUP",
  );
}

export function studentNameOf(row: AnyRow) {
  return String(
    row.studentName ||
      row.targetStudentName ||
      row.assignedToLabel?.replace(/\s*\([^)]*\)\s*$/, "") ||
      "Student / Group",
  );
}

export function moduleCodeOf(row: AnyRow) {
  return String(row.moduleCode || row.moduleId || "MODULE");
}

export function moduleTitle(row: AnyRow) {
  return `${row.moduleCode || "Module"}${row.moduleName ? ` · ${row.moduleName}` : ""}`;
}

export function levelLabel(row: AnyRow) {
  return `${row.levelCode || "Level"}${row.levelName ? ` · ${row.levelName}` : ""}`;
}

export function lessonLabel(row: AnyRow) {
  return `Lesson ${row.lessonNumber ?? "-"}${row.lessonTitle ? ` · ${row.lessonTitle}` : ""}`;
}

export function dpsLabel(row: AnyRow) {
  if (row.assessmentTitle && !row.dpsTitle) return String(row.assessmentTitle);
  return `${row.dpsNumber ? `DPS ${row.dpsNumber}` : "DPS"}${row.dpsTitle ? ` · ${row.dpsTitle}` : ""}`;
}

export function CompactLessonLabel(Row: AnyRow) {
  const LessonNumber =
    Row.lessonNumber ?? Row.lessonNo ?? Row.lessonSequence ?? "-";
  return `Lesson-${LessonNumber}`;
}

export function CompactDpsLabel(Row: AnyRow) {
  const DpsNumber =
    Row.dpsNumber ??
    Row.dpsNo ??
    Row.sheetNumber ??
    Row.sheetNo ??
    DpsSequenceValue(Row);
  if (Row.assessmentTitle && !Row.dpsTitle) return "Assessment";
  return `DPS-${DpsNumber || "-"}`;
}

export function CompactModuleLevelLabel(Row: AnyRow) {
  const ModuleLabel = String(Row.moduleName || Row.moduleCode || "Module");
  const LevelLabel = String(Row.levelCode || Row.levelName || "Level");
  return `${ModuleLabel} · ${LevelLabel}`;
}

export function CompactPracticeTitle(Row: AnyRow) {
  return `${CompactLessonLabel(Row)} · ${CompactDpsLabel(Row)}`;
}

export function recordTitle(row: AnyRow) {
  return (
    row.assignmentTitle ||
    row.assessmentTitle ||
    row.title ||
    row.dpsTitle ||
    "Assigned Work"
  );
}

export function scoreText(row: AnyRow) {
  const score =
    row.score ??
    row.totalScore ??
    row.scoreObtained ??
    row.marksObtained ??
    row.obtainedMarks ??
    row.marksScored ??
    row.attemptScore ??
    row.latestAttemptScore ??
    row.latestScore ??
    row.bestScore ??
    row.correct ??
    row.correctCount ??
    row.latestCorrectCount ??
    row.bestCorrectCount ??
    row.correctAnswers ??
    row.attemptCorrectCount;

  const max =
    row.maxScore ??
    row.totalMarks ??
    row.outOf ??
    row.totalQuestions ??
    row.questionCount ??
    row.totalQuestionCount ??
    row.questionsCount ??
    row.question_count ??
    row.total ??
    10;

  if (score !== null && score !== undefined && score !== "") {
    return `${score} / ${max}`;
  }

  const accuracyValue = accuracy(row);
  if (isCompleted(row) && accuracyValue > 0 && max) {
    const inferredScore = Math.round((Number(max) * accuracyValue) / 100);
    return `${inferredScore} / ${max}`;
  }

  return "—";
}

export function numberValue(value: unknown, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(Number(value))
  )
    return fallback;
  return Number(value);
}

export function accuracy(row: AnyRow) {
  return numberValue(
    row.accuracy ?? row.accuracyPercentage ?? row.averageAccuracy,
    0,
  );
}

export function averageAccuracy(rows: AnyRow[]) {
  const values = rows.map(accuracy).filter((value) => value > 0);
  if (!values.length) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

export function isCompleted(row: AnyRow) {
  const status = String(row.status ?? row.attemptStatus ?? "").toUpperCase();
  const normalizedStatus = status.replace(/[^A-Z]/g, "");
  return (
    normalizedStatus.includes("SUBMITTED") ||
    normalizedStatus.includes("COMPLETED") ||
    normalizedStatus.includes("CLEARED") ||
    normalizedStatus.includes("AUTOSUBMITTED") ||
    normalizedStatus.includes("NEEDSREATTEMPT") ||
    normalizedStatus.includes("REATTEMPTAVAILABLE") ||
    normalizedStatus.includes("BELOWBENCHMARK") ||
    Boolean(row.completedAttemptCount) ||
    Boolean(row.completedAt || row.submittedAt || row.latestCompletedAt)
  );
}

export function isBelowBenchmark(row: AnyRow) {
  const status = String(row.status ?? row.attemptStatus ?? "").toUpperCase();
  const normalizedStatus = status.replace(/[^A-Z]/g, "");
  const benchmarkText = String(row.benchmarkStatus ?? "").toUpperCase();
  const normalizedBenchmark = benchmarkText.replace(/[^A-Z]/g, "");

  if (normalizedStatus.includes("CLEARED")) return false;
  if (normalizedBenchmark.includes("MET") && !normalizedBenchmark.includes("NOTMET")) return false;

  return (
    normalizedStatus.includes("NEEDSREATTEMPT") ||
    normalizedStatus.includes("REATTEMPTAVAILABLE") ||
    normalizedStatus.includes("BELOWBENCHMARK") ||
    normalizedBenchmark.includes("BELOW") ||
    normalizedBenchmark.includes("NOTMET") ||
    (accuracy(row) < 70 && isCompleted(row))
  );
}

export function needsReattempt(row: AnyRow) {
  if (row.isActive === false) return false;
  const status = String(row.status ?? row.attemptStatus ?? "").toUpperCase();
  const normalizedStatus = status.replace(/[^A-Z]/g, "");
  if (normalizedStatus.includes("CLEARED")) return false;
  return (
    isBelowBenchmark(row) ||
    normalizedStatus.includes("NEEDSREATTEMPT") ||
    normalizedStatus.includes("REATTEMPTAVAILABLE") ||
    normalizedStatus.includes("BELOWBENCHMARK")
  );
}

export function workUnitKey(row: AnyRow) {
  const IsAssessment =
    Boolean(row.assessmentId || row.assessmentCode || row.assessmentTitle) &&
    !row.dpsNumber &&
    !row.dpsNo &&
    !row.sheetNumber &&
    !row.sheetNo &&
    !row.dpsTitle;

  if (IsAssessment) {
    return String(
      row.assessmentAssignmentId ||
        row.assignedAssessmentId ||
        row.assignmentId ||
        row.id ||
        [
          studentCodeOf(row),
          moduleCodeOf(row),
          levelCodeOf(row),
          row.assessmentId || row.assessmentTitle || "assessment",
        ].join("::"),
    );
  }

  const StableLessonConcept = String(
    row.lessonNumber ||
      row.lessonNo ||
      row.lessonSequence ||
      row.lessonTitle ||
      CompactLessonLabel(row) ||
      "lesson",
  )
    .trim()
    .toLowerCase();

  const DpsTextForConcept = [
    row.dpsConceptKey,
    row.dpsNumber,
    row.dpsNo,
    row.dpsTitle,
    row.assignmentTitle,
    row.title,
  ]
    .filter(Boolean)
    .map((Value) => String(Value))
    .find((Value) => /dps\s*[-#:]*\s*\d+/i.test(Value));
  const ParsedDpsConcept = DpsTextForConcept?.match(/dps\s*[-#:]*\s*(\d+)/i)?.[1];
  const StableDpsConcept = String(
    row.dpsConceptKey ||
      row.dpsNumber ||
      row.dpsNo ||
      (ParsedDpsConcept ? `DPS-${ParsedDpsConcept}` : undefined) ||
      row.dpsTitle ||
      row.assignmentTitle ||
      row.title ||
      row.sheetNumber ||
      row.sheetNo ||
      CompactDpsLabel(row) ||
      "dps",
  )
    .trim()
    .toLowerCase();

  return String(
    [
      studentCodeOf(row),
      moduleCodeOf(row),
      levelCodeOf(row),
      `lesson:${StableLessonConcept}`,
      `dps:${StableDpsConcept}`,
    ].join("::"),
  );
}

function rowsWithAttemptHistory(rows: AnyRow[]) {
  return rows.flatMap((Row) => {
    const History = Array.isArray(Row.attemptHistory) ? Row.attemptHistory : [];
    if (!History.length) return [Row];

    return History.map((AttemptRow: AnyRow, Index: number) => {
      const MergedRow: AnyRow = {
        ...Row,
        ...AttemptRow,
        attemptGroupId: AttemptRow.attemptGroupId ?? Row.attemptGroupId ?? Row.attempt_group_id,
        attemptNumber:
          AttemptRow.attemptNumber ??
          AttemptRow.reattemptNumber ??
          AttemptRow.retryNumber ??
          Index + 1,
        attemptSequence: AttemptRow.attemptSequence ?? Index + 1,
        isReattempt: Boolean(AttemptRow.isReattempt ?? Index > 0),
        parentAssignmentId: Row.assignmentId ?? Row.id,
      };
      const Status = String(MergedRow.status ?? MergedRow.attemptStatus ?? "").toUpperCase();
      const IsPendingRetry = Status.includes("PENDING") || Status.includes("IN_PROGRESS") || !AttemptRow.completedAt && !AttemptRow.submittedAt && !AttemptRow.latestCompletedAt && AttemptRow.score == null && AttemptRow.accuracy == null && AttemptRow.accuracyPercentage == null;
      if (IsPendingRetry) {
        return {
          ...MergedRow,
          status: MergedRow.status || "PENDING",
          score: AttemptRow.score ?? null,
          totalMarks: AttemptRow.totalMarks ?? AttemptRow.maxScore ?? null,
          accuracy: AttemptRow.accuracy ?? null,
          accuracyPercentage: AttemptRow.accuracyPercentage ?? null,
          completedAt: AttemptRow.completedAt ?? null,
          submittedAt: AttemptRow.submittedAt ?? null,
          latestCompletedAt: AttemptRow.latestCompletedAt ?? null,
          benchmarkStatus: AttemptRow.benchmarkStatus ?? "PENDING",
        };
      }
      return MergedRow;
    });
  });
}

export function currentWorkRows(rows: AnyRow[]) {
  const CurrentRows = new Map<string, AnyRow>();
  rowsWithAttemptHistory(rows).forEach((Row, Index) => {
    const Key = workUnitKey(Row);
    const Existing = CurrentRows.get(Key);
    if (!Existing) {
      CurrentRows.set(Key, Row);
      return;
    }
    const ExistingAttempt = attemptNumber(Existing);
    const RowAttempt = attemptNumber(Row);
    const ExistingTime = rowTime(Existing);
    const RowTime = rowTime(Row);
    if (
      RowAttempt > ExistingAttempt ||
      (RowAttempt === ExistingAttempt && RowTime >= ExistingTime) ||
      (RowAttempt === ExistingAttempt && RowTime === ExistingTime && Index >= 0)
    ) {
      CurrentRows.set(Key, Row);
    }
  });
  return Array.from(CurrentRows.values());
}

export function uniqueAssignedConceptCount(rows: AnyRow[]) {
  return currentWorkRows(rows).length;
}

export function uniqueClearedConceptCount(rows: AnyRow[]) {
  return currentWorkRows(rows).filter(
    (Row) => isCompleted(Row) && !isBelowBenchmark(Row),
  ).length;
}

export function uniquePendingConceptCount(rows: AnyRow[]) {
  return currentWorkRows(rows).filter((Row) => !isCompleted(Row)).length;
}

export function uniqueNeedsReattemptCount(rows: AnyRow[]) {
  const Keys = new Set<string>();
  const ClearedKeys = new Set<string>();

  rowsWithAttemptHistory(rows).forEach((Row) => {
    const Key = workUnitKey(Row);
    if (isCompleted(Row) && !isBelowBenchmark(Row)) {
      ClearedKeys.add(Key);
      Keys.delete(Key);
      return;
    }
    if (needsReattempt(Row) && !ClearedKeys.has(Key)) Keys.add(Key);
  });

  return Keys.size;
}

export function uniqueCompletedConceptCount(rows: AnyRow[]) {
  return uniqueClearedConceptCount(rows);
}

export function statusLabel(row: AnyRow) {
  const text = String(row.status ?? "").toUpperCase();
  if (text === "PENDING" || text === "NOT_STARTED" || !text) return "Pending";
  if (text === "IN_PROGRESS") return "Pending";
  if (text.includes("CLEARED")) return "Cleared";
  if (text.includes("REATTEMPT_AVAILABLE") || text.includes("NEEDS_REATTEMPT")) return "Needs Re-Attempt";
  if (text === "AUTO_SUBMITTED")
    return isBelowBenchmark(row) ? "Needs Re-Attempt" : "Cleared";
  if (text === "SUBMITTED" || text === "COMPLETED")
    return isBelowBenchmark(row) ? "Needs Re-Attempt" : "Cleared";
  if (row.isActive === false) return "Archived";
  if (row.isActive === true) return "Active";
  return row.status ? String(row.status).replaceAll("_", " ") : "Pending";
}

export function rowDate(row: AnyRow, keys: string[]) {
  const value = getFirstMathPathTimestamp(row, keys);
  return value ? formatMathPathDateTime(value) : "Pending";
}

export function completedText(row: AnyRow) {
  if (!isCompleted(row)) return "Pending";
  return rowDate(row, MATHPATH_COMPLETION_TIMESTAMP_KEYS as unknown as string[]);
}

export function latestActivity(rows: AnyRow[]) {
  return formatMathPathActivityDateTime(rows);
}

export function buildStudents(rows: AnyRow[]): StudentNode[] {
  const map = new Map<string, StudentNode>();
  rows.forEach((row) => {
    const code = studentCodeOf(row);
    if (!map.has(code)) {
      map.set(code, {
        key: code,
        studentCode: code,
        studentName: studentNameOf(row),
        classLabel: [
          row.className || row.targetClassName,
          row.section || row.targetSection,
        ]
          .filter(Boolean)
          .join(" "),
        rows: [],
      });
    }
    map.get(code)!.rows.push(row);
  });
  return Array.from(map.values()).sort((FirstStudent, SecondStudent) =>
    CompareStudentCodes(FirstStudent.studentCode, SecondStudent.studentCode),
  );
}

export function buildModules(rows: AnyRow[]): ModuleNode[] {
  const map = new Map<string, ModuleNode>();
  rows.forEach((row) => {
    const code = moduleCodeOf(row);
    if (!map.has(code)) {
      map.set(code, {
        key: code,
        moduleCode: code,
        title: moduleTitle(row),
        rows: [],
      });
    }
    map.get(code)!.rows.push(row);
  });
  return Array.from(map.values()).sort(
    (FirstModule, SecondModule) =>
      NaturalCompare(FirstModule.moduleCode, SecondModule.moduleCode) ||
      NaturalCompare(FirstModule.title, SecondModule.title),
  );
}

export function searchText(row: AnyRow) {
  return [
    row.studentName,
    row.studentCode,
    row.targetStudentName,
    row.targetStudentCode,
    row.assignmentTitle,
    row.assessmentTitle,
    row.title,
    row.dpsTitle,
    row.lessonTitle,
    row.lessonNumber,
    row.levelName,
    row.levelCode,
    row.moduleName,
    row.moduleCode,
    row.status,
    row.benchmarkStatus,
    row.score,
    row.accuracy,
    row.accuracyPercentage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function studentStats(rows: AnyRow[]) {
  const CurrentRows = currentWorkRows(rows);
  const completed = uniqueClearedConceptCount(CurrentRows);
  const pending = uniquePendingConceptCount(CurrentRows);
  const below = uniqueNeedsReattemptCount(CurrentRows);
  const reattempt = below;
  return {
    total: CurrentRows.length,
    completed,
    pending,
    below,
    reattempt,
    avg: averageAccuracy(CurrentRows),
    last: latestActivity(CurrentRows.length ? CurrentRows : rows),
  };
}

export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm dark:bg-slate-950/75">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        {icon ? (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
            {icon}
          </span>
        ) : null}
        <p className="text-[11px] font-black uppercase tracking-[0.14em]">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function Chip({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue" | "cyan" | "purple";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StandardViewButton({
  label,
  tooltip,
  onClick,
  compact = false,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`math-role-action-button ${
        compact ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm"
      }`}
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <Eye size={compact ? 14 : 16} />
      {label}
    </button>
  );
}

export function StudentSummaryTable({
  students,
  onOpen,
  viewLabel = "View Details",
  viewTooltip = "Open student details",
}: {
  students: StudentNode[];
  onOpen: (student: StudentNode) => void;
  viewLabel?: string;
  viewTooltip?: string;
}) {
  return (
    <div className="math-practice-overview-table overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="math-practice-overview-table-header grid grid-cols-[minmax(180px,1fr)_minmax(104px,.48fr)_minmax(104px,.48fr)_minmax(104px,.48fr)_minmax(128px,.56fr)_minmax(118px,.52fr)_minmax(150px,.68fr)_minmax(130px,.58fr)] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <div>Student</div>
        <div>Assigned DPS</div>
        <div>Cleared DPS</div>
        <div>Pending DPS</div>
        <div>Needs Re-Attempt</div>
        <div>Average Accuracy</div>
        <div>Last Activity</div>
        <div>Action</div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {students.map((student) => {
          const stats = studentStats(student.rows);
          return (
            <div
              key={student.key}
              className="grid grid-cols-[minmax(180px,1fr)_minmax(104px,.48fr)_minmax(104px,.48fr)_minmax(104px,.48fr)_minmax(128px,.56fr)_minmax(118px,.52fr)_minmax(150px,.68fr)_minmax(130px,.58fr)] items-center gap-3 px-5 py-4 transition hover:bg-blue-50/45 dark:hover:bg-slate-900/70"
            >
              <div className="min-w-0">
                <button
                  className="truncate text-left text-base font-black text-slate-950 transition hover:text-blue-700 dark:text-white"
                  onClick={() => onOpen(student)}
                  title="Open student details"
                  aria-label="Open student details"
                >
                  {student.studentName}{" "}
                  <span className="text-slate-400">
                    ({student.studentCode})
                  </span>
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stats.below ? (
                    <Chip tone="red">Needs Re-Attempt: {stats.below}</Chip>
                  ) : stats.pending ? (
                    <Chip tone="amber">Pending: {stats.pending}</Chip>
                  ) : (
                    <Chip tone="green">On Track</Chip>
                  )}
                </div>
              </div>
              <div>
                <Chip tone="blue">{stats.total}</Chip>
              </div>
              <div>
                <Chip tone="green">{stats.completed}</Chip>
              </div>
              <div>
                <Chip tone={stats.pending ? "amber" : "green"}>
                  {stats.pending}
                </Chip>
              </div>
              <div>
                <Chip tone={stats.below ? "red" : "green"}>
                  {stats.below}
                </Chip>
              </div>
              <div>
                <Chip tone={stats.avg >= 70 ? "green" : "red"}>
                  {stats.avg}%
                </Chip>
              </div>
              <div className="text-sm font-bold text-slate-600">
                {stats.last}
              </div>
              <div className="flex justify-start">
                <StandardViewButton
                  label={viewLabel}
                  tooltip={viewTooltip}
                  onClick={() => onOpen(student)}
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

export function RecordWorkspace({
  title,
  subtitle,
  backLabel = "Back",
  onBack,
  rows,
  role,
  onView,
  onArchive,
  onRestore,
  onDelete,
  initialTab = "overview",
  focusTarget,
}: {
  title: string;
  subtitle: string;
  backLabel?: string;
  onBack: () => void;
  rows: AnyRow[];
  role: "admin" | "teacher" | "student";
  onView?: (row: AnyRow) => void;
  onArchive?: (row: AnyRow) => void;
  onRestore?: (row: AnyRow) => void;
  onDelete?: (row: AnyRow) => void;
  initialTab?: "overview" | "lessons" | "records" | "actions";
  focusTarget?: {
    assignmentId?: string;
    attemptId?: string;
    dpsId?: string;
    lessonId?: string;
    moduleCode?: string;
    levelCode?: string;
    targetAction?: string;
  };
}) {
  void backLabel;
  void onBack;
  const [tab, setTab] = useState<
    "overview" | "lessons" | "records" | "actions"
  >(initialTab);
  const [lessonFilter, setLessonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const lessons = useMemo(() => {
    return Array.from(
      new Set(
        rows.map((row) => String(row.lessonNumber ?? "-")).filter(Boolean),
      ),
    ).sort((a, b) => Number(a) - Number(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const lessonOk =
        !lessonFilter ||
        lessonFilter === "ALL" ||
        String(row.lessonNumber ?? "-") === lessonFilter;
      const statusOk =
        !statusFilter ||
        statusFilter === "ALL" ||
        statusLabel(row).toUpperCase() === statusFilter;
      const searchOk = !q || searchText(row).includes(q);
      return lessonOk && statusOk && searchOk;
    });
  }, [rows, lessonFilter, statusFilter, search]);

  const tabItems = useMemo(() => {
    if (role === "admin") {
      return [
        ["overview", "Overview"],
        ["lessons", "Lesson Insights"],
        ["actions", "Manage"],
      ] as const;
    }

    if (role === "teacher") {
      return [
        ["overview", "Overview"],
        ["lessons", "Lesson Insights"],
      ] as const;
    }

    return [
      ["overview", "Overview"],
      ["lessons", "Lesson Insights"],
    ] as const;
  }, [role]);

  const progressSummary =
    role === "student"
      ? levelProgressSummary(filteredRows.length ? filteredRows : rows)
      : null;
  const baseStats = studentStats(filteredRows);
  const stats = progressSummary
    ? {
        ...baseStats,
        total: progressSummary.currentRequired,
        completed: progressSummary.currentCompleted,
        pending: Math.max(
          progressSummary.currentRequired - progressSummary.currentCompleted,
          0,
        ),
        below: progressSummary.currentBelow,
      }
    : baseStats;
  const [OpenModuleGroups, SetOpenModuleGroups] = useState<
    Record<string, boolean>
  >({});
  const [OpenLevelGroups, SetOpenLevelGroups] = useState<
    Record<string, boolean>
  >({});
  const [OpenLessonGroups, SetOpenLessonGroups] = useState<
    Record<string, boolean>
  >({});

  function ToggleModuleGroup(ModuleKey: string) {
    SetOpenModuleGroups((Current) => ({
      ...Current,
      [ModuleKey]: !Current[ModuleKey],
    }));
  }

  function ToggleLevelGroup(LevelKey: string) {
    SetOpenLevelGroups((Current) => ({
      ...Current,
      [LevelKey]: !Current[LevelKey],
    }));
  }

  function ToggleLessonGroup(LessonKey: string) {
    SetOpenLessonGroups((Current) => ({
      ...Current,
      [LessonKey]: !Current[LessonKey],
    }));
  }

  const lessonGroups = useMemo(() => {
    const map = new Map<string, AnyRow[]>();
    SortRowsByCurriculum(filteredRows).forEach((row) => {
      const key = `${row.moduleCode || "Module"}|${row.levelCode || "Level"}|${row.lessonNumber || "-"}|${row.lessonTitle || "Lesson"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries())
      .map(([key, groupRows]) => ({
        key,
        rows: SortRowsByCurriculum(groupRows),
        sample: SortRowsByCurriculum(groupRows)[0],
      }))
      .sort((FirstGroup, SecondGroup) =>
        CompareRowsByCurriculum(FirstGroup.sample, SecondGroup.sample),
      );
  }, [filteredRows]);

  const ModuleLevelGroups = useMemo(() => {
    const GroupMap = new Map<string, typeof lessonGroups>();
    lessonGroups.forEach((LessonGroup) => {
      const GroupKey = `${moduleCodeOf(LessonGroup.sample)}|${levelCodeOf(LessonGroup.sample)}`;
      if (!GroupMap.has(GroupKey))
        GroupMap.set(GroupKey, [] as typeof lessonGroups);
      GroupMap.get(GroupKey)!.push(LessonGroup);
    });
    return Array.from(GroupMap.entries())
      .map(([GroupKey, Lessons]) => ({
        GroupKey,
        ModuleKey: moduleCodeOf(Lessons[0].sample),
        LevelKey: levelCodeOf(Lessons[0].sample),
        Sample: Lessons[0].sample,
        Lessons,
        Rows: Lessons.flatMap((Lesson) => Lesson.rows),
      }))
      .sort((FirstGroup, SecondGroup) =>
        CompareRowsByCurriculum(FirstGroup.Sample, SecondGroup.Sample),
      );
  }, [lessonGroups]);

  const ModuleGroups = useMemo(() => {
    const GroupMap = new Map<string, typeof ModuleLevelGroups>();
    ModuleLevelGroups.forEach((LevelGroup) => {
      if (!GroupMap.has(LevelGroup.ModuleKey))
        GroupMap.set(LevelGroup.ModuleKey, [] as typeof ModuleLevelGroups);
      GroupMap.get(LevelGroup.ModuleKey)!.push(LevelGroup);
    });
    return Array.from(GroupMap.entries())
      .map(([ModuleKey, Levels]) => ({
        ModuleKey,
        Sample: Levels[0].Sample,
        Levels,
        Rows: Levels.flatMap((Level) => Level.Rows),
      }))
      .sort((FirstGroup, SecondGroup) =>
        CompareRowsByCurriculum(FirstGroup.Sample, SecondGroup.Sample),
      );
  }, [ModuleLevelGroups]);

  useEffect(() => {
    const Action = String(focusTarget?.targetAction || "").toLowerCase();
    const ShouldOpenLessons =
      initialTab === "lessons" ||
      Action.includes("lesson-insights") ||
      Boolean(focusTarget?.assignmentId || focusTarget?.attemptId || focusTarget?.dpsId || focusTarget?.lessonId);
    if (!ShouldOpenLessons || !rows.length) return;

    setTab("lessons");

    const TargetRow =
      rows.find((Row) => {
        const AssignmentMatch = focusTarget?.assignmentId && String(Row.assignmentId || Row.id || "") === focusTarget.assignmentId;
        const AttemptMatch = focusTarget?.attemptId && String(Row.attemptId || Row.latestAttemptId || "") === focusTarget.attemptId;
        const DpsMatch = focusTarget?.dpsId && String(Row.dpsId || Row.dps_id || "") === focusTarget.dpsId;
        const LessonMatch = focusTarget?.lessonId && String(Row.lessonId || Row.lesson_id || "") === focusTarget.lessonId;
        const ModuleMatch = !focusTarget?.moduleCode || moduleCodeOf(Row) === focusTarget.moduleCode;
        const LevelMatch = !focusTarget?.levelCode || levelCodeOf(Row) === focusTarget.levelCode;
        return (AssignmentMatch || AttemptMatch || DpsMatch || LessonMatch || (!focusTarget?.assignmentId && !focusTarget?.attemptId && !focusTarget?.dpsId && !focusTarget?.lessonId)) && ModuleMatch && LevelMatch;
      }) || rows[0];

    const ModuleKey = moduleCodeOf(TargetRow);
    const LevelKey = `${moduleCodeOf(TargetRow)}|${levelCodeOf(TargetRow)}`;
    const LessonGroupKey = `${TargetRow.moduleCode || "Module"}|${TargetRow.levelCode || "Level"}|${TargetRow.lessonNumber || "-"}|${TargetRow.lessonTitle || "Lesson"}`;

    SetOpenModuleGroups((Current) => ({ ...Current, [ModuleKey]: true }));
    SetOpenLevelGroups((Current) => ({ ...Current, [LevelKey]: true }));
    SetOpenLessonGroups((Current) => ({ ...Current, [LessonGroupKey]: true }));
  }, [
    focusTarget?.assignmentId,
    focusTarget?.attemptId,
    focusTarget?.dpsId,
    focusTarget?.lessonId,
    focusTarget?.moduleCode,
    focusTarget?.levelCode,
    focusTarget?.targetAction,
    initialTab,
    rows,
  ]);

  const viewLabel = role === "student" ? "View Result" : "View Details";
  const viewTip =
    role === "student"
      ? "View your result"
      : role === "teacher"
        ? "Review student work"
        : "Review full record";
  const heroKicker =
    role === "student"
      ? "Progress Detail"
      : role === "teacher"
        ? "Student Progress Review"
        : "Student Assignment Profile";
  const overviewDescription =
    role === "student"
      ? "Review completed work, pending practice, scores, lesson progress, and result history for this module."
      : role === "teacher"
        ? "Review assigned practice, completion date, and support needs for this student."
        : "Review assigned practice, completion date, and administrative actions for this student.";

  return (
    <div className="w-full space-y-6">
      <div className="math-hero">
        <div>
          <p className="math-kicker">{heroKicker}</p>
          <h1 className="math-title">{title}</h1>
          <p className="math-subtitle">{overviewDescription}</p>
          {subtitle ? (
            <p className="mt-2 text-sm font-bold text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label={role === "student" ? "Required DPS" : "Assigned DPS"}
            value={stats.total}
            icon={<Layers3 size={15} />}
          />
          <Metric
            label="Cleared DPS"
            value={stats.completed}
            icon={<CheckCircle2 size={15} />}
          />
          <Metric
            label="Pending DPS"
            value={stats.pending}
            icon={<Clock3 size={15} />}
          />
          <Metric
            label="Needs Re-Attempt"
            value={stats.below}
            icon={<AlertTriangle size={15} />}
          />
          <Metric
            label="Average Accuracy"
            value={`${stats.avg}%`}
            icon={<TrendingUp size={15} />}
          />
        </div>
      </div>

      <div className="mt-6 rounded-[30px] border border-slate-200 bg-white/92 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_210px]">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="math-input pl-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Lesson Insights"
            />
          </div>
          <select
            className="math-input"
            value={lessonFilter}
            onChange={(e) => setLessonFilter(e.target.value)}
            title="Filter by lesson"
            aria-label="Filter by lesson"
          >
            <option value="" disabled>
              Choose Lesson
            </option>
            <option value="ALL">All Lessons</option>
            {lessons.map((lesson) => (
              <option key={lesson} value={lesson}>
                Lesson-{lesson}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by status"
            aria-label="Filter by status"
          >
            <option value="" disabled>
              Choose Status
            </option>
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CLEARED">Cleared</option>
            <option value="NEEDS RE-ATTEMPT">Needs Re-Attempt</option>
          </select>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tabItems.map(([key, label]) => (
            <button
              key={key}
              className={`math-role-tab ${tab === key ? "math-role-tab-active" : ""}`}
              onClick={() => setTab(key as any)}
              title={`Open ${label}`}
              aria-label={`Open ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "overview" ? (
          <WorkspaceOverview
            role={role}
            rows={filteredRows}
            allRows={rows}
            progressSummary={progressSummary}
            onView={onView}
            viewLabel={viewLabel}
            viewTip={viewTip}
          />
        ) : null}

        {tab === "lessons" ? (
          role === "student" ? (
            <div className="grid gap-5">
              {lessonGroups.map((lesson) => {
                const IsOpen = Boolean(OpenLessonGroups[lesson.key]);
                return (
                  <section
                    key={lesson.key}
                    className="math-hierarchy-panel p-5"
                  >
                    <button
                      type="button"
                      className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                      onClick={() => ToggleLessonGroup(lesson.key)}
                      aria-expanded={IsOpen}
                      title={IsOpen ? "Collapse lesson insight" : "Expand lesson insight"}
                    >
                      <div>
                        <p className="math-kicker">Lesson</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                          {CompactLessonLabel(lesson.sample)}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="blue">{uniqueAssignedConceptCount(lesson.rows)} DPS</Chip>
                        <Chip tone="green">
                          {uniqueClearedConceptCount(lesson.rows)} Cleared
                        </Chip>
                        <Chip tone={averageAccuracy(lesson.rows) >= 70 ? "green" : "red"}>
                          {averageAccuracy(lesson.rows)}% Avg
                        </Chip>
                        <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                          <ChevronDown className={IsOpen ? "rotate-180 transition" : "transition"} size={18} />
                        </span>
                      </div>
                    </button>
                    {IsOpen ? (
                      <div className="mt-4">
                        <CompactRecordTable
                          rows={lesson.rows}
                          onView={onView}
                          viewLabel={viewLabel}
                          viewTip={viewTip}
                          dense
                          hideLessonColumn
                          showAttemptColumn
                        />
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-5">
              {ModuleGroups.map((ModuleGroup) => {
                const IsModuleOpen = Boolean(OpenModuleGroups[ModuleGroup.ModuleKey]);
                const ModuleRows = ModuleGroup.Rows;
                return (
                  <section
                    key={ModuleGroup.ModuleKey}
                    className="math-hierarchy-panel p-5"
                  >
                    <button
                      type="button"
                      className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                      onClick={() => ToggleModuleGroup(ModuleGroup.ModuleKey)}
                      aria-expanded={IsModuleOpen}
                      title={IsModuleOpen ? "Collapse module" : "Expand module"}
                    >
                      <div>
                        <p className="math-kicker">Module</p>
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">
                          {moduleTitle(ModuleGroup.Sample)}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="blue">{ModuleGroup.Levels.length} Level(s)</Chip>
                        <Chip tone="blue">{uniqueAssignedConceptCount(ModuleRows)} DPS</Chip>
                        <Chip tone="green">
                          {uniqueClearedConceptCount(ModuleRows)} Cleared
                        </Chip>
                        <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                          <ChevronDown className={IsModuleOpen ? "rotate-180 transition" : "transition"} size={18} />
                        </span>
                      </div>
                    </button>
                    {IsModuleOpen ? (
                      <div className="mt-4 grid gap-4">
                        {ModuleGroup.Levels.map((LevelGroup) => {
                          const IsLevelOpen = Boolean(OpenLevelGroups[LevelGroup.GroupKey]);
                          const LevelRows = LevelGroup.Rows;
                          return (
                            <div
                              key={LevelGroup.GroupKey}
                              className="math-hierarchy-panel-soft p-4"
                            >
                              <button
                                type="button"
                                className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                                onClick={() => ToggleLevelGroup(LevelGroup.GroupKey)}
                                aria-expanded={IsLevelOpen}
                                title={IsLevelOpen ? "Collapse level" : "Expand level"}
                              >
                                <div>
                                  <p className="math-kicker">Level</p>
                                  <h4 className="text-lg font-black text-slate-950 dark:text-white">
                                    {levelLabel(LevelGroup.Sample)}
                                  </h4>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip tone="blue">{LevelGroup.Lessons.length} Lesson(s)</Chip>
                                  <Chip tone="green">
                                    {uniqueClearedConceptCount(LevelRows)} Cleared
                                  </Chip>
                                  <Chip tone={averageAccuracy(LevelRows) >= 70 ? "green" : "red"}>
                                    {averageAccuracy(LevelRows)}% Avg
                                  </Chip>
                                  <span className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                                    <ChevronDown className={IsLevelOpen ? "rotate-180 transition" : "transition"} size={18} />
                                  </span>
                                </div>
                              </button>
                              {IsLevelOpen ? (
                                <div className="mt-4 grid gap-4">
                                  {LevelGroup.Lessons.map((lesson) => {
                                    const IsOpen = Boolean(OpenLessonGroups[lesson.key]);
                                    return (
                                      <div
                                        key={lesson.key}
                                        className="math-hierarchy-panel-soft p-4"
                                      >
                                        <button
                                          type="button"
                                          className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                                          onClick={() => ToggleLessonGroup(lesson.key)}
                                          aria-expanded={IsOpen}
                                          title={IsOpen ? "Collapse lesson insight" : "Expand lesson insight"}
                                        >
                                          <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">
                                              Lesson
                                            </p>
                                            <h4 className="mt-1 text-lg font-black">
                                              {CompactLessonLabel(lesson.sample)}
                                            </h4>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Chip tone="blue">{uniqueAssignedConceptCount(lesson.rows)} DPS</Chip>
                                            <Chip tone="green">
                                              {uniqueClearedConceptCount(lesson.rows)} Cleared
                                            </Chip>
                                            <Chip tone={averageAccuracy(lesson.rows) >= 70 ? "green" : "red"}>
                                              {averageAccuracy(lesson.rows)}% Avg
                                            </Chip>
                                            <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                                              <ChevronDown className={IsOpen ? "rotate-180 transition" : "transition"} size={18} />
                                            </span>
                                          </div>
                                        </button>
                                        {IsOpen ? (
                                          <div className="mt-4">
                                            <CompactRecordTable
                                              rows={lesson.rows}
                                              onView={onView}
                                              viewLabel={viewLabel}
                                              viewTip={viewTip}
                                              dense
                                              hideLessonColumn
                                              showAttemptColumn
                                            />
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
                  </section>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "records" ? (
          <CompactRecordTable
            rows={filteredRows}
            onView={onView}
            viewLabel={viewLabel}
            viewTip={viewTip}
          />
        ) : null}

        {role === "admin" && tab === "actions" ? (
          <div className="grid gap-5">
            {ModuleGroups.length ? (
              ModuleGroups.map((ModuleGroup) => {
                const IsModuleOpen = Boolean(OpenModuleGroups[ModuleGroup.ModuleKey]);
                const ModuleRows = ModuleGroup.Rows;
                return (
                  <section
                    key={`manage-${ModuleGroup.ModuleKey}`}
                    className="math-hierarchy-panel p-5"
                  >
                    <button
                      type="button"
                      className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                      onClick={() => ToggleModuleGroup(ModuleGroup.ModuleKey)}
                      aria-expanded={IsModuleOpen}
                      title={IsModuleOpen ? "Collapse module actions" : "Expand module actions"}
                    >
                      <div>
                        <p className="math-kicker">Module</p>
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">
                          {moduleTitle(ModuleGroup.Sample)}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="blue">{ModuleGroup.Levels.length} Level(s)</Chip>
                        <Chip tone="blue">{uniqueAssignedConceptCount(ModuleRows)} DPS</Chip>
                        <Chip tone="green">
                          {uniqueClearedConceptCount(ModuleRows)} Cleared
                        </Chip>
                        <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                          <ChevronDown className={IsModuleOpen ? "rotate-180 transition" : "transition"} size={18} />
                        </span>
                      </div>
                    </button>
                    {IsModuleOpen ? (
                      <div className="mt-4 grid gap-4">
                        {ModuleGroup.Levels.map((LevelGroup) => {
                          const IsLevelOpen = Boolean(OpenLevelGroups[`manage-${LevelGroup.GroupKey}`]);
                          const LevelRows = LevelGroup.Rows;
                          return (
                            <div
                              key={`manage-${LevelGroup.GroupKey}`}
                              className="math-hierarchy-panel-soft p-4"
                            >
                              <button
                                type="button"
                                className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                                onClick={() => ToggleLevelGroup(`manage-${LevelGroup.GroupKey}`)}
                                aria-expanded={IsLevelOpen}
                                title={IsLevelOpen ? "Collapse level actions" : "Expand level actions"}
                              >
                                <div>
                                  <p className="math-kicker">Level</p>
                                  <h4 className="text-lg font-black text-slate-950 dark:text-white">
                                    {levelLabel(LevelGroup.Sample)}
                                  </h4>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip tone="blue">{LevelGroup.Lessons.length} Lesson(s)</Chip>
                                  <Chip tone="blue">{uniqueAssignedConceptCount(LevelRows)} DPS</Chip>
                                  <Chip tone="green">
                                    {uniqueClearedConceptCount(LevelRows)} Cleared
                                  </Chip>
                                  <span className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                                    <ChevronDown className={IsLevelOpen ? "rotate-180 transition" : "transition"} size={18} />
                                  </span>
                                </div>
                              </button>
                              {IsLevelOpen ? (
                                <div className="mt-4 grid gap-4">
                                  {LevelGroup.Lessons.map((lesson) => {
                                    const LessonKey = `manage-${lesson.key}`;
                                    const IsOpen = Boolean(OpenLessonGroups[LessonKey]);
                                    return (
                                      <div
                                        key={LessonKey}
                                        className="math-hierarchy-panel-soft p-4"
                                      >
                                        <button
                                          type="button"
                                          className="math-hierarchy-row flex-col gap-3 px-0 py-0 lg:flex-row lg:items-center lg:justify-between"
                                          onClick={() => ToggleLessonGroup(LessonKey)}
                                          aria-expanded={IsOpen}
                                          title={IsOpen ? "Collapse lesson records" : "Expand lesson records"}
                                        >
                                          <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">
                                              Lesson
                                            </p>
                                            <h4 className="mt-1 text-lg font-black">
                                              {CompactLessonLabel(lesson.sample)}
                                            </h4>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Chip tone="blue">{uniqueAssignedConceptCount(lesson.rows)} DPS</Chip>
                                            <Chip tone="green">
                                              {uniqueClearedConceptCount(lesson.rows)} Cleared
                                            </Chip>
                                            <Chip tone={averageAccuracy(lesson.rows) >= 70 ? "green" : "red"}>
                                              {averageAccuracy(lesson.rows)}% Avg
                                            </Chip>
                                            <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                                              <ChevronDown className={IsOpen ? "rotate-180 transition" : "transition"} size={18} />
                                            </span>
                                          </div>
                                        </button>
                                        {IsOpen ? (
                                          <div className="mt-4 grid gap-3">
                                            {SortRowsByCurriculum(lesson.rows).map((row, index) => {
                                              const id = String(
                                                row.assignmentId ||
                                                  row.id ||
                                                  row.attemptId ||
                                                  row.assessmentAssignmentId ||
                                                  index,
                                              );
                                              const archived = row.isActive === false;
                                              const Issue = issueLabel(row);
                                              return (
                                                <div
                                                  key={id}
                                                  className="group flex flex-col gap-4 rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/90 lg:flex-row lg:items-center lg:justify-between"
                                                >
                                                  <div className="flex min-w-0 items-start gap-3">
                                                    <div className="mt-1 rounded-2xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                                                      <ClipboardList size={18} />
                                                    </div>
                                                    <div className="min-w-0">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="font-black text-slate-950 dark:text-white">
                                                          {CompactPracticeTitle(row)}
                                                        </h4>
                                                        <Chip tone={Issue.tone}>{Issue.label}</Chip>
                                                      </div>
                                                      <p className="mt-1 text-sm font-semibold text-slate-500">
                                                        {CompactModuleLevelLabel(row)}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                    {onView ? (
                                                      <StandardViewButton
                                                        label={viewLabel}
                                                        tooltip={viewTip}
                                                        onClick={() => onView(row)}
                                                      />
                                                    ) : null}
                                                    {onArchive && !archived ? (
                                                      <button
                                                        className="math-role-action-button h-11 px-4 text-sm"
                                                        onClick={() => onArchive(row)}
                                                        title="Archive assigned practice"
                                                        aria-label="Archive assigned practice"
                                                      >
                                                        <Archive size={16} className="shrink-0" />
                                                        <span>Archive</span>
                                                      </button>
                                                    ) : null}
                                                    {onRestore && archived ? (
                                                      <button
                                                        className="math-role-action-button h-11 px-4 text-sm"
                                                        onClick={() => onRestore(row)}
                                                        title="Restore assigned practice"
                                                        aria-label="Restore assigned practice"
                                                      >
                                                        <RotateCcw size={16} className="shrink-0" />
                                                        <span>Restore</span>
                                                      </button>
                                                    ) : null}
                                                    {onDelete ? (
                                                      <button
                                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 hover:shadow-md dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-900/45"
                                                        onClick={() => onDelete(row)}
                                                        title="Delete assigned practice"
                                                        aria-label="Delete assigned practice"
                                                      >
                                                        <Trash2 size={16} className="shrink-0" />
                                                        <span>Delete</span>
                                                      </button>
                                                    ) : null}
                                                  </div>
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
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                No manageable practice records found for this scope.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceOverview({
  role,
  rows,
  allRows,
  progressSummary,
  onView,
  viewLabel,
  viewTip,
}: {
  role: "admin" | "teacher" | "student";
  rows: AnyRow[];
  allRows: AnyRow[];
  progressSummary: ReturnType<typeof levelProgressSummary> | null;
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  if (role === "student") {
    return (
      <StudentProgressOverview
        rows={rows}
        allRows={allRows}
        progressSummary={progressSummary}
        onView={onView}
        viewLabel={viewLabel}
        viewTip={viewTip}
      />
    );
  }

  if (role === "admin") {
    return (
      <AdminAssignmentOverview
        rows={rows}
        onView={onView}
        viewLabel={viewLabel}
        viewTip={viewTip}
      />
    );
  }

  return (
    <TeacherPracticeOverview
      rows={rows}
      onView={onView}
      viewLabel={viewLabel}
      viewTip={viewTip}
    />
  );
}

function AdminAssignmentOverview({
  rows,
  onView,
  viewLabel,
  viewTip,
}: {
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const stats = studentStats(rows);
  const priorityRows = priorityWorkRows(rows);
  const archivedRows = currentWorkRows(rows).filter((row) => row.isActive === false).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="math-kicker">Assignment Control Summary</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          Administrative Snapshot
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Review assigned practice, completion date, and administrative actions.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <OverviewStat
            icon={<ClipboardList size={18} />}
            label="Assigned DPS"
            value={stats.total}
            tone="blue"
          />
          <OverviewStat
            icon={<CheckCircle2 size={18} />}
            label="Cleared DPS"
            value={stats.completed}
            tone="green"
          />
          <OverviewStat
            icon={<Clock3 size={18} />}
            label="Pending DPS"
            value={stats.pending}
            tone="amber"
          />
          <OverviewStat
            icon={<AlertTriangle size={18} />}
            label="Re-Attempt Needed"
            value={stats.below}
            tone="red"
          />
        </div>
        <div className="mt-5">
          <LevelSnapshot rows={rows} />
        </div>
      </section>

      <section className="grid gap-6">
        <PriorityQueueCard
          title="Admin Action Queue"
          description="Review pending, re-attempt, and archived practice."
          rows={priorityRows}
          emptyTitle="No Admin Support Needed"
          emptyDescription="Assigned practice is currently clear."
          onView={onView}
          viewLabel={viewLabel}
          viewTip={viewTip}
        />
        <RecentActivityCard
          rows={rows}
          onView={onView}
          viewLabel={viewLabel}
          viewTip={viewTip}
        />
      </section>
    </div>
  );
}

function TeacherPracticeOverview({
  rows,
  onView,
  viewLabel,
  viewTip,
}: {
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const currentRows = currentWorkRows(rows);
  const priorityRows = priorityWorkRows(rows);
  const pendingRows = currentRows.filter((row) => !isCompleted(row));
  const reattemptRows = currentRows.filter(needsReattempt);
  const completedRows = currentRows.filter(
    (row) => isCompleted(row) && !isBelowBenchmark(row),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="math-kicker">Practice Control</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          What Needs Attention Now?
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Review assigned practice, completion date, and support needs.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <OverviewStat
            icon={<Layers3 size={18} />}
            label="Assigned DPS"
            value={currentRows.length}
            tone="blue"
          />
          <OverviewStat
            icon={<CheckCircle2 size={18} />}
            label="Cleared DPS"
            value={completedRows.length}
            tone="green"
          />
          <OverviewStat
            icon={<Clock3 size={18} />}
            label="Pending DPS"
            value={pendingRows.length}
            tone={pendingRows.length ? "amber" : "green"}
          />
          <OverviewStat
            icon={<RotateCcw size={18} />}
            label="Re-Attempt Needed"
            value={reattemptRows.length}
            tone="red"
          />
        </div>
        <div className="mt-5">
          <LessonFocusSnapshot rows={rows} />
        </div>
      </section>

      <section className="grid gap-6">
        <PriorityQueueCard
          title="Priority Queue"
          description="Practice requiring follow-up appears here."
          rows={priorityRows}
          emptyTitle="No Follow-Up Needed"
          emptyDescription="Visible practice work is on track."
          onView={onView}
          viewLabel={viewLabel}
          viewTip={viewTip}
        />
        <RecentActivityCard
          rows={rows}
          onView={onView}
          viewLabel={viewLabel}
          viewTip={viewTip}
        />
      </section>
    </div>
  );
}

function StudentProgressOverview({
  rows,
  allRows,
  progressSummary,
  onView,
  viewLabel,
  viewTip,
}: {
  rows: AnyRow[];
  allRows: AnyRow[];
  progressSummary: ReturnType<typeof levelProgressSummary> | null;
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const SourceRows = rows.length ? rows : allRows;
  const Summary = progressSummary || levelProgressSummary(SourceRows);
  const Completed = Summary.currentCompleted;
  const Required =
    Summary.currentRequired ||
    requiredDpsForLevel(SourceRows, Summary.currentLevel);
  const Pending = Math.max(Required - Completed, 0);
  const CompletionPercent = Required
    ? Math.min(100, Math.round((Completed / Required) * 100))
    : 0;
  const RecentRows = recentWorkRows(SourceRows).slice(0, 3);
  const CurrentLevelRows = SourceRows.filter(
    (Row) => levelCodeOf(Row) === Summary.currentLevel,
  );
  const VisibleLevelRows = CurrentLevelRows.length
    ? CurrentLevelRows
    : SourceRows;
  const LessonInsights = buildLessonFocusItems(VisibleLevelRows);
  const [OpenLessons, SetOpenLessons] = useState<Record<string, boolean>>({});

  function ToggleLesson(LessonKey: string) {
    SetOpenLessons((Current) => ({
      ...Current,
      [LessonKey]: !Current[LessonKey],
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="math-kicker">Progress Dashboard</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          Current Level Journey
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Overview shows milestone progress. Lesson Insights keeps lesson-wise
          practice and attempt history.
        </p>
        <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50/75 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Current Level
              </p>
              <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                {Summary.currentLevel}
              </h3>
            </div>
            <Chip tone={toneForLevelStatus(Summary.currentStatus)}>
              Level Status: {Summary.currentStatus}
            </Chip>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="math-role-progress-track h-3 flex-1">
              <div
                className="math-role-progress-fill"
                style={{ width: `${CompletionPercent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-black text-slate-700 dark:text-slate-100">
              {CompletionPercent}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="blue">
              {Completed}/{Required} DPS Cleared
            </Chip>
            <Chip tone={Pending ? "amber" : "green"}>{Pending} Pending</Chip>
            <Chip tone={averageAccuracy(SourceRows) >= 70 ? "green" : "red"}>
              Average Accuracy: {averageAccuracy(SourceRows)}%
            </Chip>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50/75 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="math-kicker">Lesson Insights</p>
              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                Strength And Growth By Lesson
              </h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Expand a lesson to review strength and practice focus.
              </p>
            </div>
            <Chip tone="blue">{LessonInsights.length} Lessons</Chip>
          </div>

          <div className="mt-4 space-y-3">
            {LessonInsights.length ? (
              LessonInsights.map((LessonItem) => {
                const IsOpen = Boolean(OpenLessons[LessonItem.key]);
                const HasFocus = LessonItem.below > 0 || LessonItem.avg < 90;
                return (
                  <div
                    key={LessonItem.key}
                    className="rounded-[20px] border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => ToggleLesson(LessonItem.key)}
                      aria-expanded={IsOpen}
                      title="Open lesson insight"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-950 dark:text-white">
                          {LessonItem.title}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {LessonItem.total} Visible Work
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Chip
                          tone={
                            LessonItem.avg >= 90 && !LessonItem.below
                              ? "green"
                              : LessonItem.below
                                ? "red"
                                : "blue"
                          }
                        >
                          Average Accuracy: {LessonItem.avg}%
                        </Chip>
                        <ChevronDown
                          className={
                            IsOpen ? "rotate-180 transition" : "transition"
                          }
                          size={16}
                        />
                      </div>
                    </button>

                    {IsOpen ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <MiniInsight
                          title="Best Accuracy"
                          value={
                            LessonItem.avg >= 90 && !LessonItem.below
                              ? LessonItem.title
                              : "Building Confidence"
                          }
                          description={
                            LessonItem.avg >= 90 && !LessonItem.below
                              ? `${LessonItem.avg}% average accuracy`
                              : "Complete more accurate work to build this strength."
                          }
                          tone="green"
                        />
                        <MiniInsight
                          title="Practice Focus"
                          value={
                            HasFocus ? LessonItem.title : "Keep Practicing"
                          }
                          description={
                            HasFocus
                              ? `${LessonItem.avg}% average · Needs Re-Attempt: ${LessonItem.below}`
                              : "No improvement focus in visible work."
                          }
                          tone={LessonItem.below ? "red" : "blue"}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-[20px] border border-slate-100 bg-white p-4 text-sm font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                Lesson Insights will appear after more practice work is
                completed.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        <NextMilestoneCard
          completed={Completed}
          required={Required}
          pending={Pending}
          status={Summary.currentStatus}
        />
        <RecentActivityCard
          rows={RecentRows}
          onView={onView}
          viewLabel={viewLabel}
          viewTip={viewTip}
        />
      </section>
    </div>
  );
}

function OverviewStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return (
    <div className={`math-overview-stat math-overview-stat-${tone} rounded-[22px] border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 opacity-90">
        {icon}
        <p className="text-[0.72rem] font-black uppercase leading-5 tracking-[0.14em]">
          {label}
        </p>
      </div>
      <p className="mt-2 text-[1.55rem] font-black leading-none">{value}</p>
    </div>
  );
}

function MiniInsight({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: "green" | "blue" | "red";
}) {
  return (
    <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {title}
      </p>
      <h4 className="mt-2 truncate text-base font-black text-slate-950 dark:text-white">
        {value}
      </h4>
      <div className="mt-2">
        <Chip tone={tone}>{description}</Chip>
      </div>
    </div>
  );
}

function PriorityQueueCard({
  title,
  description,
  rows,
  emptyTitle,
  emptyDescription,
  onView,
  viewLabel,
  viewTip,
}: {
  title: string;
  description: string;
  rows: AnyRow[];
  emptyTitle: string;
  emptyDescription: string;
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const visibleRows = rows.slice(0, 5);
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
          <AlertTriangle size={20} />
        </div>
        <div>
          <p className="math-kicker">Priority Queue</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {visibleRows.length ? (
          visibleRows.map((row, index) => (
            <WorkSignalRow
              key={[row.assignmentId || "assignment", row.attemptId || "attempt", row.id || "row", row.attemptLabel || row.attempt || "entry", index].join("-")}
              row={row}
              onView={onView}
              viewLabel={viewLabel}
              viewTip={viewTip}
            />
          ))
        ) : (
          <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4 text-emerald-800">
            <h4 className="font-black">{emptyTitle}</h4>
            <p className="mt-1 text-sm font-bold opacity-80">
              {emptyDescription}
            </p>
          </div>
        )}
        {rows.length > visibleRows.length ? (
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            + {rows.length - visibleRows.length} More Items Available In The
            Detailed Tab.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WorkSignalRow({
  row,
  onView,
  viewLabel,
  viewTip,
}: {
  row: AnyRow;
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const issue = issueLabel(row);
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-slate-100 bg-slate-50/75 p-4 dark:border-slate-800 dark:bg-slate-900/70 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-black text-slate-950 dark:text-white">
            {CompactPracticeTitle(row)}
          </h4>
          <Chip tone={issue.tone}>{issue.label}</Chip>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {CompactModuleLevelLabel(row)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Chip
          tone={
            accuracy(row) >= 70 ? "green" : isCompleted(row) ? "red" : "amber"
          }
        >
          {isCompleted(row) ? `${accuracy(row)}%` : statusLabel(row)}
        </Chip>
        {onView ? (
          <StandardViewButton
            label={viewLabel}
            tooltip={viewTip}
            onClick={() => onView(row)}
            compact
          />
        ) : null}
      </div>
    </div>
  );
}

function RecentActivityCard({
  rows,
  onView,
  viewLabel,
  viewTip,
}: {
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
}) {
  const recentRows = recentWorkRows(rows).slice(0, 4);
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
          <CalendarClock size={20} />
        </div>
        <div>
          <p className="math-kicker">Recent Activity</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            Recent Practice
          </h3>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {recentRows.length ? (
          recentRows.map((row, index) => (
            <WorkSignalRow
              key={[row.assignmentId || "assignment", row.attemptId || "attempt", row.id || "row", row.attemptLabel || row.attempt || "entry", index].join("-")}
              row={row}
              onView={onView}
              viewLabel={viewLabel}
              viewTip={viewTip}
            />
          ))
        ) : (
          <p className="rounded-[22px] bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">
            No Recent Practice Found.
          </p>
        )}
      </div>
    </div>
  );
}

function LevelSnapshot({ rows }: { rows: AnyRow[] }) {
  const levels = levelProgressSummary(rows).levels;
  return (
    <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2">
        <Layers3 size={18} className="text-blue-600" />
        <h3 className="font-black text-slate-950 dark:text-white">
          Level Coverage
        </h3>
      </div>
      <div className="mt-4 grid gap-3">
        {levels.slice(0, 4).map((level) => {
          const percent = level.required
            ? Math.min(
                100,
                Math.round((level.completed / level.required) * 100),
              )
            : 0;
          return (
            <div key={level.levelCode}>
              <div className="flex items-center justify-between gap-3 text-sm font-black">
                <span>{level.levelCode}</span>
                <span>
                  {level.completed}/{level.required}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="math-role-progress-track h-2 flex-1">
                  <div
                    className="math-role-progress-fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-black text-slate-700 dark:text-slate-100">{percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LessonFocusSnapshot({ rows }: { rows: AnyRow[] }) {
  const lessons = buildLessonFocusItems(rows);
  const attention = lessons.filter(
    (item) => item.below || item.avg < 70,
  ).length;
  const strong = lessons.filter((item) => item.avg >= 90 && !item.below).length;
  return (
    <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2">
        <BookOpen size={18} className="text-cyan-600" />
        <h3 className="font-black text-slate-950 dark:text-white">
          Lesson Focus
        </h3>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <OverviewStat
          icon={<AlertTriangle size={16} />}
          label="Lessons Need Follow-Up"
          value={attention}
          tone={attention ? "amber" : "green"}
        />
        <OverviewStat
          icon={<TrendingUp size={16} />}
          label="Strong Lessons"
          value={strong}
          tone="green"
        />
      </div>
    </div>
  );
}

function NextMilestoneCard({
  completed,
  required,
  pending,
  status,
}: {
  completed: number;
  required: number;
  pending: number;
  status: string;
}) {
  const ready = pending === 0 && required > 0;
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
          <ClipboardCheck size={20} />
        </div>
        <div>
          <p className="math-kicker">Next Milestone</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            {ready
              ? "Ready For Assessment Review"
              : `${pending} DPS Left In This Level`}
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {ready
              ? "All required DPS are cleared for this level. Readiness rules can now decide assessment eligibility."
              : `Complete ${pending} more DPS to move from ${completed}/${required} toward level readiness.`}
          </p>
          <div className="mt-3">
            <Chip tone={toneForLevelStatus(status)}>
              Level Status: {status}
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

function priorityWorkRows(rows: AnyRow[]) {
  return currentWorkRows(rows)
    .filter(
      (row) =>
        !isCompleted(row) ||
        isBelowBenchmark(row) ||
        row.isActive === false,
    )
    .sort(
      (a, b) =>
        priorityWeight(b) - priorityWeight(a) || CompareRowsByCurriculum(a, b),
    );
}

function priorityWeight(row: AnyRow) {
  let score = 0;
  if (isBelowBenchmark(row)) score += 4;
  if (needsReattempt(row)) score += 3;
  if (!isCompleted(row)) score += 2;
  if (row.isActive === false) score += 1;
  return score;
}

function isExplicitReattemptRow(row: AnyRow) {
  return Boolean(
    row.isReattempt ??
      row.isReAttempt ??
      row.reattemptOfAttemptId ??
      row.parentAttemptId,
  ) || attemptNumber(row) > 1;
}

function reattemptStatusLabel(row: AnyRow): {
  label: string;
  tone: "slate" | "green" | "red" | "amber" | "blue" | "cyan";
} | null {
  if (!isExplicitReattemptRow(row)) return null;
  if (!isCompleted(row)) return { label: "Re-Attempt Pending", tone: "amber" };
  if (isBelowBenchmark(row) || accuracy(row) < 70) return { label: "Needs Re-Attempt", tone: "red" };
  return { label: "Re-Attempt Cleared", tone: "green" };
}

function issueLabel(row: AnyRow): {
  label: string;
  tone: "slate" | "green" | "red" | "amber" | "blue" | "cyan";
} {
  if (row.isActive === false) return { label: "Archived", tone: "slate" };
  const ReattemptStatus = reattemptStatusLabel(row);
  if (ReattemptStatus) return ReattemptStatus;
  if (isBelowBenchmark(row)) return { label: "Needs Re-Attempt", tone: "red" };
  if (needsReattempt(row)) return { label: "Needs Re-Attempt", tone: "amber" };
  if (!isCompleted(row)) return { label: "Pending", tone: "amber" };
  return { label: "Cleared", tone: "green" };
}

function rowTime(row: AnyRow) {
  const value = getFirstMathPathTimestamp(row, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return value ? mathPathTimestampValue(value) : 0;
}

function recentWorkRows(rows: AnyRow[]) {
  return currentWorkRows(rows).sort((a, b) => rowTime(b) - rowTime(a));
}

function buildLessonFocusItems(rows: AnyRow[]) {
  const CurrentRows = currentWorkRows(rows);
  const map = new Map<string, AnyRow[]>();
  CurrentRows.forEach((row) => {
    const key = `${row.moduleCode || "Module"}|${row.levelCode || "Level"}|${row.lessonNumber || "-"}|${row.lessonTitle || "Lesson"}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return Array.from(map.entries())
    .map(([key, lessonRows]) => {
      const SortedRows = SortRowsByCurriculum(lessonRows);
      const sample = SortedRows[0];
      return {
        key,
        title: CompactLessonLabel(sample),
        avg: averageAccuracy(SortedRows),
        below: uniqueNeedsReattemptCount(SortedRows),
        total: SortedRows.length,
        sample,
      };
    })
    .sort((FirstLesson, SecondLesson) =>
      CompareRowsByCurriculum(FirstLesson.sample, SecondLesson.sample),
    );
}


function ExpandAttemptHistoryRows(Rows: AnyRow[]) {
  return Rows.flatMap((Row) => {
    const History = Array.isArray(Row.attemptHistory) ? Row.attemptHistory : [];
    if (!History.length) return [Row];
    return History.map((AttemptRow: AnyRow, Index: number) => {
      const MergedRow: AnyRow = {
        ...Row,
        ...AttemptRow,
        attemptGroupId: AttemptRow.attemptGroupId ?? Row.attemptGroupId ?? Row.attempt_group_id,
        attemptNumber: AttemptRow.attemptNumber ?? Index + 1,
        attemptSequence: AttemptRow.attemptSequence ?? Index + 1,
        isReattempt: Boolean(AttemptRow.isReattempt ?? Index > 0),
        parentAssignmentId: Row.assignmentId ?? Row.id,
      };
      const Status = String(MergedRow.status ?? MergedRow.attemptStatus ?? "").toUpperCase();
      const IsPendingRetry = Status.includes("PENDING") || Status.includes("IN_PROGRESS") || !AttemptRow.completedAt && !AttemptRow.submittedAt && !AttemptRow.latestCompletedAt && AttemptRow.score == null && AttemptRow.accuracy == null && AttemptRow.accuracyPercentage == null;
      if (IsPendingRetry) {
        return {
          ...MergedRow,
          status: MergedRow.status || "PENDING",
          score: AttemptRow.score ?? null,
          totalMarks: AttemptRow.totalMarks ?? AttemptRow.maxScore ?? null,
          accuracy: AttemptRow.accuracy ?? null,
          accuracyPercentage: AttemptRow.accuracyPercentage ?? null,
          completedAt: AttemptRow.completedAt ?? null,
          submittedAt: AttemptRow.submittedAt ?? null,
          latestCompletedAt: AttemptRow.latestCompletedAt ?? null,
          benchmarkStatus: AttemptRow.benchmarkStatus ?? "PENDING",
        };
      }
      return MergedRow;
    });
  });
}

function attemptNumber(row: AnyRow) {
  const RetryAttemptNumber = Number(row.retryAttemptNumber ?? row.reattemptNumber ?? row.retryNumber ?? 0);
  if (Number.isFinite(RetryAttemptNumber) && RetryAttemptNumber > 0) return RetryAttemptNumber + 1;
  const Value =
    row.reAttemptNumber ??
    row.attemptNumber ??
    row.attemptSequence ??
    row.attemptNo;
  const NumericValue = Number(Value);
  return Number.isNaN(NumericValue) ? 1 : Math.max(1, NumericValue);
}

function attemptLabel(row: AnyRow) {
  const ExplicitLabel = String(row.attemptLabel ?? row.attempt ?? "").trim();
  if (ExplicitLabel) return ExplicitLabel;
  const RetryAttemptNumber = Number(row.retryAttemptNumber ?? row.reattemptNumber ?? row.retryNumber ?? 0);
  if (Number.isFinite(RetryAttemptNumber) && RetryAttemptNumber > 0) return `Re-Attempt ${RetryAttemptNumber}`;
  const StatusText = String(
    row.status ?? row.attemptStatus ?? "",
  ).toUpperCase();
  const IsReattempt =
    Boolean(
      row.isReattempt ??
      row.isReAttempt ??
      row.reattemptOfAttemptId ??
      row.parentAttemptId,
    ) ||
    StatusText.includes("REATTEMPT") ||
    StatusText.includes("RE-ATTEMPT") ||
    attemptNumber(row) > 1;
  if (!IsReattempt) return "Original";
  return `Re-Attempt ${Math.max(1, attemptNumber(row) - 1)}`;
}

function attemptTone(
  row: AnyRow,
): "slate" | "green" | "red" | "amber" | "blue" | "cyan" {
  void row;
  return "blue";
}

export function CompactRecordTable({
  rows,
  onView,
  viewLabel,
  viewTip,
  dense = false,
  hideLessonColumn = false,
  showAttemptColumn = false,
}: {
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
  dense?: boolean;
  hideLessonColumn?: boolean;
  showAttemptColumn?: boolean;
}) {
  const SourceRows = showAttemptColumn ? ExpandAttemptHistoryRows(rows) : rows;
  const DisplayRows = SortRowsByCurriculum(SourceRows);
  const GridColumns = hideLessonColumn
    ? showAttemptColumn
      ? "grid-cols-[minmax(165px,1fr)_minmax(112px,.58fr)_minmax(130px,.64fr)_minmax(92px,.46fr)_minmax(104px,.52fr)_minmax(154px,.72fr)_minmax(124px,.58fr)]"
      : "grid-cols-[minmax(165px,1fr)_minmax(130px,.64fr)_minmax(92px,.46fr)_minmax(104px,.52fr)_minmax(154px,.72fr)_minmax(124px,.58fr)]"
    : showAttemptColumn
      ? "grid-cols-[minmax(145px,.82fr)_minmax(165px,1fr)_minmax(112px,.58fr)_minmax(130px,.64fr)_minmax(92px,.46fr)_minmax(104px,.52fr)_minmax(154px,.72fr)_minmax(124px,.58fr)]"
      : "grid-cols-[minmax(145px,.82fr)_minmax(165px,1fr)_minmax(130px,.64fr)_minmax(92px,.46fr)_minmax(104px,.52fr)_minmax(154px,.72fr)_minmax(124px,.58fr)]";

  return (
    <div className="math-admin-practice-lesson-insights-table overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div
        className={`math-admin-practice-lesson-insights-table-header grid ${GridColumns} gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900`}
      >
        {hideLessonColumn ? null : <div>Lesson</div>}
        <div>DPS</div>
        {showAttemptColumn ? <div>Attempt</div> : null}
        <div>Status</div>
        <div>Score</div>
        <div>Accuracy</div>
        <div>Completion Date</div>
        <div>Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {DisplayRows.map((row, index) => {
          const Issue = issueLabel(row);
          return (
            <div
              key={[row.assignmentId || "assignment", row.attemptId || "attempt", row.id || "row", row.attemptLabel || row.attempt || "entry", index].join("-")}
              className={`grid ${GridColumns} items-center gap-3 px-4 ${dense ? "py-3" : "py-4"}`}
            >
              {hideLessonColumn ? null : (
                <div className="min-w-0">
                  <p className="text-sm font-black">
                    {CompactLessonLabel(row)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {CompactModuleLevelLabel(row)}
                  </p>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-black">{CompactDpsLabel(row)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {hideLessonColumn
                    ? CompactModuleLevelLabel(row)
                    : levelCodeOf(row)}
                </p>
              </div>
              {showAttemptColumn ? (
                <div>
                  <Chip tone={attemptTone(row)}>{attemptLabel(row)}</Chip>
                </div>
              ) : null}
              <div>
                <Chip tone={Issue.tone}>{Issue.label}</Chip>
              </div>
              <div>
                <Chip tone={scoreText(row) === "—" ? "slate" : "blue"}>
                  {scoreText(row)}
                </Chip>
              </div>
              <div>
                {isCompleted(row) ? (
                  <Chip tone={accuracy(row) >= 70 ? "green" : "red"}>
                    {accuracy(row)}%
                  </Chip>
                ) : (
                  <Chip tone="slate">—</Chip>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-600">
                {completedText(row)}
              </div>
              <div className="flex justify-start">
                {onView ? (
                  <StandardViewButton
                    label={viewLabel}
                    tooltip={viewTip}
                    onClick={() => onView(row)}
                    compact
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
