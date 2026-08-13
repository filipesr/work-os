"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoverageClient } from "@/lib/actions/weekly-coverage";

/** Quantos chips aparecem antes de colapsar. Com 30+ clientes e 12 semanas, a
 *  lista completa em toda semana viraria uma parede — e a tela existe para
 *  destacar exceção, não para despejar a base inteira (P6). */
const VISIBLE = 6;

/**
 * Clientes OCIOSOS de uma semana, colapsados quando são muitos.
 *
 * Clicar abre a criação com os projetos daquele cliente já marcados — é o que
 * distingue este gatilho dos botões de semana e de data, que abrem vazios.
 */
export function ClientChips({
  clients,
  onPick,
}: {
  clients: CoverageClient[];
  onPick: (client: CoverageClient) => void;
}) {
  const t = useTranslations("planning.coverage");
  const [expanded, setExpanded] = useState(false);

  if (clients.length === 0) return null;

  const shown = expanded ? clients : clients.slice(0, VISIBLE);
  const hidden = clients.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c)}
          title={t("week.createForClient", { client: c.name })}
          className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-warning/40 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent"
        >
          <span className="truncate">{c.name}</span>
          <Plus className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
        >
          {t("week.moreIdle", { count: hidden })}
        </button>
      )}

      {expanded && clients.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          {t("week.collapse")}
        </button>
      )}
    </div>
  );
}
