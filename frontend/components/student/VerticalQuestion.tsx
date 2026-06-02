function NormaliseOperator(operator?: string | null): string {
  return String(operator || "")
    .trim()
    .replace("−", "-")
    .replace("–", "-")
    .replace("*", "×")
    .replace("x", "×")
    .replace("X", "×")
    .replace("/", "÷");
}

function IsOperatorToken(value: number | string): boolean {
  const Token = NormaliseOperator(String(value));
  return Token === "+" || Token === "-" || Token === "×" || Token === "÷";
}

function GetOperatorForNumberRow({
  operators,
  numberIndex,
}: {
  operators: string[];
  numberIndex: number;
}): string {
  if (numberIndex === 0) return "";

  // Generators usually store operators between operands, so the operator that
  // applies to number row N is operators[N - 1]. Some older records stored a
  // same-length operator array, so fall back safely without changing data.
  return operators[numberIndex - 1] ?? operators[numberIndex] ?? "";
}

function FormatStackValue(operand: number | string): string {
  const NumericOperand = Number(operand);

  if (!Number.isFinite(NumericOperand)) return String(operand);

  const AbsoluteValue = Math.abs(NumericOperand);
  if (Number.isInteger(AbsoluteValue)) return String(AbsoluteValue);

  return String(Number(AbsoluteValue.toFixed(8))).replace(/\.0+$/, "");
}

function BuildStackRows({
  operands,
  operators,
}: {
  operands: Array<number | string>;
  operators: string[];
}) {
  const Rows: Array<{ sign: string; value: string }> = [];
  let PendingInlineOperator = "";
  let NumberIndex = 0;

  operands.forEach((operand) => {
    const InlineOperator = IsOperatorToken(operand) ? NormaliseOperator(String(operand)) : "";

    if (InlineOperator) {
      PendingInlineOperator = InlineOperator;
      return;
    }

    const NumericOperand = Number(operand);
    const StoredOperator = PendingInlineOperator || GetOperatorForNumberRow({ operators, numberIndex: NumberIndex });
    const NormalisedOperator = NormaliseOperator(StoredOperator);
    const IsNegative = Number.isFinite(NumericOperand) && NumericOperand < 0;

    let Sign = "";
    if (IsNegative || NormalisedOperator === "-") {
      Sign = "−";
    } else if (NormalisedOperator === "×" || NormalisedOperator === "÷") {
      Sign = NormalisedOperator;
    }

    Rows.push({
      sign: Sign,
      value: FormatStackValue(operand),
    });

    PendingInlineOperator = "";
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
  const NumberColumnClass = NeedsWideNumberColumn
    ? "minmax(8.75rem,max-content) sm:minmax(10rem,max-content)"
    : "minmax(5.6rem,max-content) sm:minmax(6.8rem,max-content)";
  const FontSizeClass = NeedsWideNumberColumn
    ? "text-[28px] sm:text-[36px]"
    : "text-[34px] sm:text-[46px]";

  return (
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-[24px] bg-white px-5 py-5 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8 sm:py-6">
      <div className={`font-mono ${FontSizeClass} font-black leading-tight`}>
        {StackRows.map((row, index) => (
          <div
            key={`${row.sign}-${row.value}-${index}`}
            className={`grid grid-cols-[2.35rem_${NumberColumnClass}] justify-end gap-2 text-right sm:grid-cols-[2.75rem_${NumberColumnClass}]`}
          >
            <span className="whitespace-nowrap text-right tabular-nums">{row.sign}</span>
            <span className="whitespace-nowrap text-right tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="my-2.5 border-t-[4px] border-slate-800 dark:border-slate-200" />

      <div className={`grid grid-cols-[2.35rem_${NumberColumnClass}] gap-2 text-right font-mono ${FontSizeClass} font-black text-blue-700 dark:text-cyan-300 sm:grid-cols-[2.75rem_${NumberColumnClass}]`}>
        <span></span>
        <span className="whitespace-nowrap text-right">?</span>
      </div>
    </div>
  );
}
