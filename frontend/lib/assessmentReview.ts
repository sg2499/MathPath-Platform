// What to show as "Your Answer" and "Correct Answer" on an assessment review
// row (2026-10-11). Assessments are typed since then: the row carries the
// answer text (selectedAnswer / correctAnswer). A multiple-choice attempt made
// before that still shows its option letter and value.
type ReviewRow = {
  answerMode?: "OPTION" | "TYPED" | string | null;
  selectedAnswer?: string | null;
  correctAnswer?: string | null;
  selectedOption?: { label: string; value: string } | null;
  correctOption?: { label: string; value: string } | null;
};

export function ReviewStudentAnswer(Row: ReviewRow): string | null {
  if (Row.selectedOption && Row.answerMode !== "TYPED") return `${Row.selectedOption.label}. ${Row.selectedOption.value}`;
  const Text = String(Row.selectedAnswer ?? "").trim();
  return Text || null;
}

export function ReviewCorrectAnswer(Row: ReviewRow): string | null {
  if (Row.answerMode === "OPTION" && Row.correctOption) return `${Row.correctOption.label}. ${Row.correctOption.value}`;
  const Text = String(Row.correctAnswer ?? "").trim();
  if (Text) return Text;
  return Row.correctOption ? `${Row.correctOption.label}. ${Row.correctOption.value}` : null;
}
