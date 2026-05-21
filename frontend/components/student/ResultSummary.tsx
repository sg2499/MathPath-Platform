import type { AttemptResult } from "@/types/result";
import { formatSeconds, resultMessage } from "@/lib/utils";
import { Award, CheckCircle2, Clock3, Target, XCircle } from "lucide-react";
import { StudentPerformanceFeedback } from "@/components/common/PerformanceFeedback";
import type { ReactNode } from "react";

export function ResultSummary({ result }: { result: AttemptResult }) {
  const s = result.summary;

  return (
    <>
    <div className="math-card overflow-hidden p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="math-kicker">Result Overview</p>
          <h1 className="mt-3 text-4xl font-black text-slate-950">Score: {s.score} / {s.maxScore}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {result.message || resultMessage(s.accuracyPercentage)}
          </p>
        </div>

        <div className="math-result-accuracy-card">
          <div className="math-result-accuracy-icon">
            <Award size={22} />
          </div>
          <div>
            <p className="math-result-accuracy-label">Accuracy</p>
            <p className="math-result-accuracy-value">{s.accuracyPercentage}%</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={<Target size={18} />} label="Accuracy" value={`${s.accuracyPercentage}%`} />
        <Metric icon={<CheckCircle2 size={18} />} label="Correct" value={s.correct} />
        <Metric icon={<XCircle size={18} />} label="Wrong" value={s.wrong} />
        <Metric icon={<Target size={18} />} label="Unanswered" value={s.unanswered} />
        <Metric icon={<Clock3 size={18} />} label="Time" value={formatSeconds(s.timeTakenSeconds ?? 0)} />
      </div>
    </div>

    <div className="mt-5">
      <StudentPerformanceFeedback
        accuracy={s.accuracyPercentage}
        seed={`${(result as any).attemptId || ""}-${s.score}-${s.accuracyPercentage}`}
      />
    </div>
    </>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-slate-50/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-slate-800 dark:bg-slate-900/70">
      <div className="inline-flex rounded-2xl bg-white p-2 text-[color:var(--mp-role-readable)] shadow-sm dark:bg-slate-950">{icon}</div>
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
