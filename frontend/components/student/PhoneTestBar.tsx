"use client";

import { useEffect } from "react";
import { TestTimer } from "@/components/student/TestTimer";

// Phones only (hidden from 640 px up). During a test the page header block
// with the timer scrolls away as soon as the student moves down to the
// question, and on typed-answer screens the keyboard then covers half the
// screen. This slim bar stays pinned to the top of the test card so the
// question number and the time left are always on screen. It only shows
// values the page already has; it changes nothing about the attempt.
export function PhoneTestBar({
  questionNumber,
  totalQuestions,
  remainingSeconds,
}: {
  questionNumber: number;
  totalQuestions: number;
  remainingSeconds: number;
}) {
  // Lets the stylesheet un-pin the app header on phones while a test is open,
  // so this bar (not the logo row) is what stays at the top of the screen.
  useEffect(() => {
    document.documentElement.classList.add("mp-in-test");
    return () => document.documentElement.classList.remove("mp-in-test");
  }, []);

  return (
    <div className="se-phone-bar sm:hidden">
      <span className="se-phone-bar-q">
        Question {questionNumber} Of {totalQuestions}
      </span>
      <TestTimer remainingSeconds={remainingSeconds} className="!px-3 !py-1.5 !text-sm" />
    </div>
  );
}
