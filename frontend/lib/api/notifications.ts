import { api } from "@/lib/api";

export type NotificationCategory =
  | "PRACTICE"
  | "ASSESSMENT"
  | "RESULT"
  | "REATTEMPT"
  | "PROMOTION"
  | "PARENT_REPORT"
  | "FAILURE"
  | "SYSTEM"
  | "ASSESSMENT_FEEDBACK";

export type NotificationColorVariant =
  | "BLUE"
  | "PURPLE"
  | "GREEN"
  | "AMBER"
  | "INDIGO"
  | "TEAL"
  | "RED"
  | "GRAY"
  | "INFO"
  | "FEEDBACK_EXCELLENT"
  | "FEEDBACK_MASTERY"
  | "FEEDBACK_GUIDANCE"
  | "FEEDBACK_PRACTICE"
  | "FEEDBACK_REVISION";

export type NotificationRecord = {
  id: string;
  recipientUserId?: string | null;
  recipientRole?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  studentId?: string | null;
  teacherId?: string | null;
  moduleId?: string | null;
  levelId?: string | null;
  lessonId?: string | null;
  dpsId?: string | null;
  assessmentId?: string | null;
  attemptId?: string | null;
  reportDeliveryId?: string | null;
  type: string;
  category: NotificationCategory | string;
  title: string;
  message?: string | null;
  targetRoute?: string | null;
  targetTab?: string | null;
  targetSubTab?: string | null;
  colorVariant?: NotificationColorVariant | string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown>;
  // 2026-10-13: which tab it belongs to, and whether it is something this
  // person is expected to act on.
  tab?: NotificationTabKey | string;
  needsAction?: boolean;
};

export type NotificationTabKey = "ALL" | "ACTION" | "DPS" | "ASSESSMENTS" | "ANNUAL" | "ACHIEVEMENTS" | "ACCOUNT" | "OTHER";

export type NotificationTab = {
  key: NotificationTabKey;
  label: string;
  total: number;
  unread: number;
};

export type NotificationListResponse = {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  tabs: NotificationTab[];
};

export async function GetNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  tab?: NotificationTabKey;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  includeTabs?: boolean;
}): Promise<NotificationListResponse> {
  const Response = await api.get("/notifications", {
    params: {
      unreadOnly: params?.unreadOnly ?? false,
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
      tab: params?.tab && params.tab !== "ALL" ? params.tab : undefined,
      q: params?.q?.trim() || undefined,
      dateFrom: params?.dateFrom || undefined,
      dateTo: params?.dateTo || undefined,
      includeTabs: params?.includeTabs ?? false,
      ts: Date.now(),
    },
    headers: { "Cache-Control": "no-cache" },
  });

  const Items: NotificationRecord[] = Response.data?.items || [];
  const Total = Number(Response.data?.total || 0);
  const Offset = Number(Response.data?.offset || params?.offset || 0);
  return {
    items: Items,
    total: Total,
    unreadCount: Number(Response.data?.unreadCount || 0),
    limit: Number(Response.data?.limit || params?.limit || 20),
    offset: Offset,
    hasMore: typeof Response.data?.hasMore === "boolean" ? Response.data.hasMore : Offset + Items.length < Total,
    tabs: Array.isArray(Response.data?.tabs) ? Response.data.tabs : [],
  };
}

export async function GetUnreadNotificationCount(): Promise<number> {
  const Response = await api.get("/notifications/unread-count", {
    params: { ts: Date.now() },
    headers: { "Cache-Control": "no-cache" },
  });
  return Number(Response.data?.unreadCount || 0);
}

export async function MarkNotificationRead(notificationId: string): Promise<NotificationRecord> {
  const Response = await api.patch(`/notifications/${notificationId}/read`);
  return Response.data;
}

export async function MarkAllNotificationsRead(tab?: NotificationTabKey): Promise<{ updatedCount: number; unreadCount: number }> {
  const Response = await api.patch("/notifications/read-all", null, {
    params: { tab: tab && tab !== "ALL" ? tab : undefined },
  });
  return {
    updatedCount: Number(Response.data?.updatedCount || 0),
    unreadCount: Number(Response.data?.unreadCount || 0),
  };
}
