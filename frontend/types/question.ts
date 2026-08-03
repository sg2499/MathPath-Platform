export type McqOption = {
  optionId: string;
  label: "A" | "B" | "C" | "D";
  value: string;
};

// Still MCQ -- used by the competition mock-exam attempt page
// (app/student/competition/mock-attempt/[attemptId]/page.tsx) and the
// assessment attempt page, both of which reuse this exact type via their
// own AttemptPayload. Left completely unchanged so those flows are
// unaffected by the DPS answer-box change -- see DpsStudentQuestion below
// for the DPS-only replacement (caught by CI: this type is more widely
// shared than it first looked, so DPS gets its own type instead of
// overloading this one).
export type StudentQuestion = {
  questionId: string;
  questionNumber: number;
  displayType: "VERTICAL" | string;
  operands: number[];
  operators: string[];
  metadata?: Record<string, unknown>;
  questionText?: string | null;
  question_text?: string | null;
  display_type?: string | null;
  options: McqOption[];
  savedOptionId?: string | null;
};

// DPS questions are typed free-text answers, not MCQ picks -- see
// OPEN_ISSUES.md 2026-08-03e. Deliberately a separate type from
// StudentQuestion above (not a shared/overloaded one) so this can never leak
// into the mock-exam/assessment attempt flows, which remain MCQ. The
// correct answer is never included here; this is the in-progress attempt
// payload, not the result payload.
export type DpsStudentQuestion = {
  questionId: string;
  questionNumber: number;
  displayType: "VERTICAL" | string;
  operands: number[];
  operators: string[];
  metadata?: Record<string, unknown>;
  questionText?: string | null;
  question_text?: string | null;
  display_type?: string | null;
  savedAnswerText?: string | null;
};

export type AdminPreviewOption = {
  optionId?: string;
  label: "A" | "B" | "C" | "D";
  value: string;
  isCorrect?: boolean;
  is_correct?: boolean;
  displayOrder?: number;
  display_order?: number;
};

export type AdminPreviewQuestion = {
  questionId?: string;
  questionNumber?: number;
  question_number?: number;
  displayType?: "VERTICAL" | string;
  display_type?: "VERTICAL" | string;
  operands: number[];
  operators: string[];
  correctAnswer?: string | number;
  correct_answer?: string | number;
  options: AdminPreviewOption[];
  seed?: string;
  metadata?: Record<string, unknown>;
};
