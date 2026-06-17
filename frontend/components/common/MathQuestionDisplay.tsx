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

type DecimalStackRow = {
  operator: string;
  integerPart: string;
  decimalPart: string;
  hasDecimal: boolean;
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
    if (Operator === "×%") return `× ${Value}%`;
    if (Operator === "%") return `% ${Value}`;
    return `${Operator} ${Value}`;
  }).join(" ");
}

function RenderExpressionWithBlueQuestion(Expression: string) {
  const Parts = Expression.split(/([?？])/g);

  return Parts.map((Part, Index) => {
    if (Part === "?" || Part === "？") {
      return <span key={`question-mark-${Index}`} className="text-blue-700 dark:text-cyan-300">?</span>;
    }

    return <span key={`expression-part-${Index}`}>{Part}</span>;
  });
}

function ExpressionQuestion({
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
  const ExpressionAlreadyContainsPrompt = /[?？]/.test(Expression);
  const IsAnswerPosition = mode === "ANSWER_POSITION";
  const CharacterCount = Expression.replace(/\s+/g, "").length;
  const FontSizePx = IsAnswerPosition
    ? Math.max(15, 28 - Math.max(0, CharacterCount - 20) * 0.32)
    : Math.max(14, 34 - Math.max(0, CharacterCount - 18) * 0.4);

  return (
    <div className="mx-auto flex w-full max-w-full justify-center overflow-hidden rounded-[20px] bg-white px-4 py-4 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-5">
      <div
        className="w-full overflow-hidden text-center font-mono font-black leading-none tracking-tight"
        style={{
          fontSize: `${FontSizePx}px`,
          whiteSpace: "nowrap",
          textWrap: "nowrap",
        }}
      >
        {RenderExpressionWithBlueQuestion(Expression)}
        {!ExpressionAlreadyContainsPrompt ? <span className="ml-2 text-blue-700 dark:text-cyan-300">= ?</span> : null}
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
  const Expression = questionText?.trim() || BuildExpression(operands, operators);

  return (
    <div className="mx-auto flex w-full max-w-full justify-center overflow-visible rounded-[18px] bg-white px-4 py-3.5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-5">
      <div className="max-w-full whitespace-normal break-words text-center font-mono text-[18px] font-black leading-[1.4] tracking-tight sm:text-[22px] lg:text-[26px] xl:text-[28px]">
        {RenderExpressionWithBlueQuestion(Expression)}
        <span className="ml-2 text-blue-700 dark:text-cyan-300">= ?</span>
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
        <div className="grid bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs" style={GridTemplateColumns}>
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
        <div className="grid grid-cols-2 bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs">
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

function IsDecimalStackCandidate(operands: Array<number | string>, operators: string[]): boolean {
  if (!operands.length || operands.length !== operators.length) return false;
  if (operators.some((Operator) => !["", "+", "-", "−"].includes(String(Operator || "").trim()))) return false;
  return operands.some((Operand) => FormatValue(Operand).includes("."));
}

function BuildDecimalStackRows(operands: Array<number | string>, operators: string[]): DecimalStackRow[] {
  return operands.map((Operand, Index) => {
    const RawValue = FormatValue(Operand).trim();
    const IsNegative = RawValue.startsWith("-");
    const CleanValue = IsNegative ? RawValue.slice(1) : RawValue;
    const [IntegerPart, DecimalPart = ""] = CleanValue.split(".");
    const RawOperator = Index === 0 ? "" : String(operators[Index] || "").trim();
    const Operator = IsNegative || RawOperator === "-" || RawOperator === "−" ? "−" : "";

    return {
      operator: Operator,
      integerPart: IntegerPart || "0",
      decimalPart: DecimalPart,
      hasDecimal: CleanValue.includes("."),
    };
  });
}

function DecimalAlignedVerticalQuestion({ operands, operators }: { operands: Array<number | string>; operators: string[] }) {
  const Rows = BuildDecimalStackRows(operands, operators);
  const MaxIntegerLength = Math.max(1, ...Rows.map((Row) => Row.integerPart.length));
  const MaxDecimalLength = Math.max(1, ...Rows.map((Row) => Row.decimalPart.length));
  const IntegerWidth = `${Math.max(2.5, MaxIntegerLength * 0.78)}em`;
  const DecimalWidth = `${Math.max(1.75, MaxDecimalLength * 0.82)}em`;
  const DecimalPointWidth = "0.95rem";

  return (
    <div className="mx-auto w-fit rounded-[20px] bg-white px-4 py-4 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-5 sm:py-4">
      <div className="font-mono text-[26px] font-black leading-[1.18] sm:text-[32px]">
        {Rows.map((Row, Index) => (
          <div key={`${Row.operator}-${Row.integerPart}-${Row.decimalPart}-${Index}`} className="grid items-baseline gap-0.5" style={{ gridTemplateColumns: `1.35rem ${IntegerWidth} ${DecimalPointWidth} ${DecimalWidth}` }}>
            <span className="text-center">{Row.operator}</span>
            <span className="pr-1 text-right tabular-nums">{Row.integerPart}</span>
            <span className="flex h-[1.05em] items-end justify-center pb-[0.18em]" aria-hidden="true">
              <span className="block h-[0.24em] w-[0.24em] rounded-full bg-slate-950 dark:bg-white" />
            </span>
            <span className="pl-1 text-left tabular-nums">{Row.decimalPart.padEnd(MaxDecimalLength, "0")}</span>
          </div>
        ))}
      </div>

      <div className="my-2.5 border-t-[3px] border-slate-800 dark:border-slate-200" />

      <div className="grid items-baseline gap-0.5 text-right font-mono text-[26px] font-black text-blue-700 dark:text-cyan-300 sm:text-[32px]" style={{ gridTemplateColumns: `1.35rem ${IntegerWidth} ${DecimalPointWidth} ${DecimalWidth}` }}>
        <span />
        <span />
        <span />
        <span className="pl-1 text-left tabular-nums">?</span>
      </div>
    </div>
  );
}

function PositionNumberTableQuestion({
  operands,
  operators,
  questionText,
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
}) {
  const Labels = operators.length ? operators : ["Position", "Number"];

  return (
    <div className="mx-auto w-full max-w-md rounded-[22px] bg-white px-5 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      <p className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
        {questionText?.trim() || "Write the Number from the Given Position"}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs">
          <div className="border-r border-slate-200 px-4 py-3 dark:border-slate-700">{Labels[0] || "Position"}</div>
          <div className="px-4 py-3">{Labels[1] || "Number"}</div>
        </div>
        <div className="grid grid-cols-2 text-center font-mono text-2xl font-black sm:text-3xl">
          <div className="border-r border-slate-200 px-4 py-5 dark:border-slate-700">{FormatValue(operands[0] ?? "?")}</div>
          <div className="px-4 py-5">{FormatValue(operands[1] ?? "?")}</div>
        </div>
      </div>
      <div className="mt-4 text-center text-2xl font-black text-blue-700 dark:text-cyan-300">?</div>
    </div>
  );
}

function IsPositionNumberTable(operators: string[]): boolean {
  const Labels = operators.map((Operator) => String(Operator || "").trim().toUpperCase());
  return Labels[0] === "POSITION" && Labels[1] === "NUMBER";
}

function IsFirstNaturalNumberCard(operators: string[]): boolean {
  const Labels = operators.map((Operator) => String(Operator || "").trim().toUpperCase());
  return Labels.length === 1 && Labels[0] === "NUMBER";
}

function FirstNaturalNumberCardQuestion({ operands, questionText }: { operands: Array<number | string>; questionText?: string | null }) {
  const PromptText = questionText?.trim() || "Find the Position of the First Natural Number";

  return (
    <div className="mx-auto w-full max-w-sm rounded-[22px] bg-white px-5 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      <p className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
        {PromptText}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="bg-slate-100 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs">
          Number
        </div>
        <div className="px-5 py-6 text-center font-mono text-3xl font-black leading-none sm:text-4xl">
          {FormatValue(operands[0] ?? "?")}
        </div>
      </div>
      <div className="mt-4 text-center text-2xl font-black text-blue-700 dark:text-cyan-300">?</div>
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
    if (IsPositionNumberTable(Operators)) {
      return <PositionNumberTableQuestion operands={Operands} operators={Operators} questionText={questionText} />;
    }

    if (IsFirstNaturalNumberCard(Operators)) {
      return <FirstNaturalNumberCardQuestion operands={Operands} questionText={questionText} />;
    }

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

  if ((Mode === "VERTICAL" || Mode === "VISUAL_STACK") && IsDecimalStackCandidate(Operands, Operators)) {
    return <DecimalAlignedVerticalQuestion operands={Operands} operators={Operators} />;
  }

  return <VerticalQuestion operands={Operands} operators={Operators} />;
}
