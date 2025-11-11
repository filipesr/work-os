"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveWorkLogs, getOnlineUsers, getOfflineUsers } from "@/lib/actions/activity";
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

// Combined user type with status
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

export default function LiveActivityPage() {
  const [activeLogs, setActiveLogs] = useState<ActiveLogData>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserData>([]);
  const [offlineUsers, setOfflineUsers] = useState<OfflineUserData>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const t = useTranslations("reports.liveActivity");
  const locale = useLocale();
  const dateLocale = locale === "es-ES" ? es : ptBR;

  const fetchData = async () => {
    try {
      const [activeData, onlineData, offlineData] = await Promise.all([
        getActiveWorkLogs(),
        getOnlineUsers(),
        getOfflineUsers(),
      ]);
      setActiveLogs(activeData);
      setOnlineUsers(onlineData);
      setOfflineUsers(offlineData);
      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchData();

    // Set up the 10-second polling
    const intervalId = setInterval(fetchData, 10000);

    // Clean up the interval on unmount
    return () => clearInterval(intervalId);
  }, []);

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/reports"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-200"
                >
                  <Info className="h-6 w-6 text-blue-600" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("help.title")}</DialogTitle>
                  <DialogDescription className="space-y-3 pt-4">
                    <span>
                      {t("help.online")}
                    </span>
                    <span>
                      {t("help.offline")}
                    </span>
                    <span>
                      {t("help.working")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      💡 {t("help.autoUpdate")}
                    </span>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>
            {t("updatedAgo")}{" "}
            {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: dateLocale })}
          </span>
        </div>
      </div>

      {/* Unified User List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t("allUsers")} ({allUsers.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            <span className="text-green-600 font-medium">{t("online")}</span> |
            <span className="text-red-600 font-medium"> {t("offline")}</span>
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
              <RefreshCw className="h-8 w-8 animate-spin mb-2" />
              <p>{t("loading")}</p>
            </div>
          ) : allUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
              <Activity className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">{t("noUsers")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {allUsers.map((user) => {
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
                      relative overflow-hidden rounded-xl transition-all
                      ${user.isOnline
                        ? "border-2 border-green-500 shadow-lg shadow-green-500/20 hover:shadow-xl"
                        : "border-2 border-gray-300 grayscale opacity-60"
                      }
                      ${user.activeLog ? "cursor-pointer" : ""}
                    `}
                  >
                    {/* Header colorido estilo Pokémon */}
                    <div
                      className={`
                        h-24 relative
                        ${user.isOnline
                          ? "bg-gradient-to-br from-green-400 to-green-600"
                          : "bg-gradient-to-br from-gray-300 to-gray-400"
                        }
                      `}
                    >
                      {/* Badge de status no canto */}
                      {user.activeLog && (
                        <div className="absolute top-2 right-2">
                          <span className="bg-white/90 text-green-600 px-2 py-1 rounded-full text-xs font-bold shadow-sm">
                            {t("working")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Avatar grande centralizado (sobrepõe o header) */}
                    <div className="flex justify-center -mt-12 mb-4">
                      <div className="relative">
                        <Avatar className={`h-24 w-24 border-4 border-background shadow-xl ${!user.isOnline ? "grayscale" : ""}`}>
                          <AvatarImage src={getProxiedImageUrl(user.image) || undefined} />
                          <AvatarFallback className="text-2xl">
                            {user.name?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        {/* Indicador de status */}
                        <div
                          className={`
                            absolute bottom-1 right-1 h-6 w-6 rounded-full border-4 border-background
                            ${user.isOnline ? "bg-green-500" : "bg-red-500"}
                            ${user.activeLog ? "animate-pulse" : ""}
                          `}
                        />
                      </div>
                    </div>

                    {/* Conteúdo empilhado verticalmente */}
                    <div className="px-4 pb-4 space-y-3 text-center">
                      {/* Nome */}
                      <h3 className={`font-bold text-lg truncate ${!user.isOnline ? "text-gray-600" : ""}`}>
                        {user.name || user.email}
                      </h3>

                      {/* Equipe */}
                      <p className={`text-xs ${!user.isOnline ? "text-gray-500" : "text-muted-foreground"}`}>
                        {user.team?.name || t("noTeam")}
                      </p>

                      {/* Informações da tarefa (se ativo) */}
                      {user.activeLog ? (
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-sm font-medium text-foreground truncate" title={user.activeLog.task.title}>
                            {user.activeLog.task.title}
                          </p>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p className="truncate" title={`${user.activeLog.task.project.name} (${user.activeLog.task.project.client.name})`}>
                              📁 {user.activeLog.task.project.name}
                            </p>
                            <p className="truncate" title={user.activeLog.stage.name}>
                              📌 {user.activeLog.stage.name}
                            </p>
                          </div>
                          {/* Tempo trabalhado */}
                          <div className="flex items-center justify-center gap-1 text-sm font-bold text-green-600 pt-1">
                            <Clock className="h-4 w-4" />
                            {durationHours !== undefined && durationHours > 0 ? (
                              <span>{durationHours}h {remainingMinutes}min</span>
                            ) : (
                              <span>{durationMinutes} min</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("started")}{" "}
                            {formatDistanceToNow(new Date(user.activeLog.startedAt), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </p>
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>
                );

                // Return wrapped in Link if activeLog exists, otherwise plain div
                return user.activeLog ? (
                  <Link key={user.id} href={`/tasks/${user.activeLog.task.id}`}>
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
