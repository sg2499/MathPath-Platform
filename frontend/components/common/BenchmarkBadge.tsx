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
  const IsBelow = Boolean(requiresAttention) || status === "BELOW_BENCHMARK";
  const Label = IsBelow ? "Benchmark Not Met" : status === "PENDING" ? "Pending" : "Benchmark Met";
  const ToneClass = IsBelow ? "math-tone-danger" : status === "PENDING" ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200" : "math-tone-success";

  return <span className={`math-badge ${ToneClass}`}>{Label}</span>;
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
