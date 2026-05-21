"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { apiErrorMessage } from "@/lib/api";
import { getStudentAssessmentDetail, startAssessmentAttempt } from "@/lib/api/student";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, BookOpenCheck, ClipboardList, Clock3, PlayCircle, ShieldCheck, Target } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export default function StudentAssessmentStartPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ assignmentId: string }>();
  const Router = useRouter();
  const AssignmentId = Params.assignmentId;

  const Query = useQuery({
    queryKey: ["student-assessment-detail", AssignmentId],
    queryFn: () => getStudentAssessmentDetail(AssignmentId),
    enabled: Ready && Boolean(AssignmentId),
  });

  const Mutation = useMutation({
    mutationFn: () => startAssessmentAttempt(AssignmentId),
    onSuccess: (Data) => Router.push(`/student/assessment-attempt/${Data.attemptId}`),
  });

  if (!Ready) return null;

  return (
    <AppShell title="Assessment Brief">
      {Query.isLoading ? <LoadingState label="Loading assessment details..." /> : null}
      {Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : null}

      {Query.data ? (
        <section className="grid min-h-[calc(100vh-170px)] w-full grid-rows-[auto_1fr] gap-4">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="math-kicker">{Query.data.moduleCode || "Module"} · {Query.data.levelCode || "Level"}</p>
                <h1 className="mt-2 max-w-5xl text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                  {Query.data.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Review the assessment details and begin when ready.
                </p>
              </div>
              <div className="rounded-2xl bg-white/75 px-4 py-3 text-right shadow-sm ring-1 ring-white/70 dark:bg-slate-900/70 dark:ring-slate-700">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Benchmark</p>
                <p className="text-2xl font-black text-slate-950 dark:text-white">{Query.data.details.benchmarkPercentage}%</p>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  <Target size={20} />
                </div>
                <div>
                  <p className="math-kicker">Assessment Focus</p>
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">Level Assessment</h2>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] bg-slate-50/90 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                This assessment checks your understanding across the selected level. Answer each question carefully before submitting.
              </div>

              <div className="mt-4 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                  <ShieldCheck size={17} />
                  <p className="font-black">Before You Begin</p>
                </div>
                <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-blue-900/90 dark:text-blue-100 sm:grid-cols-2">
                  {(Query.data.instructions || []).map((Item: string) => <li key={Item} className="flex gap-2"><span>•</span><span>{Item}</span></li>)}
                </ul>
              </div>
            </div>

            <aside className="grid gap-4">
              <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <h3 className="text-xl font-black text-slate-950 dark:text-white">Assessment Details</h3>
                <div className="mt-4 grid gap-3">
                  <InfoCard icon={<ClipboardList size={17} />} label="Questions" value={Query.data.details.questions || 0} />
                  <InfoCard icon={<Award size={17} />} label="Total Marks" value={Query.data.details.totalMarks || 100} />
                  <InfoCard icon={<Clock3 size={17} />} label="Time" value={`${Math.floor((Query.data.details.durationSeconds || 0) / 60)} Mins`} />
                  <InfoCard icon={<BookOpenCheck size={17} />} label="Type" value="MCQ" />
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                  Start when ready. Your answers will auto-save during the assessment.
                </p>
                <button className="math-button-primary mt-4 w-full" disabled={Mutation.isPending || Query.data.action === "View Result"} onClick={() => Mutation.mutate()}>
                  <PlayCircle size={18} />
                  {Mutation.isPending ? "Starting..." : Query.data.action === "Resume Assessment" ? "Resume Assessment" : "Start Assessment"}
                </button>
                {Query.data.action === "View Result" ? <button className="math-role-action-button mt-3 w-full px-4 py-3 text-sm" onClick={() => Router.push(`/student/assessment-result/${Query.data.resultAttemptId || Query.data.attemptId}`)}>View Result</button> : null}
                {Mutation.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(Mutation.error)} /></div> : null}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-[22px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
      <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">{icon}{label}</div>
      <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
