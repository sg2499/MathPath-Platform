import type { NotificationRecord } from "@/lib/api/notifications";
import { getStoredUser } from "@/lib/auth";
import {
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  FileText,
  GraduationCap,
  MailCheck,
  MessageSquareText,
  Repeat,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
  Wallet,
  Trophy,
} from "lucide-react";

// 2026-10-13: the notification look and routing rules, shared by the bell
// and the full Notifications page (moved here unchanged from
// NotificationsBell.tsx).
export type NotificationTone =
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "indigo"
  | "teal"
  | "red"
  | "gray"
  | "feedbackExcellent"
  | "feedbackMastery"
  | "feedbackGuidance"
  | "feedbackPractice"
  | "feedbackRevision";

export function NormalizeTone(Notification: NotificationRecord): NotificationTone {
  const Color = String(Notification.colorVariant || "").toUpperCase();
  const Category = String(Notification.category || "").toUpperCase();

  if (Color === "FEEDBACK_EXCELLENT") return "feedbackExcellent";
  if (Color === "FEEDBACK_MASTERY") return "feedbackMastery";
  if (Color === "FEEDBACK_PRACTICE") return "feedbackPractice";
  if (Color === "FEEDBACK_REVISION") return "feedbackRevision";
  if (Color === "FEEDBACK_GUIDANCE" || Category === "ASSESSMENT_FEEDBACK") return "feedbackGuidance";
  if (Color === "RED" || Category === "FAILURE") return "red";
  if (Color === "GREEN" || Category === "RESULT") return "green";
  if (Color === "AMBER" || Category === "REATTEMPT") return "amber";
  if (Color === "PURPLE" || Category === "ASSESSMENT") return "purple";
  if (Color === "INDIGO" || Category === "PROMOTION") return "indigo";
  if (Color === "TEAL" || Category === "PARENT_REPORT") return "teal";
  if (Color === "BLUE" || Category === "PRACTICE") return "blue";
  if (Category === "COMPETITION_MOCK") return "indigo";
  if (Category === "ANNUAL_COMPETITION_PRACTICE") return "teal";
  if (Category === "ANNUAL_COMPETITION_OFFICIAL") return "indigo";
  return "gray";
}

