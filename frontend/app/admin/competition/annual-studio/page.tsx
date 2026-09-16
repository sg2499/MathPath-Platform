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
  PRACTICE_BATCH_QUANTITY_OPTIONS,
  PRACTICE_BULK_MAX_STUDENTS_PER_CALL,
  PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL,
  batchAssignAnnualCompetitionPracticePapers,
  createAnnualCompetitionEvent,
  deleteAllAnnualCompetitionPracticeRecordsForStudent,
  deleteAnnualCompetitionEvent,
  deleteAnnualCompetitionPracticeAttempt,
  getAnnualCompetitionPracticeReportForLevel,
  getAnnualCompetitionPracticeReportForStudent,
  listAnnualCompetitionEvents,
  listAnnualCompetitionPracticeResults,
  listStudentsForAnnualCompetitionPracticeBank,
  recomputeAllAnnualCompetitionOfficialResults,
  recomputeAnnualCompetitionPracticeResults,
  updateAnnualCompetitionEvent,
  type AnnualCompetitionEvent,
  type AnnualCompetitionPracticeBatchAssignFailedRow,
  type AnnualCompetitionPracticeReportForLevel,
  type AnnualCompetitionPracticeReportForStudent,
  type AnnualCompetitionPracticeReportSectionRow,
  type AnnualCompetitionPracticeRosterStudent,
} from "@/lib/api/admin";
import { GroupPracticePapersByLevel } from "@/lib/annualCompetitionPracticeGrouping";
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
import { Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

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

// Practice Reports feature, package 3 (Shailesh, 2026-09-16): small display
// helpers + presentational components shared by the Student and Level
// report views below. Kept separate from SectionTitle/StatusChip above
// since these are specific to the Reports sub-tab.

function FormatPercent(Value: number | null): string {
  return Value == null ? "-" : `${Value}%`;
}

function FormatCount(Value: number | null): string {
  return Value == null ? "-" : String(Value);
}

function StatCard({ Label, Value }: { Label: string; Value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-3 shadow-sm dark:bg-slate-950/40">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{Label}</p>
      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}

// The per-section breakdown table -- shared by both the level-scoped
// Student report and the Level report, since both are the same shape
// (AnnualCompetitionPracticeReportSectionRow[]), just aggregated over a
// different set of attempts server-side.
function SectionBreakdownTable({ Rows }: { Rows: AnnualCompetitionPracticeReportSectionRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
      <div className="grid grid-cols-[0.6fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <span>Section</span>
        <span>Avg Accuracy</span>
        <span>Avg Score</span>
        <span>Avg Attempted</span>
        <span>Avg Time Taken</span>
        <span>Time Limit</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/10">
        {Rows.map((Row) => (
          <div
            key={Row.sectionNumber}
            className="grid grid-cols-[0.6fr_1fr_1fr_1fr_1fr_1fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
          >
            <div className="font-black text-slate-950 dark:text-white">Section {Row.sectionNumber}</div>
            <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
            <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
            <div>{Row.avgAttemptedCount == null ? "-" : `${Row.avgAttemptedCount}/${Row.avgTotalQuestions ?? "-"}`}</div>
            <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
            <div>{Row.timeLimitSeconds == null ? "-" : FormatSecondsAsMinSec(Row.timeLimitSeconds)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The per-student Practice Report view -- summary cards always shown;
// everything below branches on whether a level filter is active
// (Report.competitionLevelCode set) or this is the blended "All Levels"
// view, per getAnnualCompetitionPracticeReportForStudent's own comment.
function StudentReportView({ Report }: { Report: AnnualCompetitionPracticeReportForStudent }) {
  const Summary = Report.summary;
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Papers Assigned" Value={FormatCount(Summary.papersAssignedCount)} />
        <StatCard Label="Papers Completed" Value={FormatCount(Summary.papersCompletedCount)} />
        <StatCard Label="Avg Score" Value={Summary.avgScore == null ? "-" : `${Summary.avgScore}/${Summary.avgMaxScore ?? "-"}`} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.competitionLevelCode ? (
        <>
          {Report.levelComparison ? (
            <div className="rounded-2xl border border-[color:var(--mp-role-border)] bg-slate-50/60 p-4 text-sm font-bold text-slate-700 dark:bg-white/5 dark:text-slate-200">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--mp-role-primary)]">
                Vs. Level Cohort ({Report.levelComparison.cohortStudentsCount} student
                {Report.levelComparison.cohortStudentsCount === 1 ? "" : "s"}, {Report.levelComparison.cohortAttemptsCount} attempt
                {Report.levelComparison.cohortAttemptsCount === 1 ? "" : "s"})
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span>Cohort Avg Accuracy: {FormatPercent(Report.levelComparison.cohortAvgAccuracyPercentage)}</span>
                <span>
                  Cohort Avg Score: {Report.levelComparison.cohortAvgScore ?? "-"}/{Report.levelComparison.cohortAvgMaxScore ?? "-"}
                </span>
                <span>Cohort Avg Time: {FormatSecondsAsMinSec(Report.levelComparison.cohortAvgTimeTakenSeconds)}</span>
              </div>
            </div>
          ) : null}

          {Report.perSection.length > 0 ? <SectionBreakdownTable Rows={Report.perSection} /> : null}

          {Report.trend.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                <span>Attempt Date</span>
                <span>Accuracy</span>
                <span>Score</span>
                <span>Time Taken</span>
                <span>Action</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {Report.trend.map((Row) => (
                  <div
                    key={Row.attemptId}
                    className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
                  >
                    <div>{FormatEventDate(Row.computedAt)}</div>
                    <div>{Row.accuracyPercentage}%</div>
                    <div>{Row.score}/{Row.maxScore}</div>
                    <div>{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</div>
                    <div>
                      <Link
                        href={`/admin/competition/annual-result/${Row.attemptId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                      >
                        <ClipboardList size={12} /> View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : Report.byLevel.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
          <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Level</span>
            <span>Attempts</span>
            <span>Avg Accuracy</span>
            <span>Avg Score</span>
            <span>Avg Time</span>
            <span>Completed</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Report.byLevel.map((Row) => (
              <div
                key={Row.competitionLevelCode}
                className="grid grid-cols-[1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                <div className="font-black text-slate-950 dark:text-white">{FormatCompetitionLevelLabel(Row.competitionLevelCode)}</div>
                <div>{Row.attemptsCount}</div>
                <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
                <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
                <div>{Row.papersCompletedCount}/{Row.papersAssignedCount}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No practice activity yet" description="This student hasn't completed any practice papers yet." />
      )}
    </div>
  );
}

// The per-level (cohort) Practice Report view.
function LevelReportView({ Report }: { Report: AnnualCompetitionPracticeReportForLevel }) {
  const Summary = Report.summary;
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard Label="Students" Value={FormatCount(Summary.studentsWithAttemptsCount)} />
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Papers Assigned" Value={FormatCount(Summary.papersAssignedCount)} />
        <StatCard Label="Papers Completed" Value={FormatCount(Summary.papersCompletedCount)} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.perSection.length > 0 ? <SectionBreakdownTable Rows={Report.perSection} /> : null}

      {Report.perStudent.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Student</span>
            <span>Attempts</span>
            <span>Avg Accuracy</span>
            <span>Avg Score</span>
            <span>Avg Time</span>
            <span>Completed</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Report.perStudent.map((Row) => (
              <div
                key={Row.studentId}
                className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-950 dark:text-white">{Row.studentName || Row.studentCode || Row.studentId}</div>
                  {Row.studentCode ? (
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">{Row.studentCode}</div>
                  ) : null}
                </div>
                <div>{Row.attemptsCount}</div>
                <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
                <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
                <div>{Row.papersCompletedCount}/{Row.papersAssignedCount}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No practice activity yet" description="No student has completed a practice paper at this level yet." />
      )}
    </div>
  );
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
// 2026-09-16 (Shailesh, Practice Reports feature): "Practice Bank -
// Practice Results - Practice Reports" -- a third sub-tab added here,
// containing its own two further sub-tabs (see PracticeReportsSubTabList
// below) for the per-student and per-level analytics.
const PracticeSubTabList = ["BANK", "RESULTS", "REPORTS"] as const;
type PracticeSubTabKey = (typeof PracticeSubTabList)[number];

const PracticeReportsSubTabList = ["STUDENT", "LEVEL"] as const;
type PracticeReportsSubTabKey = (typeof PracticeReportsSubTabList)[number];

export default function AdminAnnualCompetitionStudioPage() {
  return (
    <Suspense fallback={null}>
      <AdminAnnualCompetitionStudioPageContent />
    </Suspense>
  );
}

function AdminAnnualCompetitionStudioPageContent() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();
  // 2026-09-15 (Shailesh): "upon clicking the notification from the tray it
  // should redirect them ... the admin should see the pending papers in
  // their login under the practice results tab." Notifications land here as
  // /admin/competition/annual-studio?tab=PRACTICE&subTab=RESULTS&studentCode=
  // ...&levelCode=... (built client-side in NotificationsBell.tsx) -- read
  // once on mount to pre-select the right tabs/filter and, once the roster
  // has loaded, auto-expand the notified student's row.
  const SearchParams = useSearchParams();
  const DeepLinkTab = SearchParams.get("tab");
  const DeepLinkSubTab = SearchParams.get("subTab");
  const DeepLinkStudentCode = SearchParams.get("studentCode");
  const DeepLinkLevelCode = SearchParams.get("levelCode");

  const [TopTab, SetTopTab] = useState<TopTabKey>(DeepLinkTab === "PRACTICE" ? "PRACTICE" : "OFFICIAL");
  const [PracticeSubTab, SetPracticeSubTab] = useState<PracticeSubTabKey>(DeepLinkSubTab === "RESULTS" ? "RESULTS" : "BANK");

  // 2026-09-16 (Shailesh, 504 fix -- "bulletproof end to end"): this page
  // used to track a success message and per-mutation errors as separate,
  // independently-persisting pieces of state (a bare LastMessage string
  // plus each useMutation's own .error), which meant a success banner from
  // an earlier action could sit on screen forever, unrelated to and never
  // cleared by a LATER action's own failure -- exactly what produced the
  // confusing "assigned 25 papers to 1 student" success banner sitting
  // next to a fresh, unrelated 504 error in the live bug report this fixes.
  // Every action on this page (event create/update/delete, both recompute
  // buttons, practice bulk-assign, both practice-record deletes) now
  // reports through this ONE slot instead: cleared the instant a new action
  // starts (see each mutation's onMutate below) and always fully replaced
  // -- never merged -- by whichever action most recently finished, success
  // or failure. Deliberately separate from DataLoadError below, which is a
  // standing fact about page state (a query failed to load), not a
  // one-shot outcome of something the admin just clicked.
  const [LastActionResult, SetLastActionResult] = useState<{ Kind: "success" | "error"; Label: string; Text: string } | null>(null);
  const ReportActionSuccess = (Label: string, Text: string) => SetLastActionResult({ Kind: "success", Label, Text });
  const ReportActionError = (Label: string, Error: unknown) => SetLastActionResult({ Kind: "error", Label, Text: apiErrorMessage(Error) });
  const ClearActionResult = () => SetLastActionResult(null);

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
    onMutate: ClearActionResult,
    onSuccess: (Created) => {
      ReportActionSuccess("Create Event", `"${Created.name}" created.`);
      SetEventName("");
      SetCompetitionDateInput("");
      SetResultsReleaseInput("");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    onError: (Error) => ReportActionError("Create Event", Error),
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
    onMutate: ClearActionResult,
    onSuccess: (Updated) => {
      ReportActionSuccess("Update Event", `"${Updated.name}" updated.`);
      SetEditingEventId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    // Also shown inline in the edit form itself (see UpdateEventMutation.isError
    // below) -- reporting it here too means the top banner reflects it as well,
    // consistent with every other action on this page.
    onError: (Error) => ReportActionError("Update Event", Error),
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
    onMutate: ClearActionResult,
    onSuccess: () => {
      ReportActionSuccess("Delete Event", "Event deleted.");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    onError: (Error) => ReportActionError("Delete Event", Error),
  });

  // ---------------------------------------------------------------------
  // Practice -- Bank (2026-09-12, bulk assignment): "let the admin just
  // assign papers to all the students and let them practice instead of
  // creating unnecessary events." Fully event-independent -- the roster
  // below is every active student, tagged with the level they're currently
  // eligible for, so the admin can select all, many, or a filtered subset
  // and assign in one action. A selection is chunked into sequential calls
  // client-side (this backend has no background job queue -- see
  // PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL's own comment in
  // lib/api/admin.ts) with progress shown below. 2026-09-16 (504 fix):
  // chunk size is bounded by total PAPER count (students x quantity), not
  // just student count -- see BulkAssignMutation.
  // ---------------------------------------------------------------------

  const [PracticeSearchText, SetPracticeSearchText] = useState("");
  const [PracticeModuleFilter, SetPracticeModuleFilter] = useState<string>("ALL");
  // 2026-09-14 (Shailesh): "implement the level filter as well in the
  // practice bank tab ... so that we can filter both modules and levels and
  // then assign papers to the students in those levels." Scoped to the
  // currently selected module (like a normal module -> level drill-down)
  // rather than every level across every module at once -- currentLevelCode
  // was already returned by the roster endpoint and shown as a table
  // column, just never filterable until now.
  const [PracticeLevelFilter, SetPracticeLevelFilter] = useState<string>("ALL");
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
    // 2026-09-16 (Practice Reports feature): also enabled for REPORTS --
    // its Student view's student picker reuses this same roster rather than
    // issuing a second student-list call.
    enabled: Ready && TopTab === "PRACTICE" && (PracticeSubTab === "BANK" || PracticeSubTab === "REPORTS"),
  });
  const StudentRows = StudentsQuery.data?.students || [];

  const PracticeModuleOptions = Array.from(
    new Set(StudentRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();

  // 2026-09-14 (Shailesh): "implement the level filter as well in the
  // practice bank tab ... so that we can filter both modules and levels."
  // Scoped to the currently selected module (a normal module -> level
  // drill-down) rather than every level across every module at once.
  const PracticeLevelOptions = Array.from(
    new Set(
      StudentRows.filter((Row) => PracticeModuleFilter === "ALL" || Row.currentModuleCode === PracticeModuleFilter)
        .map((Row) => Row.currentLevelCode)
        .filter((Value): Value is string => Boolean(Value))
    )
  ).sort();

  const PracticeSearchLower = PracticeSearchText.trim().toLowerCase();
  const FilteredStudentRows = StudentRows.filter((Row) => {
    if (PracticeModuleFilter !== "ALL" && Row.currentModuleCode !== PracticeModuleFilter) return false;
    if (PracticeLevelFilter !== "ALL" && Row.currentLevelCode !== PracticeLevelFilter) return false;
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
      // 2026-09-16 (Shailesh, 504 fix): the true unit of work for one call
      // is students x quantity (total papers), not student count alone --
      // see PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL's own comment in
      // lib/api/admin.ts. The chunk size must shrink as quantity grows, not
      // stay flat at PRACTICE_BULK_MAX_STUDENTS_PER_CALL regardless of what
      // quantity is selected (that flat cap is kept too, as a
      // defense-in-depth ceiling).
      const MaxStudentsByWorkload = Math.max(1, Math.floor(PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL / PracticeAssignQuantity));
      const ChunkSize = Math.min(PRACTICE_BULK_MAX_STUDENTS_PER_CALL, MaxStudentsByWorkload);
      const Chunks: string[][] = [];
      for (let Index = 0; Index < StudentIds.length; Index += ChunkSize) {
        Chunks.push(StudentIds.slice(Index, Index + ChunkSize));
      }
      SetBulkAssignProgress({ Done: 0, Total: Chunks.length });
      let StudentsSucceeded = 0;
      let StudentsFailed = 0;
      let TotalPapersAssigned = 0;
      const FailedRows: AnnualCompetitionPracticeBatchAssignFailedRow[] = [];
      let ChunkCallError: unknown = null;
      for (let Index = 0; Index < Chunks.length; Index++) {
        try {
          const Result = await batchAssignAnnualCompetitionPracticePapers({
            studentIds: Chunks[Index],
            competitionLevelCode: PracticeAssignLevelCode,
            quantity: PracticeAssignQuantity,
          });
          StudentsSucceeded += Result.studentsSucceeded;
          StudentsFailed += Result.studentsFailed;
          TotalPapersAssigned += Result.totalPapersAssigned;
          FailedRows.push(...Result.failed);
        } catch (Error) {
          // 2026-09-16 (Shailesh, 504 fix): a call-level failure (network
          // hiccup, an unlucky 504 despite the sizing above, etc.) must
          // never discard whatever EARLIER chunks in this same batch
          // already succeeded -- those papers are already durably
          // committed server-side, one commit per paper (see
          // _GeneratePracticePapersForOneStudent's own docstring). Stop
          // here, but still report every earlier chunk's real success
          // rather than throwing it all away.
          ChunkCallError = Error;
          Chunks[Index].forEach((StudentId) => {
            FailedRows.push({
              studentIdentifier: StudentId,
              reason: "This batch call did not complete -- unknown whether papers were generated for this student. Check their practice bank before reassigning.",
            });
          });
          StudentsFailed += Chunks[Index].length;
          break;
        }
        SetBulkAssignProgress({ Done: Index + 1, Total: Chunks.length });
      }
      return { StudentsSucceeded, StudentsFailed, TotalPapersAssigned, FailedRows, ChunkCallError };
    },
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      const BaseMessage =
        `Assigned ${PracticeAssignQuantity} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} of ${FormatCompetitionLevelLabel(PracticeAssignLevelCode)} to ${Result.StudentsSucceeded} student${Result.StudentsSucceeded === 1 ? "" : "s"}` +
        (Result.StudentsFailed > 0 ? `, ${Result.StudentsFailed} failed.` : ".");
      if (Result.ChunkCallError) {
        ReportActionError(
          "Assign Practice Papers",
          new Error(
            `${BaseMessage} The batch stopped early after a request failed (${apiErrorMessage(Result.ChunkCallError)}) -- ` +
              "check the affected students' practice banks before retrying, since some papers may already have been generated."
          )
        );
      } else {
        ReportActionSuccess("Assign Practice Papers", BaseMessage);
      }
      SetBulkAssignSummary(Result);
      SetSelectedStudentIdsForPractice(new Set());
      SetBulkAssignProgress(null);
      InvalidatePracticeResults();
    },
    onError: (Error) => {
      SetBulkAssignProgress(null);
      ReportActionError("Assign Practice Papers", Error);
    },
  });

  // ---------------------------------------------------------------------
  // Practice -- Results. Never ranked, and always released to the student
  // the instant it's computed -- a separate surface from any OFFICIAL
  // event's own Rank & Release list, never mixed with it, and no longer
  // scoped to any one event either.
  // ---------------------------------------------------------------------

  const [PracticeResultsLevelFilter, SetPracticeResultsLevelFilter] = useState<string>(
    DeepLinkLevelCode && (ANNUAL_COMPETITION_LEVEL_CODES as readonly string[]).includes(DeepLinkLevelCode)
      ? DeepLinkLevelCode
      : "ALL"
  );
  const [PracticeResultsSearchText, SetPracticeResultsSearchText] = useState("");
  const [ExpandedPracticeStudents, SetExpandedPracticeStudents] = useState<Set<string>>(new Set());
  // 2026-09-15 (Shailesh): "the individual student block must contain the
  // different level blocks under it which should be expandable and
  // collapseable and by default collapsed ... right now everything is
  // expanded ... which makes the page look very clumsy and weird." Keyed by
  // `${studentId}::${levelCode}` (not just levelCode) so one student's
  // expanded level never leaks into another student's block. Empty by
  // default -- every level starts collapsed, mirroring the same collapsed-
  // by-default pattern already used for the student's own per-level blocks
  // on student/competition/annual/page.tsx.
  const [ExpandedPracticeLevelGroups, SetExpandedPracticeLevelGroups] = useState<Set<string>>(new Set());
  const DeepLinkStudentAppliedRef = useRef(false);

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
  function TogglePracticeLevelGroupExpanded(Key: string) {
    SetExpandedPracticeLevelGroups((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  // Auto-expand the notified student's row once the roster has actually
  // loaded -- studentCode is all the notification carries (not studentId),
  // so this waits for GroupedPracticeResults to have real rows to match
  // against. Applied at most once per page load (the ref guard) so it never
  // fights a student the admin has since manually collapsed.
  //
  // 2026-09-15 (Shailesh): "on clicking it, it should take them to the
  // correct page with the student's level block expanded for whichever
  // level the notification was assigned." DeepLinkLevelCode above already
  // pre-selects PracticeResultsLevelFilter to this level, but the level
  // group itself still starts collapsed by default like every other level
  // block, so it also needs the explicit expand here -- same
  // `${studentId}::${levelCode}` key the level-group toggle/render below
  // already uses, gated behind the same DeepLinkStudentAppliedRef so it
  // only ever applies once per page load.
  useEffect(() => {
    if (!DeepLinkStudentCode || DeepLinkStudentAppliedRef.current) return;
    const Match = GroupedPracticeResults.find((StudentGroup) => StudentGroup.studentCode === DeepLinkStudentCode);
    if (!Match) return;
    DeepLinkStudentAppliedRef.current = true;
    SetExpandedPracticeStudents((Prev) => new Set(Prev).add(Match.studentId));
    if (DeepLinkLevelCode) {
      SetExpandedPracticeLevelGroups((Prev) => new Set(Prev).add(`${Match.studentId}::${DeepLinkLevelCode}`));
    }
  }, [DeepLinkStudentCode, DeepLinkLevelCode, GroupedPracticeResults]);

  // 2026-09-14 (Shailesh): per-row and per-student-block delete icons in
  // the admin Practice view. Both mutations invalidate the same query key
  // the practice-results list itself uses, so the table reflects the
  // deletion immediately without a manual refetch call.
  const DeletePracticeAttemptMutation = useMutation({
    mutationFn: (LevelPaperId: string) => deleteAnnualCompetitionPracticeAttempt(LevelPaperId),
    onMutate: ClearActionResult,
    // 2026-09-16 (Shailesh, 504-fix pass -- "bulletproof end to end"): this
    // delete used to have no success/error feedback at all -- a failure was
    // silently swallowed, indistinguishable from a delete that never
    // happened. Both delete mutations now report through the same shared
    // action-result banner every other action on this page uses.
    onSuccess: () => {
      ReportActionSuccess("Delete Practice Paper", "Practice paper deleted.");
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Delete Practice Paper", Error),
  });
  const DeleteAllPracticeForStudentMutation = useMutation({
    mutationFn: (StudentId: string) => deleteAllAnnualCompetitionPracticeRecordsForStudent(StudentId),
    onMutate: ClearActionResult,
    onSuccess: () => {
      ReportActionSuccess("Delete All Practice Records", "All practice records deleted for this student.");
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Delete All Practice Records", Error),
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
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      ReportActionSuccess("Recompute Official Results", `Recomputed ${Result.recomputedCount} official result${Result.recomputedCount === 1 ? "" : "s"}.`);
      // Matches the per-event results query key from
      // annual-studio/[eventId]/page.tsx (["admin", "annual-competition",
      // "results", EventId, ...]) as a prefix, so any such query already in
      // the cache is marked stale and refetches next time that page mounts.
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "results"] });
    },
    onError: (Error) => ReportActionError("Recompute Official Results", Error),
  });
  const RecomputePracticeMutation = useMutation({
    mutationFn: () => recomputeAnnualCompetitionPracticeResults(),
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      ReportActionSuccess("Recompute Practice Results", `Recomputed ${Result.recomputedCount} practice result${Result.recomputedCount === 1 ? "" : "s"}.`);
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Recompute Practice Results", Error),
  });

  // ---------------------------------------------------------------------
  // Practice -- Reports (package 3, Shailesh, 2026-09-16). Two inner views:
  // per-student (level filter OPTIONAL -- see getAnnualCompetitionPractice-
  // ReportForStudent's own comment on why, a 2026-09-16 clarification about
  // a returning student's level changing year to year) and per-level (level
  // REQUIRED, per Shailesh's own confirmation the same day). Reuses
  // StudentRows (the same roster the Bank tab's student picker already
  // loads, enabled above for this tab too) for the student search/select
  // below, rather than a second student-list call.
  // ---------------------------------------------------------------------

  const [PracticeReportsSubTab, SetPracticeReportsSubTab] = useState<PracticeReportsSubTabKey>("STUDENT");
  const [ReportsStudentSearchText, SetReportsStudentSearchText] = useState("");
  const [ReportsStudentId, SetReportsStudentId] = useState<string>("");
  // "ALL" = the blended "All Levels" view.
  const [ReportsStudentLevelFilter, SetReportsStudentLevelFilter] = useState<string>("ALL");
  const [ReportsLevelCode, SetReportsLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

  const ReportsStudentSearchLower = ReportsStudentSearchText.trim().toLowerCase();
  const ReportsFilteredStudentRows = StudentRows.filter((Row) => {
    if (!ReportsStudentSearchLower) return true;
    const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
    return Haystack.includes(ReportsStudentSearchLower);
  });

  const PracticeReportStudentQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-report-student", ReportsStudentId, ReportsStudentLevelFilter],
    queryFn: () =>
      getAnnualCompetitionPracticeReportForStudent(
        ReportsStudentId,
        ReportsStudentLevelFilter === "ALL" ? undefined : ReportsStudentLevelFilter
      ),
    enabled:
      Ready &&
      TopTab === "PRACTICE" &&
      PracticeSubTab === "REPORTS" &&
      PracticeReportsSubTab === "STUDENT" &&
      Boolean(ReportsStudentId),
  });

  const PracticeReportLevelQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-report-level", ReportsLevelCode],
    queryFn: () => getAnnualCompetitionPracticeReportForLevel(ReportsLevelCode),
    enabled:
      Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" && Boolean(ReportsLevelCode),
  });

  if (!Ready) return null;

  // 2026-09-16 (Shailesh, 504 fix): a STANDING fact about page state (a
  // query failed to load) -- deliberately separate from LastActionResult
  // above, which is the one-shot outcome of whatever the admin most
  // recently clicked. Keeping these apart means a stale action result can
  // never masquerade as (or hide) a genuine, ongoing data-load failure, and
  // vice versa.
  const DataLoadError =
    EventsQuery.error ||
    (TopTab === "PRACTICE" && PracticeSubTab === "BANK" ? StudentsQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "RESULTS" ? PracticeResultsQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "STUDENT" ? PracticeReportStudentQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" ? PracticeReportLevelQuery.error : null);

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

        {DataLoadError && <ErrorState message={apiErrorMessage(DataLoadError)} />}
        {LastActionResult && LastActionResult.Kind === "error" && (
          <ErrorState title={LastActionResult.Label} message={LastActionResult.Text} />
        )}
        {LastActionResult && LastActionResult.Kind === "success" && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastActionResult.Text}
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
                    {Tab === "BANK" ? "Practice Bank" : Tab === "RESULTS" ? "Practice Results" : "Practice Reports"}
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
                        <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
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
                          `Assign ${PracticeAssignQuantity} ${FormatCompetitionLevelLabel(PracticeAssignLevelCode)} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} to ${SelectedStudentIdsForPractice.size} student${SelectedStudentIdsForPractice.size === 1 ? "" : "s"}?`
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
                  // 2026-09-15 (Shailesh): "the content in that tab is very
                  // small ... we need to have the content displayed properly
                  // and in bigger font sizes ... especially the search bar,
                  // module and level filters ... no matter from which device
                  // the admin logs in everything should be visually top
                  // notch and clean." These used to be forced down to
                  // text-xs (12px) at fixed pixel widths (w-64/w-auto) with
                  // no responsive behaviour at all -- cramped on every
                  // screen size, not just small ones. Rebuilt to match the
                  // clean, responsive precedent already used elsewhere in
                  // this admin app (admin/students/page.tsx's own search/
                  // filter row): full-size math-input/select, a grid that
                  // stacks to one column per control on narrow screens and
                  // opens up on wider ones instead of staying tiny always.
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px_auto]">
                    <div className="relative sm:col-span-2 lg:col-span-1">
                      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={PracticeSearchText}
                        onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                        placeholder="Search by name or student code..."
                        className="math-input pl-11"
                      />
                    </div>
                    <select
                      value={PracticeModuleFilter}
                      onChange={(EventValue) => {
                        // Reset the level filter whenever the module changes
                        // so a stale level selection that no longer belongs
                        // to the newly selected module can't linger invisibly.
                        SetPracticeModuleFilter(EventValue.target.value);
                        SetPracticeLevelFilter("ALL");
                      }}
                      className="math-select"
                      aria-label="Filter by module"
                    >
                      <option value="ALL">All Modules</option>
                      {PracticeModuleOptions.map((ModuleCode) => (
                        <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                      ))}
                    </select>
                    <select
                      value={PracticeLevelFilter}
                      onChange={(EventValue) => SetPracticeLevelFilter(EventValue.target.value)}
                      className="math-select"
                      aria-label="Filter by current level"
                    >
                      <option value="ALL">All Levels</option>
                      {PracticeLevelOptions.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1 lg:justify-self-end">
                      {(PracticeSearchText || PracticeModuleFilter !== "ALL" || PracticeLevelFilter !== "ALL" || PracticeEligibleOnly) && (
                        <button
                          type="button"
                          onClick={() => {
                            SetPracticeSearchText("");
                            SetPracticeModuleFilter("ALL");
                            SetPracticeLevelFilter("ALL");
                            SetPracticeEligibleOnly(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-sm font-bold text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                        >
                          <X size={14} />
                          Clear Filters
                        </button>
                      )}
                      <span className="text-sm font-bold text-slate-400">
                        {FilteredStudentRows.length} of {StudentRows.length} shown
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 sm:col-span-2 lg:col-span-4">
                      <input
                        type="checkbox"
                        checked={PracticeEligibleOnly}
                        onChange={(EventValue) => SetPracticeEligibleOnly(EventValue.target.checked)}
                        className="h-4 w-4"
                      />
                      Only show students eligible for {FormatCompetitionLevelLabel(PracticeAssignLevelCode)}
                    </label>
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
                            <td className="px-2 py-2">
                              {Row.currentLevelCode || "--"}
                              {/* 2026-09-15 (Shailesh): "we need to have the
                                  current lesson number for the MM students as
                                  well ... so that it is clear why the student
                                  is gonna sit for MM-L1" -- Master has exactly
                                  one curriculum level (MM-L1), so this is the
                                  only thing that actually distinguishes
                                  students within it. Current Level itself
                                  stays the real code, never renamed. */}
                              {Row.currentModuleCode === "MM" && (Row.currentLessonNumber != null || Row.masterLevelComplete) ? (
                                <span className="ml-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                  ({FormatMasterCurrentLevelSuffix(Row.currentLessonNumber, Row.masterLevelComplete)})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              {Row.eligibleCompetitionLevelCode ? (
                                <span className="text-emerald-600 dark:text-emerald-300">{FormatCompetitionLevelLabel(Row.eligibleCompetitionLevelCode)}</span>
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
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
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
                              {/* 2026-09-15 (Shailesh): "for the grouping of
                                  levels in the student blocks, lets do that
                                  for both teacher and admin login" -- one
                                  sub-table per level instead of every paper
                                  across every level mixed into one long
                                  flat list. Each level group is now its own
                                  expand/collapse toggle, collapsed by
                                  default: "the individual student block must
                                  contain the different level blocks under it
                                  which should be expandable and collapseable
                                  and by default collapsed ... right now
                                  everything is expanded ... which makes the
                                  page look very clumsy and weird." */}
                              <div className="space-y-3">
                                {GroupPracticePapersByLevel(StudentGroup.papers).map((LevelGroup) => {
                                  const LevelKey = `${StudentGroup.studentId}::${LevelGroup.LevelCode}`;
                                  const LevelOpen = ExpandedPracticeLevelGroups.has(LevelKey);
                                  const LevelPendingCount = LevelGroup.Papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                                  return (
                                  <div
                                    key={LevelGroup.LevelCode}
                                    className="overflow-hidden rounded-2xl border border-[#2563eb]/15 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => TogglePracticeLevelGroupExpanded(LevelKey)}
                                      className="flex w-full items-center justify-between gap-3 border-b border-[#2563eb]/10 bg-[#2563eb]/[0.04] px-5 py-2.5 text-left transition hover:bg-[#2563eb]/[0.07] dark:border-cyan-300/10 dark:bg-cyan-400/5 dark:hover:bg-cyan-400/10"
                                    >
                                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#2563eb] dark:text-cyan-100">
                                        {LevelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {FormatCompetitionLevelLabel(LevelGroup.LevelCode)}
                                      </span>
                                      <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                                        {LevelGroup.Papers.length} Paper{LevelGroup.Papers.length === 1 ? "" : "s"}
                                        {LevelPendingCount > 0 ? ` (${LevelPendingCount} pending)` : ""}
                                      </span>
                                    </button>
                                    {LevelOpen ? (
                                    <>
                                    <div className="math-admin-light-student-summary-header grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                      <span>Paper Name</span>
                                      <span>Accuracy</span>
                                      <span>Score</span>
                                      <span>Time Taken</span>
                                      <span>Completed</span>
                                      <span>Attempt</span>
                                      <span />
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                                      {LevelGroup.Papers.map((Paper) => {
                                        const IsPending = Paper.status === "NOT_STARTED" || !Paper.result;
                                        return (
                                          <div
                                            key={Paper.levelPaperId}
                                            className="math-admin-light-student-summary-row grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50/50 dark:text-slate-100 dark:hover:bg-slate-800/40"
                                          >
                                            <div className="font-black text-slate-950 dark:text-white">{Paper.paperLabel}</div>
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
                                    </>
                                    ) : null}
                                  </div>
                                  );
                                })}
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

            {PracticeSubTab === "REPORTS" && (
              <div className="space-y-6">
                <div className="math-card p-3">
                  <div className="flex flex-wrap gap-3">
                    {PracticeReportsSubTabList.map((Tab) => (
                      <button
                        key={Tab}
                        type="button"
                        onClick={() => SetPracticeReportsSubTab(Tab)}
                        aria-selected={PracticeReportsSubTab === Tab}
                        className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeReportsSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                      >
                        {Tab === "STUDENT" ? "Individual Student" : "Individual Level"}
                      </button>
                    ))}
                  </div>
                </div>

                {PracticeReportsSubTab === "STUDENT" && (
                  <div className="math-card p-5">
                    <SectionTitle
                      icon={<Sparkles size={14} />}
                      kicker="Practice Reports"
                      title="Individual Student Analytics"
                      description="Collated performance across every one of this student's practice attempts. Pick a level to see its section-by-section breakdown, an attempt-by-attempt trend, and how this student compares to everyone else who's practiced it -- or leave it on All Levels for a blended summary across every level they've ever tried, useful once the same student returns in a later year at a different level."
                    />

                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                        <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                        <input
                          value={ReportsStudentSearchText}
                          onChange={(EventValue) => SetReportsStudentSearchText(EventValue.target.value)}
                          placeholder="Search student name or code"
                          className="w-56 bg-transparent outline-none placeholder:text-slate-400"
                        />
                      </label>
                      <select
                        aria-label="Select student"
                        value={ReportsStudentId}
                        onChange={(EventValue) => SetReportsStudentId(EventValue.target.value)}
                        className="math-input"
                      >
                        <option value="">Select a student...</option>
                        {ReportsFilteredStudentRows.map((Row) => (
                          <option key={Row.studentId} value={Row.studentId}>
                            {Row.studentName || Row.studentCode || Row.studentId}
                            {Row.studentCode ? ` (${Row.studentCode})` : ""}
                          </option>
                        ))}
                      </select>
                      {/* Wired the same way every other level dropdown in this
                          app is (ANNUAL_COMPETITION_LEVEL_CODES + Format-
                          CompetitionLevelLabel), so Bloomers/Beginners and
                          MM-1/MM-2 show their real display names here too. */}
                      <select
                        aria-label="Filter by level"
                        value={ReportsStudentLevelFilter}
                        onChange={(EventValue) => SetReportsStudentLevelFilter(EventValue.target.value)}
                        className="math-input"
                        disabled={!ReportsStudentId}
                      >
                        <option value="ALL">All Levels</option>
                        {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                          <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                        ))}
                      </select>
                    </div>

                    {!ReportsStudentId ? (
                      <div className="mt-5">
                        <EmptyState title="Select a student" description="Pick a student above to see their Practice Reports." />
                      </div>
                    ) : PracticeReportStudentQuery.isLoading ? (
                      <div className="mt-5"><LoadingState label="Loading student report..." /></div>
                    ) : PracticeReportStudentQuery.data ? (
                      <StudentReportView Report={PracticeReportStudentQuery.data} />
                    ) : null}
                  </div>
                )}

                {PracticeReportsSubTab === "LEVEL" && (
                  <div className="math-card p-5">
                    <SectionTitle
                      icon={<Medal size={14} />}
                      kicker="Practice Reports"
                      title="Individual Level Analytics"
                      description="Cohort-wide performance across every student who has practiced this level -- averages, the section the cohort finds hardest, and a per-student leaderboard sorted by accuracy, for a rough forecast of what to expect (and from whom) on the day of the official event."
                    />

                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <select
                        aria-label="Select level"
                        value={ReportsLevelCode}
                        onChange={(EventValue) => SetReportsLevelCode(EventValue.target.value)}
                        className="math-input"
                      >
                        {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                          <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                        ))}
                      </select>
                    </div>

                    {PracticeReportLevelQuery.isLoading ? (
                      <div className="mt-5"><LoadingState label="Loading level report..." /></div>
                    ) : PracticeReportLevelQuery.data ? (
                      <LevelReportView Report={PracticeReportLevelQuery.data} />
                    ) : null}
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
