"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { RefreshCw } from "lucide-react";
import { getActiveWorkLogs, getOnlineUsers, getOfflineUsers } from "@/lib/actions/activity";
import { useLiveSnapshot } from "@/lib/hooks/useLiveSnapshot";
import { PresenceCard } from "@/components/presence/PresenceCard";
import { composePresence, type PresenceEntry } from "@/lib/presence-types";

type LiveData = {
  activeLogs: Awaited<ReturnType<typeof getActiveWorkLogs>>;
  onlineUsers: Awaited<ReturnType<typeof getOnlineUsers>>;
  offlineUsers: Awaited<ReturnType<typeof getOfflineUsers>>;
};

/**
 * Wallboard: tela cheia, tema escuro, tipografia grande, relógio, sem navegação.
 *
 * Consome as MESMAS server actions e o MESMO stream do board — antes havia um
 * `tv-activity.ts` e um `/api/tv/stream` paralelos, com autorização mais frouxa.
 * A autorização é resolvida na página (cookie de wallboard ou sessão de gestor);
 * aqui não há gate nenhum, o que é seguro porque os getters são fail-closed.
 *
 * Rótulos vêm por prop do Server Component: o layout `(tv)` é minimalista e não
 * vale arrastar o provider de i18n do cliente para uma tela de leitura passiva.
 */
export function TVBoard({
  labels,
}: {
  labels: { online: string; working: string; total: string; notSurveillance: string };
}) {
  const locale = useLocale();
  const [clock, setClock] = useState<Date | null>(null);

  const fetchFallback = useCallback(async (): Promise<LiveData> => {
    const [activeLogs, onlineUsers, offlineUsers] = await Promise.all([
      getActiveWorkLogs(),
      getOnlineUsers(),
      getOfflineUsers(),
    ]);
    return { activeLogs, onlineUsers, offlineUsers };
  }, []);

  const { data } = useLiveSnapshot<LiveData>({
    streamUrl: "/api/live-activity/stream",
    fallback: fetchFallback,
  });

  // O relógio só começa no cliente — `new Date()` no primeiro render divergiria
  // do HTML do servidor e quebraria a hidratação.
  useEffect(() => {
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Ordem alfabética estável: num mural, cards que trocam de lugar a cada tick
  // de 10s são ilegíveis de longe.
  const entries: PresenceEntry[] = composePresence(
    data.onlineUsers,
    data.offlineUsers,
    data.activeLogs,
    { onlineFirst: false }
  );
  const workingCount = data.activeLogs.length;

  return (
    <div className="min-h-screen p-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-6">
          <span className="font-mono text-5xl font-bold tabular-nums text-foreground">
            {clock
              ? clock.toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--:--"}
          </span>
          <span className="flex items-center gap-2 text-2xl text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded-full bg-success" aria-hidden="true" />
            {data.onlineUsers.length} {labels.online}
          </span>
          <span className="flex items-center gap-2 text-2xl text-muted-foreground">
            <span
              className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary"
              aria-hidden="true"
            />
            {workingCount} {labels.working}
          </span>
          <span className="text-2xl text-muted-foreground/60">
            {entries.length} {labels.total}
          </span>
        </div>
        {/* Enquadramento na própria parede: quem passa em frente ao monitor lê
            para que a tela serve, sem precisar abrir o app (P1/P2). */}
        <p className="text-sm text-muted-foreground/70">{labels.notSurveillance}</p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {entries.map((entry) => (
          <PresenceCard key={entry.id} entry={entry} variant="tv" />
        ))}
      </div>
    </div>
  );
}
