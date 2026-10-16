"use client";

import { AppShell } from "@/components/common/AppShell";
import {
  uniqueAwaitingApprovalCount,
  uniqueNeedsReattemptCount,
  uniquePendingConceptCount,
} from "@/components/common/DetailWorkspaceViews";
import { StudentJourney } from "@/components/common/LessonAssignmentStatus";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getTeacherAssignmentTracker, getTeacherStudents } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  ClipboardPlus,
  FilePenLine,
  GraduationCap,
  Hourglass,
  ListOrdered,
  RotateCcw,
  ShieldCheck,
  Target,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

const QuickLinks = [
  { Icon: <UsersRound size={16} />, Label: "My Students", Note: "Every student, their lesson and how they are doing", Route: "/teacher/students" },
  { Icon: <ClipboardPlus size={16} />, Label: "Assign Practice", Note: "Give the next lesson's sheets", Route: "/teacher/assign-dps" },
  { Icon: <Target size={16} />, Label: "Practice Tracker", Note: "Submissions, scores and re-attempts", Route: "/teacher/assignment-tracker" },
  { Icon: <ShieldCheck size={16} />, Label: "Assessment Readiness", Note: "How much of each level's practice is done", Route: "/teacher/assessment-readiness" },
  { Icon: <FilePenLine size={16} />, Label: "Assign Assessment", Note: "Give a level assessment", Route: "/teacher/assign-assessment" },
  { Icon: <ClipboardCheck size={16} />, Label: "Assessment Tracker", Note: "Assessment results and promotions", Route: "/teacher/assessments" },
];

// "Thursday, 15 Oct" in India time.
function TodayLabel() {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
    .format(new Date())
    .replace(/Sept/, "Sep");
}

function Plural(Count: number, One: string, Many: string) {
  return `${Count} ${Count === 1 ? One : Many}`;
}

