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
  PRACTICE_BULK_MAX_STUDENTS_PER_CALL,
  batchAssignAnnualCompetitionPracticePapers,
  createAnnualCompetitionEvent,
  deleteAllAnnualCompetitionPracticeRecordsForStudent,
  deleteAnnualCompetitionEvent,
  deleteAnnualCompetitionPracticeAttempt,
  listAnnualCompetitionEvents,
  listAnnualCompetitionPracticeResults,
  listStudentsForAnnualCompetitionPracticeBank,
  recomputeAllAnnualCompetitionOfficialResults,
  recomputeAnnualCompetitionPracticeResults,
  updateAnnualCompetitionEvent,
  type AnnualCompetitionEvent,
  type AnnualCompetitionPracticeBatchAssignFailedRow,
  type AnnualCompetitionPracticeRosterStudent,
} from "@/lib/api/admin";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Medal,
  Pencil,
  PlusCircle,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

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
  const StatusValue = String(status || "DRAFT").toUpperCase();
  const ChipClass =
    StatusValue === "COMPLETED"
      ? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
      : StatusValue === "DRAFT"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        : StatusValue === "LIVE"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ChipClass}`}>{StatusValue}</span>;
}

function FormatEventDate(Value: string | null) {
  if (!Value) return "Not set";
  try {
    return new Date(Value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return Value;
  }
}

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

// Mirrors the identically-named helper on the per-event detail page
// ([eventId]/page.tsx) -- converts an ISO string into the value a
// datetime-local input expects, so the edit form can be pre-filled with
// the event's current dates.
function ToLocalInputValue(IsoValue: string | null): string {
  if (!IsoValue) return "";
  const D = new Date(IsoValue);
  if (Number.isNaN(D.getTime())) return "";
  const Pad = (N: number) => String(N).padStart(2, "0");
  return `${D.getFullYear()}-${Pad(D.getMonth() + 1)}-${Pad(D.getDate())}T${Pad(D.getHours())}:${Pad(D.getMinutes())}`;
}

// 2026-09-12 (Shailesh, full event decoupling): "there are 2 sub tabs in
// the annual competition studio, one practice ... and the other sub tab
// for the official competition ... just like the student tab has 2 sub
// tabs exactly like that the admin should also see it." Official mirrors
// this page's own pre-existing content (create event + events list, each
// event drilling into its own slots/papers/assignments/monitoring/results);
// Practice is fully event-independent -- see PracticeSubTabList below.
const TopTabList = ["OFFICIAL", "PRACTICE"] as const;
type TopTabKey = (typeof TopTabList)[number];

// "the practice tab must have 2 sub tabs within, one for the practice bank
// with the list of all students where they can be assigned papers
// simultaneously and the second sub tab for the practice results."
const PracticeSubTabList = ["BANK", "RESULTS"] as const;
type PracticeSubTabKey = (typeof PracticeSubTabList)[number];

export default function AdminAnnualCompetitionStudioPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();

  const [TopTab, SetTopTab] = useState<TopTabKey>("OFFICIAL");
  const [PracticeSubTab, SetPracticeSubTab] = useState<PracticeSubTabKey>("BANK");
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Official (unchanged from before the Official/Practice split -- create
  // event form + events list, each event drilling into its own detail page
  // for slots/papers/assignments/monitoring/results).
  // ---------------------------------------------------------------------

  const [EventName, SetEventName] = useState("");
  const [CompetitionDateInput, SetCompetitionDateInput] = useState("");
  const [ResultsReleaseInput, SetResultsReleaseInput] = useState("");

  const EventsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "events"],
    queryFn: listAnnualCompetitionEvents,
    enabled: Ready && TopTab === "OFFICIAL",
    placeholderData: keepPreviousData,
  });
  const Events = EventsQuery.data || [];

  const CreateMutation = useMutation({
    mutationFn: () =>
      createAnnualCompetitionEvent({
        name: EventName.trim(),
        competitionDate: new Date(CompetitionDateInput).toISOString(),
        resultsReleaseAt: ResultsReleaseInput ? new Date(ResultsReleaseInput).toISOString() : null,
      }),
    onSuccess: (Created) => {
      SetLastMessage(`"${Created.name}" created.`);
      SetEventName("");
      SetCompetitionDateInput("");
      SetResultsReleaseInput("");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  const CanCreate = EventName.trim().length > 0 && Boolean(CompetitionDateInput);

  // --- Event edit form state -- an event's own row switches into this
  // inline form when EditingEventId matches it; the Create form above is
  // untouched. Deliberately scoped to Name/Competition Date/Results Release
  // Date only (what Shailesh asked for -- "edit the dates and everything
  // else related to an event") and not Status: the per-event detail page
  // already has dedicated DRAFT/SCHEDULED/LIVE/COMPLETED buttons for that,
  // so duplicating a status control here would just be a second place for
  // it to go stale against.
  const [EditingEventId, SetEditingEventId] = useState<string | null>(null);
  const [EditEventName, SetEditEventName] = useState("");
  const [EditCompetitionDateInput, SetEditCompetitionDateInput] = useState("");
  const [EditResultsReleaseInput, SetEditResultsReleaseInput] = useState("");

  const StartEditingEvent = (EventItem: AnnualCompetitionEvent) => {
    SetEditingEventId(EventItem.eventId);
    SetEditEventName(EventItem.name);
    SetEditCompetitionDateInput(ToLocalInputValue(EventItem.competitionDate));
    SetEditResultsReleaseInput(ToLocalInputValue(EventItem.resultsReleaseAt));
  };

  const CancelEditingEvent = () => SetEditingEventId(null);

  const UpdateEventMutation = useMutation({
    mutationFn: (EventId: string) =>
      updateAnnualCompetitionEvent(EventId, {
        name: EditEventName.trim(),
        competitionDate: new Date(EditCompetitionDateInput).toISOString(),
        ...(EditResultsReleaseInput
          ? { resultsReleaseAt: new Date(EditResultsReleaseInput).toISOString() }
          : { clearResultsReleaseAt: true }),
      }),
    onSuccess: (Updated) => {
      SetLastMessage(`"${Updated.name}" updated.`);
      SetEditingEventId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  // Hard delete (CompetitionEvent has no isActive flag to soft-delete with,
  // unlike slots). 2026-09-10 (Shailesh): the backend used to reject this
  // once the event had a real attempt or a locked results-release date --
  // that guard has been removed on purpose, so this is now reachable even
  // for an event with attempts/released results/certificates, as an admin
  // escape hatch for unavoidable circumstances. Confirmed before deleting,
  // same as this page's other consequential actions, with copy that now
  // reflects how much more this button can actually do.
  const DeleteEventMutation = useMutation({
    mutationFn: (EventId: string) => deleteAnnualCompetitionEvent(EventId),
    onSuccess: () => {
      SetLastMessage("Event deleted.");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  // ---------------------------------------------------------------------
  // Practice -- Bank (2026-09-12, bulk assignment): "let the admin just
  // assign papers to all the students and let them practice instead of
  // creating unnecessary events." Fully event-independent -- the roster
  // below is every active student, tagged with the level they're currently
  // eligible for, so the admin can select all, many, or a filtered subset
  // and assign in one action. A selection larger than
  // PRACTICE_BULK_MAX_STUDENTS_PER_CALL is chunked into sequential calls
  // client-side (this backend has no background job queue -- see that
  // constant's own comment in lib/api/admin.ts) with progress shown below.
  // ---------------------------------------------------------------------

  const [PracticeSearchText, SetPracticeSearchText] = useState("");
  const [PracticeModuleFilter, SetPracticeModuleFilter] = useState<string>("ALL");
  const [PracticeEligibleOnly, SetPracticeEligibleOnly] = useState(false);
  const [SelectedStudentIdsForPractice, SetSelectedStudentIdsForPractice] = useState<Set<string>>(new Set());
  const [PracticeAssignLevelCode, SetPracticeAssignLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const [PracticeAssignQuantity, SetPracticeAssignQuantity] = useState<number>(PRACTICE_BATCH_QUANTITY_OPTIONS[0]);
  const [BulkAssignProgress, SetBulkAssignProgress] = useState<{ Done: number; Total: number } | null>(null);
  const [BulkAssignSummary, SetBulkAssignSummary] = useState<{
    StudentsSucceeded: number;
    StudentsFailed: number;
    TotalPapersAssigned: number;
    FailedRows: AnnualCompetitionPracticeBatchAssignFailedRow[];
  } | null>(null);

  const StudentsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-bank-students"],
    queryFn: listStudentsForAnnualCompetitionPracticeBank,
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "BANK",
  });
  const StudentRows = StudentsQuery.data?.students || [];

  const PracticeModuleOptions = Array.from(
    new Set(StudentRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();

  const PracticeSearchLower = PracticeSearchText.trim().toLowerCase();
  const FilteredStudentRows = StudentRows.filter((Row) => {
    if (PracticeModuleFilter !== "ALL" && Row.currentModuleCode !== PracticeModuleFilter) return false;
    if (PracticeEligibleOnly && Row.eligibleCompetitionLevelCode !== PracticeAssignLevelCode) return false;
    if (PracticeSearchLower) {
      const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
      if (!Haystack.includes(PracticeSearchLower)) return false;
    }
    return true;
  });

  const AllFilteredStudentRowsSelected =
    FilteredStudentRows.length > 0 && FilteredStudentRows.every((Row) => SelectedStudentIdsForPractice.has(Row.studentId));
  const ToggleSelectAllFilteredStudentRows = () => {
    SetSelectedStudentIdsForPractice((Prev) => {
      const Next = new Set(Prev);
      if (AllFilteredStudentRowsSelected) {
        FilteredStudentRows.forEach((Row) => Next.delete(Row.studentId));
      } else {
        FilteredStudentRows.forEach((Row) => Next.add(Row.studentId));
      }
      return Next;
    });
  };
  const ToggleOneStudentRowSelected = (StudentId: string) => {
    SetSelectedStudentIdsForPractice((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(StudentId)) Next.delete(StudentId);
      else Next.add(StudentId);
      return Next;
    });
  };

  const InvalidatePracticeResults = () =>
    QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "practice-results"] });

  const BulkAssignMutation = useMutation({
    mutationFn: async () => {
      const StudentIds = Array.from(SelectedStudentIdsForPractice);
      const Chunks: string[][] = [];
      for (let Index = 0; Index < StudentIds.length; Index += PRACTICE_BULK_MAX_STUDENTS_PER_CALL) {
        Chunks.push(StudentIds.slice(Index, Index + PRACTICE_BULK_MAX_STUDENTS_PER_CALL));
      }
      SetBulkAssignProgress({ Done: 0, Total: Chunks.length });
      let StudentsSucceeded = 0;
      let StudentsFailed = 0;
      let TotalPapersAssigned = 0;
      const FailedRows: AnnualCompetitionPracticeBatchAssignFailedRow[] = [];
      for (let Index = 0; Index < Chunks.length; Index++) {
        const Result = await batchAssignAnnualCompetitionPracticePapers({
          studentIds: Chunks[Index],
          competitionLevelCode: PracticeAssignLevelCode,
          quantity: PracticeAssignQuantity,
        });
        StudentsSucceeded += Result.studentsSucceeded;
        StudentsFailed += Result.studentsFailed;
        TotalPapersAssigned += Result.totalPapersAssigned;
        FailedRows.push(...Result.failed);
        SetBulkAssignProgress({ Done: Index + 1, Total: Chunks.length });
      }
      return { StudentsSucceeded, StudentsFailed, TotalPapersAssigned, FailedRows };
    },
    onSuccess: (Result) => {
      SetLastMessage(
        `Assigned ${PracticeAssignQuantity} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} of ${PracticeAssignLevelCode} to ${Result.StudentsSucceeded} student${Result.StudentsSucceeded === 1 ? "" : "s"}` +
          (Result.StudentsFailed > 0 ? `, ${Result.StudentsFailed} failed.` : ".")
      );
      SetBulkAssignSummary(Result);
      SetSelectedStudentIdsForPractice(new Set());
      SetBulkAssignProgress(null);
      InvalidatePracticeResults();
    },
    onError: () => SetBulkAssignProgress(null),
  });

  // ---------------------------------------------------------------------
  // Practice -- Results. Never ranked, and always released to the student
  // the instant it's computed -- a separate surface from any OFFICIAL
  // event's own Rank & Release list, never mixed with it, and no longer
  // scoped to any one event either.
  // ---------------------------------------------------------------------

  const [PracticeResultsLevelFilter, SetPracticeResultsLevelFilter] = useState<string>("ALL");
  const [PracticeResultsSearchText, SetPracticeResultsSearchText] = useState("");
  const [ExpandedPracticeStudents, SetExpandedPracticeStudents] = useState<Set<string>>(new Set());

  const PracticeResultsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-results", PracticeResultsLevelFilter],
    queryFn: () =>
      listAnnualCompetitionPracticeResults({
        competitionLevelCode: PracticeResultsLevelFilter === "ALL" ? undefined : PracticeResultsLevelFilter,
      }),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "RESULTS",
  });

  // 2026-09-14 (Shailesh): "if a single student will have multiple attempts,
  // then how will the data here be handled? ... we need to figure a way out
  // where we can see the data cleanly." Agreed fix: group by student
  // (mirrors the Competition Mock Tracker's own StudentMockGroup pattern in
  // admin/competition/mock-tracker/page.tsx). The backend now does this
  // grouping itself (ListAnnualCompetitionPracticeResultsForAdmin returns
  // students[].papers[] directly, every paper ascending by paperOrdinal,
  // pending AND submitted together) -- this page just filters and sorts
  // what it's given, no client-side re-grouping needed anymore.
  const GroupedPracticeResults = (() => {
    const Term = PracticeResultsSearchText.trim().toLowerCase();
    const Students = PracticeResultsQuery.data?.students || [];
    const Filtered = !Term
      ? Students
      : Students.filter((StudentGroup) => {
          const Haystack = [
            StudentGroup.studentName,
            StudentGroup.studentCode,
            ...StudentGroup.papers.map((Paper) => Paper.competitionLevelCode),
            ...StudentGroup.papers.map((Paper) => Paper.paperLabel),
          ]
            .join(" ")
            .toLowerCase();
          return Haystack.includes(Term);
        });
    return [...Filtered].sort((Left, Right) =>
      (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || "")
    );
  })();
  function TogglePracticeStudentExpanded(Key: string) {
    SetExpandedPracticeStudents((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  // 2026-09-14 (Shailesh): per-row and per-student-block delete icons in
  // the admin Practice view. Both mutations invalidate the same query key
  // the practice-results list itself uses, so the table reflects the
  // deletion immediately without a manual refetch call.
  const DeletePracticeAttemptMutation = useMutation({
    mutationFn: (LevelPaperId: string) => deleteAnnualCompetitionPracticeAttempt(LevelPaperId),
    onSuccess: () => InvalidatePracticeResults(),
  });
  const DeleteAllPracticeForStudentMutation = useMutation({
    mutationFn: (StudentId: string) => deleteAllAnnualCompetitionPracticeRecordsForStudent(StudentId),
    onSuccess: () => InvalidatePracticeResults(),
  });

  // 2026-09-14 batch (Shailesh: "for accuracy breakdown part if possible
  // lets backfill the existing attempts as well"). The backend recompute
  // routes (RecomputeAnnualCompetitionResults/RecomputeAnnualCompetition-
  // PracticeResults) already existed API-only with no UI trigger anywhere
  // -- these two buttons are that trigger. Idempotent and safe to run more
  // than once: never touches is_released/rank/consumed_at, only refreshes
  // score/accuracy/correct/wrong/unanswered under whatever the current
  // scoring formula is (see RecomputeAnnualCompetitionResults's own
  // docstring). Both mutations invalidate the same query keys the results
  // tables themselves use, so a refreshed row shows up immediately.
  const RecomputeOfficialMutation = useMutation({
    mutationFn: () => recomputeAllAnnualCompetitionOfficialResults(),
    onSuccess: (Result) => {
      SetLastMessage(`Recomputed ${Result.recomputedCount} official result${Result.recomputedCount === 1 ? "" : "s"}.`);
      // Matches the per-event results query key from
      // annual-studio/[eventId]/page.tsx (["admin", "annual-competition",
      // "results", EventId, ...]) as a prefix, so any such query already in
      // the cache is marked stale and refetches next time that page mounts.
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "results"] });
    },
  });
  const RecomputePracticeMutation = useMutation({
    mutationFn: () => recomputeAnnualCompetitionPracticeResults(),
    onSuccess: (Result) => {
      SetLastMessage(`Recomputed ${Result.recomputedCount} practice result${Result.recomputedCount === 1 ? "" : "s"}.`);
      InvalidatePracticeResults();
    },
  });

  if (!Ready) return null;

  const AnyError =
    EventsQuery.error ||
    CreateMutation.error ||
    UpdateEventMutation.error ||
    DeleteEventMutation.error ||
    RecomputeOfficialMutation.error ||
    RecomputePracticeMutation.error ||
    (TopTab === "PRACTICE" && PracticeSubTab === "BANK" ? StudentsQuery.error || BulkAssignMutation.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "RESULTS" ? PracticeResultsQuery.error : null);

  return (
    <AppShell title="Annual Competition Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />Annual Competition</p>
          <h1 className="math-title">Annual Competition Studio</h1>
          <p className="mt-3 max-w-none text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            Official runs the real, scheduled Annual Competition event end to end -- slots, each level&apos;s official
            paper, and student assignments. Practice is fully separate and never tied to any event -- assign practice
            papers to any number of students at once so they can prepare for the mega event, independent of any
            official assignment.
          </p>
        </div>

        {AnyError && <ErrorState message={apiErrorMessage(AnyError)} />}
        {LastMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastMessage}
          </div>
        )}

        {/* 2026-09-14 batch: one-time (and repeatable) accuracy backfill
            trigger -- see the mutations above for what this actually calls.
            Safe to click more than once; only refreshes already-finalized
            results under the current formula, never touches release/rank
            state. */}
        <div className="math-card p-5">
          <p className="math-block-header"><RefreshCcw size={14} />Accuracy Backfill</p>
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Recomputes score/accuracy/correct/wrong/unanswered for every already-finalized result under the current
            formula. Never touches release status, rank, or certificates -- safe to run again anytime.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => RecomputeOfficialMutation.mutate()}
              disabled={RecomputeOfficialMutation.isPending}
              className="math-button-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-60"
            >
              <RefreshCcw size={14} className={RecomputeOfficialMutation.isPending ? "animate-spin" : ""} />
              {RecomputeOfficialMutation.isPending ? "Recomputing..." : "Recompute Official Results"}
            </button>
            <button
              type="button"
              onClick={() => RecomputePracticeMutation.mutate()}
              disabled={RecomputePracticeMutation.isPending}
              className="math-button-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-60"
            >
              <RefreshCcw size={14} className={RecomputePracticeMutation.isPending ? "animate-spin" : ""} />
              {RecomputePracticeMutation.isPending ? "Recomputing..." : "Recompute Practice Results"}
            </button>
          </div>
        </div>

        <div className="math-card p-3">
          <div className="flex flex-wrap gap-3">
            {TopTabList.map((Tab) => (
              <button
                key={Tab}
                type="button"
                onClick={() => SetTopTab(Tab)}
                aria-selected={TopTab === Tab}
                className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${TopTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
              >
                {Tab === "OFFICIAL" ? "Official" : "Practice"}
              </button>
            ))}
          </div>
        </div>

        {TopTab === "OFFICIAL" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle
                icon={<PlusCircle size={14} />}
                kicker="New Event"
                title="Create Annual Competition Event"
                description="One event per real competition date. Results Release Date can be left blank until MathPath confirms it -- setting it later locks every linked level paper."
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
                  Event Name
                  <input
                    value={EventName}
                    onChange={(EventValue) => SetEventName(EventValue.target.value)}
                    placeholder="Example: MathPath Annual Competition 2026"
                    className="math-input"
                  />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Competition Date &amp; Time
                  <input
                    type="datetime-local"
                    value={CompetitionDateInput}
                    onChange={(EventValue) => SetCompetitionDateInput(EventValue.target.value)}
                    className="math-input"
                  />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Results Release Date &amp; Time (optional)
                  <input
                    type="datetime-local"
                    value={ResultsReleaseInput}
                    onChange={(EventValue) => SetResultsReleaseInput(EventValue.target.value)}
                    className="math-input"
                  />
                  <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">
                    Formal Results &amp; Prize Distribution date, once confirmed. Leave blank for now.
                  </span>
                </label>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  disabled={!CanCreate || CreateMutation.isPending}
                  onClick={() => CreateMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusCircle size={16} />
                  {CreateMutation.isPending ? "Creating..." : "Create Event"}
                </button>
              </div>
            </div>

            <div className="math-card p-5">
              <SectionTitle icon={<CalendarClock size={14} />} kicker="Events" title="Annual Competition Events" description="Open an event to manage its slots, official papers, and assignments." />
              {EventsQuery.isLoading ? (
                <div className="mt-5"><LoadingState label="Loading events..." /></div>
              ) : Events.length === 0 ? (
                <div className="mt-5">
                  <EmptyState title="No Annual Competition events yet" description="Create the first one above." />
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {Events.map((EventItem: AnnualCompetitionEvent) =>
                    EditingEventId === EventItem.eventId ? (
                      <div key={EventItem.eventId} className="rounded-2xl border border-[color:var(--mp-role-border-strong)] bg-white p-4 dark:bg-slate-950/40">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
                            Event Name
                            <input value={EditEventName} onChange={(EventValue) => SetEditEventName(EventValue.target.value)} className="math-input" />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Competition Date &amp; Time
                            <input
                              type="datetime-local"
                              value={EditCompetitionDateInput}
                              onChange={(EventValue) => SetEditCompetitionDateInput(EventValue.target.value)}
                              className="math-input"
                            />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Results Release Date &amp; Time (optional)
                            <input
                              type="datetime-local"
                              value={EditResultsReleaseInput}
                              onChange={(EventValue) => SetEditResultsReleaseInput(EventValue.target.value)}
                              className="math-input"
                            />
                            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Leave blank to keep it unset.</span>
                          </label>
                        </div>
                        {UpdateEventMutation.isError && (
                          <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-300">{apiErrorMessage(UpdateEventMutation.error)}</p>
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={!EditEventName.trim() || !EditCompetitionDateInput || UpdateEventMutation.isPending}
                            onClick={() => UpdateEventMutation.mutate(EventItem.eventId)}
                            className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                            {UpdateEventMutation.isPending ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={CancelEditingEvent}
                            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition hover:-translate-y-px dark:bg-slate-950/40 dark:text-slate-300"
                          >
                            <X size={16} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={EventItem.eventId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-5 py-4 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-slate-950/40"
                      >
                        <Link href={`/admin/competition/annual-studio/${EventItem.eventId}`} className="min-w-0 flex-1">
                          <p className="text-base font-black text-slate-950 dark:text-white">{EventItem.name}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {FormatEventDate(EventItem.competitionDate)}
                          </p>
                        </Link>
                        <div className="flex items-center gap-3">
                          <StatusChip status={EventItem.status} />
                          <button
                            type="button"
                            title="Edit event"
                            aria-label="Edit event"
                            onClick={(ClickEvent) => {
                              ClickEvent.preventDefault();
                              StartEditingEvent(EventItem);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--mp-role-border)] text-slate-500 transition hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete event"
                            aria-label="Delete event"
                            disabled={DeleteEventMutation.isPending}
                            onClick={(ClickEvent) => {
                              ClickEvent.preventDefault();
                              if (
                                window.confirm(
                                  `Delete "${EventItem.name}"? This removes the event and everything under it -- slots, papers, assignments, and ALL student attempts, answers, and results, even if results have already been released and certificates issued. This can't be undone.`
                                )
                              ) {
                                DeleteEventMutation.mutate(EventItem.eventId);
                              }
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {TopTab === "PRACTICE" && (
          <div className="space-y-6">
            <div className="math-card p-3">
              <div className="flex flex-wrap gap-3">
                {PracticeSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetPracticeSubTab(Tab)}
                    aria-selected={PracticeSubTab === Tab}
                    className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                  >
                    {Tab === "BANK" ? "Practice Bank" : "Practice Results"}
                  </button>
                ))}
              </div>
            </div>

            {PracticeSubTab === "BANK" && (
              <div className="math-card p-5">
                <SectionTitle
                  icon={<Sparkles size={14} />}
                  kicker="Practice Bank"
                  title="Assign Practice Papers"
                  description="Generates fresh, always-different practice papers and adds them to every selected student's bank for a level -- safe to call repeatedly, it never touches or consumes a paper already there. Select all, many, or a filtered subset of students below. Quantity must be a multiple of 5, up to 25 per batch."
                />

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Level To Assign
                    <select
                      value={PracticeAssignLevelCode}
                      onChange={(EventValue) => SetPracticeAssignLevelCode(EventValue.target.value)}
                      className="math-input"
                    >
                      {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Quantity Per Student
                    <select
                      value={PracticeAssignQuantity}
                      onChange={(EventValue) => SetPracticeAssignQuantity(Number(EventValue.target.value))}
                      className="math-input"
                    >
                      {PRACTICE_BATCH_QUANTITY_OPTIONS.map((Quantity) => (
                        <option key={Quantity} value={Quantity}>{Quantity}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={SelectedStudentIdsForPractice.size === 0 || BulkAssignMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Assign ${PracticeAssignQuantity} ${PracticeAssignLevelCode} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} to ${SelectedStudentIdsForPractice.size} student${SelectedStudentIdsForPractice.size === 1 ? "" : "s"}?`
                        )
                      ) {
                        SetBulkAssignSummary(null);
                        BulkAssignMutation.mutate();
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusCircle size={16} />
                    {BulkAssignMutation.isPending
                      ? BulkAssignProgress
                        ? `Assigning batch ${BulkAssignProgress.Done}/${BulkAssignProgress.Total}...`
                        : "Assigning..."
                      : `Assign To ${SelectedStudentIdsForPractice.size || 0} Selected`}
                  </button>
                  {SelectedStudentIdsForPractice.size > 0 && (
                    <button
                      type="button"
                      onClick={() => SetSelectedStudentIdsForPractice(new Set())}
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                    >
                      <X size={13} />
                      Deselect All ({SelectedStudentIdsForPractice.size})
                    </button>
                  )}
                </div>

                {BulkAssignSummary && (
                  <div className="mt-4 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-3 text-xs font-bold dark:bg-slate-950/40">
                    <div className="flex flex-wrap gap-4">
                      <span className="text-emerald-600 dark:text-emerald-300">{BulkAssignSummary.StudentsSucceeded} succeeded</span>
                      <span>{BulkAssignSummary.TotalPapersAssigned} papers assigned</span>
                      {BulkAssignSummary.StudentsFailed > 0 && (
                        <span className="text-rose-600 dark:text-rose-300">{BulkAssignSummary.StudentsFailed} failed</span>
                      )}
                    </div>
                    {BulkAssignSummary.FailedRows.length > 0 && (
                      <ul className="mt-2 space-y-1 text-rose-600 dark:text-rose-300">
                        {BulkAssignSummary.FailedRows.map((Row, Index) => (
                          <li key={`${Row.studentIdentifier}-${Index}`}>{Row.studentIdentifier}: {Row.reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {StudentRows.length > 0 && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={PracticeSearchText}
                        onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                        placeholder="Search by name or student code..."
                        className="math-input !py-2 !pl-9 !text-xs w-64"
                      />
                    </div>
                    <select
                      value={PracticeModuleFilter}
                      onChange={(EventValue) => SetPracticeModuleFilter(EventValue.target.value)}
                      className="math-input !py-2 !text-xs w-auto"
                      aria-label="Filter by module"
                    >
                      <option value="ALL">All Modules</option>
                      {PracticeModuleOptions.map((ModuleCode) => (
                        <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={PracticeEligibleOnly}
                        onChange={(EventValue) => SetPracticeEligibleOnly(EventValue.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Only show students eligible for {PracticeAssignLevelCode}
                    </label>
                    {(PracticeSearchText || PracticeModuleFilter !== "ALL" || PracticeEligibleOnly) && (
                      <button
                        type="button"
                        onClick={() => {
                          SetPracticeSearchText("");
                          SetPracticeModuleFilter("ALL");
                          SetPracticeEligibleOnly(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-2 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                      >
                        <X size={12} />
                        Clear Filters
                      </button>
                    )}
                    <span className="text-xs font-bold text-slate-400">
                      {FilteredStudentRows.length} of {StudentRows.length} shown
                    </span>
                  </div>
                )}

                {StudentsQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading students..." /></div>
                ) : FilteredStudentRows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={AllFilteredStudentRowsSelected}
                              onChange={ToggleSelectAllFilteredStudentRows}
                              aria-label="Select all shown students"
                              className="h-3.5 w-3.5"
                            />
                          </th>
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Current Level</th>
                          <th className="px-2 py-1.5">Eligible Competition Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FilteredStudentRows.map((Row) => (
                          <tr key={Row.studentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={SelectedStudentIdsForPractice.has(Row.studentId)}
                                onChange={() => ToggleOneStudentRowSelected(Row.studentId)}
                                aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId}`}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{Row.currentLevelCode || "--"}</td>
                            <td className="px-2 py-2">
                              {Row.eligibleCompetitionLevelCode ? (
                                <span className="text-emerald-600 dark:text-emerald-300">{Row.eligibleCompetitionLevelCode}</span>
                              ) : (
                                <span className="text-slate-400">Not matched</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState title="No students found" description="Adjust the search or filters above." />
                  </div>
                )}
              </div>
            )}

            {PracticeSubTab === "RESULTS" && (
              <div className="math-card p-5">
                <SectionTitle
                  icon={<Medal size={14} />}
                  kicker="Practice Results"
                  title="Recent Practice Activity"
                  description="Never ranked, and always released to the student the instant it's computed -- a separate surface from any OFFICIAL event's own Rank &amp; Release list, and never scoped to any one event."
                />
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                    <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                    <input
                      value={PracticeResultsSearchText}
                      onChange={(EventValue) => SetPracticeResultsSearchText(EventValue.target.value)}
                      placeholder="Search student name or code"
                      className="w-64 bg-transparent outline-none placeholder:text-slate-400"
                    />
                  </label>
                  {/* 2026-09-14 (Shailesh): "remove the level filter text
                      from top of the level filter dropdown as it is self
                      explanatory" -- select kept, "Filter by Level" label
                      text dropped (aria-label preserves accessibility). */}
                  <select
                    aria-label="Filter by level"
                    value={PracticeResultsLevelFilter}
                    onChange={(EventValue) => SetPracticeResultsLevelFilter(EventValue.target.value)}
                    className="math-input"
                  >
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                    ))}
                  </select>
                </div>

                {PracticeResultsQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading practice results..." /></div>
                ) : GroupedPracticeResults.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {GroupedPracticeResults.map((StudentGroup: AnnualCompetitionPracticeRosterStudent) => {
                      const StudentOpen = ExpandedPracticeStudents.has(StudentGroup.studentId);
                      const PendingCount = StudentGroup.papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                      return (
                        <div key={StudentGroup.studentId} className="overflow-hidden rounded-3xl border border-[#2563eb]/15 bg-white shadow-sm ring-1 ring-cyan-100/70 dark:border-cyan-300/15 dark:bg-slate-950/35 dark:ring-white/10">
                          <div className="flex w-full flex-col gap-3 bg-[#2563eb]/[0.025] px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:bg-cyan-400/5">
                            <button
                              type="button"
                              onClick={() => TogglePracticeStudentExpanded(StudentGroup.studentId)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition hover:opacity-80"
                            >
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#2563eb]/25 bg-white text-[#2563eb] shadow-sm ring-1 ring-[#2563eb]/10 dark:border-cyan-300/30 dark:bg-slate-950/50 dark:text-cyan-100 dark:ring-cyan-300/10">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-slate-950 dark:text-white">
                                  {StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}
                                </h3>
                                {StudentGroup.studentCode ? (
                                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#2563eb] dark:text-cyan-100">{StudentGroup.studentCode}</p>
                                ) : null}
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                              <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                                {StudentGroup.papers.length} Paper{StudentGroup.papers.length === 1 ? "" : "s"}
                                {PendingCount > 0 ? ` (${PendingCount} pending)` : ""}
                              </span>
                              {/* 2026-09-14 (Shailesh): per-student "delete
                                  all" -- Practice records only, that
                                  student's OFFICIAL record is untouched. */}
                              <button
                                type="button"
                                title="Delete all practice records for this student"
                                aria-label="Delete all practice records for this student"
                                disabled={DeleteAllPracticeForStudentMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete ALL practice records for ${StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}? This removes every practice paper (pending and submitted), attempt, and result for this student. Their OFFICIAL Annual Competition record, if any, is untouched. This can't be undone.`
                                    )
                                  ) {
                                    DeleteAllPracticeForStudentMutation.mutate(StudentGroup.studentId);
                                  }
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {StudentOpen ? (
                            <div className="border-t border-[#2563eb]/10 p-3 dark:border-cyan-300/10">
                              <div className="overflow-hidden rounded-2xl border border-[#2563eb]/15 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35">
                                <div className="math-admin-light-student-summary-header grid grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                  <span>Paper Name</span>
                                  <span>Level</span>
                                  <span>Accuracy</span>
                                  <span>Score</span>
                                  <span>Time Taken</span>
                                  <span>Completed</span>
                                  <span>Attempt</span>
                                  <span />
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-white/10">
                                  {StudentGroup.papers.map((Paper) => {
                                    const IsPending = Paper.status === "NOT_STARTED" || !Paper.result;
                                    return (
                                      <div
                                        key={Paper.levelPaperId}
                                        className="math-admin-light-student-summary-row grid grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50/50 dark:text-slate-100 dark:hover:bg-slate-800/40"
                                      >
                                        <div className="font-black text-slate-950 dark:text-white">{Paper.paperLabel}</div>
                                        <div>{Paper.competitionLevelCode}</div>
                                        <div>{IsPending ? "-" : `${Paper.result!.accuracyPercentage}%`}</div>
                                        <div>{IsPending ? "-" : `${Paper.result!.score}/${Paper.result!.maxScore}`}</div>
                                        <div>{IsPending ? "-" : FormatSecondsAsMinSec(Paper.result!.timeTakenSeconds)}</div>
                                        <div>{IsPending ? "-" : FormatEventDate(Paper.result!.computedAt)}</div>
                                        <div>
                                          {Paper.attemptId ? (
                                            <Link
                                              href={`/admin/competition/annual-result/${Paper.attemptId}`}
                                              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                                            >
                                              <ClipboardList size={12} />
                                              View
                                            </Link>
                                          ) : (
                                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                              Pending
                                            </span>
                                          )}
                                        </div>
                                        <div>
                                          {/* 2026-09-14 (Shailesh): "pending row
                                              should get the delete option as
                                              well ... present everywhere" --
                                              works on both a pending and a
                                              submitted row, keyed by
                                              levelPaperId either way. */}
                                          <button
                                            type="button"
                                            title="Delete this practice paper"
                                            aria-label="Delete this practice paper"
                                            disabled={DeletePracticeAttemptMutation.isPending}
                                            onClick={() => {
                                              if (
                                                window.confirm(
                                                  `Delete "${Paper.paperLabel}"? This removes the paper${Paper.attemptId ? ", its attempt, and its result" : ""} entirely. This can't be undone.`
                                                )
                                              ) {
                                                DeletePracticeAttemptMutation.mutate(Paper.levelPaperId);
                                              }
                                            }}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState title="No practice activity yet" description="Practice papers appear here as soon as a student is assigned some." />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
