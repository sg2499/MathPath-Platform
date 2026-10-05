// Runs the sign-in stage: picks the renderer (3D or illustrated), keeps the abacus, the live readout,
// the optional student challenge and the sign-in feedback in step. It never touches authentication.

import { createFlatStage } from "./flat";
import type { FlatStage } from "./flat";
import { RODS, digitsOf, makeSum, randomInt, tapDigit, valueOf } from "./shared";
import type { BeadKind, DigitOptions, LoginRole, StageSignal } from "./shared";
import type { Stage3D } from "./stage3d";

export interface LoginStageElements {
  stage: HTMLElement;
  slot: HTMLElement;
  canvas: HTMLCanvasElement;
  flat: HTMLElement;
  line: HTMLElement;
  big: HTMLElement;
  challengeButton: HTMLButtonElement;
  challengeBar: HTMLElement;
  hint: HTMLElement;
}

export interface LoginStageOptions {
  role: LoginRole;
  dark: boolean;
  /** Fired when the student wins the challenge, so the page can celebrate. */
  onCelebrate(): void;
}

export interface LoginStageController {
  setRole(role: LoginRole): void;
  setDark(dark: boolean): void;
  signal(kind: StageSignal): void;
  /** Call while the visitor is typing: the sums wait instead of competing for attention. */
  holdForTyping(): void;
  destroy(): void;
}

const FORCE_3D_KEY = "mathpath_login_force_3d";
const DESKTOP_MIN_WIDTH = 900;
const CHALLENGE_SECONDS = 15;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const formatNumber = (value: number) => value.toLocaleString("en-IN");

