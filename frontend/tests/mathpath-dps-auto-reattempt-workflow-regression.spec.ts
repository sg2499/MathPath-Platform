import { expect, request, test, type APIRequestContext } from "@playwright/test";
import Fs from "node:fs";
import Path from "node:path";

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


LoadRegressionEnv();

type RoleName = "ADMIN" | "TEACHER" | "STUDENT";
type JsonRecord = Record<string, any>;

type AuthState = {
  Role: RoleName;
  Token: string;
  User: JsonRecord;
  Api: APIRequestContext;
};

type RegressionRecord = {
  Step: string;
  Status: "PASS" | "WARN" | "FAIL" | "SKIP";
  Message: string;
  Detail?: unknown;
};

const ApiBaseUrl = TrimTrailingSlash(process.env.MATHPATH_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api");
const ReportRoot = Path.resolve(process.env.MATHPATH_AUTO_REATTEMPT_REPORT_DIR || Path.join("verification-report", "phase-10-9-4-auto-reattempt"));
const DiagnosticsDir = Path.join(ReportRoot, "diagnostics");
const MutationMode = NormalizeMode(process.env.MATHPATH_AUTO_REATTEMPT_E2E_MODE || "simulation") === "mutation";
const TargetStudentCode = CleanEnvValue(process.env.MATHPATH_SAMPLE_STUDENT_CODE || "") || InferStudentCodeFromIdentifier(process.env.MATHPATH_STUDENT_IDENTIFIER || "");

const Credentials: Record<RoleName, { Identifier: string; Password: string }> = {
  ADMIN: {
    Identifier: CleanEnvValue(process.env.MATHPATH_ADMIN_IDENTIFIER) || "admin@mathpath.local",
    Password: RequireEnvPassword("MATHPATH_ADMIN_PASSWORD"),
  },
  TEACHER: {
    Identifier: CleanEnvValue(process.env.MATHPATH_TEACHER_IDENTIFIER) || "teacher@mathpath.local",
    Password: RequireEnvPassword("MATHPATH_TEACHER_PASSWORD"),
  },
  STUDENT: {
    Identifier: CleanEnvValue(process.env.MATHPATH_STUDENT_IDENTIFIER) || "student@mathpath.local",
    Password: RequireEnvPassword("MATHPATH_STUDENT_PASSWORD"),
  },
};

const RegressionLog: RegressionRecord[] = [];

PrepareReportFolders();

test.describe.configure({ mode: "serial", timeout: Number(process.env.MATHPATH_AUTO_REATTEMPT_TIMEOUT_MS || "600000") });

test.afterAll(async () => {
  WriteJson("workflow-records.json", RegressionLog);
  WriteSummary();
});

test("Phase 10.9.4G — DPS auto re-attempt cross-login regression contract", async () => {
  const Admin = await LoginAs("ADMIN");
  const Teacher = await LoginAs("TEACHER");
  const Student = await LoginAs("STUDENT");

  const StudentAssignments = await ValidateStudentPracticeQueue(Student);
  const AdminAssignments = await ValidateAdminPracticeInventory(Admin);
  const TeacherTracker = await ValidateTeacherPracticeTracker(Teacher);

  await ValidateCrossLoginAttemptChainVisibility(StudentAssignments, AdminAssignments, TeacherTracker);
  await ValidateNeedsReattemptUniqueCount(Admin, Teacher, Student);
  await ValidateManualInterventionQueue(Admin, Teacher);
  await ValidateResultMessageContract(Student, StudentAssignments);

  if (MutationMode) {
    await ValidateControlledMutationContract(Admin, Teacher, Student, StudentAssignments);
  } else {
    AddRecord("Controlled auto re-attempt mutation", "SKIP", "Simulation mode is active. Set MATHPATH_AUTO_REATTEMPT_E2E_MODE=mutation only with disposable test data.");
  }

  const Failures = RegressionLog.filter((Item) => Item.Status === "FAIL");
  expect(Failures, "Phase 10.9.4G auto re-attempt regression must not produce hard failures.").toHaveLength(0);

  await DisposeAuth(Admin, Teacher, Student);
});

async function LoginAs(Role: RoleName): Promise<AuthState> {
  const LoginApi = await request.newContext();
  const Attempts: JsonRecord[] = [];
  let Payload: JsonRecord | null = null;
  let SuccessfulUrl = "";

  for (const Url of BuildLoginCandidates()) {
    const Response = await LoginApi.post(Url, {
      data: {
        identifier: Credentials[Role].Identifier,
        password: Credentials[Role].Password,
      },
    });
    const Detail = await SafeJson(Response);
    Attempts.push({ url: Url, status: Response.status(), ok: Response.ok(), response: Detail });

    if (Response.ok()) {
      Payload = Detail && typeof Detail === "object" ? (Detail as JsonRecord) : null;
      SuccessfulUrl = Url;
      break;
    }
  }

  if (!Payload) {
    const Diagnostic = {
      role: Role,
      apiBaseUrl: ApiBaseUrl,
      identifierPreview: MaskIdentifier(Credentials[Role].Identifier),
      attemptedLoginUrls: Attempts,
    };
    WriteJson("auth-login-diagnostics.json", Diagnostic);
    AddRecord(`${Role} login`, "FAIL", `Login failed across ${Attempts.length} discovered auth endpoint candidate(s).`, Diagnostic);
    expect(Payload, `${Role} login should succeed.`).toBeTruthy();
  }

  const Token = Payload?.accessToken;
  expect(Token, `${Role} login response should contain accessToken`).toBeTruthy();
  const Api = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${Token}` } });
  AddRecord(`${Role} login`, "PASS", `Authenticated successfully through ${SuccessfulUrl}.`, { userId: Payload?.user?.id, role: Payload?.user?.role });
  await LoginApi.dispose();
  return { Role, Token, User: Payload?.user || {}, Api };
}

async function ValidateStudentPracticeQueue(Student: AuthState): Promise<JsonRecord[]> {
  const Payload = await GetJson(Student.Api, "/student/assignments", "Student practice assignment queue");
  const Assignments = AsArray(Payload?.assignments || Payload?.items || Payload?.data);
  AddRecord("Student practice assignment queue", Assignments.length ? "PASS" : "WARN", `${Assignments.length} student-visible assignment(s) returned.`, {
    count: Assignments.length,
    sample: Assignments.slice(0, 12).map((Item) => Pick(Item, ["assignmentId", "attemptId", "attemptGroupId", "attemptNumber", "attemptSource", "status", "dpsId", "dpsNumber", "needsReattempt", "requiresManualIntervention"])),
  });
  ValidateAttemptChainFields("Student practice assignment queue", Assignments);
  return Assignments;
}

async function ValidateAdminPracticeInventory(Admin: AuthState): Promise<JsonRecord[]> {
  const Payload = await GetJson(Admin.Api, "/admin/assignments", "Admin practice assignment inventory");
  const Assignments = AsArray(Payload?.assignments || Payload?.items || Payload?.data);
  const PracticeAssignments = Assignments.filter((Item) => String(Item.assignmentType || Item.mode || "PRACTICE").toUpperCase() !== "ASSESSMENT");
  AddRecord("Admin practice assignment inventory", PracticeAssignments.length ? "PASS" : "WARN", `${PracticeAssignments.length} admin practice assignment(s) returned.`, {
    count: PracticeAssignments.length,
    sample: PracticeAssignments.slice(0, 12).map((Item) => Pick(Item, ["assignmentId", "attemptId", "attemptGroupId", "attemptNumber", "attemptSource", "status", "studentCode", "dpsId", "needsReattempt", "requiresManualIntervention"])),
  });
  ValidateAttemptChainFields("Admin practice assignment inventory", PracticeAssignments);
  return PracticeAssignments;
}

async function ValidateTeacherPracticeTracker(Teacher: AuthState): Promise<JsonRecord[]> {
  const Payload = await GetJson(Teacher.Api, "/teacher/assignment-tracker", "Teacher practice tracker");
  const Rows = ExtractTrackerRows(Payload);
  AddRecord("Teacher practice tracker", Rows.length ? "PASS" : "WARN", `${Rows.length} teacher tracker row(s) returned.`, {
    count: Rows.length,
    summary: Payload?.summary || null,
    sample: Rows.slice(0, 12).map((Item) => Pick(Item, ["assignmentId", "attemptId", "attemptGroupId", "attemptNumber", "attemptSource", "status", "studentCode", "dpsId", "needsReattempt", "requiresManualIntervention"])),
  });
  ValidateAttemptChainFields("Teacher practice tracker", Rows);
  return Rows;
}

function ValidateAttemptChainFields(Surface: string, Rows: JsonRecord[]) {
  const RowsWithAttempts = Rows.filter((Item) => Item?.attemptId || Item?.attemptGroupId || IsRetryLike(Item));
  const MissingGroup = RowsWithAttempts.filter((Item) => !HasAnyKey(Item, ["attemptGroupId", "AttemptGroupId", "attempt_group_id"]));
  const MissingNumber = RowsWithAttempts.filter((Item) => !HasAnyKey(Item, ["attemptNumber", "AttemptNumber", "attempt_number"]));
  const MissingSource = RowsWithAttempts.filter((Item) => !HasAnyKey(Item, ["attemptSource", "AttemptSource", "attempt_source"]));

  const Status = MissingGroup.length || MissingNumber.length || MissingSource.length ? "WARN" : "PASS";
  AddRecord(`${Surface} attempt-chain fields`, Status, "Checked attemptGroupId, attemptNumber, and attemptSource exposure for retry-aware records.", {
    rowsChecked: RowsWithAttempts.length,
    missingGroup: MissingGroup.length,
    missingNumber: MissingNumber.length,
    missingSource: MissingSource.length,
  });
}

async function ValidateCrossLoginAttemptChainVisibility(StudentAssignments: JsonRecord[], AdminAssignments: JsonRecord[], TeacherTracker: JsonRecord[]) {
  const StudentGroups = GroupKeys(StudentAssignments);
  const AdminGroups = GroupKeys(AdminAssignments);
  const TeacherGroups = GroupKeys(TeacherTracker);

  const MissingFromAdmin = StudentGroups.filter((Key) => !AdminGroups.includes(Key));
  const MissingFromTeacher = StudentGroups.filter((Key) => !TeacherGroups.includes(Key));

  AddRecord("Cross-login attempt-chain visibility", MissingFromAdmin.length || MissingFromTeacher.length ? "WARN" : "PASS", "Compared student-visible attempt groups with Admin assignment inventory and Teacher tracker.", {
    studentGroups: StudentGroups.length,
    adminGroups: AdminGroups.length,
    teacherGroups: TeacherGroups.length,
    missingFromAdmin: MissingFromAdmin.slice(0, 20),
    missingFromTeacher: MissingFromTeacher.slice(0, 20),
  });
}

async function ValidateNeedsReattemptUniqueCount(Admin: AuthState, Teacher: AuthState, Student: AuthState) {
  const Candidates = [
    { Label: "Admin needs re-attempt summary", Api: Admin.Api, Url: "/admin/reattempts/summary" },
    { Label: "Admin needs re-attempt queue", Api: Admin.Api, Url: "/admin/reattempts" },
    { Label: "Teacher needs re-attempt summary", Api: Teacher.Api, Url: "/teacher/reattempts/summary" },
    { Label: "Teacher needs re-attempt queue", Api: Teacher.Api, Url: "/teacher/reattempts" },
    { Label: "Student needs re-attempt summary", Api: Student.Api, Url: "/student/reattempts/summary" },
  ];

  for (const Candidate of Candidates) {
    const Response = await Candidate.Api.get(ResolveApiPath(Candidate.Url));
    const Payload = await SafeJson(Response);
    if (Response.status() === 404 || Response.status() === 405) {
      AddRecord(Candidate.Label, "WARN", `${Candidate.Url} is not available. If this endpoint is intentionally replaced by embedded summary payloads, this warning is acceptable.`, { status: Response.status() });
      continue;
    }
    if (!Response.ok()) {
      AddRecord(Candidate.Label, "FAIL", `${Candidate.Url} returned ${Response.status()}.`, Payload);
      continue;
    }

    const Items = AsArray(Payload?.items || Payload?.reattempts || Payload?.records || Payload?.data);
    const UniqueKeys = UniqueConceptKeys(Items);
    const VisibleCount = Number(Payload?.count ?? Payload?.needsReattemptCount ?? Payload?.uniqueNeedsReattemptCount ?? UniqueKeys.length);
    const CountIsUnique = Number.isFinite(VisibleCount) && VisibleCount === UniqueKeys.length;

    AddRecord(Candidate.Label, CountIsUnique ? "PASS" : "WARN", "Validated that needs re-attempt count is based on unique DPS concepts/sheets, not failed attempt rows.", {
      url: Candidate.Url,
      visibleCount: VisibleCount,
      uniqueConceptCount: UniqueKeys.length,
      rawItemCount: Items.length,
      sampleUniqueKeys: UniqueKeys.slice(0, 12),
    });
  }
}

async function ValidateManualInterventionQueue(Admin: AuthState, Teacher: AuthState) {
  const AdminPayload = await OptionalGetJson(Admin.Api, "/admin/manual-interventions", "Admin manual intervention queue");
  const TeacherPayload = await OptionalGetJson(Teacher.Api, "/teacher/manual-interventions", "Teacher manual intervention queue");
  const AdminRows = AsArray(AdminPayload?.items || AdminPayload?.records || AdminPayload?.data || AdminPayload?.interventions);
  const TeacherRows = AsArray(TeacherPayload?.items || TeacherPayload?.records || TeacherPayload?.data || TeacherPayload?.interventions);

  ValidateManualRows("Admin manual intervention queue", AdminRows);
  ValidateManualRows("Teacher manual intervention queue", TeacherRows);
}

function ValidateManualRows(Label: string, Rows: JsonRecord[]) {
  if (!Rows.length) {
    AddRecord(Label, "PASS", "No manual intervention records currently open. Queue is available or empty.");
    return;
  }

  const InvalidRows = Rows.filter((Item) => !Boolean(Item?.requiresManualIntervention ?? Item?.RequiresManualIntervention ?? Item?.requires_manual_intervention));
  const MissingAttemptNumber = Rows.filter((Item) => Number(Item?.attemptNumber ?? Item?.AttemptNumber ?? Item?.attempt_number ?? 0) < 3);
  AddRecord(Label, InvalidRows.length || MissingAttemptNumber.length ? "WARN" : "PASS", "Checked manual intervention records are only escalated after repeated retry failure.", {
    total: Rows.length,
    invalidManualFlag: InvalidRows.length,
    attemptNumberBelowThree: MissingAttemptNumber.length,
  });
}

async function ValidateResultMessageContract(Student: AuthState, StudentAssignments: JsonRecord[]) {
  const Completed = StudentAssignments.find((Item) => Item?.attemptId && IsCompletedLike(Item?.status));
  if (!Completed?.attemptId) {
    AddRecord("Student result message contract", "SKIP", "No completed practice attempt was available for message contract validation.");
    return;
  }

  const Result = await GetJson(Student.Api, `/student/attempts/${Completed.attemptId}/result`, "Student practice result message contract");
  const MessagePayload = Result?.message || Result?.resultMessage || Result?.submissionMessage || Result?.retryMessage || {};
  const MessageText = JSON.stringify(MessagePayload || Result || {}).toLowerCase();
  const ForbiddenTerms = ["assigned automatically", "auto generated", "retry created", "failed", "unsuccessful"];
  const Violations = ForbiddenTerms.filter((Term) => MessageText.includes(Term));

  AddRecord("Student result message contract", Violations.length ? "FAIL" : "PASS", "Checked student-facing result messaging avoids technical/system jargon and harsh language.", {
    attemptId: Completed.attemptId,
    violations: Violations,
    messagePayload: MessagePayload,
  });
}

async function ValidateControlledMutationContract(Admin: AuthState, Teacher: AuthState, Student: AuthState, StudentAssignments: JsonRecord[]) {
  const Pending = StudentAssignments.find((Item) => Item?.assignmentId && IsPendingLike(Item?.status));
  if (!Pending) {
    AddRecord("Controlled auto re-attempt mutation", "SKIP", "No pending disposable assignment was available for mutation-mode validation.");
    return;
  }

  AddRecord("Controlled auto re-attempt mutation", "WARN", "Mutation mode is enabled, but this runner intentionally avoids submitting fabricated student answers unless a project-specific safe fixture endpoint is provided.", {
    assignmentId: Pending.assignmentId,
    recommendation: "Use a disposable test student and project fixture endpoint before enabling destructive mutation.",
  });
}

async function OptionalGetJson(Api: APIRequestContext, Url: string, Label: string): Promise<JsonRecord | null> {
  const Response = await Api.get(ResolveApiPath(Url));
  const Payload = await SafeJson(Response);
  if (Response.status() === 404 || Response.status() === 405) {
    AddRecord(Label, "WARN", `${Url} is not available yet or intentionally embedded elsewhere.`, { status: Response.status(), payload: Payload });
    return null;
  }
  if (!Response.ok()) {
    AddRecord(Label, "FAIL", `${Url} returned ${Response.status()}.`, Payload);
    return null;
  }
  return Payload && typeof Payload === "object" ? Payload : {};
}

async function GetJson(Api: APIRequestContext, Url: string, Label: string): Promise<JsonRecord> {
  const Response = await Api.get(ResolveApiPath(Url));
  const Payload = await SafeJson(Response);
  if (!Response.ok()) {
    AddRecord(Label, "FAIL", `${Url} returned ${Response.status()}.`, Payload);
    expect(Response.ok(), `${Label} should return a successful response.`).toBeTruthy();
  }
  return Payload && typeof Payload === "object" ? Payload : {};
}

function ResolveApiPath(Url: string): string {
  if (/^https?:\/\//i.test(Url)) return Url;
  const CleanUrl = Url.startsWith("/") ? Url : `/${Url}`;
  return `${ApiBaseUrl}${CleanUrl}`;
}

async function SafeJson(Response: any): Promise<any> {
  try {
    return await Response.json();
  } catch {
    try {
      return { text: await Response.text() };
    } catch {
      return null;
    }
  }
}

function ExtractTrackerRows(Payload: JsonRecord): JsonRecord[] {
  const Direct = AsArray(Payload?.assignments || Payload?.rows || Payload?.items || Payload?.data || Payload?.tracker);
  if (Direct.length) return Direct;
  const Students = AsArray(Payload?.students);
  return Students.flatMap((Student) => AsArray(Student?.assignments || Student?.practice || Student?.records).map((Item) => ({ ...Item, studentCode: Student?.studentCode, studentName: Student?.studentName })));
}

function GroupKeys(Rows: JsonRecord[]): string[] {
  return Unique(Rows.map((Item) => String(Item?.attemptGroupId || Item?.AttemptGroupId || Item?.attempt_group_id || Item?.assignmentId || Item?.id || "")).filter(Boolean));
}

function UniqueConceptKeys(Rows: JsonRecord[]): string[] {
  return Unique(Rows.map((Item) => [
    Item?.studentCode || Item?.student_code || Item?.studentId || Item?.student_id || "student",
    Item?.moduleCode || Item?.module_code || "module",
    Item?.levelCode || Item?.level_code || "level",
    Item?.lessonNumber || Item?.lesson_number || Item?.lessonId || Item?.lesson_id || "lesson",
    Item?.dpsId || Item?.dps_id || Item?.dpsNumber || Item?.dps_number || Item?.conceptId || Item?.concept_id || Item?.attemptGroupId || Item?.attempt_group_id || "dps",
  ].map((Part) => String(Part || "").trim()).join("::")).filter(Boolean));
}

function IsRetryLike(Item: JsonRecord): boolean {
  const Text = JSON.stringify(Item || {}).toLowerCase();
  return Text.includes("re-attempt") || Text.includes("reattempt") || Text.includes("retry") || Number(Item?.attemptNumber ?? Item?.attempt_number ?? 0) > 0;
}

function IsPendingLike(Value: unknown): boolean {
  const Text = String(Value || "").toUpperCase();
  return ["PENDING", "ASSIGNED", "IN_PROGRESS", "ACTIVE", "NOT_STARTED"].some((Item) => Text.includes(Item));
}

function IsCompletedLike(Value: unknown): boolean {
  const Text = String(Value || "").toUpperCase();
  return ["COMPLETED", "SUBMITTED", "CLEARED", "NEEDS_REATTEMPT", "NEEDS_RE_ATTEMPT", "FAILED", "REVIEW"].some((Item) => Text.includes(Item));
}

function HasAnyKey(Item: JsonRecord, Keys: string[]): boolean {
  return Keys.some((Key) => Object.prototype.hasOwnProperty.call(Item || {}, Key));
}

function Pick(Item: JsonRecord, Keys: string[]): JsonRecord {
  return Keys.reduce((Result, Key) => {
    if (Object.prototype.hasOwnProperty.call(Item || {}, Key)) Result[Key] = Item[Key];
    return Result;
  }, {} as JsonRecord);
}

function AsArray(Value: unknown): JsonRecord[] {
  return Array.isArray(Value) ? Value.filter((Item) => Item && typeof Item === "object") as JsonRecord[] : [];
}

function Unique(Values: string[]): string[] {
  return Array.from(new Set(Values));
}

function AddRecord(Step: string, Status: RegressionRecord["Status"], Message: string, Detail?: unknown) {
  RegressionLog.push({ Step, Status, Message, Detail });
  const Prefix = Status === "PASS" ? "✓" : Status === "FAIL" ? "✕" : Status === "WARN" ? "!" : "-";
  console.log(`${Prefix} [${Status}] ${Step}: ${Message}`);
}

function WriteJson(FileName: string, Data: unknown) {
  Fs.writeFileSync(Path.join(DiagnosticsDir, FileName), JSON.stringify(Data, null, 2), "utf-8");
}

function WriteSummary() {
  const Counts = RegressionLog.reduce((Result, Item) => {
    Result[Item.Status] = (Result[Item.Status] || 0) + 1;
    return Result;
  }, {} as Record<string, number>);

  const Lines = [
    "# MathPath Phase 10.9.4G Auto Re-Attempt Regression Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    `API Base URL: ${ApiBaseUrl}`,
    `Mode: ${MutationMode ? "mutation" : "simulation"}`,
    "",
    "## Counts",
    "",
    ...["PASS", "WARN", "FAIL", "SKIP"].map((Key) => `- ${Key}: ${Counts[Key] || 0}`),
    "",
    "## Records",
    "",
    ...RegressionLog.map((Item) => `- **${Item.Status}** — ${Item.Step}: ${Item.Message}`),
    "",
  ];

  Fs.writeFileSync(Path.join(ReportRoot, "SUMMARY.md"), Lines.join("\n"), "utf-8");
}

function PrepareReportFolders() {
  Fs.mkdirSync(DiagnosticsDir, { recursive: true });
}

async function DisposeAuth(...States: AuthState[]) {
  for (const State of States) {
    await State.Api.dispose();
  }
}

function BuildLoginCandidates(): string[] {
  const Candidates = [
    "/auth/login",
    "/login",
  ];
  return Candidates.map(ResolveApiPath);
}

function TrimTrailingSlash(Value: string): string {
  return String(Value || "").replace(/\/+$/, "");
}

function CleanEnvValue(Value: unknown): string {
  return String(Value || "").trim();
}

function NormalizeMode(Value: unknown): string {
  const CleanValue = String(Value || "").trim().toLowerCase();
  return CleanValue === "mutation" ? "mutation" : "simulation";
}

function MaskIdentifier(Value: string): string {
  const CleanValue = String(Value || "");
  if (!CleanValue.includes("@")) return CleanValue ? `${CleanValue.slice(0, 3)}***` : "";
  const [Name, Domain] = CleanValue.split("@");
  return `${Name.slice(0, 2)}***@${Domain}`;
}

function InferStudentCodeFromIdentifier(Value: string): string {
  const Match = String(Value || "").match(/MP-ST-\d+/i);
  return Match ? Match[0].toUpperCase() : "";
}

function LoadRegressionEnv() {
  const EnvFiles = [".env.local", ".env.production.local", ".env", "../backend/.env"];
  for (const FilePath of EnvFiles) {
    const FullPath = Path.resolve(FilePath);
    if (!Fs.existsSync(FullPath)) continue;
    const Lines = Fs.readFileSync(FullPath, "utf-8").split(/\r?\n/);
    for (const Line of Lines) {
      const CleanLine = Line.trim();
      if (!CleanLine || CleanLine.startsWith("#") || !CleanLine.includes("=")) continue;
      const [RawKey, ...RawValueParts] = CleanLine.split("=");
      const Key = RawKey.trim();
      const Value = RawValueParts.join("=").trim().replace(/^['\"]|['\"]$/g, "");
      if (Key && !process.env[Key]) process.env[Key] = Value;
    }
  }
}
