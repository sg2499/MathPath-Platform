"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getDpsInstructions, startAttempt } from "@/lib/api/student";
import { apiErrorMessage } from "@/lib/api";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, ClipboardList, Clock3, PlayCircle, ShieldCheck, BookOpenCheck } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

type ConceptSection = {
  sectionNumber?: number | null;
  sectionTitle?: string | null;
  questionCount?: number | null;
  conceptFamily?: string | null;
  operationFocus?: string | null;
};

function conceptSectionParts(Item: ConceptSection, Index: number) {
  const SectionNumber = Item.sectionNumber || Index + 1;
  const SectionTitle = Item.sectionTitle || Item.operationFocus || Item.conceptFamily || "MathPath Practice";
  return { SectionNumber, SectionTitle };
}


export default function DpsInstructionPage() {
  return (
    <Suspense fallback={null}>
      <DpsInstructionPageContent />
    </Suspense>
  );
}

function DpsInstructionPageContent() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ dpsId: string }>();
  const SearchParams = useSearchParams();
  const Router = useRouter();

  const AssignmentId = SearchParams.get("assignmentId") || "";
  const DpsId = Params.dpsId;

  const Query = useQuery({
    queryKey: ["dps-instructions", DpsId],
    queryFn: () => getDpsInstructions(DpsId),
    enabled: Ready,
  });

  const Mutation = useMutation({
    mutationFn: () => startAttempt({ assignmentId: AssignmentId, dpsId: DpsId, mode: "PRACTICE" }),
    onSuccess: (Data) => Router.push(`/student/attempt/${Data.attemptId}`),
  });

  if (!Ready) return null;

  return (
    <AppShell title="Practice Brief">
      {Query.isLoading ? <LoadingState label="Loading DPS instructions..." /> : null}
      {Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : null}

      {Query.data ? (
        <section className="grid min-h-[calc(100vh-170px)] w-full grid-rows-[auto_1fr] gap-4">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10">
              <div className="math-block-header mb-2"><BookOpenCheck size={14} /> Lesson {Query.data.lessonNumber} · DPS {Query.data.dpsNumber}</div>
              <h1 className="mt-2 w-full text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {Query.data.title}
              </h1>
              <p className="math-subtitle !mt-2 max-w-3xl">
                Review the practice details, read the instructions, and begin when ready.
              </p>
            </div>
          </div>

          <div className="grid min-h-0 items-start gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
              <div>
                <div className="math-block-header mb-2"><Brain size={14} /> Concept Focus</div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">What You Will Practice</h2>
              </div>

              <div className="mt-4 rounded-[22px] bg-slate-50/90 p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                {Array.isArray(Query.data.concept?.sections) && Query.data.concept.sections.length > 0 ? (
                  <div className="grid gap-2">
                    {Query.data.concept.sections.map((Item: ConceptSection, Index: number) => {
                      const { SectionNumber, SectionTitle } = conceptSectionParts(Item, Index);
                      return (
                        <div
                          key={`${Item.sectionNumber || Index}-${Item.sectionTitle || Index}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 font-black leading-6 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100"
                        >
                          <span>Section {SectionNumber} - {SectionTitle}</span>
                          {typeof Item.questionCount === "number" ? (
                            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                              {Item.questionCount} Qs
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  Query.data.concept?.description || Query.data.concept?.abacusRule || "MathPath practice"
                )}
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
                <h3 className="text-xl font-black text-slate-950 dark:text-white">Practice Details</h3>
                <div className="mt-4 grid gap-3">
                  <InfoCard icon={<ClipboardList size={17} />} label="Questions" value={Query.data.testSettings?.questionCount ?? "—"} tone="blue" />
                  <InfoCard icon={<Clock3 size={17} />} label="Time" value={`${Math.floor((Query.data.testSettings?.durationSeconds || 600) / 60)} Mins`} tone="amber" />
                  <InfoCard icon={<Brain size={17} />} label="Type" value="Type Your Answer" tone="emerald" />
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-white/92 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                  Start when ready. Your answers will auto-save during the attempt.
                </p>
                <button className="math-button-primary mt-4 w-full" disabled={Mutation.isPending || !AssignmentId} onClick={() => Mutation.mutate()}>
                  <PlayCircle size={18} />
                  {Mutation.isPending ? "Starting..." : "Start Practice"}
                </button>
                {Mutation.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(Mutation.error)} /></div> : null}
                {!AssignmentId ? <p className="mt-3 text-sm font-semibold text-amber-600">Missing assignment ID. Open this DPS from the dashboard.</p> : null}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

const INFO_CARD_TONES = {
  blue: {
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
    label: "text-blue-700 dark:text-blue-300",
  },
  amber: {
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    label: "text-amber-700 dark:text-amber-300",
  },
  emerald: {
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    label: "text-emerald-700 dark:text-emerald-300",
  },
} as const;

function InfoCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone: keyof typeof INFO_CARD_TONES;
}) {
  const Tone = INFO_CARD_TONES[tone];
  return (
    <div className="flex items-center gap-3 rounded-[22px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${Tone.chip}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-xs font-black uppercase tracking-[0.12em] ${Tone.label}`}>{label}</p>
        <p className="mt-1 truncate text-xl font-black text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
