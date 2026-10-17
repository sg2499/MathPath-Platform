"use client";

import { AdminQuestionPreview } from "@/components/admin/AdminQuestionPreview";
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { generateDpsPreview, getDpsConfig } from "@/lib/api/admin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Clock3, ClipboardPlus, Eye, Layers3, ListChecks, ListOrdered, Shapes } from "lucide-react";

// One DPS sheet (2026-10, admin revamp): Back to Learning Path Studio, the
// sheet's four settings as the admin tiles, and its three actions as one
// primary and two secondary buttons (they were three different styles).
export default function AdminDpsPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ dpsId: string }>();
  const router = useRouter();
  const dpsId = params.dpsId;
  const config = useQuery({ queryKey: ["admin-dps", dpsId], queryFn: () => getDpsConfig(dpsId), enabled: ready });
  const preview = useMutation({ mutationFn: () => generateDpsPreview(dpsId) });
  if (!ready) return null;
  const Minutes = config.data ? Math.floor(config.data.defaultDurationSeconds / 60) : 0;
  return (
    <AppShell title="DPS Preview">
      {config.isLoading ? <LoadingState /> : null}
      {config.error ? <ErrorState message={apiErrorMessage(config.error)} /> : null}
      {config.data ? (
        <div className="space-y-6">
          <div className="ad-back-row">
            <button type="button" className="ad-back" onClick={() => router.push("/admin/curriculum")}>
              <ArrowLeft size={16} />
              Back To Learning Path Studio
            </button>
          </div>
          <section className="math-hero">
            <div className="ad-hero-stack relative z-10">
              <div>
                <p className="math-block-header">
                  <Layers3 size={14} />
                  DPS {config.data.dpsNumber}
                </p>
                <h1 className="math-title">{config.data.dpsTitle}</h1>
                <p className="math-subtitle">Preview the questions this sheet generates, assign it, or open its results.</p>
              </div>
              <div className="ad-hero-tiles">
                <Info icon={<ListOrdered size={18} />} label="Questions" value={config.data.defaultQuestionCount} />
                <Info icon={<Clock3 size={18} />} label="Time" value={`${Minutes} ${Minutes === 1 ? "Min" : "Mins"}`} />
                <Info icon={<ListChecks size={18} />} label="Answer Type" value={config.data.answerType} />
                <Info icon={<Shapes size={18} />} label="Options" value={config.data.optionsPerQuestion} />
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="math-button-primary" onClick={() => preview.mutate()} disabled={preview.isPending}>
                  <Eye size={16} />
                  {preview.isPending ? "Generating…" : "Generate Preview"}
                </button>
                <button className="math-button-secondary" onClick={() => router.push(`/admin/assignments/create?dpsId=${dpsId}`)}>
                  <ClipboardPlus size={16} />
                  Create Assignment
                </button>
                <button className="math-button-secondary" onClick={() => router.push(`/admin/results/dps/${dpsId}`)}>
                  <BarChart3 size={16} />
                  View Results
                </button>
              </div>
            </div>
          </section>
          {preview.error ? <ErrorState message={apiErrorMessage(preview.error)} /> : null}
          {preview.data ? <AdminQuestionPreview questions={preview.data.questions} /> : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-5">
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </div>
  );
}
