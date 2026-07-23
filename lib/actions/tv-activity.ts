"use server";

import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

/**
 * Server actions for the TV display page. Read-only queries for the fullscreen
 * wallboard, but they expose team-wide activity (who is online, what they work
 * on), so they require an authenticated user — same bar as /reports/live-activity.
 * The office display authenticates once; the SSE stream carries the session cookie.
 */

export async function getTVActiveWorkLogs() {
  await requireMemberOrHigher();
  try {
    const activeLogs = await prisma.activityLog.findMany({
      where: { endedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
                client: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return activeLogs;
  } catch (error) {
    console.error("Error fetching active work logs:", error);
    throw error;
  }
}

export async function getTVOnlineUsers() {
  await requireMemberOrHigher();
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const onlineUsers = await prisma.user.findMany({
      where: {
        lastSeenAt: {
          gte: startOfToday,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        teams: {
          select: {
            name: true,
          },
        },
        lastSeenAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return onlineUsers;
  } catch (error) {
    console.error("Error fetching online users:", error);
    throw error;
  }
}

export async function getTVOfflineUsers() {
  await requireMemberOrHigher();
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const offlineUsers = await prisma.user.findMany({
      where: {
        OR: [
          { lastSeenAt: null },
          {
            lastSeenAt: {
              lt: startOfToday,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        teams: {
          select: {
            name: true,
          },
        },
        lastSeenAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return offlineUsers;
  } catch (error) {
    console.error("Error fetching offline users:", error);
    throw error;
  }
}
