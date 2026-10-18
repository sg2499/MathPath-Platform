"use client";

import { AppShell } from "@/components/common/AppShell";
import { currentWorkRows, isAwaitingApproval } from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getAdminAssessmentReattemptApprovals, getAdminAssignments } from "@/lib/api/admin";
import { getPaymentsHome } from "@/lib/api/payments";
import { useQuery } from "@tanstack/react-query";
import {
  Cake,
  ChevronRight,
  AlertTriangle,
  IndianRupee,
  RotateCcw,
  Wallet,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  FilePenLine,
  Gauge,
  GraduationCap,
  ListOrdered,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

// 2026-10 (admin revamp): each quick link says what is on the other side.
const QuickLinks = [
  { Icon: <BookOpenCheck size={16} />, Label: "Learning Path", Note: "Modules, lessons and DPS sheets", Route: "/admin/curriculum" },
  { Icon: <UserRound size={16} />, Label: "Students", Note: "Add, edit and place students", Route: "/admin/students" },
  { Icon: <GraduationCap size={16} />, Label: "Teachers", Note: "Teacher accounts and their students", Route: "/admin/teachers" },
  { Icon: <ClipboardCheck size={16} />, Label: "Practice Control", Note: "Practice work and re-attempt approvals", Route: "/admin/assignments" },
  { Icon: <ShieldCheck size={16} />, Label: "Assessment Readiness", Note: "Who has finished their level's practice", Route: "/admin/assessment-readiness" },
  { Icon: <FilePenLine size={16} />, Label: "Assessment Studio", Note: "Build and publish level assessments", Route: "/admin/assessment-blueprints" },
  { Icon: <CheckCircle2 size={16} />, Label: "Assessment Control", Note: "Results, requests and promotions", Route: "/admin/assessments" },
  { Icon: <FileBarChart size={16} />, Label: "Performance Reports", Note: "Learning performance and student history", Route: "/admin/results" },
];

function Plural(Count: number, One: string, Many: string) {
  return `${Count} ${Count === 1 ? One : Many}`;
}

import { LiveRadarWidget } from "@/components/admin/LiveRadarWidget";
import { getBirthdaysToday } from "@/lib/api/birthday";

export default function AdminDashboardPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();
  // Today's figures (2026-10, admin revamp). The practice figure uses the
  // Practice Control query (same key and the same rule as its Awaiting
  // Approval tab), so the two numbers always agree, and the page is already
  // loaded when the admin opens it from here.
  const PracticeQuery = useQuery({ queryKey: ["admin-assignments"], queryFn: getAdminAssignments, enabled: Ready, staleTime: 60_000 });
  const ApprovalsQuery = useQuery({
    queryKey: ["admin-dashboard-assessment-requests"],
    queryFn: () => getAdminAssessmentReattemptApprovals({ status: "PENDING" }),
    enabled: Ready,
    staleTime: 60_000,
  });
  const PaymentsQuery = useQuery({ queryKey: ["admin", "payments", "home"], queryFn: getPaymentsHome, enabled: Ready, staleTime: 60_000, retry: false });
  // 2026-10-18 (Birthdays): a line under the tiles on days with a birthday.
  const BirthdaysQuery = useQuery({ queryKey: ["admin", "birthdays", "today"], queryFn: getBirthdaysToday, enabled: Ready, staleTime: 5 * 60_000, retry: false });

  const PracticeAwaiting = useMemo(() => {
    if (!PracticeQuery.data) return null;
    return currentWorkRows(PracticeQuery.data as Record<string, any>[]).filter((Row) => Row.isActive !== false && isAwaitingApproval(Row)).length;
  }, [PracticeQuery.data]);

  if (!Ready) return null;

  // a figure, "…" while it loads, "—" if it could not load
  const Show = (Value: number | string | null | undefined, Loading: boolean) =>
    Value !== null && Value !== undefined ? Value : Loading ? "…" : "—";
  const Home = PaymentsQuery.data;

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-admin w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-admin math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-blue-400/16 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-violet-300/14 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="math-block-header">
                <Gauge size={14} />
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

        <section aria-labelledby="ad-today-title" className="math-card grid gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="ad-today-title" className="ad-section-title">Today</h2>
            <p className="ad-section-note">Each figure opens the page that deals with it.</p>
          </div>
          <div className="ad-today ad-today-4">
            <TodayTile
              Icon={<RotateCcw size={18} />}
              Label="Practice Re-Attempts To Approve"
              Value={Show(PracticeAwaiting, PracticeQuery.isLoading)}
              Note="Students who used every try"
              Tone={PracticeAwaiting ? "warn" : "calm"}
              onClick={() => Router.push("/admin/assignments?tab=awaiting-approval")}
            />
            <TodayTile
              Icon={<AlertTriangle size={18} />}
              Label="Assessment Re-Attempt Requests"
              Value={Show(ApprovalsQuery.data?.pending, ApprovalsQuery.isLoading)}
              Note="Waiting for your decision"
              Tone={ApprovalsQuery.data?.pending ? "warn" : "calm"}
              onClick={() => Router.push("/admin/assessments?tab=approvals")}
            />
            <TodayTile
              Icon={<Wallet size={18} />}
              Label="Fees Overdue"
              Value={Show(Home?.overdue?.display, PaymentsQuery.isLoading)}
              Note={Home ? (Home.studentsOverdue ? Plural(Home.studentsOverdue, "student", "students") : "Nobody is overdue") : undefined}
              Tone={Home?.studentsOverdue ? "alert" : "calm"}
              onClick={() => Router.push("/admin/payments/home")}
            />
            <TodayTile
              Icon={<IndianRupee size={18} />}
              Label="Received Today"
              Value={Show(Home?.todayCollected?.display, PaymentsQuery.isLoading)}
              Note={Home ? (Home.todayPaymentCount ? Plural(Home.todayPaymentCount, "payment", "payments") : "No payments yet") : undefined}
              onClick={() => Router.push("/admin/payments/home")}
            />
          </div>
          {BirthdaysQuery.data?.count ? (
            <button type="button" className="ad-bday-line" onClick={() => Router.push("/admin/birthdays")}>
              <span className="ad-bday-line-icon" aria-hidden="true"><Cake size={17} /></span>
              <span className="min-w-0">
                <span className="ad-bday-line-title">{Plural(BirthdaysQuery.data.count, "Birthday", "Birthdays")} Today</span>
                <span className="ad-bday-line-names">
                  {BirthdaysQuery.data.students.slice(0, 4).map((Item) => `${Item.name} (${Item.age})`).join(", ")}
                  {BirthdaysQuery.data.count > 4 ? ` and ${BirthdaysQuery.data.count - 4} more` : ""}
                </span>
              </span>
              <span className="ad-bday-line-open">Open Birthdays<ChevronRight size={16} /></span>
            </button>
          ) : null}
        </section>

        <section className="math-dashboard-priority-panel">
          <div>
            <p className="math-block-header">
              <ListOrdered size={14} />
              Operational Priority
            </p>
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
    <button type="button" className="ad-tile" data-tone={Tone} onClick={onClick} aria-label={`${Label}: ${Value}. Open`}>
      <span className="ad-tile-icon" aria-hidden="true">{Icon}</span>
      <span className="ad-tile-label">{Label}</span>
      <span className="ad-tile-value">{Value}</span>
      {Note ? <span className="ad-tile-note">{Note}</span> : null}
    </button>
  );
}

function QuickAccessCard({ Icon, Label, Note, onClick }: { Icon: ReactNode; Label: string; Note: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group math-dashboard-quick-card text-left">
      <span className="math-dashboard-quick-icon">{Icon}</span>
      <span className="block min-w-0 flex-1">
        <span className="block text-base font-black text-slate-950 dark:text-white">{Label}</span>
        <span className="ad-quick-note">{Note}</span>
      </span>
    </button>
  );
}
