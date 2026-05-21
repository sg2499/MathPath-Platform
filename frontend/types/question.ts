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
  options: McqOption[];
  savedOptionId?: string | null;
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
