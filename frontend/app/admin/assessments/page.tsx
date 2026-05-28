"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  approveAdminAssessmentReattempt,
  deleteAssessmentAssignment,
  getAdminAssessmentReattemptApprovals,
  getAdminAssessments,
  getAdminStudentLevelPromotions,
  downloadAdminParentProgressReport,
  getAdminParentReportDeliveryLogs,
  deleteAdminParentReportDelivery,
  resendAdminParentReportDelivery,
  sendAdminParentProgressReport,
  promoteAssessmentAssignment,
  rejectAdminAssessmentReattempt,
  updateAssessmentAssignmentStatus,
  type AdminAssessmentReattemptApproval,
  type AdminStudentLevelPromotion,
  type ParentReportDeliveryLog,
  type ParentReportRecipientMode,
  type ParentReportResendRecipientMode,
} from "@/lib/api/admin";
import { formatMathPathDateTime } from "@/lib/date";
import { CompareStudentCodes } from "@/lib/studentSort";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AnyRow,
  Chip,
  buildStudents,
  latestActivity,
  Metric,
  searchText,
  StandardViewButton,
  StudentNode,
} from "@/components/common/DetailWorkspaceViews";

const AdminDarkMetricCardClass = "dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]";

type StatusFilter = "" | "ALL" | "ACTIVE" | "INACTIVE";
type ApprovalStatusFilter = "" | "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type ActiveTab =
  | "RECORDS"
  | "APPROVALS"
  | "MANAGE"
  | "PROMOTION_HISTORY"
  | "PARENT_REPORTS";
type ParentReportTab = "GENERATE" | "DELIVERY_HISTORY";
type ManageStatusFilter =
  | ""
  | "ALL"
  | "CLEARED"
  | "REATTEMPT_CLEARED"
  | "NEEDS_REATTEMPT"
  | "PENDING"
  | "REATTEMPT_PENDING";
