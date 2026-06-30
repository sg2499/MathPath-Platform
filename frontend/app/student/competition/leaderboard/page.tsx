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
      <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        <button 
          onClick={() => router.back()}
        className="math-role-action-button px-4 py-2 text-sm w-fit inline-flex items-center gap-2 shadow-sm hover:shadow"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="math-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10">
          <div className="math-block-header mb-3"><Trophy size={16} className="text-yellow-500" /> Leaderboard</div>
          <h1 className="math-title mb-2">Mock Exam Leaderboard</h1>
          <p className="math-subtitle">
            See how you stack up against other students in your level. Compete for the top spot!
          </p>
        </div>
        
        <div className="relative min-w-[250px] z-10">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Exam</label>
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
          <div className="pt-24 pb-16 flex items-end justify-center gap-2 md:gap-8 relative mt-6">
            {/* Ambient Background Glow / Stage */}
            <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-64 bg-indigo-500/10 blur-[100px] pointer-events-none rounded-[100%]" />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-2xl h-8 bg-slate-900/5 dark:bg-black/30 blur-xl pointer-events-none rounded-[100%]" />
            
            {/* Silver (Rank 2) */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-[slideUp_0.5s_ease-out] z-10 hover:-translate-y-3 transition-transform duration-300 group">
                <div className="relative mb-6">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-[3px] border-slate-300 bg-slate-100 overflow-hidden shadow-lg group-hover:shadow-slate-400/30 transition-shadow">
                    {top3[1].photoUrl ? (
                      <img src={top3[1].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-black text-xl">{getInitials(top3[1].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-gradient-to-br from-slate-400 to-slate-500 text-white text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full border-2 border-white shadow-md uppercase tracking-wider">2nd</div>
                </div>
                <div className="text-center mb-5">
                  <p className="font-bold text-slate-800 dark:text-white max-w-[120px] text-sm leading-tight break-words">{top3[1].name}</p>
                  <p className="text-sm font-black text-slate-500 mt-1">{top3[1].percentage}%</p>
                </div>
                <div className="w-28 md:w-36 h-40 bg-gradient-to-t from-slate-300/80 to-slate-100/90 rounded-t-2xl shadow-[0_0_30px_rgba(148,163,184,0.2)] flex items-center justify-center border-t border-slate-200 backdrop-blur-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                  <span className="text-6xl font-black text-slate-400/50 drop-shadow-sm">2</span>
                </div>
              </div>
            )}

            {/* Gold (Rank 1) */}
            {top3[0] && (
              <div className="flex flex-col items-center z-20 animate-[slideUp_0.6s_ease-out] hover:-translate-y-4 transition-transform duration-300 group">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-yellow-400/40 blur-2xl rounded-full scale-110 group-hover:scale-150 group-hover:bg-yellow-400/60 transition-all duration-500" />
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 drop-shadow-[0_4px_10px_rgba(250,204,21,0.5)] scale-[1.3] z-20 animate-bounce">
                    <CrownIcon />
                  </div>
                  <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-yellow-400 bg-yellow-50 overflow-hidden shadow-[0_0_40px_rgba(250,204,21,0.3)] z-10 group-hover:border-yellow-300 transition-colors">
                    {top3[0].photoUrl ? (
                      <img src={top3[0].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-black text-3xl">{getInitials(top3[0].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-4 -right-2 bg-gradient-to-br from-yellow-400 to-yellow-600 text-white text-xs md:text-sm font-black px-3.5 py-1.5 rounded-full border-2 border-white shadow-lg uppercase tracking-wider z-20">1st</div>
                </div>
                <div className="text-center mb-5 relative z-20">
                  <p className="font-black text-lg md:text-xl text-slate-900 dark:text-white max-w-[150px] leading-tight break-words drop-shadow-sm">{top3[0].name}</p>
                  <p className="text-base font-black text-yellow-600 mt-1">{top3[0].percentage}%</p>
                </div>
                <div className="w-32 md:w-44 h-52 bg-gradient-to-t from-yellow-500 via-yellow-400 to-yellow-200 rounded-t-2xl shadow-[0_10px_40px_rgba(250,204,21,0.3)] flex items-center justify-center border-t-[3px] border-yellow-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/50 to-white/0 translate-x-[-100%] animate-[shimmer_2.5s_infinite]" />
                  <span className="text-8xl font-black text-yellow-600/40 drop-shadow-md">1</span>
                </div>
              </div>
            )}

            {/* Bronze (Rank 3) */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-[slideUp_0.4s_ease-out] z-10 hover:-translate-y-3 transition-transform duration-300 group">
                <div className="relative mb-6">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-[3px] border-orange-400 bg-orange-50 overflow-hidden shadow-lg group-hover:shadow-orange-400/30 transition-shadow">
                    {top3[2].photoUrl ? (
                      <img src={top3[2].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-orange-100 text-orange-600 font-black text-xl">{getInitials(top3[2].name)}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-gradient-to-br from-orange-400 to-orange-500 text-white text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full border-2 border-white shadow-md uppercase tracking-wider">3rd</div>
                </div>
                <div className="text-center mb-5">
                  <p className="font-bold text-slate-800 dark:text-white max-w-[120px] text-sm leading-tight break-words">{top3[2].name}</p>
                  <p className="text-sm font-black text-orange-500 mt-1">{top3[2].percentage}%</p>
                </div>
                <div className="w-28 md:w-36 h-32 bg-gradient-to-t from-orange-400/90 to-orange-200/90 rounded-t-2xl shadow-[0_0_30px_rgba(249,115,22,0.2)] flex items-center justify-center border-t border-orange-200 backdrop-blur-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                  <span className="text-6xl font-black text-orange-700/30 drop-shadow-sm">3</span>
                </div>
              </div>
            )}
          </div>

          {/* List for 4-10 */}
          {rest.length > 0 && (
            <div className="math-card rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-8">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-5">Rank</th>
                    <th className="px-6 py-5">Student</th>
                    <th className="px-6 py-5 text-center">Accuracy</th>
                    <th className="px-6 py-5 text-right hidden sm:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {rest.map((r: any) => (
                    <tr key={r.rank} className={`transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-lg hover:scale-[1.01] hover:z-10 relative cursor-default ${r.isCurrent ? 'bg-indigo-50/80 dark:bg-indigo-900/40 ring-1 ring-inset ring-indigo-500/30 z-10' : ''}`}>
                      <td className="px-6 py-5 font-black text-slate-700 dark:text-slate-300 text-base">#{r.rank}</td>
                      <td className="px-6 py-5 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 overflow-hidden flex-shrink-0 shadow-sm ${r.isCurrent ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt="avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-black text-indigo-600 dark:text-indigo-400">{getInitials(r.name)}</div>
                          )}
                        </div>
                        <span className={`font-bold text-base ${r.isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {r.name} {r.isCurrent && <span className="ml-3 text-[10px] bg-indigo-600 text-white font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-md shadow-indigo-500/30">You</span>}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-slate-700 dark:text-slate-300 text-base">{r.percentage}%</td>
                      <td className="px-6 py-5 text-right font-bold text-slate-700 dark:text-slate-300 hidden sm:table-cell text-sm">{Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s</td>
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