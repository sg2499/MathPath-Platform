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
// navigation between questions is entirely manual by default -- the arrow
// buttons and question navigator in
// app/student/attempt/[attemptId]/page.tsx are the only way to move
// between questions there.
//
// 2026-09-10 (Shailesh, Annual Competition): Enter-to-advance also exists
// on the Annual Competition attempt screen now, but it is NOT implemented
// here -- an earlier version wired it through an onEnterAdvance prop on
// this box, which broke the moment the box itself lost focus (a separate,
// now-fixed bug: the box used to become disabled -- and therefore blurred
// by the browser -- while a background autosave was merely in flight, so a
// per-input Enter handler could go completely dead mid-attempt). Enter-to-
// advance on that screen is now a page-level listener in
// app/student/competition/annual/attempt/[attemptId]/page.tsx that fires
// regardless of what has focus, precisely so it doesn't depend on this
// box's focus state at all. This file's own Enter handling stays exactly
// what it always was: an immediate force-save, nothing else.
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
  answerFormat?: string | null;
}>(function AnswerInputBox({ initialValue, disabled, onSave, answerFormat }, ref) {
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

  // 2026-10-11 (Shailesh): an emptied box is saved too, so erasing an answer
  // really removes it -- the server treats an empty answer as unanswered on
  // practice sheets, the Annual Competition and assessments alike. It used
  // to be skipped, leaving the old answer saved and marked. A box that was
  // empty and is still empty saves nothing.
  function flushSave(text: string) {
    const trimmed = text.trim();
    if (trimmed === lastSavedValueRef.current.trim()) return;
    lastSavedValueRef.current = text;
    onSave(trimmed ? text : "");
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

    saveTimerRef.current = setTimeout(() => flushSave(nextValue), SAVE_DEBOUNCE_MS);
  }

  // Phones and tablets (2026-10-11, Shailesh): the number keypad the box opens
  // has no minus sign and, on many phones, no comma -- so a negative answer or
  // a "quotient, remainder" answer could not be typed. Small keys under the
  // box type them. The minus key shows on every question (so it says nothing
  // about the answer); the comma key only on a division with a remainder.
  // Laptops type both on the keyboard and see no keys.
  const [touchDevice, setTouchDevice] = useState(false);
  useEffect(() => {
    try {
      setTouchDevice(window.matchMedia("(pointer: coarse)").matches);
    } catch {
      setTouchDevice(false);
    }
  }, []);
  const remainderAnswer = answerFormat === "QUOTIENT_REMAINDER";
  const caretRef = useRef<number | null>(null);
  function rememberCaret() {
    const input = inputRef.current;
    if (input && document.activeElement === input) caretRef.current = input.selectionEnd ?? input.value.length;
  }

  function typeKey(text: string) {
    if (disabled) return;
    // Where the student's cursor was. A tap on a key can take focus from the
    // box on some phones, and a box without focus reports its cursor at 0,
    // so the cursor is remembered as they type (caretRef) and a box that
    // never had one types at the end.
    const input = inputRef.current;
    const focused = Boolean(input && document.activeElement === input);
    const start = Math.min(value.length, focused ? input!.selectionStart ?? value.length : caretRef.current ?? value.length);
    const end = Math.min(value.length, Math.max(start, focused ? input!.selectionEnd ?? start : start));
    const nextValue = value.slice(0, start) + text + value.slice(end);
    handleChange(nextValue);
    window.requestAnimationFrame(() => {
      const box = inputRef.current;
      if (!box) return;
      box.focus();
      const caret = start + text.length;
      caretRef.current = caret;
      try {
        box.setSelectionRange(caret, caret);
      } catch {
        // Some input types do not support a caret position.
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter always saves immediately (same as a blur would); preventDefault
    // just guards against a stray native form-submit if this input is ever
    // wrapped in a <form> later.
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
        onChange={(event) => {
          handleChange(event.target.value);
          caretRef.current = event.target.selectionEnd ?? event.target.value.length;
        }}
        onSelect={rememberCaret}
        onKeyUp={rememberCaret}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Type here"
        aria-label="Your answer"
        className="w-full max-w-[220px] rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-wide text-slate-950 shadow-inner outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-orange-400 dark:focus:ring-orange-900/40"
      />
      {remainderAnswer ? (
        <p className="se-answer-extra text-center text-xs font-bold text-slate-500 dark:text-slate-400">
          Quotient, comma, remainder. For example: 12, 3
        </p>
      ) : null}
      {touchDevice ? (
        <div className="se-answer-extra flex items-center justify-center gap-2" aria-label="Extra keys">
          <AnswerKey label="−" ariaLabel="Type a minus sign" disabled={disabled} onPress={() => typeKey("-")} />
          {remainderAnswer ? <AnswerKey label="," ariaLabel="Type a comma" disabled={disabled} onPress={() => typeKey(", ")} /> : null}
        </div>
      ) : null}
    </div>
  );
});

// A key under the answer box. pointerdown is cancelled so the box keeps focus
// and the phone keypad stays open while it is tapped.
function AnswerKey({ label, ariaLabel, disabled, onPress }: { label: string; ariaLabel: string; disabled: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="h-11 min-w-[52px] rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-2xl font-black leading-none text-slate-800 shadow-sm transition active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    >
      {label}
    </button>
  );
}
