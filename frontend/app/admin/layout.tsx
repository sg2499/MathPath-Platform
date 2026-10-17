import type { ReactNode } from "react";
import { AdminScope } from "./AdminScope";
import "./admin-elevate.css";

// Look-and-feel layer for the admin login only (admin revamp, Oct 2026).
// Everything in admin-elevate.css is scoped to the admin shell
// (.math-role-admin), to the document while an admin page is open
// (html.mp-admin, set by AdminScope) or to classes used only by admin pages,
// so the teacher and student logins are untouched. This layout adds no
// behaviour: it loads the stylesheet and marks the document.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminScope />
      {children}
    </>
  );
}
