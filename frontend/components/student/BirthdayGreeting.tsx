"use client";

// 2026-10-18 (Birthdays): the student's greeting on their birthday.
//
// The first time the dashboard opens on the day, the card opens over it:
// beads slide along an abacus rod, one for every year, while the age counts
// up, then a short burst of confetti. Closing it leaves a "Happy Birthday"
// pill under the dashboard title for the rest of the day, which opens the
// card again (so does the birthday notification, via ?birthday=1).
// Reduced-motion settings get the finished card with no movement.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cake, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { dismissBirthday, getStudentBirthday, markBirthdaySeen, type BirthdayGreeting } from "@/lib/api/birthday";

const BEAD_STEP_MS = 70;

function PrefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

async function Celebrate() {
  if (PrefersReducedMotion()) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#f97316", "#fb7185", "#facc15", "#ffffff"];
  const shoot = (x: number, angle: number) =>
    confetti({ particleCount: 46, angle, spread: 62, startVelocity: 46, origin: { x, y: 0.72 }, colors, scalar: 0.9, ticks: 220, zIndex: 10001, disableForReducedMotion: true });
  shoot(0.08, 62);
  shoot(0.92, 118);
}

/** One rod per ten years; beads in fives, as on a real abacus. */
function Abacus({ age, shown }: { age: number; shown: number }) {
  const Rods: number[][] = [];
  for (let Start = 0; Start < age; Start += 10) {
    Rods.push(Array.from({ length: Math.min(10, age - Start) }, (_, Index) => Start + Index));
  }
  return (
    <div className="se-bday-abacus" aria-hidden="true">
      {Rods.map((Beads, RodIndex) => (
        <div key={RodIndex} className="se-bday-rod">
          <span className="se-bday-rod-line" />
          {Beads.map((Bead) => (
            <span
              key={Bead}
              className={`se-bday-bead ${Math.floor((Bead % 10) / 5) === 0 ? "is-a" : "is-b"} ${Bead < shown ? "is-in" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function GreetingCard({ greeting, onClose }: { greeting: BirthdayGreeting; onClose: () => void }) {
  const Age = greeting.age && greeting.age > 0 && greeting.age <= 20 ? greeting.age : null;
  const Still = PrefersReducedMotion();
  const [Shown, SetShown] = useState(Still || !Age ? Age ?? 0 : 0);
  const ButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ButtonRef.current?.focus({ preventScroll: true });
    if (!Age || Still) {
      void Celebrate();
      return;
    }
    let Count = 0;
    const Timer = window.setInterval(() => {
      Count += 1;
      SetShown(Count);
      if (Count >= Age) {
        window.clearInterval(Timer);
        void Celebrate();
      }
    }, BEAD_STEP_MS);
    return () => window.clearInterval(Timer);
  }, [Age, Still]);

  useEffect(() => {
    const OnKey = (Event: KeyboardEvent) => {
      if (Event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", OnKey);
    const Overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", OnKey);
      document.body.style.overflow = Overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="se-bday-backdrop" onMouseDown={(Event) => { if (Event.target === Event.currentTarget) onClose(); }}>
      <div className="se-bday-card" role="dialog" aria-modal="true" aria-labelledby="se-bday-title" aria-describedby="se-bday-wish">
        <button type="button" className="se-bday-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="se-bday-stage">
          {Age ? (
            <>
              <Abacus age={Age} shown={Shown} />
              <p className="se-bday-age" aria-label={`${Age} today`}>
                <span className="se-bday-age-number">{Shown || Age}</span>
                <span className="se-bday-age-label">Today</span>
              </p>
            </>
          ) : (
            <span className="se-bday-cake"><Cake size={44} strokeWidth={1.6} /></span>
          )}
        </div>
        <div className="se-bday-body">
          <h2 id="se-bday-title" className="se-bday-title">Happy Birthday, {greeting.firstName}!</h2>
          <p id="se-bday-wish" className="se-bday-wish">{greeting.text}</p>
          <p className="se-bday-sign">From {greeting.signedBy.replace(/^Everyone/, "everyone")}</p>
          <button ref={ButtonRef} type="button" className="se-bday-thanks" onClick={onClose}>
            Thank You!
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The pill under the dashboard title, plus the card when it is open. */
export function StudentBirthdayGreeting() {
  const Client = useQueryClient();
  const Query = useQuery({ queryKey: ["student-birthday"], queryFn: getStudentBirthday, staleTime: 5 * 60_000, retry: false });
  const Greeting = Query.data?.isBirthday ? Query.data.greeting : null;
  const [Open, SetOpen] = useState(false);
  const Opened = useRef(false);

  const Seen = useMutation({ mutationFn: markBirthdaySeen });
  const Dismiss = useMutation({
    mutationFn: dismissBirthday,
    onSuccess: () => Client.invalidateQueries({ queryKey: ["student-birthday"] }),
  });

  useEffect(() => {
    if (!Greeting || Opened.current) return;
    const FromNotification = new URLSearchParams(window.location.search).get("birthday") === "1";
    if (!Greeting.dismissed || FromNotification) {
      Opened.current = true;
      SetOpen(true);
      if (!Greeting.seen) Seen.mutate(Greeting.id);
    }
    if (FromNotification) {
      const Url = new URL(window.location.href);
      Url.searchParams.delete("birthday");
      window.history.replaceState(null, "", `${Url.pathname}${Url.search}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Greeting?.id]);

  const Close = useCallback(() => {
    SetOpen(false);
    if (Greeting && !Greeting.dismissed) Dismiss.mutate(Greeting.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Greeting?.id, Greeting?.dismissed]);

  if (!Greeting) return null;
  return (
    <>
      <button type="button" className="se-bday-pill" onClick={() => SetOpen(true)} aria-haspopup="dialog">
        <span className="se-bday-pill-icon"><Cake size={15} /></span>
        <span className="se-bday-pill-text">Happy Birthday{Greeting.age ? <span className="se-bday-pill-age"> · {Greeting.age} Today</span> : null}</span>
      </button>
      {Open ? <GreetingCard greeting={Greeting} onClose={Close} /> : null}
    </>
  );
}
