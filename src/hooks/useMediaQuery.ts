import { useCallback, useSyncExternalStore } from "react";

/** Subscribes to a CSS media query; re-renders when it starts/stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false // server/first paint: assume mobile, matching the app's default
  );
}
