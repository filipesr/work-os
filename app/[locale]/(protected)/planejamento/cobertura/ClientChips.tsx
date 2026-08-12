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
 * Clientes de uma semana, colapsados quando são muitos.
 *
 * Os OCIOSOS são acionáveis (clicar cria demanda) e por isso vêm expandidos até
 * o limite; os que já têm agenda são só confirmação e nascem recolhidos num
 * contador.
 */
export function ClientChips({
  clients,
  variant,
  onPick,
}: {
  clients: CoverageClient[];
  variant: "idle" | "covered";
  onPick?: (client: CoverageClient) => void;
}) {
  const t = useTranslations("planning.coverage");
  const [expanded, setExpanded] = useState(false);

  if (clients.length === 0) return null;

  const isIdle = variant === "idle";
  // "Com agenda" começa recolhido: é informação de conferência, não de ação.
  const shown = expanded ? clients : clients.slice(0, isIdle ? VISIBLE : 0);
  const hidden = clients.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((c) =>
        isIdle && onPick ? (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            title={t("week.createForClient", { client: c.name })}
            className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-warning/40 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent"
          >
            <span className="truncate">{c.name}</span>
            <Plus className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
          </button>
        ) : (
          <span
            key={c.id}
            className="inline-flex max-w-[14rem] truncate rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
          >
            {c.name}
          </span>
        )
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
        >
          {isIdle
            ? t("week.moreIdle", { count: hidden })
            : t("week.showCovered", { count: hidden })}
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
