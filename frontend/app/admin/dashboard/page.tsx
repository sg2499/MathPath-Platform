"use client";

import { AppShell } from "@/components/common/AppShell";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  ClipboardEdit,
  ClipboardList,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const QuickLinks = [
  { Icon: <BookOpen size={16} />, Label: "Learning Path", Route: "/admin/curriculum" },
  { Icon: <GraduationCap size={16} />, Label: "Students", Route: "/admin/students" },
  { Icon: <UserCheck size={16} />, Label: "Teachers", Route: "/admin/teachers" },
  { Icon: <ClipboardList size={16} />, Label: "Practice Control", Route: "/admin/assignments" },
  { Icon: <BadgeCheck size={16} />, Label: "Assessment Readiness", Route: "/admin/assessment-readiness" },
  { Icon: <ClipboardEdit size={16} />, Label: "Assessment Studio", Route: "/admin/assessment-blueprints" },
  { Icon: <ShieldCheck size={16} />, Label: "Assessment Control", Route: "/admin/assessments" },
  { Icon: <BarChart3 size={16} />, Label: "Performance Reports", Route: "/admin/results" },
];

import { LiveRadarWidget } from "@/components/admin/LiveRadarWidget";

export default function AdminDashboardPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();

  if (!Ready) return null;

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-admin w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-admin math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-blue-400/16 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-violet-300/14 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="math-dashboard-kicker">
                <Target size={13} />
                Admin Workspace
              </div>
              <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-[2.35rem] lg:whitespace-nowrap">
                MathPath Control Centre
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Govern learning, readiness, reports, and progression from one clear workspace.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => Router.push("/admin/assessment-readiness")}
                  className="math-dashboard-primary-action"
                >
                  <Sparkles size={15} />
                  Assessment Readiness
                </button>
                <button
                  type="button"
                  onClick={() => Router.push("/admin/assessments")}
                  className="math-dashboard-secondary-action"
                >
                  <ShieldCheck size={15} />
                  Assessment Control
                </button>
              </div>
            </div>
            <div className="w-full lg:w-80 shrink-0">
              <LiveRadarWidget />
            </div>
          </div>
        </section>

        <section className="math-dashboard-priority-panel">
          <div>
            <p className="math-dashboard-section-label">Operational Priority</p>
            <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Review Readiness And Reports
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Start with eligibility and results before choosing the next action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => Router.push("/admin/assessment-readiness")} className="math-dashboard-primary-action">
              <Sparkles size={15} />
              Assessment Readiness
            </button>
            <button type="button" onClick={() => Router.push("/admin/results")} className="math-dashboard-secondary-action">
              <BarChart3 size={15} />
              Performance Reports
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
