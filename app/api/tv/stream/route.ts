import {
  getTVActiveWorkLogs,
  getTVOnlineUsers,
  getTVOfflineUsers,
} from "@/lib/actions/tv-activity";
import { createSnapshotStreamResponse } from "@/lib/sse";

// Long-lived streaming response; never statically rendered or cached.
export const dynamic = "force-dynamic";

async function snapshot() {
  const [activeLogs, onlineUsers, offlineUsers] = await Promise.all([
    getTVActiveWorkLogs(),
    getTVOnlineUsers(),
    getTVOfflineUsers(),
  ]);
  return { activeLogs, onlineUsers, offlineUsers };
}

export type TVSnapshot = Awaited<ReturnType<typeof snapshot>>;

// Public — mirrors the (auth-less) TV server actions.
export function GET(request: Request) {
  return createSnapshotStreamResponse(snapshot, request.signal);
}
