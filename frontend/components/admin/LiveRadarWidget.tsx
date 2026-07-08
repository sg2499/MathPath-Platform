"use client";

import { useEffect, useState } from "react";
import { Activity, Clock } from "lucide-react";
import { getToken } from "@/lib/auth";

interface LiveStudent {
  id: string;
  full_name: string;
  student_code: string;
  last_active_at: string;
}

export function LiveRadarWidget() {
  const [liveStudents, setLiveStudents] = useState<LiveStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveStudents = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/live-students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch live students");
        const data = await res.json();
        setLiveStudents(data.live_students || []);
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
        <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
          {liveStudents.length} Active Now
        </span>
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
            <div className="text-center text-xs text-slate-500 font-medium pt-2">
              + {liveStudents.length - 5} more students online
            </div>
          )}
        </div>
      )}
    </div>
  );
}
