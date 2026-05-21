"use client";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="math-dialog-overlay">
      <div className="math-panel w-full max-w-md p-6 math-pop-in">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-300">Confirm Action</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="math-button-secondary math-focus-ring" onClick={onCancel}>Cancel</button>
          <button type="button" className="math-button-primary math-focus-ring" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
