"use client";

import { AppShell } from "@/components/common/AppShell";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  ANNUAL_COMPETITION_LEVEL_CODES,
  createAnnualCompetitionSlot,
  generateAnnualCompetitionLevelPaper,
  getAnnualCompetitionEventOverview,
  linkAnnualCompetitionLevelPaper,
  overrideAnnualCompetitionAssignment,
  previewAnnualCompetitionAssignments,
  runAnnualCompetitionAssignments,
  updateAnnualCompetitionEvent,
  updateAnnualCompetitionSectionTimer,
  type AnnualCompetitionAssignmentPreviewRow,
  type AnnualCompetitionLevelPaper,
} from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Link2,
  Lock,
  PlusCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserCog,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

// A level with no curriculum Level/registry entry yet (Package 2 finding) --
// "Generate Official Paper" would just 409 here, so the UI steers straight to
// "Link Existing" instead of offering a button that can only fail. Kept as a
// small, clearly-commented allow-list rather than inferred, since the whole
// point is that this is a KNOWN, tracked gap, not a guess.
const LevelCodesWithNoGenerationYet = new Set(["MM-L2"]);

function SectionTitle({ kicker, title, description, icon }: { kicker: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="math-block-header">{icon}{kicker}</p>
      <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const StatusValue = String(status || "").toUpperCase();
  const ChipClass =
    StatusValue === "LOCKED"
      ? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
      : StatusValue === "READY"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${ChipClass}`}>{StatusValue === "LOCKED" && <Lock size={11} />}{StatusValue || "PENDING"}</span>;
}

function FormatDateTime(Value: string | null) {
  if (!Value) return "Not set";
  try {
    return new Date(Value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return Value;
  }
}

function ToLocalInputValue(IsoValue: string | null): string {
  if (!IsoValue) return "";
  const D = new Date(IsoValue);
  if (Number.isNaN(D.getTime())) return "";
  const Pad = (N: number) => String(N).padStart(2, "0");
  return `${D.getFullYear()}-${Pad(D.getMonth() + 1)}-${Pad(D.getDate())}T${Pad(D.getHours())}:${Pad(D.getMinutes())}`;
}

const TabList = ["SLOTS", "PAPERS", "ASSIGNMENTS"] as const;
type TabKey = (typeof TabList)[number];
const TabLabels: Record<TabKey, string> = { SLOTS: "Slots", PAPERS: "Level Papers", ASSIGNMENTS: "Assignments" };

export default function AdminAnnualCompetitionEventDetailPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Params = useParams<{ eventId: string }>();
  const EventId = Params.eventId;
  const QueryClient = useQueryClient();

  const [ActiveTab, SetActiveTab] = useState<TabKey>("SLOTS");
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  // --- Slot form state ---
  const [SlotMode, SetSlotMode] = useState("OFFLINE");
  const [SlotLabel, SetSlotLabel] = useState("");
  const [SlotStart, SetSlotStart] = useState("");
  const [SlotEnd, SetSlotEnd] = useState("");
  const [SlotLevelCodes, SetSlotLevelCodes] = useState<string[]>([]);

  // --- Link-existing-paper form state, keyed by level code ---
  const [LinkMockExamIdByLevel, SetLinkMockExamIdByLevel] = useState<Record<string, string>>({});

  // --- Manual override form state ---
  const [OverrideStudentId, SetOverrideStudentId] = useState("");
  const [OverrideLevelCode, SetOverrideLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

  const OverviewQuery = useQuery({
    queryKey: ["admin", "annual-competition", "overview", EventId],
    queryFn: () => getAnnualCompetitionEventOverview(EventId),
    enabled: Ready && Boolean(EventId),
  });
  const Overview = OverviewQuery.data;

  const PreviewQuery = useQuery({
    queryKey: ["admin", "annual-competition", "preview", EventId],
    queryFn: () => previewAnnualCompetitionAssignments(EventId),
    enabled: Ready && Boolean(EventId) && ActiveTab === "ASSIGNMENTS",
  });

  const InvalidateOverview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "overview", EventId] });
  const InvalidatePreview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "preview", EventId] });
  const InvalidateEventsList = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });

  const SetLockedMutation = useMutation({
    mutationFn: (Status: string) => updateAnnualCompetitionEvent(EventId, { status: Status }),
    onSuccess: (Updated) => {
      SetLastMessage(`Event status set to ${Updated.status}.`);
      InvalidateOverview();
      InvalidateEventsList();
    },
  });

  const ReleaseResultsMutation = useMutation({
    mutationFn: () => updateAnnualCompetitionEvent(EventId, { resultsReleaseAt: new Date().toISOString() }),
    onSuccess: () => {
      SetLastMessage("Results release date set to now -- every linked level paper is now locked.");
      InvalidateOverview();
    },
  });

  const CreateSlotMutation = useMutation({
    mutationFn: () =>
      createAnnualCompetitionSlot(EventId, {
        mode: SlotMode,
        slotLabel: SlotLabel.trim() || undefined,
        scheduledStartAt: new Date(SlotStart).toISOString(),
        scheduledEndAt: new Date(SlotEnd).toISOString(),
        applicableLevelCodes: SlotLevelCodes,
      }),
    onSuccess: () => {
      SetLastMessage("Slot created.");
      SetSlotLabel("");
      SetSlotStart("");
      SetSlotEnd("");
      SetSlotLevelCodes([]);
      InvalidateOverview();
    },
  });

  const GeneratePaperMutation = useMutation({
    mutationFn: (LevelCode: string) => generateAnnualCompetitionLevelPaper(EventId, LevelCode),
    onSuccess: (Result) => {
      SetLastMessage(`Official paper generated for ${Result.competitionLevelCode}.`);
      InvalidateOverview();
    },
  });

  const LinkPaperMutation = useMutation({
    mutationFn: ({ LevelCode, MockExamId }: { LevelCode: string; MockExamId: string }) =>
      linkAnnualCompetitionLevelPaper(EventId, LevelCode, MockExamId),
    onSuccess: (Result) => {
      SetLastMessage(`Existing mock exam linked as ${Result.competitionLevelCode}'s official paper.`);
      InvalidateOverview();
    },
  });

  const UpdateTimerMutation = useMutation({
    mutationFn: ({ SectionTimerId, TimeLimitSeconds }: { SectionTimerId: string; TimeLimitSeconds: number }) =>
      updateAnnualCompetitionSectionTimer(SectionTimerId, { timeLimitSeconds: TimeLimitSeconds }),
    onSuccess: () => InvalidateOverview(),
  });

  const RunEngineMutation = useMutation({
    mutationFn: () => runAnnualCompetitionAssignments(EventId),
    onSuccess: (Result) => {
      SetLastMessage(`Assignment engine run: ${Result.created} created, ${Result.updated} updated, ${Result.skippedAdminOverrides} admin overrides preserved, ${Result.noRuleMatched} not matched.`);
      InvalidatePreview();
    },
  });

  const OverrideMutation = useMutation({
    mutationFn: () => overrideAnnualCompetitionAssignment(EventId, { studentId: OverrideStudentId.trim(), assignedLevelCode: OverrideLevelCode }),
    onSuccess: () => {
      SetLastMessage(`Assignment overridden for student ${OverrideStudentId.trim()}.`);
      SetOverrideStudentId("");
      InvalidatePreview();
    },
  });

  if (!Ready) return null;
  if (OverviewQuery.isLoading) {
    return (
      <AppShell title="Annual Competition Studio">
        <LoadingState label="Loading event..." />
      </AppShell>
    );
  }
  if (OverviewQuery.error || !Overview) {
    return (
      <AppShell title="Annual Competition Studio">
        <ErrorState message={apiErrorMessage(OverviewQuery.error) || "Event not found."} />
      </AppShell>
    );
  }

  const AnyError =
    OverviewQuery.error ||
    PreviewQuery.error ||
    CreateSlotMutation.error ||
    GeneratePaperMutation.error ||
    LinkPaperMutation.error ||
    UpdateTimerMutation.error ||
    RunEngineMutation.error ||
    OverrideMutation.error ||
    SetLockedMutation.error ||
    ReleaseResultsMutation.error;

  return (
    <AppShell title="Annual Competition Studio">
      <section className="space-y-6">
        <Link href="/admin/competition/annual-studio" className="inline-flex items-center gap-2 text-xs font-black text-[color:var(--mp-role-primary)]">
          <ArrowLeft size={14} />
          Back to Annual Competition Studio
        </Link>

        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />{Overview.event.status}</p>
          <h1 className="math-title">{Overview.event.name}</h1>
          <div className="mt-3 flex flex-wrap gap-6 text-sm font-bold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-2"><CalendarClock size={14} />Competition: {FormatDateTime(Overview.event.competitionDate)}</span>
            <span className="inline-flex items-center gap-2"><Lock size={14} />Results release: {FormatDateTime(Overview.event.resultsReleaseAt)}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {["DRAFT", "SCHEDULED", "LIVE", "COMPLETED"].map((StatusOption) => (
              <button
                key={StatusOption}
                type="button"
                disabled={SetLockedMutation.isPending || Overview.event.status === StatusOption}
                onClick={() => SetLockedMutation.mutate(StatusOption)}
                className={`rounded-full border px-4 py-1.5 text-xs font-black transition disabled:cursor-not-allowed ${
                  Overview.event.status === StatusOption
                    ? "border-[color:var(--mp-role-border-strong)] bg-[image:var(--mp-role-action-bg)] text-white"
                    : "border-[color:var(--mp-role-border)] bg-white text-slate-600 hover:-translate-y-px dark:bg-slate-950/40 dark:text-slate-300"
                }`}
              >
                {StatusOption}
              </button>
            ))}
            {!Overview.event.resultsReleaseAt && (
              <button
                type="button"
                disabled={ReleaseResultsMutation.isPending}
                onClick={() => {
                  if (window.confirm("Setting the results release date locks every linked level paper permanently. Continue?")) {
                    ReleaseResultsMutation.mutate();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-1.5 text-xs font-black text-rose-700 transition hover:-translate-y-px dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
              >
                <Lock size={13} />
                Release Results (locks all papers)
              </button>
            )}
          </div>
        </div>

        {AnyError && <ErrorState message={apiErrorMessage(AnyError)} />}
        {LastMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastMessage}
          </div>
        )}

        {Overview.slotDurationConflicts.length > 0 && (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-black text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="inline-flex items-center gap-2"><AlertTriangle size={16} />Slot duration conflicts (REQUIREMENTS.md item 7)</p>
            <ul className="mt-2 space-y-1 text-xs font-bold">
              {Overview.slotDurationConflicts.map((Conflict, Index) => (
                <li key={Index}>
                  {Conflict.slotLabel || Conflict.slotId} is {Math.round(Conflict.slotDurationSeconds / 60)} min, but {Conflict.levelCode} needs {Math.round(Conflict.requiredSeconds / 60)} min
                  ({Math.round(Conflict.shortBySeconds / 60)} min short).
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="math-card p-3">
          <div className="flex flex-wrap gap-3">
            {TabList.map((Tab) => (
              <button
                key={Tab}
                type="button"
                onClick={() => SetActiveTab(Tab)}
                aria-selected={ActiveTab === Tab}
                className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
              >
                {TabLabels[Tab]}
              </button>
            ))}
          </div>
        </div>

        {ActiveTab === "SLOTS" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle icon={<PlusCircle size={14} />} kicker="New Slot" title="Create Time Slot" description="Fully data-driven -- fix the known IM-4/MM-2 duration conflict here by widening a slot or moving a level to its own slot, no deploy required." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Mode
                  <select value={SlotMode} onChange={(EventValue) => SetSlotMode(EventValue.target.value)} className="math-input">
                    <option value="OFFLINE">Offline</option>
                    <option value="ONLINE_INDIA">Online (India)</option>
                    <option value="ONLINE_INTL">Online (International)</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Slot Label (optional)
                  <input value={SlotLabel} onChange={(EventValue) => SetSlotLabel(EventValue.target.value)} placeholder="Example: 2:00-2:30 PM" className="math-input" />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Start
                  <input type="datetime-local" value={SlotStart} onChange={(EventValue) => SetSlotStart(EventValue.target.value)} className="math-input" />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  End
                  <input type="datetime-local" value={SlotEnd} onChange={(EventValue) => SetSlotEnd(EventValue.target.value)} className="math-input" />
                </label>
              </div>
              <div className="mt-4">
                <p className="text-sm font-black text-slate-700 dark:text-slate-200">Applicable Levels</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => {
                    const IsChecked = SlotLevelCodes.includes(LevelCode);
                    return (
                      <button
                        key={LevelCode}
                        type="button"
                        onClick={() =>
                          SetSlotLevelCodes((Prev) => (Prev.includes(LevelCode) ? Prev.filter((Code) => Code !== LevelCode) : [...Prev, LevelCode]))
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-black transition ${
                          IsChecked
                            ? "border-[color:var(--mp-role-border-strong)] bg-[image:var(--mp-role-action-bg)] text-white"
                            : "border-[color:var(--mp-role-border)] bg-white text-slate-600 dark:bg-slate-950/40 dark:text-slate-300"
                        }`}
                      >
                        {LevelCode}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  disabled={!SlotStart || !SlotEnd || CreateSlotMutation.isPending}
                  onClick={() => CreateSlotMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusCircle size={16} />
                  {CreateSlotMutation.isPending ? "Creating..." : "Create Slot"}
                </button>
              </div>
            </div>

            <div className="math-card p-5">
              <SectionTitle icon={<CalendarClock size={14} />} kicker="Slots" title="Scheduled Slots" description="" />
              {Overview.slots.length === 0 ? (
                <div className="mt-5">
                  <EmptyState title="No slots yet" description="Create the first slot above." />
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {Overview.slots.map((SlotItem) => (
                    <div key={SlotItem.slotId} className="rounded-2xl border border-[color:var(--mp-role-border)] bg-white p-4 dark:bg-slate-950/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-950 dark:text-white">
                          {SlotItem.slotLabel || SlotItem.mode} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">({SlotItem.mode})</span>
                        </p>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{SlotItem.durationMinutes} min</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {FormatDateTime(SlotItem.scheduledStartAt)} &rarr; {FormatDateTime(SlotItem.scheduledEndAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {SlotItem.applicableLevelCodes.map((LevelCode) => (
                          <span key={LevelCode} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                            {LevelCode}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {ActiveTab === "PAPERS" && (
          <div className="space-y-4">
            {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => {
              const LevelPaper: AnnualCompetitionLevelPaper | undefined = Overview.levelPapers.find((Paper) => Paper.competitionLevelCode === LevelCode);
              const CanGenerate = !LevelCodesWithNoGenerationYet.has(LevelCode) && (!LevelPaper || LevelPaper.status !== "LOCKED");
              const CanLink = !LevelPaper || LevelPaper.status !== "LOCKED";
              return (
                <div key={LevelCode} className="math-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-slate-950 dark:text-white">{LevelCode}</p>
                      {LevelPaper?.mockExamTitle && <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{LevelPaper.mockExamTitle}</p>}
                    </div>
                    <StatusChip status={LevelPaper?.status || "PENDING"} />
                  </div>

                  {LevelCodesWithNoGenerationYet.has(LevelCode) && (
                    <p className="mt-3 inline-flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                      No curriculum level exists for {LevelCode} yet (Package 2 finding) -- link an existing mock exam once one is built, generation is disabled here on purpose.
                    </p>
                  )}

                  {LevelPaper && LevelPaper.sectionTimers.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {LevelPaper.sectionTimers.map((Timer) => (
                        <div key={Timer.sectionTimerId} className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--mp-role-border)] bg-white px-3 py-2 dark:bg-slate-950/40">
                          <span className="text-xs font-black text-slate-700 dark:text-slate-200">{Timer.sectionNumber}. {Timer.sectionTitle}</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              defaultValue={Math.round(Timer.timeLimitSeconds / 60)}
                              disabled={LevelPaper.status === "LOCKED" || UpdateTimerMutation.isPending}
                              onBlur={(EventValue) => {
                                const Minutes = Number(EventValue.target.value);
                                if (Minutes > 0 && Minutes * 60 !== Timer.timeLimitSeconds) {
                                  UpdateTimerMutation.mutate({ SectionTimerId: Timer.sectionTimerId, TimeLimitSeconds: Minutes * 60 });
                                }
                              }}
                              className="math-input w-16 px-2 py-1 text-xs"
                            />
                            <span className="text-[11px] font-bold text-slate-400">min</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {CanGenerate && (
                      <button
                        type="button"
                        disabled={GeneratePaperMutation.isPending}
                        onClick={() => GeneratePaperMutation.mutate(LevelCode)}
                        className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Sparkles size={14} />
                        {LevelPaper?.mockExamId ? "Regenerate Official Paper" : "Generate Official Paper"}
                      </button>
                    )}
                    {CanLink && (
                      <div className="inline-flex items-center gap-2">
                        <input
                          value={LinkMockExamIdByLevel[LevelCode] || ""}
                          onChange={(EventValue) => SetLinkMockExamIdByLevel((Prev) => ({ ...Prev, [LevelCode]: EventValue.target.value }))}
                          placeholder="Existing mock exam ID"
                          className="math-input w-52 px-3 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          disabled={!LinkMockExamIdByLevel[LevelCode]?.trim() || LinkPaperMutation.isPending}
                          onClick={() => LinkPaperMutation.mutate({ LevelCode, MockExamId: LinkMockExamIdByLevel[LevelCode].trim() })}
                          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                        >
                          <Link2 size={14} />
                          Link Existing
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ActiveTab === "ASSIGNMENTS" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle icon={<ClipboardList size={14} />} kicker="Assignment Engine" title="Preview &amp; Run" description="Preview never writes anything -- review the computed mapping before committing. Re-running never overwrites a row already marked ADMIN_OVERRIDE." />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={PreviewQuery.isFetching}
                  onClick={() => PreviewQuery.refetch()}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                >
                  <RefreshCcw size={14} />
                  {PreviewQuery.isFetching ? "Refreshing..." : "Refresh Preview"}
                </button>
                <button
                  type="button"
                  disabled={RunEngineMutation.isPending}
                  onClick={() => RunEngineMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  {RunEngineMutation.isPending ? "Running..." : "Run Assignment Engine"}
                </button>
              </div>

              {PreviewQuery.data && (
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                  <span>{PreviewQuery.data.totalStudentsConsidered} considered</span>
                  <span className="text-emerald-600 dark:text-emerald-300">{PreviewQuery.data.wouldAssignCount} would assign</span>
                  <span className="text-amber-600 dark:text-amber-300">{PreviewQuery.data.noRuleMatchedCount} no rule matched</span>
                  <span className="text-slate-500">{PreviewQuery.data.adminOverridePreservedCount} overrides preserved</span>
                </div>
              )}

              {PreviewQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Computing preview..." /></div>
              ) : PreviewQuery.data && PreviewQuery.data.rows.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs font-bold">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Current Level</th>
                        <th className="px-2 py-1.5">Computed Level</th>
                        <th className="px-2 py-1.5">Existing</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PreviewQuery.data.rows.map((Row: AnnualCompetitionAssignmentPreviewRow) => (
                        <tr key={Row.studentId} className="border-t border-[color:var(--mp-role-border)]">
                          <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                          <td className="px-2 py-2">{Row.currentLevelCode || "--"}</td>
                          <td className="px-2 py-2">
                            {Row.computedAssignedLevelCode || "--"}
                            {Row.requiresNewPaperRegistryEntry && Row.computedAssignedLevelCode && (
                              <ShieldAlert size={12} className="ml-1.5 inline text-amber-500" aria-label="No paper registry entry yet" />
                            )}
                          </td>
                          <td className="px-2 py-2">{Row.existingAssignedLevelCode || "--"} {Row.existingAssignmentSource === "ADMIN_OVERRIDE" && <span className="text-slate-400">(override)</span>}</td>
                          <td className="px-2 py-2">
                            {Row.noRuleMatched ? (
                              <span className="text-amber-600 dark:text-amber-300">{Row.reason}</span>
                            ) : Row.wouldOverwriteAdminOverride ? (
                              <span className="text-slate-400">preserved</span>
                            ) : Row.wouldChangeOnRun ? (
                              <span className="text-emerald-600 dark:text-emerald-300">would assign</span>
                            ) : (
                              <span className="text-slate-400">no change</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No students considered yet" description="Refresh the preview once students exist and current levels are set." />
                </div>
              )}
            </div>

            <div className="math-card p-5">
              <SectionTitle icon={<UserCog size={14} />} kicker="Manual Override" title="Override One Student's Assignment" description="Sets assignment_source = ADMIN_OVERRIDE -- the assignment engine will never touch this row again on a future run." />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Student ID
                  <input value={OverrideStudentId} onChange={(EventValue) => SetOverrideStudentId(EventValue.target.value)} className="math-input" />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Assigned Level
                  <select value={OverrideLevelCode} onChange={(EventValue) => SetOverrideLevelCode(EventValue.target.value)} className="math-input">
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!OverrideStudentId.trim() || OverrideMutation.isPending}
                  onClick={() => OverrideMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserCog size={16} />
                  {OverrideMutation.isPending ? "Saving..." : "Override Assignment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
