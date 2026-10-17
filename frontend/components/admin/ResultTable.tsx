"use client";

import { Eye } from "lucide-react";
import { formatMathPathDateTime } from "@/lib/date";
import { useRouter } from "next/navigation";


function ResultValueChip({ Value, Tone = "blue" }: { Value: string; Tone?: "blue" | "green" | "red" | "slate" }) {
  const ToneClasses = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${ToneClasses[Tone]}`}>{Value}</span>;
}

function RoundedNumber(Value: unknown) {
  const NumberValue = Number(Value);
  return Number.isFinite(NumberValue) ? String(Math.round(NumberValue)) : "—";
}

function AccuracyTone(Value: unknown): "green" | "red" | "slate" {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return "slate";
  return NumberValue >= 70 ? "green" : "red";
}

export function ResultTable({ results }: { results: any[] }) {
  const router = useRouter();

  // 2026-10 (admin revamp): the student code under each name, the submitted
  // date, the View button in the admin style, and a card per row below
  // 1280px instead of a sideways-scrolling table.
  return (
    <div className="math-table math-admin-directory-table">
      <table className="ad-cards ad-cards-wide">
        <thead>
          <tr>
            <th>Student</th>
            <th>Score</th>
            <th>Accuracy</th>
            <th>Correct</th>
            <th>Wrong</th>
            <th>Unanswered</th>
            <th>Submitted</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => (
            <tr key={row.attemptId}>
              <td className="ad-card-title">
                <p className="font-black text-slate-950 dark:text-white">{row.studentName || "—"}</p>
                {row.studentCode ? <p className="ad-code">{row.studentCode}</p> : null}
              </td>
              <td data-label="Score"><ResultValueChip Value={`${RoundedNumber(row.score)} / ${RoundedNumber(row.maxScore)}`} Tone="blue" /></td>
              <td data-label="Accuracy"><ResultValueChip Value={`${RoundedNumber(row.accuracyPercentage)}%`} Tone={AccuracyTone(row.accuracyPercentage)} /></td>
              <td data-label="Correct">{row.correct ?? "—"}</td>
              <td data-label="Wrong">{row.wrong ?? "—"}</td>
              <td data-label="Unanswered">{row.unanswered ?? "—"}</td>
              <td data-label="Submitted" className="ad-date">{formatMathPathDateTime(row.completedDate || row.submittedAt) || "—"}</td>
              <td data-label="Action">
                <button
                  type="button"
                  className="math-role-action-button px-3 py-2"
                  onClick={() => router.push(`/admin/results/attempts/${row.attemptId}`)}
                  title="Open this attempt"
                >
                  <Eye size={15} />
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