export function ToneClasses(Tone: NotificationTone, IsRead: boolean) {
  const Base = IsRead ? "opacity-75" : "shadow-md hover:shadow-xl";
  const Classes: Record<NotificationTone, string> = {
    blue: "border-blue-200/80 bg-gradient-to-br from-white to-blue-50/80 text-blue-950 hover:border-blue-300 hover:from-blue-50 hover:to-blue-100/80 dark:border-blue-500/30 dark:from-slate-900 dark:to-blue-900/20 dark:text-blue-50",
    purple: "border-violet-200/80 bg-gradient-to-br from-white to-violet-50/80 text-violet-950 hover:border-violet-300 hover:from-violet-50 hover:to-violet-100/80 dark:border-violet-500/30 dark:from-slate-900 dark:to-violet-900/20 dark:text-violet-50",
    green: "border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/80 text-emerald-950 hover:border-emerald-300 hover:from-emerald-50 hover:to-emerald-100/80 dark:border-emerald-500/30 dark:from-slate-900 dark:to-emerald-900/20 dark:text-emerald-50",
    amber: "border-amber-200/80 bg-gradient-to-br from-white to-amber-50/80 text-amber-950 hover:border-amber-300 hover:from-amber-50 hover:to-amber-100/80 dark:border-amber-500/30 dark:from-slate-900 dark:to-amber-900/20 dark:text-amber-50",
    indigo: "border-indigo-200/80 bg-gradient-to-br from-white to-indigo-50/80 text-indigo-950 hover:border-indigo-300 hover:from-indigo-50 hover:to-indigo-100/80 dark:border-indigo-500/30 dark:from-slate-900 dark:to-indigo-900/20 dark:text-indigo-50",
    teal: "border-teal-200/80 bg-gradient-to-br from-white to-teal-50/80 text-teal-950 hover:border-teal-300 hover:from-teal-50 hover:to-teal-100/80 dark:border-teal-500/30 dark:from-slate-900 dark:to-teal-900/20 dark:text-teal-50",
    red: "border-rose-200/80 bg-gradient-to-br from-white to-rose-50/80 text-rose-950 hover:border-rose-300 hover:from-rose-50 hover:to-rose-100/80 dark:border-rose-500/30 dark:from-slate-900 dark:to-rose-900/20 dark:text-rose-50",
    gray: "border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 text-slate-950 hover:border-slate-300 hover:from-slate-50 hover:to-slate-100/80 dark:border-slate-700/50 dark:from-slate-900 dark:to-slate-800/50 dark:text-slate-50",
    feedbackExcellent: "border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-emerald-950 hover:border-emerald-400 dark:border-emerald-500/40 dark:from-emerald-900/30 dark:via-slate-900 dark:to-amber-900/20 dark:text-emerald-50",
    feedbackMastery: "border-cyan-300/80 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 text-cyan-950 hover:border-cyan-400 dark:border-cyan-500/40 dark:from-cyan-900/30 dark:via-slate-900 dark:to-emerald-900/20 dark:text-cyan-50",
    feedbackGuidance: "border-fuchsia-300/80 bg-gradient-to-br from-fuchsia-50 via-white to-slate-50 text-fuchsia-950 hover:border-fuchsia-400 dark:border-fuchsia-500/40 dark:from-fuchsia-900/30 dark:via-slate-900 dark:to-slate-800/50 dark:text-fuchsia-50",
    feedbackPractice: "border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-950 hover:border-amber-400 dark:border-amber-500/40 dark:from-amber-900/30 dark:via-slate-900 dark:to-orange-900/20 dark:text-amber-50",
    feedbackRevision: "border-orange-300/80 bg-gradient-to-br from-orange-50 via-white to-rose-50 text-orange-950 hover:border-orange-400 dark:border-orange-500/40 dark:from-orange-900/30 dark:via-slate-900 dark:to-rose-900/20 dark:text-orange-50",
  };
  return `${Base} ${Classes[Tone]}`;
}

export function IconFor(Notification: NotificationRecord) {
  const Category = String(Notification.category || "").toUpperCase();
  const Type = String(Notification.type || "").toUpperCase();

  if (Category === "ASSESSMENT_FEEDBACK") return <MessageSquareText size={16} />;
  // 2026-10-09 (Payments Phase 5): invoices raised, payments received, an
  // online payment that did not go through.
  if (Category === "FEES") return Type.includes("FAILED") ? <TriangleAlert size={16} /> : <Wallet size={16} />;
  if (Category === "FAILURE") return <TriangleAlert size={16} />;
  if (Category === "LEADERBOARD") return <Trophy size={16} />;
  if (Category === "RESULT") return <CheckCircle2 size={16} />;
  if (Category === "REATTEMPT" || Type.includes("REATTEMPT"))
    return <RotateCcw size={16} />;
  if (Category === "PROMOTION" || Type.includes("PROMOTION"))
    return <GraduationCap size={16} />;
  if (Category === "PARENT_REPORT" || Type.includes("REPORT"))
    return <FileText size={16} />;
  if (Category === "ASSESSMENT" || Type.includes("ASSESSMENT"))
    return <ClipboardList size={16} />;
  if (Category === "PRACTICE" || Type.includes("DPS"))
    return <ClipboardPlus size={16} />;
  if (Category === "COMPETITION_MOCK")
    return <Target size={16} />;
  if (Category === "ANNUAL_COMPETITION_PRACTICE")
    return <Repeat size={16} />;
  if (Category === "ANNUAL_COMPETITION_OFFICIAL")
    return <Trophy size={16} />;
  return <Sparkles size={16} />;
}

function NotificationText(Notification: NotificationRecord) {
  return {
    Category: String(Notification.category || "").toUpperCase(),
    Type: String(Notification.type || "").toUpperCase(),
    Title: String(Notification.title || "").toUpperCase(),
    Route: String(Notification.targetRoute || "").toLowerCase(),
  };
}

