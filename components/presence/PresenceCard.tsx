"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { ptBR, es } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { formatWorkDuration, type PresenceEntry } from "@/lib/presence-types";

/**
 * Card de UMA pessoa no quadro de presença — o bloco compartilhado entre o board
 * (`/reports/live-activity`) e o modo TV (`/tv`). Antes eram duas
 * implementações inline que já divergiam (a TV mostrava só o primeiro nome e
 * nenhuma tarefa; o board mostrava tarefa e projeto).
 *
 * `variant="tv"` é para monitor de parede: tipografia grande, denso, sem link
 * (ninguém clica numa TV). `variant="board"` é operacional: mostra a tarefa e
 * leva até ela.
 *
 * O que o card deliberadamente NÃO mostra (P1/P2): nenhum acumulado de tempo do
 * dia/semana, nenhuma comparação entre pessoas, nenhuma ordenação por volume.
 * "Desde quando" é o tempo da tarefa ATUAL — contexto para "posso interromper?",
 * não placar. Um total diário aqui viraria ranking de horas na parede.
 */
export function PresenceCard({
  entry,
  variant = "board",
}: {
  entry: PresenceEntry;
  variant?: "board" | "tv";
}) {
  const t = useTranslations("reports.liveActivity");
  const locale = useLocale();
  const dateLocale = locale === "es-ES" ? es : ptBR;

  const isTv = variant === "tv";
  const displayName = isTv
    ? (entry.name || entry.email || "?").split(" ")[0]
    : entry.name || entry.email || "?";

  const stateRing = entry.isOnline
    ? entry.activeLog
      ? "border-success"
      : "border-success/40"
    : "border-border opacity-70";

  const card = (
    <div
      className={`flex h-full flex-col rounded-xl border bg-card shadow-sm transition-colors ${stateRing} ${
        isTv ? "p-3" : "p-4"
      }`}
    >
      <div className={`flex items-center ${isTv ? "flex-col gap-2 text-center" : "gap-3"}`}>
        <div className="relative shrink-0">
          <Avatar
            className={`${isTv ? "h-20 w-20" : "h-12 w-12"} ${!entry.isOnline ? "grayscale" : ""}`}
          >
            <AvatarImage src={getProxiedImageUrl(entry.image) || undefined} alt="" />
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          {/* Ponto de estado: pulsa só quando há trabalho em curso. */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card ${
              isTv ? "h-5 w-5" : "h-3.5 w-3.5"
            } ${entry.isOnline ? "bg-success" : "bg-muted-foreground"} ${
              entry.activeLog ? "animate-pulse" : ""
            }`}
            aria-hidden="true"
          />
        </div>
        <div className={isTv ? "w-full min-w-0" : "min-w-0 flex-1"}>
          <h3
            className={`truncate font-semibold ${isTv ? "text-lg" : ""} ${
              entry.isOnline ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {displayName}
          </h3>
          {!isTv && (
            <p className="truncate text-xs text-muted-foreground">
              {entry.teams.length > 0 ? entry.teams.map((tm) => tm.name).join(", ") : t("noTeam")}
            </p>
          )}
        </div>
      </div>

      {entry.activeLog ? (
        <div className={`mt-3 rounded-lg bg-success-subtle px-3 py-2 ${isTv ? "text-center" : ""}`}>
          <p className={`truncate font-medium text-success ${isTv ? "text-base" : "text-sm"}`}>
            {entry.activeLog.task.title}
          </p>
          <p className={`truncate text-muted-foreground ${isTv ? "text-sm" : "text-xs"}`}>
            {entry.activeLog.task.project.name} · {formatWorkDuration(entry.activeLog.startedAt)}
          </p>
        </div>
      ) : (
        <div
          className={`mt-3 border-t border-border pt-2 text-muted-foreground ${
            isTv ? "text-center text-sm" : "text-xs"
          }`}
        >
          {entry.lastSeenAt ? (
            <p>
              {t("lastSeen")}{" "}
              {formatDistanceToNow(new Date(entry.lastSeenAt), {
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
  );

  // Na TV não há link: ninguém clica num monitor de parede, e um card clicável
  // sugere uma interação que não existe ali.
  if (isTv || !entry.activeLog) return card;

  // Bloqueio real (não falta de select): `ActivityLog.stageId` aponta para TemplateStage, e o
  // modelo não tem relação nenhuma com TaskActiveStage. Chegar à instância exigiria uma busca
  // nova por (taskId, stageId) em lib/actions/activity.ts. Fica na demanda.
  return (
    <Link href={`/tasks/${entry.activeLog.task.id}`} target="_blank">
      {card}
    </Link>
  );
}
