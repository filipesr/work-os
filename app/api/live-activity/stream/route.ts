import { getActiveWorkLogs, getOnlineUsers, getOfflineUsers } from "@/lib/actions/activity";
import { createSnapshotStreamResponse } from "@/lib/sse";

// Long-lived streaming response; never statically rendered or cached.
export const dynamic = "force-dynamic";

async function snapshot() {
  const [activeLogs, onlineUsers, offlineUsers] = await Promise.all([
    getActiveWorkLogs(),
    getOnlineUsers(),
    getOfflineUsers(),
  ]);
  return { activeLogs, onlineUsers, offlineUsers };
}

export type LiveActivitySnapshot = Awaited<ReturnType<typeof snapshot>>;

export async function GET(request: Request) {
  // The underlying getters enforce requireManagerOrAdmin(). Run one snapshot up
  // front so an unauthorized request gets a clean 403 instead of a broken
  // stream that errors on the first tick.
  try {
    await snapshot();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  return createSnapshotStreamResponse(snapshot, request.signal);
}
