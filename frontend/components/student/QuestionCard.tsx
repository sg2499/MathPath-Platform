"use client";

import type { DpsStudentQuestion } from "@/types/question";
import { CheckCircle2, Save } from "lucide-react";
import { AnswerInputBox, type AnswerInputBoxHandle } from "./AnswerInputBox";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useEffect, useRef, type Ref } from "react";

export function QuestionCard({
  question,
  savedAnswerText,
  disabled,
  saving,
  compact = false,
  wide = false,
  onSave,
  answerInputRef,
}: {
  question: DpsStudentQuestion;
  savedAnswerText?: string | null;
  disabled: boolean;
  saving: boolean;
  compact?: boolean;
  // The test contains one-line sums too long for half the card (see
  // NeedsWideQuestionBoard): the question takes the full width and the answer
  // box sits under it on every screen size, so the sum stays on one line.
  wide?: boolean;
  onSave: (answerText: string) => void;
  // Lets the attempt page force-flush whatever's currently sitting in this
  // question's debounce window right before Submit/auto-submit fires --
  // see AnswerInputBox's own docstring and the attempt page's
  // flushAndAwaitAllPendingSaves() for the race this closes.
  answerInputRef?: Ref<AnswerInputBoxHandle>;
}) {
  // Section/lesson context now lives in the attempt page's top info bar
  // (see app/student/attempt/[attemptId]/page.tsx) -- repeating it here
  // would just be the same text twice on one screen, so this card only
  // carries the question number and the save-status chip.
  // The question's own stored text: the instruction above a box question
  // ("Find Profit %", "Find Simple Interest") and, for mixed-operation sums,
  // the exact expression with its real signs. The server sends it as
  // questionText; metadata.question_text is the same value and is read as a
  // fallback so the instruction can never silently go missing.
  const QuestionMetadata = ((question as any).metadata || {}) as Record<string, unknown>;
  const QuestionText =
    ((question as any).questionText ??
      (question as any).question_text ??
      QuestionMetadata.question_text ??
      QuestionMetadata.questionText ??
      null) as string | null;

  // Phones: the answer box takes focus as soon as a question opens, the
  // keyboard comes up and the browser scrolls the box into view -- which used
  // to push the sum itself off the top of the screen. Bringing this card's
  // top edge to the top of the visible area (just under the pinned test bar)
  // keeps the sum and the answer box on screen together. Presentation only:
  // nothing here reads or changes the attempt.
  const CardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches) return;
    const Align = () => CardRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    const First = window.setTimeout(Align, 60);
    // The keyboard opening resizes the visible area a moment later.
    const Viewport = window.visualViewport;
    let Settled = false;
    const OnResize = () => { if (!Settled) Align(); };
    Viewport?.addEventListener("resize", OnResize);
    const Stop = window.setTimeout(() => { Settled = true; }, 1200);
    return () => {
      window.clearTimeout(First);
      window.clearTimeout(Stop);
      Viewport?.removeEventListener("resize", OnResize);
    };
  }, [question.questionId]);

  return (
    <div ref={CardRef} className={`se-question-card math-card flex flex-col overflow-hidden ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className={`${compact ? "text-sm" : "text-lg"} font-black text-slate-500 dark:text-slate-400`}>
          Question {question.questionNumber}
        </h2>

        <div
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
            saving
              ? "bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
          }`}
        >
          {saving ? <Save size={14} /> : <CheckCircle2 size={14} />}
          {saving ? "Saving..." : "Auto-saved"}
        </div>
      </div>

      {/*
        2026-09-10 (Shailesh, Annual Competition bug report): this used to be
        a *fixed* height (lg:h-[clamp(...)]) sized for a "worst-case 5-row
        question," with overflow-auto on both panels below scrolling any
        question that needed more room than that estimate -- e.g. some
        Add/Less sums. "No question should ever be scrollable" means the
        card has to grow to fit its content instead of clipping it, so this
        is now a *minimum* height (a floor so short questions don't look
        cramped) with no overflow/clipping on either panel -- both panels,
        and the card around them, simply grow as tall as the content needs.
      */}
      <div className={`${wide ? "mt-2 gap-3" : compact ? "mt-2 gap-3 lg:min-h-[clamp(260px,31vh,340px)] lg:flex-row" : "mt-3 gap-5 lg:min-h-[clamp(320px,36vh,380px)] lg:flex-row"} flex flex-col`}>
        <div className={`mp-qboard ${wide ? "se-qboard-wide " : ""}flex flex-1 items-center justify-center rounded-[22px] bg-slate-50/90 dark:bg-slate-900/70 ${wide ? "min-h-[150px] p-2.5 sm:p-3" : compact ? "min-h-[240px] p-2.5 sm:p-3" : "min-h-[300px] p-3 sm:p-4"}`}>
          <MathQuestionDisplay operands={question.operands} operators={question.operators} displayType={(question as any).displayType ?? (question as any).display_type} questionText={QuestionText} />
        </div>

        <div className={`flex flex-1 items-center justify-center ${wide ? "min-h-[140px]" : compact ? "min-h-[150px] lg:min-h-0" : "min-h-[220px]"}`}>
          <AnswerInputBox
            key={question.questionId}
            ref={answerInputRef}
            initialValue={savedAnswerText}
            disabled={disabled}
            onSave={onSave}
          />
        </div>
      </div>
    </div>
  );
}
