"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getAnnualCompetitionPracticeBank,
  getMyAnnualCompetitionAssignments,
  getMyAnnualCompetitionPracticeAttempts,
  getMyAnnualCompetitionPracticeScopes,
  startAnnualCompetitionAttempt,
  startAnnualCompetitionPracticeAttempt,
  type AnnualCompetitionAssignmentForStudent,
  type AnnualCompetitionPracticeAttemptRow,
  type AnnualCompetitionPracticeScope,
} from "@/lib/api/student";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Eye, History, Hourglass, MapPin, PlayCircle, Repeat, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function FormatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Reused verbatim from app/student/competition/mock-exams/page.tsx's own
// RoundHalfUp/FormatScore/AccuracyChipTone/ScoreChipTone -- same rounding
// and color-band rules, so a practice paper's score/accuracy chip reads
// identically to a Mock/DPS sheet's, per Shailesh's requirement that
// "Submitted Practice History" look like those, not plain text.
function RoundHalfUp(value: number) {
  return Math.floor(Number(value) + 0.5);
}

function FormatScore(value?: number | null, maxScore?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const formattedScore = String(RoundHalfUp(Number(value)));
  if (maxScore !== null && maxScore !== undefined && !Number.isNaN(Number(maxScore))) {
    return `${formattedScore}/${String(RoundHalfUp(Number(maxScore)))}`;
  }
  return formattedScore;
}

function FormatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) {
    return `${minutes} Min${minutes !== 1 ? "s" : ""} ${secs} Sec${secs !== 1 ? "s" : ""}`;
  }
  if (minutes) {
    return `${minutes} Min${minutes !== 1 ? "s" : ""}`;
  }
  return `${secs} Sec${secs !== 1 ? "s" : ""}`;
}

function AccuracyChipTone(value: number | null): "slate" | "green" | "red" | "amber" | "blue" | "cyan" | "purple" {
  if (value === null) return "slate";
  if (value < 60) return "red";
  if (value < 80) return "amber";
  return "green";
}

function ScoreChipTone(value: number | null) {
  return AccuracyChipTone(value);
}

function StatusChip({ assignment }: { assignment: AnnualCompetitionAssignmentForStudent }) {
  // Root-cause fix (Shailesh, 2026-09-09): a Grant Retry on the admin side
  // never changes latestAttemptStatus (it's a separate, additive grant
  // against the assignment -- see hasActiveRetryGrant's own comment), so
  // this has to be checked before the terminal-status branches below, not
  // folded into them, or a retry-granted student keeps seeing a plain
  // "Submitted" chip with nothing telling them anything changed.
  if (assignment.hasActiveRetryGrant) {
    return <Chip tone="amber">Retry Granted</Chip>;
  }
  switch (assignment.latestAttemptStatus) {
    case "SUBMITTED":
    case "FINALIZED":
      return <Chip tone="green">Submitted</Chip>;
    case "IN_PROGRESS":
      return <Chip tone="amber">In Progress</Chip>;
    default:
      return <Chip tone="slate">Not Started</Chip>;
  }
}

// A slot that hasn't opened yet gates *starting* the attempt itself
// (server-side, see _CheckSlotGate) -- but reading the instructions is
// allowed earlier than that on purpose (Shailesh, 2026-09-08 point 3): a
// student should be able to review the instructions screen 10 minutes
// before their slot begins, so they walk in already knowing the format.
// The Start Competition button on that instructions screen still enforces
// the real, exact slot-start gate (see the instructions page) -- this is
// only the "can they open the instructions screen at all" check.
const INSTRUCTIONS_VISIBLE_MINUTES_BEFORE_SLOT = 10;

function InstructionsNotYetVisible(assignment: AnnualCompetitionAssignmentForStudent, now: Date) {
  if (!assignment.slot?.scheduledStartAt) return false;
  const start = new Date(assignment.slot.scheduledStartAt);
  if (Number.isNaN(start.getTime())) return false;
  const visibleFrom = new Date(start.getTime() - INSTRUCTIONS_VISIBLE_MINUTES_BEFORE_SLOT * 60 * 1000);
  return now < visibleFrom;
}

