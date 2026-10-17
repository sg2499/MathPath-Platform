"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultReviewTabs, ToPracticeReviewQuestions } from "@/components/common/ResultReviewTabs";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminAttempt } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function AdminAttemptReviewPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ["admin-attempt", params.attemptId], queryFn: () => getAdminAttempt(params.attemptId), enabled: ready });
  if (!ready) return null;
  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}
      {query.data ? (
        <div className="space-y-6">
          <div className="ad-back-row">
            <button type="button" className="ad-back" onClick={() => router.back()}>
              <ArrowLeft size={16} />
              Back
            </button>
          </div>
          <section className="math-hero">
            <div className="relative z-10">
              <p className="math-block-header"><FileQuestion size={14} />Attempt Review</p>
              <h1 className="math-title">{query.data.student?.studentName || "Attempt Review"}</h1>
              <p className="math-subtitle">
                {[query.data.student?.studentCode, `Score ${query.data.summary?.score ?? "—"} / ${query.data.summary?.maxScore ?? "—"}`, `Accuracy ${query.data.summary?.accuracyPercentage ?? "—"}%`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </section>
          <ResultReviewTabs Questions={ToPracticeReviewQuestions(query.data.questionReview ?? query.data.questions)} Viewer="ADMIN" />
        </div>
      ) : null}
    </AppShell>
  );
}
