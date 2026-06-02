export function VerticalQuestion({
  operands,
  operators,
}: {
  operands: number[];
  operators: string[];
}) {
  const DisplayOperands = operands.map((operand) => Number(operand));
  const HasDecimalOperand = DisplayOperands.some((operand) => Number.isFinite(operand) && !Number.isInteger(operand));
  const NumberColumnClass = HasDecimalOperand
    ? "minmax(8.5rem,max-content) sm:minmax(10rem,max-content)"
    : "minmax(5.6rem,max-content) sm:minmax(6.8rem,max-content)";
  const FontSizeClass = HasDecimalOperand
    ? "text-[28px] sm:text-[36px]"
    : "text-[34px] sm:text-[46px]";

  return (
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-[24px] bg-white px-5 py-5 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8 sm:py-6">
      <div className={`font-mono ${FontSizeClass} font-black leading-tight`}>
        {operands.map((operand, index) => {
          const NumericOperand = Number(operand);
          const IsNegative = Number.isFinite(NumericOperand) && NumericOperand < 0;
          const sign = index === 0 ? "" : IsNegative ? "−" : operators[index] || "+";
          const value = Number.isFinite(NumericOperand) ? Math.abs(NumericOperand) : operand;

          return (
            <div
              key={`${operand}-${index}`}
              className={`grid grid-cols-[2.35rem_${NumberColumnClass}] justify-end gap-3 text-right sm:grid-cols-[2.75rem_${NumberColumnClass}]`}
            >
              <span className="whitespace-nowrap">{sign}</span>
              <span className="whitespace-nowrap tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>

      <div className="my-2.5 border-t-[4px] border-slate-800 dark:border-slate-200" />

      <div className={`grid grid-cols-[2.35rem_${NumberColumnClass}] gap-3 text-right font-mono ${FontSizeClass} font-black text-blue-700 dark:text-cyan-300 sm:grid-cols-[2.75rem_${NumberColumnClass}]`}>
        <span></span>
        <span className="whitespace-nowrap">?</span>
      </div>
    </div>
  );
}
