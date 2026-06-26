"use client";

import { AppShell } from "@/components/common/AppShell";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  ClipboardCheck,
  ClipboardPlus,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const QuickLinks = [
  { Icon: <UsersRound size={16} />, Label: "Students", Route: "/teacher/students" },
  { Icon: <ClipboardPlus size={16} />, Label: "Assign Practice", Route: "/teacher/assign-dps" },
  { Icon: <Target size={16} />, Label: "Practice Tracker", Route: "/teacher/assignment-tracker" },
  { Icon: <ShieldCheck size={16} />, Label: "Assessment Readiness", Route: "/teacher/assessment-readiness" },
  { Icon: <ClipboardPlus size={16} />, Label: "Assign Assessment", Route: "/teacher/assign-assessment" },
  { Icon: <GraduationCap size={16} />, Label: "Assessment Tracker", Route: "/teacher/assessments" },
];

export default function TeacherDashboardPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();

  if (!Ready) return null;

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-teacher w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-teacher math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#E6B8A2]/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-[#B76E79]/18 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="math-dashboard-kicker">
                <Target size={13} />
                Teacher Workspace
              </div>
              <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-[2.35rem] lg:whitespace-nowrap">
                Teaching Workspace
              </h1>
              <p className="mt-2 math-subtitle">
                Guide practice, readiness, and assessments for every assigned learner.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => Router.push("/teacher/assignment-tracker")}
                  className="math-dashboard-primary-action"
                >
                  <Sparkles size={15} />
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
            <div className="math-dashboard-readable-pulse math-dashboard-readable-pulse-teacher">
              <p className="math-dashboard-pulse-eyebrow">Teaching Pulse</p>
              <h2>Learner Focus</h2>
              <p>Practice signals and readiness checks stay connected.</p>
            </div>
          </div>
        </section>

        <section className="math-dashboard-priority-panel">
          <div>
            <p className="math-dashboard-section-label">Teaching Priority</p>
            <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Review Practice Before Assessment
            </h2>
            <p className="mt-1 math-subtitle">
              Start with practice activity, then confirm readiness and assessment records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => Router.push("/teacher/assignment-tracker")} className="math-dashboard-primary-action">
              <Sparkles size={15} />
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
              onClick={() => Router.push(LinkItem.Route)}
            />
          ))}
        </section>
      </main>
    </AppShell>
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
