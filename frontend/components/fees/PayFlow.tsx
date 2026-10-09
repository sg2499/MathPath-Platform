"use client";

// 2026-10-09 (Payments Phase 5): paying unpaid invoices online, shared by
// the student Fees page and the parent pay link page.
//
//   FeeInvoicePicker -- the unpaid invoices, ticked by default, with the
//                       total and the Pay button.
//   usePayFlow       -- order -> Razorpay pop-up -> server check -> result,
//                       polling for a few seconds when the payment is still
//                       being confirmed (the webhook usually lands first).
//   PayFlowDialog    -- what the payer sees while confirming and after.

import { AlertTriangle, CheckCircle2, Clock3, Download, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PaymentsDialog } from "@/components/payments/PaymentsUi";
import { apiErrorMessage } from "@/lib/api";
import type { CheckoutEvent, CheckoutOrder, CheckoutSuccess, FeeInvoice, OrderOutcome } from "@/lib/api/fees";
import { FormatDate } from "@/lib/paymentsDates";
import { FormatRupees } from "@/lib/paymentsMoney";
import { OpenCheckout } from "@/lib/razorpayCheckout";

import "./fees.css";

export type PayFlowApi = {
  createOrder: (invoiceIds: string[]) => Promise<CheckoutOrder>;
  verify: (orderRef: string, payload: CheckoutSuccess) => Promise<OrderOutcome>;
  status: (orderRef: string) => Promise<OrderOutcome>;
  logEvent: (orderRef: string, event: CheckoutEvent) => Promise<void>;
};

export type PayStage =
  | { stage: "idle" }
  | { stage: "starting" }
  | { stage: "checkout"; order: CheckoutOrder }
  | { stage: "confirming"; order: CheckoutOrder }
  | { stage: "paid"; order: CheckoutOrder; outcome: OrderOutcome }
  | { stage: "pending"; order: CheckoutOrder; outcome: OrderOutcome | null }
  | { stage: "closed"; message: string | null }
  | { stage: "error"; message: string };

const POLL_EVERY_MS = 3000;
const POLL_FOR_MS = 45000;

function Sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function usePayFlow(Api: PayFlowApi, OnSettled: () => void) {
  const [State, SetState] = useState<PayStage>({ stage: "idle" });
  const Alive = useRef(true);
  useEffect(() => {
    Alive.current = true;
    return () => {
      Alive.current = false;
    };
  }, []);

  const Finish = useCallback(
    async (Order: CheckoutOrder, First: OrderOutcome | null) => {
      let Outcome = First;
      const Started = Date.now();
      while (Alive.current && (!Outcome || Outcome.status === "PENDING" || Outcome.status === "CREATED") && Date.now() - Started < POLL_FOR_MS) {
        await Sleep(POLL_EVERY_MS);
        try {
          Outcome = await Api.status(Order.orderRef);
        } catch {
          // keep waiting; the network may be briefly down
        }
      }
      if (!Alive.current) return;
      if (Outcome?.status === "PAID") SetState({ stage: "paid", order: Order, outcome: Outcome });
      else SetState({ stage: "pending", order: Order, outcome: Outcome });
      OnSettled();
    },
    [Api, OnSettled],
  );

  const Pay = useCallback(
    async (InvoiceIds: string[], ThemeColor?: string) => {
      if (!InvoiceIds.length) return;
      SetState({ stage: "starting" });
      let Order: CheckoutOrder;
      try {
        Order = await Api.createOrder(InvoiceIds);
      } catch (Problem) {
        SetState({ stage: "error", message: apiErrorMessage(Problem) });
        return;
      }
      SetState({ stage: "checkout", order: Order });
      let End;
      try {
        End = await OpenCheckout(Order, {
          themeColor: ThemeColor,
          onFailed: (Detail, PaymentId) => {
            void Api.logEvent(Order.orderRef, { type: "FAILED", detail: Detail, razorpay_payment_id: PaymentId }).catch(() => undefined);
          },
        });
      } catch (Problem) {
        SetState({ stage: "error", message: Problem instanceof Error ? Problem.message : "Razorpay could not be opened. Please try again." });
        return;
      }
      if (End.kind === "closed") {
        void Api.logEvent(Order.orderRef, { type: "DISMISSED", detail: End.lastFailure }).catch(() => undefined);
        SetState({ stage: "closed", message: End.lastFailure });
        return;
      }
      SetState({ stage: "confirming", order: Order });
      let Outcome: OrderOutcome | null = null;
      try {
        Outcome = await Api.verify(Order.orderRef, End.response);
      } catch {
        // The webhook may still record it: wait and look before saying so.
        Outcome = null;
      }
      if (Outcome?.status === "PAID") {
        SetState({ stage: "paid", order: Order, outcome: Outcome });
        OnSettled();
        return;
      }
      await Finish(Order, Outcome);
    },
    [Api, Finish, OnSettled],
  );

  const Reset = useCallback(() => SetState({ stage: "idle" }), []);
  return { State, Pay, Reset };
}

