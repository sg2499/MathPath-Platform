import { api } from "@/lib/api";

export type TeacherStudent = {
  studentId: string;
  userId: string;
  studentName: string;
  studentCode: string;
  customId: string | null;
  className: string | null;
  section: string | null;
  schoolName: string | null;
  photoUrl: string | null;
  currentModuleId: string | null;
  currentLevelId: string | null;
  currentModuleCode: string | null;
  currentLevelCode: string | null;
  isActive: boolean;
  status: string;
  assignedAssignments?: number;
  completedAssignments?: number;
  pendingAssignments?: number;
  inProgressAssignments?: number;
  completedAttempts: number;
  belowBenchmarkAttempts?: number;
  requiresAttention?: boolean;
  benchmarkPercentage?: number;
  latestScore: number | null;
  latestAccuracy: number | null;
  averageAccuracy?: number | null;
  latestActivityAt?: string | null;
  attention?: "NO_ASSIGNMENT" | "NEEDS_FOLLOW_UP" | "NO_ATTEMPT_YET" | "NEEDS_PRACTICE" | "ON_TRACK" | string;
};

export type TeacherDashboardSummary = {
  studentCount: number;
  activeStudentCount: number;
  assignmentCount: number;
  completedAttemptCount: number;
  averageAccuracy: number;
};

export type TeacherAvailableLevel = {
  levelId: string;
  levelCode: string;
  levelName: string;
  studentCount: number;
};

export type TeacherAvailableDps = {
  dpsId: string;
  dpsNumber: number;
  dpsTitle: string;
  questionCount: number;
  durationSeconds: number;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  levelId: string;
  levelCode: string;
  levelName: string;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  publicationStatus?: string;
};

export type TeacherResultAttempt = {
  attemptId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  title: string;
  status: string;
  score: number | null;
  totalMarks: number | null;
  accuracy: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  timeTakenSeconds: number | null;
  submittedAt: string | null;
  benchmarkPercentage?: number | null;
  benchmarkStatus?: string | null;
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  startedAt?: string | null;
  attemptDate?: string | null;
  completedDate?: string | null;
  dpsId?: string;
  dpsNumber?: number;
  dpsTitle?: string;
  levelCode?: string;
  lessonNumber?: number;
};

export async function getTeacherDashboard(): Promise<TeacherDashboardSummary> {
  const { data } = await api.get<TeacherDashboardSummary>("/teacher/dashboard");
  return data;
}

export async function getTeacherStudents(): Promise<TeacherStudent[]> {
  const { data } = await api.get<{ students: TeacherStudent[] }>("/teacher/students");
  return data.students;
}

export async function getTeacherAvailableDps(): Promise<{ levels: TeacherAvailableLevel[]; dps: TeacherAvailableDps[] }> {
  const { data } = await api.get<{ levels: TeacherAvailableLevel[]; dps: TeacherAvailableDps[] }>("/teacher/available-dps");
  return data;
}

export async function teacherAssignDps(payload: {
  dpsId: string;
  studentIds: string[];
  title?: string;
  instructions?: string;
  allowReattempt?: boolean;
}): Promise<{ created: boolean; message: string; assignmentIds: string[] }> {
  const { data } = await api.post("/teacher/assignments", payload);
  return data;
}

export async function getTeacherResults(): Promise<TeacherResultAttempt[]> {
  const { data } = await api.get<{ attempts: TeacherResultAttempt[] }>("/teacher/results");
  return data.attempts;
}

export type TeacherAttemptResult = {
  attemptId: string;
  status: string;
  startedAt?: string | null;
  submittedAt?: string | null;
  attemptDate?: string | null;
  completedDate?: string | null;
  summary: {
    totalQuestions: number;
    attempted: number;
    correct: number;
    wrong: number;
    unanswered: number;
    score: number;
    maxScore: number;
    accuracyPercentage: number;
    timeTakenSeconds: number | null;
  };
  questionReview: Array<{
    questionNumber: number;
    questionId: string;
    displayType: string;
    operands: number[];
    operators: string[];
    selectedOption: { label: string; value: string } | null;
    correctOption: { label: string; value: string } | null;
    isCorrect: boolean;
  }>;
  message: string;
  student?: {
    studentId: string | null;
    studentName: string;
    studentCode: string;
    className?: string | null;
    section?: string | null;
  };
  assignment?: {
    assignmentId: string | null;
    title?: string | null;
  };
  dps?: Partial<TeacherAvailableDps>;
};

