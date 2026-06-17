import { formatSeconds } from "@/lib/utils";
import { Clock3 } from "lucide-react";

export function TestTimer({ remainingSeconds, className = "" }: { remainingSeconds: number; className?: string }) {
  const urgent = remainingSeconds <= 300;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-black shadow-sm ${
        urgent
          ? "math-timer-critical bg-rose-600 text-white ring-2 ring-rose-200 shadow-rose-500/30 [&_svg]:text-white [&_svg]:opacity-100"
          : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
      } ${className}`}
      aria-live={urgent ? "assertive" : "polite"}
    >
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          urgent ? "bg-white/20 text-white" : "bg-white/80 text-blue-700"
        }`}
      >
        <Clock3 size={14} className={urgent ? "text-white" : "text-blue-700"} strokeWidth={2.5} />
      </span>
      {formatSeconds(remainingSeconds)} Remaining
    </div>
  );
}
