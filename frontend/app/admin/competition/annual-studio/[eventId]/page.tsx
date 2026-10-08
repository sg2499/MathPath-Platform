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
  FormatCompetitionLevelLabel,
  FormatMasterCurrentLevelSuffix,
  addStudentsToAnnualCompetitionEventRoster,
  bulkOverrideAnnualCompetitionAssignments,
  createAnnualCompetitionSlot,
  downloadAnnualCompetitionCertificate,
  generateAnnualCompetitionLevelPaper,
  getAnnualCompetitionEventOverview,
  getAnnualCompetitionLiveMonitoring,
  grantAnnualCompetitionAttemptRetry,
  linkAnnualCompetitionLevelPaper,
  listAnnualCompetitionAttemptRetryGrants,
  listAnnualCompetitionEventRoster,
  listAnnualCompetitionResults,
  listStudentsForAnnualCompetitionPracticeBank,
  overrideAnnualCompetitionAssignment,
  setAnnualCompetitionAssignmentSlot,
  previewAnnualCompetitionAssignments,
  rankAnnualCompetitionResults,
  recomputeAnnualCompetitionResults,
  reconcileAnnualCompetitionAttempts,
  releaseAnnualCompetitionResults,
  removeStudentsFromAnnualCompetitionEventRoster,
  runAnnualCompetitionAssignments,
  updateAnnualCompetitionEvent,
  updateAnnualCompetitionSectionTimer,
  updateAnnualCompetitionSlot,
  type AnnualCompetitionAssignmentPreviewRow,
  type AnnualCompetitionAssignmentRunResult,
  type AnnualCompetitionLevelPaper,
  type AnnualCompetitionPracticeBankStudentRow,
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
  ChevronDown,
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
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ANNUAL_LIVE_ALL_LEVELS,
  AnnualLiveLevelFilter,
  AnnualLiveMonitoringTable,
  AnnualLiveUpdatedAgo,
} from "@/components/competition/AnnualLiveMonitoringTable";
import { useUrlTabState } from "@/hooks/useUrlTabState";
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
// ---------------------------------------------------------------------------
// Assignments tab wording (2026-10-07, Shailesh: "it should never mislead the
// admin"). The engine's own counters (created / updated / overrides preserved
// / not matched) only say what the ENGINE did, so a student whose level was
// set by hand and whom the engine has no rule for read as "not matched", as if
// they had been left out. Everything below leads with what the admin wants to
// know: who has a level, who does not, and what to do about it.
// ---------------------------------------------------------------------------
function Plural(Count: number, One: string, Many: string) {
  return Count === 1 ? One : Many;
}

function NotifiedSentence(Count: number | undefined) {
  if (!Count) return "";
  return ` ${Count} ${Plural(Count, "student was", "students were")} notified about their paper.`;
}

function AssignmentRunMessage(Result: AnnualCompetitionAssignmentRunResult) {
  const Total = Result.totalConsidered;
  if (Total === 0) return "There are no students on this event's roster yet, so there was nothing to assign.";

  const Without = Result.studentsWithoutLevel;
  const Kept = Result.adminSetLevelsKept;
  const Changed = Result.created + Result.updated;

  const Head =
    Without === 0
      ? Total === 1
        ? "The student has a level."
        : `All ${Total} students have a level.`
      : `${Result.studentsWithLevel} of ${Total} students have a level.`;

  let Engine: string;
  if (Changed === 0) {
    if (Kept === 0) Engine = "The engine changed nothing.";
    else if (Kept === Total && Total > 1) Engine = `The engine changed nothing: all ${Kept} levels were set by an admin and were kept.`;
    else Engine = `The engine changed nothing: ${Kept} ${Plural(Kept, "level set by an admin was", "levels set by an admin were")} kept.`;
  } else {
    Engine = `Engine: ${Result.created} newly assigned, ${Result.updated} changed${Kept > 0 ? `, ${Kept} admin-set ${Plural(Kept, "level", "levels")} kept` : ""}.`;
  }

  const Missing =
    Without > 0 ? ` ${Without} still ${Plural(Without, "has", "have")} no level: set ${Plural(Without, "it", "them")} by hand below.` : "";

  return `${Head} ${Engine}${Missing}${NotifiedSentence(Result.studentsNotified)}`;
}

// Why the engine has no suggestion for a student, in plain words. The codes
// are the engine's own (annual_competition_assignment_service.py REASON_*).
const NO_RULE_REASON_TEXT: Record<string, string> = {
  // Kept short on purpose: this line sits under "No level yet: set by hand"
  // in the Status column and must not be the thing that makes the column
  // wide (a wide Status column wraps the names and levels beside it).
  YLM_L1_EXCLUDED_PENDING_YLP1_CONFIRMATION: "No engine rule for YLM-L1",
  BRIDGE_BELOW_LESSON_15_NO_DEFINED_TARGET: "Bridge, below Lesson 15",
  STUDENT_HAS_NO_CURRENT_LEVEL: "No current level",
  CURRENT_LEVEL_NOT_IN_ANNUAL_COMPETITION_SCOPE: "Level not in the competition",
};

function NoRuleReasonText(Reason: string | null) {
  if (!Reason) return "No engine rule for this student";
  return NO_RULE_REASON_TEXT[Reason] || "No engine rule for this student";
}

function EventStatusLabel(Status: string) {
  return Status ? Status.charAt(0).toUpperCase() + Status.slice(1).toLowerCase() : Status;
}

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

// 2026-09-12 (Shailesh, full event decoupling): "practice is for all the
// students irrespective of the event ... right now it appears under the
// officially created events which we do not want." The PRACTICE tab that
// used to live here (Phase F) has moved out entirely -- practice is no
// longer scoped to any one event at all, so it now lives as its own
// top-level Practice tab at /admin/competition/annual-studio, a sibling of
// this whole per-event Official page rather than a tab inside it. This
// page (and TabList below) is OFFICIAL-only from here on.
// 2026-09-29 (Shailesh, Event Roster): new tab, sitting right before
// Assignments since it's now the eligibility gate behind it -- the
// assignment engine and manual/bulk override are all scoped server-side to
// whoever is on this event's roster (see CompetitionEventRoster's own
// docstring in app/models/models.py), so this is where an admin adds or
// removes students in real time as the event's actual registrations
// change.
const TabList = ["SLOTS", "PAPERS", "ROSTER", "ASSIGNMENTS", "MONITORING", "RESULTS"] as const;
type TabKey = (typeof TabList)[number];
const TabLabels: Record<TabKey, string> = {
  SLOTS: "Slots",
  PAPERS: "Level Papers",
  ROSTER: "Event Roster",
  ASSIGNMENTS: "Assignments",
  MONITORING: "Live Monitoring",
  RESULTS: "Results",
};

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

