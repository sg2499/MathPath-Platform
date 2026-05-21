"use client";

import { ResultTable } from "@/components/admin/ResultTable";
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getDpsResults } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

export default function AdminDpsResultsPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ dpsId: string }>();
  const query = useQuery({ queryKey: ["dps-results", params.dpsId], queryFn: () => getDpsResults(params.dpsId), enabled: ready });
  if (!ready) return null;
  return (
    <AppShell title="DPS Results">
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}
      {query.data ? (
        <div className="space-y-5">
          <div className="math-card p-6"><h1 className="text-3xl font-black">{query.data.title}</h1><p className="mt-2 text-slate-600">Total Attempts: {query.data.summary?.totalAttempts || 0} · Average Accuracy: {query.data.summary?.averageAccuracy || 0}%</p></div>
          <ResultTable results={query.data.results || []} />
        </div>
      ) : null}
    </AppShell>
  );
}
