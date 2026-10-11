"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultReviewTabs, ToPracticeReviewQuestions } from "@/components/common/ResultReviewTabs";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminAttempt } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { FileQuestion } from "lucide-react";

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
          <div className="math-card p-6"><p className="math-block-header"><FileQuestion size={14} />Attempt Review</p><h1 className="mt-3 text-3xl font-black">{query.data.student?.studentName}</h1><p className="mt-2 text-slate-600">Score {query.data.summary?.score} / {query.data.summary?.maxScore}, accuracy {query.data.summary?.accuracyPercentage}%</p></div>
          <ResultReviewTabs Questions={ToPracticeReviewQuestions(query.data.questionReview ?? query.data.questions)} Viewer="ADMIN" />
        </div>
      ) : null}
    </AppShell>
  );
}
