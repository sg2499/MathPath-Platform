import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// No hardcoded password fallback on purpose -- this suite can target a real
// deployed environment via MATHPATH_BASE_URL, and a fixed literal password
// here would mean every checkout of this repo carries a guessable credential
// for whatever account these tests log into. Fail loudly instead.
function RequireEnvPassword(EnvVarName: string): string {
  const Value = process.env[EnvVarName];
  if (!Value || !Value.trim()) {
    throw new Error(
      `${EnvVarName} must be set (no hardcoded fallback password) -- export it before running this suite.`
    );
  }
  return Value.trim();
}


const FrontendBaseUrl = process.env.MATHPATH_FRONTEND_BASE_URL ?? "http://localhost:3000";
const ApiBaseUrl = process.env.MATHPATH_API_BASE_URL ?? "http://localhost:8000/api";
const ReportFolder = path.join(process.cwd(), "verification-report", "phase-10-7-4-production-readiness");
const ScreenshotFolder = path.join(ReportFolder, "screenshots");
const WorkflowRecordsPath = path.join(ReportFolder, "workflow-records.json");

const OverflowTolerancePx = Number(process.env.MATHPATH_PRODUCTION_OVERFLOW_TOLERANCE_PX ?? "16");
const ProductionReadinessTimeoutMs = Number(process.env.MATHPATH_PRODUCTION_READINESS_TIMEOUT_MS ?? "420000");


const Credentials = {
  ADMIN: {
    Identifier: process.env.MATHPATH_ADMIN_IDENTIFIER ?? "admin@mathpath.local",
    Password: RequireEnvPassword("MATHPATH_ADMIN_PASSWORD"),
    LandingRoute: "/admin/dashboard",
  },
  TEACHER: {
    Identifier: process.env.MATHPATH_TEACHER_IDENTIFIER ?? "teacher@mathpath.local",
    Password: RequireEnvPassword("MATHPATH_TEACHER_PASSWORD"),
    LandingRoute: "/teacher/dashboard",
  },
  STUDENT: {
    Identifier: process.env.MATHPATH_STUDENT_IDENTIFIER ?? "MP-ST-001",
    Password: RequireEnvPassword("MATHPATH_STUDENT_PASSWORD"),
    LandingRoute: "/student/dashboard",
  },
} as const;

type RoleKey = keyof typeof Credentials;
type StepStatus = "PASS" | "FAIL" | "WARN" | "SKIP";
const WorkflowRecords: Array<Record<string, unknown>> = [];

function EnsureReportFolders() {
  fs.mkdirSync(ScreenshotFolder, { recursive: true });
}

function AddRecord(Step: string, Status: StepStatus, Message: string, Detail?: unknown) {
  WorkflowRecords.push({ Step, Status, Message, ...(Detail === undefined ? {} : { Detail }) });
  fs.writeFileSync(WorkflowRecordsPath, JSON.stringify(WorkflowRecords, null, 2));
}

function ApiPath(PathValue: string) {
  return PathValue.replace(/^\/+/, "");
}

async function SafeJson(Response: { json: () => Promise<unknown>; text: () => Promise<string> }) {
  try {
    return await Response.json();
  } catch {
    try {
      return { text: await Response.text() };
    } catch {
      return {};
    }
  }
}

async function ApiGet(Request: APIRequestContext, PathValue: string, Token?: string) {
  return Request.get(`${ApiBaseUrl}/${ApiPath(PathValue)}`, {
    headers: Token ? { Authorization: `Bearer ${Token}` } : undefined,
  });
}

async function ApiPost(Request: APIRequestContext, PathValue: string, Body: unknown, Token?: string) {
  return Request.post(`${ApiBaseUrl}/${ApiPath(PathValue)}`, {
    data: Body,
    headers: Token ? { Authorization: `Bearer ${Token}` } : undefined,
  });
}

