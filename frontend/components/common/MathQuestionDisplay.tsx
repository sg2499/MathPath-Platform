import { VerticalQuestion } from "@/components/student/VerticalQuestion";

type DisplayMode =
  | "VERTICAL"
  | "VISUAL_STACK"
  | "EXPRESSION"
  | "EXPRESSION_WORKSHEET"
  | "ANSWER_POSITION"
  | "OPERATION_ROW"
  | "FINANCIAL_TABLE"
  | string
  | null
  | undefined;

type MathQuestionDisplayProps = {
  operands?: Array<number | string> | null;
  operators?: string[] | null;
  displayType?: DisplayMode;
  questionText?: string | null;
};

function NormaliseDisplayType(DisplayType: DisplayMode): string {
  return String(DisplayType || "VERTICAL").trim().toUpperCase();
}

function FormatValue(Value: number | string): string {
  if (typeof Value === "number") {
    if (Number.isInteger(Value)) return String(Value);
    return String(Number(Value.toFixed(8))).replace(/\.0+$/, "");
  }
  return String(Value);
}

function NormaliseOperator(Operator: string | undefined): string {
  const Value = String(Operator || "").trim();
  if (Value.toLowerCase() === "x") return "×";
  if (Value === "/") return "÷";
  return Value;
}

function BuildExpression(Operands: Array<number | string>, Operators: string[]): string {
  if (!Operands.length) return "?";

  const NormalisedOperators = Operators.map((Operator) => NormaliseOperator(Operator));

  if (NormalisedOperators[1] === "% of" && Operands.length >= 2) {
    return `${FormatValue(Operands[0])}% of ${FormatValue(Operands[1])}`;
  }

  return Operands.map((Operand, Index) => {
    const Value = FormatValue(Operand);
    if (Index === 0) return Value;

    const Operator = NormalisedOperators[Index] || "+";
    if (Operator === "+%") return `+ ${Value}%`;
    if (Operator === "-%") return `− ${Value}%`;
    if (Operator === "%") return `% ${Value}`;
    return `${Operator} ${Value}`;
  }).join(" ");
}

function HasExpressionOperators(Operators: string[]): boolean {
  return Operators.some((Operator) => {
    const Normalised = NormaliseOperator(Operator);
    return ["×", "÷", "+%", "-%", "% of"].includes(Normalised);
  });
}

function ShouldAutoUseExpression(Operands: Array<number | string>, Operators: string[]): boolean {
  if (!Operands.length) return false;
  if (!HasExpressionOperators(Operators)) return false;
  return true;
}

function WorkbookExpressionQuestion({
  operands,
  operators,
  questionText,
  mode,
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
  mode: "EXPRESSION_WORKSHEET" | "ANSWER_POSITION";
}) {
  const Expression = questionText?.trim() || BuildExpression(operands, operators);
  const IsAnswerPosition = mode === "ANSWER_POSITION";

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[18px] border border-slate-900/20 bg-white text-slate-950 shadow-sm dark:border-slate-600 dark:bg-slate-950/70 dark:text-white">
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] text-center sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="flex min-h-[76px] items-center justify-center bg-[#fbffa3] px-4 py-4 font-mono text-[22px] font-black leading-snug tracking-tight sm:text-[30px]">
          {Expression}
        </div>
        <div className="flex min-h-[76px] items-center justify-center border-l border-slate-900/20 bg-[#edc7ea] px-4 py-4 font-mono text-[24px] font-black text-blue-700 dark:border-slate-600 dark:text-cyan-300 sm:text-[32px]">
          ?
        </div>
      </div>
      {IsAnswerPosition ? (
        <div className="border-t border-slate-900/10 bg-white px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Find Position / Answer Placement
        </div>
      ) : null}
    </div>
  );
}

function WorkbookOperationRowQuestion({ operands, operators }: { operands: Array<number | string>; operators: string[] }) {
  const Left = FormatValue(operands[0] ?? "?");
  const Right = FormatValue(operands[1] ?? "?");
  const Operator = NormaliseOperator(operators[1]) || NormaliseOperator(operators[0]) || "×";

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[18px] border border-slate-900/20 bg-white text-slate-950 shadow-sm dark:border-slate-600 dark:bg-slate-950/70 dark:text-white">
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)_8rem] text-center sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)_10rem]">
        <div className="flex min-h-[76px] items-center justify-center bg-[#fbffa3] px-3 py-4 font-mono text-[24px] font-black sm:text-[34px]">
          {Left}
        </div>
        <div className="flex min-h-[76px] items-center justify-center border-x border-slate-900/20 bg-[#fbffa3] px-3 py-4 font-mono text-[24px] font-black dark:border-slate-600 sm:text-[34px]">
          {Operator}
        </div>
        <div className="flex min-h-[76px] items-center justify-center bg-[#fbffa3] px-3 py-4 font-mono text-[24px] font-black sm:text-[34px]">
          {Right}
        </div>
        <div className="flex min-h-[76px] items-center justify-center border-l border-slate-900/20 bg-[#edc7ea] px-3 py-4 font-mono text-[24px] font-black text-blue-700 dark:border-slate-600 dark:text-cyan-300 sm:text-[34px]">
          ?
        </div>
      </div>
    </div>
  );
}

function FinancialTableQuestion({ operands, operators, questionText }: { operands: Array<number | string>; operators: string[]; questionText?: string | null }) {
  const LabelA = operators[0] || "Value 1";
  const LabelB = operators[1] || "Value 2";

  return (
    <div className="mx-auto w-full max-w-xl rounded-[24px] bg-white px-5 py-6 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-7">
      {questionText ? <p className="mb-4 text-center text-base font-bold text-slate-700 dark:text-slate-200">{questionText}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 bg-slate-100 text-center text-sm font-black uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <div className="border-r border-slate-200 px-4 py-3 dark:border-slate-700">{LabelA}</div>
          <div className="px-4 py-3">{LabelB}</div>
        </div>
        <div className="grid grid-cols-2 text-center font-mono text-3xl font-black">
          <div className="border-r border-slate-200 px-4 py-5 dark:border-slate-700">{FormatValue(operands[0] ?? "?")}</div>
          <div className="px-4 py-5">{FormatValue(operands[1] ?? "?")}</div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
        Select the correct calculated result from the options.
      </div>
    </div>
  );
}

export function MathQuestionDisplay({ operands, operators, displayType, questionText }: MathQuestionDisplayProps) {
  const Operands = operands ?? [];
  const Operators = operators ?? [];
  const Mode = NormaliseDisplayType(displayType);

  if (Mode === "OPERATION_ROW") {
    return <WorkbookOperationRowQuestion operands={Operands} operators={Operators} />;
  }

  if (Mode === "EXPRESSION" || Mode === "EXPRESSION_WORKSHEET") {
    return <WorkbookExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} mode="EXPRESSION_WORKSHEET" />;
  }

  if (Mode === "ANSWER_POSITION") {
    return <WorkbookExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} mode="ANSWER_POSITION" />;
  }

  if (Mode === "FINANCIAL_TABLE") {
    return <FinancialTableQuestion operands={Operands} operators={Operators} questionText={questionText} />;
  }

  if (ShouldAutoUseExpression(Operands, Operators)) {
    if (Operands.length === 2 && ["×", "÷"].includes(NormaliseOperator(Operators[1]))) {
      return <WorkbookOperationRowQuestion operands={Operands} operators={Operators} />;
    }
    return <WorkbookExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} mode="EXPRESSION_WORKSHEET" />;
  }

  return <VerticalQuestion operands={Operands as number[]} operators={Operators} />;
}
