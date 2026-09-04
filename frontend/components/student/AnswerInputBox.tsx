"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// DPS questions are typed free-text answers, not MCQ picks -- see
// OPEN_ISSUES.md 2026-08-03e. This box auto-saves on a short pause so
// nothing typed is ever lost, but it does NOT try to guess when the
// student is "done" and auto-advance them to the next question anymore.
//
// That guess-based auto-advance was removed on 2026-08-24. It used to
// infer "finished typing" from pause + syntactic shape (is the current
// text a complete-looking number), because the correct answer -- and its
// length -- is deliberately never sent to the client during an
// in-progress attempt (see safe_questions_payload() in
// attempt_service.py). That heuristic broke on any decimal answer: a bare
// integer like "61" is itself a syntactically complete number, so a
// student pausing mid-entry (e.g. between typing "61" and reaching for
// the decimal point of "61.02") looked identical to a student who was
// actually done, and got advanced before finishing. There is no reliable
// client-side fix for that without leaking answer shape to the client, so
// navigation between questions is now entirely manual -- the arrow
// buttons and question navigator in
// app/student/attempt/[attemptId]/page.tsx are the only way to move
// between questions.
const SAVE_DEBOUNCE_MS = 450;

// Imperative escape hatch for the attempt page's submit/auto-submit flow
// (2026-09-04, Shailesh): a debounced save is normally fine to just let run
// on its own timer, but Submit and the auto-submit-on-timeout path must
// never fire while this box still has an unsaved keystroke sitting in its
// 450ms debounce window -- see the fix's full writeup in
// app/student/attempt/[attemptId]/page.tsx's flushAndAwaitAllPendingSaves().
// flushPendingSave() forces exactly the same save the debounce timer or a
// blur would have fired, just immediately instead of after the delay.
export type AnswerInputBoxHandle = {
  flushPendingSave: () => void;
};

export const AnswerInputBox = forwardRef<AnswerInputBoxHandle, {
  initialValue?: string | null;
  disabled: boolean;
  onSave: (text: string) => void;
}>(function AnswerInputBox({ initialValue, disabled, onSave }, ref) {
  const [value, setValue] = useState(initialValue || "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Latest value, readable from the unmount-flush effect below without
  // making that effect re-run (and re-fire its cleanup) on every keystroke.
  const valueRef = useRef(value);
  // Last value actually handed to onSave, so blur/Enter/unmount-flush never
  // fire a redundant duplicate save when nothing changed since the last one.
  const lastSavedValueRef = useRef<string>(initialValue || "");

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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

  function clearSaveTimer() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }

  function flushSave(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed === lastSavedValueRef.current.trim()) return;
    lastSavedValueRef.current = text;
    onSave(text);
  }

  useImperativeHandle(ref, () => ({
    flushPendingSave: () => {
      clearSaveTimer();
      flushSave(valueRef.current);
    },
  }));

  // Same-question navigation is now entirely manual (arrow buttons /
  // question navigator), so if the student moves away while a save is
  // still sitting in the debounce window, flush it immediately on unmount
  // rather than letting it get dropped along with the timer.
  useEffect(() => {
    return () => {
      clearSaveTimer();
      flushSave(valueRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearSaveTimer();

    const trimmed = nextValue.trim();
    if (!trimmed) return;

    saveTimerRef.current = setTimeout(() => flushSave(nextValue), SAVE_DEBOUNCE_MS);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter used to instantly advance to the next question -- it no longer
    // does (see the file-level comment above). It still saves immediately
    // (same as a blur would); preventDefault just guards against a stray
    // native form-submit if this input is ever wrapped in a <form> later.
    event.preventDefault();
    clearSaveTimer();
    flushSave(value);
  }

  function handleBlur() {
    clearSaveTimer();
    flushSave(value);
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
    </div>
  );
});
