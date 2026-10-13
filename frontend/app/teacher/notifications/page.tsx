"use client";

import { NotificationCenterPage } from "@/components/common/NotificationCenter";

export default function TeacherNotificationsPage() {
  return <NotificationCenterPage Roles={["TEACHER"]} />;
}
