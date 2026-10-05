"use client";

import { login, verifyTwoFactorLogin, warmupAuthApi } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/api";
import { defaultRouteForRole, setActiveRole, setSession } from "@/lib/auth";
import { triggerLoginWelcome } from "@/lib/utils/particles";
import { isTwoFactorChallenge } from "@/types/auth";
import type { CurrentUser, UserRole } from "@/types/auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, Eye, EyeOff, GraduationCap, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import LoginStage from "./LoginStage";
import type { LoginStageHandle } from "./LoginStage";
import type { LoginRole } from "./_stage/shared";

type ThemeMode = "light" | "dark";
type LoginTab = "ADMIN" | "TEACHER" | "STUDENT";

const LOGIN_ROLE_STORAGE_KEY = "mathpath_login_role";
const LOGIN_IDENTIFIER_STORAGE_PREFIX = "mathpath_login_identifier";
const ValidLoginTabs: LoginTab[] = ["ADMIN", "TEACHER", "STUDENT"];

const MATHPATH_WEBSITE_URL = "https://www.mathpath.in/website/index";
const ZETTA_METRICS_WEBSITE_URL = "https://www.zetta-metrics.com";

const RoleContent: Record<
  LoginTab,
  {
    Headline: string;
    Description: string;
    IdentifierLabel: string;
    IdentifierPlaceholder: string;
    ButtonText: string;
    ConfettiColors: string[];
    Icon: ReactNode;
    AcceptedRoles: UserRole[];
  }
