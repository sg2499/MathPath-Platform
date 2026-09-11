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
  PRACTICE_BATCH_QUANTITY_OPTIONS,
  batchAssignAnnualCompetitionPracticePapers,
  createAnnualCompetitionSlot,
  downloadAnnualCompetitionCertificate,
  generateAnnualCompetitionLevelPaper,
  getAnnualCompetitionEventOverview,
  getAnnualCompetitionLiveMonitoring,
  getAnnualCompetitionPracticeBank,
  grantAnnualCompetitionAttemptRetry,
  linkAnnualCompetitionLevelPaper,
  listAnnualCompetitionAttemptRetryGrants,
  listAnnualCompetitionPracticeResults,
  listAnnualCompetitionResults,
  overrideAnnualCompetitionAssignment,
  previewAnnualCompetitionAssignments,
  rankAnnualCompetitionResults,
  recomputeAnnualCompetitionResults,
  reconcileAnnualCompetitionAttempts,
  releaseAnnualCompetitionResults,
  runAnnualCompetitionAssignments,
  updateAnnualCompetitionEvent,
  updateAnnualCompetitionSectionTimer,
  updateAnnualCompetitionSlot,
  type AnnualCompetitionAssignmentPreviewRow,
  type AnnualCompetitionLevelPaper,
  type AnnualCompetitionLiveMonitoringRow,
  type AnnualCompetitionPracticeResultRow,
  type AnnualCompetitionResultRow,
  type AnnualCompetitionSlot,
} from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Link2,
  Lock,
  Medal,
  Pencil,
  PlusCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  UserCog,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

function triggerBlobDownload(BlobValue: Blob, FileName: string) {
  const Url = window.URL.createObjectURL(BlobValue);
  const Anchor = document.createElement("a");
  Anchor.href = Url;
  Anchor.download = FileName;
  document.body.appendChild(Anchor);
  Anchor.click();
  Anchor.remove();
  window.URL.revokeObjectURL(Url);
}

