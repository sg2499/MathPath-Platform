import { api } from "@/lib/api";
import type { StudentCompetitionMockResult } from "@/lib/api/student";

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
  // Last Seen: real login/session recency (User.last_active_at on the backend),
  // distinct from latestActivityAt above (which only moves on a completed
  // DPS/assessment attempt, not on merely logging in).
  lastActiveAt?: string | null;
  attention?: "NO_ASSIGNMENT" | "NEEDS_FOLLOW_UP" | "NO_ATTEMPT_YET" | "NEEDS_PRACTICE" | "ON_TRACK" | string;
  // Derived live from Attempt.cleared_at_attempt (see lesson_progress_service.py)
  // -- never stored, so this is always the current position, not a cached one.
  currentLessonId?: string | null;
  currentLessonNumber?: number | null;
  currentLessonTitle?: string | null;
  clearedInCurrentLesson?: number;
  totalInCurrentLesson?: number;
  assignableInCurrentLesson?: boolean;
  // True when this student has never had a DPS sheet assigned anywhere in
  // this level yet -- currentLessonId above is only the lesson-1-first
  // fallback in that case, not a real anchor, so assign-dps/page.tsx lets
  // a teacher place their first assignment on any lesson, not just this
  // fallback one. See lesson_progress_service.py's isNewToLevel.
  isNewToLevel?: boolean;
  // Every DPS id (within this student's current level) actually
  // assignable to them right now -- not just the ones in their anchored
  // "current" lesson above. This is the source of truth assign-dps uses
  // to decide who is eligible for a lesson/sheet the teacher picks, so
  // eligibility is never gated on currentLessonId matching. See
  // lesson_progress_service.py's assignable_dps_ids_by_student.
  assignableDpsIds?: string[];
  levelComplete?: boolean;
  previousLessonNumber?: number | null;
  previousLessonTitle?: string | null;
  // ADDITIVE (Shailesh, 2026-09-15): the next lesson, in sequence, this
  // student is eligible to be assigned -- derived purely from the last
  // lesson they were ever actually assigned a sheet in (+1), never from
  // whether that lesson has been cleared. There is no completion lock
  // anymore: a teacher can assign this student either their current
  // (last-assigned) lesson or this next one, never further ahead. null
  // when there's no assignment anchor yet (isNewToLevel already leaves
  // such a student unrestricted) or when they're anchored on the level's
  // final lesson already. See lesson_progress_service.py.
  nextEligibleLessonNumber?: number | null;
  nextEligibleLessonTitle?: string | null;
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

export async function teacherAssignAllSheetsForLesson(payload: {
  lessonId: string;
  studentIds: string[];
  instructions?: string;
}): Promise<{
  created: boolean;
  message: string;
  assignmentIds: string[];
  sheetsAssigned: number;
  totalSheetsInLesson: number;
  studentsAssigned: number;
}> {
  const { data } = await api.post("/teacher/assignments/lesson", payload);
  return data;
}

