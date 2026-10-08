"use client";

// 2026-10-08 (Payments Phase 1): Payment Settings -- the business details
// printed on invoices and receipts, the centres (and which students attend
// each), document numbering, and the history of every change.
// 2026-10-08 (Phase 2): the four parts are sub-tabs (remembered in the URL as
// ?tab=business|centres|numbering|history) instead of one long page.
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  FieldError,
  FieldLabel,
  InlineError,
  PaymentsDialog,
  PaymentsHistoryList,
  PaymentsMetric,
  StatusPill,
} from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useUrlTabState } from "@/hooks/useUrlTabState";
import {
  assignStudentsToCentre,
  createCentre,
  getPaymentSettings,
  listCentreStudents,
  setStartingNumber,
  updateBusinessProfile,
  updateCentre,
  type BusinessProfile,
  type NumberSequence,
  type PaymentCentre,
} from "@/lib/api/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  FileDigit,
  History,
  Info,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

const SETTINGS_TABS = ["business", "centres", "numbering", "history"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function GstinProblem(value: string): string | null {
  const gstin = value.trim().toUpperCase();
  if (!gstin) return null;
  if (!GSTIN_PATTERN.test(gstin)) return "GSTIN must be 15 characters, like 19AALPG9427A1ZQ.";
  let total = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[index]) * (index % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  if (GSTIN_CHARS[(36 - (total % 36)) % 36] !== gstin[14]) return "The last character does not match. Please check for a typing mistake.";
  return null;
}

type BusinessForm = Record<"legalName" | "brandName" | "gstin" | "pan" | "registeredAddress" | "email" | "phone" | "invoiceFooter", string>;

function ToForm(business: BusinessProfile): BusinessForm {
  return {
    legalName: business.legalName ?? "",
    brandName: business.brandName ?? "",
    gstin: business.gstin ?? "",
    pan: business.pan ?? "",
    registeredAddress: business.registeredAddress ?? "",
    email: business.email ?? "",
    phone: business.phone ?? "",
    invoiceFooter: business.invoiceFooter ?? "",
  };
}

function SectionHeading({ icon, kicker, title, description }: { icon: ReactNode; kicker: string; title: string; description: string }) {
  return (
    <div>
      <p className="math-block-header">{icon}{kicker}</p>
      <h2 className="text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

export default function PaymentSettingsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading payment settings..." />}>
      <PaymentSettingsContent />
    </Suspense>
  );
}

function PaymentSettingsContent() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [tab, setTab] = useUrlTabState<SettingsTab>("tab", SETTINGS_TABS, "business");
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const settings = settingsQuery.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "centre-students"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
  };

  if (!ready) return null;

  return (
    <AppShell title="Payment Settings">
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><Wallet size={14} />Payments</p>
            <h1 className="math-title">Payment Settings</h1>
            <p className="math-subtitle">What every invoice and receipt shows at the top, the centres students attend, and how documents are numbered.</p>
          </div>
          {settings ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:shrink-0">
              <PaymentsMetric label="Centres" value={settings.centres.filter((centre) => centre.isActive).length} icon={<MapPin size={14} />} tone="cyan" />
              <PaymentsMetric label="No centre" value={settings.activeStudentsWithoutCentre} icon={<Users size={14} />} tone={settings.activeStudentsWithoutCentre ? "amber" : "emerald"} />
              <PaymentsMetric
                label="Numbers"
                value={settings.numbering.every((sequence) => sequence.isConfigured) ? "Ready" : "Not set"}
                icon={<FileDigit size={14} />}
                tone={settings.numbering.every((sequence) => sequence.isConfigured) ? "emerald" : "amber"}
              />
            </div>
          ) : null}
        </div>
      </section>

      {settingsQuery.isLoading ? (
        <div className="mt-6"><LoadingState label="Loading payment settings..." /></div>
      ) : settingsQuery.error || !settings ? (
        <div className="mt-6"><ErrorState message="Payment settings could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <>
          <nav className="mt-6 math-card p-2" aria-label="Payment settings sections">
            <div role="tablist" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {SETTINGS_TABS.map((key) => {
                const numberingMissing = settings.numbering.some((sequence) => !sequence.isConfigured);
                const tabInfo: Record<SettingsTab, { label: string; short: string; icon: ReactNode; flag?: boolean }> = {
                  business: { label: "Business Details", short: "Business", icon: <Building2 size={16} />, flag: !settings.business.registeredAddress },
                  centres: { label: "Centres", short: "Centres", icon: <MapPin size={16} />, flag: settings.activeStudentsWithoutCentre > 0 },
                  numbering: { label: "Document Numbering", short: "Numbering", icon: <FileDigit size={16} />, flag: numberingMissing },
                  history: { label: "History", short: "History", icon: <History size={16} /> },
                };
                const info = tabInfo[key];
                const selected = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`payment-settings-tab-${key}`}
                    aria-selected={selected}
                    aria-controls={`payment-settings-panel-${key}`}
                    onClick={() => setTab(key)}
                    className={`math-role-tab-button math-admin-tab-force inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition sm:justify-start ${selected ? "is-active math-admin-tab-force-selected" : ""}`}
                  >
                    {info.icon}
                    <span className="truncate sm:hidden">{info.short}</span>
                    <span className="hidden truncate sm:inline">{info.label}</span>
                    {info.flag ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="needs attention" /> : null}
                  </button>
                );
              })}
            </div>
          </nav>
          <div role="tabpanel" id={`payment-settings-panel-${tab}`} aria-labelledby={`payment-settings-tab-${tab}`}>
            {tab === "business" ? <BusinessSection business={settings.business} onSaved={refresh} /> : null}
            {tab === "centres" ? <CentresSection centres={settings.centres} withoutCentre={settings.activeStudentsWithoutCentre} onSaved={refresh} /> : null}
            {tab === "numbering" ? <NumberingSection sequences={settings.numbering} onSaved={refresh} /> : null}
            {tab === "history" ? (
              <section className="mt-6 math-card p-5 sm:p-6">
                <SectionHeading icon={<History size={14} />} kicker="History" title="Recent changes" description="Every change in Payments: who made it, when, and what changed." />
                <div className="mt-5"><PaymentsHistoryList limit={50} /></div>
              </section>
            ) : null}
          </div>
        </>
      )}
    </AppShell>
  );
}

