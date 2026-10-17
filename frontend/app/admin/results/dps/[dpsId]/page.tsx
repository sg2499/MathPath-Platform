"use client";

import { ResultTable } from "@/components/admin/ResultTable";
import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getDpsConfig, getDpsResults } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, Target, UsersRound } from "lucide-react";

// DPS Results (2026-10, admin revamp): the sheet's name as the title (the
// results payload has none, so the page showed an empty heading), the two
// summary figures as tiles, and Back to the sheet.
export default function AdminDpsResultsPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ dpsId: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ["dps-results", params.dpsId], queryFn: () => getDpsResults(params.dpsId), enabled: ready });
  const config = useQuery({ queryKey: ["admin-dps", params.dpsId], queryFn: () => getDpsConfig(params.dpsId), enabled: ready });
  if (!ready) return null;
  const Title = config.data
    ? `DPS ${config.data.dpsNumber}: ${config.data.dpsTitle}`
    : query.data?.title || "DPS Results";
  const Results = query.data?.results || [];
  return (
    <AppShell title="DPS Results">
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}
      {query.data ? (
        <div className="space-y-6">
          <div className="ad-back-row">
            <button type="button" className="ad-back" onClick={() => router.push(`/admin/dps/${params.dpsId}`)}>
              <ArrowLeft size={16} />
              Back To DPS
            </button>
          </div>
          <section className="math-hero">
            <div className="ad-hero-stack relative z-10">
              <div>
                <p className="math-block-header"><Activity size={14} />DPS Results</p>
                <h1 className="math-title">{Title}</h1>
                <p className="math-subtitle">Every submitted attempt on this sheet, with its score and accuracy.</p>
              </div>
              <div className="ad-hero-tiles ad-hero-tiles-3">
                <Tile icon={<UsersRound size={18} />} label="Attempts" value={query.data.summary?.totalAttempts ?? 0} />
                <Tile icon={<Target size={18} />} label="Average Score" value={query.data.summary?.averageScore ?? 0} />
                <Tile icon={<BarChart3 size={18} />} label="Average Accuracy" value={`${query.data.summary?.averageAccuracy ?? 0}%`} />
              </div>
            </div>
          </section>
          {Results.length ? <ResultTable results={Results} /> : <EmptyState message="No one has submitted this sheet yet." />}
        </div>
      ) : null}
    </AppShell>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-5">
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </div>
  );
}
