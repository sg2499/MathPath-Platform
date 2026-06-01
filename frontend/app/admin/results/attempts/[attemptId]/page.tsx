"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminAttempt } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

export default function AdminAttemptReviewPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ attemptId: string }>();
  const query = useQuery({ queryKey: ["admin-attempt", params.attemptId], queryFn: () => getAdminAttempt(params.attemptId), enabled: ready });
  if (!ready) return null;
  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}
      {query.data ? (
        <div className="space-y-5">
          <div className="math-card p-6"><h1 className="text-3xl font-black">{query.data.student?.studentName}</h1><p className="mt-2 text-slate-600">Score: {query.data.summary?.score} / {query.data.summary?.maxScore} · Accuracy: {query.data.summary?.accuracyPercentage}%</p></div>
          {query.data.questions?.map((q: any) => <div className="math-card p-5" key={q.questionNumber}><h3 className="font-bold">Question {q.questionNumber}</h3><div className="mt-4"><MathQuestionDisplay operands={q.operands} operators={q.operators} displayType={(q as any).displayType ?? (q as any).display_type} questionText={(q as any).questionText ?? (q as any).question_text} /></div><p className="mt-3">Selected: <strong>{q.selectedOption ? `${q.selectedOption.label}. ${q.selectedOption.value}` : "Not Answered"}</strong></p><p>Correct: <strong>{q.correctOption ? `${q.correctOption.label}. ${q.correctOption.value}` : q.correctAnswer}</strong></p></div>)}
        </div>
      ) : null}
    </AppShell>
  );
}