function BusinessSection({ business, onSaved }: { business: BusinessProfile; onSaved: () => void }) {
  const [form, setForm] = useState<BusinessForm>(() => ToForm(business));
  const [savedNote, setSavedNote] = useState(false);
  useEffect(() => setForm(ToForm(business)), [business]);
  const original = ToForm(business);
  const dirty = (Object.keys(form) as (keyof BusinessForm)[]).some((key) => form[key].trim() !== original[key].trim());
  const gstinProblem = GstinProblem(form.gstin);
  const pan = form.pan.trim().toUpperCase();
  const panProblem = pan && !PAN_PATTERN.test(pan) ? "PAN must be 10 characters, like AALPG9427A." : pan && form.gstin.trim() && !gstinProblem && form.gstin.trim().toUpperCase().slice(2, 12) !== pan ? "This PAN does not match the GSTIN (characters 3 to 12 of a GSTIN are the PAN)." : null;
  const nameProblem = form.legalName.trim() ? null : "The legal name is required. It is printed on every invoice.";

  const mutation = useMutation({
    mutationFn: () => updateBusinessProfile(Object.fromEntries((Object.keys(form) as (keyof BusinessForm)[]).map((key) => [key, form[key]]))),
    onSuccess: () => {
      setSavedNote(true);
      onSaved();
    },
  });
  const set = (key: keyof BusinessForm, value: string) => {
    setSavedNote(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="mt-6 math-card p-5 sm:p-6">
      <SectionHeading icon={<Building2 size={14} />} kicker="Business Details" title="Printed on every invoice and receipt" description="Check these against your GST registration. Changes apply to documents created from now on." />
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!nameProblem && !gstinProblem && !panProblem) mutation.mutate(); }}>
          <label className="block">
            <FieldLabel>Legal name</FieldLabel>
            <input className="math-input" value={form.legalName} onChange={(event) => set("legalName", event.target.value)} />
            <FieldError message={nameProblem} />
          </label>
          <label className="block">
            <FieldLabel hint="optional">Brand name</FieldLabel>
            <input className="math-input" value={form.brandName} onChange={(event) => set("brandName", event.target.value)} />
          </label>
          <label className="block">
            <FieldLabel>GSTIN</FieldLabel>
            <input className="math-input uppercase tracking-wider" maxLength={15} value={form.gstin} onChange={(event) => set("gstin", event.target.value.toUpperCase())} />
            <FieldError message={gstinProblem} />
            {!gstinProblem && form.gstin.trim() ? <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={13} />Valid GSTIN format</p> : null}
          </label>
          <label className="block">
            <FieldLabel hint="optional">PAN</FieldLabel>
            <input className="math-input uppercase tracking-wider" maxLength={10} value={form.pan} onChange={(event) => set("pan", event.target.value.toUpperCase())} />
            <FieldError message={panProblem} />
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel hint="the address on the GST registration">Registered address</FieldLabel>
            <textarea className="math-input min-h-[76px]" value={form.registeredAddress} onChange={(event) => set("registeredAddress", event.target.value)} placeholder="If left empty, invoices show the student's centre address instead" />
          </label>
          <label className="block">
            <FieldLabel>Email</FieldLabel>
            <input className="math-input" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
          </label>
          <label className="block">
            <FieldLabel>Phone</FieldLabel>
            <input className="math-input" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel>Footer line</FieldLabel>
            <input className="math-input" value={form.invoiceFooter} onChange={(event) => set("invoiceFooter", event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" className="math-button-primary" disabled={!dirty || mutation.isPending || Boolean(nameProblem || gstinProblem || panProblem)}>
              <Save size={16} /> {mutation.isPending ? "Saving..." : "Save Business Details"}
            </button>
            {dirty ? (
              <button type="button" className="math-button-secondary" onClick={() => setForm(original)}>Undo Changes</button>
            ) : savedNote ? (
              <span role="status" className="flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={15} />Saved</span>
            ) : null}
          </div>
          <div className="sm:col-span-2"><InlineError error={mutation.error} /></div>
        </form>

        <aside aria-label="Invoice header preview" className="self-start rounded-3xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Invoice header preview</p>
          <p className="mt-3 text-lg font-black">{form.legalName || "Legal name"}</p>
          {form.brandName ? <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{form.brandName}</p> : null}
          {form.registeredAddress ? <p className="mt-2 whitespace-pre-line text-xs font-semibold leading-5">{form.registeredAddress}</p> : null}
          <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {[form.email && `Email: ${form.email}`, form.phone && `Tel: ${form.phone}`].filter(Boolean).join(" · ")}
          </p>
          {form.gstin ? <p className="mt-1 text-xs font-black">GSTIN: {form.gstin}</p> : null}
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            Centre: <span className="font-black">the student&apos;s own centre and its address</span>
          </div>
          <p className="mt-3 border-t border-dashed border-slate-200 pt-2 text-[11px] font-semibold text-slate-400 dark:border-slate-800">{form.invoiceFooter}</p>
        </aside>
      </div>
    </section>
  );
}

