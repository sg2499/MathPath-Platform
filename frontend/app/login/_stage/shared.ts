// Shared types and abacus arithmetic for the sign-in stage (used by both the 3D and the illustrated renderers).

export type LoginRole = "admin" | "teacher" | "student";
export type StageSignal = "idle" | "busy" | "ok" | "error";
export type BeadKind = "h" | "e";

export const LOGIN_ROLES: LoginRole[] = ["admin", "teacher", "student"];

/** Number of rods on the abacus. Rod 0 is the ones rod, at the right. */
export const RODS = 7;

export interface DigitOptions {
  /** Seconds between rods starting to move, for a left-to-right sweep. */
  stagger?: number;
}

export type BeadTapHandler = (rod: number, kind: BeadKind, index: number) => void;

export interface RolePalette {
  dark: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

// The platform's existing role palettes (the same values the dashboards use).
export const ROLE_PALETTE: Record<LoginRole, RolePalette> = {
  admin: { dark: "#020617", primary: "#2563eb", secondary: "#22d3ee", accent: "#c026d3", glow: "#22d3ee" },
  teacher: { dark: "#2b102d", primary: "#6d2e5f", secondary: "#b76e79", accent: "#e6b8a2", glow: "#e6b8a2" },
  student: { dark: "#4c0519", primary: "#f97316", secondary: "#fb7185", accent: "#facc15", glow: "#facc15" },
};

export function digitsOf(value: number): number[] {
  const digits: number[] = [];
  for (let i = 0; i < RODS; i += 1) digits.push(Math.floor(value / Math.pow(10, i)) % 10);
  return digits;
}

export function valueOf(digits: number[]): number {
  let sum = 0;
  for (let i = 0; i < RODS; i += 1) sum += digits[i] * Math.pow(10, i);
  return sum;
}

/**
 * Moves one bead the way a real soroban bead moves and returns the rod's new digit.
 * The heaven bead toggles 5. An earth bead carries every bead between it and the beam with it.
 */
export function tapDigit(digit: number, kind: BeadKind, index: number): number {
  let heaven = digit >= 5;
  let earth = digit % 5;
  if (kind === "h") heaven = !heaven;
  else earth = index < earth ? index : index + 1;
  return (heaven ? 5 : 0) + earth;
}

export function randomInt(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

export interface Sum {
  a: number;
  b: number;
  op: "+" | "−";
}

/** A two-digit sum for the student stage. Subtractions never go negative. */
export function makeSum(): Sum {
  let a = randomInt(11, 89);
  let b = randomInt(11, 89);
  const op: Sum["op"] = Math.random() < 0.68 ? "+" : "−";
  if (op === "−" && b > a) [a, b] = [b, a];
  if (a === b) b = Math.max(11, b - 7);
  return { a, b, op };
}
