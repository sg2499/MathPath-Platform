import { api } from "@/lib/api";
import type { Assignment, AttemptHistoryEntry } from "@/types/assignment";
import type { AttemptPayload, DpsAttemptPayload } from "@/types/attempt";
import type { AttemptResult } from "@/types/result";
import type { McqOption } from "@/types/question";

type AssignmentsResponse = { assignments: Assignment[] };

export async function getStudentAssignments(): Promise<Assignment[]> {
  const { data } = await api.get<AssignmentsResponse>("/student/assignments");
  return data.assignments;
}

export async function getDpsInstructions(dpsId: string) {
  const { data } = await api.get(`/student/dps/${dpsId}`);
  return data;
}

export async function startAttempt(payload: { assignmentId: string; dpsId: string; mode: string }): Promise<DpsAttemptPayload> {
  const { data } = await api.post<DpsAttemptPayload>("/student/attempts/start", payload);
  return data;
}

export async function resumeAttempt(attemptId: string): Promise<DpsAttemptPayload | { attemptId: string; status: string; message?: string; resultAvailable?: boolean }> {
  const { data } = await api.get(`/student/attempts/${attemptId}`);
  return data;
}

export async function saveAnswer(attemptId: string, payload: { questionId: string; answerText: string }) {
  const { data } = await api.post(`/student/attempts/${attemptId}/answers`, payload);
  return data;
}

export async function submitAttempt(attemptId: string) {
  const { data } = await api.post(`/student/attempts/${attemptId}/submit`, { confirmSubmit: true });
  return data;
}

export async function autoSubmitAttempt(attemptId: string) {
  const { data } = await api.post(`/student/attempts/${attemptId}/auto-submit`, { reason: "TIME_UP" });
  return data;
}

export async function getAttemptResult(attemptId: string): Promise<AttemptResult> {
  const { data } = await api.get<AttemptResult>(`/student/attempts/${attemptId}/result`);
  return data;
}


type AssessmentsResponse = { assessments: Assignment[] };

export async function getStudentAssessments(): Promise<Assignment[]> {
  const { data } = await api.get<AssessmentsResponse>("/student/assessments");
  return data.assessments;
}


export type StudentResultAttempt = {
  attemptId: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  assignmentType: string;
  recordKind?: string | null;
  progressionRole?: string | null;
  progressionStatus?: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  accuracyPercentage: number;
  averageAccuracy?: number | null;
  correct: number;
  wrong: number;
  unanswered: number;
  timeTakenSeconds: number | null;
  expectedDurationSeconds?: number | null;
  benchmarkPercentage?: number | null;
  benchmarkStatus?: string | null;
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  dpsId: string | null;
  dpsNumber: number | null;
  dpsTitle: string | null;
  requiredDpsCount?: number | null;
  totalDpsCount?: number | null;
  clearedDpsCount?: number | null;
  promotedFromLevelId?: string | null;
  promotedFromLevelCode?: string | null;
  promotedToLevelId?: string | null;
  promotedToLevelCode?: string | null;
  promotedAt?: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  attemptDate: string | null;
  completedDate: string | null;
};

export async function getStudentResults(): Promise<StudentResultAttempt[]> {
  const { data } = await api.get<{ results: StudentResultAttempt[] }>("/student/results");
  return data.results;
}

// Backs the Grind Heatmap's month-browse view (2026-09-03) -- a normalized
// activity event, one per completed DPS/Practice, Assessment, or Competition
// Mock attempt whose completion falls in the requested [start, end) range.
// Same shape the dashboard already builds client-side for the current week
// from getStudentResults/getStudentAssessments/getStudentCompetitionMockAssignments,
// just server-filtered to one range instead of the student's whole history.
export type StudentActivityEvent = {
  completedAt: string;
  timeTakenSeconds: number;
  expectedDurationSeconds: number | null;
  accuracyPercentage: number;
  totalQuestions: number;
};

// start/end must be ISO 8601 timestamps marking a half-open [start, end)
// window -- pass the student's own local-calendar-month boundaries (see
// toLocalDateKey in the dashboard page), never bare year/month numbers, so
// the backend never has to guess the student's timezone.
export async function getStudentActivityRange(start: string, end: string): Promise<StudentActivityEvent[]> {
  const { data } = await api.get<{ events: StudentActivityEvent[] }>("/student/activity/range", {
    params: { start, end },
  });
  return data.events;
}


