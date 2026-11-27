"use client";

// 2026-11-27 (billing Release 2, Shailesh): Inventory -- books and kit at
// each centre (client document §8, answers G1-G9).
//
//   Stock      what each centre holds, low stock, and the four ways stock
//              changes by hand: opening count, stock received, transfer,
//              write-off. Sales take stock on their own.
//   Movements  every change, never edited, with Excel.
//   Book Queue the next level's book for students who cleared a level.
//   Setup      the tracking switch, low-stock level, which centres keep
//              stock, and automatic book invoices.
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { FieldLabel, InlineError, PaymentsDialog, PaymentsLoading, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  downloadBookQueueExcel,
  downloadStockExcel,
  getBookQueue,
  getInventorySettings,
  getStockSummary,
  listStockMovements,
  MOVEMENT_TYPE_LABELS,
  raiseBooks,
  recordStock,
  reopenBook,
  skipBook,
  updateInventorySettings,
  type BookTask,
  type MovementFilters,
  type StockItemRow,
} from "@/lib/api/billing";
import { saveBlob } from "@/lib/api/payments";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  PackageMinus,
  PackagePlus,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const KEY = ["admin", "payments", "inventory"] as const;

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Notice({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null;
  return (
    <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
      <span>{text}</span>
      <button type="button" className="text-xs font-black underline" onClick={onClose}>Dismiss</button>
    </div>
  );
}

function TrackingBanner({ on }: { on: boolean }) {
  if (on) return null;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <span>
        Stock is not being counted yet: sales do not take stock and nothing is blocked. Enter each centre&apos;s opening stock, then switch tracking on in{" "}
        <Link href="/admin/payments/inventory?tab=setup" className="underline">Setup</Link>.
      </span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Stock
// --------------------------------------------------------------------------

type StockAction = "opening" | "inward" | "transfer" | "write-off";
const ACTION_TITLES: Record<StockAction, { title: string; kicker: string; button: string }> = {
  opening: { title: "Enter the opening stock", kicker: "Opening Stock", button: "Save Counts" },
  inward: { title: "Record stock received", kicker: "Stock In", button: "Add To Stock" },
  transfer: { title: "Move stock between centres", kicker: "Transfer", button: "Move Stock" },
  "write-off": { title: "Write off damaged or lost stock", kicker: "Write Off", button: "Write Off" },
};

type ActionLine = { key: number; feeItemId: string; quantity: string; unitCost: string };

function StockActionDialog({ action, items, centres, onClose, onDone }: { action: StockAction | null; items: StockItemRow[]; centres: { centreId: string; name: string }[]; onClose: () => void; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const [centreId, setCentreId] = useState("");
  const [toCentreId, setToCentreId] = useState("");
  const [day, setDay] = useState(TodayInIndia());
  const [supplier, setSupplier] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ActionLine[]>([{ key: 1, feeItemId: "", quantity: "", unitCost: "" }]);
  const from = centreId || centres[0]?.centreId || "";
  const valid = lines.filter((line) => line.feeItemId && line.quantity !== "" && (action === "opening" || Number(line.quantity) > 0));
  const mutation = useMutation({
    mutationFn: () =>
      recordStock(action as StockAction, {
        centreId: action === "transfer" ? undefined : from,
        fromCentreId: action === "transfer" ? from : undefined,
        toCentreId: action === "transfer" ? toCentreId : undefined,
        date: day,
        supplier: supplier.trim() || undefined,
        billNumber: billNumber.trim() || undefined,
        reason: reason.trim() || undefined,
        note: action === "transfer" ? reason.trim() || undefined : undefined,
        lines: valid.map((line) => ({ feeItemId: line.feeItemId, quantity: Number(line.quantity), unitCost: line.unitCost.trim() || null })),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
      onDone(`${ACTION_TITLES[action as StockAction].kicker}: ${result.recorded} item${result.recorded === 1 ? "" : "s"} saved.`);
      setLines([{ key: Date.now(), feeItemId: "", quantity: "", unitCost: "" }]);
      setSupplier("");
      setBillNumber("");
      setReason("");
    },
  });
  if (!action) return null;
  const meta = ACTION_TITLES[action];
  const held = (feeItemId: string, centre: string) => items.find((row) => row.feeItemId === feeItemId)?.centres.find((row) => row.centreId === centre)?.quantity ?? 0;
  const ready = valid.length > 0 && from && (action !== "transfer" || (toCentreId && toCentreId !== from)) && (action !== "write-off" || reason.trim());
  return (
    <PaymentsDialog
      open
      wide
      kicker={meta.kicker}
      title={meta.title}
      onClose={() => { if (!mutation.isPending) onClose(); }}
      footer={
        <>
          <button type="button" className="math-button-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="math-button-primary" disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{meta.button}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <FieldLabel>{action === "transfer" ? "From Centre" : "Centre"}</FieldLabel>
            <select className="math-input" value={from} onChange={(event) => setCentreId(event.target.value)}>
              {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
            </select>
          </label>
          {action === "transfer" ? (
            <label className="block">
              <FieldLabel>To Centre</FieldLabel>
              <select className="math-input" value={toCentreId} onChange={(event) => setToCentreId(event.target.value)}>
                <option value="">Choose</option>
                {centres.filter((centre) => centre.centreId !== from).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="block">
            <FieldLabel>Date</FieldLabel>
            <input type="date" className="math-input" value={day} max={TodayInIndia()} onChange={(event) => setDay(event.target.value || TodayInIndia())} />
          </label>
        </div>
        {action === "inward" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><FieldLabel hint="optional">Supplier</FieldLabel><input className="math-input" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="e.g. Sharma Printers" /></label>
            <label className="block"><FieldLabel hint="optional">Bill Number</FieldLabel><input className="math-input" value={billNumber} onChange={(event) => setBillNumber(event.target.value)} /></label>
          </div>
        ) : null}
        {action === "opening" ? (
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Enter what is on the shelf now. Each count replaces the item&apos;s current number at this centre, and the difference is kept in the movements.</p>
        ) : null}
        <ul className="grid gap-2">
          {lines.map((line) => (
            <li key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-end">
              <label className="block min-w-0">
                <FieldLabel hint={line.feeItemId && from ? `${held(line.feeItemId, from)} now` : undefined}>Item</FieldLabel>
                <select className="math-input" value={line.feeItemId} onChange={(event) => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...row, feeItemId: event.target.value } : row)))}>
                  <option value="">Choose an item</option>
                  {items.filter((item) => item.isActive).map((item) => <option key={item.feeItemId} value={item.feeItemId}>{item.name}{item.sku ? ` (${item.sku})` : ""}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel>{action === "opening" ? "Count" : "Quantity"}</FieldLabel>
                <input className="math-input tabular-nums" inputMode="numeric" value={line.quantity} onChange={(event) => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...row, quantity: event.target.value.replace(/\D/g, "").slice(0, 6) } : row)))} />
              </label>
              {action === "inward" ? (
                <label className="block">
                  <FieldLabel hint="optional">Cost Each (₹)</FieldLabel>
                  <input className="math-input tabular-nums" inputMode="decimal" value={line.unitCost} onChange={(event) => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...row, unitCost: event.target.value } : row)))} />
                </label>
              ) : <span className="hidden sm:block" />}
              <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" disabled={lines.length === 1} onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))} aria-label="Remove this item"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        <button type="button" className="math-button-secondary w-fit" onClick={() => setLines((rows) => [...rows, { key: Date.now(), feeItemId: "", quantity: "", unitCost: "" }])}><Plus size={16} />Add Item</button>
        {action === "write-off" || action === "transfer" ? (
          <label className="block">
            <FieldLabel hint={action === "write-off" ? "required" : "optional"}>{action === "write-off" ? "Why" : "Note"}</FieldLabel>
            <input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "write-off" ? "e.g. water damage" : "e.g. for the new batch"} />
          </label>
        ) : null}
        <InlineError error={mutation.error} />
      </div>
    </PaymentsDialog>
  );
}