// ---------------------------------------------------------------------------

export function DueLine({ invoice }: { invoice: FeeInvoice }) {
  if (!invoice.dueDate) return null;
  return invoice.isOverdue ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
      <AlertTriangle size={11} /> Overdue since {FormatDate(invoice.dueDate)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      <Clock3 size={11} /> Due {FormatDate(invoice.dueDate)}
    </span>
  );
}

export function FeeInvoicePicker({
  invoices,
  onlineLive,
  busy,
  onPay,
  offlineNote,
}: {
  invoices: FeeInvoice[];
  onlineLive: boolean;
  busy: boolean;
  onPay: (invoiceIds: string[]) => void;
  offlineNote: string;
}) {
  const AllIds = useMemo(() => invoices.map((Row) => Row.invoiceId), [invoices]);
  const [Chosen, SetChosen] = useState<string[]>(AllIds);
  // New invoices (after a refresh) start ticked; paid ones drop out.
  useEffect(() => SetChosen(AllIds), [AllIds]);
  const Total = invoices.filter((Row) => Chosen.includes(Row.invoiceId)).reduce((Sum, Row) => Sum + Row.balancePaise, 0);
  const Toggle = (Id: string) => SetChosen((Current) => (Current.includes(Id) ? Current.filter((Item) => Item !== Id) : [...Current, Id]));
  const AllChosen = Chosen.length === invoices.length;

  return (
    <div className="grid gap-3">
      {invoices.length > 1 && onlineLive ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Untick anything you want to pay later.</p>
          <button
            type="button"
            className="fees-accent-text shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-black hover:underline focus-visible:outline-none focus-visible:underline"
            onClick={() => SetChosen(AllChosen ? [] : AllIds)}
          >
            {AllChosen ? "Untick all" : "Tick all"}
          </button>
        </div>
      ) : null}
      <ul className="grid gap-2" aria-label="Unpaid invoices">
        {invoices.map((Row) => {
          const On = Chosen.includes(Row.invoiceId);
          return (
            <li key={Row.invoiceId}>
              <label
                className={`fees-choice flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/60 sm:items-center sm:p-4 ${
                  On && onlineLive ? "fees-choice-on" : ""
                } ${onlineLive ? "cursor-pointer" : "cursor-default"}`}
              >
                {onlineLive ? (
                  <input
                    type="checkbox"
                    className="fees-check mt-1 h-5 w-5 shrink-0 rounded-md sm:mt-0"
                    checked={On}
                    disabled={busy}
                    onChange={() => Toggle(Row.invoiceId)}
                    aria-label={`Pay ${Row.feeName} ${Row.periodLabel ?? ""} ${Row.balanceDisplay}`}
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-950 dark:text-white sm:text-base">
                    {Row.feeName}
                    {Row.periodLabel ? <span className="font-bold text-slate-500 dark:text-slate-400"> · {Row.periodLabel}</span> : null}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="tabular-nums">{Row.invoiceNumber}</span>
                    <DueLine invoice={Row} />
                    {Row.status === "PART_PAID" ? <span>{Row.paidDisplay} of {Row.amountDisplay} paid</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-right text-base font-black tabular-nums text-slate-950 dark:text-white sm:text-lg">{Row.balanceDisplay}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {onlineLive ? (
        <div className="fees-pay-bar mt-1 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold opacity-70">{Chosen.length === 0 ? "Nothing ticked" : `${Chosen.length} of ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}</p>
            <p className="text-2xl font-black tabular-nums">{FormatRupees(Total)}</p>
          </div>
          <button
            type="button"
            disabled={busy || Chosen.length === 0}
            onClick={() => onPay(invoices.filter((Row) => Chosen.includes(Row.invoiceId)).map((Row) => Row.invoiceId))}
            className="fees-btn fees-btn-primary h-12 px-6 text-base"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LockKeyhole size={18} />}
            {busy ? "Opening…" : `Pay ${FormatRupees(Total)}`}
          </button>
        </div>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{offlineNote}</p>
      )}
      {onlineLive ? (
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <ShieldCheck size={13} /> Secure payment by Razorpay: UPI, cards, net banking and wallets.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PayFlowDialog({
  state,
  onClose,
  onRetry,
  onDownloadReceipt,
  downloading,
}: {
  state: PayStage;
  onClose: () => void;
  onRetry: () => void;
  onDownloadReceipt: (paymentId: string, receiptNumber: string) => void;
  downloading: boolean;
}) {
  const Open = ["confirming", "paid", "pending", "closed", "error"].includes(state.stage);
  const Busy = state.stage === "confirming";
  const Title =
    state.stage === "paid" ? "Payment received" :
    state.stage === "confirming" ? "Confirming your payment" :
    state.stage === "pending" ? "Payment being confirmed" :
    state.stage === "closed" ? (state.message ? "Payment did not go through" : "Payment not completed") :
    "Could not start the payment";

  return (
    <PaymentsDialog
      open={Open}
      title={Title}
      onClose={Busy ? () => undefined : onClose}
      footer={
        Busy ? null : state.stage === "paid" ? (
          <>
            {state.outcome.paymentId && state.outcome.receiptNumber ? (
              <button type="button" className="fees-btn fees-btn-quiet" disabled={downloading} onClick={() => onDownloadReceipt(state.outcome.paymentId!, state.outcome.receiptNumber!)}>
                {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Download receipt
              </button>
            ) : null}
            <button type="button" className="fees-btn fees-btn-primary" onClick={onClose}>Done</button>
          </>
        ) : state.stage === "closed" || state.stage === "error" ? (
          <>
            <button type="button" className="fees-btn fees-btn-quiet" onClick={onClose}>Close</button>
            <button type="button" className="fees-btn fees-btn-primary" onClick={onRetry}><RefreshCw size={17} />Try again</button>
          </>
        ) : (
          <button type="button" className="fees-btn fees-btn-primary" onClick={onClose}>OK</button>
        )
      }
    >
      <div aria-live="polite">
        {state.stage === "confirming" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Loader2 size={44} className="fees-accent-text animate-spin" />
            <p className="text-base font-black text-slate-900 dark:text-white">{state.order.amountDisplay} paid. Making your receipt…</p>
            <p className="max-w-sm text-sm font-semibold text-slate-500 dark:text-slate-400">Please keep this page open for a few seconds. Do not pay again.</p>
          </div>
        ) : null}
        {state.stage === "paid" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="math-pop-in grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 size={38} />
            </span>
            <p className="text-3xl font-black tabular-nums text-slate-950 dark:text-white">{state.outcome.receiptAmountDisplay ?? state.order.amountDisplay}</p>
            <dl className="mt-1 grid w-full max-w-xs grid-cols-2 gap-x-4 gap-y-1.5 text-left text-sm">
              <dt className="font-semibold text-slate-500 dark:text-slate-400">Receipt</dt>
              <dd className="text-right font-black tabular-nums text-slate-900 dark:text-white">{state.outcome.receiptNumber}</dd>
              <dt className="font-semibold text-slate-500 dark:text-slate-400">Date</dt>
              <dd className="text-right font-black text-slate-900 dark:text-white">{FormatDate(state.outcome.paymentDate)}</dd>
              <dt className="font-semibold text-slate-500 dark:text-slate-400">Invoices</dt>
              <dd className="text-right font-black tabular-nums text-slate-900 dark:text-white">{state.order.invoiceNumbers.join(", ")}</dd>
            </dl>
            {state.order.keyMode === "TEST" ? <p className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Razorpay test mode: no real money moved</p> : null}
          </div>
        ) : null}
        {state.stage === "pending" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300"><Clock3 size={30} /></span>
            <p className="text-base font-black text-slate-900 dark:text-white">We have your payment of {state.order.amountDisplay}, and it is still being confirmed.</p>
            <p className="max-w-sm text-sm font-semibold text-slate-500 dark:text-slate-400">
              It will show here with its receipt within a few minutes. Please do not pay again. If it does not show by tomorrow, contact Math Path with the time you paid.
            </p>
          </div>
        ) : null}
        {state.stage === "closed" ? (
          <div className="grid gap-2 py-2">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {state.message ? `${state.message.replace(/[.\s]+$/, "")}. Nothing was recorded.` : "The payment window was closed before paying. Nothing was charged."}
            </p>
            {state.message ? <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">If money left the account, the bank returns it automatically, usually within 5 to 7 working days.</p> : null}
          </div>
        ) : null}
        {state.stage === "error" ? <p className="py-2 text-sm font-bold text-rose-700 dark:text-rose-300">{state.message}</p> : null}
      </div>
    </PaymentsDialog>
  );
}
