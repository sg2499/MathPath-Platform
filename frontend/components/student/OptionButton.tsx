import type { McqOption } from "@/types/question";

export function OptionButton({
  option,
  selected,
  disabled,
  onClick,
}: {
  option: McqOption;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[56px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition duration-200 ${
        selected
          ? "border-blue-300 bg-blue-50 text-blue-900 shadow-lg shadow-blue-100/70 dark:border-cyan-500/50 dark:bg-cyan-950/40 dark:text-cyan-100 dark:shadow-none"
          : "border-slate-200 bg-white/90 text-slate-800 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800/90"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black ${
          selected
            ? "bg-blue-600 text-white dark:bg-cyan-500 dark:text-slate-950"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
      >
        {option.label}
      </span>
      <span className="text-base font-bold">{option.value}</span>
    </button>
  );
}