> = {
  ADMIN: {
    Headline: "Lead The MathPath Learning System.",
    Description:
      "Manage curriculum, users, assignments, and performance from one secure control centre.",
    IdentifierLabel: "Admin Email / Phone",
    IdentifierPlaceholder: "Enter admin email or phone",
    ButtonText: "Login as Admin",
    ConfettiColors: ["#2563eb", "#c026d3", "#22d3ee", "#f8fafc"],
    Icon: <ShieldCheck size={17} />,
    AcceptedRoles: ["ADMIN", "SUPER_ADMIN"],
  },
  TEACHER: {
    Headline: "Guide Learners With Refined Focus.",
    Description:
      "Guide every learner through practice, readiness, and assessment with full visibility.",
    IdentifierLabel: "Teacher Email / Phone / Teacher Code",
    IdentifierPlaceholder: "Enter teacher login identifier",
    ButtonText: "Login as Teacher",
    ConfettiColors: ["#6D2E5F", "#B76E79", "#E6B8A2", "#fdf2f8"],
    Icon: <GraduationCap size={17} />,
    AcceptedRoles: ["TEACHER"],
  },
  STUDENT: {
    Headline: "Practice, Shine, And Grow.",
    Description:
      "Practice, track progress, and review results in one confidence-building space.",
    IdentifierLabel: "Student Email / Phone / Student Code",
    IdentifierPlaceholder: "Enter student code, email, or phone",
    ButtonText: "Login as Student",
    ConfettiColors: ["#f97316", "#fb7185", "#facc15", "#fff7ed"],
    Icon: <UserRound size={17} />,
    AcceptedRoles: ["STUDENT"],
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

// Cross-fades the whole page in one step when the theme changes, where the browser supports it.
// Apply always runs exactly once: straight away if there is no support, and on a short timer as a
// backstop so the switch can never be left waiting on a frame.
function RunThemeTransition(Apply: () => void) {
  const TransitionDocument = document as Document & { startViewTransition?: (Callback: () => void) => unknown };
  const ReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let Applied = false;
  const ApplyOnce = () => {
    if (Applied) return;
    Applied = true;
    Apply();
  };

  if (typeof TransitionDocument.startViewTransition === "function" && !ReducedMotion && !document.hidden) {
    try {
      TransitionDocument.startViewTransition(ApplyOnce);
      window.setTimeout(ApplyOnce, 450);
      return;
    } catch {
      // Fall through to the plain switch below.
    }
  }

  ApplyOnce();
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

  // Deliberately does NOT read window.location.search or localStorage here.
  // This seeds both the server-rendered markup and the very first client
  // render -- the exact pass React diffs against during hydration -- so it
  // has to be 100% deterministic from server-available data alone. A saved
  // localStorage role (or a URL role Next didn't pass through as InitialRole
  // for some reason) would make the client's first render disagree with the
  // server's and throw React error #418. Any such correction happens after
  // mount instead, in the effect below, exactly like the theme correction
  // already does a few lines down.
  return ServerResolvedRole || "STUDENT";
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
  // Two-factor challenge: set once the password step succeeds but the
  // account has 2FA enabled. While this is non-null, the form below renders
  // a code-entry step instead of the identifier/password fields.
  const [TwoFactorChallengeToken, SetTwoFactorChallengeToken] = useState<string | null>(null);
  const [TwoFactorCode, SetTwoFactorCode] = useState("");

  const StageRef = useRef<LoginStageHandle>(null);
  const FormShellRef = useRef<HTMLDivElement>(null);

  const Active = RoleContent[ActiveTab];
  const StageRole = ActiveTab.toLowerCase() as LoginRole;
  const StudentConfettiColors = RoleContent.STUDENT.ConfettiColors;
  const CelebrateChallenge = useCallback(() => triggerLoginWelcome(StudentConfettiColors), [StudentConfettiColors]);
  const OrderedTabs = useMemo<LoginTab[]>(() => ["ADMIN", "TEACHER", "STUDENT"], []);
  const ThemeLabel = Theme === "dark" ? "Light" : "Dark";
  const ThemeTooltip =
    Theme === "dark" ? "Switch To Light Theme" : "Switch To Dark Theme";

  useEffect(() => {
    let IsMounted = true;

    // Now that we're safely past hydration, correct the active tab using
    // URL/localStorage data that only exists in the browser (ResolveInitialLoginTab
    // deliberately ignored both so the first client render couldn't disagree
    // with the server-rendered one). Compute the corrected tab locally and use
    // it directly below, rather than relying on ActiveTab state -- this effect
    // only runs once, so a second render is not coming to pick up the change.
    const UrlRole = NormalizeLoginTab(new URLSearchParams(window.location.search).get("role"));
    const SavedLoginRole = NormalizeLoginTab(localStorage.getItem(LOGIN_ROLE_STORAGE_KEY));
    const CorrectedTab = UrlRole || SavedLoginRole || ActiveTab;

    if (CorrectedTab !== ActiveTab) {
      SetActiveTab(CorrectedTab);
    }

    SyncVisibleLoginTab(CorrectedTab);
    SetIdentifier(ReadRememberedLoginIdentifier(CorrectedTab));
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
    RunThemeTransition(() => {
      flushSync(() => SetTheme(NextTheme));
      ApplyTheme(NextTheme, true);
    });
  }

  function ChangeTab(Tab: LoginTab) {
    SetActiveTab(Tab);
    SyncVisibleLoginTab(Tab);
    SetError("");
    SetIdentifier(ReadRememberedLoginIdentifier(Tab));
    SetPassword("");
    SetShowPassword(false);
    SetTwoFactorChallengeToken(null);
    SetTwoFactorCode("");
  }

  async function CompleteLogin(Response: { user: CurrentUser }, CleanIdentifier: string) {
    if (!Active.AcceptedRoles.includes(Response.user.role)) {
      StageRef.current?.Signal("error");
      SetError(RoleMismatchMessage(Response.user));
      return;
    }

    // The session cookie was already set server-side by the /login (or
    // /2fa/verify-login) response that got us here -- this just persists
    // the non-secret profile for display and marks the role active.
    setSession(Response.user);
    RememberSuccessfulLoginTab(ActiveTab);
    RememberLoginIdentifier(ActiveTab, CleanIdentifier);
    SetConnectionStatus("ready");

    const TargetRoute = defaultRouteForRole(Response.user.role);
    Router.prefetch(TargetRoute);

    // Brief welcome moment before navigating away, with just enough of a pause to actually be
    // seen before the page unmounts. Every role gets its stage's own confirmation (the abacus fills,
    // a sweep of light crosses the class, the institution lights from the ground up). Students also
    // get the quick, role-colored confetti pop (subdued on purpose -- see particles.ts -- since this
    // happens on every login, not just an earned reward); teachers and admins stay calmer by design.
    // The confetti fires without a prefers-reduced-motion check, matching every other confetti
    // moment in this codebase: an earlier version gated it and it silently vanished in several real
    // test environments, which made the feature look broken when it was only suppressed.
    StageRef.current?.Signal("ok");
    if (ActiveTab === "STUDENT") triggerLoginWelcome(Active.ConfettiColors);
    await new Promise((Resolve) => setTimeout(Resolve, 550));

    Router.replace(TargetRoute);
    Router.refresh();

    if (typeof window !== "undefined") {
      if (window.location.pathname !== TargetRoute) {
        window.location.assign(TargetRoute);
      }
    }
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
    StageRef.current?.Signal("busy");

    try {
      const Result = await login(CleanIdentifier, CleanPassword);

      if (isTwoFactorChallenge(Result)) {
        SetTwoFactorChallengeToken(Result.challengeToken);
        SetConnectionStatus("ready");
        StageRef.current?.Signal("idle");
        return;
      }

      await CompleteLogin(Result, CleanIdentifier);
    } catch (Err) {
      SetConnectionStatus("working");
      StageRef.current?.Signal("error");
      SetError(apiErrorMessage(Err));
      void warmupAuthApi();
    } finally {
      SetLoading(false);
    }
  }

  async function HandleTwoFactorSubmit(Event: React.FormEvent) {
    Event.preventDefault();
    if (Loading || !TwoFactorChallengeToken) return;

    const CleanCode = TwoFactorCode.trim();
    if (!CleanCode) {
      SetError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    SetError("");
    SetLoading(true);
    StageRef.current?.Signal("busy");

    try {
      const Response = await verifyTwoFactorLogin(TwoFactorChallengeToken, CleanCode);
      await CompleteLogin(Response, Identifier.trim());
    } catch (Err) {
      StageRef.current?.Signal("error");
      SetError(apiErrorMessage(Err));
    } finally {
      SetLoading(false);
    }
  }

  function CancelTwoFactorChallenge() {
    SetTwoFactorChallengeToken(null);
    SetTwoFactorCode("");
    SetError("");
  }

  // A short shake on the form whenever a new error appears, so it is noticed without being read.
  useEffect(() => {
    const FormShell = FormShellRef.current;
    if (!Error || !FormShell) return;
    FormShell.classList.remove("mp-si-shake");
    void FormShell.offsetWidth;
    FormShell.classList.add("mp-si-shake");
  }, [Error]);

  const ErrorBanner = Error ? (
    <div role="alert" aria-live="polite" className="mp-si-err">
      {Error}
    </div>
  ) : null;

  return (
    <main className="mp-si" data-role={StageRole} data-testid="login-shell">
      <div className="mp-si-frame" data-testid="login-frame">
        <header className="mp-si-top">
          <a
            href={MATHPATH_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-si-logo"
            aria-label="Open MathPath website"
            data-testid="login-mathpath-logo"
          >
            <Image src="/mathpath-logo.png" alt="MathPath logo" width={210} height={101} priority />
          </a>
          <button
            className="mp-si-theme"
            onClick={ToggleTheme}
            aria-label={ThemeTooltip}
            title={ThemeTooltip}
            type="button"
            data-testid="login-theme-toggle"
          >
            {Theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{ThemeLabel}</span>
          </button>
        </header>

        <LoginStage
          ref={StageRef}
          Role={StageRole}
          Dark={Theme === "dark"}
          Headline={Active.Headline}
          Description={Active.Description}
          OnCelebrate={CelebrateChallenge}
        />

        <section className="mp-si-sheet" data-testid="login-form-zone" aria-labelledby="mathpath-login-heading">
          <div className="mp-si-sheet-in">
            <div
              className="mp-si-tabs"
              role="tablist"
              aria-label="Choose login role"
              data-testid="login-role-tabs"
              style={{ "--tab-index": OrderedTabs.indexOf(ActiveTab) } as React.CSSProperties}
            >
              <div className="mp-si-tab-ind" aria-hidden="true" />
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
                    className="mp-si-tab"
                  >
                    <span aria-hidden="true">{TabData.Icon}</span>
                    <span>{RoleLabel(Tab)}</span>
                  </button>
                );
              })}
            </div>

            <h2 id="mathpath-login-heading" className="mp-si-heading mp-si-swap" key={`heading-${ActiveTab}`}>
              {RoleLabel(ActiveTab)} Login
            </h2>

            <div ref={FormShellRef}>
              {TwoFactorChallengeToken ? (
                <form
                  id="mathpath-login-2fa-panel"
                  className="mp-si-form"
                  onSubmit={HandleTwoFactorSubmit}
                  data-testid="two-factor-login-form"
                >
                  <label className="mp-si-label" htmlFor="mathpath-login-2fa-code">
                    Authentication Code
                  </label>
                  <input
                    id="mathpath-login-2fa-code"
                    className="mp-si-in code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={TwoFactorCode}
                    onChange={(Event) => SetTwoFactorCode(Event.target.value)}
                    placeholder="123456"
                    autoFocus
                    required
                  />
                  <p className="mp-si-note">
                    Enter the 6-digit code from your authenticator app, or one of your backup codes.
                  </p>

                  {ErrorBanner}

                  <button type="submit" className="mp-si-cta" disabled={Loading}>
                    {Loading ? "Verifying..." : "Verify & Continue"}
                  </button>

                  <button type="button" onClick={CancelTwoFactorChallenge} className="mp-si-back">
                    Back to login
                  </button>
                </form>
              ) : (
                <form
                  id="mathpath-login-panel"
                  role="tabpanel"
                  aria-labelledby={`mathpath-login-tab-${ActiveTab.toLowerCase()}`}
                  className="mp-si-form"
                  onSubmit={HandleSubmit}
                  data-testid="student-login-form"
                >
                  <label className="mp-si-label" htmlFor="mathpath-login-identifier">
                    {Active.IdentifierLabel}
                  </label>
                  <input
                    id="mathpath-login-identifier"
                    className="mp-si-in"
                    type="text"
                    value={Identifier}
                    onChange={(Event) => {
                      SetIdentifier(Event.target.value);
                      StageRef.current?.HoldForTyping();
                    }}
                    placeholder={Active.IdentifierPlaceholder}
                    autoComplete={`${AutoCompleteSection(ActiveTab)} username`}
                    name={`mathpath-${ActiveTab.toLowerCase()}-identifier`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />

                  <label className="mp-si-label" htmlFor="mathpath-login-password">
                    Password
                  </label>
                  <div className="mp-si-pw">
                    <input
                      id="mathpath-login-password"
                      className="mp-si-in"
                      type={ShowPassword ? "text" : "password"}
                      value={Password}
                      onChange={(Event) => {
                        SetPassword(Event.target.value);
                        StageRef.current?.HoldForTyping();
                      }}
                      placeholder="Enter your password"
                      autoComplete={`${AutoCompleteSection(ActiveTab)} current-password`}
                      name={`mathpath-${ActiveTab.toLowerCase()}-password`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => SetShowPassword(!ShowPassword)}
                      className="mp-si-eye"
                      aria-label={ShowPassword ? "Hide password" : "Show password"}
                    >
                      {ShowPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>

                  {ErrorBanner}

                  <button type="submit" className="mp-si-cta" disabled={Loading || !LoginReady}>
                    {Loading ? "Logging In..." : Active.ButtonText}
                  </button>

                  <p className="mp-si-forgot">
                    Forgot Password?{" "}
                    <b>
                      {ActiveTab === "STUDENT"
                        ? "Contact your teacher to reset it."
                        : "Contact your platform administrator."}
                    </b>
                  </p>
                </form>
              )}
            </div>

            <p
              className={`mp-si-status${ConnectionStatus === "ready" ? " is-ready" : ""}`}
              role="status"
              aria-live="polite"
              data-testid="login-connection-status"
            >
              <i aria-hidden="true" />
              <span>
                {ConnectionStatus === "ready"
                  ? "Secure connection ready"
                  : ConnectionStatus === "working"
                  ? "Connecting to MathPath…"
                  : "Preparing secure sign-in…"}
              </span>
            </p>
          </div>
        </section>

        <footer className="mp-si-foot">
          <a
            href={ZETTA_METRICS_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-si-zetta"
            aria-label="Built by Zetta Metrics. Opens the Zetta Metrics website in a new tab"
            data-testid="login-zetta-link"
          >
            <span>Built by</span>
            <Image src="/zetta-metrics-logo.png" alt="Zetta Metrics" width={748} height={256} loading="eager" />
            <ExternalLink aria-hidden="true" />
          </a>
          <a
            href={ZETTA_METRICS_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-si-zurl"
            data-testid="login-zetta-url"
          >
            www.zetta-metrics.com
            <span className="mp-si-sr"> (opens in a new tab)</span>
          </a>
        </footer>
      </div>
    </main>
  );
}
