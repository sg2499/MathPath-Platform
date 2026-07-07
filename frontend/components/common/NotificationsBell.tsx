"use client";

import {
  GetNotifications,
  MarkAllNotificationsRead,
  MarkNotificationRead,
  type NotificationRecord,
} from "@/lib/api/notifications";
import { getStoredUser } from "@/lib/auth";
import { formatMathPathDateTime } from "@/lib/date";
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  FileText,
  GraduationCap,
  MailCheck,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NotificationTone =
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

function NormalizeTone(Notification: NotificationRecord): NotificationTone {
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
  return "gray";
}

function ToneClasses(Tone: NotificationTone, IsRead: boolean) {
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

function IconFor(Notification: NotificationRecord) {
  const Category = String(Notification.category || "").toUpperCase();
  const Type = String(Notification.type || "").toUpperCase();

  if (Category === "ASSESSMENT_FEEDBACK") return <MessageSquareText size={16} />;
  if (Category === "FAILURE") return <TriangleAlert size={16} />;
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

function BuildTargetUrl(
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

function SortNotificationsForWorkflow(Items: NotificationRecord[]) {
  return [...Items].sort((Left, Right) => {
    const TimeDifference = NotificationTimestampValue(Right) - NotificationTimestampValue(Left);
    if (TimeDifference !== 0) return TimeDifference;

    const PriorityDifference =
      NotificationDisplayPriority(Right) - NotificationDisplayPriority(Left);
    if (PriorityDifference !== 0) return PriorityDifference;

    return String(Right.id || "").localeCompare(String(Left.id || ""));
  });
}

function CategoryLabel(Notification: NotificationRecord) {
  const Category = String(Notification.category || "SYSTEM")
    .replace(/_/g, " ")
    .toLowerCase();
  return Category.replace(/\b\w/g, (Letter) => Letter.toUpperCase());
}

export function NotificationsBell() {
  const Router = useRouter();
  const User = getStoredUser();
  const [Open, SetOpen] = useState(false);
  const [Items, SetItems] = useState<NotificationRecord[]>([]);
  const [UnreadCount, SetUnreadCount] = useState(0);
  const [Loading, SetLoading] = useState(false);
  const [ActionLoading, SetActionLoading] = useState(false);
  const PanelRef = useRef<HTMLDivElement | null>(null);

  const VisibleItems = useMemo(() => SortNotificationsForWorkflow(Items).slice(0, 20), [Items]);

  const FetchNotifications = useCallback(async () => {
    if (!User?.id) return;
    try {
      SetLoading(true);
      const Response = await GetNotifications({ limit: 20, offset: 0 });
      SetItems(SortNotificationsForWorkflow(Response.items || []));
      SetUnreadCount(Response.unreadCount || 0);
    } catch {
      SetItems([]);
      SetUnreadCount(0);
    } finally {
      SetLoading(false);
    }
  }, [User?.id]);

  useEffect(() => {
    FetchNotifications();
    const Interval = window.setInterval(FetchNotifications, 15000);

    function HandleFocus() {
      if (document.visibilityState === "hidden") return;
      FetchNotifications();
    }

    window.addEventListener("focus", HandleFocus);
    document.addEventListener("visibilitychange", HandleFocus);
    return () => {
      window.clearInterval(Interval);
      window.removeEventListener("focus", HandleFocus);
      document.removeEventListener("visibilitychange", HandleFocus);
    };
  }, [FetchNotifications]);

  useEffect(() => {
    function HandleClick(Event: MouseEvent) {
      if (!PanelRef.current) return;
      if (!PanelRef.current.contains(Event.target as Node)) SetOpen(false);
    }

    function HandleKey(Event: KeyboardEvent) {
      if (Event.key === "Escape") SetOpen(false);
    }

    document.addEventListener("mousedown", HandleClick);
    document.addEventListener("keydown", HandleKey);
    return () => {
      document.removeEventListener("mousedown", HandleClick);
      document.removeEventListener("keydown", HandleKey);
    };
  }, []);

  async function HandleNotificationClick(Notification: NotificationRecord) {
    try {
      if (!Notification.isRead) {
        await MarkNotificationRead(Notification.id);
      }
    } catch {
      // Navigation should still happen even if read-state update fails.
    } finally {
      SetOpen(false);
      SetUnreadCount((Count) =>
        Math.max(0, Count - (Notification.isRead ? 0 : 1)),
      );
      SetItems((Current) =>
        Current.map((Item) =>
          Item.id === Notification.id ? { ...Item, isRead: true } : Item,
        ),
      );
      Router.push(BuildTargetUrl(Notification, User));
    }
  }

  async function HandleMarkAllRead() {
    try {
      SetActionLoading(true);
      const Response = await MarkAllNotificationsRead();
      SetUnreadCount(Math.max(0, Number(Response.unreadCount || 0)));
      SetItems((Current) => Current.map((Item) => ({ ...Item, isRead: true })));
      await FetchNotifications();
    } finally {
      SetActionLoading(false);
    }
  }

  const BadgeCount = Math.min(UnreadCount, 99);

  return (
    <div className="relative" ref={PanelRef}>
      <button
        className="math-button-secondary math-focus-ring relative h-12 px-4"
        title="Open Notifications"
        onClick={() => {
          SetOpen((Value) => !Value);
          if (!Open) FetchNotifications();
        }}
        aria-label="Notifications"
      >
        {UnreadCount ? <BellRing size={17} /> : <Bell size={17} />}
        {UnreadCount ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white shadow-lg">
            {BadgeCount}
          </span>
        ) : null}
      </button>

      {Open ? (
        <div className="absolute right-0 top-14 z-[999] w-[min(460px,calc(100vw-24px))] overflow-hidden p-0 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.3)] rounded-[24px] border border-white/80 dark:border-white/20 bg-white/90 dark:bg-slate-950/90 backdrop-blur-[32px] transition-all duration-300 ring-1 ring-black/5 dark:ring-white/10">
          <div className="flex items-start justify-between gap-3 border-b border-black/5 bg-white/80 px-5 py-4 dark:border-white/10 dark:bg-slate-900/80 backdrop-blur-md">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">
                Notifications
              </p>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">
                MathPath Updates
              </h3>
              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                {UnreadCount
                  ? `${UnreadCount} Unread Update${UnreadCount === 1 ? "" : "s"}`
                  : "All Caught Up"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {UnreadCount ? (
                <button
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white"
                  onClick={HandleMarkAllRead}
                  disabled={ActionLoading}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCheck size={14} /> Mark All Read
                  </span>
                </button>
              ) : null}
              <button
                className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:text-white"
                onClick={() => SetOpen(false)}
                title="Close Notifications"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-[min(520px,calc(100vh-180px))] space-y-2 overflow-y-auto p-3">
            {Loading && !Items.length ? (
              <div className="math-panel-muted text-center text-sm font-bold">
                Loading notifications...
              </div>
            ) : VisibleItems.length ? (
              VisibleItems.map((Notification) => {
                const Tone = NormalizeTone(Notification);
                return (
                  <button
                    key={Notification.id}
                    className={`w-full rounded-[22px] border p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 dark:focus-visible:ring-cyan-300/15 ${ToneClasses(Tone, Notification.isRead)} relative overflow-hidden group`}
                    onClick={() => HandleNotificationClick(Notification)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="flex gap-3 relative z-10">
                      <div className="mt-0.5 shrink-0 rounded-2xl border border-current/10 bg-white/60 p-2 shadow-sm dark:bg-white/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                        {IconFor(Notification)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black leading-5">
                            {Notification.title}
                          </p>
                          {!Notification.isRead ? (
                            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                              New
                            </span>
                          ) : null}
                        </div>
                        {Notification.message ? (
                          <p className="mt-1 text-sm font-semibold leading-6 opacity-85">
                            {Notification.message}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold opacity-70">
                          <span className="rounded-full border border-current/10 bg-white/50 px-2.5 py-1 dark:bg-white/10">
                            {CategoryLabel(Notification)}
                          </span>
                          {Notification.createdAt ? (
                            <span>
                              {formatMathPathDateTime(Notification.createdAt)}
                            </span>
                          ) : null}
                          {Notification.targetRoute ? null : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="math-panel-muted flex flex-col items-center justify-center gap-3 py-10 text-center">
                <MailCheck size={28} className="text-slate-400" />
                <div>
                  <p className="font-black text-slate-900 dark:text-white">
                    No Notifications Yet
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Platform updates will appear here when actions are recorded.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
