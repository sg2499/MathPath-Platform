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
import { CalendarClock, Hourglass, MapPin, PlayCircle, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";

function FormatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusChip({ assignment }: { assignment: AnnualCompetitionAssignmentForStudent }) {
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

// A slot that hasn't opened yet gates *starting* the attempt (server-side,
// see _CheckSlotGate) -- this is a purely informational, client-side mirror
// of that same check, so "Start" can be disabled with a clear reason instead
// of the student hitting a 403 after clicking.
function SlotNotYetOpen(assignment: AnnualCompetitionAssignmentForStudent, now: Date) {
  if (!assignment.slot?.scheduledStartAt) return false;
  const start = new Date(assignment.slot.scheduledStartAt);
  if (Number.isNaN(start.getTime())) return false;
  return now < start;
}

function AssignmentCard({
  assignment,
  starting,
  onStart,
  onResume,
}: {
  assignment: AnnualCompetitionAssignmentForStudent;
  starting: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const now = new Date();
  const notStarted = assignment.latestAttemptStatus === "NOT_STARTED";
  const inProgress = assignment.latestAttemptStatus === "IN_PROGRESS";
  const completed = assignment.latestAttemptStatus === "SUBMITTED" || assignment.latestAttemptStatus === "FINALIZED";
  const slotGated = notStarted && SlotNotYetOpen(assignment, now);

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
              disabled={starting || slotGated}
              title={slotGated ? `Opens ${FormatDateTime(assignment.slot?.scheduledStartAt)}` : undefined}
              onClick={onStart}
            >
              <PlayCircle size={16} />
              {slotGated ? "Not Open Yet" : starting ? "Starting..." : "View Instructions"}
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
          ) : completed ? (
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
          <div className="math-block-header mb-2"><Trophy size={14} /> The Real Thing</div>
          <h1 className="math-title">Annual Competition</h1>
          <p className="math-subtitle max-w-none">
            The official, once-a-year MathPath competition -- separate from your regular Competition Mock practice.
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
