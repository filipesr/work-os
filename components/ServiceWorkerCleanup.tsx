"use client";

import { useEffect } from "react";

/**
 * Work OS does not use a Service Worker. But other projects served on the same
 * origin (e.g. another app on http://localhost:3000) may register one, and a
 * Service Worker is origin-scoped: it keeps intercepting every load of that
 * origin — serving the OTHER project's cached app shell — even after you switch
 * which dev server runs on the port. That's why localhost:3000 can load a
 * different project until a hard refresh.
 *
 * Since this app never wants a Service Worker, it proactively unregisters any it
 * finds and deletes their Cache Storage. After this runs once (i.e. once Work OS
 * actually loads), the rogue worker is gone and the origin stops being hijacked.
 *
 * NOTE: if this app ever adopts a PWA/Service Worker, remove this component.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
    }

    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }, []);

  return null;
}
