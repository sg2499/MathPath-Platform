"use client";

// Phones and small tablets (below 768px): the round arrows that sit beside the
// test card on laptops have no room there, so the same Previous / Next arrows
// live on the question card itself -- either side of the answer box on typed
// answer screens, in a row under the options on option screens. They call the
// very same handlers as the laptop arrows; nothing about the attempt changes.

export type PhoneQuestionNav = {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function PhoneQuestionArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Previous = direction === "previous";
  return (
    <button
      type="button"
      className="se-phone-arrow"
      aria-label={Previous ? "Previous question" : "Next question"}
      disabled={disabled}
      onClick={onClick}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={Previous ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

export function PhoneQuestionArrowRow({ nav }: { nav: PhoneQuestionNav }) {
  return (
    <div className="se-phone-arrow-row">
      <PhoneQuestionArrow direction="previous" disabled={!nav.canPrevious} onClick={nav.onPrevious} />
      <PhoneQuestionArrow direction="next" disabled={!nav.canNext} onClick={nav.onNext} />
    </div>
  );
}
