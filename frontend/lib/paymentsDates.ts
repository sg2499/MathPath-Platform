// 2026-10-08 (Payments): date helpers shared by the payments screens.
// Dates are plain YYYY-MM-DD strings in India time, never Date objects in
// the browser's own zone.

export function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function AddDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function MonthStart(isoDate: string, back = 0): string {
  const [year, month] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 - back, 1));
  return value.toISOString().slice(0, 10);
}

export function MonthEnd(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Monday of the week the date falls in. */
export function WeekStart(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return AddDays(isoDate, -((weekday + 6) % 7));
}

export function MonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** "" -> 0; "1,100.5" -> 110050; invalid -> null. */
export function ParsePaise(raw: string): number | null {
  const text = raw.replace(/[,₹\s]/g, "");
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return paise > 10_00_000 * 100 ? null : paise;
}

export function ToRupees(paise: number): string {
  if (!paise) return "";
  return paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100);
}
