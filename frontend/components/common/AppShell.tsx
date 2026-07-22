"use client";

import { useHeartbeat } from "@/hooks/useHeartbeat";
import { NotificationsBell } from "@/components/common/NotificationsBell";
import { apiErrorMessage } from "@/lib/api";
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  logoutAllSessions,
  startTwoFactorSetup,
  uploadProfilePhoto,
} from "@/lib/api/auth";
import {
  clearAuth,
  getStoredUser,
  getStoredUserForRole,
  getTokenForRole,
  setActiveRole,
  updateStoredUser,
} from "@/lib/auth";
import type { UserRole } from "@/types/auth";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const StudentGlobalBackground = dynamic(() => import("@/components/student/StudentGlobalBackground"), { ssr: false });
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  Camera,
  FilePenLine,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PanelTopClose,
  PanelTopOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  PackageOpen,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { ChangeEvent, ComponentType, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type ThemeMode = "light" | "dark";
type StoredUser = ReturnType<typeof getStoredUser>;
type IconType = ComponentType<{
  size?: string | number;
  className?: string;
  strokeWidth?: string | number;
  style?: CSSProperties;
  "data-teacher-main-nav-svg"?: string;
}>;

type NavChild = {
  label: string;
  shortLabel?: string;
  href: string;
  icon: IconType;
  tooltip: string;
};

type NavGroup = {
  label: string;
  shortLabel?: string;
  icon: IconType;
  tooltip: string;
  href?: string;
  children?: NavChild[];
};

const PLATFORM_TAGLINE =
  "Visual Abacus Mastery for Speed, Accuracy, and School-Ready Confidence.";
const MATHPATH_WEBSITE_URL = "https://www.mathpath.in/website/index";

const NAV_STORAGE_KEY = "mathpath_nav_collapsed";


function normalizeShellRole(role?: UserRole | null): "ADMIN" | "TEACHER" | "STUDENT" | null {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "ADMIN";
  if (role === "TEACHER") return "TEACHER";
  if (role === "STUDENT") return "STUDENT";
  return null;
}

function expectedRoleFromPath(pathname?: string | null): "ADMIN" | "TEACHER" | "STUDENT" | null {
  if (!pathname) return null;
  if (pathname.startsWith("/admin")) return "ADMIN";
  if (pathname.startsWith("/teacher")) return "TEACHER";
  if (pathname.startsWith("/student")) return "STUDENT";
  return null;
}

function loginRouteForRole(role: "ADMIN" | "TEACHER" | "STUDENT") {
  return `/login?role=${role.toLowerCase()}`;
}

function displayUserRole(role?: UserRole) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "ADMIN";
  if (role === "TEACHER") return "TEACHER";
  if (role === "STUDENT") return "STUDENT";
  return role || "";
}

function getRoleTone(role?: UserRole) {
  if (role === "STUDENT") return "math-role-badge-student";
  if (role === "TEACHER") return "math-role-badge-teacher";
  return "math-role-badge-admin";
}

function applyTheme(mode: ThemeMode, markUserChoice = false) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
  localStorage.setItem("mathpath_theme", mode);
  if (markUserChoice) {
    localStorage.setItem("mathpath_theme_user_set", "true");
  }
}

function assetUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const base = (
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api"
  ).replace(/\/api\/?$/, "");
  return `${base}${url}`;
}

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [MountedUser, SetMountedUser] = useState<StoredUser>(null);
  const [AuthReady, SetAuthReady] = useState(false);

  // Trigger heartbeat to keep live radar accurate
  useHeartbeat();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hoveredNavGroup, setHoveredNavGroup] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [AccountMenuOpen, SetAccountMenuOpen] = useState(false);
  const [ProfileModalOpen, SetProfileModalOpen] = useState(false);
  const [SettingsModalOpen, SetSettingsModalOpen] = useState(false);
  const [PasswordModalOpen, SetPasswordModalOpen] = useState(false);
  const [TwoFactorModalOpen, SetTwoFactorModalOpen] = useState(false);
  const [PhotoUploading, SetPhotoUploading] = useState(false);
  const [AccountNotice, SetAccountNotice] = useState<string | null>(null);
  const [AccountError, SetAccountError] = useState<string | null>(null);
  const [CurrentPassword, SetCurrentPassword] = useState("");
  const [NewPassword, SetNewPassword] = useState("");
  const [ConfirmPassword, SetConfirmPassword] = useState("");
  const [PasswordSaving, SetPasswordSaving] = useState(false);
  const AccountMenuRef = useRef<HTMLDivElement | null>(null);
  const PhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function RefreshMountedUser() {
      const ExpectedRole = expectedRoleFromPath(pathname);

      if (ExpectedRole) {
        const RoleToken = getTokenForRole(ExpectedRole);
        const RoleUser = getStoredUserForRole(ExpectedRole);
        const StoredRole = normalizeShellRole(RoleUser?.role);

        if (!RoleToken || !RoleUser || StoredRole !== ExpectedRole) {
          clearAuth();
          localStorage.setItem("mathpath_login_role", ExpectedRole);
          SetMountedUser(null);
          SetAuthReady(false);
          router.replace(loginRouteForRole(ExpectedRole));
          return;
        }

        setActiveRole(ExpectedRole);
        SetMountedUser(RoleUser);
        SetAuthReady(true);
        return;
      }

      SetMountedUser(getStoredUser());
      SetAuthReady(true);
    }

    RefreshMountedUser();
    window.addEventListener("mathpath-auth-changed", RefreshMountedUser);
    return () => window.removeEventListener("mathpath-auth-changed", RefreshMountedUser);
  }, [pathname, router]);

  const AvatarUrl = assetUrl(resolveProfilePhotoUrl(MountedUser));

  useEffect(() => {
    const savedTheme =
      typeof window !== "undefined"
        ? (localStorage.getItem("mathpath_theme") as ThemeMode | null)
        : null;
    const userSelectedTheme =
      typeof window !== "undefined"
        ? localStorage.getItem("mathpath_theme_user_set") === "true"
        : false;

    const nextTheme =
      userSelectedTheme && (savedTheme === "dark" || savedTheme === "light") ? savedTheme : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);

    const savedNavState =
      typeof window !== "undefined"
        ? localStorage.getItem(NAV_STORAGE_KEY)
        : null;
    setNavCollapsed(savedNavState === "true");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
    SetAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function HandlePointerDown(Event: MouseEvent) {
      if (!AccountMenuRef.current) return;
      if (!AccountMenuRef.current.contains(Event.target as Node)) {
        SetAccountMenuOpen(false);
      }
    }

    function HandleKeyDown(Event: KeyboardEvent) {
      if (Event.key === "Escape") {
        SetAccountMenuOpen(false);
        SetProfileModalOpen(false);
        SetSettingsModalOpen(false);
        SetPasswordModalOpen(false);
      }
    }

    document.addEventListener("mousedown", HandlePointerDown);
    document.addEventListener("keydown", HandleKeyDown);
    return () => {
      document.removeEventListener("mousedown", HandlePointerDown);
      document.removeEventListener("keydown", HandleKeyDown);
    };
  }, []);

  const IsStudent = MountedUser?.role === "STUDENT";
  const IsTeacher = MountedUser?.role === "TEACHER";
  const IsAdmin =
    MountedUser?.role === "ADMIN" || MountedUser?.role === "SUPER_ADMIN";

  if (!AuthReady && expectedRoleFromPath(pathname)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center text-sm font-black uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Securing MathPath Workspace...
      </main>
    );
  }

  const RoleShellClass = IsStudent
    ? "math-role-student"
    : IsTeacher
      ? "math-role-teacher"
      : IsAdmin
        ? "math-role-admin"
        : "";

  const isDetailWorkspace =
    pathname?.includes("/admin/assignments/student/") ||
    pathname?.includes("/admin/assessments/student/") ||
    pathname?.includes("/teacher/assignment-tracker/student/") ||
    pathname?.includes("/teacher/assessments/student/") ||
    pathname?.includes("/student/results/module/") ||
    pathname?.includes("/details");

  const effectiveNavCollapsed = navCollapsed || Boolean(isDetailWorkspace);

  const adminNav: NavGroup[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: "/admin/dashboard",
      tooltip: "Open admin dashboard",
    },
    {
      label: "Learning Path",
      icon: BookOpen,
      tooltip: "Manage the MathPath learning structure",
      children: [
        {
          label: "Learning Path Studio",
          shortLabel: "Path Studio",
          href: "/admin/curriculum",
          icon: BookOpen,
          tooltip: "Review and publish DPS content",
        },
      ],
    },
    {
      label: "Users",
      icon: UsersRound,
      tooltip: "Manage student and teacher accounts",
      children: [
        {
          label: "Students",
          href: "/admin/students",
          icon: UsersRound,
          tooltip: "Manage students",
        },
        {
          label: "Teachers",
          href: "/admin/teachers",
          icon: GraduationCap,
          tooltip: "Manage teachers",
        },
      ],
    },
    {
      label: "Learning Operations",
      shortLabel: "Operations",
      icon: ClipboardPlus,
      tooltip: "Manage learning delivery",
      children: [
        {
          label: "Practice Control",
          shortLabel: "Practice",
          href: "/admin/assignments",
          icon: ClipboardPlus,
          tooltip: "Manage practice delivery",
        },
        {
          label: "Assessment Readiness",
          shortLabel: "Readiness",
          href: "/admin/assessment-readiness",
          icon: ShieldCheck,
          tooltip: "Review assessment readiness",
        },
        {
          label: "Assessment Studio",
          shortLabel: "Studio",
          href: "/admin/assessment-blueprints",
          icon: FilePenLine,
          tooltip: "Build and publish level assessments",
        },
        {
          label: "Assessment Control",
          shortLabel: "Assessments",
          href: "/admin/assessments",
          icon: GraduationCap,
          tooltip: "Manage assessment delivery",
        },
      ],
    },
    {
      label: "Competition",
      icon: Target,
      tooltip: "Manage competition mock practice",
      children: [
        {
          label: "Competition Mock Studio",
          shortLabel: "Mock Studio",
          href: "/admin/competition/mock-studio",
          icon: FilePenLine,
          tooltip: "Create and publish competition mock exams",
        },
        {
          label: "Competition Mock Tracker",
          shortLabel: "Mock Tracker",
          href: "/admin/competition/mock-tracker",
          icon: ClipboardList,
          tooltip: "Track competition mock performance",
        },
        {
          label: "Mock Performance Insights",
          shortLabel: "Insights",
          href: "/admin/competition/progress",
          icon: TrendingUp,
          tooltip: "Track mock strengths and weak areas",
        },
      ],
    },
    {
      label: "Reports",
      icon: BarChart3,
      tooltip: "Generate and review reports",
      children: [
        {
          label: "Performance Reports",
          href: "/admin/results",
          icon: BarChart3,
          tooltip: "Generate performance reports",
        },
      ],
    },
  ];

  const teacherNav: NavGroup[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: "/teacher/dashboard",
      tooltip: "Open teacher dashboard",
    },
    {
      label: "Students",
      icon: UsersRound,
      tooltip: "Manage assigned students",
      children: [
        {
          label: "My Students",
          href: "/teacher/students",
          icon: UsersRound,
          tooltip: "View assigned students",
        },
      ],
    },
    {
      label: "Practice",
      icon: ClipboardPlus,
      tooltip: "Manage practice work",
      children: [
        {
          label: "Assign Practice",
          href: "/teacher/assign-dps",
          icon: ClipboardPlus,
          tooltip: "Assign practice sheets",
        },
        {
          label: "Practice Tracker",
          href: "/teacher/assignment-tracker",
          icon: Target,
          tooltip: "Track practice submissions",
        },
      ],
    },
    {
      label: "Assessments",
      icon: GraduationCap,
      tooltip: "Manage Assessments",
      children: [
        {
          label: "Assessment Readiness",
          shortLabel: "Readiness",
          href: "/teacher/assessment-readiness",
          icon: ShieldCheck,
          tooltip: "Review assessment readiness",
        },
        {
          label: "Assign Assessment",
          shortLabel: "Assign",
          href: "/teacher/assign-assessment",
          icon: ClipboardPlus,
          tooltip: "Assign live assessments",
        },
        {
          label: "Assessment Tracker",
          shortLabel: "Tracker",
          href: "/teacher/assessments",
          icon: GraduationCap,
          tooltip: "Track assigned assessments",
        },
        {
          label: "Promotion History",
          shortLabel: "Promotions",
          href: "/teacher/promotion-history",
          icon: ShieldCheck,
          tooltip: "Review student promotion history",
        },
      ],
    },
    {
      label: "Competition",
      icon: Target,
      tooltip: "Track competition mock performance",
      children: [
        {
          label: "Competition Mock Tracker",
          shortLabel: "Mock Tracker",
          href: "/teacher/competition/mock-tracker",
          icon: ClipboardList,
          tooltip: "Review assigned mock exam performance",
        },
        {
          label: "Mock Performance Insights",
          shortLabel: "Insights",
          href: "/teacher/competition/progress",
          icon: TrendingUp,
          tooltip: "Track mock strengths and weak areas",
        },
      ],
    },
  ];

  const studentNav: NavGroup[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: "/student/dashboard",
      tooltip: "Open student dashboard",
    },
    {
      label: "Practice",
      icon: BookOpen,
      href: "/student/practice",
      tooltip: "Open assigned practice",
    },
    {
      label: "Assessments",
      icon: GraduationCap,
      href: "/student/assessments",
      tooltip: "Open assessments",
    },
    {
      label: "Assessment Readiness",
      shortLabel: "Readiness",
      icon: ShieldCheck,
      href: "/student/assessment-readiness",
      tooltip: "Check assessment readiness",
    },
    {
      label: "Progress",
      icon: Target,
      href: "/student/results",
      tooltip: "View progress",
    },
    {
      label: "Competition",
      icon: Target,
      tooltip: "Open competition mock practice",
      children: [
        {
          label: "Mock Exams",
          href: "/student/competition/mock-exams",
          icon: ClipboardPlus,
          tooltip: "Attempt assigned competition mocks",
        },
        {
          label: "Mock Performance Insights",
          shortLabel: "Insights",
          href: "/student/competition/progress",
          icon: TrendingUp,
          tooltip: "Track mock strengths and weak areas",
        },
        {
          label: "Mock Leaderboard",
          shortLabel: "Leaderboard",
          href: "/student/competition/leaderboard",
          icon: Trophy,
          tooltip: "View competition mock rankings",
        },
      ],
    },
    {
      label: "Achievements",
      icon: Sparkles,
      tooltip: "View your achievements",
      children: [
        {
          label: "Trophy Room",
          shortLabel: "Trophies",
          href: "/student/achievements",
          icon: Award,
          tooltip: "View your earned badges and achievements",
        },
        {
          label: "Collector's Vault",
          shortLabel: "Vault",
          href: "/student/achievements/vault",
          icon: PackageOpen,
          tooltip: "View and open your collected item packs",
        },
      ],
    },
  ];

  const navGroups = IsStudent
    ? studentNav
    : IsTeacher
      ? teacherNav
      : IsAdmin
        ? adminNav
        : [];

  function isRouteActive(href: string) {
    if (!pathname) return false;
    if (pathname === href) return true;
    return href !== "/" && pathname.startsWith(href + "/");
  }

  function isGroupActive(group: NavGroup) {
    if (group.href && isRouteActive(group.href)) return true;
    return Boolean(group.children?.some((child) => isRouteActive(child.href)));
  }

  const activeItem = (() => {
    for (const group of navGroups) {
      if (group.href && isRouteActive(group.href)) return group;
      const child = group.children?.find((item) => isRouteActive(item.href));
      if (child) return child;
    }
    return navGroups[0];
  })();

  const ActiveIcon = activeItem?.icon || LayoutDashboard;

  function logout() {
    const LogoutRole = IsAdmin ? "admin" : IsTeacher ? "teacher" : "student";
    if (typeof window !== "undefined") {
      localStorage.setItem("mathpath_login_role", LogoutRole.toUpperCase());
      localStorage.setItem("mathpath_active_role", LogoutRole.toUpperCase());
    }
    clearAuth();
    router.push(`/login?role=${LogoutRole}`);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme, true);
  }

  function setCollapsedState(next: boolean) {
    setNavCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(NAV_STORAGE_KEY, String(next));
    }
  }

  function goHome() {
    if (IsStudent) router.push("/student/dashboard");
    else if (IsTeacher) router.push("/teacher/dashboard");
    else if (IsAdmin) router.push("/admin/dashboard");
    else router.push("/login");
  }

  function navigateTo(href?: string) {
    if (!href) return;
    setOpenGroup(null);
    router.push(href);
  }

  function navigateContextHome() {
    if (isDetailWorkspace && activeItem?.href) {
      router.push(activeItem.href);
      return;
    }
    setCollapsedState(false);
  }

  function OpenProfileModal() {
    SetAccountMenuOpen(false);
    SetProfileModalOpen(true);
  }

  function OpenSettingsModal() {
    SetAccountMenuOpen(false);
    SetSettingsModalOpen(true);
  }

  function OpenPhotoPicker() {
    SetAccountMenuOpen(false);
    PhotoInputRef.current?.click();
  }

  async function HandleProfilePhotoChange(
    Event: ChangeEvent<HTMLInputElement>,
  ) {
    const SelectedFile = Event.target.files?.[0];
    if (!SelectedFile) return;

    SetAccountError(null);
    SetAccountNotice(null);

    if (!SelectedFile.type.startsWith("image/")) {
      SetAccountError("Please select a valid image file.");
      Event.target.value = "";
      return;
    }

    try {
      SetPhotoUploading(true);
      const Response = await uploadProfilePhoto(SelectedFile);
      updateStoredUser(Response.user);
      SetMountedUser(Response.user);
      SetAccountNotice("Profile photo updated successfully.");
    } catch (Error) {
      SetAccountError(apiErrorMessage(Error));
    } finally {
      SetPhotoUploading(false);
      Event.target.value = "";
    }
  }

  async function HandlePasswordUpdate() {
    SetAccountError(null);
    SetAccountNotice(null);

    if (!CurrentPassword.trim()) {
      SetAccountError("Current password is required.");
      return;
    }
    if (NewPassword.trim().length < 8) {
      SetAccountError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(NewPassword) || !/[0-9]/.test(NewPassword)) {
      SetAccountError("New password must include at least one letter and one number.");
      return;
    }
    if (NewPassword !== ConfirmPassword) {
      SetAccountError("New password and confirmation do not match.");
      return;
    }

    try {
      SetPasswordSaving(true);
      const Response = await changePassword({
        currentPassword: CurrentPassword,
        newPassword: NewPassword,
      });
      SetAccountNotice(Response.message || "Password updated successfully.");
      SetPasswordModalOpen(false);
      SetCurrentPassword("");
      SetNewPassword("");
      SetConfirmPassword("");
    } catch (Error) {
      SetAccountError(apiErrorMessage(Error));
    } finally {
      SetPasswordSaving(false);
    }
  }

  function HandleSignOut() {
    SetAccountMenuOpen(false);
    logout();
  }

  async function HandleSignOutAllSessions() {
    try {
      await logoutAllSessions();
    } catch {
      // Best-effort: even if the request fails (e.g. the session was
      // already invalidated), still clear local state and send the user
      // back to login below -- there's no useful recovery action here.
    }
    SetSettingsModalOpen(false);
    logout();
  }

  return (
    <div className={`min-h-screen ${RoleShellClass}`}>
      {RoleShellClass.includes("math-role-student") && <StudentGlobalBackground />}
      <div className="premium-backdrop" />

      <header className="math-shell-header">
        <div className="math-shell-inner w-full px-3 py-3 sm:px-5 lg:px-6 2xl:px-8">
          {effectiveNavCollapsed ? (
            <div className="flex min-w-0 items-center justify-between gap-3">
              <a
                className="group flex min-w-0 w-fit items-center gap-3 text-left hover:scale-[1.02] transition-transform duration-200"
                href={MATHPATH_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Open MathPath Website"
                aria-label="Open MathPath Website"
              >
                <LogoMark compact />
                {isDetailWorkspace && (
                  <div className="min-w-0 ml-1">
                    <p className="hidden truncate text-xs font-semibold text-slate-500 dark:text-slate-300 sm:block">
                      Focused view
                    </p>
                  </div>
                )}
              </a>

              <button
                type="button"
                className="math-context-pill math-current-workspace-pill hidden lg:flex"
                onClick={navigateContextHome}
                aria-label={
                  isDetailWorkspace
                    ? `Back to ${activeItem?.label || "section"}`
                    : "Expand navigation"
                }
                title={
                  isDetailWorkspace
                    ? `Back to ${activeItem?.label || "section"}`
                    : "Expand navigation"
                }
              >
                <ActiveIcon size={17} className="math-role-text shrink-0" />
                <span className="max-w-[260px] truncate">
                  {activeItem?.label || title || "MathPath"}
                </span>
                {isDetailWorkspace ? (
                  <ChevronLeft size={17} className="shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown size={17} className="shrink-0 text-slate-400" />
                )}
              </button>

              <div className="hidden shrink-0 items-center justify-end gap-2 lg:flex">
                <IconButton
                  onClick={navigateContextHome}
                  title={
                    isDetailWorkspace
                      ? `Back to ${activeItem?.label || "section"}`
                      : "Expand navigation"
                  }
                  ariaLabel={
                    isDetailWorkspace
                      ? `Back to ${activeItem?.label || "section"}`
                      : "Expand navigation"
                  }
                >
                  {isDetailWorkspace ? (
                    <ChevronLeft size={18} />
                  ) : (
                    <PanelTopOpen size={18} />
                  )}
                </IconButton>

                <button
                  className="math-theme-toggle"
                  onClick={toggleTheme}
                  aria-label={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                  title={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  <span className="hidden 2xl:inline">
                    {theme === "dark" ? "Light" : "Dark"}
                  </span>
                </button>

                {MountedUser ? <NotificationsBell /> : null}
                {MountedUser ? (
                  <div className="relative" ref={AccountMenuRef}>
                    <UserCard
                      user={MountedUser}
                      avatarUrl={AvatarUrl}
                      compact
                      onClick={() => SetAccountMenuOpen((Value) => !Value)}
                      menuOpen={AccountMenuOpen}
                    />
                    {AccountMenuOpen ? (
                      <AccountMenu
                        user={MountedUser}
                        avatarUrl={AvatarUrl}
                        onProfile={OpenProfileModal}
                        onSettings={OpenSettingsModal}
                        onSignOut={HandleSignOut}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2 lg:hidden">
                <button
                  className="math-theme-toggle px-3"
                  onClick={toggleTheme}
                  aria-label={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                  title={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                {MountedUser ? <NotificationsBell /> : null}
                <button
                  className="math-button-secondary px-3"
                  onClick={() => setMobileOpen((value) => !value)}
                  aria-label="Open navigation menu"
                  title="Open navigation menu"
                >
                  {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <a
                className="group flex w-fit shrink-0 items-center text-left hover:scale-[1.02] transition-transform duration-200"
                href={MATHPATH_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Open MathPath Website"
                aria-label="Open MathPath Website"
              >
                <LogoMark />
              </a>

              <nav
                className="hidden min-w-0 flex-1 lg:justify-start xl:justify-center lg:flex"
                aria-label="Primary navigation"
              >
                <div className="premium-nav math-nav-spotlight relative z-[120] w-fit max-w-full overflow-visible px-1 lg:gap-0 xl:gap-1">
                  {navGroups.map((group) => {
                    const Icon = group.icon;
                    const active = isGroupActive(group);
                    const hasChildren = Boolean(group.children?.length);
                    const dropdownOpen = openGroup === group.label;
                    const navHovered = hoveredNavGroup === group.label;
                    const TeacherNavHighlighted =
                      IsTeacher && theme === "light" && (active || dropdownOpen || navHovered);
                    const StudentNavHighlighted =
                      IsStudent && theme === "light" && (active || dropdownOpen || navHovered);
                    const RoleNavHighlighted = TeacherNavHighlighted || StudentNavHighlighted;
                    const TeacherNavIconStyle: CSSProperties | undefined = TeacherNavHighlighted
                      ? {
                          color: "#ffffff",
                          stroke: "#ffffff",
                          opacity: 1,
                          filter: "none",
                          mixBlendMode: "normal",
                        }
                      : undefined;
                    const TeacherNavTextStyle: CSSProperties | undefined = TeacherNavHighlighted
                      ? { color: "#ffffff", opacity: 1 }
                      : undefined;

                    if (!hasChildren) {
                      return (
                        <button
                          key={group.label}
                          type="button"
                          onClick={() => navigateTo(group.href)}
                          onMouseEnter={() => setHoveredNavGroup(group.label)}
                          onMouseLeave={() => setHoveredNavGroup(null)}
                          onFocus={() => setHoveredNavGroup(group.label)}
                          onBlur={() => setHoveredNavGroup(null)}
                          className={`premium-nav-item group shrink min-w-[2rem] lg:px-1.5 xl:px-3 text-xs lg:text-[12px] xl:text-sm ${
                            active ? "premium-nav-item-active" : ""
                          } ${dropdownOpen ? "premium-nav-item-open" : ""}`}
                          title={group.tooltip}
                          aria-label={group.tooltip}
                          data-teacher-nav-hover-scope={IsTeacher && theme === "light" ? "true" : undefined}
                          data-student-nav-hover-scope={IsStudent && theme === "light" ? "true" : undefined}
                          data-teacher-nav-active={IsTeacher && theme === "light" && active ? "true" : undefined}
                          data-student-nav-active={IsStudent && theme === "light" && active ? "true" : undefined}
                          data-teacher-nav-open={IsTeacher && theme === "light" && dropdownOpen ? "true" : undefined}
                          data-student-nav-open={IsStudent && theme === "light" && dropdownOpen ? "true" : undefined}
                          data-teacher-nav-highlighted={TeacherNavHighlighted ? "true" : undefined}
                        >
                          <Icon
                            size={17}
                            strokeWidth={TeacherNavHighlighted ? 2.25 : RoleNavHighlighted ? 2.25 : 2.15}
                            data-teacher-main-nav-svg={TeacherNavHighlighted ? "true" : undefined}
                            style={
                              TeacherNavIconStyle ||
                              (RoleNavHighlighted
                                ? { color: "#ffffff", stroke: "#ffffff", opacity: 1 }
                                : undefined)
                            }
                            className={`math-teacher-main-nav-icon math-student-main-nav-icon shrink-0 transition-colors ${
                              TeacherNavHighlighted
                                ? "math-teacher-main-nav-clean-white !text-white !stroke-white opacity-100"
                                : RoleNavHighlighted
                                  ? "!text-white !stroke-white opacity-100"
                                  : ""
                            }`}
                          />
                          <span
                            style={
                              TeacherNavTextStyle ||
                              (RoleNavHighlighted
                                ? { color: "#ffffff", opacity: 1 }
                                : undefined)
                            }
                            className={`truncate whitespace-nowrap min-w-0 ${
                              RoleNavHighlighted ? "!text-white opacity-100" : ""
                            }`}
                          >
                            {group.shortLabel || group.label}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={group.label}
                        className="relative"
                        onMouseEnter={() => {
                          setOpenGroup(group.label);
                          setHoveredNavGroup(group.label);
                        }}
                        onMouseLeave={() => {
                          setOpenGroup(null);
                          setHoveredNavGroup(null);
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroup((current) =>
                              current === group.label ? null : group.label,
                            )
                          }
                          onFocus={() => setHoveredNavGroup(group.label)}
                          onBlur={() => setHoveredNavGroup(null)}
                          className={`premium-nav-item group shrink min-w-[2rem] lg:px-1.5 xl:px-3 text-xs lg:text-[12px] xl:text-sm ${
                            active ? "premium-nav-item-active" : ""
                          } ${dropdownOpen ? "premium-nav-item-open" : ""}`}
                          title={group.tooltip}
                          aria-label={group.tooltip}
                          data-teacher-nav-hover-scope={IsTeacher && theme === "light" ? "true" : undefined}
                          data-student-nav-hover-scope={IsStudent && theme === "light" ? "true" : undefined}
                          data-teacher-nav-active={IsTeacher && theme === "light" && active ? "true" : undefined}
                          data-student-nav-active={IsStudent && theme === "light" && active ? "true" : undefined}
                          data-teacher-nav-open={IsTeacher && theme === "light" && dropdownOpen ? "true" : undefined}
                          data-student-nav-open={IsStudent && theme === "light" && dropdownOpen ? "true" : undefined}
                          data-teacher-nav-highlighted={TeacherNavHighlighted ? "true" : undefined}
                          aria-expanded={dropdownOpen}
                        >
                          <Icon
                            size={17}
                            strokeWidth={TeacherNavHighlighted ? 2.25 : RoleNavHighlighted ? 2.25 : 2.15}
                            data-teacher-main-nav-svg={TeacherNavHighlighted ? "true" : undefined}
                            style={
                              TeacherNavIconStyle ||
                              (RoleNavHighlighted
                                ? { color: "#ffffff", stroke: "#ffffff", opacity: 1 }
                                : undefined)
                            }
                            className={`math-teacher-main-nav-icon math-student-main-nav-icon shrink-0 transition-colors ${
                              TeacherNavHighlighted
                                ? "math-teacher-main-nav-clean-white !text-white !stroke-white opacity-100"
                                : RoleNavHighlighted
                                  ? "!text-white !stroke-white opacity-100"
                                  : ""
                            }`}
                          />
                          <span
                            style={
                              TeacherNavTextStyle ||
                              (RoleNavHighlighted
                                ? { color: "#ffffff", opacity: 1 }
                                : undefined)
                            }
                            className={`truncate whitespace-nowrap min-w-0 ${
                              RoleNavHighlighted ? "!text-white opacity-100" : ""
                            }`}
                          >
                            {group.shortLabel || group.label}
                          </span>
                          <ChevronDown
                            size={15}
                            strokeWidth={TeacherNavHighlighted ? 2.25 : RoleNavHighlighted ? 2.25 : 2.15}
                            data-teacher-main-nav-svg={TeacherNavHighlighted ? "true" : undefined}
                            style={
                              TeacherNavIconStyle ||
                              (RoleNavHighlighted
                                ? { color: "#ffffff", stroke: "#ffffff", opacity: 1 }
                                : undefined)
                            }
                            className={`math-teacher-main-nav-chevron math-student-main-nav-chevron shrink-0 transition-colors ${
                              dropdownOpen ? "rotate-180" : ""
                            } ${
                              TeacherNavHighlighted
                                ? "math-teacher-main-nav-clean-white !text-white !stroke-white opacity-100"
                                : RoleNavHighlighted
                                  ? "!text-white !stroke-white opacity-100"
                                  : ""
                            }`}
                          />
                        </button>

                        {dropdownOpen ? (
                          <div className="absolute left-1/2 top-full z-[140] w-[360px] -translate-x-1/2 pt-4">
                            <div className="math-dropdown-arrow" />
                            <div className="math-dropdown-panel">
                              <div className="math-dropdown-header">
                                <p
                                  className={`text-[10px] font-black uppercase tracking-[0.16em] dark:text-blue-300 ${
                                    IsStudent && theme === "light" ? "text-orange-600" : "text-blue-600"
                                  }`}
                                >
                                  {group.label}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {group.tooltip}
                                </p>
                              </div>

                              <div className="math-dropdown-body">
                                {group.children?.map((child) => {
                                  const ChildIcon = child.icon;
                                  const childActive = isRouteActive(child.href);
                                  const StudentChildLight = IsStudent && theme === "light";

                                  return (
                                    <button
                                      key={child.href}
                                      type="button"
                                      onClick={() => navigateTo(child.href)}
                                      data-teacher-nav-child={IsTeacher && theme === "light" ? "true" : undefined}
                                      data-student-nav-child={IsStudent && theme === "light" ? "true" : undefined}
                                      className={`math-dropdown-option group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
                                        childActive
                                          ? StudentChildLight
                                            ? "math-dropdown-option-active bg-gradient-to-r from-orange-900 via-orange-500 to-rose-400 text-white shadow-lg"
                                            : "math-dropdown-option-active bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950"
                                          : StudentChildLight
                                            ? "text-slate-700 hover:bg-gradient-to-r hover:from-orange-900 hover:via-orange-500 hover:to-yellow-400 hover:text-white focus-visible:bg-gradient-to-r focus-visible:from-orange-900 focus-visible:via-orange-500 focus-visible:to-yellow-400 focus-visible:text-white dark:text-slate-200 dark:hover:bg-slate-900"
                                            : "text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-slate-900"
                                      }`}
                                      title={child.tooltip}
                                      aria-label={child.tooltip}
                                    >
                                      <span
                                        data-teacher-nav-child-icon={IsTeacher && theme === "light" ? "true" : undefined}
                                        data-student-nav-child-icon={IsStudent && theme === "light" ? "true" : undefined}
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                                          childActive
                                            ? "bg-white/15 text-white dark:bg-slate-950/10"
                                            : StudentChildLight
                                              ? "bg-orange-50 text-orange-600 group-hover:bg-white/20 group-hover:text-white"
                                              : "bg-slate-50 text-blue-600 dark:bg-slate-900"
                                        }`}
                                      >
                                        <ChildIcon
                                          size={17}
                                          strokeWidth={2.15}
                                          style={
                                            (IsTeacher || IsStudent) && theme === "light" && childActive
                                              ? {
                                                  color: "#ffffff",
                                                  stroke: "#ffffff",
                                                  opacity: 1,
                                                  filter: "none",
                                                  mixBlendMode: "normal",
                                                }
                                              : undefined
                                          }
                                          className={
                                            (IsTeacher || IsStudent) && theme === "light" && childActive
                                              ? "!text-white !stroke-white opacity-100"
                                              : undefined
                                          }
                                        />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block">
                                          {child.label}
                                        </span>
                                        <span
                                          className={`math-dropdown-option-subtitle mt-0.5 block text-xs font-medium ${
                                            childActive
                                              ? "text-white/80 dark:text-slate-800"
                                              : StudentChildLight
                                                ? "text-slate-400 group-hover:text-white/85 dark:text-slate-300"
                                                : "text-slate-400 dark:text-slate-300"
                                          }`}
                                        >
                                          {child.tooltip}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </nav>

              <div className="hidden shrink-0 items-center justify-end gap-2 lg:flex">
                <IconButton
                  onClick={() => setCollapsedState(true)}
                  title="Collapse navigation"
                  ariaLabel="Collapse navigation"
                >
                  <PanelTopClose size={18} />
                </IconButton>

                <button
                  className="math-theme-toggle"
                  onClick={toggleTheme}
                  aria-label={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                  title={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  <span className="hidden 2xl:inline">
                    {theme === "dark" ? "Light" : "Dark"}
                  </span>
                </button>

                {MountedUser ? <NotificationsBell /> : null}
                {MountedUser ? (
                  <div className="relative" ref={AccountMenuRef}>
                    <UserCard
                      user={MountedUser}
                      avatarUrl={AvatarUrl}
                      onClick={() => SetAccountMenuOpen((Value) => !Value)}
                      menuOpen={AccountMenuOpen}
                    />
                    {AccountMenuOpen ? (
                      <AccountMenu
                        user={MountedUser}
                        avatarUrl={AvatarUrl}
                        onProfile={OpenProfileModal}
                        onSettings={OpenSettingsModal}
                        onSignOut={HandleSignOut}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
                <button
                  className="math-theme-toggle px-3"
                  onClick={toggleTheme}
                  aria-label={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                  title={
                    theme === "dark"
                      ? "Switch To Light Theme"
                      : "Switch To Dark Theme"
                  }
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                {MountedUser ? <NotificationsBell /> : null}
                <button
                  className="math-button-secondary px-3"
                  onClick={() => setMobileOpen((value) => !value)}
                  aria-label="Open navigation menu"
                  title="Open navigation menu"
                >
                  {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>
          )}

          {mobileOpen ? (
            <div className="math-mobile-drawer math-mobile-drawer-elevated math-pop-in lg:hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Navigation
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                    {displayUserRole(MountedUser?.role)} View
                  </p>
                </div>
                <button
                  className="math-button-secondary px-3"
                  onClick={() => setCollapsedState(!navCollapsed)}
                  aria-label={
                    navCollapsed ? "Expand navigation" : "Collapse navigation"
                  }
                  title={
                    navCollapsed ? "Expand navigation" : "Collapse navigation"
                  }
                >
                  {navCollapsed ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                  {navCollapsed ? "Show" : "Hide"}
                </button>
              </div>

              <div className="grid gap-2">
                {navGroups.map((group) => {
                  const Icon = group.icon;
                  const active = isGroupActive(group);
                  const hasChildren = Boolean(group.children?.length);
                  const mobileGroupOpen = openGroup === group.label;

                  if (!hasChildren) {
                    return (
                      <button
                        key={group.label}
                        type="button"
                        onClick={() => navigateTo(group.href)}
                        title={group.tooltip}
                        aria-label={group.tooltip}
                          data-teacher-nav-hover-scope={IsTeacher && theme === "light" ? "true" : undefined}
                          data-student-nav-hover-scope={IsStudent && theme === "light" ? "true" : undefined}
                        className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                          active
                            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                            : "bg-slate-50 text-slate-700 hover:bg-blue-50 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Icon size={17} />
                        {group.label}
                      </button>
                    );
                  }

                  return (
                    <div key={group.label} className="math-mobile-group">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroup((current) =>
                            current === group.label ? null : group.label,
                          )
                        }
                        title={group.tooltip}
                        aria-label={group.tooltip}
                          data-teacher-nav-hover-scope={IsTeacher && theme === "light" ? "true" : undefined}
                          data-student-nav-hover-scope={IsStudent && theme === "light" ? "true" : undefined}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-black transition ${
                          active
                            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon size={17} />
                          {group.label}
                        </span>
                        <ChevronDown
                          size={15}
                          className={`transition ${mobileGroupOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {mobileGroupOpen ? (
                        <div className="mt-2 grid gap-1">
                          {group.children?.map((child) => {
                            const ChildIcon = child.icon;
                            const childActive = isRouteActive(child.href);

                            return (
                              <button
                                key={child.href}
                                type="button"
                                onClick={() => navigateTo(child.href)}
                                title={child.tooltip}
                                aria-label={child.tooltip}
                                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-black transition ${
                                  childActive
                                    ? "bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-white"
                                    : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
                                }`}
                              >
                                <ChildIcon size={16} />
                                {child.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700" />

              {MountedUser ? (
                <div className="math-mobile-user">
                  <Avatar user={MountedUser} avatarUrl={AvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-slate-900 dark:text-white">
                      {MountedUser.fullName}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {displayUserRole(MountedUser.role)}
                    </p>
                  </div>
                </div>
              ) : null}

              {MountedUser ? (
                <div className="mb-3 grid gap-2">
                  <button
                    className="math-account-menu-item"
                    onClick={OpenProfileModal}
                  >
                    <UserRound size={16} />
                    My Profile
                  </button>
                  <button
                    className="math-account-menu-item"
                    onClick={OpenSettingsModal}
                  >
                    <Settings size={16} />
                    Account Settings
                  </button>
                </div>
              ) : null}

              <button
                className="math-button-secondary w-full"
                onClick={HandleSignOut}
                title="Sign out securely"
                aria-label="Sign out securely"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <input
        ref={PhotoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={HandleProfilePhotoChange}
      />

      {MountedUser && ProfileModalOpen ? (
        <ProfileModal
          user={MountedUser}
          avatarUrl={AvatarUrl}
          onClose={() => SetProfileModalOpen(false)}
        />
      ) : null}

      {MountedUser && SettingsModalOpen ? (
        <SettingsModal
          user={MountedUser}
          avatarUrl={AvatarUrl}
          theme={theme}
          photoUploading={PhotoUploading}
          onClose={() => SetSettingsModalOpen(false)}
          onToggleTheme={toggleTheme}
          onUpdatePhoto={OpenPhotoPicker}
          onChangePassword={() => {
            SetSettingsModalOpen(false);
            SetPasswordModalOpen(true);
          }}
          onManageTwoFactor={() => {
            SetSettingsModalOpen(false);
            SetTwoFactorModalOpen(true);
          }}
          onSignOutAllSessions={HandleSignOutAllSessions}
        />
      ) : null}

      {PasswordModalOpen ? (
        <PasswordModal
          currentPassword={CurrentPassword}
          newPassword={NewPassword}
          confirmPassword={ConfirmPassword}
          saving={PasswordSaving}
          onCurrentPasswordChange={SetCurrentPassword}
          onNewPasswordChange={SetNewPassword}
          onConfirmPasswordChange={SetConfirmPassword}
          onSubmit={HandlePasswordUpdate}
          onClose={() => SetPasswordModalOpen(false)}
        />
      ) : null}

      {MountedUser && TwoFactorModalOpen ? (
        <TwoFactorModal
          user={MountedUser}
          onClose={() => SetTwoFactorModalOpen(false)}
          onChanged={(Enabled) => {
            const Updated = { ...MountedUser, twoFactorEnabled: Enabled };
            updateStoredUser(Updated);
            SetMountedUser(Updated);
          }}
        />
      ) : null}

      <AccountToast
        message={AccountNotice}
        error={AccountError}
        onClear={() => {
          SetAccountNotice(null);
          SetAccountError(null);
        }}
      />

      <main className="math-page math-fade-in">{children}</main>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className="math-icon-button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "h-[72px]" : "h-[96px]"}`}>
      <Image
        src="/mathpath-logo.png"
        alt="MathPath logo"
        width={compact ? 300 : 400}
        height={compact ? 72 : 96}
        className={`${compact ? "h-[64px]" : "h-[88px]"} w-auto object-contain`}
        priority
      />
    </div>
  );
}


function resolveProfilePhotoUrl(user: StoredUser): string {
  if (!user) return "";
  const Candidate =
    user.profilePhotoUrl ||
    (user as any).profile_photo_url ||
    (user as any).photoUrl ||
    (user as any).photo_url ||
    user.student?.photoUrl ||
    (user.student as any)?.photo_url ||
    user.teacher?.photoUrl ||
    (user.teacher as any)?.photo_url ||
    "";
  if (!Candidate || typeof Candidate !== "string") return "";
  if (Candidate.startsWith("data:")) return "";
  return Candidate;
}

function UserInitials(Name?: string | null) {
  const Parts = String(Name || "MathPath")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (Parts.length >= 2) return `${Parts[0][0]}${Parts[1][0]}`.toUpperCase();
  return (Parts[0] || "MP").slice(0, 2).toUpperCase();
}

function AvatarToneClass(Role?: UserRole) {
  if (Role === "STUDENT") return "from-orange-500 via-rose-500 to-amber-400";
  if (Role === "TEACHER") return "from-[#6D2E5F] via-[#B76E79] to-[#E6B8A2]";
  return "from-blue-700 via-indigo-600 to-fuchsia-500";
}

function Avatar({
  user,
  avatarUrl,
  compact = false,
}: {
  user: StoredUser;
  avatarUrl: string;
  compact?: boolean;
}) {
  const [ImageFailed, SetImageFailed] = useState(false);
  const [ImageLoaded, SetImageLoaded] = useState(false);

  useEffect(() => {
    SetImageFailed(false);
    SetImageLoaded(false);
  }, [avatarUrl]);

  const DisplayName = user?.fullName || (user as any)?.full_name || "MathPath User";
  const Initials = UserInitials(DisplayName);
  const ShowImage = Boolean(avatarUrl && !ImageFailed);

  return (
    <div
      className={`math-avatar relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${AvatarToneClass(user?.role)} font-black uppercase tracking-[-0.03em] text-white shadow-sm ring-1 ring-white/70 ${
        compact ? "h-9 w-9 text-[0.68rem]" : "h-10 w-10 text-xs"
      }`}
      title={DisplayName}
    >
      {!ShowImage ? <span className="leading-none">{Initials}</span> : null}
      {ShowImage ? (
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt={DisplayName}
          className="absolute inset-0 z-10 h-full w-full object-cover opacity-100"
          onLoad={() => SetImageLoaded(true)}
          onError={() => SetImageFailed(true)}
        />
      ) : null}
    </div>
  );
}

function UserCard({
  user,
  avatarUrl,
  compact = false,
  onClick,
  menuOpen = false,
}: {
  user: StoredUser;
  avatarUrl: string;
  compact?: boolean;
  onClick: () => void;
  menuOpen?: boolean;
}) {
  if (!user) return null;

  const RoleLabel = displayUserRole(user.role);

  return (
    <button
      type="button"
      className={`math-user-pill text-left ${menuOpen ? "math-user-pill-active" : ""} ${
        compact
          ? "min-h-12 px-3 py-2 min-w-0 2xl:min-w-[210px]"
          : "min-h-14 px-3 py-2 min-w-0 2xl:min-w-[220px]"
      }`}
      title="Open account menu"
      aria-label="Open account menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      <Avatar user={user} avatarUrl={avatarUrl} compact={compact} />
      <div className="min-w-0 flex-1 leading-tight hidden 2xl:block">
        <p className="max-w-[150px] truncate text-sm font-black text-slate-900 dark:text-white">
          {user.fullName}
        </p>
        <span
          className={`mt-1 inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${getRoleTone(user.role)}`}
        >
          {RoleLabel}
        </span>
      </div>
      <ChevronDown
        size={15}
        className={`shrink-0 text-slate-400 transition hidden 2xl:block ${menuOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function AccountMenu({
  user,
  avatarUrl,
  onProfile,
  onSettings,
  onSignOut,
}: {
  user: NonNullable<StoredUser>;
  avatarUrl: string;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const RoleLabel = displayUserRole(user.role);
  const UserCode = accountCode(user);

  return (
    <div className="math-account-menu math-pop-in" role="menu">
      <div className="math-account-header">
        <Avatar user={user} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            {user.fullName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${getRoleTone(user.role)}`}
            >
              {RoleLabel}
            </span>
            {UserCode ? (
              <span className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
                {UserCode}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="math-account-menu-body">
        <button
          className="math-account-menu-item"
          onClick={onProfile}
          role="menuitem"
        >
          <UserRound size={16} />
          <span>My Profile</span>
        </button>
        <button
          className="math-account-menu-item"
          onClick={onSettings}
          role="menuitem"
        >
          <Settings size={16} />
          <span>Account Settings</span>
        </button>
      </div>

      <div className="math-account-divider" />

      <button
        className="math-account-menu-item math-account-signout"
        onClick={onSignOut}
        role="menuitem"
      >
        <LogOut size={16} />
        <span>Sign Out</span>
      </button>
    </div>
  );
}

function ProfileModal({
  user,
  avatarUrl,
  onClose,
}: {
  user: NonNullable<StoredUser>;
  avatarUrl: string;
  onClose: () => void;
}) {
  const RoleLabel = displayUserRole(user.role);
  const Details = accountDetails(user);

  return (
    <ModalFrame
      title={`${RoleLabel.charAt(0)}${RoleLabel.slice(1).toLowerCase()} Profile`}
      onClose={onClose}
    >
      <div
        className="flex items-center gap-4 rounded-[24px] border p-4"
        style={{
          borderColor: "var(--theme-border)",
          background: "var(--theme-elevated-soft)",
        }}
      >
        <Avatar user={user} avatarUrl={avatarUrl} compact={false} />
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-slate-950 dark:text-white">
            {user.fullName}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {RoleLabel}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {Details.map((Item) => (
          <ProfileInfoRow
            key={Item.label}
            label={Item.label}
            value={Item.value}
          />
        ))}
      </div>
    </ModalFrame>
  );
}

function SettingsModal({
  user,
  avatarUrl,
  theme,
  photoUploading,
  onClose,
  onToggleTheme,
  onUpdatePhoto,
  onChangePassword,
  onManageTwoFactor,
  onSignOutAllSessions,
}: {
  user: NonNullable<StoredUser>;
  avatarUrl: string;
  theme: ThemeMode;
  photoUploading: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  onUpdatePhoto: () => void;
  onChangePassword: () => void;
  onManageTwoFactor: () => void;
  onSignOutAllSessions: () => void;
}) {
  const CanUseTwoFactor = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  return (
    <ModalFrame title="Account Settings" onClose={onClose}>
      <SettingsSection icon={<Camera size={17} />} title="Update Photo">
        <div
          className="flex items-center justify-between gap-4 rounded-2xl border p-3"
          style={{
            borderColor: "var(--theme-border)",
            background: "var(--theme-elevated-soft)",
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar user={user} avatarUrl={avatarUrl} />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Profile Photo
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Update the image shown on your MathPath account.
              </p>
            </div>
          </div>
          <button
            className="math-button-secondary px-3 py-2 text-sm"
            onClick={onUpdatePhoto}
            disabled={photoUploading}
          >
            {photoUploading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Camera size={15} />
            )}
            {photoUploading ? "Updating" : "Update"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
        title="Appearance"
      >
        <div
          className="flex items-center justify-between gap-4 rounded-2xl border p-3"
          style={{
            borderColor: "var(--theme-border)",
            background: "var(--theme-elevated-soft)",
          }}
        >
          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Theme Preference
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Current workspace theme: {theme === "dark" ? "Dark" : "Light"}
            </p>
          </div>
          <button
            className="math-button-secondary px-3 py-2 text-sm"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection icon={<KeyRound size={17} />} title="Security">
        <div
          className="flex items-center justify-between gap-4 rounded-2xl border p-3"
          style={{
            borderColor: "var(--theme-border)",
            background: "var(--theme-elevated-soft)",
          }}
        >
          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Password
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Update the password used for this MathPath account.
            </p>
          </div>
          <button
            className="math-button-secondary px-3 py-2 text-sm"
            onClick={onChangePassword}
          >
            <KeyRound size={15} />
            Change Password
          </button>
        </div>

        {CanUseTwoFactor ? (
          <div
            className="mt-3 flex items-center justify-between gap-4 rounded-2xl border p-3"
            style={{
              borderColor: "var(--theme-border)",
              background: "var(--theme-elevated-soft)",
            }}
          >
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Two-Factor Authentication
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {user.twoFactorEnabled
                  ? "Enabled -- an authenticator app code is required at login."
                  : "Add an authenticator app code as a second login step."}
              </p>
            </div>
            <button
              className="math-button-secondary px-3 py-2 text-sm"
              onClick={onManageTwoFactor}
            >
              <ShieldCheck size={15} />
              {user.twoFactorEnabled ? "Manage" : "Set Up"}
            </button>
          </div>
        ) : null}

        <div
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl border p-3"
          style={{
            borderColor: "var(--theme-border)",
            background: "var(--theme-elevated-soft)",
          }}
        >
          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Sign Out Everywhere
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Immediately end every active session on every device, including this one.
            </p>
          </div>
          <button
            className="math-button-secondary px-3 py-2 text-sm"
            onClick={onSignOutAllSessions}
          >
            <LogOut size={15} />
            Sign Out All
          </button>
        </div>
      </SettingsSection>
    </ModalFrame>
  );
}

function PasswordModal({
  currentPassword,
  newPassword,
  confirmPassword,
  saving,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onClose,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  saving: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <ModalFrame title="Change Password" onClose={onClose} compact>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="math-label">Current Password</span>
          <input
            className="math-input"
            type="password"
            value={currentPassword}
            onChange={(Event) => onCurrentPasswordChange(Event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="grid gap-2">
          <span className="math-label">New Password</span>
          <input
            className="math-input"
            type="password"
            value={newPassword}
            onChange={(Event) => onNewPasswordChange(Event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="grid gap-2">
          <span className="math-label">Confirm New Password</span>
          <input
            className="math-input"
            type="password"
            value={confirmPassword}
            onChange={(Event) => onConfirmPasswordChange(Event.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          className="math-button-secondary px-4 py-3"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className="math-button-primary px-4 py-3"
          onClick={onSubmit}
          disabled={saving}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <KeyRound size={16} />
          )}
          Update Password
        </button>
      </div>
    </ModalFrame>
  );
}

function TwoFactorModal({
  user,
  onClose,
  onChanged,
}: {
  user: NonNullable<StoredUser>;
  onClose: () => void;
  onChanged: (enabled: boolean) => void;
}) {
  type TwoFactorStep = "status" | "setup" | "backup-codes" | "disable";
  const [Step, SetStep] = useState<TwoFactorStep>(user.twoFactorEnabled ? "status" : "status");
  const [Loading, SetLoading] = useState(false);
  const [Error, SetError] = useState<string | null>(null);
  const [SetupData, SetSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [Code, SetCode] = useState("");
  const [BackupCodes, SetBackupCodes] = useState<string[]>([]);
  const [DisablePassword, SetDisablePassword] = useState("");

  async function HandleStartSetup() {
    SetError(null);
    SetLoading(true);
    try {
      const Response = await startTwoFactorSetup();
      SetSetupData({ secret: Response.secret, qrCodeDataUrl: Response.qrCodeDataUrl });
      SetStep("setup");
    } catch (ErrorValue) {
      SetError(apiErrorMessage(ErrorValue));
    } finally {
      SetLoading(false);
    }
  }

  async function HandleConfirmEnable() {
    if (!Code.trim()) {
      SetError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    SetError(null);
    SetLoading(true);
    try {
      const Response = await enableTwoFactor(Code.trim());
      SetBackupCodes(Response.backupCodes);
      SetStep("backup-codes");
      SetCode("");
      onChanged(true);
    } catch (ErrorValue) {
      SetError(apiErrorMessage(ErrorValue));
    } finally {
      SetLoading(false);
    }
  }

  async function HandleConfirmDisable() {
    if (!DisablePassword) {
      SetError("Enter your password to confirm.");
      return;
    }
    SetError(null);
    SetLoading(true);
    try {
      await disableTwoFactor(DisablePassword);
      SetDisablePassword("");
      onChanged(false);
      onClose();
    } catch (ErrorValue) {
      SetError(apiErrorMessage(ErrorValue));
    } finally {
      SetLoading(false);
    }
  }

  return (
    <ModalFrame title="Two-Factor Authentication" onClose={onClose} compact>
      {Error ? (
        <div
          role="alert"
          className="mb-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {Error}
        </div>
      ) : null}

      {Step === "status" && !user.twoFactorEnabled ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Two-factor authentication adds a second step to login using an authenticator app
            (like Google Authenticator or Authy), on top of your password.
          </p>
          <button className="math-button-primary px-4 py-3" onClick={HandleStartSetup} disabled={Loading}>
            {Loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Set Up Two-Factor Authentication
          </button>
        </div>
      ) : null}

      {Step === "status" && user.twoFactorEnabled ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Two-factor authentication is currently <strong>enabled</strong> on this account.
          </p>
          <button
            className="math-button-secondary px-4 py-3 text-rose-600 dark:text-rose-300"
            onClick={() => SetStep("disable")}
            disabled={Loading}
          >
            Disable Two-Factor Authentication
          </button>
        </div>
      ) : null}

      {Step === "setup" && SetupData ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <div className="flex justify-center rounded-2xl border p-4" style={{ borderColor: "var(--theme-border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated base64 data URL, not a static asset */}
            <img src={SetupData.qrCodeDataUrl} alt="Two-factor authentication QR code" width={200} height={200} />
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Can&apos;t scan it? Enter this key manually: <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{SetupData.secret}</code>
          </p>
          <label className="grid gap-2">
            <span className="math-label">6-Digit Code</span>
            <input
              className="math-input text-center tracking-[0.35em]"
              type="text"
              inputMode="numeric"
              value={Code}
              onChange={(Event) => SetCode(Event.target.value)}
              placeholder="123456"
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-3">
            <button className="math-button-secondary px-4 py-3" onClick={() => SetStep("status")} disabled={Loading}>
              Cancel
            </button>
            <button className="math-button-primary px-4 py-3" onClick={HandleConfirmEnable} disabled={Loading}>
              {Loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Enable
            </button>
          </div>
        </div>
      ) : null}

      {Step === "backup-codes" ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Two-factor authentication is now enabled. Save these one-time backup codes somewhere
            safe -- each one can be used to log in if you ever lose access to your authenticator
            app. They will not be shown again.
          </p>
          <div
            className="grid grid-cols-2 gap-2 rounded-2xl border p-4 font-mono text-sm"
            style={{ borderColor: "var(--theme-border)", background: "var(--theme-elevated-soft)" }}
          >
            {BackupCodes.map((BackupCode) => (
              <span key={BackupCode}>{BackupCode}</span>
            ))}
          </div>
          <button className="math-button-primary px-4 py-3" onClick={onClose}>
            Done
          </button>
        </div>
      ) : null}

      {Step === "disable" ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Enter your password to confirm disabling two-factor authentication.
          </p>
          <label className="grid gap-2">
            <span className="math-label">Password</span>
            <input
              className="math-input"
              type="password"
              value={DisablePassword}
              onChange={(Event) => SetDisablePassword(Event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-3">
            <button className="math-button-secondary px-4 py-3" onClick={() => SetStep("status")} disabled={Loading}>
              Cancel
            </button>
            <button
              className="math-button-primary px-4 py-3"
              onClick={HandleConfirmDisable}
              disabled={Loading}
            >
              {Loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Confirm Disable
            </button>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className="math-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`math-account-modal math-pop-in ${compact ? "max-w-[520px]" : "max-w-[620px]"}`}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: "var(--theme-border)" }}
        >
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-cyan-300">
              MathPath Account
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {title}
            </h2>
          </div>
          <button
            className="math-icon-button h-10 w-10 rounded-2xl"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="math-icon-shell-blue h-9 w-9">{icon}</span>
        <h3 className="text-base font-black text-slate-950 dark:text-white">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function ProfileInfoRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
      style={{
        borderColor: "var(--theme-border)",
        background: "var(--theme-elevated-soft)",
      }}
    >
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm font-black text-slate-950 dark:text-white">
        {value || "Not Available"}
      </span>
    </div>
  );
}

function AccountToast({
  message,
  error,
  onClear,
}: {
  message: string | null;
  error: string | null;
  onClear: () => void;
}) {
  const VisibleMessage = error || message;
  if (!VisibleMessage) return null;

  return (
    <div className="fixed right-5 top-24 z-[220] max-w-sm math-pop-in">
      <div
        className={`flex items-start gap-3 rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl ${error ? "math-tone-danger" : "math-tone-success"}`}
      >
        {error ? (
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        )}
        <p className="flex-1 text-sm font-bold leading-6">{VisibleMessage}</p>
        <button
          className="text-xs font-black uppercase tracking-[0.16em] opacity-70 hover:opacity-100"
          onClick={onClear}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function accountCode(user: NonNullable<StoredUser>): string {
  if (user.student?.studentCode) return user.student.studentCode;
  if (user.teacher?.teacherCode) return user.teacher.teacherCode;
  return "";
}

function accountLoginId(user: NonNullable<StoredUser>): string {
  return (
    user.loginId ||
    user.email ||
    user.phone ||
    accountCode(user) ||
    "Not Available"
  );
}

function accountDetails(
  user: NonNullable<StoredUser>,
): { label: string; value: string }[] {
  const Details = [
    { label: "Name", value: user.fullName || "Not Available" },
    { label: "Role", value: displayUserRole(user.role) || "Not Available" },
    { label: "Login ID", value: accountLoginId(user) },
  ];

  if (
    user.role === "STUDENT" &&
    user.student?.studentCode &&
    user.student.studentCode !== accountLoginId(user)
  ) {
    Details.push({ label: "Student Code", value: user.student.studentCode });
  }

  if (
    user.role === "TEACHER" &&
    user.teacher?.teacherCode &&
    user.teacher.teacherCode !== accountLoginId(user)
  ) {
    Details.push({ label: "Teacher Code", value: user.teacher.teacherCode });
  }

  Details.push({
    label: "Account Status",
    value: user.isActive === false ? "Inactive" : "Active",
  });
  return Details;
}
