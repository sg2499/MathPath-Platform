"use client";

import { AppShell } from "@/components/common/AppShell";
import { BackButton } from "@/components/student/BackButton";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { apiErrorMessage } from "@/lib/api";
import { getStudentAssessmentDetail, startAssessmentAttempt } from "@/lib/api/student";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { InitCaps } from "@/lib/initCaps";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, Brain, ClipboardCheck, ClipboardList, Clock3, Keyboard, Layers3, PlayCircle, RotateCcw, ShieldCheck, Target } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";

function FormatDuration(Seconds: number) {
  const Total = Math.max(0, Number(Seconds || 0));
  const Minutes = Math.floor(Total / 60);
  const Rest = Total % 60;
  if (Minutes && Rest) return `${Minutes} Min${Minutes !== 1 ? "s" : ""} ${Rest} Sec${Rest !== 1 ? "s" : ""}`;
  if (Minutes) return `${Minutes} Min${Minutes !== 1 ? "s" : ""}`;
  return `${Rest} Sec${Rest !== 1 ? "s" : ""}`;
}

function FormatMarks(Value: number) {
  return Number.isInteger(Value) ? String(Value) : Value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// 2026-10-11 (Shailesh): the assessment brief, laid out like the Annual
// Competition's instructions page -- the paper's sections with their question
// counts and marks, "Before You Begin", and a details card with Start.
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

  const Data = Query.data;
  const Sections = Data?.sections || [];
  const ShowResult = Data?.action === "View Result";
  const CanStart = Data ? !ShowResult || Boolean(Data.canRetake) : false;
  const StartLabel = Mutation.isPending
    ? "Starting..."
    : Data?.action === "Resume Assessment"
      ? "Resume Assessment"
      : ShowResult
        ? "Take It Again"
        : "Start Assessment";

  return (
    <AppShell title="Level Assessment">
      <BackButton href="/student/assessments" />
      {Query.isLoading ? <LoadingState label="Loading assessment details..." /> : null}
      {Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : null}

      {Data ? (
        <section className="grid min-h-[calc(100vh-170px)] w-full grid-rows-[auto_1fr] gap-4">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10">
              <div className="math-block-header mb-2">
                <ClipboardCheck size={14} /> Level Assessment · {Data.levelCode || Data.moduleCode || "Level"}
              </div>
              <h1 className="mt-2 w-full text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {Data.title}
              </h1>
              <p className="math-subtitle !mt-2 w-full">
                {Data.levelName ? `This assessment covers everything taught in ${Data.levelName}. ` : "This assessment covers everything taught in your level. "}
                Read the sections and the rules below, then start when you are ready.
              </p>
            </div>
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
              <div>
                <div className="math-block-header mb-2"><Brain size={14} /> Sections</div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">What You Will Encounter</h2>
              </div>

              {Sections.length ? (
                <div className="mt-4 grid gap-2 rounded-[22px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
                  {Sections.map((Section) => (
                    <div
                      key={Section.sectionNumber}
                      className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 font-black leading-6 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <Layers3 size={14} className="shrink-0 text-sky-600 dark:text-sky-300" />
                          <span className="min-w-0 break-words">
                            Section {Section.sectionNumber}{Section.title ? `: ${Section.title}` : ""}
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-fit rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                            {Section.questionCount} {Section.questionCount === 1 ? "Question" : "Questions"}
                          </span>
                          <span className="w-fit rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            {FormatMarks(Section.marksPerQuestion)} {Section.marksPerQuestion === 1 ? "Mark" : "Marks"} Each
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="se-brief mt-4 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                  <ShieldCheck size={17} />
                  <p className="font-black">Before You Begin</p>
                </div>
                <ul className="se-brief-list mt-3 grid gap-2 text-sm font-semibold leading-6 text-blue-900/90 dark:text-blue-100">
                  {(Data.instructions || []).map((Item) => (
                    <li key={Item} className="flex min-w-0 items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span className="min-w-0 flex-1 break-words">{InitCaps(Item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <aside className="grid h-fit items-start gap-4">
              <div className="rounded-[32px] border border-white/70 bg-white/92 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <h3 className="mb-6 text-xl font-black text-slate-950 dark:text-white">Assessment Details</h3>

                <div className="grid gap-5">
                  <DetailRow icon={<ClipboardList size={18} className="text-blue-500" />} label="Questions" value={Data.details.questions || 0} />
                  {Sections.length > 1 ? (
                    <DetailRow icon={<Layers3 size={18} className="text-sky-500" />} label="Sections" value={Sections.length} />
                  ) : null}
                  <DetailRow icon={<Award size={18} className="text-violet-500" />} label="Total Marks" value={FormatMarks(Data.details.totalMarks || 100)} />
                  <DetailRow icon={<Clock3 size={18} className="text-amber-500" />} label="Total Duration" value={FormatDuration(Data.details.durationSeconds)} />
                  <DetailRow icon={<Target size={18} className="text-emerald-500" />} label="Score To Clear" value={`${FormatMarks(Data.details.benchmarkPercentage)}%`} />
                  <DetailRow icon={<Keyboard size={18} className="text-rose-500" />} label="Answers" value="Typed" />
                </div>

                <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
                  <p className="mb-4 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                    {Data.action === "Resume Assessment"
                      ? "Your assessment is in progress and the timer is still running. Resume to carry on where you left off."
                      : ShowResult && Data.canRetake
                        ? "Test account: you can take this assessment again. Each try is marked on its own."
                        : ShowResult
                          ? "You have completed this assessment. Open your result to see how you did."
                          : "The timer starts when you press Start and does not pause. Your answers save automatically."}
                  </p>
                  {CanStart ? (
                    <button
                      className="math-button-primary w-full shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Mutation.isPending}
                      onClick={() => Mutation.mutate()}
                    >
                      {ShowResult ? <RotateCcw size={18} /> : <PlayCircle size={18} />}
                      {StartLabel}
                    </button>
                  ) : null}
                  {ShowResult ? (
                    <button
                      className={`math-role-action-button w-full px-4 py-3 text-sm ${CanStart ? "mt-3" : ""}`}
                      onClick={() => Router.push(`/student/assessment-result/${Data.resultAttemptId || Data.attemptId}`)}
                    >
                      View Result
                    </button>
                  ) : null}
                  {Mutation.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(Mutation.error)} /></div> : null}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <span className="text-right text-lg font-black text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
