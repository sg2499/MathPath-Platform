// Display only: Init Caps for labels that arrive from the platform in capitals
// or as codes ("NOT_STARTED", "IN PROGRESS", "NEEDS_RE_ATTEMPT", "LEGENDARY").
// 2026-10 (Shailesh): "no all caps anywhere we must maintain Init Caps in every
// page that we have in the student login".
//
// - Underscores become spaces.
// - A word typed entirely in capitals becomes Init Caps ("PROGRESS" -> "Progress",
//   "RE-ATTEMPT" -> "Re-Attempt").
// - Codes and abbreviations stay exactly as they are (DPS, XP, YLM-L1, MP-ST-001,
//   BODMAS, roman numerals ...), and so does any word with a digit in it.
// - Text that is already in mixed case is returned untouched, so a real sentence
//   or a person's name is never changed.
//
// It never changes the value that is stored, compared or sent anywhere -- only
// what is shown. Use it at the point of display.

const KEEP_AS_IS = new Set([
  "DPS", "XP", "YLM", "MM", "IM", "PM", "BM", "BODMAS", "MCQ", "ID", "OK",
  "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII",
  "LCM", "HCF", "GST", "IST", "UTC", "PDF", "FAQ", "AI", "UI", "N/A",
]);

function InitCapsWord(Word: string): string {
  if (!Word) return Word;
  if (KEEP_AS_IS.has(Word)) return Word;
  if (/\d/.test(Word)) return Word; // YLM-L1, MP-ST-001, 2D, Q12 ...
  if (Word !== Word.toUpperCase() || Word === Word.toLowerCase()) return Word; // already mixed case, or no letters
  return Word
    .split("-")
    .map((Part) => (KEEP_AS_IS.has(Part) ? Part : Part.toLowerCase().replace(/[a-z]/, (Letter) => Letter.toUpperCase())))
    .join("-");
}

export function InitCaps(Value: unknown): string {
  const Text = String(Value ?? "").replace(/_/g, " ");
  if (!Text.trim()) return Text;
  return Text
    .split(/(\s+)/)
    .map((Piece) => (/^\s+$/.test(Piece) ? Piece : InitCapsWord(Piece)))
    .join("")
    // "NEEDS_RE_ATTEMPT" arrives with underscores on both sides of "RE".
    .replace(/\bRe (Attempt|Attempts|Attempted)\b/g, "Re-$1");
}