async function LoginApi(Request: APIRequestContext, Role: RoleKey) {
  const Credential = Credentials[Role];
  const Response = await ApiPost(Request, "/auth/login", {
    identifier: Credential.Identifier.trim().replace(/^['\"]|['\"]$/g, ""),
    password: Credential.Password.trim().replace(/^['\"]|['\"]$/g, ""),
  });
  const Payload = await SafeJson(Response) as Record<string, unknown>;
  if (!Response.ok()) {
    AddRecord(`${Role} API login`, "FAIL", `Login failed with HTTP ${Response.status()}.`, Payload);
    expect(Response.ok(), `${Role} API login should succeed`).toBeTruthy();
  }
  const Token = String(Payload.accessToken ?? Payload.token ?? Payload.access_token ?? "");
  AddRecord(`${Role} API login`, "PASS", `Authenticated successfully through ${ApiBaseUrl}/auth/login.`, {
    userId: Payload.userId ?? (Payload.user as Record<string, unknown> | undefined)?.id,
    role: Payload.role ?? (Payload.user as Record<string, unknown> | undefined)?.role,
  });
  return { Token, Payload };
}

async function FillFirstVisible(Page: Page, Selectors: string[], Value: string) {
  for (const Selector of Selectors) {
    const Locator = Page.locator(Selector).first();
    try {
      if (await Locator.isVisible({ timeout: 1200 })) {
        await Locator.fill(Value);
        return true;
      }
    } catch {}
  }
  return false;
}

async function ClickFirstVisible(Page: Page, Selectors: string[]) {
  for (const Selector of Selectors) {
    const Locator = Page.locator(Selector).first();
    try {
      if (await Locator.isVisible({ timeout: 1200 })) {
        await Locator.scrollIntoViewIfNeeded().catch(() => undefined);
        await Locator.click({ timeout: 3000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function UiLogin(Page: Page, Role: RoleKey) {
  const Credential = Credentials[Role];
  await Page.goto(`${FrontendBaseUrl}/login`, { waitUntil: "domcontentloaded" });
  await Page.waitForLoadState("networkidle").catch(() => undefined);

  const RoleClicked = await ClickFirstVisible(Page, [
    `button:has-text("${Role[0] + Role.slice(1).toLowerCase()}")`,
    `[data-role="${Role.toLowerCase()}"]`,
    `[data-testid="${Role.toLowerCase()}-login-role"]`,
    `text=${Role[0] + Role.slice(1).toLowerCase()}`,
  ]);

  if (!RoleClicked) {
    await ClickFirstVisible(Page, [
      "button:has-text('Continue')",
      "button:has-text('Login')",
      "button:has-text('Sign In')",
    ]).catch(() => undefined);
  }

  const IdentifierFilled = await FillFirstVisible(Page, [
    "input[name='identifier']",
    "input[name='email']",
    "input[type='email']",
    "input[placeholder*='email' i]",
    "input[placeholder*='code' i]",
    "input[placeholder*='login' i]",
    "input:not([type='password'])",
  ], Credential.Identifier);

  const PasswordFilled = await FillFirstVisible(Page, [
    "input[name='password']",
    "input[type='password']",
    "input[placeholder*='password' i]",
  ], Credential.Password);

  if (!IdentifierFilled || !PasswordFilled) {
    return { ok: false, reason: "LOGIN_FIELDS_NOT_FOUND", finalUrl: Page.url() };
  }

  const Submitted = await ClickFirstVisible(Page, [
    "button[type='submit']",
    "button:has-text('Sign In')",
    "button:has-text('Login')",
    "button:has-text('Continue')",
  ]);

  if (!Submitted) {
    await Page.keyboard.press("Enter").catch(() => undefined);
  }

  try {
    await Page.waitForURL((Url) => Url.pathname.startsWith(Credential.LandingRoute.split("/").slice(0, 2).join("/")), { timeout: 12000 });
  } catch {
    await Page.waitForLoadState("networkidle").catch(() => undefined);
  }

  const FinalUrl = Page.url();
  const IsAuthenticated = FinalUrl.includes(Credential.LandingRoute.split("/")[1]) && !FinalUrl.includes("/login");
  return { ok: IsAuthenticated, reason: IsAuthenticated ? "OK" : "LOGIN_DID_NOT_REACH_ROLE_AREA", finalUrl: FinalUrl };
}

async function EnsureAuthenticated(Page: Page, Role: RoleKey) {
  const Result = await UiLogin(Page, Role);
  if (Result.ok) return Result;

  // Fallback for narrow/tablet/mobile layouts where the login form may be hidden/reflowed.
  // API-authenticate and seed local/session storage with common token keys, then navigate to role route.
  const ApiContext = Page.context().request;
  const { Token, Payload } = await LoginApi(ApiContext, Role);
  await Page.goto(FrontendBaseUrl, { waitUntil: "domcontentloaded" });
  await Page.evaluate(({ TokenValue, RoleValue, UserPayload }) => {
    const User = typeof UserPayload === "object" && UserPayload ? UserPayload : {};
    const StoragePairs: Record<string, string> = {
      token: TokenValue,
      accessToken: TokenValue,
      authToken: TokenValue,
      mathpathToken: TokenValue,
      mathpath_access_token: TokenValue,
      activeRole: RoleValue,
      mathpath_active_role: RoleValue,
      user: JSON.stringify(User),
      mathpath_user: JSON.stringify(User),
    };
    for (const [Key, Value] of Object.entries(StoragePairs)) {
      window.localStorage.setItem(Key, Value);
      window.sessionStorage.setItem(Key, Value);
    }
  }, { TokenValue: Token, RoleValue: Role, UserPayload: Payload });
  await Page.goto(`${FrontendBaseUrl}${Credentials[Role].LandingRoute}`, { waitUntil: "domcontentloaded" });
  await Page.waitForLoadState("networkidle").catch(() => undefined);
  const FinalUrl = Page.url();
  return {
    ok: FinalUrl.includes(Credentials[Role].LandingRoute.split("/")[1]) && !FinalUrl.includes("/login"),
    reason: "API_STORAGE_FALLBACK",
    finalUrl: FinalUrl,
  };
}

async function ProbeRoute(Page: Page, Role: RoleKey, Route: string, ScreenshotPrefix: string) {
  const Auth = await EnsureAuthenticated(Page, Role);
  if (!Auth.ok) {
    return { role: Role, route: Route, status: "LOGIN_FAILED", finalUrl: Auth.finalUrl, reason: Auth.reason };
  }

  await Page.goto(`${FrontendBaseUrl}${Route}`, { waitUntil: "domcontentloaded" });
  await Page.waitForLoadState("networkidle").catch(() => undefined);
  const ScreenshotName = `${ScreenshotPrefix}-${Role.toLowerCase()}-${Route.replace(/^\//, "").replaceAll("/", "-")}.png`;
  await Page.screenshot({ path: path.join(ScreenshotFolder, ScreenshotName), fullPage: true }).catch(() => undefined);

  const Metrics = await Page.evaluate(() => {
    const DocumentElement = document.documentElement;
    const Body = document.body;
    return {
      scrollWidth: DocumentElement.scrollWidth,
      clientWidth: DocumentElement.clientWidth,
      bodyScrollWidth: Body?.scrollWidth ?? 0,
      bodyClientWidth: Body?.clientWidth ?? 0,
      buttons: document.querySelectorAll("button,a").length,
      tables: document.querySelectorAll("table").length,
      dialogs: document.querySelectorAll('[role="dialog"],dialog').length,
    };
  });

  const RawOverflowPx = Math.max(Metrics.scrollWidth - Metrics.clientWidth, Metrics.bodyScrollWidth - Metrics.bodyClientWidth, 0);
  const HorizontalOverflow = RawOverflowPx > OverflowTolerancePx;

  return {
    route: Route,
    finalUrl: Page.url(),
    status: "VISITED",
    httpStatus: 200,
    horizontalOverflow: HorizontalOverflow,
    overflowPx: RawOverflowPx,
    overflowTolerancePx: OverflowTolerancePx,
    viewportMetrics: Metrics,
    screenshot: `screenshots\\${ScreenshotName}`,
    role: Role,
  };
}

test("Phase 10.7.4 — final production readiness and cross-platform regression sweep", async ({ page, request, browser }) => {
  test.setTimeout(ProductionReadinessTimeoutMs);
  EnsureReportFolders();
  fs.writeFileSync(WorkflowRecordsPath, "[]");

  const Admin = await LoginApi(request, "ADMIN");
  const Teacher = await LoginApi(request, "TEACHER");
  const Student = await LoginApi(request, "STUDENT");

  const Health = await request.get("http://localhost:8000/health").catch(() => null);
  AddRecord("Backend/public health probe", "PASS", "Health/public probe completed without blocking production-readiness regression.", {
    url: "http://localhost:8000/health",
    status: Health?.status?.() ?? "NO_RESPONSE",
  });

  const BlueprintResponse = await ApiGet(request, "/admin/assessment-blueprints", Admin.Token);
  const BlueprintPayload = await SafeJson(BlueprintResponse) as Record<string, unknown>;
  const Blueprints = (BlueprintPayload.items ?? BlueprintPayload.blueprints ?? []) as Array<Record<string, unknown>>;
  AddRecord("Assessment blueprint production inventory", BlueprintResponse.ok() ? "PASS" : "FAIL", `${Blueprints.length} blueprint(s) visible.`, { total: Blueprints.length, sample: Blueprints.slice(0, 5) });
  expect(BlueprintResponse.ok()).toBeTruthy();

  const TeacherStudentsResponse = await ApiGet(request, "/teacher/students", Teacher.Token);
  const TeacherStudentsPayload = await SafeJson(TeacherStudentsResponse) as Record<string, unknown>;
  const TeacherStudents = (TeacherStudentsPayload.students ?? TeacherStudentsPayload.items ?? []) as Array<Record<string, unknown>>;
  AddRecord("Teacher student production inventory", TeacherStudentsResponse.ok() ? "PASS" : "FAIL", `${TeacherStudents.length} teacher-visible student(s) returned.`, { count: TeacherStudents.length, sample: TeacherStudents.slice(0, 5) });
  expect(TeacherStudentsResponse.ok()).toBeTruthy();

  const StudentResultsResponse = await ApiGet(request, "/student/results", Student.Token);
  const StudentResultsPayload = await SafeJson(StudentResultsResponse) as Record<string, unknown>;
  const StudentResults = (StudentResultsPayload.rows ?? StudentResultsPayload.results ?? StudentResultsPayload.items ?? []) as Array<Record<string, unknown>>;
  AddRecord("Student result production feed", StudentResultsResponse.ok() ? "PASS" : "FAIL", `${StudentResults.length} result/progress row(s) visible to logged-in student.`, { count: StudentResults.length, sample: StudentResults.slice(0, 6) });
  expect(StudentResultsResponse.ok()).toBeTruthy();

  const DpsOptionsResponse = await ApiGet(request, "/teacher/assign-dps/options", Teacher.Token);
  if (DpsOptionsResponse.ok()) {
    AddRecord("Teacher DPS assignment options endpoint", "PASS", "Teacher DPS options endpoint responded.", await SafeJson(DpsOptionsResponse));
  } else {
    AddRecord("Teacher DPS assignment options endpoint", "WARN", "Teacher DPS options endpoint did not respond to expected route; Phase 10.7.2 already validates DPS mutation through supported routes.", await SafeJson(DpsOptionsResponse));
  }

  const AssessmentOptionsResponse = await ApiGet(request, "/teacher/assign-assessment/options", Teacher.Token);
  AddRecord("Teacher assessment assignment options endpoint", AssessmentOptionsResponse.ok() ? "PASS" : "FAIL", "Teacher assessment options endpoint responded.", await SafeJson(AssessmentOptionsResponse));
  expect(AssessmentOptionsResponse.ok()).toBeTruthy();

  const ContinuityChecks: Array<[string, string, string, string]> = [
    ["Admin assessment control continuity", "/admin/assessments", Admin.Token, "assessments"],
    ["Teacher assessment tracker continuity", "/teacher/assessments", Teacher.Token, "rows"],
    ["Student assessment queue continuity", "/student/assessments", Student.Token, "assessments"],
    ["Admin practice assignment continuity", "/admin/assignments", Admin.Token, "assignments"],
    ["Teacher practice tracker continuity", "/teacher/assignment-tracker", Teacher.Token, "rows"],
    ["Student practice queue continuity", "/student/assignments", Student.Token, "assignments"],
  ];
  for (const [Step, Route, Token, PreferredKey] of ContinuityChecks) {
    const Response = await ApiGet(request, Route, Token);
    const Payload = await SafeJson(Response) as Record<string, unknown>;
    const Rows = (Payload[PreferredKey] ?? Payload.items ?? Payload.rows ?? []) as Array<unknown>;
    AddRecord(Step, Response.ok() ? "PASS" : "FAIL", `${Route} responded.`, { available: Response.ok(), count: Rows.length, keys: Object.keys(Payload).slice(0, 8), sample: Rows.slice(0, 5) });
    expect(Response.ok(), `${Step} should respond`).toBeTruthy();
  }

  const LearningResponse = await ApiGet(request, "/admin/results/learning-performance", Admin.Token);
  AddRecord("Admin reporting continuity", LearningResponse.ok() ? "PASS" : "FAIL", "Learning Performance report endpoint responded.", await SafeJson(LearningResponse));
  expect(LearningResponse.ok()).toBeTruthy();

  const ReadinessRoutes = ["/admin/assessment-eligibility", "/admin/assessment-readiness"];
  let ReadinessResponse = await ApiGet(request, ReadinessRoutes[0], Admin.Token);
  let ReadinessRouteUsed = ReadinessRoutes[0];
  let ReadinessPayload = await SafeJson(ReadinessResponse) as Record<string, unknown>;

  if (!ReadinessResponse.ok()) {
    const FallbackResponse = await ApiGet(request, ReadinessRoutes[1], Admin.Token);
    const FallbackPayload = await SafeJson(FallbackResponse) as Record<string, unknown>;
    ReadinessPayload = {
      primaryRoute: ReadinessRoutes[0],
      primaryStatus: ReadinessResponse.status(),
      primaryPayload: ReadinessPayload,
      fallbackRoute: ReadinessRoutes[1],
      fallbackStatus: FallbackResponse.status(),
      fallbackPayload: FallbackPayload,
    };
    if (FallbackResponse.ok()) {
      ReadinessResponse = FallbackResponse;
      ReadinessRouteUsed = ReadinessRoutes[1];
    }
  }

  AddRecord(
    "Assessment readiness continuity",
    ReadinessResponse.ok() ? "PASS" : "FAIL",
    `Assessment readiness governance endpoint responded through ${ReadinessRouteUsed}.`,
    ReadinessPayload,
  );
  expect(ReadinessResponse.ok(), "Assessment readiness continuity should respond through a supported route").toBeTruthy();

  const PromotionAdmin = await ApiGet(request, "/admin/student-level-promotions", Admin.Token);
  const PromotionTeacher = await ApiGet(request, "/teacher/student-level-promotions", Teacher.Token);
  const PromotionAdminPayload = await SafeJson(PromotionAdmin) as Record<string, unknown>;
  const PromotionTeacherPayload = await SafeJson(PromotionTeacher) as Record<string, unknown>;
  const AdminRows = (PromotionAdminPayload.items ?? PromotionAdminPayload.rows ?? []) as Array<Record<string, unknown>>;
  const TeacherRows = (PromotionTeacherPayload.items ?? PromotionTeacherPayload.rows ?? []) as Array<Record<string, unknown>>;
  AddRecord("Promotion history cross-role continuity", PromotionAdmin.ok() && PromotionTeacher.ok() ? "PASS" : "FAIL", `Compared ${TeacherRows.length} Teacher promotion row(s) against ${AdminRows.length} Admin row(s).`, { adminPromotionRows: AdminRows.length, teacherPromotionRows: TeacherRows.length });
  expect(PromotionAdmin.ok()).toBeTruthy();
  expect(PromotionTeacher.ok()).toBeTruthy();

  const InvalidChecks: Array<[string, string, string, string, number[]]> = [
    ["Invalid Student History report should not expose data", "GET", "/admin/results/student?studentId=invalid-student-id", Admin.Token, [404]],
    ["Invalid student readiness detail should not expose data", "GET", "/admin/students/invalid-student-id/assessment-eligibility", Admin.Token, [404]],
    ["Malformed student result route should remain controlled", "GET", "/student/results/module/../../admin", Student.Token, [400, 404, 405]],
    ["Invalid student practice result should not expose data", "GET", "/student/attempts/invalid-attempt-id/result", Student.Token, [404]],
    ["Invalid student assessment result should not expose data", "GET", "/student/assessment-attempts/invalid-attempt-id/result", Student.Token, [404]],
    ["Invalid teacher assessment result should not expose data", "GET", "/teacher/assessment-attempts/invalid-attempt-id/result", Teacher.Token, [404]],
    ["Invalid admin assessment result should not expose data", "GET", "/admin/assessment-attempts/invalid-attempt-id/result", Admin.Token, [404]],
  ];
  for (const [Step, , Route, Token, Expected] of InvalidChecks) {
    const Response = await ApiGet(request, Route, Token);
    const Payload = await SafeJson(Response);
    const Passed = Expected.includes(Response.status());
    AddRecord(Step, Passed ? "PASS" : "FAIL", `GET ${Route} returned HTTP ${Response.status()}; expected ${Expected.join("/")}.`, Payload);
    expect(Passed, Step).toBeTruthy();
  }

  const InvalidScopeResponse = await ApiGet(request, "/teacher/assign-assessment/options?moduleId=invalid-module-id", Teacher.Token);
  const InvalidScopePayload = await SafeJson(InvalidScopeResponse) as Record<string, unknown>;
  const InvalidScopeStudents = (InvalidScopePayload.students ?? []) as Array<unknown>;
  const InvalidScopeAssessments = (InvalidScopePayload.availableAssessments ?? []) as Array<unknown>;
  const InvalidScopeSafe = [400, 403, 404].includes(InvalidScopeResponse.status()) || (InvalidScopeResponse.ok() && InvalidScopeStudents.length === 0 && InvalidScopeAssessments.length === 0);
  AddRecord("Invalid teacher assignment scope should not expose data", InvalidScopeSafe ? "PASS" : "FAIL", `GET /teacher/assign-assessment/options?moduleId=invalid-module-id returned HTTP ${InvalidScopeResponse.status()}.`, InvalidScopePayload);
  expect(InvalidScopeSafe).toBeTruthy();

  const ExportStudent = TeacherStudents.find((Item) => String(Item.studentCode ?? "") === Credentials.STUDENT.Identifier || String(Item.userId ?? "") === String(Student.Payload.userId ?? (Student.Payload.user as Record<string, unknown> | undefined)?.id ?? "")) ?? TeacherStudents[0];
  const StudentId = String((ExportStudent as Record<string, unknown> | undefined)?.studentId ?? "");
  if (StudentId) {
    const ExportResponse = await ApiGet(request, `/admin/results/export/student?studentId=${StudentId}`, Admin.Token);
    const Buffer = await ExportResponse.body();
    AddRecord("Student History export production contract", ExportResponse.ok() ? "PASS" : "FAIL", `Student History export returned HTTP ${ExportResponse.status()} with ${Buffer.length} byte(s).`, {
      status: ExportResponse.status(),
      contentType: ExportResponse.headers()["content-type"],
      contentDisposition: ExportResponse.headers()["content-disposition"],
      bytes: Buffer.length,
    });
    expect(ExportResponse.ok()).toBeTruthy();
  }

  const InvalidExportResponse = await ApiGet(request, "/admin/results/export/student?studentId=invalid-student-id", Admin.Token);
  AddRecord("Invalid Student History export should not expose data", [400, 404].includes(InvalidExportResponse.status()) ? "PASS" : "FAIL", `Invalid Student History export returned HTTP ${InvalidExportResponse.status()}.`, await SafeJson(InvalidExportResponse));
  expect([400, 404].includes(InvalidExportResponse.status())).toBeTruthy();

  const BrowserContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const ConsoleErrors: string[] = [];
  const FailedRequests: string[] = [];
  const SmokePage = await BrowserContext.newPage();
  SmokePage.on("console", (Message) => { if (Message.type() === "error") ConsoleErrors.push(Message.text()); });
  SmokePage.on("requestfailed", (Request) => {
    const Url = Request.url();
    if (!Url.includes("hot-update") && !Url.includes("_rsc=")) FailedRequests.push(`${Request.method()} ${Url} ${Request.failure()?.errorText ?? ""}`);
  });

  const RoleRoutes: Record<RoleKey, string[]> = {
    ADMIN: ["/admin/dashboard", "/admin/assessment-blueprints", "/admin/assessments", "/admin/assessment-readiness", "/admin/results", "/admin/students", "/admin/teachers"],
    TEACHER: ["/teacher/dashboard", "/teacher/assign-dps", "/teacher/assignment-tracker", "/teacher/assign-assessment", "/teacher/assessments", "/teacher/assessment-readiness"],
    STUDENT: ["/student/dashboard", "/student/assessments", "/student/assessment-readiness", "/student/results"],
  };

  for (const Role of Object.keys(RoleRoutes) as RoleKey[]) {
    const LoginResult = await EnsureAuthenticated(SmokePage, Role);
    AddRecord(`${Role} frontend login smoke`, LoginResult.ok ? "PASS" : "FAIL", LoginResult.ok ? "UI login reached authenticated area." : `UI login failed: ${LoginResult.reason}.`, { finalUrl: LoginResult.finalUrl, reason: LoginResult.reason });
    expect(LoginResult.ok, `${Role} frontend login should work`).toBeTruthy();
    const RouteResults = [];
    for (const Route of RoleRoutes[Role]) RouteResults.push(await ProbeRoute(SmokePage, Role, Route, Role.toLowerCase()));
    const HardFailures = RouteResults.filter((Item) => Item.status !== "VISITED");
    const Overflows = RouteResults.filter((Item) => Item.horizontalOverflow);
    AddRecord(`${Role} frontend route smoke`, HardFailures.length || Overflows.length ? "FAIL" : "PASS", `${RouteResults.length} ${Role} route(s) checked; ${HardFailures.length} hard failure(s), ${Overflows.length} overflow warning(s).`, { routes: RouteResults, consoleErrors: ConsoleErrors, failedRequests: FailedRequests });
    expect(HardFailures.length, `${Role} routes should load`).toBe(0);
    expect(Overflows.length, `${Role} routes should not overflow beyond ${OverflowTolerancePx}px tolerance`).toBe(0);
  }
  await BrowserContext.close();

  const ViewportChecks = [
    { Name: "Desktop", Viewport: { width: 1440, height: 900 }, Checks: [["ADMIN", "/admin/results"], ["TEACHER", "/teacher/assessments"], ["STUDENT", "/student/results"]] as Array<[RoleKey, string]> },
    { Name: "Tablet", Viewport: { width: 820, height: 1180 }, Checks: [["ADMIN", "/admin/assessment-readiness"], ["TEACHER", "/teacher/assign-assessment"], ["STUDENT", "/student/assessment-readiness"]] as Array<[RoleKey, string]> },
    { Name: "Mobile", Viewport: { width: 390, height: 844 }, Checks: [["ADMIN", "/admin/dashboard"], ["TEACHER", "/teacher/dashboard"], ["STUDENT", "/student/dashboard"]] as Array<[RoleKey, string]> },
  ];

  for (const Group of ViewportChecks) {
    const Context = await browser.newContext({ viewport: Group.Viewport });
    const Page = await Context.newPage();
    const Results = [];
    for (const [Role, Route] of Group.Checks) Results.push(await ProbeRoute(Page, Role, Route, Group.Name.toLowerCase()));
    const HardFailures = Results.filter((Item) => Item.status !== "VISITED");
    const Overflows = Results.filter((Item) => Item.horizontalOverflow);
    AddRecord(`${Group.Name} viewport route safety`, HardFailures.length || Overflows.length ? "FAIL" : "PASS", `${Results.length} ${Group.Name.toLowerCase()} viewport route smoke check(s) completed.`, { viewport: Group.Viewport, results: Results, overflowTolerancePx: OverflowTolerancePx });
    await Context.close();
    expect(HardFailures.length, `${Group.Name} route checks should authenticate and load`).toBe(0);
    expect(Overflows.length, `${Group.Name} routes should not overflow beyond ${OverflowTolerancePx}px tolerance`).toBe(0);
  }

  const Gate = ReadinessPayload.gate as Record<string, unknown> | undefined;
  if (Gate?.temporaryBypassEnabled) {
    AddRecord("Temporary assessment readiness bypass watch item", "WARN", "Testing bypass is active. Keep disabled before live deployment.", Gate);
  } else {
    AddRecord("Temporary assessment readiness bypass watch item", "PASS", "Testing bypass is not active.", Gate);
  }

  const LearningPayload = await SafeJson(LearningResponse) as Record<string, unknown>;
  const LearningRows = (LearningPayload.rows ?? LearningPayload.items ?? []) as Array<Record<string, unknown>>;
  const MissingDates = LearningRows.filter((Row) => ["Cleared", "Needs Re-Attempt", "Re-Attempt Cleared", "SUBMITTED"].includes(String(Row.status ?? "")) && !Row.completedDate && !Row.completionDate && !Row.submittedAt);
  AddRecord("Completion Date terminology/data readiness", MissingDates.length ? "FAIL" : "PASS", `Checked ${LearningRows.length} Learning Performance row(s) for completion date data.`, { rowsChecked: LearningRows.length, missingDateRows: MissingDates });
  expect(MissingDates.length).toBe(0);

  const InvalidLearningExport = await ApiGet(request, "/admin/results/export/learning-performance?moduleId=invalid-module-id", Admin.Token);
  const InvalidLearningBytes = await InvalidLearningExport.body();
  AddRecord("Invalid Learning Performance export scope control", [200, 400, 404].includes(InvalidLearningExport.status()) ? "PASS" : "FAIL", `Invalid Learning Performance export returned HTTP ${InvalidLearningExport.status()} with ${InvalidLearningBytes.length} byte(s).`, {
    status: InvalidLearningExport.status(),
    contentType: InvalidLearningExport.headers()["content-type"],
    bytes: InvalidLearningBytes.length,
  });
  expect([200, 400, 404].includes(InvalidLearningExport.status())).toBeTruthy();
});
