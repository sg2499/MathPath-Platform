"use client";

import type { DpsStudentQuestion } from "@/types/question";
import { CheckCircle2, Save, Layers3 } from "lucide-react";
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
  const Metadata = question.metadata || {};
  const SectionTitle = String(Metadata.section_title || Metadata.sectionTitle || "").trim();
  const SectionNumber = Metadata.section_number || Metadata.sectionNumber;
  const TotalSections = Number(Metadata.dps_total_sections || Metadata.dpsTotalSections || 0);
  const ShowSectionLabel = Boolean(SectionTitle);
  const SectionLabel = ShowSectionLabel
    ? (TotalSections > 1 ? `Section ${SectionNumber || 1} · ${SectionTitle}` : SectionTitle)
    : "Practice Question";

  return (
    <div className={`math-card flex h-full flex-col overflow-hidden ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className={`flex shrink-0 flex-col gap-2 border-b border-slate-100 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between ${compact ? "pb-2" : "pb-3"}`}>
        <div>
          <div className="math-block-header mb-1"><Layers3 size={14} /> {SectionLabel}</div>
          <h2 className={`${compact ? "mt-0.5 text-base" : "mt-1.5 text-xl"} font-black text-slate-950 dark:text-white`}>
            Question {question.questionNumber}
          </h2>
        </div>

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

      <div className={`${compact ? "mt-3 gap-3" : "mt-4 gap-5"} flex min-h-0 flex-1 flex-col lg:flex-row`}>
        <div className={`flex min-h-[180px] flex-1 items-center justify-center overflow-auto rounded-[22px] bg-slate-50/90 dark:bg-slate-900/70 lg:h-full lg:min-h-0 ${compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4"}`}>
          <MathQuestionDisplay operands={question.operands} operators={question.operators} displayType={(question as any).displayType ?? (question as any).display_type} questionText={(question as any).questionText ?? (question as any).question_text} />
        </div>

        <div className="flex min-h-[160px] flex-1 items-center justify-center overflow-auto lg:h-full lg:min-h-0">
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
