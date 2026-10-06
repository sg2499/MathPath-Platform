import type { ReactNode } from "react";
import { StudentScope } from "./StudentScope";
import "./student-elevate.css";

// Look-and-feel layer for the student login only. Everything in
// student-elevate.css is scoped to the student shell (.math-role-student), to
// the document while a student page is open (html.mp-student, set by
// StudentScope) or to classes used only by student pages, so the admin and
// teacher logins are untouched. This layout adds no behaviour: it loads the
// stylesheet and marks the document.
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StudentScope />
      {children}
    </>
  );
}