export type StudentAssessmentEligibility = {
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

export async function getStudentAssessmentEligibility(): Promise<StudentAssessmentEligibility> {
  const { data } = await api.get<StudentAssessmentEligibility>("/student/assessment-eligibility");
  return data;
}


export type StudentAssessmentDetail = {
  assignmentId: string;
  assessmentVersionId: string;
  blueprintId: string;
  title: string;
  moduleCode?: string | null;
  moduleName?: string | null;
  levelCode?: string | null;
  levelName?: string | null;
  status: string;
  attemptId?: string | null;
  resultAttemptId?: string | null;
  action: string;
  details: {
    questions: number;
    totalMarks: number;
    durationSeconds: number;
    durationMinutes: number;
    marksPerQuestion: number;
    benchmarkPercentage: number;
    answerType: string;
    optionsPerQuestion: number;
    navigationAllowed: boolean;
    autoSubmit: boolean;
  };
  instructions: string[];
};

export type AssessmentOption = {
  optionId: string;
  label: string;
  value: string;
};

export type AssessmentQuestion = {
  questionId: string;
  questionNumber: number;
  displayType?: string;
  questionText?: string | null;
  operands: number[];
  operators: string[];
  savedOptionId?: string | null;
  options: AssessmentOption[];
};

export type AssessmentAttemptPayload = {
  attemptId: string;
  assignmentId: string;
  assessmentVersionId: string;
  title: string;
  mode: string;
  status: string;
  moduleCode?: string | null;
  levelCode?: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
  totalQuestions: number;
  totalMarks: number;
  benchmarkPercentage: number;
  questions: AssessmentQuestion[];
  resultAvailable?: boolean;
};

export type AssessmentResultPayload = {
  attemptId: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentType: string;
  mode: string;
  status: string;
  score: number;
  maxScore: number;
  accuracyPercentage: number;
  percentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  timeTakenSeconds: number | null;
  benchmarkPercentage: number;
  benchmarkStatus: string;
  requiresAttention: boolean;
  benchmarkMessage: string;
  performanceBand: string;
  progressionStatus?: string | null;
  progressionStatusLabel?: string | null;
  isReadyForNextLevel?: boolean | null;
  isPromoted?: boolean | null;
  progressionMessage?: string | null;
  promotedAt?: string | null;
  toLevelCode?: string | null;
  toLevelName?: string | null;
  hasStartedPromotedLevel?: boolean | null;
  promotedLevelStartedAt?: string | null;
  promotedLevelFirstDpsId?: string | null;
  promotedLevelFirstDpsTitle?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  levelCode?: string | null;
  levelName?: string | null;
  completedDate?: string | null;
  submittedAt?: string | null;
  attemptDate?: string | null;
  questionReview?: Array<{
    questionId: string;
    questionNumber: number;
    questionText?: string | null;
    operands: number[];
    operators: string[];
    isCorrect: boolean;
    selectedOption?: { id: string; label: string; value: string } | null;
    correctOption?: { id: string; label: string; value: string } | null;
  }>;
};

export async function getStudentAssessmentDetail(assignmentId: string): Promise<StudentAssessmentDetail> {
  const { data } = await api.get<StudentAssessmentDetail>(`/student/assessment-assignments/${assignmentId}`);
  return data;
}

export async function startAssessmentAttempt(assignmentId: string): Promise<AssessmentAttemptPayload> {
  const { data } = await api.post<AssessmentAttemptPayload>(`/student/assessment-assignments/${assignmentId}/start`, { assignmentId });
  return data;
}

export async function resumeAssessmentAttempt(attemptId: string): Promise<AssessmentAttemptPayload> {
  const { data } = await api.get<AssessmentAttemptPayload>(`/student/assessment-attempts/${attemptId}`);
  return data;
}

export async function saveAssessmentAnswer(attemptId: string, payload: { questionId: string; selectedOptionId: string }) {
  const { data } = await api.post(`/student/assessment-attempts/${attemptId}/answers`, payload);
  return data;
}

export async function submitAssessmentAttempt(attemptId: string): Promise<AssessmentResultPayload> {
  const { data } = await api.post<AssessmentResultPayload>(`/student/assessment-attempts/${attemptId}/submit`, { confirmSubmit: true });
  return data;
}

export async function autoSubmitAssessmentAttempt(attemptId: string): Promise<AssessmentResultPayload> {
  const { data } = await api.post<AssessmentResultPayload>(`/student/assessment-attempts/${attemptId}/auto-submit`, { reason: "TIME_UP" });
  return data;
}

export async function getAssessmentAttemptResult(attemptId: string): Promise<AssessmentResultPayload> {
  const { data } = await api.get<AssessmentResultPayload>(`/student/assessment-attempts/${attemptId}/result`);
  return data;
}

export type StudentCompetitionMockAssignment = {
  assignmentId: string;
  mockExamId: string;
  status: string;
  assignmentStatus?: string;
  currentAttemptNumber?: number;
  maxAttempts?: number;
  assignedAt?: string | null;
  dueAt?: string | null;
  instructions?: string | null;
  latestAttemptId?: string | null;
  latestAttemptStatus?: string | null;
  latestResult?: {
    score: number;
    maxScore: number;
    percentage: number;
    accuracyPercentage: number;
    timeTakenSeconds?: number | null;
    timeUtilizationPercentage?: number | null;
    performanceBand?: string | null;
    completedAt?: string | null;
  } | null;
  attemptHistory?: AttemptHistoryEntry[];
  mockExam: {
    mockExamId: string;
    title: string;
    mockCode?: string | null;
    status?: string;
    totalQuestions: number;
    totalMarks: number;
    marksPerQuestion: number;
    durationSeconds: number;
    moduleId?: string | null;
    moduleCode?: string | null;
    moduleName?: string | null;
    levelId?: string | null;
    levelCode?: string | null;
    levelName?: string | null;
  };
};

export async function getStudentCompetitionMockAssignments(): Promise<StudentCompetitionMockAssignment[]> {
  const { data } = await api.get<{ assignments: StudentCompetitionMockAssignment[] }>("/student/competition/mock-assignments");
  return data.assignments;
}

export async function getStudentCompetitionMockInstructions(assignmentId: string): Promise<any> {
  const { data } = await api.get(`/student/competition/mock-assignments/${assignmentId}/instructions`);
  return data;
}

export async function startCompetitionMockAttempt(payload: { assignmentId: string }): Promise<AttemptPayload> {
  const { data } = await api.post<AttemptPayload>("/student/competition/mock-attempts/start", payload);
  return data;
}

export async function resumeCompetitionMockAttempt(attemptId: string): Promise<AttemptPayload | { attemptId: string; status: string; message?: string; resultAvailable?: boolean }> {
  const { data } = await api.get(`/student/competition/mock-attempts/${attemptId}`);
  return data;
}

export async function saveCompetitionMockAnswer(attemptId: string, payload: { questionId: string; selectedOptionId: string }) {
  const { data } = await api.post(`/student/competition/mock-attempts/${attemptId}/answers`, payload);
  return data;
}

export async function submitCompetitionMockAttempt(attemptId: string) {
  const { data } = await api.post(`/student/competition/mock-attempts/${attemptId}/submit`, { confirmSubmit: true });
  return data;
}

export async function autoSubmitCompetitionMockAttempt(attemptId: string) {
  const { data } = await api.post(`/student/competition/mock-attempts/${attemptId}/auto-submit`, { reason: "TIME_UP" });
  return data;
}


export type StudentCompetitionMockResult = {
  attemptId: string;
  studentId?: string;
  assignmentId: string;
  mockExamId: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  attempted: number;
  totalQuestions: number;
  timeTakenSeconds?: number | null;
  timeUtilizationPercentage?: number | null;
  performanceBand?: string | null;
  completedAt?: string | null;
  submittedAt?: string | null;
  conceptPerformance: Array<{ concept: string; sectionTitle?: string; sectionNumber?: number; correct: number; total: number; percentage: number }>;
  conceptStrengths: Array<{ concept: string; sectionTitle?: string; sectionNumber?: number; correct: number; total: number; percentage: number }>;
  conceptWeaknesses: Array<{ concept: string; sectionTitle?: string; sectionNumber?: number; correct: number; total: number; percentage: number }>;
  recommendation?: { message?: string } | null;
  questionReview?: Array<{
    questionId: string;
    questionNumber: number;
    sectionNumber?: number | null;
    sectionTitle?: string | null;
    concept?: string | null;
    displayType?: string | null;
    questionText?: string | null;
    operands: unknown[];
    operators: string[];
    metadata?: Record<string, unknown>;
    options: Array<{ optionId: string; label: string; value: string; isCorrect?: boolean }>;
    selectedOption?: { optionId: string; label: string; value: string } | null;
    correctOption?: { optionId: string; label: string; value: string } | null;
    isCorrect: boolean;
    isUnanswered: boolean;
    marksAwarded?: number | null;
    marks?: number | null;
  }>;
  mockExam: {
    title: string;
    mockCode?: string | null;
    totalQuestions: number;
    totalMarks: number;
    marksPerQuestion: number;
    durationSeconds: number;
    moduleCode?: string | null;
    moduleName?: string | null;
    levelCode?: string | null;
    levelName?: string | null;
  };
};

export async function getCompetitionMockResult(attemptId: string): Promise<StudentCompetitionMockResult> {
  const { data } = await api.get<StudentCompetitionMockResult>(`/student/competition/mock-attempts/${attemptId}/result`);
  return data;
}

export type StudentCompetitionProgressInsights = {
  overallScore: number;
  overallAccuracy: number;
  overallTimeUtilization: number;
  totalMocksAttempted: number;
  averageTimePerQuestion: number;
  history: Array<{
    mockExamId: string;
    completedAt: string | null;
    score: number;
    accuracyPercentage: number;
    timeUtilizationPercentage: number | null;
    timeTakenSeconds: number | null;
  }>;
  moduleInsights: Array<{
    moduleId: string;
    moduleCode: string;
    moduleName: string;
    levelId: string;
    levelCode: string;
    levelName: string;
    strongConcepts: Array<{
      concept: string;
      accuracy: number;
      totalQuestions: number;
      timePerQuestion: number;
    }>;
    weakConcepts: Array<{
      concept: string;
      accuracy: number;
      totalQuestions: number;
      timePerQuestion: number;
    }>;
  }>;
};

export async function getCompetitionProgressInsights(): Promise<StudentCompetitionProgressInsights> {
  const { data } = await api.get<StudentCompetitionProgressInsights>("/student/competition/progress/insights");
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition (Package 4/5) -- the real, single scheduled competition
// event, distinct from the always-available Competition Mock practice
// endpoints above. See backend/app/services/annual_competition_attempt_service.py
// for the full design writeup (heartbeat/pause mechanic, single-session
// guard, section-locked answer capture). Field names mirror that service's
// dict payloads verbatim -- no pydantic alias generator sits in front of
// these routes, same as the Competition Mock ones above.
// ---------------------------------------------------------------------------

export type AnnualCompetitionSlotInfo = {
  slotId: string;
  mode: string;
  slotLabel: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
};

export type AnnualCompetitionAssignmentForStudent = {
  assignmentId: string;
  eventId: string;
  eventName: string;
  eventStatus: string;
  competitionDate: string | null;
  assignedLevelCode: string;
  slot: AnnualCompetitionSlotInfo | null;
  latestAttemptId: string | null;
  // NOT_STARTED | IN_PROGRESS | SUBMITTED | FINALIZED
  latestAttemptStatus: string;
};

export async function getMyAnnualCompetitionAssignments(): Promise<AnnualCompetitionAssignmentForStudent[]> {
  const { data } = await api.get<{ assignments: AnnualCompetitionAssignmentForStudent[] }>("/student/annual-competition/assignments");
  return data.assignments;
}

export type AnnualCompetitionInstructionsSection = {
  sectionNumber: number;
  sectionTitle: string;
  mode: string | null;
  timeLimitSeconds: number;
  questionCount: number;
  conceptFamily: string;
};

export type AnnualCompetitionInstructions = {
  eventId: string;
  eventName: string;
  competitionDate: string | null;
  assignedLevelCode: string;
  slot: AnnualCompetitionSlotInfo | null;
  totalDurationSeconds: number;
  sections: AnnualCompetitionInstructionsSection[];
  instructions: string[];
};

export async function getAnnualCompetitionInstructions(eventId: string): Promise<AnnualCompetitionInstructions> {
  const { data } = await api.get<AnnualCompetitionInstructions>(`/student/annual-competition/events/${eventId}/instructions`);
  return data;
}

export type AnnualCompetitionSectionState = {
  sectionNumber: number;
  // PENDING | ACTIVE | COMPLETED | AUTO_SUBMITTED
  status: string;
  timeLimitSeconds: number;
  remainingSeconds: number | null;
  startedAt: string | null;
  submittedAt: string | null;
};

export type AnnualCompetitionQuestion = {
  questionId: string;
  questionNumber: number;
  displayType: string;
  questionText?: string | null;
  operands: number[];
  operators: string[];
  options: McqOption[];
  savedOptionId: string | null;
};

export type AnnualCompetitionAttempt = {
  attemptId: string;
  eventId: string;
  assignmentId: string;
  levelPaperId: string;
  // IN_PROGRESS | SUBMITTED | FINALIZED
  status: string;
  currentSectionNumber: number;
  startedAt: string | null;
  submittedAt: string | null;
  sections: AnnualCompetitionSectionState[];
  // Only present on Start/Resume -- see the service's own docstring on why
  // reads never reissue it.
  sessionToken?: string;
  // Only present while status is IN_PROGRESS -- the currently-active
  // section's questions/options/saved-answers.
  activeSectionQuestions?: AnnualCompetitionQuestion[];
};

export async function startAnnualCompetitionAttempt(eventId: string): Promise<AnnualCompetitionAttempt> {
  const { data } = await api.post<AnnualCompetitionAttempt>("/student/annual-competition/attempts/start", { eventId });
  return data;
}

export async function getAnnualCompetitionAttempt(attemptId: string): Promise<AnnualCompetitionAttempt> {
  const { data } = await api.get<AnnualCompetitionAttempt>(`/student/annual-competition/attempts/${attemptId}`);
  return data;
}

export async function recordAnnualCompetitionHeartbeat(
  attemptId: string,
  payload: { sessionToken: string; sectionNumber: number }
): Promise<AnnualCompetitionAttempt> {
  const { data } = await api.post<AnnualCompetitionAttempt>(`/student/annual-competition/attempts/${attemptId}/heartbeat`, payload);
  return data;
}

export async function submitAnnualCompetitionSection(
  attemptId: string,
  payload: { sessionToken: string; sectionNumber: number }
): Promise<AnnualCompetitionAttempt> {
  const { data } = await api.post<AnnualCompetitionAttempt>(`/student/annual-competition/attempts/${attemptId}/sections/submit`, payload);
  return data;
}

export async function saveAnnualCompetitionAnswer(
  attemptId: string,
  payload: { sessionToken: string; sectionNumber: number; questionId: string; selectedOptionId: string }
): Promise<AnnualCompetitionAttempt> {
  const { data } = await api.post<AnnualCompetitionAttempt>(`/student/annual-competition/attempts/${attemptId}/answers`, payload);
  return data;
}

// Package 6 (Scoring + Results). "released: false" is the expected common
// state (REQUIREMENTS.md item 5's full lock-down) -- this endpoint always
// returns 200 with result: null rather than an error while a result is
// uncomputed/unreleased.
export type AnnualCompetitionResultSectionTime = {
  sectionNumber: number;
  timeLimitSeconds: number;
  timeTakenSeconds: number;
};

export type AnnualCompetitionResult = {
  resultId: string;
  competitionLevelCode: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  perSectionTime: AnnualCompetitionResultSectionTime[];
  rank: number | null;
  releasedAt: string | null;
};

export type AnnualCompetitionResultPayload = {
  attemptId: string;
  attemptStatus: string;
  released: boolean;
  result: AnnualCompetitionResult | null;
};

export async function getAnnualCompetitionResult(attemptId: string): Promise<AnnualCompetitionResultPayload> {
  const { data } = await api.get<AnnualCompetitionResultPayload>(`/student/annual-competition/attempts/${attemptId}/result`);
  return data;
}

// Package 8 (certificate half). Only ever called once the result above
// returns released:true -- the backend re-checks this independently on
// every call regardless, so a stale client-side flag can never produce a
// certificate download early.
export async function downloadAnnualCompetitionCertificate(attemptId: string): Promise<Blob> {
  const { data } = await api.get(`/student/annual-competition/attempts/${attemptId}/certificate`, {
    responseType: "blob",
  });
  return data;
}
