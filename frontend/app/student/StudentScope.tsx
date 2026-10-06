"use client";

import { useEffect } from "react";

// Marks the document while a student page is open. Reward pop-ups, rank
// cut-scenes, badge and rank windows, confirm dialogs and the notification
// panel are mounted on <body>, outside the student shell, so the student look
// (Init Caps, the display typeface, button states) could not reach them through
// .math-role-student alone. student-elevate.css uses html.mp-student for those.
// The mark is removed when the student area is left, so the admin and teacher
// logins never see it. No behaviour: it only adds and removes one class.
export function StudentScope() {
  useEffect(() => {
    const Root = document.documentElement;
    Root.classList.add("mp-student");
    return () => {
      Root.classList.remove("mp-student");
    };
  }, []);
  return null;
}