function IsPromotionNotification(Notification: NotificationRecord) {
  const { Category, Type, Title } = NotificationText(Notification);

  // Important: do not classify a notification as promotion only because an
  // older stored route points to promotion-history. Some legacy assessment
  // notifications were saved with that wrong route. Purpose/type/category must
  // win over stored route so teacher assessment notifications go to Assessment
  // Tracker and not Promotion History.
  return (
    Category === "PROMOTION" ||
    Type.includes("PROMOTION") ||
    Type.includes("PROMOTED") ||
    Title.includes("PROMOTED")
  );
}

function IsParentReportNotification(Notification: NotificationRecord) {
  const { Category, Type, Title, Route } = NotificationText(Notification);
  return (
    Category === "PARENT_REPORT" ||
    Type.includes("PARENT_REPORT") ||
    Type.includes("REPORT") ||
    Title.includes("PARENT REPORT") ||
    Route.includes("parent-reports")
  );
}


function IsParentReportGeneratedNotification(Notification: NotificationRecord) {
  const { Type, Title } = NotificationText(Notification);
  const Event = String(Notification.metadata?.event || "").toUpperCase();

  // Generated means the report is available/prepared in Generate Reports.
  // It must never be treated as a delivery-history event just because an
  // older stored route or targetAction points to delivery history.
  const Source = [Type, Title, Event].join(" ");
  return (
    Source.includes("PARENT_REPORT_GENERATED") ||
    Source.includes("PARENT REPORT GENERATED") ||
    (Source.includes("REPORT") && Source.includes("GENERATED"))
  );
}

function IsParentReportDeliveryNotification(Notification: NotificationRecord) {
  const { Type, Title } = NotificationText(Notification);
  const Event = String(Notification.metadata?.event || "").toUpperCase();
  const TargetAction = String(Notification.metadata?.targetAction || "").toUpperCase();
  const Source = [Type, Title, Event, TargetAction].join(" ");

  if (IsParentReportGeneratedNotification(Notification)) return false;

  return (
    Source.includes("PARENT_REPORT_SENT") ||
    Source.includes("PARENT_REPORT_RESENT") ||
    Source.includes("PARENT_REPORT_FAILED") ||
    Source.includes("PARENT_REPORT_DELETED") ||
    Source.includes("PARENT_REPORT_DELIVERY") ||
    Source.includes("PARENT REPORT SENT") ||
    Source.includes("PARENT REPORT RESENT") ||
    Source.includes("PARENT REPORT FAILED") ||
    Source.includes("PARENT REPORT DELIVERY") ||
    Source.includes("DELIVERY FAILED") ||
    Source.includes("DELIVERY RECORD DELETED") ||
    TargetAction.includes("PARENTREPORTDELIVERYHISTORY")
  );
}

function IsLeaderboardRankNotification(Notification: NotificationRecord) {
  // Leaderboard rank-change / podium-placement notifications (DPS + Mock,
  // student rank-change and teacher podium-only, 2026-09-01). Category is
  // the sole signal here -- their `type` values deliberately contain "DPS"
  // or "MOCK" (e.g. STUDENT_DPS_LEADERBOARD_RANK), which would otherwise
  // false-positive-match IsPracticeNotification/IsMockNotification below on
  // substring alone. This check is placed FIRST in each role block in
  // BuildRoleAwareRoute() specifically to win before those broader checks
  // ever run.
  return NotificationText(Notification).Category === "LEADERBOARD";
}

function IsPracticeNotification(Notification: NotificationRecord) {
  const { Category, Type, Title, Route } = NotificationText(Notification);
  return (
    Category === "PRACTICE" ||
    Type.includes("DPS") ||
    Type.includes("PRACTICE") ||
    Title.includes("DPS") ||
    Title.includes("PRACTICE") ||
    Route.includes("assignment-tracker") ||
    Route.includes("/admin/assignments") ||
    Route.includes("/student/practice") ||
    Route.includes("/student/result/")
  );
}

function IsAssessmentFeedbackNotification(Notification: NotificationRecord) {
  const { Category, Type } = NotificationText(Notification);
  return Category === "ASSESSMENT_FEEDBACK" || Type.includes("FEEDBACK");
}

function IsCompetitionMockNotification(Notification: NotificationRecord) {
  return NotificationText(Notification).Category === "COMPETITION_MOCK";
}

