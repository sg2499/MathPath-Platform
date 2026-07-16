"use client";

import { login, warmupAuthApi } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/api";
import { defaultRouteForRole, setActiveRole, setAuth } from "@/lib/auth";
import type { CurrentUser, UserRole } from "@/types/auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardPlus,
  Eye,
  EyeOff,
  GraduationCap,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";

type ThemeMode = "light" | "dark";
type LoginTab = "ADMIN" | "TEACHER" | "STUDENT";

const LOGIN_ROLE_STORAGE_KEY = "mathpath_login_role";
const LOGIN_IDENTIFIER_STORAGE_PREFIX = "mathpath_login_identifier";
const ValidLoginTabs: LoginTab[] = ["ADMIN", "TEACHER", "STUDENT"];

const PlatformTagline =
  "Visual Abacus Mastery for Speed, Accuracy, and School-Ready Confidence.";

const MATHPATH_WEBSITE_URL = "https://www.mathpath.in/website/index";

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
      "Manage curriculum, users, assignments, and performance from one secure control centre.",
    IdentifierLabel: "Admin Email / Phone",
    IdentifierPlaceholder: "Enter admin email or phone",
    ButtonText: "Login as Admin",
    Promise:
      "Institution-wide oversight of curriculum, users, assignments, and performance.",
    Gradient: "from-slate-950 via-indigo-700 to-fuchsia-500",
    AccentGlow: "bg-fuchsia-300/25",
    Icon: <ShieldCheck size={18} />,
    AcceptedRoles: ["ADMIN", "SUPER_ADMIN"],
    Features: [
      {
        Icon: <BookOpenCheck size={18} />,
        Title: "Curriculum Management",
        Desc: "Manage modules, levels, lessons, and practice structure.",
      },
      {
        Icon: <UsersRound size={18} />,
        Title: "User Administration",
        Desc: "Manage students, teachers, access, and onboarding.",
      },
      {
        Icon: <BarChart3 size={18} />,
        Title: "Readiness & Performance",
        Desc: "Track readiness, progress, and performance at a glance.",
      },
      {
        Icon: <ClipboardPlus size={18} />,
        Title: "Assignment Governance",
        Desc: "Create, review, and manage practice allocation.",
      },
    ],
  },
  TEACHER: {
    Eyebrow: "Teacher Workspace",
    Headline: "Guide Learners With Refined Focus.",
    Description:
      "Guide every learner through practice, readiness, and assessment with full visibility.",
    IdentifierLabel: "Teacher Email / Phone / Teacher Code",
    IdentifierPlaceholder: "Enter teacher login identifier",
    ButtonText: "Login as Teacher",
    Promise:
      "Assigned students, practice allocation, completion tracking, and readiness - all in view.",
    Gradient: "from-[#2B102D] via-[#6D2E5F] to-[#D89A76]",
    AccentGlow: "bg-[#E6B8A2]/30",
    Icon: <GraduationCap size={18} />,
    AcceptedRoles: ["TEACHER"],
    Features: [
      {
        Icon: <UsersRound size={18} />,
        Title: "Assigned Learners",
        Desc: "See your students and support each one with clear visibility.",
      },
      {
        Icon: <ClipboardPlus size={18} />,
        Title: "Practice & Assessment",
        Desc: "Assign practice sheets and assessments from one workspace.",
      },
      {
        Icon: <ShieldCheck size={18} />,
        Title: "Readiness Signals",
        Desc: "Track completion, progress, and assessment readiness.",
      },
      {
        Icon: <Target size={18} />,
        Title: "Practice Tracker",
        Desc: "Track practice progress, re-attempts, and learning patterns.",
      },
    ],
  },
  STUDENT: {
    Eyebrow: "Student Learning Workspace",
    Headline: "Practice, Shine, And Grow.",
    Description:
      "Practice, track progress, and review results in one confidence-building space.",
    IdentifierLabel: "Student Email / Phone / Student Code",
    IdentifierPlaceholder: "Enter student code, email, or phone",
    ButtonText: "Login as Student",
    Promise:
      "Assigned work, assessments, progress, and results - all in one place.",
    Gradient: "from-rose-950 via-orange-500 to-pink-400",
    AccentGlow: "bg-amber-200/30",
    Icon: <UserRound size={18} />,
    AcceptedRoles: ["STUDENT"],
    Features: [
      {
        Icon: <BookOpenCheck size={18} />,
        Title: "Assigned Learning",
        Desc: "Everything assigned to you, in one place.",
      },
      {
        Icon: <BarChart3 size={18} />,
        Title: "Progress Tracking",
        Desc: "Follow your level progress and growth over time.",
      },
      {
        Icon: <Target size={18} />,
        Title: "Result Review",
        Desc: "Review attempts and learn from every result.",
      },
      {
        Icon: <Sparkles size={18} />,
        Title: "Confidence Growth",
        Desc: "Build speed, accuracy, and stronger mathematical thinking.",
      },
    ],
  },
};

