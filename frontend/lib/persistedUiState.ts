"use client";

import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

const StoragePrefix = "mathpath:ui-state";

function IsBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function CreatePersistedUiStateKey(...Parts: Array<string | number | null | undefined>) {
  return [StoragePrefix, ...Parts.filter((Part) => Part !== null && Part !== undefined && String(Part).trim() !== "")]
    .map((Part) => String(Part).trim().replace(/\s+/g, "-"))
    .join(":");
}

export function usePersistentUiState<StateValue>(
  StorageKey: string,
  DefaultValue: StateValue,
): [StateValue, Dispatch<SetStateAction<StateValue>>] {
  const StableDefaultValue = useMemo(() => DefaultValue, []);
  const [State, SetState] = useState<StateValue>(StableDefaultValue);
  const [IsLoaded, SetIsLoaded] = useState(false);

  useEffect(() => {
    if (!IsBrowser()) {
      SetIsLoaded(true);
      return;
    }

    try {
      const StoredValue = window.localStorage.getItem(StorageKey);
      if (StoredValue !== null) {
        SetState(JSON.parse(StoredValue) as StateValue);
      } else {
        SetState(StableDefaultValue);
      }
    } catch {
      SetState(StableDefaultValue);
    } finally {
      SetIsLoaded(true);
    }
  }, [StorageKey, StableDefaultValue]);

  useEffect(() => {
    if (!IsLoaded || !IsBrowser()) return;

    try {
      window.localStorage.setItem(StorageKey, JSON.stringify(State));
    } catch {
      // Persistence must never block or break the active platform workflow.
    }
  }, [StorageKey, State, IsLoaded]);

  return [State, SetState];
}


export function usePersistentStringSet(
  StorageKey: string,
  DefaultValue: Set<string> = new Set<string>(),
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const StableDefaultValue = useMemo(() => DefaultValue, []);
  const [State, SetState] = useState<Set<string>>(StableDefaultValue);
  const [IsLoaded, SetIsLoaded] = useState(false);

  useEffect(() => {
    if (!IsBrowser()) {
      SetIsLoaded(true);
      return;
    }

    try {
      const StoredValue = window.localStorage.getItem(StorageKey);
      if (StoredValue !== null) {
        const ParsedValue = JSON.parse(StoredValue);
        SetState(new Set(Array.isArray(ParsedValue) ? ParsedValue.map(String) : []));
      } else {
        SetState(new Set(StableDefaultValue));
      }
    } catch {
      SetState(new Set(StableDefaultValue));
    } finally {
      SetIsLoaded(true);
    }
  }, [StorageKey, StableDefaultValue]);

  useEffect(() => {
    if (!IsLoaded || !IsBrowser()) return;

    try {
      window.localStorage.setItem(StorageKey, JSON.stringify(Array.from(State)));
    } catch {
      // Persistence must never block or break the active platform workflow.
    }
  }, [StorageKey, State, IsLoaded]);

  return [State, SetState];
}
