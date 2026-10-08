// 2026-10-08 (Payments): the same money rules as the backend
// (backend/app/services/payments/money.py), used only for live previews while
// an admin types. The server always recalculates and is the source of truth.

const MAX_AMOUNT_PAISE = 10_00_000 * 100;

export type AmountCheck = { ok: true; paise: number } | { ok: false; message: string };

export function CheckRupeeAmount(raw: string, label = "Amount"): AmountCheck {
  const text = raw.replace(/[,₹\s]/g, "");
  if (!text) return { ok: false, message: `${label} is required.` };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    if (/^-/.test(text)) return { ok: false, message: `${label} cannot be negative.` };
    if (/^\d+\.\d{3,}$/.test(text)) return { ok: false, message: `${label} can have at most 2 decimal places.` };
    return { ok: false, message: `${label} must be a number, like 1100 or 1100.50.` };
  }
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (paise <= 0) return { ok: false, message: `${label} must be more than ₹0.` };
  if (paise > MAX_AMOUNT_PAISE) return { ok: false, message: `${label} cannot be more than ₹10,00,000.` };
  return { ok: true, paise };
}

export function FormatRupees(paise: number): string {
  const negative = paise < 0;
  const value = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees.toLocaleString("en-IN")}.${fraction}`;
}

function RoundHalfUpDivide(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function SplitInclusiveGst(totalPaise: number, rateBps = 1800, gstIncluded = true) {
  if (!gstIncluded || rateBps <= 0) return { taxable: totalPaise, cgst: 0, sgst: 0, gst: 0 };
  const taxable = RoundHalfUpDivide(totalPaise * 10000, 10000 + rateBps);
  const gst = totalPaise - taxable;
  const cgst = RoundHalfUpDivide(gst, 2);
  return { taxable, cgst, sgst: gst - cgst, gst };
}
