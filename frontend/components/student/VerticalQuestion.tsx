import type { CSSProperties } from "react";

function NormaliseOperator(operator?: string | number | null): string {
  return String(operator ?? "")
    .trim()
    .replace("−", "-")
    .replace("–", "-")
    .replace("*", "×")
    .replace("x", "×")
    .replace("X", "×")
    .replace("/", "÷");
}

function IsOperatorToken(value: number | string): boolean {
  const Token = NormaliseOperator(value);
  return Token === "+" || Token === "-" || Token === "×" || Token === "÷";
}

function FormatStackValue(value: number | string): string {
  const NumericValue = Number(value);

  if (!Number.isFinite(NumericValue)) return String(value);

  const AbsoluteValue = Math.abs(NumericValue);
  if (Number.isInteger(AbsoluteValue)) return String(AbsoluteValue);

  return String(Number(AbsoluteValue.toFixed(8))).replace(/\.0+$/, "");
}

function OperatorForNumberRow({
  operators,
  numberIndex,
}: {
  operators: string[];
  numberIndex: number;
}): string {
  const DirectOperator = operators[numberIndex];
  const PreviousOperator = operators[numberIndex - 1];

  // YLM records often store an operator for every operand. Older MM records may
  // store operators between operands. This keeps both formats safe.
  if (DirectOperator === "+" || DirectOperator === "-") return DirectOperator;
  if (PreviousOperator === "+" || PreviousOperator === "-") return PreviousOperator;
  if (DirectOperator) return DirectOperator;
  if (PreviousOperator) return PreviousOperator;
  return "";
}

function BuildStackRows({
  operands,
  operators,
}: {
  operands: Array<number | string>;
  operators: string[];
}) {
  const Rows: Array<{ sign: string; value: string }> = [];
  let PendingOperator = "";
  let NumberIndex = 0;

  operands.forEach((operand) => {
    const OperandOperator = IsOperatorToken(operand) ? NormaliseOperator(operand) : "";

    if (OperandOperator) {
      PendingOperator = OperandOperator;
      return;
    }

    const NumericValue = Number(operand);
    const StoredOperator = PendingOperator || OperatorForNumberRow({ operators, numberIndex: NumberIndex });
    const NormalisedOperator = NormaliseOperator(StoredOperator);
    const IsNegativeValue = Number.isFinite(NumericValue) && NumericValue < 0;

    let Sign = "";

    // Global Add/Less convention:
    // Addition is blank by default. Only subtraction shows a minus sign on the
    // same row, in the fixed operator column to the left of the number.
    if (IsNegativeValue || NormalisedOperator === "-") {
      Sign = "−";
    } else if (NormalisedOperator === "×" || NormalisedOperator === "÷") {
      Sign = NormalisedOperator;
    }

    Rows.push({
      sign: Sign,
      value: FormatStackValue(operand),
    });

    PendingOperator = "";
    NumberIndex += 1;
  });

  return Rows;
}

export function VerticalQuestion({
  operands,
  operators,
}: {
  operands: Array<number | string>;
  operators: string[];
}) {
  const StackRows = BuildStackRows({ operands, operators });
  const NumericOperands = operands
    .filter((operand) => !IsOperatorToken(operand))
    .map((operand) => Number(operand));
  const HasDecimalOperand = NumericOperands.some((operand) => Number.isFinite(operand) && !Number.isInteger(operand));
  const LongestOperandLength = StackRows.reduce<number>((length, row) => Math.max(length, row.value.length), 0);
  const NeedsWideNumberColumn = HasDecimalOperand || LongestOperandLength >= 4;
  const NumberColumnWidth = NeedsWideNumberColumn
    ? `minmax(${Math.max(7.5, LongestOperandLength * 1.05)}rem, max-content)`
    : "minmax(4.8rem, max-content)";
  const StackGridStyle: CSSProperties = {
    gridTemplateColumns: `2.2rem ${NumberColumnWidth}`,
  };
  const FontSizeClass = NeedsWideNumberColumn
    ? "text-[25px] sm:text-[32px]"
    : "text-[34px] sm:text-[46px]";

  return (
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-[24px] bg-white px-5 py-5 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8 sm:py-6">
      <div className={`font-mono ${FontSizeClass} font-black leading-tight`}>
        {StackRows.map((row, index) => (
          <div
            key={`${row.sign}-${row.value}-${index}`}
            className="grid justify-end gap-1 text-right"
            style={StackGridStyle}
          >
            <span className="whitespace-nowrap text-right tabular-nums">{row.sign}</span>
            <span className="whitespace-nowrap text-right tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="my-2.5 border-t-[4px] border-slate-800 dark:border-slate-200" />

      <div
        className={`grid gap-1 text-right font-mono ${FontSizeClass} font-black text-blue-700 dark:text-cyan-300`}
        style={StackGridStyle}
      >
        <span></span>
        <span className="whitespace-nowrap text-right">?</span>
      </div>
    </div>
  );
}
