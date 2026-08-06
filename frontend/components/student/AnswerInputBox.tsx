"use client";

import { useEffect, useRef, useState } from "react";
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

// PM-L4's "3D ÷ 1D WITH REMAINDER(S)" (added 2026-08-06) is the platform's
// first DPS concept whose typed answer is a "quotient, remainder" pair
// (e.g. "73, 1") instead of a single number -- see answer_matching.py's
// _to_decimal_pair for the backend-side counterpart. Without this, a
// student's finished pair answer never matches COMPLETE_NUMBER_PATTERN, so
// the pause-based auto-advance never fires (they'd still be able to save +
// advance by pressing Enter, but the box would otherwise look "stuck"
// exactly like every other concept's auto-advance already feels smooth).
// This is purely a client-side completeness heuristic for UX, same caveat
// as COMPLETE_NUMBER_PATTERN's own docstring below -- it never influences
// actual grading, which stays entirely server-side.
const COMPLETE_PAIR_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)\s*,\s*-?(\d+(\.\d+)?|\.\d+)$/;

function isCompleteAnswer(text: string): boolean {
  return COMPLETE_NUMBER_PATTERN.test(text) || COMPLETE_PAIR_PATTERN.test(text);
}

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
  const inputRef = useRef<HTMLInputElement | null>(null);

  // QuestionCard remounts this component with a fresh key on every question
  // change, so a mount-time focus fires exactly once per question -- the
  // student never has to click the box first before typing. Skipped while
  // disabled (e.g. time's already up) since focusing a disabled field is a
  // no-op anyway and would be misleading.
  useEffect(() => {
    if (disabled) return;
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (isCompleteAnswer(trimmed)) {
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 sm:p-5">
      <label className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        Your Answer
      </label>
      <input
        ref={inputRef}
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
        placeholder="Type here"
        aria-label="Your answer"
        className="w-full max-w-[220px] rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-wide text-slate-950 shadow-inner outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-900/40"
      />
      <p className="flex items-center gap-1.5 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
        <CornerDownLeft size={12} /> Enter to continue
      </p>
    </div>
  );
}
