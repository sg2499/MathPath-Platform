import type { AdminPreviewQuestion } from "@/types/question";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { CheckCircle2 } from "lucide-react";

function FormatNumericDisplay(Value: unknown): string {
  const RawValue = String(Value ?? "").trim();

  if (!RawValue) return RawValue;

  const NumericValue = typeof Value === "number" ? Value : Number(RawValue);
  if (!Number.isFinite(NumericValue)) return RawValue;

  if (Number.isInteger(NumericValue)) return String(NumericValue);

  const PlainValue = NumericValue.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

  return PlainValue.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function AdminQuestionPreview({ questions }: { questions: AdminPreviewQuestion[] }) {
  return (
    <div className="grid gap-5">
      {questions.map((q, index) => {
        const questionNumber = q.questionNumber ?? q.question_number ?? index + 1;
        const correctAnswer = q.correctAnswer ?? q.correct_answer;
        const options = [...(q.options ?? [])].sort(
          (a, b) => (a.displayOrder ?? a.display_order ?? 0) - (b.displayOrder ?? b.display_order ?? 0)
        );

        return (
          <div key={q.questionId || q.seed || questionNumber} className="math-card p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="lg:w-[340px]">
                <p className="math-kicker">Preview Question</p>
                <h3 className="mt-3 text-2xl font-black text-slate-950">Question {questionNumber}</h3>
                <div className="mt-5 rounded-[28px] bg-slate-50/90 p-5">
                  <MathQuestionDisplay operands={q.operands} operators={q.operators} displayType={(q as any).displayType ?? (q as any).display_type} questionText={(q as any).questionText ?? (q as any).question_text} />
                </div>
              </div>

              <div className="flex-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  {options.map((option) => {
                    const isCorrect = Boolean(option.isCorrect ?? option.is_correct);
                    return (
                      <div
                        key={option.optionId || `${option.label}-${option.value}`}
                        className={`rounded-[22px] border px-4 py-4 font-semibold ${
                          isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 font-black text-slate-700">
                              {option.label}
                            </span>
                            <span>{FormatNumericDisplay(option.value)}</span>
                          </div>
                          {isCorrect ? <CheckCircle2 size={18} /> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-[22px] bg-blue-50 p-4 text-sm text-blue-900">
                  Correct answer: <span className="font-black">{FormatNumericDisplay(correctAnswer)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
