"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import LiveActivityFilters from "./live-activity-filters";
import { getActiveWorkLogs, getOnlineUsers, getOfflineUsers } from "@/lib/actions/activity";
import { useLiveSnapshot } from "@/lib/hooks/useLiveSnapshot";
import { SectionCard } from "@/components/ui/SectionCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity, RefreshCw, Info, Tv } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, es } from "date-fns/locale";
import { PresenceCard } from "@/components/presence/PresenceCard";
import { composePresence, type PresenceEntry } from "@/lib/presence-types";
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

export default function LiveActivityPage() {
  const t = useTranslations("reports.liveActivity");
  const locale = useLocale();
  const dateLocale = locale === "es-ES" ? es : ptBR;

  // Teams hidden by default come from config/i18n (not a hardcoded English list).
  const defaultHiddenTeams = (t.raw("defaultHiddenTeams") as string[] | undefined) ?? [];

  // Filters (status + teams).
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(true);
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set(defaultHiddenTeams));

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

  // Board: quem está aí agora vem primeiro (é uma tela de triagem).
  const allUsers: PresenceEntry[] = composePresence(onlineUsers, offlineUsers, activeLogs, {
    onlineFirst: true,
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={t("help.title")} className="px-2">
                  <Info className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("help.title")}</DialogTitle>
                  <DialogDescription className="space-y-3 pt-4">
                    <span className="block">{t("help.online")}</span>
                    <span className="block">{t("help.offline")}</span>
                    <span className="block">{t("help.working")}</span>
                    <span className="block">{t("help.notSurveillance")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("help.autoUpdate")}
                    </span>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
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
            <Link
              href="/tv"
              target="_blank"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Tv className="h-4 w-4" />
              {t("tvMode")}
            </Link>
          </>
        }
      />

      {/* P1/P2: a tela informa coordenação, não vigia nem ranqueia. Fica à
          vista, não enterrado no diálogo de ajuda — o enquadramento só protege
          se for lido antes de alguém interpretar os pontos verdes. */}
      <p className="mb-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("notSurveillance")}
      </p>

      <SectionCard
        title={`${t("allUsers")} (${filteredUsers.length})`}
        icon={Activity}
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {t("updatedAgo")}{" "}
            {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: dateLocale })}
          </span>
        }
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="mb-2 h-8 w-8 animate-spin" />
            <p>{t("loading")}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState icon={Activity} title={t("noUsers")} description={t("subtitle")} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {filteredUsers.map((user) => (
              <PresenceCard key={user.id} entry={user} variant="board" />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