// 2026-09-15 (Shailesh): Annual Competition practice-paper assignment/
// submission notifications -- a distinct category from both DPS ("PRACTICE")
// and Competition Mock ("COMPETITION_MOCK"), checked first in every role
// block below (same technique already used for IsLeaderboardRankNotification/
// IsCompetitionMockNotification) so it wins ahead of IsPracticeNotification's
// broader `Type.includes("PRACTICE")` / `Route.includes("/student/practice")`
// checks, which would otherwise false-positive-match these notifications'
// own ANNUAL_PRACTICE_* type strings.
function IsAnnualCompetitionPracticeNotification(Notification: NotificationRecord) {
  return NotificationText(Notification).Category === "ANNUAL_COMPETITION_PRACTICE";
}

// 2026-10-07 (Shailesh): "your official Annual Competition paper is assigned"
// (and "your level has changed"). Category is the sole signal, and it is
// checked FIRST in the student block below, so none of the broader
// title/type matchers (its title contains "ASSIGNED") can send it anywhere
// but the Official tab of the student's Annual Competition page.
function IsAnnualCompetitionOfficialNotification(Notification: NotificationRecord) {
  return NotificationText(Notification).Category === "ANNUAL_COMPETITION_OFFICIAL";
}

function IsMockNotification(Notification: NotificationRecord) {
  const { Category, Type, Title, Route } = NotificationText(Notification);
  return (
    Category === "COMPETITION_MOCK" ||
    Type.includes("MOCK") ||
    Title.includes("MOCK") ||
    Route.includes("mock-result") ||
    Route.includes("mock-attempt")
  );
}



function IsAssessmentNotification(Notification: NotificationRecord) {
  const { Category, Type, Title, Route } = NotificationText(Notification);

  if (
    IsPromotionNotification(Notification) ||
    IsPracticeNotification(Notification) ||
    IsParentReportNotification(Notification) ||
    IsMockNotification(Notification)
  )
    return false;

  return (
    Category === "ASSESSMENT" ||
    Category === "RESULT" ||
    Category === "REATTEMPT" ||
    Type.includes("ASSESSMENT") ||
    Type.includes("REATTEMPT") ||
    Title.includes("ASSESSMENT") ||
    Title.includes("RE-ATTEMPT") ||
    Route.includes("/teacher/assessments") ||
    Route.includes("/admin/assessments") ||
    Route.includes("/student/assessments") ||
    Route.includes("/student/assessment-result/")
  );
}

function IsTeacherReattemptApprovalNotification(
  Notification: NotificationRecord,
) {
  const { Type, Title } = NotificationText(Notification);
  return (
    Type.includes("ASSESSMENT_REATTEMPT_APPROVED") ||
    Title.includes("RE-ATTEMPT APPROVED")
  );
}

function NormalizeUserRole(User: ReturnType<typeof getStoredUser>) {
  const RawRole = String(
    (User as { role?: string; activeRole?: string; userRole?: string } | null)
      ?.activeRole ||
      (User as { role?: string; activeRole?: string; userRole?: string } | null)
        ?.role ||
      (User as { role?: string; activeRole?: string; userRole?: string } | null)
        ?.userRole ||
      "",
  );
  return RawRole.toLowerCase();
}

function MetadataString(Notification: NotificationRecord, Key: string) {
  const Metadata = Notification.metadata || {};
  const SnakeKey = Key.replace(/[A-Z]/g, (Letter) => `_${Letter.toLowerCase()}`);
  const PascalKey = Key.charAt(0).toUpperCase() + Key.slice(1);
  const DirectRecord = Notification as unknown as Record<string, unknown>;
  const Value =
    Metadata[Key] ??
    Metadata[SnakeKey] ??
    Metadata[PascalKey] ??
    DirectRecord[Key] ??
    DirectRecord[SnakeKey];
  return Value === undefined || Value === null ? "" : String(Value);
}

function NotificationIdentityParam(
  Notification: NotificationRecord,
  Key: string,
  DirectValue?: string | null,
) {
  const Value = DirectValue || MetadataString(Notification, Key);
  return Value ? String(Value) : "";
}