function AssignmentCard({
  assignment,
  starting,
  onStart,
  onResume,
  onViewResult,
}: {
  assignment: AnnualCompetitionAssignmentForStudent;
  starting: boolean;
  onStart: () => void;
  onResume: () => void;
  onViewResult: () => void;
}) {
  const now = new Date();
  const notStarted = assignment.latestAttemptStatus === "NOT_STARTED";
  const inProgress = assignment.latestAttemptStatus === "IN_PROGRESS";
  // Root-cause fix (Shailesh, 2026-09-09): hasActiveRetryGrant only ever
  // co-occurs with a terminal latestAttemptStatus (GrantAnnualCompetitionAttemptRetry
  // requires the attempt it's granted against to already be terminal), so
  // this branch has to be checked and excluded from `completed` below, or
  // a retry-granted student keeps landing on the dead-end "Submitted" card
  // this whole fix exists to get them past.
  const retryAvailable = assignment.hasActiveRetryGrant;
  const completed =
    !retryAvailable && (assignment.latestAttemptStatus === "SUBMITTED" || assignment.latestAttemptStatus === "FINALIZED");
  const instructionsGated = (notStarted || retryAvailable) && InstructionsNotYetVisible(assignment, now);

  return (
    <div className="math-card p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="math-block-header mb-2"><Trophy size={14} /> Annual Competition</div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">{assignment.eventName}</h2>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock size={16} className="shrink-0 text-orange-600 dark:text-orange-300" />
              <span className="whitespace-nowrap">Competition Date: {FormatDateTime(assignment.competitionDate)}</span>
            </div>
            {assignment.slot ? (
              <div className="flex flex-wrap items-center gap-2">
                <MapPin size={16} className="shrink-0 text-orange-600 dark:text-orange-300" />
                <span className="whitespace-nowrap">
                  Your Slot: {assignment.slot.slotLabel || assignment.slot.mode} · {FormatDateTime(assignment.slot.scheduledStartAt)}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
                <Hourglass size={16} className="shrink-0" />
                <span>No specific slot assigned yet -- you can start once the paper is ready.</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="blue">{assignment.assignedLevelCode}</Chip>
            <StatusChip assignment={assignment} />
          </div>
          {notStarted ? (
            <button
              className="math-role-action-button h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={starting || instructionsGated}
              title={instructionsGated ? `Instructions open ${FormatDateTime(assignment.slot?.scheduledStartAt)}` : undefined}
              onClick={onStart}
            >
              <PlayCircle size={16} />
              {instructionsGated ? "Not Open Yet" : starting ? "Starting..." : "View Instructions"}
            </button>
          ) : inProgress ? (
            <button
              className="math-role-action-button h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={starting}
              onClick={onResume}
            >
              <PlayCircle size={16} />
              {starting ? "Resuming..." : "Resume Competition"}
            </button>
          ) : retryAvailable ? (
            <button
              className="math-role-action-button h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={starting || instructionsGated}
              title={instructionsGated ? `Instructions open ${FormatDateTime(assignment.slot?.scheduledStartAt)}` : undefined}
              onClick={onStart}
            >
              <PlayCircle size={16} />
              {instructionsGated ? "Not Open Yet" : starting ? "Starting..." : "Start Retry"}
            </button>
          ) : completed && assignment.latestAttemptId ? (
            // 2026-09-10 (Shailesh bug report, Ishan Banerjee/Test-4): this
            // used to be a static, non-clickable "Submitted -- results are
            // released separately" div with no way to actually reach the
            // result, even once an admin had released it -- confirmed as a
            // frontend-only gap, the backend/release pipeline was already
            // correct. The destination page (attempt/[attemptId]) already
            // handles both the not-yet-released ("still being scored") and
            // released (score/accuracy/rank/certificate) states on its own,
            // so this just needs to actually link there.
            <button
              className="math-role-action-button h-10 px-4 text-sm"
              onClick={onViewResult}
            >
              <Eye size={16} />
              View Result
            </button>
          ) : completed ? (
            // Defensive fallback only -- a completed (SUBMITTED/FINALIZED)
            // assignment should always carry a latestAttemptId; this covers
            // the data-oddity case where it somehow doesn't, rather than
            // rendering a dead button.
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs font-black text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-200">
              Submitted -- results are released separately.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Phase G (Competition Practice, student frontend): mirrors the admin
// Studio's Official/Practice switcher (Phase F) -- a top-level tab rather
// than a toggle nested inside the existing assignment card, same reasoning
// as that decision: practice is a genuinely separate concern (own bank, own
// history, no slot/no retake-blocking), not a variant of the official flow.
type AnnualCompetitionTab = "OFFICIAL" | "PRACTICE";

// 2026-09-14 (Shailesh): "the icon and wordings look crammed and weird
// instead of clean and professional just like all the other tabs in the
// student login" -- confirmed root cause: .math-role-tab (globals.css) is a
// plain rounded pill with no `gap` defined, and every other consumer of
// this class (ReviewTabButton on this same attempt page, ResultTabButton in
// the admin/teacher mock-result pages) passes plain text only, never an
// icon+label pair. Dropping the icon here brings this tab pair in line with
// that same convention instead of inventing a one-off crammed layout.
function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={active ? "math-role-tab math-role-tab-active" : "math-role-tab"}>
      {label}
    </button>
  );
}

// One panel per practice LEVEL the student has any practice papers for --
// see getMyAnnualCompetitionPracticeScopes's own comment on
// lib/api/student.ts. Fixed 2026-09-11 (Shailesh): this used to be scoped
// off the student's OFFICIAL assignments, which meant a student with
// practice papers batch-assigned but no official assignment saw nothing --
// "the students should be able to practice any paper even if they do not
// have any official competition attempts, that is the whole point of this
// entire practice feature." Then fully decoupled from any event (2026-09-12,
// Shailesh): "the practice papers should not be related to any event
// whatsoever, its only for practice leading to the main event." So this
// panel is keyed purely by competitionLevelCode now -- no event name is
// shown anywhere here, and the copy below is deliberately explicit that
// these are practice papers preparing a student for the real, scheduled
// Annual Competition (the Official tab), not the Annual Competition itself.
// Scopes are the source of truth for both which panels exist AND their
// remaining-paper count (no separate per-panel bank fetch needed --
// ListMyAnnualCompetitionPracticeScopes already returns
// totalAssigned/consumedCount/remainingCount per scope), so starting a
// paper just invalidates the parent scopes query (see
// AnnualCompetitionContent) to pick up any count change.
//
// 2026-09-14 (Shailesh, unified practice table): "show all the assigned
// papers to a particular student order wise just like they see for mocks
// and dps papers... with the start button and status set to pending and
// once completed it should show the status as submitted and the action
// button should be view instead of start." Built by merging two already-
// existing lists on levelPaperId: getAnnualCompetitionPracticeBank (every
// paper ever assigned, oldest first, each carrying its stable "Practice
// Paper N" label) and getMyAnnualCompetitionPracticeAttempts (every attempt
// ever started against one of those papers). A bank paper with no matching
// attempt is Pending; IN_PROGRESS -> Resume; SUBMITTED/FINALIZED ->
// Submitted/View.
//
// One real constraint this table has to respect honestly: unlike Mock/DPS
// (where each row is its own independently startable paper),
// startAnnualCompetitionPracticeAttempt has no "start THIS specific paper"
// parameter -- it always resumes the one in-progress attempt if one exists,
// otherwise draws whichever unconsumed bank paper has the oldest
// assigned_at (FIFO -- see that function's own docstring on the backend).
// Since a student can only ever have at most one open (unsubmitted)
// practice attempt at a time (starting again just resumes it rather than
// drawing a second paper -- confirmed via
// test_practice_abandoned_in_progress_attempt_is_not_consumed_and_still_
// resumes), the row order guarantees every row before that "current" one is
// already Submitted and every row after it is genuinely untouched. So the
// Start action only ever needs to appear on ONE row -- the in-progress one
// if there is one (as Resume), otherwise the single earliest Pending row --
// with every other Pending row shown as a queued "Pending" row with no
// button, rather than a misleading Start button that would silently start
// a different paper than the one clicked.
function PracticeLevelPanel({ scope }: { scope: AnnualCompetitionPracticeScope }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const levelCode = scope.competitionLevelCode;

  const bankQuery = useQuery({
    queryKey: ["student-annual-competition-practice-bank", levelCode],
    queryFn: () => getAnnualCompetitionPracticeBank(levelCode),
  });

  const attemptsQuery = useQuery({
    queryKey: ["student-annual-competition-practice-attempts", levelCode],
    queryFn: () => getMyAnnualCompetitionPracticeAttempts(levelCode),
  });

  const startMutation = useMutation({
    mutationFn: () => startAnnualCompetitionPracticeAttempt(levelCode),
    onSuccess: (attempt) => {
      queryClient.invalidateQueries({ queryKey: ["student-annual-competition-practice-scopes"] });
      queryClient.invalidateQueries({ queryKey: ["student-annual-competition-practice-attempts", levelCode] });
      queryClient.invalidateQueries({ queryKey: ["student-annual-competition-practice-bank", levelCode] });
      router.push(`/student/competition/annual/attempt/${attempt.attemptId}`);
    },
  });

  const remainingCount = scope.remainingCount;
  const attemptsByLevelPaperId = new Map<string, AnnualCompetitionPracticeAttemptRow>(
    (attemptsQuery.data?.attempts || []).map((row) => [row.levelPaperId, row])
  );
  const bankPapers = bankQuery.data?.papers || [];
  const inProgressAttempt = attemptsQuery.data?.attempts.find((row) => row.status === "IN_PROGRESS");
  const firstUntouchedIndex = inProgressAttempt
    ? -1
    : bankPapers.findIndex((paper) => !attemptsByLevelPaperId.has(paper.levelPaperId));
  const isLoading = bankQuery.isLoading || attemptsQuery.isLoading;

  return (
    <div className="math-card p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="math-block-header mb-2"><Repeat size={14} /> Annual Competition Practice</div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">{levelCode} Practice Papers</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone="blue">{levelCode}</Chip>
            <Chip tone={remainingCount > 0 ? "green" : "slate"}>
              {remainingCount} Paper{remainingCount === 1 ? "" : "s"} Remaining
            </Chip>
          </div>
          {/* 2026-09-14 (Shailesh): "the text there again appears where it
              goes to the next line while having ample space on the same" --
              root cause was this max-w-2xl artificially narrowing the
              paragraph well short of the card's real width; math-subtitle
              elsewhere on this same page uses max-w-none for exactly this
              reason, so this paragraph now matches that convention instead
              of wrapping early. */}
          <p className="mt-3 max-w-none text-sm font-bold text-slate-600 dark:text-slate-300">
            Practice papers to help you prepare for the Annual Competition -- not the Annual Competition itself, and not
            tied to any specific event. Always freshly generated, no retakes once submitted, and results are visible to
            you immediately.
          </p>
        </div>
        {!remainingCount && !inProgressAttempt ? (
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              No practice papers left -- ask your teacher/admin to assign more.
            </p>
          </div>
        ) : null}
      </div>

      {startMutation.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(startMutation.error)} /></div> : null}

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <p className="math-block-header mb-3"><History size={14} /> Practice Papers</p>
        {isLoading ? (
          <LoadingState label="Loading your practice papers..." />
        ) : bankPapers.length === 0 ? (
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No practice papers assigned yet.</p>
        ) : (
          <div className="math-table overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Paper Name</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Score</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Accuracy</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Time Taken</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Submitted</th>
                  <th className="px-4 py-3 font-black text-slate-500 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bankPapers.map((paper, index) => {
                  const attempt = attemptsByLevelPaperId.get(paper.levelPaperId);
                  const isInProgress = attempt?.status === "IN_PROGRESS";
                  const isSubmitted = attempt && !isInProgress;
                  const isNextToStart = !attempt && index === firstUntouchedIndex;
                  const result = attempt?.result;
                  const accuracy = result ? Number(result.accuracyPercentage ?? result.percentage) : null;

                  return (
                    <tr key={paper.levelPaperId}>
                      <td className="px-4 py-4 font-black text-slate-950 dark:text-white">{paper.paperLabel}</td>
                      <td className="px-4 py-4">
                        <Chip tone={isSubmitted ? "green" : isInProgress ? "amber" : "slate"}>
                          {isSubmitted ? "Submitted" : isInProgress ? "In Progress" : "Pending"}
                        </Chip>
                      </td>
                      <td className="px-4 py-4 font-black">
                        <Chip tone={ScoreChipTone(accuracy)}>
                          {isSubmitted && result ? FormatScore(result.score, result.maxScore) : "-"}
                        </Chip>
                      </td>
                      <td className="px-4 py-4 font-black">
                        <Chip tone={AccuracyChipTone(accuracy)}>
                          {isSubmitted && accuracy !== null && !Number.isNaN(accuracy) ? `${FormatScore(accuracy)}%` : "-"}
                        </Chip>
                      </td>
                      <td className="px-4 py-4 font-black text-slate-950 dark:text-white">
                        {isSubmitted ? FormatDuration(result?.timeTakenSeconds) : "-"}
                      </td>
                      <td className="px-4 py-4 font-black text-slate-950 dark:text-white">
                        {isSubmitted ? FormatDateTime(attempt?.submittedAt || attempt?.startedAt) : "-"}
                      </td>
                      <td className="px-4 py-4">
                        {isSubmitted ? (
                          <button
                            className="math-button-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                            onClick={() => router.push(`/student/competition/annual/attempt/${attempt!.attemptId}`)}
                          >
                            <Eye size={13} />
                            View
                          </button>
                        ) : isInProgress ? (
                          <button
                            className="math-role-action-button h-8 px-3 text-xs"
                            onClick={() => router.push(`/student/competition/annual/attempt/${attempt!.attemptId}`)}
                          >
                            <PlayCircle size={13} />
                            Resume
                          </button>
                        ) : isNextToStart ? (
                          <button
                            className="math-role-action-button h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={startMutation.isPending}
                            onClick={() => startMutation.mutate()}
                          >
                            <Repeat size={13} />
                            {startMutation.isPending ? "Starting..." : "Start"}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AnnualCompetitionContent() {
  const ready = useProtectedPage(["STUDENT"]);
  const router = useRouter();
  const [ActiveTab, SetActiveTab] = useState<AnnualCompetitionTab>("OFFICIAL");
  // 2026-09-14 (Shailesh): a student's Annual Competition level can change
  // between competition years, so a student who has practice papers from
  // more than one level needs to be able to narrow the view down to just
  // one -- "ALL" (the default, matching this view's behavior before the
  // filter existed) shows every level's papers stacked, same as today.
  const [PracticeLevelFilter, SetPracticeLevelFilter] = useState<string>("ALL");

  const query = useQuery({
    queryKey: ["student-annual-competition-assignments"],
    queryFn: getMyAnnualCompetitionAssignments,
    enabled: ready,
  });

  // Independent of the OFFICIAL assignments query above -- see
  // PracticeEventPanel's own comment on why this can no longer be derived
  // from `assignments`. Only fetched once the Practice tab is actually
  // opened (enabled below), matching this codebase's own established
  // ActiveTab-gated query convention (e.g. the admin Studio's Practice tab
  // queries).
  const scopesQuery = useQuery({
    queryKey: ["student-annual-competition-practice-scopes"],
    queryFn: getMyAnnualCompetitionPracticeScopes,
    enabled: ready && ActiveTab === "PRACTICE",
  });

  const resumeMutation = useMutation({
    mutationFn: (eventId: string) => startAnnualCompetitionAttempt(eventId),
    onSuccess: (attempt) => router.push(`/student/competition/annual/attempt/${attempt.attemptId}`),
  });

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Annual Competition">
        <LoadingState label="Loading your competition assignment..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Annual Competition">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  const assignments = query.data || [];
  const scopes = scopesQuery.data || [];

  return (
    <AppShell title="Annual Competition">
      <section className="space-y-6">
        <div className="math-card p-6">
          <div className="math-block-header mb-2"><Trophy size={14} /> MathPath Annual Competition</div>
          <h1 className="math-title">Annual Competition</h1>
          <p className="math-subtitle max-w-none">
            MathPath's official, once-a-year competition -- a single scored attempt at your assigned level, held at a
            fixed date and time. It is scored and ranked independently of your regular Competition Mock practice.
          </p>
        </div>

        <div className="math-card p-2">
          <div className="flex flex-wrap gap-2">
            <TabButton active={ActiveTab === "OFFICIAL"} label="Official" onClick={() => SetActiveTab("OFFICIAL")} />
            <TabButton active={ActiveTab === "PRACTICE"} label="Practice" onClick={() => SetActiveTab("PRACTICE")} />
          </div>
        </div>

        {ActiveTab === "OFFICIAL" ? (
          <>
            {resumeMutation.error ? <ErrorState message={apiErrorMessage(resumeMutation.error)} /> : null}

            {assignments.length === 0 ? (
              <div className="math-card p-6 text-sm font-bold text-slate-700 dark:text-slate-200">
                You are not assigned to an Annual Competition event yet. Check back closer to the competition date.
              </div>
            ) : (
              <div className="grid gap-4">
                {assignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.assignmentId}
                    assignment={assignment}
                    starting={resumeMutation.isPending}
                    onStart={() => router.push(`/student/competition/annual/${assignment.eventId}/instructions`)}
                    onResume={() => resumeMutation.mutate(assignment.eventId)}
                    onViewResult={() => router.push(`/student/competition/annual/attempt/${assignment.latestAttemptId}`)}
                  />
                ))}
              </div>
            )}
          </>
        ) : scopesQuery.isLoading ? (
          <LoadingState label="Loading your practice papers..." />
        ) : scopesQuery.error ? (
          <ErrorState message={apiErrorMessage(scopesQuery.error)} />
        ) : scopes.length === 0 ? (
          // No official assignment required -- practice papers are visible
          // here the moment any are batch-assigned, regardless of whether
          // the student has an official Annual Competition assignment at
          // all (see getMyAnnualCompetitionPracticeScopes's own comment).
          <EmptyState
            title="No Practice Papers Yet"
            message="Practice papers appear here as soon as your teacher/admin assigns you some -- no official competition assignment required."
          />
        ) : (
          <div className="space-y-4">
            {scopes.length > 1 ? (
              <div className="math-card flex flex-wrap items-center gap-3 p-4">
                <label htmlFor="student-practice-level-filter" className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Level
                </label>
                <select
                  id="student-practice-level-filter"
                  value={PracticeLevelFilter}
                  onChange={(event) => SetPracticeLevelFilter(event.target.value)}
                  className="math-input w-auto min-w-[160px] text-sm font-bold"
                >
                  <option value="ALL">All Levels</option>
                  {scopes.map((scope) => (
                    <option key={scope.competitionLevelCode} value={scope.competitionLevelCode}>
                      {scope.competitionLevelCode}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-4">
              {scopes
                .filter((scope) => PracticeLevelFilter === "ALL" || scope.competitionLevelCode === PracticeLevelFilter)
                .map((scope) => (
                  <PracticeLevelPanel key={scope.competitionLevelCode} scope={scope} />
                ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

export default function AnnualCompetitionPage() {
  return <AnnualCompetitionContent />;
}
