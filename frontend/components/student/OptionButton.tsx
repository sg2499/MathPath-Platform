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
      className={`flex min-h-[60px] items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left transition duration-200 ${
        selected
          ? "border-orange-300 bg-orange-50 text-slate-950 shadow-lg shadow-orange-100/70 ring-2 ring-orange-400/35 dark:border-orange-400/70 dark:bg-orange-950/45 dark:text-white dark:ring-orange-300/35 dark:shadow-none"
          : "border-slate-200 bg-white/90 text-slate-800 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-orange-500/50 dark:hover:bg-slate-800/90"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black ${
          selected
            ? "bg-slate-950 text-white ring-2 ring-white/80 dark:bg-white dark:text-slate-950 dark:ring-orange-300"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
      >
        {option.label}
      </span>
      <span className="text-base font-bold">{option.value}</span>
    </button>
  );
}
