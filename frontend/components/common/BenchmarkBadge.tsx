"use client";

export const BENCHMARK_PERCENTAGE = 70;

export function BenchmarkBadge({
  status,
  requiresAttention,
  percentage,
}: {
  status?: string | null;
  requiresAttention?: boolean | null;
  percentage?: number | null;
}) {
  const NormalizedStatus = String(status || "").toUpperCase().replace(/[^A-Z]/g, "");
  const IsPending = !NormalizedStatus || NormalizedStatus.includes("PENDING");
  const IsBelow = Boolean(requiresAttention) || NormalizedStatus.includes("BELOW") || NormalizedStatus.includes("NOTMET") || NormalizedStatus.includes("NEEDSREATTEMPT") || NormalizedStatus.includes("MANUALINTERVENTION");
  const Label = IsPending ? "Pending" : IsBelow ? "Benchmark Not Met" : "Benchmark Met";
  const ToneClass = IsPending ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200" : IsBelow ? "math-tone-danger" : "math-tone-success";

  return <span className={`math-badge whitespace-nowrap ${ToneClass}`}>{Label}</span>;
}

export function BenchmarkAlert({ show, message }: { show?: boolean | null; message?: string | null }) {
  if (!show) return null;

  return (
    <div className="rounded-[28px] border p-5 shadow-sm backdrop-blur-2xl math-tone-danger">
      <p className="text-xs font-black uppercase tracking-[0.18em]">Needs Re-Attempt</p>
      <p className="mt-2 text-sm font-bold leading-6 opacity-90">
        {message ||
          `This work is below the ${BENCHMARK_PERCENTAGE}% benchmark. Review the mistakes, provide corrective guidance, and help the student strengthen accuracy before the next attempt.`}
      </p>
    </div>
  );
}
