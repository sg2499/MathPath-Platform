export type AttemptResult = {
  attemptId: string;
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
  };
  questionReview?: Array<{
    questionNumber: number;
    questionId: string;
    displayType: string;
    operands: number[];
    operators: string[];
    selectedOption?: { optionId?: string; label: string; value: string } | null;
    correctOption?: { optionId?: string; label: string; value: string } | null;
    isCorrect?: boolean;
  }>;
  message?: string;
};