type DecisionMode = "APPROVE" | "REJECT";
type PromotionMutationPayload = {
  Item: AnyRow;
  TargetLevelId?: string | null;
  TargetLevelCode?: string | null;
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

type ParentReportGenerateTarget = {
  Student?: string;
  Module?: string;
  Level?: string;
  Highlight?: string;
  HasTarget: boolean;
};

function deepLinkParam(
  Params: { get(Name: string): string | null },
  Names: string[],
) {
  for (const Name of Names) {
    const Value = Params.get(Name);
    if (Value && Value.trim()) return Value.trim();
  }
  return "";
}

function buildAssessmentDeepLinkTarget(Params: {
  get(Name: string): string | null;
}): AssessmentDeepLinkTarget {
  const Target = {
    Student: deepLinkParam(Params, ["studentCode", "student", "studentId"]),
    Module: deepLinkParam(Params, ["moduleCode", "module", "moduleId"]),
    Level: deepLinkParam(Params, ["levelCode", "level", "levelId"]),
    AssignmentId: deepLinkParam(Params, ["assignmentId"]),
    AssessmentId: deepLinkParam(Params, ["assessmentId"]),
    AttemptId: deepLinkParam(Params, ["attemptId"]),
    Highlight: deepLinkParam(Params, ["highlight", "recordId"]),
  };
  return { ...Target, HasTarget: Object.values(Target).some(Boolean) };
}

function buildParentReportGenerateTarget(Params: {
  get(Name: string): string | null;
}): ParentReportGenerateTarget {
  const Target = {
    Student: deepLinkParam(Params, ["studentCode", "student", "studentId"]),
    Module: deepLinkParam(Params, ["moduleCode", "module", "moduleId"]),
    Level: deepLinkParam(Params, ["levelCode", "level", "levelId"]),
    Highlight: deepLinkParam(Params, ["highlight", "highlightId", "recordId"]),
  };
  return { ...Target, HasTarget: Object.values(Target).some(Boolean) };
}

function parentReportRowMatchesTarget(
  Item: AnyRow,
  Target?: ParentReportGenerateTarget,
) {
  if (!Target?.HasTarget) return false;
  const StudentTarget = normalizeDeepLinkText(Target.Student);
  const ModuleTarget = normalizeDeepLinkText(Target.Module);
  const LevelTarget = normalizeDeepLinkText(Target.Level);
  const HighlightTarget = normalizeDeepLinkText(Target.Highlight);
  const RowStudentCode = assessmentRecordStudentCode(Item);
  const RowModuleCode = rowModuleCode(Item);
  const RowLevelCode = rowLevelCode(Item);
  const RowHighlight = `parent-report-${RowStudentCode}-${RowLevelCode}`;

  const StudentMatches =
    !StudentTarget ||
    [
      RowStudentCode,
      parentReportStudentId(Item),
      assessmentRecordStudentName(Item),
    ].some((Value) => normalizeDeepLinkText(Value) === StudentTarget);
  const ModuleMatches =
    !ModuleTarget || normalizeDeepLinkText(RowModuleCode) === ModuleTarget;
  const LevelMatches =
    !LevelTarget || normalizeDeepLinkText(RowLevelCode) === LevelTarget;
  const HighlightMatches =
    !HighlightTarget || normalizeDeepLinkText(RowHighlight) === HighlightTarget;

  return StudentMatches && ModuleMatches && LevelMatches && HighlightMatches;
}

function normalizeDeepLinkText(Value: unknown) {
  return String(Value || "")
    .trim()
    .toLowerCase();
}

function assessmentRowMatchesDeepLink(
  Row: AnyRow,
  Target?: AssessmentDeepLinkTarget,
) {
  if (!Target?.HasTarget) return false;
  const StudentTarget = normalizeDeepLinkText(Target.Student);
  const ModuleTarget = normalizeDeepLinkText(Target.Module);
  const LevelTarget = normalizeDeepLinkText(Target.Level);
  const AssignmentTarget = normalizeDeepLinkText(
    Target.AssignmentId || Target.AssessmentId,
  );
  const AttemptTarget = normalizeDeepLinkText(
    Target.AttemptId || Target.Highlight,
  );

  const StudentMatches =
    !StudentTarget ||
    [
      Row.studentCode,
      Row.targetStudentCode,
      Row.studentId,
      Row.targetStudentId,
      Row.studentName,
      Row.targetStudentName,
    ].some((Value) => normalizeDeepLinkText(Value) === StudentTarget);
  const ModuleMatches =
    !ModuleTarget ||
    [Row.moduleCode, Row.moduleId, rowModuleCode(Row)].some(
      (Value) => normalizeDeepLinkText(Value) === ModuleTarget,
    );
  const LevelMatches =
    !LevelTarget ||
    [Row.levelCode, Row.levelId, rowLevelCode(Row)].some(
      (Value) => normalizeDeepLinkText(Value) === LevelTarget,
    );
  const AssignmentMatches =
    !AssignmentTarget ||
    [
      Row.assignmentId,
      Row.assessmentAssignmentId,
      Row.assessmentId,
      Row.id,
    ].some((Value) => normalizeDeepLinkText(Value) === AssignmentTarget);
  const AttemptMatches =
    !AttemptTarget ||
    [
      assessmentAttemptId(Row),
      Row.attemptId,
      Row.assessmentAttemptId,
      Row.latestAttemptId,
      Row.resultAttemptId,
      Row.assignmentId,
      Row.assessmentAssignmentId,
    ].some((Value) => normalizeDeepLinkText(Value) === AttemptTarget);

  return (
    StudentMatches &&
    ModuleMatches &&
    LevelMatches &&
    AssignmentMatches &&
    AttemptMatches
  );
}

function rowModuleCode(row: AnyRow) {
  return String(row.moduleCode || row.moduleId || "Module");
}

function rowModuleLabel(row: AnyRow) {
  const ModuleCode = rowModuleCode(row);
  const ModuleName = String(
    row.moduleName || row.moduleTitle || row.module || "",
  );
  return ModuleName && ModuleName !== ModuleCode
    ? `${ModuleCode} · ${ModuleName}`
    : ModuleCode;
}

function rowLevelCode(row: AnyRow) {
  return String(row.levelCode || row.levelId || "Level");
}

function rowTeacherKey(row: AnyRow) {
  return String(
    row.targetTeacherCode ||
      row.assignedTeacherCode ||
      row.teacherCode ||
      row.targetTeacherId ||
      row.assignedTeacherId ||
      row.teacherId ||
      row.targetTeacherName ||
      row.assignedTeacherName ||
      row.teacherName ||
      row.teacher ||
      "Unassigned",
  );
}

function rowTeacherLabel(row: AnyRow) {
  const TeacherName = String(
    row.targetTeacherName ||
      row.assignedTeacherName ||
      row.teacherName ||
      row.teacher ||
      "Unassigned",
  );
  const TeacherCode = String(
    row.targetTeacherCode ||
      row.assignedTeacherCode ||
      row.teacherCode ||
      row.teacherId ||
      "",
  );
  return TeacherCode && TeacherName !== TeacherCode
    ? `${TeacherName} (${TeacherCode})`
    : TeacherName;
}

function uniqueModuleOptions(rows: AnyRow[]) {
  const ModuleMap = new Map<string, string>();
  rows.forEach((Row) => {
    const Key = rowModuleCode(Row);
    if (!ModuleMap.has(Key)) ModuleMap.set(Key, rowModuleLabel(Row));
  });
  return Array.from(ModuleMap.entries()).sort((First, Second) =>
    First[1].localeCompare(Second[1], undefined, { numeric: true }),
  );
}

function uniqueLevelOptions(rows: AnyRow[]) {
  return Array.from(new Set(rows.map(rowLevelCode).filter(Boolean))).sort(
    (First, Second) =>
      First.localeCompare(Second, undefined, { numeric: true }),
  );
}

function uniqueTeacherOptions(rows: AnyRow[]) {
  const TeacherMap = new Map<string, string>();
  rows.forEach((Row) => {
    const Key = rowTeacherKey(Row);
    if (!TeacherMap.has(Key)) TeacherMap.set(Key, rowTeacherLabel(Row));
  });
  return Array.from(TeacherMap.entries()).sort((First, Second) =>
    First[1].localeCompare(Second[1]),
  );
}

function matchesStatus(row: AnyRow, filter: StatusFilter) {
  if (!filter || filter === "ALL") return true;
  if (filter === "ACTIVE") return row.isActive !== false;
  return row.isActive === false;
}

function assessmentCurrentStatus(Row: AnyRow) {
  const Status = String(
    Row.status || Row.resultStatus || Row.benchmarkStatus || "",
  ).toUpperCase();
  const Accuracy = Number(Row.accuracy ?? Row.accuracyPercentage);
  const Score = Number(Row.score ?? Row.totalScore);
  const MaxScore = Number(Row.maxScore ?? Row.totalMarks ?? Row.maximumScore);
  const HasPercent = Number.isFinite(Accuracy);
  const ScorePercent =
    Number.isFinite(Score) && Number.isFinite(MaxScore) && MaxScore > 0
      ? (Score / MaxScore) * 100
      : Number.NaN;
  const Percent = HasPercent ? Accuracy : ScorePercent;

  if (
    ["PENDING", "ASSIGNED", "NOT_STARTED", "IN_PROGRESS"].includes(Status) ||
    Status.includes("PENDING") ||
    Status.includes("AWAITING") ||
    !Status
  )
    return "PENDING";
  if (
    Status.includes("CLEARED") ||
    Status.includes("BENCHMARK_MET") ||
    Status.includes("PASSED")
  )
    return "CLEARED";
  if (
    Status.includes("REATTEMPT") ||
    Status.includes("RE_ATTEMPT") ||
    Status.includes("BELOW") ||
    Status.includes("FAILED") ||
    Status.includes("NEEDS")
  )
    return "NEEDS_REATTEMPT";
  if (Number.isFinite(Percent))
    return Percent >= 70 ? "CLEARED" : "NEEDS_REATTEMPT";
  if (["SUBMITTED", "COMPLETED", "AUTO_SUBMITTED"].includes(Status))
    return "CLEARED";
  return "PENDING";
}

function assessmentAccuracy(Row: AnyRow) {
  const Accuracy = Number(
    Row.accuracy ?? Row.accuracyPercentage ?? Row.percentage,
  );
  if (Number.isFinite(Accuracy))
    return Math.min(100, Math.max(0, Math.round(Accuracy)));
  const Score = Number(Row.score ?? Row.totalScore);
  const MaxScore = Number(
    Row.maxScore ?? Row.totalMarks ?? Row.maximumScore ?? 100,
  );
  if (Number.isFinite(Score) && Number.isFinite(MaxScore) && MaxScore > 0) {
    return Math.min(100, Math.max(0, Math.round((Score / MaxScore) * 100)));
  }
  return null;
}

function assessmentTimestampMs(Row: AnyRow) {
  const Timestamp =
    Row.completedAt ||
    Row.completedDate ||
    Row.completionDate ||
    Row.submittedAt ||
    Row.submittedDate ||
    Row.latestCompletedAt ||
    Row.latestSubmittedAt ||
    Row.attemptDate ||
    Row.assignedAt ||
    Row.createdAt ||
    Row.updatedAt;
  const Time = Timestamp ? new Date(String(Timestamp)).getTime() : Number.NaN;
  return Number.isFinite(Time) ? Time : 0;
}

function currentAssessmentAccuracy(Rows: AnyRow[]) {
  const AttemptedRows = Rows.filter(
    (Row) =>
      assessmentCurrentStatus(Row) !== "PENDING" &&
      assessmentAccuracy(Row) !== null,
  );
  if (!AttemptedRows.length) return null;
  const LatestRow = [...AttemptedRows].sort(
    (First, Second) =>
      assessmentTimestampMs(Second) - assessmentTimestampMs(First),
  )[0];
  return assessmentAccuracy(LatestRow);
}

function cleanPercent(Value: number | null) {
  if (Value === null || !Number.isFinite(Value)) return "—";
  return `${Math.round(Value)}%`;
}

function studentAssessmentStats(Rows: AnyRow[]) {
  const AssignedAssessments = Rows.length;
  const Cleared = Rows.filter(
    (Row) => assessmentCurrentStatus(Row) === "CLEARED",
  ).length;
  const Pending = Rows.filter(
    (Row) => assessmentCurrentStatus(Row) === "PENDING",
  ).length;
  const ReAttempt = Rows.filter(
    (Row) => assessmentCurrentStatus(Row) === "NEEDS_REATTEMPT",
  ).length;
  return {
    AssignedAssessments,
    Cleared,
    Pending,
    ReAttempt,
    Accuracy: currentAssessmentAccuracy(Rows),
    LastActivity: latestActivity(Rows),
  };
}

function assessmentTitle(Row: AnyRow) {
  return String(
    Row.assessmentTitle ||
      Row.assignmentTitle ||
      Row.title ||
      Row.blueprintTitle ||
      "Assessment",
  );
}

function assessmentAttemptLabel(Row: AnyRow) {
  const ExplicitLabel = String(
    Row.attemptLabel || Row.assessmentAttemptLabel || "",
  ).trim();
  if (ExplicitLabel) return ExplicitLabel;
  const AssignmentType = String(
    Row.assessmentAssignmentType || Row.assignmentType || Row.attemptType || "",
  ).toUpperCase();
  const AttemptType = String(
    Row.attemptType || Row.resultAttemptType || "",
  ).toUpperCase();
  const AttemptNumber = Number(
    Row.attemptNumber || Row.reattemptNumber || Row.nextAttemptNumber || 1,
  );
  if (AssignmentType.includes("RE") || AttemptType.includes("RE"))
    return `Re-Attempt ${Number.isFinite(AttemptNumber) && AttemptNumber > 0 ? AttemptNumber : 1}`;
  return "Original";
}

function assessmentStatusLabel(Row: AnyRow) {
  const Status = assessmentCurrentStatus(Row);
  if (Status === "CLEARED") {
    return assessmentAttemptLabel(Row).startsWith("Re-Attempt")
      ? "Re-Attempt Cleared"
      : "Cleared";
  }
  if (Status === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  const AttemptLabel = assessmentAttemptLabel(Row);
  return AttemptLabel.startsWith("Re-Attempt")
    ? "Re-Attempt Pending"
    : "Pending";
}

function assessmentPromotionStatus(Row: AnyRow) {
  const RawStatus = String(Row.progressionStatus || "").toUpperCase();
  if (RawStatus === "PROMOTED" || Row.isPromoted) return "PROMOTED";
  if (
    Row.isReadyForNextLevel ||
    Row.readyForNextLevel ||
    RawStatus === "READY_FOR_NEXT_LEVEL"
  ) {
    return "AVAILABLE";
  }
  return "NOT_AVAILABLE";
}

function assessmentReadyForNextLevel(Row: AnyRow) {
  return assessmentPromotionStatus(Row) === "AVAILABLE";
}

function assessmentPromoted(Row: AnyRow) {
  return assessmentPromotionStatus(Row) === "PROMOTED";
}

function canPromoteAssessment(Row: AnyRow) {
  return assessmentPromotionStatus(Row) === "AVAILABLE";
}

function promotionCanProceed(Row: AnyRow) {
  const Explicit = Row.promotionCanProceed;
  if (Explicit !== undefined && Explicit !== null) {
    return String(Explicit).toLowerCase() === "true" || Explicit === true;
  }
  if (Row.nextLevelAvailable !== undefined && Row.nextLevelAvailable !== null) {
    return (
      String(Row.nextLevelAvailable).toLowerCase() === "true" ||
      Row.nextLevelAvailable === true
    );
  }
  return Boolean(
    Row.toLevelId || Row.toLevelCode || Row.nextLevelId || Row.nextLevelCode,
  );
}

function promotionBlockReason(Row: AnyRow) {
  return String(
    Row.promotionBlockReason ||
      Row.nextLevelBlockReason ||
      Row.progressionMessage ||
      "Create the next level in Learning Path before promoting this student.",
  );
}

function promotionTargetLevelLabel(Row: AnyRow) {
  return String(
    Row.toLevelCode ||
      Row.nextLevelCode ||
      Row.toLevelName ||
      Row.nextLevelName ||
      "Next Available Level",
  );
}

function promotionTargetLevelOptions(Row: AnyRow) {
  const RawOptions = Array.isArray(Row.promotionTargetLevels)
    ? Row.promotionTargetLevels
    : [];
  const Options = RawOptions.map((Item: AnyRow) => {
    const LevelId = String(
      Item.levelId || Item.toLevelId || Item.id || "",
    ).trim();
    const LevelCode = String(Item.levelCode || Item.toLevelCode || "").trim();
    const LevelName = String(Item.levelName || Item.toLevelName || "").trim();
    const Label = String(
      Item.label ||
        [LevelCode, LevelName].filter(Boolean).join(" — ") ||
        LevelCode ||
        LevelName,
    ).trim();
    return {
      LevelId,
      LevelCode,
      LevelName,
      Label: Label || "Next Available Level",
    };
  }).filter((Item) => Item.LevelId || Item.LevelCode);

  if (Options.length) return Options;

  const FallbackId = String(Row.toLevelId || Row.nextLevelId || "").trim();
  const FallbackCode = String(
    Row.toLevelCode || Row.nextLevelCode || "",
  ).trim();
  const FallbackName = String(
    Row.toLevelName || Row.nextLevelName || "",
  ).trim();
  if (!FallbackId && !FallbackCode) return [];
  return [
    {
      LevelId: FallbackId,
      LevelCode: FallbackCode,
      LevelName: FallbackName,
      Label:
        [FallbackCode, FallbackName].filter(Boolean).join(" — ") ||
        "Next Available Level",
    },
  ];
}

function PromotionChip({ Row }: { Row: AnyRow }) {
  const Status = assessmentPromotionStatus(Row);
  if (Status === "PROMOTED") return <Chip tone="green">Promoted</Chip>;
  if (Status === "AVAILABLE") return <Chip tone="purple">Available</Chip>;
  return <Chip tone="slate">Not Available</Chip>;
}

function assessmentStatusTone(
  Row: AnyRow,
): "green" | "amber" | "red" | "blue" | "slate" {
  const Status = assessmentCurrentStatus(Row);
  if (Status === "CLEARED") return "green";
  if (Status === "NEEDS_REATTEMPT") return "red";
  return "amber";
}

function assessmentAttemptId(Row: AnyRow) {
  return String(
    Row.attemptId ||
      Row.assessmentAttemptId ||
      Row.latestAttemptId ||
      Row.resultAttemptId ||
      "",
  );
}

function assessmentScoreLabel(Row: AnyRow) {
  if (assessmentCurrentStatus(Row) === "PENDING") return "—";
  const Score = Number(Row.score ?? Row.totalScore ?? Row.resultScore);
  const MaxScore = Number(
    Row.maxScore ?? Row.totalMarks ?? Row.maximumScore ?? 100,
  );
  if (!Number.isFinite(Score)) return "—";
  const SafeMax = Number.isFinite(MaxScore) && MaxScore > 0 ? MaxScore : 100;
  const SafeScore = Math.min(Math.max(Score, 0), SafeMax);
  return `${cleanNumber(SafeScore)} / ${cleanNumber(SafeMax)}`;
}

function assessmentScoreTone(Row: AnyRow): "green" | "amber" | "red" | "slate" {
  if (assessmentCurrentStatus(Row) === "PENDING") return "slate";
  const Accuracy = assessmentAccuracy(Row);
  if (Accuracy === null) return "slate";
  if (Accuracy >= 70) return "green";
  return "red";
}

function assessmentDateTimeLabel(Row: AnyRow, Keys: string[]) {
  for (const Key of Keys) {
    const Value = Row[Key];
    if (Value) return formatMathPathDateTime(String(Value));
  }
  return "—";
}

function latestAssessmentRow(Rows: AnyRow[]) {
  if (!Rows.length) return null;
  return (
    [...Rows].sort(
      (First, Second) =>
        assessmentTimestampMs(Second) - assessmentTimestampMs(First),
    )[0] || null
  );
}
function currentAssessmentRows(Rows: AnyRow[]) {
  const RowMap = new Map<string, AnyRow[]>();
  Rows.forEach((Row) => {
    const Key = [
      String(
        Row.studentCode ||
          Row.targetStudentCode ||
          Row.studentId ||
          Row.targetStudentId ||
          "Student",
      ),
      rowModuleCode(Row),
      rowLevelCode(Row),
    ].join("::");
    const ExistingRows = RowMap.get(Key) ?? [];
    ExistingRows.push(Row);
    RowMap.set(Key, ExistingRows);
  });
  return Array.from(RowMap.values())
    .map((GroupRows) => latestAssessmentRow(GroupRows))
    .filter(Boolean) as AnyRow[];
}

function averageAssessmentAccuracy(Rows: AnyRow[]) {
  const Values = Rows.filter(
    (Row) => assessmentCurrentStatus(Row) !== "PENDING",
  )
    .map(assessmentAccuracy)
    .filter(
      (Value): Value is number => Value !== null && Number.isFinite(Value),
    );
  if (!Values.length) return null;
  return Values.reduce((Total, Value) => Total + Value, 0) / Values.length;
}

function assessmentManageStatusKey(Row: AnyRow) {
  const Label = assessmentStatusLabel(Row)
    .toUpperCase()
    .replace(/[^A-Z]+/g, "_")
    .replace(/^_|_$/g, "");
  if (Label.includes("RE_ATTEMPT_CLEARED")) return "REATTEMPT_CLEARED";
  if (Label.includes("RE_ATTEMPT_PENDING")) return "REATTEMPT_PENDING";
  if (Label.includes("NEEDS_RE_ATTEMPT")) return "NEEDS_REATTEMPT";
  if (Label.includes("CLEARED")) return "CLEARED";
  return "PENDING";
}

function StatusChip({ Rows }: { Rows: AnyRow[] }) {
  const LatestRow = latestAssessmentRow(Rows);
  if (!LatestRow) return <Chip tone="amber">Pending</Chip>;
  return (
    <Chip tone={assessmentStatusTone(LatestRow)}>
      {assessmentStatusLabel(LatestRow)}
    </Chip>
  );
}

function approvalStatusTone(
  Status: string,
  UsedAt?: string | null,
): "green" | "amber" | "red" | "blue" | "slate" {
  if (Status === "PENDING") return "amber";
  if (Status === "REJECTED") return "red";
  if (Status === "APPROVED" && UsedAt) return "blue";
  if (Status === "APPROVED") return "green";
  return "slate";
}

function cleanNumber(Value: number | null | undefined) {
  if (Value === null || Value === undefined || !Number.isFinite(Number(Value)))
    return "—";
  return String(Math.round(Number(Value)));
}

function ApprovalMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return <Metric label={label} value={value} icon={icon} />;
}

function ResolveAssessmentControlTab(
  TabValue: string | null,
): ActiveTab | null {
  const Normalized = String(TabValue || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  if (["RECORDS", "STUDENT_RECORDS", "STUDENT_RECORD"].includes(Normalized))
    return "RECORDS";
  if (
    ["APPROVALS", "REATTEMPT_APPROVALS", "RE_ATTEMPT_APPROVALS"].includes(
      Normalized,
    )
  )
    return "APPROVALS";
  if (["MANAGE", "ASSESSMENT_MANAGE"].includes(Normalized)) return "MANAGE";
  if (["PROMOTION_HISTORY", "PROMOTIONS"].includes(Normalized))
    return "PROMOTION_HISTORY";
  if (["PARENT_REPORTS", "PARENT_REPORT"].includes(Normalized))
    return "PARENT_REPORTS";
  return null;
}

function ResolveParentReportTab(
  TabValue: string | null,
): ParentReportTab | null {
  const Normalized = String(TabValue || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  if (["GENERATE", "GENERATE_REPORTS", "REPORTS"].includes(Normalized))
    return "GENERATE";
  if (["DELIVERY_HISTORY", "DELIVERY", "REPORT_AUDIT"].includes(Normalized))
    return "DELIVERY_HISTORY";
  return null;
}



export default function AdminAssessmentControlPage() {
  return (
    <Suspense fallback={null}>
      <AdminAssessmentControlPageContent />
    </Suspense>
  );
}

function AdminAssessmentControlPageContent() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();
  const Pathname = usePathname();
  const SearchParams = useSearchParams();
  const AssessmentDeepLinkTarget = useMemo(
    () => buildAssessmentDeepLinkTarget(SearchParams),
    [SearchParams],
  );
  const QueryClient = useQueryClient();
  const [ActiveTab, SetActiveTab] = useState<ActiveTab>(() => ResolveAssessmentControlTab(SearchParams.get("tab")) || "RECORDS");
  const [ParentReportTabValue, SetParentReportTabValue] =
    useState<ParentReportTab>(() => ResolveParentReportTab(SearchParams.get("subTab")) || "GENERATE");
  const [SearchValue, SetSearchValue] = useState("");
  const [StatusFilterValue, SetStatusFilterValue] = useState<StatusFilter>("");
  const [TeacherFilter, SetTeacherFilter] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("");
  const [LevelFilter, SetLevelFilter] = useState("");
  const [ApprovalStatusFilterValue, SetApprovalStatusFilterValue] =
    useState<ApprovalStatusFilter>("ALL");
  const [ApprovalSearchValue, SetApprovalSearchValue] = useState("");
  const [ApprovalModuleFilter, SetApprovalModuleFilter] = useState("");
  const [ApprovalLevelFilter, SetApprovalLevelFilter] = useState("");
  const [DecisionTarget, SetDecisionTarget] = useState<{
    Mode: DecisionMode;
    Item: AdminAssessmentReattemptApproval;
  } | null>(null);
  const [DecisionNote, SetDecisionNote] = useState("");
  const [ManageSearchValue, SetManageSearchValue] = useState("");
  const [ManageModuleFilter, SetManageModuleFilter] = useState("");
  const [ManageLevelFilter, SetManageLevelFilter] = useState("");
  const [ManageStatusFilter, SetManageStatusFilter] =
    useState<ManageStatusFilter>("ALL");
  const [DeleteTarget, SetDeleteTarget] = useState<AnyRow | null>(null);
  const [PromoteTarget, SetPromoteTarget] = useState<AnyRow | null>(null);
  const [PromotionHistorySearchValue, SetPromotionHistorySearchValue] =
    useState("");


  const UpdateAssessmentRouteState = useCallback((NextTab: ActiveTab, NextSubTab?: ParentReportTab) => {
    SetActiveTab(NextTab);
    if (NextSubTab) SetParentReportTabValue(NextSubTab);

    const NextParams = new URLSearchParams(SearchParams.toString());
    if (NextTab === "RECORDS") NextParams.delete("tab");
    else NextParams.set("tab", NextTab.toLowerCase().replace(/_/g, "-"));

    if (NextTab === "PARENT_REPORTS") {
      NextParams.set("subTab", (NextSubTab || ParentReportTabValue).toLowerCase().replace(/_/g, "-"));
    } else {
      NextParams.delete("subTab");
    }

    const NextQuery = NextParams.toString();
    Router.replace(`${Pathname}${NextQuery ? `?${NextQuery}` : ""}`, { scroll: false });
  }, [ParentReportTabValue, Pathname, Router, SearchParams]);

  useEffect(() => {
    const RoutedTab = ResolveAssessmentControlTab(SearchParams.get("tab"));
    if (RoutedTab) SetActiveTab(RoutedTab);

    const TargetAction = String(SearchParams.get("targetAction") || "")
      .trim()
      .toLowerCase();
    const RoutedSubTab =
      TargetAction === "parentreportgeneratereports"
        ? "GENERATE"
        : TargetAction === "parentreportdeliveryhistory"
          ? "DELIVERY_HISTORY"
          : ResolveParentReportTab(SearchParams.get("subTab"));
    if (RoutedSubTab) {
      SetActiveTab("PARENT_REPORTS");
      SetParentReportTabValue(RoutedSubTab);
    }
  }, [SearchParams]);

  useEffect(() => {
    if (!AssessmentDeepLinkTarget.HasTarget) return;
    const RoutedTab = ResolveAssessmentControlTab(SearchParams.get("tab"));
    if (!RoutedTab) SetActiveTab("RECORDS");
    if (AssessmentDeepLinkTarget.Student)
      SetSearchValue(AssessmentDeepLinkTarget.Student);
    if (AssessmentDeepLinkTarget.Module)
      SetModuleFilter(AssessmentDeepLinkTarget.Module);
    if (AssessmentDeepLinkTarget.Level)
      SetLevelFilter(AssessmentDeepLinkTarget.Level);
  }, [AssessmentDeepLinkTarget, SearchParams]);
  const [PromotionHistoryModuleFilter, SetPromotionHistoryModuleFilter] =
    useState("");
  const [PromotionHistoryLevelFilter, SetPromotionHistoryLevelFilter] =
    useState("");

  const AssessmentQuery = useQuery({
    queryKey: ["admin-assessments"],
    queryFn: getAdminAssessments,
    enabled: Ready,
  });
  const ApprovalQuery = useQuery({
    queryKey: [
      "admin-assessment-reattempt-approvals",
      ApprovalStatusFilterValue,
    ],
    queryFn: () =>
      getAdminAssessmentReattemptApprovals({
        status:
          ApprovalStatusFilterValue === "ALL"
            ? undefined
            : ApprovalStatusFilterValue,
      }),
    enabled: Ready,
  });

  const PromotionHistoryQuery = useQuery({
    queryKey: ["admin-student-level-promotions"],
    queryFn: getAdminStudentLevelPromotions,
    enabled: Ready,
  });

  const ParentReportDeliveryQuery = useQuery({
    queryKey: ["admin-parent-report-delivery-logs"],
    queryFn: () => getAdminParentReportDeliveryLogs(),
    enabled: Ready,
  });

  const ArchiveAssessmentMutation = useMutation({
    mutationFn: async (Item: AnyRow) =>
      updateAssessmentAssignmentStatus(
        String(Item.assignmentId || Item.assessmentAssignmentId || Item.id),
        false,
      ),
    onSuccess: () => {
      QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] });
      QueryClient.invalidateQueries({
        queryKey: ["admin-assessment-reattempt-approvals"],
      });
    },
  });

  const DeleteAssessmentMutation = useMutation({
    mutationFn: async (Item: AnyRow) =>
      deleteAssessmentAssignment(
        String(Item.assignmentId || Item.assessmentAssignmentId || Item.id),
      ),
    onSuccess: () => {
      SetDeleteTarget(null);
      QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] });
      QueryClient.invalidateQueries({
        queryKey: ["admin-assessment-reattempt-approvals"],
      });
    },
  });

  const PromoteAssessmentMutation = useMutation({
    mutationFn: async (Payload: PromotionMutationPayload) =>
      promoteAssessmentAssignment(
        String(
          Payload.Item.assignmentId ||
            Payload.Item.assessmentAssignmentId ||
            Payload.Item.id,
        ),
        {
          targetLevelId: Payload.TargetLevelId || null,
          targetLevelCode: Payload.TargetLevelCode || null,
        },
      ),
    onSuccess: () => {
      SetPromoteTarget(null);
      QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] });
      QueryClient.invalidateQueries({ queryKey: ["teacher-assessments"] });
      QueryClient.invalidateQueries({
        queryKey: ["admin-student-level-promotions"],
      });
    },
  });

  const DecisionMutation = useMutation({
    mutationFn: async () => {
      if (!DecisionTarget) throw new Error("No approval request selected.");
      const Payload = { adminNote: DecisionNote.trim() || null };
      if (DecisionTarget.Mode === "APPROVE")
        return approveAdminAssessmentReattempt(
          DecisionTarget.Item.approvalId,
          Payload,
        );
      return rejectAdminAssessmentReattempt(
        DecisionTarget.Item.approvalId,
        Payload,
      );
    },
    onSuccess: () => {
      SetDecisionTarget(null);
      SetDecisionNote("");
      QueryClient.invalidateQueries({
        queryKey: ["admin-assessment-reattempt-approvals"],
      });
      QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] });
    },
  });

  const Rows: AnyRow[] = AssessmentQuery.data ?? [];
  const ManageRows = Rows;
  const ApprovalData = ApprovalQuery.data;
  const ApprovalItems = ApprovalData?.items ?? [];
  const PromotionHistoryItems = PromotionHistoryQuery.data?.items ?? [];

  const PromotionHistoryModuleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    PromotionHistoryItems.forEach((Item) => {
      const Code = String(Item.fromModuleCode || Item.toModuleCode || "Module");
      const Name = String(Item.fromModuleName || Item.toModuleName || "");
      const Label = Name && Name !== Code ? `${Code} · ${Name}` : Code;
      if (!ModuleMap.has(Code)) ModuleMap.set(Code, Label);
    });
    return Array.from(ModuleMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [PromotionHistoryItems]);

  const PromotionHistoryLevelOptions = useMemo(() => {
    const SourceItems =
      PromotionHistoryModuleFilter && PromotionHistoryModuleFilter !== "ALL"
        ? PromotionHistoryItems.filter(
            (Item) =>
              String(Item.fromModuleCode || Item.toModuleCode || "Module") ===
              PromotionHistoryModuleFilter,
          )
        : PromotionHistoryItems;
    return Array.from(
      new Set(
        SourceItems.map((Item) => String(Item.fromLevelCode || "Level")).filter(
          Boolean,
        ),
      ),
    ).sort((First, Second) =>
      First.localeCompare(Second, undefined, { numeric: true }),
    );
  }, [PromotionHistoryItems, PromotionHistoryModuleFilter]);

  const FilteredPromotionHistoryItems = useMemo(() => {
    const Query = PromotionHistorySearchValue.trim().toLowerCase();
    return PromotionHistoryItems.filter((Item) => {
      const MatchesSearch =
        !Query ||
        [
          Item.studentName,
          Item.studentCode,
          Item.assessmentTitle,
          Item.fromModuleCode,
          Item.fromLevelCode,
          Item.toModuleCode,
          Item.toLevelCode,
          Item.promotedByName,
          Item.statusLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(Query);
      const MatchesModule =
        !PromotionHistoryModuleFilter ||
        PromotionHistoryModuleFilter === "ALL" ||
        String(Item.fromModuleCode || Item.toModuleCode || "Module") ===
          PromotionHistoryModuleFilter;
      const MatchesLevel =
        !PromotionHistoryLevelFilter ||
        PromotionHistoryLevelFilter === "ALL" ||
        String(Item.fromLevelCode || "Level") === PromotionHistoryLevelFilter;
      return MatchesSearch && MatchesModule && MatchesLevel;
    });
  }, [
    PromotionHistoryItems,
    PromotionHistorySearchValue,
    PromotionHistoryModuleFilter,
    PromotionHistoryLevelFilter,
  ]);

  const PromotionHistoryStudentCount = useMemo(
    () => BuildPromotionHistoryStudentGroups(PromotionHistoryItems).length,
    [PromotionHistoryItems],
  );

  const ApprovalModuleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    ApprovalItems.forEach((Item) => {
      const Code = String(Item.moduleCode || "Module");
      const Label = String(
        (Item as any).moduleName || Item.moduleCode || "Module",
      );
      if (!ModuleMap.has(Code)) ModuleMap.set(Code, Label);
    });
    return Array.from(ModuleMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [ApprovalItems]);

  const ApprovalLevelOptions = useMemo(() => {
    const SourceItems =
      ApprovalModuleFilter && ApprovalModuleFilter !== "ALL"
        ? ApprovalItems.filter(
            (Item) =>
              String(Item.moduleCode || "Module") === ApprovalModuleFilter,
          )
        : ApprovalItems;
    return Array.from(
      new Set(
        SourceItems.map((Item) => String(Item.levelCode || "Level")).filter(
          Boolean,
        ),
      ),
    ).sort((First, Second) =>
      First.localeCompare(Second, undefined, { numeric: true }),
    );
  }, [ApprovalItems, ApprovalModuleFilter]);

  const FilteredApprovalItems = useMemo(() => {
    const Query = ApprovalSearchValue.trim().toLowerCase();
    return ApprovalItems.filter((Item) => {
      const MatchesSearch =
        !Query ||
        [
          Item.studentName,
          Item.studentCode,
          Item.teacherName,
          Item.moduleCode,
          Item.levelCode,
          Item.failedAssessmentTitle,
          Item.assessmentTitle,
          Item.statusLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(Query);
      const MatchesModule =
        !ApprovalModuleFilter ||
        ApprovalModuleFilter === "ALL" ||
        String(Item.moduleCode || "Module") === ApprovalModuleFilter;
      const MatchesLevel =
        !ApprovalLevelFilter ||
        ApprovalLevelFilter === "ALL" ||
        String(Item.levelCode || "Level") === ApprovalLevelFilter;
      return MatchesSearch && MatchesModule && MatchesLevel;
    });
  }, [
    ApprovalItems,
    ApprovalSearchValue,
    ApprovalModuleFilter,
    ApprovalLevelFilter,
  ]);

  const TeacherOptions = useMemo(() => uniqueTeacherOptions(Rows), [Rows]);
  const ModuleOptions = useMemo(() => uniqueModuleOptions(Rows), [Rows]);
  const LevelOptions = useMemo(() => {
    const ScopedRows =
      ModuleFilter && ModuleFilter !== "ALL"
        ? Rows.filter((Row) => rowModuleCode(Row) === ModuleFilter)
        : Rows;
    return uniqueLevelOptions(ScopedRows);
  }, [Rows, ModuleFilter]);

  const FilteredRows = useMemo(() => {
    const Query = SearchValue.trim().toLowerCase();
    return Rows.filter(
      (Row) =>
        matchesStatus(Row, StatusFilterValue) &&
        (!TeacherFilter ||
          TeacherFilter === "ALL" ||
          rowTeacherKey(Row) === TeacherFilter) &&
        (!ModuleFilter ||
          ModuleFilter === "ALL" ||
          rowModuleCode(Row) === ModuleFilter) &&
        (!LevelFilter ||
          LevelFilter === "ALL" ||
          rowLevelCode(Row) === LevelFilter) &&
        (!Query || searchText(Row).includes(Query)),
    );
  }, [
    Rows,
    SearchValue,
    StatusFilterValue,
    TeacherFilter,
    ModuleFilter,
    LevelFilter,
  ]);

  const ManageModuleOptions = useMemo(
    () => uniqueModuleOptions(ManageRows),
    [ManageRows],
  );

  const ManageLevelOptions = useMemo(() => {
    const ScopedRows =
      ManageModuleFilter && ManageModuleFilter !== "ALL"
        ? ManageRows.filter((Row) => rowModuleCode(Row) === ManageModuleFilter)
        : ManageRows;
    return uniqueLevelOptions(ScopedRows).map(
      (Value) => [Value, Value] as [string, string],
    );
  }, [ManageRows, ManageModuleFilter]);

  const FilteredManageRows = useMemo(() => {
    const Query = ManageSearchValue.trim().toLowerCase();
    return ManageRows.filter((Row) => {
      const StatusKey = assessmentManageStatusKey(Row);
      const MatchesStatus =
        !ManageStatusFilter ||
        ManageStatusFilter === "ALL" ||
        StatusKey === ManageStatusFilter;
      const MatchesModule =
        !ManageModuleFilter ||
        ManageModuleFilter === "ALL" ||
        rowModuleCode(Row) === ManageModuleFilter;
      const MatchesLevel =
        !ManageLevelFilter ||
        ManageLevelFilter === "ALL" ||
        rowLevelCode(Row) === ManageLevelFilter;
      const SearchSource = [
        Row.studentName,
        Row.studentCode,
        Row.targetStudentName,
        Row.targetStudentCode,
        assessmentTitle(Row),
        rowModuleCode(Row),
        rowLevelCode(Row),
        assessmentAttemptLabel(Row),
        assessmentStatusLabel(Row),
        assessmentScoreLabel(Row),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        MatchesStatus &&
        MatchesModule &&
        MatchesLevel &&
        (!Query || SearchSource.includes(Query))
      );
    });
  }, [
    ManageRows,
    ManageSearchValue,
    ManageModuleFilter,
    ManageLevelFilter,
    ManageStatusFilter,
  ]);

  const Students = useMemo(() => buildStudents(FilteredRows), [FilteredRows]);
  const CurrentMetricRows = useMemo(
    () => currentAssessmentRows(FilteredRows),
    [FilteredRows],
  );
  const AssessmentAverageAccuracy = useMemo(
    () => averageAssessmentAccuracy(CurrentMetricRows),
    [CurrentMetricRows],
  );
  const PromotionReadyCount = useMemo(() => {
    return buildStudents(CurrentMetricRows).filter((Student) => {
      const LatestRow = latestAssessmentRow(Student.rows);
      return LatestRow ? assessmentReadyForNextLevel(LatestRow) : false;
    }).length;
  }, [CurrentMetricRows]);

  const ParentReportEligibleRows = useMemo(() => {
    const CurrentRows = currentAssessmentRows(Rows);
    return CurrentRows.filter(
      (Row) => assessmentCurrentStatus(Row) === "CLEARED",
    ).sort((First, Second) => {
      const StudentOrder = CompareStudentCodes(
        assessmentRecordStudentCode(First),
        assessmentRecordStudentCode(Second),
      );
      if (StudentOrder !== 0) return StudentOrder;
      return rowLevelCode(First).localeCompare(
        rowLevelCode(Second),
        undefined,
        { numeric: true },
      );
    });
  }, [Rows]);

  const ParentReportDeliveryLogs = ParentReportDeliveryQuery.data?.logs ?? [];
  const ParentReportSentCount = ParentReportDeliveryLogs.filter(
    (Item) => String(Item.status || "").toUpperCase() === "SENT",
  ).length;
  const ParentReportFailedCount = ParentReportDeliveryLogs.filter(
    (Item) => String(Item.status || "").toUpperCase() === "FAILED",
  ).length;
  const ParentReportReadyToSendCount = ParentReportEligibleRows.filter(
    (Item) => {
      const Status = parentReportOperationalStatus(
        Item,
        ParentReportDeliveryLogs,
      );
      return Status.Label === "Ready To Send";
    },
  ).length;
  const ParentReportPendingCount = ParentReportEligibleRows.filter((Item) => {
    const Status = parentReportOperationalStatus(
      Item,
      ParentReportDeliveryLogs,
    );
    return Status.Label !== "Sent";
  }).length;

  if (!Ready || AssessmentQuery.isLoading)
    return <LoadingState label="Loading assessment records..." />;
  if (AssessmentQuery.isError)
    return <ErrorState message={apiErrorMessage(AssessmentQuery.error)} />;

  return (
    <AppShell title="Assessment Control">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Learning Operations</p>
            <h1 className="math-title">Assessment Control</h1>
            <p className="math-subtitle">
              Manage assessment records, re-attempt approval, and assignment
              governance.
            </p>
          </div>
          <div className="math-confirm-summary-grid lg:grid-cols-4 xl:grid-cols-7">
            <Metric
              label="Students"
              value={Students.length}
              icon={<UsersRound size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Assigned Assessments"
              value={FilteredRows.length}
              icon={<ClipboardList size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Cleared Assessments"
              value={
                CurrentMetricRows.filter(
                  (Row) => assessmentCurrentStatus(Row) === "CLEARED",
                ).length
              }
              icon={<CheckCircle2 size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Pending Assessments"
              value={
                CurrentMetricRows.filter(
                  (Row) => assessmentCurrentStatus(Row) === "PENDING",
                ).length
              }
              icon={<ClipboardCheck size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Re-Attempt Needed"
              value={
                CurrentMetricRows.filter(
                  (Row) => assessmentCurrentStatus(Row) === "NEEDS_REATTEMPT",
                ).length
              }
              icon={<AlertTriangle size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Promotion Ready"
              value={PromotionReadyCount}
              icon={<ShieldCheck size={15} />}
              className={AdminDarkMetricCardClass}
            />
            <Metric
              label="Average Accuracy"
              value={cleanPercent(AssessmentAverageAccuracy)}
              icon={<Sparkles size={15} />}
              className={AdminDarkMetricCardClass}
            />
          </div>
        </div>

        <div className="math-tab-strip">
          <button
            className={`math-role-tab math-admin-tab-force ${ActiveTab === "RECORDS" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={ActiveTab === "RECORDS"}
            data-active={ActiveTab === "RECORDS" ? "true" : "false"}
            onClick={() => UpdateAssessmentRouteState("RECORDS")}
          >
            Student Records
          </button>
          <button
            className={`math-role-tab math-admin-tab-force ${ActiveTab === "APPROVALS" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={ActiveTab === "APPROVALS"}
            data-active={ActiveTab === "APPROVALS" ? "true" : "false"}
            onClick={() => UpdateAssessmentRouteState("APPROVALS")}
          >
            Re-Attempt Approvals
          </button>
          <button
            className={`math-role-tab math-admin-tab-force ${ActiveTab === "MANAGE" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={ActiveTab === "MANAGE"}
            data-active={ActiveTab === "MANAGE" ? "true" : "false"}
            onClick={() => UpdateAssessmentRouteState("MANAGE")}
          >
            Manage
          </button>
          <button
            className={`math-role-tab math-admin-tab-force ${ActiveTab === "PROMOTION_HISTORY" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={ActiveTab === "PROMOTION_HISTORY"}
            data-active={ActiveTab === "PROMOTION_HISTORY" ? "true" : "false"}
            onClick={() => UpdateAssessmentRouteState("PROMOTION_HISTORY")}
          >
            Promotion History
          </button>
          <button
            className={`math-role-tab math-admin-tab-force ${ActiveTab === "PARENT_REPORTS" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={ActiveTab === "PARENT_REPORTS"}
            data-active={ActiveTab === "PARENT_REPORTS" ? "true" : "false"}
            onClick={() => UpdateAssessmentRouteState("PARENT_REPORTS", ParentReportTabValue)}
          >
            Parent Reports
          </button>
        </div>

        {ActiveTab === "RECORDS" ? (
          <>
            <div className="math-operation-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="math-kicker">Assessment Control</p>
                  <h2 className="text-2xl font-black">Student Records</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Review student-wise assessment control status.
                  </p>
                </div>
                <button
                  className="math-button-primary"
                  onClick={() => Router.push("/admin/assessment-blueprints")}
                  title="Create Assessment"
                  aria-label="Create Assessment"
                >
                  <Plus size={16} /> Create Assessment
                </button>
              </div>
              <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_210px_210px_180px_180px] lg:grid-cols-3">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className="math-input pl-11"
                    value={SearchValue}
                    onChange={(Event) => SetSearchValue(Event.target.value)}
                    placeholder="Search Assessments"
                  />
                </div>
                <select
                  className="math-input"
                  value={TeacherFilter}
                  onChange={(Event) => SetTeacherFilter(Event.target.value)}
                  title="Filter by teacher"
                  aria-label="Filter by teacher"
                >
                  <option value="" disabled>
                    Choose Teacher
                  </option>
                  <option value="ALL">All Teachers</option>
                  {TeacherOptions.map(([TeacherKey, TeacherLabel]) => (
                    <option key={TeacherKey} value={TeacherKey}>
                      {TeacherLabel}
                    </option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={ModuleFilter}
                  onChange={(Event) => {
                    SetModuleFilter(Event.target.value);
                    SetLevelFilter("");
                  }}
                  title="Filter by module"
                  aria-label="Filter by module"
                >
                  <option value="" disabled>
                    Choose Module
                  </option>
                  <option value="ALL">All Modules</option>
                  {ModuleOptions.map(([ModuleKey, ModuleLabel]) => (
                    <option key={ModuleKey} value={ModuleKey}>
                      {ModuleLabel}
                    </option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={LevelFilter}
                  onChange={(Event) => SetLevelFilter(Event.target.value)}
                  title="Filter by level"
                  aria-label="Filter by level"
                >
                  <option value="" disabled>
                    Choose Level
                  </option>
                  <option value="ALL">All Levels</option>
                  {LevelOptions.map((LevelCode) => (
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
                  title="Filter by status"
                  aria-label="Filter by status"
                >
                  <option value="" disabled>
                    Choose Status
                  </option>
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Archived</option>
                </select>
              </div>
            </div>

            {AssessmentDeepLinkTarget.HasTarget ? (
              <NotificationTargetBanner
                className="mb-5"
                tone="purple"
                label="Assessment"
                title="Assessment Record Highlighted"
                description={`${AssessmentDeepLinkTarget.Student || "Student"}${AssessmentDeepLinkTarget.Level ? ` · ${AssessmentDeepLinkTarget.Level}` : ""}`}
              />
            ) : null}

            {Students.length ? (
              <AdminAssessmentStudentTable
                Students={Students}
                FocusTarget={AssessmentDeepLinkTarget}
                OnOpenAttempt={(Row) => {
                  const AttemptId = assessmentAttemptId(Row);
                  if (AttemptId) {
                    localStorage.setItem("mathpath_active_role", "ADMIN");
                    window.dispatchEvent(new Event("mathpath-auth-changed"));
                    Router.push(
                      `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=admin`,
                    );
                  }
                }}
              />
            ) : (
              <EmptyState message="Adjust the search or filters to review student assessment status." />
            )}
          </>
        ) : null}

        {ActiveTab === "APPROVALS" ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <ApprovalMetric
                label="Approved Requests"
                value={ApprovalData?.approved ?? 0}
                icon={<ShieldCheck size={15} />}
              />
              <ApprovalMetric
                label="Pending Requests"
                value={ApprovalData?.pending ?? 0}
                icon={<AlertTriangle size={15} />}
              />
              <ApprovalMetric
                label="Rejected Requests"
                value={ApprovalData?.rejected ?? 0}
                icon={<XCircle size={15} />}
              />
            </div>

            <div className="math-operation-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="math-kicker">Assessment Governance</p>
                  <h2 className="text-2xl font-black">Re-Attempt Approvals</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Approve re-attempt access only when a different live
                    assessment version will be assigned.
                  </p>
                </div>
                <div className="grid w-full gap-3 lg:max-w-4xl lg:grid-cols-[1fr_180px_180px_220px]">
                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      className="math-input pl-11"
                      value={ApprovalSearchValue}
                      onChange={(Event) =>
                        SetApprovalSearchValue(Event.target.value)
                      }
                      placeholder="Search Re-Attempt Approvals"
                    />
                  </div>
                  <select
                    className="math-input"
                    value={ApprovalModuleFilter || "__CHOOSE__"}
                    onChange={(Event) => {
                      const NextValue =
                        Event.target.value === "ALL" ||
                        Event.target.value === "__CHOOSE__"
                          ? ""
                          : Event.target.value;
                      SetApprovalModuleFilter(NextValue);
                      SetApprovalLevelFilter("");
                    }}
                    title="Choose Module"
                    aria-label="Choose Module"
                  >
                    <option value="__CHOOSE__" disabled>
                      Choose Module
                    </option>
                    <option value="ALL">All Modules</option>
                    {ApprovalModuleOptions.map(([Value, Label]) => (
                      <option key={Value} value={Value}>
                        {Label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="math-input"
                    value={ApprovalLevelFilter || "__CHOOSE__"}
                    onChange={(Event) =>
                      SetApprovalLevelFilter(
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
                    {ApprovalLevelOptions.map((Value) => (
                      <option key={Value} value={Value}>
                        {Value}
                      </option>
                    ))}
                  </select>
                  <select
                    className="math-input"
                    value={ApprovalStatusFilterValue}
                    onChange={(Event) =>
                      SetApprovalStatusFilterValue(
                        Event.target.value as ApprovalStatusFilter,
                      )
                    }
                    title="Choose Approval Status"
                    aria-label="Choose Approval Status"
                  >
                    <option value="ALL">All Approval Statuses</option>
                    <option value="PENDING">Pending Approval</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
              </div>
            </div>

            {ApprovalQuery.isLoading ? (
              <LoadingState label="Loading re-attempt approvals..." />
            ) : ApprovalQuery.isError ? (
              <ErrorState message={apiErrorMessage(ApprovalQuery.error)} />
            ) : FilteredApprovalItems.length ? (
              <ApprovalQueueTable
                Items={FilteredApprovalItems}
                OnDecision={(Mode, Item) => {
                  SetDecisionTarget({ Mode, Item });
                  SetDecisionNote(Item.adminNote || "");
                }}
              />
            ) : (
              <EmptyState message="No assessment re-attempt approval requests match the selected status." />
            )}
          </div>
        ) : null}

        {ActiveTab === "MANAGE" ? (
          <div className="space-y-5">
            <div className="math-operation-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="math-kicker">Assessment Management</p>
                  <h2 className="text-2xl font-black">Manage</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Archive or permanently delete assessment structures from one
                    controlled admin workspace.
                  </p>
                </div>
                <button
                  className="math-button-primary"
                  onClick={() => Router.push("/admin/assessment-blueprints")}
                  title="Create Assessment"
                  aria-label="Create Assessment"
                >
                  <Plus size={16} /> Create Assessment
                </button>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_220px_190px]">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className="math-input pl-11"
                    value={ManageSearchValue}
                    onChange={(Event) =>
                      SetManageSearchValue(Event.target.value)
                    }
                    placeholder="Search Manage Assessments"
                  />
                </div>
                <select
                  className="math-input"
                  value={ManageModuleFilter}
                  onChange={(Event) => {
                    SetManageModuleFilter(Event.target.value);
                    SetManageLevelFilter("");
                  }}
                  title="Choose Module"
                  aria-label="Choose Module"
                >
                  <option value="" disabled>
                    Choose Module
                  </option>
                  <option value="ALL">All Modules</option>
                  {ManageModuleOptions.map(([Value, Label]) => (
                    <option key={Value} value={Value}>
                      {Label}
                    </option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={ManageLevelFilter}
                  onChange={(Event) => SetManageLevelFilter(Event.target.value)}
                  title="Choose Level"
                  aria-label="Choose Level"
                >
                  <option value="" disabled>
                    Choose Level
                  </option>
                  <option value="ALL">All Levels</option>
                  {ManageLevelOptions.map(([Value, Label]) => (
                    <option key={Value} value={Value}>
                      {Label}
                    </option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={ManageStatusFilter}
                  onChange={(Event) =>
                    SetManageStatusFilter(
                      Event.target.value as ManageStatusFilter,
                    )
                  }
                  title="Choose Status"
                  aria-label="Choose Status"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CLEARED">Cleared</option>
                  <option value="REATTEMPT_CLEARED">Re-Attempt Cleared</option>
                  <option value="NEEDS_REATTEMPT">Needs Re-Attempt</option>
                  <option value="PENDING">Pending</option>
                  <option value="REATTEMPT_PENDING">Re-Attempt Pending</option>
                </select>
              </div>
            </div>

            {FilteredManageRows.length ? (
              <AssessmentManageTable
                Items={FilteredManageRows}
                Busy={
                  ArchiveAssessmentMutation.isPending ||
                  DeleteAssessmentMutation.isPending ||
                  PromoteAssessmentMutation.isPending
                }
                OnPromote={(Item) => SetPromoteTarget(Item)}
                OnArchive={(Item) => ArchiveAssessmentMutation.mutate(Item)}
                OnDelete={(Item) => SetDeleteTarget(Item)}
              />
            ) : (
              <EmptyState message="No student assessment records match the selected filters." />
            )}
          </div>
        ) : null}

        {ActiveTab === "PROMOTION_HISTORY" ? (
          <div className="space-y-5">
            <div className="math-operation-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="math-kicker">Progression Audit</p>
                  <h2 className="text-2xl font-black">Promotion History</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Review completed level promotions with assessment result and
                    admin action details.
                  </p>
                </div>
                <Metric
                  label="Promoted Students"
                  value={PromotionHistoryStudentCount}
                  icon={<ShieldCheck size={15} />}
                />
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_220px]">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className="math-input pl-11"
                    value={PromotionHistorySearchValue}
                    onChange={(Event) =>
                      SetPromotionHistorySearchValue(Event.target.value)
                    }
                    placeholder="Search Promotion History"
                  />
                </div>
                <select
                  className="math-input"
                  value={PromotionHistoryModuleFilter}
                  onChange={(Event) => {
                    SetPromotionHistoryModuleFilter(Event.target.value);
                    SetPromotionHistoryLevelFilter("");
                  }}
                  title="Choose Module"
                  aria-label="Choose Module"
                >
                  <option value="" disabled>
                    Choose Module
                  </option>
                  <option value="ALL">All Modules</option>
                  {PromotionHistoryModuleOptions.map(([Value, Label]) => (
                    <option key={Value} value={Value}>
                      {Label}
                    </option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={PromotionHistoryLevelFilter}
                  onChange={(Event) =>
                    SetPromotionHistoryLevelFilter(Event.target.value)
                  }
                  title="Choose Level"
                  aria-label="Choose Level"
                >
                  <option value="" disabled>
                    Choose Level
                  </option>
                  <option value="ALL">All Levels</option>
                  {PromotionHistoryLevelOptions.map((Value) => (
                    <option key={Value} value={Value}>
                      {Value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {PromotionHistoryQuery.isLoading ? (
              <LoadingState label="Loading promotion history..." />
            ) : PromotionHistoryQuery.isError ? (
              <ErrorState
                message={apiErrorMessage(PromotionHistoryQuery.error)}
              />
            ) : FilteredPromotionHistoryItems.length ? (
              <PromotionHistoryTable Items={FilteredPromotionHistoryItems} />
            ) : (
              <EmptyState message="No promotion history records match the selected filters." />
            )}
          </div>
        ) : null}

        {ActiveTab === "PARENT_REPORTS" ? (
          <div className="space-y-5">
            <div className="math-operation-panel math-admin-parent-report-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="math-kicker">Parent Report Center</p>
                  <h2 className="text-2xl font-black">Parent Reports</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Generate completed-level parent reports and review delivery
                    readiness from Assessment Control.
                  </p>
                </div>
                <div className="grid min-w-[320px] gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-blue-100 bg-white p-4 shadow-[0_12px_28px_rgba(37,99,235,0.10)] ring-1 ring-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
                        <FileText size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">
                          Ready To Send
                        </p>
                        <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                          {ParentReportReadyToSendCount}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-cyan-100 bg-white p-4 shadow-[0_12px_28px_rgba(6,182,212,0.10)] ring-1 ring-cyan-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-900">
                        <Mail size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">
                          Pending Delivery
                        </p>
                        <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                          {ParentReportPendingCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="math-report-mode-tabs-section mt-5 math-card p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <ParentReportModeButton
                    active={ParentReportTabValue === "GENERATE"}
                    icon={<FileText size={16} />}
                    kicker="Generate Reports"
                    title="Completed-Level Reports"
                    text="Review assessment-cleared students eligible for parent progress reports."
                    countLabel={`${ParentReportEligibleRows.length} Eligible`}
                    onClick={() => UpdateAssessmentRouteState("PARENT_REPORTS", "GENERATE")}
                  />
                  <ParentReportModeButton
                    active={ParentReportTabValue === "DELIVERY_HISTORY"}
                    icon={<History size={16} />}
                    kicker="Delivery History"
                    title="Report Audit"
                    text="Track sent and failed parent report emails with complete delivery audit details."
                    countLabel={`${ParentReportSentCount} Sent${ParentReportFailedCount ? ` · ${ParentReportFailedCount} Failed` : ""}`}
                    onClick={() => UpdateAssessmentRouteState("PARENT_REPORTS", "DELIVERY_HISTORY")}
                  />
                </div>
              </div>
            </div>

            {ParentReportTabValue === "GENERATE" ? (
              ParentReportEligibleRows.length ? (
                <ParentReportGenerateTable
                  Items={ParentReportEligibleRows}
                  DeliveryLogs={ParentReportDeliveryLogs}
                />
              ) : (
                <EmptyState message="No assessment-cleared student records are ready for parent report generation yet." />
              )
            ) : ParentReportDeliveryQuery.isLoading ? (
              <LoadingState label="Loading parent report delivery history..." />
            ) : ParentReportDeliveryQuery.isError ? (
              <ErrorState
                message={apiErrorMessage(ParentReportDeliveryQuery.error)}
              />
            ) : (
              <ParentReportDeliveryHistoryTable
                Items={ParentReportDeliveryLogs}
              />
            )}
          </div>
        ) : null}

        {DecisionTarget ? (
          <div className="math-modal-overlay">
            <div className="w-full max-w-xl rounded-[30px] bg-white p-6 shadow-2xl dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${DecisionTarget.Mode === "APPROVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                >
                  {DecisionTarget.Mode === "APPROVE" ? (
                    <ShieldCheck size={21} />
                  ) : (
                    <XCircle size={21} />
                  )}
                </span>
                <div>
                  <p className="math-kicker">Admin Decision</p>
                  <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                    {DecisionTarget.Mode === "APPROVE"
                      ? "Approve Re-Attempt Access?"
                      : "Reject Re-Attempt Access?"}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {DecisionTarget.Mode === "APPROVE"
                      ? "This will allow the teacher to assign a different live assessment version for this student."
                      : "The teacher will not be able to assign a re-attempt until approval is granted."}
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-[22px] bg-slate-50 p-4 text-sm font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <p>
                  {DecisionTarget.Item.studentName} ·{" "}
                  {DecisionTarget.Item.moduleCode || "Module"} ·{" "}
                  {DecisionTarget.Item.levelCode || "Level"}
                </p>
                <p className="mt-1 text-slate-500">
                  Failed Assessment: {DecisionTarget.Item.assessmentTitle}
                </p>
              </div>
              <label className="mt-5 block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Admin Note
                </span>
                <textarea
                  className="math-input mt-2 min-h-[90px]"
                  value={DecisionNote}
                  onChange={(Event) => SetDecisionNote(Event.target.value)}
                  placeholder="Optional approval note"
                />
              </label>
              {DecisionMutation.isError ? (
                <div className="mt-4">
                  <ErrorState
                    message={apiErrorMessage(DecisionMutation.error)}
                  />
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  className="math-button-secondary"
                  onClick={() => {
                    SetDecisionTarget(null);
                    SetDecisionNote("");
                  }}
                  disabled={DecisionMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  className={
                    DecisionTarget.Mode === "APPROVE"
                      ? "math-button-primary"
                      : "math-button-danger"
                  }
                  onClick={() => DecisionMutation.mutate()}
                  disabled={DecisionMutation.isPending}
                >
                  {DecisionTarget.Mode === "APPROVE" ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {DecisionTarget.Mode === "APPROVE"
                    ? "Approve Access"
                    : "Reject Request"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {DeleteTarget ? (
          <DeleteAssessmentDialog
            Item={DeleteTarget}
            Busy={DeleteAssessmentMutation.isPending}
            Error={
              DeleteAssessmentMutation.error
                ? apiErrorMessage(DeleteAssessmentMutation.error)
                : null
            }
            OnCancel={() => SetDeleteTarget(null)}
            OnConfirm={() => DeleteAssessmentMutation.mutate(DeleteTarget)}
          />
        ) : null}

        {PromoteTarget ? (
          <PromoteAssessmentDialog
            Item={PromoteTarget}
            Busy={PromoteAssessmentMutation.isPending}
            Error={
              PromoteAssessmentMutation.error
                ? apiErrorMessage(PromoteAssessmentMutation.error)
                : null
            }
            OnCancel={() => SetPromoteTarget(null)}
            OnConfirm={(TargetLevelId, TargetLevelCode) =>
              PromoteAssessmentMutation.mutate({
                Item: PromoteTarget,
                TargetLevelId,
                TargetLevelCode,
              })
            }
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function AdminAssessmentStudentTable({
  Students,
  OnOpenAttempt,
  FocusTarget,
}: {
  Students: StudentNode[];
  OnOpenAttempt: (Row: AnyRow) => void;
  FocusTarget?: AssessmentDeepLinkTarget;
}) {
  const [ExpandedStudents, SetExpandedStudents] = useState<
    Record<string, boolean>
  >({});

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  useEffect(() => {
    if (!FocusTarget?.HasTarget) return;
    const MatchingStudent = Students.find((Student) =>
      Student.rows.some((Row) =>
        assessmentRowMatchesDeepLink(Row, FocusTarget),
      ),
    );
    if (!MatchingStudent) return;
    SetExpandedStudents((Current) => ({
      ...Current,
      [MatchingStudent.key]: true,
    }));
  }, [Students, FocusTarget]);

  return (
    <div className="grid gap-3">
      {Students.map((Student) => {
        const IsExpanded = Boolean(ExpandedStudents[Student.key]);
        const Stats = studentAssessmentStats(Student.rows);
        return (
          <div
            key={Student.key}
            className="math-hierarchy-panel"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => ToggleStudent(Student.key)}
              onKeyDown={(Event) => {
                if (Event.key === "Enter" || Event.key === " ")
                  ToggleStudent(Student.key);
              }}
              className="math-hierarchy-row flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  className="math-hierarchy-icon h-10 w-10"
                  onClick={(Event) => {
                    Event.stopPropagation();
                    ToggleStudent(Student.key);
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
                  <p className="truncate text-base font-black text-slate-950 dark:text-white">
                    {Student.studentName}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {Student.studentCode}
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
                <AssessmentHierarchyRecords
                  Rows={Student.rows}
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

function AssessmentHierarchyRecords({
  Rows,
  OnOpenAttempt,
  FocusTarget,
}: {
  Rows: AnyRow[];
  OnOpenAttempt: (Row: AnyRow) => void;
  FocusTarget?: AssessmentDeepLinkTarget;
}) {
  const Groups = groupAssessmentRowsByModuleLevel(Rows);
  const [ExpandedModules, SetExpandedModules] = useState<
    Record<string, boolean>
  >({});
  const [ExpandedLevels, SetExpandedLevels] = useState<Record<string, boolean>>(
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
    const MatchingRow = Rows.find((Row) =>
      assessmentRowMatchesDeepLink(Row, FocusTarget),
    );
    if (!MatchingRow) return;
    const ModuleKey = rowModuleCode(MatchingRow);
    const LevelKey = `${ModuleKey}-${rowLevelCode(MatchingRow)}`;
    SetExpandedModules((Current) => ({ ...Current, [ModuleKey]: true }));
    SetExpandedLevels((Current) => ({ ...Current, [LevelKey]: true }));
    window.setTimeout(() => {
      document
        .getElementById(
          `admin-assessment-record-${assessmentAttemptId(MatchingRow) || MatchingRow.assignmentId || MatchingRow.assessmentAssignmentId}`,
        )
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
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
                  <p className="math-kicker text-[10px]">Assessment Module</p>
                  <h4 className="truncate text-lg font-black text-slate-950 dark:text-white">
                    {ModuleGroup.ModuleLabel}
                  </h4>
                </div>
              </div>
              <Chip tone="blue">
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
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">
                              Level Assessment
                            </p>
                            <h5 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-white">
                              {LevelGroup.LevelLabel}
                            </h5>
                          </div>
                        </div>
                        <Chip tone="blue">
                          {LevelGroup.Rows.length} Attempt
                          {LevelGroup.Rows.length === 1 ? "" : "s"}
                        </Chip>
                      </button>
                      {LevelExpanded ? (
                        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                          <div className="math-admin-assessment-control-table-header math-admin-assessment-student-records-header grid grid-cols-[1.08fr_.58fr_.76fr_.56fr_.56fr_.88fr_.88fr_104px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900">
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
                              const RowAccuracyValue = assessmentAccuracy(Row);
                              const IsFocused = assessmentRowMatchesDeepLink(
                                Row,
                                FocusTarget,
                              );
                              const RowKey = assessmentRowKey(
                                Row,
                                `${LevelGroup.LevelKey}-${Index}`,
                              );
                              const FocusId = `admin-assessment-record-${assessmentAttemptId(Row) || Row.assignmentId || Row.assessmentAssignmentId || RowKey}`;
                              return (
                                <div
                                  id={FocusId}
                                  key={RowKey}
                                  className={`grid grid-cols-[1.08fr_.58fr_.76fr_.56fr_.56fr_.88fr_.88fr_104px] items-center gap-3 px-4 py-3 ${IsFocused ? "ring-2 ring-cyan-400 bg-cyan-50/70 dark:bg-cyan-950/20" : ""}`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                      {assessmentTitle(Row)}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                      {rowLevelCode(Row)}
                                    </p>
                                  </div>
                                  <div>
                                    <Chip tone="blue">
                                      {assessmentAttemptLabel(Row)}
                                    </Chip>
                                  </div>
                                  <div>
                                    <Chip tone={assessmentStatusTone(Row)}>
                                      {assessmentStatusLabel(Row)}
                                    </Chip>
                                  </div>
                                  <div>
                                    <Chip tone={assessmentScoreTone(Row)}>
                                      {assessmentScoreLabel(Row)}
                                    </Chip>
                                  </div>
                                  <div>
                                    <Chip
                                      tone={
                                        RowAccuracyValue === null
                                          ? "slate"
                                          : RowAccuracyValue >= 70
                                            ? "green"
                                            : "red"
                                      }
                                    >
                                      {cleanPercent(RowAccuracyValue)}
                                    </Chip>
                                  </div>
                                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                    {assessmentDateTimeLabel(Row, [
                                      "assignedAt",
                                      "assignedDate",
                                      "createdAt",
                                    ])}
                                  </div>
                                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                    {assessmentDateTimeLabel(Row, [
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
                                    <StandardViewButton
                                      label="View"
                                      tooltip="Open assessment result"
                                      onClick={() => OnOpenAttempt(Row)}
                                      compact
                                    />
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

function AssessmentManageHierarchy({
  Rows,
  Busy,
  OnArchive,
  OnDelete,
}: {
  Rows: AnyRow[];
  Busy: boolean;
  OnArchive: (Item: AnyRow) => void;
  OnDelete: (Item: AnyRow) => void;
}) {
  const Groups = groupAssessmentRowsByModuleLevel(Rows);
  const [ExpandedModules, SetExpandedModules] = useState<
    Record<string, boolean>
  >({});
  const [ExpandedLevels, SetExpandedLevels] = useState<Record<string, boolean>>(
    {},
  );

  const ToggleModule = (Key: string) => {
    SetExpandedModules((Current) => ({ ...Current, [Key]: !Current[Key] }));
  };

  const ToggleLevel = (Key: string) => {
    SetExpandedLevels((Current) => ({ ...Current, [Key]: !Current[Key] }));
  };

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
                  <p className="math-kicker text-[10px]">Assessment Module</p>
                  <h4 className="truncate text-lg font-black text-slate-950 dark:text-white">
                    {ModuleGroup.ModuleLabel}
                  </h4>
                </div>
              </div>
              <Chip tone="blue">
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
                            ? "Hide Manage Records"
                            : "Show Manage Records"
                        }
                        aria-label={
                          LevelExpanded
                            ? "Hide Manage Records"
                            : "Show Manage Records"
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
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">
                              Level Assessment
                            </p>
                            <h5 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-white">
                              {LevelGroup.LevelLabel}
                            </h5>
                          </div>
                        </div>
                        <Chip tone="blue">
                          {LevelGroup.Rows.length} Attempt
                          {LevelGroup.Rows.length === 1 ? "" : "s"}
                        </Chip>
                      </button>
                      {LevelExpanded ? (
                        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                          <div className="math-admin-assessment-control-table-header math-admin-assessment-manage-header grid w-full min-w-[1120px] grid-cols-[minmax(320px,1.55fr)_minmax(140px,.62fr)_minmax(210px,.82fr)_minmax(130px,.52fr)_minmax(220px,.78fr)] items-center gap-5 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900">
                            <div>Assessment Detail</div>
                            <div>Attempt</div>
                            <div>Status</div>
                            <div>Accuracy</div>
                            <div>Actions</div>
                          </div>
                          <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
                            {LevelGroup.Rows.map((Row, Index) => (
                              <div
                                key={assessmentRowKey(
                                  Row,
                                  `${LevelGroup.LevelKey}-manage-${Index}`,
                                )}
                                className="grid w-full min-w-[1120px] grid-cols-[minmax(320px,1.55fr)_minmax(140px,.62fr)_minmax(210px,.82fr)_minmax(130px,.52fr)_minmax(220px,.78fr)] items-center gap-5 px-5 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                    {assessmentTitle(Row)}
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    {rowLevelCode(Row)}
                                  </p>
                                </div>
                                <div className="flex items-center justify-start">
                                  <Chip tone="blue">
                                    {assessmentAttemptLabel(Row)}
                                  </Chip>
                                </div>
                                <div className="flex items-center justify-start">
                                  <Chip tone={assessmentStatusTone(Row)}>
                                    {assessmentStatusLabel(Row)}
                                  </Chip>
                                </div>
                                <div className="flex items-center justify-start">
                                  {(() => {
                                    const AccuracyValue =
                                      assessmentAccuracy(Row);
                                    return (
                                      <Chip
                                        tone={
                                          AccuracyValue === null
                                            ? "slate"
                                            : AccuracyValue >= 70
                                              ? "green"
                                              : "red"
                                        }
                                      >
                                        {cleanPercent(AccuracyValue)}
                                      </Chip>
                                    );
                                  })()}
                                </div>
                                <div className="flex items-center justify-start gap-2">
                                  <button
                                    className="math-role-action-button h-10 min-w-[92px] px-3 text-xs"
                                    disabled={Busy}
                                    onClick={(Event) => {
                                      Event.stopPropagation();
                                      OnArchive(Row);
                                    }}
                                    title="Record Action: archive only this specific assessment attempt record. Parent-row Archive is for the student-level management record."
                                    aria-label="Record Action: Archive This Assessment Attempt Record"
                                  >
                                    <Archive size={15} className="shrink-0" />
                                    <span>Archive</span>
                                  </button>
                                  <button
                                    className="inline-flex h-10 min-w-[88px] items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-900/45"
                                    disabled={Busy}
                                    onClick={(Event) => {
                                      Event.stopPropagation();
                                      OnDelete(Row);
                                    }}
                                    title="Record Action: permanently delete only this specific assessment attempt record. Parent-row Delete is for the student-level management record."
                                    aria-label="Record Action: Permanently Delete This Assessment Attempt Record"
                                  >
                                    <Trash2 size={15} className="shrink-0" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            ))}
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

type PromotionHistoryStudentGroup = {
  StudentKey: string;
  StudentName: string;
  StudentCode: string;
  Items: AdminStudentLevelPromotion[];
};

function BuildPromotionHistoryStudentGroups(
  Items: AdminStudentLevelPromotion[],
): PromotionHistoryStudentGroup[] {
  const StudentMap = new Map<string, PromotionHistoryStudentGroup>();
  Items.forEach((Item) => {
    const StudentKey = String(
      Item.studentId || Item.studentCode || Item.studentName || "Student",
    );
    if (!StudentMap.has(StudentKey)) {
      StudentMap.set(StudentKey, {
        StudentKey,
        StudentName: String(Item.studentName || "Student"),
        StudentCode: String(Item.studentCode || "—"),
        Items: [],
      });
    }
    StudentMap.get(StudentKey)!.Items.push(Item);
  });

  return Array.from(StudentMap.values())
    .map((Group) => ({
      ...Group,
      Items: [...Group.Items].sort((First, Second) => {
        const FirstTime = First.promotedAt
          ? new Date(First.promotedAt).getTime()
          : 0;
        const SecondTime = Second.promotedAt
          ? new Date(Second.promotedAt).getTime()
          : 0;
        return SecondTime - FirstTime;
      }),
    }))
    .sort((First, Second) =>
      CompareStudentCodes(First.StudentCode, Second.StudentCode),
    );
}

function PromotionHistoryRecordTable({
  Items,
}: {
  Items: AdminStudentLevelPromotion[];
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="math-admin-assessment-control-table-header math-admin-assessment-promotion-history-header grid grid-cols-[.82fr_.82fr_1.18fr_.66fr_.66fr_1fr_.9fr] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <div>From Level</div>
        <div>To Level</div>
        <div>Assessment</div>
        <div>Score</div>
        <div>Percentage</div>
        <div>Promoted Date</div>
        <div>Promoted By</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Items.map((Item) => {
          const Percentage = Number(Item.percentage);
          return (
            <div
              key={Item.promotionId}
              className="grid grid-cols-[.82fr_.82fr_1.18fr_.66fr_.66fr_1fr_.9fr] items-center gap-3 px-4 py-4 transition hover:bg-violet-50/45 dark:hover:bg-slate-900/70"
            >
              <div className="flex min-w-0 items-center">
                <Chip tone="slate">{Item.fromLevelCode || "—"}</Chip>
              </div>
              <div className="flex min-w-0 items-center">
                <Chip tone="purple">{Item.toLevelCode || "—"}</Chip>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                  {Item.assessmentTitle || "Assessment"}
                </p>
              </div>
              <div className="min-w-0">
                <Chip tone="green">
                  {cleanNumber(Item.score)} /{" "}
                  {cleanNumber(Item.maxScore ?? 100)}
                </Chip>
              </div>
              <div className="min-w-0">
                <Chip
                  tone={
                    Number.isFinite(Percentage) && Percentage >= 70
                      ? "green"
                      : "slate"
                  }
                >
                  {Number.isFinite(Percentage)
                    ? `${cleanNumber(Percentage)}%`
                    : "—"}
                </Chip>
              </div>
              <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {Item.promotedAt
                  ? formatMathPathDateTime(Item.promotedAt)
                  : "—"}
              </div>
              <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {Item.promotedByName || "Admin"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromotionHistoryTable({
  Items,
}: {
  Items: AdminStudentLevelPromotion[];
}) {
  const [ExpandedStudents, SetExpandedStudents] = useState<
    Record<string, boolean>
  >({});
  const StudentGroups = BuildPromotionHistoryStudentGroups(Items);

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  return (
    <div className="space-y-4">
      {StudentGroups.map((Group) => {
        const IsExpanded = Boolean(ExpandedStudents[Group.StudentKey]);
        return (
          <div
            key={Group.StudentKey}
            className="math-admin-parent-report-student-group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => ToggleStudent(Group.StudentKey)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-violet-50/45 dark:hover:bg-slate-900/70"
              title={
                IsExpanded ? "Hide Promotion Records" : "Show Promotion Records"
              }
              aria-label={
                IsExpanded ? "Hide Promotion Records" : "Show Promotion Records"
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                  {IsExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {Group.StudentName}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {Group.StudentCode}
                  </p>
                </div>
              </div>
              <Chip tone="purple">
                {Group.Items.length} Promotion
                {Group.Items.length === 1 ? "" : "s"}
              </Chip>
            </button>
            {IsExpanded ? (
              <div className="math-hierarchy-child">
                <PromotionHistoryRecordTable Items={Group.Items} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type ParentReportLevelRecordGroup = {
  LevelKey: string;
  LevelLabel: string;
  Rows: AnyRow[];
};

type ParentReportModuleRecordGroup = {
  ModuleKey: string;
  ModuleLabel: string;
  Levels: ParentReportLevelRecordGroup[];
};

type ParentReportStudentRecordGroup = {
  StudentKey: string;
  StudentName: string;
  StudentCode: string;
  Modules: ParentReportModuleRecordGroup[];
  Count: number;
};

function BuildParentReportStudentGroups(Items: AnyRow[]) {
  const StudentMap = new Map<string, ParentReportStudentRecordGroup>();
  Items.forEach((Item) => {
    const StudentCode = assessmentRecordStudentCode(Item);
    const StudentName = assessmentRecordStudentName(Item);
    const StudentKey = StudentCode || StudentName;
    const ModuleKey = rowModuleCode(Item);
    const ModuleLabel = rowModuleDisplay(Item);
    const LevelKey = rowLevelCode(Item);
    const LevelLabel = rowLevelDisplay(Item);
    let StudentGroup = StudentMap.get(StudentKey);
    if (!StudentGroup) {
      StudentGroup = {
        StudentKey,
        StudentName,
        StudentCode,
        Modules: [],
        Count: 0,
      };
      StudentMap.set(StudentKey, StudentGroup);
    }
    let ModuleGroup = StudentGroup.Modules.find(
      (Group) => Group.ModuleKey === ModuleKey,
    );
    if (!ModuleGroup) {
      ModuleGroup = { ModuleKey, ModuleLabel, Levels: [] };
      StudentGroup.Modules.push(ModuleGroup);
    }
    let LevelGroup = ModuleGroup.Levels.find(
      (Group) => Group.LevelKey === LevelKey,
    );
    if (!LevelGroup) {
      LevelGroup = { LevelKey, LevelLabel, Rows: [] };
      ModuleGroup.Levels.push(LevelGroup);
    }
    LevelGroup.Rows.push(Item);
    StudentGroup.Count += 1;
  });
  return Array.from(StudentMap.values())
    .sort((First, Second) =>
      CompareStudentCodes(First.StudentCode, Second.StudentCode),
    )
    .map((StudentGroup) => ({
      ...StudentGroup,
      Modules: StudentGroup.Modules.sort((First, Second) =>
        First.ModuleLabel.localeCompare(Second.ModuleLabel, undefined, {
          numeric: true,
        }),
      ).map((ModuleGroup) => ({
        ...ModuleGroup,
        Levels: ModuleGroup.Levels.sort((First, Second) =>
          First.LevelKey.localeCompare(Second.LevelKey, undefined, {
            numeric: true,
          }),
        ).map((LevelGroup) => ({
          ...LevelGroup,
          Rows: [...LevelGroup.Rows].sort(
            (First, Second) =>
              assessmentTimestampMs(Second) - assessmentTimestampMs(First),
          ),
        })),
      })),
    }));
}

function parentReportStudentId(Item: AnyRow) {
  return String(
    Item.studentId ||
      Item.targetStudentId ||
      Item.assignedStudentId ||
      Item.assignedToStudentId ||
      Item.userStudentId ||
      "",
  );
}

function parentReportModuleId(Item: AnyRow) {
  return String(
    Item.moduleId || Item.targetModuleId || Item.assessmentModuleId || "",
  );
}

function parentReportLevelId(Item: AnyRow) {
  return String(
    Item.levelId || Item.targetLevelId || Item.assessmentLevelId || "",
  );
}

function parentReportParamsFromAssessmentRow(Item: AnyRow) {
  return {
    studentId: parentReportStudentId(Item),
    moduleId: parentReportModuleId(Item) || undefined,
    levelId: parentReportLevelId(Item) || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
  };
}

function parentReportDownloadFileName(Item: AnyRow) {
  const StudentName = assessmentRecordStudentName(Item) || "Student";
  const LevelCode = rowLevelCode(Item) || "Level";
  const SafeStudent =
    StudentName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") ||
    "Student";
  const SafeLevel =
    LevelCode.replace(/[^a-z0-9-]+/gi, "_").replace(/^_+|_+$/g, "") || "Level";
  return `${SafeStudent}-Progress_Report-${SafeLevel}.pdf`;
}

function normalizedEmail(Value: string) {
  return String(Value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(Value: string) {
  const CleanValue = normalizedEmail(Value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CleanValue);
}

type ParentReportOperationalStatus = {
  Label: "Ready To Send" | "Sent" | "Failed Delivery";
  Tone: "blue" | "green" | "red";
};

function deliveryMatchesReportRow(Item: AnyRow, Log: ParentReportDeliveryLog) {
  const RowStudentId = parentReportStudentId(Item);
  const RowStudentCode = assessmentRecordStudentCode(Item);
  const RowModuleCode = rowModuleCode(Item);
  const RowLevelCode = rowLevelCode(Item);
  const SameStudent =
    (RowStudentId && String(Log.studentId || "") === RowStudentId) ||
    (!!RowStudentCode && String(Log.studentCode || "") === RowStudentCode);
  return (
    SameStudent &&
    String(Log.moduleCode || "") === RowModuleCode &&
    String(Log.levelCode || "") === RowLevelCode
  );
}

function parentReportDeliveryLogsForRow(
  Item: AnyRow,
  DeliveryLogs: ParentReportDeliveryLog[],
) {
  return DeliveryLogs.filter((Log) => deliveryMatchesReportRow(Item, Log));
}

function parentReportOperationalStatus(
  Item: AnyRow,
  DeliveryLogs: ParentReportDeliveryLog[],
): ParentReportOperationalStatus {
  const Logs = parentReportDeliveryLogsForRow(Item, DeliveryLogs);
  if (Logs.some((Log) => String(Log.status || "").toUpperCase() === "SENT")) {
    return { Label: "Sent", Tone: "green" };
  }
  if (Logs.some((Log) => String(Log.status || "").toUpperCase() === "FAILED")) {
    return { Label: "Failed Delivery", Tone: "red" };
  }
  return { Label: "Ready To Send", Tone: "blue" };
}

function triggerBlobDownload(BlobValue: Blob, FileName: string) {
  const Url = window.URL.createObjectURL(BlobValue);
  const Anchor = document.createElement("a");
  Anchor.href = Url;
  Anchor.download = FileName;
  document.body.appendChild(Anchor);
  Anchor.click();
  Anchor.remove();
  window.URL.revokeObjectURL(Url);
}

function ParentReportGenerateTable({
  Items,
  DeliveryLogs,
}: {
  Items: AnyRow[];
  DeliveryLogs: ParentReportDeliveryLog[];
}) {
  const [SearchValue, SetSearchValue] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("");
  const [LevelFilter, SetLevelFilter] = useState("");
  const [ExpandedStudents, SetExpandedStudents] = useState<Set<string>>(
    () => new Set(),
  );
  const [ExpandedModules, SetExpandedModules] = useState<Set<string>>(
    () => new Set(),
  );
  const [SendItem, SetSendItem] = useState<AnyRow | null>(null);
  const [RecipientMode, SetRecipientMode] =
    useState<ParentReportRecipientMode>("FATHER");
  const [CustomEmail, SetCustomEmail] = useState("");
  const QueryClient = useQueryClient();
  const SearchParams = useSearchParams();
  const NotificationTarget = useMemo(
    () => buildParentReportGenerateTarget(SearchParams),
    [SearchParams],
  );

  const ReportStatusByKey = useMemo(() => {
    const MapValue = new Map<string, ParentReportOperationalStatus>();
    Items.forEach((Item) => {
      const Key = String(
        Item.assignmentId ||
          Item.assessmentAssignmentId ||
          Item.attemptId ||
          `${assessmentRecordStudentCode(Item)}-${rowModuleCode(Item)}-${rowLevelCode(Item)}`,
      );
      MapValue.set(Key, parentReportOperationalStatus(Item, DeliveryLogs));
    });
    return MapValue;
  }, [Items, DeliveryLogs]);

  const CustomEmailIsValid =
    RecipientMode !== "CUSTOM" || isValidEmail(CustomEmail);

  const DownloadMutation = useMutation({
    mutationFn: async (Item: AnyRow) => {
      const Params = parentReportParamsFromAssessmentRow(Item);
      if (!Params.studentId)
        throw new Error("Student ID is missing for this report row.");
      return {
        BlobValue: await downloadAdminParentProgressReport(Params),
        FileName: parentReportDownloadFileName(Item),
      };
    },
    onSuccess: ({ BlobValue, FileName }) => {
      triggerBlobDownload(BlobValue, FileName);
    },
    onError: (Error) => {
      window.alert(apiErrorMessage(Error));
    },
  });

  const SendMutation = useMutation({
    mutationFn: async () => {
      if (!SendItem) throw new Error("Please choose a report to send.");
      if (RecipientMode === "CUSTOM" && !isValidEmail(CustomEmail)) {
        throw new Error("Please enter a valid custom recipient email address.");
      }
      const Params = parentReportParamsFromAssessmentRow(SendItem);
      if (!Params.studentId)
        throw new Error("Student ID is missing for this report row.");
      return sendAdminParentProgressReport({
        ...Params,
        recipientMode: RecipientMode,
        customEmail:
          RecipientMode === "CUSTOM" ? CustomEmail.trim() : undefined,
      });
    },
    onSuccess: (Response) => {
      QueryClient.invalidateQueries({
        queryKey: ["admin-parent-report-delivery-logs"],
      });
      SetSendItem(null);
      SetCustomEmail("");
      SetRecipientMode("FATHER");
      const RecipientCount = Response.recipients?.length || 1;
      window.alert(
        Response.message ||
          (RecipientCount > 1
            ? `Parent progress report sent to ${RecipientCount} recipients successfully.`
            : "Parent progress report sent successfully."),
      );
    },
    onError: (Error) => {
      window.alert(apiErrorMessage(Error));
    },
  });

  const ModuleOptions = useMemo(() => uniqueModuleOptions(Items), [Items]);
  const LevelOptions = useMemo(() => {
    const ScopedRows =
      ModuleFilter && ModuleFilter !== "ALL"
        ? Items.filter((Item) => rowModuleCode(Item) === ModuleFilter)
        : Items;
    return uniqueLevelOptions(ScopedRows);
  }, [Items, ModuleFilter]);

  const FilteredItems = useMemo(() => {
    const Query = SearchValue.trim().toLowerCase();
    return Items.filter((Item) => {
      const MatchesModule =
        !ModuleFilter ||
        ModuleFilter === "ALL" ||
        rowModuleCode(Item) === ModuleFilter;
      const MatchesLevel =
        !LevelFilter ||
        LevelFilter === "ALL" ||
        rowLevelCode(Item) === LevelFilter;
      const SearchSource = [
        assessmentRecordStudentName(Item),
        assessmentRecordStudentCode(Item),
        rowModuleDisplay(Item),
        rowLevelDisplay(Item),
        assessmentTitle(Item),
        assessmentStatusLabel(Item),
        assessmentScoreLabel(Item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        MatchesModule &&
        MatchesLevel &&
        (!Query || SearchSource.includes(Query))
      );
    }).sort((First, Second) => {
      const FirstMatches = parentReportRowMatchesTarget(
        First,
        NotificationTarget,
      );
      const SecondMatches = parentReportRowMatchesTarget(
        Second,
        NotificationTarget,
      );
      if (FirstMatches === SecondMatches) return 0;
      return FirstMatches ? -1 : 1;
    });
  }, [Items, SearchValue, ModuleFilter, LevelFilter, NotificationTarget]);

  const StudentGroups = useMemo(
    () => BuildParentReportStudentGroups(FilteredItems),
    [FilteredItems],
  );

  useEffect(() => {
    if (!NotificationTarget.HasTarget) return;
    if (NotificationTarget.Module) SetModuleFilter(NotificationTarget.Module);
    if (NotificationTarget.Level) SetLevelFilter(NotificationTarget.Level);
  }, [NotificationTarget]);

  useEffect(() => {
    if (!NotificationTarget.HasTarget) return;
    const MatchingStudent = StudentGroups.find((StudentGroup) =>
      StudentGroup.Modules.some((ModuleGroup) =>
        ModuleGroup.Levels.some((LevelGroup) =>
          LevelGroup.Rows.some((Item) =>
            parentReportRowMatchesTarget(Item, NotificationTarget),
          ),
        ),
      ),
    );
    if (!MatchingStudent) return;
    SetExpandedStudents((Current) => {
      const Next = new Set(Current);
      Next.add(MatchingStudent.StudentKey);
      return Next;
    });
    SetExpandedModules((Current) => {
      const Next = new Set(Current);
      MatchingStudent.Modules.forEach((ModuleGroup) => {
        const HasMatchingModule = ModuleGroup.Levels.some((LevelGroup) =>
          LevelGroup.Rows.some((Item) =>
            parentReportRowMatchesTarget(Item, NotificationTarget),
          ),
        );
        if (HasMatchingModule) {
          Next.add(`${MatchingStudent.StudentKey}-${ModuleGroup.ModuleKey}`);
        }
      });
      return Next;
    });
  }, [NotificationTarget, StudentGroups]);

  function ToggleStudent(Key: string) {
    SetExpandedStudents((Current) => {
      const Next = new Set(Current);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  function ToggleModule(Key: string) {
    SetExpandedModules((Current) => {
      const Next = new Set(Current);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  return (
    <div className="space-y-4">
      {NotificationTarget.HasTarget ? (
        <NotificationTargetBanner
          tone="teal"
          label="Parent Report"
          title="Parent Report Generated"
          description={`${NotificationTarget.Student || "Student"}${NotificationTarget.Level ? ` · ${NotificationTarget.Level}` : ""} is ready in Generate Reports.`}
          actionLabel="Review Report"
          onAction={() => {
            const TargetElement = document.querySelector(
              "[data-notification-target='parent-report-generate']",
            );
            TargetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      ) : null}

      <div className="math-operation-panel">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="math-input pl-11"
              value={SearchValue}
              onChange={(Event) => SetSearchValue(Event.target.value)}
              placeholder="Search Parent Reports"
            />
          </label>
          <select
            className="math-input"
            value={ModuleFilter}
            onChange={(Event) => {
              SetModuleFilter(Event.target.value);
              SetLevelFilter("");
            }}
            title="Choose Module"
            aria-label="Choose Module"
          >
            <option value="" disabled>
              Choose Module
            </option>
            <option value="ALL">All Modules</option>
            {ModuleOptions.map(([Value, Label]) => (
              <option key={Value} value={Value}>
                {Label}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={LevelFilter}
            onChange={(Event) => SetLevelFilter(Event.target.value)}
            title="Choose Level"
            aria-label="Choose Level"
          >
            <option value="" disabled>
              Choose Level
            </option>
            <option value="ALL">All Levels</option>
            {LevelOptions.map((Value) => (
              <option key={Value} value={Value}>
                {Value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {StudentGroups.length ? (
        <div className="space-y-3">
          {StudentGroups.map((StudentGroup) => {
            const IsStudentExpanded = ExpandedStudents.has(
              StudentGroup.StudentKey,
            );
            const IsTargetStudent = StudentGroup.Modules.some((ModuleGroup) =>
              ModuleGroup.Levels.some((LevelGroup) =>
                LevelGroup.Rows.some((Item) =>
                  parentReportRowMatchesTarget(Item, NotificationTarget),
                ),
              ),
            );
            const LatestActivity = latestActivity(
              StudentGroup.Modules.flatMap((ModuleGroup) =>
                ModuleGroup.Levels.flatMap((LevelGroup) => LevelGroup.Rows),
              ),
            );
            return (
              <div
                key={StudentGroup.StudentKey}
                className={`math-admin-parent-report-student-group overflow-hidden rounded-[28px] border bg-white shadow-sm dark:bg-slate-950 ${IsTargetStudent ? "border-cyan-300 ring-4 ring-cyan-100/70 dark:border-cyan-500/50 dark:ring-cyan-500/15" : "border-slate-200 dark:border-slate-800"}`}
              >
                <button
                  type="button"
                  className="math-admin-parent-report-student-toggle flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-blue-50/45 dark:hover:bg-slate-900/70"
                  onClick={() => ToggleStudent(StudentGroup.StudentKey)}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-700">
                      {IsStudentExpanded ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {StudentGroup.StudentName}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {StudentGroup.StudentCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Chip tone="blue">
                      {StudentGroup.Count} Ready Report
                      {StudentGroup.Count === 1 ? "" : "s"}
                    </Chip>
                    <span className="hidden text-xs font-black uppercase tracking-[0.18em] text-slate-400 md:inline">
                      Last Activity&nbsp;
                      <span className="normal-case tracking-normal text-slate-800 dark:text-slate-200">
                        {LatestActivity}
                      </span>
                    </span>
                  </div>
                </button>

                {IsStudentExpanded ? (
                  <div className="math-hierarchy-child space-y-3">
                    {StudentGroup.Modules.map((ModuleGroup) => {
                      const ModuleExpandKey = `${StudentGroup.StudentKey}-${ModuleGroup.ModuleKey}`;
                      const IsModuleExpanded =
                        ExpandedModules.has(ModuleExpandKey);
                      const ModuleCount = ModuleGroup.Levels.reduce(
                        (Total, LevelGroup) => Total + LevelGroup.Rows.length,
                        0,
                      );
                      return (
                        <div
                          key={ModuleExpandKey}
                          className="math-hierarchy-panel-soft"
                        >
                          <button
                            type="button"
                            className="math-admin-parent-report-module-toggle flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-cyan-50/50 dark:hover:bg-slate-900/80"
                            onClick={() => ToggleModule(ModuleExpandKey)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                                {IsModuleExpanded ? (
                                  <ChevronDown size={17} />
                                ) : (
                                  <ChevronRight size={17} />
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="math-kicker">Module</p>
                                <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                  {ModuleGroup.ModuleLabel}
                                </p>
                              </div>
                            </div>
                            <Chip tone="blue">
                              {ModuleCount} Report{ModuleCount === 1 ? "" : "s"}
                            </Chip>
                          </button>

                          {IsModuleExpanded ? (
                            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                              <div className="math-grid-table-header math-admin-parent-report-grid-header grid grid-cols-[.72fr_1fr_.42fr_.7fr_.54fr_240px] gap-2">
                                <div>Completed Level</div>
                                <div>Assessment</div>
                                <div>Score</div>
                                <div>Assessment Date</div>
                                <div>Report Status</div>
                                <div>Action</div>
                              </div>
                              <div className="divide-y divide-slate-100 overflow-hidden rounded-b-[18px] border border-t-0 border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                                {ModuleGroup.Levels.flatMap((LevelGroup) =>
                                  LevelGroup.Rows.map((Item) => {
                                    const Key = String(
                                      Item.assignmentId ||
                                        Item.assessmentAssignmentId ||
                                        Item.attemptId ||
                                        `${StudentGroup.StudentKey}-${ModuleGroup.ModuleKey}-${LevelGroup.LevelKey}-${assessmentTitle(Item)}`,
                                    );
                                    const IsTargetRow = parentReportRowMatchesTarget(
                                      Item,
                                      NotificationTarget,
                                    );
                                    return (
                                      <div
                                        key={Key}
                                        data-notification-target={
                                          IsTargetRow
                                            ? "parent-report-generate"
                                            : undefined
                                        }
                                        className={`math-grid-table-row math-admin-parent-report-grid-row grid grid-cols-[.72fr_1fr_.42fr_.7fr_.54fr_240px] items-center gap-2 ${IsTargetRow ? "bg-cyan-50/90 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-500/10 dark:ring-cyan-500/25" : ""}`}
                                      >
                                        <div>
                                          <Chip tone="blue">
                                            {LevelGroup.LevelKey}
                                          </Chip>
                                          <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                            {LevelGroup.LevelLabel}
                                          </p>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                            {assessmentTitle(Item)}
                                          </p>
                                          <p className="mt-1 text-xs font-bold text-slate-500">
                                            {assessmentStatusLabel(Item)}
                                          </p>
                                        </div>
                                        <div>
                                          <Chip
                                            tone={assessmentScoreTone(Item)}
                                          >
                                            {assessmentScoreLabel(Item)}
                                          </Chip>
                                        </div>
                                        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                          {assessmentDateTimeLabel(Item, [
                                            "completionDate",
                                            "submittedAt",
                                            "completedAt",
                                            "attemptSubmittedAt",
                                            "updatedAt",
                                          ])}
                                        </div>
                                        <div>
                                          {(() => {
                                            const RowStatusKey = String(
                                              Item.assignmentId ||
                                                Item.assessmentAssignmentId ||
                                                Item.attemptId ||
                                                `${assessmentRecordStudentCode(Item)}-${rowModuleCode(Item)}-${rowLevelCode(Item)}`,
                                            );
                                            const RowStatus =
                                              ReportStatusByKey.get(
                                                RowStatusKey,
                                              ) ||
                                              parentReportOperationalStatus(
                                                Item,
                                                DeliveryLogs,
                                              );
                                            return (
                                              <Chip tone={RowStatus.Tone}>
                                                {RowStatus.Label}
                                              </Chip>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex flex-nowrap justify-end gap-2">
                                          <button
                                            type="button"
                                            className="math-role-action-button math-role-row-action"
                                            onClick={() =>
                                              DownloadMutation.mutate(Item)
                                            }
                                            disabled={
                                              DownloadMutation.isPending
                                            }
                                            title="Download this completed-level parent progress report."
                                          >
                                            {DownloadMutation.isPending
                                              ? "Generating"
                                              : "Generate PDF"}
                                          </button>
                                          <button
                                            type="button"
                                            className="math-action-button-primary math-role-row-primary-action"
                                            onClick={() => {
                                              SetSendItem(Item);
                                              SetRecipientMode("FATHER");
                                              SetCustomEmail("");
                                            }}
                                            disabled={SendMutation.isPending}
                                            title="Send this completed-level parent progress report by email."
                                          >
                                            Send To Parent
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }),
                                )}
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
      ) : (
        <EmptyState message="No parent report records match the selected filters." />
      )}

      {SendItem ? (
        <div className="math-modal-overlay">
          <div className="math-modal-shell math-modal-shell-sm">
            <div className="math-modal-header">
              <p className="math-kicker">Send Parent Report</p>
              <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                Choose Report Recipient
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                A fresh parent progress report PDF will be generated for this
                student, module, and completed level. Choose who should receive
                it.
              </p>
            </div>

            <div className="math-modal-body">
              <div className="math-confirm-summary-grid lg:grid-cols-3">
                {[
                  [
                    "Student",
                    `${assessmentRecordStudentName(SendItem)} (${assessmentRecordStudentCode(SendItem)})`,
                  ],
                  ["Module", rowModuleDisplay(SendItem)],
                  ["Report Level", rowLevelDisplay(SendItem)],
                  ["Assessment", assessmentTitle(SendItem)],
                  ["Score", assessmentScoreLabel(SendItem)],
                ].map(([Label, Value]) => (
                  <div
                    key={Label}
                    className="math-confirm-summary-card"
                  >
                    <p className="math-confirm-label">
                      {Label}
                    </p>
                    <p className="math-confirm-value">
                      {Value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-slate-500">
                  Recipient
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Confirm the recipient before sending. The selected report
                  level above will be attached as a fresh PDF.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["FATHER", "Father Email"],
                      ["MOTHER", "Mother Email"],
                      ["BOTH", "Both Parents"],
                      ["CUSTOM", "Custom Email"],
                    ] as [ParentReportRecipientMode, string][]
                  ).map(([Value, Label]) => (
                    <label
                      key={Value}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${RecipientMode === Value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
                    >
                      <input
                        type="radio"
                        className="h-4 w-4"
                        checked={RecipientMode === Value}
                        onChange={() => SetRecipientMode(Value)}
                      />
                      {Label}
                    </label>
                  ))}
                </div>
                {RecipientMode === "CUSTOM" ? (
                  <input
                    className="math-input mt-3"
                    value={CustomEmail}
                    onChange={(Event) => SetCustomEmail(Event.target.value)}
                    placeholder="Enter Custom Email Address"
                  />
                ) : null}
              </div>
            </div>
            <div className="math-modal-footer">
              <button
                type="button"
                className="math-action-button"
                onClick={() => {
                  SetSendItem(null);
                  SetRecipientMode("FATHER");
                  SetCustomEmail("");
                }}
                disabled={SendMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-action-button-primary"
                onClick={() => SendMutation.mutate()}
                disabled={SendMutation.isPending || !CustomEmailIsValid}
              >
                {SendMutation.isPending ? "Sending Report" : "Send Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParentReportModeButton({
  active,
  icon,
  kicker,
  title,
  text,
  countLabel,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  kicker: string;
  title: string;
  text: string;
  countLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-selected={active}
      data-active={active ? "true" : "false"}
      className={`math-report-scope-tab math-role-tab-card ${active ? "math-report-scope-tab-active math-role-tab-card-active" : "math-report-scope-tab-inactive"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <span className="math-report-scope-tab-icon">{icon}</span>
          <span className="min-w-0">
            <span className="math-report-scope-tab-kicker">{kicker}</span>
            <span className="math-report-scope-tab-title">{title}</span>
            <span className="math-report-scope-tab-text">{text}</span>
          </span>
        </span>
        <span className="math-parent-report-tab-count-chip">{countLabel}</span>
      </div>
    </button>
  );
}

function ParentReportDeliveryStatusChip({ Status }: { Status: string }) {
  const Tone = ParentReportDeliveryStatusTone(Status);
  const Label = String(Status || "-").replace(/_/g, " ");
  return (
    <span className={`math-parent-report-delivery-status-chip math-parent-report-delivery-status-chip-${Tone}`}>
      {Label}
    </span>
  );
}

function ParentReportDeliveryStatusTone(
  Status: string,
): "green" | "red" | "amber" | "slate" {
  const StatusValue = String(Status || "").toUpperCase();
  if (StatusValue === "SENT") return "green";
  if (StatusValue === "FAILED") return "red";
  if (StatusValue === "PENDING") return "amber";
  return "slate";
}

function ParentReportRecipientLabel(Value: string) {
  const CleanValue = String(Value || "")
    .replace(/_/g, " ")
    .toLowerCase();
  if (!CleanValue) return "Parent";
  return CleanValue.replace(/\b\w/g, (Match) => Match.toUpperCase());
}

function ParentReportDeliveryDateLabel(Item: ParentReportDeliveryLog) {
  const Value = Item.sentAt || Item.createdAt;
  return Value ? formatMathPathDateTime(Value) : "—";
}

function ParentReportDeliveryHistoryTable({
  Items,
}: {
  Items: ParentReportDeliveryLog[];
}) {
  const SearchParams = useSearchParams();
  const NotificationTarget = useMemo(() => {
    const ReportDeliveryId = SearchParams.get("reportDeliveryId") || "";
    const HighlightId = SearchParams.get("highlightId") || "";
    return {
      ReportDeliveryId,
      HighlightId,
      StudentCode: SearchParams.get("studentCode") || "",
      ModuleCode: SearchParams.get("moduleCode") || "",
      LevelCode: SearchParams.get("levelCode") || "",
      HasTarget: Boolean(
        ReportDeliveryId ||
        HighlightId ||
        SearchParams.get("targetAction") === "parentReportDeliveryHistory",
      ),
    };
  }, [SearchParams]);
  const [SearchValue, SetSearchValue] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("");
  const [LevelFilter, SetLevelFilter] = useState("");
  const [StatusFilterValue, SetStatusFilterValue] = useState("");
  const [DetailItem, SetDetailItem] = useState<ParentReportDeliveryLog | null>(
    null,
  );
  const [ResendItem, SetResendItem] = useState<ParentReportDeliveryLog | null>(
    null,
  );
  const [DeleteItem, SetDeleteItem] = useState<ParentReportDeliveryLog | null>(
    null,
  );
  const [ResendRecipientMode, SetResendRecipientMode] =
    useState<ParentReportResendRecipientMode>("SAME");
  const [ResendCustomEmail, SetResendCustomEmail] = useState("");
  const QueryClient = useQueryClient();
  const ResendCustomEmailIsValid =
    ResendRecipientMode !== "CUSTOM" || isValidEmail(ResendCustomEmail);
  const ResendMutation = useMutation({
    mutationFn: () => {
      if (!ResendItem)
        throw new Error("Please choose a delivery record to resend.");
      if (
        ResendRecipientMode === "CUSTOM" &&
        !isValidEmail(ResendCustomEmail)
      ) {
        throw new Error("Please enter a valid custom recipient email address.");
      }
      return resendAdminParentReportDelivery(ResendItem.id, {
        recipientMode: ResendRecipientMode,
        customEmail:
          ResendRecipientMode === "CUSTOM"
            ? ResendCustomEmail.trim()
            : undefined,
      });
    },
    onSuccess: (Response) => {
      QueryClient.invalidateQueries({
        queryKey: ["admin-parent-report-delivery-logs"],
      });
      SetResendItem(null);
      SetResendRecipientMode("SAME");
      SetResendCustomEmail("");
      const RecipientCount = Response.recipients?.length || 1;
      window.alert(
        Response.message ||
          (RecipientCount > 1
            ? `Parent progress report resent to ${RecipientCount} recipients successfully.`
            : "Parent progress report resent successfully."),
      );
    },
    onError: (Error) => {
      window.alert(apiErrorMessage(Error));
    },
  });
  const DeleteMutation = useMutation({
    mutationFn: () => {
      if (!DeleteItem)
        throw new Error("Please choose a delivery record to delete.");
      return deleteAdminParentReportDelivery(DeleteItem.id);
    },
    onSuccess: (Response) => {
      QueryClient.invalidateQueries({
        queryKey: ["admin-parent-report-delivery-logs"],
      });
      SetDeleteItem(null);
      window.alert(
        Response.message ||
          "Parent report delivery record deleted successfully.",
      );
    },
    onError: (Error) => {
      window.alert(apiErrorMessage(Error));
    },
  });
  const [ExpandedStudents, SetExpandedStudents] = useState<Set<string>>(
    () => new Set(),
  );
  const [ExpandedModules, SetExpandedModules] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!NotificationTarget.HasTarget || !Items.length) return;
    const Match = Items.find((Item) => {
      const DeliveryMatch =
        NotificationTarget.ReportDeliveryId &&
        Item.id === NotificationTarget.ReportDeliveryId;
      const HighlightMatch =
        NotificationTarget.HighlightId &&
        Item.id === NotificationTarget.HighlightId;
      const ContextMatch =
        NotificationTarget.StudentCode &&
        Item.studentCode === NotificationTarget.StudentCode &&
        (!NotificationTarget.ModuleCode ||
          Item.moduleCode === NotificationTarget.ModuleCode) &&
        (!NotificationTarget.LevelCode ||
          Item.levelCode === NotificationTarget.LevelCode);
      return DeliveryMatch || HighlightMatch || ContextMatch;
    });
    if (!Match) return;
    if (Match.moduleCode && Match.moduleCode !== "-")
      SetModuleFilter(Match.moduleCode);
    if (Match.levelCode && Match.levelCode !== "-")
      SetLevelFilter(Match.levelCode);
    const StudentKey =
      Match.studentCode || Match.studentName || String(Match.id);
    const ModuleKey = Match.moduleCode || Match.moduleName || "MODULE";
    SetExpandedStudents((Current) => {
      const Next = new Set(Current);
      Next.add(StudentKey);
      return Next;
    });
    SetExpandedModules((Current) => {
      const Next = new Set(Current);
      Next.add(`${StudentKey}-${ModuleKey}`);
      return Next;
    });
  }, [Items, NotificationTarget]);

  const ModuleOptions = useMemo(() => {
    const MapValue = new Map<string, string>();
    Items.forEach((Item) => {
      if (Item.moduleCode && Item.moduleCode !== "-") {
        MapValue.set(
          Item.moduleCode,
          Item.moduleLabel || Item.moduleName || Item.moduleCode,
        );
      }
    });
    return Array.from(MapValue.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [Items]);

  const LevelOptions = useMemo(() => {
    const Rows =
      ModuleFilter && ModuleFilter !== "ALL"
        ? Items.filter((Item) => Item.moduleCode === ModuleFilter)
        : Items;
    const MapValue = new Map<string, string>();
    Rows.forEach((Item) => {
      if (Item.levelCode && Item.levelCode !== "-") {
        MapValue.set(Item.levelCode, Item.levelLabel || Item.levelCode);
      }
    });
    return Array.from(MapValue.entries()).sort((First, Second) =>
      First[0].localeCompare(Second[0], undefined, { numeric: true }),
    );
  }, [Items, ModuleFilter]);

  const FilteredItems = useMemo(() => {
    const Query = SearchValue.trim().toLowerCase();
    return Items.filter((Item) => {
      const MatchesModule =
        !ModuleFilter ||
        ModuleFilter === "ALL" ||
        Item.moduleCode === ModuleFilter;
      const MatchesLevel =
        !LevelFilter || LevelFilter === "ALL" || Item.levelCode === LevelFilter;
      const MatchesStatus =
        !StatusFilterValue ||
        StatusFilterValue === "ALL" ||
        String(Item.status || "").toUpperCase() === StatusFilterValue;
      const SearchSource = [
        Item.studentName,
        Item.studentCode,
        Item.moduleCode,
        Item.moduleName,
        Item.levelCode,
        Item.levelName,
        Item.recipientEmail,
        Item.recipientType,
        Item.status,
        Item.fileName,
        Item.sentBy,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        MatchesModule &&
        MatchesLevel &&
        MatchesStatus &&
        (!Query || SearchSource.includes(Query))
      );
    });
  }, [Items, SearchValue, ModuleFilter, LevelFilter, StatusFilterValue]);

  const SentCount = FilteredItems.filter(
    (Item) => String(Item.status).toUpperCase() === "SENT",
  ).length;
  const FailedCount = FilteredItems.filter(
    (Item) => String(Item.status).toUpperCase() === "FAILED",
  ).length;

  const StudentGroups = useMemo(() => {
    const StudentMap = new Map<
      string,
      {
        StudentKey: string;
        StudentName: string;
        StudentCode: string;
        Modules: Map<
          string,
          {
            ModuleKey: string;
            ModuleLabel: string;
            ModuleCode: string;
            Rows: ParentReportDeliveryLog[];
          }
        >;
      }
    >();

    FilteredItems.forEach((Item) => {
      const StudentKey =
        Item.studentCode || Item.studentName || String(Item.id);
      if (!StudentMap.has(StudentKey)) {
        StudentMap.set(StudentKey, {
          StudentKey,
          StudentName: Item.studentName || "Student",
          StudentCode: Item.studentCode || "-",
          Modules: new Map(),
        });
      }
      const StudentGroup = StudentMap.get(StudentKey)!;
      const ModuleKey = Item.moduleCode || Item.moduleName || "MODULE";
      if (!StudentGroup.Modules.has(ModuleKey)) {
        StudentGroup.Modules.set(ModuleKey, {
          ModuleKey,
          ModuleCode: Item.moduleCode || "-",
          ModuleLabel:
            Item.moduleLabel ||
            Item.moduleName ||
            Item.moduleCode ||
            "Learning Module",
          Rows: [],
        });
      }
      StudentGroup.Modules.get(ModuleKey)!.Rows.push(Item);
    });

    return Array.from(StudentMap.values())
      .sort((First, Second) => {
        const CodeOrder = CompareStudentCodes(
          First.StudentCode,
          Second.StudentCode,
        );
        if (CodeOrder !== 0) return CodeOrder;
        return First.StudentName.localeCompare(Second.StudentName, undefined, {
          numeric: true,
        });
      })
      .map((StudentGroup) => ({
        ...StudentGroup,
        Modules: Array.from(StudentGroup.Modules.values())
          .sort((First, Second) =>
            First.ModuleLabel.localeCompare(Second.ModuleLabel, undefined, {
              numeric: true,
            }),
          )
          .map((ModuleGroup) => ({
            ...ModuleGroup,
            Rows: [...ModuleGroup.Rows].sort((First, Second) => {
              const LevelOrder = String(First.levelCode || "").localeCompare(
                String(Second.levelCode || ""),
                undefined,
                { numeric: true },
              );
              if (LevelOrder !== 0) return LevelOrder;
              return String(
                Second.sentAt || Second.createdAt || "",
              ).localeCompare(String(First.sentAt || First.createdAt || ""));
            }),
          })),
      }));
  }, [FilteredItems]);

  function ToggleStudent(Key: string) {
    SetExpandedStudents((Current) => {
      const Next = new Set(Current);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  function ToggleModule(Key: string) {
    SetExpandedModules((Current) => {
      const Next = new Set(Current);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  function DeliveryMetricCard({
    label,
    value,
    icon,
    tone,
  }: {
    label: string;
    value: string | number;
    icon: ReactNode;
    tone: "blue" | "green" | "red";
  }) {
    const ToneClasses =
      tone === "green"
        ? "border-emerald-100 ring-emerald-50 shadow-[0_12px_28px_rgba(16,185,129,0.10)]"
        : tone === "red"
          ? "border-rose-100 ring-rose-50 shadow-[0_12px_28px_rgba(239,68,68,0.10)]"
          : "border-blue-100 ring-blue-50 shadow-[0_12px_28px_rgba(37,99,235,0.10)]";
    const IconClasses =
      tone === "green"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : tone === "red"
          ? "bg-rose-50 text-rose-700 ring-rose-100"
          : "bg-blue-50 text-blue-700 ring-blue-100";
    return (
      <div
        className={`rounded-[22px] border bg-white p-4 ring-1 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800 ${ToneClasses}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 ${IconClasses}`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">
              {label}
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {value}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="math-operation-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-kicker">Delivery History</p>
            <h3 className="text-2xl font-black text-slate-950 dark:text-white">
              Parent Report Delivery Audit
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Review sent and failed parent report emails with recipient, level,
              timestamp, and admin audit details.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-[540px]">
            <DeliveryMetricCard
              label="Total Deliveries"
              value={FilteredItems.length}
              icon={<Mail size={15} />}
              tone="blue"
            />
            <DeliveryMetricCard
              label="Reports Sent"
              value={SentCount}
              icon={<CheckCircle2 size={15} />}
              tone="green"
            />
            <DeliveryMetricCard
              label="Failed Delivery"
              value={FailedCount}
              icon={<AlertTriangle size={15} />}
              tone="red"
            />
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_220px_220px]">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="math-input pl-11"
              value={SearchValue}
              onChange={(Event) => SetSearchValue(Event.target.value)}
              placeholder="Search Delivery History"
            />
          </label>
          <select
            className="math-input"
            value={ModuleFilter}
            onChange={(Event) => {
              SetModuleFilter(Event.target.value);
              SetLevelFilter("");
            }}
            title="Choose Module"
            aria-label="Choose Module"
          >
            <option value="" disabled>
              Choose Module
            </option>
            <option value="ALL">All Modules</option>
            {ModuleOptions.map(([Value, Label]) => (
              <option key={Value} value={Value}>
                {Label}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={LevelFilter}
            onChange={(Event) => SetLevelFilter(Event.target.value)}
            title="Choose Level"
            aria-label="Choose Level"
          >
            <option value="" disabled>
              Choose Level
            </option>
            <option value="ALL">All Levels</option>
            {LevelOptions.map(([Value, Label]) => (
              <option key={Value} value={Value}>
                {Label}
              </option>
            ))}
          </select>
          <select
            className="math-input"
            value={StatusFilterValue}
            onChange={(Event) => SetStatusFilterValue(Event.target.value)}
            title="Choose Delivery Status"
            aria-label="Choose Delivery Status"
          >
            <option value="" disabled>
              Choose Delivery Status
            </option>
            <option value="ALL">All Delivery Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
      </div>

      {NotificationTarget.HasTarget ? (
        <NotificationTargetBanner
          tone="teal"
          label="Parent Report"
          title="Parent Report Delivery"
          description={`${NotificationTarget.StudentCode || "Student"}${NotificationTarget.LevelCode ? ` · ${NotificationTarget.LevelCode}` : ""} delivery record is highlighted.`}
          actionLabel="View Delivery"
          onAction={() => {
            const TargetElement = document.querySelector(
              "[data-notification-target='parent-report-delivery']",
            );
            TargetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      ) : null}

      {StudentGroups.length ? (
        <div className="space-y-3">
          {StudentGroups.map((StudentGroup) => {
            const IsStudentExpanded = ExpandedStudents.has(
              StudentGroup.StudentKey,
            );
            const StudentRows = StudentGroup.Modules.flatMap(
              (ModuleGroup) => ModuleGroup.Rows,
            );
            const LatestDelivery =
              StudentRows.map((Item) =>
                ParentReportDeliveryDateLabel(Item),
              ).filter((Value) => Value && Value !== "—")[0] || "—";
            return (
              <div
                key={StudentGroup.StudentKey}
                className="math-admin-parent-report-student-group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <button
                  type="button"
                  className="math-admin-parent-report-student-toggle flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-blue-50/45 dark:hover:bg-slate-900/70"
                  onClick={() => ToggleStudent(StudentGroup.StudentKey)}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-700">
                      {IsStudentExpanded ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {StudentGroup.StudentName}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {StudentGroup.StudentCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Chip tone="purple">
                      {StudentRows.length} Deliver
                      {StudentRows.length === 1 ? "y" : "ies"}
                    </Chip>
                    <span className="hidden text-xs font-black uppercase tracking-[0.18em] text-slate-400 md:inline">
                      Latest Delivery&nbsp;
                      <span className="normal-case tracking-normal text-slate-800 dark:text-slate-200">
                        {LatestDelivery}
                      </span>
                    </span>
                  </div>
                </button>

                {IsStudentExpanded ? (
                  <div className="math-hierarchy-child space-y-3">
                    {StudentGroup.Modules.map((ModuleGroup) => {
                      const ModuleExpandKey = `${StudentGroup.StudentKey}-${ModuleGroup.ModuleKey}`;
                      const IsModuleExpanded =
                        ExpandedModules.has(ModuleExpandKey);
                      return (
                        <div
                          key={ModuleExpandKey}
                          className="math-hierarchy-panel-soft"
                        >
                          <button
                            type="button"
                            className="math-admin-parent-report-module-toggle flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-cyan-50/50 dark:hover:bg-slate-900/80"
                            onClick={() => ToggleModule(ModuleExpandKey)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                                {IsModuleExpanded ? (
                                  <ChevronDown size={17} />
                                ) : (
                                  <ChevronRight size={17} />
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="math-kicker">Module</p>
                                <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                  {ModuleGroup.ModuleLabel}
                                </p>
                              </div>
                            </div>
                            <Chip tone="blue">
                              {ModuleGroup.Rows.length} Deliver
                              {ModuleGroup.Rows.length === 1 ? "y" : "ies"}
                            </Chip>
                          </button>

                          {IsModuleExpanded ? (
                            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                              <div
                                className="math-grid-table-header math-admin-parent-report-grid-header grid gap-2"
                                style={{
                                  gridTemplateColumns:
                                    "0.48fr 0.52fr minmax(220px, 1fr) 0.38fr 0.56fr 0.46fr 280px",
                                }}
                              >
                                <div>Report Level</div>
                                <div>Recipient Type</div>
                                <div>Recipient Email</div>
                                <div>Status</div>
                                <div>Sent At</div>
                                <div>Sent By</div>
                                <div>Action</div>
                              </div>
                              <div className="divide-y divide-slate-100 overflow-hidden rounded-b-[18px] border border-t-0 border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                                {ModuleGroup.Rows.map((Item) => {
                                  const IsHighlighted =
                                    (NotificationTarget.ReportDeliveryId &&
                                      Item.id ===
                                        NotificationTarget.ReportDeliveryId) ||
                                    (NotificationTarget.HighlightId &&
                                      Item.id ===
                                        NotificationTarget.HighlightId);
                                  return (
                                    <div
                                      key={Item.id}
                                      data-notification-target={
                                        IsHighlighted
                                          ? "parent-report-delivery"
                                          : undefined
                                      }
                                      className={`math-grid-table-row math-admin-parent-report-grid-row grid items-center gap-2 ${IsHighlighted ? "bg-teal-50 ring-2 ring-teal-300 ring-inset dark:bg-teal-950/30 dark:ring-teal-500/50" : ""}`}
                                      style={{
                                        gridTemplateColumns:
                                          "0.48fr 0.52fr minmax(220px, 1fr) 0.38fr 0.56fr 0.46fr 280px",
                                      }}
                                    >
                                      <div>
                                        <Chip tone="blue">
                                          {Item.levelCode}
                                        </Chip>
                                        <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                          {Item.levelName ||
                                            Item.levelLabel ||
                                            "Report Level"}
                                        </p>
                                      </div>
                                      <div>
                                        <Chip tone="purple">
                                          {ParentReportRecipientLabel(
                                            Item.recipientType,
                                          )}
                                        </Chip>
                                      </div>
                                      <div className="truncate text-sm font-bold text-slate-600 dark:text-slate-300">
                                        {Item.recipientEmail}
                                      </div>
                                      <div>
                                        <ParentReportDeliveryStatusChip
                                          Status={Item.status}
                                        />
                                      </div>
                                      <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                        {ParentReportDeliveryDateLabel(Item)}
                                      </div>
                                      <div className="truncate text-sm font-bold text-slate-600 dark:text-slate-300">
                                        {Item.sentBy || "MathPath Admin"}
                                      </div>
                                      <div className="math-row-action-group justify-start pr-1 overflow-visible">
                                        <button
                                          type="button"
                                          className="math-role-action-button math-role-row-action"
                                          onClick={() => SetDetailItem(Item)}
                                        >
                                          View Details
                                        </button>
                                        <button
                                          type="button"
                                          className="math-action-button-primary math-role-row-primary-action"
                                          onClick={() => {
                                            SetResendItem(Item);
                                            SetResendRecipientMode("SAME");
                                            SetResendCustomEmail("");
                                          }}
                                          disabled={ResendMutation.isPending}
                                        >
                                          Resend
                                        </button>
                                        <button
                                          type="button"
                                          aria-label="Delete Delivery Record"
                                          title="Delete Delivery Record"
                                          className="math-icon-action-button h-9 w-9 min-h-9 min-w-9 shrink-0 overflow-visible rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
                                          onClick={() => SetDeleteItem(Item)}
                                          disabled={DeleteMutation.isPending}
                                        >
                                          <XCircle size={16} />
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
      ) : (
        <EmptyState message="No parent report delivery records match the selected filters." />
      )}

      {DetailItem ? (
        <div className="math-modal-overlay">
          <div className="math-modal-shell math-modal-shell-lg">
            <div className="flex items-start justify-between gap-4 math-modal-header">
              <div>
                <p className="math-kicker">Delivery Details</p>
                <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                  Parent Report Email Audit
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Review the student, report, recipient, and delivery status for
                  this parent progress report.
                </p>
              </div>
              <button
                type="button"
                className="math-action-button math-modal-close-button math-delivery-audit-close-button !text-blue-700 hover:!text-white active:!text-white focus-visible:!text-white"
                onClick={() => SetDetailItem(null)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(100vh-18rem)] math-modal-body">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                    Student Details
                  </p>
                  <div className="mt-4 math-confirm-summary-grid">
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Student
                      </p>
                      <p className="mt-1 break-words text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.studentName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Student Code
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.studentCode}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">
                    Report Details
                  </p>
                  <div className="mt-4 math-confirm-summary-grid">
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Module
                      </p>
                      <p className="mt-1 break-words text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.moduleLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Report Level
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.levelLabel}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        File Name
                      </p>
                      <p className="mt-1 break-words text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.fileName || "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-600">
                    Recipient Details
                  </p>
                  <div className="mt-4 math-confirm-summary-grid">
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Recipient Type
                      </p>
                      <div className="mt-1">
                        <Chip tone="purple">
                          {ParentReportRecipientLabel(DetailItem.recipientType)}
                        </Chip>
                      </div>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Recipient Email
                      </p>
                      <p className="mt-1 break-words text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.recipientEmail}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                    Delivery Status
                  </p>
                  <div className="mt-4 math-confirm-summary-grid">
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Status
                      </p>
                      <div className="mt-1">
                        <Chip
                          tone={ParentReportDeliveryStatusTone(
                            DetailItem.status,
                          )}
                        >
                          {String(DetailItem.status || "-").replace(/_/g, " ")}
                        </Chip>
                      </div>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Sent At
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
                        {ParentReportDeliveryDateLabel(DetailItem)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">
                        Sent By
                      </p>
                      <p className="mt-1 break-words text-sm font-black text-slate-950 dark:text-white">
                        {DetailItem.sentBy || "MathPath Admin"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 rounded-[24px] border p-4 ${DetailItem.errorMessage ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
              >
                <p className="text-xs font-black uppercase tracking-[0.18em]">
                  Failure Reason
                </p>
                <p className="mt-2 text-sm font-bold leading-6">
                  {DetailItem.errorMessage || "—"}
                </p>
              </div>
            </div>

            <div className="math-modal-footer">
              <button
                type="button"
                className="math-action-button math-modal-close-button math-delivery-audit-close-button !text-blue-700 hover:!text-white active:!text-white focus-visible:!text-white"
                onClick={() => SetDetailItem(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="math-action-button-primary"
                onClick={() => {
                  SetResendItem(DetailItem);
                  SetResendRecipientMode("SAME");
                  SetResendCustomEmail("");
                  SetDetailItem(null);
                }}
                disabled={ResendMutation.isPending}
              >
                Resend Report
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {DeleteItem ? (
        <div className="math-modal-overlay">
          <div className="math-modal-shell math-modal-shell-sm">
            <div className="flex items-start gap-4 math-modal-header">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/70">
                <XCircle size={22} />
              </span>
              <div>
                <p className="math-kicker text-rose-600">
                  Delete Delivery Record
                </p>
                <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                  Delete Parent Report Delivery Record?
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  This will permanently delete this parent report delivery
                  history record. It will not delete the student's assessment
                  result, progress report data, or promotion history.
                </p>
              </div>
            </div>

            <div className="math-modal-body">
              <div className="math-confirm-summary-grid">
                {[
                  [
                    "Student",
                    `${DeleteItem.studentName} (${DeleteItem.studentCode})`,
                  ],
                  ["Report Level", DeleteItem.levelLabel],
                  [
                    "Recipient",
                    `${ParentReportRecipientLabel(DeleteItem.recipientType)} - ${DeleteItem.recipientEmail}`,
                  ],
                  [
                    "Status",
                    String(DeleteItem.status || "-").replace(/_/g, " "),
                  ],
                ].map(([Label, Value]) => (
                  <div
                    key={Label}
                    className="math-confirm-summary-card"
                  >
                    <p className="math-confirm-label">
                      {Label}
                    </p>
                    <p className="math-confirm-value">
                      {Value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="math-modal-footer">
              <button
                type="button"
                className="math-action-button"
                onClick={() => SetDeleteItem(null)}
                disabled={DeleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-action-button-danger"
                onClick={() => DeleteMutation.mutate()}
                disabled={DeleteMutation.isPending}
              >
                {DeleteMutation.isPending ? "Deleting Record" : "Delete Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ResendItem ? (
        <div className="math-modal-overlay">
          <div className="math-modal-shell math-modal-shell-sm">
            <div className="math-modal-header">
              <p className="math-kicker">Resend Parent Report</p>
              <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                Confirm Report Resend
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                A fresh parent progress report PDF will be generated for the
                same student, module, and level. Choose the recipient for this
                resend.
              </p>
            </div>
            <div className="math-modal-body">
              <div className="math-confirm-summary-grid lg:grid-cols-3">
                {[
                  [
                    "Student",
                    `${ResendItem.studentName} (${ResendItem.studentCode})`,
                  ],
                  ["Module", ResendItem.moduleLabel],
                  ["Report Level", ResendItem.levelLabel],
                  [
                    "Original Recipient",
                    `${ParentReportRecipientLabel(ResendItem.recipientType)} - ${ResendItem.recipientEmail}`,
                  ],
                  [
                    "Original Status",
                    String(ResendItem.status || "-").replace(/_/g, " "),
                  ],
                ].map(([Label, Value]) => (
                  <div
                    key={Label}
                    className="math-confirm-summary-card"
                  >
                    <p className="math-confirm-label">
                      {Label}
                    </p>
                    <p className="math-confirm-value">
                      {Value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-slate-500">
                  Resend Recipient
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Choose Same Recipient for a direct retry, or select another
                  parent/custom email when the report needs to be redirected.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["SAME", "Same Recipient"],
                      ["FATHER", "Father Email"],
                      ["MOTHER", "Mother Email"],
                      ["BOTH", "Both Parents"],
                      ["CUSTOM", "Custom Email"],
                    ] as [ParentReportResendRecipientMode, string][]
                  ).map(([Value, Label]) => (
                    <label
                      key={Value}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${ResendRecipientMode === Value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
                    >
                      <input
                        type="radio"
                        className="h-4 w-4"
                        checked={ResendRecipientMode === Value}
                        onChange={() => SetResendRecipientMode(Value)}
                      />
                      {Label}
                    </label>
                  ))}
                </div>
                {ResendRecipientMode === "CUSTOM" ? (
                  <input
                    className="math-input mt-3"
                    value={ResendCustomEmail}
                    onChange={(Event) =>
                      SetResendCustomEmail(Event.target.value)
                    }
                    placeholder="Enter Custom Email Address"
                  />
                ) : null}
              </div>
            </div>
            <div className="math-modal-footer">
              <button
                type="button"
                className="math-action-button"
                onClick={() => {
                  SetResendItem(null);
                  SetResendRecipientMode("SAME");
                  SetResendCustomEmail("");
                }}
                disabled={ResendMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-action-button-primary"
                onClick={() => ResendMutation.mutate()}
                disabled={ResendMutation.isPending || !ResendCustomEmailIsValid}
              >
                {ResendMutation.isPending
                  ? "Resending Report"
                  : "Resend Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ApprovalStudentGroup = {
  StudentKey: string;
  StudentName: string;
  StudentCode: string;
  Items: AdminAssessmentReattemptApproval[];
};

function approvalStudentKey(Item: AdminAssessmentReattemptApproval) {
  return String(Item.studentCode || Item.studentName || (Item as any).studentId || "Student");
}

function approvalCompletionTime(Item: AdminAssessmentReattemptApproval) {
  const Time = new Date(String(Item.completionDate || (Item as any).submittedAt || (Item as any).createdAt || "")).getTime();
  return Number.isFinite(Time) ? Time : 0;
}

function buildApprovalStudentGroups(Items: AdminAssessmentReattemptApproval[]) {
  const GroupMap = new Map<string, ApprovalStudentGroup>();
  Items.forEach((Item) => {
    const StudentKey = approvalStudentKey(Item);
    if (!GroupMap.has(StudentKey)) {
      GroupMap.set(StudentKey, {
        StudentKey,
        StudentName: String(Item.studentName || "Student"),
        StudentCode: String(Item.studentCode || "—"),
        Items: [],
      });
    }
    GroupMap.get(StudentKey)!.Items.push(Item);
  });
  return Array.from(GroupMap.values())
    .map((Group) => ({
      ...Group,
      Items: Group.Items.sort((First, Second) => approvalCompletionTime(Second) - approvalCompletionTime(First)),
    }))
    .sort((First, Second) => CompareStudentCodes(First.StudentCode, Second.StudentCode));
}

function approvalGroupSummary(Group: ApprovalStudentGroup) {
  const Pending = Group.Items.filter((Item) => Item.status === "PENDING").length;
  const Approved = Group.Items.filter((Item) => Item.status === "APPROVED").length;
  const Rejected = Group.Items.filter((Item) => Item.status === "REJECTED").length;
  return { Pending, Approved, Rejected };
}

function ApprovalQueueTable({
  Items,
  OnDecision,
}: {
  Items: AdminAssessmentReattemptApproval[];
  OnDecision: (
    Mode: DecisionMode,
    Item: AdminAssessmentReattemptApproval,
  ) => void;
}) {
  const [ExpandedStudents, SetExpandedStudents] = useState<Record<string, boolean>>({});
  const Groups = useMemo(() => buildApprovalStudentGroups(Items), [Items]);

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  return (
    <div className="grid gap-3">
      {Groups.map((Group) => {
        const IsExpanded = Boolean(ExpandedStudents[Group.StudentKey]);
        const Summary = approvalGroupSummary(Group);
        const LatestCompletion = Group.Items[0]?.completionDate
          ? formatMathPathDateTime(Group.Items[0].completionDate)
          : "—";
        return (
          <div
            key={Group.StudentKey}
            className="math-admin-parent-report-student-group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => ToggleStudent(Group.StudentKey)}
              onKeyDown={(Event) => {
                if (Event.key === "Enter" || Event.key === " ") ToggleStudent(Group.StudentKey);
              }}
              className="math-hierarchy-row flex-col gap-4 transition hover:bg-[color:var(--mp-role-softer)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="math-hierarchy-icon h-10 w-10"
                  onClick={(Event) => {
                    Event.stopPropagation();
                    ToggleStudent(Group.StudentKey);
                  }}
                  title={IsExpanded ? "Hide Re-Attempt Requests" : "Show Re-Attempt Requests"}
                  aria-label={IsExpanded ? "Hide Re-Attempt Requests" : "Show Re-Attempt Requests"}
                >
                  {IsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <div className="min-w-0 text-left">
                  <p className="truncate text-base font-black text-slate-950 dark:text-white">{Group.StudentName}</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">{Group.StudentCode}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Chip tone="slate">{Group.Items.length} Request{Group.Items.length === 1 ? "" : "s"}</Chip>
                {Summary.Pending ? <Chip tone="amber">{Summary.Pending} Pending</Chip> : null}
                {Summary.Approved ? <Chip tone="green">{Summary.Approved} Approved</Chip> : null}
                {Summary.Rejected ? <Chip tone="red">{Summary.Rejected} Rejected</Chip> : null}
                <span className="ml-0 text-xs font-black uppercase tracking-[0.14em] text-slate-400 sm:ml-2">Last Request</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{LatestCompletion}</span>
              </div>
            </div>
            {IsExpanded ? (
              <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                <div className="min-w-[1180px]">
                  <div className="math-admin-assessment-control-table-header math-admin-assessment-reattempt-approvals-header grid grid-cols-[.68fr_.58fr_1fr_.56fr_.62fr_.82fr_.78fr_232px] gap-2 bg-slate-50 px-4 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/70">
                    <div>Teacher</div>
                    <div>Level</div>
                    <div>Failed Assessment</div>
                    <div>Attempt</div>
                    <div>Score</div>
                    <div>Completion Date</div>
                    <div>Status</div>
                    <div>Action</div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Group.Items.map((Item) => (
                      <div
                        key={Item.approvalId}
                        className="grid grid-cols-[.68fr_.58fr_1fr_.56fr_.62fr_.82fr_.78fr_232px] items-center gap-2 px-4 py-4 transition hover:bg-[color:var(--mp-role-softer)] dark:hover:bg-slate-900/70"
                      >
                        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {Item.teacherName || "-"}
                        </div>
                        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {Item.moduleCode || "Module"} · {Item.levelCode || "Level"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                            {Item.failedAssessmentTitle || Item.assessmentTitle}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            Different Version Required For Re-Attempt
                          </p>
                        </div>
                        <div>
                          <Chip tone="blue">
                            {Item.attemptType === "RE_ATTEMPT"
                              ? `Re-Attempt ${Item.attemptNumber || Item.nextAttemptNumber || 1}`
                              : "Original"}
                          </Chip>
                        </div>
                        <div>
                          <Chip tone={(Item.percentage ?? 0) >= 70 ? "green" : "red"}>
                            {cleanNumber(Item.score)} / {cleanNumber(Item.maxScore ?? 100)}
                          </Chip>
                        </div>
                        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {formatMathPathDateTime(Item.completionDate)}
                        </div>
                        <div>
                          <Chip tone={approvalStatusTone(Item.status, Item.usedAt)}>
                            {Item.statusLabel}
                          </Chip>
                        </div>
                        <div className="flex min-w-0 items-center justify-start gap-2">
                          {Item.canApprove ? (
                            <button
                              className="math-button-primary shrink-0 px-3 py-2 text-xs"
                              onClick={() => OnDecision("APPROVE", Item)}
                            >
                              <ShieldCheck size={14} /> Approve
                            </button>
                          ) : null}
                          {Item.canReject ? (
                            <button
                              className="math-button-danger shrink-0 px-3 py-2 text-xs"
                              onClick={() => OnDecision("REJECT", Item)}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          ) : null}
                          {!Item.canApprove && !Item.canReject ? (
                            <Chip
                              tone={
                                Item.status === "REJECTED"
                                  ? "red"
                                  : Item.status === "APPROVED"
                                    ? "green"
                                    : "slate"
                              }
                            >
                              {Item.status === "REJECTED"
                                ? "Rejected"
                                : Item.status === "APPROVED"
                                  ? "Approved"
                                  : "Closed"}
                            </Chip>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function assessmentRecordStudentName(Item: AnyRow) {
  return String(
    Item.studentName ||
      Item.targetStudentName ||
      Item.assignedToLabel ||
      "Student",
  );
}

function assessmentRecordStudentCode(Item: AnyRow) {
  return String(
    Item.studentCode ||
      Item.targetStudentCode ||
      Item.assignedToId ||
      "Student Code",
  );
}

type AssessmentLevelGroup = {
  ModuleKey: string;
  ModuleLabel: string;
  LevelKey: string;
  LevelLabel: string;
  Rows: AnyRow[];
};

type AssessmentModuleGroup = {
  ModuleKey: string;
  ModuleLabel: string;
  Levels: AssessmentLevelGroup[];
};

function rowModuleDisplay(Row: AnyRow) {
  const ModuleCode = rowModuleCode(Row);
  const ModuleName = String(
    Row.moduleName || Row.moduleTitle || Row.module || "",
  ).trim();
  return ModuleName && ModuleName !== ModuleCode
    ? `${ModuleName} · ${ModuleCode}`
    : ModuleCode;
}

function rowLevelDisplay(Row: AnyRow) {
  const LevelCode = rowLevelCode(Row);
  const LevelName = String(
    Row.levelName || Row.levelTitle || Row.level || "",
  ).trim();
  return LevelName && LevelName !== LevelCode
    ? `${LevelCode} · ${LevelName}`
    : LevelCode;
}

function sortedAssessmentRows(Rows: AnyRow[]) {
  return [...Rows].sort(
    (First, Second) =>
      assessmentTimestampMs(First) - assessmentTimestampMs(Second),
  );
}

function groupAssessmentRowsByModuleLevel(
  Rows: AnyRow[],
): AssessmentModuleGroup[] {
  const ModuleMap = new Map<string, AssessmentModuleGroup>();
  Rows.forEach((Row) => {
    const ModuleKey = rowModuleCode(Row);
    const LevelKey = rowLevelCode(Row);
    if (!ModuleMap.has(ModuleKey)) {
      ModuleMap.set(ModuleKey, {
        ModuleKey,
        ModuleLabel: rowModuleDisplay(Row),
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
        ModuleLabel: rowModuleDisplay(Row),
        LevelKey,
        LevelLabel: rowLevelDisplay(Row),
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
        First.LevelKey.localeCompare(Second.LevelKey, undefined, {
          numeric: true,
        }),
      ).map((LevelGroup) => ({
        ...LevelGroup,
        Rows: sortedAssessmentRows(LevelGroup.Rows),
      })),
    }));
}

function assessmentActionTarget(Rows: AnyRow[], PreferPromotion = false) {
  const SortedRows = [...Rows].sort(
    (First, Second) =>
      assessmentTimestampMs(Second) - assessmentTimestampMs(First),
  );
  if (PreferPromotion) {
    const PromotionRow = SortedRows.find((Row) => canPromoteAssessment(Row));
    if (PromotionRow) return PromotionRow;
  }
  return SortedRows[0] || Rows[0] || null;
}

function assessmentRowKey(Row: AnyRow, Prefix: string) {
  return String(
    Row.assignmentId ||
      Row.assessmentAssignmentId ||
      Row.attemptId ||
      Row.assessmentAttemptId ||
      Row.id ||
      Prefix,
  );
}

function AssessmentManageTable({
  Items,
  Busy,
  OnPromote,
  OnArchive,
  OnDelete,
}: {
  Items: AnyRow[];
  Busy: boolean;
  OnPromote: (Item: AnyRow) => void;
  OnArchive: (Item: AnyRow) => void;
  OnDelete: (Item: AnyRow) => void;
}) {
  const [ExpandedStudents, SetExpandedStudents] = useState<
    Record<string, boolean>
  >({});
  const Students = useMemo(() => buildStudents(Items), [Items]);

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  return (
    <div className="grid gap-3">
      {Students.map((Student) => {
        const IsExpanded = Boolean(ExpandedStudents[Student.key]);
        const ActionTarget = assessmentActionTarget(Student.rows);
        const PromotionTarget = assessmentActionTarget(Student.rows, true);
        const IsArchived = Boolean(
          ActionTarget &&
          (ActionTarget.isActive === false ||
            String(ActionTarget.status || "").toUpperCase() === "ARCHIVED"),
        );
        return (
          <div
            key={Student.key}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/90"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => ToggleStudent(Student.key)}
              onKeyDown={(Event) => {
                if (Event.key === "Enter" || Event.key === " ")
                  ToggleStudent(Student.key);
              }}
              className="flex cursor-pointer flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200 transition hover:bg-violet-50 hover:text-violet-700"
                  onClick={(Event) => {
                    Event.stopPropagation();
                    ToggleStudent(Student.key);
                  }}
                  title={
                    IsExpanded
                      ? "Hide Assessment Details"
                      : "Show Assessment Details"
                  }
                  aria-label={
                    IsExpanded
                      ? "Hide Assessment Details"
                      : "Show Assessment Details"
                  }
                >
                  {IsExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-950 dark:text-white">
                    {Student.studentName}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {Student.studentCode}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                {!IsArchived &&
                PromotionTarget &&
                promotionCanProceed(PromotionTarget) ? (
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-100 hover:text-violet-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-200 dark:hover:bg-violet-900/45"
                    disabled={Busy}
                    onClick={(Event) => {
                      Event.stopPropagation();
                      OnPromote(PromotionTarget);
                    }}
                    title="Promote this student for the latest eligible cleared level. Record actions inside the expanded hierarchy only archive or delete one specific assessment record."
                    aria-label="Parent Action: Promote Student For Eligible Level"
                  >
                    <Sparkles size={16} className="shrink-0" />
                    <span>Promote</span>
                  </button>
                ) : null}
                {!IsArchived && ActionTarget ? (
                  <button
                    className="math-role-action-button h-11 px-4 text-sm"
                    disabled={Busy}
                    onClick={(Event) => {
                      Event.stopPropagation();
                      OnArchive(ActionTarget);
                    }}
                    title="Parent Action: archive the student assessment management record from this parent row. Record actions inside the expanded hierarchy archive only one specific assessment record."
                    aria-label="Parent Action: Archive Student Assessment Record"
                  >
                    <Archive size={16} className="shrink-0" />
                    <span>Archive</span>
                  </button>
                ) : null}
                {ActionTarget ? (
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-900/45"
                    disabled={Busy}
                    onClick={(Event) => {
                      Event.stopPropagation();
                      OnDelete(ActionTarget);
                    }}
                    title="Parent Action: permanently delete the student assessment management record from this parent row. Record actions inside the expanded hierarchy delete only one specific assessment record."
                    aria-label="Parent Action: Permanently Delete Student Assessment Record"
                  >
                    <Trash2 size={16} className="shrink-0" />
                    <span>Delete</span>
                  </button>
                ) : null}
              </div>
            </div>
            {IsExpanded ? (
              <div className="math-hierarchy-child">
                <AssessmentManageHierarchy
                  Rows={Student.rows}
                  Busy={Busy}
                  OnArchive={OnArchive}
                  OnDelete={OnDelete}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PromoteAssessmentDialog({
  Item,
  Busy,
  Error,
  OnCancel,
  OnConfirm,
}: {
  Item: AnyRow;
  Busy: boolean;
  Error: string | null;
  OnCancel: () => void;
  OnConfirm: (
    TargetLevelId?: string | null,
    TargetLevelCode?: string | null,
  ) => void;
}) {
  const FromLevel = String(
    Item.fromLevelCode || Item.levelCode || "Current Level",
  );
  const ToLevel = promotionTargetLevelLabel(Item);
  const CanProceed = promotionCanProceed(Item);
  const BlockReason = promotionBlockReason(Item);
  const TargetOptions = promotionTargetLevelOptions(Item);
  const DefaultTarget = TargetOptions[0] || null;
  const [SelectedTargetLevelId, SetSelectedTargetLevelId] = useState<string>(
    DefaultTarget?.LevelId || DefaultTarget?.LevelCode || "",
  );
  const SelectedTarget =
    TargetOptions.find(
      (Option) =>
        (Option.LevelId || Option.LevelCode) === SelectedTargetLevelId,
    ) || DefaultTarget;
  const Accuracy = assessmentAccuracy(Item);
  const SummaryRows = [
    ["Assessment", assessmentTitle(Item)],
    ["Score", assessmentScoreLabel(Item)],
    ["Percentage", Accuracy === null ? "—" : `${cleanNumber(Accuracy)}%`],
    ["Status", assessmentStatusLabel(Item)],
  ];

  return (
    <div className="math-modal-overlay">
      <div className="w-full max-w-xl rounded-[32px] border border-violet-100 bg-white p-6 shadow-2xl dark:border-violet-900/60 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <Sparkles size={22} />
          </div>
          <div>
            <p className="math-kicker text-[10px] text-violet-700 dark:text-violet-300">
              Level Promotion
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Promote Student To Next Level?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              This will move{" "}
              <span className="font-black text-slate-950 dark:text-white">
                {assessmentRecordStudentName(Item)}
              </span>{" "}
              from{" "}
              <span className="font-black text-slate-950 dark:text-white">
                {FromLevel}
              </span>{" "}
              to{" "}
              <span className="font-black text-slate-950 dark:text-white">
                {ToLevel}
              </span>
              . The assessment result and promotion history will be preserved.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-violet-100 bg-violet-50/80 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
          <p className="math-kicker text-[10px] text-violet-700 dark:text-violet-300">
            Assessment Summary
          </p>
          <div className="mt-3 grid gap-2">
            {SummaryRows.map(([Label, Value]) => (
              <div
                key={Label}
                className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-white/70 px-3 py-2 text-sm dark:bg-slate-950/40"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {Label}
                </span>
                <span className="font-black text-slate-950 dark:text-white">
                  {Value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <label
            className="math-kicker text-[10px] text-slate-500 dark:text-slate-400"
            htmlFor="promotion-target-level"
          >
            Promote To
          </label>
          <select
            id="promotion-target-level"
            value={SelectedTargetLevelId}
            onChange={(Event) => SetSelectedTargetLevelId(Event.target.value)}
            disabled={!CanProceed || Busy || TargetOptions.length <= 1}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-violet-400 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          >
            {TargetOptions.length ? (
              TargetOptions.map((Option) => (
                <option
                  key={Option.LevelId || Option.LevelCode}
                  value={Option.LevelId || Option.LevelCode}
                >
                  {Option.Label}
                </option>
              ))
            ) : (
              <option value="">Next Level Setup Required</option>
            )}
          </select>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">
            Admin confirms the valid next level before promotion. Invalid or
            skipped levels remain blocked by backend validation.
          </p>
        </div>
        {!CanProceed ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200">
            <span className="font-black">Next Level Setup Required:</span>{" "}
            {BlockReason}
          </div>
        ) : null}
        {Error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {Error}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="math-button-secondary"
            onClick={OnCancel}
            disabled={Busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="math-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() =>
              OnConfirm(
                SelectedTarget?.LevelId || null,
                SelectedTarget?.LevelCode || null,
              )
            }
            disabled={Busy || !CanProceed || !SelectedTarget}
            title={!CanProceed ? BlockReason : "Promote Student"}
          >
            <Sparkles size={17} />{" "}
            {CanProceed ? "Promote Student" : "Next Level Required"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteAssessmentDialog({
  Item,
  Busy,
  Error,
  OnCancel,
  OnConfirm,
}: {
  Item: AnyRow;
  Busy: boolean;
  Error: string | null;
  OnCancel: () => void;
  OnConfirm: () => void;
}) {
  return (
    <div className="math-modal-overlay">
      <div className="w-full max-w-xl rounded-[32px] border border-red-100 bg-white p-6 shadow-2xl dark:border-red-900/60 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-red-50 p-3 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="math-kicker text-[10px] text-red-600 dark:text-red-300">
              Permanent Deletion
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Delete this assessment permanently?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              This will permanently delete{" "}
              <span className="font-black text-slate-950 dark:text-white">
                {assessmentTitle(Item)}
              </span>{" "}
              for{" "}
              <span className="font-black text-slate-950 dark:text-white">
                {assessmentRecordStudentName(Item)}
              </span>{" "}
              and all related attempt, result, answer, and re-attempt approval
              records. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-[22px] border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Archive keeps a backup. Delete is final and removes the assessment
          history permanently.
        </div>
        {Error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {Error}
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="math-button-secondary"
            onClick={OnCancel}
            disabled={Busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="math-button-danger"
            onClick={OnConfirm}
            disabled={Busy}
          >
            <Trash2 size={17} /> Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