export function createLoginStage(elements: LoginStageElements, options: LoginStageOptions): LoginStageController {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let force3d = false;
  try {
    force3d = window.localStorage.getItem(FORCE_3D_KEY) === "1";
  } catch {
    force3d = false;
  }

  let role = options.role;
  let dark = options.dark;
  let digits = digitsOf(0);
  let generation = 0;
  let holdUntil = 0;
  let resumeTimer = 0;
  let signalTimer = 0;
  let busy = false;
  let destroyed = false;
  let challenge: { target: number; timer: number; done: boolean } | null = null;
  let stage3d: Stage3D | null = null;
  let stage3dBroken = false;
  let stage3dLoading = false;

  /* ---------- readout ---------- */
  function readout(line: string, big: number | string) {
    elements.line.textContent = line;
    const text = typeof big === "number" ? formatNumber(big) : big;
    elements.big.classList.toggle("text", typeof big === "string" && big.length > 8);
    elements.big.classList.toggle("mid", typeof big === "string" && big.length <= 8);
    if (elements.big.textContent !== text) {
      elements.big.textContent = text;
      elements.big.classList.remove("tick");
      void elements.big.offsetWidth;
      elements.big.classList.add("tick");
    }
  }

  // Teacher and admin see the real date and time, never made-up figures.
  function roleReadout() {
    if (role === "student" || busy || destroyed) return;
    const now = new Date();
    const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
    if (role === "teacher") {
      const hour = now.getHours();
      readout(date, hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
    } else {
      readout(date, now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
    }
  }
  const clockTimer = window.setInterval(roleReadout, 15000);

  /* ---------- sound: only ever in answer to a tap ---------- */
  let audioContext: AudioContext | null = null;
  function audio(): AudioContext | null {
    try {
      if (!audioContext) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) audioContext = new Ctor();
      }
      if (audioContext && audioContext.state === "suspended") void audioContext.resume();
    } catch {
      audioContext = null;
    }
    return audioContext;
  }
  function tone(from: number, to: number, at: number, length: number, volume: number, type: OscillatorType) {
    const context = audioContext;
    if (!context) return;
    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + length * 0.8);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
  }
  const clickSound = () => {
    if (audio()) tone(900, 430, 0, 0.07, 0.14, "triangle");
  };
  const chimeSound = () => {
    if (audio()) [523, 659, 784, 1047].forEach((note, index) => tone(note, note, index * 0.09, 0.22, 0.1, "sine"));
  };

  /* ---------- abacus ---------- */
  function show(next: number[], digitOptions?: DigitOptions) {
    digits = next.slice();
    flat.setDigits(digits, digitOptions);
    stage3d?.setDigits(digits, digitOptions);
  }

  function tapBead(rod: number, kind: BeadKind, index: number) {
    if (busy || role !== "student") return;
    if (challenge?.done) return;
    const next = digits.slice();
    next[rod] = tapDigit(digits[rod], kind, index);
    clickSound();
    if (challenge) {
      show(next);
      readout(`Show ${challenge.target} on the beads`, valueOf(next));
      if (valueOf(next) === challenge.target) winChallenge();
      return;
    }
    generation += 1;
    window.clearTimeout(resumeTimer);
    show(next);
    readout("Your number", valueOf(next));
    resumeTimer = window.setTimeout(demo, 7000);
  }

  const flat: FlatStage = createFlatStage(elements.flat, tapBead);

  /* ---------- the living sums ---------- */
  function ready(mine: number): Promise<boolean> {
    return new Promise((resolve) => {
      const wait = () => {
        if (mine !== generation || destroyed) return resolve(false);
        if (Date.now() < holdUntil || document.hidden) return void window.setTimeout(wait, 250);
        resolve(true);
      };
      wait();
    });
  }

  async function demo() {
    generation += 1;
    const mine = generation;
    window.clearTimeout(resumeTimer);
    if (role !== "student" || destroyed) return;
    if (reducedMotion) {
      readout("47 + 38 =", 85);
      show(digitsOf(85));
      return;
    }
    while (mine === generation) {
      if (!(await ready(mine))) return;
      const sum = makeSum();
      const line = `${formatNumber(sum.a)} ${sum.op} ${formatNumber(sum.b)}`;
      readout(line, sum.a);
      show(digitsOf(sum.a), { stagger: 0.05 });
      await sleep(1500);
      if (!(await ready(mine))) return;
      let running = sum.a;
      const parts = digitsOf(sum.b);
      // Place by place, highest first, as it is done on a soroban.
      for (let place = RODS - 1; place >= 0; place -= 1) {
        if (!parts[place]) continue;
        running += (sum.op === "+" ? 1 : -1) * parts[place] * Math.pow(10, place);
        show(digitsOf(running), { stagger: 0.04 });
        readout(line, running);
        await sleep(1050);
        if (!(await ready(mine))) return;
      }
      readout(`${line} =`, running);
      await sleep(2800);
    }
  }

  /* ---------- the challenge: optional, short, and never in the way of signing in ---------- */
  function endChallenge(resume: boolean) {
    if (challenge) {
      window.clearTimeout(challenge.timer);
      challenge = null;
    }
    elements.challengeButton.textContent = "Try a challenge";
    elements.challengeButton.hidden = false;
    elements.challengeBar.hidden = true;
    if (resume) void demo();
  }

  function startChallenge() {
    if (busy || role !== "student") return;
    generation += 1;
    window.clearTimeout(resumeTimer);
    audio();
    let target = randomInt(12, 98);
    if (target % 10 === 0) target += 3;
    show(digitsOf(0), { stagger: 0.03 });
    readout(`Show ${target} on the beads`, 0);
    elements.challengeButton.textContent = "Skip";
    elements.challengeBar.hidden = false;
    const fill = elements.challengeBar.firstElementChild as HTMLElement | null;
    if (fill) {
      fill.style.animation = "none";
      void fill.offsetWidth;
      fill.style.animation = "";
    }
    const active = { target, done: false, timer: 0 };
    active.timer = window.setTimeout(() => {
      // Time is up: the abacus shows the answer, so the child still leaves knowing it.
      active.done = true;
      show(digitsOf(target), { stagger: 0.05 });
      readout(`This is ${target}`, target);
      elements.challengeBar.hidden = true;
      elements.challengeButton.hidden = true;
      active.timer = window.setTimeout(() => endChallenge(true), 3200);
    }, CHALLENGE_SECONDS * 1000);
    challenge = active;
  }

  function winChallenge() {
    if (!challenge) return;
    const active = challenge;
    window.clearTimeout(active.timer);
    active.done = true;
    elements.challengeBar.hidden = true;
    elements.challengeButton.hidden = true;
    readout("You did it!", active.target);
    chimeSound();
    if (!reducedMotion) options.onCelebrate();
    active.timer = window.setTimeout(() => endChallenge(true), 2800);
  }

  const onChallengeClick = () => {
    if (challenge) endChallenge(true);
    else startChallenge();
  };
  elements.challengeButton.addEventListener("click", onChallengeClick);

  /* ---------- which version is showing ---------- */
  const wants3D = () => !reducedMotion && !stage3dBroken && window.innerWidth >= DESKTOP_MIN_WIDTH;

  function fallBackToFlat() {
    stage3dBroken = true;
    stage3d?.dispose();
    stage3d = null;
    pickRenderer();
    flat.setDigits(digits);
  }

  function pickRenderer() {
    if (destroyed) return;
    flat.show(role);
    const use3D = wants3D() && stage3d !== null;
    elements.canvas.hidden = !use3D;
    elements.flat.hidden = use3D;
    if (stage3d) {
      stage3d.run(use3D && !document.hidden);
      if (use3D) stage3d.fit();
    }
    elements.hint.textContent = `${window.matchMedia("(hover: none)").matches ? "Tap" : "Click"} any bead to set a number.`;
    if (wants3D() && !stage3d && !stage3dLoading) void load3D();
  }

  // three.js arrives in its own chunk, after the form is already usable.
  async function load3D() {
    stage3dLoading = true;
    try {
      const { createStage3D } = await import("./stage3d");
      if (destroyed || !wants3D()) return;
      elements.canvas.hidden = false;
      const created = createStage3D({
        canvas: elements.canvas,
        stage: elements.stage,
        slot: elements.slot,
        reducedMotion,
        force: force3d,
        onBead: tapBead,
        onSlow: fallBackToFlat,
      });
      created.show(role, dark, true);
      created.setDigits(digits);
      stage3d = created;
    } catch {
      stage3dBroken = true;
      elements.canvas.hidden = true;
    } finally {
      stage3dLoading = false;
      pickRenderer();
    }
  }

  /* ---------- wiring ---------- */
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(pickRenderer, 60);
    if (stage3d && !elements.canvas.hidden) stage3d.fit();
  };
  const onVisibility = () => {
    stage3d?.run(!document.hidden && !elements.canvas.hidden);
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (stage3d && !elements.canvas.hidden) stage3d.fit();
        });
  resizeObserver?.observe(elements.slot);
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (stage3d && !elements.canvas.hidden) stage3d.fit();
    });
  }

  elements.challengeBar.hidden = true;
  pickRenderer();
  const startTimer = window.setTimeout(() => {
    if (role === "student") void demo();
    else roleReadout();
  }, reducedMotion ? 0 : 650);

  return {
    setRole(next) {
      if (next === role || destroyed) return;
      if (challenge) endChallenge(false);
      role = next;
      generation += 1;
      const mine = generation;
      window.clearTimeout(resumeTimer);
      window.clearTimeout(startTimer);
      stage3d?.show(role, dark);
      pickRenderer();
      if (role === "student") {
        // The soroban clearing sweep, then the sums pick up again.
        show(digitsOf(0), { stagger: 0.03 });
        window.setTimeout(() => {
          if (mine === generation) void demo();
        }, reducedMotion ? 0 : 560);
      } else {
        roleReadout();
      }
    },
    setDark(next) {
      if (next === dark || destroyed) return;
      dark = next;
      stage3d?.show(role, dark);
    },
    signal(kind) {
      if (destroyed) return;
      window.clearTimeout(signalTimer);
      stage3d?.signal(kind);
      if (kind === "busy") {
        if (challenge) endChallenge(false);
        busy = true;
        generation += 1;
        window.clearTimeout(resumeTimer);
        return;
      }
      if (kind === "ok") {
        busy = true;
        // Every bead to the beam: a full abacus. Confetti is the page's call, and only for students.
        if (role === "student") show(digitsOf(9999999), { stagger: 0.03 });
        readout("Signed in", "Welcome");
        return;
      }
      if (kind === "error") {
        if (role === "student") show(digitsOf(0), { stagger: 0.02 });
        readout("Not signed in", role === "student" ? 0 : "Try again");
        signalTimer = window.setTimeout(() => {
          busy = false;
          if (role === "student") void demo();
          else roleReadout();
        }, 2200);
        return;
      }
      busy = false;
      if (role === "student") void demo();
      else roleReadout();
    },
    holdForTyping() {
      holdUntil = Date.now() + 2200;
    },
    destroy() {
      destroyed = true;
      generation += 1;
      window.clearTimeout(resumeTimer);
      window.clearTimeout(signalTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(resizeTimer);
      window.clearInterval(clockTimer);
      if (challenge) window.clearTimeout(challenge.timer);
      elements.challengeButton.removeEventListener("click", onChallengeClick);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver?.disconnect();
      stage3d?.dispose();
      stage3d = null;
      flat.destroy();
      if (audioContext) void audioContext.close().catch(() => undefined);
    },
  };
}
