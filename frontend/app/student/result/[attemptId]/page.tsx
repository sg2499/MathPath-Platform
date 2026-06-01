"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAttemptResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, BookOpenCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function ResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["result", params.attemptId],
    queryFn: () => getAttemptResult(params.attemptId),
    enabled: ready,
  });

  if (!ready) return null;

  return (
    <AppShell title="Result Review">
      {query.isLoading ? <LoadingState label="Loading result..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {query.data ? (
        <div className="space-y-6">
          <ResultSummary result={query.data} />

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => router.push("/student/dashboard")}> 
              <ArrowLeft size={16} />
              Back to Dashboard
            </button>
            <div className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
              Review ready
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <BookOpenCheck size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Question Review</h2>
                <p className="text-slate-600">See each question, your selected answer, and the correct answer.</p>
              </div>
            </div>

            <div className="space-y-5">
              {query.data.questionReview?.map((q) => (
                <div key={q.questionId} className="math-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black text-slate-950">Question {q.questionNumber}</h3>
                    <span className={`math-badge ${q.isCorrect ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                      {q.isCorrect ? "Correct" : "Needs Practice"}
                    </span>
                  </div>

                  <div className="mt-5 rounded-[28px] bg-slate-50/90 p-6">
                    <MathQuestionDisplay operands={q.operands} operators={q.operators} displayType={(q as any).displayType ?? (q as any).display_type} questionText={(q as any).questionText ?? (q as any).question_text} />
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-[22px] bg-slate-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Your answer</p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {q.selectedOption ? `${q.selectedOption.label}. ${q.selectedOption.value}` : "Not Answered"}
                      </p>
                    </div>
                    <div className="rounded-[22px] bg-emerald-50 p-4 text-emerald-900">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Correct answer</p>
                      <p className="mt-2 text-lg font-black">
                        {q.correctOption ? `${q.correctOption.label}. ${q.correctOption.value}` : "Hidden"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
