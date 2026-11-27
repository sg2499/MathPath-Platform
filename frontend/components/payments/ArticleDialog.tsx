"use client";

// 2026-11-27 (billing Release 2): a fee item's item details -- what kind of
// thing it is, its code, whether stock is counted, the level a book is for,
// the unit and cost, whether it is in the free admission kit -- and a price
// change from a chosen date (client answer F6).
import { FieldLabel, InlineError, PaymentsDialog } from "@/components/payments/PaymentsUi";
import { ARTICLE_KIND_LABELS, cancelScheduledPrice, schedulePrice, updateArticle, type ArticleFeeItem, type ArticleKind } from "@/lib/api/billing";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function FormatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ArticleChip({ item }: { item: ArticleFeeItem }) {
  if (!item.articleKind || item.articleKind === "OTHER") return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{ARTICLE_KIND_LABELS[item.articleKind]}</span>
      {item.levelCode ? <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{item.levelCode}</span> : null}
      {item.isStock ? <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">Stock</span> : null}
      {item.inKit ? <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">Kit</span> : null}
      {item.upcomingPrices?.length ? <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{item.upcomingPrices[0].amountDisplay} from {FormatDate(item.upcomingPrices[0].effectiveFrom)}</span> : null}
    </span>
  );
}

export function ArticleDialog({ item, onClose }: { item: ArticleFeeItem | null; onClose: () => void }) {
  if (!item) return null;
  return <ArticleDialogInner key={item.feeItemId} item={item} onClose={onClose} />;
}

function ArticleDialogInner({ item, onClose }: { item: ArticleFeeItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const monthly = item.billingType === "MONTHLY";
  const [kind, setKind] = useState<ArticleKind>(item.articleKind ?? (monthly ? "TUITION" : "OTHER"));
  const [sku, setSku] = useState(item.sku ?? "");
  const [isStock, setIsStock] = useState(Boolean(item.isStock));
  const [levelCode, setLevelCode] = useState(item.levelCode ?? "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [cost, setCost] = useState(item.cost ? item.cost.replace(/\.00$/, "") : "");
  const [inKit, setInKit] = useState(Boolean(item.inKit));
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [current, setCurrent] = useState<ArticleFeeItem>(item);

  const refresh = (next: ArticleFeeItem) => {
    setCurrent(next);
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "fee-items"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "inventory"] });
  };
  const save = useMutation({
    mutationFn: () =>
      updateArticle(item.feeItemId, {
        ...(monthly ? {} : { articleKind: kind }),
        sku: sku.trim() || null,
        isStock: kind === "BOOK" || kind === "MERCH" || kind === "OTHER" ? isStock : false,
        levelCode: kind === "BOOK" ? levelCode.trim() || null : null,
        unit: unit.trim() || null,
        cost: cost.trim() || null,
        inKit: kind === "MERCH" ? inKit : false,
      }),
    onSuccess: (next) => { refresh(next); setSaved("Item details saved."); },
  });
  const reprice = useMutation({
    mutationFn: () => schedulePrice(item.feeItemId, { amount: price, effectiveFrom: from || TodayInIndia(), reason: reason.trim() || null }),
    onSuccess: (next) => { refresh(next); setSaved(from && from > TodayInIndia() ? `New price saved from ${FormatDate(from)}.` : "New price applies from today."); setPrice(""); setFrom(""); setReason(""); },
  });
  const unschedule = useMutation({ mutationFn: (priceId: string) => cancelScheduledPrice(priceId), onSuccess: (next) => { refresh(next); setSaved("Price change taken back."); } });

  return (
    <PaymentsDialog
      open
      wide
      kicker="Item Details"
      title={item.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="math-button-secondary" onClick={onClose}>Close</button>
          <button type="button" className="math-button-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Save Details</button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>Kind</FieldLabel>
            <select className="math-input" value={kind} disabled={monthly} onChange={(event) => setKind(event.target.value as ArticleKind)}>
              {(Object.keys(ARTICLE_KIND_LABELS) as ArticleKind[]).filter((key) => (monthly ? key === "TUITION" : key !== "TUITION")).map((key) => <option key={key} value={key}>{ARTICLE_KIND_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="block">
            <FieldLabel hint="optional">Code (SKU)</FieldLabel>
            <input className="math-input uppercase" value={sku} maxLength={40} onChange={(event) => setSku(event.target.value)} placeholder="e.g. BK-PM1" />
          </label>
          {kind === "BOOK" ? (
            <label className="block">
              <FieldLabel hint="raised after the level before it is cleared">Book For Level</FieldLabel>
              <input className="math-input uppercase" value={levelCode} maxLength={40} onChange={(event) => setLevelCode(event.target.value)} placeholder="e.g. PM-L1" />
            </label>
          ) : null}
          <label className="block">
            <FieldLabel hint="optional">Unit</FieldLabel>
            <input className="math-input" value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} placeholder="e.g. set, pc" />
          </label>
          <label className="block">
            <FieldLabel hint="what MathPath pays">Cost (₹)</FieldLabel>
            <input className="math-input tabular-nums" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
          </label>
        </div>
        {kind === "BOOK" || kind === "MERCH" || kind === "OTHER" ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={isStock} onChange={(event) => setIsStock(event.target.checked)} />
            <span>
              <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Count stock for this item</span>
              <span className="block text-xs font-semibold text-slate-500">A sale takes it from stock; while stock is counted, a sale needing more than the centre holds is refused.</span>
            </span>
          </label>
        ) : null}
        {kind === "MERCH" ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={inKit} onChange={(event) => setInKit(event.target.checked)} />
            <span>
              <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Part of the free admission kit</span>
              <span className="block text-xs font-semibold text-slate-500">Added to a New Admission at ₹0 (one each).</span>
            </span>
          </label>
        ) : null}

        <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><CalendarClock size={15} />Change The Price From A Date</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Now {current.amountDisplay}. Invoices dated before the change keep the old price; invoices already raised never change.</p>
          {current.upcomingPrices?.length ? (
            <ul className="mt-3 grid gap-2">
              {current.upcomingPrices.map((row) => (
                <li key={row.priceId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <span>{row.amountDisplay} from {FormatDate(row.effectiveFrom)}{row.reason ? ` · ${row.reason}` : ""}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-black underline" disabled={unschedule.isPending} onClick={() => unschedule.mutate(row.priceId)}><X size={12} />Take Back</button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block"><FieldLabel>New Price (₹)</FieldLabel><input className="math-input tabular-nums" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <label className="block"><FieldLabel hint="today if empty">From</FieldLabel><input type="date" className="math-input" value={from} min={TodayInIndia()} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="block"><FieldLabel hint="optional">Reason</FieldLabel><input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. new session" /></label>
          </div>
          <button type="button" className="math-button-secondary mt-3" disabled={!price.trim() || reprice.isPending} onClick={() => reprice.mutate()}>{reprice.isPending ? <Loader2 size={17} className="animate-spin" /> : <CalendarClock size={17} />}Save New Price</button>
        </div>
        {saved ? <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{saved}</p> : null}
        <InlineError error={save.error || reprice.error || unschedule.error} />
      </div>
    </PaymentsDialog>
  );
}
