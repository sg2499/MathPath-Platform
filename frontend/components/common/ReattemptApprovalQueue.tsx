"use client";

// 2026-10-13 (Shailesh: teachers had to open every student to find out
// whether a re-attempt needed admin approval). One list of every DPS that
// has used all its tries and is waiting for an admin, built from the same
// shared DPS state as the tracker cards, so the count on the tab, the card
// and this list are always the same number.
//  - Admin: approve one at a time, or tick several and approve together.
//  - Teacher: the same list, read-only, with a link to the student.
import { useMemo, useState } from "react";
import { CheckCheck, Hourglass, ShieldCheck } from "lucide-react";
import {
  AnyRow,
  Chip,
  CompactDpsLabel,
  CompactLessonLabel,
  NaturalCompare,
  StandardViewButton,
  accuracy,
  chainTriesText,
  chainTriesTone,
  completedText,
  levelCodeOf,
  moduleCodeOf,
  studentCodeOf,
  studentNameOf,
} from "@/components/common/DetailWorkspaceViews";

export function ApprovalKey(Row: AnyRow) {
  return `${ApprovalAssignmentId(Row)}::${ApprovalStudentId(Row)}`;
}

export function ApprovalAssignmentId(Row: AnyRow): string {
  return String(Row?.dpsChain?.awaitingApprovalAssignmentId || Row.parentAssignmentId || Row.assignmentId || "");
}

export function ApprovalStudentId(Row: AnyRow): string {
  return String(Row.studentId || Row.assignedToId || Row.targetStudentId || "");
}

function SortForQueue(First: AnyRow, Second: AnyRow) {
  return (
    NaturalCompare(levelCodeOf(First), levelCodeOf(Second)) ||
    NaturalCompare(CompactLessonLabel(First), CompactLessonLabel(Second)) ||
    NaturalCompare(CompactDpsLabel(First), CompactDpsLabel(Second)) ||
    NaturalCompare(studentNameOf(First), studentNameOf(Second))
  );
}

export function ReattemptApprovalQueue({
  Rows,
  Mode,
  OnOpenStudent,
  OnApprove,
  BusyKeys,
}: {
  Rows: AnyRow[];
  Mode: "admin" | "teacher";
  OnOpenStudent: (Row: AnyRow) => void;
  OnApprove?: (Rows: AnyRow[]) => void;
  BusyKeys?: Set<string>;
}) {
  const Sorted = useMemo(() => [...Rows].sort(SortForQueue), [Rows]);
  const [Selected, SetSelected] = useState<Set<string>>(new Set());
  // Ticks on rows that have left the list (approved, filtered out) simply
  // stop counting, because only visible rows are read.
  const SelectedRows = Sorted.filter((Row) => Selected.has(ApprovalKey(Row)));
  const AllSelected = Sorted.length > 0 && SelectedRows.length === Sorted.length;
  const IsAdmin = Mode === "admin" && Boolean(OnApprove);
  const Busy = (Row: AnyRow) => Boolean(BusyKeys?.has(ApprovalKey(Row)));
  const AnyBusy = Boolean(BusyKeys && BusyKeys.size);

  const Toggle = (Row: AnyRow) =>
    SetSelected((Current) => {
      const Next = new Set(Current);
      const Key = ApprovalKey(Row);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });

  const Columns = IsAdmin
    ? "grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_200px]"
    : "grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_120px]";

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
            <Hourglass size={18} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Awaiting Admin Approval</h2>
            <p className="text-sm font-semibold text-slate-500">
              {IsAdmin
                ? "These students have used every try they have on a DPS (3, plus any extra already approved). Approve to open the next re-attempt sheet."
                : "These students have used every try they have on a DPS (3, plus any extra already approved). The next re-attempt opens once an admin approves it."}
            </p>
          </div>
        </div>
        {IsAdmin && Sorted.length ? (
          <button
            type="button"
            className="math-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!SelectedRows.length || AnyBusy}
            onClick={() => OnApprove?.(SelectedRows)}
          >
            <CheckCheck size={16} />
            {SelectedRows.length ? `Approve Selected (${SelectedRows.length})` : "Approve Selected"}
          </button>
        ) : null}
      </div>

      {Sorted.length ? (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[860px] xl:min-w-0">
            <div className={`grid ${Columns} items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70`}>
              {IsAdmin ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-rose-600"
                  checked={AllSelected}
                  onChange={() => SetSelected(AllSelected ? new Set() : new Set(Sorted.map(ApprovalKey)))}
                  aria-label="Select all waiting re-attempts"
                />
              ) : null}
              <div>Student</div>
              <div>DPS</div>
              <div className="text-center">Last Try</div>
              <div className="text-center">Tries</div>
              <div>Waiting Since</div>
              <div className="text-right">{IsAdmin ? "Action" : "Review"}</div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Sorted.map((Row) => {
                const Key = ApprovalKey(Row);
                return (
                  <div key={Key} className={`grid ${Columns} items-center gap-3 px-5 py-4`}>
                    {IsAdmin ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rose-600"
                        checked={Selected.has(Key)}
                        onChange={() => Toggle(Row)}
                        aria-label={`Select ${studentNameOf(Row)} ${CompactDpsLabel(Row)}`}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-left text-sm font-black !text-slate-950 transition hover:!text-blue-700 dark:!text-white"
                        onClick={() => OnOpenStudent(Row)}
                      >
                        {studentNameOf(Row)}
                      </button>
                      <p className="mt-0.5 truncate text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">
                        {studentCodeOf(Row)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950 dark:text-white">
                        {CompactLessonLabel(Row)} · {CompactDpsLabel(Row)}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {moduleCodeOf(Row)} · {levelCodeOf(Row)}
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <Chip tone="red">{accuracy(Row)}%</Chip>
                    </div>
                    <div className="flex justify-center text-center">
                      <Chip tone={chainTriesTone(Row)}>{chainTriesText(Row)}</Chip>
                    </div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{completedText(Row)}</div>
                    <div className="flex justify-end">
                      {IsAdmin ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                          disabled={Busy(Row) || AnyBusy}
                          onClick={() => OnApprove?.([Row])}
                        >
                          <ShieldCheck size={14} />
                          {Busy(Row) ? "Approving..." : `Approve Re-Attempt ${Number(Row?.dpsChain?.step ?? 0) + 1}`}
                        </button>
                      ) : (
                        <StandardViewButton label="Review" tooltip="Open student practice review" onClick={() => OnOpenStudent(Row)} compact />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="m-5 rounded-[20px] bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          Nothing is waiting for approval right now.
        </p>
      )}
    </div>
  );
}
