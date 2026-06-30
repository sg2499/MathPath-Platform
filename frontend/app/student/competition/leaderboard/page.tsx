"use client";

import React, { useState, useEffect } from "react";
import { Award, Clock, Star, Trophy, Users, AlertCircle, ChevronDown, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { LoadingState } from "@/components/common/LoadingState";
import { useRouter } from "next/navigation";

function getInitials(name: string) {
  if (!name) return "";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function MockLeaderboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any>(null);

  useEffect(() => {
    async function loadExams() {
      try {
        const response = await api.get(`/student/competition/mock-assignments`);
        const data = response.data;
        if (data.assignments && data.assignments.length > 0) {
          const completed = data.assignments.filter((a: any) => a.status === "COMPLETED");
          setAssignments(completed);
          if (completed.length > 0) {
            setSelectedExamId(completed[0].mockExam.mockExamId);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load mock exams");
      } finally {
        setLoading(false);
      }
    }
    loadExams();
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    async function loadLeaderboard() {
      setLoading(true);
      try {
        const response = await api.get(`/student/competition/mock-exams/${selectedExamId}/leaderboard`);
        const data = response.data;
        setLeaderboardData(data);
      } catch (err: any) {
        setError(err.message || "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [selectedExamId]);

  if (loading && !leaderboardData) return <LoadingState />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Something went wrong</h2>
        <p className="text-slate-500 mt-2">{error}</p>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Trophy className="h-16 w-16 text-slate-300 dark:text-slate-700 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">No Mock Exams Completed</h2>
        <p className="text-slate-500 mt-2">Complete a mock exam to view the leaderboard.</p>
      </div>
    );
  }

  const { leaderboard = [], currentStudentRank, totalParticipants } = leaderboardData || {};
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="math-role-student w-full min-h-screen bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
        <button 
          onClick={() => router.back()}
        className="math-role-action-button px-4 py-2 text-sm w-fit inline-flex items-center gap-2 shadow-sm hover:shadow"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Trophy className="text-yellow-500 h-8 w-8" />
            Mock Exam Leaderboard
          </h1>
          <p className="text-slate-500 mt-1">See how you stack up against other students in your level.</p>
        </div>
        
        <div className="relative min-w-[250px]">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Select Exam</label>
          <div className="relative">
            <select
              value={selectedExamId || ""}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 pr-10 font-bold text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 transition"
            >
              {assignments.map(a => (
                <option key={a.mockExam.mockExamId} value={a.mockExam.mockExamId}>{a.mockExam.title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {loading && <div className="animate-pulse h-96 bg-slate-100 rounded-3xl" />}

      {!loading && leaderboard.length === 0 && (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-lg font-bold text-slate-500">No participants yet</p>
        </div>
      )}

      {!loading && leaderboard.length > 0 && (
        <>
          {/* Podium Component */}
          <div className="pt-16 pb-12 flex items-end justify-center gap-4 md:gap-8 relative">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-indigo-500/10 blur-[100px] pointer-events-none rounded-full" />
            
            {/* Silver (Rank 2) */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-[slideUp_0.5s_ease-out] z-10 hover:-translate-y-2 transition-transform duration-300">
                <div className="relative mb-5">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-slate-300 bg-slate-100 overflow-hidden">
                    {top3[1].photoUrl ? (
                      <img src={top3[1].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-black text-xl">{getInitials(top3[1].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-slate-500 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-white shadow-sm">2ND</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-white max-w-[120px] text-sm leading-tight break-words">{top3[1].name}</p>
                  <p className="text-sm font-black text-slate-500">{top3[1].percentage}%</p>
                </div>
                <div className="w-28 md:w-36 h-36 bg-gradient-to-t from-slate-300 to-slate-100 rounded-t-2xl shadow-xl flex items-center justify-center border-t border-white/50 backdrop-blur-sm">
                  <span className="text-5xl font-black text-slate-400 opacity-40">2</span>
                </div>
              </div>
            )}

            {/* Gold (Rank 1) */}
            {top3[0] && (
              <div className="flex flex-col items-center z-20 animate-[slideUp_0.6s_ease-out] hover:-translate-y-3 transition-transform duration-300">
                <div className="relative mb-5">
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 drop-shadow-lg">
                    <CrownIcon />
                  </div>
                  <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-yellow-400 bg-yellow-50 overflow-hidden shadow-xl shadow-yellow-500/20">
                    {top3[0].photoUrl ? (
                      <img src={top3[0].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-black text-3xl">{getInitials(top3[0].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-yellow-500 text-white text-sm font-black px-3 py-0.5 rounded-full border-2 border-white shadow-md">1ST</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-black text-lg text-slate-800 dark:text-white max-w-[140px] leading-tight break-words">{top3[0].name}</p>
                  <p className="text-base font-black text-yellow-600">{top3[0].percentage}%</p>
                </div>
                <div className="w-32 md:w-44 h-48 bg-gradient-to-t from-yellow-500 via-yellow-400 to-yellow-200 rounded-t-2xl shadow-2xl flex items-center justify-center border-t-2 border-white/60 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 translate-x-[-100%] animate-[shimmer_2s_infinite]" />
                  <span className="text-7xl font-black text-yellow-700 opacity-30">1</span>
                </div>
              </div>
            )}

            {/* Bronze (Rank 3) */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-[slideUp_0.4s_ease-out] z-10 hover:-translate-y-2 transition-transform duration-300">
                <div className="relative mb-5">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-orange-400 bg-orange-50 overflow-hidden">
                    {top3[2].photoUrl ? (
                      <img src={top3[2].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-orange-100 text-orange-600 font-black text-xl">{getInitials(top3[2].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-white shadow-sm">3RD</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-white max-w-[120px] text-sm leading-tight break-words">{top3[2].name}</p>
                  <p className="text-sm font-black text-orange-500">{top3[2].percentage}%</p>
                </div>
                <div className="w-28 md:w-36 h-28 bg-gradient-to-t from-orange-400 to-orange-200 rounded-t-2xl shadow-xl flex items-center justify-center border-t border-white/50 backdrop-blur-sm">
                  <span className="text-5xl font-black text-orange-700 opacity-30">3</span>
                </div>
              </div>
            )}
          </div>

          {/* List for 4-10 */}
          {rest.length > 0 && (
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-800 overflow-hidden shadow-2xl shadow-indigo-500/5">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-5">Rank</th>
                    <th className="px-6 py-5">Student</th>
                    <th className="px-6 py-5 text-center">Accuracy</th>
                    <th className="px-6 py-5 text-right hidden sm:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rest.map((r: any) => (
                    <tr key={r.rank} className={`transition-all duration-200 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md hover:scale-[1.01] hover:z-10 relative cursor-default ${r.isCurrent ? 'bg-indigo-50/80 dark:bg-indigo-900/40' : ''}`}>
                      <td className="px-6 py-5 font-black text-slate-500 text-base">#{r.rank}</td>
                      <td className="px-6 py-5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex-shrink-0 shadow-sm">
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt="avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-black text-slate-500">{getInitials(r.name)}</div>
                          )}
                        </div>
                        <span className={`font-bold text-base ${r.isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {r.name} {r.isCurrent && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full uppercase tracking-wider">You</span>}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-slate-700 dark:text-slate-300 text-base">{r.percentage}%</td>
                      <td className="px-6 py-5 text-right font-bold text-slate-400 hidden sm:table-cell text-sm">{Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Current Student Pinned (if outside top 10) */}
          {currentStudentRank && currentStudentRank > 10 && (
            <div className="sticky bottom-4 bg-indigo-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between animate-[slideUp_0.3s_ease-out]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-black text-xl">
                  #{currentStudentRank}
                </div>
                <div>
                  <p className="font-bold">Your Current Rank</p>
                  <p className="text-indigo-200 text-sm">Keep practicing to reach the Top 10!</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-xl">{leaderboardData.currentStudentEntry?.percentage}%</p>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function CrownIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="#EAB308" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 22H22V20H2V22ZM21.6 6.3L17.2 13.5L12.5 4.5C12.3 4.2 11.7 4.2 11.5 4.5L6.8 13.5L2.4 6.3C2.1 5.9 1.4 6 1.3 6.5L3 18H21L22.7 6.5C22.6 6 21.9 5.9 21.6 6.3Z" fill="currentColor"/>
    </svg>
  );
}