"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherAvailableDps, getTeacherStudents, teacherAssignDps } from "@/lib/api/teacher";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardPlus, Send } from "lucide-react";
import { useMemo, useState } from "react";


function getTeacherAssignErrorMessage(error: unknown) {
  const anyError = error as {
    response?: {
      status?: number;
      data?: {
        message?: string;
        detail?: string;
        error?: string;
        code?: string;
      };
    };
    message?: string;
  };

  const status = anyError?.response?.status;
  const code = anyError?.response?.data?.code;
  const backendMessage =
    anyError?.response?.data?.message ||
    anyError?.response?.data?.detail ||
    anyError?.response?.data?.error ||
    "";

  if (status === 403 && code === "DPS_NOT_PUBLISHED") {
    return {
      title: "DPS Not Published",
      message:
        "This DPS has not been published by Admin yet. Teachers can assign only published practice content.",
      guidance:
        "Ask Admin to publish the DPS from Learning Path Studio before assigning it to students.",
    };
  }

  if (status === 409 || code === "DUPLICATE_ASSIGNMENT_BLOCKED") {
    return {
      title: "Re-Attempt Approval Required",
      message:
        "This DPS has already been assigned. Teachers cannot assign the same practice sheet again. Admin must Allow Re-Attempt.",
      guidance:
        "Once approved, the same assignment reopens automatically in the student dashboard.",
    };
  }

  return {
    title: "Something went wrong",
    message: backendMessage || apiErrorMessage(error),
    guidance: "",
  };
}

function TeacherAssignError({ error }: { error: unknown }) {
  const info = getTeacherAssignErrorMessage(error);

  return (
    <div className="mb-5 rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">
        {info.title}
      </p>
      <p className="mt-2 text-sm font-bold leading-6">{info.message}</p>
      {info.guidance ? (
        <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm font-semibold leading-6 text-slate-700">
          {info.guidance}
        </p>
      ) : null}
    </div>
  );
}


export default function TeacherAssignDpsPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const [levelId, setLevelId] = useState("");
  const [dpsId, setDpsId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const studentsQuery = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: ready });
  const dpsQuery = useQuery({ queryKey: ["teacher-available-dps"], queryFn: getTeacherAvailableDps, enabled: ready });

  const levels = dpsQuery.data?.levels ?? [];
  const dpsRows = dpsQuery.data?.dps ?? [];
  const students = studentsQuery.data ?? [];

  const visibleDps = useMemo(
    () =>
      dpsRows
        .filter((dps) => !levelId || levelId === "ALL" || dps.levelId === levelId)
        .slice()
        .sort((a, b) => {
          const levelCompare = String(a.levelCode || "").localeCompare(String(b.levelCode || ""));
          if (levelCompare !== 0) return levelCompare;
          const lessonCompare = Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0);
          if (lessonCompare !== 0) return lessonCompare;
          return Number(a.dpsNumber || 0) - Number(b.dpsNumber || 0);
        }),
    [dpsRows, levelId]
  );
  const selectedDps = visibleDps.find((dps) => dps.dpsId === dpsId);
  const eligibleStudents = students.filter((student) => selectedDps && student.currentLevelId === selectedDps.levelId && student.isActive);

  const mutation = useMutation({
    mutationFn: () => teacherAssignDps({
      dpsId,
      studentIds: selectedStudentIds,
      title: selectedDps ? `${selectedDps.levelCode} Lesson ${selectedDps.lessonNumber} - DPS ${selectedDps.dpsNumber} Practice` : undefined,
      instructions: "Complete this practice within the given time.",
    }),
    onSuccess: (data) => {
      setMessage(data.message);
      setSelectedStudentIds([]);
    },
  });

  if (!ready) return null;

  const loading = studentsQuery.isLoading || dpsQuery.isLoading;
  const error = studentsQuery.error || dpsQuery.error || mutation.error;

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]);
  }

  return (
    <AppShell title="Assign DPS">
      <section className="math-hero">
        <div className="relative z-10">
          <p className="math-kicker">Teacher assignment</p>
          <h1 className="math-title">Assign Published DPS to My Students</h1>
          <p className="math-subtitle">Choose Admin-published DPS sheets for levels where your students are enrolled.</p>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="math-label">Level</label>
            <select className="math-select mt-2" value={levelId} onChange={(e) => { setLevelId(e.target.value); setDpsId(""); setSelectedStudentIds([]); }}>
              <option value="" disabled>Choose Level</option>
              <option value="ALL">All Levels</option>
              {levels.map((level) => <option key={level.levelId} value={level.levelId}>{level.levelCode} - {level.levelName} ({level.studentCount} students)</option>)}
            </select>
          </div>
          <div>
            <label className="math-label">DPS Sheet</label>
            <select className="math-select mt-2" value={dpsId} onChange={(e) => { setDpsId(e.target.value); setSelectedStudentIds([]); }}>
              <option value="" disabled>Choose DPS</option>
              {visibleDps.map((dps) => (
                <option key={dps.dpsId} value={dps.dpsId}>
                  {dps.levelCode} · Lesson {dps.lessonNumber} - DPS {dps.dpsNumber}: {dps.dpsTitle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="mt-6">
        {loading ? <LoadingState label="Loading assignable DPS..." /> : null}
        {error ? <TeacherAssignError error={error} /> : null}
        {message ? <div className="mb-5 rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 font-black text-emerald-700">{message}</div> : null}

        {!loading && !visibleDps.length ? (
          <EmptyState message="No published DPS is available for this level yet. Please ask Admin to publish practice content from Learning Path Studio." />
        ) : null}

        {!loading && visibleDps.length > 0 && !selectedDps ? (
          <EmptyState message="Select a published DPS sheet to see eligible students." />
        ) : null}

        {selectedDps ? (
          <section className="math-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="math-kicker">Eligible students</p>
                <h2 className="text-2xl font-black text-slate-950">{selectedDps.dpsTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">Only students in {selectedDps.levelCode} can be selected.</p>
              </div>
              <button className="math-button-primary" disabled={!selectedStudentIds.length || mutation.isPending} onClick={() => mutation.mutate()}>
                <Send size={18} /> {mutation.isPending ? "Assigning..." : `Assign to ${selectedStudentIds.length} Student(s)`}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {eligibleStudents.map((student) => (
                <label key={student.studentId} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-blue-300 hover:bg-blue-50">
                  <input type="checkbox" checked={selectedStudentIds.includes(student.studentId)} onChange={() => toggleStudent(student.studentId)} />
                  <div>
                    <p className="font-black text-slate-950">{student.studentName}</p>
                    <p className="text-sm text-slate-500">{student.studentCode} · Class {student.className || "-"} {student.section || ""}</p>
                  </div>
                </label>
              ))}
            </div>

            {!eligibleStudents.length ? <p className="mt-5 text-sm font-bold text-slate-500">No eligible active students for this DPS level.</p> : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
