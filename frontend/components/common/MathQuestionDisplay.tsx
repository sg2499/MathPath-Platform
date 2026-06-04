import { VerticalQuestion } from "@/components/student/VerticalQuestion";

type DisplayMode =
  | "VERTICAL"
  | "VISUAL_STACK"
  | "EXPRESSION"
  | "EXPRESSION_WORKSHEET"
  | "ANSWER_POSITION"
  | "FINANCIAL_TABLE"
  | "COMPACT_EXPRESSION"
  | "SKILL_STACKER_TABLE"
  | "CONCEPT_DRILL_TABLE"
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
  const RawValue = String(Value).trim();

  if (!RawValue) return RawValue;

  const NumericValue = typeof Value === "number" ? Value : Number(RawValue);
  if (!Number.isFinite(NumericValue)) return RawValue;

  if (Number.isInteger(NumericValue)) return String(NumericValue);

  const PlainValue = NumericValue.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

  return PlainValue.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function BuildExpression(Operands: Array<number | string>, Operators: string[]): string {
  if (!Operands.length) return "?";

  const NormalisedOperators = Operators.map((Operator) => String(Operator || "").trim());

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

function GetExpressionTypographyClass(Expression: string): string {
  const Length = Expression.length;

  if (Length >= 72) {
    return "text-[17px] sm:text-[19px] lg:text-[21px]";
  }

  if (Length >= 58) {
    return "text-[18px] sm:text-[21px] lg:text-[23px]";
  }

  if (Length >= 44) {
    return "text-[20px] sm:text-[23px] lg:text-[25px]";
  }

  return "text-[24px] sm:text-[30px]";
}

function ExpressionQuestion({
  operands,
  operators,
  questionText,
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
  mode: "EXPRESSION_WORKSHEET" | "ANSWER_POSITION";
}) {
  const RawExpression = questionText?.trim() || BuildExpression(operands, operators);
  const Expression = RawExpression.replace(/\s*=\s*\?\s*$/, "");
  const TypographyClass = GetExpressionTypographyClass(Expression);

  return (
    <div className="mx-auto flex w-full max-w-full justify-center px-2 sm:px-4">
      <div className="w-full max-w-[56rem] rounded-[20px] bg-white px-6 py-4 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8 lg:px-10">
        <div className={`${TypographyClass} mx-auto max-w-full whitespace-normal break-normal text-center font-mono font-black leading-snug tracking-tight`}>
          <span>{Expression}</span>
          <span className="ml-2 inline-block text-blue-700 dark:text-cyan-300">= ?</span>
        </div>
      </div>
    </div>
  );
}


function CompactExpressionQuestion({
  operands,
  operators,
  questionText,
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
}) {
  const RawExpression = questionText?.trim() || BuildExpression(operands, operators);
  const Expression = RawExpression.replace(/\s*=\s*\?\s*$/, "");
  const TypographyClass = GetExpressionTypographyClass(Expression);

  return (
    <div className="mx-auto flex w-full max-w-full justify-center px-2 sm:px-4">
      <div className="w-full max-w-[46rem] rounded-[18px] bg-white px-6 py-3.5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8">
        <div className={`${TypographyClass} mx-auto max-w-full whitespace-normal break-normal text-center font-mono font-black leading-snug tracking-tight`}>
          <span>{Expression}</span>
          <span className="ml-2 inline-block text-blue-700 dark:text-cyan-300">= ?</span>
        </div>
      </div>
    </div>
  );
}

function FinancialTableQuestion({ operands, operators, questionText }: { operands: Array<number | string>; operators: string[]; questionText?: string | null }) {
  const Labels = operators.length ? operators : operands.map((_, Index) => `Value ${Index + 1}`);
  const ColumnCount = Math.max(1, Math.min(Math.max(Labels.length, operands.length), 4));
  const GridTemplateColumns = { gridTemplateColumns: `repeat(${ColumnCount}, minmax(0, 1fr))` };

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[24px] bg-white px-5 py-6 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-7">
      {questionText ? <p className="mb-4 text-center text-base font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{questionText}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="grid bg-slate-100 text-center text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs" style={GridTemplateColumns}>
          {Array.from({ length: ColumnCount }).map((_, Index) => (
            <div key={`financial-label-${Index}`} className="border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-slate-700">
              {Labels[Index] || `Value ${Index + 1}`}
            </div>
          ))}
        </div>
        <div className="grid text-center font-mono text-2xl font-black sm:text-3xl" style={GridTemplateColumns}>
          {Array.from({ length: ColumnCount }).map((_, Index) => (
            <div key={`financial-value-${Index}`} className="border-r border-slate-200 px-3 py-5 last:border-r-0 dark:border-slate-700">
              {FormatValue(operands[Index] ?? "?")}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
        Select the correct calculated result from the options.
      </div>
    </div>
  );
}

function CompactTwoColumnQuestion({
  operands,
  operators,
  questionText,
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
}) {
  const Labels = operators.length ? operators : ["Value 1", "Value 2"];

  return (
    <div className="mx-auto w-full max-w-md rounded-[22px] bg-white px-5 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      {questionText ? <p className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">{questionText}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 bg-slate-100 text-center text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs">
          <div className="border-r border-slate-200 px-4 py-3 dark:border-slate-700">{Labels[0] || "Value 1"}</div>
          <div className="px-4 py-3">{Labels[1] || "Value 2"}</div>
        </div>
        <div className="grid grid-cols-2 text-center font-mono text-2xl font-black sm:text-3xl">
          <div className="border-r border-slate-200 px-4 py-5 dark:border-slate-700">{FormatValue(operands[0] ?? "?")}</div>
          <div className="px-4 py-5">{FormatValue(operands[1] ?? "?")}</div>
        </div>
      </div>
    </div>
  );
}

export function MathQuestionDisplay({ operands, operators, displayType, questionText }: MathQuestionDisplayProps) {
  const Operands = operands ?? [];
  const Operators = operators ?? [];
  const Mode = NormaliseDisplayType(displayType);

  if (Mode === "EXPRESSION" || Mode === "EXPRESSION_WORKSHEET") {
    return <ExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} mode="EXPRESSION_WORKSHEET" />;
  }

  if (Mode === "ANSWER_POSITION") {
    return <ExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} mode="ANSWER_POSITION" />;
  }

  if (Mode === "FINANCIAL_TABLE") {
    return <FinancialTableQuestion operands={Operands} operators={Operators} questionText={questionText} />;
  }

  if (Mode === "COMPACT_EXPRESSION") {
    return <CompactExpressionQuestion operands={Operands} operators={Operators} questionText={questionText} />;
  }

  if (Mode === "SKILL_STACKER_TABLE" || Mode === "CONCEPT_DRILL_TABLE") {
    return <CompactTwoColumnQuestion operands={Operands} operators={Operators} questionText={questionText} />;
  }

  return <VerticalQuestion operands={Operands} operators={Operators} />;
}
