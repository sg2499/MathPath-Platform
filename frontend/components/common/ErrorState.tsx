import { AlertTriangle } from "lucide-react";

export function ErrorState({ title = "Something Went Wrong", message }: { title?: string; message: string }) {
  return (
    <div className="rounded-[28px] border p-5 shadow-sm backdrop-blur-2xl math-tone-danger">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-current/15 bg-white/55 shadow-sm dark:bg-white/10">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em]">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-6 opacity-90">{message}</p>
        </div>
      </div>
    </div>
  );
}