export async function teacherScheduleDpsForLesson(payload: {
  lessonId: string;
  studentIds: string[];
  scheduleItems: { dpsId: string; date: string }[];
  instructions?: string;
}): Promise<{
  created: boolean;
  message: string;
  assignmentIds: string[];
  warnings: string[];
  studentsAssigned: number;
}> {
  const { data } = await api.post("/teacher/assignments/schedule", payload);
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
    // DPS questions are typed free-text answers now, not MCQ picks -- see
    // OPEN_ISSUES.md 2026-08-03e.
    studentAnswer?: string | null;
    correctAnswer?: string | number | null;
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

export type TeacherCompetitionTrackerRow = {
  assignmentId: string;
  mockExamId: string;
  attemptId: string | null;
  status: string;
  assignmentStatus?: string | null;
  attemptStatus?: string | null;
  assignedAt?: string | null;
  dueAt?: string | null;
  submittedAt?: string | null;
  student: {
    studentId: string;
    studentCode: string;
    studentName: string;
    className?: string | null;
    section?: string | null;
  };
  mockExam: {
    title: string;
    mockCode?: string | null;
    moduleCode?: string | null;
    levelCode?: string | null;
    totalQuestions: number;
    totalMarks: number;
    marksPerQuestion: number;
    durationSeconds: number;
  };
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  accuracyPercentage?: number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  unansweredCount?: number | null;
  timeTakenSeconds?: number | null;
  timeTakenText?: string | null;
  timeUtilizationPercentage?: number | null;
  performanceBand?: string | null;
  sectionPerformance: Array<{ concept?: string; section?: string; correct: number; total: number; percentage: number }>;
  strengths: Array<{ concept?: string; section?: string; correct: number; total: number; percentage: number }>;
  weakAreas: Array<{ concept?: string; section?: string; correct: number; total: number; percentage: number }>;
};

export type TeacherCompetitionTrackerPayload = {
  summary: {
    assignedCount: number;
    completedCount: number;
    pendingCount: number;
    inProgressCount: number;
    averageScore: number;
    averageAccuracy: number;
    averageTimeTakenSeconds: number | null;
    averageTimeTakenText?: string | null;
  };
  rows: TeacherCompetitionTrackerRow[];
};

export async function getTeacherCompetitionMockTracker(): Promise<TeacherCompetitionTrackerPayload> {
  const { data } = await api.get<TeacherCompetitionTrackerPayload>("/teacher/competition/mock-tracker");
  return data;
}

export async function getTeacherCompetitionMockResult(attemptId: string): Promise<StudentCompetitionMockResult> {
  const { data } = await api.get<StudentCompetitionMockResult>(`/teacher/competition/mock-attempts/${attemptId}/result`);
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition -- Teacher Monitoring (Package 7). Read-only: no
// assign/rank/release action exists on the teacher side, matching this
// repo's Competition Mock precedent (Admin: create/publish/assign/review,
// Teacher: monitor/review only -- see pkg-09-permissions-and-safety.md).
// Types mirror annual_competition_monitoring_service.py's payloads.
// ---------------------------------------------------------------------------

export type TeacherAnnualCompetitionEvent = {
  eventId: string;
  name: string;
  status: string;
  competitionDate: string | null;
};

export async function getTeacherAnnualCompetitionEvents(): Promise<TeacherAnnualCompetitionEvent[]> {
  const { data } = await api.get<{ events: TeacherAnnualCompetitionEvent[] }>("/teacher/competition/annual/events");
  return data.events;
}

export type TeacherAnnualCompetitionLiveRow = {
  assignmentId: string;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  className: string | null;
  section: string | null;
  assignedLevelCode: string;
  slot: { slotId: string; mode: string; slotLabel: string | null; scheduledStartAt: string | null; scheduledEndAt: string | null } | null;
  attemptId: string | null;
  attemptStatus: string;
  liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "STUCK" | "SUBMITTED" | "FINALIZED";
  currentSectionNumber: number | null;
  remainingSecondsAtLastHeartbeat: number | null;
  lastHeartbeatAt: string | null;
  heartbeatGapSeconds: number | null;
};

export type TeacherAnnualCompetitionLiveMonitoring = {
  eventId: string;
  eventName: string;
  eventStatus: string;
  generatedAt: string;
  summary: {
    totalCount: number;
    notStartedCount: number;
    inProgressCount: number;
    stuckCount: number;
    submittedCount: number;
    finalizedCount: number;
  };
  rows: TeacherAnnualCompetitionLiveRow[];
};

export async function getTeacherAnnualCompetitionLive(eventId: string): Promise<TeacherAnnualCompetitionLiveMonitoring> {
  const { data } = await api.get<TeacherAnnualCompetitionLiveMonitoring>(`/teacher/competition/annual/events/${eventId}/live`);
  return data;
}

export type TeacherAnnualCompetitionResultRow = {
  assignmentId: string;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  assignedLevelCode: string;
  attemptId: string | null;
  attemptStatus: string;
  released: boolean;
  result: {
    score: number;
    maxScore: number;
    percentage: number;
    accuracyPercentage: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    timeTakenSeconds: number | null;
    perSectionTime: Array<Record<string, unknown>>;
    rank: number | null;
    releasedAt: string | null;
  } | null;
};

export type TeacherAnnualCompetitionResultsList = {
  eventId: string;
  competitionLevelCode: string | null;
  totalResults: number;
  rows: TeacherAnnualCompetitionResultRow[];
};

export async function getTeacherAnnualCompetitionResults(eventId: string, competitionLevelCode?: string | null): Promise<TeacherAnnualCompetitionResultsList> {
  const { data } = await api.get<TeacherAnnualCompetitionResultsList>(`/teacher/competition/annual/events/${eventId}/results`, {
    params: competitionLevelCode ? { competitionLevelCode } : undefined,
  });
  return data;
}

// Phase H (Competition Practice, teacher frontend); fully decoupled from
// any event, 2026-09-12: the read-only sibling of TeacherAnnualCompetition
// ResultRow above -- separate type/endpoint rather than a field on the
// OFFICIAL row, mirroring ListAnnualCompetitionPracticeResultsForRoster's
// own backend docstring on why (practice has no CompetitionEventAssignment
// to key a roster row by, and a student can have MANY practice results
// overall -- one per consumed bank paper -- unlike OFFICIAL's one row per
// assignment). Never ranked, never release-gated (practice is always
// released the instant it's scored), so there's no `released`/`rank` here
// the way the OFFICIAL row has, and no event scope either.
// 2026-09-14 (Shailesh, "show all papers, not just submitted, on
// expanding a student block"): rewired from a flat list of submitted
// results to a per-student roster of every practice paper (pending AND
// submitted), ascending by assignment order -- mirrors the admin-side
// AnnualCompetitionPracticeRoster* types exactly. See
// ListAnnualCompetitionPracticeResultsForRoster's own docstring in
// annual_competition_monitoring_service.py.
export type TeacherAnnualCompetitionPracticeResult = {
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  computedAt: string | null;
};

export type TeacherAnnualCompetitionPracticeRosterPaper = {
  levelPaperId: string;
  attemptId: string | null;
  competitionLevelCode: string;
  // levelPaperId/paperOrdinal/paperLabel (2026-09-14, Shailesh -- teacher
  // Practice tab restructure): same stable "Practice Paper N" numbering the
  // admin and student surfaces use, computed server-side -- see
  // ComputePracticePaperOrdinals's own docstring on the backend.
  paperOrdinal: number | null;
  paperLabel: string;
  // NOT_STARTED for a pending (never-attempted) paper; otherwise the
  // underlying CompetitionEventAttempt's own status.
  status: string;
  assignedAt: string | null;
  submittedAt: string | null;
  result: TeacherAnnualCompetitionPracticeResult | null;
};

export type TeacherAnnualCompetitionPracticeRosterStudent = {
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  papers: TeacherAnnualCompetitionPracticeRosterPaper[];
};

export type TeacherAnnualCompetitionPracticeResultsList = {
  competitionLevelCode: string | null;
  totalStudents: number;
  students: TeacherAnnualCompetitionPracticeRosterStudent[];
};

export async function getTeacherAnnualCompetitionPracticeResults(
  competitionLevelCode?: string | null
): Promise<TeacherAnnualCompetitionPracticeResultsList> {
  const { data } = await api.get<TeacherAnnualCompetitionPracticeResultsList>(`/teacher/competition/annual/practice-results`, {
    params: competitionLevelCode ? { competitionLevelCode } : undefined,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Practice Reports (package 2/4, Shailesh, 2026-09-16): teacher's own,
// roster-scoped sibling of the admin Practice Reports endpoints
// (lib/api/admin.ts's getAnnualCompetitionPracticeReportForStudent/ForLevel)
// -- same response shapes (the backend's GetAnnualCompetitionPracticeReport-
// ForStudent/ForLevel serve both), kept as separate, parallel types/functions
// here rather than imported from admin.ts, matching this file's own existing
// convention of a parallel Teacher-prefixed type for every admin-side
// Annual Competition type above (TeacherAnnualCompetitionPracticeResult vs
// AnnualCompetitionPracticeResult, etc.).
// ---------------------------------------------------------------------------

export type TeacherAnnualCompetitionPracticeReportSummary = {
  attemptsCount: number;
  avgScore: number | null;
  avgMaxScore: number | null;
  avgPercentage: number | null;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  papersAssignedCount: number;
  papersCompletedCount: number;
};

export type TeacherAnnualCompetitionPracticeReportSectionRow = {
  sectionNumber: number;
  // 2026-09-17 (Shailesh: "the section number and section names should
  // appear everywhere relevant") -- the section's real title from its
  // level's own registry, e.g. "Add/Less (Abacus)". null only if the level
  // code is somehow unrecognized (defensive; should not happen in practice).
  sectionTitle: string | null;
  attemptsCount: number;
  avgScore: number | null;
  avgMaxScore: number | null;
  avgAttemptedCount: number | null;
  avgTotalQuestions: number | null;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  timeLimitSeconds: number | null;
};

export type TeacherAnnualCompetitionPracticeReportTrendRow = {
  attemptId: string;
  computedAt: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  timeTakenSeconds: number | null;
};

export type TeacherAnnualCompetitionPracticeReportByLevelRow = TeacherAnnualCompetitionPracticeReportSummary & {
  competitionLevelCode: string;
  lastAttemptAt: string | null;
};

export type TeacherAnnualCompetitionPracticeReportLevelComparison = {
  cohortAttemptsCount: number;
  cohortStudentsCount: number;
  cohortAvgScore: number | null;
  cohortAvgMaxScore: number | null;
  cohortAvgPercentage: number | null;
  cohortAvgAccuracyPercentage: number | null;
  cohortAvgTimeTakenSeconds: number | null;
};

export type TeacherAnnualCompetitionPracticeReportForStudent = {
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  competitionLevelCode: string | null;
  summary: TeacherAnnualCompetitionPracticeReportSummary;
  perSection: TeacherAnnualCompetitionPracticeReportSectionRow[];
  trend: TeacherAnnualCompetitionPracticeReportTrendRow[];
  byLevel: TeacherAnnualCompetitionPracticeReportByLevelRow[];
  levelComparison: TeacherAnnualCompetitionPracticeReportLevelComparison | null;
};

// competitionLevelCode is optional -- omit (or pass null/undefined) for the
// blended "All Levels" view. The backend rejects this student id with a 403
// if the student isn't on this teacher's own roster.
export async function getTeacherAnnualCompetitionPracticeReportForStudent(
  studentId: string,
  competitionLevelCode?: string | null
): Promise<TeacherAnnualCompetitionPracticeReportForStudent> {
  const { data } = await api.get<TeacherAnnualCompetitionPracticeReportForStudent>(
    `/teacher/competition/annual/practice-reports/student/${studentId}`,
    { params: { competitionLevelCode: competitionLevelCode || undefined } }
  );
  return data;
}

export type TeacherAnnualCompetitionPracticeReportStudentRow = TeacherAnnualCompetitionPracticeReportSummary & {
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  lastAttemptAt: string | null;
  // 2026-09-18 (Practice Leaderboard feature) -- see the identical field on
  // AnnualCompetitionPracticeReportStudentRow (lib/api/admin.ts) for why.
  rank: number;
};

export type TeacherAnnualCompetitionPracticeReportForLevel = {
  competitionLevelCode: string;
  summary: TeacherAnnualCompetitionPracticeReportSummary & { studentsWithAttemptsCount: number };
  perSection: TeacherAnnualCompetitionPracticeReportSectionRow[];
  perStudent: TeacherAnnualCompetitionPracticeReportStudentRow[];
};

// Scoped server-side to this teacher's own roster (StudentIdsFilter) --
// never another teacher's students, same as getTeacherAnnualCompetition
// PracticeResults above.
export async function getTeacherAnnualCompetitionPracticeReportForLevel(
  competitionLevelCode: string
): Promise<TeacherAnnualCompetitionPracticeReportForLevel> {
  const { data } = await api.get<TeacherAnnualCompetitionPracticeReportForLevel>(
    `/teacher/competition/annual/practice-reports/level/${competitionLevelCode}`
  );
  return data;
}

// 2026-09-14 batch (Shailesh): teacher-facing Answer Sheet + Scorecard --
// the "View" action on both the Official results table
// (TeacherAnnualCompetitionResultRow, gated on released/result above, same
// as it already was) and the Practice roster (TeacherAnnualCompetitionPracticeRosterPaper,
// gated on result being present -- practice results are visible the instant
// they're computed at submission). Mirrors AnnualCompetitionAttemptReview*
// in lib/api/student.ts field for field, plus studentId/studentCode/
// studentName since a teacher (unlike a student viewing their own attempt)
// needs to know whose attempt this is.
export type TeacherAnnualCompetitionAttemptReviewQuestion = {
  questionId: string;
  questionNumber: number;
  displayType: string | null;
  questionText: string | null;
  operands: Array<number | string>;
  operators: string[];
  studentAnswer: string | null;
  correctAnswer: string | null;
  isUnanswered: boolean;
  isCorrect: boolean;
};

export type TeacherAnnualCompetitionAttemptReviewSection = {
  sectionNumber: number;
  sectionTitle: string | null;
  mode: string | null;
  status: string;
  timeLimitSeconds: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  questions: TeacherAnnualCompetitionAttemptReviewQuestion[];
};

export type TeacherAnnualCompetitionAttemptReviewResult = {
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  rank: number | null;
};

export type TeacherAnnualCompetitionAttemptReview = {
  attemptId: string;
  attemptStatus: string;
  attemptType?: string;
  competitionLevelCode?: string | null;
  studentId?: string;
  studentCode?: string | null;
  studentName?: string | null;
  released: boolean;
  result: TeacherAnnualCompetitionAttemptReviewResult | null;
  sections: TeacherAnnualCompetitionAttemptReviewSection[] | null;
};

export async function getTeacherAnnualCompetitionAttemptReview(attemptId: string): Promise<TeacherAnnualCompetitionAttemptReview> {
  const { data } = await api.get<TeacherAnnualCompetitionAttemptReview>(`/teacher/competition/annual/attempts/${attemptId}/review`);
  return data;
}

export type TeacherParentReportDelivery = {
  id: string;
  studentId?: string | null;
  studentName: string;
  studentCode: string;
  moduleCode: string;
  moduleLabel: string;
  levelCode: string;
  levelLabel: string;
  fileName?: string | null;
  assessmentTitle?: string | null;
  publishedToTeacherAt?: string | null;
};

export async function getTeacherParentReportDeliveries(
  studentCode?: string,
): Promise<{ logs: TeacherParentReportDelivery[] }> {
  const { data } = await api.get<{ logs: TeacherParentReportDelivery[] }>(
    "/teacher/results/parent-report-deliveries",
    { params: studentCode ? { studentCode } : undefined },
  );
  return data;
}

export async function downloadTeacherParentReportDelivery(deliveryId: string): Promise<Blob> {
  const { data } = await api.get(`/teacher/results/parent-report-deliveries/${deliveryId}/download`, {
    responseType: "blob",
  });
  return data;
}
