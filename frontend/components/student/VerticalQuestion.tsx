function NormaliseOperator(operator?: string | null): string {
  return String(operator || "")
    .trim()
    .replace("−", "-")
    .replace("–", "-")
    .replace("*", "×")
    .replace("/", "÷");
}

function GetDisplaySign({
  operand,
  operator,
  index,
}: {
  operand: number | string;
  operator?: string | null;
  index: number;
}): string {
  const NumericOperand = Number(operand);
  const IsNegative = Number.isFinite(NumericOperand) && NumericOperand < 0;
  const NormalisedOperator = NormaliseOperator(operator);

  if (IsNegative || NormalisedOperator === "-") return "−";

  // MathPath Add/Less workbook convention:
  // addition is understood by default, so plus signs are intentionally hidden.
  if (NormalisedOperator === "+" || NormalisedOperator === "") return "";

  // Multiplication/division visual stacks still need their explicit operation sign.
  return index === 0 ? "" : NormalisedOperator;
}

function FormatStackValue(operand: number | string): string {
  const NumericOperand = Number(operand);

  if (!Number.isFinite(NumericOperand)) return String(operand);

  const AbsoluteValue = Math.abs(NumericOperand);
  if (Number.isInteger(AbsoluteValue)) return String(AbsoluteValue);

  return String(Number(AbsoluteValue.toFixed(8))).replace(/\.0+$/, "");
}

export function VerticalQuestion({
  operands,
  operators,
}: {
  operands: Array<number | string>;
  operators: string[];
}) {
  const DisplayOperands = operands.map((operand) => Number(operand));
  const HasDecimalOperand = DisplayOperands.some((operand) => Number.isFinite(operand) && !Number.isInteger(operand));
  const LongestOperandLength = operands.reduce<number>((length, operand) => Math.max(length, FormatStackValue(operand).length), 0);
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
        {operands.map((operand, index) => {
          const sign = GetDisplaySign({ operand, operator: operators[index], index });
          const value = FormatStackValue(operand);

          return (
            <div
              key={`${operand}-${index}`}
              className={`grid grid-cols-[2.35rem_${NumberColumnClass}] justify-end gap-3 text-right sm:grid-cols-[2.75rem_${NumberColumnClass}]`}
            >
              <span className="whitespace-nowrap text-right">{sign}</span>
              <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>

      <div className="my-2.5 border-t-[4px] border-slate-800 dark:border-slate-200" />

      <div className={`grid grid-cols-[2.35rem_${NumberColumnClass}] gap-3 text-right font-mono ${FontSizeClass} font-black text-blue-700 dark:text-cyan-300 sm:grid-cols-[2.75rem_${NumberColumnClass}]`}>
        <span></span>
        <span className="whitespace-nowrap text-right">?</span>
      </div>
    </div>
  );
}
