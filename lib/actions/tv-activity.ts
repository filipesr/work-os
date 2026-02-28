"use server";

import prisma from "@/lib/prisma";

/**
 * Public server actions for the TV display page.
 * No auth required — these are read-only queries for the fullscreen TV dashboard.
 */

export async function getTVActiveWorkLogs() {
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
        team: {
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
        team: {
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
