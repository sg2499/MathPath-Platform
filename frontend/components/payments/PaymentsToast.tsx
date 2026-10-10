"use client";

// 2026-10-09 (Payments revamp R6): a short confirmation after an action,
// with a link to what was made or an Undo, at the bottom of the screen.
// Gone after a few seconds (longer when there is something to click).

import { CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ToastInput = {
  text: string;
  href?: string;
  hrefLabel?: string;
  action?: { label: string; run: () => void };
  tone?: "success" | "info";
};

type Toast = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function usePaymentsToast() {
  return useContext(ToastContext);
}

export function PaymentsToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<number | null>(null);
  const counter = useRef(0);
  useEffect(() => setMounted(true), []);
  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast(null);
  }, []);
  const show = useCallback((input: ToastInput) => {
    if (timer.current) window.clearTimeout(timer.current);
    counter.current += 1;
    setToast({ ...input, id: counter.current });
    timer.current = window.setTimeout(() => setToast(null), input.href || input.action ? 7000 : 4000);
  }, []);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && toast
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[99996] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div key={toast.id} role="status" aria-live="polite" className="math-pop-in pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 flex-1">{toast.text}</span>
                {toast.href ? (
                  <Link href={toast.href} onClick={dismiss} className="shrink-0 font-black text-cyan-700 hover:underline dark:text-cyan-300">{toast.hrefLabel ?? "View"}</Link>
                ) : null}
                {toast.action ? (
                  <button type="button" onClick={() => { toast.action?.run(); dismiss(); }} className="shrink-0 font-black text-cyan-700 hover:underline dark:text-cyan-300">{toast.action.label}</button>
                ) : null}
                <button type="button" onClick={dismiss} className="math-focus-ring shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Dismiss">
                  <X size={15} />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
