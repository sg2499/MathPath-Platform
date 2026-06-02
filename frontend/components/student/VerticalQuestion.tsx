import type { CSSProperties } from "react";

type StackToken = number | string | null | undefined;

type StackRow = {
  sign: string;
  value: string;
};

function NormaliseOperator(operator?: StackToken): string {
  return String(operator ?? "")
    .trim()
    .replace("−", "-")
    .replace("–", "-")
    .replace("*", "×")
    .replace("x", "×")
    .replace("X", "×")
    .replace("/", "÷");
}

function IsOperatorToken(value: StackToken): boolean {
  const Token = NormaliseOperator(value);
  return Token === "+" || Token === "-" || Token === "×" || Token === "÷";
}

function FormatStackValue(value: StackToken): string {
  const RawValue = String(value ?? "").trim();
  const NumericValue = Number(RawValue);

  if (!Number.isFinite(NumericValue)) return RawValue;

  const AbsoluteValue = Math.abs(NumericValue);
  if (Number.isInteger(AbsoluteValue)) return String(AbsoluteValue);

  return String(Number(AbsoluteValue.toFixed(8))).replace(/\.0+$/, "");
}

function OperatorForNumberRow({
  operators,
  numberIndex,
  rawIndex,
}: {
  operators: string[];
  numberIndex: number;
  rawIndex: number;
}): string {
  const Candidates = [
    operators[numberIndex],
    operators[numberIndex - 1],
    operators[rawIndex],
    operators[rawIndex - 1],
  ];

  return Candidates.find((operator) => NormaliseOperator(operator)) ?? "";
}

function BuildStackRows({
  operands,
  operators,
}: {
  operands: StackToken[];
  operators: string[];
}): StackRow[] {
  const Rows: StackRow[] = [];
  let PendingOperator = "";
  let NumberIndex = 0;

  operands.forEach((operand, rawIndex) => {
    const OperandOperator = IsOperatorToken(operand) ? NormaliseOperator(operand) : "";

    if (OperandOperator) {
      PendingOperator = OperandOperator;
      return;
    }

    const Value = FormatStackValue(operand);
    if (!Value) return;

    const NumericValue = Number(operand);
    const StoredOperator = PendingOperator || OperatorForNumberRow({ operators, numberIndex: NumberIndex, rawIndex });
    const NormalisedOperator = NormaliseOperator(StoredOperator);
    const IsNegativeValue = Number.isFinite(NumericValue) && NumericValue < 0;

    let Sign = "";

    if (NumberIndex > 0 && (IsNegativeValue || NormalisedOperator === "-")) {
      Sign = "−";
    } else if (NormalisedOperator === "×" || NormalisedOperator === "÷") {
      Sign = NormalisedOperator;
    }

    Rows.push({
      sign: Sign,
      value: Value,
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
  operands: StackToken[];
  operators: string[];
}) {
  const StackRows = BuildStackRows({ operands, operators });
  const NumericOperands = StackRows.map((row) => Number(row.value));
  const HasDecimalOperand = NumericOperands.some((operand) => Number.isFinite(operand) && !Number.isInteger(operand));
  const LongestOperandLength = StackRows.reduce<number>((length, row) => Math.max(length, row.value.length), 0);
  const NeedsWideNumberColumn = HasDecimalOperand || LongestOperandLength >= 4;
  const NumberColumnWidth = NeedsWideNumberColumn
    ? `minmax(${Math.max(5.6, LongestOperandLength * 0.72)}rem, max-content)`
    : "minmax(2.8rem, max-content)";
  const StackGridStyle: CSSProperties = {
    gridTemplateColumns: `1.15rem ${NumberColumnWidth}`,
  };
  const FontSizeClass = NeedsWideNumberColumn
    ? "text-[21px] sm:text-[26px] xl:text-[30px]"
    : "text-[34px] sm:text-[42px] xl:text-[46px]";

  return (
    <div className="mx-auto w-fit max-w-full rounded-[20px] bg-white px-4 py-4 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-5 sm:py-5">
      <div className={`font-mono ${FontSizeClass} font-black leading-[1.18]`}>
        {StackRows.map((row, index) => (
          <div
            key={`${row.sign}-${row.value}-${index}`}
            className="grid items-baseline justify-end gap-1 text-right"
            style={StackGridStyle}
          >
            <span className="whitespace-nowrap text-right tabular-nums">{row.sign}</span>
            <span className="whitespace-nowrap text-right tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="my-2 border-t-[3px] border-slate-800 dark:border-slate-200" />

      <div
        className={`grid gap-1 text-right font-mono ${FontSizeClass} font-black leading-[1.18] text-blue-700 dark:text-cyan-300`}
        style={StackGridStyle}
      >
        <span></span>
        <span className="whitespace-nowrap text-right">?</span>
      </div>
    </div>
  );
}