function ApplyTheme(Mode: ThemeMode, MarkUserChoice = false) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", Mode === "dark");
  localStorage.setItem("mathpath_theme", Mode);
  if (MarkUserChoice) {
    localStorage.setItem("mathpath_theme_user_set", "true");
  }
}

function NormalizeLoginTab(Value?: string | null): LoginTab | null {
  const NormalizedValue = String(Value || "").trim().toUpperCase();
  if (ValidLoginTabs.includes(NormalizedValue as LoginTab)) {
    return NormalizedValue as LoginTab;
  }
  return null;
}

function ResolveInitialLoginTab(InitialRole?: string | string[] | null): LoginTab {
  const InitialRoleValue = Array.isArray(InitialRole) ? InitialRole[0] : InitialRole;
  const ServerResolvedRole = NormalizeLoginTab(InitialRoleValue);

  if (typeof window === "undefined") return ServerResolvedRole || "STUDENT";

  const UrlRole = NormalizeLoginTab(new URLSearchParams(window.location.search).get("role"));
  if (UrlRole) return UrlRole;

  const SavedLoginRole = NormalizeLoginTab(localStorage.getItem(LOGIN_ROLE_STORAGE_KEY));
  if (SavedLoginRole) return SavedLoginRole;

  return "STUDENT";
}

function SyncVisibleLoginTab(Tab: LoginTab, ReplaceUrl = true) {
  if (typeof window === "undefined") return;

  if (!ReplaceUrl) return;

  const UrlValue = new URL(window.location.href);
  UrlValue.searchParams.set("role", Tab.toLowerCase());
  window.history.replaceState(null, "", `${UrlValue.pathname}${UrlValue.search}${UrlValue.hash}`);
}

function RememberSuccessfulLoginTab(Tab: LoginTab) {
  if (typeof window === "undefined") return;

  localStorage.setItem(LOGIN_ROLE_STORAGE_KEY, Tab);
  setActiveRole(Tab);
}

function loginIdentifierKey(Tab: LoginTab) {
  return `${LOGIN_IDENTIFIER_STORAGE_PREFIX}_${Tab.toLowerCase()}`;
}

function NormalizeIdentifierForStorage(Value: string): string {
  return Value.trim().slice(0, 160);
}

function ReadRememberedLoginIdentifier(Tab: LoginTab): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(loginIdentifierKey(Tab)) || "";
}

function RememberLoginIdentifier(Tab: LoginTab, IdentifierValue: string): void {
  if (typeof window === "undefined") return;
  const CleanIdentifier = NormalizeIdentifierForStorage(IdentifierValue);
  if (!CleanIdentifier) return;
  localStorage.setItem(loginIdentifierKey(Tab), CleanIdentifier);
}

