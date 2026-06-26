"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getStudentAssignments, getStudentAssessments } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpenCheck,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type ProgressionTone = "success" | "ready" | "focus" | "steady";

function NormalizeStatus(Value: unknown) {
  return String(Value ?? "").toUpperCase();
}

function MessageIndex(Seed: unknown, Count: number) {
  if (Count <= 1) return 0;
  const Text = String(Seed || "MathPath Journey");
  const Total = Array.from(Text).reduce((Sum, Character) => Sum + Character.charCodeAt(0), 0);
  return Total % Count;
}

function PickMessage(Seed: unknown, Messages: string[]) {
  return Messages[MessageIndex(Seed, Messages.length)] || Messages[0];
}

function HasStartedPromotedLevel(Row: Record<string, any>, Assignments: Array<Record<string, any>>) {
  if (Row?.hasStartedPromotedLevel) return true;
  const ToLevelCode = NormalizeStatus(Row?.toLevelCode);
  if (!ToLevelCode) return false;
  return Assignments.some((Assignment) => {
    const SameLevel = NormalizeStatus(Assignment?.levelCode) === ToLevelCode;
    const AssignmentStatus = NormalizeStatus(Assignment?.status);
    return SameLevel && (Boolean(Assignment?.attemptId) || !["", "PENDING", "NOT_STARTED"].includes(AssignmentStatus));
  });
}

function BuildStudentProgressionMessage(Assessments: Array<Record<string, any>>, Assignments: Array<Record<string, any>>) {
  const Promoted = Assessments.find((Row) => (Row?.isPromoted || NormalizeStatus(Row?.progressionStatus) === "PROMOTED") && !HasStartedPromotedLevel(Row, Assignments));
  if (Promoted) {
    return {
      Tone: "success" as ProgressionTone,
      Label: "Promoted",
      Title: "Your Next Level Is Ready",
      Message: PickMessage(Promoted?.attemptId || Promoted?.assignmentId || Promoted?.assessmentTitle, [
        "Amazing work! Your new level is ready. Keep building speed, accuracy, and confidence one step at a time.",
        "You have moved forward in your MathPath journey. Stay curious, stay focused, and enjoy the next challenge.",
        "Wonderful progress! Your next learning path is open, and your steady practice has helped you reach this milestone.",
      ]),
      ActionLabel: "Open Progress",
      ActionRoute: "/student/results",
    };
  }

  const Ready = Assessments.find((Row) => Row?.isReadyForNextLevel || NormalizeStatus(Row?.progressionStatus) === "READY_FOR_NEXT_LEVEL");
  if (Ready) {
    return {
      Tone: "ready" as ProgressionTone,
      Label: "Ready For Next Level",
      Title: "You Are Ready For The Next Level",
      Message: PickMessage(Ready?.attemptId || Ready?.assignmentId || Ready?.assessmentTitle, [
        "Fantastic progress! You cleared your level assessment, and your next learning milestone is now within reach.",
        "Great work completing this level assessment. Your teacher will guide the next step so your journey continues smoothly.",
        "You have shown strong focus and steady effort. Keep your confidence high as you prepare for the next level.",
      ]),
      ActionLabel: "Review Assessments",
      ActionRoute: "/student/assessments",
    };
  }

  const NeedsReattempt = Assessments.find((Row) => {
    const Status = NormalizeStatus(Row?.status);
    return Status === "REATTEMPT_AVAILABLE" || Status === "NEEDS_RE_ATTEMPT" || Status === "NEEDS_REATTEMPT";
  });
  if (NeedsReattempt) {
    return {
      Tone: "focus" as ProgressionTone,
      Label: "Focused Practice",
      Title: "You Are Getting Closer",
      Message: PickMessage(NeedsReattempt?.attemptId || NeedsReattempt?.assignmentId || NeedsReattempt?.assessmentTitle, [
        "Every mistake is a clue. Review calmly, practise again, and your next attempt can be stronger.",
        "You are still building this skill. Step-by-step practice will help your confidence and accuracy grow.",
        "Stay steady. A little focused revision will help you move closer to clearing this level.",
      ]),
      ActionLabel: "Review Assessments",
      ActionRoute: "/student/assessments",
    };
  }

  return {
    Tone: "steady" as ProgressionTone,
    Label: "Learning Journey",
    Title: "Keep Building Your Skills",
    Message: PickMessage(Assessments[0]?.assessmentTitle || Assessments.length, [
      "Complete your assigned practice and assessments step by step. Every focused session brings you closer to your next milestone.",
      "Keep learning with patience and focus. Small daily wins will build strong number confidence.",
      "Your MathPath journey grows with every attempt. Stay curious and keep moving forward.",
    ]),
    ActionLabel: "Continue Learning",
    ActionRoute: Assessments.length > 0 ? "/student/assessments" : "/student/practice",
  };
}

const QuickLinks = [
  { Icon: <BookOpenCheck size={16} />, Label: "Practice", Route: "/student/practice" },
  { Icon: <GraduationCap size={16} />, Label: "Assessments", Route: "/student/assessments" },
  { Icon: <ShieldCheck size={16} />, Label: "Assessment Readiness", Route: "/student/assessment-readiness" },
  { Icon: <BarChart3 size={16} />, Label: "Progress", Route: "/student/results" },
];

