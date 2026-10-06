type StackToken = number | string;

type StackRow = {
  operator: string;
  value: string;
};

function FormatStackValue(Value: StackToken): string {
  if (typeof Value === "number") {
    if (Number.isInteger(Value)) return String(Value);
    return String(Number(Value.toFixed(8))).replace(/\.0+$/, "");
  }

  return String(Value ?? "").trim();
}

function IsStandaloneOperator(Value: StackToken): boolean {
  const Text = FormatStackValue(Value);
  return ["+", "-", "−", "×", "x", "X", "÷", "/"].includes(Text);
}

function IsSubtractionOperator(Value: string): boolean {
  return Value === "-" || Value === "−";
}

function IsAdditionOperator(Value: string): boolean {
  return Value === "+";
}

function NormaliseOperator(Value: string): string {
  const Text = String(Value || "").trim();
  if (Text === "-" || Text === "−") return "−";
  if (Text === "x" || Text === "X") return "×";
  if (Text === "/") return "÷";
  return Text;
}

function IsNumericText(Value: string): boolean {
  if (!Value) return false;
  return !Number.isNaN(Number(Value));
}

function BuildStackRows(Operands: StackToken[], Operators: string[] = []): StackRow[] {
  const Rows: StackRow[] = [];
  let PendingOperator = "";

  Operands.forEach((Operand, Index) => {
    const OperandText = FormatStackValue(Operand);

    if (IsStandaloneOperator(Operand)) {
      PendingOperator = OperandText;
      return;
    }

    const OperatorFromArray = Index === 0 ? "" : String(Operators[Index] || "").trim();
    const RawOperator = PendingOperator || OperatorFromArray;
    PendingOperator = "";

    let DisplayOperator = "";
    let DisplayValue = OperandText;

    if (typeof Operand === "number" && Operand < 0) {
      DisplayOperator = "−";
      DisplayValue = FormatStackValue(Math.abs(Operand));
    } else if (typeof Operand === "string" && OperandText.startsWith("-") && IsNumericText(OperandText)) {
      DisplayOperator = "−";
      DisplayValue = OperandText.slice(1);
    } else if (IsSubtractionOperator(RawOperator)) {
      DisplayOperator = "−";
    } else if (IsAdditionOperator(RawOperator)) {
      DisplayOperator = "";
    } else {
      DisplayOperator = NormaliseOperator(RawOperator);
    }

    Rows.push({ operator: DisplayOperator, value: DisplayValue });
  });

  return Rows;
}

export function VerticalQuestion({
  operands,
  operators,
}: {
  operands: StackToken[];
  operators?: string[];
}) {
  const StackRows = BuildStackRows(operands || [], operators || []);
  const LongestValueLength = StackRows.reduce((Length, Row) => Math.max(Length, Row.value.length), 1);
  const IsVeryDenseStack = StackRows.length >= 8 || LongestValueLength >= 7;
  const NumberColumnStyle = {
    minWidth: `${Math.max(LongestValueLength, 2)}ch`,
  };
  const PaddedQuestionMark = "?".padStart(Math.max(LongestValueLength, 1), " ");
  // 2026-10 (Shailesh): one number size for every question, whatever the
  // concept, module or level. This used to step down for longer stacks
  // (32px -> 28px -> 24px), which is why a short sum looked far bigger than a
  // long one. The size is now the single --mp-question-size value set in
  // globals.css (the same one MathQuestionDisplay uses); a taller stack simply
  // makes the card taller, it never scrolls or clips.
  const TextSizeClass = "mp-q-num";
  const CardPaddingClass = IsVeryDenseStack ? "px-3 py-3.5 sm:px-4 sm:py-4" : "px-4 py-4 sm:px-5 sm:py-4";

  return (
    <div className={`mx-auto w-fit max-w-full rounded-[20px] bg-white text-slate-900 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 ${CardPaddingClass}`}>
      <div className={`font-mono font-black leading-[1.18] ${TextSizeClass}`}>
        {StackRows.map((Row, Index) => (
          <div
            key={`${Row.operator}-${Row.value}-${Index}`}
            className="grid items-baseline gap-1.5"
            style={{ gridTemplateColumns: "1.35rem max-content" }}
          >
            <span className="text-center">{Row.operator}</span>
            <span className="whitespace-pre text-right tabular-nums" style={NumberColumnStyle}>
              {Row.value.padStart(LongestValueLength, " ")}
            </span>
          </div>
        ))}
      </div>

      {/* The answer line takes the digits' own colour so it is as clear in dark mode as in light. */}
      <div data-q-mark="rule" className="my-2.5 border-t-[3px] border-current" />

      <div
        className={`grid items-baseline gap-1.5 text-right font-mono font-black text-blue-700 dark:text-cyan-300 ${TextSizeClass}`}
        style={{ gridTemplateColumns: "1.35rem max-content" }}
      >
        <span />
        <span className="whitespace-pre text-right tabular-nums" style={NumberColumnStyle}>{PaddedQuestionMark}</span>
      </div>
    </div>
  );
}
