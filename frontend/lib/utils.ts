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
