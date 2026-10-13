"use client";

// The header bell (admin, teacher and student).
// 2026-10-13 revamp (Shailesh: only the latest few showed, everything was in
// one list, and 99+ unread could not be reached): tabs with their own unread
// counts, grouped by day, "Mark tab as read", and a link to the full history
// page. All counts come from the server, so the badge, the tabs and the
// history page always show the same numbers.
import {
  GetNotifications,
  MarkAllNotificationsRead,
  MarkNotificationRead,
  type NotificationRecord,
  type NotificationTab,
  type NotificationTabKey,
} from "@/lib/api/notifications";
import { getStoredUser } from "@/lib/auth";
import { BuildTargetUrl } from "@/components/common/notificationDisplay";
import {
  CountText,
  GroupNotificationsByDay,
  NotificationListItem,
  NotificationTabBar,
  NotificationsPagePath,
} from "@/components/common/NotificationParts";
import { ArrowRight, Bell, BellRing, CheckCheck, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { isPaperInProgress, onPaperInProgressChange } from "@/lib/paperFocus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PANEL_SIZE = 20;

export function NotificationsBell() {
  const Router = useRouter();
  const User = getStoredUser();
  const [Open, SetOpen] = useState(false);
  const [Tab, SetTab] = useState<NotificationTabKey>("ALL");
  const [Tabs, SetTabs] = useState<NotificationTab[]>([]);
  const [Items, SetItems] = useState<NotificationRecord[]>([]);
  const [TabTotal, SetTabTotal] = useState(0);
  const [UnreadCount, SetUnreadCount] = useState(0);
  const [Loading, SetLoading] = useState(false);
  const [ActionLoading, SetActionLoading] = useState(false);
  const PanelRef = useRef<HTMLDivElement | null>(null);
  const OpenRef = useRef(Open);
  const TabRef = useRef(Tab);
  const RequestRef = useRef(0);

  useEffect(() => {
    OpenRef.current = Open;
  }, [Open]);
  useEffect(() => {
    TabRef.current = Tab;
  }, [Tab]);

  // Counts only (the bell badge and the tab chips) while the panel is shut;
  // the list itself is fetched when the panel opens or the tab changes.
  const FetchCounts = useCallback(async () => {
    if (!User?.id) return;
    try {
      const Response = await GetNotifications({ limit: 1, includeTabs: true });
      SetUnreadCount(Response.unreadCount || 0);
      SetTabs(Response.tabs);
    } catch {
      // keep the last good numbers
    }
  }, [User?.id]);

  const FetchList = useCallback(
    async (NextTab: NotificationTabKey) => {
      if (!User?.id) return;
      const RequestId = ++RequestRef.current;
      SetLoading(true);
      try {
        const Response = await GetNotifications({ tab: NextTab, limit: PANEL_SIZE, offset: 0, includeTabs: true });
        if (RequestId !== RequestRef.current) return;
        SetItems(Response.items);
        SetTabTotal(Response.total);
        SetUnreadCount(Response.unreadCount || 0);
        SetTabs(Response.tabs);
      } catch {
        if (RequestId === RequestRef.current) SetItems([]);
      } finally {
        if (RequestId === RequestRef.current) SetLoading(false);
      }
    },
    [User?.id],
  );

  useEffect(() => {
    FetchCounts();
    const Interval = window.setInterval(() => {
      if (OpenRef.current) return;
      if (isPaperInProgress()) return;
      FetchCounts();
    }, 15000);

    function HandleFocus() {
      if (document.visibilityState === "hidden") return;
      if (OpenRef.current) return;
      if (isPaperInProgress()) return;
      FetchCounts();
    }

    const StopListeningForPaper = onPaperInProgressChange(() => {
      if (isPaperInProgress() || OpenRef.current) return;
      FetchCounts();
    });

    window.addEventListener("focus", HandleFocus);
    document.addEventListener("visibilitychange", HandleFocus);
    return () => {
      window.clearInterval(Interval);
      StopListeningForPaper();
      window.removeEventListener("focus", HandleFocus);
      document.removeEventListener("visibilitychange", HandleFocus);
    };
  }, [FetchCounts]);

  useEffect(() => {
    function HandleClick(Event: MouseEvent) {
      if (!PanelRef.current) return;
      if (!PanelRef.current.contains(Event.target as Node)) SetOpen(false);
    }
    function HandleKey(Event: KeyboardEvent) {
      if (Event.key === "Escape") SetOpen(false);
    }
    document.addEventListener("mousedown", HandleClick);
    document.addEventListener("keydown", HandleKey);
    return () => {
      document.removeEventListener("mousedown", HandleClick);
      document.removeEventListener("keydown", HandleKey);
    };
  }, []);

  function ChangeTab(NextTab: NotificationTabKey) {
    SetTab(NextTab);
    FetchList(NextTab);
  }

  async function HandleNotificationClick(Notification: NotificationRecord) {
    try {
      if (!Notification.isRead) await MarkNotificationRead(Notification.id);
    } catch {
      // still open it
    } finally {
      SetOpen(false);
      Router.push(BuildTargetUrl(Notification, User));
      FetchCounts();
    }
  }

  async function HandleMarkTabRead() {
    try {
      SetActionLoading(true);
      await MarkAllNotificationsRead(TabRef.current);
      await FetchList(TabRef.current);
    } finally {
      SetActionLoading(false);
    }
  }

  const ActiveTab = Tabs.find((Item) => Item.key === Tab);
  const Groups = useMemo(() => GroupNotificationsByDay(Items), [Items]);
  const BadgeText = UnreadCount > 99 ? "99+" : String(UnreadCount);

  return (
    <div className="relative" ref={PanelRef}>
      <button
        className="math-button-secondary math-focus-ring relative h-12 px-4"
        title={UnreadCount ? `${CountText(UnreadCount)} unread notifications` : "Open Notifications"}
        onClick={() => {
          const Next = !Open;
          SetOpen(Next);
          if (Next) FetchList(Tab);
        }}
        aria-label={UnreadCount ? `Notifications, ${UnreadCount} unread` : "Notifications"}
        aria-expanded={Open}
      >
        {UnreadCount ? <BellRing size={17} /> : <Bell size={17} />}
        {UnreadCount ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white shadow-lg">
            {BadgeText}
          </span>
        ) : null}
      </button>

      {Open ? (
        <div
          className="absolute right-0 top-14 z-[999] flex max-h-[min(680px,calc(100vh-110px))] w-[min(500px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white/95 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.3)] ring-1 ring-black/5 backdrop-blur-[32px] dark:border-white/20 dark:bg-slate-950/95 dark:ring-white/10"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="space-y-3 border-b border-black/5 bg-white/80 px-5 pb-3 pt-4 dark:border-white/10 dark:bg-slate-900/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">Notifications</h3>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {UnreadCount ? `${CountText(UnreadCount)} unread` : "All caught up"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {ActiveTab?.unread ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white"
                    onClick={HandleMarkTabRead}
                    disabled={ActionLoading}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCheck size={14} /> {Tab === "ALL" ? "Mark All Read" : "Mark Tab Read"}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:text-white"
                  onClick={() => SetOpen(false)}
                  title="Close Notifications"
                  aria-label="Close notifications"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <NotificationTabBar Tabs={Tabs} Active={Tab} OnChange={ChangeTab} Compact />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {Loading && !Items.length ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm font-bold text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Loading notifications...
              </div>
            ) : Groups.length ? (
              Groups.map((Group) => (
                <div key={Group.key} className="space-y-2">
                  <p className="px-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{Group.label}</p>
                  {Group.items.map((Item) => (
                    <NotificationListItem key={Item.id} Item={Item} OnOpen={HandleNotificationClick} Compact />
                  ))}
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/5">
                {Tab === "ACTION" ? "Nothing needs your action right now." : "No notifications here yet."}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-black/5 bg-white/80 px-5 py-3 text-xs font-bold text-slate-500 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-400">
            <span>
              {TabTotal > Items.length ? `Latest ${CountText(Items.length)} of ${CountText(TabTotal)}` : `${CountText(TabTotal)} in this tab`}
            </span>
            <button
              type="button"
              onClick={() => {
                SetOpen(false);
                Router.push(NotificationsPagePath());
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              View All Notifications <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
