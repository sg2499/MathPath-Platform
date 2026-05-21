import { Loader2 } from "lucide-react";

export function LoadingState({
  label,
  message,
  rows = 3,
}: {
  label?: string;
  message?: string;
  rows?: number;
}) {
  const Text = label || message || "Loading...";
  const SkeletonRows = Array.from({ length: Math.max(1, rows) }, (_, Index) => Index);

  return (
    <div className="math-panel math-loading-state text-center" role="status" aria-live="polite">
      <div className="mx-auto flex h-14 w-14 items-center justify-center math-icon-shell-blue math-loading-orb">
        <Loader2 size={22} className="animate-spin" />
      </div>
      <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">Please Wait</p>
      <p className="mx-auto mt-2 max-w-xl text-base font-semibold leading-7 text-slate-600 dark:text-slate-300">{Text}</p>
      <div className="mx-auto mt-5 w-full max-w-2xl space-y-3" aria-hidden="true">
        {SkeletonRows.map((Index) => (
          <div key={Index} className="math-skeleton-row" style={{ animationDelay: `${Index * 90}ms` }}>
            <span className="math-skeleton-dot" />
            <span className="math-skeleton-line math-skeleton-line-wide" />
            <span className="math-skeleton-line math-skeleton-line-short" />
          </div>
        ))}
      </div>
    </div>
  );
}
