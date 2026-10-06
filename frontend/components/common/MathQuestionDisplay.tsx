import type React from "react";
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
  | "CONCEPT_DRILL_MULTIPLY"
  | "CONCEPT_DRILL_DIVIDE"
  | "CONCEPT_DRILL_RANGE_SUM"
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

// One number size for every question (2026-10, Shailesh: "the font size of the
// numbers displayed in the question no matter the concept should be same ...
// across all the modules and the levels"). Every digit a question shows, in
// every display type below and in VerticalQuestion, uses the mp-q-num class,
// whose size is the single --mp-question-size value set in globals.css. No
// display type picks its own size and nothing shrinks with length any more:
// a long expression breaks onto the next line instead (see BindOperators).
const QUESTION_NUMBER_CLASS = "mp-q-num";

// Display only: keeps each operator attached to the number that follows it, so
// when a long expression has to break it breaks BEFORE an operator
// ("... + 6260 ÷ 626" / "+ ∛185193 − 129²"), never between an operator and
// its number and never inside a number. The expression text itself is unchanged.
function BindOperators(Expression: string): string {
  return Expression.replace(/\s+([+\-−×÷=\/])\s+/g, " $1\u00a0");
}

// Display only: Init Caps for the captions and column labels of the table-style
// questions. They arrive from the engines in mixed forms ("ADD", "TIMES",
// "Rate of Interest", "Write the Number from the Given Position"). An
// all-capitals label is lower-cased first; then the first letter of every word
// is capitalised and nothing else is touched ("Term (Years)", "Profit %" and
// abbreviations inside mixed-case text stay as they are). Never used on an
// expression or on any number.
function DisplayLabel(Label: string): string {
  const Text = String(Label ?? "");
  if (!Text) return Text;
  const Base = Text === Text.toUpperCase() && Text !== Text.toLowerCase() ? Text.toLowerCase() : Text;
  return Base.replace(/(^|[\s(\/-])([a-z])/g, (_, Lead: string, Letter: string) => `${Lead}${Letter.toUpperCase()}`);
}

// Column widths for the table-style questions. On ordinary screens the columns
// are equal. On a very narrow phone equal columns can be too tight for a long
// value next to a short one (e.g. "26881.25" beside "25"), so there the columns
// share the row in proportion to what they hold (see .mp-q-cols in globals.css).
// Both the label row and the value row use the same template, so they stay aligned.
function QuestionColumnVars(Values: string[]): React.CSSProperties {
  const Fit = Values.map((Value) => `minmax(0, ${Math.max(Value.length, 3)}fr)`).join(" ");
  return {
    ["--mp-q-cols-even" as string]: `repeat(${Values.length}, minmax(0, 1fr))`,
    ["--mp-q-cols-fit" as string]: Fit,
  } as React.CSSProperties;
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
}: {
  operands: Array<number | string>;
  operators: string[];
  questionText?: string | null;
  // Kept so callers stay unchanged; both modes now render identically.
  mode: "EXPRESSION_WORKSHEET" | "ANSWER_POSITION";
}) {
  const Expression = questionText?.trim() || BuildExpression(operands, operators);
  const ExpressionAlreadyContainsPrompt = /[?？]/.test(Expression);
  // 2026-07-24 fix: this used to force whiteSpace:nowrap below a 26-character
  // threshold, on the assumption a "short" expression always fits one line.
  // That assumption broke as soon as this component was reused inside a
  // narrower container (the Assessment Studio's ~360px preview column) --
  // a 23-character BODMAS expression ("735 / 83 + 7530 x 4 + 2772 - 4644")
  // at the resulting ~32px font is ~440px wide, well past 360px, and with
  // nowrap forced it just overflowed and visually overlapped the answer
  // options next to it instead of wrapping. Always allowing wrap (letting
  // the browser decide whether a line actually needs to break, based on its
  // real rendered width) fixes this everywhere this component is used,
  // without needing to guess a container width from a character count.
  // 2026-10: the size no longer depends on the expression's length (it used to
  // shrink from 26-28px down to 15px for long expressions) -- see
  // QUESTION_NUMBER_CLASS above. Wrapping stays allowed for the same reason as
  // the 2026-07-24 fix: a long expression in a narrow container breaks onto the
  // next line rather than overflowing.
  return (
    <div className="mx-auto flex w-full max-w-full justify-center rounded-[20px] bg-white px-4 py-4 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-5">
      <div
        className={`w-full text-center font-mono font-black leading-[1.35] py-1 tracking-tight ${QUESTION_NUMBER_CLASS}`}
        style={{
          whiteSpace: "normal",
          overflowWrap: "break-word",
        }}
      >
        {RenderExpressionWithBlueQuestion(BindOperators(Expression))}
        {!ExpressionAlreadyContainsPrompt ? <>{" "}<span className="whitespace-nowrap text-blue-700 dark:text-cyan-300">= ?</span></> : null}
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
      <div className={`max-w-full whitespace-normal break-words text-center font-mono font-black leading-[1.4] tracking-tight ${QUESTION_NUMBER_CLASS}`}>
        {RenderExpressionWithBlueQuestion(BindOperators(Expression))}
        {" "}<span className="whitespace-nowrap text-blue-700 dark:text-cyan-300">= ?</span>
      </div>
    </div>
  );
}

