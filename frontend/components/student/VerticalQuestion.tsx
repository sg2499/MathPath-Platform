export function VerticalQuestion({
  operands,
  operators,
}: {
  operands: number[];
  operators: string[];
}) {
  return (
    <div className="mx-auto w-fit rounded-[24px] bg-white px-5 py-5 text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-8 sm:py-6">
      <div className="font-mono text-[34px] font-black leading-tight sm:text-[46px]">
        {operands.map((operand, index) => {
          const sign = index === 0 ? "" : operand < 0 ? "−" : operators[index] || "+";
          const value = Math.abs(operand);

          return (
            <div
              key={`${operand}-${index}`}
              className="grid grid-cols-[1.9rem_4.1rem] justify-end gap-2 text-right sm:grid-cols-[2.35rem_5.1rem]"
            >
              <span>{sign}</span>
              <span>{value}</span>
            </div>
          );
        })}
      </div>

      <div className="my-2.5 border-t-[4px] border-slate-800 dark:border-slate-200" />

      <div className="grid grid-cols-[1.9rem_4.1rem] gap-2 text-right font-mono text-[34px] font-black text-blue-700 dark:text-cyan-300 sm:grid-cols-[2.35rem_5.1rem] sm:text-[46px]">
        <span></span>
        <span>?</span>
      </div>
    </div>
  );
}
