import { formatSeconds } from "@/lib/utils";
import { Clock3 } from "lucide-react";

export function TestTimer({ remainingSeconds }: { remainingSeconds: number }) {
  const urgent = remainingSeconds <= 60;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-black shadow-sm ${urgent ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"}`}>
      <Clock3 size={16} />
      {formatSeconds(remainingSeconds)} Remaining
    </div>
  );
}
