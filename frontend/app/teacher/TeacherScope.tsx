"use client";

import { useEffect } from "react";

// Marks the document while a teacher page is open. Confirm dialogs, the
// notification panel and other pop-ups are mounted on <body>, outside the
// teacher shell, so the teacher look (Init Caps, the display typeface, button
// states) could not reach them through .math-role-teacher alone.
// teacher-elevate.css uses html.mp-teacher for those. The mark is removed when
// the teacher area is left, so the admin and student logins never see it. No
// behaviour: it only adds and removes one class.
export function TeacherScope() {
  useEffect(() => {
    const Root = document.documentElement;
    Root.classList.add("mp-teacher");
    return () => {
      Root.classList.remove("mp-teacher");
    };
  }, []);
  return null;
}
