// 2026-10-09 (Payments Phase 5): Razorpay Checkout, loaded only when a
// payment starts. Opens the pop-up for an order the server made and
// reports how it ended: paid (with the signature for the server to check),
// or closed. A failed try keeps the pop-up open so the payer can try
// another way; onFailed is told each time.
import type { CheckoutOrder, CheckoutSuccess } from "@/lib/api/fees";

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayFailure = { error?: { code?: string; description?: string; reason?: string; metadata?: { payment_id?: string } } };

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let Loading: Promise<void> | null = null;

export function LoadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser"));
  if (window.Razorpay) return Promise.resolve();
  if (Loading) return Loading;
  Loading = new Promise<void>((Resolve, Reject) => {
    const Script = document.createElement("script");
    Script.src = SCRIPT_URL;
    Script.async = true;
    Script.onload = () => (window.Razorpay ? Resolve() : Reject(new Error("Razorpay did not load")));
    Script.onerror = () => {
      Loading = null;
      Script.remove();
      Reject(new Error("Razorpay could not be loaded. Check the internet connection and try again."));
    };
    document.body.appendChild(Script);
  });
  return Loading;
}

export type CheckoutEnd =
  | { kind: "paid"; response: CheckoutSuccess }
  | { kind: "closed"; lastFailure: string | null };

export async function OpenCheckout(
  Order: CheckoutOrder,
  Handlers: { onFailed: (detail: string, paymentId: string | null) => void; themeColor?: string },
): Promise<CheckoutEnd> {
  await LoadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay could not be loaded.");
  return new Promise<CheckoutEnd>((Resolve) => {
    let LastFailure: string | null = null;
    let Settled = false;
    const Finish = (End: CheckoutEnd) => {
      if (Settled) return;
      Settled = true;
      Resolve(End);
    };
    const Prefill = Object.fromEntries(Object.entries(Order.prefill || {}).filter(([, Value]) => Boolean(Value)));
    const Instance = new Razorpay({
      key: Order.keyId,
      order_id: Order.razorpayOrderId,
      amount: Order.amountPaise,
      currency: Order.currency,
      name: Order.businessName,
      description: Order.description,
      image: `${window.location.origin}/mathpath-logo.png`,
      prefill: Prefill,
      notes: { invoices: Order.invoiceNumbers.join(", ").slice(0, 250) },
      theme: { color: Handlers.themeColor || "#2563eb" },
      retry: { enabled: true },
      handler: (Response: CheckoutSuccess) => Finish({ kind: "paid", response: Response }),
      modal: {
        ondismiss: () => Finish({ kind: "closed", lastFailure: LastFailure }),
        confirm_close: true,
        escape: true,
      },
    });
    Instance.on("payment.failed", (Response: RazorpayFailure) => {
      const Detail = Response?.error?.description || "The payment did not go through.";
      LastFailure = Detail;
      Handlers.onFailed(Detail, Response?.error?.metadata?.payment_id || null);
    });
    Instance.open();
  });
}
