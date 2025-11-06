"use client";

import { useHeartbeat } from "@/lib/hooks/useHeartbeat";

/**
 * Provider component that handles heartbeat functionality.
 * Add this to your root layout to track online presence.
 */
export function HeartbeatProvider() {
  useHeartbeat(60000); // Send heartbeat every 60 seconds
  return null; // This component doesn't render anything
}
