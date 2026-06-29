"use client";

import { useEffect, useRef, useState } from "react";

type Options<T> = {
  /** SSE endpoint that emits JSON snapshots as `data:` messages. */
  streamUrl: string;
  /** Fallback fetch used when SSE is unavailable or errors out. */
  fallback: () => Promise<T>;
  /** Polling interval (ms) for the fallback path. */
  intervalMs?: number;
};

/**
 * Subscribes to a server-sent-events endpoint that pushes JSON snapshots,
 * replacing manual `setInterval` polling. If the browser lacks EventSource or
 * the stream errors (proxy, network, server), it transparently falls back to
 * polling `fallback()` on `intervalMs` so behaviour never regresses below the
 * previous polling implementation.
 *
 * Returns the latest snapshot (`null` until the first arrives) and the time it
 * was applied.
 */
export function useLiveSnapshot<T>({ streamUrl, fallback, intervalMs = 10000 }: Options<T>) {
  const [data, setData] = useState<T | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Keep the latest fallback without making it an effect dependency (its
  // identity changes every render; the effect must not tear down the stream).
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const apply = (next: T) => {
      if (cancelled) return;
      setData(next);
      setUpdatedAt(new Date());
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      const tick = async () => {
        try {
          apply(await fallbackRef.current());
        } catch {
          /* keep the last good snapshot */
        }
      };
      void tick();
      pollTimer = setInterval(tick, intervalMs);
    };

    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(streamUrl);
      es.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data) as T);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        // Stream failed — give up on SSE and degrade to polling.
        es?.close();
        es = null;
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [streamUrl, intervalMs]);

  return { data, updatedAt };
}
