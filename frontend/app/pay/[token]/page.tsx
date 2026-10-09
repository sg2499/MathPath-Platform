"use client";

// 2026-10-09 (Payments Phase 5): a parent's pay link. No login: the link
// itself is the key. Shows the student's unpaid invoices and takes payment
// through Razorpay; receipts paid with this link can be downloaded.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Mail, Phone, ReceiptText, ShieldCheck, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import "@/components/fees/fees.css";
import { FeeInvoicePicker, PayFlowDialog, usePayFlow, type PayFlowApi } from "@/components/fees/PayFlow";
import { apiErrorDetail, apiErrorMessage } from "@/lib/api";
import {
  createPayLinkOrder,
  downloadPayLinkReceiptPdf,
  getPayLinkOrder,
  getPayLinkPage,
  logPayLinkCheckoutEvent,
  verifyPayLinkOrder,
} from "@/lib/api/fees";
import { saveBlob } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fbf7f3] px-4 pb-16 pt-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:pt-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Image src="/mathpath-logo.png" alt="Math Path" width={124} height={60} priority className="h-auto w-[104px] sm:w-[124px]" />
          <span className="fees-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black">
            <ShieldCheck size={14} /> Secure payment
          </span>
        </header>
        {children}
      </div>
    </main>
  );
}

export default function PayLinkPage() {
  const Params = useParams<{ token: string }>();
  const Token = String(Params?.token || "");
  const QueryClient = useQueryClient();
  const [Refreshed, SetRefreshed] = useState(false);
  const Page = useQuery({
    queryKey: ["pay-link", Token],
    queryFn: () => getPayLinkPage(Token, Refreshed),
    enabled: Boolean(Token),
    retry: (Count, Error) => {
      const Status = (Error as { response?: { status?: number } })?.response?.status;
      return Status !== 404 && Status !== 410 && Count < 2;
    },
    refetchOnWindowFocus: false,
  });
  const [Downloading, SetDownloading] = useState<string | null>(null);
  const [DownloadError, SetDownloadError] = useState<string | null>(null);
  const [LastPick, SetLastPick] = useState<string[]>([]);

  const Api: PayFlowApi = useMemo(
    () => ({
      createOrder: (Ids) => createPayLinkOrder(Token, Ids),
      verify: (Ref, Payload) => verifyPayLinkOrder(Token, Ref, Payload),
      status: (Ref) => getPayLinkOrder(Token, Ref),
      logEvent: (Ref, Event) => logPayLinkCheckoutEvent(Token, Ref, Event),
    }),
    [Token],
  );
  const Refresh = useCallback(() => {
    SetRefreshed(true);
    void QueryClient.invalidateQueries({ queryKey: ["pay-link", Token] });
  }, [QueryClient, Token]);
  const Flow = usePayFlow(Api, Refresh);
  const Busy = ["starting", "checkout", "confirming"].includes(Flow.State.stage);

  const SaveReceipt = useCallback(
    async (PaymentId: string, ReceiptNumber: string) => {
      SetDownloading(PaymentId);
      SetDownloadError(null);
      try {
        saveBlob(await downloadPayLinkReceiptPdf(Token, PaymentId), `${ReceiptNumber}.pdf`);
      } catch (Problem) {
        SetDownloadError(apiErrorMessage(Problem));
      } finally {
        SetDownloading(null);
      }
    },
    [Token],
  );

  if (Page.isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 rounded-[28px] bg-white p-10 text-sm font-bold text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
          <Loader2 size={20} className="animate-spin" /> Loading…
        </div>
      </Shell>
    );
  }
  if (Page.isError || !Page.data) {
    const Detail = apiErrorDetail(Page.error);
    return (
      <Shell>
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900" role="alert">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300"><TriangleAlert size={28} /></span>
          <h1 className="mt-4 text-xl font-black">This link cannot be used</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{Detail?.message || apiErrorMessage(Page.error)}</p>
        </section>
      </Shell>
    );
  }

  const Data = Page.data;
  const Due = Data.duePaise > 0;

  return (
    <Shell>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-34px_rgba(76,5,25,0.35)] dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Fees for</p>
        <h1 className="mt-0.5 text-2xl font-black leading-tight sm:text-3xl" style={{ textWrap: "balance" }}>{Data.student.name}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {[Data.student.studentCode, Data.student.levelCode, Data.student.centreName].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Amount due</p>
            <p className={`text-4xl font-black tabular-nums ${Due ? "" : "text-emerald-600 dark:text-emerald-400"}`}>{Data.dueDisplay}</p>
          </div>
          {!Due ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <CheckCircle2 size={16} /> All paid
            </span>
          ) : null}
        </div>

        {Due ? (
          <div className="mt-5">
            <FeeInvoicePicker
              invoices={Data.unpaidInvoices}
              onlineLive={Data.onlinePaymentsLive}
              busy={Busy}
              onPay={(Ids) => {
                SetLastPick(Ids);
                void Flow.Pay(Ids);
              }}
              offlineNote="Online payment is not available right now. Please pay at the centre."
            />
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Nothing is due right now. Thank you.</p>
        )}
      </section>

      {Data.paidWithThisLink.length ? (
        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="text-base font-black">Paid with this link</h2>
          {DownloadError ? <p className="mt-2 text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">{DownloadError}</p> : null}
          <ul className="mt-3 grid gap-2">
            {Data.paidWithThisLink.map((Row) => (
              <li key={Row.paymentId} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><ReceiptText size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black tabular-nums">{Row.receiptNumber}</span>
                  <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{FormatDate(Row.paymentDate)} · {Row.amountDisplay}</span>
                </span>
                <button type="button" className="fees-btn fees-btn-quiet fees-btn-small" disabled={Downloading === Row.paymentId} onClick={() => void SaveReceipt(Row.paymentId, Row.receiptNumber)} aria-label={`Download receipt ${Row.receiptNumber}`}>
                  {Downloading === Row.paymentId ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Receipt
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-6 grid gap-1 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <p>{Data.business.legalName || Data.business.name}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {Data.business.phone ? <span className="inline-flex items-center gap-1"><Phone size={12} />{Data.business.phone}</span> : null}
          {Data.business.email ? <span className="inline-flex items-center gap-1"><Mail size={12} />{Data.business.email}</span> : null}
        </p>
        {Data.expiresAt ? <p>This link works until {FormatDate(Data.expiresAt.slice(0, 10))}.</p> : null}
      </footer>

      <PayFlowDialog
        state={Flow.State}
        onClose={Flow.Reset}
        onRetry={() => {
          Flow.Reset();
          if (LastPick.length) void Flow.Pay(LastPick);
        }}
        downloading={Downloading !== null}
        onDownloadReceipt={(PaymentId, ReceiptNumber) => void SaveReceipt(PaymentId, ReceiptNumber)}
      />
    </Shell>
  );
}