export async function getTeacherAttemptResult(attemptId: string): Promise<TeacherAttemptResult> {
  const { data } = await api.get<TeacherAttemptResult>(`/teacher/attempts/${attemptId}/result`);
  return data;
}


export type TeacherAssignmentTrackerRow = {
  assignmentId: string;
  assignmentTitle: string;
  assignmentType: string;
  assignedByName: string;
  assignedByRole: "ADMIN" | "TEACHER" | string;
  assignedToType: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  className: string | null;
  section: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REATTEMPT_AVAILABLE" | string;
  attemptId: string | null;
  attemptStatus: string | null;
  score: number | null;
  totalMarks: number | null;
  accuracy: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  timeTakenSeconds: number | null;
  benchmarkPercentage?: number | null;
  benchmarkStatus?: string | null;
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  reattemptPermissionId?: string | null;
  reattemptStatus?: string | null;
  reattemptAllowedAt?: string | null;
  createdAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  attemptDate: string | null;
  completedDate: string | null;
  dpsId: string | null;
  dpsNumber: number | null;
  dpsTitle: string | null;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
};

export type TeacherAssignmentTrackerResponse = {
  summary: {
    assignedRows: number;
    completedRows: number;
    pendingRows: number;
    inProgressRows: number;
    reattemptAvailableRows?: number;
    uniqueAssignments: number;
  };
  rows: TeacherAssignmentTrackerRow[];
};

export async function getTeacherAssignmentTracker(): Promise<TeacherAssignmentTrackerResponse> {
  const { data } = await api.get<TeacherAssignmentTrackerResponse>("/teacher/assignment-tracker");
  return data;
}



export type TeacherAvailableAssessment = {
  assessmentVersionId: string;
  blueprintId: string;
  title: string;
  versionNumber: number;
  status: string;
  isAvailable: boolean;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  totalQuestions: number;
  questionCount: number;
  totalMarks: number;
  marksPerQuestion: number;
  durationSeconds: number;
  durationMinutes: number;
  assignmentCount: number;
  publishedAt: string | null;
};

export type TeacherAssignableAssessmentStudent = TeacherAssessmentEligibilityRow & {
  alreadyAssigned: boolean;
  existingAssessmentAssignmentId: string | null;
  sourceAssessmentVersionId?: string | null;
  sourceAssessmentTitle?: string | null;
  requiresReattempt?: boolean;
  approvedReattemptAccess?: boolean;
  approvedReattemptApprovalId?: string | null;
  reattemptApprovalStatus?: string;
  reattemptNextAttemptNumber?: number | null;
  readinessBypassApplied?: boolean;
  testingOverrideApplied?: boolean;
  testingOverrideId?: string | null;
  testingOverrideLabel?: string | null;
  readinessGateMode?: string | null;
  canAssign: boolean;
  assignmentBlockReason: string;
};

export type TeacherAssignAssessmentOptionsResponse = {
  summary: {
    students: number;
    eligibleStudents: number;
    assignableStudents: number;
    alreadyAssigned: number;
    reattemptNeeded?: number;
    availableAssessments: number;
    readinessBypassEnabled?: boolean;
    readinessBypassStudents?: number;
    readinessGateMode?: string;
    readinessGateLabel?: string;
    testingOverrideEnabled?: boolean;
    testingOverrideLabel?: string;
    testingOverrideStudents?: number;
    strictReadinessMode?: boolean;
    assignmentGateMode?: "STRICT_READINESS" | "GLOBAL_TESTING_BYPASS" | string;
    assignmentGateLabel?: string;
    blockedStudents?: number;
    strictBlockedStudents?: number;
    readyStudents?: number;
    overrideAssignableStudents?: number;
    temporaryBypassAssignableStudents?: number;
  };
  students: TeacherAssignableAssessmentStudent[];
  availableAssessments: TeacherAvailableAssessment[];
};

