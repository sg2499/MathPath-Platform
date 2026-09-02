export const MATHPATH_EMPTY_VALUE = "—";

export const MATHPATH_COMPLETION_TIMESTAMP_KEYS = [
  "completedAt",
  "completedDate",
  "completionDate",
  "submittedAt",
  "submittedDate",
  "latestCompletedAt",
  "latestSubmittedAt",
] as const;

export const MATHPATH_ACTIVITY_TIMESTAMP_KEYS = [
  "completedAt",
  "completedDate",
  "completionDate",
  "submittedAt",
  "submittedDate",
  "latestCompletedAt",
  "latestSubmittedAt",
  "attemptDate",
  "startedAt",
  "assignedAt",
  "publishedAt",
  "createdAt",
  "updatedAt",
] as const;

export function parseMathPathDate(value?: string | null) {
  if (!value) return null;

  const Trimmed = String(value).trim();
  if (!Trimmed) return null;

  // Backend stores timestamps in UTC but may send them without a timezone suffix,
  // e.g. 2026-05-04T12:18:27. JavaScript treats that as local time unless we
  // explicitly mark it as UTC.
  const HasTimezone = /z$/i.test(Trimmed) || /[+-]\d{2}:?\d{2}$/.test(Trimmed);
  const Normalized = HasTimezone ? Trimmed : `${Trimmed}Z`;
  const DateValue = new Date(Normalized);

  if (Number.isNaN(DateValue.getTime())) return null;
  return DateValue;
}

function withUppercaseMeridiem(value: string) {
  return value.replace(/\b(am|pm)\b/g, (Match) => Match.toUpperCase());
}

export function mathPathTimestampValue(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  return DateValue ? DateValue.getTime() : 0;
}

export function getFirstMathPathTimestamp(
  source: Record<string, any> | null | undefined,
  keys: readonly string[],
) {
  if (!source) return null;

  for (const Key of keys) {
    const Value = source[Key];
    if (Value && parseMathPathDate(String(Value))) return String(Value);
  }

  return null;
}

export function getLatestMathPathTimestamp(
  rows: Array<Record<string, any>>,
  keys: readonly string[] = MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
) {
  let LatestValue: string | null = null;
  let LatestTime = 0;

  rows.forEach((Row) => {
    keys.forEach((Key) => {
      const Value = Row?.[Key];
      const TimeValue = Value ? mathPathTimestampValue(String(Value)) : 0;
      if (TimeValue && TimeValue > LatestTime) {
        LatestValue = String(Value);
        LatestTime = TimeValue;
      }
    });
  });

  return LatestValue;
}

export function formatMathPathDateTime(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;

  return withUppercaseMeridiem(
    DateValue.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  );
}

// 2026-09-02: a compact "recency" variant for dense table columns (Admin/Teacher
// Students directories) that only need to convey how recent something was at a
// glance, not an exact-to-the-second timestamp -- e.g. "2 Sep, 3:45 PM" instead
// of formatMathPathDateTime()'s "9/2/2026, 3:45:12 PM". Dropping the year (rarely
// relevant for "last seen"/"latest activity" -- almost always the current year)
// and seconds cuts the rendered width roughly in half, which is what actually
// keeps those tables' columns from wrapping or forcing horizontal scroll on a
// normal screen. Existing formatMathPathDateTime() call sites are untouched --
// this is purely additive, opt-in per call site.
export function formatMathPathDateTimeCompact(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;

  return withUppercaseMeridiem(
    DateValue.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

export function formatMathPathDate(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;

  return DateValue.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function formatMathPathTime(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;

  return withUppercaseMeridiem(
    DateValue.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  );
}

export function formatMathPathCompletionDateTime(source: Record<string, any> | null | undefined) {
  const Value = getFirstMathPathTimestamp(source, MATHPATH_COMPLETION_TIMESTAMP_KEYS);
  return Value ? formatMathPathDateTime(Value) : "Pending";
}

export function formatMathPathActivityDateTime(rows: Array<Record<string, any>>) {
  const Value = getLatestMathPathTimestamp(rows, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return Value ? formatMathPathDateTime(Value) : MATHPATH_EMPTY_VALUE;
}
