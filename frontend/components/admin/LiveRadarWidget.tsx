"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Clock, Search, Users, X } from "lucide-react";
import { api } from "@/lib/api";

interface LiveStudent {
  id: string;
  full_name: string;
  student_code: string;
  last_active_at: string;
}

// 2026-09-15 (Shailesh): "if there are 20-30 students active at the same
// time then the current radar would not be able to show all of them as
// there is not much space available in the admin dashboard view ... we need
// a robust and professional way in which we can have the total number in
// one place and a way where we can also view which students are active."
// The backend endpoint (/admin/live-students) already returns every active
// student unpaginated -- the 5-row cap was purely a frontend display
// choice, with a dead "+N more" text label for the rest. The dashboard
// tile itself stays exactly this small (it lives in a fixed w-80 sidebar
// slot next to the hero panel, so growing it isn't really an option) --
// what's new is that the tile's own header count and the "+N more" line
// are now buttons that open a full, scrollable, searchable list of every
// active student, reusing this app's existing dialog-overlay visual
// pattern (ConfirmDialog's fixed inset-0 blurred backdrop).
function FormatLastActive(isoTimestamp: string) {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "Live";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
}

function ViewAllActiveStudentsModal({ liveStudents, onClose }: { liveStudents: LiveStudent[]; onClose: () => void }) {
  const [searchText, setSearchText] = useState("");

  const filteredStudents = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return liveStudents;
    return liveStudents.filter(
      (student) => student.full_name?.toLowerCase().includes(term) || student.student_code?.toLowerCase().includes(term)
    );
  }, [liveStudents, searchText]);

  return (
    <div className="math-dialog-overlay fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="math-pop-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-[36px] border !border-slate-200 !bg-white p-6 backdrop-blur-2xl transition duration-300 dark:!border-slate-800 dark:!bg-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Live Radar</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {liveStudents.length} Student{liveStudents.length === 1 ? "" : "s"} Active Now
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:-translate-y-px hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative mt-4">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by name or student code..."
            className="math-input pl-11"
          />
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredStudents.length === 0 ? (
            <div className="py-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              No active students match "{searchText}".
            </div>
          ) : (
            filteredStudents.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-800/30 dark:bg-emerald-900/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{student.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{student.student_code}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Clock size={12} />
                  {FormatLastActive(student.last_active_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveRadarWidget() {
  const [liveStudents, setLiveStudents] = useState<LiveStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchLiveStudents = async () => {
      try {
        // NOTE: this previously read `process.env.NEXT_PUBLIC_API_URL`, which
        // is not a variable set anywhere in this project (the real one is
        // NEXT_PUBLIC_API_BASE_URL, used everywhere else via the shared `api`
        // client below). That made every request resolve to the literal
        // relative path "undefined/api/admin/live-students" against the
        // frontend's own origin instead of the backend, so it 404'd silently
        // and the widget always rendered "No students active" even when
        // students were live on the platform. Using the shared `api` client
        // fixes the URL and also attaches the admin's auth token for us.
        const res = await api.get("/admin/live-students");
        setLiveStudents(res.data?.live_students || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveStudents();
    const interval = setInterval(fetchLiveStudents, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && liveStudents.length === 0) {
    return (
      <div className="math-dashboard-card animate-pulse">
        <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded"></div>
      </div>
    );
  }

  return (
    <div className="math-dashboard-card relative overflow-hidden group border-2 border-emerald-500/20 shadow-emerald-500/10">
      <div className="absolute -top-10 -right-10 p-4 opacity-5 text-emerald-500">
        <Activity size={120} />
      </div>
      <div className="relative z-10 flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity size={18} className="text-emerald-500 animate-pulse" />
          Live Radar
        </h3>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={liveStudents.length === 0}
          title="View every active student"
          className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full transition hover:-translate-y-px disabled:cursor-default disabled:hover:translate-y-0"
        >
          {liveStudents.length} Active Now
        </button>
      </div>

      {liveStudents.length === 0 ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          No students active in the last 5 minutes. Safe to deploy.
        </div>
      ) : (
        <div className="space-y-3">
          {liveStudents.slice(0, 5).map((student) => (
            <div key={student.id} className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{student.full_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{student.student_code}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Clock size={12} />
                Live
              </div>
            </div>
          ))}
          {liveStudents.length > 5 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 text-center text-xs font-bold text-emerald-700 dark:text-emerald-300 pt-2 transition hover:underline"
            >
              <Users size={13} />+ {liveStudents.length - 5} more students online -- view all
            </button>
          )}
        </div>
      )}

      {isModalOpen && <ViewAllActiveStudentsModal liveStudents={liveStudents} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
