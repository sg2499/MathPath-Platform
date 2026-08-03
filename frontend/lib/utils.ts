import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function resultMessage(accuracy: number): string {
  if (accuracy >= 90) return "Excellent work! You are doing great.";
  if (accuracy >= 75) return "Good effort. Keep practicing to get even better.";
  if (accuracy >= 50) return "Nice try. A little more practice will help.";
  return "Keep going. Practice makes you stronger.";
}

// DPS questions are typed free-text answers now, not MCQ picks -- see
// OPEN_ISSUES.md 2026-08-03e. Result views show the raw studentAnswer /
// correctAnswer values (plain numbers, per GeneratedQuestion.correct_answer)
// instead of a lettered option, so this cleans up trailing float noise
// (e.g. "3.7500" -> "3.75") the same way the admin preview's MCQ-era
// formatter used to for option values.
export function formatAnswerValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;

  const numeric = typeof value === "number" ? value : Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  if (Number.isInteger(numeric)) return String(numeric);

  const plain = numeric.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  return plain.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
