"use client";

import { login } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/api";
import { defaultRouteForRole, setAuth } from "@/lib/auth";
import type { CurrentUser, UserRole } from "@/types/auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardPlus,
  GraduationCap,
  LayoutDashboard,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";

type ThemeMode = "light" | "dark";
type LoginTab = "ADMIN" | "TEACHER" | "STUDENT";

const PlatformTagline =
  "Visual Abacus Mastery for Speed, Accuracy, and School-Ready Confidence.";

const RoleContent: Record<
  LoginTab,
  {
    Eyebrow: string;
    Headline: string;
    Description: string;
    IdentifierLabel: string;
    IdentifierPlaceholder: string;
    ButtonText: string;
    Promise: string;
    Gradient: string;
    AccentGlow: string;
    Icon: ReactNode;
    Features: Array<{ Icon: ReactNode; Title: string; Desc: string }>;
    AcceptedRoles: UserRole[];
  }
> = {
  ADMIN: {
    Eyebrow: "Admin Control Centre",
    Headline: "Lead The MathPath Learning System.",
    Description:
      "Oversee curriculum, users, assignments, readiness, and performance from one secure control workspace built for structured academic operations at scale.",
    IdentifierLabel: "Admin Email / Phone",
    IdentifierPlaceholder: "Enter admin email or phone",
    ButtonText: "Login as Admin",
    Promise:
      "Institution-level access for curriculum, users, assignments, readiness, and performance oversight.",
    Gradient: "from-slate-950 via-indigo-700 to-fuchsia-500",
    AccentGlow: "bg-fuchsia-300/25",
    Icon: <ShieldCheck size={18} />,
    AcceptedRoles: ["ADMIN", "SUPER_ADMIN"],
    Features: [
      {
        Icon: <BookOpenCheck size={18} />,
        Title: "Curriculum Management",
        Desc: "Manage approved modules, levels, lessons, and DPS structure.",
      },
      {
        Icon: <UsersRound size={18} />,
        Title: "User Administration",
        Desc: "Maintain students, teachers, access, levels, and onboarding records.",
      },
      {
        Icon: <BarChart3 size={18} />,
        Title: "Readiness & Performance",
        Desc: "Monitor readiness, progress, and institution-wide performance signals.",
      },
      {
        Icon: <ClipboardPlus size={18} />,
        Title: "Assignment Governance",
        Desc: "Create, review, and oversee practice allocation with control.",
      },
    ],
  },
  TEACHER: {
    Eyebrow: "Teacher Workspace",
    Headline: "Guide Learners With Refined Focus.",
    Description:
      "Guide every learner through practice, readiness, assessment, and focused review with elegant classroom visibility.",
    IdentifierLabel: "Teacher Email / Phone / Teacher Code",
    IdentifierPlaceholder: "Enter teacher login identifier",
    ButtonText: "Login as Teacher",
    Promise:
      "Teacher access for assigned students, DPS allocation, completion tracking, readiness signals, and focused review.",
    Gradient: "from-[#2B102D] via-[#6D2E5F] to-[#D89A76]",
    AccentGlow: "bg-[#E6B8A2]/30",
    Icon: <GraduationCap size={18} />,
    AcceptedRoles: ["TEACHER"],
    Features: [
      {
        Icon: <UsersRound size={18} />,
        Title: "Assigned Learners",
        Desc: "View your students and support each learner with structured visibility.",
      },
      {
        Icon: <ClipboardPlus size={18} />,
        Title: "Practice & Assessment",
        Desc: "Assign approved DPS sheets and eligible assessments from one workspace.",
      },
      {
        Icon: <ShieldCheck size={18} />,
        Title: "Readiness Signals",
        Desc: "Track completion, benchmark progress, and assessment readiness.",
      },
      {
        Icon: <Target size={18} />,
        Title: "Practice Tracker",
        Desc: "Track practice progress, re-attempt needs, and learning patterns clearly.",
      },
    ],
  },
  STUDENT: {
    Eyebrow: "Student Learning Workspace",
    Headline: "Practice, Shine, And Grow.",
    Description:
      "Open assigned practice, assessments, progress, and results in one joyful learning space built for confidence.",
    IdentifierLabel: "Student Email / Phone / Student Code",
    IdentifierPlaceholder: "Enter student code, email, or phone",
    ButtonText: "Login as Student",
    Promise:
      "Student access for assigned work, assessments, readiness, results, progress review, and confident learning growth.",
    Gradient: "from-rose-950 via-orange-500 to-pink-400",
    AccentGlow: "bg-amber-200/30",
    Icon: <UserRound size={18} />,
    AcceptedRoles: ["STUDENT"],
    Features: [
      {
        Icon: <BookOpenCheck size={18} />,
        Title: "Assigned Learning",
        Desc: "Access practice, assessments, and guided learning tasks in one place.",
      },
      {
        Icon: <BarChart3 size={18} />,
        Title: "Progress Tracking",
        Desc: "Follow level progress, completion date, and confidence growth.",
      },
      {
        Icon: <Target size={18} />,
        Title: "Result Review",
        Desc: "Review attempts, understand performance, and learn from every result.",
      },
      {
        Icon: <Sparkles size={18} />,
        Title: "Confidence Growth",
        Desc: "Build speed, accuracy, and stronger mathematical thinking.",
      },
    ],
  },
};

