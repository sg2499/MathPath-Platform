"use client";

/* 2026-10-18 (Rewards, Part 3): Users › Rewards for admins.
   Plan: `claude/mathpath-rewards-plan-oct18.md`.

   To Prepare (with the shopping list), Hand Over (by pickup code or name),
   History (with an Excel export), the Catalogue (add rewards, photos, price,
   stock, order, on and off) and every student's coins. Admin lists follow the
   Show Demo switch; the shopping list and the tiles count real students only.
   Styles: the "rewards" block in app/admin/admin-elevate.css. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Coins,
  Download,
  Gift,
  HandCoins,
  History,
  ImagePlus,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Power,
  Search,
  ShoppingBag,
  Ticket,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { PaymentsDialog } from "@/components/payments/PaymentsUi";
import { apiErrorMessage } from "@/lib/api";
import { saveBlob } from "@/lib/api/payments";
import {
  createRewardItem,
  downloadRewardOrders,
  findRewardCode,
  getAdminRewardItems,
  getAdminRewardOrders,
  getCoinStudents,
  getRewardSummary,
  getShoppingList,
  getStudentCoinHistory,
  markRewardCollected,
  markRewardsReady,
  rejectReward,
  reorderRewardItems,
  updateRewardItem,
  uploadRewardPhoto,
  type AdminRewardItem,
  type AdminRewardOrder,
  type CoinEntry,
  type CoinStudent,
  type OrderFilters,
  type RewardOrder,
  type RewardPerson,
  type RewardStatus,
  rewardPhotoSrc,
} from "@/lib/api/rewards";
import { Plural } from "@/lib/plural";

type Tab = "prepare" | "handover" | "history" | "catalogue" | "coins";
const TABS: Tab[] = ["prepare", "handover", "history", "catalogue", "coins"];
const KEY = ["admin", "rewards"] as const;
const Coins_ = (Value: number) => Math.round(Value).toLocaleString("en-IN");

function IndiaTime(Iso: string | null, WithTime = true) {
  if (!Iso) return "";
  return new Date(Iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", ...(WithTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

// ---------- small pieces -------------------------------------------------------------

function Coin({ size = 16 }: { size?: number }) {
  return <span className="ad-rw-coin" style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.5)) }} aria-hidden="true"><span>M</span></span>;
}

function Thumb({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  const Src = rewardPhotoSrc(url);
  const [Broken, SetBroken] = useState(false);
  return (
    <span className="ad-rw-thumb" style={{ width: size, height: size }}>
      {Src && !Broken ? <img src={Src} alt="" width={size} height={size} loading="lazy" onError={() => SetBroken(true)} /> : <Gift size={Math.round(size * 0.45)} aria-hidden="true" />}
      <span className="sr-only">{name}</span>
    </span>
  );
}

function Person({ person }: { person: RewardPerson | null }) {
  if (!person) return <span className="text-slate-500">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProfileAvatar name={person.name} imageUrl={person.photoUrl} role="STUDENT" className="h-10 w-10 text-xs" />
      <span className="min-w-0">
        <span className="ad-rw-name block truncate">{person.name}</span>
        <span className="ad-rw-sub">{person.studentCode}{person.levelCode ? ` · ${person.levelCode}` : ""}{person.isDemo ? " · Demo" : ""}{!person.isActive ? " · Inactive" : ""}</span>
      </span>
    </span>
  );
}

const STATUS_TEXT: Record<RewardStatus, string> = { UNLOCKED: "To Prepare", READY: "Ready", COLLECTED: "Collected", CANCELLED: "Cancelled", REJECTED: "Rejected" };

function StatusChip({ status }: { status: RewardStatus }) {
  return <span className={`ad-rw-chip is-${status.toLowerCase()}`}>{STATUS_TEXT[status]}</span>;
}

function Metric({ label, value, icon, onClick }: { label: string; value: number | string; icon: ReactNode; onClick?: () => void }) {
  const Body = (
    <>
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="math-teacher-light-metric-card ad-bday-tile relative overflow-hidden rounded-[22px] border p-4 text-left">{Body}</button>
  ) : (
    <div className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-4">{Body}</div>
  );
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="ad-rw-empty">
      <span className="ad-rw-empty-icon">{icon}</span>
      <p className="ad-rw-empty-title">{title}</p>
      <p>{text}</p>
    </div>
  );
}

function SectionHead({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="mp-headbar ad-rw-head">
      <h2 className="mp-headbar-head ad-rw-h2">{title}</h2>
      <p className="mp-headbar-desc ad-rw-desc">{description}</p>
      {action ? <div className="mp-headbar-act flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

function useInvalidate() {
  const Client = useQueryClient();
  return () => Client.invalidateQueries({ queryKey: KEY });
}

// ---------- reject with a reason -----------------------------------------------------------

const QUICK_REASONS = ["Out of stock at the shop this week", "This reward is no longer available", "Unlocked by mistake, coins returned"];

function RejectDialog({ order, onClose }: { order: AdminRewardOrder | RewardOrder | null; onClose: () => void }) {
  const Invalidate = useInvalidate();
  const [Reason, SetReason] = useState("");
  const [Error, SetError] = useState<string | null>(null);
  const Reject = useMutation({
    mutationFn: () => rejectReward(order!.id, Reason),
    onSuccess: () => { Invalidate(); onClose(); },
    onError: (Problem) => SetError(apiErrorMessage(Problem)),
  });
  useEffect(() => { SetReason(""); SetError(null); }, [order?.id]);
  if (!order) return null;
  return (
    <PaymentsDialog
      open
      title="Reject This Reward"
      kicker={order.itemName}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="math-button-secondary" onClick={onClose}>Keep It</button>
          <button type="button" className="math-button-primary ad-rw-danger" onClick={() => Reject.mutate()} disabled={Reject.isPending || !Reason.trim()}>
            {Reject.isPending ? <Loader2 size={16} className="animate-spin" /> : null} Reject And Return {Coins_(order.price)} Coins
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <p className="ad-rw-desc">The student gets every coin back straight away and sees your reason in My Rewards. Use this when the reward can&apos;t be given.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((Text) => (
            <button key={Text} type="button" className={`ad-rw-quick ${Reason === Text ? "is-on" : ""}`} onClick={() => SetReason(Text)}>{Text}</button>
          ))}
        </div>
        <label className="grid gap-2">
          <span className="ad-rw-label">Reason the student will see</span>
          <textarea className="math-input min-h-[96px]" maxLength={300} value={Reason} onChange={(Event) => SetReason(Event.target.value)} placeholder="For example: out of stock at the shop this week" />
          <span className="ad-rw-hint">{Reason.length} / 300</span>
        </label>
        {Error ? <ErrorState message={Error} /> : null}
      </div>
    </PaymentsDialog>
  );
}

// ---------- To Prepare ------------------------------------------------------------------------

function ShoppingList() {
  const Query = useQuery({ queryKey: [...KEY, "shopping"], queryFn: getShoppingList });
  const Rows = Query.data ?? [];
  const Total = Rows.reduce((Sum, Row) => Sum + Row.count, 0);
  return (
    <div className="ad-rw-panel">
      <SectionHead
        title="Shopping List"
        description={Total ? `${Plural(Total, "reward")} to get ready, by item, so you know what to buy. Demo accounts are left out.` : "Everything unlocked and not yet ready, by item. Demo accounts are left out."}
      />
      {Query.isLoading ? <LoadingState label="Loading" /> : Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : Rows.length ? (
        <ul className="ad-rw-shop">
          {Rows.map((Row) => (
            <li key={`${Row.itemId}-${Row.itemName}`}>
              <Thumb url={Row.imageUrl} name={Row.itemName} size={52} />
              <span className="min-w-0">
                <span className="ad-rw-name block">{Row.itemName}</span>
                <span className="ad-rw-sub">Waiting since {IndiaTime(Row.oldest, false)}</span>
              </span>
              <span className="ad-rw-count">×{Row.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<ShoppingBag size={20} />} title="Nothing To Buy Right Now" text="When a student unlocks a reward, it appears here until you mark it ready." />
      )}
    </div>
  );
}

function PrepareTab() {
  const Invalidate = useInvalidate();
  const Orders = useQuery({ queryKey: [...KEY, "orders", "UNLOCKED"], queryFn: () => getAdminRewardOrders({ status: "UNLOCKED" }) });
  const [Picked, SetPicked] = useState<Set<string>>(new Set());
  const [Rejecting, SetRejecting] = useState<AdminRewardOrder | null>(null);
  const [Notice, SetNotice] = useState<string | null>(null);
  const List = useMemo(() => [...(Orders.data ?? [])].sort((A, B) => (A.unlockedAt || "").localeCompare(B.unlockedAt || "")), [Orders.data]);
  const Ready = useMutation({
    mutationFn: (Ids: string[]) => markRewardsReady(Ids),
    onSuccess: (Moved) => {
      SetPicked(new Set());
      SetNotice(Moved.length ? `${Plural(Moved.length, "reward")} marked ready. The students can collect them at the centre.` : "Those rewards were already handled.");
      Invalidate();
    },
    onError: (Problem) => SetNotice(apiErrorMessage(Problem)),
  });
  const AllPicked = List.length > 0 && List.every((Order) => Picked.has(Order.id));
  const Toggle = (Id: string) => SetPicked((Current) => { const Next = new Set(Current); if (Next.has(Id)) Next.delete(Id); else Next.add(Id); return Next; });

  return (
    <div className="grid gap-6">
      <ShoppingList />
      <div className="ad-rw-panel">
        <SectionHead
          title="Unlocked, Waiting For You"
          description="Oldest first. Mark a reward ready once it's at the centre, and the student is told they can collect it. A student can still cancel until you do."
          action={
            <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={() => Ready.mutate([...Picked])} disabled={!Picked.size || Ready.isPending}>
              {Ready.isPending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
              {Picked.size ? `Mark ${Picked.size} Ready` : "Mark Ready"}
            </button>
          }
        />
        {Notice ? <p className="ad-rw-notice" role="status">{Notice}</p> : null}
        {Orders.isLoading ? <LoadingState label="Loading" /> : Orders.error ? <ErrorState message={apiErrorMessage(Orders.error)} /> : List.length ? (
          <div className="overflow-x-auto">
            <table className="ad-cards w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[16%]" />
                <col className="w-[28%]" />
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-2">
                    <input type="checkbox" className="ad-rw-check" checked={AllPicked} onChange={() => SetPicked(AllPicked ? new Set() : new Set(List.map((Order) => Order.id)))} aria-label="Select every reward" />
                  </th>
                  <th className="px-3 py-2">Unlocked</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Reward</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {List.map((Order) => (
                  <tr key={Order.id} className={`border-t border-slate-100 align-middle dark:border-slate-800 ${Picked.has(Order.id) ? "ad-rw-row-on" : ""}`}>
                    <td data-label="Select" className="px-3 py-3"><input type="checkbox" className="ad-rw-check" checked={Picked.has(Order.id)} onChange={() => Toggle(Order.id)} aria-label={`Select ${Order.itemName} for ${Order.student?.name ?? "student"}`} /></td>
                    <td data-label="Unlocked" className="px-3 py-3 font-bold tabular-nums">{IndiaTime(Order.unlockedAt)}</td>
                    <td className="ad-card-title px-3 py-3"><Person person={Order.student} /></td>
                    <td data-label="Reward" className="px-3 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <Thumb url={Order.imageUrl} name={Order.itemName} size={44} />
                        <span className="min-w-0"><span className="ad-rw-name block">{Order.itemName}</span><span className="ad-rw-sub inline-flex items-center gap-1"><Coin size={13} /> {Coins_(Order.price)}</span></span>
                      </span>
                    </td>
                    <td data-label="Code" className="px-3 py-3"><span className="ad-rw-code">{Order.pickupCode}</span></td>
                    <td className="ad-card-wide px-3 py-3">
                      <span className="flex flex-wrap justify-end gap-2">
                        <button type="button" className="math-role-action-button h-9 px-3" onClick={() => Ready.mutate([Order.id])} disabled={Ready.isPending}><PackageCheck size={15} /> Ready</button>
                        <button type="button" className="math-role-action-button h-9 px-3" onClick={() => SetRejecting(Order)}><X size={15} /> Reject</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<ClipboardList size={20} />} title="Nothing Waiting" text="Every unlocked reward has been made ready. New unlocks will appear here." />
        )}
      </div>
      <RejectDialog order={Rejecting} onClose={() => SetRejecting(null)} />
    </div>
  );
}

// ---------- Hand Over -----------------------------------------------------------------------

function CodeLooking(Value: string) {
  return /^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.test(Value.trim().replace(/\s+/g, ""));
}

function HandOverTab() {
  const Invalidate = useInvalidate();
  const [Text, SetText] = useState("");
  const [Search_, SetSearch] = useState("");
  const [Found, SetFound] = useState<Awaited<ReturnType<typeof findRewardCode>> | null>(null);
  const [FindError, SetFindError] = useState<string | null>(null);
  const [Done, SetDone] = useState<string | null>(null);
  const [Rejecting, SetRejecting] = useState<RewardOrder | null>(null);
  const InputRef = useRef<HTMLInputElement>(null);
  const Ready = useQuery({ queryKey: [...KEY, "orders", "READY", Search_], queryFn: () => getAdminRewardOrders({ status: "READY", q: Search_ || undefined }) });

  const Find = useMutation({
    mutationFn: (Code: string) => findRewardCode(Code),
    onSuccess: (Data) => { SetFound(Data); SetFindError(null); },
    onError: (Problem) => { SetFound(null); SetFindError(apiErrorMessage(Problem)); },
  });
  const Collect = useMutation({
    mutationFn: (Order: { id: string; itemName: string; studentName: string }) => markRewardCollected(Order.id).then(() => Order),
    onSuccess: (Order) => {
      SetDone(`${Order.itemName} handed over to ${Order.studentName}, ${IndiaTime(new Date().toISOString())}.`);
      if (Found) Find.mutate(Found.match.pickupCode);
      Invalidate();
    },
    onError: (Problem) => SetDone(apiErrorMessage(Problem)),
  });

  const Submit = () => {
    const Clean = Text.trim();
    SetDone(null);
    if (!Clean) return;
    if (CodeLooking(Clean)) {
      SetSearch("");
      Find.mutate(Clean);
    } else {
      SetFound(null);
      SetFindError(null);
      SetSearch(Clean);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="ad-rw-panel ad-rw-desk">
        <SectionHead title="Hand Over At The Centre" description="Type the student's pickup code (any case, with or without the dash) or their name. The system records who handed the reward over and when." />
        <form className="ad-rw-desk-form" onSubmit={(Event) => { Event.preventDefault(); Submit(); }}>
          <div className="relative min-w-0 flex-1">
            <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={InputRef}
              className="math-input ad-rw-desk-input"
              value={Text}
              onChange={(Event) => SetText(Event.target.value)}
              placeholder="K7Q-3MX or a student's name"
              aria-label="Pickup code or student name"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" className="math-button-primary inline-flex items-center gap-2" disabled={!Text.trim() || Find.isPending}>
            {Find.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Find
          </button>
        </form>
        {Done ? <p className="ad-rw-notice is-good" role="status"><Check size={16} /> {Done}</p> : null}
        {FindError ? <ErrorState message={FindError} /> : null}
        {Found ? (
          <div className="ad-rw-found">
            <Person person={Found.student} />
            {Found.open.length ? (
              <ul className="ad-rw-found-list">
                {Found.open.map((Order) => (
                  <li key={Order.id} className={Order.id === Found.match.id ? "is-match" : ""}>
                    <Thumb url={Order.imageUrl} name={Order.itemName} size={56} />
                    <span className="min-w-0">
                      <span className="ad-rw-name block">{Order.itemName}</span>
                      <span className="ad-rw-sub"><span className="ad-rw-code is-small">{Order.pickupCode}</span> · Unlocked {IndiaTime(Order.unlockedAt, false)}</span>
                    </span>
                    <StatusChip status={Order.status} />
                    <span className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={() => Collect.mutate({ id: Order.id, itemName: Order.itemName, studentName: Found.student?.name ?? "the student" })} disabled={Collect.isPending}>
                        <HandCoins size={16} /> Hand Over
                      </button>
                      <button type="button" className="math-role-action-button h-10 px-3" onClick={() => SetRejecting(Order)}><X size={15} /> Reject</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ad-rw-desc">
                {Found.match.status === "COLLECTED"
                  ? `${Found.match.itemName} was already handed over on ${IndiaTime(Found.match.collectedAt)}.`
                  : `${Found.match.itemName} is ${STATUS_TEXT[Found.match.status].toLowerCase()}, so there's nothing to hand over.`}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="ad-rw-panel">
        <SectionHead title={Search_ ? `Ready For “${Search_}”` : "Ready To Hand Over"} description="Rewards that are at the centre and waiting for their student, oldest first." />
        {Ready.isLoading ? <LoadingState label="Loading" /> : Ready.error ? <ErrorState message={apiErrorMessage(Ready.error)} /> : Ready.data?.length ? (
          <div className="overflow-x-auto">
            <table className="ad-cards w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[30%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Reward</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Ready Since</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {[...Ready.data].sort((A, B) => (A.readyAt || "").localeCompare(B.readyAt || "")).map((Order) => (
                  <tr key={Order.id} className="border-t border-slate-100 align-middle dark:border-slate-800">
                    <td className="ad-card-title px-3 py-3"><Person person={Order.student} /></td>
                    <td data-label="Reward" className="px-3 py-3">
                      <span className="flex min-w-0 items-center gap-3"><Thumb url={Order.imageUrl} name={Order.itemName} size={44} /><span className="ad-rw-name min-w-0">{Order.itemName}</span></span>
                    </td>
                    <td data-label="Code" className="px-3 py-3"><span className="ad-rw-code">{Order.pickupCode}</span></td>
                    <td data-label="Ready Since" className="px-3 py-3 font-bold tabular-nums">{IndiaTime(Order.readyAt, false)}</td>
                    <td className="ad-card-wide px-3 py-3">
                      <span className="flex justify-end">
                        <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={() => Collect.mutate({ id: Order.id, itemName: Order.itemName, studentName: Order.student?.name ?? "the student" })} disabled={Collect.isPending}>
                          <HandCoins size={16} /> Hand Over
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<PackageCheck size={20} />} title={Search_ ? "No Ready Rewards Match" : "Nothing Ready Yet"} text={Search_ ? "Check the spelling, or try the student's pickup code." : "Rewards you mark ready in To Prepare wait here for their students."} />
        )}
      </div>
      <RejectDialog order={Rejecting} onClose={() => { SetRejecting(null); if (Found) Find.mutate(Found.match.pickupCode); }} />
    </div>
  );
}

// ---------- History -----------------------------------------------------------------------

function WhoLine({ order }: { order: AdminRewardOrder }) {
  if (order.status === "COLLECTED") return <span className="ad-rw-sub">Handed over by {order.collectedBy || "an admin"} · {IndiaTime(order.collectedAt)}</span>;
  if (order.status === "READY") return <span className="ad-rw-sub">Ready since {IndiaTime(order.readyAt)}{order.readyBy ? ` · ${order.readyBy}` : ""}</span>;
  if (order.status === "CANCELLED") return <span className="ad-rw-sub">Cancelled by the student · {IndiaTime(order.closedAt)} · coins returned</span>;
  if (order.status === "REJECTED") return <span className="ad-rw-sub">Rejected by {order.closedBy || "an admin"} · {IndiaTime(order.closedAt)}{order.closeReason ? ` · “${order.closeReason}”` : ""}</span>;
  return <span className="ad-rw-sub">Waiting to be made ready</span>;
}

function HistoryTab() {
  const [Filters, SetFilters] = useState<OrderFilters>({ status: "ALL", q: "", start: "", end: "" });
  const [Exporting, SetExporting] = useState(false);
  const [ExportError, SetExportError] = useState<string | null>(null);
  const Orders = useQuery({ queryKey: [...KEY, "orders", "history", Filters], queryFn: () => getAdminRewardOrders(Filters), placeholderData: (Previous) => Previous });
  const Set_ = (Key: keyof OrderFilters) => (Value: string) => SetFilters((Current) => ({ ...Current, [Key]: Value }));
  const Export = async () => {
    SetExporting(true);
    SetExportError(null);
    try {
      saveBlob(await downloadRewardOrders(Filters), "MathPath Rewards.xlsx");
    } catch (Problem) {
      SetExportError(apiErrorMessage(Problem));
    } finally {
      SetExporting(false);
    }
  };
  return (
    <div className="ad-rw-panel">
      <SectionHead
        title="Every Reward"
        description="Every reward ever unlocked, newest first: who unlocked it, when it was made ready, who handed it over, and anything cancelled or rejected with its reason."
        action={
          <button type="button" className="math-button-secondary inline-flex items-center gap-2" onClick={Export} disabled={Exporting || !Orders.data?.length}>
            {Exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Excel
          </button>
        }
      />
      <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_170px_170px]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="math-input pl-11" value={Filters.q} onChange={(Event) => Set_("q")(Event.target.value)} placeholder="Search by student, ID, reward or code" aria-label="Search rewards" />
        </div>
        <select className="math-select" value={Filters.status} onChange={(Event) => Set_("status")(Event.target.value)} aria-label="Filter by status">
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Not Yet Collected</option>
          <option value="UNLOCKED">To Prepare</option>
          <option value="READY">Ready</option>
          <option value="COLLECTED">Collected</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <input type="date" className="math-input" value={Filters.start} onChange={(Event) => Set_("start")(Event.target.value)} aria-label="Unlocked from" />
        <input type="date" className="math-input" value={Filters.end} onChange={(Event) => Set_("end")(Event.target.value)} aria-label="Unlocked up to" />
      </div>
      {ExportError ? <ErrorState message={ExportError} /> : null}
      {Orders.isLoading ? <LoadingState label="Loading" /> : Orders.error ? <ErrorState message={apiErrorMessage(Orders.error)} /> : Orders.data?.length ? (
        <div className="overflow-x-auto">
          <table className="ad-cards w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[24%]" />
              <col className="w-[33%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-3 py-2">Unlocked</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Reward</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {Orders.data.map((Order) => (
                <tr key={Order.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td data-label="Unlocked" className="px-3 py-3 font-bold tabular-nums">{IndiaTime(Order.unlockedAt)}</td>
                  <td className="ad-card-title px-3 py-3"><Person person={Order.student} /></td>
                  <td data-label="Reward" className="ad-card-wide px-3 py-3">
                    <span className="flex min-w-0 items-start gap-3">
                      <Thumb url={Order.imageUrl} name={Order.itemName} size={44} />
                      <span className="grid min-w-0 gap-1">
                        <span className="ad-rw-name">{Order.itemName}</span>
                        <span className="ad-rw-sub inline-flex items-center gap-1"><Coin size={13} /> {Coins_(Order.price)}</span>
                        <WhoLine order={Order} />
                      </span>
                    </span>
                  </td>
                  <td data-label="Code" className="px-3 py-3"><span className="ad-rw-code">{Order.pickupCode}</span></td>
                  <td data-label="Status" className="px-3 py-3"><StatusChip status={Order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<History size={20} />} title="No Rewards Match" text="Try another search, status or date range." />
      )}
    </div>
  );
}

// ---------- Catalogue -----------------------------------------------------------------------

type Draft = { name: string; description: string; price: string; unlimited: boolean; stock: string; isActive: boolean };

function PreviewCard({ draft, photo }: { draft: Draft; photo: string | null }) {
  const Price = Number(draft.price) || 0;
  const Out = !draft.unlimited && draft.stock !== "" && Number(draft.stock) <= 0;
  return (
    <div className="ad-rw-preview" aria-label="How students will see this reward">
      <p className="ad-rw-label">What Students See</p>
      <div className={`ad-rw-pcard${Out ? " is-out" : ""}`}>
        <span className="ad-rw-pcase">{photo ? <img src={photo} alt="" /> : <span className="ad-rw-pcase-empty"><ImagePlus size={30} /><span>Add a photo</span></span>}</span>
        <span className="ad-rw-pbody">
          <span className="ad-rw-pname">{draft.name.trim() || "Reward name"}</span>
          <span className="ad-rw-pfoot">
            <span className="ad-rw-pprice"><span className="ad-rw-pring"><Coin size={24} /></span>{Price ? Coins_(Price) : "—"}</span>
            {Out ? <span className="ad-rw-pout">Not available right now</span> : <span className="ad-rw-pgo">Unlock</span>}
          </span>
        </span>
      </div>
      <p className="ad-rw-hint">A student with enough coins sees Unlock. Everyone else sees how many more coins they need.</p>
    </div>
  );
}

function ItemEditor({ item, onClose }: { item: AdminRewardItem | "new" | null; onClose: () => void }) {
  const Invalidate = useInvalidate();
  const Existing = item && item !== "new" ? item : null;
  const [Draft_, SetDraft] = useState<Draft>({ name: "", description: "", price: "", unlimited: true, stock: "", isActive: true });
  const [File_, SetFile] = useState<File | null>(null);
  const [Local, SetLocal] = useState<string | null>(null);
  const [Error, SetError] = useState<string | null>(null);
  const [Saving, SetSaving] = useState(false);
  const FileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    SetError(null);
    SetFile(null);
    SetLocal(null);
    SetDraft(Existing
      ? { name: Existing.name, description: Existing.description ?? "", price: String(Existing.price), unlimited: Existing.stock === null, stock: Existing.stock === null ? "" : String(Existing.stock), isActive: Existing.isActive }
      : { name: "", description: "", price: "", unlimited: true, stock: "", isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  useEffect(() => () => { if (Local) URL.revokeObjectURL(Local); }, [Local]);

  if (!item) return null;
  const Photo = Local || (Existing?.imageUrl ? rewardPhotoSrc(Existing.imageUrl) : null);
  const Field = (Key: keyof Draft) => (Value: string | boolean) => SetDraft((Current) => ({ ...Current, [Key]: Value }));
  const PickFile = (Picked: File | null) => {
    SetError(null);
    if (!Picked) return;
    if (!/^image\/(jpeg|png|webp)$/.test(Picked.type)) { SetError("Use a JPG, PNG or WebP photo."); return; }
    if (Picked.size > 5 * 1024 * 1024) { SetError("The photo is bigger than 5 MB. Choose a smaller one."); return; }
    SetFile(Picked);
    SetLocal(URL.createObjectURL(Picked));
  };
  const Save = async () => {
    SetError(null);
    const Price = Number(Draft_.price);
    if (!Draft_.name.trim()) return SetError("Give the reward a name.");
    if (!Number.isInteger(Price) || Price < 1) return SetError("The price must be a whole number of coins, 1 or more.");
    if (!Draft_.unlimited && (Draft_.stock === "" || !Number.isInteger(Number(Draft_.stock)) || Number(Draft_.stock) < 0)) return SetError("Stock must be a whole number, 0 or more, or choose Unlimited.");
    const Payload = { name: Draft_.name, description: Draft_.description.trim() || null, price: Price, stock: Draft_.unlimited ? null : Number(Draft_.stock), isActive: Draft_.isActive };
    SetSaving(true);
    try {
      const Saved = Existing ? await updateRewardItem(Existing.id, Payload) : await createRewardItem(Payload);
      if (File_) await uploadRewardPhoto(Saved.item.id, File_);
      Invalidate();
      onClose();
    } catch (Problem) {
      SetError(apiErrorMessage(Problem));
    } finally {
      SetSaving(false);
    }
  };

  return (
    <PaymentsDialog
      open
      wide
      title={Existing ? "Edit Reward" : "Add A Reward"}
      kicker={Existing ? Existing.name : "Rewards"}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="math-button-secondary" onClick={onClose} disabled={Saving}>Cancel</button>
          <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={Save} disabled={Saving}>
            {Saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {Existing ? "Save Changes" : "Add Reward"}
          </button>
        </div>
      }
    >
      <div className="ad-rw-editor">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <span className="ad-rw-label">Photo</span>
            <button
              type="button"
              className="ad-rw-drop"
              onClick={() => FileRef.current?.click()}
              onDragOver={(Event) => Event.preventDefault()}
              onDrop={(Event) => { Event.preventDefault(); PickFile(Event.dataTransfer.files?.[0] ?? null); }}
            >
              <ImagePlus size={20} />
              <span>{Photo ? "Change Photo" : "Choose A Photo"}</span>
              <span className="ad-rw-hint">JPG, PNG or WebP, up to 5 MB. It is squared and placed on white for the store.</span>
            </button>
            <input ref={FileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(Event) => { PickFile(Event.target.files?.[0] ?? null); Event.target.value = ""; }} aria-label="Reward photo" />
          </div>
          <label className="grid gap-2">
            <span className="ad-rw-label">Name</span>
            <input className="math-input" maxLength={120} value={Draft_.name} onChange={(Event) => Field("name")(Event.target.value)} placeholder="For example: Parker Vector Ball Pen" />
          </label>
          <label className="grid gap-2">
            <span className="ad-rw-label">Description</span>
            <textarea className="math-input min-h-[88px]" maxLength={400} value={Draft_.description} onChange={(Event) => Field("description")(Event.target.value)} placeholder="One or two lines a student will read before unlocking it" />
            <span className="ad-rw-hint">{Draft_.description.length} / 400</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="ad-rw-label">Price In MathCoins</span>
              <input className="math-input" inputMode="numeric" value={Draft_.price} onChange={(Event) => Field("price")(Event.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 2400" />
            </label>
            <div className="grid gap-2">
              <span className="ad-rw-label">Stock</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`ad-rw-quick ${Draft_.unlimited ? "is-on" : ""}`} aria-pressed={Draft_.unlimited} onClick={() => Field("unlimited")(true)}>Unlimited</button>
                <button type="button" className={`ad-rw-quick ${!Draft_.unlimited ? "is-on" : ""}`} aria-pressed={!Draft_.unlimited} onClick={() => Field("unlimited")(false)}>Limited</button>
                {!Draft_.unlimited ? <input className="math-input w-28" inputMode="numeric" value={Draft_.stock} onChange={(Event) => Field("stock")(Event.target.value.replace(/[^\d]/g, ""))} aria-label="How many are left" placeholder="Left" /> : null}
              </div>
            </div>
          </div>
          <label className="ad-rw-toggle">
            <input type="checkbox" checked={Draft_.isActive} onChange={(Event) => Field("isActive")(Event.target.checked)} />
            <span>
              <span className="ad-rw-name block">In The Store</span>
              <span className="ad-rw-sub">Switch off to hide it from students. Rewards already unlocked are not affected.</span>
            </span>
          </label>
          {Existing ? <p className="ad-rw-hint">Changing the price or name never changes a reward a student has already unlocked.</p> : null}
          {Error ? <ErrorState message={Error} /> : null}
        </div>
        <PreviewCard draft={Draft_} photo={Photo} />
      </div>
    </PaymentsDialog>
  );
}

function CatalogueTab() {
  const Invalidate = useInvalidate();
  const Items = useQuery({ queryKey: [...KEY, "items"], queryFn: getAdminRewardItems });
  const [Editing, SetEditing] = useState<AdminRewardItem | "new" | null>(null);
  const [Error, SetError] = useState<string | null>(null);
  const Toggle = useMutation({
    mutationFn: (Item: AdminRewardItem) => updateRewardItem(Item.id, { isActive: !Item.isActive }),
    onSuccess: Invalidate,
    onError: (Problem) => SetError(apiErrorMessage(Problem)),
  });
  const Move = useMutation({
    mutationFn: (Ids: string[]) => reorderRewardItems(Ids),
    onSuccess: Invalidate,
    onError: (Problem) => SetError(apiErrorMessage(Problem)),
  });
  const List = Items.data ?? [];
  const Shift = (Index: number, By: number) => {
    const Ids = List.map((Item) => Item.id);
    const Target = Index + By;
    if (Target < 0 || Target >= Ids.length) return;
    [Ids[Index], Ids[Target]] = [Ids[Target], Ids[Index]];
    Move.mutate(Ids);
  };
  const Off = List.filter((Item) => !Item.isActive).length;
  const Empty_ = List.filter((Item) => Item.isActive && !Item.inStock).length;

  return (
    <div className="ad-rw-panel">
      <SectionHead
        title="The Catalogue"
        description={`${Plural(List.length, "reward")}${Off ? `, ${Off} switched off` : ""}${Empty_ ? `, ${Empty_} out of stock` : ""}. Students see them in this order. Out of stock rewards stay on the shelf, greyed out, so students can still aim for them.`}
        action={
          <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={() => SetEditing("new")}>
            <Plus size={16} /> Add A Reward
          </button>
        }
      />
      {Error ? <ErrorState message={Error} /> : null}
      {Items.isLoading ? <LoadingState label="Loading" /> : Items.error ? <ErrorState message={apiErrorMessage(Items.error)} /> : List.length ? (
        <ul className="ad-rw-items">
          {List.map((Item, Index) => (
            <li key={Item.id} className={`ad-rw-item${Item.isActive ? "" : " is-off"}${Item.isActive && !Item.inStock ? " is-out" : ""}`}>
              <span className="ad-rw-item-case">
                <Thumb url={Item.imageUrl} name={Item.name} size={140} />
                <span className="ad-rw-item-order">{Index + 1}</span>
                <span className="ad-rw-item-move">
                  <button type="button" onClick={() => Shift(Index, -1)} disabled={Index === 0 || Move.isPending} aria-label={`Move ${Item.name} up`} title="Show earlier in the store"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => Shift(Index, 1)} disabled={Index === List.length - 1 || Move.isPending} aria-label={`Move ${Item.name} down`} title="Show later in the store"><ArrowDown size={15} /></button>
                </span>
              </span>
              <span className="ad-rw-item-body">
                <span className="ad-rw-name block">{Item.name}</span>
                <span className="ad-rw-item-price"><Coin size={18} /> {Coins_(Item.price)}</span>
                <span className="ad-rw-item-tags">
                  <span className={`ad-rw-chip ${Item.isActive ? "is-ready" : "is-cancelled"}`}>{Item.isActive ? "In The Store" : "Switched Off"}</span>
                  <span className={`ad-rw-chip ${Item.stock === null ? "is-plain" : Item.inStock ? "is-plain" : "is-rejected"}`}>{Item.stock === null ? "Unlimited" : Item.inStock ? `${Item.stock} left` : "Out Of Stock"}</span>
                </span>
                <span className="ad-rw-sub">{Item.unlocked ? `Unlocked ${Item.unlocked} · collected ${Item.collected}${Item.waiting ? ` · ${Item.waiting} to prepare` : ""}` : "Not unlocked yet"}</span>
              </span>
              <span className="ad-rw-item-actions">
                <button type="button" className="math-role-action-button h-9 px-3" onClick={() => SetEditing(Item)}><Pencil size={15} /> Edit</button>
                <button type="button" className="math-role-action-button h-9 px-3" onClick={() => Toggle.mutate(Item)} disabled={Toggle.isPending}><Power size={15} /> {Item.isActive ? "Switch Off" : "Switch On"}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<Gift size={20} />} title="No Rewards Yet" text="Add the first reward students can unlock with their MathCoins." />
      )}
      <ItemEditor item={Editing} onClose={() => SetEditing(null)} />
    </div>
  );
}

// ---------- Student Coins ----------------------------------------------------------------------

function CoinHistoryDialog({ student, onClose }: { student: CoinStudent | null; onClose: () => void }) {
  const [Extra, SetExtra] = useState<CoinEntry[]>([]);
  const [Next, SetNext] = useState<string | null>(null);
  const First = useQuery({ queryKey: [...KEY, "coin-history", student?.studentId], queryFn: () => getStudentCoinHistory(student!.studentId), enabled: Boolean(student) });
  const More = useMutation({ mutationFn: (Before: string) => getStudentCoinHistory(student!.studentId, Before) });
  useEffect(() => { SetExtra([]); SetNext(First.data?.next ?? null); }, [First.data, student?.studentId]);
  if (!student) return null;
  const Entries = [...(First.data?.entries ?? []), ...Extra];
  return (
    <PaymentsDialog open wide title="Coin History" kicker={`${student.name} · ${student.studentCode}`} onClose={onClose}>
      <div className="grid gap-4">
        <div className="ad-rw-wallet">
          <span><span className="ad-rw-label">Balance</span><strong><Coin size={18} /> {Coins_(student.balance)}</strong></span>
          <span><span className="ad-rw-label">Earned</span><strong>{Coins_(student.earned)}</strong></span>
          <span><span className="ad-rw-label">Spent</span><strong>{Coins_(student.spent)}</strong></span>
        </div>
        {First.isLoading ? <LoadingState label="Loading" /> : First.error ? <ErrorState message={apiErrorMessage(First.error)} /> : Entries.length ? (
          <ul className="ad-rw-ledger">
            {Entries.map((Entry) => (
              <li key={Entry.id} className={Entry.coins < 0 ? "is-out" : Entry.type === "REFUND" ? "is-back" : "is-in"}>
                <span className="ad-rw-sub tabular-nums">{IndiaTime(Entry.at)}</span>
                <span className="ad-rw-ledger-label">{Entry.label}</span>
                <span className="ad-rw-ledger-coins">{Entry.coins > 0 ? "+" : "−"}{Coins_(Math.abs(Entry.coins))}</span>
              </li>
            ))}
          </ul>
        ) : <Empty icon={<Coins size={20} />} title="No Coins Yet" text="Coins appear here as the student finishes DPS sheets, mocks and assessments." />}
        {Next ? (
          <button type="button" className="math-button-secondary justify-self-center" disabled={More.isPending} onClick={() => More.mutate(Next, { onSuccess: (Data) => { SetExtra((Current) => [...Current, ...Data.entries]); SetNext(Data.next); } })}>
            {More.isPending ? "Loading…" : "Show Earlier"}
          </button>
        ) : null}
      </div>
    </PaymentsDialog>
  );
}

function CoinsTab() {
  const [Query_, SetQuery] = useState("");
  const [LevelId, SetLevelId] = useState("ALL");
  const [Open, SetOpen] = useState<CoinStudent | null>(null);
  const Data = useQuery({ queryKey: [...KEY, "coins", Query_, LevelId], queryFn: () => getCoinStudents(Query_ || undefined, LevelId), placeholderData: (Previous) => Previous });
  const Students = Data.data?.students ?? [];
  const Total = Students.reduce((Sum, Student) => Sum + Student.balance, 0);
  return (
    <div className="ad-rw-panel">
      <SectionHead title="Student Coins" description={Data.data ? `${Plural(Students.length, "active student")} holding ${Coins_(Total)} MathCoins between them, highest balance first. Coin History shows every coin earned and spent.` : "Every active student's MathCoins, highest balance first."} />
      <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="math-input pl-11" value={Query_} onChange={(Event) => SetQuery(Event.target.value)} placeholder="Search by name or student ID" aria-label="Search students" />
        </div>
        <select className="math-select" value={LevelId} onChange={(Event) => SetLevelId(Event.target.value)} aria-label="Filter by level">
          <option value="ALL">All Levels</option>
          {Data.data?.levels.map((Level) => <option key={Level.id} value={Level.id}>{Level.code}</option>)}
        </select>
      </div>
      {Data.isLoading ? <LoadingState label="Loading" /> : Data.error ? <ErrorState message={apiErrorMessage(Data.error)} /> : Students.length ? (
        <div className="overflow-x-auto">
          <table className="ad-cards w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Earned</th>
                <th className="px-3 py-2 text-right">Spent</th>
                <th className="px-3 py-2 text-right">Open</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {Students.map((Student) => (
                <tr key={Student.studentId} className="border-t border-slate-100 align-middle dark:border-slate-800">
                  <td className="ad-card-title px-3 py-3"><Person person={Student} /></td>
                  <td data-label="Balance" className="px-3 py-3 text-right"><span className="ad-rw-balance"><Coin size={15} /> {Coins_(Student.balance)}</span></td>
                  <td data-label="Earned" className="px-3 py-3 text-right font-bold tabular-nums">{Coins_(Student.earned)}</td>
                  <td data-label="Spent" className="px-3 py-3 text-right font-bold tabular-nums">{Coins_(Student.spent)}</td>
                  <td data-label="Open Rewards" className="px-3 py-3 text-right font-bold tabular-nums">{Student.openRewards || "—"}</td>
                  <td className="ad-card-wide px-3 py-3">
                    <span className="flex justify-end">
                      <button type="button" className="math-role-action-button h-9 px-3" onClick={() => SetOpen(Student)}><History size={15} /> Coin History</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Coins size={20} />} title="No Students Match" text="Try another name, student ID or level." />
      )}
      <CoinHistoryDialog student={Open} onClose={() => SetOpen(null)} />
    </div>
  );
}

// ---------- the page --------------------------------------------------------------------------

export function AdminRewardsPage() {
  const Params = useSearchParams();
  const [TabValue, SetTabValue] = useState<Tab>(() => (TABS.includes((Params.get("tab") ?? "") as Tab) ? (Params.get("tab") as Tab) : "prepare"));
  const Summary = useQuery({ queryKey: [...KEY, "summary"], queryFn: getRewardSummary, staleTime: 15_000 });
  const S = Summary.data;
  const SetTab = (Next: Tab) => {
    SetTabValue(Next);
    const Url = new URL(window.location.href);
    Url.searchParams.set("tab", Next);
    window.history.replaceState(null, "", `${Url.pathname}${Url.search}`);
  };
  const Tabs: [Tab, string, ReactNode][] = [
    ["prepare", `To Prepare${S?.toPrepare ? ` (${S.toPrepare})` : ""}`, <ClipboardList key="i" size={16} />],
    ["handover", `Hand Over${S?.ready ? ` (${S.ready})` : ""}`, <HandCoins key="i" size={16} />],
    ["history", "History", <History key="i" size={16} />],
    ["catalogue", "Catalogue", <Gift key="i" size={16} />],
    ["coins", "Student Coins", <Coins key="i" size={16} />],
  ];

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="ad-hero-stack relative z-10">
          <div>
            <p className="math-block-header"><Gift size={14} />Student Rewards</p>
            <h1 className="math-title">Rewards</h1>
            <p className="math-subtitle">
              The rewards students unlock with their MathCoins: what to get ready, what to hand over at the centre, the catalogue they choose from, and every student&apos;s coins.
            </p>
          </div>
          <div className="ad-hero-tiles">
            <Metric label="To Prepare" value={S ? S.toPrepare : "—"} icon={<ClipboardList size={18} />} onClick={() => SetTab("prepare")} />
            <Metric label="Ready To Hand Over" value={S ? S.ready : "—"} icon={<PackageCheck size={18} />} onClick={() => SetTab("handover")} />
            <Metric label="Collected This Month" value={S ? S.collectedThisMonth : "—"} icon={<HandCoins size={18} />} onClick={() => SetTab("history")} />
            <Metric label="Coins With Students" value={S ? Coins_(S.coinsWithStudents) : "—"} icon={<Coins size={18} />} onClick={() => SetTab("coins")} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div role="tablist" aria-label="Rewards views" className="flex min-w-0 flex-wrap gap-2">
          {Tabs.map(([Key, Label, Icon]) => (
            <button
              key={Key}
              type="button"
              role="tab"
              aria-selected={TabValue === Key}
              onClick={() => SetTab(Key)}
              className={`math-role-tab-button math-admin-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition ${TabValue === Key ? "is-active math-admin-tab-force-selected" : ""}`}
            >
              {Icon}{Label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {TabValue === "prepare" ? <PrepareTab /> : null}
          {TabValue === "handover" ? <HandOverTab /> : null}
          {TabValue === "history" ? <HistoryTab /> : null}
          {TabValue === "catalogue" ? <CatalogueTab /> : null}
          {TabValue === "coins" ? <CoinsTab /> : null}
        </div>
      </section>
    </>
  );
}
