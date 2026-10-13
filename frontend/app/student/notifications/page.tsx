"use client";

import { NotificationCenterPage } from "@/components/common/NotificationCenter";

export default function StudentNotificationsPage() {
  return <NotificationCenterPage Roles={["STUDENT"]} />;
}
