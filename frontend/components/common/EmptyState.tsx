import { Inbox } from "lucide-react";

export function EmptyState({ title = "Nothing To Show Yet", message, description }: { title?: string; message?: string; description?: string }) {
  return (
    <div className="math-panel math-empty-state text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center math-icon-shell-blue math-empty-orb">
        <Inbox size={22} />
      </div>
      <p className="math-empty-title mt-4 text-sm font-black uppercase tracking-[0.18em]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-base font-semibold leading-7 text-slate-600 dark:text-slate-300">{message || description}</p>
    </div>
  );
}
