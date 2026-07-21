import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
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

type GovernanceInventory = {
  TeacherStudents: JsonRecord[];
  StudentResults: JsonRecord[];
  StudentReport: JsonRecord | null;
  LearningPerformance: JsonRecord | null;
  AdminEligibility: JsonRecord | null;
  StudentEligibility: JsonRecord | null;
  AdminPromotions: JsonRecord[];
  TeacherPromotions: JsonRecord[];
  AssignAssessmentOptions: JsonRecord | null;
};

const ApiBaseUrl = TrimTrailingSlash(process.env.MATHPATH_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api");
const ReportRoot = Path.resolve(process.env.MATHPATH_GOVERNANCE_WORKFLOW_REPORT_DIR || Path.join("verification-report", "phase-10-7-3-governance-workflow"));
const DiagnosticsDir = Path.join(ReportRoot, "diagnostics");
const MutationMode = NormalizeMode(process.env.MATHPATH_GOVERNANCE_E2E_MODE || "simulation") === "mutation";
const AllowPromotionMutation = CleanEnvValue(process.env.MATHPATH_GOVERNANCE_ALLOW_PROMOTION_MUTATION || "").toLowerCase() === "true";
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

const WorkflowLog: WorkflowRecord[] = [];

PrepareReportFolders();

test.describe.configure({ mode: "serial", timeout: Number(process.env.MATHPATH_GOVERNANCE_WORKFLOW_TIMEOUT_MS || "600000") });

test.afterAll(async () => {
  WriteJson("workflow-records.json", WorkflowLog);
  WriteSummary();
});

test("Phase 10.7.3 — reports, readiness, and promotion governance regression", async () => {
  const Admin = await LoginAs("ADMIN");
  const Teacher = await LoginAs("TEACHER");
  const Student = await LoginAs("STUDENT");

  const Inventory = await ValidateGovernanceInventory(Admin, Teacher, Student);
  await ValidateReadinessGovernance(Admin, Teacher, Inventory);
  await ValidateReportIntegrity(Admin, Student, Inventory);
  await ValidatePromotionGovernance(Admin, Teacher, Inventory);
  await ValidateGovernanceEdgeCaseContracts(Admin, Teacher, Student);

  if (MutationMode) {
    await RunControlledGovernanceMutation(Admin, Inventory);
  } else {
    AddRecord("Controlled promotion mutation workflow", "SKIP", "Simulation mode is active. Set MATHPATH_GOVERNANCE_E2E_MODE=mutation and MATHPATH_GOVERNANCE_ALLOW_PROMOTION_MUTATION=true only when intentional promotion mutation is allowed.");
  }

  const Failures = WorkflowLog.filter((Item) => Item.Status === "FAIL");
  expect(Failures, "Phase 10.7.3 governance regression must not produce hard failures.").toHaveLength(0);

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

async function ValidateGovernanceInventory(Admin: AuthState, Teacher: AuthState, Student: AuthState): Promise<GovernanceInventory> {
  const TeacherStudentsResponse = await GetJson(Teacher.Api, "/teacher/students", "Teacher student inventory");
  const TeacherStudents = AsArray(TeacherStudentsResponse?.students);
  AddRecord("Teacher student inventory", TeacherStudents.length ? "PASS" : "WARN", `${TeacherStudents.length} teacher student(s) returned for governance checks.`, {
    count: TeacherStudents.length,
    students: TeacherStudents.map((Item) => Pick(Item, ["studentId", "userId", "studentCode", "studentName", "currentModuleCode", "currentLevelCode", "assignedAssignments", "completedAttempts", "attention"])),
  });

  const StudentResultsResponse = await GetJson(Student.Api, "/student/results", "Student progress/results feed");
  const StudentResults = AsArray(StudentResultsResponse?.results);
  AddRecord("Student progress/results feed", StudentResults.length ? "PASS" : "WARN", `${StudentResults.length} student result/progress row(s) returned.`, {
    count: StudentResults.length,
    sample: StudentResults.slice(0, 8).map((Item) => Pick(Item, ["attemptId", "assignmentType", "status", "score", "maxScore", "accuracyPercentage", "moduleCode", "levelCode", "lessonNumber", "dpsNumber", "progressRole", "promotionStatus", "completedDate"])),
  });

  const TargetStudent = SelectLoggedInStudent(TeacherStudents, Student.User);
  const StudentId = TargetStudent?.studentId;
  let StudentReport: JsonRecord | null = null;
  if (StudentId) {
    StudentReport = await GetJson(Admin.Api, `/admin/results/student?studentId=${encodeURIComponent(String(StudentId))}`, "Admin student history report");
    AddRecord("Admin student history report", StudentReport ? "PASS" : "WARN", `Student History report loaded for ${TargetStudent.studentCode || StudentId}.`, BuildStudentReportSummary(StudentReport));
  } else {
    AddRecord("Admin student history report", "WARN", "Could not identify the logged-in student in teacher inventory; student report check skipped.", { targetStudentCode: TargetStudentCode, studentUser: Student.User });
  }

  const LearningPerformance = await GetJson(Admin.Api, "/admin/results/learning-performance", "Admin learning performance report");
  AddRecord("Admin learning performance report", LearningPerformance ? "PASS" : "WARN", "Learning Performance report endpoint responded.", BuildLearningPerformanceSummary(LearningPerformance));

  const AdminEligibility = await GetJson(Admin.Api, "/admin/assessment-eligibility", "Admin assessment readiness governance");
  AddRecord("Admin assessment readiness governance", AdminEligibility ? "PASS" : "WARN", "Assessment readiness governance endpoint responded.", BuildEligibilitySummary(AdminEligibility));

  let StudentEligibility: JsonRecord | null = null;
  if (StudentId) {
    StudentEligibility = await GetJson(Admin.Api, `/admin/students/${encodeURIComponent(String(StudentId))}/assessment-eligibility`, "Admin logged-in student readiness detail");
    AddRecord("Admin logged-in student readiness detail", StudentEligibility ? "PASS" : "WARN", "Student-specific assessment readiness detail loaded.", Pick(StudentEligibility || {}, ["studentId", "studentCode", "levelCode", "eligible", "status", "statusLabel", "requiredDpsCount", "passedDpsCount", "missingDpsCount", "belowBenchmarkDpsCount", "progressPercentage"]));
  } else {
    AddRecord("Admin logged-in student readiness detail", "SKIP", "No matched logged-in student was available for student-specific readiness check.");
  }

  const AssignAssessmentOptions = await GetJson(Teacher.Api, "/teacher/assign-assessment/options", "Teacher assessment assignment readiness options");
  AddRecord("Teacher assessment assignment readiness options", AssignAssessmentOptions ? "PASS" : "WARN", "Teacher assignment readiness options loaded.", {
    summary: AssignAssessmentOptions?.summary || null,
    studentCount: AsArray(AssignAssessmentOptions?.students).length,
    availableAssessments: AsArray(AssignAssessmentOptions?.availableAssessments).length,
  });

  const AdminPromotionsResponse = await GetJson(Admin.Api, "/admin/student-level-promotions", "Admin promotion history inventory");
  const AdminPromotions = ExtractItems(AdminPromotionsResponse);
  AddRecord("Admin promotion history inventory", "PASS", `${AdminPromotions.length} promotion record(s) visible to Admin.`, { count: AdminPromotions.length, sample: AdminPromotions.slice(0, 8) });

  const TeacherPromotionsResponse = await GetJson(Teacher.Api, "/teacher/student-level-promotions", "Teacher promotion history inventory");
  const TeacherPromotions = ExtractItems(TeacherPromotionsResponse);
  AddRecord("Teacher promotion history inventory", "PASS", `${TeacherPromotions.length} promotion record(s) visible to Teacher.`, { count: TeacherPromotions.length, sample: TeacherPromotions.slice(0, 8) });

  return {
    TeacherStudents,
    StudentResults,
    StudentReport,
    LearningPerformance,
    AdminEligibility,
    StudentEligibility,
    AdminPromotions,
    TeacherPromotions,
    AssignAssessmentOptions,
  };
}

async function ValidateReadinessGovernance(Admin: AuthState, Teacher: AuthState, Inventory: GovernanceInventory) {
  const Rows = AsArray(Inventory.AdminEligibility?.rows);
  const TeacherRows = AsArray(Inventory.AssignAssessmentOptions?.students);
  const Gate = Inventory.AdminEligibility?.readinessGate || null;
  const Summary = Inventory.AssignAssessmentOptions?.summary || {};

  AddRecord("Assessment readiness row integrity", Rows.length ? "PASS" : "WARN", `${Rows.length} admin readiness row(s) evaluated.`, {
    totalStudents: Inventory.AdminEligibility?.totalStudents,
    readyCount: Inventory.AdminEligibility?.readyCount,
    notReadyCount: Inventory.AdminEligibility?.notReadyCount,
    benchmarkPercentage: Inventory.AdminEligibility?.benchmarkPercentage,
    gate: Gate,
    sample: Rows.slice(0, 8).map((Item) => Pick(Item, ["studentId", "studentCode", "levelCode", "eligible", "status", "statusLabel", "requiredDpsCount", "passedDpsCount", "missingDpsCount", "belowBenchmarkDpsCount", "progressPercentage"])),
  });

  const InvalidProgressRows = Rows.filter((Item) => !IsPercentLike(Item?.progressPercentage));
  const InvalidCountRows = Rows.filter((Item) => ["requiredDpsCount", "passedDpsCount", "missingDpsCount", "belowBenchmarkDpsCount"].some((Key) => !IsNonNegativeNumber(Item?.[Key])));
  AddRecord("Assessment readiness metric boundaries", InvalidProgressRows.length || InvalidCountRows.length ? "FAIL" : "PASS", "Validated readiness percentage and DPS count boundaries.", {
    invalidProgressRows: InvalidProgressRows.map((Item) => Pick(Item, ["studentCode", "progressPercentage"])),
    invalidCountRows: InvalidCountRows.map((Item) => Pick(Item, ["studentCode", "requiredDpsCount", "passedDpsCount", "missingDpsCount", "belowBenchmarkDpsCount"])),
  });

  const TeacherReadinessModes = TeacherRows.map((Item) => String(Item?.readinessGateMode || "")).filter(Boolean);
  const AcceptedModes = new Set(["READY", "ADMIN_TESTING_OVERRIDE", "TEMPORARY_BYPASS", "BLOCKED"]);
  const InvalidModes = TeacherReadinessModes.filter((Mode) => !AcceptedModes.has(Mode));
  AddRecord("Teacher assignment readiness gate mapping", InvalidModes.length ? "FAIL" : "PASS", "Validated teacher assignment readiness gate modes and summary.", {
    summary: Summary,
    modes: Array.from(new Set(TeacherReadinessModes)),
    invalidModes: InvalidModes,
  });

  await ExpectStatus(Admin.Api, "/admin/students/invalid-student-id/assessment-eligibility", 404, "Invalid student readiness detail should not expose data");
  await ExpectEmptySafeOrBlocked(Teacher.Api, "/teacher/assign-assessment/options?moduleId=invalid-module-id", "Invalid teacher readiness module scope should not expose data");
}

async function ValidateReportIntegrity(Admin: AuthState, Student: AuthState, Inventory: GovernanceInventory) {
  const StudentRows = Inventory.StudentReport ? ExtractReportRows(Inventory.StudentReport) : [];
  const StudentSummary = Inventory.StudentReport?.summary || null;
  AddRecord("Student History report row integrity", StudentRows.length ? "PASS" : "WARN", `${StudentRows.length} Student History report row(s) available across DPS, assessment, and promotion sections.`, {
    summary: StudentSummary,
    rowCounts: BuildStudentReportSummary(Inventory.StudentReport || {}).rowCounts,
  });

  const InvalidScoreRows = StudentRows.filter((Item) => HasScoreShape(Item) && !ScorePayloadIsValid(Item));
  AddRecord("Student History score/accuracy boundaries", InvalidScoreRows.length ? "FAIL" : "PASS", "Validated Student History score, max score, and accuracy boundaries.", {
    invalidRows: InvalidScoreRows.map((Item) => Pick(Item, ["attemptId", "assignmentType", "score", "maxScore", "totalMarks", "accuracy", "accuracyPercentage", "percentage", "status"])),
  });

  const CompletionRows = StudentRows.filter((Item) => IsCompletedLike(Item?.status) || Item?.promotionStatus || Item?.completedDate || Item?.completionDate || Item?.submittedAt || Item?.promotedAt);
  const MissingCompletionDate = CompletionRows.filter((Item) => !FirstDefined(Item?.completionDate, Item?.completedDate, Item?.submittedAt, Item?.promotedAt, Item?.attemptDate));
  AddRecord("Student History completion date integrity", MissingCompletionDate.length ? "WARN" : "PASS", "Checked that completed report rows expose a completion/submission/promotion date where applicable.", {
    completedRowsChecked: CompletionRows.length,
    missingDateRows: MissingCompletionDate.map((Item) => Pick(Item, ["attemptId", "assignmentType", "status", "promotionStatus", "levelCode", "dpsNumber"])),
  });

  const LearningRows = ExtractReportRows(Inventory.LearningPerformance || {});
  AddRecord("Learning Performance report row integrity", LearningRows.length ? "PASS" : "WARN", `${LearningRows.length} Learning Performance row(s) available.`, BuildLearningPerformanceSummary(Inventory.LearningPerformance || {}));

  const InvalidLearningRows = LearningRows.filter((Item) => HasScoreShape(Item) && !ScorePayloadIsValid(Item));
  AddRecord("Learning Performance score/accuracy boundaries", InvalidLearningRows.length ? "FAIL" : "PASS", "Validated Learning Performance score, max score, and accuracy boundaries.", {
    invalidRows: InvalidLearningRows.map((Item) => Pick(Item, ["attemptId", "studentCode", "assignmentType", "score", "maxScore", "totalMarks", "accuracy", "accuracyPercentage", "percentage", "status"])),
  });

  const ExportCandidate = SelectReportExportCandidate(Inventory);
  if (ExportCandidate?.studentId) {
    await ExpectExport(Admin.Api, `/admin/results/export/student?studentId=${encodeURIComponent(String(ExportCandidate.studentId))}`, "Student History export should generate a file response");
  } else {
    AddRecord("Student History export should generate a file response", "SKIP", "No student id was available for export validation.");
  }

  await ExpectStatus(Admin.Api, "/admin/results/student?studentId=invalid-student-id", 404, "Invalid Student History report should not expose data");
  await ExpectStatus(Student.Api, "/student/results/module/invalid-module-code", 404, "Invalid student module result scope should not expose data", [404, 405]);
}

async function ValidatePromotionGovernance(Admin: AuthState, Teacher: AuthState, Inventory: GovernanceInventory) {
  const AdminIds = new Set(Inventory.AdminPromotions.map((Item) => String(FirstDefined(Item?.promotionId, Item?.id, ""))).filter(Boolean));
  const TeacherIds = Inventory.TeacherPromotions.map((Item) => String(FirstDefined(Item?.promotionId, Item?.id, ""))).filter(Boolean);
  const MissingFromAdmin = TeacherIds.filter((Id) => !AdminIds.has(Id));

  AddRecord("Promotion history cross-role sync", MissingFromAdmin.length ? "FAIL" : "PASS", "Compared Teacher-visible promotion records against Admin promotion history.", {
    adminPromotionRecords: Inventory.AdminPromotions.length,
    teacherPromotionRecords: Inventory.TeacherPromotions.length,
    missingFromAdmin: MissingFromAdmin,
  });

  const PromotionRows = [...Inventory.AdminPromotions, ...ExtractReportRows(Inventory.StudentReport || {}).filter((Item) => Item?.promotionId || Item?.promotionStatus || Item?.promotedAt)];
  const InvalidPromotionRows = PromotionRows.filter((Item) => {
    const FromLevel = FirstDefined(Item?.fromLevelCode, Item?.promotedFromLevelCode, Item?.levelCode);
    const ToLevel = FirstDefined(Item?.toLevelCode, Item?.promotedToLevelCode, Item?.nextLevelCode);
    const DateValue = FirstDefined(Item?.promotedAt, Item?.promotionDate, Item?.completedDate, Item?.completionDate);
    return !FromLevel || !ToLevel || !DateValue;
  });

  AddRecord("Promotion journey field integrity", InvalidPromotionRows.length ? "WARN" : "PASS", "Checked promotion rows for from-level, to-level, and promotion date fields.", {
    promotionRowsChecked: PromotionRows.length,
    incompleteRows: InvalidPromotionRows.map((Item) => Pick(Item, ["promotionId", "studentCode", "fromLevelCode", "toLevelCode", "promotedFromLevelCode", "promotedToLevelCode", "promotedAt", "promotionDate", "promotionStatus"])),
  });

  const PromotionCandidates = ExtractReportRows(Inventory.StudentReport || {}).filter((Item) => IsAssessmentCleared(Item) && FirstDefined(Item?.assignmentId, Item?.assessmentAssignmentId));
  AddRecord("Promotion candidate visibility", PromotionCandidates.length ? "PASS" : "WARN", `${PromotionCandidates.length} cleared assessment row(s) available as promotion candidate evidence.`, {
    candidates: PromotionCandidates.slice(0, 8).map((Item) => Pick(Item, ["assignmentId", "assessmentAssignmentId", "studentCode", "levelCode", "status", "benchmarkStatus", "score", "maxScore", "accuracyPercentage"])),
  });

  await ExpectStatus(Admin.Api, "/admin/assessments/invalid-assignment-id/promote", 404, "Invalid promotion mutation should not expose data", [404, 400], "POST");
}

async function ValidateGovernanceEdgeCaseContracts(Admin: AuthState, Teacher: AuthState, Student: AuthState) {
  await ExpectStatus(Admin.Api, "/admin/results/export/student?studentId=invalid-student-id", 404, "Invalid Student History export should not expose data", [404, 400]);
  await ExpectStatus(Admin.Api, "/admin/results/export/learning-performance?moduleId=invalid-module-id", 200, "Invalid Learning Performance export scope should remain controlled", [200, 400, 404]);
  await ExpectStatus(Admin.Api, "/admin/student-level-promotions/invalid-id", 404, "Invalid promotion detail route should not expose data", [404, 405]);
  await ExpectStatus(Student.Api, "/student/results/module/../../admin", 404, "Malformed student result scope should not expose data", [400, 404, 405]);
  await ExpectStatus(Teacher.Api, "/teacher/student-level-promotions?studentId=invalid-student-id", 200, "Invalid teacher promotion filter should remain controlled", [200, 400, 404]);
}

async function RunControlledGovernanceMutation(Admin: AuthState, Inventory: GovernanceInventory) {
  if (!AllowPromotionMutation) {
    AddRecord("Controlled promotion mutation workflow", "SKIP", "Mutation mode is active, but promotion mutation is locked. Set MATHPATH_GOVERNANCE_ALLOW_PROMOTION_MUTATION=true only when intentional level promotion is approved.", {
      mutationMode: true,
      allowPromotionMutation: false,
    });
    return;
  }

  const Candidate = ExtractReportRows(Inventory.StudentReport || {}).find((Item) => IsAssessmentCleared(Item) && FirstDefined(Item?.assignmentId, Item?.assessmentAssignmentId));
  if (!Candidate) {
    AddRecord("Controlled promotion mutation workflow", "SKIP", "No cleared assessment assignment candidate was available for controlled promotion mutation.");
    return;
  }

  const AssignmentId = String(FirstDefined(Candidate.assignmentId, Candidate.assessmentAssignmentId));
  const Response = await Admin.Api.post(FullApiUrl(`/admin/assessments/${encodeURIComponent(AssignmentId)}/promote`), { data: {} });
  const Detail = await SafeJson(Response);
  if (!Response.ok()) {
    AddRecord("Controlled promotion mutation workflow", Response.status() === 400 ? "WARN" : "FAIL", `Promotion mutation returned HTTP ${Response.status()}.`, Detail);
    return;
  }

  AddRecord("Controlled promotion mutation workflow", "PASS", "Admin promotion mutation completed for a cleared assessment candidate.", Detail);
}

function BuildStudentReportSummary(Payload: JsonRecord): JsonRecord {
  const DpsRows = AsArray(Payload?.dpsHistory || Payload?.dpsRows || Payload?.practiceRows || Payload?.dpsResults);
  const AssessmentRows = AsArray(Payload?.assessmentHistory || Payload?.assessmentRows || Payload?.assessmentResults);
  const PromotionRows = AsArray(Payload?.promotionHistory || Payload?.promotionRows || Payload?.promotions);
  return {
    student: Payload?.student || Pick(Payload || {}, ["studentId", "studentCode", "studentName"]),
    summary: Payload?.summary || null,
    rowCounts: {
      dpsHistory: DpsRows.length,
      assessmentHistory: AssessmentRows.length,
      promotionHistory: PromotionRows.length,
      extractedTotal: ExtractReportRows(Payload).length,
    },
  };
}

function BuildLearningPerformanceSummary(Payload: JsonRecord): JsonRecord {
  const Rows = ExtractReportRows(Payload);
  return {
    summary: Payload?.summary || null,
    totalRows: Rows.length,
    sample: Rows.slice(0, 8).map((Item) => Pick(Item, ["studentCode", "studentName", "moduleCode", "levelCode", "lessonNumber", "dpsNumber", "assessmentTitle", "attemptLabel", "score", "maxScore", "accuracyPercentage", "status", "completionDate", "completedDate"])),
  };
}

function BuildEligibilitySummary(Payload: JsonRecord): JsonRecord {
  return {
    benchmarkPercentage: Payload?.benchmarkPercentage,
    totalStudents: Payload?.totalStudents,
    readyCount: Payload?.readyCount,
    notReadyCount: Payload?.notReadyCount,
    gate: Payload?.readinessGate || null,
    sample: AsArray(Payload?.rows).slice(0, 8).map((Item) => Pick(Item, ["studentCode", "levelCode", "eligible", "status", "statusLabel", "progressPercentage", "requiredDpsCount", "passedDpsCount", "missingDpsCount", "belowBenchmarkDpsCount"])),
  };
}

function ExtractReportRows(Payload: JsonRecord): JsonRecord[] {
  const Buckets = [
    Payload?.rows,
    Payload?.results,
    Payload?.items,
    Payload?.data,
    Payload?.dpsHistory,
    Payload?.dpsRows,
    Payload?.practiceRows,
    Payload?.dpsResults,
    Payload?.assessmentHistory,
    Payload?.assessmentRows,
    Payload?.assessmentResults,
    Payload?.promotionHistory,
    Payload?.promotionRows,
    Payload?.promotions,
  ];
  const Rows: JsonRecord[] = [];
  for (const Bucket of Buckets) {
    for (const Item of AsArray(Bucket)) {
      if (Item && typeof Item === "object") Rows.push(Item);
    }
  }
  return Rows;
}

function ExtractItems(Payload: JsonRecord): JsonRecord[] {
  return AsArray(Payload?.items || Payload?.promotions || Payload?.rows || Payload?.results || Payload?.data || Payload);
}

function SelectLoggedInStudent(TeacherStudents: JsonRecord[], StudentUser: JsonRecord): JsonRecord | undefined {
  const CandidateKeys = new Set([
    CleanEnvValue(TargetStudentCode),
    CleanEnvValue(StudentUser?.studentCode),
    CleanEnvValue(StudentUser?.id),
    CleanEnvValue(StudentUser?.userId),
  ].filter(Boolean));
  return TeacherStudents.find((Item) => {
    const Keys = [Item?.studentCode, Item?.userId, Item?.studentId, Item?.id].map(CleanEnvValue).filter(Boolean);
    return Keys.some((Key) => CandidateKeys.has(Key));
  }) || TeacherStudents[0];
}

function SelectReportExportCandidate(Inventory: GovernanceInventory): JsonRecord | null {
  const Student = SelectLoggedInStudent(Inventory.TeacherStudents, {});
  if (Student?.studentId) return Student;
  const ReportStudent = Inventory.StudentReport?.student || {};
  if (ReportStudent?.studentId) return ReportStudent;
  return null;
}

function IsAssessmentCleared(Item: JsonRecord): boolean {
  const Status = String(FirstDefined(Item?.status, Item?.attemptStatus, Item?.displayStatus, "")).toUpperCase();
  const Benchmark = String(Item?.benchmarkStatus || "").toUpperCase();
  const Accuracy = Number(FirstDefined(Item?.accuracyPercentage, Item?.accuracy, Item?.percentage, 0));
  return Status.includes("CLEARED") || Benchmark === "PASS" || Accuracy >= 70;
}

function HasScoreShape(Item: JsonRecord): boolean {
  return FirstDefined(Item?.score, Item?.totalScore) !== undefined || FirstDefined(Item?.maxScore, Item?.totalMarks) !== undefined || FirstDefined(Item?.accuracyPercentage, Item?.accuracy, Item?.percentage) !== undefined;
}

function ScorePayloadIsValid(Item: JsonRecord): boolean {
  const Score = Number(FirstDefined(Item?.score, Item?.totalScore, 0));
  const MaxScore = Number(FirstDefined(Item?.maxScore, Item?.totalMarks, Score || 0));
  const Accuracy = Number(FirstDefined(Item?.accuracyPercentage, Item?.accuracy, Item?.percentage, 0));
  if (!Number.isFinite(Score) || !Number.isFinite(MaxScore) || !Number.isFinite(Accuracy)) return false;
  if (Score < 0 || MaxScore < 0 || Accuracy < 0 || Accuracy > 100) return false;
  if (MaxScore > 0 && Score > MaxScore) return false;
  return true;
}

function IsPercentLike(Value: unknown): boolean {
  const NumberValue = Number(Value ?? 0);
  return Number.isFinite(NumberValue) && NumberValue >= 0 && NumberValue <= 100;
}

function IsNonNegativeNumber(Value: unknown): boolean {
  const NumberValue = Number(Value ?? 0);
  return Number.isFinite(NumberValue) && NumberValue >= 0;
}

function IsCompletedLike(Status: unknown): boolean {
  const Value = String(Status || "").toUpperCase();
  return ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "CLEARED", "PROMOTED", "NEEDS_RE_ATTEMPT"].some((Item) => Value.includes(Item));
}

async function GetJson(Api: APIRequestContext, PathValue: string, StepName: string): Promise<JsonRecord> {
  const Response = await Api.get(FullApiUrl(PathValue));
  const Detail = await SafeJson(Response);
  if (!Response.ok()) {
    AddRecord(StepName, "FAIL", `GET ${PathValue} returned HTTP ${Response.status()}.`, Detail);
    expect(Response.ok(), `${StepName} should succeed`).toBeTruthy();
  }
  return Detail && typeof Detail === "object" ? (Detail as JsonRecord) : {};
}

async function ExpectExport(Api: APIRequestContext, PathValue: string, StepName: string) {
  const Response = await Api.get(FullApiUrl(PathValue));
  const ContentType = Response.headers()["content-type"] || "";
  const ContentDisposition = Response.headers()["content-disposition"] || "";
  const Body = await Response.body().catch(() => Buffer.from(""));
  const LooksLikeFile = Response.ok() && Body.length > 0 && (ContentDisposition || ContentType.includes("text/csv") || ContentType.includes("spreadsheet") || ContentType.includes("application/vnd") || ContentType.includes("application/octet-stream"));
  AddRecord(StepName, LooksLikeFile ? "PASS" : "FAIL", `Export ${PathValue} returned HTTP ${Response.status()} with ${Body.length} byte(s).`, {
    status: Response.status(),
    contentType: ContentType,
    contentDisposition: ContentDisposition,
    bytes: Body.length,
  });
  expect(LooksLikeFile, `${StepName} should return a generated file payload`).toBeTruthy();
}

async function ExpectStatus(Api: APIRequestContext, PathValue: string, ExpectedStatus: number, StepName: string, AcceptedStatuses?: number[], Method: "GET" | "POST" = "GET") {
  const Response = Method === "POST" ? await Api.post(FullApiUrl(PathValue), { data: {} }) : await Api.get(FullApiUrl(PathValue));
  const Detail = await SafeJson(Response);
  const Accepted = AcceptedStatuses || [ExpectedStatus];
  const Passed = Accepted.includes(Response.status());
  AddRecord(StepName, Passed ? "PASS" : "FAIL", `${Method} ${PathValue} returned HTTP ${Response.status()}; expected ${Accepted.join("/")}.`, Detail);
  expect(Passed, `${StepName} should return controlled HTTP status ${Accepted.join("/")}`).toBeTruthy();
}


async function ExpectEmptySafeOrBlocked(Api: APIRequestContext, PathValue: string, StepName: string) {
  const Response = await Api.get(FullApiUrl(PathValue));
  const Detail = await SafeJson(Response);
  const Status = Response.status();
  const Students = Array.isArray(Detail?.students) ? Detail.students : [];
  const AvailableAssessments = Array.isArray(Detail?.availableAssessments) ? Detail.availableAssessments : [];
  const IsBlocked = [400, 403, 404].includes(Status);
  const IsEmptySafe = Status === 200 && Students.length === 0 && AvailableAssessments.length === 0;
  const Passed = IsBlocked || IsEmptySafe;

  AddRecord(
    StepName,
    Passed ? "PASS" : "FAIL",
    IsBlocked
      ? `GET ${PathValue} returned HTTP ${Status}; invalid scope was blocked.`
      : `GET ${PathValue} returned HTTP ${Status}; invalid scope returned ${Students.length} student(s) and ${AvailableAssessments.length} assessment(s).`,
    Detail,
  );

  expect(Passed, `${StepName} should return blocked status or a safe empty data response`).toBeTruthy();
}

async function SafeJson(Response: APIResponse): Promise<any> {
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

function FullApiUrl(PathValue: string): string {
  if (/^https?:\/\//i.test(PathValue)) return PathValue;
  const CleanPath = String(PathValue || "").replace(/^\/+/, "");
  if (CleanPath.startsWith("api/")) {
    const Origin = ApiBaseUrl.replace(/\/api\/?$/i, "");
    return `${TrimTrailingSlash(Origin)}/${CleanPath}`;
  }
  return `${ApiBaseUrl}/${CleanPath}`;
}

function BuildLoginCandidates(): string[] {
  const Base = TrimTrailingSlash(ApiBaseUrl);
  const Origin = Base.replace(/\/api\/?$/i, "");
  return Array.from(new Set([
    `${Base}/auth/login`,
    `${Origin}/api/auth/login`,
    `${Origin}/auth/login`,
  ]));
}

function AsArray(Value: unknown): JsonRecord[] {
  if (Array.isArray(Value)) return Value as JsonRecord[];
  return [];
}

function Pick(Source: JsonRecord, Keys: string[]): JsonRecord {
  const Result: JsonRecord = {};
  for (const Key of Keys) {
    if (Source && Object.prototype.hasOwnProperty.call(Source, Key)) Result[Key] = Source[Key];
  }
  return Result;
}

function FirstDefined(...Values: any[]): any {
  return Values.find((Value) => Value !== undefined && Value !== null && Value !== "");
}

function AddRecord(Step: string, Status: WorkflowRecord["Status"], Message: string, Detail?: unknown) {
  const Entry: WorkflowRecord = Detail === undefined ? { Step, Status, Message } : { Step, Status, Message, Detail };
  WorkflowLog.push(Entry);
  if (Status === "FAIL") console.error(`[${Status}] ${Step}: ${Message}`);
}

function WriteJson(FileName: string, Payload: unknown) {
  const Target = FileName.includes("diagnostics") ? Path.join(ReportRoot, FileName) : Path.join(DiagnosticsDir, FileName);
  const FinalTarget = FileName === "workflow-records.json" ? Path.join(ReportRoot, FileName) : Target;
  Fs.mkdirSync(Path.dirname(FinalTarget), { recursive: true });
  Fs.writeFileSync(FinalTarget, JSON.stringify(Payload, null, 2), "utf8");
}

function WriteSummary() {
  const Summary = {
    phase: "10.7.3",
    title: "Reports + Promotion + Readiness Governance QA",
    generatedAt: new Date().toISOString(),
    apiBaseUrl: ApiBaseUrl,
    mode: MutationMode ? "mutation" : "simulation",
    totals: {
      pass: WorkflowLog.filter((Item) => Item.Status === "PASS").length,
      warn: WorkflowLog.filter((Item) => Item.Status === "WARN").length,
      fail: WorkflowLog.filter((Item) => Item.Status === "FAIL").length,
      skip: WorkflowLog.filter((Item) => Item.Status === "SKIP").length,
    },
    records: WorkflowLog,
  };
  Fs.writeFileSync(Path.join(ReportRoot, "summary.json"), JSON.stringify(Summary, null, 2), "utf8");
}

function PrepareReportFolders() {
  Fs.mkdirSync(ReportRoot, { recursive: true });
  Fs.mkdirSync(DiagnosticsDir, { recursive: true });
}

function LoadVerificationEnv() {
  const CandidateFiles = [
    Path.resolve(".env.local"),
    Path.resolve(".env"),
    Path.resolve("..", ".env"),
    Path.resolve("..", "backend", ".env"),
  ];
  for (const FilePath of CandidateFiles) {
    if (!Fs.existsSync(FilePath)) continue;
    const Lines = Fs.readFileSync(FilePath, "utf8").split(/\r?\n/);
    for (const Line of Lines) {
      const Match = Line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!Match) continue;
      const Key = Match[1];
      if (process.env[Key]) continue;
      process.env[Key] = CleanEnvValue(Match[2]);
    }
  }
}

function CleanEnvValue(Value: unknown): string {
  return String(Value ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

function TrimTrailingSlash(Value: string): string {
  return String(Value || "").replace(/\/+$/, "");
}

function NormalizeMode(Value: string): string {
  const CleanValue = String(Value || "").trim().toLowerCase();
  return CleanValue === "mutation" ? "mutation" : "simulation";
}

function InferStudentCodeFromIdentifier(Value: string): string {
  const Clean = CleanEnvValue(Value);
  const Match = Clean.match(/MP-ST-\d+/i);
  return Match ? Match[0].toUpperCase() : "";
}

function MaskIdentifier(Value: string): string {
  const Clean = CleanEnvValue(Value);
  if (!Clean) return "";
  if (Clean.includes("@")) {
    const [Name, Domain] = Clean.split("@");
    return `${Name.slice(0, 2)}***@${Domain}`;
  }
  return `${Clean.slice(0, 3)}***`;
}

async function DisposeAuth(...States: AuthState[]) {
  for (const State of States) {
    await State.Api.dispose().catch(() => undefined);
  }
}
