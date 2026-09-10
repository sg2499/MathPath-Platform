"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getMyAnnualCompetitionAssignments,
  startAnnualCompetitionAttempt,
  type AnnualCompetitionAssignmentForStudent,
} from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Eye, Hourglass, MapPin, PlayCircle, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";

function FormatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
        <div>
          <div className="math-block-header mb-2"><Trophy size={14} /> Annual Competition</div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">{assignment.eventName}</h2>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} className="text-orange-600 dark:text-orange-300" />
              Competition Date: {FormatDateTime(assignment.competitionDate)}
            </div>
            {assignment.slot ? (
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-orange-600 dark:text-orange-300" />
                Your Slot: {assignment.slot.slotLabel || assignment.slot.mode} · {FormatDateTime(assignment.slot.scheduledStartAt)}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Hourglass size={16} />
                No specific slot assigned yet -- you can start once the paper is ready.
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
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

function AnnualCompetitionContent() {
  const ready = useProtectedPage(["STUDENT"]);
  const router = useRouter();

  const query = useQuery({
    queryKey: ["student-annual-competition-assignments"],
    queryFn: getMyAnnualCompetitionAssignments,
    enabled: ready,
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
      </section>
    </AppShell>
  );
}

export default function AnnualCompetitionPage() {
  return <AnnualCompetitionContent />;
}
