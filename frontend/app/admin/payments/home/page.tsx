"use client";

// 2026-10-09 (Payments revamp R1): Payments Home, the office's daily desk.
// Today's money, what is due, what needs someone to look, quick actions and
// the latest payments. Student names open the side panel; ⌘K searches.

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  FilePlus2,
  HandCoins,
  Link2,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PaymentStatusChip } from "@/components/payments/PaymentDetail";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { PaymentsChrome } from "@/components/payments/PaymentsSection";
import { useQuickPay } from "@/components/payments/QuickPay";
import { OnlineStatusChip } from "@/components/payments/panels/OnlinePaymentsPanel";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getPaymentsHome, type PaymentsHome } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";

function Greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function LongDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Stat({ label, value, sub, icon, tone, href }: { label: string; value: string; sub: ReactNode; icon: ReactNode; tone: "emerald" | "cyan" | "amber" | "rose"; href: string }) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  }[tone];
  return (
    <Link href={href} className="group flex h-full min-w-0 flex-col gap-2 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:gap-3 sm:p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-black leading-tight text-slate-600 dark:text-slate-300">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>{icon}</span>
      </div>
      <p className="truncate text-xl font-black leading-none tabular-nums text-slate-950 dark:text-white sm:text-[1.7rem]">{value}</p>
      <div className="min-h-[1.25rem] text-xs font-bold text-slate-500 dark:text-slate-400">{sub}</div>
    </Link>
  );
}

