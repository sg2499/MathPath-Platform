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

export default function AdminDpsPage() {
  const ready = useProtectedPage(["ADMIN", "TEACHER", "SUPER_ADMIN"]);
  const params = useParams<{ dpsId: string }>();
  const router = useRouter();
  const dpsId = params.dpsId;
  const config = useQuery({ queryKey: ["admin-dps", dpsId], queryFn: () => getDpsConfig(dpsId), enabled: ready });
  const preview = useMutation({ mutationFn: () => generateDpsPreview(dpsId) });
  if (!ready) return null;
  return (
    <AppShell title="DPS Preview">
      {config.isLoading ? <LoadingState /> : null}
      {config.error ? <ErrorState message={apiErrorMessage(config.error)} /> : null}
      {config.data ? (
        <div className="space-y-5">
          <div className="math-card p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">DPS {config.data.dpsNumber}</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900">{config.data.dpsTitle}</h1>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Info label="Questions" value={config.data.defaultQuestionCount} />
              <Info label="Time" value={`${Math.floor(config.data.defaultDurationSeconds / 60)} mins`} />
              <Info label="Type" value={config.data.answerType} />
              <Info label="Options" value={config.data.optionsPerQuestion} />
            </div>
            <div className="mt-5 flex gap-3">
              <button className="math-button-primary" onClick={() => preview.mutate()} disabled={preview.isPending}>{preview.isPending ? "Generating..." : "Generate Preview"}</button>
              <button className="math-button-secondary" onClick={() => router.push(`/admin/assignments/create?dpsId=${dpsId}`)}>Create Assignment</button>
              <button className="math-role-action-button px-4 py-2.5 text-sm" onClick={() => router.push(`/admin/results/dps/${dpsId}`)}>View Results</button>
            </div>
          </div>
          {preview.error ? <ErrorState message={apiErrorMessage(preview.error)} /> : null}
          {preview.data ? <AdminQuestionPreview questions={preview.data.questions} /> : null}
        </div>
      ) : null}
    </AppShell>
  );
}
function Info({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="text-lg font-black text-slate-900">{value}</p></div>; }
