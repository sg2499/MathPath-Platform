"use client";

import { getBackendHealth, type BackendHealth } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 2026-09-18 (Shailesh: "make sure this never happens again"). A real
 * student went without visible assigned DPS sheets and Annual Competition
 * practice papers for over a week because a real fix sat correctly merged
 * to `main` without ever being deployed to the box `mock.mathpath.in`
 * actually resolves to -- confirmed only via a manual SSH `git log -1` +
 * `systemctl status` session. This widget exists so "is the fix actually
 * live" is a glance at the admin account menu instead of an SSH
 * investigation. See backend/app/core/deploy_info.py's module docstring
 * for the full incident writeup.
 *
 * Deliberately admin/super-admin only (rendered conditionally by the
 * caller) -- this is operational information for whoever can act on it,
 * not something a student or teacher needs cluttering their own menu.
 */

function FormatRelativeTime(IsoTimestamp: string): string {
  const Then = new Date(IsoTimestamp).getTime();
  if (Number.isNaN(Then)) return "unknown";
  const DeltaSeconds = Math.max(0, Math.round((Date.now() - Then) / 1000));
  if (DeltaSeconds < 60) return "just now";
  const DeltaMinutes = Math.round(DeltaSeconds / 60);
  if (DeltaMinutes < 60) return `${DeltaMinutes}m ago`;
  const DeltaHours = Math.round(DeltaMinutes / 60);
  if (DeltaHours < 48) return `${DeltaHours}h ago`;
  const DeltaDays = Math.round(DeltaHours / 24);
  return `${DeltaDays}d ago`;
}

export function BuildInfoBadge() {
  const [Health, SetHealth] = useState<BackendHealth | null>(null);
  const [ErrorMessage, SetErrorMessage] = useState<string | null>(null);
  const [Loading, SetLoading] = useState(true);

  const Load = () => {
    SetLoading(true);
    SetErrorMessage(null);
    getBackendHealth()
      .then((Data) => SetHealth(Data))
      .catch(() => {
        // Deliberately swallowed to plain text, not surfaced via the app's
        // usual apiErrorMessage() toast machinery -- this is a passive,
        // always-rendered widget inside a menu, not a user action; a
        // failed health check should read as "can't reach it right now",
        // never pop an error toast over something the admin didn't ask for.
        SetErrorMessage("Could not reach the backend just now.");
      })
      .finally(() => SetLoading(false));
  };

  useEffect(() => {
    Load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="math-account-menu-buildinfo">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          System Status
        </span>
        <button
          type="button"
          onClick={Load}
          aria-label="Recheck backend status"
          title="Recheck backend status"
          className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw size={12} className={Loading ? "animate-spin" : ""} />
        </button>
      </div>

      {ErrorMessage ? (
        <p className="mt-1 text-xs font-semibold text-rose-500">{ErrorMessage}</p>
      ) : Health ? (
        <div
          className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
          title={`${Health.deployedCommitSubject}\nCommit: ${Health.deployedCommitFull}\nCommitted: ${Health.deployedCommitTime}\nProcess started: ${Health.processStartedAt}`}
        >
          <p>
            Backend: <span className="font-mono">{Health.deployedCommit}</span>
          </p>
          <p className="text-slate-400 dark:text-slate-500">
            Deployed {FormatRelativeTime(Health.processStartedAt)}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs font-semibold text-slate-400">Checking...</p>
      )}
    </div>
  );
}
