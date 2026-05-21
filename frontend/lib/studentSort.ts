export function StudentCodeSortParts(Value: unknown) {
  const TextValue = String(Value ?? "").trim();
  const NormalizedText = TextValue.toLowerCase();
  const Match = TextValue.match(/(\d+)(?!.*\d)/);
  const NumberValue = Match ? Number(Match[1]) : Number.MAX_SAFE_INTEGER;
  const PrefixValue = Match
    ? TextValue.slice(0, Match.index).toLowerCase()
    : NormalizedText;

  return {
    PrefixValue,
    NumberValue: Number.isFinite(NumberValue) ? NumberValue : Number.MAX_SAFE_INTEGER,
    NormalizedText,
  };
}

export function CompareStudentCodes(FirstCode: unknown, SecondCode: unknown) {
  const FirstParts = StudentCodeSortParts(FirstCode);
  const SecondParts = StudentCodeSortParts(SecondCode);
  const PrefixCompare = FirstParts.PrefixValue.localeCompare(
    SecondParts.PrefixValue,
    undefined,
    { numeric: true, sensitivity: "base" },
  );
  if (PrefixCompare !== 0) return PrefixCompare;
  if (FirstParts.NumberValue !== SecondParts.NumberValue) {
    return FirstParts.NumberValue - SecondParts.NumberValue;
  }
  return FirstParts.NormalizedText.localeCompare(
    SecondParts.NormalizedText,
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

export function StudentCodeFromRecord(RecordValue: Record<string, any>) {
  return (
    RecordValue.studentCode ??
    RecordValue.targetStudentCode ??
    RecordValue.assignedStudentCode ??
    RecordValue.student_code ??
    RecordValue.code ??
    ""
  );
}

export function CompareStudentRecordsByCode<SortRecord extends Record<string, any>>(
  FirstRecord: SortRecord,
  SecondRecord: SortRecord,
) {
  return CompareStudentCodes(
    StudentCodeFromRecord(FirstRecord),
    StudentCodeFromRecord(SecondRecord),
  );
}
