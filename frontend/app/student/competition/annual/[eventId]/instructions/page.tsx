"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAnnualCompetitionInstructions, startAnnualCompetitionAttempt } from "@/lib/api/student";
import { apiErrorDetail, apiErrorMessage } from "@/lib/api";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, ClipboardList, Clock3, Hourglass, Layers3, PlayCircle, ShieldCheck, Trophy } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function FormatDuration(seconds: number) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) return `${minutes} Min${minutes !== 1 ? "s" : ""} ${secs} Sec${secs !== 1 ? "s" : ""}`;
  if (minutes) return `${minutes} Min${minutes !== 1 ? "s" : ""}`;
  return `${secs} Sec${secs !== 1 ? "s" : ""}`;
}

function FormatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AnnualCompetitionInstructionsPage() {
  return (
    <Suspense fallback={null}>
      <AnnualCompetitionInstructionsContent />
    </Suspense>
  );
}

function AnnualCompetitionInstructionsContent() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ eventId: string }>();
  const Router = useRouter();
  const EventId = Params.eventId;

  const Query = useQuery({
    queryKey: ["annual-competition-instructions", EventId],
    queryFn: () => getAnnualCompetitionInstructions(EventId),
    enabled: Ready && !!EventId,
  });

  const Mutation = useMutation({
    mutationFn: () => startAnnualCompetitionAttempt(EventId),
    onSuccess: (Data) => Router.push(`/student/competition/annual/attempt/${Data.attemptId}`),
  });

  if (!Ready) return null;

  // The slot-gate check (_CheckSlotGate) only runs server-side, on Start --
  // this screen can always be viewed once assigned, so a blocked Start
  // surfaces here as a mutation error, not a query error. Shown as a
  // specific "not open yet" card rather than generic error text, since it's
  // an expected, actionable state (come back at the scheduled time), not a
  // failure.
  const SlotGateDetail = apiErrorDetail(Mutation.error);
  const IsSlotGated = SlotGateDetail?.code === "COMPETITION_SLOT_NOT_OPEN_YET";

  return (
    <AppShell title="Annual Competition">
      {Query.isLoading ? <LoadingState label="Loading competition instructions..." /> : null}
      {Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : null}

      {Query.data ? (
        <section className="grid min-h-[calc(100vh-170px)] w-full grid-rows-[auto_1fr] gap-4">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10">
              <div className="math-block-header mb-2"><Trophy size={14} /> Annual Competition · {Query.data.assignedLevelCode}</div>
              <h1 className="mt-2 max-w-5xl text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {Query.data.eventName}
              </h1>
              <p className="math-subtitle !mt-2 max-w-3xl">
                Review each section before you begin. Once started, sections run one at a time and cannot be revisited.
              </p>
            </div>
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
              <div>
                <div className="math-block-header mb-2"><Brain size={14} /> Sections</div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">What You Will Encounter</h2>
              </div>

              <div className="mt-4 grid gap-2 rounded-[22px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
                {Query.data.sections.map((Section) => (
                  <div
                    key={Section.sectionNumber}
                    className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 font-black leading-6 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
                      <div>
                        <span className="inline-flex items-center gap-2">
                          <Layers3 size={14} className="text-sky-600 dark:text-sky-300" />
                          Section {Section.sectionNumber}: {Section.sectionTitle}
                        </span>
                        <span className="block mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {Section.mode ? `${Section.mode} · ` : ""}Focus: {Section.conceptFamily}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-1 rounded-lg w-fit">
                          {Section.questionCount} Questions
                        </span>
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg w-fit">
                          {FormatDuration(Section.timeLimitSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                  <ShieldCheck size={17} />
                  <p className="font-black">Before You Begin</p>
                </div>
                <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-blue-900/90 dark:text-blue-100 sm:grid-cols-2">
                  {Query.data.instructions.map((Item) => <li key={Item} className="flex gap-2"><span>•</span><span>{Item}</span></li>)}
                </ul>
              </div>
            </div>

            <aside className="grid items-start gap-4 h-fit">
              <div className="rounded-[32px] border border-white/70 bg-white/92 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <h3 className="text-xl font-black text-slate-950 dark:text-white mb-6">Competition Details</h3>

                <div className="grid gap-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                      <ClipboardList size={18} className="text-blue-500" />
                      <span className="font-semibold text-sm">Sections</span>
                    </div>
                    <span className="text-lg font-black text-slate-900 dark:text-white">{Query.data.sections.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                      <Clock3 size={18} className="text-amber-500" />
                      <span className="font-semibold text-sm">Total Duration</span>
                    </div>
                    <span className="text-lg font-black text-slate-900 dark:text-white">{FormatDuration(Query.data.totalDurationSeconds)}</span>
                  </div>

                  {Query.data.slot ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                        <Hourglass size={18} className="text-emerald-500" />
                        <span className="font-semibold text-sm">Your Slot</span>
                      </div>
                      <span className="text-right text-sm font-black text-slate-900 dark:text-white">{FormatDateTime(Query.data.slot.scheduledStartAt)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400 mb-4">
                    Ready to begin? Each section is timed separately and locks once you move on -- your answers save automatically.
                  </p>
                  <button className="math-button-primary w-full shadow-lg shadow-orange-500/20" disabled={Mutation.isPending || !EventId} onClick={() => Mutation.mutate()}>
                    <PlayCircle size={18} />
                    {Mutation.isPending ? "Starting..." : "Start Competition"}
                  </button>
                  {IsSlotGated ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/80 p-3 text-xs font-bold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                      Your slot hasn't opened yet. It opens at {FormatDateTime((SlotGateDetail?.details?.scheduledStartAt as string) || null)}.
                    </div>
                  ) : Mutation.error ? (
                    <div className="mt-4"><ErrorState message={apiErrorMessage(Mutation.error)} /></div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