function CentresSection({ centres, withoutCentre, onSaved }: { centres: PaymentCentre[]; withoutCentre: number; onSaved: () => void }) {
  const [editing, setEditing] = useState<PaymentCentre | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [touched, setTouched] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => (editing ? updateCentre(editing.centreId, { name: form.name, address: form.address, phone: form.phone }) : createCentre({ name: form.name, address: form.address, phone: form.phone })),
    onSuccess: () => {
      setEditing(null);
      setCreating(false);
      onSaved();
    },
  });
  const toggleMutation = useMutation({
    mutationFn: (centre: PaymentCentre) => updateCentre(centre.centreId, { isActive: !centre.isActive }),
    onSuccess: onSaved,
  });

  const open = (centre: PaymentCentre | null) => {
    setEditing(centre);
    setCreating(!centre);
    setForm({ name: centre?.name ?? "", address: centre?.address ?? "", phone: centre?.phone ?? "" });
    setTouched(false);
    saveMutation.reset();
  };

  return (
    <section className="mt-6 math-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading icon={<MapPin size={14} />} kicker="Centres" title="Where students attend" description="A student's centre and its address are printed on their invoices and receipts. Without a centre, documents show every centre's address." />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="math-button-secondary" onClick={() => setAssignOpen(true)}><Users size={16} />Assign Students</button>
          <button type="button" className="math-button-primary" onClick={() => open(null)}><Plus size={16} />Add Centre</button>
        </div>
      </div>

      {withoutCentre > 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0" />{withoutCentre} active {withoutCentre === 1 ? "student has" : "students have"} no centre yet. The payment history migration fills this in from the old platform, or you can assign them now.</span>
          <button type="button" className="math-button-secondary shrink-0 !py-2 text-xs" onClick={() => setAssignOpen(true)}>Assign Now</button>
        </div>
      ) : null}
      <div className="mt-3"><InlineError error={toggleMutation.error} /></div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {centres.map((centre) => (
          <article key={centre.centreId} className={`flex flex-col rounded-3xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/60 ${centre.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{centre.name}</h3>
              <StatusPill active={centre.isActive} inactiveLabel="Switched off" />
            </div>
            <p className="mt-2 min-h-[40px] whitespace-pre-line text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">{centre.address || <span className="italic text-slate-400">No address (fine for online classes)</span>}</p>
            {centre.phone ? <p className="mt-1 text-xs font-semibold text-slate-500">Tel: {centre.phone}</p> : null}
            <p className="mt-3 flex items-center gap-1.5 text-sm font-black text-slate-700 dark:text-slate-200"><Users size={14} />{centre.studentCount} {centre.studentCount === 1 ? "student" : "students"}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => open(centre)}><Pencil size={13} />Edit</button>
              <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(centre)}>
                {centre.isActive ? "Switch Off" : "Switch On"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <PaymentsDialog
        open={creating || Boolean(editing)}
        kicker={editing ? "Edit Centre" : "New Centre"}
        title={editing ? editing.name : "Add a centre"}
        onClose={() => { setEditing(null); setCreating(false); }}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => { setEditing(null); setCreating(false); }}>Cancel</button>
            <button type="button" className="math-button-primary" disabled={saveMutation.isPending} onClick={() => { setTouched(true); if (form.name.trim()) saveMutation.mutate(); }}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Centre"}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="block">
            <FieldLabel>Name</FieldLabel>
            <input className="math-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Salt Lake" />
            <FieldError message={touched && !form.name.trim() ? "Please enter the centre's name." : null} />
          </label>
          <label className="block">
            <FieldLabel hint="printed on invoices">Address</FieldLabel>
            <textarea className="math-input min-h-[80px]" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </label>
          <label className="block">
            <FieldLabel hint="optional">Phone</FieldLabel>
            <input className="math-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <InlineError error={saveMutation.error} />
        </div>
      </PaymentsDialog>

      <AssignStudentsDialog open={assignOpen} centres={centres} onClose={() => setAssignOpen(false)} onSaved={onSaved} />
    </section>
  );
}

function AssignStudentsDialog({ open, centres, onClose, onSaved }: { open: boolean; centres: PaymentCentre[]; onClose: () => void; onSaved: () => void }) {
  const studentsQuery = useQuery({ queryKey: ["admin", "payments", "centre-students"], queryFn: listCentreStudents, enabled: open });
  const [search, setSearch] = useState("");
  const [centreFilter, setCentreFilter] = useState("NONE");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const students = studentsQuery.data ?? [];
  const levels = useMemo(() => Array.from(new Set(students.map((s) => s.levelCode).filter(Boolean) as string[])).sort(), [students]);
  const teachers = useMemo(() => Array.from(new Set(students.map((s) => s.teacherName).filter(Boolean) as string[])).sort(), [students]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (activeOnly && !student.isActive) return false;
      if (centreFilter === "NONE" && student.centreId) return false;
      if (centreFilter !== "NONE" && centreFilter !== "ALL" && student.centreId !== centreFilter) return false;
      if (levelFilter !== "ALL" && student.levelCode !== levelFilter) return false;
      if (teacherFilter !== "ALL" && student.teacherName !== teacherFilter) return false;
      if (needle && !`${student.studentName} ${student.studentCode} ${student.customId ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [students, search, centreFilter, levelFilter, teacherFilter, activeOnly]);
  const allShownSelected = filtered.length > 0 && filtered.every((student) => selected.has(student.studentId));
  const activeCentres = centres.filter((centre) => centre.isActive);

  const mutation = useMutation({
    mutationFn: () => assignStudentsToCentre({ studentIds: Array.from(selected), centreId: target === "CLEAR" ? null : target }),
    onSuccess: (outcome) => {
      setResult(outcome.centreName ? `${outcome.studentsChanged} of ${outcome.studentsSelected} selected ${outcome.studentsSelected === 1 ? "student" : "students"} moved to ${outcome.centreName}.` : `Centre removed for ${outcome.studentsChanged} ${outcome.studentsChanged === 1 ? "student" : "students"}.`);
      setSelected(new Set());
      studentsQuery.refetch();
      onSaved();
    },
  });

  const toggle = (id: string) => {
    setResult(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PaymentsDialog
      open={open}
      kicker="Centres"
      title="Assign students to a centre"
      onClose={onClose}
      wide
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-black text-slate-700 dark:text-slate-200">{selected.size} selected</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="math-select" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Centre to assign">
              <option value="">Choose a centre…</option>
              {activeCentres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="CLEAR">Remove centre</option>
            </select>
            <button type="button" className="math-button-primary" disabled={!selected.size || !target || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Saving..." : "Apply to Selected"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-4">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or code" aria-label="Search students" />
        </div>
        <select className="math-select" value={centreFilter} onChange={(event) => setCentreFilter(event.target.value)} aria-label="Filter by centre">
          <option value="NONE">No centre yet</option>
          <option value="ALL">Any centre</option>
          {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
        </select>
        <select className="math-select" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} aria-label="Filter by level">
          <option value="ALL">All levels</option>
          {levels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <select className="math-select" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} aria-label="Filter by teacher">
          <option value="ALL">All teachers</option>
          {teachers.map((teacher) => <option key={teacher} value={teacher}>{teacher}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
          Active students only
        </label>
      </div>

      {result ? <div role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{result}</div> : null}
      <div className="mt-3"><InlineError error={mutation.error} /></div>

      {studentsQuery.isLoading ? (
        <div className="mt-4"><LoadingState label="Loading students..." /></div>
      ) : studentsQuery.error ? (
        <div className="mt-4"><InlineError error={studentsQuery.error} /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allShownSelected}
                    onChange={() => {
                      setResult(null);
                      setSelected((current) => {
                        const next = new Set(current);
                        filtered.forEach((student) => (allShownSelected ? next.delete(student.studentId) : next.add(student.studentId)));
                        return next;
                      });
                    }}
                    aria-label="Select all shown students"
                  />
                </th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Teacher</th>
                <th className="px-3 py-2">Centre</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((student) => (
                  <tr key={student.studentId} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40" onClick={() => toggle(student.studentId)}>
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4" checked={selected.has(student.studentId)} onChange={() => toggle(student.studentId)} aria-label={`Select ${student.studentName}`} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-black text-slate-900 dark:text-white">{student.studentName}</div>
                      <div className="text-xs font-semibold text-slate-500">{student.studentCode}{student.isActive ? "" : " · inactive"}</div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{student.levelCode ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold">{student.teacherName ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold">{student.centreName ?? <span className="text-amber-600 dark:text-amber-300">Not set</span>}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No students match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PaymentsDialog>
  );
}

function NumberingSection({ sequences, onSaved }: { sequences: NumberSequence[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<NumberSequence | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const parsed = /^\d{1,8}$/.test(value.trim()) ? Number(value.trim()) : null;
  const tooLow = editing && parsed !== null && editing.lastIssuedNumber !== null && parsed <= editing.lastIssuedNumber;
  const mutation = useMutation({
    mutationFn: () => setStartingNumber(editing!.key, { nextNumber: parsed!, reason: reason.trim() || null }),
    onSuccess: () => {
      setEditing(null);
      onSaved();
    },
  });
  const preview = editing && parsed ? `${editing.prefix}${String(parsed).padStart(editing.padWidth, "0")}` : null;

  return (
    <section className="mt-6 math-card p-5 sm:p-6">
      <SectionHeading icon={<FileDigit size={14} />} kicker="Document Numbering" title="Invoice and receipt numbers" description="Numbers continue from the old platform, are never reused (even for cancelled documents), and can never clash, even when two admins save at once." />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {sequences.map((sequence) => (
          <article key={sequence.key} className="rounded-3xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{sequence.label} numbers</h3>
              {sequence.isConfigured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"><ShieldCheck size={12} />Ready</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">Not set yet</span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="font-semibold text-slate-500">Format</dt><dd className="text-right font-black tabular-nums">{sequence.prefix}{sequence.padWidth ? "0".repeat(sequence.padWidth) : "123"}</dd>
              <dt className="font-semibold text-slate-500">Next number</dt><dd className="text-right font-black tabular-nums">{sequence.isConfigured ? sequence.nextFormatted : "—"}</dd>
              <dt className="font-semibold text-slate-500">Last issued here</dt><dd className="text-right font-black tabular-nums">{sequence.lastIssuedFormatted ?? "None yet"}</dd>
            </dl>
            {!sequence.isConfigured ? (
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">The payment history migration sets this to continue straight after the old platform&apos;s last {sequence.label.toLowerCase()} number. No {sequence.label.toLowerCase()} can be created until then.</p>
            ) : null}
            <button type="button" className="math-role-action-button mt-4 h-9 px-3 text-xs" onClick={() => { setEditing(sequence); setValue(sequence.isConfigured ? String(sequence.nextNumber) : ""); setReason(""); setConfirmText(""); mutation.reset(); }}>
              <Pencil size={13} />Set Next Number
            </button>
          </article>
        ))}
      </div>

      <PaymentsDialog
        open={Boolean(editing)}
        kicker="Document Numbering"
        title={editing ? `Next ${editing.label.toLowerCase()} number` : ""}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="math-button-primary" disabled={!parsed || Boolean(tooLow) || confirmText.trim().toUpperCase() !== "SET" || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Saving..." : "Set Number"}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Normally the migration sets this. Only set it by hand if you are sure: it must be higher than the last number the old platform issued, or two documents would share a number.
          </p>
          <label className="block">
            <FieldLabel>Next number</FieldLabel>
            <input className="math-input tabular-nums" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 1037" />
            <FieldError message={value && !parsed ? "Enter a whole number from 1 to 99,999,999." : tooLow ? `${editing?.lastIssuedFormatted} has already been issued. Enter a higher number.` : null} />
            {preview && !tooLow ? <p className="mt-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">The next {editing?.label.toLowerCase()} will be <span className="font-black tabular-nums">{preview}</span>.</p> : null}
          </label>
          <label className="block">
            <FieldLabel hint="kept in the history">Reason</FieldLabel>
            <input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. continue after the old platform's last number" />
          </label>
          <label className="block">
            <FieldLabel>Type SET to confirm</FieldLabel>
            <input className="math-input uppercase" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
          </label>
          <InlineError error={mutation.error} />
        </div>
      </PaymentsDialog>
    </section>
  );
}
