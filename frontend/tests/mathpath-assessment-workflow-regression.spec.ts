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

const ApiBaseUrl = TrimTrailingSlash(process.env.MATHPATH_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api");
const ReportRoot = Path.resolve(process.env.MATHPATH_ASSESSMENT_WORKFLOW_REPORT_DIR || Path.join("verification-report", "phase-10-7-1-assessment-workflow"));
const DiagnosticsDir = Path.join(ReportRoot, "diagnostics");
const MutationMode = NormalizeMode(process.env.MATHPATH_ASSESSMENT_E2E_MODE || "simulation") === "mutation";
const TargetStudentCode = CleanEnvValue(process.env.MATHPATH_SAMPLE_STUDENT_CODE || "");
const TargetModuleCode = process.env.MATHPATH_SAMPLE_MODULE_CODE || "YLM";
const TargetLevelCode = process.env.MATHPATH_SAMPLE_LEVEL_CODE || "YLM-L1";

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

test.describe.configure({ mode: "serial", timeout: Number(process.env.MATHPATH_ASSESSMENT_WORKFLOW_TIMEOUT_MS || "600000") });

test.afterAll(async () => {
  WriteJson("workflow-records.json", WorkflowLog);
  WriteSummary();
});

test("Phase 10.7.1 — assessment workflow production-style regression with edge-case simulation", async () => {
  const Admin = await LoginAs("ADMIN");
  const Teacher = await LoginAs("TEACHER");
  const Student = await LoginAs("STUDENT");

  await ValidateAdminAssessmentStudio(Admin);
  const AssignmentOptions = await ValidateTeacherAssignmentReadiness(Teacher);
  const StudentAssessments = await ValidateStudentAssessmentQueue(Student);
  await ValidateCrossRoleTrackerConsistency(Admin, Teacher, StudentAssessments);
  await ValidateAssessmentResultSurfaceIfAvailable(Student, Admin, Teacher, StudentAssessments);
  await ValidateEdgeCaseContracts(Admin, Teacher, Student);

  if (MutationMode) {
    await RunControlledMutationWorkflow(Teacher, Student, AssignmentOptions);
  } else {
    AddRecord("Controlled mutation workflow", "SKIP", "Simulation mode is active. Set MATHPATH_ASSESSMENT_E2E_MODE=mutation to assign/start/submit using test data.");
  }

  const Failures = WorkflowLog.filter((Item) => Item.Status === "FAIL");
  expect(Failures, "Phase 10.7.1 assessment workflow regression must not produce hard failures.").toHaveLength(0);

  await DisposeAuth(Admin, Teacher, Student);
});

function ApiPath(Url: string): string {
  if (/^https?:\/\//i.test(Url)) return Url;
  const CleanPath = Url.startsWith("/") ? Url.slice(1) : Url;
  return `${ApiBaseUrl}/${CleanPath}`;
}

async function LoginAs(Role: RoleName): Promise<AuthState> {
  const LoginApi = await request.newContext();
  const LoginCandidates = BuildLoginCandidates();
  const Attempts: JsonRecord[] = [];
  let Payload: JsonRecord | null = null;
  let SuccessfulUrl = "";

  for (const Url of LoginCandidates) {
    const Response = await LoginApi.post(Url, {
      data: {
        identifier: Credentials[Role].Identifier,
        password: Credentials[Role].Password,
      },
    });
    const Detail = await SafeJson(Response);
    Attempts.push({
      url: Url,
      status: Response.status(),
      ok: Response.ok(),
      response: Detail,
    });

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
      identifierProvided: Boolean(Credentials[Role].Identifier),
      identifierPreview: MaskIdentifier(Credentials[Role].Identifier),
      passwordProvided: Boolean(Credentials[Role].Password),
      attemptedLoginUrls: Attempts,
      guidance: [
        "Open verification-report/phase-10-7-1-assessment-workflow/diagnostics/auth-login-diagnostics.json to see the exact HTTP status and backend response.",
        "If every attempted URL returns 401, the backend rejected the credential pair even though the frontend login screen may be using a different stored account.",
        "If the status is 404/405, the backend route/base URL contract differs from the verifier expectation.",
        "If the status is 500, the backend raised an internal error during login.",
      ],
    };
    WriteJson("auth-login-diagnostics.json", Diagnostic);
    AddRecord(`${Role} login`, "FAIL", `Login failed across ${Attempts.length} discovered auth endpoint candidate(s). See diagnostics/auth-login-diagnostics.json.`, Diagnostic);
    console.error(`\n${Role} login failed. Diagnostic written to ${Path.join(DiagnosticsDir, "auth-login-diagnostics.json")}\n`);
    console.error(JSON.stringify(Diagnostic, null, 2));
    expect(Payload, `${Role} login should succeed. See diagnostics/auth-login-diagnostics.json for exact backend response.`).toBeTruthy();
  }

  const Token = Payload?.accessToken;
  expect(Token, `${Role} login response should contain accessToken`).toBeTruthy();

  const Api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${Token}` },
  });

  AddRecord(`${Role} login`, "PASS", `Authenticated successfully through ${SuccessfulUrl}.`, { userId: Payload?.user?.id, role: Payload?.user?.role });
  await LoginApi.dispose();
  return { Role, Token, User: Payload?.user || {}, Api };
}

async function ValidateAdminAssessmentStudio(Admin: AuthState) {
  const BlueprintsResponse = await GetJson(Admin.Api, "/admin/assessment-blueprints?includeArchived=true", "Admin blueprint list");
  const Items = Array.isArray(BlueprintsResponse?.items) ? BlueprintsResponse.items : [];
  AddRecord("Admin blueprint inventory", Items.length ? "PASS" : "WARN", `${Items.length} assessment blueprint(s) returned.`, { count: Items.length });

  const Published = Items.filter((Item: JsonRecord) => String(Item.status || "").toUpperCase() === "PUBLISHED");
  const Available = Published.filter((Item: JsonRecord) => Boolean(AssessmentVersionIdOf(Item) || Item.latestPublishedVersionId || Item.generatedAssessmentId));
  AddRecord("Admin published assessment availability", Published.length && Available.length ? "PASS" : "WARN", `${Published.length} published blueprint(s), ${Available.length} blueprint(s) with generated/version references.`, {
    published: Published.length,
    available: Available.length,
    availableBlueprints: Available.map((Item: JsonRecord) => Pick(Item, ["id", "title", "moduleCode", "levelCode", "latestPublishedVersionId", "latestPublishedVersionNumber", "latestPublishedVersionStatus"])),
  });

  await ValidateAssessmentEngineFoundation(Admin, Items);
}

async function ValidateAssessmentEngineFoundation(Admin: AuthState, Blueprints: JsonRecord[]) {
  const Foundation = await GetJson(Admin.Api, "/admin/assessment-engine/foundation", "Admin assessment engine foundation");
  const FoundationChecks = {
    hasBlueprints: Number(Foundation?.blueprintCount || 0) > 0,
    hasVersions: Number(Foundation?.versionCount || 0) > 0,
    hasPublishedVersions: Number(Foundation?.publishedVersionCount || 0) > 0,
    hasQuestions: Number(Foundation?.questionCount || 0) > 0,
    governanceReady: Boolean(Foundation?.governance?.adminPublishesAssessment && Foundation?.governance?.teacherCanAssignOnlyPublished && Foundation?.governance?.studentCanAttemptOnlyAssigned),
  };

  const PublishedBlueprints = Blueprints.filter((Item: JsonRecord) => String(Item.status || "").toUpperCase() === "PUBLISHED");
  const CandidateBlueprint = PublishedBlueprints.find((Item: JsonRecord) => Boolean(Item.latestPublishedVersionId || AssessmentVersionIdOf(Item))) || PublishedBlueprints[0];

  if (!CandidateBlueprint?.id) {
    AddRecord("Assessment engine foundation", "WARN", "Foundation endpoint responded, but no published blueprint was available for direct version verification.", {
      foundation: FoundationShape(Foundation),
      foundationChecks: FoundationChecks,
      publishedBlueprints: PublishedBlueprints.length,
    });
    return;
  }

  const EngineState = await GetJson(Admin.Api, `/admin/assessment-blueprints/${CandidateBlueprint.id}/engine-state`, "Assessment blueprint engine state", false);
  const GeneratedResponse = await GetJson(Admin.Api, `/admin/assessment-blueprints/${CandidateBlueprint.id}/generated-assessment?includeAnswerKey=false`, "Assessment generated version verification", false);
  const GeneratedAssessment = GeneratedResponse?.assessment || null;

  const EngineStateChecks = {
    publishedAvailable: Boolean(EngineState?.publishedAvailable),
    hasVersions: Number(EngineState?.versionCount || 0) > 0,
    hasPublishedVersions: Number(EngineState?.publishedVersionCount || 0) > 0,
  };
  const GeneratedChecks = {
    generatedAvailable: Boolean(GeneratedResponse?.available),
    hasVersionId: Boolean(GeneratedAssessment?.id),
    hasQuestions: Number(GeneratedAssessment?.questionCount || 0) > 0 || (Array.isArray(GeneratedAssessment?.questions) && GeneratedAssessment.questions.length > 0),
    questionCountMatches: Number(GeneratedAssessment?.questionCount || 0) === (Array.isArray(GeneratedAssessment?.questions) ? GeneratedAssessment.questions.length : Number(GeneratedAssessment?.questionCount || 0)),
  };

  const AllFoundationChecksPassed = Object.values(FoundationChecks).every(Boolean);
  const AllEngineStateChecksPassed = Object.values(EngineStateChecks).every(Boolean);
  const AllGeneratedChecksPassed = Object.values(GeneratedChecks).every(Boolean);

  AddRecord(
    "Assessment engine foundation",
    AllFoundationChecksPassed && AllEngineStateChecksPassed && AllGeneratedChecksPassed ? "PASS" : "WARN",
    AllFoundationChecksPassed && AllEngineStateChecksPassed && AllGeneratedChecksPassed
      ? "Verified blueprint → published version → generated questions foundation chain."
      : "Foundation endpoint responded, but one or more direct version/question checks need review.",
    {
      blueprint: Pick(CandidateBlueprint, ["id", "title", "moduleCode", "levelCode", "status", "latestPublishedVersionId", "latestPublishedVersionNumber"]),
      foundation: FoundationShape(Foundation),
      foundationChecks: FoundationChecks,
      engineState: { ...EngineStateChecks, versionCount: EngineState?.versionCount, publishedVersionCount: EngineState?.publishedVersionCount },
      generatedAssessment: {
        ...GeneratedChecks,
        id: GeneratedAssessment?.id,
        status: GeneratedAssessment?.status,
        totalQuestions: GeneratedAssessment?.totalQuestions,
        questionCount: GeneratedAssessment?.questionCount,
      },
    },
  );
}

async function ValidateTeacherAssignmentReadiness(Teacher: AuthState) {
  const Options = await GetJson(Teacher.Api, "/teacher/assign-assessment/options", "Teacher assign assessment options");
  const Students = Array.isArray(Options?.students) ? Options.students : [];
  const Assessments = Array.isArray(Options?.availableAssessments) ? Options.availableAssessments : [];
  const AssignableStudents = Students.filter((Student: JsonRecord) => Boolean(Student.canAssign));
  const ReattemptStudents = Students.filter((Student: JsonRecord) => Boolean(Student.requiresReattempt));

  AddRecord("Teacher assign assessment options", Students.length ? "PASS" : "WARN", `${Students.length} student(s), ${Assessments.length} available assessment version(s).`, {
    students: Students.length,
    assignableStudents: AssignableStudents.length,
    availableAssessments: Assessments.length,
    readinessBypassEnabled: Options?.summary?.readinessBypassEnabled,
    readinessGateMode: Options?.summary?.readinessGateMode,
  });

  AddRecord("Assessment re-attempt queue visibility", "PASS", `${ReattemptStudents.length} student(s) currently require assessment re-attempt handling.`, {
    reattemptStudents: ReattemptStudents.map((Student: JsonRecord) => Pick(Student, ["studentId", "studentCode", "statusLabel", "requiresReattempt", "approvedReattemptAccess"])),
  });

  return Options;
}

async function ValidateStudentAssessmentQueue(Student: AuthState) {
  const Assessments = await GetJson(Student.Api, "/student/assessments", "Student assessments queue");
  const Items = Array.isArray(Assessments?.assessments) ? Assessments.assessments : [];
  const Pending = Items.filter((Item: JsonRecord) => /PENDING|IN_PROGRESS|REATTEMPT_AVAILABLE/i.test(String(Item.status || Item.action || "")));
  const Completed = Items.filter((Item: JsonRecord) => /COMPLETED|SUBMITTED|CLEARED|FAILED/i.test(String(Item.status || Item.action || "")));

  AddRecord("Student assessment queue", Items.length ? "PASS" : "WARN", `${Items.length} assessment assignment(s) visible to student.`, {
    total: Items.length,
    pendingOrActive: Pending.length,
    completedLike: Completed.length,
  });

  return Items;
}

async function ValidateCrossRoleTrackerConsistency(Admin: AuthState, Teacher: AuthState, StudentAssessments: JsonRecord[]) {
  const AdminAssessments = await GetJson(Admin.Api, "/admin/assessments", "Admin assessment control");
  const TeacherAssessments = await GetJson(Teacher.Api, "/teacher/assessments", "Teacher assessment tracker");
  const AdminRows = Array.isArray(AdminAssessments?.assessments) ? AdminAssessments.assessments : [];
  const TeacherRows = Array.isArray(TeacherAssessments?.rows) ? TeacherAssessments.rows : [];

  AddRecord("Admin assessment control records", AdminRows.length ? "PASS" : "WARN", `${AdminRows.length} assessment control record(s) returned.`, { count: AdminRows.length });
  AddRecord("Teacher assessment tracker records", TeacherRows.length ? "PASS" : "WARN", `${TeacherRows.length} assessment tracker record(s) returned.`, { count: TeacherRows.length });

  const StudentAssignmentIds = new Set(StudentAssessments.map((Item) => Item.assignmentId || Item.id).filter(Boolean));
  const AdminIds = new Set(AdminRows.map((Item: JsonRecord) => Item.assignmentId || Item.id).filter(Boolean));
  const TeacherIds = new Set(TeacherRows.map((Item: JsonRecord) => Item.assignmentId || Item.id).filter(Boolean));
  const MissingFromAdmin = [...StudentAssignmentIds].filter((Id) => !AdminIds.has(Id));
  const MissingFromTeacher = [...StudentAssignmentIds].filter((Id) => !TeacherIds.has(Id));

  AddRecord("Cross-role assessment assignment sync", MissingFromAdmin.length || MissingFromTeacher.length ? "WARN" : "PASS", "Compared assignment IDs visible from Student against Admin and Teacher trackers.", {
    studentVisibleAssignments: StudentAssignmentIds.size,
    missingFromAdmin: MissingFromAdmin,
    missingFromTeacher: MissingFromTeacher,
  });
}

async function ValidateAssessmentResultSurfaceIfAvailable(Student: AuthState, Admin: AuthState, Teacher: AuthState, StudentAssessments: JsonRecord[]) {
  const Completed = StudentAssessments.find((Item) => Item.resultAttemptId || Item.attemptId || /COMPLETED|SUBMITTED|CLEARED|FAILED/i.test(String(Item.status || "")));
  const AttemptId = Completed?.resultAttemptId || Completed?.attemptId;

  if (!AttemptId) {
    AddRecord("Assessment result surface", "SKIP", "No completed/student-visible assessment attempt ID was available for result validation.");
    return;
  }

  const StudentResult = await GetJson(Student.Api, `/student/assessment-attempts/${AttemptId}/result`, "Student assessment result", false);
  if (StudentResult) {
    ValidateResultPayload("Student assessment result", StudentResult);
  }

  const AdminResult = await GetJson(Admin.Api, `/admin/assessment-attempts/${AttemptId}/result`, "Admin assessment result", false);
  if (AdminResult) {
    ValidateResultPayload("Admin assessment result", AdminResult);
  }

  const TeacherResult = await GetJson(Teacher.Api, `/teacher/assessment-attempts/${AttemptId}/result`, "Teacher assessment result", false);
  if (TeacherResult) {
    ValidateResultPayload("Teacher assessment result", TeacherResult);
  }
}

function ValidateResultPayload(Label: string, Result: JsonRecord) {
  const Score = Number(Result.score ?? Result.summary?.score ?? 0);
  const MaxScore = Number(Result.maxScore ?? Result.summary?.maxScore ?? 0);
  const Accuracy = Number(Result.accuracyPercentage ?? Result.percentage ?? Result.summary?.accuracyPercentage ?? 0);
  const HasValidScore = Number.isFinite(Score) && Number.isFinite(MaxScore) && Score >= 0 && MaxScore >= 0 && Score <= Math.max(MaxScore, Score);
  const HasValidAccuracy = Number.isFinite(Accuracy) && Accuracy >= 0 && Accuracy <= 100;

  AddRecord(Label, HasValidScore && HasValidAccuracy ? "PASS" : "FAIL", "Validated score, max score, and accuracy boundaries.", {
    score: Score,
    maxScore: MaxScore,
    accuracy: Accuracy,
    status: Result.status,
    benchmarkStatus: Result.benchmarkStatus,
  });
}

async function ValidateEdgeCaseContracts(Admin: AuthState, Teacher: AuthState, Student: AuthState) {
  await ExpectHttpStatus(Student.Api, "/student/assessment-assignments/invalid-assignment-id", [404], "Invalid student assessment assignment should not expose data");
  await ExpectHttpStatus(Student.Api, "/student/assessment-attempts/invalid-attempt-id/result", [404], "Invalid student assessment result should not expose data");
  await ExpectHttpStatus(Teacher.Api, "/teacher/assessment-attempts/invalid-attempt-id/result", [404], "Invalid teacher assessment result should not expose data");
  await ExpectHttpStatus(Admin.Api, "/admin/assessment-attempts/invalid-attempt-id/result", [404], "Invalid admin assessment result should not expose data");

  const OptionsByLevel = await GetJson(Teacher.Api, `/teacher/assign-assessment/options?moduleId=${encodeURIComponent(TargetModuleCode)}&levelId=${encodeURIComponent(TargetLevelCode)}`, "Teacher filtered assessment options", false);
  if (OptionsByLevel) {
    const Students = Array.isArray(OptionsByLevel.students) ? OptionsByLevel.students : [];
    AddRecord("Filtered assignment options edge case", "PASS", `Filtered assignment endpoint responded for ${TargetModuleCode}/${TargetLevelCode}.`, {
      students: Students.length,
      availableAssessments: Array.isArray(OptionsByLevel.availableAssessments) ? OptionsByLevel.availableAssessments.length : 0,
    });
  }
}

async function RunControlledMutationWorkflow(Teacher: AuthState, Student: AuthState, AssignmentOptions: JsonRecord) {
  const Pair = await ResolveMutationAssignmentPair(Teacher, Student, AssignmentOptions);

  if (!Pair) {
    AddRecord("Controlled mutation workflow", "SKIP", "No safe student + assessment version pair was available for mutation mode.", BuildMutationInventory(AssignmentOptions));
    return;
  }

  const { TargetStudent, TargetAssessment, AssessmentVersionId, Source } = Pair;
  AddRecord("Controlled mutation pairing", "PASS", `Selected ${TargetStudent.studentCode || TargetStudent.studentId} with ${TargetAssessment.title || AssessmentVersionId} using ${Source}.`, {
    student: Pick(TargetStudent, ["studentId", "studentCode", "studentName", "moduleId", "moduleCode", "levelId", "levelCode", "canAssign", "alreadyAssigned"]),
    assessment: Pick(TargetAssessment, ["assessmentVersionId", "versionId", "id", "title", "moduleId", "moduleCode", "levelId", "levelCode"]),
  });

  const AssignResponse = await Teacher.Api.post(ApiPath("/teacher/assessment-assignments"), {
    data: {
      assessmentVersionId: AssessmentVersionId,
      studentIds: [TargetStudent.studentId],
      instructions: "Phase 10.7.1 controlled regression assignment.",
    },
  });

  if (!AssignResponse.ok()) {
    AddRecord("Teacher controlled assessment assignment", "FAIL", `Assignment failed with HTTP ${AssignResponse.status()}`, await SafeJson(AssignResponse));
    return;
  }

  const AssignPayload = await AssignResponse.json();
  const AssignmentId = AssignPayload?.assignmentIds?.[0];
  AddRecord("Teacher controlled assessment assignment", AssignmentId ? "PASS" : "FAIL", "Teacher assignment mutation completed.", AssignPayload);
  if (!AssignmentId) return;

  const Detail = await GetJson(Student.Api, `/student/assessment-assignments/${AssignmentId}`, "Student controlled assessment detail");
  AddRecord("Student controlled assessment detail", Detail?.assignmentId ? "PASS" : "FAIL", "Student can open assigned assessment detail.", Pick(Detail, ["assignmentId", "title", "status", "action"]));

  const StartResponse = await Student.Api.post(ApiPath(`/student/assessment-assignments/${AssignmentId}/start`), { data: { assignmentId: AssignmentId } });
  if (!StartResponse.ok()) {
    AddRecord("Student controlled assessment start", "FAIL", `Start failed with HTTP ${StartResponse.status()}`, await SafeJson(StartResponse));
    return;
  }

  const Attempt = await StartResponse.json();
  AddRecord("Student controlled assessment start", Attempt?.attemptId ? "PASS" : "FAIL", "Student assessment attempt started.", Pick(Attempt, ["attemptId", "status", "totalQuestions", "remainingSeconds"]));

  const Questions = Array.isArray(Attempt?.questions) ? Attempt.questions : [];
  for (const Question of Questions) {
    const FirstOption = Array.isArray(Question.options) ? Question.options[0] : null;
    if (!Question.questionId || !FirstOption?.optionId) continue;
    const SaveResponse = await Student.Api.post(ApiPath(`/student/assessment-attempts/${Attempt.attemptId}/answers`), {
      data: { questionId: Question.questionId, selectedOptionId: FirstOption.optionId },
    });
    if (!SaveResponse.ok()) {
      AddRecord("Student controlled assessment answer save", "FAIL", `Save answer failed with HTTP ${SaveResponse.status()}`, await SafeJson(SaveResponse));
      return;
    }
  }
  AddRecord("Student controlled assessment answer save", "PASS", `${Questions.length} answer save operation(s) attempted.`);

  const SubmitResponse = await Student.Api.post(ApiPath(`/student/assessment-attempts/${Attempt.attemptId}/submit`), { data: { confirmSubmit: true } });
  if (!SubmitResponse.ok()) {
    AddRecord("Student controlled assessment submit", "FAIL", `Submit failed with HTTP ${SubmitResponse.status()}`, await SafeJson(SubmitResponse));
    return;
  }

  const Result = await SubmitResponse.json();
  ValidateResultPayload("Student controlled assessment submit/result", Result);
}


async function ResolveMutationAssignmentPair(Teacher: AuthState, Student: AuthState, AssignmentOptions: JsonRecord): Promise<{ TargetStudent: JsonRecord; TargetAssessment: JsonRecord; AssessmentVersionId: string; Source: string } | null> {
  const Students = Array.isArray(AssignmentOptions?.students) ? AssignmentOptions.students : [];
  const Assessments = Array.isArray(AssignmentOptions?.availableAssessments) ? AssignmentOptions.availableAssessments : [];
  const LoggedInStudentCandidates = ResolveLoggedInStudentCandidates(Student);
  const Pair = FindMutationAssignmentPair(Students, Assessments, "logged-in student option inventory", LoggedInStudentCandidates);
  if (Pair) return Pair;

  const LoggedInStudents = Students.filter((Item: JsonRecord) => IsLoggedInStudentOption(Item, LoggedInStudentCandidates) && Boolean(Item.canAssign && Item.studentId));
  for (const StudentItem of LoggedInStudents) {
    const ModuleId = StringValue(StudentItem.moduleId || StudentItem.currentModuleId);
    const LevelId = StringValue(StudentItem.levelId || StudentItem.currentLevelId);
    if (!LevelId) continue;

    const Query = ModuleId
      ? `/teacher/assign-assessment/options?moduleId=${encodeURIComponent(ModuleId)}&levelId=${encodeURIComponent(LevelId)}`
      : `/teacher/assign-assessment/options?levelId=${encodeURIComponent(LevelId)}`;
    const FilteredOptions = await GetJson(Teacher.Api, Query, `Mutation pairing filtered options for logged-in student ${StudentItem.studentCode || StudentItem.studentId}`, false);
    if (!FilteredOptions) continue;

    const FilteredStudents = Array.isArray(FilteredOptions.students) ? FilteredOptions.students : [];
    const FilteredAssessments = Array.isArray(FilteredOptions.availableAssessments) ? FilteredOptions.availableAssessments : [];
    const FilteredPair = FindMutationAssignmentPair(FilteredStudents, FilteredAssessments, `filtered logged-in student inventory for ${StudentItem.studentCode || StudentItem.studentId}`, LoggedInStudentCandidates);
    if (FilteredPair) return FilteredPair;
  }

  AddRecord("Controlled mutation pairing", "WARN", "No safe level-matched pair was available for the currently logged-in student. Mutation was skipped to avoid assigning work to a different student account.", BuildMutationInventory(AssignmentOptions, LoggedInStudentCandidates));
  return null;
}

function FindMutationAssignmentPair(Students: JsonRecord[], Assessments: JsonRecord[], Source: string, LoggedInStudentCandidates: Set<string>) {
  const AssignableStudents = PrioritizeStudents(Students.filter((Item: JsonRecord) => Boolean(Item.canAssign && Item.studentId) && IsLoggedInStudentOption(Item, LoggedInStudentCandidates)));
  const AvailableAssessments = Assessments.filter((Item: JsonRecord) => Boolean(AssessmentVersionIdOf(Item)));

  for (const StudentItem of AssignableStudents) {
    const MatchingAssessment = AvailableAssessments.find((Assessment: JsonRecord) => IsStudentAssessmentLevelMatch(StudentItem, Assessment));
    if (MatchingAssessment) {
      return {
        TargetStudent: StudentItem,
        TargetAssessment: MatchingAssessment,
        AssessmentVersionId: AssessmentVersionIdOf(MatchingAssessment),
        Source,
      };
    }
  }

  return null;
}

function ResolveLoggedInStudentCandidates(Student: AuthState) {
  return new Set(CompactStrings([
    TargetStudentCode,
    Credentials.STUDENT.Identifier,
    Student.User?.id,
    Student.User?.userId,
    Student.User?.studentId,
    Student.User?.studentCode,
    Student.User?.email,
    Student.User?.identifier,
    Student.User?.username,
  ]));
}

function IsLoggedInStudentOption(StudentItem: JsonRecord, LoggedInStudentCandidates: Set<string>) {
  const StudentOptionValues = CompactStrings([
    StudentItem.studentId,
    StudentItem.userId,
    StudentItem.accountId,
    StudentItem.studentCode,
    StudentItem.email,
    StudentItem.identifier,
    StudentItem.username,
  ]);
  return StudentOptionValues.some((Value) => LoggedInStudentCandidates.has(Value));
}

function PrioritizeStudents(Students: JsonRecord[]) {
  if (!TargetStudentCode) return Students;
  const Requested = Students.filter((Item: JsonRecord) => StringValue(Item.studentCode) === TargetStudentCode);
  const Others = Students.filter((Item: JsonRecord) => StringValue(Item.studentCode) !== TargetStudentCode);
  return [...Requested, ...Others];
}

function IsStudentAssessmentLevelMatch(StudentItem: JsonRecord, Assessment: JsonRecord) {
  const StudentLevelIds = CompactStrings([StudentItem.levelId, StudentItem.currentLevelId]);
  const StudentLevelCodes = CompactStrings([StudentItem.levelCode, StudentItem.currentLevelCode]);
  const AssessmentLevelIds = CompactStrings([Assessment.levelId, Assessment.assessmentLevelId]);
  const AssessmentLevelCodes = CompactStrings([Assessment.levelCode, Assessment.assessmentLevelCode]);

  const LevelIdMatches = StudentLevelIds.length > 0 && AssessmentLevelIds.length > 0 && StudentLevelIds.some((Value) => AssessmentLevelIds.includes(Value));
  const LevelCodeMatches = StudentLevelCodes.length > 0 && AssessmentLevelCodes.length > 0 && StudentLevelCodes.some((Value) => AssessmentLevelCodes.includes(Value));
  if (!LevelIdMatches && !LevelCodeMatches) return false;

  const StudentModuleIds = CompactStrings([StudentItem.moduleId, StudentItem.currentModuleId]);
  const StudentModuleCodes = CompactStrings([StudentItem.moduleCode, StudentItem.currentModuleCode]);
  const AssessmentModuleIds = CompactStrings([Assessment.moduleId, Assessment.assessmentModuleId]);
  const AssessmentModuleCodes = CompactStrings([Assessment.moduleCode, Assessment.assessmentModuleCode]);
  const ModuleComparable = (StudentModuleIds.length > 0 && AssessmentModuleIds.length > 0) || (StudentModuleCodes.length > 0 && AssessmentModuleCodes.length > 0);
  if (!ModuleComparable) return true;

  const ModuleIdMatches = StudentModuleIds.length > 0 && AssessmentModuleIds.length > 0 && StudentModuleIds.some((Value) => AssessmentModuleIds.includes(Value));
  const ModuleCodeMatches = StudentModuleCodes.length > 0 && AssessmentModuleCodes.length > 0 && StudentModuleCodes.some((Value) => AssessmentModuleCodes.includes(Value));
  return ModuleIdMatches || ModuleCodeMatches;
}

function AssessmentVersionIdOf(Assessment: JsonRecord): string {
  return StringValue(Assessment.assessmentVersionId || Assessment.versionId || Assessment.latestPublishedVersionId || Assessment.availableVersionId || Assessment.currentVersionId || Assessment.id);
}

function BuildMutationInventory(AssignmentOptions: JsonRecord, LoggedInStudentCandidates: Set<string> = new Set()) {
  const Students = Array.isArray(AssignmentOptions?.students) ? AssignmentOptions.students : [];
  const Assessments = Array.isArray(AssignmentOptions?.availableAssessments) ? AssignmentOptions.availableAssessments : [];
  return {
    targetStudentCode: TargetStudentCode,
    loggedInStudentCandidateKeys: [...LoggedInStudentCandidates],
    assignableStudents: Students.filter((Item: JsonRecord) => Item.canAssign).map((Item: JsonRecord) => Pick(Item, ["studentId", "studentCode", "studentName", "moduleId", "moduleCode", "levelId", "levelCode", "canAssign", "assignmentBlockReason"])),
    availableAssessments: Assessments.map((Item: JsonRecord) => Pick(Item, ["assessmentVersionId", "versionId", "id", "title", "moduleId", "moduleCode", "levelId", "levelCode"])),
  };
}

function CompactStrings(Values: unknown[]) {
  return Values.map(StringValue).filter(Boolean);
}

function StringValue(Value: unknown): string {
  return typeof Value === "string" ? Value.trim() : Value == null ? "" : String(Value).trim();
}

async function GetJson(Api: APIRequestContext, Url: string, Label: string, HardFail = true) {
  const Response = await Api.get(ApiPath(Url));
  if (!Response.ok()) {
    const Detail = await SafeJson(Response);
    AddRecord(Label, HardFail ? "FAIL" : "WARN", `GET ${Url} returned HTTP ${Response.status()}.`, Detail);
    if (HardFail) expect(Response.ok(), `${Label} should respond successfully`).toBeTruthy();
    return null;
  }
  return Response.json();
}

async function ExpectHttpStatus(Api: APIRequestContext, Url: string, ExpectedStatuses: number[], Label: string) {
  const Response = await Api.get(ApiPath(Url));
  const Status = Response.status();
  AddRecord(Label, ExpectedStatuses.includes(Status) ? "PASS" : "FAIL", `GET ${Url} returned HTTP ${Status}; expected ${ExpectedStatuses.join("/")}.`, await SafeJson(Response));
}

async function SafeJson(Response: { json: () => Promise<unknown>; text: () => Promise<string> }) {
  try {
    return await Response.json();
  } catch {
    try {
      return await Response.text();
    } catch {
      return null;
    }
  }
}

function AddRecord(Step: string, Status: WorkflowRecord["Status"], Message: string, Detail?: unknown) {
  WorkflowLog.push({ Step, Status, Message, Detail });
}

function FoundationShape(Foundation: JsonRecord | null) {
  if (!Foundation) return null;
  return {
    engineStatus: Foundation.engineStatus,
    blueprintCount: Foundation.blueprintCount,
    versionCount: Foundation.versionCount,
    publishedVersionCount: Foundation.publishedVersionCount,
    questionCount: Foundation.questionCount,
    assignmentCount: Foundation.assignmentCount,
    attemptCount: Foundation.attemptCount,
    resultCount: Foundation.resultCount,
    governance: Foundation.governance,
  };
}

function Pick(Source: JsonRecord | null | undefined, Keys: string[]) {
  if (!Source) return null;
  return Keys.reduce<JsonRecord>((Result, Key) => {
    Result[Key] = Source[Key];
    return Result;
  }, {});
}

async function DisposeAuth(...States: AuthState[]) {
  for (const State of States) {
    await State.Api.dispose().catch(() => undefined);
  }
}

function PrepareReportFolders() {
  Fs.rmSync(ReportRoot, { recursive: true, force: true });
  Fs.mkdirSync(DiagnosticsDir, { recursive: true });
}

function WriteJson(FileName: string, Data: unknown) {
  Fs.writeFileSync(Path.join(DiagnosticsDir, FileName), JSON.stringify(Data, null, 2), "utf-8");
}

function WriteSummary() {
  const Counts = WorkflowLog.reduce<Record<string, number>>((Result, Item) => {
    Result[Item.Status] = (Result[Item.Status] || 0) + 1;
    return Result;
  }, {});
  const Lines = [
    "# MathPath Phase 10.7.1 — Assessment Workflow Regression Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `API Base URL: ${ApiBaseUrl}`,
    `Mode: ${MutationMode ? "mutation" : "simulation"}`,
    "",
    "## Result Summary",
    "",
    `- PASS: ${Counts.PASS || 0}`,
    `- WARN: ${Counts.WARN || 0}`,
    `- FAIL: ${Counts.FAIL || 0}`,
    `- SKIP: ${Counts.SKIP || 0}`,
    "",
    "## Workflow Records",
    "",
    ...WorkflowLog.map((Item) => `- ${Item.Status}: ${Item.Step} — ${Item.Message}`),
    "",
    "## Notes",
    "",
    "- Simulation mode validates contracts, queues, trackers, result payload boundaries, invalid-ID safety, and cross-role record visibility without creating new assessment records.",
    "- Mutation mode performs a controlled assign/start/answer/submit cycle against the configured test dataset.",
  ];
  Fs.writeFileSync(Path.join(ReportRoot, "summary.md"), Lines.join("\n"), "utf-8");
}

function BuildLoginCandidates(): string[] {
  const RootBaseUrl = ApiBaseUrl.replace(/\/api$/i, "");
  return UniqueStrings([
    `${ApiBaseUrl}/auth/login`,
    `${RootBaseUrl}/api/auth/login`,
    `${RootBaseUrl}/auth/login`,
  ].map(TrimTrailingSlash));
}

function UniqueStrings(Values: string[]): string[] {
  return [...new Set(Values)];
}

function MaskIdentifier(Value: string): string {
  if (!Value) return "";
  if (Value.includes("@")) {
    const [Name, Domain] = Value.split("@");
    return `${Name.slice(0, 2)}***@${Domain}`;
  }
  return `${Value.slice(0, 3)}***${Value.slice(-2)}`;
}

function CleanEnvValue(Value: string | undefined): string {
  return (Value || "").trim().replace(/^(["'])|(["'])$/g, "").trim();
}

function NormalizeMode(Value: string) {
  return Value.trim().toLowerCase().replace(/_/g, "-");
}

function TrimTrailingSlash(Value: string) {
  return Value.replace(/\/$/, "");
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
