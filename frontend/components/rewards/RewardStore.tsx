"use client";

/* 2026-10-18 (Rewards, Part 2): the student's Reward Store.
   Plan: `claude/mathpath-rewards-plan-oct18.md`.

   The page is a shop window: the student's MathCoins on a gold coin, their
   goal on a lit pedestal with an abacus rod for progress, then the shelf of
   rewards. One orchestrated moment: unlocking, when coins pour into the
   reward and a pickup ticket is stamped with the code. Everything else is
   quiet. Styles: the "reward store" block in app/student/student-elevate.css. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Gift, History, PackageCheck, RotateCcw, Sparkles, Store, Target, Ticket, X } from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResolveAssetUrl } from "@/components/common/ProfileAvatar";
import { apiErrorMessage } from "@/lib/api";
import {
  cancelReward,
  getCoinHistory,
  getRewardStore,
  newRequestKey,
  setRewardGoal,
  unlockReward,
  type CoinEntry,
  type RewardOrder,
  type RewardStore as StoreData,
  type StoreItem,
} from "@/lib/api/rewards";
import { useUrlTabState } from "@/hooks/useUrlTabState";

export const STORE_KEY = ["student-rewards"] as const;
const TABS = ["store", "mine", "history"] as const;
type Tab = (typeof TABS)[number];

const Coins = (Value: number) => Math.max(0, Math.round(Value)).toLocaleString("en-IN");

function ReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function IndiaDate(Iso: string | null, WithTime = false) {
  if (!Iso) return "";
  const Value = new Date(Iso);
  return Value.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(WithTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

// ---------- small pieces ---------------------------------------------------------

export function CoinGlyph({ size = 18 }: { size?: number }) {
  return (
    <span className="se-rw-coin" style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.5)) }} aria-hidden="true">
      <span className="se-rw-coin-face">M</span>
    </span>
  );
}

/** The coin with a ring round it showing how much of the price the student has. */
function CoinRing({ progress, size = 44 }: { progress: number; size?: number }) {
  const Stroke = 4;
  const Radius = (size - Stroke) / 2;
  const Length = 2 * Math.PI * Radius;
  const Clamped = Math.max(0, Math.min(1, progress));
  return (
    <span className="se-rw-ring" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="se-rw-ring-track" cx={size / 2} cy={size / 2} r={Radius} strokeWidth={Stroke} fill="none" />
        <circle
          className={`se-rw-ring-fill${Clamped >= 1 ? " is-full" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={Radius}
          strokeWidth={Stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${Length} ${Length}`}
          strokeDashoffset={Length * (1 - Clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <CoinGlyph size={size - 16} />
    </span>
  );
}

/** Ten beads on a rod: how close the student is to their goal. */
function AbacusRod({ progress }: { progress: number }) {
  const Filled = Math.max(0, Math.min(10, Math.floor(progress * 10 + 1e-9)));
  return (
    <span className="se-rw-rod" aria-hidden="true">
      <span className="se-rw-rod-bar" />
      {Array.from({ length: 10 }, (_, Index) => (
        <span key={Index} className={`se-rw-bead${Index < Filled ? " is-on" : ""}`} style={{ ["--i" as string]: Index }} />
      ))}
    </span>
  );
}

function Photo({ url, name, className = "" }: { url: string | null; name: string; className?: string }) {
  const Src = ResolveAssetUrl(url);
  const [Broken, SetBroken] = useState(false);
  return (
    <span className={`se-rw-photo ${className}`}>
      {Src && !Broken ? (
        <img src={Src} alt={name} width={800} height={800} loading="lazy" decoding="async" onError={() => SetBroken(true)} />
      ) : (
        <span className="se-rw-photo-empty"><Gift size={40} strokeWidth={1.5} /></span>
      )}
    </span>
  );
}

// ---------- the shop window --------------------------------------------------------

function CountUp({ value }: { value: number }) {
  const [Shown, SetShown] = useState(value);
  const Previous = useRef(value);
  useEffect(() => {
    const From = Previous.current;
    Previous.current = value;
    if (From === value || ReducedMotion()) {
      SetShown(value);
      return;
    }
    const Start = performance.now();
    const Span = 900;
    let Frame = 0;
    const Step = (Now: number) => {
      const T = Math.min(1, (Now - Start) / Span);
      const Ease = 1 - Math.pow(1 - T, 3);
      SetShown(Math.round(From + (value - From) * Ease));
      if (T < 1) Frame = requestAnimationFrame(Step);
    };
    Frame = requestAnimationFrame(Step);
    return () => cancelAnimationFrame(Frame);
  }, [value]);
  return <>{Coins(Shown)}</>;
}

function Window({ store, onOpen }: { store: StoreData; onOpen: (Item: StoreItem) => void }) {
  const Goal = store.goal;
  return (
    <section className="se-rw-window" aria-labelledby="se-rw-title">
      <div className="se-rw-window-glow" aria-hidden="true" />
      <div className="se-rw-window-top">
        <div className="se-rw-window-copy gap-3">
          <div className="math-block-header se-rw-eyebrow w-fit">
            <Store size={14} />
            Reward Store
          </div>
          <h1 id="se-rw-title" className="se-rw-title">Turn Your MathCoins Into Real Rewards</h1>
        </div>
        <div className="se-rw-purse" aria-label={`You have ${Coins(store.balance)} MathCoins`}>
          <CoinGlyph size={64} />
          <span className="se-rw-purse-text">
            <span className="se-rw-purse-label">Your MathCoins</span>
            <span className="se-rw-purse-value"><CountUp value={store.balance} /></span>
          </span>
        </div>
      </div>
      <p className="se-rw-lede">Every DPS sheet, mock and assessment earns MathCoins. Unlock a reward here, then collect it at the centre.</p>

      <div className={`se-rw-pedestal${Goal ? "" : " is-empty"}`}>
        {Goal ? (
          <>
            <button type="button" className="se-rw-pedestal-photo" onClick={() => onOpen(Goal)} aria-label={`Open ${Goal.name}`}>
              <Photo url={Goal.imageUrl} name={Goal.name} />
            </button>
            <div className="se-rw-pedestal-body">
              <p className="se-rw-pedestal-label"><Target size={14} /> My Goal</p>
              <p className="se-rw-pedestal-name">{Goal.name}</p>
              <div className="se-rw-pedestal-track">
                <AbacusRod progress={Goal.progress} />
                <span className="se-rw-pedestal-count"><strong>{Coins(Math.min(store.balance, Goal.price))}</strong> / {Coins(Goal.price)}</span>
              </div>
            </div>
            <div className="se-rw-pedestal-action">
              {Goal.canUnlock ? (
                <button type="button" className="se-rw-btn se-rw-btn-gold" onClick={() => onOpen(Goal)}>
                  <Sparkles size={16} /> You Can Unlock It
                </button>
              ) : !Goal.inStock ? (
                <span className="se-rw-pedestal-note">Not available right now</span>
              ) : (
                <span className="se-rw-pedestal-note"><strong>{Coins(Goal.coinsToGo)}</strong> more coins</span>
              )}
            </div>
          </>
        ) : (
          <p className="se-rw-pedestal-hint">
            <Target size={16} /> Pick a goal: open any reward and choose <strong>Set As My Goal</strong>. It will wait for you here, and on your dashboard.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------- the shelf ----------------------------------------------------------------

function RewardCard({ item, mine, onOpen }: { item: StoreItem; mine: number; onOpen: () => void }) {
  const State = !item.inStock ? "out" : item.canUnlock ? "can" : "saving";
  return (
    <li className={`se-rw-card is-${State}${item.isGoal ? " is-goal" : ""}`}>
      <button type="button" className="se-rw-card-hit" onClick={onOpen} aria-label={`${item.name}, ${Coins(item.price)} coins`}>
        <span className="se-rw-case">
          <Photo url={item.imageUrl} name={item.name} />
          {item.isGoal ? <span className="se-rw-flag se-rw-flag-goal"><Target size={13} /> My Goal</span> : null}
          {mine ? <span className="se-rw-flag se-rw-flag-mine"><Check size={13} /> {mine > 1 ? `Unlocked ×${mine}` : "Unlocked"}</span> : null}
        </span>
        <span className="se-rw-card-body">
          <span className="se-rw-card-name">{item.name}</span>
          <span className="se-rw-card-foot">
            <span className="se-rw-price">
              <CoinRing progress={item.progress} size={42} />
              <span className="se-rw-price-value">{Coins(item.price)}</span>
            </span>
            {State === "can" ? (
              <span className="se-rw-chip se-rw-chip-go">Unlock</span>
            ) : State === "out" ? (
              <span className="se-rw-chip se-rw-chip-out">Not available right now</span>
            ) : (
              <span className="se-rw-togo"><strong>{Coins(item.coinsToGo)}</strong> more coins</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function Shelf({ store, onOpen }: { store: StoreData; onOpen: (Item: StoreItem) => void }) {
  const [Within, SetWithin] = useState(false);
  const [HighFirst, SetHighFirst] = useState(false);
  const Mine = useMemo(() => {
    const Count: Record<string, number> = {};
    for (const Order of store.orders) if (Order.itemId && (Order.status === "UNLOCKED" || Order.status === "READY")) Count[Order.itemId] = (Count[Order.itemId] || 0) + 1;
    return Count;
  }, [store.orders]);
  const Items = useMemo(() => {
    const List = Within ? store.items.filter((Item) => Item.canUnlock) : [...store.items];
    return List.sort((A, B) => (HighFirst ? B.price - A.price : A.price - B.price) || A.name.localeCompare(B.name));
  }, [store.items, Within, HighFirst]);
  const CanCount = store.items.filter((Item) => Item.canUnlock).length;

  return (
    <section className="se-rw-shelf-wrap" aria-label="Rewards">
      <div className="se-rw-filters">
        <div className="se-rw-filter-group" role="group" aria-label="Show">
          <button type="button" className={`se-seg se-rw-seg ${!Within ? "se-seg-on" : ""}`} aria-pressed={!Within} onClick={() => SetWithin(false)}>
            All Rewards <span className="se-rw-seg-count">{store.items.length}</span>
          </button>
          <button type="button" className={`se-seg se-rw-seg ${Within ? "se-seg-on" : ""}`} aria-pressed={Within} onClick={() => SetWithin(true)}>
            I Can Unlock <span className="se-rw-seg-count">{CanCount}</span>
          </button>
        </div>
        <button type="button" className="se-seg se-rw-seg se-rw-sort" onClick={() => SetHighFirst((Value) => !Value)} aria-label={HighFirst ? "Showing highest price first" : "Showing lowest price first"}>
          {HighFirst ? <ArrowDownWideNarrow size={16} /> : <ArrowUpNarrowWide size={16} />}
          {HighFirst ? "Price: High To Low" : "Price: Low To High"}
        </button>
      </div>
      {Items.length ? (
        <ul className="se-rw-shelf">
          {Items.map((Item) => (
            <RewardCard key={Item.id} item={Item} mine={Mine[Item.id] || 0} onOpen={() => onOpen(Item)} />
          ))}
        </ul>
      ) : (
        <div className="se-rw-empty">
          <Sparkles size={22} />
          <p className="se-rw-empty-title">{Within ? "Nothing to unlock just yet" : "The store is being stocked"}</p>
          <p>{Within ? "Keep going: every sheet you finish brings the next reward closer." : "New rewards are on their way. Check back soon."}</p>
          {Within ? <button type="button" className="se-rw-btn se-rw-btn-quiet" onClick={() => SetWithin(false)}>See All Rewards</button> : null}
        </div>
      )}
    </section>
  );
}

// ---------- the reward sheet and the unlock moment --------------------------------------

function useDialog(onClose: () => void) {
  useEffect(() => {
    const OnKey = (Event: KeyboardEvent) => {
      if (Event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", OnKey);
    const Overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", OnKey);
      document.body.style.overflow = Overflow;
    };
  }, [onClose]);
}

function PickupTicket({ order, fresh = false }: { order: RewardOrder; fresh?: boolean }) {
  return (
    <div className={`se-rw-ticket${fresh ? " is-fresh" : ""}`}>
      <div className="se-rw-ticket-main">
        <p className="se-rw-ticket-label">Pickup Code</p>
        <p className="se-rw-ticket-code" aria-label={`Pickup code ${order.pickupCode.split("").join(" ")}`}>{order.pickupCode}</p>
        <p className="se-rw-ticket-hint">Show this code at the centre to collect your reward.</p>
      </div>
      <div className="se-rw-ticket-stub">
        <p className="se-rw-ticket-item">{order.itemName}</p>
        <p className="se-rw-ticket-meta"><CoinGlyph size={14} /> {Coins(order.price)} · {IndiaDate(order.unlockedAt)}</p>
      </div>
      {fresh ? <span className="se-rw-stamp" aria-hidden="true">Unlocked</span> : null}
    </div>
  );
}

function CoinShower() {
  // sixteen coins rain down across the stage into the reward, one after another
  return (
    <span className="se-rw-shower" aria-hidden="true">
      {Array.from({ length: 16 }, (_, Index) => (
        <span
          key={Index}
          className="se-rw-shower-coin"
          style={{ ["--i" as string]: Index, ["--x" as string]: `${((Index * 53) % 260) - 130}px`, ["--r" as string]: `${(Index % 2 ? 1 : -1) * (200 + Index * 23)}deg` }}
        >
          <CoinGlyph size={18 + ((Index * 7) % 14)} />
        </span>
      ))}
    </span>
  );
}

function RewardSheet({ item, store, onClose, onSeeMine }: { item: StoreItem; store: StoreData; onClose: () => void; onSeeMine: () => void }) {
  const Client = useQueryClient();
  const [Step, SetStep] = useState<"view" | "confirm" | "done">("view");
  const [Error, SetError] = useState<string | null>(null);
  const [Done, SetDone] = useState<RewardOrder | null>(null);
  const KeyRef = useRef<string | null>(null);
  const PrimaryRef = useRef<HTMLButtonElement>(null);
  const Live = store.items.find((Each) => Each.id === item.id) || item;
  useDialog(onClose);

  useEffect(() => {
    PrimaryRef.current?.focus({ preventScroll: true });
  }, [Step]);

  const Unlock = useMutation({
    mutationFn: () => unlockReward(Live.id, KeyRef.current || (KeyRef.current = newRequestKey())),
    onSuccess: (Data) => {
      Client.setQueryData(STORE_KEY, Data.store);
      Client.invalidateQueries({ queryKey: ["student-coin-history"] });
      SetDone(Data.order);
      SetStep("done");
    },
    onError: (Problem) => {
      SetError(apiErrorMessage(Problem));
      KeyRef.current = null;
      Client.invalidateQueries({ queryKey: STORE_KEY });
      SetStep("view");
    },
  });

  const Goal = useMutation({
    mutationFn: (ItemId: string | null) => setRewardGoal(ItemId),
    onSuccess: (Data) => Client.setQueryData(STORE_KEY, Data),
    onError: (Problem) => SetError(apiErrorMessage(Problem)),
  });

  const After = store.balance - Live.price;
  const Still = ReducedMotion();

  return createPortal(
    <div className="se-portal se-rw-backdrop" onMouseDown={(Event) => { if (Event.target === Event.currentTarget && !Unlock.isPending) onClose(); }}>
      <div className={`se-rw-sheet is-${Step}`} role="dialog" aria-modal="true" aria-labelledby="se-rw-sheet-title">
        <button type="button" className="se-rw-close" onClick={onClose} aria-label="Close" disabled={Unlock.isPending}>
          <X size={18} />
        </button>

        {Step === "done" && Done ? (
          <div className="se-rw-moment">
            <div className="se-rw-moment-stage">
              <span className="se-rw-rays" aria-hidden="true" />
              {!Still ? <CoinShower /> : null}
              <Photo url={Done.imageUrl} name={Done.itemName} className="se-rw-moment-photo" />
            </div>
            <div className="se-rw-moment-body">
              <h2 id="se-rw-sheet-title" className="se-rw-moment-title">It&apos;s Yours!</h2>
              <p className="se-rw-moment-text">You unlocked <strong>{Done.itemName}</strong>. We&apos;ll tell you when it&apos;s ready to collect.</p>
              <PickupTicket order={Done} fresh />
              <div className="se-rw-actions">
                <button ref={PrimaryRef} type="button" className="se-rw-btn se-rw-btn-gold" onClick={onSeeMine}>
                  <Ticket size={16} /> See My Rewards
                </button>
                <button type="button" className="se-rw-btn se-rw-btn-quiet" onClick={onClose}>Back To The Store</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="se-rw-sheet-grid">
            <div className={`se-rw-sheet-case${!Live.inStock ? " is-out" : ""}`}>
              <Photo url={Live.imageUrl} name={Live.name} />
            </div>
            <div className="se-rw-sheet-body">
              {Live.isGoal ? <p className="se-rw-sheet-goal"><Target size={14} /> My Goal</p> : null}
              <h2 id="se-rw-sheet-title" className="se-rw-sheet-title">{Live.name}</h2>
              {Live.description ? <p className="se-rw-sheet-desc">{Live.description}</p> : null}
              <div className="se-rw-sheet-price">
                <CoinRing progress={Live.progress} size={54} />
                <span>
                  <span className="se-rw-sheet-price-value">{Coins(Live.price)}</span>
                  <span className="se-rw-sheet-price-label">MathCoins</span>
                </span>
              </div>

              {Step === "confirm" ? (
                <div className="se-rw-confirm" role="group" aria-label="Confirm unlock">
                  <p className="se-rw-confirm-q">Unlock for <strong>{Coins(Live.price)}</strong> coins?</p>
                  <p className="se-rw-confirm-a">You&apos;ll have <strong>{Coins(After)}</strong> coins left. You can cancel it until it&apos;s ready at the centre.</p>
                  <div className="se-rw-actions">
                    <button ref={PrimaryRef} type="button" className="se-rw-btn se-rw-btn-gold" onClick={() => { SetError(null); Unlock.mutate(); }} disabled={Unlock.isPending}>
                      {Unlock.isPending ? "Unlocking…" : "Yes, Unlock It"}
                    </button>
                    <button type="button" className="se-rw-btn se-rw-btn-quiet" onClick={() => SetStep("view")} disabled={Unlock.isPending}>Not Now</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="se-rw-sheet-balance">
                    {!Live.inStock ? (
                      <>This reward is not available right now. It will be back, so you can still make it your goal.</>
                    ) : Live.canUnlock ? (
                      <>You have <strong>{Coins(store.balance)}</strong> coins. After unlocking, you&apos;ll have <strong>{Coins(After)}</strong>.</>
                    ) : (
                      <>You have <strong>{Coins(store.balance)}</strong> coins: <strong>{Coins(Live.coinsToGo)}</strong> more to go.</>
                    )}
                  </p>
                  <div className="se-rw-actions">
                    {Live.canUnlock ? (
                      <button ref={PrimaryRef} type="button" className="se-rw-btn se-rw-btn-gold" onClick={() => { SetError(null); SetStep("confirm"); }}>
                        <Sparkles size={16} /> Unlock
                      </button>
                    ) : null}
                    <button
                      ref={Live.canUnlock ? undefined : PrimaryRef}
                      type="button"
                      className={`se-rw-btn ${Live.isGoal ? "se-rw-btn-quiet" : Live.canUnlock ? "se-rw-btn-quiet" : "se-rw-btn-gold"}`}
                      onClick={() => Goal.mutate(Live.isGoal ? null : Live.id)}
                      disabled={Goal.isPending}
                    >
                      {Live.isGoal ? <><RotateCcw size={16} /> Remove As My Goal</> : <><Target size={16} /> Set As My Goal</>}
                    </button>
                  </div>
                </>
              )}
              {Error ? <p className="se-rw-error" role="alert">{Error}</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------- My Rewards -----------------------------------------------------------------

const STEP_ORDER: Record<string, number> = { UNLOCKED: 0, READY: 1, COLLECTED: 2 };

function Steps({ order }: { order: RewardOrder }) {
  const Now = STEP_ORDER[order.status] ?? -1;
  const Labels = [
    ["Unlocked", order.unlockedAt],
    ["Ready At The Centre", order.readyAt],
    ["Collected", order.collectedAt],
  ] as const;
  return (
    <ol className="se-rw-steps">
      {Labels.map(([Label, At], Index) => (
        <li key={Label} className={Index <= Now ? "is-done" : ""} aria-current={Index === Now ? "step" : undefined}>
          <span className="se-rw-step-dot">{Index <= Now ? <Check size={11} strokeWidth={3} /> : null}</span>
          <span className="se-rw-step-text">
            <span className="se-rw-step-label">{Label}</span>
            {Index <= Now && At ? <span className="se-rw-step-date">{IndiaDate(At)}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OrderRow({ order }: { order: RewardOrder }) {
  const Client = useQueryClient();
  const [Asking, SetAsking] = useState(false);
  const [Error, SetError] = useState<string | null>(null);
  const Cancel = useMutation({
    mutationFn: () => cancelReward(order.id),
    onSuccess: (Data) => {
      Client.setQueryData(STORE_KEY, Data.store);
      Client.invalidateQueries({ queryKey: ["student-coin-history"] });
      SetAsking(false);
    },
    onError: (Problem) => {
      SetError(apiErrorMessage(Problem));
      Client.invalidateQueries({ queryKey: STORE_KEY });
    },
  });
  const Closed = order.status === "CANCELLED" || order.status === "REJECTED";

  return (
    <li className={`se-rw-order is-${order.status.toLowerCase()}`}>
      <Photo url={order.imageUrl} name={order.itemName} className="se-rw-order-photo" />
      <div className="se-rw-order-body">
        <div className="se-rw-order-head">
          <p className="se-rw-order-name">{order.itemName}</p>
          <p className="se-rw-order-price"><CoinGlyph size={15} /> {Coins(order.price)}</p>
        </div>
        {Closed ? (
          <p className="se-rw-order-closed">
            <RotateCcw size={14} />
            {order.status === "CANCELLED" ? "You cancelled this" : "Not possible this time"}
            {" · "}{Coins(order.price)} coins returned{order.closedAt ? ` · ${IndiaDate(order.closedAt)}` : ""}
            {order.status === "REJECTED" && order.closeReason ? <span className="se-rw-order-reason">{order.closeReason}</span> : null}
          </p>
        ) : (
          <Steps order={order} />
        )}
        {Error ? <p className="se-rw-error" role="alert">{Error}</p> : null}
      </div>
      {!Closed && order.status !== "COLLECTED" ? (
        <div className="se-rw-order-side">
          <p className="se-rw-order-code-label">Pickup Code</p>
          <p className="se-rw-order-code">{order.pickupCode}</p>
          {order.status === "READY" ? <p className="se-rw-order-ready"><PackageCheck size={14} /> Ready to collect</p> : null}
          {order.canCancel ? (
            Asking ? (
              <div className="se-rw-order-confirm">
                <p>Cancel and get <strong>{Coins(order.price)}</strong> coins back?</p>
                <div className="se-rw-actions">
                  <button type="button" className="se-rw-btn se-rw-btn-small se-rw-btn-danger" onClick={() => Cancel.mutate()} disabled={Cancel.isPending}>
                    {Cancel.isPending ? "Cancelling…" : "Yes, Cancel"}
                  </button>
                  <button type="button" className="se-rw-btn se-rw-btn-small se-rw-btn-quiet" onClick={() => SetAsking(false)} disabled={Cancel.isPending}>Keep It</button>
                </div>
              </div>
            ) : (
              <button type="button" className="se-rw-btn se-rw-btn-small se-rw-btn-quiet" onClick={() => { SetError(null); SetAsking(true); }}>Cancel</button>
            )
          ) : null}
        </div>
      ) : order.status === "COLLECTED" ? (
        <div className="se-rw-order-side">
          <p className="se-rw-order-done"><Check size={16} strokeWidth={3} /> Enjoy it!</p>
        </div>
      ) : null}
    </li>
  );
}

function MyRewards({ store, onShop }: { store: StoreData; onShop: () => void }) {
  const Open = store.orders.filter((Order) => Order.status === "UNLOCKED" || Order.status === "READY");
  const Past = store.orders.filter((Order) => !(Order.status === "UNLOCKED" || Order.status === "READY"));
  if (!store.orders.length) {
    return (
      <div className="se-rw-empty">
        <Gift size={22} />
        <p className="se-rw-empty-title">No rewards yet</p>
        <p>Pick a reward from the store. When you unlock it, its pickup code will be here.</p>
        <button type="button" className="se-rw-btn se-rw-btn-gold" onClick={onShop}><Store size={16} /> Go To The Store</button>
      </div>
    );
  }
  return (
    <div className="se-rw-mine">
      {Open.length ? (
        <section aria-label="On their way">
          <h2 className="se-rw-h2">On Their Way</h2>
          <ul className="se-rw-orders">{Open.map((Order) => <OrderRow key={Order.id} order={Order} />)}</ul>
        </section>
      ) : null}
      {Past.length ? (
        <section aria-label="Earlier">
          <h2 className="se-rw-h2">Earlier</h2>
          <ul className="se-rw-orders">{Past.map((Order) => <OrderRow key={Order.id} order={Order} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}

// ---------- Coin History -----------------------------------------------------------------

function CoinHistoryList() {
  const [Pages, SetPages] = useState<CoinEntry[][]>([]);
  const [Next, SetNext] = useState<string | null>(null);
  const [More, SetMore] = useState(false);
  const First = useQuery({ queryKey: ["student-coin-history"], queryFn: () => getCoinHistory(null), staleTime: 30_000 });
  const Older = useMutation({ mutationFn: (Before: string) => getCoinHistory(Before) });

  useEffect(() => {
    if (!First.data) return;
    SetPages([First.data.entries]);
    SetNext(First.data.next);
    SetMore(First.data.more);
  }, [First.data]);

  const LoadMore = () => {
    if (!Next) return;
    Older.mutate(Next, {
      onSuccess: (Data) => {
        SetPages((Previous) => [...Previous, Data.entries]);
        SetNext(Data.next);
        SetMore(Data.more);
      },
    });
  };

  if (First.isLoading) return <LoadingState label="Loading your coin history..." />;
  if (First.error) return <ErrorState message={apiErrorMessage(First.error)} />;
  const Entries = Pages.flat();
  if (!Entries.length) {
    return (
      <div className="se-rw-empty">
        <History size={22} />
        <p className="se-rw-empty-title">No coins yet</p>
        <p>Finish a DPS sheet with 50% or more to earn your first MathCoins.</p>
      </div>
    );
  }
  const Days: { day: string; rows: CoinEntry[] }[] = [];
  for (const Entry of Entries) {
    const Day = IndiaDate(Entry.at);
    const Last = Days[Days.length - 1];
    if (Last && Last.day === Day) Last.rows.push(Entry);
    else Days.push({ day: Day, rows: [Entry] });
  }
  return (
    <div className="se-rw-history">
      {Days.map((Group) => (
        <section key={Group.day} className="se-rw-day" aria-label={Group.day}>
          <h3 className="se-rw-day-title">{Group.day}</h3>
          <ul className="se-rw-ledger">
            {Group.rows.map((Row) => (
              <li key={Row.id} className={`se-rw-entry is-${Row.coins < 0 ? "out" : Row.type === "REFUND" ? "back" : "in"}`}>
                <span className="se-rw-entry-icon" aria-hidden="true">{Row.coins < 0 ? <Gift size={15} /> : Row.type === "REFUND" ? <RotateCcw size={15} /> : <CoinGlyph size={18} />}</span>
                <span className="se-rw-entry-label">{Row.label}</span>
                <span className="se-rw-entry-coins">{Row.coins > 0 ? "+" : "−"}{Coins(Math.abs(Row.coins))}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {More ? (
        <button type="button" className="se-rw-btn se-rw-btn-quiet se-rw-more" onClick={LoadMore} disabled={Older.isPending}>
          {Older.isPending ? "Loading…" : "Show Earlier"}
        </button>
      ) : null}
    </div>
  );
}

// ---------- the page --------------------------------------------------------------------

export function RewardStorePage() {
  const Query = useQuery({ queryKey: STORE_KEY, queryFn: getRewardStore, staleTime: 20_000 });
  const [TabValue, SetTab] = useUrlTabState<Tab>("tab", TABS, "store");
  const [OpenId, SetOpenId] = useState<string | null>(null);
  const Data = Query.data;

  // ?item=<id> opens a reward straight away (the dashboard goal pill uses it)
  useEffect(() => {
    if (!Data) return;
    const Wanted = new URLSearchParams(window.location.search).get("item");
    if (Wanted && Data.items.some((Item) => Item.id === Wanted)) SetOpenId(Wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(Data)]);

  const Close = useCallback(() => {
    SetOpenId(null);
    const Url = new URL(window.location.href);
    if (Url.searchParams.has("item")) {
      Url.searchParams.delete("item");
      window.history.replaceState(null, "", `${Url.pathname}${Url.search}`);
    }
  }, []);

  if (Query.isLoading) return <LoadingState label="Opening the Reward Store..." />;
  if (Query.error || !Data) return <ErrorState message={apiErrorMessage(Query.error)} />;
  const OpenItem = OpenId ? Data.items.find((Item) => Item.id === OpenId) || null : null;
  const OpenCount = Data.counts.unlocked + Data.counts.ready;

  return (
    <main className="math-dashboard-page math-dashboard-student se-rw w-full">
      <Window store={Data} onOpen={(Item) => SetOpenId(Item.id)} />

      <nav className="se-rw-tabs" aria-label="Reward Store sections">
        <button type="button" className={`se-seg se-rw-tab ${TabValue === "store" ? "se-seg-on" : ""}`} aria-pressed={TabValue === "store"} onClick={() => SetTab("store")}>
          <Store size={16} /> Store
        </button>
        <button type="button" className={`se-seg se-rw-tab ${TabValue === "mine" ? "se-seg-on" : ""}`} aria-pressed={TabValue === "mine"} onClick={() => SetTab("mine")}>
          <Ticket size={16} /> My Rewards{OpenCount ? <span className="se-rw-seg-count">{OpenCount}</span> : null}
        </button>
        <button type="button" className={`se-seg se-rw-tab ${TabValue === "history" ? "se-seg-on" : ""}`} aria-pressed={TabValue === "history"} onClick={() => SetTab("history")}>
          <History size={16} /> Coin History
        </button>
      </nav>

      {TabValue === "store" ? <Shelf store={Data} onOpen={(Item) => SetOpenId(Item.id)} /> : null}
      {TabValue === "mine" ? <MyRewards store={Data} onShop={() => SetTab("store")} /> : null}
      {TabValue === "history" ? <CoinHistoryList /> : null}

      {OpenItem ? <RewardSheet key={OpenItem.id} item={OpenItem} store={Data} onClose={Close} onSeeMine={() => { Close(); SetTab("mine"); window.scrollTo({ top: 0, behavior: ReducedMotion() ? "auto" : "smooth" }); }} /> : null}
    </main>
  );
}

/** Under the dashboard title: the student's goal, one tap from the store. */
export function RewardGoalPill() {
  const Query = useQuery({ queryKey: STORE_KEY, queryFn: getRewardStore, staleTime: 60_000, retry: false });
  const Goal = Query.data?.goal;
  const Ready = Query.data?.counts.ready || 0;
  if (!Query.data) return null;
  if (Ready) {
    return (
      <Link href="/student/rewards?tab=mine" className="se-rw-pill is-ready">
        <span className="se-rw-pill-icon"><PackageCheck size={15} /></span>
        <span className="se-rw-pill-text">{Ready === 1 ? "A Reward Is Ready To Collect" : `${Ready} Rewards Are Ready To Collect`}</span>
      </Link>
    );
  }
  if (!Goal) return null;
  return (
    <Link href={`/student/rewards?item=${encodeURIComponent(Goal.id)}`} className={`se-rw-pill${Goal.canUnlock ? " is-ready" : ""}`}>
      <span className="se-rw-pill-icon"><Target size={15} /></span>
      <span className="se-rw-pill-text">
        My Goal · {Goal.name}
        <span className="se-rw-pill-togo">{Goal.canUnlock ? " · Unlock It Now" : !Goal.inStock ? " · Not available right now" : ` · ${Coins(Goal.coinsToGo)} more coins`}</span>
      </span>
    </Link>
  );
}