// The instruction above the box ("Find Profit %", "Find Simple Interest",
// "Odd Numbers" ...) is the question's own stored text. Every flow now sends it
// (practice sheets did not until 2026-10), so it must always be rendered when
// present: [data-q-caption] is what the checks look for.
function FinancialTableQuestion({ operands, operators, questionText }: { operands: Array<number | string>; operators: string[]; questionText?: string | null }) {
  const Labels = operators.length ? operators : operands.map((_, Index) => `Value ${Index + 1}`);
  const ColumnCount = Math.max(1, Math.min(Math.max(Labels.length, operands.length), 4));
  const GridTemplateColumns = QuestionColumnVars(
    Array.from({ length: ColumnCount }).map((_, Index) => FormatValue(operands[Index] ?? "?")),
  );

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[24px] bg-white px-2 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-7 sm:py-6">
      {questionText ? <p data-q-caption className="mb-4 text-center text-base font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{DisplayLabel(questionText)}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="mp-q-cols grid bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs" style={GridTemplateColumns}>
          {Array.from({ length: ColumnCount }).map((_, Index) => (
            <div key={`financial-label-${Index}`} className="flex items-center justify-center border-r border-slate-200 px-1 py-3 last:border-r-0 dark:border-slate-700 sm:px-2">
              {DisplayLabel(Labels[Index] || `Value ${Index + 1}`)}
            </div>
          ))}
        </div>
        <div className={`mp-q-cols grid text-center font-mono font-black ${QUESTION_NUMBER_CLASS}`} style={GridTemplateColumns}>
          {Array.from({ length: ColumnCount }).map((_, Index) => (
            <div key={`financial-value-${Index}`} className="whitespace-nowrap border-r border-slate-200 px-1 py-5 last:border-r-0 dark:border-slate-700 sm:px-3">
              {FormatValue(operands[Index] ?? "?")}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
        Work out the result and type your answer.
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
  const ColumnVars = QuestionColumnVars([FormatValue(operands[0] ?? "?"), FormatValue(operands[1] ?? "?")]);

  return (
    <div className="mx-auto w-full max-w-md rounded-[22px] bg-white px-2 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      {questionText ? <p data-q-caption className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">{DisplayLabel(questionText)}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="mp-q-cols grid bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs" style={ColumnVars}>
          <div className="border-r border-slate-200 px-2 py-3 dark:border-slate-700 sm:px-4">{DisplayLabel(Labels[0] || "Value 1")}</div>
          <div className="px-2 py-3 sm:px-4">{DisplayLabel(Labels[1] || "Value 2")}</div>
        </div>
        <div className={`mp-q-cols grid text-center font-mono font-black ${QUESTION_NUMBER_CLASS}`} style={ColumnVars}>
          <div className="whitespace-nowrap border-r border-slate-200 px-1 py-5 dark:border-slate-700 sm:px-4">{FormatValue(operands[0] ?? "?")}</div>
          <div className="whitespace-nowrap px-1 py-5 sm:px-4">{FormatValue(operands[1] ?? "?")}</div>
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
      <div className={`font-mono font-black leading-[1.18] ${QUESTION_NUMBER_CLASS}`}>
        {Rows.map((Row, Index) => (
          <div key={`${Row.operator}-${Row.integerPart}-${Row.decimalPart}-${Index}`} className="grid items-baseline gap-0.5" style={{ gridTemplateColumns: `1.35rem ${IntegerWidth} ${DecimalPointWidth} ${DecimalWidth}` }}>
            <span className="text-center">{Row.operator}</span>
            <span className="pr-1 text-right tabular-nums">{Row.integerPart}</span>
            <span className="flex h-[1.05em] items-end justify-center pb-[0.18em]" aria-hidden="true">
              {/* 2026-10 (Shailesh): the point takes the digits' own colour (bg-current).
                  It used to be bg-slate-950 / dark:bg-white, but the platform's dark theme
                  repaints every .bg-white surface dark, which made the decimal point vanish
                  in dark mode on every screen that shows a decimal sum. */}
              <span data-q-mark="point" className="block h-[0.24em] w-[0.24em] rounded-full bg-current" />
            </span>
            <span className="pl-1 text-left tabular-nums">{Row.decimalPart.padEnd(MaxDecimalLength, "0")}</span>
          </div>
        ))}
      </div>

      <div data-q-mark="rule" className="my-2.5 border-t-[3px] border-current" />

      <div className={`grid items-baseline gap-0.5 text-right font-mono font-black text-blue-700 dark:text-cyan-300 ${QUESTION_NUMBER_CLASS}`} style={{ gridTemplateColumns: `1.35rem ${IntegerWidth} ${DecimalPointWidth} ${DecimalWidth}` }}>
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
  const PositionText = FormatValue(operands[0] ?? "?");
  const NumberText = FormatValue(operands[1] ?? "?");
  // History: these cells first used a fixed text-2xl/3xl, which wrapped long
  // generated numbers (up to ~10 characters, e.g. "0.00009999") onto a second
  // line; the 2026-07-24 fix shrank the font by length to keep one line.
  // 2026-10: no longer shrinks with length -- see QUESTION_NUMBER_CLASS above.
  // On a narrow phone the two columns share the row in proportion to what they
  // hold (see QuestionColumnVars), so a long number still stays on one line.
  const ColumnVars = QuestionColumnVars([PositionText, NumberText]);

  return (
    <div className="mx-auto w-full max-w-md rounded-[22px] bg-white px-2 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      <p data-q-caption className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
        {DisplayLabel(questionText?.trim() || "Write the Number from the Given Position")}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="mp-q-cols grid bg-slate-100 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs" style={ColumnVars}>
          <div className="border-r border-slate-200 px-2 py-3 dark:border-slate-700 sm:px-4">{DisplayLabel(Labels[0] || "Position")}</div>
          <div className="px-2 py-3 sm:px-4">{DisplayLabel(Labels[1] || "Number")}</div>
        </div>
        <div className={`mp-q-cols grid text-center font-mono font-black ${QUESTION_NUMBER_CLASS}`} style={ColumnVars}>
          <div className="whitespace-nowrap border-r border-slate-200 px-1 py-5 dark:border-slate-700 sm:px-4">{PositionText}</div>
          <div className="whitespace-nowrap px-1 py-5 sm:px-4">{NumberText}</div>
        </div>
      </div>
      <div className={`mt-4 text-center font-mono font-black text-blue-700 dark:text-cyan-300 ${QUESTION_NUMBER_CLASS}`}>?</div>
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
  const NumberText = FormatValue(operands[0] ?? "?");
  // 2026-07-24 fix: same wrap-onto-next-line issue as PositionNumberTableQuestion
  // above -- a fixed text-3xl/4xl doesn't shrink for longer generated numbers.

  return (
    <div className="mx-auto w-full max-w-sm rounded-[22px] bg-white px-2 py-5 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
      <p data-q-caption className="mb-3 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
        {DisplayLabel(PromptText)}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="bg-slate-100 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-900 dark:text-slate-300 sm:text-xs">
          Number
        </div>
        <div className={`whitespace-nowrap px-1 py-6 text-center font-mono font-black leading-none sm:px-5 ${QUESTION_NUMBER_CLASS}`}>
          {NumberText}
        </div>
      </div>
      <div className={`mt-4 text-center font-mono font-black text-blue-700 dark:text-cyan-300 ${QUESTION_NUMBER_CLASS}`}>?</div>
    </div>
  );
}

// 2026-10 (Shailesh): "we always need to display the questions ... in a single
// line and we can adjust the answer box or the options accordingly". A sum that
// is written across one line (BODMAS and the other expression types) needs more
// width than the half of the card it gets when the answer box or the options
// sit beside it. The test screens ask this once per test (per section on an
// annual paper): if any question is a one-line sum too long for the side-by-side
// board, the whole test uses the full-width board with the answer area under it,
// so the layout never changes from one question to the next. Display only: it
// reads the same fields the question is drawn from and changes none of them.
type OneLineSumSource = {
  operands?: Array<number | string> | null;
  operators?: string[] | null;
  displayType?: string | null;
  display_type?: string | null;
  questionText?: string | null;
  question_text?: string | null;
  metadata?: Record<string, unknown> | null;
};

// The longest one-line sum that still fits the side-by-side board on a 1024px
// screen at the single question size, counting the trailing "= ?".
const SIDE_BY_SIDE_SUM_LIMIT = 18;

function OneLineSumLength(Question: OneLineSumSource): number {
  const Mode = NormaliseDisplayType((Question.displayType ?? Question.display_type ?? "") as DisplayMode);
  const Operators = Question.operators ?? [];
  const IsExpression =
    Mode === "EXPRESSION" ||
    Mode === "EXPRESSION_WORKSHEET" ||
    (Mode === "ANSWER_POSITION" && !IsPositionNumberTable(Operators) && !IsFirstNaturalNumberCard(Operators));
  if (!IsExpression) return 0;
  const Metadata = (Question.metadata || {}) as Record<string, unknown>;
  const Stored = (Question.questionText ?? Question.question_text ?? Metadata.question_text ?? Metadata.questionText ?? "") as string;
  const Expression = String(Stored || "").trim() || BuildExpression(Question.operands ?? [], Operators);
  return Expression.length + (/[?？]/.test(Expression) ? 0 : 4);
}

export function NeedsWideQuestionBoard(Questions: ReadonlyArray<unknown> | null | undefined): boolean {
  return (Questions ?? []).some((Question) => OneLineSumLength((Question ?? {}) as OneLineSumSource) > SIDE_BY_SIDE_SUM_LIMIT);
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

  if (
    Mode === "SKILL_STACKER_TABLE" ||
    Mode === "CONCEPT_DRILL_TABLE" ||
    // PM-L2's own Concept Drill formats (multiply/divide-remainder/range-sum)
    // -- see backend/app/question_engine/pm_l2/concept_drill.py. Originally
    // rendered as a written sentence via a bespoke component; corrected
    // 2026-08-05 (later still) to reuse this same labeled 2-column box IM's
    // Skill Stacker (ADD/TIMES) and IM/MM's own Concept Drill (FROM/LESS)
    // already use, matching the literal workbook image (Lesson 3 DPS5:
    // SL/ADD/TIMES/ANSWER and SL/FROM/LESS/ANSWER columns, no per-question
    // caption). RANGE_SUM (FROM/TO) has no IM/MM equivalent, but uses the
    // same box with the workbook's own column labels; its generator sets a
    // real questionText caption ("Odd Numbers"/"Consecutive Numbers"/
    // "Multiples of N") since without it, FROM/TO alone can't distinguish
    // e.g. odd-numbers-1-to-30 from consecutive-numbers-1-to-30 (confirmed
    // against the Lesson 2 DPS5 image, which shows identical FROM/TO values
    // for both rows, disambiguated only by that caption).
    Mode === "CONCEPT_DRILL_MULTIPLY" ||
    Mode === "CONCEPT_DRILL_DIVIDE" ||
    Mode === "CONCEPT_DRILL_RANGE_SUM"
    // Note: PM-L3's "2D X 1D" multiplication and "3D ÷ 1D" division DPS
    // types do NOT belong here (corrected 2026-08-06, Shailesh) -- they are
    // plain arithmetic, not a Concept Drill teaser, so they render via
    // EXPRESSION_WORKSHEET below instead (matching IM's WHOLE_NUMBER_
    // MULTIPLICATION/WHOLE_NUMBER_DIVISION precedent: a single
    // "43 × 8 = ?" expression, not a labeled box).
  ) {
    return <CompactTwoColumnQuestion operands={Operands} operators={Operators} questionText={questionText} />;
  }

  if ((Mode === "VERTICAL" || Mode === "VISUAL_STACK") && IsDecimalStackCandidate(Operands, Operators)) {
    return <DecimalAlignedVerticalQuestion operands={Operands} operators={Operators} />;
  }

  return <VerticalQuestion operands={Operands} operators={Operators} />;
}
