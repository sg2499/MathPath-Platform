"use client";

import { ArrowRight } from "lucide-react";
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

  return (
    <div className="math-table">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Score</th>
            <th>Accuracy</th>
            <th>Correct</th>
            <th>Wrong</th>
            <th>Unanswered</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => (
            <tr key={row.attemptId}>
              <td className="font-bold text-slate-900">{row.studentName}</td>
              <td><ResultValueChip Value={`${RoundedNumber(row.score)} / ${RoundedNumber(row.maxScore)}`} Tone="blue" /></td>
              <td><ResultValueChip Value={`${RoundedNumber(row.accuracyPercentage)}%`} Tone={AccuracyTone(row.accuracyPercentage)} /></td>
              <td>{row.correct}</td>
              <td>{row.wrong}</td>
              <td>{row.unanswered}</td>
              <td>
                <button
                  className="inline-flex items-center gap-2 font-bold text-blue-700 hover:text-blue-900"
                  onClick={() => router.push(`/admin/results/attempts/${row.attemptId}`)}
                >
                  View
                  <ArrowRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
