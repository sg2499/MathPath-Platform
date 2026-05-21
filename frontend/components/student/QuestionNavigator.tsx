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
    <div className="flex flex-wrap justify-center gap-2">
      {Array.from({ length: totalQuestions }, (_, idx) => idx + 1).map((number) => {
        const current = number === currentQuestionNumber;
        const answered = answeredQuestionNumbers.includes(number);
        return (
          <button
            key={number}
            onClick={() => onSelectQuestion(number)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black transition ${
              current
                ? "bg-slate-900 text-white shadow-lg"
                : answered
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {number}
          </button>
        );
      })}
    </div>
  );
}
