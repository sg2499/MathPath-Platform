import type { StudentQuestion } from "./question";

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