function ApplyTheme(Mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", Mode === "dark");
  localStorage.setItem("mathpath_theme", Mode);
}

function RoleLabel(Role: UserRole | LoginTab) {
  if (Role === "SUPER_ADMIN") return "Admin";
  if (Role === "ADMIN") return "Admin";
  if (Role === "TEACHER") return "Teacher";
  if (Role === "STUDENT") return "Student";
  return Role;
}

function RoleMismatchMessage(User: CurrentUser) {
  return `These credentials belong to a ${RoleLabel(
    User.role
  )} account. Please use the ${RoleLabel(User.role)} login tab.`;
}

export default function LoginPage() {
  const Router = useRouter();
  const [ActiveTab, SetActiveTab] = useState<LoginTab>("STUDENT");
  const [Identifier, SetIdentifier] = useState("");
  const [Password, SetPassword] = useState("");
  const [Error, SetError] = useState("");
  const [Loading, SetLoading] = useState(false);
  const [Theme, SetTheme] = useState<ThemeMode>("light");

  const Active = RoleContent[ActiveTab];
  const OrderedTabs = useMemo<LoginTab[]>(() => ["ADMIN", "TEACHER", "STUDENT"], []);
  const ThemeLabel = Theme === "dark" ? "Light" : "Dark";
  const ThemeTooltip =
    Theme === "dark" ? "Switch To Light Theme" : "Switch To Dark Theme";

  useEffect(() => {
    const Saved =
      typeof window !== "undefined"
        ? (localStorage.getItem("mathpath_theme") as ThemeMode | null)
        : null;

    const Preferred =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

    const NextTheme = Saved === "dark" || Saved === "light" ? Saved : Preferred;
    SetTheme(NextTheme);
    ApplyTheme(NextTheme);
  }, []);

  function ToggleTheme() {
    const NextTheme = Theme === "dark" ? "light" : "dark";
    SetTheme(NextTheme);
    ApplyTheme(NextTheme);
  }

  function ChangeTab(Tab: LoginTab) {
    SetActiveTab(Tab);
    SetError("");
    SetIdentifier("");
    SetPassword("");
  }

  async function HandleSubmit(Event: React.FormEvent) {
    Event.preventDefault();
    SetError("");
    SetLoading(true);

    try {
      const Response = await login(Identifier, Password);

      if (!Active.AcceptedRoles.includes(Response.user.role)) {
        SetError(RoleMismatchMessage(Response.user));
        return;
      }

      setAuth(Response.accessToken, Response.user);
      Router.push(defaultRouteForRole(Response.user.role));
    } catch (Err) {
      SetError(apiErrorMessage(Err));
    } finally {
      SetLoading(false);
    }
  }

  return (
    <main className={`math-login-shell math-login-role-${ActiveTab.toLowerCase()} relative h-screen overflow-hidden px-2 py-2 text-slate-950 sm:px-3 sm:py-3 xl:px-4 xl:py-4`}>
      <div className="absolute inset-0 math-grid-dots opacity-55 dark:opacity-35" />
      <div className="math-login-aura math-login-aura-one" />
      <div className="math-login-aura math-login-aura-two" />
      <div className="math-login-aura math-login-aura-three" />
      <div className="math-login-orbit left-[6%] top-[14%] hidden lg:block" />
      <div className="math-login-orbit bottom-[10%] right-[8%] hidden lg:block" />

      <div className="math-login-frame relative z-10 mx-auto grid h-[calc(100vh-1rem)] w-full max-w-[1820px] overflow-hidden sm:h-[calc(100vh-1.5rem)] xl:h-[calc(100vh-2rem)] lg:grid-cols-[1.04fr_0.96fr]">
        <section
          className={`math-login-story relative hidden min-h-0 overflow-hidden bg-gradient-to-br ${Active.Gradient} text-white transition-all duration-500 lg:flex`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.24),transparent_25%),radial-gradient(circle_at_88%_82%,rgba(255,255,255,0.16),transparent_28%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.10),transparent_42%,rgba(255,255,255,0.08))]" />
          <div className={`absolute -right-24 top-24 h-72 w-72 rounded-full ${Active.AccentGlow} blur-3xl`} />
          <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-white/14 blur-3xl" />

          <div className="relative z-10 flex h-full w-full min-h-0 flex-col gap-6 px-8 py-7 xl:px-12 xl:py-8 2xl:px-16 2xl:py-9">
            <div>
              <div className="math-login-logo-card flex w-fit max-w-xl items-center gap-3 rounded-[24px] px-3.5 py-3">
                <div className="rounded-2xl bg-white px-2.5 py-2 shadow-md">
                  <Image
                    src="/mathpath-logo.png"
                    alt="MathPath logo"
                    width={118}
                    height={54}
                    className="h-10 w-auto object-contain"
                    priority
                  />
                </div>
                <div>
                  <p className="text-xl font-black sm:text-2xl">MathPath</p>
                  <p className="max-w-sm text-xs leading-5 text-white/88 sm:text-sm">
                    {PlatformTagline}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex">
                <div className="math-login-eyebrow inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.18em] text-white/94">
                  {Active.Icon}
                  {Active.Eyebrow}
                </div>
              </div>

              <h1
                className="mt-5 max-w-3xl text-[2.55rem] font-extrabold leading-[1.03] tracking-[-0.035em] xl:text-[3.5rem] 2xl:text-[4rem]"
                style={{
                  fontFamily:
                    '"Inter", "Manrope", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                {Active.Headline}
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-white/91 xl:text-base xl:leading-7">
                {Active.Description}
              </p>
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:mt-1 xl:gap-4">
              {Active.Features.map((FeatureItem) => (
                <Feature
                  key={FeatureItem.Title}
                  Icon={FeatureItem.Icon}
                  Title={FeatureItem.Title}
                  Desc={FeatureItem.Desc}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="math-login-form-zone relative flex h-full min-h-0 items-center overflow-hidden px-5 py-5 sm:px-8 lg:px-10 xl:px-14 2xl:px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0.15))] dark:bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.10),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.28),rgba(2,6,23,0.58))]" />

          <div className="relative z-10 mx-auto w-full max-w-[37rem]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="math-login-mobile-brand flex items-center gap-3 lg:hidden">
                <div className="rounded-2xl bg-white px-2.5 py-2 shadow-md dark:bg-slate-900">
                  <Image
                    src="/mathpath-logo.png"
                    alt="MathPath logo"
                    width={102}
                    height={48}
                    className="h-9 w-auto object-contain"
                    priority
                  />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-950 dark:text-white">MathPath</p>
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Ace With Abacus</p>
                </div>
              </div>
              <button
                className="math-login-theme-toggle inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em]"
                onClick={ToggleTheme}
                aria-label={ThemeTooltip}
                title={ThemeTooltip}
                type="button"
              >
                {Theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                <span>{ThemeLabel}</span>
              </button>
            </div>

            <div className="math-login-tabs mb-5 grid grid-cols-3 gap-2 rounded-[24px] p-1.5">
              {OrderedTabs.map((Tab) => {
                const TabData = RoleContent[Tab];
                const ActiveState = ActiveTab === Tab;
                return (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => ChangeTab(Tab)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-[18px] px-3 py-2.5 text-sm font-black transition duration-200 ${
                      ActiveState
                        ? "math-login-tab-active text-white shadow-xl shadow-slate-900/20 dark:text-slate-950"
                        : "text-slate-600 hover:bg-white/82 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
                    }`}
                  >
                    {TabData.Icon}
                    <span className="hidden sm:inline">{RoleLabel(Tab)}</span>
                    <span className="sm:hidden">{RoleLabel(Tab).slice(0, 1)}</span>
                  </button>
                );
              })}
            </div>

            <div className="math-login-welcome-chip inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.18em]">
              <Zap size={14} />
              Welcome Back
            </div>

            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.055em] text-slate-950 dark:text-white sm:text-[2.75rem] 2xl:text-5xl">
              {RoleLabel(ActiveTab)} Login
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
              {Active.Promise}
            </p>

            <form className="math-login-card mt-5 space-y-4" onSubmit={HandleSubmit}>
              <div>
                <label className="math-label">{Active.IdentifierLabel}</label>
                <input
                  className="math-input mt-2 min-h-12"
                  value={Identifier}
                  onChange={(Event) => SetIdentifier(Event.target.value)}
                  placeholder={Active.IdentifierPlaceholder}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label className="math-label">Password</label>
                <input
                  className="math-input mt-2 min-h-12"
                  type="password"
                  value={Password}
                  onChange={(Event) => SetPassword(Event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {Error ? (
                <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {Error}
                </div>
              ) : null}

              <button className="math-button-primary min-h-12 w-full" disabled={Loading}>
                {Loading ? "Logging in..." : Active.ButtonText}
              </button>
            </form>

            <div className="math-login-promise mt-5 rounded-[22px] p-3.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <span className="font-black text-slate-950 dark:text-white">
                MathPath Promise:
              </span>{" "}
              Speed, Accuracy, Confidence, and Joyful Mathematical Thinking.
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniCard Icon={<LayoutDashboard size={16} />} Label="Role-Based" />
              <MiniCard Icon={<ShieldCheck size={16} />} Label="Secure Access" />
              <MiniCard Icon={<Sparkles size={16} />} Label="Premium Flow" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({
  Icon,
  Title,
  Desc,
}: {
  Icon: ReactNode;
  Title: string;
  Desc: string;
}) {
  return (
    <div className="math-login-feature rounded-[24px] p-4 transition duration-200 hover:-translate-y-0.5">
      <div className="inline-flex rounded-2xl bg-white/13 p-2">{Icon}</div>
      <p className="mt-2.5 text-base font-black leading-5 xl:text-lg xl:leading-6">{Title}</p>
      <p className="mt-1.5 text-xs leading-5 text-white/84 xl:text-sm">{Desc}</p>
    </div>
  );
}

function MiniCard({ Icon, Label }: { Icon: ReactNode; Label: string }) {
  return (
    <div className="math-login-mini-card flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
      {Icon}
      {Label}
    </div>
  );
}
