"use client";

import { useEffect, useState } from "react";
import {
  getTVActiveWorkLogs,
  getTVOnlineUsers,
  getTVOfflineUsers,
} from "@/lib/actions/tv-activity";
import { RefreshCw } from "lucide-react";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";

type ActiveLogData = Awaited<ReturnType<typeof getTVActiveWorkLogs>>;
type OnlineUserData = Awaited<ReturnType<typeof getTVOnlineUsers>>;
type OfflineUserData = Awaited<ReturnType<typeof getTVOfflineUsers>>;

type UserWithStatus = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  team: { name: string } | null;
  lastSeenAt: Date | null;
  isOnline: boolean;
  activeLog?: ActiveLogData[0];
};

export default function TVLiveActivityPage() {
  const [activeLogs, setActiveLogs] = useState<ActiveLogData>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserData>([]);
  const [offlineUsers, setOfflineUsers] = useState<OfflineUserData>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [clock, setClock] = useState(new Date());

  const t = useTranslations("reports.liveActivity");

  const fetchData = async () => {
    try {
      const [activeData, onlineData, offlineData] = await Promise.all([
        getTVActiveWorkLogs(),
        getTVOnlineUsers(),
        getTVOfflineUsers(),
      ]);
      setActiveLogs(activeData);
      setOnlineUsers(onlineData);
      setOfflineUsers(offlineData);
      setIsLoading(false);
    } catch (error) {
      logger.error("Error fetching TV data:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const dataInterval = setInterval(fetchData, 10000);
    const clockInterval = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const allUsers: UserWithStatus[] = [
    ...onlineUsers.map((user) => {
      const activeLog = activeLogs.find((log) => log.user.id === user.id);
      return { ...user, isOnline: true, activeLog };
    }),
    ...offlineUsers.map((user) => ({
      ...user,
      isOnline: false,
    })),
  ].sort((a, b) => {
    return (a.name || a.email || "").localeCompare(b.name || b.email || "");
  });

  const onlineCount = onlineUsers.length;
  const workingCount = activeLogs.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-10 w-10 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="p-4 min-h-screen">
      {/* Top bar: clock + counters */}
      <div className="flex items-center justify-between mb-4 text-gray-400 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-lg font-mono text-gray-300">
            {clock.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1" />
            {onlineCount} {t("online")}
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />
            {workingCount} {t("working")}
          </span>
          <span className="text-gray-600">{allUsers.length} total</span>
        </div>
        <RefreshCw className="h-3 w-3 animate-spin text-gray-600" />
      </div>

      {/* User cards grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-2">
        {allUsers.map((user) => {
          let durationText = "";
          if (user.activeLog) {
            const duration = new Date().getTime() - new Date(user.activeLog.startedAt).getTime();
            const mins = Math.floor(duration / 1000 / 60);
            const hrs = Math.floor(mins / 60);
            const remMins = mins % 60;
            durationText = hrs > 0 ? `${hrs}h${remMins}m` : `${mins}m`;
          }

          const firstName = (user.name || user.email || "?").split(" ")[0];

          return (
            <div
              key={user.id}
              className={`
                flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 transition-all
                ${
                  user.isOnline
                    ? user.activeLog
                      ? "bg-green-950/60 border border-green-700/60"
                      : "bg-green-950/30 border border-green-800/40"
                    : "bg-gray-900/50 border border-gray-800/40 opacity-50"
                }
              `}
            >
              {/* Photo */}
              <div className="relative w-full aspect-square overflow-hidden rounded-md">
                <img
                  src={getProxiedImageUrl(user.image) || undefined}
                  alt={firstName}
                  className={`h-full w-full object-cover ${!user.isOnline ? "grayscale" : ""}`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <div className="hidden h-full w-full items-center justify-center bg-gray-700 text-2xl font-bold text-gray-400 absolute inset-0 flex">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                {user.activeLog && (
                  <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-gray-950 animate-pulse" />
                )}
              </div>

              {/* Name */}
              <p
                className={`text-xs font-medium truncate w-full text-center ${user.isOnline ? "text-gray-100" : "text-gray-500"}`}
              >
                {firstName}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