// Package 8 (admin leaderboard polish): Rank 1/2/3 get a medal-colored
// badge instead of a plain number, so the existing Rank & Release table
// (already the admin-facing leaderboard -- see pkg-08's own note) reads
// like one at a glance without needing a separate page.
function RankBadge({ Rank }: { Rank: number | null }) {
  if (!Rank) return <span>--</span>;
  const MedalStyle =
    Rank === 1
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      : Rank === 2
        ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        : Rank === 3
          ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
          : "";
  if (!MedalStyle) return <span>{Rank}</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${MedalStyle}`}>
      <Medal size={12} />#{Rank}
    </span>
  );
}

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

// Phase F (Competition Practice, admin Studio frontend): PRACTICE is the
// Official/Practice switcher itself -- rather than a toggle nested inside
// an existing tab, practice gets its own top-level tab here, matching this
// page's own existing pattern of one tab per concern (ASSIGNMENTS vs.
// MONITORING vs. RESULTS are already separate tabs, never merged with a
// switch). RESULTS stays exactly as it was (OFFICIAL-only, never mixed
// with practice -- see ListAnnualCompetitionPracticeResultsForAdmin's own
// backend docstring).
const TabList = ["SLOTS", "PAPERS", "ASSIGNMENTS", "MONITORING", "RESULTS", "PRACTICE"] as const;
type TabKey = (typeof TabList)[number];
const TabLabels: Record<TabKey, string> = {
  SLOTS: "Slots",
  PAPERS: "Level Papers",
  ASSIGNMENTS: "Assignments",
  MONITORING: "Live Monitoring",
  RESULTS: "Results",
  PRACTICE: "Practice",
};

const LiveStatusTone: Record<AnnualCompetitionLiveMonitoringRow["liveStatus"], string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  STUCK: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
};

function LiveStatusChip({ status }: { status: AnnualCompetitionLiveMonitoringRow["liveStatus"] }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${LiveStatusTone[status]}`}>{status.replace("_", " ")}</span>;
}

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

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

  // --- Slot edit form state -- a slot's own row switches into this inline
  // form when EditingSlotId matches it; the Create form above is untouched.
  // Delete is the same soft-delete-via-isActive:false pattern this schema
  // already uses for Assignment.is_active ("Archive"), not a hard DELETE --
  // ListCompetitionEventSlots already filters is_active == True, so an
  // edited-out slot just stops appearing here without needing a new
  // backend endpoint (UpdateCompetitionEventSlot already accepts isActive).
  const [EditingSlotId, SetEditingSlotId] = useState<string | null>(null);
  const [EditSlotMode, SetEditSlotMode] = useState("OFFLINE");
  const [EditSlotLabel, SetEditSlotLabel] = useState("");
  const [EditSlotStart, SetEditSlotStart] = useState("");
  const [EditSlotEnd, SetEditSlotEnd] = useState("");
  const [EditSlotLevelCodes, SetEditSlotLevelCodes] = useState<string[]>([]);

  // --- Link-existing-paper form state, keyed by level code ---
  const [LinkMockExamIdByLevel, SetLinkMockExamIdByLevel] = useState<Record<string, string>>({});

  // --- Manual override form state ---
  const [OverrideStudentId, SetOverrideStudentId] = useState("");
  const [OverrideLevelCode, SetOverrideLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

  // --- Point 1 (2026-09-08): inline per-row override on the Assignments
  // preview table itself. This is a pure UX front-end onto the exact same
  // overrideAnnualCompetitionAssignment call the Manual Override form below
  // already uses -- the auto-picker stays the source of truth by default,
  // this only ever fires when an admin explicitly picks a row's dropdown
  // and clicks Apply. Keyed by studentId so each row's pending selection is
  // independent and never clobbers another row's.
  const [RowOverrideLevelByStudentId, SetRowOverrideLevelByStudentId] = useState<Record<string, string>>({});

  // --- Points 2 & 3 (Shailesh, 2026-09-08): search/filter the Assignments
  // preview table, and select a subset of students to run the assignment
  // engine against. Search/module/level are pure client-side filters over
  // the already-fetched preview rows (same approach as Practice Control's
  // Assignments search) -- no extra round trip per keystroke. Selection is
  // deliberately NOT persisted anywhere (Shailesh: "let's have the option
  // to select each time" -- this same screen doubles as a dry run for
  // practice exams, so a fresh, explicit selection every run is the right
  // default, not a permanent enrollment flag).
  const [AssignmentSearchText, SetAssignmentSearchText] = useState("");
  const [AssignmentModuleFilter, SetAssignmentModuleFilter] = useState<string>("ALL");
  const [AssignmentLevelFilter, SetAssignmentLevelFilter] = useState<string>("ALL");
  const [SelectedStudentIdsForRun, SetSelectedStudentIdsForRun] = useState<Set<string>>(new Set());

  // --- Monitoring / Results (Package 7) ---
  const [ResultsLevelFilter, SetResultsLevelFilter] = useState<string>("ALL");
  const [RankLevelCode, SetRankLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

  // --- Practice (Phase F): batch-assign + bank lookup share one student/
  // level context -- the natural admin workflow is "look up a student's
  // bank, see it's running low, assign more for the same level" -- while
  // PracticeBankLookup is only ever set by the explicit "View Bank" click
  // below (never fired on every keystroke), same pattern as this page's
  // other explicit-action lookups (Preview, Manual Override).
  const [PracticeStudentId, SetPracticeStudentId] = useState("");
  const [PracticeLevelCode, SetPracticeLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const [PracticeQuantity, SetPracticeQuantity] = useState<number>(PRACTICE_BATCH_QUANTITY_OPTIONS[0]);
  const [PracticeBankLookup, SetPracticeBankLookup] = useState<{ StudentId: string; LevelCode: string } | null>(null);
  const [PracticeResultsLevelFilter, SetPracticeResultsLevelFilter] = useState<string>("ALL");

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

  const LiveMonitoringQuery = useQuery({
    queryKey: ["admin", "annual-competition", "monitoring-live", EventId],
    queryFn: () => getAnnualCompetitionLiveMonitoring(EventId),
    enabled: Ready && Boolean(EventId) && ActiveTab === "MONITORING",
    // Genuinely "live" -- auto-refresh while the tab is open, same spirit
    // as the reconciliation sweep it sits next to (this never mutates
    // anything itself, it only reads more often).
    refetchInterval: ActiveTab === "MONITORING" ? 15000 : false,
  });

  const ResultsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "results", EventId, ResultsLevelFilter],
    queryFn: () => listAnnualCompetitionResults(EventId, ResultsLevelFilter === "ALL" ? undefined : ResultsLevelFilter),
    enabled: Ready && Boolean(EventId) && ActiveTab === "RESULTS",
  });

  const PracticeBankQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-bank", EventId, PracticeBankLookup?.StudentId, PracticeBankLookup?.LevelCode],
    queryFn: () => getAnnualCompetitionPracticeBank(EventId, PracticeBankLookup!.StudentId, PracticeBankLookup!.LevelCode),
    enabled: Ready && Boolean(EventId) && ActiveTab === "PRACTICE" && Boolean(PracticeBankLookup),
  });

  const PracticeResultsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-results", EventId, PracticeResultsLevelFilter],
    queryFn: () =>
      listAnnualCompetitionPracticeResults(EventId, {
        competitionLevelCode: PracticeResultsLevelFilter === "ALL" ? undefined : PracticeResultsLevelFilter,
      }),
    enabled: Ready && Boolean(EventId) && ActiveTab === "PRACTICE",
  });

  const InvalidateOverview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "overview", EventId] });
  const InvalidatePreview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "preview", EventId] });
  const InvalidateEventsList = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
  const InvalidateLiveMonitoring = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "monitoring-live", EventId] });
  const InvalidateResults = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "results", EventId] });
  const InvalidatePracticeBank = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "practice-bank", EventId] });
  const InvalidatePracticeResults = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "practice-results", EventId] });

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

  const StartEditingSlot = (SlotItem: AnnualCompetitionSlot) => {
    SetEditingSlotId(SlotItem.slotId);
    SetEditSlotMode(SlotItem.mode);
    SetEditSlotLabel(SlotItem.slotLabel || "");
    SetEditSlotStart(ToLocalInputValue(SlotItem.scheduledStartAt));
    SetEditSlotEnd(ToLocalInputValue(SlotItem.scheduledEndAt));
    SetEditSlotLevelCodes(SlotItem.applicableLevelCodes);
  };

  const CancelEditingSlot = () => SetEditingSlotId(null);

  const UpdateSlotMutation = useMutation({
    mutationFn: (SlotId: string) =>
      updateAnnualCompetitionSlot(SlotId, {
        mode: EditSlotMode,
        slotLabel: EditSlotLabel.trim() || null,
        scheduledStartAt: new Date(EditSlotStart).toISOString(),
        scheduledEndAt: new Date(EditSlotEnd).toISOString(),
        applicableLevelCodes: EditSlotLevelCodes,
      }),
    onSuccess: () => {
      SetLastMessage("Slot updated.");
      SetEditingSlotId(null);
      InvalidateOverview();
    },
  });

  // Soft delete (isActive: false), matching the Assignment "Archive" pattern
  // used elsewhere in this admin panel -- a slot already referenced by an
  // assignment (slot_id) keeps working for that assignment (the attempt-gate
  // check reads the slot by id regardless of isActive), it just stops
  // showing up here and can no longer be picked for new assignments/slots
  // lists. Confirmed before deleting, same as this page's other
  // consequential actions (Release Results, Reconciliation Sweep).
  const DeleteSlotMutation = useMutation({
    mutationFn: (SlotId: string) => updateAnnualCompetitionSlot(SlotId, { isActive: false }),
    onSuccess: () => {
      SetLastMessage("Slot deleted.");
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

  // Point 3: when any students are selected in the preview table, the run
  // is scoped to exactly those (matches PreviewAnnualCompetitionAssignments/
  // RunAnnualCompetitionAssignmentEngine's already-existing studentIds
  // filter on the backend) -- otherwise unchanged "run for everyone
  // considered" behaviour.
  const RunEngineMutation = useMutation({
    mutationFn: () =>
      runAnnualCompetitionAssignments(EventId, SelectedStudentIdsForRun.size > 0 ? Array.from(SelectedStudentIdsForRun) : undefined),
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

  // Point 1: same call as OverrideMutation above, just fed from a preview
  // row's own dropdown instead of the separate text-field form. Tracked as
  // its own mutation (rather than reusing OverrideMutation) so a save on
  // one row never shows a pending/disabled state on an unrelated row or on
  // the Manual Override form.
  const RowOverrideMutation = useMutation({
    mutationFn: (Vars: { StudentId: string; LevelCode: string }) =>
      overrideAnnualCompetitionAssignment(EventId, { studentId: Vars.StudentId, assignedLevelCode: Vars.LevelCode }),
    onSuccess: (_Result, Vars) => {
      SetLastMessage(`Assignment overridden for student ${Vars.StudentId}.`);
      SetRowOverrideLevelByStudentId((Prev) => {
        const Next = { ...Prev };
        delete Next[Vars.StudentId];
        return Next;
      });
      InvalidatePreview();
    },
  });

  const ReconcileMutation = useMutation({
    mutationFn: () => reconcileAnnualCompetitionAttempts(EventId),
    onSuccess: (Result) => {
      SetLastMessage(`Reconciliation sweep: ${Result.reconciledCount} abandoned attempt${Result.reconciledCount === 1 ? "" : "s"} force-closed.`);
      InvalidateLiveMonitoring();
    },
  });

  const RankResultsMutation = useMutation({
    mutationFn: (LevelCode: string) => rankAnnualCompetitionResults(EventId, LevelCode),
    onSuccess: (Result) => {
      SetLastMessage(`Ranked ${Result.rankedCount} result${Result.rankedCount === 1 ? "" : "s"} for ${Result.competitionLevelCode}.`);
      InvalidateResults();
    },
  });

  const ReleaseResultsForLevelMutation = useMutation({
    mutationFn: (LevelCode: string | null) => releaseAnnualCompetitionResults(EventId, LevelCode),
    onSuccess: (Result) => {
      SetLastMessage(`Released ${Result.releasedCount} result${Result.releasedCount === 1 ? "" : "s"}${Result.competitionLevelCode ? ` for ${Result.competitionLevelCode}` : " across every level"}.`);
      InvalidateResults();
    },
  });

  // Package 8 (certificate half): admin can preview/download any
  // student's certificate regardless of release -- see the client
  // function's own comment for why (matches this table's "admin sees
  // everything" convention already used for the release gate itself).
  const [DownloadingAttemptId, SetDownloadingAttemptId] = useState<string | null>(null);
  const CertificateMutation = useMutation({
    mutationFn: (Row: AnnualCompetitionResultRow) => downloadAnnualCompetitionCertificate(Row.attemptId).then((BlobValue) => ({ BlobValue, Row })),
    onMutate: (Row) => SetDownloadingAttemptId(Row.attemptId),
    onSuccess: ({ BlobValue, Row }) => {
      triggerBlobDownload(BlobValue, `MathPath-Annual-Competition-Certificate-${(Row.studentName || Row.studentCode || Row.studentId).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
    },
    onSettled: () => SetDownloadingAttemptId(null),
  });

  // Point 10 (Shailesh, 2026-09-08): refreshes already-finalized results
  // under the (now-fixed) scoring formula -- see RecomputeAnnualCompetitionResults's
  // own docstring. Never touches release/rank.
  const RecomputeResultsMutation = useMutation({
    mutationFn: () => recomputeAnnualCompetitionResults(EventId, ResultsLevelFilter === "ALL" ? undefined : ResultsLevelFilter),
    onSuccess: (Result) => {
      SetLastMessage(`Recomputed ${Result.recomputedCount} result${Result.recomputedCount === 1 ? "" : "s"}${Result.competitionLevelCode ? ` for ${Result.competitionLevelCode}` : " across every level"}.`);
      InvalidateResults();
    },
  });

  // Phase F: generates Quantity fresh, always-different practice papers and
  // adds them to PracticeStudentId's bank -- never touches or consumes any
  // paper already there (safe to call repeatedly to top up). Automatically
  // (re-)loads the bank view for the exact student+level just assigned, so
  // an admin sees the new papers land without a second manual click.
  const BatchAssignPracticeMutation = useMutation({
    mutationFn: () =>
      batchAssignAnnualCompetitionPracticePapers(EventId, {
        studentId: PracticeStudentId.trim(),
        competitionLevelCode: PracticeLevelCode,
        quantity: PracticeQuantity,
      }),
    onSuccess: (Result) => {
      SetLastMessage(`Assigned ${Result.quantityAssigned} practice paper${Result.quantityAssigned === 1 ? "" : "s"} of ${Result.competitionLevelCode} to ${Result.studentCode || Result.studentId}.`);
      SetPracticeBankLookup({ StudentId: Result.studentId, LevelCode: Result.competitionLevelCode });
      InvalidatePracticeBank();
      InvalidatePracticeResults();
    },
  });

  // Point 10: which students already have an unused retry grant pending,
  // so the Results-table button can reflect that instead of letting an
  // admin fire a second grant into the "one already exists" 409 -- fetched
  // alongside Results, keyed by studentId (an assignment/student pairing
  // is unique per event, so studentId is an unambiguous match here even
  // though the grant itself is keyed on assignmentId).
  const RetryGrantsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "retry-grants", EventId],
    queryFn: () => listAnnualCompetitionAttemptRetryGrants(EventId),
    enabled: Ready && Boolean(EventId) && ActiveTab === "RESULTS",
  });
  const PendingRetryGrantStudentIds = new Set(
    (RetryGrantsQuery.data?.grants || []).filter((Grant) => Grant.status === "APPROVED").map((Grant) => Grant.studentId)
  );

  const RetryMutation = useMutation({
    mutationFn: ({ Row, Reason }: { Row: AnnualCompetitionResultRow; Reason: string }) => grantAnnualCompetitionAttemptRetry(Row.attemptId, Reason),
    onSuccess: (_Result, { Row }) => {
      SetLastMessage(`Retry granted for ${Row.studentName || Row.studentCode || Row.studentId} -- they can start a fresh attempt on the same paper next time they log in.`);
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "retry-grants", EventId] });
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
    ReleaseResultsMutation.error ||
    (ActiveTab === "MONITORING" ? LiveMonitoringQuery.error : null) ||
    (ActiveTab === "RESULTS" ? ResultsQuery.error : null) ||
    (ActiveTab === "PRACTICE" ? PracticeBankQuery.error || PracticeResultsQuery.error : null) ||
    ReconcileMutation.error ||
    RankResultsMutation.error ||
    ReleaseResultsForLevelMutation.error ||
    CertificateMutation.error ||
    RecomputeResultsMutation.error ||
    BatchAssignPracticeMutation.error ||
    RetryMutation.error;

  // Points 2 & 3: derived, client-side view of the preview table --
  // search text + module/level dropdowns narrow which rows are VISIBLE;
  // selection (for the Run scope) is independent of the current filter so
  // switching filters never silently drops an earlier selection.
  const AssignmentRows = PreviewQuery.data?.rows || [];
  const AssignmentModuleOptions = Array.from(
    new Set(AssignmentRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();
  const AssignmentLevelOptions = Array.from(
    new Set(AssignmentRows.map((Row) => Row.currentLevelCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();
  const AssignmentSearchLower = AssignmentSearchText.trim().toLowerCase();
  const FilteredAssignmentRows = AssignmentRows.filter((Row) => {
    if (AssignmentModuleFilter !== "ALL" && Row.currentModuleCode !== AssignmentModuleFilter) return false;
    if (AssignmentLevelFilter !== "ALL" && Row.currentLevelCode !== AssignmentLevelFilter) return false;
    if (AssignmentSearchLower) {
      const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
      if (!Haystack.includes(AssignmentSearchLower)) return false;
    }
    return true;
  });
  const AllFilteredAssignmentRowsSelected =
    FilteredAssignmentRows.length > 0 && FilteredAssignmentRows.every((Row) => SelectedStudentIdsForRun.has(Row.studentId));
  const ToggleSelectAllFilteredAssignmentRows = () => {
    SetSelectedStudentIdsForRun((Prev) => {
      const Next = new Set(Prev);
      if (AllFilteredAssignmentRowsSelected) {
        FilteredAssignmentRows.forEach((Row) => Next.delete(Row.studentId));
      } else {
        FilteredAssignmentRows.forEach((Row) => Next.add(Row.studentId));
      }
      return Next;
    });
  };
  const ToggleOneAssignmentRowSelected = (StudentId: string) => {
    SetSelectedStudentIdsForRun((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(StudentId)) Next.delete(StudentId);
      else Next.add(StudentId);
      return Next;
    });
  };

  return (
    <AppShell title="Annual Competition Studio">
      <section className="space-y-6">
        <Link href="/admin/competition/annual-studio" className="math-button-secondary inline-flex items-center gap-2 px-4 py-2 text-xs">
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
            {["DRAFT", "SCHEDULED", "COMPLETED"].map((StatusOption) => (
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
                  {Overview.slots.map((SlotItem) =>
                    EditingSlotId === SlotItem.slotId ? (
                      <div key={SlotItem.slotId} className="rounded-2xl border border-[color:var(--mp-role-border-strong)] bg-white p-4 dark:bg-slate-950/40">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Mode
                            <select value={EditSlotMode} onChange={(EventValue) => SetEditSlotMode(EventValue.target.value)} className="math-input">
                              <option value="OFFLINE">Offline</option>
                              <option value="ONLINE_INDIA">Online (India)</option>
                              <option value="ONLINE_INTL">Online (International)</option>
                            </select>
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Slot Label (optional)
                            <input value={EditSlotLabel} onChange={(EventValue) => SetEditSlotLabel(EventValue.target.value)} placeholder="Example: 2:00-2:30 PM" className="math-input" />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Start
                            <input type="datetime-local" value={EditSlotStart} onChange={(EventValue) => SetEditSlotStart(EventValue.target.value)} className="math-input" />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            End
                            <input type="datetime-local" value={EditSlotEnd} onChange={(EventValue) => SetEditSlotEnd(EventValue.target.value)} className="math-input" />
                          </label>
                        </div>
                        <div className="mt-4">
                          <p className="text-sm font-black text-slate-700 dark:text-slate-200">Applicable Levels</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => {
                              const IsChecked = EditSlotLevelCodes.includes(LevelCode);
                              return (
                                <button
                                  key={LevelCode}
                                  type="button"
                                  onClick={() =>
                                    SetEditSlotLevelCodes((Prev) => (Prev.includes(LevelCode) ? Prev.filter((Code) => Code !== LevelCode) : [...Prev, LevelCode]))
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
                        {UpdateSlotMutation.isError && (
                          <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-300">{apiErrorMessage(UpdateSlotMutation.error)}</p>
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={!EditSlotStart || !EditSlotEnd || UpdateSlotMutation.isPending}
                            onClick={() => UpdateSlotMutation.mutate(SlotItem.slotId)}
                            className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                            {UpdateSlotMutation.isPending ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={CancelEditingSlot}
                            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition hover:-translate-y-px dark:bg-slate-950/40 dark:text-slate-300"
                          >
                            <X size={16} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={SlotItem.slotId} className="rounded-2xl border border-[color:var(--mp-role-border)] bg-white p-4 dark:bg-slate-950/40">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-950 dark:text-white">
                            {SlotItem.slotLabel || SlotItem.mode} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">({SlotItem.mode})</span>
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{SlotItem.durationMinutes} min</span>
                            <button
                              type="button"
                              title="Edit slot"
                              aria-label="Edit slot"
                              onClick={() => StartEditingSlot(SlotItem)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--mp-role-border)] text-slate-500 transition hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              title="Delete slot"
                              aria-label="Delete slot"
                              disabled={DeleteSlotMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Delete the slot "${SlotItem.slotLabel || SlotItem.mode}"? Students not yet assigned through it will no longer see it. This can't be undone from here.`)) {
                                  DeleteSlotMutation.mutate(SlotItem.slotId);
                                }
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
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
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {ActiveTab === "PAPERS" && (
          <div className="space-y-4">
            {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => {
              const LevelPaper: AnnualCompetitionLevelPaper | undefined = Overview.levelPapers.find((Paper) => Paper.competitionLevelCode === LevelCode);
              // 2026-09-10: MM-L2 used to be excluded from generation here
              // (its curriculum Level row didn't exist yet -- Package 2
              // finding #4). The Annual Competition question-generation
              // engine now resolves MM-L2 through the real MM-L1 Level row
              // while generating MM-L2's own gist-specified content (see
              // GenerateAnnualCompetitionLevelPaper's CompetitionLevelCode
              // docstring), so MM-L2 generates exactly like every other
              // level -- no special-casing needed here anymore.
              const CanGenerate = !LevelPaper || LevelPaper.status !== "LOCKED";
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
                  {RunEngineMutation.isPending
                    ? "Running..."
                    : SelectedStudentIdsForRun.size > 0
                      ? `Run For ${SelectedStudentIdsForRun.size} Selected`
                      : "Run Assignment Engine (All Students)"}
                </button>
                {SelectedStudentIdsForRun.size > 0 && (
                  <button
                    type="button"
                    onClick={() => SetSelectedStudentIdsForRun(new Set())}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-2 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                  >
                    <X size={12} />
                    Deselect All ({SelectedStudentIdsForRun.size})
                  </button>
                )}
              </div>

              {PreviewQuery.data && (
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                  <span>{PreviewQuery.data.totalStudentsConsidered} considered</span>
                  <span className="text-emerald-600 dark:text-emerald-300">{PreviewQuery.data.wouldAssignCount} would assign</span>
                  <span className="text-amber-600 dark:text-amber-300">{PreviewQuery.data.noRuleMatchedCount} no rule matched</span>
                  <span className="text-slate-500">{PreviewQuery.data.adminOverridePreservedCount} overrides preserved</span>
                  {SelectedStudentIdsForRun.size > 0 && (
                    <span className="text-[color:var(--mp-role-primary)]">{SelectedStudentIdsForRun.size} selected for next run</span>
                  )}
                </div>
              )}

              {/* Points 2 & 3: search + module/level filters to find a student in a
                  150+ roster without scrolling, plus per-row checkboxes so the
                  engine can be run against only the students enrolled for this
                  event (e.g. a practice-exam dry run) instead of everyone. */}
              {AssignmentRows.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={AssignmentSearchText}
                      onChange={(EventValue) => SetAssignmentSearchText(EventValue.target.value)}
                      placeholder="Search by name or student code..."
                      className="math-input !py-2 !pl-9 !text-xs w-64"
                    />
                  </div>
                  <select
                    value={AssignmentModuleFilter}
                    onChange={(EventValue) => SetAssignmentModuleFilter(EventValue.target.value)}
                    className="math-input !py-2 !text-xs w-auto"
                    aria-label="Filter by module"
                  >
                    <option value="ALL">All Modules</option>
                    {AssignmentModuleOptions.map((ModuleCode) => (
                      <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                    ))}
                  </select>
                  <select
                    value={AssignmentLevelFilter}
                    onChange={(EventValue) => SetAssignmentLevelFilter(EventValue.target.value)}
                    className="math-input !py-2 !text-xs w-auto"
                    aria-label="Filter by level"
                  >
                    <option value="ALL">All Levels</option>
                    {AssignmentLevelOptions.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                  {(AssignmentSearchText || AssignmentModuleFilter !== "ALL" || AssignmentLevelFilter !== "ALL") && (
                    <button
                      type="button"
                      onClick={() => {
                        SetAssignmentSearchText("");
                        SetAssignmentModuleFilter("ALL");
                        SetAssignmentLevelFilter("ALL");
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-2 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                    >
                      <X size={12} />
                      Clear Filters
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-400">
                    {FilteredAssignmentRows.length} of {AssignmentRows.length} shown
                  </span>
                </div>
              )}

              {PreviewQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Computing preview..." /></div>
              ) : PreviewQuery.data && FilteredAssignmentRows.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs font-bold">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={AllFilteredAssignmentRowsSelected}
                            onChange={ToggleSelectAllFilteredAssignmentRows}
                            aria-label="Select all shown students"
                            className="h-3.5 w-3.5"
                          />
                        </th>
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Current Level</th>
                        <th className="px-2 py-1.5">Computed Level</th>
                        <th className="px-2 py-1.5">Existing</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Set Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FilteredAssignmentRows.map((Row: AnnualCompetitionAssignmentPreviewRow) => {
                        const RowPendingLevel =
                          RowOverrideLevelByStudentId[Row.studentId] ??
                          Row.existingAssignedLevelCode ??
                          Row.computedAssignedLevelCode ??
                          ANNUAL_COMPETITION_LEVEL_CODES[0];
                        const RowIsSaving = RowOverrideMutation.isPending && RowOverrideMutation.variables?.StudentId === Row.studentId;
                        return (
                          <tr key={Row.studentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={SelectedStudentIdsForRun.has(Row.studentId)}
                                onChange={() => ToggleOneAssignmentRowSelected(Row.studentId)}
                                aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId} for next run`}
                                className="h-3.5 w-3.5"
                              />
                            </td>
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
                            <td className="px-2 py-2">
                              {/* Deliberately independent of the auto-picker above -- this
                                  never writes anything until Apply is clicked, and the
                                  auto-picker/Run Assignment Engine flow is completely
                                  unaffected by this control existing. Only for the
                                  "unavoidable circumstances" escape hatch (Shailesh,
                                  2026-09-08 point 1) -- the override option stays exactly
                                  as it was otherwise. */}
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={RowPendingLevel}
                                  onChange={(EventValue) =>
                                    SetRowOverrideLevelByStudentId((Prev) => ({ ...Prev, [Row.studentId]: EventValue.target.value }))
                                  }
                                  className="math-input !py-1 !text-xs"
                                  aria-label={`Set level for ${Row.studentName || Row.studentCode || Row.studentId}`}
                                >
                                  {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                                    <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={RowIsSaving}
                                  onClick={() => RowOverrideMutation.mutate({ StudentId: Row.studentId, LevelCode: RowPendingLevel })}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] bg-white px-2.5 py-1 text-[11px] font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                                >
                                  <UserCog size={11} />
                                  {RowIsSaving ? "..." : "Apply"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title={AssignmentRows.length > 0 ? "No students match these filters" : "No students considered yet"}
                    description={
                      AssignmentRows.length > 0
                        ? "Try clearing the search text or the module/level filter above."
                        : "Refresh the preview once students exist and current levels are set."
                    }
                  />
                </div>
              )}
            </div>

            <div className="math-card p-5">
              <SectionTitle icon={<UserCog size={14} />} kicker="Manual Override" title="Override One Student's Assignment" description="Sets assignment_source = ADMIN_OVERRIDE -- the assignment engine will never touch this row again on a future run." />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Student Code (or ID)
                  <input
                    value={OverrideStudentId}
                    onChange={(EventValue) => SetOverrideStudentId(EventValue.target.value)}
                    placeholder="e.g. MP-ST-005"
                    className="math-input"
                  />
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

        {ActiveTab === "MONITORING" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle
                  icon={<Activity size={14} />}
                  kicker="Live View"
                  title="Started / In Progress / Stuck / Submitted"
                  description="Recomputed on every load (auto-refreshes every 15s while this tab is open) -- nothing here is a stored flag. STUCK uses the exact same no-heartbeat-within-the-grace-window threshold the reconciliation sweep below acts on."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={LiveMonitoringQuery.isFetching}
                    onClick={() => LiveMonitoringQuery.refetch()}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                  >
                    <RefreshCcw size={14} />
                    {LiveMonitoringQuery.isFetching ? "Refreshing..." : "Refresh Now"}
                  </button>
                  <button
                    type="button"
                    disabled={ReconcileMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Force-close every abandoned attempt (no heartbeat within the grace window) in this event? This cannot be undone.")) {
                        ReconcileMutation.mutate();
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:-translate-y-px dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                  >
                    <ShieldAlert size={13} />
                    {ReconcileMutation.isPending ? "Reconciling..." : "Run Reconciliation Sweep"}
                  </button>
                </div>
              </div>

              {LiveMonitoringQuery.data && (
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                  <span>{LiveMonitoringQuery.data.summary.totalCount} total</span>
                  <span className="text-slate-500">{LiveMonitoringQuery.data.summary.notStartedCount} not started</span>
                  <span className="text-blue-600 dark:text-blue-300">{LiveMonitoringQuery.data.summary.inProgressCount} in progress</span>
                  <span className="text-rose-600 dark:text-rose-300">{LiveMonitoringQuery.data.summary.stuckCount} stuck</span>
                  <span className="text-emerald-600 dark:text-emerald-300">{LiveMonitoringQuery.data.summary.finalizedCount} finalized</span>
                </div>
              )}

              {LiveMonitoringQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Loading live status..." /></div>
              ) : LiveMonitoringQuery.data && LiveMonitoringQuery.data.rows.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-xs font-bold">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Level</th>
                        <th className="px-2 py-1.5">Slot</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Section</th>
                        <th className="px-2 py-1.5">Remaining</th>
                        <th className="px-2 py-1.5">Last Heartbeat Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LiveMonitoringQuery.data.rows.map((Row: AnnualCompetitionLiveMonitoringRow) => (
                        <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
                          <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                          <td className="px-2 py-2">{Row.assignedLevelCode}</td>
                          <td className="px-2 py-2">{Row.slot?.slotLabel || Row.slot?.mode || "--"}</td>
                          <td className="px-2 py-2"><LiveStatusChip status={Row.liveStatus} /></td>
                          <td className="px-2 py-2">{Row.currentSectionNumber ?? "--"}</td>
                          <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.remainingSecondsAtLastHeartbeat)}</td>
                          <td className="px-2 py-2">{Row.heartbeatGapSeconds != null ? `${Row.heartbeatGapSeconds}s` : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No assignments yet" description="Run the assignment engine first -- nothing to monitor until students are assigned to this event." />
                </div>
              )}
            </div>
          </div>
        )}

        {ActiveTab === "RESULTS" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle
                icon={<Medal size={14} />}
                kicker="Post-Event Review"
                title="Rank &amp; Release"
                description="Admin always sees every computed result here regardless of release -- the release gate only applies to the student/parent-facing endpoint. Releasing always re-ranks first, in the same step."
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Filter by Level
                  <select value={ResultsLevelFilter} onChange={(EventValue) => SetResultsLevelFilter(EventValue.target.value)} className="math-input">
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Rank Level
                  <select value={RankLevelCode} onChange={(EventValue) => SetRankLevelCode(EventValue.target.value)} className="math-input">
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={RankResultsMutation.isPending}
                  onClick={() => RankResultsMutation.mutate(RankLevelCode)}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                >
                  <RefreshCcw size={14} />
                  {RankResultsMutation.isPending ? "Ranking..." : `Rank ${RankLevelCode}`}
                </button>
                <button
                  type="button"
                  disabled={ReleaseResultsForLevelMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Release results for ${RankLevelCode}? Students/parents will be able to see them immediately.`)) {
                      ReleaseResultsForLevelMutation.mutate(RankLevelCode);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Release {RankLevelCode}
                </button>
                <button
                  type="button"
                  disabled={ReleaseResultsForLevelMutation.isPending}
                  onClick={() => {
                    if (window.confirm("Release results for EVERY level of this event? Students/parents will be able to see them immediately.")) {
                      ReleaseResultsForLevelMutation.mutate(null);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition hover:-translate-y-px dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <Lock size={13} />
                  Release All Levels
                </button>
                <button
                  type="button"
                  disabled={RecomputeResultsMutation.isPending}
                  title="Refreshes already-computed scores under the current scoring rules -- never touches release status or rank."
                  onClick={() => {
                    const Scope = ResultsLevelFilter === "ALL" ? "every level of this event" : ResultsLevelFilter;
                    if (window.confirm(`Recompute results for ${Scope}? This refreshes scores/marks under the current scoring rules -- release status and rank are never touched.`)) {
                      RecomputeResultsMutation.mutate();
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                >
                  <RefreshCcw size={14} />
                  {RecomputeResultsMutation.isPending ? "Recomputing..." : `Recompute ${ResultsLevelFilter === "ALL" ? "All Levels" : ResultsLevelFilter}`}
                </button>
              </div>

              {ResultsQuery.isLoading ? (
                <div className="mt-5"><LoadingState label="Loading results..." /></div>
              ) : ResultsQuery.data && ResultsQuery.data.rows.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  {/* Point 10 (Shailesh, 2026-09-08): fixed layout + an explicit
                      colgroup, not the browser's default auto-sizing, so every
                      header lines up with its column's cell content -- including
                      the pill buttons -- instead of drifting per row. */}
                  <table className="w-full min-w-[1060px] table-fixed text-left text-xs font-bold">
                    <colgroup>
                      <col className="w-[7%]" />
                      <col className="w-[15%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">Rank</th>
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Level</th>
                        <th className="px-2 py-1.5">Accuracy</th>
                        <th className="px-2 py-1.5">Score</th>
                        <th className="px-2 py-1.5">Time Taken</th>
                        <th className="px-2 py-1.5">Attempt</th>
                        <th className="px-2 py-1.5">Released</th>
                        <th className="px-2 py-1.5">Certificate</th>
                        <th className="px-2 py-1.5">Retry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ResultsQuery.data.rows.map((Row: AnnualCompetitionResultRow) => {
                        const HasPendingRetryGrant = PendingRetryGrantStudentIds.has(Row.studentId);
                        const IsGrantingThisRow = RetryMutation.isPending && RetryMutation.variables?.Row.attemptId === Row.attemptId;
                        return (
                          <tr key={Row.resultId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 truncate"><RankBadge Rank={Row.rank} /></td>
                            <td className="px-2 py-2 truncate text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2 truncate">{Row.competitionLevelCode}</td>
                            <td className="px-2 py-2 truncate">{Row.accuracyPercentage}%</td>
                            <td className="px-2 py-2 truncate">{Row.score}/{Row.maxScore}</td>
                            <td className="px-2 py-2 truncate">{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</td>
                            <td className="px-2 py-2">
                              <Link
                                href={`/admin/competition/annual-result/${Row.attemptId}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                              >
                                <ClipboardList size={12} />
                                View
                              </Link>
                            </td>
                            <td className="px-2 py-2 truncate">
                              {Row.isReleased ? (
                                <span className="text-emerald-600 dark:text-emerald-300">Released</span>
                              ) : (
                                <span className="text-slate-400">Not released</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                                onClick={() => CertificateMutation.mutate(Row)}
                                disabled={DownloadingAttemptId === Row.attemptId}
                              >
                                <Award size={12} />
                                {DownloadingAttemptId === Row.attemptId ? "..." : "Download"}
                              </button>
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                title={
                                  HasPendingRetryGrant
                                    ? "An unused retry grant already exists for this student -- they'll get a fresh attempt on the same paper next time they log in."
                                    : "Grant this student one fresh attempt on the same paper (REQUIREMENTS.md item 6 -- genuine technical-issue retakes, also usable for re-testing)."
                                }
                                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                                onClick={() => {
                                  const Reason = window.prompt(
                                    `Reason for granting ${Row.studentName || Row.studentCode || Row.studentId} a retry on ${Row.competitionLevelCode}? (required)`
                                  );
                                  if (Reason && Reason.trim()) {
                                    RetryMutation.mutate({ Row, Reason: Reason.trim() });
                                  }
                                }}
                                disabled={HasPendingRetryGrant || IsGrantingThisRow}
                              >
                                <RotateCcw size={12} />
                                {HasPendingRetryGrant ? "Granted" : IsGrantingThisRow ? "..." : "Retry"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState title="No results computed yet" description="Results appear automatically once a student's last section closes -- nothing to review until then." />
                </div>
              )}
            </div>
          </div>
        )}

        {ActiveTab === "PRACTICE" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle
                icon={<Sparkles size={14} />}
                kicker="Practice Bank"
                title="Batch-Assign &amp; Look Up"
                description="Generates fresh, always-different practice papers and adds them to one student's bank for a level -- safe to call repeatedly, it never touches or consumes a paper already there. Quantity must be a multiple of 5, up to 25 per batch."
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Student Code (or ID)
                  <input
                    value={PracticeStudentId}
                    onChange={(EventValue) => SetPracticeStudentId(EventValue.target.value)}
                    placeholder="e.g. MP-ST-005"
                    className="math-input"
                  />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Level
                  <select value={PracticeLevelCode} onChange={(EventValue) => SetPracticeLevelCode(EventValue.target.value)} className="math-input">
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Quantity
                  <select
                    value={PracticeQuantity}
                    onChange={(EventValue) => SetPracticeQuantity(Number(EventValue.target.value))}
                    className="math-input"
                  >
                    {PRACTICE_BATCH_QUANTITY_OPTIONS.map((Quantity) => (
                      <option key={Quantity} value={Quantity}>{Quantity}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!PracticeStudentId.trim() || BatchAssignPracticeMutation.isPending}
                  onClick={() => BatchAssignPracticeMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusCircle size={16} />
                  {BatchAssignPracticeMutation.isPending ? "Assigning..." : `Assign ${PracticeQuantity}`}
                </button>
                <button
                  type="button"
                  disabled={!PracticeStudentId.trim()}
                  onClick={() => SetPracticeBankLookup({ StudentId: PracticeStudentId.trim(), LevelCode: PracticeLevelCode })}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                >
                  <Search size={14} />
                  View Bank
                </button>
              </div>

              {PracticeBankLookup && (
                <div className="mt-5">
                  {PracticeBankQuery.isLoading ? (
                    <LoadingState label="Loading bank..." />
                  ) : PracticeBankQuery.data ? (
                    <>
                      <div className="flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                        <span>{PracticeBankQuery.data.totalAssigned} assigned</span>
                        <span className="text-emerald-600 dark:text-emerald-300">{PracticeBankQuery.data.remainingCount} remaining</span>
                        <span className="text-slate-400">{PracticeBankQuery.data.consumedCount} consumed</span>
                      </div>
                      {PracticeBankQuery.data.papers.length > 0 ? (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[640px] text-left text-xs font-bold">
                            <thead>
                              <tr className="text-slate-500 dark:text-slate-400">
                                <th className="px-2 py-1.5">Level</th>
                                <th className="px-2 py-1.5">Assigned</th>
                                <th className="px-2 py-1.5">Status</th>
                                <th className="px-2 py-1.5">Consumed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {PracticeBankQuery.data.papers.map((Paper) => (
                                <tr key={Paper.levelPaperId} className="border-t border-[color:var(--mp-role-border)]">
                                  <td className="px-2 py-2">{Paper.competitionLevelCode}</td>
                                  <td className="px-2 py-2">{FormatDateTime(Paper.assignedAt)}</td>
                                  <td className="px-2 py-2">
                                    {Paper.isConsumed ? (
                                      <span className="text-slate-400">Consumed</span>
                                    ) : (
                                      <span className="text-emerald-600 dark:text-emerald-300">Available</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">{FormatDateTime(Paper.consumedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <EmptyState title="No practice papers assigned yet" description="Use Assign above to add this student's first batch for this level." />
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className="math-card p-5">
              <SectionTitle
                icon={<Medal size={14} />}
                kicker="Practice Results"
                title="Recent Practice Activity"
                description="Never ranked, and always released to the student the instant it's computed -- a separate surface from the OFFICIAL Rank & Release list on the Results tab, never mixed with it."
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Filter by Level
                  <select value={PracticeResultsLevelFilter} onChange={(EventValue) => SetPracticeResultsLevelFilter(EventValue.target.value)} className="math-input">
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </label>
              </div>

              {PracticeResultsQuery.isLoading ? (
                <div className="mt-5"><LoadingState label="Loading practice results..." /></div>
              ) : PracticeResultsQuery.data && PracticeResultsQuery.data.rows.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-xs font-bold">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Level</th>
                        <th className="px-2 py-1.5">Accuracy</th>
                        <th className="px-2 py-1.5">Score</th>
                        <th className="px-2 py-1.5">Time Taken</th>
                        <th className="px-2 py-1.5">Attempt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PracticeResultsQuery.data.rows.map((Row: AnnualCompetitionPracticeResultRow) => (
                        <tr key={Row.resultId} className="border-t border-[color:var(--mp-role-border)]">
                          <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                          <td className="px-2 py-2">{Row.competitionLevelCode}</td>
                          <td className="px-2 py-2">{Row.accuracyPercentage}%</td>
                          <td className="px-2 py-2">{Row.score}/{Row.maxScore}</td>
                          <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</td>
                          <td className="px-2 py-2">
                            <Link
                              href={`/admin/competition/annual-result/${Row.attemptId}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                            >
                              <ClipboardList size={12} />
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState title="No practice activity yet" description="Practice results appear automatically once a student finishes a practice paper." />
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
