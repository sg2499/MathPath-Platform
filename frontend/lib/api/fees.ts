// 2026-10-09 (Payments Phase 5): the student Fees tab and parent pay links.
// The amount to pay is always worked out by the server from the chosen
// invoices; the browser never sends an amount.
import type { AxiosRequestConfig } from "axios";
import { api } from "@/lib/api";

export type FeeInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  feeName: string;
  periodLabel: string | null;
  description: string;
  invoiceDate: string;
  dueDate: string | null;
  amountPaise: number;
  amountDisplay: string;
  paidPaise: number;
  paidDisplay: string;
  discountPaise: number;
  discountDisplay: string;
  balancePaise: number;
  balanceDisplay: string;
  status: "PENDING" | "PART_PAID" | "PAID" | "CANCELLED";
  statusLabel: string;
  isOverdue: boolean;
};

export type FeePayment = {
  paymentId: string;
  receiptNumber: string;
  paymentDate: string;
  amountPaise: number;
  amountDisplay: string;
  discountPaise: number;
  discountDisplay: string;
  advancePaise: number;
  advanceDisplay: string;
  methodSummary: string;
  channel: "COUNTER" | "ONLINE";
  invoiceNumbers: string[];
};

export type StudentFeesSummary =
  | { enabled: false }
  | {
      enabled: true;
      unpaidCount: number;
      duePaise: number;
      dueDisplay: string;
      overdueCount: number;
      overduePaise: number;
      overdueDisplay: string;
      nextDueDate: string | null;
      onlinePaymentsLive: boolean;
    };

export type StudentFees = {
  student: { name: string; studentCode: string; levelCode: string | null; centreName: string | null };
  totals: {
    duePaise: number;
    dueDisplay: string;
    overduePaise: number;
    overdueDisplay: string;
    overdueCount: number;
    unpaidCount: number;
    nextDueDate: string | null;
    advancePaise: number;
    advanceDisplay: string;
    paidPaise: number;
    paidDisplay: string;
  };
  unpaidInvoices: FeeInvoice[];
  invoices: FeeInvoice[];
  payments: FeePayment[];
  confirming: { orderRef: string; amountDisplay: string; createdAt: string | null }[];
  online: { live: boolean; businessName: string };
};

export type CheckoutOrder = {
  orderRef: string;
  razorpayOrderId: string;
  keyId: string;
  keyMode: "TEST" | "LIVE";
  amountPaise: number;
  amountDisplay: string;
  currency: string;
  businessName: string;
  description: string;
  invoiceNumbers: string[];
  prefill: { name?: string | null; email?: string | null; contact?: string | null };
  reused: boolean;
};

export type OrderOutcome = {
  orderRef: string;
  status: "CREATED" | "FAILED" | "PAID" | "ATTENTION" | "PENDING";
  statusLabel: string;
  amountDisplay: string;
  paymentId: string | null;
  receiptNumber: string | null;
  receiptAmountDisplay: string | null;
  paymentDate: string | null;
  message: string | null;
};

export type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type CheckoutEvent = { type: "DISMISSED" | "FAILED"; detail?: string | null; razorpay_payment_id?: string | null };

// --- Student -------------------------------------------------------------------

export async function getStudentFeesSummary(): Promise<StudentFeesSummary> {
  const { data } = await api.get<StudentFeesSummary>("/student/fees/summary");
  return data;
}

export async function getStudentFees(): Promise<StudentFees> {
  const { data } = await api.get<StudentFees>("/student/fees");
  return data;
}

export async function createStudentOrder(invoiceIds: string[]): Promise<CheckoutOrder> {
  const { data } = await api.post<CheckoutOrder>("/student/fees/orders", { invoiceIds });
  return data;
}

export async function verifyStudentOrder(orderRef: string, payload: CheckoutSuccess): Promise<OrderOutcome> {
  const { data } = await api.post<OrderOutcome>(`/student/fees/orders/${encodeURIComponent(orderRef)}/verify`, payload);
  return data;
}

export async function getStudentOrder(orderRef: string): Promise<OrderOutcome> {
  const { data } = await api.get<OrderOutcome>(`/student/fees/orders/${encodeURIComponent(orderRef)}`);
  return data;
}

export async function logStudentCheckoutEvent(orderRef: string, event: CheckoutEvent): Promise<void> {
  await api.post(`/student/fees/orders/${encodeURIComponent(orderRef)}/events`, event);
}

export async function downloadStudentInvoicePdf(invoiceId: string): Promise<Blob> {
  const { data } = await api.get(`/student/fees/invoices/${encodeURIComponent(invoiceId)}/pdf`, { responseType: "blob" });
  return data as Blob;
}

export async function downloadStudentReceiptPdf(paymentId: string): Promise<Blob> {
  const { data } = await api.get(`/student/fees/receipts/${encodeURIComponent(paymentId)}/pdf`, { responseType: "blob" });
  return data as Blob;
}

// --- Pay link (no login) ------------------------------------------------------------

export type PayLinkPage = {
  business: { name: string; legalName: string | null; phone: string | null; email: string | null };
  student: { name: string; studentCode: string; levelCode: string | null; centreName: string | null };
  unpaidInvoices: FeeInvoice[];
  duePaise: number;
  dueDisplay: string;
  onlinePaymentsLive: boolean;
  expiresAt: string | null;
  paidWithThisLink: { paymentId: string; receiptNumber: string; paymentDate: string; amountDisplay: string }[];
};

// No login on a pay link: no session role hint and no CSRF header.
const PUBLIC = { skipAuth: true } as unknown as AxiosRequestConfig;

function PayPath(token: string, rest = "") {
  return `/pay/${encodeURIComponent(token)}${rest}`;
}

export async function getPayLinkPage(token: string, refresh = false): Promise<PayLinkPage> {
  const { data } = await api.get<PayLinkPage>(PayPath(token), { ...PUBLIC, params: refresh ? { refresh: 1 } : undefined });
  return data;
}

export async function createPayLinkOrder(token: string, invoiceIds: string[]): Promise<CheckoutOrder> {
  const { data } = await api.post<CheckoutOrder>(PayPath(token, "/orders"), { invoiceIds }, PUBLIC);
  return data;
}

export async function verifyPayLinkOrder(token: string, orderRef: string, payload: CheckoutSuccess): Promise<OrderOutcome> {
  const { data } = await api.post<OrderOutcome>(PayPath(token, `/orders/${encodeURIComponent(orderRef)}/verify`), payload, PUBLIC);
  return data;
}

export async function getPayLinkOrder(token: string, orderRef: string): Promise<OrderOutcome> {
  const { data } = await api.get<OrderOutcome>(PayPath(token, `/orders/${encodeURIComponent(orderRef)}`), PUBLIC);
  return data;
}

export async function logPayLinkCheckoutEvent(token: string, orderRef: string, event: CheckoutEvent): Promise<void> {
  await api.post(PayPath(token, `/orders/${encodeURIComponent(orderRef)}/events`), event, PUBLIC);
}

export async function downloadPayLinkReceiptPdf(token: string, paymentId: string): Promise<Blob> {
  const { data } = await api.get(PayPath(token, `/receipts/${encodeURIComponent(paymentId)}/pdf`), { ...PUBLIC, responseType: "blob" });
  return data as Blob;
}
