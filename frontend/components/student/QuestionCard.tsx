"use client";

import type { DpsStudentQuestion } from "@/types/question";
import { CheckCircle2, Save } from "lucide-react";
import { AnswerInputBox } from "./AnswerInputBox";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";

export function QuestionCard({
  question,
  savedAnswerText,
  disabled,
  saving,
  compact = false,
  onSave,
  onAdvance,
}: {
  question: DpsStudentQuestion;
  savedAnswerText?: string | null;
  disabled: boolean;
  saving: boolean;
  compact?: boolean;
  onSave: (answerText: string) => void;
  onAdvance: (answerText: string) => void;
}) {
  // Section/lesson context now lives in the attempt page's top info bar
  // (see app/student/attempt/[attemptId]/page.tsx) -- repeating it here
  // would just be the same text twice on one screen, so this card only
  // carries the question number and the save-status chip.
  return (
    <div className={`math-card flex flex-col overflow-hidden ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className={`${compact ? "text-sm" : "text-lg"} font-black text-slate-500 dark:text-slate-400`}>
          Question {question.questionNumber}
        </h2>

        <div
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
            saving
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {saving ? <Save size={14} /> : <CheckCircle2 size={14} />}
          {saving ? "Saving..." : "Auto-saved"}
        </div>
      </div>

      <div className={`${compact ? "mt-2 gap-3" : "mt-3 gap-5"} flex flex-col lg:h-[380px] lg:flex-row`}>
        <div className={`flex min-h-[300px] flex-1 items-center justify-center overflow-auto rounded-[22px] bg-slate-50/90 dark:bg-slate-900/70 lg:h-full lg:min-h-0 ${compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4"}`}>
          <MathQuestionDisplay operands={question.operands} operators={question.operators} displayType={(question as any).displayType ?? (question as any).display_type} questionText={(question as any).questionText ?? (question as any).question_text} />
        </div>

        <div className="flex min-h-[220px] flex-1 items-center justify-center overflow-auto lg:h-full lg:min-h-0">
          <AnswerInputBox
            key={question.questionId}
            initialValue={savedAnswerText}
            disabled={disabled}
            onSave={onSave}
            onAdvance={onAdvance}
          />
        </div>
      </div>
    </div>
  );
}
