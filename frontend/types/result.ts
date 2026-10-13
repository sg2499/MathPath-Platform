export type RetryWorkflowState = "CLEARED" | "RETRY_PREPARED" | "RETRY_REQUIRED" | "MANUAL_REVIEW_REQUIRED" | "APPROVED_RETRY_PREPARED";

// 2026-10-13: the one button on a DPS result page, decided on the server
// from the real next sheet and its attempt.
export type ReattemptAction = {
  kind: "START" | "RESUME" | "USED" | "AWAITING_APPROVAL";
  label: string;
  href: string | null;
  disabled: boolean;
  nextAttemptNumber: number;
  linkLabel?: string | null;
  hint?: string | null;
};

export type RetryWorkflow = {
  state: RetryWorkflowState;
  attemptNumber: number;
  nextAssignmentId?: string | null;
  requiresManualIntervention: boolean;
  title: string;
  message: string;
  guidance: string;
  showTeacherGuidance?: boolean | null;
  previousAccuracyPercentage?: number | null;
  previousScore?: number | null;
  accuracyDelta?: number | null;
  action?: ReattemptAction | null;
};

export type AttemptResult = {
  attemptId: string;
  attemptGroupId?: string | null;
  attemptNumber?: number | null;
  attemptLabel?: string | null;
  attemptSource?: string | null;
  requiresManualIntervention?: boolean | null;
  benchmarkState?: string | null;
  status: string;
  student?: {
    studentId?: string | null;
    name?: string;
    studentName?: string;
    studentCode?: string;
    className?: string | null;
    section?: string | null;
  };
  test?: {
    mode: string;
    moduleCode: string;
    levelCode: string;
    lessonNumber: number;
    dpsNumber: number;
    title: string;
  };
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
    benchmarkPercentage?: number | null;
    benchmarkStatus?: string | null;
    requiresAttention?: boolean | null;
    benchmarkMessage?: string | null;
  };
  questionReview?: Array<{
    questionNumber: number;
    questionId: string;
    displayType: string;
    operands: number[];
    operators: string[];
    // DPS questions are typed free-text answers now, not MCQ picks -- see
    // OPEN_ISSUES.md 2026-08-03e.
    studentAnswer?: string | null;
    correctAnswer?: string | number | null;
    isCorrect?: boolean;
  }>;
  retryWorkflow?: RetryWorkflow | null;
  message?: string;
};
