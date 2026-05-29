"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ProfileAvatar, ResolveAssetUrl } from "@/components/common/ProfileAvatar";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import {
  createTeacher,
  deleteTeacher,
  getAdminTeachers,
  resetTeacherPassword,
  updateTeacher,
  updateTeacherStatus,
  uploadTeacherPhoto,
  uploadTeacherSignature,
} from "@/lib/api/admin";
import type { AdminTeacher, TeacherPayload } from "@/types/teacher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  GraduationCap,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const DEFAULT_PASSWORD = "Teacher@123";
const PAGE_SIZE = 20;

function emptyForm(): TeacherPayload {
  return {
    teacherName: "",
    teacherCode: "",
    email: "",
    phone: "",
    password: DEFAULT_PASSWORD,
    designation: "",
    subjectSpecialization: "",
    qualification: "",
    joiningDate: "",
    address: "",
    notes: "",
    status: "ACTIVE",
  };
}


function optional(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}


function makeTeacherCode(name: string) {
  const compact = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  return compact ? `T-${compact}` : `T-TEACHER-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function AdminTeachersPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<TeacherPayload>(emptyForm());
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminTeacher | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacher | null>(null);
  const TeacherDirectoryStateKey = CreatePersistedUiStateKey("admin", "teachers");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(TeacherDirectoryStateKey, "search"), "");
  const [page, setPage] = usePersistentUiState(CreatePersistedUiStateKey(TeacherDirectoryStateKey, "page"), 1);
  const [lastLogin, setLastLogin] = useState<{ identifier: string; password: string } | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [resetPasswordByTeacher, setResetPasswordByTeacher] = useState<Record<string, string>>({});

  const teachersQuery = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: getAdminTeachers,
    enabled: ready,
  });

  const createMutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async (data) => {
      if (photoFile) await uploadTeacherPhoto(data.teacher.teacherId, photoFile);
      if (signatureFile) await uploadTeacherSignature(data.teacher.teacherId, signatureFile);
      setLastLogin(data.login);
      setPhotoFile(null);
      setSignatureFile(null);
      setForm(emptyForm());
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ teacherId, payload }: { teacherId: string; payload: Partial<TeacherPayload> }) => {
      let response = await updateTeacher(teacherId, payload);
      if (photoFile) response = { ...response, teacher: (await uploadTeacherPhoto(teacherId, photoFile)).teacher };
      if (signatureFile) response = { ...response, teacher: (await uploadTeacherSignature(teacherId, signatureFile)).teacher };
      return response;
    },
    onSuccess: () => {
      setEditingTeacherId(null);
      setPhotoFile(null);
      setSignatureFile(null);
      setForm(emptyForm());
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ teacherId, isActive }: { teacherId: string; isActive: boolean }) =>
      updateTeacherStatus(teacherId, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-teachers"] }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ teacherId, password }: { teacherId: string; password: string }) =>
      resetTeacherPassword(teacherId, password),
    onSuccess: (data) => setLastLogin(data.login),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
  });

  const teachers = teachersQuery.data ?? [];
  const activeCount = teachers.filter((teacher) => teacher.isActive).length;
  const inactiveCount = teachers.length - activeCount;
  const totalStudents = teachers.reduce((sum, teacher) => sum + (teacher.studentCount || 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((teacher) =>
      [
        teacher.teacherName,
        teacher.teacherCode,
        teacher.email,
        teacher.phone,
        teacher.designation,
        teacher.subjectSpecialization,
        teacher.qualification,
        teacher.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [teachers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    statusMutation.error ||
    resetMutation.error ||
    deleteMutation.error;

  if (!ready) return null;

  function updateField<K extends keyof TeacherPayload>(key: K, value: TeacherPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload(): TeacherPayload {
    return {
      teacherName: form.teacherName.trim(),
      teacherCode: form.teacherCode.trim(),
      email: optional(form.email),
      phone: optional(form.phone),
      password: form.password || DEFAULT_PASSWORD,
      designation: optional(form.designation),
      subjectSpecialization: optional(form.subjectSpecialization),
      qualification: optional(form.qualification),
      joiningDate: optional(form.joiningDate),
      address: optional(form.address),
      notes: optional(form.notes),
      status: form.status,
    };
  }

  function submitForm(event: FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    if (editingTeacherId) {
      updateMutation.mutate({ teacherId: editingTeacherId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function openCreateForm() {
    setEditingTeacherId(null);
    setLastLogin(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setForm(emptyForm());
    setIsFormOpen(true);
  }

  function startEditing(teacher: AdminTeacher) {
    setEditingTeacherId(teacher.teacherId);
    setLastLogin(null);
    setPhotoFile(null);
    setSignatureFile(null);
    setForm({
      teacherName: teacher.teacherName,
      teacherCode: teacher.teacherCode,
      email: teacher.email ?? "",
      phone: teacher.phone ?? "",
      password: DEFAULT_PASSWORD,
      designation: teacher.designation ?? "",
      subjectSpecialization: teacher.subjectSpecialization ?? "",
      qualification: teacher.qualification ?? "",
      joiningDate: teacher.joiningDate ?? "",
      address: teacher.address ?? "",
      notes: teacher.notes ?? "",
      status: teacher.isActive ? "ACTIVE" : "INACTIVE",
    });
    setIsFormOpen(true);
  }

  async function copyLogin(identifier: string, password: string) {
    await navigator.clipboard.writeText(`Identifier: ${identifier}\nPassword: ${password}`);
  }

  return (
    <AppShell title="Teacher Management">
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-kicker">Teacher Directory</p>
            <h1 className="math-title">Teacher Management</h1>
            <p className="math-subtitle">
              Manage teacher profiles, login access, specialization details, and student ownership.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Teachers" value={teachers.length} icon={<GraduationCap size={18} />} />
            <Metric label="Active" value={activeCount} icon={<CheckCircle2 size={18} />} />
            <Metric label="Inactive" value={inactiveCount} icon={<XCircle size={18} />} />
            <Metric label="Students" value={totalStudents} icon={<UserPlus size={18} />} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="math-kicker">Teacher directory</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Teacher Details</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Search, add, edit, deactivate, reset passwords, or delete teacher records.
            </p>
          </div>

          <div className="grid w-full gap-3 lg:max-w-2xl lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="math-input pl-11"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search Teachers"
              />
            </div>

            <button className="math-button-primary" onClick={openCreateForm}>
              <UserPlus size={18} />
              Add Teacher
            </button>
          </div>
        </div>
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
              <p className="font-black">Teacher login ready</p>
              <p className="mt-1 text-sm">Identifier: {lastLogin.identifier} · Password: {lastLogin.password}</p>
            </div>
            <button className="inline-flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-200" onClick={() => copyLogin(lastLogin.identifier, lastLogin.password)}>
              <Copy size={15} /> Copy login details
            </button>
          </div>
        </div>
      ) : null}

      <section className="mt-6">
        {teachersQuery.isLoading ? <LoadingState label="Loading teachers..." /> : null}
        {teachersQuery.error ? <ErrorState message={apiErrorMessage(teachersQuery.error)} /> : null}
        {!teachersQuery.isLoading && !teachersQuery.error && filtered.length === 0 ? (
          <EmptyState message="No matching teachers found." />
        ) : null}

        {filtered.length ? (
          <div className="math-table math-admin-directory-table math-admin-teachers-table">
            <table>
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Code</th>
                  <th>Contact</th>
                  <th>Specialization</th>
                  <th>Students</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((teacher) => {
                  const resetPassword = resetPasswordByTeacher[teacher.teacherId] ?? "";
                  return (
                    <tr key={teacher.teacherId}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar
                            name={teacher.teacherName}
                            imageUrl={teacher.photoUrl}
                            role="TEACHER"
                            className="math-record-avatar-teacher h-11 w-11 text-xs"
                          />
                          <div>
                            <p className="font-black text-slate-950 dark:text-white">{teacher.teacherName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{teacher.designation || "Teacher"}</p>
                          </div>
                        </div>
                      </td>
                      <td>{teacher.teacherCode}</td>
                      <td>
                        <p>{teacher.email || "-"}</p>
                        <p className="text-xs text-slate-500">{teacher.phone || "-"}</p>
                      </td>
                      <td>{teacher.subjectSpecialization || "-"}</td>
                      <td>
                        <span className="font-black">{teacher.studentCount}</span>
                        <span className="ml-2 text-xs text-slate-500">({teacher.activeStudentCount} active)</span>
                      </td>
                      <td>
                        <span className={`math-badge math-admin-directory-status-chip ${teacher.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                          {teacher.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td>
                        <div className="math-table-actions flex-wrap justify-end">
                          <button className="math-role-action-button math-role-icon-only" onClick={() => setSelectedTeacher(teacher)} title="View Teacher">
                            <Eye size={15} />
                          </button>
                          <button className="math-role-action-button math-role-icon-only" onClick={() => startEditing(teacher)} title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button className="math-role-action-button math-role-icon-only" onClick={() => statusMutation.mutate({ teacherId: teacher.teacherId, isActive: !teacher.isActive })} title="Activate / Deactivate">
                            <ShieldCheck size={15} />
                          </button>
                          <input
                            className="math-input h-10 w-28 py-2 text-xs"
                            value={resetPassword}
                            placeholder="New password"
                            onChange={(e) => setResetPasswordByTeacher((prev) => ({ ...prev, [teacher.teacherId]: e.target.value }))}
                          />
                          <button
                            className="math-role-action-button math-role-icon-only"
                            disabled={!resetPassword.trim()}
                            onClick={() => resetMutation.mutate({ teacherId: teacher.teacherId, password: resetPassword })}
                            title="Reset Password"
                          >
                            <KeyRound size={15} />
                          </button>
                          <button className="math-destructive-button border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200" onClick={() => setDeleteTarget(teacher)} title="Delete">
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
              <p className="text-slate-600 dark:text-slate-300">Showing {pageItems.length} of {filtered.length} teachers</p>
              <div className="flex items-center gap-2">
                <button className="math-button-secondary px-3 py-2" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span className="font-black">{page} / {totalPages}</span>
                <button className="math-button-secondary px-3 py-2" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {isFormOpen ? (
        <TeacherFormModal
          editingTeacherId={editingTeacherId}
          form={form}
          photoFile={photoFile}
          signatureFile={signatureFile}
          editingTeacher={teachers.find((teacher) => teacher.teacherId === editingTeacherId) ?? null}
          saving={createMutation.isPending || updateMutation.isPending}
          onClose={() => {
            setEditingTeacherId(null);
            setForm(emptyForm());
            setIsFormOpen(false);
          }}
          onSubmit={submitForm}
          onFieldChange={updateField}
          onPhotoChange={setPhotoFile}
          onSignatureChange={setSignatureFile}
        />
      ) : null}

      {selectedTeacher ? (
        <TeacherDetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />
      ) : null}

      {deleteTarget ? (
        <DeleteTeacherModal
          teacher={deleteTarget}
          deleting={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.teacherId)}
        />
      ) : null}
    </AppShell>
  );
}


