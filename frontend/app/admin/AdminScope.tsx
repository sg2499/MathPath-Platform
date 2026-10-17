"use client";

import { useEffect } from "react";

// Marks the document while an admin page is open. Confirm dialogs, the
// notification panel and other pop-ups are mounted on <body>, outside the
// admin shell, so the admin look (Init Caps, the display typeface, button
// states) could not reach them through .math-role-admin alone.
// admin-elevate.css uses html.mp-admin for those. The mark is removed when the
// admin area is left, so the teacher and student logins never see it. No
// behaviour: it only adds and removes one class.
export function AdminScope() {
  useEffect(() => {
    const Root = document.documentElement;
    Root.classList.add("mp-admin");
    return () => {
      Root.classList.remove("mp-admin");
    };
  }, []);
  return null;
}
