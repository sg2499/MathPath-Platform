// "1 Student", "2 Students" (2026-10-14, Phase 2 part 5 -- the admin
// Students page used to say "1 STUDENTS").
export function Plural(Count: number, Singular: string, PluralForm?: string): string {
  const Value = Number(Count) || 0;
  return `${Value.toLocaleString("en-IN")} ${Value === 1 ? Singular : PluralForm ?? `${Singular}s`}`;
}