function TeacherDetailModal({ teacher, onClose }: { teacher: AdminTeacher; onClose: () => void }) {
  const Photo = ResolveAssetUrl(teacher.photoUrl);
  const DetailRows = [
    ["Teacher Code", teacher.teacherCode],
    ["Designation", teacher.designation || "Not Added"],
    ["Email", teacher.email || "Not Added"],
    ["Phone", teacher.phone || "Not Added"],
    ["Specialization", teacher.subjectSpecialization || "Not Added"],
    ["Qualification", teacher.qualification || "Not Added"],
    ["Joining Date", teacher.joiningDate || "Not Added"],
    ["Students", `${teacher.studentCount || 0} Assigned`],
    ["Status", teacher.isActive ? "Active" : "Inactive"],
  ];

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[96px] z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 pb-6 pt-4 backdrop-blur-sm sm:top-[104px] sm:px-6 sm:pb-8"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100vh-128px)] w-full max-w-5xl flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white shadow-2xl dark:border-slate-700/70 dark:bg-slate-950 sm:max-h-[calc(100vh-144px)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex min-w-0 items-start gap-4">
            {Photo ? (
              <img
                src={Photo}
                alt={teacher.teacherName}
                className="h-20 w-20 rounded-3xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <ProfileAvatar
                name={teacher.teacherName}
                imageUrl={teacher.photoUrl}
                role="TEACHER"
                className="math-record-avatar-teacher h-20 w-20 rounded-3xl text-2xl"
              />
            )}
            <div className="min-w-0">
              <p className="math-kicker">Teacher Profile</p>
              <h2 className="text-3xl font-black text-slate-950 dark:text-white">
                {teacher.teacherName}
              </h2>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {teacher.teacherCode}
              </p>
            </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {DetailRows.map(([Label, Value]) => (
              <TeacherProfileInfo key={Label} label={Label} value={Value} />
            ))}
          </div>

          {teacher.notes ? (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Notes</p>
              <p className="mt-1 font-bold leading-6 text-slate-900 dark:text-white">{teacher.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <button className="math-button-primary w-full" onClick={onClose} type="button">
            Back to Teacher Directory
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherProfileInfo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-slate-900 dark:text-white">
        {value || "-"}
      </p>
    </div>
  );
}

function TeacherFormModal({
  editingTeacherId,
  form,
  photoFile,
  signatureFile,
  editingTeacher,
  saving,
  onClose,
  onSubmit,
  onFieldChange,
  onPhotoChange,
  onSignatureChange,
}: {
  editingTeacherId: string | null;
  form: TeacherPayload;
  photoFile: File | null;
  signatureFile: File | null;
  editingTeacher: AdminTeacher | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onFieldChange: <K extends keyof TeacherPayload>(key: K, value: TeacherPayload[K]) => void;
  onPhotoChange: (file: File | null) => void;
  onSignatureChange: (file: File | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl rounded-[34px] border border-white/60 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div>
            <p className="math-kicker">{editingTeacherId ? "Edit teacher" : "Add teacher"}</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">
              {editingTeacherId ? "Update Teacher" : "Teacher Profile"}
            </h2>
          </div>
          <button className="math-button-secondary px-4" onClick={onClose} type="button"><X size={18} /> Close</button>
        </div>

        <form className="space-y-6 p-6" onSubmit={onSubmit}>
          <FormSection title="Teacher Info">
            <Input label="Teacher Name" value={form.teacherName} onChange={(v) => onFieldChange("teacherName", v)} required />
            <div>
              <label className="math-label">Teacher Code <span className="text-red-500">*</span></label>
              <div className="mt-2 flex gap-2">
                <input className="math-input" value={form.teacherCode} onChange={(e) => onFieldChange("teacherCode", e.target.value)} required />
                <button type="button" className="math-button-secondary px-4" onClick={() => onFieldChange("teacherCode", makeTeacherCode(form.teacherName))}>Generate</button>
              </div>
            </div>
            <Input label="Email" type="email" value={form.email ?? ""} onChange={(v) => onFieldChange("email", v)} />
            <Input label="Phone" value={form.phone ?? ""} onChange={(v) => onFieldChange("phone", v)} />
            {!editingTeacherId ? (
              <Input label="Password" value={form.password ?? ""} onChange={(v) => onFieldChange("password", v)} required />
            ) : null}
            <Select label="Status" value={form.status} onChange={(v) => onFieldChange("status", v as "ACTIVE" | "INACTIVE")} options={["ACTIVE", "INACTIVE"]} />
          </FormSection>

          <FormSection title="Photo & Signature">
            <ImageInput label="Photo" file={photoFile} existingUrl={editingTeacher?.photoUrl} onChange={onPhotoChange} />
            <ImageInput label="Signature" file={signatureFile} existingUrl={editingTeacher?.signatureUrl} onChange={onSignatureChange} />
          </FormSection>

          <FormSection title="Professional Info">
            <Input label="Designation" value={form.designation ?? ""} onChange={(v) => onFieldChange("designation", v)} />
            <Input label="Subject Specialization" value={form.subjectSpecialization ?? ""} onChange={(v) => onFieldChange("subjectSpecialization", v)} />
            <Input label="Qualification" value={form.qualification ?? ""} onChange={(v) => onFieldChange("qualification", v)} />
            <Input label="Joining Date" type="date" value={form.joiningDate ?? ""} onChange={(v) => onFieldChange("joiningDate", v)} />
            <Textarea label="Address" value={form.address ?? ""} onChange={(v) => onFieldChange("address", v)} />
            <Textarea label="Notes" value={form.notes ?? ""} onChange={(v) => onFieldChange("notes", v)} />
          </FormSection>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row">
            <button className="math-button-primary flex-1" disabled={saving}>
              <Plus size={18} /> {saving ? "Saving..." : editingTeacherId ? "Update Teacher" : "Save Teacher"}
            </button>
            <button type="button" className="math-button-secondary flex-1" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteTeacherModal({
  teacher,
  deleting,
  onCancel,
  onConfirm,
}: {
  teacher: AdminTeacher;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="math-card w-full max-w-lg p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-rose-50 p-3 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><Trash2 size={24} /></div>
          <div>
            <p className="math-kicker text-rose-600 dark:text-rose-300">Delete Teacher</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Delete {teacher.teacherName}?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This will delete the teacher login and unlink their students from this teacher. Student records will not be deleted.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3.5 font-black text-white transition hover:bg-rose-700 disabled:opacity-60" onClick={onConfirm} disabled={deleting}>
            <Trash2 size={18} /> {deleting ? "Deleting..." : "Yes, Delete Teacher"}
          </button>
          <button className="math-button-secondary flex-1" onClick={onCancel}>Cancel</button>
        </div>
      </div>
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

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-md dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="inline-flex rounded-2xl bg-blue-50 p-2 text-blue-700 dark:bg-cyan-950/50 dark:text-cyan-300">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-slate-700 dark:bg-slate-900/50">
      <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-300">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="math-label">{label} {required ? <span className="text-red-500">*</span> : null}</label>
      <input className="math-input mt-2" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="md:col-span-2">
      <label className="math-label">{label}</label>
      <textarea className="math-textarea mt-2 min-h-[90px]" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div>
      <label className="math-label">{label}</label>
      <select className="math-select mt-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
