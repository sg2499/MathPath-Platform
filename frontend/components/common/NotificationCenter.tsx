"use client";

// 2026-10-13 (Shailesh: "the notification bell only shows the last 10-15
// notifications ... more than 99 items unread which cannot be viewed or kept
// track of"). The pieces the bell and the full Notifications page share:
// tabs with their own unread counts (from the server, so every number is the
// database's), items grouped by day, and the full history page with search,
// a date range, unread-only and paging through everything.
import {
  GetNotifications,
  MarkAllNotificationsRead,
  MarkNotificationRead,
  type NotificationRecord,
  type NotificationTab,
  type NotificationTabKey,
} from "@/lib/api/notifications";
import { getStoredUser } from "@/lib/auth";
import { AppShell } from "@/components/common/AppShell";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { BuildTargetUrl } from "@/components/common/notificationDisplay";
import { CountText, GroupNotificationsByDay, NotificationListItem, NotificationTabBar } from "@/components/common/NotificationParts";
import { BellRing, CheckCheck, Inbox, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 30;

export function NotificationCenterPage({ Roles }: { Roles: ("ADMIN" | "SUPER_ADMIN" | "TEACHER" | "STUDENT")[] }) {
  const Ready = useProtectedPage(Roles);
  const Router = useRouter();
  const User = getStoredUser();
  const [Tab, SetTab] = useState<NotificationTabKey>("ALL");
  const [Tabs, SetTabs] = useState<NotificationTab[]>([]);
  const [Items, SetItems] = useState<NotificationRecord[]>([]);
  const [Total, SetTotal] = useState(0);
  const [HasMore, SetHasMore] = useState(false);
  const [UnreadOnly, SetUnreadOnly] = useState(false);
  const [SearchInput, SetSearchInput] = useState("");
  const [SearchTerm, SetSearchTerm] = useState("");
  const [DateFrom, SetDateFrom] = useState("");
  const [DateTo, SetDateTo] = useState("");
  const [Loading, SetLoading] = useState(false);
  const [LoadError, SetLoadError] = useState("");
  const [Marking, SetMarking] = useState(false);
  const RequestRef = useRef(0);
  const SentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Timer = window.setTimeout(() => SetSearchTerm(SearchInput.trim()), 350);
    return () => window.clearTimeout(Timer);
  }, [SearchInput]);

  const Load = useCallback(
    async (Offset: number) => {
      const RequestId = ++RequestRef.current;
      SetLoading(true);
      SetLoadError("");
      try {
        const Response = await GetNotifications({
          tab: Tab,
          unreadOnly: UnreadOnly,
          q: SearchTerm,
          dateFrom: DateFrom,
          dateTo: DateTo,
          limit: PAGE_SIZE,
          offset: Offset,
          includeTabs: true,
        });
        if (RequestId !== RequestRef.current) return;
        SetTabs(Response.tabs);
        SetTotal(Response.total);
        SetHasMore(Response.hasMore);
        SetItems((Current) => (Offset === 0 ? Response.items : [...Current, ...Response.items.filter((Item) => !Current.some((Existing) => Existing.id === Item.id))]));
      } catch {
        if (RequestId === RequestRef.current) SetLoadError("Notifications could not be loaded. Check your connection and try again.");
      } finally {
        if (RequestId === RequestRef.current) SetLoading(false);
      }
    },
    [Tab, UnreadOnly, SearchTerm, DateFrom, DateTo],
  );

  useEffect(() => {
    if (!Ready || !User?.id) return;
    Load(0);
  }, [Ready, User?.id, Load]);

  // Older notifications load as you scroll.
  useEffect(() => {
    const Node = SentinelRef.current;
    if (!Node || !HasMore) return;
    const Observer = new IntersectionObserver((Entries) => {
      if (Entries.some((Entry) => Entry.isIntersecting) && !Loading) Load(Items.length);
    }, { rootMargin: "400px" });
    Observer.observe(Node);
    return () => Observer.disconnect();
  }, [HasMore, Loading, Items.length, Load]);

  const ActiveTab = Tabs.find((Item) => Item.key === Tab);
  const Groups = useMemo(() => GroupNotificationsByDay(Items), [Items]);
  const Filtered = Boolean(SearchTerm || DateFrom || DateTo || UnreadOnly);

  async function Open(Item: NotificationRecord) {
    if (!Item.isRead) {
      try {
        await MarkNotificationRead(Item.id);
      } catch {
        // still open it
      }
    }
    Router.push(BuildTargetUrl(Item, User));
  }

  async function MarkTabRead() {
    SetMarking(true);
    try {
      await MarkAllNotificationsRead(Tab);
      await Load(0);
    } finally {
      SetMarking(false);
    }
  }

  function ClearFilters() {
    SetSearchInput("");
    SetSearchTerm("");
    SetDateFrom("");
    SetDateTo("");
    SetUnreadOnly(false);
  }

  if (!Ready) return null;

  return (
    <AppShell title="Notifications">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-block-header">
              <BellRing size={14} /> Notifications
            </p>
            <h1 className="math-title">All Notifications</h1>
            <p className="math-subtitle">Every update, sorted into tabs. Nothing is cut off: scroll to reach older ones.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Unread</p>
              <p className="text-2xl font-black text-slate-950 dark:text-white">{CountText(Tabs.find((Item) => Item.key === "ALL")?.unread ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Total</p>
              <p className="text-2xl font-black text-slate-950 dark:text-white">{CountText(Tabs.find((Item) => Item.key === "ALL")?.total ?? 0)}</p>
            </div>
          </div>
        </div>

        <div className="math-operation-panel space-y-4">
          <NotificationTabBar Tabs={Tabs} Active={Tab} OnChange={SetTab} />
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px_auto_auto]">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="math-input pl-11"
                value={SearchInput}
                onChange={(Event) => SetSearchInput(Event.target.value)}
                placeholder="Search notifications"
                aria-label="Search notifications"
              />
            </div>
            <input className="math-input" type="date" value={DateFrom} max={DateTo || undefined} onChange={(Event) => SetDateFrom(Event.target.value)} aria-label="From date" title="From date" />
            <input className="math-input" type="date" value={DateTo} min={DateFrom || undefined} onChange={(Event) => SetDateTo(Event.target.value)} aria-label="To date" title="To date" />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={UnreadOnly} onChange={(Event) => SetUnreadOnly(Event.target.checked)} />
              Unread Only
            </label>
            <button
              type="button"
              className="math-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={MarkTabRead}
              disabled={Marking || !ActiveTab?.unread}
            >
              <CheckCheck size={15} /> {Tab === "ALL" ? "Mark All Read" : "Mark Tab Read"}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-500">
            <span>
              {Filtered
                ? `${CountText(Total)} matching notification${Total === 1 ? "" : "s"}`
                : `${CountText(ActiveTab?.total ?? Total)} notification${(ActiveTab?.total ?? Total) === 1 ? "" : "s"}, ${CountText(ActiveTab?.unread ?? 0)} unread`}
            </span>
            {Filtered ? (
              <button type="button" onClick={ClearFilters} className="inline-flex items-center gap-1 font-black text-slate-700 hover:text-slate-950 dark:text-slate-200">
                <X size={14} /> Clear Filters
              </button>
            ) : null}
          </div>
        </div>

        {LoadError ? <p className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{LoadError}</p> : null}

        {!Items.length && !Loading && !LoadError ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] border border-slate-200 bg-white p-10 text-center dark:border-white/10 dark:bg-white/5">
            <Inbox size={28} className="text-slate-400" />
            <p className="text-lg font-black text-slate-900 dark:text-white">{Filtered ? "No notifications match these filters." : "Nothing here yet."}</p>
            {Filtered ? <button type="button" onClick={ClearFilters} className="math-button-secondary px-4 py-2 text-sm">Clear Filters</button> : null}
          </div>
        ) : null}

        <div className="space-y-6">
          {Groups.map((Group) => (
            <div key={Group.key} className="space-y-3">
              <h2 className="sticky top-[calc(env(safe-area-inset-top,0px)+72px)] z-10 w-fit rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600 backdrop-blur dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-300">
                {Group.label}
              </h2>
              <div className="grid gap-3">
                {Group.items.map((Item) => (
                  <NotificationListItem key={Item.id} Item={Item} OnOpen={Open} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div ref={SentinelRef} className="flex justify-center py-4">
          {Loading ? (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading notifications...
            </span>
          ) : HasMore ? (
            <button type="button" onClick={() => Load(Items.length)} className="math-button-secondary px-4 py-2 text-sm">
              Load Older Notifications
            </button>
          ) : Items.length ? (
            <span className="text-sm font-bold text-slate-400">You have reached the oldest notification.</span>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
