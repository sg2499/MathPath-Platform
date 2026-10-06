export function QuestionNavigator({
  totalQuestions,
  currentQuestionNumber,
  answeredQuestionNumbers,
  onSelectQuestion,
}: {
  totalQuestions: number;
  currentQuestionNumber: number;
  answeredQuestionNumbers: number[];
  onSelectQuestion: (questionNumber: number) => void;
}) {
  return (
    // Long papers (assessments run to 100 questions) use slightly smaller
    // buttons so the whole list still fits under the question (see .mp-qnav-dense).
    <div className={`mp-qnav-list flex flex-wrap justify-center gap-2 ${totalQuestions > 60 ? "mp-qnav-dense" : ""}`}>
      {Array.from({ length: totalQuestions }, (_, idx) => idx + 1).map((number) => {
        const current = number === currentQuestionNumber;
        const answered = answeredQuestionNumbers.includes(number);
        return (
          <button
            key={number}
            type="button"
            onClick={() => onSelectQuestion(number)}
            aria-current={current ? "true" : undefined}
            aria-label={`Question ${number}${current ? ", current" : answered ? ", answered" : ", not answered"}`}
            className={`mp-qnav flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black transition ${
              current
                ? "mp-qnav-current bg-slate-900 text-white shadow-lg"
                : answered
                  ? "mp-qnav-answered bg-emerald-100 text-emerald-800"
                  : "mp-qnav-open bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {number}
          </button>
        );
      })}
    </div>
  );
}