function AppendDeepLinkParams(
  BaseRoute: string,
  Notification: NotificationRecord,
  ExistingParams?: Record<string, string>,
) {
  const Params = new URLSearchParams();

  Object.entries(ExistingParams || {}).forEach(([Key, Value]) => {
    if (Value) Params.set(Key, Value);
  });

  const StudentCode = NotificationIdentityParam(Notification, "studentCode");
  const StudentId = NotificationIdentityParam(Notification, "studentId", Notification.studentId);
  const ModuleCode = NotificationIdentityParam(Notification, "moduleCode");
  const LevelCode = NotificationIdentityParam(Notification, "levelCode");
  const LessonId = NotificationIdentityParam(
    Notification,
    "lessonId",
    Notification.lessonId,
  );
  const DpsId = NotificationIdentityParam(
    Notification,
    "dpsId",
    Notification.dpsId,
  );
  const AssignmentId = NotificationIdentityParam(Notification, "assignmentId");
  const AssignmentCount = NotificationIdentityParam(Notification, "assignmentCount");
  const DpsCount = NotificationIdentityParam(Notification, "dpsCount");
  const IsGrouped = NotificationIdentityParam(Notification, "isGrouped");
  const ReportDeliveryId = NotificationIdentityParam(
    Notification,
    "reportDeliveryId",
    Notification.reportDeliveryId,
  );
  const AttemptId = NotificationIdentityParam(
    Notification,
    "attemptId",
    Notification.attemptId,
  );
  const HighlightId =
    NotificationIdentityParam(Notification, "highlightId") ||
    ReportDeliveryId ||
    AttemptId ||
    AssignmentId ||
    DpsId;
  const TargetAction = IsParentReportGeneratedNotification(Notification)
    ? "parentReportGenerateReports"
    : IsParentReportDeliveryNotification(Notification)
      ? "parentReportDeliveryHistory"
      : NotificationIdentityParam(Notification, "targetAction");

  if (StudentCode) Params.set("studentCode", StudentCode);
  if (StudentId) Params.set("studentId", StudentId);
  if (ModuleCode) Params.set("moduleCode", ModuleCode);
  if (LevelCode) Params.set("levelCode", LevelCode);
  if (LessonId) Params.set("lessonId", LessonId);
  if (DpsId) Params.set("dpsId", DpsId);
  if (AssignmentId) Params.set("assignmentId", AssignmentId);
  if (AssignmentCount) Params.set("assignmentCount", AssignmentCount);
  if (DpsCount) Params.set("dpsCount", DpsCount);
  if (IsGrouped) Params.set("isGrouped", IsGrouped);
  if (ReportDeliveryId) Params.set("reportDeliveryId", ReportDeliveryId);
  if (AttemptId) Params.set("attemptId", AttemptId);
  if (HighlightId) Params.set("highlightId", HighlightId);
  if (TargetAction) Params.set("targetAction", TargetAction);

  const Query = Params.toString();
  return Query
    ? `${BaseRoute}${BaseRoute.includes("?") ? "&" : "?"}${Query}`
    : BaseRoute;
}

