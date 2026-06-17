import { formatSeconds } from "@/lib/utils";
import { Clock3 } from "lucide-react";

export function TestTimer({ remainingSeconds, className = "" }: { remainingSeconds: number; className?: string }) {
  const urgent = remainingSeconds <= 300;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-black shadow-sm ${
        urgent
          ? "math-timer-critical bg-rose-600 text-white ring-2 ring-rose-200 shadow-rose-500/30"
          : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
      } ${className}`}
      aria-live={urgent ? "assertive" : "polite"}
    >
      <Clock3 size={16} />
      {formatSeconds(remainingSeconds)} Remaining
    </div>
  );
}
