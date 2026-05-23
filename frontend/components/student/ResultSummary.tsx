import type { AttemptResult } from "@/types/result";
import { formatSeconds, resultMessage } from "@/lib/utils";
import { Award, BookOpenCheck, CheckCircle2, Clock3, Target, XCircle, AlertTriangle } from "lucide-react";
import { StudentPerformanceFeedback } from "@/components/common/PerformanceFeedback";
import type { ReactNode } from "react";

function RetryWorkflowCard({ result }: { result: AttemptResult }) {
  const Workflow = result.retryWorkflow;
  const Summary = result.summary;
  const BenchmarkPercentage = Number(Summary.benchmarkPercentage || 70);
  const AccuracyPercentage = Number(Summary.accuracyPercentage || 0);
  const BenchmarkStatus = String(Summary.benchmarkStatus || result.benchmarkState || "").toUpperCase();
  const ExplicitCleared = BenchmarkStatus.includes("MET") || BenchmarkStatus.includes("CLEAR") || Summary.requiresAttention === false;
  const FallbackCleared = AccuracyPercentage >= BenchmarkPercentage;
  const IsCleared = ExplicitCleared || FallbackCleared || Workflow?.state === "CLEARED";

  const State = IsCleared ? "CLEARED" : Workflow?.state || "RETRY_REQUIRED";
  const IsManualReview = !IsCleared && (State === "MANUAL_REVIEW_REQUIRED" || Boolean(Workflow?.requiresManualIntervention || result.requiresManualIntervention));

  const Title = IsCleared ? "Benchmark Achieved" : Workflow?.title || (IsManualReview ? "Additional Review Required" : "More Practice Recommended");
  const Message = IsCleared
    ? "Excellent work! You have successfully achieved the benchmark for this practice sheet."
    : Workflow?.message || (IsManualReview
      ? "This practice now needs teacher review before another re-attempt can be opened."
      : "You are improving, but the required benchmark has not been achieved yet.");
  const Guidance = IsCleared
    ? "You may now continue your learning journey with the next assigned practice."
    : Workflow?.guidance || (IsManualReview
      ? "Your teacher will review the attempt and guide the next step before more practice is opened."
      : "Your next re-attempt practice sheet has already been assigned in the Practice tab. Open Practice, complete the highlighted sheet, and continue only after finishing that focused practice.");

  const ToneClass = IsCleared
    ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-950/35 dark:text-emerald-50"
    : IsManualReview
      ? "border-rose-200/80 bg-rose-50/90 text-rose-950 dark:border-rose-400/35 dark:bg-rose-950/35 dark:text-rose-50"
      : "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-400/35 dark:bg-amber-950/35 dark:text-amber-50";

  const IconClass = IsCleared
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
    : IsManualReview
      ? "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200"
      : "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200";

  const Icon = IsCleared ? <CheckCircle2 size={22} /> : IsManualReview ? <AlertTriangle size={22} /> : <BookOpenCheck size={22} />;

  return (
    <div className={`mt-5 rounded-[28px] border p-5 shadow-sm ${ToneClass}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${IconClass}`}>
          {Icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-black tracking-tight">{Title}</h2>
            {typeof Workflow?.attemptNumber === "number" ? (
              <span className="w-fit rounded-full border border-current/20 bg-white/50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] dark:bg-white/10">
                {Workflow.attemptNumber <= 0 ? "Original" : `Re-Attempt ${Workflow.attemptNumber}`}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-bold leading-6 opacity-95">{Message}</p>
          <p className="mt-1 text-sm font-semibold leading-6 opacity-85">{Guidance}</p>
        </div>
      </div>
    </div>
  );
}

export function ResultSummary({ result }: { result: AttemptResult }) {
  const s = result.summary;

  return (
    <>
    <div className="math-card overflow-hidden p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="math-kicker">Result Overview</p>
          <h1 className="mt-3 text-4xl font-black text-slate-950 dark:text-white">Score: {s.score} / {s.maxScore}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
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

      <RetryWorkflowCard result={result} />

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
        previousAccuracy={result.retryWorkflow?.previousAccuracyPercentage}
        attemptNumber={result.retryWorkflow?.attemptNumber ?? result.attemptNumber ?? 0}
        showNeedsPracticeNextStep={Boolean(result.retryWorkflow?.showTeacherGuidance || result.requiresManualIntervention)}
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
