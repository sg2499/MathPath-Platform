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

// 2026-10-14 (Phase 2 part 5): ONE date style across the platform, always
// India time. The platform used to show four styles side by side --
// "14 Oct, 4:05 PM", "14/10/2026, 12:38:26 AM", "Oct 11, 2026, 8:00 PM" and
// "11/10/2026, 7:43:35 PM". Now:
//   date        14 Oct 2026
//   date + time 14 Oct 2026, 4:05 PM
//   compact     14 Oct, 4:05 PM   (the year is added when it isn't this year)
//   time        4:05 PM
const IST = "Asia/Kolkata";

function istParts(DateValue: Date, Options: Intl.DateTimeFormatOptions) {
  const Parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...Options })
    .formatToParts(DateValue)
    .forEach((Part) => {
      if (Part.type !== "literal") Parts[Part.type] = Part.value;
    });
  return Parts;
}

function istDay(DateValue: Date) {
  const Parts = istParts(DateValue, { day: "numeric", month: "short", year: "numeric" });
  return { day: Parts.day, month: Parts.month, year: Parts.year };
}

function istClock(DateValue: Date) {
  const Parts = istParts(DateValue, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${Parts.hour}:${Parts.minute} ${String(Parts.dayPeriod || "").toUpperCase()}`.trim();
}

/** "14 Oct 2026" from a Date (India time). */
export function formatMathPathDay(DateValue: Date) {
  const Day = istDay(DateValue);
  return `${Day.day} ${Day.month} ${Day.year}`;
}

export function formatMathPathDateTime(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;
  return `${formatMathPathDay(DateValue)}, ${istClock(DateValue)}`;
}

// A compact "recency" variant for dense table columns (Students
// directories, "last seen"): "14 Oct, 4:05 PM". The year appears only when
// it isn't the current year, so an old date is never mistaken for this year.
export function formatMathPathDateTimeCompact(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;
  const Day = istDay(DateValue);
  const ThisYear = istDay(new Date()).year;
  const DayText = Day.year === ThisYear ? `${Day.day} ${Day.month}` : `${Day.day} ${Day.month} ${Day.year}`;
  return `${DayText}, ${istClock(DateValue)}`;
}

export function formatMathPathDate(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;
  return formatMathPathDay(DateValue);
}

export function formatMathPathTime(value?: string | null) {
  const DateValue = parseMathPathDate(value);
  if (!DateValue) return MATHPATH_EMPTY_VALUE;
  return istClock(DateValue);
}

export function formatMathPathCompletionDateTime(source: Record<string, any> | null | undefined) {
  const Value = getFirstMathPathTimestamp(source, MATHPATH_COMPLETION_TIMESTAMP_KEYS);
  return Value ? formatMathPathDateTime(Value) : "Pending";
}

export function formatMathPathActivityDateTime(rows: Array<Record<string, any>>) {
  const Value = getLatestMathPathTimestamp(rows, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return Value ? formatMathPathDateTime(Value) : MATHPATH_EMPTY_VALUE;
}
