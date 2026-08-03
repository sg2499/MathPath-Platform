export type McqOption = {
  optionId: string;
  label: "A" | "B" | "C" | "D";
  value: string;
};

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
  // DPS questions are typed free-text answers, not MCQ picks -- see
  // OPEN_ISSUES.md 2026-08-03e. The correct answer is never included here;
  // this is the in-progress attempt payload, not the result payload.
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