export function StockPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [action, setAction] = useState<StockAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const query = useQuery({ queryKey: [...KEY, "summary"], queryFn: getStockSummary, enabled: ready });
  const excel = useMutation({ mutationFn: () => downloadStockExcel({}), onSuccess: (blob) => saveBlob(blob, `MathPath-Stock-${TodayInIndia()}.xlsx`) });
  if (!ready) return null;
  const data = query.data;
  const items = (data?.items ?? []).filter((item) => !onlyLow || item.centres.some((centre) => centre.isLow));
  const total = data?.items.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const value = data?.items.reduce((sum, item) => sum + item.valuePaise, 0) ?? 0;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><Boxes size={14} />Inventory</p>
            <h1 className="math-title">Stock</h1>
            <p className="math-subtitle">Books and kit at each centre. A sale takes stock as the invoice is raised; a cancelled invoice puts it back.</p>
            <HeroSearch />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:shrink-0">
            <PaymentsMetric label="In Stock" value={total.toLocaleString("en-IN")} icon={<Boxes size={14} />} tone="cyan" />
            <PaymentsMetric label="Low" value={data?.lowCount ?? "—"} icon={<AlertTriangle size={14} />} tone="amber" />
            <PaymentsMetric label="At Cost" value={<span className="text-lg sm:text-xl">₹{(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>} icon={<PackagePlus size={14} />} tone="emerald" />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="math-button-primary" onClick={() => setAction("inward")}><PackagePlus size={17} />Stock In</button>
            <button type="button" className="math-button-secondary" onClick={() => setAction("transfer")}><ArrowRightLeft size={17} />Transfer</button>
            <button type="button" className="math-button-secondary" onClick={() => setAction("write-off")}><PackageMinus size={17} />Write Off</button>
            <button type="button" className="math-button-secondary" onClick={() => setAction("opening")}><ClipboardList size={17} />Opening Stock</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4" checked={onlyLow} onChange={(event) => setOnlyLow(event.target.checked)} />
              Only low stock (at or under {data?.lowStockThreshold ?? 5})
            </label>
            <button type="button" className="math-button-secondary" disabled={excel.isPending} onClick={() => excel.mutate()}>{excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel</button>
          </div>
        </div>
        {data ? <TrackingBanner on={data.trackingEnabled} /> : null}
        {data && !data.ledgerMatches ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">A count does not add up to its movements. Download the Excel and check the rows marked CHECK.</p>
        ) : null}
        <Notice text={notice} onClose={() => setNotice(null)} />
        <InlineError error={excel.error} />
        <div className="mt-5">
          {query.isLoading ? (
            <PaymentsLoading label="Loading stock…" />
          ) : query.error ? (
            <ErrorState message="Stock could not be loaded. Refresh the page to try again." />
          ) : !data?.items.length ? (
            <EmptyState title="No Stock Items" description="Switch on Count Stock for books and kit in Payment Settings › Fee Setup." />
          ) : !data.centres.length ? (
            <EmptyState title="No Centre Keeps Stock" description="Choose which centres keep stock in Setup." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="px-2 py-2">Item</th>
                    {data.centres.map((centre) => <th key={centre.centreId} className="px-2 py-2 text-right">{centre.name}</th>)}
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="px-2 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.feeItemId} className={`border-t border-slate-100 dark:border-slate-800 ${item.isActive ? "" : "opacity-60"}`}>
                      <td className="px-2 py-3">
                        <div className="font-black text-slate-900 dark:text-white">{item.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                          {item.sku ? <span>{item.sku}</span> : null}
                          {item.levelCode ? <span>Book for {item.levelCode}</span> : null}
                          {item.inKit ? <span className="text-violet-600 dark:text-violet-300">Admission kit</span> : null}
                        </div>
                      </td>
                      {item.centres.map((centre) => (
                        <td key={centre.centreId} className="px-2 py-3 text-right">
                          <span className={`inline-flex min-w-[2.5rem] justify-end rounded-full px-2 py-0.5 text-base font-black tabular-nums ${centre.isLow ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "text-slate-900 dark:text-white"}`}>{centre.quantity}</span>
                          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">+{centre.opening + centre.received + centre.transferredIn + centre.returned} / −{centre.issued + centre.transferredOut + centre.writtenOff}</div>
                        </td>
                      ))}
                      <td className="px-2 py-3 text-right text-base font-black tabular-nums">{item.total}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-semibold text-slate-500">{item.priceDisplay}{item.costDisplay ? <><br />cost {item.costDisplay}</> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {action && data ? <StockActionDialog key={action} action={action} items={data.items} centres={data.centres} onClose={() => setAction(null)} onDone={(text) => { setNotice(text); setAction(null); }} /> : null}
    </>
  );
}

// --------------------------------------------------------------------------
// Movements
// --------------------------------------------------------------------------

export function MovementsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [filters, setFilters] = useState<MovementFilters>({});
  const [page, setPage] = useState(1);
  const summary = useQuery({ queryKey: [...KEY, "summary"], queryFn: getStockSummary, enabled: ready });
  const query = useQuery({ queryKey: [...KEY, "movements", filters, page], queryFn: () => listStockMovements(filters, page, 50), enabled: ready, placeholderData: keepPreviousData });
  const excel = useMutation({ mutationFn: () => downloadStockExcel(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-Stock-${TodayInIndia()}.xlsx`) });
  if (!ready) return null;
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const set = (patch: Partial<MovementFilters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10">
          <p className="math-block-header"><ClipboardList size={14} />Inventory</p>
          <h1 className="math-title">Stock Movements</h1>
          <p className="math-subtitle">Every change to stock, newest first. Nothing here is ever edited or deleted.</p>
          <HeroSearch />
        </div>
      </section>
      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Item</span>
            <select className="math-input" value={filters.feeItemId ?? ""} onChange={(event) => set({ feeItemId: event.target.value })}>
              <option value="">All Items</option>
              {(summary.data?.items ?? []).map((item) => <option key={item.feeItemId} value={item.feeItemId}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Centre</span>
            <select className="math-input" value={filters.centreId ?? ""} onChange={(event) => set({ centreId: event.target.value })}>
              <option value="">All Centres</option>
              {(summary.data?.centres ?? []).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Movement</span>
            <select className="math-input" value={filters.type ?? ""} onChange={(event) => set({ type: event.target.value })}>
              <option value="">All Movements</option>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">From / To</legend>
            <input type="date" className="math-input px-3" value={filters.dateFrom ?? ""} onChange={(event) => set({ dateFrom: event.target.value })} aria-label="From" />
            <input type="date" className="math-input px-3" value={filters.dateTo ?? ""} onChange={(event) => set({ dateTo: event.target.value })} aria-label="To" />
          </fieldset>
          <button type="button" className="math-button-secondary" disabled={excel.isPending} onClick={() => excel.mutate()}>{excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel</button>
        </div>
        <InlineError error={excel.error} />
        <div className="mt-5">
          {query.isLoading ? (
            <PaymentsLoading label="Loading movements…" />
          ) : !data?.movements.length ? (
            <EmptyState title="No Movements" description="Stock received, sold, moved or written off shows here." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Centre</th>
                      <th className="px-2 py-2">Movement</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">After</th>
                      <th className="px-2 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.map((row) => (
                      <tr key={row.movementId} className="border-t border-slate-100 align-top dark:border-slate-800">
                        <td className="whitespace-nowrap px-2 py-2.5 font-semibold">{FormatDate(row.date)}</td>
                        <td className="px-2 py-2.5 font-bold text-slate-900 dark:text-white">{row.itemName}</td>
                        <td className="px-2 py-2.5">{row.centreName}</td>
                        <td className="px-2 py-2.5">{row.typeLabel}</td>
                        <td className={`px-2 py-2.5 text-right font-black tabular-nums ${row.quantity < 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{row.balanceAfter}</td>
                        <td className="px-2 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {row.invoiceNumber ? (
                            <Link className="underline" href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(row.invoiceNumber)}&open=${encodeURIComponent(row.invoiceId ?? "")}`}>{row.invoiceNumber}</Link>
                          ) : null}
                          {row.studentId && row.studentName ? <> · <StudentLink studentId={row.studentId}>{row.studentName}</StudentLink></> : null}
                          {[row.supplier, row.billNumber ? `bill ${row.billNumber}` : null, row.unitCostDisplay ? `${row.unitCostDisplay} each` : null, row.reason].filter(Boolean).map((part) => <span key={String(part)}> · {part}</span>)}
                          {row.actorName ? <span className="block">by {row.actorName}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 ? (
                <div className="mt-4 flex items-center justify-end gap-2 text-sm font-bold">
                  <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}

// --------------------------------------------------------------------------
// Book queue
// --------------------------------------------------------------------------

const BOOK_FILTERS: { key: string; label: string }[] = [
  { key: "OPEN", label: "Needs Action" },
  { key: "ISSUED", label: "Invoiced" },
  { key: "SKIPPED", label: "Not Billed" },
  { key: "ALL", label: "All" },
];

export function BookQueuePanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("OPEN");
  const [chosen, setChosen] = useState<string[]>([]);
  const [skipping, setSkipping] = useState<BookTask | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({ queryKey: [...KEY, "books", status], queryFn: () => getBookQueue(status), enabled: ready });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const raise = useMutation({
    mutationFn: (ids: string[]) => raiseBooks(ids),
    onSuccess: (result) => {
      setChosen([]);
      setNotice(`${result.raised} book invoice${result.raised === 1 ? "" : "s"} raised.${result.notRaised.length ? ` ${result.notRaised.length} not raised: ${result.notRaised.map((row) => `${row.student} (${row.reason})`).join("; ")}` : ""}`);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoices"] });
    },
  });
  const skip = useMutation({
    mutationFn: () => skipBook((skipping as BookTask).taskId, skipReason),
    onSuccess: () => { setSkipping(null); setSkipReason(""); refresh(); },
  });
  const reopen = useMutation({ mutationFn: (taskId: string) => reopenBook(taskId), onSuccess: refresh });
  const excel = useMutation({ mutationFn: () => downloadBookQueueExcel(status), onSuccess: (blob) => saveBlob(blob, `MathPath-Book-Queue-${TodayInIndia()}.xlsx`) });
  const tasks = useMemo(() => query.data?.tasks ?? [], [query.data]);
  if (!ready) return null;
  const raisable = tasks.filter((task) => task.canRaise).map((task) => task.taskId);

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><BookOpen size={14} />Inventory</p>
            <h1 className="math-title">Book Queue</h1>
            <p className="math-subtitle">The next level&apos;s book for each student who cleared a level assessment. A book is handed over once its invoice is paid.</p>
            <HeroSearch />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:shrink-0">
            <PaymentsMetric label="Needs Action" value={query.data?.openCount ?? "—"} icon={<AlertTriangle size={14} />} tone="amber" />
            <PaymentsMetric label="Invoiced" value={query.data?.counts.ISSUED ?? 0} icon={<CheckCircle2 size={14} />} tone="emerald" />
          </div>
        </div>
      </section>
      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Book Queue" className="flex flex-wrap gap-2">
            {BOOK_FILTERS.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key} onClick={() => { setStatus(tab.key); setChosen([]); }} className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${status === tab.key ? "is-active math-admin-tab-force-selected" : ""}`}>{tab.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="math-button-primary" disabled={!chosen.length || raise.isPending} onClick={() => raise.mutate(chosen)}>
              {raise.isPending ? <Loader2 size={17} className="animate-spin" /> : <BookOpen size={17} />}Raise {chosen.length || ""} Invoice{chosen.length === 1 ? "" : "s"}
            </button>
            <button type="button" className="math-button-secondary" disabled={excel.isPending} onClick={() => excel.mutate()}>{excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel</button>
          </div>
        </div>
        {query.data && !query.data.autoBookInvoices ? (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            Automatic book invoices are off, so each cleared level waits here. Raise the invoice, or mark it Not Billed (for example when the old portal billed it). Switch them on in <Link href="/admin/payments/inventory?tab=setup" className="font-black underline">Setup</Link>.
          </p>
        ) : null}
        <Notice text={notice} onClose={() => setNotice(null)} />
        <InlineError error={raise.error || reopen.error || excel.error} />
        <div className="mt-5">
          {query.isLoading ? (
            <PaymentsLoading label="Loading the book queue…" />
          ) : !tasks.length ? (
            <EmptyState title={status === "OPEN" ? "Nothing Waiting" : "No Books Here"} description="When a student clears a level assessment, the next level's book shows here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="w-10 px-2 py-2">
                      <input type="checkbox" className="h-4 w-4" aria-label="Choose all" checked={raisable.length > 0 && raisable.every((id) => chosen.includes(id))} disabled={!raisable.length} onChange={(event) => setChosen(event.target.checked ? raisable : [])} />
                    </th>
                    <th className="px-2 py-2">Student</th>
                    <th className="px-2 py-2">Next Level</th>
                    <th className="px-2 py-2">Book</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.taskId} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="px-2 py-3">
                        {task.canRaise ? <input type="checkbox" className="h-4 w-4" aria-label={`Choose ${task.studentName}`} checked={chosen.includes(task.taskId)} onChange={(event) => setChosen((ids) => (event.target.checked ? [...ids, task.taskId] : ids.filter((id) => id !== task.taskId)))} /> : null}
                      </td>
                      <td className="px-2 py-3">
                        <StudentLink studentId={task.studentId}><span className="font-black">{task.studentName}</span></StudentLink>
                        <div className="text-xs font-semibold text-slate-500">{task.studentCode} · cleared {FormatDate(task.clearedOn)}</div>
                      </td>
                      <td className="px-2 py-3 font-bold">{task.levelCode}</td>
                      <td className="px-2 py-3">{task.bookName ?? "—"}{task.priceDisplay ? <div className="text-xs font-semibold text-slate-500">{task.priceDisplay}</div> : null}</td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${task.status === "ISSUED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" : task.status === "SKIPPED" ? "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>{task.statusLabel}</span>
                        {task.invoiceNumber ? <div className="mt-1 text-xs font-bold"><Link className="underline" href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(task.invoiceNumber)}&open=${encodeURIComponent(task.invoiceId ?? "")}`}>{task.invoiceNumber}</Link>{task.invoiceStatus ? ` · ${task.invoiceStatus === "PAID" ? "paid" : task.invoiceStatus === "CANCELLED" ? "cancelled" : "unpaid"}` : ""}</div> : null}
                        {task.lastError || task.skipReason ? <div className="mt-1 max-w-xs text-xs font-semibold text-slate-500">{task.lastError || task.skipReason}</div> : null}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-2">
                          {task.canRaise ? <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={raise.isPending} onClick={() => raise.mutate([task.taskId])}><BookOpen size={13} />Raise</button> : null}
                          {task.canRaise ? <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { setSkipping(task); setSkipReason(""); skip.reset(); }}>Not Billed</button> : null}
                          {task.status === "SKIPPED" ? <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={reopen.isPending} onClick={() => reopen.mutate(task.taskId)}><RotateCcw size={13} />Put Back</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <PaymentsDialog
        open={Boolean(skipping)}
        kicker="Not Billed"
        title={skipping ? `Don't bill ${skipping.studentName} for the ${skipping.levelCode} book?` : ""}
        onClose={() => setSkipping(null)}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => setSkipping(null)}>Keep In Queue</button>
            <button type="button" className="math-button-primary" disabled={!skipReason.trim() || skip.isPending} onClick={() => skip.mutate()}>{skip.isPending ? "Saving…" : "Mark Not Billed"}</button>
          </>
        }
      >
        <label className="block">
          <FieldLabel hint="required, kept in the history">Why</FieldLabel>
          <input className="math-input" value={skipReason} onChange={(event) => setSkipReason(event.target.value)} placeholder="e.g. billed on the old portal" autoFocus />
        </label>
        <div className="mt-3"><InlineError error={skip.error} /></div>
      </PaymentsDialog>
    </>
  );
}

// --------------------------------------------------------------------------
// Setup
// --------------------------------------------------------------------------

export function InventorySetupPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [offReason, setOffReason] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const query = useQuery({ queryKey: [...KEY, "settings"], queryFn: getInventorySettings, enabled: ready });
  const save = useMutation({
    mutationFn: updateInventorySettings,
    onSuccess: (data) => {
      queryClient.setQueryData([...KEY, "settings"], data);
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
      setNotice("Saved.");
      setThreshold(null);
      setConfirmOff(false);
      setOffReason("");
    },
  });
  if (!ready) return null;
  const data = query.data;
  const stockCentres = data?.centres.filter((centre) => centre.holdsStock) ?? [];

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10">
          <p className="math-block-header"><Settings2 size={14} />Inventory</p>
          <h1 className="math-title">Stock Setup</h1>
          <p className="math-subtitle">Switch stock counting on once each centre&apos;s opening stock is in. Every change here is kept in the history.</p>
          <HeroSearch />
        </div>
      </section>
      {query.isLoading || !data ? (
        <section className="mt-6 math-card p-5 sm:p-6"><PaymentsLoading label="Loading settings…" rows={3} /></section>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="math-card p-5 sm:p-6">
            <p className="math-block-header"><Boxes size={14} />Stock Tracking</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">{data.stockTrackingEnabled ? "Stock is being counted" : "Stock is not counted yet"}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {data.stockTrackingEnabled
                ? `Since ${FormatDate(data.trackingStartedAt)}. A sale needing more than a centre holds is refused, and every sale takes stock.`
                : "While it is off, sales do not take stock and nothing is refused. Enter the opening stock at each centre first (Stock › Opening Stock)."}
            </p>
            {data.stockTrackingEnabled ? (
              confirmOff ? (
                <div className="mt-4 grid gap-2">
                  <label className="block"><FieldLabel hint="required">Why switch it off?</FieldLabel><input className="math-input" value={offReason} onChange={(event) => setOffReason(event.target.value)} /></label>
                  <div className="flex gap-2">
                    <button type="button" className="math-button-secondary" onClick={() => setConfirmOff(false)}>Keep Counting</button>
                    <button type="button" className="math-button-primary !bg-rose-600 hover:!bg-rose-700" disabled={!offReason.trim() || save.isPending} onClick={() => save.mutate({ stockTrackingEnabled: false, reason: offReason })}>Switch Off</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="math-button-secondary mt-4" onClick={() => setConfirmOff(true)}>Switch Off…</button>
              )
            ) : (
              <button type="button" className="math-button-primary mt-4" disabled={save.isPending || !stockCentres.length} onClick={() => save.mutate({ stockTrackingEnabled: true })}><CheckCircle2 size={17} />Start Counting Stock</button>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <FieldLabel hint="shown as low at or under">Low Stock Level</FieldLabel>
                <div className="flex gap-2">
                  <input className="math-input tabular-nums" inputMode="numeric" value={threshold ?? String(data.lowStockThreshold)} onChange={(event) => setThreshold(event.target.value.replace(/\D/g, "").slice(0, 5))} />
                  {threshold !== null && threshold !== String(data.lowStockThreshold) ? <button type="button" className="math-button-secondary" disabled={save.isPending || threshold === ""} onClick={() => save.mutate({ lowStockThreshold: Number(threshold) })}>Save</button> : null}
                </div>
              </label>
              <label className="block">
                <FieldLabel hint="for students with no centre">Default Stock Centre</FieldLabel>
                <select className="math-input" value={data.defaultStockCentreId ?? ""} onChange={(event) => save.mutate({ defaultStockCentreId: event.target.value })}>
                  {stockCentres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="math-card p-5 sm:p-6">
            <p className="math-block-header"><BookOpen size={14} />Book Invoices</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">After a cleared level</h2>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={data.autoBookInvoices} disabled={save.isPending} onChange={(event) => save.mutate({ autoBookInvoices: event.target.checked })} />
              <span>
                <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Raise the next level&apos;s book invoice automatically</span>
                <span className="block text-xs font-semibold text-slate-500">Off: each cleared level waits in the Book Queue for you. Keep it off while the old portal still bills books.</span>
              </span>
            </label>
          </section>

          <section className="math-card p-5 sm:p-6 lg:col-span-2">
            <p className="math-block-header"><Boxes size={14} />Centres</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Who keeps stock</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">A centre that does not keep stock (Online) is supplied from another centre.</p>
            <ul className="mt-4 grid gap-3 md:grid-cols-3">
              {data.centres.map((centre) => (
                <li key={centre.centreId} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="font-black text-slate-900 dark:text-white">{centre.name}{centre.isActive ? "" : " (off)"}</p>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-4 w-4" checked={centre.holdsStock} disabled={save.isPending} onChange={(event) => save.mutate({ centres: [{ centreId: centre.centreId, holdsStock: event.target.checked }] })} />
                    Keeps stock
                  </label>
                  {!centre.holdsStock ? (
                    <label className="mt-2 block">
                      <FieldLabel>Supplied From</FieldLabel>
                      <select className="math-input" value={centre.stockFromCentreId ?? ""} disabled={save.isPending} onChange={(event) => save.mutate({ centres: [{ centreId: centre.centreId, stockFromCentreId: event.target.value || null }] })}>
                        <option value="">The default stock centre</option>
                        {stockCentres.map((other) => <option key={other.centreId} value={other.centreId}>{other.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <div className="lg:col-span-2">
            <Notice text={notice} onClose={() => setNotice(null)} />
            <InlineError error={save.error} />
          </div>
        </div>
      )}
    </>
  );
}
