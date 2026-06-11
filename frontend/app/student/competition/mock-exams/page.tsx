"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getStudentCompetitionMockAssignments,
  startCompetitionMockAttempt,
  type StudentCompetitionMockAssignment,
} from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock3, ClipboardPlus, PlayCircle, Target } from "lucide-react";
import { useRouter } from "next/navigation";

function FormatDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes && secs) return `${minutes} Mins ${secs} Secs`;
  if (minutes) return `${minutes} Mins`;
  return `${secs} Secs`;
}

function FormatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function StudentCompetitionMockExamsPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const router = useRouter();

  const query = useQuery({
    queryKey: ["student-competition-mock-assignments"],
    queryFn: getStudentCompetitionMockAssignments,
    enabled: ready,
  });

  const startMutation = useMutation({
    mutationFn: (assignmentId: string) => startCompetitionMockAttempt({ assignmentId }),
    onSuccess: (attempt) => router.push(`/student/competition/mock-attempt/${attempt.attemptId}`),
  });

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Competition Mock Exams">
        <LoadingState label="Loading competition mocks..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Exams">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  const assignments = query.data || [];
  const availableCount = assignments.filter((item) => item.status !== "COMPLETED").length;
  const completedCount = assignments.filter((item) => item.status === "COMPLETED").length;

  return (
    <AppShell title="Competition Mock Exams">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Mock Exams</h1>
          <p className="mt-3 max-w-5xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Attempt Admin-assigned mock exams for your current level. Mock preparation is independent from regular Practice, Assessment Readiness, and Promotion.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <MetricCard icon={<ClipboardPlus size={18} />} label="ASSIGNED" value={assignments.length} helper="Current-level mocks" />
          <MetricCard icon={<PlayCircle size={18} />} label="AVAILABLE" value={availableCount} helper="Ready to start" />
          <MetricCard icon={<CheckCircle2 size={18} />} label="COMPLETED" value={completedCount} helper="Submitted mocks" />
        </div>

        <div className="math-card overflow-hidden p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="math-kicker">Assigned Mocks</p>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Competition Mock Library</h2>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-orange-200 bg-orange-50/70 p-6 text-sm font-bold text-slate-700 dark:border-orange-800/60 dark:bg-orange-950/20 dark:text-slate-200">
              No competition mocks are assigned for your current level yet.
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {assignments.map((assignment) => (
                <MockAssignmentCard
                  key={assignment.assignmentId}
                  assignment={assignment}
                  starting={startMutation.isPending}
                  onStart={() => startMutation.mutate(assignment.assignmentId)}
                  onResume={() => assignment.latestAttemptId && router.push(`/student/competition/mock-attempt/${assignment.latestAttemptId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <article className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-orange-50 p-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">{helper}</p>
    </article>
  );
}

function MockAssignmentCard({
  assignment,
  starting,
  onStart,
  onResume,
}: {
  assignment: StudentCompetitionMockAssignment;
  starting: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const exam = assignment.mockExam;
  const isInProgress = assignment.status === "IN_PROGRESS" && assignment.latestAttemptId;
  const isCompleted = assignment.status === "COMPLETED";
  const actionLabel = isCompleted ? "Submitted" : isInProgress ? "Continue Mock" : "Start Mock";

  return (
    <article className="rounded-[26px] border border-orange-100 bg-white/92 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-orange-500/60">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200">
              {assignment.status.replace(/_/g, " ")}
            </span>
            {exam.mockCode ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {exam.mockCode}
              </span>
            ) : null}
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {exam.moduleCode || "Module"} · {exam.levelCode || "Level"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-950 dark:text-white">{exam.title}</h3>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5"><Target size={15} /> {exam.totalQuestions} Questions</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={15} /> {FormatDuration(exam.durationSeconds)}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} /> Assigned {FormatDate(assignment.assignedAt)}</span>
          </div>
        </div>
        <button
          className="math-role-action-button w-full justify-center px-4 py-2.5 text-sm lg:w-auto"
          disabled={starting || isCompleted}
          onClick={isInProgress ? onResume : onStart}
        >
          {starting ? "Opening..." : actionLabel}
        </button>
      </div>
    </article>
  );
}
