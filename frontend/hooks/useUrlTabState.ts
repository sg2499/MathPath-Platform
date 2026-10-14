"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// 2026-10-07 (Shailesh): "on hitting the [browser] refresh button it
// redirects the user to the first tab ... the user should see the same tab
// on which the refresh was triggered."
//
// A tab held only in React state is gone the moment the page reloads. This
// keeps the selected tab in the page address (?tab=MONITORING), so a refresh,
// back/forward and a copied link all land on the same tab.
//
// It is a drop-in for useState: same [value, setValue] shape, so every
// existing SetXxxTab(...) call keeps working and now also updates the
// address.
//
//   * The address is updated with history.replaceState (which Next's router
//     follows for useSearchParams) rather than router.replace: switching a
//     tab must not make a round trip to the server, and must not add a
//     history entry per click.
//   * The address is also FOLLOWED: when the parameter changes because of a
//     navigation that was not this hook's own (a notification link opening
//     the page that is already open), the tab switches to match.
//   * Every other parameter in the address is left exactly as it is.
export function useUrlTabState<T extends string>(
  Param: string,
  Allowed: readonly T[],
  Fallback: T
): [T, (Next: T) => void] {
  const SearchParams = useSearchParams();
  const FromUrl = SearchParams.get(Param);
  const AllowedKey = Allowed.join("|");

  const [Value, SetValue] = useState<T>(() =>
    FromUrl && (Allowed as readonly string[]).includes(FromUrl) ? (FromUrl as T) : Fallback
  );

  useEffect(() => {
    if (FromUrl && AllowedKey.split("|").includes(FromUrl)) SetValue(FromUrl as T);
  }, [FromUrl, AllowedKey]);

  const SetAndRemember = useCallback(
    (Next: T) => {
      SetValue(Next);
      if (typeof window === "undefined") return;
      const Url = new URL(window.location.href);
      if (Url.searchParams.get(Param) === Next) return;
      Url.searchParams.set(Param, Next);
      window.history.replaceState(null, "", `${Url.pathname}${Url.search}${Url.hash}`);
    },
    [Param]
  );

  return [Value, SetAndRemember];
}

// 2026-10-14 (Shailesh: a refresh must open the same tab with the same
// filters). The same idea for any one value -- a filter, a search, a view
// mode: kept in the page address (?q=...&module=...), so a refresh, back /
// forward and a copied link keep it. The fallback value is left out of the
// address, so an untouched page keeps its clean address.
//
// The address can update a moment after typing; a value this hook wrote
// itself in the last two seconds is never read back over newer typing.
export function useUrlParamState(
  Param: string,
  Fallback = ""
): [string, (Next: string) => void] {
  const SearchParams = useSearchParams();
  const FromUrl = SearchParams.get(Param);
  const [Value, SetValue] = useState<string>(() => FromUrl ?? Fallback);
  const Written = useRef(new Map<string, number>());

  useEffect(() => {
    const Next = FromUrl ?? Fallback;
    const WrittenAt = Written.current.get(Next);
    if (WrittenAt !== undefined && Date.now() - WrittenAt < 2000) return;
    SetValue(Next);
  }, [FromUrl, Fallback]);

  const SetAndRemember = useCallback(
    (Next: string) => {
      SetValue(Next);
      if (typeof window === "undefined") return;
      Written.current.set(Next, Date.now());
      const Url = new URL(window.location.href);
      if (Next === Fallback || Next === "") Url.searchParams.delete(Param);
      else Url.searchParams.set(Param, Next);
      if (`${Url.pathname}${Url.search}` === `${window.location.pathname}${window.location.search}`) return;
      window.history.replaceState(window.history.state, "", `${Url.pathname}${Url.search}${Url.hash}`);
    },
    [Param, Fallback]
  );

  return [Value, SetAndRemember];
}

// Writes a page's current choices into its address (empty values are left
// out), for pages that already read these parameters when they open (the
// leaderboards' deep links). Once Ready -- after the page has read them --
// every change is written, so a refresh reopens the same board.
export function useWriteUrlParams(Values: Record<string, string | null | undefined>, Ready: boolean): void {
  const Serialized = JSON.stringify(Values);
  useEffect(() => {
    if (!Ready || typeof window === "undefined") return;
    const Current = JSON.parse(Serialized) as Record<string, string | null>;
    const Url = new URL(window.location.href);
    Object.entries(Current).forEach(([Key, Value]) => {
      if (Value) Url.searchParams.set(Key, Value);
      else Url.searchParams.delete(Key);
    });
    if (`${Url.pathname}${Url.search}` === `${window.location.pathname}${window.location.search}`) return;
    window.history.replaceState(window.history.state, "", `${Url.pathname}${Url.search}${Url.hash}`);
  }, [Ready, Serialized]);
}
