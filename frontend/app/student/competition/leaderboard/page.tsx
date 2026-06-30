"use client";

import React, { useState, useEffect } from "react";
import { Award, Clock, Star, Trophy, Users, AlertCircle, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { LoadingState } from "@/components/common/LoadingState";

export default function MockLeaderboardPage() {
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
            setSelectedExamId(completed[0].mockExam.id);
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
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
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
                <option key={a.mockExam.id} value={a.mockExam.id}>{a.mockExam.title}</option>
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
          <div className="pt-12 pb-8 flex items-end justify-center gap-2 md:gap-6">
            {/* Silver (Rank 2) */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-[slideUp_0.5s_ease-out]">
                <div className="relative mb-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-slate-300 bg-slate-100 overflow-hidden">
                    {top3[1].photoUrl ? (
                      <img src={top3[1].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-black text-xl">{top3[1].name[0]}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-slate-400 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-white">2ND</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-white truncate max-w-[100px] text-sm">{top3[1].name}</p>
                  <p className="text-xs font-black text-slate-500">{top3[1].percentage}%</p>
                </div>
                <div className="w-24 md:w-32 h-32 bg-gradient-to-t from-slate-300 to-slate-200 rounded-t-lg shadow-lg flex items-center justify-center">
                  <span className="text-4xl font-black text-slate-400 opacity-50">2</span>
                </div>
              </div>
            )}

            {/* Gold (Rank 1) */}
            {top3[0] && (
              <div className="flex flex-col items-center z-10 animate-[slideUp_0.6s_ease-out]">
                <div className="relative mb-4">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                    <CrownIcon />
                  </div>
                  <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-yellow-400 bg-yellow-50 overflow-hidden shadow-xl shadow-yellow-500/20">
                    {top3[0].photoUrl ? (
                      <img src={top3[0].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-black text-3xl">{top3[0].name[0]}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-yellow-500 text-white text-sm font-black px-3 py-0.5 rounded-full border-2 border-white shadow-md">1ST</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-black text-lg text-slate-800 dark:text-white truncate max-w-[120px]">{top3[0].name}</p>
                  <p className="text-sm font-black text-yellow-600">{top3[0].percentage}%</p>
                </div>
                <div className="w-28 md:w-40 h-44 bg-gradient-to-t from-yellow-500 to-yellow-300 rounded-t-lg shadow-2xl flex items-center justify-center">
                  <span className="text-6xl font-black text-yellow-600 opacity-30">1</span>
                </div>
              </div>
            )}

            {/* Bronze (Rank 3) */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-[slideUp_0.4s_ease-out]">
                <div className="relative mb-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-orange-400 bg-orange-50 overflow-hidden">
                    {top3[2].photoUrl ? (
                      <img src={top3[2].photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-orange-100 text-orange-600 font-black text-xl">{top3[2].name[0]}</div>
                    )}
                  </div>
                  <div className="absolute -bottom-3 -right-2 bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full border-2 border-white">3RD</div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-slate-800 dark:text-white truncate max-w-[100px] text-sm">{top3[2].name}</p>
                  <p className="text-xs font-black text-orange-500">{top3[2].percentage}%</p>
                </div>
                <div className="w-24 md:w-32 h-24 bg-gradient-to-t from-orange-400 to-orange-300 rounded-t-lg shadow-lg flex items-center justify-center">
                  <span className="text-4xl font-black text-orange-600 opacity-30">3</span>
                </div>
              </div>
            )}
          </div>

          {/* List for 4-10 */}
          {rest.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Rank</th>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4 text-right">Score</th>
                    <th className="px-6 py-4 text-right hidden sm:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rest.map((r: any) => (
                    <tr key={r.rank} className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${r.isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}>
                      <td className="px-6 py-4 font-black text-slate-500">#{r.rank}</td>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex-shrink-0">
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt="avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-black text-slate-500">{r.name[0]}</div>
                          )}
                        </div>
                        <span className={`font-bold ${r.isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {r.name} {r.isCurrent && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">You</span>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-700 dark:text-slate-300">{r.percentage}%</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-400 hidden sm:table-cell">{Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s</td>
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
  );
}

function CrownIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="#EAB308" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 22H22V20H2V22ZM21.6 6.3L17.2 13.5L12.5 4.5C12.3 4.2 11.7 4.2 11.5 4.5L6.8 13.5L2.4 6.3C2.1 5.9 1.4 6 1.3 6.5L3 18H21L22.7 6.5C22.6 6 21.9 5.9 21.6 6.3Z" fill="currentColor"/>
    </svg>
  );
}