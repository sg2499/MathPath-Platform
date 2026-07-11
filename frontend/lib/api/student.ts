import { api } from "@/lib/api";
import type { Assignment, AttemptHistoryEntry } from "@/types/assignment";
import type { AttemptPayload } from "@/types/attempt";
import type { AttemptResult } from "@/types/result";

type AssignmentsResponse = { assignments: Assignment[] };

export async function getStudentAssignments(): Promise<Assignment[]> {
  const { data } = await api.get<AssignmentsResponse>("/student/assignments");
  return data.assignments;
}

export async function getDpsInstructions(dpsId: string) {
  const { data } = await api.get(`/student/dps/${dpsId}`);
  return data;
}

export async function startAttempt(payload: { assignmentId: string; dpsId: string; mode: string }): Promise<AttemptPayload> {
  const { data } = await api.post<AttemptPayload>("/student/attempts/start", payload);
  return data;
}

export async function resumeAttempt(attemptId: string): Promise<AttemptPayload | { attemptId: string; status: string; message?: string; resultAvailable?: boolean }> {
  const { data } = await api.get(`/student/attempts/${attemptId}`);
  return data;
}

export async function saveAnswer(attemptId: string, payload: { questionId: string; selectedOptionId: string }) {
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
  conceptPerformance: Array<{ concept: string; correct: number; total: number; percentage: number }>;
  conceptStrengths: Array<{ concept: string; correct: number; total: number; percentage: number }>;
  conceptWeaknesses: Array<{ concept: string; correct: number; total: number; percentage: number }>;
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
