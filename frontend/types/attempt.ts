import type { StudentQuestion, DpsStudentQuestion } from "./question";

// Still MCQ -- used by the competition mock-exam attempt page. Left
// completely unchanged (still StudentQuestion[]) so that flow is unaffected
// by the DPS answer-box change. See DpsAttemptPayload below for DPS.
export type AttemptPayload = {
  attemptId: string;
  questionSetId?: string;
  status: string;
  mode: "PRACTICE" | "ASSESSMENT" | "COMPETITION";
  startedAt?: string;
  expiresAt?: string;
  serverTime: string;
  remainingSeconds: number;
  totalQuestions: number;
  answeredCount?: number;
  questions: StudentQuestion[];
  // Real sheet/module context for the attempt screen's header -- same shape
  // for every module, never a hardcoded placeholder.
  dpsTitle?: string | null;
  dpsNumber?: number | null;
  lessonNumber?: number | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  levelCode?: string | null;
};

// DPS questions are typed free-text answers, not MCQ picks -- see
// OPEN_ISSUES.md 2026-08-03e. Same shape as AttemptPayload except
// questions: DpsStudentQuestion[] instead of StudentQuestion[].
export type DpsAttemptPayload = Omit<AttemptPayload, "questions"> & {
  questions: DpsStudentQuestion[];
};
