"use client";

// 2026-10-09 (Payments Phase 5): a slim pill on the student dashboard while
// something is due. Hidden when fees are switched off or nothing is due.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";

import { getStudentFeesSummary } from "@/lib/api/fees";
import { FormatDate } from "@/lib/paymentsDates";


export function StudentFeesCard() {
  const Summary = useQuery({ queryKey: ["student-fees-summary"], queryFn: getStudentFeesSummary, staleTime: 60_000, retry: false });
  const Data = Summary.data;
  if (!Data?.enabled || Data.duePaise <= 0) return null;
  const Overdue = Data.overdueCount > 0;
  const When = Overdue
    ? `${Data.overdueCount} overdue`
    : Data.nextDueDate
      ? `due ${FormatDate(Data.nextDueDate)}`
      : `${Data.unpaidCount} unpaid`;
  // Sits under the dashboard title, so the one-screen dashboard keeps its
  // height.
  return (
    <Link
      href="/student/fees"
      className={`group mt-1 inline-flex w-fit max-w-full items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3 text-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 dark:focus-visible:ring-orange-900 ${
        Overdue
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/70 dark:bg-rose-950/40"
          : "border-orange-200 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30"
      }`}
      aria-label={`${Data.dueDisplay} to pay, ${When}. Open Fees.`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${Overdue ? "bg-rose-600 text-white" : "bg-orange-600 text-white"}`}>
        {Overdue ? <AlertTriangle size={15} /> : <Wallet size={15} />}
      </span>
      <span className="min-w-0 truncate font-bold text-slate-700 dark:text-slate-200">
        <span className="font-black tabular-nums text-slate-950 dark:text-white">{Data.dueDisplay}</span> to pay
        <span className={Overdue ? "text-rose-700 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}> · {When}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 font-black text-orange-700 dark:text-orange-300">
        {Data.onlinePaymentsLive ? "Pay now" : "View"}
        <ChevronRight size={16} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
