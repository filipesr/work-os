"use client";

import { useEffect, useRef } from "react";

/**
 * Custom hook to send periodic heartbeat to server.
 * Updates user's lastSeenAt timestamp to track online presence.
 *
 * @param intervalMs - How often to send heartbeat (default: 60000ms = 1 minute)
 */
export function useHeartbeat(intervalMs: number = 60000) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Send initial heartbeat immediately
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        // Silently fail - don't spam user with errors
        console.error("Heartbeat failed:", error);
      }
    };

    // Send first heartbeat
    sendHeartbeat();

    // Set up periodic heartbeat
    intervalRef.current = setInterval(sendHeartbeat, intervalMs);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs]);
}
