"use client";

import { useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";

// DPS questions are typed free-text answers now, not MCQ picks -- see
// OPEN_ISSUES.md 2026-08-03e. This box auto-saves (short pause) and
// auto-advances to the next question (longer pause) the same way picking
// an MCQ option used to instantly advance -- but a typed answer has no
// single discrete "the student is done" event the way a click did, so this
// has to infer it from typing behavior instead.
//
// The correct answer (and its length) is never sent to the client during
// an in-progress attempt -- see safe_questions_payload() in
// attempt_service.py -- so "has the student finished typing" can only ever
// be a client-side heuristic based on pause + syntactic shape, never a
// comparison against the real answer. Two timers, reset on every
// keystroke:
//   - SAVE_DEBOUNCE_MS: fires quickly so nothing typed is ever lost, even
//     mid-thought.
//   - ADVANCE_DEBOUNCE_MS: fires only after a longer pause, and only
//     advances if the current text is a syntactically complete number
//     (rejects a bare trailing "-" or "." -- those are almost always
//     mid-keystroke, not a finished answer) -- so it never jumps the
//     student to the next question while they're still mid-digit.
// Pressing Enter always saves + advances immediately regardless of the
// pause/shape check, mirroring the old MCQ click's instant response for
// anyone who wants to move faster than the pause.
const SAVE_DEBOUNCE_MS = 450;
const ADVANCE_DEBOUNCE_MS = 1100;

const COMPLETE_NUMBER_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)$/;

export function AnswerInputBox({
  initialValue,
  disabled,
  onSave,
  onAdvance,
}: {
  initialValue?: string | null;
  disabled: boolean;
  onSave: (text: string) => void;
  onAdvance: (text: string) => void;
}) {
  const [value, setValue] = useState(initialValue || "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    saveTimerRef.current = null;
    advanceTimerRef.current = null;
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimers();

    const trimmed = nextValue.trim();
    if (!trimmed) return;

    saveTimerRef.current = setTimeout(() => onSave(nextValue), SAVE_DEBOUNCE_MS);

    if (COMPLETE_NUMBER_PATTERN.test(trimmed)) {
      advanceTimerRef.current = setTimeout(() => onAdvance(nextValue), ADVANCE_DEBOUNCE_MS);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    clearTimers();
    onAdvance(value);
  }

  function handleBlur() {
    clearTimers();
    const trimmed = value.trim();
    if (trimmed) onSave(value);
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed border-slate-200 bg-white/70 p-6 dark:border-slate-700 dark:bg-slate-900/40">
      <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        Type Your Answer
      </label>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Enter your answer"
        aria-label="Your answer"
        className="w-full max-w-[280px] rounded-[20px] border-2 border-slate-200 bg-white px-5 py-4 text-center text-3xl font-black tracking-wide text-slate-950 shadow-inner outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-900/40"
      />
      <p className="flex items-center gap-1.5 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
        <CornerDownLeft size={13} /> Press Enter, or pause after typing to move on automatically
      </p>
    </div>
  );
}
