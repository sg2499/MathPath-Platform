"use client";

// 2026-11-28 (Shailesh): several phones on one admin login. The admins share
// one admin login; each person adds their own authenticator app here once,
// and a code from any of these phones completes the login. Adding or
// removing a phone needs the account password.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Smartphone, Trash2, X } from "lucide-react";

import { apiErrorMessage } from "@/lib/api";
import {
  confirmTwoFactorDevice,
  listTwoFactorDevices,
  removeTwoFactorDevice,
  renameTwoFactorDevice,
  startAddTwoFactorDevice,
  type TwoFactorDevice,
  type TwoFactorDeviceSetup,
} from "@/lib/api/auth";

type Step = "list" | "add-name" | "add-scan" | "remove";

function FormatWhen(Value: string | null): string {
  if (!Value) return "Not used yet";
  const When = new Date(Value);
  if (Number.isNaN(When.getTime())) return "Not used yet";
  return When.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function TwoFactorPhones({ onBusyChange }: { onBusyChange?: (Busy: boolean) => void } = {}) {
  const [Step, SetStep] = useState<Step>("list");
  const [Devices, SetDevices] = useState<TwoFactorDevice[] | null>(null);
  const [Loading, SetLoading] = useState(false);
  const [Error, SetError] = useState<string | null>(null);
  const [Notice, SetNotice] = useState<string | null>(null);
  const [Label, SetLabel] = useState("");
  const [Password, SetPassword] = useState("");
  const [Code, SetCode] = useState("");
  const [Setup, SetSetup] = useState<TwoFactorDeviceSetup | null>(null);
  const [Target, SetTarget] = useState<TwoFactorDevice | null>(null);
  const [EditingId, SetEditingId] = useState<string | null>(null);
  const [EditLabel, SetEditLabel] = useState("");

  const Load = useCallback(async () => {
    try {
      const Response = await listTwoFactorDevices();
      SetDevices(Response.devices);
    } catch (ErrorValue) {
      SetError(apiErrorMessage(ErrorValue));
    }
  }, []);

  useEffect(() => {
    void Load();
  }, [Load]);

  // While adding or removing a phone, the modal hides its Disable button so
  // only this step's own Cancel and confirm buttons show.
  useEffect(() => {
    onBusyChange?.(Step !== "list");
  }, [Step, onBusyChange]);

  function BackToList(Message?: string) {
    SetStep("list");
    SetLabel("");
    SetPassword("");
    SetCode("");
    SetSetup(null);
    SetTarget(null);
    SetError(null);
    SetNotice(Message ?? null);
  }

  async function Run(Action: () => Promise<void>) {
    SetError(null);
    SetLoading(true);
    try {
      await Action();
    } catch (ErrorValue) {
      SetError(apiErrorMessage(ErrorValue));
    } finally {
      SetLoading(false);
    }
  }

  function HandleStartAdd() {
    if (!Label.trim()) return SetError("Give the phone a name, for example “Riya’s phone”.");
    if (!Password) return SetError("Enter the admin password to add a phone.");
    void Run(async () => {
      const Response = await startAddTwoFactorDevice(Label.trim(), Password);
      SetSetup(Response);
      SetPassword("");
      SetCode("");
      SetStep("add-scan");
    });
  }

  function HandleConfirmAdd() {
    if (!Setup) return;
    if (!/^\d{6}$/.test(Code.trim())) return SetError("Enter the 6-digit code shown on the new phone.");
    void Run(async () => {
      const Response = await confirmTwoFactorDevice(Setup.deviceId, Code.trim());
      SetDevices(Response.devices);
      BackToList(`${Setup.label} is added. Its codes now work at login.`);
    });
  }

  function HandleRemove() {
    if (!Target) return;
    if (!Password) return SetError("Enter the admin password to remove a phone.");
    void Run(async () => {
      const Response = await removeTwoFactorDevice(Target.deviceId, Password);
      SetDevices(Response.devices);
      BackToList(`${Target.label} is removed. Its codes no longer work.`);
    });
  }

  function HandleRename(Device: TwoFactorDevice) {
    if (!EditLabel.trim()) return SetError("Give the phone a name.");
    void Run(async () => {
      const Response = await renameTwoFactorDevice(Device.deviceId, EditLabel.trim());
      SetDevices(Response.devices);
      SetEditingId(null);
    });
  }

  const ErrorBox = Error ? (
    <div role="alert" className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
      {Error}
    </div>
  ) : null;

  if (Step === "add-name") {
    return (
      <div className="grid gap-4">
        {ErrorBox}
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Have the person whose phone this is next to you, with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy) installed.
        </p>
        <label className="grid gap-2">
          <span className="math-label">Name Of The Phone</span>
          <input className="math-input" value={Label} maxLength={60} onChange={(Event) => SetLabel(Event.target.value)} placeholder={"e.g. Riya’s phone"} autoFocus />
        </label>
        <label className="grid gap-2">
          <span className="math-label">Admin Password</span>
          <input className="math-input" type="password" value={Password} onChange={(Event) => SetPassword(Event.target.value)} autoComplete="current-password" />
        </label>
        <div className="flex justify-end gap-3">
          <button className="math-button-secondary px-4 py-3" onClick={() => BackToList()} disabled={Loading}>
            Cancel
          </button>
          <button className="math-button-primary px-4 py-3" onClick={HandleStartAdd} disabled={Loading}>
            {Loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Show QR Code
          </button>
        </div>
      </div>
    );
  }

  if (Step === "add-scan" && Setup) {
    return (
      <div className="grid gap-4">
        {ErrorBox}
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          On <strong>{Setup.label}</strong>, open the authenticator app, add an account and scan this QR code. Then type the 6-digit code that phone shows.
        </p>
        <div className="flex justify-center rounded-2xl border p-4" style={{ borderColor: "var(--theme-border)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-generated base64 data URL, not a static asset */}
          <img src={Setup.qrCodeDataUrl} alt={`QR code for ${Setup.label}`} width={200} height={200} />
        </div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Can&apos;t scan it? Enter this key in the app instead: <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{Setup.secret}</code>
        </p>
        <label className="grid gap-2">
          <span className="math-label">Code From The New Phone</span>
          <input
            className="math-input text-center tracking-[0.35em]"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={Code}
            onChange={(Event) => SetCode(Event.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-3">
          <button className="math-button-secondary px-4 py-3" onClick={() => BackToList()} disabled={Loading}>
            Cancel
          </button>
          <button className="math-button-primary px-4 py-3" onClick={HandleConfirmAdd} disabled={Loading}>
            {Loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Add Phone
          </button>
        </div>
      </div>
    );
  }

  if (Step === "remove" && Target) {
    return (
      <div className="grid gap-4">
        {ErrorBox}
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Remove <strong>{Target.label}</strong>? Its codes stop working at once. The other phones keep working.
        </p>
        <label className="grid gap-2">
          <span className="math-label">Admin Password</span>
          <input className="math-input" type="password" value={Password} onChange={(Event) => SetPassword(Event.target.value)} autoComplete="current-password" autoFocus />
        </label>
        <div className="flex justify-end gap-3">
          <button className="math-button-secondary px-4 py-3" onClick={() => BackToList()} disabled={Loading}>
            Cancel
          </button>
          <button className="math-button-primary px-4 py-3" onClick={HandleRemove} disabled={Loading}>
            {Loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Remove Phone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {ErrorBox}
      {Notice ? (
        <div role="status" className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {Notice}
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <span className="math-label">Phones That Can Give Login Codes</span>
        {Devices ? <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{Devices.length}</span> : null}
      </div>
      {Devices === null ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading phones
        </div>
      ) : (
        <ul className="grid gap-2">
          {Devices.map((Device) => (
            <li key={Device.deviceId} className="flex items-center gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--theme-border)" }}>
              <Smartphone size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {EditingId === Device.deviceId ? (
                  <div className="flex items-center gap-2">
                    <input className="math-input py-1.5 text-sm" value={EditLabel} maxLength={60} onChange={(Event) => SetEditLabel(Event.target.value)} autoFocus aria-label="New name" />
                    <button className="math-button-secondary p-2" onClick={() => HandleRename(Device)} disabled={Loading} aria-label="Save name">
                      <Check size={14} />
                    </button>
                    <button className="math-button-secondary p-2" onClick={() => SetEditingId(null)} disabled={Loading} aria-label="Cancel rename">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{Device.label}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Last used: {FormatWhen(Device.lastUsedAt)}</p>
                  </>
                )}
              </div>
              {EditingId === Device.deviceId ? null : (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    className="math-button-secondary p-2"
                    onClick={() => {
                      SetEditingId(Device.deviceId);
                      SetEditLabel(Device.label);
                      SetError(null);
                      SetNotice(null);
                    }}
                    aria-label={`Rename ${Device.label}`}
                    title="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="math-button-secondary p-2 text-rose-600 disabled:opacity-40 dark:text-rose-300"
                    onClick={() => {
                      SetTarget(Device);
                      SetPassword("");
                      SetError(null);
                      SetNotice(null);
                      SetStep("remove");
                    }}
                    disabled={Devices.length <= 1}
                    aria-label={`Remove ${Device.label}`}
                    title={Devices.length <= 1 ? "The only phone cannot be removed" : "Remove"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        className="math-button-secondary px-4 py-3"
        onClick={() => {
          SetError(null);
          SetNotice(null);
          SetStep("add-name");
        }}
      >
        <Plus size={16} />
        Add Another Phone
      </button>
    </div>
  );
}
