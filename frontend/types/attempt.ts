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
};
