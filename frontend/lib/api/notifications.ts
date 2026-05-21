import { api } from "@/lib/api";

export type NotificationCategory =
  | "PRACTICE"
  | "ASSESSMENT"
  | "RESULT"
  | "REATTEMPT"
  | "PROMOTION"
  | "PARENT_REPORT"
  | "FAILURE"
  | "SYSTEM";

export type NotificationColorVariant =
  | "BLUE"
  | "PURPLE"
  | "GREEN"
  | "AMBER"
  | "INDIGO"
  | "TEAL"
  | "RED"
  | "GRAY"
  | "INFO";

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
};

export type NotificationListResponse = {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
};

export async function GetNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<NotificationListResponse> {
  const Response = await api.get("/notifications", {
    params: {
      unreadOnly: params?.unreadOnly ?? false,
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
      ts: Date.now(),
    },
    headers: { "Cache-Control": "no-cache" },
  });

  return {
    items: Response.data?.items || [],
    total: Number(Response.data?.total || 0),
    unreadCount: Number(Response.data?.unreadCount || 0),
    limit: Number(Response.data?.limit || params?.limit || 20),
    offset: Number(Response.data?.offset || params?.offset || 0),
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

export async function MarkAllNotificationsRead(): Promise<{ updatedCount: number; unreadCount: number }> {
  const Response = await api.patch("/notifications/read-all");
  return {
    updatedCount: Number(Response.data?.updatedCount || 0),
    unreadCount: Number(Response.data?.unreadCount || 0),
  };
}