export async function getTeacherAssignAssessmentOptions(params?: { moduleId?: string; levelId?: string }): Promise<TeacherAssignAssessmentOptionsResponse> {
  const { data } = await api.get<TeacherAssignAssessmentOptionsResponse>("/teacher/assign-assessment/options", {
    params,
  });
  return data;
}

export async function teacherAssignAssessment(payload: {
  assessmentVersionId: string;
  studentIds: string[];
  instructions?: string;
}): Promise<{ created: boolean; message: string; assignmentIds: string[]; rejected: Array<{ studentId: string; reason: string }> }> {
  const { data } = await api.post("/teacher/assessment-assignments", payload);
  return data;
}

export type TeacherAssessmentRow = TeacherAssignmentTrackerRow & {
  assessmentId?: string;
  assessmentTitle?: string;
};

export type TeacherAssessmentsResponse = {
  summary: {
    assignedRows: number;
    completedRows: number;
    pendingRows: number;
    inProgressRows: number;
    reattemptAvailableRows?: number;
    uniqueAssessments: number;
  };
  rows: TeacherAssessmentRow[];
};

export async function getTeacherAssessments(): Promise<TeacherAssessmentsResponse> {
  const { data } = await api.get<TeacherAssessmentsResponse>("/teacher/assessments");
  return data;
}


export type TeacherStudentLevelPromotion = {
  promotionId: string;
  studentId?: string | null;
  studentName?: string | null;
  studentCode?: string | null;
  fromModuleId?: string | null;
  fromModuleCode?: string | null;
  fromModuleName?: string | null;
  fromLevelId?: string | null;
  fromLevelCode?: string | null;
  fromLevelName?: string | null;
  toModuleId?: string | null;
  toModuleCode?: string | null;
  toModuleName?: string | null;
  toLevelId?: string | null;
  toLevelCode?: string | null;
  toLevelName?: string | null;
  assessmentAssignmentId?: string | null;
  assessmentAttemptId?: string | null;
  assessmentResultId?: string | null;
  assessmentTitle?: string | null;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  status?: string | null;
  statusLabel?: string | null;
  promotedByUserId?: string | null;
  promotedByName?: string | null;
  promotedAt?: string | null;
  createdAt?: string | null;
};

export async function getTeacherStudentLevelPromotions(): Promise<{
  items: TeacherStudentLevelPromotion[];
  total: number;
}> {
  const { data } = await api.get("/teacher/student-level-promotions");
  return data;
}


export type TeacherAssessmentEligibilityRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  className: string | null;
  section: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  benchmarkPercentage: number;
  eligible: boolean;
  status: string;
  statusLabel: string;
  requiredDpsCount: number;
  completedDpsCount: number;
  passedDpsCount: number;
  missingDpsCount: number;
  belowBenchmarkDpsCount: number;
  progressPercentage: number;
  lessons: Array<{
    lessonId: string;
    lessonNumber: number;
    lessonTitle: string;
    requiredDpsCount: number;
    completedDpsCount: number;
    passedDpsCount: number;
    missingDpsCount: number;
    belowBenchmarkDpsCount: number;
    dps: Array<Record<string, unknown>>;
  }>;
  missingDps: Array<Record<string, unknown>>;
  belowBenchmarkDps: Array<Record<string, unknown>>;
  message: string;
};

export type TeacherAssessmentEligibilityResponse = {
  benchmarkPercentage: number;
  totalStudents: number;
  readyCount: number;
  notReadyCount: number;
  rows: TeacherAssessmentEligibilityRow[];
};

export async function getTeacherAssessmentEligibility(levelId?: string): Promise<TeacherAssessmentEligibilityResponse> {
  const { data } = await api.get<TeacherAssessmentEligibilityResponse>("/teacher/assessment-eligibility", {
    params: levelId ? { levelId } : undefined,
  });
  return data;
}
