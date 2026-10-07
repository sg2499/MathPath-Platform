"use client";

import { useCallback, useEffect, useState } from "react";
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
