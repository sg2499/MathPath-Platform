import { test as Test, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";
import Fs from "node:fs";
import Path from "node:path";

LoadVerificationEnv();

const BaseUrl = TrimTrailingSlash(process.env.MATHPATH_BASE_URL || "http://localhost:3000");
const ScopeName = NormalizeScopeName(process.env.MATHPATH_SCOPE || "full");
const ReportRoot = Path.resolve(process.env.MATHPATH_REPORT_DIR || Path.join("verification-report", ScopeName));
const ScreenshotDir = Path.join(ReportRoot, "screenshots");
const SnapshotDir = Path.join(ReportRoot, "page-snapshots");
const DiagnosticDir = Path.join(ReportRoot, "diagnostics");
const AppDir = Path.resolve(process.cwd(), "app");
const MaxInteractionsPerPage = Number(process.env.MATHPATH_MAX_INTERACTIONS_PER_PAGE || "18");
const MaxDiscoveredLinksPerScope = Number(process.env.MATHPATH_MAX_DISCOVERED_LINKS_PER_SCOPE || "20");
const PageGotoTimeoutMs = Number(process.env.MATHPATH_PAGE_GOTO_TIMEOUT_MS || "22000");
const UiPauseMs = Number(process.env.MATHPATH_UI_PAUSE_MS || "500");

const RoleList = ["ADMIN", "TEACHER", "STUDENT"] as const;
type RoleName = (typeof RoleList)[number];
type ScopeRole = RoleName | "PUBLIC";
type MatchMode = "exact" | "prefix";

type ScopeDefinition = {
  Name: string;
  Description: string;
  IncludePublic?: boolean;
  Roles: RoleName[];
  Routes: Array<{ Mode: MatchMode; Value: string }>;
  DiscoverVisibleLinks?: boolean;
};

type RouteRecord = {
  Route: string;
  SourceFile: string;
  Role: RoleName | "PUBLIC";
  IsDynamic: boolean;
};

type DiagnosticEntry = {
  Role: string;
  Scope: string;
  Route: string;
  Message: string;
  Detail?: string;
  Url?: string;
  Status?: number;
  Time: string;
};

type RouteResult = {
  Role: string;
  Scope: string;
  Route: string;
  FinalUrl: string;
  Status: "VISITED" | "REDIRECTED_TO_LOGIN" | "FAILED" | "LOGIN_FAILED";
  Note?: string;
  Screenshot?: string;
  Time: string;
};

type SkippedRoute = {
  SourceFile: string;
  Reason: string;
  MissingParam?: string;
};

const Credentials: Record<RoleName, { Identifier: string; Password: string; Label: string; DefaultRoute: string }> = {
  ADMIN: {
    Identifier: process.env.MATHPATH_ADMIN_IDENTIFIER || "admin@mathpath.local",
    Password: process.env.MATHPATH_ADMIN_PASSWORD || "Admin@123",
    Label: "Admin",
    DefaultRoute: "/admin/dashboard",
  },
  TEACHER: {
    Identifier: process.env.MATHPATH_TEACHER_IDENTIFIER || "teacher@mathpath.local",
    Password: process.env.MATHPATH_TEACHER_PASSWORD || "Teacher@123",
    Label: "Teacher",
    DefaultRoute: "/teacher/dashboard",
  },
  STUDENT: {
    Identifier: process.env.MATHPATH_STUDENT_IDENTIFIER || "student@mathpath.local",
    Password: process.env.MATHPATH_STUDENT_PASSWORD || "Student@123",
    Label: "Student",
    DefaultRoute: "/student/dashboard",
  },
};

const DynamicParamValues: Record<string, string | undefined> = {
  studentCode: process.env.MATHPATH_SAMPLE_STUDENT_CODE || "MP-ST-001",
  moduleCode: process.env.MATHPATH_SAMPLE_MODULE_CODE || "YLM",
  levelCode: process.env.MATHPATH_SAMPLE_LEVEL_CODE || "YLM-L1",
  assignmentId: process.env.MATHPATH_SAMPLE_ASSIGNMENT_ID,
  assessmentId: process.env.MATHPATH_SAMPLE_ASSESSMENT_ID,
  attemptId: process.env.MATHPATH_SAMPLE_ATTEMPT_ID,
  dpsId: process.env.MATHPATH_SAMPLE_DPS_ID,
};

const ScopeDefinitions: Record<string, ScopeDefinition> = {
  full: {
    Name: "full",
    Description: "Full public + Admin + Teacher + Student platform regression sweep.",
    IncludePublic: true,
    Roles: ["ADMIN", "TEACHER", "STUDENT"],
    Routes: [{ Mode: "prefix", Value: "/" }],
    DiscoverVisibleLinks: true,
  },
  public: {
    Name: "public",
    Description: "Landing page and login screen only.",
    IncludePublic: true,
    Roles: [],
    Routes: [],
  },

  admin: ScopeRoleDefinition("admin", "All Admin tabs and Admin sub-routes.", "ADMIN", ["/admin"]),
  "admin-dashboard": ScopeRoleDefinition("admin-dashboard", "Admin Dashboard tab only.", "ADMIN", ["/admin/dashboard"], "exact"),
  "admin-curriculum": ScopeRoleDefinition("admin-curriculum", "Admin Curriculum tab plus DPS preview/detail sub-routes.", "ADMIN", ["/admin/curriculum", "/admin/dps"]),
  "admin-students": ScopeRoleDefinition("admin-students", "Admin Students tab plus student assessment sub-tab.", "ADMIN", ["/admin/students"]),
  "admin-teachers": ScopeRoleDefinition("admin-teachers", "Admin Teachers tab.", "ADMIN", ["/admin/teachers"]),
  "admin-assignments": ScopeRoleDefinition("admin-assignments", "Admin Practice Assignments tab, create flow, assignment detail, and student assignment workspace.", "ADMIN", ["/admin/assignments"]),
  "admin-assessments": ScopeRoleDefinition("admin-assessments", "Admin Assessment Assignments tab, create flow, assessment detail, and student assessment workspace.", "ADMIN", ["/admin/assessments"]),
  "admin-assessment-blueprints": ScopeRoleDefinition("admin-assessment-blueprints", "Admin Assessment Blueprint Builder tab.", "ADMIN", ["/admin/assessment-blueprints"]),
  "admin-assessment-readiness": ScopeRoleDefinition("admin-assessment-readiness", "Admin Assessment Readiness tab.", "ADMIN", ["/admin/assessment-readiness"]),
  "admin-results": ScopeRoleDefinition("admin-results", "Admin Results tab and result/DPS/attempt detail sub-routes.", "ADMIN", ["/admin/results"]),

  teacher: ScopeRoleDefinition("teacher", "All Teacher tabs and Teacher sub-routes.", "TEACHER", ["/teacher"]),
  "teacher-dashboard": ScopeRoleDefinition("teacher-dashboard", "Teacher Dashboard tab only.", "TEACHER", ["/teacher/dashboard"], "exact"),
  "teacher-students": ScopeRoleDefinition("teacher-students", "Teacher Students tab.", "TEACHER", ["/teacher/students"]),
  "teacher-assign-dps": ScopeRoleDefinition("teacher-assign-dps", "Teacher Assign DPS tab.", "TEACHER", ["/teacher/assign-dps"]),
  "teacher-tracker": ScopeRoleDefinition("teacher-tracker", "Teacher Practice Tracker tab and student tracker workspace.", "TEACHER", ["/teacher/assignment-tracker"]),
  "teacher-results": ScopeRoleDefinition("teacher-results", "Teacher Results tab, result detail, compatibility route, and student result workspace.", "TEACHER", ["/teacher/results", "/teacher/result"]),
  "teacher-assessments": ScopeRoleDefinition("teacher-assessments", "Teacher Assessments tab and student assessment workspace.", "TEACHER", ["/teacher/assessments"]),
  "teacher-assessment-readiness": ScopeRoleDefinition("teacher-assessment-readiness", "Teacher Assessment Readiness tab.", "TEACHER", ["/teacher/assessment-readiness"]),

  student: ScopeRoleDefinition("student", "All Student tabs and Student sub-routes.", "STUDENT", ["/student"]),
  "student-dashboard": ScopeRoleDefinition("student-dashboard", "Student Dashboard tab only.", "STUDENT", ["/student/dashboard"], "exact"),
  "student-practice": ScopeRoleDefinition("student-practice", "Student practice/attempt/DPS flow routes.", "STUDENT", ["/student/dps", "/student/attempt"]),
  "student-results": ScopeRoleDefinition("student-results", "Student Progress/Results tab, module detail, and result detail.", "STUDENT", ["/student/results", "/student/result"]),
  "student-assessments": ScopeRoleDefinition("student-assessments", "Student Assessments tab.", "STUDENT", ["/student/assessments"]),
  "student-assessment-readiness": ScopeRoleDefinition("student-assessment-readiness", "Student Assessment Readiness tab.", "STUDENT", ["/student/assessment-readiness"]),
};

const SelectedScope = ScopeDefinitions[ScopeName] || ScopeDefinitions.full;

const ReportState: {
  ConsoleErrors: DiagnosticEntry[];
  ConsoleWarnings: DiagnosticEntry[];
  PageErrors: DiagnosticEntry[];
  FailedRequests: DiagnosticEntry[];
  HttpErrors: DiagnosticEntry[];
  RouteResults: RouteResult[];
  SkippedRoutes: SkippedRoute[];
  DiscoveredLinks: RouteRecord[];
  LoginIssues: DiagnosticEntry[];
} = {
  ConsoleErrors: [],
  ConsoleWarnings: [],
  PageErrors: [],
  FailedRequests: [],
  HttpErrors: [],
  RouteResults: [],
  SkippedRoutes: [],
  DiscoveredLinks: [],
  LoginIssues: [],
};

PrepareReportFolders();
const StaticRouteManifest = DiscoverApplicationRoutes();
const CurrentDiagnosticRoute = { Value: "startup" };

Test.describe.configure({ mode: "serial", timeout: Number(process.env.MATHPATH_SCOPE_TIMEOUT_MS || "900000") });

Test.afterAll(async () => {
  WriteJson("scope.json", SelectedScope);
  WriteJson("console-errors.json", ReportState.ConsoleErrors);
  WriteJson("console-warnings.json", ReportState.ConsoleWarnings);
  WriteJson("page-errors.json", ReportState.PageErrors);
  WriteJson("failed-network-requests.json", ReportState.FailedRequests);
  WriteJson("http-errors.json", ReportState.HttpErrors);
  WriteJson("visited-routes.json", ReportState.RouteResults);
  WriteJson("skipped-dynamic-routes.json", ReportState.SkippedRoutes);
  WriteJson("discovered-links.json", ReportState.DiscoveredLinks);
  WriteJson("login-issues.json", ReportState.LoginIssues);
  WriteSummary();
});

if (SelectedScope.IncludePublic) {
  Test(`PUBLIC login and landing sweep — ${SelectedScope.Name}`, async ({ page: Page }) => {
    AttachDiagnostics(Page, "PUBLIC");
    await SafeInspectPublicScreens(Page);
  });
}

for (const Role of SelectedScope.Roles) {
  Test(`${Role} scoped sweep — ${SelectedScope.Name}`, async ({ page: Page, context: Context }) => {
    AttachDiagnostics(Page, Role);
    const LoggedIn = await LoginAs(Page, Context, Role);
    if (!LoggedIn) return;

    const RoleRoutes = RoutesForScope(Role, StaticRouteManifest, SelectedScope);
    const VisitedRoutes = new Set<string>();

    if (!RoleRoutes.length) {
      await VisitRouteAndInspect(Page, Role, Credentials[Role].DefaultRoute, VisitedRoutes);
    }

    for (const Route of RoleRoutes) {
      await VisitRouteAndInspect(Page, Role, Route.Route, VisitedRoutes);
    }

    if (SelectedScope.DiscoverVisibleLinks) {
      const DiscoveredRoutes = await DiscoverVisibleRoleLinks(Page, Role, SelectedScope);
      for (const Route of DiscoveredRoutes.slice(0, MaxDiscoveredLinksPerScope)) {
        if (!VisitedRoutes.has(Route.Route)) {
          ReportState.DiscoveredLinks.push(Route);
          await VisitRouteAndInspect(Page, Role, Route.Route, VisitedRoutes);
        }
      }
    }
  });
}

async function SafeInspectPublicScreens(Page: Page) {
  await SafeGoto(Page, "/");
  await CaptureState(Page, "PUBLIC", "/", "landing-or-redirect");
  await SafeGoto(Page, "/login");
  await CaptureState(Page, "PUBLIC", "/login", "login-default");

  for (const Role of RoleList) {
    const Label = Credentials[Role].Label;
    await ClickFirstVisible(Page.getByRole("button", { name: new RegExp(Label, "i") }));
    await WaitForUi(Page);
    await CaptureState(Page, "PUBLIC", "/login", `login-${Role.toLowerCase()}-tab`);
  }
}

async function LoginAs(Page: Page, Context: BrowserContext, Role: RoleName): Promise<boolean> {
  await Context.clearCookies();
  const LoginResult = await SafeGoto(Page, "/login");
  if (!LoginResult.Ok) {
    await RecordLoginIssue(Page, Role, "Could not open /login", LoginResult.Note);
    return false;
  }

  const Label = Credentials[Role].Label;
  await ClickFirstVisible(Page.getByRole("button", { name: new RegExp(Label, "i") }));
  await WaitForUi(Page);

  const IdentifierInput = await FirstVisible(Page, [
    'input[autocomplete="username"]',
    'input[name*="email" i]',
    'input[name*="user" i]',
    'input[name*="identifier" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="user" i]',
    'input[placeholder*="phone" i]',
    'input[type="email"]',
    'input[type="text"]',
    'input[type="tel"]',
    'input:not([type])',
  ]);

  const PasswordInput = await FirstVisible(Page, [
    'input[type="password"]',
    'input[name*="password" i]',
    'input[placeholder*="password" i]',
  ]);

  if (!IdentifierInput || !PasswordInput) {
    await RecordLoginIssue(Page, Role, "Login fields were not found after selecting role tab", "Check the captured login screenshot and update selectors or credentials if needed.");
    return false;
  }

  await IdentifierInput.fill(Credentials[Role].Identifier).catch(async (CaughtError) => {
    await RecordLoginIssue(Page, Role, "Could not fill identifier field", String(CaughtError));
  });
  await PasswordInput.fill(Credentials[Role].Password).catch(async (CaughtError) => {
    await RecordLoginIssue(Page, Role, "Could not fill password field", String(CaughtError));
  });
  await CaptureState(Page, Role, "/login", `${Role.toLowerCase()}-before-login`);

  const LoginButton = await FirstVisibleLocator([
    Page.getByRole("button", { name: new RegExp(`login as ${Label}`, "i") }),
    Page.getByRole("button", { name: /login/i }),
    Page.locator('button[type="submit"]'),
    Page.locator('input[type="submit"]'),
  ]);

  if (!LoginButton) {
    await RecordLoginIssue(Page, Role, "Login button was not found", "No visible Login / submit button was detected.");
    return false;
  }

  await LoginButton.click().catch(async (CaughtError) => {
    await RecordLoginIssue(Page, Role, "Login button click failed", String(CaughtError));
  });

  await Page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
  await Page.waitForURL((Url) => !Url.pathname.includes("/login"), { timeout: 12_000 }).catch(() => undefined);
  await WaitForUi(Page);

  await CaptureState(Page, Role, Credentials[Role].DefaultRoute, `${Role.toLowerCase()}-after-login`);

  if (new URL(Page.url()).pathname.includes("/login")) {
    await RecordLoginIssue(Page, Role, "Still on login page after login attempt", "Credentials may be wrong, backend may be unavailable, or login selectors may need adjustment.");
    return false;
  }

  return true;
}

async function RecordLoginIssue(Page: Page, Role: RoleName, Message: string, Detail?: string) {
  const Entry = {
    Role,
    Scope: SelectedScope.Name,
    Route: "/login",
    Message,
    Detail,
    Url: Page.url(),
    Time: NowIso(),
  };
  ReportState.LoginIssues.push(Entry);
  ReportState.RouteResults.push({
    Role,
    Scope: SelectedScope.Name,
    Route: "/login",
    FinalUrl: Page.url(),
    Status: "LOGIN_FAILED",
    Note: `${Message}${Detail ? ` — ${Detail}` : ""}`,
    Screenshot: await CaptureState(Page, Role, "/login", `${Role.toLowerCase()}-login-issue`),
    Time: NowIso(),
  });
}

async function VisitRouteAndInspect(Page: Page, Role: RoleName, Route: string, VisitedRoutes: Set<string>) {
  if (VisitedRoutes.has(Route)) return;
  VisitedRoutes.add(Route);
  CurrentDiagnosticRoute.Value = Route;

  const Result = await SafeGoto(Page, Route);
  const FinalUrl = Page.url();
  const RedirectedToLogin = new URL(FinalUrl).pathname.includes("/login");
  const BaseScreenshot = await CaptureState(Page, Role, Route, "base");

  ReportState.RouteResults.push({
    Role,
    Scope: SelectedScope.Name,
    Route,
    FinalUrl,
    Status: Result.Ok ? (RedirectedToLogin ? "REDIRECTED_TO_LOGIN" : "VISITED") : "FAILED",
    Note: Result.Note,
    Screenshot: BaseScreenshot,
    Time: NowIso(),
  });

  if (!Result.Ok || RedirectedToLogin) return;

  await CaptureSearchAndSelectStates(Page, Role, Route);
  await CaptureInternalTabStates(Page, Role, Route);
  await CaptureSafeControlStates(Page, Role, Route);
  await CaptureVisibleLinksSnapshot(Page, Role, Route);
}

async function SafeGoto(Page: Page, Route: string): Promise<{ Ok: boolean; Note?: string }> {
  const Url = AbsoluteUrl(Route);
  try {
    const Response = await Page.goto(Url, { waitUntil: "domcontentloaded", timeout: PageGotoTimeoutMs });
    await Page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await WaitForUi(Page);
    const Status = Response?.status();
    if (Status && Status >= 400) return { Ok: false, Note: `HTTP ${Status}` };
    return { Ok: true };
  } catch (CaughtError) {
    return { Ok: false, Note: CaughtError instanceof globalThis.Error ? CaughtError.message : String(CaughtError) };
  }
}

async function CaptureState(Page: Page, Role: string, Route: string, StateName: string) {
  const FileBase = SafeFileName(`${SelectedScope.Name}__${Role}__${Route}__${StateName}`);
  const ScreenshotPath = Path.join(ScreenshotDir, `${FileBase}.png`);
  const TextPath = Path.join(SnapshotDir, `${FileBase}.txt`);
  const HtmlPath = Path.join(SnapshotDir, `${FileBase}.html`);

  await Page.screenshot({ path: ScreenshotPath, fullPage: true, timeout: 8_000 }).catch(() => undefined);

  const BodyText = await Page.locator("body").innerText({ timeout: 4_000 }).catch(() => "");
  Fs.writeFileSync(TextPath, BodyText, "utf-8");

  const Html = await Page.content().catch(() => "");
  Fs.writeFileSync(HtmlPath, Html, "utf-8");

  return Path.relative(ReportRoot, ScreenshotPath).replaceAll("\\", "/");
}

async function CaptureSearchAndSelectStates(Page: Page, Role: RoleName, Route: string) {
  const SearchInputs = Page.locator('input[placeholder*="Search" i], input[aria-label*="Search" i]');
  const SearchCount = Math.min(await SearchInputs.count().catch(() => 0), 3);

  for (let Index = 0; Index < SearchCount; Index += 1) {
    const SearchInput = SearchInputs.nth(Index);
    if (!(await SearchInput.isVisible().catch(() => false))) continue;
    await SearchInput.fill("MP").catch(() => undefined);
    await WaitForUi(Page);
    await CaptureState(Page, Role, Route, `search-${Index + 1}-filled`);
    await SearchInput.fill("").catch(() => undefined);
    await WaitForUi(Page);
  }

  const Selects = Page.locator("select");
  const SelectCount = Math.min(await Selects.count().catch(() => 0), 6);

  for (let Index = 0; Index < SelectCount; Index += 1) {
    const Select = Selects.nth(Index);
    if (!(await Select.isVisible().catch(() => false))) continue;

    const Options = await Select.locator("option").evaluateAll((Nodes) =>
      Nodes.map((Node) => ({ Value: (Node as HTMLOptionElement).value, Text: (Node.textContent || "").trim() }))
    ).catch(() => [] as Array<{ Value: string; Text: string }>);

    const Candidate = Options.find((Option) => Option.Value && !/^all$/i.test(Option.Value));
    if (!Candidate) continue;

    await Select.selectOption(Candidate.Value).catch(() => undefined);
    await WaitForUi(Page);
    await CaptureState(Page, Role, Route, `select-${Index + 1}-${SafeFileName(Candidate.Text || Candidate.Value)}`);

    const Reset = Options[0]?.Value;
    if (Reset !== undefined) await Select.selectOption(Reset).catch(() => undefined);
    await WaitForUi(Page);
  }
}

async function CaptureInternalTabStates(Page: Page, Role: RoleName, Route: string) {
  const OriginalUrl = Page.url();
  const TabNames = await CollectControlNames(Page, /(overview|lessons|assigned work|student work|my attempts|attempt history|performance overview|lesson insights|manage|students|practice|assessments|performance|readiness|progress|dashboard|curriculum|teachers|results)/i);
  let Captured = 0;

  for (const Name of TabNames.slice(0, MaxInteractionsPerPage)) {
    if (!IsSafeControlName(Name)) continue;
    const Control = await FirstVisibleLocator([
      Page.getByRole("tab", { name: Name, exact: true }),
      Page.getByRole("button", { name: Name, exact: true }),
      Page.getByRole("link", { name: Name, exact: true }),
    ]);
    if (!Control) continue;

    await Control.click({ timeout: 5_000 }).catch(() => undefined);
    await WaitForUi(Page);
    Captured += 1;
    await CaptureState(Page, Role, Route, `tab-${Captured}-${SafeFileName(Name)}`);

    if (Page.url() !== OriginalUrl) {
      await SafeGoto(Page, Route);
    }
  }
}

async function CaptureSafeControlStates(Page: Page, Role: RoleName, Route: string) {
  const OriginalUrl = Page.url();
  const CandidateNames = await CollectControlNames(Page, /(needs attention|strength areas|growth watch|expand|collapse|view|review|details|preview|open|filter|show|hide)/i);
  let Captured = 0;

  for (const Name of CandidateNames) {
    if (Captured >= MaxInteractionsPerPage) break;
    if (!IsSafeControlName(Name)) continue;

    const Control = await FirstVisibleLocator([
      Page.getByRole("button", { name: Name, exact: true }),
      Page.getByRole("link", { name: Name, exact: true }),
      Page.locator(`[aria-label="${CssEscape(Name)}"]`),
    ]);
    if (!Control) continue;

    await Control.click({ timeout: 5_000 }).catch(() => undefined);
    await WaitForUi(Page);
    Captured += 1;
    await CaptureState(Page, Role, Route, `control-${Captured}-${SafeFileName(Name)}`);

    if (Page.url() !== OriginalUrl) {
      await SafeGoto(Page, Route);
    }
  }

  const ExpandedButtons = Page.locator('button[aria-expanded], [role="button"][aria-expanded]');
  const ExpandedCount = Math.min(await ExpandedButtons.count().catch(() => 0), Math.max(0, MaxInteractionsPerPage - Captured));

  for (let Index = 0; Index < ExpandedCount; Index += 1) {
    const Button = ExpandedButtons.nth(Index);
    if (!(await Button.isVisible().catch(() => false))) continue;
    const Name = await Button.innerText({ timeout: 1_500 }).catch(() => `aria-expanded-${Index + 1}`);
    if (!IsSafeControlName(Name)) continue;
    await Button.click({ timeout: 5_000 }).catch(() => undefined);
    await WaitForUi(Page);
    Captured += 1;
    await CaptureState(Page, Role, Route, `expanded-control-${Captured}-${SafeFileName(Name)}`);
  }
}

async function CollectControlNames(Page: Page, PriorityPattern: RegExp) {
  const Names = await Page.locator("button, a, [role='tab'], [role='button']").evaluateAll((Controls) =>
    Controls.map((Control) => {
      const Text = (Control.textContent || "").trim();
      const Aria = (Control.getAttribute("aria-label") || "").trim();
      const Title = (Control.getAttribute("title") || "").trim();
      return Text || Aria || Title;
    }).filter(Boolean)
  ).catch(() => [] as string[]);

  const UniqueNames = Array.from(new Set(Names.map((Name) => Name.replace(/\s+/g, " ").trim())));
  return UniqueNames.filter((Name) => PriorityPattern.test(Name));
}

function IsSafeControlName(Name: string) {
  const Normalized = Name.trim().toLowerCase();
  if (!Normalized) return false;
  const UnsafePattern = /(delete|remove|archive|deactivate|reset|submit|auto-submit|publish|save|confirm|yes|logout|log out|sign out|start attempt|start dps|start assessment|reopen|unlock|approve|assign now|create assignment|create assessment|new assessment|new blueprint|add student|add teacher)/i;
  if (UnsafePattern.test(Normalized)) return false;
  return true;
}

async function CaptureVisibleLinksSnapshot(Page: Page, Role: RoleName, Route: string) {
  const Links = await ExtractVisibleLinks(Page, Role, SelectedScope);
  const FileBase = SafeFileName(`${SelectedScope.Name}__${Role}__${Route}__visible-links`);
  Fs.writeFileSync(Path.join(SnapshotDir, `${FileBase}.json`), JSON.stringify(Links, null, 2), "utf-8");
}

async function DiscoverVisibleRoleLinks(Page: Page, Role: RoleName, Scope: ScopeDefinition): Promise<RouteRecord[]> {
  const Links = await ExtractVisibleLinks(Page, Role, Scope);
  return Links
    .filter((Link) => RouteMatchesScope(Link.Route, Scope))
    .map((Link) => ({ Route: Link.Route, Role, SourceFile: "visible-page-link", IsDynamic: true }));
}

async function ExtractVisibleLinks(Page: Page, Role: RoleName, Scope: ScopeDefinition) {
  const CurrentOrigin = new URL(BaseUrl).origin;
  const RolePrefix = `/${Role.toLowerCase()}`;

  const RawLinks = await Page.locator("a[href]").evaluateAll((Anchors) =>
    Anchors.map((Anchor) => ({
      Text: (Anchor.textContent || "").trim(),
      Href: (Anchor as HTMLAnchorElement).href,
    }))
  ).catch(() => [] as Array<{ Text: string; Href: string }>);

  const Links = RawLinks
    .map((Link) => {
      try {
        const Url = new URL(Link.Href);
        if (Url.origin !== CurrentOrigin) return null;
        const Route = `${Url.pathname}${Url.search}`;
        return { Text: Link.Text, Route };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{ Text: string; Route: string }>;

  const SafeLinks = Links.filter((Link) => {
    const Lower = `${Link.Text} ${Link.Route}`.toLowerCase();
    if (!Link.Route.startsWith(RolePrefix)) return false;
    if (!RouteMatchesScope(Link.Route, Scope)) return false;
    if (/(delete|archive|reset|logout|deactivate|remove|submit)/i.test(Lower)) return false;
    return true;
  });

  const Seen = new Set<string>();
  return SafeLinks.filter((Link) => {
    if (Seen.has(Link.Route)) return false;
    Seen.add(Link.Route);
    return true;
  });
}

function DiscoverApplicationRoutes(): RouteRecord[] {
  const PageFiles = WalkFiles(AppDir).filter((File) => File.endsWith(`${Path.sep}page.tsx`));
  const Routes: RouteRecord[] = [];

  for (const SourceFile of PageFiles) {
    const Result = RouteFromPageFile(SourceFile);
    if (!Result.Route) {
      ReportState.SkippedRoutes.push({
        SourceFile: Path.relative(process.cwd(), SourceFile).replaceAll("\\", "/"),
        Reason: Result.Reason || "Unable to resolve dynamic route",
        MissingParam: Result.MissingParam,
      });
      continue;
    }

    Routes.push({
      Route: Result.Route,
      SourceFile: Path.relative(process.cwd(), SourceFile).replaceAll("\\", "/"),
      Role: RoleFromRoute(Result.Route),
      IsDynamic: Result.IsDynamic,
    });
  }

  return Routes.sort((First, Second) => First.Route.localeCompare(Second.Route, undefined, { numeric: true }));
}

function RoutesForScope(Role: RoleName, Routes: RouteRecord[], Scope: ScopeDefinition) {
  return Routes
    .filter((Route) => Route.Role === Role)
    .filter((Route) => RouteMatchesScope(Route.Route, Scope))
    .sort((First, Second) => First.Route.localeCompare(Second.Route, undefined, { numeric: true }));
}

function RouteMatchesScope(Route: string, Scope: ScopeDefinition) {
  if (Scope.Name === "full") return true;
  return Scope.Routes.some((Rule) => Rule.Mode === "exact" ? Route === Rule.Value : Route === Rule.Value || Route.startsWith(`${Rule.Value}/`));
}

function RouteFromPageFile(SourceFile: string): { Route?: string; IsDynamic: boolean; Reason?: string; MissingParam?: string } {
  const Relative = Path.relative(AppDir, SourceFile).replaceAll("\\", "/").replace(/\/page\.tsx$/, "");
  if (!Relative) return { Route: "/", IsDynamic: false };

  const Parts = Relative.split("/").filter(Boolean);
  const RouteParts: string[] = [];
  let IsDynamic = false;

  for (const Part of Parts) {
    const DynamicMatch = Part.match(/^\[([^\]]+)\]$/);
    if (!DynamicMatch) {
      RouteParts.push(Part);
      continue;
    }

    IsDynamic = true;
    const ParamName = DynamicMatch[1];
    const ParamValue = DynamicParamValues[ParamName];
    if (!ParamValue) {
      return {
        IsDynamic,
        Reason: `Missing sample value for [${ParamName}]. Add ${EnvNameForDynamicParam(ParamName)} in .env.verification if you want this dynamic route captured.`,
        MissingParam: ParamName,
      };
    }
    RouteParts.push(encodeURIComponent(ParamValue));
  }

  let Route = `/${RouteParts.join("/")}`;
  if (Route.startsWith("/student/results/module/") && DynamicParamValues.levelCode) {
    Route += `?level=${encodeURIComponent(DynamicParamValues.levelCode)}`;
  }
  return { Route, IsDynamic };
}

function RoleFromRoute(Route: string): ScopeRole {
  if (Route.startsWith("/admin")) return "ADMIN";
  if (Route.startsWith("/teacher")) return "TEACHER";
  if (Route.startsWith("/student")) return "STUDENT";
  return "PUBLIC";
}

function AttachDiagnostics(Page: Page, Role: string) {
  Page.on("console", (Message) => {
    const Entry: DiagnosticEntry = {
      Role,
      Scope: SelectedScope.Name,
      Route: CurrentDiagnosticRoute.Value,
      Message: Message.text(),
      Detail: Message.type(),
      Url: Page.url(),
      Time: NowIso(),
    };
    if (Message.type() === "error") ReportState.ConsoleErrors.push(Entry);
    if (Message.type() === "warning") ReportState.ConsoleWarnings.push(Entry);
  });

  Page.on("pageerror", (CaughtError) => {
    ReportState.PageErrors.push({
      Role,
      Scope: SelectedScope.Name,
      Route: CurrentDiagnosticRoute.Value,
      Message: CaughtError.message,
      Detail: CaughtError.stack,
      Url: Page.url(),
      Time: NowIso(),
    });
  });

  Page.on("requestfailed", (Request) => {
    ReportState.FailedRequests.push({
      Role,
      Scope: SelectedScope.Name,
      Route: CurrentDiagnosticRoute.Value,
      Message: Request.failure()?.errorText || "Request failed",
      Url: Request.url(),
      Time: NowIso(),
    });
  });

  Page.on("response", (Response: Response) => {
    const Status = Response.status();
    const Url = Response.url();
    if (Status >= 400 && !/favicon\.ico/i.test(Url)) {
      ReportState.HttpErrors.push({
        Role,
        Scope: SelectedScope.Name,
        Route: CurrentDiagnosticRoute.Value,
        Message: Response.statusText(),
        Url,
        Status,
        Time: NowIso(),
      });
    }
  });
}

async function ClickFirstVisible(Locator: Locator) {
  const Count = await Locator.count().catch(() => 0);
  for (let Index = 0; Index < Count; Index += 1) {
    const Candidate = Locator.nth(Index);
    if (await Candidate.isVisible().catch(() => false)) {
      await Candidate.click().catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function FirstVisible(Page: Page, Selectors: string[]) {
  for (const Selector of Selectors) {
    const Locator = Page.locator(Selector);
    const Count = await Locator.count().catch(() => 0);
    for (let Index = 0; Index < Count; Index += 1) {
      const Candidate = Locator.nth(Index);
      if (await Candidate.isVisible().catch(() => false)) return Candidate;
    }
  }
  return null;
}

async function FirstVisibleLocator(Locators: Locator[]) {
  for (const Locator of Locators) {
    const Count = await Locator.count().catch(() => 0);
    for (let Index = 0; Index < Count; Index += 1) {
      const Candidate = Locator.nth(Index);
      if (await Candidate.isVisible().catch(() => false)) return Candidate;
    }
  }
  return null;
}

async function WaitForUi(Page: Page) {
  await Page.waitForTimeout(UiPauseMs);
}

function PrepareReportFolders() {
  Fs.rmSync(ReportRoot, { recursive: true, force: true });
  Fs.mkdirSync(ScreenshotDir, { recursive: true });
  Fs.mkdirSync(SnapshotDir, { recursive: true });
  Fs.mkdirSync(DiagnosticDir, { recursive: true });
}

function WriteJson(FileName: string, Data: unknown) {
  Fs.writeFileSync(Path.join(DiagnosticDir, FileName), JSON.stringify(Data, null, 2), "utf-8");
}

function WriteSummary() {
  const ScopeRoutes = StaticRouteManifest.filter((Route) => Route.Role !== "PUBLIC" && RouteMatchesScope(Route.Route, SelectedScope));
  const TotalVisited = ReportState.RouteResults.length;
  const Failed = ReportState.RouteResults.filter((Route) => Route.Status === "FAILED");
  const LoginFailed = ReportState.RouteResults.filter((Route) => Route.Status === "LOGIN_FAILED");
  const Redirected = ReportState.RouteResults.filter((Route) => Route.Status === "REDIRECTED_TO_LOGIN");
  const Lines = [
    "# MathPath Platform Verification Report",
    "",
    `Generated: ${NowIso()}`,
    `Scope: ${SelectedScope.Name}`,
    `Description: ${SelectedScope.Description}`,
    `Base URL: ${BaseUrl}`,
    "",
    "## Coverage Summary",
    "",
    `- Matching static app routes for this scope: ${ScopeRoutes.length}`,
    `- Routes/screens visited: ${TotalVisited}`,
    `- Discovered visible links queued: ${ReportState.DiscoveredLinks.length}`,
    `- Dynamic routes skipped because sample IDs were missing: ${ReportState.SkippedRoutes.length}`,
    `- Login issues: ${LoginFailed.length}`,
    `- Failed route visits: ${Failed.length}`,
    `- Routes redirected to login: ${Redirected.length}`,
    "",
    "## Diagnostics Summary",
    "",
    `- Console errors: ${ReportState.ConsoleErrors.length}`,
    `- Console warnings: ${ReportState.ConsoleWarnings.length}`,
    `- Page errors: ${ReportState.PageErrors.length}`,
    `- Failed network requests: ${ReportState.FailedRequests.length}`,
    `- HTTP 4xx/5xx responses: ${ReportState.HttpErrors.length}`,
    "",
    "## Important Files",
    "",
    "- Full-page screenshots: `screenshots/`",
    "- Text and HTML snapshots: `page-snapshots/`",
    "- Console/network diagnostics: `diagnostics/`",
    "- Playwright HTML report: `playwright-html/`",
    "",
    "## Visited Routes",
    "",
    ...ListOrNone(ReportState.RouteResults.map((Item) => `- ${Item.Status}: ${Item.Role} ${Item.Route} → ${Item.FinalUrl}`)),
    "",
    "## Login Issues",
    "",
    ...ListOrNone(ReportState.LoginIssues.map((Item) => `- ${Item.Role}: ${Item.Message}${Item.Detail ? ` — ${Item.Detail}` : ""}`)),
    "",
    "## Failed Routes",
    "",
    ...ListOrNone(Failed.map((Item) => `- ${Item.Role} ${Item.Route} → ${Item.Note || Item.FinalUrl}`)),
    "",
    "## Routes Redirected To Login",
    "",
    ...ListOrNone(Redirected.map((Item) => `- ${Item.Role} ${Item.Route}`)),
    "",
    "## Skipped Dynamic Routes",
    "",
    ...ListOrNone(ReportState.SkippedRoutes.map((Item) => `- ${Item.SourceFile}: ${Item.Reason}`)),
  ];

  Fs.writeFileSync(Path.join(ReportRoot, "summary.md"), Lines.join("\n"), "utf-8");
}

function ScopeRoleDefinition(Name: string, Description: string, Role: RoleName, Values: string[], Mode: MatchMode = "prefix"): ScopeDefinition {
  return {
    Name,
    Description,
    Roles: [Role],
    Routes: Values.map((Value) => ({ Mode, Value })),
    DiscoverVisibleLinks: true,
  };
}

function ListOrNone(Items: string[]) {
  return Items.length ? Items : ["- None"];
}

function WalkFiles(Directory: string): string[] {
  if (!Fs.existsSync(Directory)) return [];
  const Entries = Fs.readdirSync(Directory, { withFileTypes: true });
  const Files: string[] = [];
  for (const Entry of Entries) {
    const FullPath = Path.join(Directory, Entry.name);
    if (Entry.isDirectory()) Files.push(...WalkFiles(FullPath));
    if (Entry.isFile()) Files.push(FullPath);
  }
  return Files;
}

function AbsoluteUrl(Route: string) {
  if (/^https?:\/\//i.test(Route)) return Route;
  return `${BaseUrl}${Route.startsWith("/") ? Route : `/${Route}`}`;
}

function SafeFileName(Input: string) {
  return Input
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170) || "capture";
}

function CssEscape(Input: string) {
  return Input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function TrimTrailingSlash(Value: string) {
  return Value.replace(/\/$/, "");
}

function NowIso() {
  return new Date().toISOString();
}

function NormalizeScopeName(Value: string) {
  return Value.trim().toLowerCase().replace(/_/g, "-") || "full";
}

function EnvNameForDynamicParam(ParamName: string) {
  return `MATHPATH_SAMPLE_${ParamName.replace(/[A-Z]/g, (Value) => `_${Value}`).toUpperCase()}`;
}

function LoadVerificationEnv() {
  const EnvPath = Path.resolve(process.cwd(), ".env.verification");
  if (!Fs.existsSync(EnvPath)) return;

  const Lines = Fs.readFileSync(EnvPath, "utf-8").split(/\r?\n/);
  for (const Line of Lines) {
    const Trimmed = Line.trim();
    if (!Trimmed || Trimmed.startsWith("#")) continue;
    const EqualIndex = Trimmed.indexOf("=");
    if (EqualIndex < 0) continue;
    const Key = Trimmed.slice(0, EqualIndex).trim();
    const Value = Trimmed.slice(EqualIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[Key]) process.env[Key] = Value;
  }
}
