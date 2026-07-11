export type AssignmentStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "AUTO_SUBMITTED"
  | "COMPLETED"
  | "REATTEMPT_AVAILABLE";

export type AssignmentMode = "PRACTICE" | "ASSESSMENT" | "COMPETITION";

// A single completed attempt. Used by activity feeds (e.g. the student
// dashboard grind heatmap) that need every attempt on a given day, not
// just the latest one for an assignment.
export type AttemptHistoryEntry = {
  attemptId: string;
  attemptNumber?: number | null;
  score?: number | null;
  maxScore?: number | null;
  accuracyPercentage?: number | null;
  timeTakenSeconds?: number | null;
  expectedDurationSeconds?: number | null;
  totalQuestions?: number | null;
  completedAt: string;
};

export type Assignment = {
  assignmentId: string;
  mode: AssignmentMode;
  title: string;

  moduleCode: string;
  moduleName?: string;
  levelCode: string;

  lessonNumber: number;
  lessonTitle: string;

  dpsId: string;
  dpsNumber: number;
  dpsTitle: string;

  questionCount: number;
  durationSeconds: number;
  marksPerQuestion: number;

  status: AssignmentStatus;
  attemptId: string | null;
  reattemptAvailable?: boolean;
  reattemptPermissionId?: string | null;

  assessmentTitle?: string | null;
  assignmentTitle?: string | null;
  score?: number | null;
  totalMarks?: number | null;
  maxScore?: number | null;
  accuracy?: number | null;
  accuracyPercentage?: number | null;
  percentage?: number | null;
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

  availableFrom?: string | null;
  availableUntil?: string | null;

  attemptHistory?: AttemptHistoryEntry[];
};