export default function TeacherDashboardPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  // The same two queries (and query keys) as My Students and the Practice
  // Tracker, counted with the same shared rules, so the figures here always
  // match those pages.
  const StudentsQuery = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: Ready });
  const TrackerQuery = useQuery({ queryKey: ["teacher-assignment-tracker-current-state"], queryFn: getTeacherAssignmentTracker, enabled: Ready });

  const Today = useMemo(() => {
    if (!StudentsQuery.data || !TrackerQuery.data) return null;
    const Active = StudentsQuery.data.filter((Student) => Student.isActive !== false);
    const ActiveCodes = new Set(Active.map((Student) => Student.studentCode));
    const Rows = ((TrackerQuery.data.rows ?? []) as Record<string, any>[]).filter((Row) => ActiveCodes.has(String(Row.studentCode || "")));
    const Journeys = Active.map((Student) => StudentJourney(Student));
    return {
      active: Active.length,
      inactive: StudentsQuery.data.length - Active.length,
      needLesson: Journeys.filter((Journey) => Journey.needsAssigning).length,
      newToLevel: Journeys.filter((Journey) => Journey.kind === "NEW").length,
      pending: uniquePendingConceptCount(Rows),
      needsReattempt: uniqueNeedsReattemptCount(Rows),
      awaiting: uniqueAwaitingApprovalCount(Rows),
    };
  }, [StudentsQuery.data, TrackerQuery.data]);

  if (!Ready) return null;

  const Loading = StudentsQuery.isLoading || TrackerQuery.isLoading;
  const Failed = Boolean(StudentsQuery.error || TrackerQuery.error);
  const Value = (Number: number | undefined) => (Today ? Number ?? 0 : Loading ? "…" : "—");

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-teacher w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-teacher math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#E6B8A2]/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-[#B76E79]/18 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="math-block-header">
                <GraduationCap size={14} />
                Teacher Workspace
              </div>
              <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white sm:text-[2.35rem]">
                Teaching Workspace
              </h1>
              <p className="mt-2 math-subtitle">
                Guide practice, readiness and assessments for every student you teach.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => Router.push("/teacher/assignment-tracker")}
                  className="math-dashboard-primary-action"
                >
                  <Target size={15} />
                  Practice Tracker
                </button>
                <button
                  type="button"
                  onClick={() => Router.push("/teacher/assessment-readiness")}
                  className="math-dashboard-secondary-action"
                >
                  <ShieldCheck size={15} />
                  Assessment Readiness
                </button>
              </div>
            </div>
            <div className="te-pulse" aria-live="polite">
              <p className="te-pulse-day">{TodayLabel()}</p>
              <p className="te-pulse-line">
                {Today ? Plural(Today.active, "Active Student", "Active Students") : Loading ? "Loading Today…" : "Today"}
              </p>
              <p className="te-pulse-sub">
                {Today
                  ? Today.needLesson
                    ? `${Plural(Today.needLesson, "student needs", "students need")} a lesson assigned`
                    : "Everyone has work assigned"
                  : Failed
                    ? "Today's figures could not load"
                    : " "}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="te-today-title" className="math-card grid gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="te-today-title" className="te-section-title">Today</h2>
            <p className="te-section-note">Each figure opens the page that deals with it.</p>
          </div>
          <div className="te-today">
            <TodayTile
              Icon={<UsersRound size={18} />}
              Label="Active Students"
              Value={Value(Today?.active)}
              Note={Today && Today.inactive ? `${Plural(Today.inactive, "inactive account", "inactive accounts")} not counted` : undefined}
              onClick={() => Router.push("/teacher/students")}
            />
            <TodayTile
              Icon={<UserRoundPlus size={18} />}
              Label="Need Their Next Lesson"
              Value={Value(Today?.needLesson)}
              Note={Today && Today.newToLevel ? `${Today.newToLevel} new to their level` : undefined}
              Tone={Today && Today.needLesson ? "warn" : "calm"}
              onClick={() => Router.push("/teacher/assign-dps")}
            />
            <TodayTile
              Icon={<Hourglass size={18} />}
              Label="Waiting On Students"
              Value={Value(Today?.pending)}
              Note="Sheets not done yet"
              onClick={() => Router.push("/teacher/assignment-tracker?tab=action-queue")}
            />
            <TodayTile
              Icon={<RotateCcw size={18} />}
              Label="Re-Attempts Due"
              Value={Value(Today?.needsReattempt)}
              Note="Below the benchmark"
              Tone={Today && Today.needsReattempt ? "alert" : "calm"}
              onClick={() => Router.push("/teacher/assignment-tracker?tab=student-review")}
            />
            <TodayTile
              Icon={<ShieldCheck size={18} />}
              Label="Awaiting Approval"
              Value={Value(Today?.awaiting)}
              Note="Waiting for the admin"
              onClick={() => Router.push("/teacher/assignment-tracker?tab=awaiting-approval")}
            />
          </div>
        </section>

        <section className="math-dashboard-priority-panel">
          <div>
            <p className="math-dashboard-section-label math-block-header">
              <ListOrdered size={14} />
              Teaching Priority
            </p>
            <h2 className="mt-1.5 text-xl font-black text-slate-950 dark:text-white">
              Review Practice Before Assessment
            </h2>
            <p className="mt-1 math-subtitle">
              Start with practice activity, then confirm readiness and assessment records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => Router.push("/teacher/assignment-tracker")} className="math-dashboard-primary-action">
              <Target size={15} />
              Practice Tracker
            </button>
            <button type="button" onClick={() => Router.push("/teacher/assessments")} className="math-dashboard-secondary-action">
              <ClipboardCheck size={15} />
              Assessment Tracker
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QuickLinks.map((LinkItem) => (
            <QuickAccessCard
              key={LinkItem.Route}
              Icon={LinkItem.Icon}
              Label={LinkItem.Label}
              Note={LinkItem.Note}
              onClick={() => Router.push(LinkItem.Route)}
            />
          ))}
        </section>
      </main>
    </AppShell>
  );
}

function TodayTile({
  Icon,
  Label,
  Value,
  Note,
  Tone,
  onClick,
}: {
  Icon: ReactNode;
  Label: string;
  Value: number | string;
  Note?: string;
  Tone?: "warn" | "alert" | "calm";
  onClick: () => void;
}) {
  return (
    <button type="button" className="te-tile" data-tone={Tone} onClick={onClick} aria-label={`${Label}: ${Value}. Open`}>
      <span className="te-tile-icon" aria-hidden="true">{Icon}</span>
      <span className="te-tile-label">{Label}</span>
      <span className="te-tile-value">{Value}</span>
      {Note ? <span className="te-tile-note">{Note}</span> : null}
    </button>
  );
}

function QuickAccessCard({ Icon, Label, Note, onClick }: { Icon: ReactNode; Label: string; Note: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group math-dashboard-quick-card text-left">
      <span className="math-dashboard-quick-icon">{Icon}</span>
      <span className="block min-w-0 flex-1">
        <span className="block text-base font-black text-slate-950 dark:text-white">{Label}</span>
        <span className="te-quick-note">{Note}</span>
      </span>
    </button>
  );
}
