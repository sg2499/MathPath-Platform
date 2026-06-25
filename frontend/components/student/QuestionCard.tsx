"use client";

import type { StudentQuestion } from "@/types/question";
import { CheckCircle2, Save } from "lucide-react";
import { OptionButton } from "./OptionButton";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";

export function QuestionCard({
  question,
  selectedOptionId,
  disabled,
  saving,
  compact = false,
  onSelect,
}: {
  question: StudentQuestion;
  selectedOptionId?: string | null;
  disabled: boolean;
  saving: boolean;
  compact?: boolean;
  onSelect: (optionId: string) => void;
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
    <div className={`math-card overflow-hidden ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className={`flex flex-col gap-3 border-b border-slate-100 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between ${compact ? "pb-2" : "pb-3"}`}>
        <div>
          <p className="math-kicker">{SectionLabel}</p>
          <h2 className={`${compact ? "mt-1 text-lg" : "mt-1.5 text-xl"} font-black text-slate-950 dark:text-white`}>
            Question {question.questionNumber}
          </h2>
        </div>

        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
            saving
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {saving ? <Save size={16} /> : <CheckCircle2 size={16} />}
          {saving ? "Saving answer..." : "Auto-saved"}
        </div>
      </div>

      <div className={`${compact ? "mt-3 gap-4" : "mt-4 gap-5"} flex flex-wrap items-stretch`}>
        <div className={`flex flex-auto lg:flex-1 min-w-[280px] h-full min-h-[300px] max-w-full overflow-x-auto items-center justify-center rounded-[24px] bg-slate-50/90 dark:bg-slate-900/70 ${compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4"}`}>
          <MathQuestionDisplay operands={question.operands} operators={question.operators} displayType={(question as any).displayType ?? (question as any).display_type} questionText={(question as any).questionText ?? (question as any).question_text} />
        </div>

        <div className="flex-auto lg:flex-1 min-w-[280px] w-full lg:w-auto grid gap-3 sm:grid-cols-2">
          {question.options.map((option) => (
            <OptionButton
              key={option.optionId}
              option={option}
              selected={selectedOptionId === option.optionId}
              disabled={disabled}
              onClick={() => onSelect(option.optionId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
