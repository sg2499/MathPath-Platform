"use client";

import { NotificationCenterPage } from "@/components/common/NotificationCenter";

export default function AdminNotificationsPage() {
  return <NotificationCenterPage Roles={["ADMIN", "SUPER_ADMIN"]} />;
}
