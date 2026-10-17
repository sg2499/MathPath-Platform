import type { ReactNode } from "react";
import "../teacher/teacher-elevate.css";
import "../admin/admin-elevate.css";

// The assessment result page is shared by students, teachers and admins, so it
// lives outside /teacher and never picked up the teacher look. The teacher
// stylesheet only styles pages inside the teacher shell (.math-role-teacher),
// so loading it here changes nothing for students or admins. The admin
// stylesheet is the same for .math-role-admin (2026-10, admin revamp).
export default function AssessmentResultLayout({ children }: { children: ReactNode }) {
  return children;
}
