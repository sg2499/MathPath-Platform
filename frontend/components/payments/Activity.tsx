"use client";

// 2026-10-09 (Payments revamp R6): one line of the activity feed -- who did
// what and when, with a link to it. Used on Home (the latest few) and in
// Reports > Activity (everything, by day).

import { Ban, CalendarCheck, FileText, HandCoins, Link2, Receipt, Settings2, ShieldAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { ActivityIcon, ActivityItem } from "@/lib/api/payments";

const ICONS: Record<ActivityIcon, { icon: LucideIcon; tone: string }> = {
  payment: { icon: HandCoins, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  invoice: { icon: FileText, tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" },
  expense: { icon: Receipt, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  cancel: { icon: Ban, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  dayclose: { icon: CalendarCheck, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  link: { icon: Link2, tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  insight: { icon: ShieldAlert, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  settings: { icon: Settings2, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const IndiaTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const IndiaDayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const IndiaKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" });
const IndiaLong = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function ActivityTime(iso: string | null, withDay: boolean): string {
  if (!iso) return "";
  const when = new Date(iso);
  const time = IndiaTime.format(when).replace(/\s?([ap])\.?m\.?/i, (_, half: string) => ` ${half.toLowerCase()}m`);
  return withDay ? `${IndiaDayMonth.format(when)}, ${time}` : time;
}

/** "2026-10-09" in India for an ISO time. */
export function ActivityDayKey(iso: string | null): string {
  return iso ? IndiaKey.format(new Date(iso)) : "";
}

export function ActivityDayLabel(key: string): string {
  if (!key) return "";
  const today = IndiaKey.format(new Date());
  const yesterday = IndiaKey.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return IndiaLong.format(new Date(Date.UTC(year, month - 1, day, 6, 30)));
}

export function ActivityRow({ item, withDay = false }: { item: ActivityItem; withDay?: boolean }) {
  const { icon: Icon, tone } = ICONS[item.icon] ?? ICONS.settings;
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug text-slate-900 dark:text-white">{item.text}</span>
        <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
          {item.actorName} · {ActivityTime(item.at, withDay)}
          {item.reason ? <span className="text-slate-600 dark:text-slate-300"> · “{item.reason}”</span> : null}
        </span>
      </span>
    </>
  );
  return item.href ? (
    <Link href={item.href} className="flex items-start gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-slate-100/70 dark:hover:bg-slate-900/60">{body}</Link>
  ) : (
    <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
  );
}
