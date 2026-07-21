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


LoadVerificationEnv();

type RoleName = "ADMIN" | "TEACHER" | "STUDENT";
type JsonRecord = Record<string, any>;

type AuthState = {
  Role: RoleName;
  Token: string;
  User: JsonRecord;
  Api: APIRequestContext;
};

type WorkflowRecord = {
  Step: string;
  Status: "PASS" | "WARN" | "FAIL" | "SKIP";
  Message: string;
  Detail?: unknown;
};

type PracticeInventory = {
  TeacherStudents: JsonRecord[];
  AvailableDps: JsonRecord[];
  StudentAssignments: JsonRecord[];
  AdminAssignments: JsonRecord[];
  TeacherTrackerRows: JsonRecord[];
};

type MutationPair = {
  Student: JsonRecord;
  Dps: JsonRecord;
};

const ApiBaseUrl = TrimTrailingSlash(process.env.MATHPATH_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api");
const ReportRoot = Path.resolve(process.env.MATHPATH_PRACTICE_WORKFLOW_REPORT_DIR || Path.join("verification-report", "phase-10-7-2-practice-workflow"));
const DiagnosticsDir = Path.join(ReportRoot, "diagnostics");
const MutationMode = NormalizeMode(process.env.MATHPATH_PRACTICE_E2E_MODE || "simulation") === "mutation";
const TargetStudentCode = CleanEnvValue(process.env.MATHPATH_SAMPLE_STUDENT_CODE || "") || InferStudentCodeFromIdentifier(process.env.MATHPATH_STUDENT_IDENTIFIER || "");
const TargetModuleCode = CleanEnvValue(process.env.MATHPATH_SAMPLE_MODULE_CODE || "YLM");
const TargetLevelCode = CleanEnvValue(process.env.MATHPATH_SAMPLE_LEVEL_CODE || "");

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

const WorkflowLog: WorkflowRecord[] = [];

PrepareReportFolders();

test.describe.configure({ mode: "serial", timeout: Number(process.env.MATHPATH_PRACTICE_WORKFLOW_TIMEOUT_MS || "600000") });

test.afterAll(async () => {
  WriteJson("workflow-records.json", WorkflowLog);
  WriteSummary();
});

test("Phase 10.7.2 — DPS / practice workflow production-style regression with edge-case simulation", async () => {
  const Admin = await LoginAs("ADMIN");
  const Teacher = await LoginAs("TEACHER");
  const Student = await LoginAs("STUDENT");

  const Inventory = await ValidatePracticeInventory(Admin, Teacher, Student);
  await ValidatePracticeResultSurfaceIfAvailable(Student, Admin, Teacher, Inventory.StudentAssignments);
  await ValidatePracticeEdgeCaseContracts(Admin, Teacher, Student);

  if (MutationMode) {
    await RunControlledPracticeMutationWorkflow(Admin, Teacher, Student, Inventory);
  } else {
    AddRecord("Controlled practice mutation workflow", "SKIP", "Simulation mode is active. Set MATHPATH_PRACTICE_E2E_MODE=mutation to assign/start/submit using test data.");
  }

  const Failures = WorkflowLog.filter((Item) => Item.Status === "FAIL");
  expect(Failures, "Phase 10.7.2 DPS / practice workflow regression must not produce hard failures.").toHaveLength(0);

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
    AddRecord(`${Role} login`, "FAIL", `Login failed across ${Attempts.length} discovered auth endpoint candidate(s). See diagnostics/auth-login-diagnostics.json.`, Diagnostic);
    console.error(JSON.stringify(Diagnostic, null, 2));
    expect(Payload, `${Role} login should succeed.`).toBeTruthy();
  }

  const Token = Payload?.accessToken;
  expect(Token, `${Role} login response should contain accessToken`).toBeTruthy();

  const Api = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${Token}` } });
  AddRecord(`${Role} login`, "PASS", `Authenticated successfully through ${SuccessfulUrl}.`, { userId: Payload?.user?.id, role: Payload?.user?.role });
  await LoginApi.dispose();
  return { Role, Token, User: Payload?.user || {}, Api };
}

async function ValidatePracticeInventory(Admin: AuthState, Teacher: AuthState, Student: AuthState): Promise<PracticeInventory> {
  const TeacherStudentsResponse = await GetJson(Teacher.Api, "/teacher/students", "Teacher student inventory");
  const TeacherStudents = AsArray(TeacherStudentsResponse?.students);
  AddRecord("Teacher student inventory", TeacherStudents.length ? "PASS" : "WARN", `${TeacherStudents.length} teacher student(s) returned.`, {
    count: TeacherStudents.length,
    students: TeacherStudents.map((Item) => Pick(Item, ["studentId", "userId", "studentCode", "studentName", "currentModuleCode", "currentLevelCode", "assignedAssignments", "completedAttempts", "attention"])),
  });

  const AvailableDpsResponse = await GetJson(Teacher.Api, "/teacher/available-dps", "Teacher available DPS inventory");
  const AvailableDps = AsArray(AvailableDpsResponse?.dps);
  AddRecord("Teacher available DPS inventory", AvailableDps.length ? "PASS" : "WARN", `${AvailableDps.length} published DPS option(s) available to the teacher.`, {
    levelCount: AsArray(AvailableDpsResponse?.levels).length,
    dpsCount: AvailableDps.length,
    sample: AvailableDps.slice(0, 10).map((Item) => Pick(Item, ["dpsId", "dpsNumber", "dpsTitle", "moduleCode", "levelCode", "lessonNumber", "publicationStatus", "questionCount"])),
  });

  const StudentAssignmentsResponse = await GetJson(Student.Api, "/student/assignments", "Student practice assignment queue");
  const StudentAssignments = AsArray(StudentAssignmentsResponse?.assignments);
  const PendingOrActive = StudentAssignments.filter((Item) => IsPendingLike(Item?.status));
  const CompletedLike = StudentAssignments.filter((Item) => IsCompletedLike(Item?.status));
  AddRecord("Student practice assignment queue", StudentAssignments.length ? "PASS" : "WARN", `${StudentAssignments.length} practice assignment(s) visible to student.`, {
    total: StudentAssignments.length,
    pendingOrActive: PendingOrActive.length,
    completedLike: CompletedLike.length,
    assignments: StudentAssignments.map((Item) => Pick(Item, ["assignmentId", "title", "moduleCode", "levelCode", "lessonNumber", "dpsId", "dpsNumber", "status", "attemptId", "reattemptAvailable"])),
  });

  const AdminAssignmentsResponse = await GetJson(Admin.Api, "/admin/assignments", "Admin practice assignment inventory");
  const AdminAssignments = AsArray(AdminAssignmentsResponse?.assignments || AdminAssignmentsResponse?.items || AdminAssignmentsResponse?.data);
  const PracticeAssignments = AdminAssignments.filter((Item) => String(Item.assignmentType || Item.mode || "PRACTICE").toUpperCase() !== "ASSESSMENT");
  AddRecord("Admin practice assignment inventory", PracticeAssignments.length ? "PASS" : "WARN", `${PracticeAssignments.length} practice assignment record(s) returned.`, { count: PracticeAssignments.length });

  const TeacherTrackerResponse = await GetJson(Teacher.Api, "/teacher/assignment-tracker", "Teacher practice tracker inventory");
  const TeacherTrackerRows = ExtractTrackerRows(TeacherTrackerResponse);
  AddRecord("Teacher practice tracker records", TeacherTrackerRows.length ? "PASS" : "WARN", `${TeacherTrackerRows.length} practice tracker row(s) returned.`, {
    count: TeacherTrackerRows.length,
    summary: TeacherTrackerResponse?.summary || null,
  });

  await ValidatePracticeCrossRoleSync(StudentAssignments, PracticeAssignments, TeacherTrackerRows);
  return { TeacherStudents, AvailableDps, StudentAssignments, AdminAssignments: PracticeAssignments, TeacherTrackerRows };
}

async function ValidatePracticeCrossRoleSync(StudentAssignments: JsonRecord[], AdminAssignments: JsonRecord[], TeacherTrackerRows: JsonRecord[]) {
  const StudentAssignmentIds = StudentAssignments.map((Item) => String(Item.assignmentId || "")).filter(Boolean);
  const AdminAssignmentIds = new Set(AdminAssignments.map((Item) => String(Item.assignmentId || Item.id || "")).filter(Boolean));
  const TeacherAssignmentIds = new Set(TeacherTrackerRows.map((Item) => String(Item.assignmentId || Item.id || "")).filter(Boolean));
  const MissingFromAdmin = StudentAssignmentIds.filter((Id) => !AdminAssignmentIds.has(Id));
  const MissingFromTeacher = StudentAssignmentIds.filter((Id) => !TeacherAssignmentIds.has(Id));

  AddRecord("Cross-role practice assignment sync", MissingFromAdmin.length || MissingFromTeacher.length ? "FAIL" : "PASS", "Compared student-visible practice assignment IDs against Admin inventory and Teacher tracker.", {
    studentVisibleAssignments: StudentAssignmentIds.length,
    missingFromAdmin: MissingFromAdmin,
    missingFromTeacher: MissingFromTeacher,
  });
}

async function ValidatePracticeResultSurfaceIfAvailable(Student: AuthState, Admin: AuthState, Teacher: AuthState, StudentAssignments: JsonRecord[]) {
  const Completed = StudentAssignments.find((Item) => Item?.attemptId && IsCompletedLike(Item?.status));
  if (!Completed?.attemptId) {
    AddRecord("Practice result surface", "SKIP", "No completed practice attempt was available for cross-role result validation.");
    return;
  }

  const AttemptId = String(Completed.attemptId);
  const StudentResult = await GetJson(Student.Api, `/student/attempts/${AttemptId}/result`, "Student practice result");
  ValidatePracticeResultPayload("Student practice result", StudentResult);

  const AdminResult = await GetJson(Admin.Api, `/admin/attempts/${AttemptId}`, "Admin practice attempt detail");
  ValidatePracticeResultPayload("Admin practice attempt detail", AdminResult);

  const TeacherResult = await GetJson(Teacher.Api, `/teacher/attempts/${AttemptId}/result`, "Teacher practice result");
  ValidatePracticeResultPayload("Teacher practice result", TeacherResult);
}

async function ValidatePracticeEdgeCaseContracts(Admin: AuthState, Teacher: AuthState, Student: AuthState) {
  await ExpectStatus(Student.Api, "/student/attempts/invalid-attempt-id/result", 404, "Invalid student practice result should not expose data");
  await ExpectStatus(Teacher.Api, "/teacher/attempts/invalid-attempt-id/result", 404, "Invalid teacher practice result should not expose data");
  await ExpectStatus(Admin.Api, "/admin/attempts/invalid-attempt-id", 404, "Invalid admin practice attempt should not expose data");
  await ExpectStatus(Student.Api, "/student/dps/invalid-dps-id", 404, "Invalid student DPS detail should not expose data");
}

async function RunControlledPracticeMutationWorkflow(Admin: AuthState, Teacher: AuthState, Student: AuthState, Inventory: PracticeInventory) {
  const Pair = SelectSafePracticeMutationPair(Student, Inventory);
  if (!Pair) {
    AddRecord("Controlled practice mutation pairing", "WARN", "No safe logged-in student + published DPS pair was available. Mutation skipped to avoid assigning work to a different student account or duplicate DPS.", {
      targetStudentCode: TargetStudentCode || null,
      loggedInStudentCandidateKeys: LoggedInStudentCandidateKeys(Student),
      availableStudents: Inventory.TeacherStudents.map((Item) => Pick(Item, ["studentId", "userId", "studentCode", "studentName", "currentModuleCode", "currentLevelCode"])),
      availableDps: Inventory.AvailableDps.map((Item) => Pick(Item, ["dpsId", "dpsNumber", "dpsTitle", "moduleCode", "levelCode", "lessonNumber", "publicationStatus"])),
      studentAssignments: Inventory.StudentAssignments.map((Item) => Pick(Item, ["assignmentId", "dpsId", "dpsNumber", "status", "attemptId", "reattemptAvailable"])),
    });
    AddRecord("Controlled practice mutation workflow", "SKIP", "No safe practice pair was available for mutation mode.");
    return;
  }

  AddRecord("Controlled practice mutation pairing", "PASS", `Selected ${Pair.Student.studentCode} with ${PracticeDpsLabel(Pair.Dps)} using logged-in student inventory.`, {
    student: Pick(Pair.Student, ["studentId", "userId", "studentCode", "studentName", "currentModuleCode", "currentLevelCode"]),
    dps: Pick(Pair.Dps, ["dpsId", "dpsNumber", "dpsTitle", "moduleCode", "levelCode", "lessonNumber", "publicationStatus", "questionCount", "durationSeconds"]),
  });

  const AssignmentPayload = {
    dpsId: Pair.Dps.dpsId,
    studentIds: [Pair.Student.studentId],
    title: `Phase 10.7.2 QA - ${PracticeDpsLabel(Pair.Dps)} - ${Date.now()}`,
    instructions: "Automated Phase 10.7.2 controlled practice workflow verification.",
    allowReattempt: false,
  };

  const AssignmentResponse = await Teacher.Api.post(ApiPath("/teacher/assignments"), { data: AssignmentPayload });
  const AssignmentDetail = await SafeJson(AssignmentResponse);
  if (!AssignmentResponse.ok()) {
    AddRecord("Teacher controlled DPS assignment", "FAIL", `Assignment failed with HTTP ${AssignmentResponse.status()}.`, AssignmentDetail);
    expect(AssignmentResponse.ok(), "Teacher controlled DPS assignment should succeed.").toBeTruthy();
  }

  const AssignmentIds = AsArray(AssignmentDetail?.assignmentIds).map(String).filter(Boolean);
  const AssignmentId = AssignmentIds[0];
  AddRecord("Teacher controlled DPS assignment", "PASS", "Teacher DPS assignment mutation completed.", AssignmentDetail);
  expect(AssignmentId, "DPS assignment mutation should return an assignment id.").toBeTruthy();

  const RefreshedStudentQueue = await GetJson(Student.Api, "/student/assignments", "Student refreshed practice assignment queue");
  const CreatedAssignment = AsArray(RefreshedStudentQueue?.assignments).find((Item) => String(Item.assignmentId) === AssignmentId);
  if (!CreatedAssignment) {
    AddRecord("Student controlled practice assignment visibility", "FAIL", "Newly created DPS assignment was not visible to the logged-in student.", {
      assignmentId: AssignmentId,
      visibleAssignmentIds: AsArray(RefreshedStudentQueue?.assignments).map((Item) => Item.assignmentId),
    });
    expect(CreatedAssignment, "Newly assigned DPS should be visible to the logged-in student.").toBeTruthy();
  }

  const VisibleAssignment = CreatedAssignment as JsonRecord;
  AddRecord("Student controlled practice assignment visibility", "PASS", "Student can see newly assigned DPS in practice queue.", Pick(VisibleAssignment, ["assignmentId", "title", "dpsId", "dpsNumber", "status", "attemptId"]));

  const StartResponse = await Student.Api.post(ApiPath("/student/attempts/start"), {
    data: {
      assignmentId: AssignmentId,
      dpsId: Pair.Dps.dpsId,
      mode: "PRACTICE",
    },
  });
  const StartDetail = await SafeJson(StartResponse);
  if (!StartResponse.ok()) {
    AddRecord("Student controlled practice start", "FAIL", `Start failed with HTTP ${StartResponse.status()}.`, StartDetail);
    expect(StartResponse.ok(), "Student should be able to start assigned DPS.").toBeTruthy();
  }

  const AttemptId = String(StartDetail?.attemptId || "");
  const Questions = AsArray(StartDetail?.questions);
  AddRecord("Student controlled practice start", "PASS", "Student DPS attempt started.", {
    attemptId: AttemptId,
    status: StartDetail?.status,
    totalQuestions: StartDetail?.totalQuestions,
    questionCount: Questions.length,
    remainingSeconds: StartDetail?.remainingSeconds,
  });
  expect(AttemptId, "Practice start response should include attemptId.").toBeTruthy();
  expect(Questions.length, "Practice start response should include generated questions.").toBeGreaterThan(0);

  let SavedCount = 0;
  for (const Question of Questions) {
    const Option = AsArray(Question?.options)[0];
    if (!Question?.questionId || !Option?.optionId) continue;
    const SaveResponse = await Student.Api.post(ApiPath(`/student/attempts/${AttemptId}/answers`), {
      data: {
        questionId: Question.questionId,
        selectedOptionId: Option.optionId,
      },
    });
    if (SaveResponse.ok()) SavedCount += 1;
  }
  AddRecord("Student controlled practice answer save", SavedCount === Questions.length ? "PASS" : "WARN", `${SavedCount} of ${Questions.length} answer save operation(s) succeeded.`);

  const SubmitResponse = await Student.Api.post(ApiPath(`/student/attempts/${AttemptId}/submit`), { data: {} });
  const SubmitResult = await SafeJson(SubmitResponse);
  if (!SubmitResponse.ok()) {
    AddRecord("Student controlled practice submit/result", "FAIL", `Submit failed with HTTP ${SubmitResponse.status()}.`, SubmitResult);
    expect(SubmitResponse.ok(), "Student should be able to submit assigned DPS.").toBeTruthy();
  }
  ValidatePracticeResultPayload("Student controlled practice submit/result", SubmitResult);

  const AdminDetail = await GetJson(Admin.Api, `/admin/assignments/${AssignmentId}`, "Admin controlled practice assignment detail");
  const AdminStudents = AsArray(AdminDetail?.students);
  const AdminStudentRow = AdminStudents.find((Item) => String(Item.studentId) === String(Pair.Student.studentId));
  AddRecord("Admin controlled practice assignment detail", AdminStudentRow?.attemptId ? "PASS" : "WARN", "Admin assignment detail reflects the controlled practice attempt.", {
    assignmentId: AssignmentId,
    studentRow: AdminStudentRow ? Pick(AdminStudentRow, ["studentId", "studentCode", "status", "attemptId", "score", "maxScore", "accuracyPercentage", "attemptHistory"]) : null,
  });
}

function SelectSafePracticeMutationPair(Student: AuthState, Inventory: PracticeInventory): MutationPair | null {
  const CandidateKeys = new Set(LoggedInStudentCandidateKeys(Student));
  let CandidateStudents = Inventory.TeacherStudents.filter((Item) => {
    const StudentKeys = [Item.studentCode, Item.studentId, Item.userId].filter(Boolean).map(String);
    return StudentKeys.some((Key) => CandidateKeys.has(Key));
  });

  if (TargetStudentCode) {
    CandidateStudents = CandidateStudents.filter((Item) => String(Item.studentCode || "").toUpperCase() === TargetStudentCode.toUpperCase());
  }

  const ExistingDpsIds = new Set(Inventory.StudentAssignments.map((Item) => String(Item.dpsId || "")).filter(Boolean));
  for (const StudentRow of CandidateStudents) {
    const StudentModuleCode = String(StudentRow.currentModuleCode || "");
    const StudentLevelCode = String(StudentRow.currentLevelCode || "");
    const Match = Inventory.AvailableDps.find((Dps) => {
      if (String(Dps.publicationStatus || "").toUpperCase() !== "PUBLISHED") return false;
      if (ExistingDpsIds.has(String(Dps.dpsId || ""))) return false;
      if (TargetModuleCode && String(Dps.moduleCode || "") !== TargetModuleCode) return false;
      if (TargetLevelCode && String(Dps.levelCode || "") !== TargetLevelCode) return false;
      return String(Dps.moduleCode || "") === StudentModuleCode && String(Dps.levelCode || "") === StudentLevelCode;
    });
    if (Match) return { Student: StudentRow, Dps: Match };
  }
  return null;
}

function ValidatePracticeResultPayload(Step: string, Payload: JsonRecord) {
  const Summary = Payload?.summary || Payload;
  const Score = Number(Summary?.score ?? Summary?.totalScore ?? Payload?.score ?? Payload?.totalScore ?? 0);
  const MaxScore = Number(Summary?.maxScore ?? Summary?.totalMarks ?? Payload?.maxScore ?? Payload?.totalMarks ?? 0);
  const Accuracy = Number(Summary?.accuracyPercentage ?? Summary?.accuracy ?? Payload?.accuracyPercentage ?? Payload?.accuracy ?? 0);
  const Status = String(Payload?.status || Payload?.attemptStatus || Summary?.status || "");
  const BoundaryOk = Number.isFinite(Score) && Number.isFinite(MaxScore) && Number.isFinite(Accuracy) && MaxScore >= 0 && Score >= 0 && Accuracy >= 0 && Accuracy <= 100;
  AddRecord(Step, BoundaryOk ? "PASS" : "FAIL", "Validated score, max score, and accuracy boundaries.", {
    score: Score,
    maxScore: MaxScore,
    accuracy: Accuracy,
    status: Status,
    benchmarkStatus: Summary?.benchmarkStatus || Payload?.benchmarkStatus || null,
  });
  expect(BoundaryOk, `${Step} should expose valid score/maxScore/accuracy boundaries.`).toBeTruthy();
}

async function GetJson(Api: APIRequestContext, Url: string, Step: string, HardFail = true): Promise<JsonRecord> {
  const Response = await Api.get(ApiPath(Url));
  const Detail = await SafeJson(Response);
  if (!Response.ok()) {
    AddRecord(Step, HardFail ? "FAIL" : "WARN", `GET ${Url} returned HTTP ${Response.status()}.`, Detail);
    if (HardFail) expect(Response.ok(), `${Step} should return HTTP 2xx.`).toBeTruthy();
  }
  return Detail && typeof Detail === "object" ? (Detail as JsonRecord) : {};
}

async function ExpectStatus(Api: APIRequestContext, Url: string, ExpectedStatus: number, Step: string) {
  const Response = await Api.get(ApiPath(Url));
  const Detail = await SafeJson(Response);
  const Passed = Response.status() === ExpectedStatus;
  AddRecord(Step, Passed ? "PASS" : "FAIL", `GET ${Url} returned HTTP ${Response.status()}; expected ${ExpectedStatus}.`, Detail);
  expect(Response.status(), `${Step} should return HTTP ${ExpectedStatus}.`).toBe(ExpectedStatus);
}

function ApiPath(Url: string): string {
  if (/^https?:\/\//i.test(Url)) return Url;
  const CleanPath = Url.startsWith("/") ? Url.slice(1) : Url;
  return `${ApiBaseUrl}/${CleanPath}`;
}

function BuildLoginCandidates(): string[] {
  const Candidates = [ApiPath("/auth/login")];
  if (ApiBaseUrl.endsWith("/api")) {
    Candidates.push(`${TrimTrailingSlash(ApiBaseUrl.slice(0, -4))}/api/auth/login`);
  }
  return Array.from(new Set(Candidates));
}

async function SafeJson(Response: any): Promise<any> {
  try {
    return await Response.json();
  } catch {
    try {
      return { raw: await Response.text() };
    } catch {
      return null;
    }
  }
}

function AddRecord(Step: string, Status: WorkflowRecord["Status"], Message: string, Detail?: unknown) {
  WorkflowLog.push(Detail === undefined ? { Step, Status, Message } : { Step, Status, Message, Detail });
}

function WriteJson(FileName: string, Payload: unknown) {
  const TargetDir = FileName.includes("diagnostics") ? ReportRoot : DiagnosticsDir;
  const TargetPath = FileName.includes("/") || FileName.includes("\\") ? Path.join(ReportRoot, FileName) : Path.join(TargetDir, FileName);
  Fs.mkdirSync(Path.dirname(TargetPath), { recursive: true });
  Fs.writeFileSync(TargetPath, JSON.stringify(Payload, null, 2));
}

function WriteSummary() {
  Fs.mkdirSync(ReportRoot, { recursive: true });
  Fs.writeFileSync(Path.join(ReportRoot, "workflow-records.json"), JSON.stringify(WorkflowLog, null, 2));
  const SummaryLines = WorkflowLog.map((Item) => `- ${Item.Status}: ${Item.Step} — ${Item.Message}`);
  Fs.writeFileSync(Path.join(ReportRoot, "summary.md"), [`# Phase 10.7.2 DPS / Practice Workflow Regression`, "", ...SummaryLines, ""].join("\n"));
}

function PrepareReportFolders() {
  Fs.mkdirSync(ReportRoot, { recursive: true });
  Fs.mkdirSync(DiagnosticsDir, { recursive: true });
}

async function DisposeAuth(...States: AuthState[]) {
  for (const State of States) await State.Api.dispose();
}

function LoadVerificationEnv() {
  const EnvFiles = [".env.local", ".env", Path.join("..", "backend", ".env")];
  for (const File of EnvFiles) {
    const FullPath = Path.resolve(File);
    if (!Fs.existsSync(FullPath)) continue;
    const Lines = Fs.readFileSync(FullPath, "utf8").split(/\r?\n/);
    for (const Line of Lines) {
      const Trimmed = Line.trim();
      if (!Trimmed || Trimmed.startsWith("#") || !Trimmed.includes("=")) continue;
      const Index = Trimmed.indexOf("=");
      const Key = Trimmed.slice(0, Index).trim();
      const Value = CleanEnvValue(Trimmed.slice(Index + 1));
      if (Key && process.env[Key] === undefined) process.env[Key] = Value;
    }
  }
}

function CleanEnvValue(Value: unknown): string {
  return String(Value || "").trim().replace(/^['\"]|['\"]$/g, "").trim();
}

function TrimTrailingSlash(Value: string): string {
  return String(Value || "").replace(/\/+$/, "");
}

function NormalizeMode(Value: string): string {
  return CleanEnvValue(Value).toLowerCase() === "mutation" ? "mutation" : "simulation";
}

function MaskIdentifier(Value: string): string {
  const CleanValue = CleanEnvValue(Value);
  if (!CleanValue) return "";
  if (CleanValue.length <= 4) return "****";
  return `${CleanValue.slice(0, 2)}***${CleanValue.slice(-2)}`;
}

function InferStudentCodeFromIdentifier(Value: string): string {
  const CleanValue = CleanEnvValue(Value).toUpperCase();
  return /^MP-ST-\d+/.test(CleanValue) ? CleanValue : "";
}

function LoggedInStudentCandidateKeys(Student: AuthState): string[] {
  return [TargetStudentCode, Student.User?.studentCode, Student.User?.code, Student.User?.id].filter(Boolean).map(String);
}

function AsArray(Value: any): JsonRecord[] {
  return Array.isArray(Value) ? Value : [];
}

function Pick(Source: JsonRecord, Keys: string[]): JsonRecord {
  const Output: JsonRecord = {};
  for (const Key of Keys) Output[Key] = Source?.[Key];
  return Output;
}

function IsPendingLike(Status: unknown): boolean {
  return ["NOT_STARTED", "PENDING", "IN_PROGRESS", "REATTEMPT_AVAILABLE"].includes(String(Status || "").toUpperCase());
}

function IsCompletedLike(Status: unknown): boolean {
  return ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "CLEARED", "NEEDS_RE_ATTEMPT", "REATTEMPT_COMPLETED"].includes(String(Status || "").toUpperCase());
}

function ExtractTrackerRows(Response: JsonRecord): JsonRecord[] {
  const Direct = AsArray(Response?.assignments || Response?.items || Response?.rows || Response?.data);
  if (Direct.length) return Direct;
  const Students = AsArray(Response?.students);
  const Rows: JsonRecord[] = [];
  for (const StudentRow of Students) {
    for (const Assignment of AsArray(StudentRow?.assignments)) Rows.push({ ...Assignment, studentId: StudentRow.studentId, studentCode: StudentRow.studentCode });
  }
  return Rows;
}

function PracticeDpsLabel(Dps: JsonRecord): string {
  return `${Dps.levelCode || "Level"} Lesson ${Dps.lessonNumber || "-"} DPS ${Dps.dpsNumber || "-"}`;
}
