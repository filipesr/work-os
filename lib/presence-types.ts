// Forma da presença compartilhada pelo board e pelo modo TV. Puro (só tipos +
// uma função de composição), para as duas telas nunca divergirem sobre o que
// "trabalhando" significa.

export interface PresenceActiveLog {
  startedAt: Date | string;
  task: {
    id: string;
    title: string;
    project: { id: string; name: string; client: { name: string } };
  };
  user: { id: string };
}

export interface PresenceUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  teams: { name: string }[];
  lastSeenAt: Date | string | null;
}

export interface PresenceEntry extends PresenceUser {
  /** Online = deu sinal de vida hoje (heartbeat). */
  isOnline: boolean;
  /** Presente = há um ActivityLog aberto, isto é, a pessoa marcou que está
   *  trabalhando NESTA tarefa. Ausente ≠ ociosa: pode estar em reunião,
   *  pensando, ou só não ter clicado em "iniciar". */
  activeLog?: PresenceActiveLog;
}

/**
 * Junta online + offline + logs abertos numa lista só, ordenada.
 *
 * `onlineFirst` serve ao board (triagem: quem está aí agora vem primeiro); o
 * modo TV usa ordem alfabética estável, senão os cards pulam de lugar a cada
 * tick de 10s e um mural que se remexe sozinho é ilegível de longe.
 */
export function composePresence(
  onlineUsers: PresenceUser[],
  offlineUsers: PresenceUser[],
  activeLogs: PresenceActiveLog[],
  opts: { onlineFirst: boolean }
): PresenceEntry[] {
  const byName = (a: PresenceEntry, b: PresenceEntry) =>
    (a.name || a.email || "").localeCompare(b.name || b.email || "");

  const entries: PresenceEntry[] = [
    ...onlineUsers.map((user) => ({
      ...user,
      isOnline: true,
      activeLog: activeLogs.find((log) => log.user.id === user.id),
    })),
    ...offlineUsers.map((user) => ({ ...user, isOnline: false })),
  ];

  return entries.sort((a, b) => {
    if (opts.onlineFirst && a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return byName(a, b);
  });
}

/** Duração compacta de um trabalho em curso ("2h 15min" / "40min"). */
export function formatWorkDuration(startedAt: Date | string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}min` : `${mins}min`;
}
