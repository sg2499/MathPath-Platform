"use client";

import { useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/common/AppShell";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { runAdminDbSearch, type DbSearchResult } from "@/lib/api/admin";
import { AlertCircle, Database, Loader2, Play, ShieldAlert } from "lucide-react";

// Superadmin-only ad-hoc SQL search, requested by the hosting team as the
// sanctioned way to inspect real production data without handing a raw DB
// credential to anyone's dev machine (see docs/project-memory/
// LEADERBOARD_REVAMP_SPEC_2026-08-25.md, 2026-08-31 entry). The backend
// (POST /api/admin/db-search) enforces SELECT-only, single-statement, and a
// hard row cap; on Postgres it also opens a genuinely read-only transaction
// so a gap in that validation still can't write anything. Every query run
// here is written to AuditLog on the backend, since this page can surface
// arbitrary student PII.
export default function AdminDbSearchPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [query, setQuery] = useState("SELECT * FROM attempts LIMIT 20");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DbSearchResult | null>(null);

  if (!Ready) return null;

  async function handleRun() {
    if (!query.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      const data = await runAdminDbSearch(query);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(apiErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter runs the query -- standard SQL-console convention.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  }

  return (
    <AppShell>
      <main className="w-full space-y-5">
        <section className="math-card p-6 md:p-8 rounded-3xl relative overflow-hidden">
          <div className="math-block-header mb-3">
            <Database size={14} />
            System Tools
          </div>
          <h1 className="math-title mb-2">Database Search</h1>
          <p className="math-subtitle max-w-3xl">
            Run a single read-only SELECT against the live database. Every query is validated
            server-side (SELECT-only, one statement, capped at {result?.rowLimit ?? 200} rows) and
            logged with your admin account.
          </p>

          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              Read-only by design -- writes, DDL, and multi-statement queries are rejected before
              they reach the database. Results can include real student names and contact info;
              don&apos;t paste them anywhere outside this admin workspace.
            </span>
          </div>

          <div className="mt-6">
            <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">
              SQL Query
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              rows={6}
              placeholder="SELECT * FROM students LIMIT 20"
              className="w-full font-mono text-sm bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-0 transition resize-y"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleRun}
                disabled={running || !query.trim()}
                className="math-role-action-button px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {running ? "Running..." : "Run Query"}
              </button>
              <span className="text-xs text-slate-400">Ctrl/Cmd + Enter to run</span>
            </div>
          </div>
        </section>

        {error && (
          <section className="math-card p-6 rounded-3xl border-2 border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-red-700 dark:text-red-300">Query failed</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1 font-mono break-all">{error}</p>
            </div>
          </section>
        )}

        {result && (
          <section className="math-card rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                {result.rowCount === result.rowLimit ? ` (capped at ${result.rowLimit})` : ""}
              </p>
            </div>
            {result.rows.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">Query ran successfully -- no rows returned.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-xs border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      {result.columns.map((col, i) => (
                        <th key={`${col}-${i}`} className="px-4 py-3 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                            {cell === null ? <span className="text-slate-400 italic">null</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