function Card({ title, action, children, icon }: { title: string; action?: ReactNode; children: ReactNode; icon: ReactNode }) {
  return (
    <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">{icon}{title}</h2>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function HomeBody({ data }: { data: PaymentsHome }) {
  const quickPay = useQuickPay();
  const close = data.dayClose;
  const pendingDays = close.pendingDays;
  const attentionCount = data.attention.online.length + data.attention.setup.length + (data.attention.failedToday ? 1 : 0) + pendingDays.length;
  const monthUp = data.lastMonthCollected.paise > 0 ? Math.round(((data.thisMonthCollected.paise - data.lastMonthCollected.paise) / data.lastMonthCollected.paise) * 100) : null;
  const todayClosed = close.todayState === "CLOSED" && !close.todayChangedAfterClose;
  const dayLine = close.todayState === "CLOSED"
    ? close.todayChangedAfterClose ? "Today was closed, then payments changed." : "Today is closed."
    : `${close.expectedCash.display} cash expected in hand.`;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><Wallet size={14} />Payments</p>
            <h1 className="math-title">{Greeting()}</h1>
            <p className="math-subtitle">{LongDate(data.today)}. {data.todayPaymentCount ? `${data.todayPaymentCount} payment${data.todayPaymentCount === 1 ? "" : "s"} so far today.` : "No payments yet today."} {dayLine}</p>
            <HeroSearch />
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {quickPay ? (
              <button type="button" onClick={() => quickPay.open()} className="math-button-primary whitespace-nowrap"><HandCoins size={17} />Record Payment</button>
            ) : (
              <Link href="/admin/payments/collections?tab=student-fees" className="math-button-primary whitespace-nowrap"><HandCoins size={17} />Record Payment</Link>
            )}
            <Link href="/admin/payments/invoices?tab=generate" className="math-button-secondary whitespace-nowrap"><FilePlus2 size={17} />Generate Invoices</Link>
            <Link href="/admin/payments/collections?tab=day-close" className="math-button-secondary whitespace-nowrap">
              {todayClosed ? <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400" /> : <CalendarCheck size={17} />}{todayClosed ? "Day closed" : "Close the day"}
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Collected today"
          value={data.todayCollected.display}
          icon={<HandCoins size={17} />}
          tone="emerald"
          href="/admin/payments/reports?tab=collections"
          sub={data.todayByMethod.length ? data.todayByMethod.map((row) => `${row.methodLabel} ${row.display}`).join(" · ") : "Nothing yet"}
        />
        <Stat
          label={data.thisMonthLabel}
          value={data.thisMonthCollected.display}
          icon={<TrendingUp size={17} />}
          tone="cyan"
          href="/admin/payments/reports?tab=overview"
          sub={<>{data.lastMonthLabel}: {data.lastMonthCollected.display}{monthUp !== null ? <span className={monthUp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}> ({monthUp >= 0 ? "+" : ""}{monthUp}% so far)</span> : null}</>}
        />
        <Stat
          label="Due"
          value={data.due.display}
          icon={<Wallet size={17} />}
          tone="amber"
          href="/admin/payments/reports?tab=dues"
          sub={<>{data.studentsWithDues} student{data.studentsWithDues === 1 ? "" : "s"} · {data.unpaidInvoices} invoice{data.unpaidInvoices === 1 ? "" : "s"}<span className="block text-violet-700 dark:text-violet-300">Advance held {data.advanceHeld.display}</span></>}
        />
        <Stat
          label="Overdue"
          value={data.overdue.display}
          icon={<AlertTriangle size={17} />}
          tone="rose"
          href="/admin/payments/reports?tab=dues"
          sub={data.studentsOverdue ? `${data.studentsOverdue} student${data.studentsOverdue === 1 ? "" : "s"} past the due date` : "Nobody is overdue"}
        />
      </div>

      {/* Two equal columns, rows line up: attention | overdue, then latest | online. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card
            title="Needs attention"
            icon={attentionCount ? <AlertTriangle size={18} className="text-amber-600" /> : <CheckCircle2 size={18} className="text-emerald-600" />}
          >
            {attentionCount === 0 ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">All clear: earlier days are closed, no online payments are waiting, and nothing needs setting up.</p>
            ) : (
              <ul className="grid gap-2">
                {pendingDays.map((day) => (
                  <li key={day.date}>
                    <Link href={`/admin/payments/collections?tab=day-close&date=${day.date}`} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-bold text-amber-900 transition hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <CalendarCheck size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1">{FormatDate(day.date)} {day.changedAfterClose ? "changed after it was closed. Check and close it again." : `was not closed (${day.total.display} taken).`}</span>
                      <ArrowRight size={15} className="shrink-0" />
                    </Link>
                  </li>
                ))}
                {data.attention.setup.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-bold text-amber-900 transition hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <AlertTriangle size={16} className="shrink-0" /><span className="min-w-0 flex-1">{item.text}</span><ArrowRight size={15} className="shrink-0" />
                    </Link>
                  </li>
                ))}
                {data.attention.online.map((order) => (
                  <li key={order.orderRef}>
                    <Link href={`/admin/payments/collections?tab=online&order=${encodeURIComponent(order.orderRef)}`} className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm transition hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/25">
                      <CreditCard size={16} className="shrink-0 text-rose-600 dark:text-rose-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-slate-900 dark:text-white">{order.studentName} · {order.amountDisplay} online</span>
                        <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{order.status === "ATTENTION" ? order.lastError ?? "Money received, not recorded yet" : "Razorpay has the payment; still confirming"}</span>
                      </span>
                      <OnlineStatusChip status={order.status} label={order.statusLabel} />
                    </Link>
                  </li>
                ))}
                {data.attention.failedToday ? (
                  <li>
                    <Link href="/admin/payments/collections?tab=online" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                      <CreditCard size={16} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1">{data.attention.failedToday} online payment{data.attention.failedToday === 1 ? "" : "s"} failed today (nothing was recorded)</span><ArrowRight size={15} className="shrink-0" />
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </Card>

          <Card title="Biggest overdue" icon={<Wallet size={18} className="text-rose-600 dark:text-rose-400" />} action={<Link href="/admin/payments/reports?tab=dues" className="inline-flex items-center gap-1 text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">All dues<ArrowRight size={14} /></Link>}>
            {data.attention.overdueStudents.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.attention.overdueStudents.map((row) => (
                  <li key={row.studentId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <StudentLink studentId={row.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                      <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{[row.studentCode, row.mobile, `${row.maxDaysOverdue} day${row.maxDaysOverdue === 1 ? "" : "s"} overdue`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-black tabular-nums text-rose-700 dark:text-rose-300">{row.overdue.display}</span>
                      {row.due.paise !== row.overdue.paise ? <span className="block text-xs font-semibold tabular-nums text-slate-500">{row.due.display} due</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="grid h-full min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">Nobody is past their due date.</p>
            )}
          </Card>

          <Card title="Latest payments" icon={<ReceiptText size={18} className="text-emerald-600 dark:text-emerald-400" />} action={<Link href="/admin/payments/collections?tab=payments" className="inline-flex items-center gap-1 text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">All payments<ArrowRight size={14} /></Link>}>
            {data.recentPayments.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentPayments.map((payment) => (
                  <li key={payment.paymentId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <StudentLink studentId={payment.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{payment.studentName}</StudentLink>
                      <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.receiptNumber} · {FormatDate(payment.paymentDate)} · {payment.methodSummary}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-black tabular-nums text-slate-950 dark:text-white">{payment.amountDisplay}</span>
                      {payment.status === "CANCELLED" ? <PaymentStatusChip payment={payment} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="grid h-full min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">No payments yet. Record one from Student Fees.</p>
            )}
          </Card>

          <Card
            title="Online payments"
            icon={<CreditCard size={18} className="text-cyan-600 dark:text-cyan-400" />}
            action={<Link href="/admin/payments/collections?tab=online" className="inline-flex items-center gap-1 text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">Log<ArrowRight size={14} /></Link>}
          >
            <p className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${data.online.live ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} aria-hidden />
              {data.online.live ? `Taking payments online${data.online.keyMode === "TEST" ? " (Razorpay test mode)" : ""}` : data.online.enabled ? "Switched on but not working" : "Online payments are off"}
              <Link href="/admin/payments/settings?tab=online" className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-cyan-700 hover:underline dark:text-cyan-300"><Link2 size={12} />Settings</Link>
            </p>
            {data.online.recent.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.online.recent.map((order) => (
                  <li key={order.orderRef}>
                    <Link href={`/admin/payments/collections?tab=online&order=${encodeURIComponent(order.orderRef)}`} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-black text-slate-900 dark:text-white">{order.studentName}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{order.sourceLabel}{order.receiptNumber ? ` · ${order.receiptNumber}` : ""}</span>
                      </span>
                      <span className="shrink-0 font-black tabular-nums text-slate-950 dark:text-white">{order.amountDisplay}</span>
                      <OnlineStatusChip status={order.status} label={order.statusLabel} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="grid h-full min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">No online payments yet.</p>
            )}
          </Card>

      </div>
    </>
  );
}

function HomeInner() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const query = useQuery({ queryKey: ["admin", "payments", "home"], queryFn: getPaymentsHome, enabled: ready, refetchInterval: 60_000 });
  if (!ready) return null;
  return (
    <PaymentsChrome>
      {query.isLoading ? <LoadingState label="Loading payments…" /> : query.error || !query.data ? <ErrorState message="Payments Home could not be loaded. Refresh the page to try again." /> : <HomeBody data={query.data} />}
    </PaymentsChrome>
  );
}

export default function PaymentsHomePage() {
  return (
    <AppShell title="Payments">
      <Suspense fallback={<LoadingState label="Loading payments…" />}>
        <HomeInner />
      </Suspense>
    </AppShell>
  );
}
