"use client";

import { AppShell } from "@/components/common/AppShell";
import { SortableHeader } from "@/components/common/SortableHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ProfileAvatar, ResolveAssetUrl } from "@/components/common/ProfileAvatar";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import {
  bulkUploadStudents,
  createStudentProfile,
  deleteStudent,
  downloadStudentTemplate,
  getAdminStudents,
  getAdminTeachers,
  getLevels,
  getModules,
  resetStudentPassword,
  updateStudentProfile,
  updateStudentStatus,
  uploadStudentPhoto,
  uploadStudentSignature,
} from "@/lib/api/admin";
import type { LevelItem, ModuleItem } from "@/types/curriculum";
import type { AdminTeacher } from "@/types/teacher";
import type {
  AdminStudent,
  BulkUploadResult,
  StudentProfilePayload,
} from "@/types/student";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Trash2,
  UserPlus,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const PAGE_SIZE = 20;

// A fresh random default each time a create form opens, instead of a fixed,
// publicly-documented string every student account could otherwise share.
// The field stays editable -- this is just a sensible starting value the
// admin can see, copy, and hand to the student, or overwrite outright.
function generateDefaultPassword(): string {
  const randomSegment =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, "0")).join("")
      : Math.random().toString(36).slice(2, 14);
  return `Mp-${randomSegment}`;
}

type StudentSortKey = "studentCode" | "studentName" | "className" | "teacher" | "level" | "fatherMobile" | "status";

type SortDirection = "asc" | "desc";

function normalizeSortValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const text = String(value).trim();
  const date = Date.parse(text);
  if (text && !Number.isNaN(date) && /\d{4}|\d{1,2}\/\d{1,2}/.test(text)) return date;
  return text.toLowerCase();
}

function compareSortValues(a: unknown, b: unknown) {
  const av = normalizeSortValue(a);
  const bv = normalizeSortValue(b);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
}


type FormState = StudentProfilePayload;

function emptyForm(): FormState {
  return {
    customId: "",
    teacher: "",
    teacherId: "",
    teacherCode: "",
    admissionDate: "",
    studentName: "",
    dob: "",
    gender: "",
    bloodGroup: "",
    schoolName: "",
    className: "",
    section: "",
    fatherName: "",
    fatherMobile: "",
    fatherEmail: "",
    fatherWhatsapp: "",
    motherName: "",
    motherMobile: "",
    motherEmail: "",
    motherWhatsapp: "",
    studentCode: "",
    password: generateDefaultPassword(),
    currentModuleId: "",
    currentLevelId: "",
    status: "ACTIVE",
    interest: "",
    presentAddress: "",
    permanentAddress: "",
    schoolArea: "",
    fatherOccupation: "",
    motherOccupation: "",
  };
}


function optional(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}


function createCodeFromName(name: string) {
  const compact = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

  const suffix = Math.floor(1000 + Math.random() * 9000);
  return compact ? `MP-${compact}-${suffix}` : `MP-STUDENT-${suffix}`;
}

