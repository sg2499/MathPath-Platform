"use client";

// A student picker you can type into (2026-10-21, Performance Reports Part 4):
// name, code or teacher, then pick from the list (arrow keys and Enter work).

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type PickerStudent = { studentId: string; name: string; code: string; teacher?: string | null; level?: string | null };

const LIMIT = 60;

export function StudentPicker({ Students, Value, OnChange, Label = "Student" }: { Students: PickerStudent[]; Value: string; OnChange: (Next: string) => void; Label?: string }) {
  const Id = useId();
  const Box = useRef<HTMLDivElement>(null);
  const Input = useRef<HTMLInputElement>(null);
  const [Open, SetOpen] = useState(false);
  const [Query, SetQuery] = useState("");
  const [Active, SetActive] = useState(0);
  const Selected = Students.find((Item) => Item.studentId === Value);
  const Matches = useMemo(() => {
    const Text = Query.trim().toLowerCase();
    const Found = Text ? Students.filter((Item) => `${Item.name} ${Item.code} ${Item.teacher ?? ""} ${Item.level ?? ""}`.toLowerCase().includes(Text)) : Students;
    return Found.slice(0, LIMIT);
  }, [Students, Query]);
  useEffect(() => SetActive(0), [Query, Open]);
  useEffect(() => {
    if (!Open) return;
    const Close = (Event: MouseEvent) => {
      if (Box.current && !Box.current.contains(Event.target as Node)) SetOpen(false);
    };
    document.addEventListener("mousedown", Close);
    return () => document.removeEventListener("mousedown", Close);
  }, [Open]);
  useEffect(() => {
    if (!Open) return;
    document.getElementById(`${Id}-option-${Active}`)?.scrollIntoView({ block: "nearest" });
  }, [Active, Open, Id]);

  function Pick(Next: PickerStudent) {
    OnChange(Next.studentId);
    SetQuery("");
    SetOpen(false);
    Input.current?.blur();
  }

  return (
    <div className="math-card pr-picker col-span-2 min-w-0 p-4 md:col-span-1" ref={Box}>
      <label className="math-label" htmlFor={`${Id}-input`}>{Label}</label>
      <div className="pr-picker-field mt-3">
        <Search className="pr-picker-icon" size={16} aria-hidden="true" />
        <input
          id={`${Id}-input`}
          ref={Input}
          role="combobox"
          aria-expanded={Open}
          aria-controls={`${Id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={Open && Matches.length ? `${Id}-option-${Active}` : undefined}
          className="math-input pr-picker-input"
          placeholder={Selected ? Selected.name : "Search A Student"}
          value={Open ? Query : Selected ? Selected.name : ""}
          onFocus={() => SetOpen(true)}
          onChange={(Event) => {
            SetQuery(Event.target.value);
            SetOpen(true);
          }}
          onKeyDown={(Event) => {
            if (Event.key === "ArrowDown") {
              Event.preventDefault();
              SetOpen(true);
              SetActive((Current) => Math.min(Current + 1, Math.max(0, Matches.length - 1)));
            } else if (Event.key === "ArrowUp") {
              Event.preventDefault();
              SetActive((Current) => Math.max(Current - 1, 0));
            } else if (Event.key === "Enter" && Open && Matches[Active]) {
              Event.preventDefault();
              Pick(Matches[Active]);
            } else if (Event.key === "Escape") {
              SetOpen(false);
              SetQuery("");
            }
          }}
        />
        {Selected && !Open ? (
          <button type="button" className="pr-picker-clear" aria-label="Clear the student" onClick={() => OnChange("")}><X size={15} /></button>
        ) : (
          <ChevronDown className="pr-picker-icon pr-picker-chevron" size={16} aria-hidden="true" />
        )}
      </div>
      {Selected && !Open ? <p className="pr-picker-sub">{[Selected.code, Selected.level, Selected.teacher].filter(Boolean).join(" · ")}</p> : null}
      {Open ? (
        <ul id={`${Id}-list`} role="listbox" aria-label={Label} className="pr-picker-list">
          {Matches.length ? (
            Matches.map((Item, Index) => (
              <li
                key={Item.studentId}
                id={`${Id}-option-${Index}`}
                role="option"
                aria-selected={Item.studentId === Value}
                data-active={Index === Active || undefined}
                className="pr-picker-option"
                onMouseDown={(Event) => Event.preventDefault()}
                onMouseEnter={() => SetActive(Index)}
                onClick={() => Pick(Item)}
              >
                <span className="pr-name">{Item.name}</span>
                <span className="pr-code">{[Item.code, Item.level, Item.teacher].filter(Boolean).join(" · ")}</span>
              </li>
            ))
          ) : (
            <li className="pr-picker-none">No student matches.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
