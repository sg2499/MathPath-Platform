"use client";

// The "Scheduled For" cell on the teacher's and admin's assessment trackers
// (2026-11-02, Shailesh). Shows the date and time the teacher set for the
// student. On the teacher's tracker, Change lets the teacher move it until
// the student starts; admin sees it read-only.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Pencil, X } from "lucide-react";
import { apiErrorMessage } from "@/lib/api";
import { teacherRescheduleAssessment } from "@/lib/api/teacher";
import {
  FormatAssessmentSchedule,
  FromIndiaDateTimeLocal,
  IndiaDateTimeLocalMin,
  ToIndiaDateTimeLocal,
} from "@/lib/assessmentSchedule";

type ScheduleRow = {
  assignmentId?: string | null;
  assessmentAssignmentId?: string | null;
  scheduledStartAt?: string | null;
  canReschedule?: boolean | null;
};

export function AssessmentScheduleCell({
  Row,
  Editable = false,
  InvalidateKeys = [],
}: {
  Row: ScheduleRow;
  Editable?: boolean;
  InvalidateKeys?: Array<readonly unknown[]>;
}) {
  const QueryClient = useQueryClient();
  const AssignmentId = String(Row.assignmentId || Row.assessmentAssignmentId || "");
  const [Editing, SetEditing] = useState(false);
  const [Value, SetValue] = useState("");
  // Where the panel opens: fixed to the screen, so the table (which clips
  // anything spilling out of it) never cuts it off.
  const [Anchor, SetAnchor] = useState<{ Top: number; Left: number } | null>(null);
  useEffect(() => {
    if (!Editing) return;
    const Close = () => SetEditing(false);
    window.addEventListener("resize", Close);
    window.addEventListener("scroll", Close, true);
    return () => {
      window.removeEventListener("resize", Close);
      window.removeEventListener("scroll", Close, true);
    };
  }, [Editing]);
  const Mutation = useMutation({
    mutationFn: (Iso: string) => teacherRescheduleAssessment(AssignmentId, Iso),
    onSuccess: () => {
      SetEditing(false);
      InvalidateKeys.forEach((Key) => QueryClient.invalidateQueries({ queryKey: Key as unknown[] }));
    },
  });
  const CanChange = Editable && Boolean(AssignmentId) && Boolean(Row.canReschedule);
  const Iso = FromIndiaDateTimeLocal(Value);

  const Current = (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
      <CalendarClock size={14} className="shrink-0 text-slate-400" />
      {Row.scheduledStartAt ? FormatAssessmentSchedule(Row.scheduledStartAt) : "Open anytime"}
    </span>
  );

  if (Editing) {
    // A small panel over the table, so the date and time field is never
    // squeezed into the column.
    return (
      <div className="relative min-w-0">
        {Current}
        <div
          className="fixed z-[80] flex w-[270px] flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-950"
          style={{ top: Anchor?.Top ?? 120, left: Anchor?.Left ?? 16 }}
          onClick={(Event) => Event.stopPropagation()}
        >
          <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">New date &amp; time (India time)</p>
          <input
            type="datetime-local"
            aria-label="New assessment date and time"
            className="math-input h-10 w-full px-2.5 py-1 text-sm"
            value={Value}
            min={IndiaDateTimeLocalMin()}
            onChange={(Event) => SetValue(Event.target.value)}
          />
          <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="math-button-primary px-2.5 py-1 text-[11px]"
            disabled={!Iso || Mutation.isPending}
            onClick={() => Iso && Mutation.mutate(Iso)}
          >
            <Check size={13} /> {Mutation.isPending ? "Saving..." : "Save"}
          </button>
          <button type="button" className="math-role-action-button px-2.5 py-1 text-[11px]" onClick={() => SetEditing(false)}>
            <X size={13} /> Cancel
          </button>
          </div>
          {Mutation.isError ? <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">{apiErrorMessage(Mutation.error)}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {Current}
      {CanChange ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-black text-[color:var(--mp-role-primary,#7c3aed)] hover:underline"
          onClick={(Event) => {
            Event.stopPropagation();
            const Rect = (Event.currentTarget as HTMLElement).getBoundingClientRect();
            const PanelHeight = 170;
            const Top = Rect.bottom + 8 + PanelHeight > window.innerHeight ? Math.max(8, Rect.top - PanelHeight - 8) : Rect.bottom + 8;
            SetAnchor({ Top, Left: Math.max(8, Math.min(Rect.left, window.innerWidth - 286)) });
            SetValue(ToIndiaDateTimeLocal(Row.scheduledStartAt));
            SetEditing(true);
          }}
        >
          <Pencil size={11} /> Change
        </button>
      ) : null}
    </div>
  );
}