function BuildRoleAwareRoute(Notification: NotificationRecord, Role: string) {
  if (Role === "teacher") {
    if (IsLeaderboardRankNotification(Notification)) {
      // Podium-only teacher notification (2026-09-01) -- target_route is
      // always fully built server-side (the exact teacher leaderboard page,
      // scope, and highlightStudentId), so it's used directly rather than
      // reconstructed here. Checked first, ahead of IsPracticeNotification/
      // IsMockNotification, since the stored `type` contains "DPS"/"MOCK".
      return { Route: Notification.targetRoute || "/teacher/dashboard", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAnnualCompetitionPracticeNotification(Notification)) {
      // Both assignment and submission land the teacher on the same Practice
      // tab -- studentCode (appended automatically below via
      // AppendDeepLinkParams) is what the page uses to auto-expand that
      // student's row.
      return { Route: "/teacher/competition/annual", TargetTab: "PRACTICE", TargetSubTab: "" };
    }
    if (IsParentReportNotification(Notification)) {
      // Progress Reports (frontend/app/teacher/progress-reports/page.tsx) is
      // the single dedicated place teachers review/download published parent
      // reports -- route there regardless of any older stored route (a
      // notification created before that tab existed may still have
      // targetRoute pointing at the student detail page).
      return { Route: "/teacher/progress-reports", TargetTab: "", TargetSubTab: "" };
    }
    if (IsCompetitionMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      if (AttemptId) {
        return { Route: `/teacher/competition/mock-result/${encodeURIComponent(AttemptId)}?viewer=TEACHER`, TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/teacher/competition/mock-tracker", TargetTab: "", TargetSubTab: "" };
    }
    if (IsPracticeNotification(Notification)) {
      const StudentCode = MetadataString(Notification, "studentCode");
      const Route = StudentCode
        ? `/teacher/assignment-tracker/student/${encodeURIComponent(StudentCode)}`
        : "/teacher/assignment-tracker";
      return { Route, TargetTab: "", TargetSubTab: "" };
    }
    if (IsPromotionNotification(Notification))
      return {
        Route: "/teacher/promotion-history",
        TargetTab: "",
        TargetSubTab: "",
      };
    if (IsTeacherReattemptApprovalNotification(Notification))
      return {
        Route: "/teacher/assign-assessment",
        TargetTab: "",
        TargetSubTab: "",
      };
    if (IsAssessmentFeedbackNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      return { Route: AttemptId ? `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=TEACHER&feedback=1` : "/teacher/assessments", TargetTab: "", TargetSubTab: "" };
    }
    if (IsMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      const { Type, Title } = NotificationText(Notification);
      if (Type.includes("SUBMITTED") || Title.includes("SUBMITTED")) {
        return { Route: AttemptId ? `/teacher/competition/mock-result/${encodeURIComponent(AttemptId)}` : "/teacher/competition/mock-tracker", TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/teacher/competition/mock-tracker", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAssessmentNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      const TargetAction = MetadataString(Notification, "targetAction").toLowerCase();
      const StoredRoute = Notification.targetRoute || "";
      if (TargetAction === "provide-feedback" && AttemptId) {
        return {
          Route: `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=TEACHER&feedback=1`,
          TargetTab: "",
          TargetSubTab: "",
        };
      }
      if (StoredRoute.startsWith("/assessment-result/") && AttemptId) {
        return { Route: StoredRoute, TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/teacher/assessments", TargetTab: "", TargetSubTab: "" };
    }
  }

  if (Role === "admin" || Role === "super_admin") {
    if (IsAnnualCompetitionPracticeNotification(Notification)) {
      // "the admin should see the pending papers in their login under the
      // practice results tab" -- despite its name, the RESULTS sub-tab is
      // the per-student roster of every practice paper (pending + submitted),
      // which is exactly where an assignment or a submission should land.
      return { Route: "/admin/competition/annual-studio", TargetTab: "PRACTICE", TargetSubTab: "RESULTS" };
    }
    if (IsCompetitionMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      if (AttemptId) {
        return { Route: `/admin/competition/mock-result/${encodeURIComponent(AttemptId)}?viewer=ADMIN`, TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/admin/competition/mock-assignments", TargetTab: "", TargetSubTab: "" };
    }
    if (IsPracticeNotification(Notification)) {
      const StudentCode = MetadataString(Notification, "studentCode");
      const Route = StudentCode
        ? `/admin/assignments/student/${encodeURIComponent(StudentCode)}`
        : "/admin/assignments";
      return { Route, TargetTab: "", TargetSubTab: "" };
    }
    if (IsPromotionNotification(Notification))
      return {
        Route: "/admin/assessments",
        TargetTab: "promotion-history",
        TargetSubTab: "",
      };
    if (IsParentReportNotification(Notification)) {
      const TargetSubTab = IsParentReportGeneratedNotification(Notification)
        ? "generate-reports"
        : IsParentReportDeliveryNotification(Notification)
          ? "delivery-history"
          : "generate-reports";
      return {
        Route: "/admin/assessments",
        TargetTab: "parent-reports",
        TargetSubTab,
      };
    }
    if (
      IsTeacherReattemptApprovalNotification(Notification) ||
      NotificationText(Notification).Type.includes(
        "ASSESSMENT_REATTEMPT_REQUEST",
      )
    ) {
      return {
        Route: "/admin/assessments",
        TargetTab: "reattempt-approvals",
        TargetSubTab: "",
      };
    }
    if (IsAssessmentFeedbackNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      return { Route: AttemptId ? `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=ADMIN&feedback=1` : "/admin/assessments", TargetTab: "", TargetSubTab: "" };
    }
    if (IsMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      const { Type, Title } = NotificationText(Notification);
      if (Type.includes("SUBMITTED") || Title.includes("SUBMITTED")) {
        return { Route: AttemptId ? `/admin/competition/mock-result/${encodeURIComponent(AttemptId)}` : "/admin/competition/mock-tracker", TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/admin/competition/mock-tracker", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAssessmentNotification(Notification))
      return { Route: "/admin/assessments", TargetTab: "", TargetSubTab: "" };
  }

  if (Role === "student") {
    if (String(Notification.category || "").toUpperCase() === "FEES") {
      return { Route: "/student/fees", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAnnualCompetitionOfficialNotification(Notification)) {
      // Always the Official tab, where the student's paper card (level, slot,
      // Instructions button) is. Fixed here rather than read from the stored
      // route so the landing place can never drift.
      // "Your result is out": straight to the student's own result page.
      // The notification itself says nothing about the result.
      const { Type } = NotificationText(Notification);
      const ResultAttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      if (Type.includes("RESULT") && ResultAttemptId) {
        return { Route: `/student/competition/annual/attempt/${encodeURIComponent(ResultAttemptId)}`, TargetTab: "", TargetSubTab: "" };
      }
      // `focus` is a fresh value on every click, so the link is never
      // identical to the page the student is already on: a student sitting
      // on this very page with the Practice tab open is still switched to
      // Official (the page watches this value).
      return { Route: `/student/competition/annual?focus=${Date.now()}`, TargetTab: "OFFICIAL", TargetSubTab: "" };
    }
    if (IsLeaderboardRankNotification(Notification)) {
      // Rank-change / podium notification (2026-09-01) -- target_route is
      // always fully built server-side (the exact leaderboard page, tab,
      // and scope id), so it's used directly rather than reconstructed
      // here. Checked first, ahead of IsPracticeNotification/
      // IsMockNotification, since the stored `type` contains "DPS"/"MOCK".
      return { Route: Notification.targetRoute || "/student/dashboard", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAnnualCompetitionPracticeNotification(Notification)) {
      const { Type } = NotificationText(Notification);
      if (Type.includes("SUBMITTED")) {
        const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
        if (AttemptId) {
          return { Route: `/student/competition/annual/attempt/${encodeURIComponent(AttemptId)}`, TargetTab: "", TargetSubTab: "" };
        }
      }
      // Assigned (or a submitted notification missing its attemptId as a
      // defensive fallback) -- the Practice tab, with levelCode appended
      // below so the right level block auto-expands.
      return { Route: "/student/competition/annual", TargetTab: "PRACTICE", TargetSubTab: "" };
    }
    if (IsCompetitionMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      if (AttemptId) {
        return { Route: `/student/competition/mock-result/${encodeURIComponent(AttemptId)}`, TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/student/competition/mock-exams", TargetTab: "", TargetSubTab: "" };
    }
    if (IsPromotionNotification(Notification))
      return { Route: "/student/results", TargetTab: "", TargetSubTab: "" };
    if (IsPracticeNotification(Notification)) {
      const ModuleCode = MetadataString(Notification, "moduleCode");
      const Route = ModuleCode
        ? `/student/results/module/${encodeURIComponent(ModuleCode)}`
        : "/student/results";
      return { Route, TargetTab: "lesson-insights", TargetSubTab: "" };
    }
    if (IsAssessmentFeedbackNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      return { Route: AttemptId ? `/assessment-result/${encodeURIComponent(AttemptId)}?viewer=STUDENT&feedback=1` : "/student/assessments", TargetTab: "", TargetSubTab: "" };
    }
    if (IsMockNotification(Notification)) {
      const AttemptId = MetadataString(Notification, "attemptId") || Notification.attemptId || "";
      const { Type, Title } = NotificationText(Notification);
      if (Type.includes("SUBMITTED") || Title.includes("SUBMITTED")) {
        return { Route: AttemptId ? `/student/competition/mock-result/${encodeURIComponent(AttemptId)}` : "/student/competition/mock-exams", TargetTab: "", TargetSubTab: "" };
      }
      return { Route: "/student/competition/mock-exams", TargetTab: "", TargetSubTab: "" };
    }
    if (IsAssessmentNotification(Notification)) {
      const StoredRoute = Notification.targetRoute || "";
      return {
        Route: StoredRoute.startsWith("/student/assessment-result/") || StoredRoute.startsWith("/assessment-result/")
          ? StoredRoute
          : "/student/assessments",
        TargetTab: "",
        TargetSubTab: "",
      };
    }
  }

  return {
    Route: Notification.targetRoute || "/",
    TargetTab: Notification.targetTab || "",
    TargetSubTab: Notification.targetSubTab || "",
  };
}

export function BuildTargetUrl(
  Notification: NotificationRecord,
  User: ReturnType<typeof getStoredUser>,
) {
  const Role = NormalizeUserRole(User);
  const { Route, TargetTab, TargetSubTab } = BuildRoleAwareRoute(
    Notification,
    Role,
  );

  const BaseParams: Record<string, string> = {};
  if (TargetTab) BaseParams.tab = TargetTab;
  if (TargetSubTab) BaseParams.subTab = TargetSubTab;
  return AppendDeepLinkParams(Route, Notification, BaseParams);
}

function NotificationDisplayPriority(Notification: NotificationRecord) {
  const Type = String(Notification.type || "").toUpperCase();
  const Title = String(Notification.title || "").toUpperCase();
  const Category = String(Notification.category || "").toUpperCase();
  const Metadata = Notification.metadata || {};
  const Event = String(Metadata.event || "").toUpperCase();
  const Purpose = String(Metadata.notificationPurpose || "").toUpperCase();
  const TargetAction = String(Metadata.targetAction || "").toUpperCase();
  const ExplicitPriority = Number((Notification as unknown as { displayPriority?: number }).displayPriority || 0);

  if (ExplicitPriority) return ExplicitPriority;

  const Source = [Type, Title, Category, Event, Purpose, TargetAction].join(" ");

  if (Source.includes("APPROVAL") && Source.includes("REATTEMPT")) return 400;
  if (Source.includes("RE-ATTEMPT") && Source.includes("ASSIGNED")) return 350;
  if (
    Source.includes("REATTEMPT_ASSIGNED") ||
    Source.includes("RE-ATTEMPT ASSIGNED") ||
    Source.includes("REATTEMPT ASSIGNED") ||
    (Source.includes("ASSIGNED") && Source.includes("RE-ATTEMPT"))
  ) {
    return 300;
  }
  if (
    Source.includes("NEEDS_REATTEMPT") ||
    Source.includes("NEEDS RE-ATTEMPT") ||
    Source.includes("NEEDS REATTEMPT")
  ) {
    return 200;
  }
  if (
    Source.includes("DPS_ASSIGNED") ||
    Source.includes("DPS ASSIGNED") ||
    Source.includes("PRACTICE ASSIGNED")
  ) {
    return 100;
  }
  return 0;
}

function NotificationTimestampValue(Notification: NotificationRecord) {
  const Value = Notification.createdAt ? Date.parse(Notification.createdAt) : 0;
  return Number.isFinite(Value) ? Value : 0;
}

export function SortNotificationsForWorkflow(Items: NotificationRecord[]) {
  return [...Items].sort((Left, Right) => {
    const TimeDifference = NotificationTimestampValue(Right) - NotificationTimestampValue(Left);
    if (TimeDifference !== 0) return TimeDifference;

    const PriorityDifference =
      NotificationDisplayPriority(Right) - NotificationDisplayPriority(Left);
    if (PriorityDifference !== 0) return PriorityDifference;

    return String(Right.id || "").localeCompare(String(Left.id || ""));
  });
}

export function CategoryLabel(Notification: NotificationRecord) {
  const Category = String(Notification.category || "SYSTEM")
    .replace(/_/g, " ")
    .toLowerCase();
  return Category.replace(/\b\w/g, (Letter) => Letter.toUpperCase());
}
