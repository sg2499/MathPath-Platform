"use client";

// 2026-10-11 (Shailesh): the admin two-factor code as six boxes, the way
// professional sign-in screens do it. Typing moves to the next box,
// Backspace goes back, a pasted or auto-filled code fills every box, and the
// moment the sixth digit is in, onComplete fires -- no button press.
import { useEffect, useRef } from "react";

const LENGTH = 6;

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  resetKey = 0,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  // A new value clears the boxes and puts the cursor back in the first one
  // (after a wrong code).
  resetKey?: number;
}) {
  const Boxes = useRef<Array<HTMLInputElement | null>>([]);
  // The latest code, updated the instant a key is handled. Focus moves to
  // the next box before React re-renders, so reading the prop there would
  // see the code from one keystroke ago (and fast typing would lose digits).
  const Latest = useRef(value);
  Latest.current = value;
  const Digits = Array.from({ length: LENGTH }, (_, Index) => value[Index] ?? "");

  useEffect(() => {
    Boxes.current[0]?.focus();
  }, [resetKey]);

  function Commit(Next: string, FocusIndex: number) {
    const Clean = Next.replace(/\D/g, "").slice(0, LENGTH);
    Latest.current = Clean;
    onChange(Clean);
    Boxes.current[Math.min(FocusIndex, LENGTH - 1)]?.focus();
    if (Clean.length === LENGTH) onComplete(Clean);
  }

  function HandleInput(Index: number, Raw: string) {
    const Current = Latest.current;
    let Typed = Raw.replace(/\D/g, "");
    if (!Typed) return;
    const Existing = Current[Index] ?? "";
    // Typing into a filled box without it being selected gives the old digit
    // plus the new one, in either order depending on the caret: keep the new.
    if (Existing && Typed.length === 2 && Typed.includes(Existing)) Typed = Typed[0] === Existing ? Typed[1] : Typed[0];
    // A whole code arriving in one box (phone autofill, password managers).
    if (Typed.length > 1) {
      const Next = (Current.slice(0, Index) + Typed).slice(0, LENGTH);
      Commit(Next, Next.length);
      return;
    }
    const Chars = Array.from({ length: LENGTH }, (_, Position) => Current[Position] ?? "");
    Chars[Index] = Typed;
    Commit(Chars.join(""), Index + 1);
  }

  function HandleKeyDown(Index: number, Event: React.KeyboardEvent<HTMLInputElement>) {
    const Current = Latest.current;
    if (Event.key === "Backspace") {
      Event.preventDefault();
      if (Current[Index]) {
        const Next = Current.slice(0, Index) + Current.slice(Index + 1);
        Latest.current = Next;
        onChange(Next);
        return;
      }
      if (Index > 0) {
        const Next = Current.slice(0, Index - 1) + Current.slice(Index);
        Latest.current = Next;
        onChange(Next);
        Boxes.current[Index - 1]?.focus();
      }
      return;
    }
    if (Event.key === "ArrowLeft" && Index > 0) {
      Event.preventDefault();
      Boxes.current[Index - 1]?.focus();
    }
    if (Event.key === "ArrowRight" && Index < LENGTH - 1) {
      Event.preventDefault();
      Boxes.current[Math.min(Index + 1, Current.length)]?.focus();
    }
  }

  function HandlePaste(Event: React.ClipboardEvent<HTMLInputElement>) {
    const Pasted = Event.clipboardData.getData("text").replace(/\D/g, "");
    if (!Pasted) return;
    Event.preventDefault();
    Commit(Pasted.slice(0, LENGTH), Math.min(Pasted.length, LENGTH));
  }

  return (
    <div className="mp-si-otp" role="group" aria-label="Six-digit authentication code">
      {Digits.map((Digit, Index) => (
        <input
          key={Index}
          ref={(Element) => {
            Boxes.current[Index] = Element;
          }}
          id={Index === 0 ? "mathpath-login-2fa-code" : undefined}
          className={`mp-si-otp-box${Digit ? " filled" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={Index === 0 ? "one-time-code" : "off"}
          maxLength={Index === 0 ? LENGTH : 2}
          value={Digit}
          disabled={disabled}
          aria-label={`Digit ${Index + 1} of ${LENGTH}`}
          onChange={(Event) => HandleInput(Index, Event.target.value)}
          onKeyDown={(Event) => HandleKeyDown(Index, Event)}
          onPaste={HandlePaste}
          onFocus={(Event) => {
            // Always type into the first empty box, so digits stay in order.
            const Filled = Latest.current.length;
            if (Index > Filled) {
              Boxes.current[Filled]?.focus();
              return;
            }
            Event.target.select();
          }}
        />
      ))}
    </div>
  );
}