// 2026-10-08 (Shailesh, a slot per student): the slot picker on each
// Assignments row. Lists only the active slots that include the student's
// level. "Automatic" means "the one slot that lists the level"; when two or
// more do and none is chosen, the student cannot start, so the row says so.
function AssignmentSlotCell({
  Row,
  Slots,
  Saving,
  OnChoose,
}: {
  Row: AnnualCompetitionAssignmentPreviewRow;
  Slots: AnnualCompetitionSlot[];
  Saving: boolean;
  OnChoose: (SlotId: string | null) => void;
}) {
  const LevelCode = Row.existingAssignedLevelCode;
  if (!LevelCode) return <span className="text-xs text-slate-400">Set a level first</span>;
  const LevelSlots = Slots.filter((SlotItem) => SlotItem.isActive !== false && SlotItem.applicableLevelCodes.includes(LevelCode));
  if (LevelSlots.length === 0) return <span className="text-xs text-slate-400">No slot lists this level</span>;
  const SlotName = (SlotItem: AnnualCompetitionSlot) => SlotItem.slotLabel || FormatDateTime(SlotItem.scheduledStartAt);
  const CurrentSlot = LevelSlots.find((SlotItem) => SlotItem.slotId === Row.existingSlotId);
  const AutomaticSlot = !Row.existingSlotChosenByAdmin ? CurrentSlot : undefined;
  const Value = Row.existingSlotChosenByAdmin && Row.existingSlotId ? Row.existingSlotId : "";
  const Pending = Boolean(Row.existingSlotPending);
  return (
    <div className="flex flex-col gap-1">
      <select
        value={Value}
        disabled={Saving}
        onChange={(EventValue) => OnChoose(EventValue.target.value || null)}
        className={`math-input !py-1 !text-xs w-[220px] ${Pending ? "!border-amber-400" : ""}`}
        aria-label={`Slot for ${Row.studentName || Row.studentCode || Row.studentId}`}
      >
        <option value="">
          {Pending ? "Choose a slot" : AutomaticSlot ? `Automatic (${SlotName(AutomaticSlot)})` : "Automatic"}
        </option>
        {LevelSlots.map((SlotItem) => (
          <option key={SlotItem.slotId} value={SlotItem.slotId}>{SlotName(SlotItem)}</option>
        ))}
      </select>
      {Saving ? (
        <span className="text-[11px] font-semibold text-slate-400">Saving...</span>
      ) : Pending ? (
        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Cannot start until a slot is chosen</span>
      ) : CurrentSlot ? (
        <span className="text-[11px] font-semibold text-slate-400">
          Starts {FormatDateTime(CurrentSlot.scheduledStartAt)}
          {Row.existingSlotChosenByAdmin ? " · set by admin" : ""}
        </span>
      ) : null}
    </div>
  );
}

export default function AdminAnnualCompetitionEventDetailPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Params = useParams<{ eventId: string }>();
  const EventId = Params.eventId;
  const QueryClient = useQueryClient();

  // The selected tab lives in the page address (?tab=MONITORING), so a
  // browser refresh stays on it. See useUrlTabState.
  const [ActiveTab, SetActiveTab] = useUrlTabState<TabKey>("tab", TabList, "SLOTS");
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

  // --- Point 1 (2026-09-08): inline per-row override on the Assignments
  // preview table itself. This is a pure UX front-end onto the exact same
  // overrideAnnualCompetitionAssignment call the Universal Set Level bulk
  // action below also uses -- the auto-picker stays the source of truth by
  // default, this only ever fires when an admin explicitly picks a row's
  // dropdown and clicks Apply. Keyed by studentId so each row's pending
  // selection is independent and never clobbers another row's.
  const [RowOverrideLevelByStudentId, SetRowOverrideLevelByStudentId] = useState<Record<string, string>>({});

  // 2026-09-28 (Shailesh, "Universal Set Level"): the level picked for a
  // bulk override of every checked student, shown beside "Run Assignment
  // Engine". Replaces the old standalone "Manual Override" form -- that
  // form did the exact same single-student ADMIN_OVERRIDE write as the
  // per-row Apply above, and everything it could do (override one student
  // by code) is already covered by searching for that student in this
  // table and using this same control on a selection of one.
  const [BulkOverrideLevelCode, SetBulkOverrideLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

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
  const [AssignmentSlotFilter, SetAssignmentSlotFilter] = useState<string>("ALL");
  const [SelectedStudentIdsForRun, SetSelectedStudentIdsForRun] = useState<Set<string>>(new Set());

  // 2026-09-29 (Shailesh, Event Roster): "the search should be platform
  // wide that is the admin can filter using levels and select the students
  // who have registered for the event, either by using the filters or the
  // search bar or the all view whatever we have there." Same search/module/
  // level filter pattern as the Assignments preview table above and the
  // Practice Bank student picker (admin/competition/annual-studio/page.tsx)
  // -- pure client-side filters over one platform-wide student fetch.
  const [RosterAddSearchText, SetRosterAddSearchText] = useState("");
  const [RosterAddModuleFilter, SetRosterAddModuleFilter] = useState<string>("ALL");
  const [RosterAddLevelFilter, SetRosterAddLevelFilter] = useState<string>("ALL");
  const [SelectedStudentIdsForRosterAdd, SetSelectedStudentIdsForRosterAdd] = useState<Set<string>>(new Set());

  // 2026-09-29 (Shailesh, Event Roster): "for removal also lets have both
  // individual and bulk option same for adding" -- checkbox selection for
  // bulk removal, plus a per-row Remove button for the one-off case.
  const [RosterSearchText, SetRosterSearchText] = useState("");
  const [SelectedStudentIdsForRosterRemove, SetSelectedStudentIdsForRosterRemove] = useState<Set<string>>(new Set());

  // --- Monitoring / Results (Package 7) ---
  const [ResultsLevelFilter, SetResultsLevelFilter] = useState<string>("ALL");
  const [RankLevelCode, SetRankLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

  // 2026-09-28 (Shailesh): the Recompute button sits next to Release All
  // Levels and must stay on one line -- "Bloomers (Below 8 Years)" /
  // "Beginners (Above 8 Years)" are too long and wrap it to a second line.
  // Every other label on this tab (Rank/Release buttons, both dropdowns,
  // the results table) keeps the full FormatCompetitionLevelLabel text on
  // purpose -- only this one button drops the parenthetical age range.
  // Levels with no "(...)" suffix (PM-L1, MM-1, etc.) are unaffected.
  const ShortCompetitionLevelLabel = (LevelCode: string): string =>
    FormatCompetitionLevelLabel(LevelCode).replace(/\s*\([^)]*\)\s*$/, "");

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

  // 2026-09-29 (Shailesh, Event Roster): the roster itself, plus a
  // platform-wide student fetch to pick new roster members from -- same
  // student roster the Practice Bank picker already fetches (every active
  // student, tagged with their current module/level), reused here rather
  // than adding a second near-identical endpoint.
  const RosterQuery = useQuery({
    queryKey: ["admin", "annual-competition", "roster", EventId],
    queryFn: () => listAnnualCompetitionEventRoster(EventId),
    enabled: Ready && Boolean(EventId) && ActiveTab === "ROSTER",
  });
  const AllStudentsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "all-students-for-roster"],
    queryFn: listStudentsForAnnualCompetitionPracticeBank,
    enabled: Ready && ActiveTab === "ROSTER",
  });

  // Level filter for the live board, kept in the page address like the tab
  // itself so a refresh mid-slot stays on the level being watched.
  const [LiveLevelFilter, SetLiveLevelFilter] = useUrlTabState<string>(
    "level",
    [ANNUAL_LIVE_ALL_LEVELS, ...ANNUAL_COMPETITION_LEVEL_CODES],
    ANNUAL_LIVE_ALL_LEVELS
  );
  const LiveMonitoringQuery = useQuery({
    queryKey: ["admin", "annual-competition", "monitoring-live", EventId, LiveLevelFilter],
    queryFn: () => getAnnualCompetitionLiveMonitoring(EventId, null, LiveLevelFilter === ANNUAL_LIVE_ALL_LEVELS ? null : LiveLevelFilter),
    enabled: Ready && Boolean(EventId) && ActiveTab === "MONITORING",
    // Changing the level keeps the rows on screen until the new ones arrive,
    // instead of flashing an empty board.
    placeholderData: (Previous) => Previous,
    // Genuinely "live" -- auto-refresh while the tab is open, same spirit
    // as the reconciliation sweep it sits next to (this never mutates
    // anything itself, it only reads more often). Every 5 seconds since
    // 2026-10-07, so a student moving to the next section shows promptly;
    // the server read is a fixed handful of queries (see _LiveStatusRows),
    // and the Remaining column counts by itself between reads.
    refetchInterval: ActiveTab === "MONITORING" ? 5000 : false,
  });

  const ResultsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "results", EventId, ResultsLevelFilter],
    queryFn: () => listAnnualCompetitionResults(EventId, ResultsLevelFilter === "ALL" ? undefined : ResultsLevelFilter),
    enabled: Ready && Boolean(EventId) && ActiveTab === "RESULTS",
  });

  const InvalidateOverview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "overview", EventId] });
  const InvalidatePreview = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "preview", EventId] });
  const InvalidateEventsList = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
  const InvalidateLiveMonitoring = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "monitoring-live", EventId] });
  const InvalidateResults = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "results", EventId] });
  const InvalidateRoster = () => QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "roster", EventId] });

  const SetLockedMutation = useMutation({
    mutationFn: (Status: string) => updateAnnualCompetitionEvent(EventId, { status: Status }),
    onSuccess: (Updated) => {
      SetLastMessage(`Event status set to ${EventStatusLabel(Updated.status)}.${NotifiedSentence(Updated.studentsNotified)}`);
      InvalidateOverview();
      InvalidateEventsList();
    },
  });

  const ReleaseResultsMutation = useMutation({
    mutationFn: () => updateAnnualCompetitionEvent(EventId, { resultsReleaseAt: new Date().toISOString() }),
    onSuccess: () => {
      SetLastMessage("Results release date set to now — every linked level paper is now locked.");
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
      // 2026-10-08: a slot change re-links students straight away.
      InvalidatePreview();
      InvalidateLiveMonitoring();
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
      InvalidatePreview();
      InvalidateLiveMonitoring();
    },
  });

  // Soft delete (isActive: false), matching the Assignment "Archive" pattern
  // used elsewhere in this admin panel. 2026-10-08: its students are re-linked
  // straight away -- to the one other slot that lists their level, or (two or
  // more) they wait until a slot is chosen for them on the Assignments tab. Confirmed before deleting, same as this page's other
  // consequential actions (Release Results, Reconciliation Sweep).
  const DeleteSlotMutation = useMutation({
    mutationFn: (SlotId: string) => updateAnnualCompetitionSlot(SlotId, { isActive: false }),
    onSuccess: () => {
      SetLastMessage("Slot deleted.");
      InvalidateOverview();
      InvalidatePreview();
      InvalidateLiveMonitoring();
    },
  });

  const GeneratePaperMutation = useMutation({
    mutationFn: (LevelCode: string) => generateAnnualCompetitionLevelPaper(EventId, LevelCode),
    onSuccess: (Result) => {
      SetLastMessage(`Official paper generated for ${FormatCompetitionLevelLabel(Result.competitionLevelCode)}.`);
      InvalidateOverview();
    },
  });

  // 2026-09-29 (Shailesh: "a universal button which would generate the
  // papers for all the levels at once, the individual generate buttons stay
  // as is"). Reuses the exact same per-level generate call the individual
  // buttons already use -- just loops it across every level that's
  // currently generatable (PENDING, or READY-but-not-LOCKED, matching each
  // row's own CanGenerate condition), one at a time so a failure on one
  // level never aborts the levels already succeeded before it (same
  // per-student-isolation discipline this codebase's other bulk actions
  // already follow). Reports a summary, not just the last level's message.
  const GenerateAllPapersMutation = useMutation({
    mutationFn: async () => {
      const GenerableLevelCodes = ANNUAL_COMPETITION_LEVEL_CODES.filter((LevelCode) => {
        const LevelPaper = (Overview?.levelPapers || []).find((Paper) => Paper.competitionLevelCode === LevelCode);
        return !LevelPaper || LevelPaper.status !== "LOCKED";
      });
      const Succeeded: string[] = [];
      const Failed: Array<{ levelCode: string; reason: string }> = [];
      for (const LevelCode of GenerableLevelCodes) {
        try {
          await generateAnnualCompetitionLevelPaper(EventId, LevelCode);
          Succeeded.push(LevelCode);
        } catch (ErrorValue) {
          Failed.push({ levelCode: LevelCode, reason: apiErrorMessage(ErrorValue) || "Failed" });
        }
      }
      return { Succeeded, Failed, TotalConsidered: GenerableLevelCodes.length };
    },
    onSuccess: (Result) => {
      SetLastMessage(
        Result.Failed.length > 0
          ? `Generated ${Result.Succeeded.length} of ${Result.TotalConsidered} papers — ${Result.Failed.length} failed (${Result.Failed.map((F) => `${F.levelCode}: ${F.reason}`).join("; ")}).`
          : `Generated all ${Result.Succeeded.length} official papers.`
      );
      InvalidateOverview();
    },
  });

  const LinkPaperMutation = useMutation({
    mutationFn: ({ LevelCode, MockExamId }: { LevelCode: string; MockExamId: string }) =>
      linkAnnualCompetitionLevelPaper(EventId, LevelCode, MockExamId),
    onSuccess: (Result) => {
      SetLastMessage(`Existing mock exam linked as ${FormatCompetitionLevelLabel(Result.competitionLevelCode)}'s official paper.`);
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
      SetLastMessage(AssignmentRunMessage(Result));
      InvalidatePreview();
    },
  });

  // 2026-09-29 (Shailesh, Event Roster): bulk-add covers both "select one"
  // and "select many" from the platform-wide picker below in one action.
  const AddToRosterMutation = useMutation({
    mutationFn: () => addStudentsToAnnualCompetitionEventRoster(EventId, Array.from(SelectedStudentIdsForRosterAdd)),
    onSuccess: (Result) => {
      SetLastMessage(
        `Added ${Result.studentsSucceeded} student${Result.studentsSucceeded === 1 ? "" : "s"} to the roster` +
          (Result.studentsFailed > 0 ? `, ${Result.studentsFailed} failed.` : ".")
      );
      SetSelectedStudentIdsForRosterAdd(new Set());
      InvalidateRoster();
      InvalidatePreview();
    },
  });

  // Bulk removal (checkbox selection) -- a per-row Remove button below
  // reuses this same mutation with a one-element array, so "remove one" and
  // "remove many" both go through one code path.
  const RemoveFromRosterMutation = useMutation({
    mutationFn: (StudentIds: string[]) => removeStudentsFromAnnualCompetitionEventRoster(EventId, StudentIds),
    onSuccess: (Result) => {
      SetLastMessage(`Removed ${Result.studentsRemoved} student${Result.studentsRemoved === 1 ? "" : "s"} from the roster.`);
      SetSelectedStudentIdsForRosterRemove(new Set());
      InvalidateRoster();
      InvalidatePreview();
    },
  });

  // Point 1: fed from a preview row's own dropdown -- one student at a
  // time, independent of the bulk action below so a save on one row never
  // shows a pending/disabled state on an unrelated row.
  const RowOverrideMutation = useMutation({
    mutationFn: (Vars: { StudentId: string; LevelCode: string }) =>
      overrideAnnualCompetitionAssignment(EventId, { studentId: Vars.StudentId, assignedLevelCode: Vars.LevelCode }),
    onSuccess: (Result, Vars) => {
      SetLastMessage(
        `${Result.studentName || Result.studentCode || "Student"} is now set to ${FormatCompetitionLevelLabel(Result.assignedLevelCode)}.${NotifiedSentence(Result.studentsNotified)}`
      );
      SetRowOverrideLevelByStudentId((Prev) => {
        const Next = { ...Prev };
        delete Next[Vars.StudentId];
        return Next;
      });
      InvalidatePreview();
    },
  });

  // 2026-10-08 (Shailesh, a slot per student): saves as soon as a slot is
  // picked. An empty value hands the student back to the automatic slot.
  const RowSlotMutation = useMutation({
    mutationFn: (Vars: { StudentId: string; SlotId: string | null }) =>
      setAnnualCompetitionAssignmentSlot(EventId, { studentId: Vars.StudentId, slotId: Vars.SlotId }),
    onSuccess: (Result) => {
      const Who = Result.studentName || Result.studentCode || "Student";
      const SlotItem = (Overview?.slots || []).find((Item) => Item.slotId === Result.slotId);
      SetLastMessage(
        Result.slotPending
          ? `${Who} is waiting for a slot: choose one so they can start.`
          : SlotItem
            ? `${Who} will sit in ${SlotItem.slotLabel || FormatDateTime(SlotItem.scheduledStartAt)}.${Result.studentsNotified > 0 ? " They were notified about their slot." : ""}`
            : `${Who} has no slot for this level, so they can start any time.`
      );
      InvalidatePreview();
      InvalidateLiveMonitoring();
    },
  });

  // 2026-09-28 (Shailesh, "Universal Set Level"): fed from the checkbox
  // selection already used to scope an engine run, plus BulkOverrideLevelCode
  // -- one call, same ADMIN_OVERRIDE write as the per-row Apply above,
  // applied to every selected student at once. A partial failure (e.g. one
  // stale student id in a large selection) is surfaced in the message
  // rather than silently swallowed, same as the failure reporting the
  // Practice Bank's bulk-assign action already gives.
  const BulkOverrideMutation = useMutation({
    mutationFn: () =>
      bulkOverrideAnnualCompetitionAssignments(EventId, {
        studentIds: Array.from(SelectedStudentIdsForRun),
        assignedLevelCode: BulkOverrideLevelCode,
      }),
    onSuccess: (Result) => {
      SetLastMessage(
        Result.studentsFailed > 0
          ? `Set ${FormatCompetitionLevelLabel(Result.assignedLevelCode)} for ${Result.studentsSucceeded} of ${Result.studentsRequested} selected students. ${Result.studentsFailed} failed (${Result.failed.map((F) => F.studentIdentifier).join(", ")}).${NotifiedSentence(Result.studentsNotified)}`
          : `Set ${FormatCompetitionLevelLabel(Result.assignedLevelCode)} for all ${Result.studentsSucceeded} selected students.${NotifiedSentence(Result.studentsNotified)}`
      );
      SetSelectedStudentIdsForRun(new Set());
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
      SetLastMessage(`Ranked ${Result.rankedCount} result${Result.rankedCount === 1 ? "" : "s"} for ${FormatCompetitionLevelLabel(Result.competitionLevelCode)}.`);
      InvalidateResults();
    },
  });

  const ReleaseResultsForLevelMutation = useMutation({
    mutationFn: (LevelCode: string | null) => releaseAnnualCompetitionResults(EventId, LevelCode),
    onSuccess: (Result) => {
      SetLastMessage(`Released ${Result.newlyReleasedCount} result${Result.newlyReleasedCount === 1 ? "" : "s"}${Result.competitionLevelCode ? ` for ${FormatCompetitionLevelLabel(Result.competitionLevelCode)}` : " across every level"}.${Result.studentsNotified ? ` ${Result.studentsNotified} ${Plural(Result.studentsNotified, "student was", "students were")} told their result is out.` : ""}`);
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
      SetLastMessage(`Recomputed ${Result.recomputedCount} result${Result.recomputedCount === 1 ? "" : "s"}${Result.competitionLevelCode ? ` for ${FormatCompetitionLevelLabel(Result.competitionLevelCode)}` : " across every level"}.`);
      InvalidateResults();
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
      SetLastMessage(`Retry granted for ${Row.studentName || Row.studentCode || Row.studentId} — they can start a fresh attempt on the same paper next time they log in.`);
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
    GenerateAllPapersMutation.error ||
    LinkPaperMutation.error ||
    UpdateTimerMutation.error ||
    RunEngineMutation.error ||
    BulkOverrideMutation.error ||
    RowSlotMutation.error ||
    (ActiveTab === "ROSTER" ? RosterQuery.error || AllStudentsQuery.error : null) ||
    AddToRosterMutation.error ||
    RemoveFromRosterMutation.error ||
    SetLockedMutation.error ||
    ReleaseResultsMutation.error ||
    (ActiveTab === "MONITORING" ? LiveMonitoringQuery.error : null) ||
    (ActiveTab === "RESULTS" ? ResultsQuery.error : null) ||
    ReconcileMutation.error ||
    RankResultsMutation.error ||
    ReleaseResultsForLevelMutation.error ||
    CertificateMutation.error ||
    RecomputeResultsMutation.error ||
    RetryMutation.error;

  // Points 2 & 3: derived, client-side view of the preview table --
  // search text + module/level dropdowns narrow which rows are VISIBLE;
  // selection (for the Run scope) is independent of the current filter so
  // switching filters never silently drops an earlier selection.
  // 2026-09-29 (Shailesh: "wherever we have the list of students ... they
  // should always follow the alphabetical order"). Sorted once here, before
  // any filtering/selection derives from it, so every downstream view of
  // this array (filtered rows, select-all) stays alphabetical for free.
  const AssignmentRows = [...(PreviewQuery.data?.rows || [])].sort((Left, Right) =>
    (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || "")
  );
  const AssignmentModuleOptions = Array.from(
    new Set(AssignmentRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();
  // 2026-10-08 (Shailesh): the level filter is the ASSIGNED level -- the
  // paper the student sits in this event -- not their current curriculum
  // level, in competition order, plus "No level yet". The module filter
  // stays on the curriculum and is labelled "Current Module" to say so.
  const AssignedLevelCodesPresent = new Set(
    AssignmentRows.map((Row) => Row.existingAssignedLevelCode).filter((Value): Value is string => Boolean(Value))
  );
  const AssignmentLevelOptions = [
    ...ANNUAL_COMPETITION_LEVEL_CODES.filter((LevelCode) => AssignedLevelCodesPresent.has(LevelCode)),
    ...Array.from(AssignedLevelCodesPresent).filter((LevelCode) => !(ANNUAL_COMPETITION_LEVEL_CODES as readonly string[]).includes(LevelCode)).sort(),
  ];
  const AssignmentHasRowsWithoutLevel = AssignmentRows.some((Row) => !Row.existingAssignedLevelCode);
  // 2026-10-08 (a slot per student): filter by the student's slot, or by
  // "waiting for a slot" / "no slot".
  const AssignmentSlotOptions = (Overview?.slots || []).filter((SlotItem) => SlotItem.isActive !== false);
  const AssignmentSearchLower = AssignmentSearchText.trim().toLowerCase();
  const FilteredAssignmentRows = AssignmentRows.filter((Row) => {
    if (AssignmentModuleFilter !== "ALL" && Row.currentModuleCode !== AssignmentModuleFilter) return false;
    if (AssignmentLevelFilter === "NONE") {
      if (Row.existingAssignedLevelCode) return false;
    } else if (AssignmentLevelFilter !== "ALL" && Row.existingAssignedLevelCode !== AssignmentLevelFilter) return false;
    if (AssignmentSlotFilter === "WAITING") {
      if (!Row.existingSlotPending) return false;
    } else if (AssignmentSlotFilter === "NONE") {
      if (!Row.existingAssignedLevelCode || Row.existingSlotId || Row.existingSlotPending) return false;
    } else if (AssignmentSlotFilter !== "ALL" && Row.existingSlotId !== AssignmentSlotFilter) return false;
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

  // 2026-09-29 (Shailesh, Event Roster) -- same search/module/level filter
  // + checkbox-selection pattern as the Assignments table above, applied to
  // the platform-wide student picker. Students already on the roster are
  // excluded from the "add" candidate list (nothing to add twice), same
  // idea as AddStudentsToEventRoster's own idempotent-add on the backend,
  // just kept out of the picker entirely so the admin isn't re-selecting
  // someone who's already there.
  const RosterStudentIds = new Set((RosterQuery.data?.rows || []).map((Row) => Row.studentId));
  const RosterCandidateRows = (AllStudentsQuery.data?.students || [])
    .filter((Row) => !RosterStudentIds.has(Row.studentId))
    .sort((Left, Right) => (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || ""));
  const RosterAddModuleOptions = Array.from(
    new Set(RosterCandidateRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();
  const RosterAddLevelOptions = Array.from(
    new Set(RosterCandidateRows.map((Row) => Row.currentLevelCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();
  const RosterAddSearchLower = RosterAddSearchText.trim().toLowerCase();
  const FilteredRosterCandidateRows = RosterCandidateRows.filter((Row) => {
    if (RosterAddModuleFilter !== "ALL" && Row.currentModuleCode !== RosterAddModuleFilter) return false;
    if (RosterAddLevelFilter !== "ALL" && Row.currentLevelCode !== RosterAddLevelFilter) return false;
    if (RosterAddSearchLower) {
      const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
      if (!Haystack.includes(RosterAddSearchLower)) return false;
    }
    return true;
  });
  const AllFilteredRosterCandidateRowsSelected =
    FilteredRosterCandidateRows.length > 0 &&
    FilteredRosterCandidateRows.every((Row) => SelectedStudentIdsForRosterAdd.has(Row.studentId));
  const ToggleSelectAllFilteredRosterCandidateRows = () => {
    SetSelectedStudentIdsForRosterAdd((Prev) => {
      const Next = new Set(Prev);
      if (AllFilteredRosterCandidateRowsSelected) {
        FilteredRosterCandidateRows.forEach((Row) => Next.delete(Row.studentId));
      } else {
        FilteredRosterCandidateRows.forEach((Row) => Next.add(Row.studentId));
      }
      return Next;
    });
  };
  const ToggleOneRosterCandidateRowSelected = (StudentId: string) => {
    SetSelectedStudentIdsForRosterAdd((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(StudentId)) Next.delete(StudentId);
      else Next.add(StudentId);
      return Next;
    });
  };

  // Current roster's own search + bulk-remove selection.
  const RosterSearchLower = RosterSearchText.trim().toLowerCase();
  const FilteredRosterRows = (RosterQuery.data?.rows || [])
    .filter((Row) => {
      if (!RosterSearchLower) return true;
      const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
      return Haystack.includes(RosterSearchLower);
    })
    .sort((Left, Right) => (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || ""));
  const AllFilteredRosterRowsSelected =
    FilteredRosterRows.length > 0 && FilteredRosterRows.every((Row) => SelectedStudentIdsForRosterRemove.has(Row.studentId));
  const ToggleSelectAllFilteredRosterRows = () => {
    SetSelectedStudentIdsForRosterRemove((Prev) => {
      const Next = new Set(Prev);
      if (AllFilteredRosterRowsSelected) {
        FilteredRosterRows.forEach((Row) => Next.delete(Row.studentId));
      } else {
        FilteredRosterRows.forEach((Row) => Next.add(Row.studentId));
      }
      return Next;
    });
  };
  const ToggleOneRosterRowSelected = (StudentId: string) => {
    SetSelectedStudentIdsForRosterRemove((Prev) => {
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
              <SectionTitle icon={<PlusCircle size={14} />} kicker="New Slot" title="Create Time Slot" description="Fully data-driven — fix the known IM-4/MM-2 duration conflict here by widening a slot or moving a level to its own slot, no deploy required." />
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
                        {FormatCompetitionLevelLabel(LevelCode)}
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
                                  {FormatCompetitionLevelLabel(LevelCode)}
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
                                if (window.confirm(`Delete the slot "${SlotItem.slotLabel || SlotItem.mode}"? Its students move to the other slot for their level, or wait for you to choose one on the Assignments tab. This can't be undone from here.`)) {
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
                              {FormatCompetitionLevelLabel(LevelCode)}
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
            <div className="math-card p-5">
              <SectionTitle
                icon={<Sparkles size={14} />}
                kicker="Bulk Action"
                title="Generate All Official Papers"
                description="Generates the official paper for every level that isn't locked yet, one at a time — a level that already has a locked paper is skipped. The individual Generate/Link buttons on each level below are unaffected."
              />
              <div className="mt-4">
                <button
                  type="button"
                  disabled={GenerateAllPapersMutation.isPending}
                  onClick={() => GenerateAllPapersMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {GenerateAllPapersMutation.isPending ? "Generating All Papers..." : "Generate All Official Papers"}
                </button>
              </div>
            </div>
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
                      <p className="text-base font-black text-slate-950 dark:text-white">{FormatCompetitionLevelLabel(LevelCode)}</p>
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

        {ActiveTab === "ROSTER" && (
          <div className="space-y-6">
            {/* 2026-09-29 (Shailesh, Event Roster): this tab is the single
                eligibility gate behind every assignment path for this event
                (engine "All"/"Selected" runs, manual override, bulk
                override) -- a student not added here can never be assigned
                into this event by any route. Removing a student only stops
                future runs; it never touches an assignment/attempt/result
                that already exists for them. */}
            <div className="math-card p-5">
              <SectionTitle
                icon={<UserPlus size={14} />}
                kicker="Add To Roster"
                title="Add Students"
                description="Platform-wide search — find and select the students who have registered for this event, then add them all at once. Students already on the roster are left out of this list."
              />

              {AllStudentsQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Loading students..." /></div>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px_auto]">
                    <div className="relative sm:col-span-2 lg:col-span-1">
                      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={RosterAddSearchText}
                        onChange={(EventValue) => SetRosterAddSearchText(EventValue.target.value)}
                        placeholder="Search by name or student code..."
                        className="math-input pl-11"
                      />
                    </div>
                    <select
                      value={RosterAddModuleFilter}
                      onChange={(EventValue) => SetRosterAddModuleFilter(EventValue.target.value)}
                      className="math-select"
                      aria-label="Filter by module"
                    >
                      <option value="ALL">All Modules</option>
                      {RosterAddModuleOptions.map((ModuleCode) => (
                        <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                      ))}
                    </select>
                    <select
                      value={RosterAddLevelFilter}
                      onChange={(EventValue) => SetRosterAddLevelFilter(EventValue.target.value)}
                      className="math-select"
                      aria-label="Filter by level"
                    >
                      <option value="ALL">All Levels</option>
                      {RosterAddLevelOptions.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1 lg:justify-self-end">
                      {(RosterAddSearchText || RosterAddModuleFilter !== "ALL" || RosterAddLevelFilter !== "ALL") && (
                        <button
                          type="button"
                          onClick={() => {
                            SetRosterAddSearchText("");
                            SetRosterAddModuleFilter("ALL");
                            SetRosterAddLevelFilter("ALL");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-sm font-bold text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                        >
                          <X size={14} />
                          Clear Filters
                        </button>
                      )}
                      <span className="text-sm font-bold text-slate-400">
                        {FilteredRosterCandidateRows.length} of {RosterCandidateRows.length} shown
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={SelectedStudentIdsForRosterAdd.size === 0 || AddToRosterMutation.isPending}
                      onClick={() => AddToRosterMutation.mutate()}
                      className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserPlus size={14} />
                      {AddToRosterMutation.isPending
                        ? "Adding..."
                        : SelectedStudentIdsForRosterAdd.size > 0
                          ? `Add ${SelectedStudentIdsForRosterAdd.size} Selected`
                          : "Add Selected"}
                    </button>
                    {SelectedStudentIdsForRosterAdd.size > 0 && (
                      <button
                        type="button"
                        onClick={() => SetSelectedStudentIdsForRosterAdd(new Set())}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-2 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                      >
                        <X size={12} />
                        Deselect All ({SelectedStudentIdsForRosterAdd.size})
                      </button>
                    )}
                  </div>

                  {FilteredRosterCandidateRows.length > 0 ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm font-bold">
                        <thead>
                          <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            <th className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={AllFilteredRosterCandidateRowsSelected}
                                onChange={ToggleSelectAllFilteredRosterCandidateRows}
                                aria-label="Select all shown students"
                                className="h-3.5 w-3.5"
                              />
                            </th>
                            <th className="px-2 py-1.5">Student</th>
                            <th className="px-2 py-1.5">Module</th>
                            <th className="px-2 py-1.5">Current Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FilteredRosterCandidateRows.map((Row: AnnualCompetitionPracticeBankStudentRow) => (
                            <tr
                              key={Row.studentId}
                              onClick={() => ToggleOneRosterCandidateRowSelected(Row.studentId)}
                              className="cursor-pointer border-t border-[color:var(--mp-role-border)] transition hover:bg-slate-50 dark:hover:bg-slate-900/40"
                            >
                              <td className="px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={SelectedStudentIdsForRosterAdd.has(Row.studentId)}
                                  onChange={() => ToggleOneRosterCandidateRowSelected(Row.studentId)}
                                  onClick={(EventValue) => EventValue.stopPropagation()}
                                  aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId}`}
                                  className="h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                              <td className="px-2 py-2">{Row.currentModuleCode || "--"}</td>
                              <td className="px-2 py-2">
                                {Row.currentLevelCode || "--"}
                                {Row.currentModuleCode === "MM" && (Row.currentLessonNumber != null || Row.masterLevelComplete) ? (
                                  <span className="ml-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                    ({FormatMasterCurrentLevelSuffix(Row.currentLessonNumber, Row.masterLevelComplete)})
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <EmptyState
                        title={RosterCandidateRows.length > 0 ? "No students match these filters" : "Every eligible student is already on the roster"}
                        description={RosterCandidateRows.length > 0 ? "Try clearing the search text or the module/level filter above." : ""}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="math-card p-5">
              <SectionTitle
                icon={<Users size={14} />}
                kicker="Current Roster"
                title="Students On This Event"
                description="Only students on this roster can be assigned into this event — by the assignment engine or by manual/bulk override. Removing a student only stops future runs; it never touches a result they've already earned."
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-sm">
                  <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={RosterSearchText}
                    onChange={(EventValue) => SetRosterSearchText(EventValue.target.value)}
                    placeholder="Search by name or student code..."
                    className="math-input pl-11"
                  />
                </div>
                <span className="text-sm font-bold text-slate-400">
                  {FilteredRosterRows.length} of {(RosterQuery.data?.rows || []).length} shown
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={SelectedStudentIdsForRosterRemove.size === 0 || RemoveFromRosterMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${SelectedStudentIdsForRosterRemove.size} student(s) from this event's roster? This never touches an assignment/attempt/result they already have — it only stops future assignment runs.`)) {
                      RemoveFromRosterMutation.mutate(Array.from(SelectedStudentIdsForRosterRemove));
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <Trash2 size={14} />
                  {RemoveFromRosterMutation.isPending
                    ? "Removing..."
                    : SelectedStudentIdsForRosterRemove.size > 0
                      ? `Remove ${SelectedStudentIdsForRosterRemove.size} Selected`
                      : "Remove Selected"}
                </button>
                {SelectedStudentIdsForRosterRemove.size > 0 && (
                  <button
                    type="button"
                    onClick={() => SetSelectedStudentIdsForRosterRemove(new Set())}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-2 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                  >
                    <X size={12} />
                    Deselect All ({SelectedStudentIdsForRosterRemove.size})
                  </button>
                )}
              </div>

              {RosterQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Loading roster..." /></div>
              ) : FilteredRosterRows.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm font-bold">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={AllFilteredRosterRowsSelected}
                            onChange={ToggleSelectAllFilteredRosterRows}
                            aria-label="Select all shown students"
                            className="h-3.5 w-3.5"
                          />
                        </th>
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Added</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {FilteredRosterRows.map((Row) => (
                        <tr
                          key={Row.studentId}
                          onClick={() => ToggleOneRosterRowSelected(Row.studentId)}
                          className="cursor-pointer border-t border-[color:var(--mp-role-border)] transition hover:bg-slate-50 dark:hover:bg-slate-900/40"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={SelectedStudentIdsForRosterRemove.has(Row.studentId)}
                              onChange={() => ToggleOneRosterRowSelected(Row.studentId)}
                              onClick={(EventValue) => EventValue.stopPropagation()}
                              aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId}`}
                              className="h-3.5 w-3.5"
                            />
                          </td>
                          <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                          <td className="px-2 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">{FormatDateTime(Row.addedAt)}</td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              disabled={RemoveFromRosterMutation.isPending}
                              onClick={(EventValue) => {
                                EventValue.stopPropagation();
                                if (window.confirm(`Remove ${Row.studentName || Row.studentCode || Row.studentId} from this event's roster?`)) {
                                  RemoveFromRosterMutation.mutate([Row.studentId]);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-black text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:bg-slate-950/60 dark:text-rose-300"
                            >
                              <Trash2 size={11} />
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title={(RosterQuery.data?.rows || []).length > 0 ? "No students match this search" : "No students on this roster yet"}
                    description={(RosterQuery.data?.rows || []).length > 0 ? "Try clearing the search text above." : "Add students from the panel above."}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {ActiveTab === "ASSIGNMENTS" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle icon={<ClipboardList size={14} />} kicker="Assignment Engine" title="Preview &amp; Run" description="Preview changes nothing. A run assigns or updates only levels the engine set itself; it never changes a level an admin has set." />
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

                {/* 2026-09-28 (Shailesh, "Universal Set Level"): set the SAME
                    level for every checked student in one call, instead of one
                    Set Level + Apply per row -- only meaningful once at least
                    one row is checked, so it stays disabled (not hidden --
                    the control's presence is the hint it exists) until then. */}
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-2 py-1.5 dark:bg-slate-950/60">
                  <UserCog size={14} className="ml-1 text-slate-400" />
                  <div className="relative">
                    <select
                      aria-label="Level to set for every selected student"
                      value={BulkOverrideLevelCode}
                      disabled={SelectedStudentIdsForRun.size === 0}
                      onChange={(EventValue) => SetBulkOverrideLevelCode(EventValue.target.value)}
                      className="appearance-none rounded-full bg-transparent py-1 pl-2 pr-6 text-xs font-black text-slate-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200"
                    >
                      {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    disabled={SelectedStudentIdsForRun.size === 0 || BulkOverrideMutation.isPending}
                    onClick={() => BulkOverrideMutation.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--mp-role-action-bg)] px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {BulkOverrideMutation.isPending
                      ? "Setting..."
                      : SelectedStudentIdsForRun.size > 0
                        ? `Set Level for ${SelectedStudentIdsForRun.size} Selected`
                        : "Set Level for Selected"}
                  </button>
                </div>

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
                  <span>{PreviewQuery.data.totalStudentsConsidered} {Plural(PreviewQuery.data.totalStudentsConsidered, "student", "students")}</span>
                  <span className="text-emerald-600 dark:text-emerald-300">{PreviewQuery.data.studentsWithLevelCount} {Plural(PreviewQuery.data.studentsWithLevelCount, "has", "have")} a level</span>
                  {/* Amber only when somebody really has no level, so a warning colour always means "something to do". */}
                  <span className={PreviewQuery.data.studentsWithoutLevelCount > 0 ? "text-amber-600 dark:text-amber-300" : "text-slate-500"}>{PreviewQuery.data.studentsWithoutLevelCount} without a level</span>
                  <span className="text-slate-500">a run would change {PreviewQuery.data.wouldAssignCount}</span>
                  {(PreviewQuery.data.studentsWaitingForSlotCount || 0) > 0 && (
                    <span className="text-amber-600 dark:text-amber-300">{PreviewQuery.data.studentsWaitingForSlotCount} waiting for a slot</span>
                  )}
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
                // 2026-09-15 (Shailesh): same responsive rebuild as the
                // Practice Bank tab's filter row (admin/competition/
                // annual-studio/page.tsx) -- see that file's comment for
                // the full "why". This row used the identical cramped
                // text-xs/fixed-width pattern, copy-pasted from there.
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_230px_230px_250px]">
                  <div className="relative sm:col-span-2 lg:col-span-1">
                    <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={AssignmentSearchText}
                      onChange={(EventValue) => SetAssignmentSearchText(EventValue.target.value)}
                      placeholder="Search by name or student code..."
                      className="math-input pl-11"
                    />
                  </div>
                  <select
                    value={AssignmentModuleFilter}
                    onChange={(EventValue) => SetAssignmentModuleFilter(EventValue.target.value)}
                    className="math-select"
                    aria-label="Filter by current module"
                    title="The student's current module in the curriculum, not the paper they sit"
                  >
                    <option value="ALL">All Current Modules</option>
                    {AssignmentModuleOptions.map((ModuleCode) => (
                      <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                    ))}
                  </select>
                  <select
                    value={AssignmentLevelFilter}
                    onChange={(EventValue) => SetAssignmentLevelFilter(EventValue.target.value)}
                    className="math-select"
                    aria-label="Filter by assigned level"
                  >
                    <option value="ALL">All Assigned Levels</option>
                    {AssignmentLevelOptions.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                    ))}
                    {AssignmentHasRowsWithoutLevel && <option value="NONE">No level yet</option>}
                  </select>
                  <select
                    value={AssignmentSlotFilter}
                    onChange={(EventValue) => SetAssignmentSlotFilter(EventValue.target.value)}
                    className="math-select"
                    aria-label="Filter by slot"
                  >
                    <option value="ALL">All Slots</option>
                    {AssignmentSlotOptions.map((SlotItem) => (
                      <option key={SlotItem.slotId} value={SlotItem.slotId}>
                        {SlotItem.slotLabel || FormatDateTime(SlotItem.scheduledStartAt)}
                      </option>
                    ))}
                    <option value="WAITING">Waiting for a slot</option>
                    <option value="NONE">No slot</option>
                  </select>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4 lg:justify-self-end">
                    {(AssignmentSearchText || AssignmentModuleFilter !== "ALL" || AssignmentLevelFilter !== "ALL" || AssignmentSlotFilter !== "ALL") && (
                      <button
                        type="button"
                        onClick={() => {
                          SetAssignmentSearchText("");
                          SetAssignmentModuleFilter("ALL");
                          SetAssignmentLevelFilter("ALL");
                          SetAssignmentSlotFilter("ALL");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-sm font-bold text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                      >
                        <X size={14} />
                        Clear Filters
                      </button>
                    )}
                    <span className="text-sm font-bold text-slate-400">
                      {FilteredAssignmentRows.length} of {AssignmentRows.length} shown
                    </span>
                  </div>
                </div>
              )}

              {PreviewQuery.isLoading ? (
                <div className="mt-4"><LoadingState label="Computing preview..." /></div>
              ) : PreviewQuery.data && FilteredAssignmentRows.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left text-sm font-bold">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={AllFilteredAssignmentRowsSelected}
                            onChange={ToggleSelectAllFilteredAssignmentRows}
                            aria-label="Select all shown students"
                            className="h-3.5 w-3.5"
                          />
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Current Level</th>
                        <th className="whitespace-nowrap px-2 py-1.5">Engine Suggestion</th>
                        <th className="whitespace-nowrap px-2 py-1.5">Assigned Level</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Set Level</th>
                        <th className="px-2 py-1.5">Slot</th>
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
                          <tr
                            key={Row.studentId}
                            onClick={() => ToggleOneAssignmentRowSelected(Row.studentId)}
                            className="cursor-pointer border-t border-[color:var(--mp-role-border)] transition hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          >
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={SelectedStudentIdsForRun.has(Row.studentId)}
                                onChange={() => ToggleOneAssignmentRowSelected(Row.studentId)}
                                onClick={(EventValue) => EventValue.stopPropagation()}
                                aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId} for next run`}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">
                              {Row.currentLevelCode || "--"}
                              {/* 2026-09-15 (Shailesh): same Master lesson-
                                  number clarification as the Practice Bank
                                  tab -- see that tab's own comment. */}
                              {Row.currentModuleCode === "MM" && (Row.currentLessonNumber != null || Row.masterLevelComplete) ? (
                                <span className="ml-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                  ({FormatMasterCurrentLevelSuffix(Row.currentLessonNumber, Row.masterLevelComplete)})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              {Row.computedAssignedLevelCode ? FormatCompetitionLevelLabel(Row.computedAssignedLevelCode) : "--"}
                              {Row.requiresNewPaperRegistryEntry && Row.computedAssignedLevelCode && (
                                <ShieldAlert size={12} className="ml-1.5 inline text-amber-500" aria-label="No paper registry entry yet" />
                              )}
                            </td>
                            <td className="px-2 py-2">{Row.existingAssignedLevelCode ? FormatCompetitionLevelLabel(Row.existingAssignedLevelCode) : "--"} {Row.existingAssignmentSource === "ADMIN_OVERRIDE" && <span className="text-slate-400">(set by admin)</span>}</td>
                            <td className="px-2 py-2">
                              {/* What matters first is whether the student HAS a level.
                                  A level set by an admin is kept whether or not the
                                  engine has a rule for the student, so it is never
                                  shown as a warning. Amber is only for a student
                                  who really has no level yet. */}
                              {Row.existingAssignmentSource === "ADMIN_OVERRIDE" ? (
                                <span className="text-slate-500 dark:text-slate-400">Set by admin, kept</span>
                              ) : Row.noRuleMatched && !Row.existingAssignedLevelCode ? (
                                <span className="text-amber-600 dark:text-amber-300">
                                  <span className="block whitespace-nowrap">No level yet: set by hand</span>
                                  <span className="block whitespace-nowrap text-[11px] font-semibold opacity-90">{NoRuleReasonText(Row.reason)}</span>
                                </span>
                              ) : Row.wouldChangeOnRun ? (
                                <span className="text-emerald-600 dark:text-emerald-300">{Row.existingAssignedLevelCode ? "Will change on run" : "Will be assigned on run"}</span>
                              ) : (
                                <span className="text-slate-500 dark:text-slate-400">Already assigned</span>
                              )}
                            </td>
                            <td className="px-2 py-2" onClick={(EventValue) => EventValue.stopPropagation()}>
                              {/* Deliberately independent of the auto-picker above -- this
                                  never writes anything until Apply is clicked, and the
                                  auto-picker/Run Assignment Engine flow is completely
                                  unaffected by this control existing. Only for the
                                  "unavoidable circumstances" escape hatch (Shailesh,
                                  2026-09-08 point 1) -- the override option stays exactly
                                  as it was otherwise. onClick above stops this cell's clicks
                                  from bubbling to the row's own onClick (row selection). */}
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
                                    <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
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
                            <td className="px-2 py-2" onClick={(EventValue) => EventValue.stopPropagation()}>
                              <AssignmentSlotCell
                                Row={Row}
                                Slots={Overview?.slots || []}
                                Saving={RowSlotMutation.isPending && RowSlotMutation.variables?.StudentId === Row.studentId}
                                OnChoose={(SlotId) => RowSlotMutation.mutate({ StudentId: Row.studentId, SlotId })}
                              />
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
                  description="Updates by itself every 5 seconds while this tab is open. Remaining is the time left in the whole paper. Stuck means no signal from the student's device for 45 seconds; their clock is paused until they are back."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <AnnualLiveUpdatedAgo FetchedAtMs={LiveMonitoringQuery.dataUpdatedAt} />
                  <AnnualLiveLevelFilter
                    Value={LiveLevelFilter}
                    LevelCodes={LiveMonitoringQuery.data?.levelCodes ?? []}
                    OnChange={SetLiveLevelFilter}
                  />
                  <button
                    type="button"
                    disabled={LiveMonitoringQuery.isFetching}
                    onClick={() => LiveMonitoringQuery.refetch()}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                  >
                    <RefreshCcw size={14} />
                    Refresh Now
                  </button>
                  <button
                    type="button"
                    disabled={ReconcileMutation.isPending}
                    onClick={() => {
                      // 2026-10-07 (event-day readiness): this submits the paper
                      // of every student whose device has gone quiet, and a
                      // child who is only disconnected mid-slot is exactly
                      // that. The old wording ("abandoned attempt ... grace
                      // window") did not say so. It now does, with how many
                      // students it would end right now.
                      const StuckNow = LiveMonitoringQuery.data?.summary.stuckCount ?? 0;
                      const Warning =
                        "This submits the paper of every student in this event whose device has sent no signal for 45 seconds." +
                        "\n\nThat includes students who are only disconnected and could still come back and finish. Their paper ends now, with whatever they have answered." +
                        `\n\nStudents shown as Stuck right now: ${StuckNow}${LiveLevelFilter === ANNUAL_LIVE_ALL_LEVELS ? "" : " in the level you are viewing (the sweep covers every level)"}.` +
                        "\n\nUse it only after a slot has finished. It cannot be undone.\n\nSubmit those papers now?";
                      if (window.confirm(Warning)) {
                        ReconcileMutation.mutate();
                      }
                    }}
                    title="Submits the paper of every student whose device has gone quiet. Use only after a slot has finished."
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
                <AnnualLiveMonitoringTable
                  Rows={LiveMonitoringQuery.data.rows}
                  FetchedAtMs={LiveMonitoringQuery.dataUpdatedAt}
                  GraceSeconds={LiveMonitoringQuery.data.heartbeatGraceSeconds ?? 45}
                />
              ) : (
                <div className="mt-4">
                  <EmptyState title="No assignments yet" description="Run the assignment engine first — nothing to monitor until students are assigned to this event." />
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
                description="Admin always sees every computed result here regardless of release — the release gate only applies to the student/parent-facing endpoint. Releasing always re-ranks first, in the same step."
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Filter by Level
                  <select
                    value={ResultsLevelFilter}
                    onChange={(EventValue) => {
                      const NewLevelFilter = EventValue.target.value;
                      SetResultsLevelFilter(NewLevelFilter);
                      // Rank Level has no "All Levels" option, so only sync
                      // when a specific level was picked -- picking a real
                      // level to review is the moment you'd also want to
                      // rank/release that same level, so default Rank Level
                      // to match rather than leaving it on whatever level it
                      // was last set to. Rank Level can still be changed
                      // independently afterward if a different level needs
                      // ranking than the one being viewed.
                      if (NewLevelFilter !== "ALL") {
                        SetRankLevelCode(NewLevelFilter);
                      }
                    }}
                    className="math-input"
                  >
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Rank Level
                  <select value={RankLevelCode} onChange={(EventValue) => SetRankLevelCode(EventValue.target.value)} className="math-input">
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
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
                  {RankResultsMutation.isPending ? "Ranking..." : `Rank ${FormatCompetitionLevelLabel(RankLevelCode)}`}
                </button>
                <button
                  type="button"
                  disabled={ReleaseResultsForLevelMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Release results for ${FormatCompetitionLevelLabel(RankLevelCode)}? Students/parents will be able to see them immediately.`)) {
                      ReleaseResultsForLevelMutation.mutate(RankLevelCode);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Release {FormatCompetitionLevelLabel(RankLevelCode)}
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
                  title="Refreshes already-computed scores under the current scoring rules — never touches release status or rank."
                  onClick={() => {
                    const Scope = ResultsLevelFilter === "ALL" ? "every level of this event" : ShortCompetitionLevelLabel(ResultsLevelFilter);
                    if (window.confirm(`Recompute results for ${Scope}? This refreshes scores/marks under the current scoring rules — release status and rank are never touched.`)) {
                      RecomputeResultsMutation.mutate();
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                >
                  <RefreshCcw size={14} />
                  {RecomputeResultsMutation.isPending ? "Recomputing..." : `Recompute ${ResultsLevelFilter === "ALL" ? "All Levels" : ShortCompetitionLevelLabel(ResultsLevelFilter)}`}
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
                  <table className="w-full min-w-[1060px] table-fixed text-left text-sm font-bold">
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
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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
                            <td className="px-2 py-2 truncate">{FormatCompetitionLevelLabel(Row.competitionLevelCode)}</td>
                            {/* 2026-09-17 (Shailesh): whole numbers only, no
                                decimals, across every competition attempt
                                view -- the backend already rounds this via
                                RoundPercentageForDisplay, Math.round here is
                                the same defensive second layer every other
                                review/scorecard page now applies. */}
                            <td className="px-2 py-2 truncate">{Math.round(Row.accuracyPercentage)}%</td>
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
                                    ? "An unused retry grant already exists for this student — they'll get a fresh attempt on the same paper next time they log in."
                                    : "Grant this student one fresh attempt on the same paper (REQUIREMENTS.md item 6 — genuine technical-issue retakes, also usable for re-testing)."
                                }
                                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60"
                                onClick={() => {
                                  const Reason = window.prompt(
                                    `Reason for granting ${Row.studentName || Row.studentCode || Row.studentId} a retry on ${FormatCompetitionLevelLabel(Row.competitionLevelCode)}? (required)`
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
                  <EmptyState title="No results computed yet" description="Results appear automatically once a student's last section closes — nothing to review until then." />
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
