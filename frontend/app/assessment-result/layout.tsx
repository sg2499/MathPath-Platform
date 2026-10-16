import type { ReactNode } from "react";
import "../teacher/teacher-elevate.css";

// The assessment result page is shared by students, teachers and admins, so it
// lives outside /teacher and never picked up the teacher look. The teacher
// stylesheet only styles pages inside the teacher shell (.math-role-teacher),
// so loading it here changes nothing for students or admins.
export default function AssessmentResultLayout({ children }: { children: ReactNode }) {
  return children;
}
