import type { ReactNode } from "react";
import { TeacherScope } from "./TeacherScope";
import "./teacher-elevate.css";

// Look-and-feel layer for the teacher login only. Everything in
// teacher-elevate.css is scoped to the teacher shell (.math-role-teacher), to
// the document while a teacher page is open (html.mp-teacher, set by
// TeacherScope) or to classes used only by teacher pages, so the admin and
// student logins are untouched. This layout adds no behaviour: it loads the
// stylesheet and marks the document.
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TeacherScope />
      {children}
    </>
  );
}