function AutoCompleteSection(Tab: LoginTab) {
  return `section-mathpath-${Tab.toLowerCase()}`;
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

export default function LoginClient({
  InitialRole,
}: {
  InitialRole?: string | null;
}) {
  const Router = useRouter();
  const [ActiveTab, SetActiveTab] = useState<LoginTab>(() => ResolveInitialLoginTab(InitialRole));
  const [LoginReady, SetLoginReady] = useState(true);
  const [ConnectionStatus, SetConnectionStatus] = useState<"preparing" | "ready" | "working">("preparing");
  const [Identifier, SetIdentifier] = useState("");
  const [Password, SetPassword] = useState("");
  const [ShowPassword, SetShowPassword] = useState(false);
  const [Error, SetError] = useState("");
  const [Loading, SetLoading] = useState(false);
  const [Theme, SetTheme] = useState<ThemeMode>("light");

  const Active = RoleContent[ActiveTab];
  const OrderedTabs = useMemo<LoginTab[]>(() => ["ADMIN", "TEACHER", "STUDENT"], []);
  const ThemeLabel = Theme === "dark" ? "Light" : "Dark";
  const ThemeTooltip =
    Theme === "dark" ? "Switch To Light Theme" : "Switch To Dark Theme";

  useEffect(() => {
    let IsMounted = true;
    SyncVisibleLoginTab(ActiveTab);
    SetIdentifier(ReadRememberedLoginIdentifier(ActiveTab));
    SetLoginReady(true);
    SetConnectionStatus("preparing");

    void warmupAuthApi().then((IsReady) => {
      if (!IsMounted) return;
      SetConnectionStatus(IsReady ? "ready" : "working");
    });

    Router.prefetch("/admin/dashboard");
    Router.prefetch("/teacher/dashboard");
    Router.prefetch("/student/dashboard");

    return () => {
      IsMounted = false;
    };
    // Runs once after the server-provided URL role has already been resolved, so refresh does not visibly fall back to Student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const Saved =
      typeof window !== "undefined"
        ? (localStorage.getItem("mathpath_theme") as ThemeMode | null)
        : null;
    const UserSelectedTheme =
      typeof window !== "undefined"
        ? localStorage.getItem("mathpath_theme_user_set") === "true"
        : false;

    const NextTheme =
      UserSelectedTheme && (Saved === "dark" || Saved === "light") ? Saved : "light";
    SetTheme(NextTheme);
    ApplyTheme(NextTheme);
  }, []);

  function ToggleTheme() {
    const NextTheme = Theme === "dark" ? "light" : "dark";
    SetTheme(NextTheme);
    ApplyTheme(NextTheme, true);
  }

  function ChangeTab(Tab: LoginTab) {
    SetActiveTab(Tab);
    SyncVisibleLoginTab(Tab);
    SetError("");
    SetIdentifier(ReadRememberedLoginIdentifier(Tab));
    SetPassword("");
    SetShowPassword(false);
  }

  async function HandleSubmit(Event: React.FormEvent) {
    Event.preventDefault();
    if (!LoginReady || Loading) return;

    const CleanIdentifier = Identifier.trim();
    const CleanPassword = Password;

    if (!CleanIdentifier || !CleanPassword) {
      SetError("Please enter your login credentials.");
      return;
    }

    SetError("");
    SetLoading(true);
    SetConnectionStatus("working");

    try {
      const Response = await login(CleanIdentifier, CleanPassword);

      if (!Active.AcceptedRoles.includes(Response.user.role)) {
        SetError(RoleMismatchMessage(Response.user));
        return;
      }

      setAuth(Response.accessToken, Response.user);
      RememberSuccessfulLoginTab(ActiveTab);
      RememberLoginIdentifier(ActiveTab, CleanIdentifier);
      SetConnectionStatus("ready");

      const TargetRoute = defaultRouteForRole(Response.user.role);
      Router.prefetch(TargetRoute);
      Router.replace(TargetRoute);
      Router.refresh();

      if (typeof window !== "undefined") {
        if (window.location.pathname !== TargetRoute) {
          window.location.assign(TargetRoute);
        }
      }
    } catch (Err) {
      SetConnectionStatus("working");
      SetError(apiErrorMessage(Err));
      void warmupAuthApi();
    } finally {
      SetLoading(false);
    }
  }

  return (
    <main
      className={`math-login-shell math-login-role-${ActiveTab.toLowerCase()} relative flex min-h-[100svh] items-center justify-center px-4 py-4 text-slate-950 sm:px-5 sm:py-5 xl:px-6 xl:py-6`}
      data-testid="login-shell"
    >
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Abacus-rail motif: thin horizontal rods with bead dots, tying the backdrop to the
            "Visual Abacus Mastery" brand promise instead of a generic decorative pattern. */}
        <div className="absolute inset-0 math-grid-dots opacity-60 dark:opacity-40" />
        <div className="math-login-aura math-login-aura-one" />
        <div className="math-login-aura math-login-aura-two" />
        <div className="math-login-orbit math-login-orbit-bead left-[6%] top-[14%] hidden lg:block" />
        <div className="math-login-orbit math-login-orbit-bead bottom-[10%] right-[8%] hidden lg:block" />
      </div>

      <div
        className="math-login-frame relative z-10 mx-auto grid w-full max-w-[1820px] lg:h-auto lg:min-h-[720px] lg:grid-cols-[1.04fr_0.96fr] lg:overflow-hidden lg:rounded-[2.5rem] lg:bg-white lg:shadow-2xl lg:dark:bg-slate-950"
        data-testid="login-frame"
      >
        <section
          className={`math-login-story relative hidden h-full min-h-0 overflow-hidden bg-gradient-to-br ${Active.Gradient} text-white transition-all duration-500 lg:flex`}
          data-testid="login-story-panel"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.24),transparent_25%),radial-gradient(circle_at_88%_82%,rgba(255,255,255,0.16),transparent_28%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.10),transparent_42%,rgba(255,255,255,0.08))]" />
          <div className={`absolute -right-24 top-24 h-72 w-72 rounded-full ${Active.AccentGlow} blur-3xl`} />
          <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-white/14 blur-3xl" />

          <div className="math-login-story-content relative z-10 flex h-full w-full min-h-0 flex-col justify-start px-8 py-6 xl:px-11 xl:py-7 2xl:px-14 2xl:py-8">
            <div className="math-login-brand-zone shrink-0">
              <a
                href={MATHPATH_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="math-login-logo-card flex w-fit max-w-2xl items-center gap-5 rounded-[26px] px-4.5 py-3.5 transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Open MathPath website"
              >
                <div className="math-login-logo-mark rounded-2xl bg-white px-4 py-3 shadow-md">
                  <Image
                    src="/mathpath-logo.png"
                    alt="MathPath logo"
                    width={210}
                    height={101}
                    className="h-[5.6rem] w-auto object-contain"
                    priority
                  />
                </div>
                <div>
                  <p className="text-2xl font-black sm:text-[1.7rem]">MathPath</p>
                  <p className="max-w-md text-sm font-semibold leading-5 text-white/90 sm:text-[0.95rem]">
                    {PlatformTagline}
                  </p>
                </div>
              </a>
            </div>

            <div className="math-login-story-copy shrink-0">
              <div className="flex">
                <div className="math-login-eyebrow inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.18em] text-white/94">
                  {Active.Icon}
                  {Active.Eyebrow}
                </div>
              </div>

              <h1
                className="math-login-story-headline mt-4 max-w-3xl text-[2.25rem] font-extrabold leading-[1.02] tracking-[-0.035em] xl:text-[2.95rem] 2xl:text-[3.35rem]"
                style={{
                  fontFamily:
                    '"Inter", "Manrope", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                {Active.Headline}
              </h1>

              <p className="math-login-story-description mt-2.5 max-w-3xl text-sm leading-6 text-white/91 xl:text-[0.98rem] xl:leading-7">
                {Active.Description}
              </p>
            </div>

            <div className="math-login-feature-grid grid shrink-0 gap-4 sm:grid-cols-2">
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

        <section
          className="math-login-form-zone relative flex h-full min-h-0 items-center px-5 py-6 sm:px-8 lg:px-10 xl:px-12 2xl:px-14"
          data-testid="login-form-zone"
          aria-labelledby="mathpath-login-heading"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0.15))] dark:bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.10),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.28),rgba(2,6,23,0.58))]" />

          <div className="relative z-10 mx-auto w-full max-w-[34.5rem]">
            <div className="math-login-mobile-header mb-3 flex items-center justify-between gap-3">
              <a
                href={MATHPATH_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="math-login-mobile-brand flex items-center gap-3 rounded-2xl transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/70 lg:hidden"
                aria-label="Open MathPath website"
              >
                <div className="rounded-2xl bg-white px-3 py-2.5 shadow-md dark:bg-slate-900">
                  <Image
                    src="/mathpath-logo.png"
                    alt="MathPath logo"
                    width={140}
                    height={67}
                    className="h-11 w-auto object-contain"
                    priority
                  />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-950 dark:text-white">MathPath</p>
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Ace With Abacus</p>
                </div>
              </a>
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

            <div
              className="math-login-tabs relative mb-3 grid grid-cols-3 gap-2 rounded-[24px] p-1.5"
              role="tablist"
              aria-label="Choose login role"
              data-testid="login-role-tabs"
              style={{ "--tab-index": OrderedTabs.indexOf(ActiveTab) } as React.CSSProperties}
            >
              <div className="math-login-tab-indicator" aria-hidden="true" />
              {OrderedTabs.map((Tab) => {
                const TabData = RoleContent[Tab];
                const ActiveState = ActiveTab === Tab;
                return (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => ChangeTab(Tab)}
                    role="tab"
                    id={`mathpath-login-tab-${Tab.toLowerCase()}`}
                    aria-selected={ActiveState}
                    aria-controls="mathpath-login-panel"
                    className={`math-login-tab math-login-tab-${Tab.toLowerCase()} relative z-[1] flex min-h-11 items-center justify-center gap-2 rounded-[18px] px-3 py-2.5 text-sm font-black transition-colors duration-200 ${
                      ActiveState
                        ? "text-white"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <span className="math-login-tab-icon" aria-hidden="true">{TabData.Icon}</span>
                    <span className="math-login-tab-label">{RoleLabel(Tab)}</span>
                  </button>
                );
              })}
            </div>

            <h2
              id="mathpath-login-heading"
              className="math-login-form-heading mt-1 text-4xl font-black leading-tight tracking-[-0.055em] text-slate-950 dark:text-white sm:text-[2.75rem] 2xl:text-5xl"
            >
              {RoleLabel(ActiveTab)} Login
            </h2>

            <p className="math-login-form-subtitle mt-1.5 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
              {Active.Promise}
            </p>

            <form
              id="mathpath-login-panel"
              role="tabpanel"
              aria-labelledby={`mathpath-login-tab-${ActiveTab.toLowerCase()}`}
              className="math-login-card mt-3.5 space-y-3"
              onSubmit={HandleSubmit}
              data-testid="student-login-form"
            >
              <div>
                <label className="math-label" htmlFor="mathpath-login-identifier">{Active.IdentifierLabel}</label>
                <input
                  id="mathpath-login-identifier"
                  className="math-input mt-2 min-h-12"
                  type="text"
                  value={Identifier}
                  onChange={(Event) => SetIdentifier(Event.target.value)}
                  placeholder={Active.IdentifierPlaceholder}
                  autoComplete={`${AutoCompleteSection(ActiveTab)} username`}
                  name={`mathpath-${ActiveTab.toLowerCase()}-identifier`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div>
                <label className="math-label" htmlFor="mathpath-login-password">Password</label>
                <div className="relative mt-2">
                  <input
                    id="mathpath-login-password"
                    className="math-input min-h-12 w-full pr-12"
                    type={ShowPassword ? "text" : "password"}
                    value={Password}
                    onChange={(Event) => SetPassword(Event.target.value)}
                    placeholder="Enter your password"
                    autoComplete={`${AutoCompleteSection(ActiveTab)} current-password`}
                    name={`mathpath-${ActiveTab.toLowerCase()}-password`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => SetShowPassword(!ShowPassword)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={ShowPassword ? "Hide password" : "Show password"}
                  >
                    {ShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {Error ? (
                <div role="alert" aria-live="polite" className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {Error}
                </div>
              ) : null}

              <button type="submit" className="math-button-primary min-h-12 w-full" disabled={Loading || !LoginReady}>
                {Loading ? "Logging In..." : Active.ButtonText}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                  Forgot Password?{" "}
                  <span className="text-slate-700 dark:text-slate-300">
                    {ActiveTab === "STUDENT"
                      ? "Contact your teacher to reset it."
                      : "Contact your platform administrator."}
                  </span>
                </p>
              </div>
            </form>

            <div
              className={`math-login-status math-login-status-${ConnectionStatus} mt-3 flex items-center justify-center gap-2 rounded-full py-2 text-[11px] font-bold uppercase tracking-[0.14em]`}
              role="status"
              aria-live="polite"
            >
              <span className="math-login-status-dot" aria-hidden="true" />
              {ConnectionStatus === "ready"
                ? "Secure Connection Ready"
                : ConnectionStatus === "working"
                ? "Connecting To MathPath…"
                : "Preparing Secure Sign-In…"}
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
