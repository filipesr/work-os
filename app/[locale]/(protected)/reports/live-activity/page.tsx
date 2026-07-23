"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import LiveActivityFilters from "./live-activity-filters";
import { getActiveWorkLogs, getOnlineUsers, getOfflineUsers } from "@/lib/actions/activity";
import { useLiveSnapshot } from "@/lib/hooks/useLiveSnapshot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Activity, Clock, RefreshCw, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, es } from "date-fns/locale";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations, useLocale } from "next-intl";

// Define types for the data
type ActiveLogData = Awaited<ReturnType<typeof getActiveWorkLogs>>;
type OnlineUserData = Awaited<ReturnType<typeof getOnlineUsers>>;
type OfflineUserData = Awaited<ReturnType<typeof getOfflineUsers>>;

type LiveData = {
  activeLogs: ActiveLogData;
  onlineUsers: OnlineUserData;
  offlineUsers: OfflineUserData;
};

// Combined user type with status
type UserWithStatus = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  teams: { name: string }[];
  lastSeenAt: Date | null;
  isOnline: boolean;
  activeLog?: ActiveLogData[0];
};

const DEFAULT_HIDDEN_TEAMS = ["HR", "Finance", "Reception", "General Services", "Manager"];

export default function LiveActivityPage() {
  // Filters (status + teams). HR/Finance/Reception/General Services/Manager
  // start hidden by default.
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(true);
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set(DEFAULT_HIDDEN_TEAMS));

  const t = useTranslations("reports.liveActivity");
  const locale = useLocale();
  const dateLocale = locale === "es-ES" ? es : ptBR;

  const fetchFallback = useCallback(async (): Promise<LiveData> => {
    const [activeLogs, onlineUsers, offlineUsers] = await Promise.all([
      getActiveWorkLogs(),
      getOnlineUsers(),
      getOfflineUsers(),
    ]);
    return { activeLogs, onlineUsers, offlineUsers };
  }, []);

  // Live snapshots via SSE (/api/live-activity/stream), with polling fallback.
  const { data, updatedAt } = useLiveSnapshot<LiveData>({
    streamUrl: "/api/live-activity/stream",
    fallback: fetchFallback,
  });

  const activeLogs = data?.activeLogs ?? [];
  const onlineUsers = data?.onlineUsers ?? [];
  const offlineUsers = data?.offlineUsers ?? [];
  const isLoading = data === null;
  const lastUpdated = updatedAt ?? new Date();

  // Combine all users into a single list with status
  const allUsers: UserWithStatus[] = [
    // Online users
    ...onlineUsers.map((user) => {
      const activeLog = activeLogs.find((log) => log.user.id === user.id);
      return {
        ...user,
        isOnline: true,
        activeLog: activeLog,
      };
    }),
    // Offline users
    ...offlineUsers.map((user) => ({
      ...user,
      isOnline: false,
    })),
  ].sort((a, b) => {
    // Sort by status first (online first), then by name
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return (a.name || a.email || "").localeCompare(b.name || b.email || "");
  });

  // Distinct team names present (for the filter modal).
  const teamNames = [...new Set(allUsers.flatMap((u) => u.teams.map((tm) => tm.name)))].sort(
    (a, b) => a.localeCompare(b)
  );

  // Apply status + team filters.
  const filteredUsers = allUsers.filter((u) => {
    const statusOk = (u.isOnline && showOnline) || (!u.isOnline && showOffline);
    const teamOk = u.teams.length === 0 || u.teams.some((tm) => !hiddenTeams.has(tm.name));
    return statusOk && teamOk;
  });

  const toggleTeam = (name: string) =>
    setHiddenTeams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/reports" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-200"
                >
                  <Info className="h-6 w-6 text-indigo-600" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("help.title")}</DialogTitle>
                  <DialogDescription className="space-y-3 pt-4">
                    <span>{t("help.online")}</span>
                    <span>{t("help.offline")}</span>
                    <span>{t("help.working")}</span>
                    <span className="text-xs text-muted-foreground">💡 {t("help.autoUpdate")}</span>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveActivityFilters
            teamNames={teamNames}
            showOnline={showOnline}
            showOffline={showOffline}
            hiddenTeams={hiddenTeams}
            onToggleOnline={() => setShowOnline((v) => !v)}
            onToggleOffline={() => setShowOffline((v) => !v)}
            onToggleTeam={toggleTeam}
            onSelectAllTeams={() => setHiddenTeams(new Set())}
            onClearTeams={() => setHiddenTeams(new Set(teamNames))}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>
              {t("updatedAgo")}{" "}
              {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: dateLocale })}
            </span>
          </div>
        </div>
      </div>

      {/* Unified User List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t("allUsers")} ({filteredUsers.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground hidden">
            <span className="text-success font-medium">{t("online")}</span> |
            <span className="text-danger font-medium"> {t("offline")}</span>
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
              <RefreshCw className="h-8 w-8 animate-spin mb-2" />
              <p>{t("loading")}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
              <Activity className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">{t("noUsers")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {filteredUsers.map((user) => {
                // Calculate duration for users actively working
                let duration, durationMinutes, durationHours, remainingMinutes;
                if (user.activeLog) {
                  duration = new Date().getTime() - new Date(user.activeLog.startedAt).getTime();
                  durationMinutes = Math.floor(duration / 1000 / 60);
                  durationHours = Math.floor(durationMinutes / 60);
                  remainingMinutes = durationMinutes % 60;
                }

                const cardContent = (
                  <div
                    className={`
                      relative overflow-hidden rounded-xl transition-all w-52
                      ${
                        user.isOnline
                          ? "border-2 border-success/40 shadow-lg shadow-green-500/20 hover:shadow-xl"
                          : "border-2 border-gray-300 grayscale opacity-60"
                      }
                      ${user.activeLog ? "cursor-pointer" : ""}
                    `}
                  >
                    {/* Header colorido estilo Pokémon */}
                    <div
                      className={`
                        h-24 relative
                        ${
                          user.isOnline
                            ? "bg-gradient-to-br from-green-400 to-green-600"
                            : "bg-gradient-to-br from-gray-300 to-gray-400"
                        }
                      `}
                    >
                      {/* Badge de status no canto */}
                      {user.lastSeenAt && (
                        <div className="absolute top-2 right-2 ">
                          <span className="bg-white/90 px-2 py-1 rounded-md shadow-sm flex flex-col items-end">
                            <span className="text-success text-xs font-bold">
                              {user.activeLog ? user.activeLog.task.title : t("online")}
                            </span>
                            {user.activeLog && (
                              <span className="text-gray-600 text-[0.5rem]">
                                {user.activeLog.task.project.name}
                                {durationHours !== undefined &&
                                  (durationHours > 0
                                    ? ` - ${durationHours}h ${remainingMinutes}min`
                                    : ` - ${durationMinutes}min`)}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Avatar grande centralizado (sobrepõe o header) */}
                    <div className="flex justify-center -mt-12 mb-4">
                      <div className="relative">
                        <Avatar
                          className={`h-24 w-24 border-4 border-background shadow-xl ${!user.isOnline ? "grayscale" : ""}`}
                        >
                          <AvatarImage src={getProxiedImageUrl(user.image) || undefined} />
                          <AvatarFallback className="text-2xl">
                            {user.name?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        {/* Indicador de status */}
                        <div
                          className={`
                            absolute bottom-1 right-1 h-6 w-6 rounded-full border-4 border-background
                            ${user.isOnline ? "bg-success-subtle0" : "bg-danger-subtle0"}
                            ${user.activeLog ? "animate-pulse" : ""}
                          `}
                        />
                      </div>
                    </div>

                    {/* Conteúdo empilhado verticalmente */}
                    <div className="px-4 pb-4 text-center">
                      {/* Nome */}
                      <h3
                        className={`font-bold text-lg truncate ${!user.isOnline ? "text-gray-600" : ""}`}
                      >
                        {user.name || user.email}
                      </h3>

                      {/* Equipe */}
                      <p
                        className={`text-xs pb-3 ${!user.isOnline ? "text-gray-500" : "text-muted-foreground"}`}
                      >
                        {user.teams.length > 0
                          ? user.teams.map((tm) => tm.name).join(", ")
                          : t("noTeam")}
                      </p>

                      <div className="pt-2 border-t text-xs text-muted-foreground">
                        {user.lastSeenAt ? (
                          <p>
                            {t("lastSeen")}{" "}
                            {formatDistanceToNow(new Date(user.lastSeenAt), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </p>
                        ) : (
                          <p>{t("neverAccessed")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );

                // Return wrapped in Link if activeLog exists, otherwise plain div
                return user.activeLog ? (
                  <Link key={user.id} href={`/tasks/${user.activeLog.task.id}`} target="_blank">
                    {cardContent}
                  </Link>
                ) : (
                  <div key={user.id}>{cardContent}</div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
