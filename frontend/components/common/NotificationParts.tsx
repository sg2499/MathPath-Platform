"use client";

// Pieces shared by the bell and the full Notifications page (2026-10-13).
import type { NotificationRecord, NotificationTab, NotificationTabKey } from "@/lib/api/notifications";
import { getStoredUser } from "@/lib/auth";
import { IconFor, NormalizeTone, ToneClasses } from "@/components/common/notificationDisplay";

const IST = "Asia/Kolkata";
const DayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const DayLabelFormat = new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TimeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });

function DayKey(Value: Date) {
  return DayKeyFormat.format(Value);
}

export function GroupNotificationsByDay(Items: NotificationRecord[]) {
  const Now = new Date();
  const Today = DayKey(Now);
  const Yesterday = DayKey(new Date(Now.getTime() - 86400000));
  const Groups: { key: string; label: string; items: NotificationRecord[] }[] = [];
  Items.forEach((Item) => {
    const Created = Item.createdAt ? new Date(Item.createdAt) : null;
    const Key = Created && !Number.isNaN(Created.getTime()) ? DayKey(Created) : "unknown";
    const Label = Key === Today ? "Today" : Key === Yesterday ? "Yesterday" : Created && Key !== "unknown" ? DayLabelFormat.format(Created) : "Earlier";
    const Last = Groups[Groups.length - 1];
    if (Last && Last.key === Key) Last.items.push(Item);
    else Groups.push({ key: Key, label: Label, items: [Item] });
  });
  return Groups;
}

export function NotificationTime(Item: NotificationRecord) {
  if (!Item.createdAt) return "";
  const Created = new Date(Item.createdAt);
  return Number.isNaN(Created.getTime()) ? "" : TimeFormat.format(Created);
}

export function CountText(Value: number) {
  return Value.toLocaleString("en-IN");
}

export function NotificationTabBar({
  Tabs,
  Active,
  OnChange,
  Compact = false,
}: {
  Tabs: NotificationTab[];
  Active: NotificationTabKey;
  OnChange: (Key: NotificationTabKey) => void;
  Compact?: boolean;
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto ${Compact ? "pb-1" : "pb-2"} [scrollbar-width:thin]`} role="tablist" aria-label="Notification types">
      {Tabs.map((Tab) => {
        const IsActive = Tab.key === Active;
        const IsAction = Tab.key === "ACTION";
        return (
          <button
            key={Tab.key}
            type="button"
            role="tab"
            aria-selected={IsActive}
            onClick={() => OnChange(Tab.key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 ${Compact ? "py-1.5 text-xs" : "py-2 text-sm"} font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
              IsActive
                ? "border-slate-900 bg-slate-900 text-white shadow-md dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            }`}
          >
            {Tab.label}
            {Tab.unread ? (
              <span
                className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                  IsAction ? "bg-rose-500 text-white" : IsActive ? "bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white"
                }`}
                title={`${CountText(Tab.unread)} unread`}
              >
                {CountText(Tab.unread)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function NotificationListItem({
  Item,
  OnOpen,
  Compact = false,
}: {
  Item: NotificationRecord;
  OnOpen: (Item: NotificationRecord) => void;
  Compact?: boolean;
}) {
  const Tone = NormalizeTone(Item);
  return (
    <button
      type="button"
      onClick={() => OnOpen(Item)}
      className={`group relative w-full overflow-hidden rounded-[20px] border text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 ${Compact ? "p-3.5" : "p-4"} ${ToneClasses(Tone, Item.isRead)}`}
    >
      <div className="flex gap-3">
        <div className="mt-0.5 h-fit shrink-0 rounded-2xl border border-current/10 bg-white/60 p-2 shadow-sm dark:bg-white/10">{IconFor(Item)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={`font-black leading-5 ${Compact ? "text-sm" : ""}`}>{Item.title}</p>
            <span className="shrink-0 text-[11px] font-bold opacity-70">{NotificationTime(Item)}</span>
          </div>
          {Item.message ? <p className={`mt-1 font-semibold leading-6 opacity-85 ${Compact ? "line-clamp-2 text-[13px]" : "text-sm"}`}>{Item.message}</p> : null}
          {!Item.isRead || Item.needsAction ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!Item.isRead ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white">New</span>
              ) : null}
              {Item.needsAction ? (
                <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] dark:bg-white/10">Needs Action</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function RoleHome(Role: string) {
  if (Role === "ADMIN" || Role === "SUPER_ADMIN") return "admin";
  if (Role === "TEACHER") return "teacher";
  return "student";
}

export function NotificationsPagePath() {
  const User = getStoredUser();
  return `/${RoleHome(String(User?.role || ""))}/notifications`;
}