export default function AdminStudentsPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const StudentDirectoryStateKey = CreatePersistedUiStateKey("admin", "students");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(StudentDirectoryStateKey, "search"), "");
  const [teacherFilter, setTeacherFilter] = usePersistentUiState(CreatePersistedUiStateKey(StudentDirectoryStateKey, "teacher-filter"), "");
  const [LevelFilter, SetLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(StudentDirectoryStateKey, "level-filter"), "");
  const [page, setPage] = usePersistentUiState(CreatePersistedUiStateKey(StudentDirectoryStateKey, "page"), 1);
  const [sortKey, setSortKey] = usePersistentUiState<StudentSortKey | "DEFAULT">(CreatePersistedUiStateKey(StudentDirectoryStateKey, "sort-key"), "DEFAULT");
  const [sortDirection, setSortDirection] = usePersistentUiState<SortDirection>(CreatePersistedUiStateKey(StudentDirectoryStateKey, "sort-direction"), "asc");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [lastLogin, setLastLogin] = useState<{
    identifier: string;
    password: string;
  } | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<AdminStudent | null>(
    null
  );
  const [resetPasswordByStudent, setResetPasswordByStudent] = useState<
    Record<string, string>
  >({});
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [BulkInputKey, SetBulkInputKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AdminStudent | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["admin-students"],
    queryFn: getAdminStudents,
    enabled: ready,
  });

  const modulesQuery = useQuery({
    queryKey: ["modules"],
    queryFn: getModules,
    enabled: ready,
  });

  const teachersQuery = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: getAdminTeachers,
    enabled: ready,
  });

  const levelsQuery = useQuery({
    queryKey: ["levels", form.currentModuleId],
    queryFn: () => getLevels(form.currentModuleId),
    enabled: ready && Boolean(form.currentModuleId),
  });

  const createMutation = useMutation({
    mutationFn: createStudentProfile,
    onSuccess: async (data) => {
      const student = data.student;

      if (photoFile) await uploadStudentPhoto(student.studentId, photoFile);
      if (signatureFile) {
        await uploadStudentSignature(student.studentId, signatureFile);
      }

      setLastLogin(data.login);
      setPhotoFile(null);
      setSignatureFile(null);
      setForm(emptyForm());
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      studentId,
      payload,
    }: {
      studentId: string;
      payload: Partial<StudentProfilePayload>;
    }) => {
      let response = await updateStudentProfile(studentId, payload);

      if (photoFile) {
        response = {
          ...response,
          student: (await uploadStudentPhoto(studentId, photoFile)).student,
        };
      }

      if (signatureFile) {
        response = {
          ...response,
          student: (await uploadStudentSignature(studentId, signatureFile))
            .student,
        };
      }

      return response;
    },
    onMutate: async ({ studentId, payload }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-students"] });
      const PreviousStudents = queryClient.getQueryData<AdminStudent[]>(["admin-students"]);
      queryClient.setQueryData<AdminStudent[]>(["admin-students"], (CurrentStudents = []) =>
        CurrentStudents.map((Student) =>
          Student.studentId === studentId
            ? {
                ...Student,
                ...payload,
                fullName: payload.studentName || Student.fullName,
                isActive: payload.status ? payload.status === "ACTIVE" : Student.isActive,
                teacherName: payload.teacher || Student.teacherName,
              }
            : Student
        )
      );
      setEditingStudentId(null);
      setSelectedStudent(null);
      setForm(emptyForm());
      setIsFormOpen(false);
      return { PreviousStudents };
    },
    onError: (_Error, _Variables, Context) => {
      if (Context?.PreviousStudents) {
        queryClient.setQueryData(["admin-students"], Context.PreviousStudents);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AdminStudent[]>(["admin-students"], (CurrentStudents = []) =>
        CurrentStudents.map((Student) =>
          Student.studentId === data.student.studentId ? data.student : Student
        )
      );
      setEditingStudentId(null);
      setSelectedStudent(null);
      setPhotoFile(null);
      setSignatureFile(null);
      setForm(emptyForm());
      setIsFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-students"], refetchType: "active" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      studentId,
      isActive,
    }: {
      studentId: string;
      isActive: boolean;
    }) => updateStudentStatus(studentId, isActive),
    onMutate: async ({ studentId, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-students"] });
      const PreviousStudents = queryClient.getQueryData<AdminStudent[]>(["admin-students"]);
      queryClient.setQueryData<AdminStudent[]>(["admin-students"], (CurrentStudents = []) =>
        CurrentStudents.map((Student) =>
          Student.studentId === studentId
            ? { ...Student, isActive, status: isActive ? "ACTIVE" : "INACTIVE" }
            : Student
        )
      );
      return { PreviousStudents };
    },
    onError: (_Error, _Variables, Context) => {
      if (Context?.PreviousStudents) {
        queryClient.setQueryData(["admin-students"], Context.PreviousStudents);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-students"], refetchType: "active" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({
      studentId,
      password,
    }: {
      studentId: string;
      password: string;
    }) => resetStudentPassword(studentId, password),
    onSuccess: (data) => setLastLogin(data.login),
  });

  const bulkMutation = useMutation({
    mutationFn: bulkUploadStudents,
    onSuccess: (data) => {
      setBulkResult(data);
      SetBulkInputKey((CurrentKey) => CurrentKey + 1);
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: () => {
      SetBulkInputKey((CurrentKey) => CurrentKey + 1);
    },
  });


  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onMutate: async (StudentId) => {
      await queryClient.cancelQueries({ queryKey: ["admin-students"] });
      const PreviousStudents = queryClient.getQueryData<AdminStudent[]>(["admin-students"]);
      queryClient.setQueryData<AdminStudent[]>(["admin-students"], (CurrentStudents = []) =>
        CurrentStudents.filter((Student) => Student.studentId !== StudentId)
      );
      return { PreviousStudents };
    },
    onError: (_Error, _StudentId, Context) => {
      if (Context?.PreviousStudents) {
        queryClient.setQueryData(["admin-students"], Context.PreviousStudents);
      }
    },
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-students"], refetchType: "active" });
    },
  });

  const students = studentsQuery.data ?? [];
  const activeCount = students.filter((s) => s.isActive).length;
  const inactiveCount = students.length - activeCount;

  const teacherOptions = useMemo(() => {
    const names = students
      .map((student) => String(student.teacher ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const LevelOptions = useMemo(() => {
    const LevelNames = students
      .map((Student) => String(Student.currentLevelCode ?? Student.currentLevelId ?? "").trim())
      .filter(Boolean);

    return Array.from(new Set(LevelNames)).sort((FirstLevel, SecondLevel) =>
      FirstLevel.localeCompare(SecondLevel, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [students]);

  const teacherFilteredCount =
    !teacherFilter || teacherFilter === "ALL"
      ? students.length
      : students.filter(
          (student) => String(student.teacher ?? "").trim() === teacherFilter
        ).length;

  const DirectoryScopeLabel = useMemo(() => {
    const ScopeParts = [];
    if (teacherFilter && teacherFilter !== "ALL") ScopeParts.push(`Teacher: ${teacherFilter}`);
    if (LevelFilter && LevelFilter !== "ALL") ScopeParts.push(`Level: ${LevelFilter}`);
    return ScopeParts.length ? ScopeParts.join(" · ") : "All Teachers · All Levels";
  }, [teacherFilter, LevelFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filteredRows = students.filter((s) => {
      const teacherName = String(s.teacher ?? "").trim();
      const matchesTeacher =
        !teacherFilter || teacherFilter === "ALL" || teacherName === teacherFilter;

      const LevelName = String(s.currentLevelCode ?? s.currentLevelId ?? "").trim();
      const MatchesLevel = !LevelFilter || LevelFilter === "ALL" || LevelName === LevelFilter;

      const matchesSearch =
        !q ||
        [
          s.customId,
          s.studentName,
          s.studentCode,
          s.teacher,
          s.className,
          s.section,
          s.schoolName,
          s.fatherMobile,
          s.motherMobile,
          s.currentLevelCode,
          s.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesTeacher && MatchesLevel && matchesSearch;
    });

    const DefaultSortedRows = filteredRows.slice().sort((a, b) =>
      compareSortValues(a.studentCode || a.customId || a.studentName, b.studentCode || b.customId || b.studentName)
    );

    if (sortKey === "DEFAULT") return DefaultSortedRows;

    return DefaultSortedRows.sort((a, b) => {
      const valueFor = (student: AdminStudent) => {
        if (sortKey === "studentCode") return student.studentCode;
        if (sortKey === "studentName") return student.studentName;
        if (sortKey === "className") return `${student.className || ""} ${student.section || ""}`;
        if (sortKey === "teacher") return student.teacher;
        if (sortKey === "level") return student.currentLevelCode;
        if (sortKey === "fatherMobile") return student.fatherMobile;
        return student.isActive ? "ACTIVE" : "INACTIVE";
      };
      const result = compareSortValues(valueFor(a), valueFor(b));
      return sortDirection === "asc" ? result : -result;
    });
  }, [students, search, teacherFilter, LevelFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: StudentSortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      setPage(1);
      return;
    }

    if (sortDirection === "asc") {
      setSortDirection("desc");
      setPage(1);
      return;
    }

    setSortKey("DEFAULT");
    setSortDirection("asc");
    setPage(1);
  }

  if (!ready) return null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateForm() {
    setEditingStudentId(null);
    setSelectedStudent(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setLastLogin(null);
    setForm(emptyForm());
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingStudentId(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setForm(emptyForm());
    setIsFormOpen(false);
  }

  function buildPayload(): StudentProfilePayload {
    const selectedModule = (modulesQuery.data ?? []).find(
      (m) => m.moduleId === form.currentModuleId
    );

    const selectedLevel = (levelsQuery.data ?? []).find(
      (l) => l.levelId === form.currentLevelId
    );

    return {
      ...form,
      customId: form.customId.trim(),
      teacher: form.teacher.trim(),
      admissionDate: form.admissionDate,
      studentName: form.studentName.trim(),
      dob: form.dob,
      gender: form.gender,
      bloodGroup: form.bloodGroup,
      schoolName: form.schoolName.trim(),
      className: form.className.trim(),
      section: form.section.trim(),
      fatherName: form.fatherName.trim(),
      fatherMobile: form.fatherMobile.trim(),
      fatherEmail: form.fatherEmail.trim(),
      fatherWhatsapp: form.fatherWhatsapp.trim(),
      motherName: form.motherName.trim(),
      motherMobile: form.motherMobile.trim(),
      motherEmail: form.motherEmail.trim(),
      motherWhatsapp: form.motherWhatsapp.trim(),
      studentCode: form.studentCode.trim(),
      password: form.password || generateDefaultPassword(),
      moduleCode: selectedModule?.moduleCode ?? null,
      levelCode: selectedLevel?.levelCode ?? null,
      teacherId: form.teacherId || null,
      teacherCode: form.teacherCode || null,
      interest: optional(form.interest),
      presentAddress: optional(form.presentAddress),
      permanentAddress: optional(form.permanentAddress),
      schoolArea: optional(form.schoolArea),
      fatherOccupation: optional(form.fatherOccupation),
      motherOccupation: optional(form.motherOccupation),
    };
  }

  function submitForm(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();

    if (editingStudentId) {
      updateMutation.mutate({ studentId: editingStudentId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function startEditing(student: AdminStudent) {
    setEditingStudentId(student.studentId);
    setSelectedStudent(student);
    setLastLogin(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setForm({
      customId: student.customId ?? "",
      teacher: student.teacherName ?? student.teacher ?? "",
      teacherId: student.teacherId ?? "",
      teacherCode: student.teacherCode ?? "",
      admissionDate: student.admissionDate ?? "",
      studentName: student.studentName ?? "",
      dob: student.dob ?? "",
      gender: student.gender ?? "",
      bloodGroup: student.bloodGroup ?? "",
      schoolName: student.schoolName ?? "",
      className: student.className ?? "",
      section: student.section ?? "",
      fatherName: student.fatherName ?? "",
      fatherMobile: student.fatherMobile ?? "",
      fatherEmail: student.fatherEmail ?? "",
      fatherWhatsapp: student.fatherWhatsapp ?? "",
      motherName: student.motherName ?? "",
      motherMobile: student.motherMobile ?? "",
      motherEmail: student.motherEmail ?? "",
      motherWhatsapp: student.motherWhatsapp ?? "",
      studentCode: student.studentCode ?? "",
      password: "",
      currentModuleId: student.currentModuleId ?? "",
      currentLevelId: student.currentLevelId ?? "",
      status: student.isActive ? "ACTIVE" : "INACTIVE",
      interest: student.interest ?? "",
      presentAddress: student.presentAddress ?? "",
      permanentAddress: student.permanentAddress ?? "",
      schoolArea: student.schoolArea ?? "",
      fatherOccupation: student.fatherOccupation ?? "",
      motherOccupation: student.motherOccupation ?? "",
    });
    setIsFormOpen(true);
  }

  async function copyLogin(identifier: string, password: string) {
    await navigator.clipboard.writeText(
      `Identifier: ${identifier}\nPassword: ${password}`
    );
  }

  async function handleTemplateDownload() {
    const BlobFile = await downloadStudentTemplate();
    const Url = window.URL.createObjectURL(BlobFile);
    const Anchor = document.createElement("a");
    Anchor.href = Url;
    Anchor.download = "mathpath_students_bulk_template.xlsx";
    Anchor.click();
    window.URL.revokeObjectURL(Url);
  }

  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    statusMutation.error ||
    resetMutation.error ||
    bulkMutation.error ||
    deleteMutation.error;

  return (
    <AppShell title="Student Management">
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-kicker">Student Directory</p>
            <h1 className="math-title">Student Management</h1>
            <p className="math-subtitle">
              Manage student profiles, login access, teacher mapping, level placement, and onboarding records.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Students"
              value={students.length}
              icon={<UsersRound size={18} />}
            />
            <Metric
              label="Active"
              value={activeCount}
              icon={<CheckCircle2 size={18} />}
            />
            <Metric
              label="Inactive"
              value={inactiveCount}
              icon={<XCircle size={18} />}
            />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <p className="math-kicker">Student Onboarding</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">
              Add Students
            </h2>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Add one student manually, or onboard a full batch using the official Excel template. MathPath checks every record before import so student access, teacher mapping, and level placement stay clean from day one.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
            <button className="math-button-primary whitespace-nowrap" onClick={openCreateForm}>
              <UserPlus size={18} />
              Add Student
            </button>

            <button className="math-role-action-button math-onboarding-action-button whitespace-nowrap" onClick={handleTemplateDownload}>
              <Download size={17} />
              Download Template
            </button>

            <label className="math-role-action-button math-onboarding-action-button cursor-pointer whitespace-nowrap">
              <FileSpreadsheet size={17} />
              Upload Excel
              <input
                key={BulkInputKey}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(Event) => {
                  const File = Event.target.files?.[0];
                  if (File) bulkMutation.mutate(File);
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
          <div className="grid gap-4 lg:grid-cols-3">
            <OnboardingGuideCard
              step="1"
              icon={<Download size={16} />}
              title="Start With The Official Template"
              description="Download the approved Excel format so every student record follows the required MathPath structure."
            />
            <OnboardingGuideCard
              step="2"
              icon={<ListChecks size={16} />}
              title="Complete Student Details"
              description="Add student access details, assigned teacher, module, level, and default password in the correct columns."
            />
            <OnboardingGuideCard
              step="3"
              icon={<Upload size={16} />}
              title="Review Before Import"
              description="Validate the upload summary, resolve highlighted issues, and confirm only clean records are added."
            />
          </div>

          <div className="min-w-0 rounded-[24px] border border-blue-100 bg-blue-50/50 px-5 py-4 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/10 xl:px-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 dark:text-white">
              Import Checks Include
            </p>
            <div className="mt-4 grid min-w-0 gap-x-5 gap-y-3 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <span className="flex min-w-0 items-start gap-2.5">
                <CheckCircle2 size={16} strokeWidth={2.6} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 break-words">Required Information</span>
              </span>
              <span className="flex min-w-0 items-start gap-2.5">
                <CheckCircle2 size={16} strokeWidth={2.6} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 break-words">Duplicate Student Records</span>
              </span>
              <span className="flex min-w-0 items-start gap-2.5">
                <CheckCircle2 size={16} strokeWidth={2.6} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 break-words">Teacher Assignment</span>
              </span>
              <span className="flex min-w-0 items-start gap-2.5">
                <CheckCircle2 size={16} strokeWidth={2.6} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 break-words">Module & Level Placement</span>
              </span>
            </div>
          </div>
        </div>

        {bulkMutation.isPending ? (
          <div className="mt-5 rounded-[22px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100">
            Uploading Excel and creating student accounts...
          </div>
        ) : null}

        {bulkResult ? (
          <div className="mt-5 rounded-[26px] border border-blue-200 bg-blue-50 p-4 text-blue-950 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black">Student import summary</p>
                <p className="mt-1 text-sm font-bold text-blue-800 dark:text-cyan-100">
                  {bulkResult.created} Created · {bulkResult.failed} Failed · {bulkResult.skipped ?? 0} Blank Rows Skipped
                </p>
              </div>
              <button
                className="text-sm font-black text-blue-700 dark:text-cyan-200"
                onClick={() => setBulkResult(null)}
              >
                Clear
              </button>
            </div>

            {bulkResult.unknownColumns?.length ? (
              <div className="mt-3 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Unknown columns ignored: {bulkResult.unknownColumns.join(", ")}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ImportMetric label="Created" value={bulkResult.created} tone="success" />
              <ImportMetric label="Failed" value={bulkResult.failed} tone="danger" />
              <ImportMetric label="Skipped" value={bulkResult.skipped ?? 0} tone="neutral" />
            </div>

            <div className="mt-4 max-h-56 overflow-auto rounded-2xl border border-blue-100 bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-slate-950/40">
              {bulkResult.results.length ? bulkResult.results.slice(0, 60).map((Row) => (
                <div
                  key={`${Row.row}-${Row.status}`}
                  className={`mb-2 rounded-xl px-3 py-2 font-bold ${
                    Row.status === "CREATED"
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-100"
                      : "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-100"
                  }`}
                >
                  Row {Row.row}: {Row.status}
                  {Row.error
                    ? ` - ${Row.error}`
                    : Row.studentName
                      ? ` - ${Row.studentName}${Row.studentCode ? ` (${Row.studentCode})` : ""}`
                      : ""}
                </div>
              )) : (
                <p className="font-bold text-slate-600 dark:text-slate-300">No data rows were processed.</p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {mutationError ? (
        <div className="mt-6">
          <ErrorState message={apiErrorMessage(mutationError)} />
        </div>
      ) : null}

      {lastLogin ? (
        <div className="mt-6 rounded-[26px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-black">Student login ready</p>
              <p className="mt-1 text-sm">
                Identifier: {lastLogin.identifier} · Password:{" "}
                {lastLogin.password}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-200"
              onClick={() => copyLogin(lastLogin.identifier, lastLogin.password)}
            >
              <Copy size={15} /> Copy login details
            </button>
          </div>
        </div>
      ) : null}

      <section className="mt-6 space-y-5">
        <div className="math-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="math-kicker">Student directory</p>
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                Student Details
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Search, filter by teacher and level, view, edit, deactivate, reset passwords, or delete records.
              </p>

              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {filtered.length} Students · {DirectoryScopeLabel}
              </p>
            </div>

            <div className="grid w-full gap-3 lg:max-w-4xl lg:grid-cols-[1fr_220px_220px]">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  className="math-input pl-11"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search Students"
                />
              </div>

              <select
                className="math-select"
                value={teacherFilter}
                onChange={(e) => {
                  setTeacherFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="" disabled>Choose Teacher</option>
                  <option value="ALL">All Teachers</option>
                {teacherOptions.map((teacher) => (
                  <option key={teacher} value={teacher}>
                    {teacher}
                  </option>
                ))}
              </select>

              <select
                className="math-select"
                value={LevelFilter}
                onChange={(Event) => {
                  SetLevelFilter(Event.target.value);
                  setPage(1);
                }}
              >
                <option value="" disabled>Choose Level</option>
                  <option value="ALL">All Levels</option>
                {LevelOptions.map((LevelName) => (
                  <option key={LevelName} value={LevelName}>
                    {LevelName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {studentsQuery.isLoading ? <LoadingState label="Loading students..." /> : null}
        {studentsQuery.error ? (
          <ErrorState message={apiErrorMessage(studentsQuery.error)} />
        ) : null}

        {!studentsQuery.isLoading &&
        !studentsQuery.error &&
        filtered.length === 0 ? (
          <EmptyState message="No matching students found." />
        ) : null}

        {filtered.length ? (
          <div className="math-table math-admin-directory-table math-admin-students-table">
            <table>
              <thead>
                <tr>
                  <th><SortableHeader active={sortKey === "studentName"} direction={sortDirection} onClick={() => toggleSort("studentName")}>Student</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "studentCode"} direction={sortDirection} onClick={() => toggleSort("studentCode")}>Student Code</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "className"} direction={sortDirection} onClick={() => toggleSort("className")}>Class</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "teacher"} direction={sortDirection} onClick={() => toggleSort("teacher")}>Teacher</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "level"} direction={sortDirection} onClick={() => toggleSort("level")}>Level</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "fatherMobile"} direction={sortDirection} onClick={() => toggleSort("fatherMobile")}>Father Mobile</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "status"} direction={sortDirection} onClick={() => toggleSort("status")} align="center">Status</SortableHeader></th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {pageItems.map((s) => {
                  const resetPassword = resetPasswordByStudent[s.studentId] ?? "";

                  return (
                    <tr key={s.studentId}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar
                            name={s.studentName}
                            imageUrl={s.photoUrl}
                            role="STUDENT"
                            className="math-record-avatar-student h-11 w-11 text-xs"
                          />

                          <div>
                            <p className="font-black text-slate-950 dark:text-white">
                              {s.studentName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {s.studentCode}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td>{s.studentCode || "-"}</td>
                      <td>
                        {s.className || "-"} {s.section || ""}
                      </td>
                      <td>{s.teacher || "-"}</td>
                      <td>{s.currentLevelCode || "-"}</td>
                      <td>{s.fatherMobile || "-"}</td>
                      <td className="text-center">
                        <span
                          className={`math-badge math-admin-directory-status-chip ${
                            s.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {s.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>

                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="math-role-action-button math-role-icon-only"
                            onClick={() => setSelectedStudent(s)}
                            title="View"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            className="math-role-action-button math-role-icon-only"
                            onClick={() => startEditing(s)}
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            className="math-role-action-button math-role-icon-only"
                            onClick={() =>
                              statusMutation.mutate({
                                studentId: s.studentId,
                                isActive: !s.isActive,
                              })
                            }
                            title="Activate / Deactivate"
                          >
                            <ShieldCheck size={15} />
                          </button>

                          <div className="flex gap-1">
                            <input
                              className="math-input h-10 w-28 py-2 text-xs"
                              value={resetPassword}
                              placeholder="New password"
                              onChange={(e) =>
                                setResetPasswordByStudent((prev) => ({
                                  ...prev,
                                  [s.studentId]: e.target.value,
                                }))
                              }
                            />

                            <button
                              className="math-role-action-button math-role-icon-only"
                              disabled={!resetPassword.trim()}
                              onClick={() =>
                                resetMutation.mutate({
                                  studentId: s.studentId,
                                  password: resetPassword || generateDefaultPassword(),
                                })
                              }
                              title="Reset Password"
                            >
                              <KeyRound size={15} />
                            </button>
                          </div>

                          <button
                            className="math-destructive-button border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                            onClick={() => setDeleteTarget(s)}
                            title="Delete Student"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
              <p className="text-slate-600 dark:text-slate-300">
                Showing {pageItems.length} of {filtered.length} students · {DirectoryScopeLabel}
              </p>

              <div className="flex items-center gap-2">
                <button
                  className="math-role-action-button px-4"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>

                <span className="font-black">
                  {page} / {totalPages}
                </span>

                <button
                  className="math-role-action-button px-4"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {isFormOpen ? (
        <StudentFormModal
          editingStudentId={editingStudentId}
          selectedStudent={selectedStudent}
          form={form}
          photoFile={photoFile}
          signatureFile={signatureFile}
          modules={modulesQuery.data ?? []}
          levels={levelsQuery.data ?? []}
          teachers={teachersQuery.data ?? []}
          levelsLoading={levelsQuery.isLoading}
          saving={createMutation.isPending || updateMutation.isPending}
          onClose={closeForm}
          onSubmit={submitForm}
          onFieldChange={updateField}
          onPhotoChange={setPhotoFile}
          onSignatureChange={setSignatureFile}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteStudentModal
          student={deleteTarget}
          deleting={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.studentId)}
        />
      ) : null}

      {selectedStudent && !isFormOpen ? (
        <StudentProfileModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      ) : null}
    </AppShell>
  );
}

function StudentFormModal({
  editingStudentId,
  selectedStudent,
  form,
  photoFile,
  signatureFile,
  modules,
  levels,
  teachers,
  levelsLoading,
  saving,
  onClose,
  onSubmit,
  onFieldChange,
  onPhotoChange,
  onSignatureChange,
}: {
  editingStudentId: string | null;
  selectedStudent: AdminStudent | null;
  form: FormState;
  photoFile: File | null;
  signatureFile: File | null;
  modules: ModuleItem[];
  levels: LevelItem[];
  teachers: AdminTeacher[];
  levelsLoading: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onFieldChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onPhotoChange: (file: File | null) => void;
  onSignatureChange: (file: File | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[34px] border border-white/60 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-7">
          <div>
            <p className="math-kicker">
              {editingStudentId ? "Edit profile" : "Add student"}
            </p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">
              {editingStudentId ? "Update Student" : "Student Admission Form"}
            </h2>
          </div>

          <button className="math-button-secondary px-4" onClick={onClose}>
            <X size={18} />
            Close
          </button>
        </div>

        <form className="flex-1 overflow-auto p-5 sm:p-7" onSubmit={onSubmit}>
          <div className="grid gap-7 xl:grid-cols-[1fr_320px]">
            <div className="space-y-7">
              <FormSection title="Student Info">
                <Input
                  label="Custom ID"
                  value={form.customId}
                  onChange={(v) => onFieldChange("customId", v)}
                  required
                />
                <div>
                  <label className="math-label">
                    Teacher <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="math-select mt-2"
                    value={form.teacherId || ""}
                    onChange={(event) => {
                      const selected = teachers.find((teacher) => teacher.teacherId === event.target.value);
                      onFieldChange("teacherId", selected?.teacherId ?? "");
                      onFieldChange("teacherCode", selected?.teacherCode ?? "");
                      onFieldChange("teacher", selected?.teacherName ?? "");
                    }}
                    required
                  >
                    <option value="">Select Teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.teacherId} value={teacher.teacherId}>
                        {teacher.teacherName} ({teacher.teacherCode})
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Admission Date"
                  type="date"
                  value={form.admissionDate}
                  onChange={(v) => onFieldChange("admissionDate", v)}
                  required
                />
                <Input
                  label="Student Name"
                  value={form.studentName}
                  onChange={(v) => onFieldChange("studentName", v)}
                  required
                />
                <Input
                  label="DOB"
                  type="date"
                  value={form.dob}
                  onChange={(v) => onFieldChange("dob", v)}
                  required
                />
                <Select
                  label="Gender"
                  value={form.gender}
                  onChange={(v) => onFieldChange("gender", v)}
                  required
                  options={["Male", "Female", "Other"]}
                />
                <Input
                  label="Blood Group"
                  value={form.bloodGroup}
                  onChange={(v) => onFieldChange("bloodGroup", v)}
                  required
                />
                <Input
                  label="Interest"
                  value={form.interest ?? ""}
                  onChange={(v) => onFieldChange("interest", v)}
                />
              </FormSection>

              <FormSection title="Address">
                <Textarea
                  label="Present Address"
                  value={form.presentAddress ?? ""}
                  onChange={(v) => onFieldChange("presentAddress", v)}
                />
                <Textarea
                  label="Permanent Address"
                  value={form.permanentAddress ?? ""}
                  onChange={(v) => onFieldChange("permanentAddress", v)}
                />
              </FormSection>

              <FormSection title="School Info">
                <Input
                  label="School Name"
                  value={form.schoolName}
                  onChange={(v) => onFieldChange("schoolName", v)}
                  required
                />
                <Input
                  label="School Area"
                  value={form.schoolArea ?? ""}
                  onChange={(v) => onFieldChange("schoolArea", v)}
                />
                <Input
                  label="Class"
                  value={form.className}
                  onChange={(v) => onFieldChange("className", v)}
                  required
                />
                <Input
                  label="Section"
                  value={form.section}
                  onChange={(v) => onFieldChange("section", v)}
                  required
                />
              </FormSection>

              <FormSection title="Father's Info">
                <Input
                  label="Name"
                  value={form.fatherName}
                  onChange={(v) => onFieldChange("fatherName", v)}
                  required
                />
                <Input
                  label="Occupation"
                  value={form.fatherOccupation ?? ""}
                  onChange={(v) => onFieldChange("fatherOccupation", v)}
                />
                <Input
                  label="Mobile"
                  value={form.fatherMobile}
                  onChange={(v) => onFieldChange("fatherMobile", v)}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.fatherEmail}
                  onChange={(v) => onFieldChange("fatherEmail", v)}
                  required
                />
                <Input
                  label="WhatsApp"
                  value={form.fatherWhatsapp}
                  onChange={(v) => onFieldChange("fatherWhatsapp", v)}
                  required
                />
              </FormSection>

              <FormSection title="Mother's Info">
                <Input
                  label="Name"
                  value={form.motherName}
                  onChange={(v) => onFieldChange("motherName", v)}
                  required
                />
                <Input
                  label="Occupation"
                  value={form.motherOccupation ?? ""}
                  onChange={(v) => onFieldChange("motherOccupation", v)}
                />
                <Input
                  label="Mobile"
                  value={form.motherMobile}
                  onChange={(v) => onFieldChange("motherMobile", v)}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.motherEmail}
                  onChange={(v) => onFieldChange("motherEmail", v)}
                  required
                />
                <Input
                  label="WhatsApp"
                  value={form.motherWhatsapp}
                  onChange={(v) => onFieldChange("motherWhatsapp", v)}
                  required
                />
              </FormSection>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
                <p className="math-kicker">Photo & Signature</p>
                <div className="mt-4 grid gap-4">
                  <ImageInput
                    label="Photo"
                    file={photoFile}
                    existingUrl={selectedStudent?.photoUrl}
                    onChange={onPhotoChange}
                  />
                  <ImageInput
                    label="Signature"
                    file={signatureFile}
                    existingUrl={selectedStudent?.signatureUrl}
                    onChange={onSignatureChange}
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
                <p className="math-kicker">Login & Level</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="math-label">
                      Student Code <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="math-input"
                        value={form.studentCode}
                        onChange={(e) =>
                          onFieldChange("studentCode", e.target.value)
                        }
                        required
                      />
                      <button
                        type="button"
                        className="math-button-secondary px-4"
                        onClick={() =>
                          onFieldChange(
                            "studentCode",
                            createCodeFromName(form.studentName)
                          )
                        }
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  {!editingStudentId ? (
                    <Input
                      label="Password"
                      value={form.password ?? ""}
                      onChange={(v) => onFieldChange("password", v)}
                      required
                    />
                  ) : null}

                  <Select
                    label="Status"
                    value={form.status}
                    onChange={(v) =>
                      onFieldChange("status", v as "ACTIVE" | "INACTIVE")
                    }
                    required
                    options={["ACTIVE", "INACTIVE"]}
                  />

                  <div>
                    <label className="math-label">
                      Module <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="math-select mt-2"
                      value={form.currentModuleId}
                      onChange={(e) =>
                        onFieldChange("currentModuleId", e.target.value)
                      }
                      required
                    >
                      <option value="">Select Module</option>
                      {modules.map((m) => (
                        <option key={m.moduleId} value={m.moduleId}>
                          {m.moduleCode} - {m.moduleName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="math-label">
                      Level <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="math-select mt-2"
                      value={form.currentLevelId}
                      onChange={(e) =>
                        onFieldChange("currentLevelId", e.target.value)
                      }
                      required
                      disabled={!form.currentModuleId || levelsLoading}
                    >
                      <option value="">Select Level</option>
                      {levels.map((l) => (
                        <option key={l.levelId} value={l.levelId}>
                          {l.levelCode} - {l.levelName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="sticky bottom-0 mt-7 flex flex-col gap-3 border-t border-slate-200 bg-white/90 pt-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 sm:flex-row">
            <button className="math-button-primary flex-1" disabled={saving}>
              <Plus size={18} />{" "}
              {editingStudentId
                ? saving
                  ? "Updating..."
                  : "Update Student"
                : saving
                  ? "Saving..."
                  : "Save Student"}
            </button>

            <button type="button" className="math-button-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-md dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="inline-flex rounded-2xl bg-blue-50 p-2 text-blue-700 dark:bg-cyan-950/50 dark:text-cyan-300">
        {icon}
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}


function OnboardingGuideCard({
  step,
  icon,
  title,
  description,
}: {
  step: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="h-full rounded-[24px] border border-blue-100 bg-white/75 p-4 shadow-sm dark:border-cyan-400/20 dark:bg-slate-950/30">
      <div className="flex h-full items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-sm font-black text-blue-700 shadow-sm dark:border-cyan-400/30 dark:bg-slate-950/60 dark:text-cyan-200">
          {step}
        </span>
        <span className="inline-flex shrink-0 rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-cyan-400/10 dark:text-cyan-200">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
          <p className="mt-1 max-w-[28rem] text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ImportMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "neutral";
}) {
  const ToneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100"
        : "border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${ToneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.14em] opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-slate-700 dark:bg-slate-900/50">
      <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-300">
        {title}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="math-label">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        className="math-input mt-2"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="md:col-span-2">
      <label className="math-label">{label}</label>
      <textarea
        className="math-textarea mt-2 min-h-[90px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="math-label">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <select
        className="math-select mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ImageInput({
  label,
  file,
  existingUrl,
  onChange,
}: {
  label: string;
  file: File | null;
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = file ? URL.createObjectURL(file) : ResolveAssetUrl(existingUrl);

  return (
    <div>
      <label className="math-label">{label}</label>
      <label className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-bold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
        <Upload size={16} className="mr-2" /> Upload {label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>

      {previewUrl ? (
        <img
          src={previewUrl}
          alt={label}
          className="mt-3 h-24 w-24 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
        />
      ) : null}
    </div>
  );
}


function DeleteStudentModal({
  student,
  deleting,
  onCancel,
  onConfirm,
}: {
  student: AdminStudent;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-6 backdrop-blur-sm sm:pt-8">
      <div className="math-card w-full max-w-lg p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-rose-50 p-3 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
            <Trash2 size={24} />
          </div>

          <div>
            <p className="math-kicker text-rose-600 dark:text-rose-300">
              Delete Student
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Delete {student.studentName}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This action is permanent. It will remove the student profile,
              login access, photo/signature records, attempts, answers, and
              generated test history linked to this student.
            </p>

            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
              <p>
                <span className="font-black">Student Code:</span>{" "}
                {student.studentCode}
              </p>
              <p>
                <span className="font-black">Custom ID:</span>{" "}
                {student.customId || "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3.5 font-black text-white transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
            disabled={deleting}
          >
            <Trash2 size={18} />
            {deleting ? "Deleting..." : "Yes, Delete Student"}
          </button>

          <button className="math-button-secondary flex-1" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


function StudentProfileModal({
  student,
  onClose,
}: {
  student: AdminStudent;
  onClose: () => void;
}) {
  const details: Array<[string, string | null | undefined]> = [
    ["Teacher", student.teacher],
    ["Admission Date", student.admissionDate],
    ["DOB", student.dob],
    ["Gender", student.gender],
    ["Blood Group", student.bloodGroup],
    ["School", student.schoolName],
    ["Class / Section", `${student.className || "-"} / ${student.section || "-"}`],
    ["Level", student.currentLevelCode],
    ["Father", student.fatherName],
    ["Father Mobile", student.fatherMobile],
    ["Father Email", student.fatherEmail],
    ["Father WhatsApp", student.fatherWhatsapp],
    ["Mother", student.motherName],
    ["Mother Mobile", student.motherMobile],
    ["Mother Email", student.motherEmail],
    ["Mother WhatsApp", student.motherWhatsapp],
    ["Present Address", student.presentAddress],
    ["Permanent Address", student.permanentAddress],
  ];

  return (
    <div
      className="math-admin-light-profile-modal-overlay fixed inset-x-0 bottom-0 top-[96px] z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 pb-6 pt-4 backdrop-blur-sm sm:top-[104px] sm:px-6 sm:pb-8"
      onClick={onClose}
    >
      <div
        className="math-admin-light-profile-modal-card relative flex max-h-[calc(100vh-128px)] w-full max-w-5xl flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white shadow-2xl dark:border-slate-700/70 dark:bg-slate-950 sm:max-h-[calc(100vh-144px)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="math-admin-light-profile-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <div>
            <p className="math-kicker">Student Profile</p>
            <h2 className="text-3xl font-black text-slate-950 dark:text-white">
              {student.studentName}
            </h2>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {student.studentCode} · {student.customId || "No Custom ID"}
            </p>
          </div>

          <button
            className="math-button-secondary shrink-0 px-4"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="space-y-4">
              <div className="math-admin-light-profile-modal-panel rounded-[28px] bg-slate-50 p-4 dark:bg-slate-900/70">
                <p className="font-black text-slate-950 dark:text-white">Photo</p>
                {student.photoUrl ? (
                  <img
                    src={ResolveAssetUrl(student.photoUrl)}
                    className="mt-3 h-44 w-44 rounded-3xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                    alt="Student"
                  />
                ) : (
                  <ProfileAvatar
                    name={student.studentName}
                    imageUrl={student.photoUrl}
                    role="STUDENT"
                    className="math-record-avatar-student mt-3 h-44 w-44 rounded-3xl text-4xl"
                  />
                )}
              </div>

              <div className="math-admin-light-profile-modal-panel rounded-[28px] bg-slate-50 p-4 dark:bg-slate-900/70">
                <p className="font-black text-slate-950 dark:text-white">Signature</p>
                {student.signatureUrl ? (
                  <img
                    src={ResolveAssetUrl(student.signatureUrl)}
                    className="mt-3 h-24 w-44 rounded-2xl bg-white object-contain p-2 ring-1 ring-slate-200 dark:ring-slate-700"
                    alt="Signature"
                  />
                ) : (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    No signature uploaded
                  </p>
                )}
              </div>
            </aside>

            <div className="grid gap-3 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <Info key={label} label={label} value={value} />
              ))}
            </div>
          </div>
        </div>

        <div className="math-admin-light-profile-modal-footer sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <button className="math-button-primary w-full" onClick={onClose} type="button">
            Back to Student Directory
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="math-admin-light-profile-modal-field rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-900 dark:text-white">
        {value || "-"}
      </p>
    </div>
  );
}