export default function StudentDashboardPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();

  const AssignmentQuery = useQuery({
    queryKey: ["student-assignments"],
    queryFn: getStudentAssignments,
    enabled: Ready,
  });

  const AssessmentQuery = useQuery({
    queryKey: ["student-assessments", "progression-dashboard"],
    queryFn: getStudentAssessments,
    enabled: Ready,
  });

  if (!Ready) return null;

  const Assignments = AssignmentQuery.data ?? [];
  const Assessments = AssessmentQuery.data ?? [];
  const ProgressionMessage = BuildStudentProgressionMessage(Assessments as Array<Record<string, any>>, Assignments as Array<Record<string, any>>);
  const ActiveAssignments = Assignments.filter(
    (Assignment) =>
      Assignment.status === "NOT_STARTED" ||
      Assignment.status === "IN_PROGRESS" ||
      Assignment.status === "REATTEMPT_AVAILABLE"
  );

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-student math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-orange-300/18 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-pink-300/16 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="math-dashboard-kicker">
                <Target size={13} />
                Student Workspace
              </div>
              <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-[2.35rem] lg:whitespace-nowrap">
                My Learning Dashboard
              </h1>
              <p className="math-subtitle">
                Practice, assessments, and progress in one bright learning space.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => Router.push(ActiveAssignments.length > 0 ? "/student/practice" : ProgressionMessage.ActionRoute)}
                  className="math-dashboard-primary-action"
                >
                  <Sparkles size={15} />
                  {ActiveAssignments.length > 0 ? "Continue Practice" : ProgressionMessage.ActionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => Router.push("/student/results")}
                  className="math-dashboard-secondary-action"
                >
                  <BarChart3 size={15} />
                  Open Progress
                </button>
              </div>
            </div>
            <div className="math-dashboard-readable-pulse math-dashboard-readable-pulse-student">
              <p className="math-dashboard-pulse-eyebrow">Learning Pulse</p>
              <h2>Next Step</h2>
              <p>
                {ActiveAssignments.length > 0
                  ? "Continue your assigned DPS from Practice."
                  : "Review progress or readiness for your next step."}
              </p>
            </div>
          </div>
        </section>

        {AssignmentQuery.isLoading || AssessmentQuery.isLoading ? <LoadingState label="Loading dashboard snapshot..." /> : null}
        {AssignmentQuery.error ? <ErrorState message={apiErrorMessage(AssignmentQuery.error)} /> : null}
        {AssessmentQuery.error ? <ErrorState message={apiErrorMessage(AssessmentQuery.error)} /> : null}

        {!AssignmentQuery.isLoading && !AssessmentQuery.isLoading && !AssignmentQuery.error && !AssessmentQuery.error ? (
          <>
            <ProgressionJourneyCard State={ProgressionMessage} onClick={() => Router.push(ProgressionMessage.ActionRoute)} />

            <section className="math-dashboard-priority-panel">
              <div>
                <p className="math-dashboard-section-label">Learning Priority</p>
                <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                  {ActiveAssignments.length > 0 ? "Continue Assigned Practice" : "Review Learning Progress"}
                </h2>
                <p className="math-subtitle">
                  {ActiveAssignments.length > 0
                    ? "Complete assigned DPS, then check readiness for your next step."
                    : "Review attempts, scores, progress, and readiness."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => Router.push(ActiveAssignments.length > 0 ? "/student/practice" : "/student/results")}
                  className="math-dashboard-primary-action"
                >
                  <Sparkles size={15} />
                  {ActiveAssignments.length > 0 ? "Practice Review" : "Progress Review"}
                </button>
                <button
                  type="button"
                  onClick={() => Router.push("/student/assessment-readiness")}
                  className="math-dashboard-secondary-action"
                >
                  <ShieldCheck size={15} />
                  Assessment Readiness
                </button>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QuickLinks.map((LinkItem) => (
                <QuickAccessCard
                  key={LinkItem.Route}
                  Icon={LinkItem.Icon}
                  Label={LinkItem.Label}
                  onClick={() => Router.push(LinkItem.Route)}
                />
              ))}
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

function ProgressionJourneyCard({ State, onClick }: { State: ReturnType<typeof BuildStudentProgressionMessage>; onClick: () => void }) {
  const ToneClass =
    State.Tone === "success"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
      : State.Tone === "ready"
        ? "border-violet-200 bg-violet-50/90 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200"
        : State.Tone === "focus"
          ? "border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          : "border-blue-200 bg-blue-50/90 text-blue-800 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200";

  return (
    <section className="math-dashboard-journey-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${ToneClass}`}>
            <Trophy size={22} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-300">Next Level Journey</p>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black shadow-sm ${ToneClass}`}>{State.Label}</span>
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{State.Title}</h2>
            <p className="math-subtitle">{State.Message}</p>
          </div>
        </div>
        <button type="button" onClick={onClick} className="math-dashboard-primary-action shrink-0">
          <Sparkles size={15} />
          {State.ActionLabel}
        </button>
      </div>
    </section>
  );
}

function QuickAccessCard({ Icon, Label, onClick }: { Icon: ReactNode; Label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group math-dashboard-quick-card text-left">
      <span className="math-dashboard-quick-icon">{Icon}</span>
      <span className="block min-w-0 flex-1 text-base font-black text-slate-950 dark:text-white">{Label}</span>
    </button>
  );
}
