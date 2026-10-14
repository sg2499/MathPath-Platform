// "Submitted On" filter for the Annual Competition practice Results tabs
// (2026-10-14, Phase 2 part 4). The daily practice notice's "View All"
// opens Results with ?submittedOn=YYYY-MM-DD; this keeps only the papers
// submitted on that India-time day, and the students who submitted them.

const IstDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function IstDayOf(Value?: string | null): string {
  if (!Value) return "";
  const Parsed = new Date(Value);
  return Number.isNaN(Parsed.getTime()) ? "" : IstDayFormat.format(Parsed);
}

export function FilterPracticeStudentsBySubmittedDay<
  Paper extends { submittedAt?: string | null },
  Group extends { papers: Paper[] },
>(Students: Group[], Day: string): Group[] {
  if (!Day) return Students;
  return Students
    .map((StudentGroup) => ({ ...StudentGroup, papers: StudentGroup.papers.filter((PaperItem) => IstDayOf(PaperItem.submittedAt) === Day) }))
    .filter((StudentGroup) => StudentGroup.papers.length > 0);
}

export function DayLabel(Day: string): string {
  if (!Day) return "";
  const Parsed = new Date(`${Day}T00:00:00+05:30`);
  return Number.isNaN(Parsed.getTime())
    ? Day
    : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(Parsed);
}
