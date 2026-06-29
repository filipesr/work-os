"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current route's server components when the tab regains focus or
 * visibility. An open page (e.g. the dashboard left in a background tab) doesn't
 * refresh on its own, so returning to it would otherwise show stale data until a
 * manual reload. `router.refresh()` updates only the server-rendered parts —
 * client component state (open forms, inputs) is preserved. Debounced so rapid
 * focus/blur cycles don't spam refetches.
 */
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    let last = 0;
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 5000) return;
      refresh();
    };
    // Back/forward navigation can restore the page from the bfcache — a stale
    // in-memory snapshot that fires `pageshow` with persisted=true (not focus).
    // Always refresh in that case so returning to a report never shows old data.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
