"use client";

import { useTranslations } from "next-intl";
import { formatAge, formatSla, agingTone } from "@/lib/aging";
import { toneTextClass } from "@/lib/status-tone";

/** Célula canônica de aging = TEXTO ("20h / SLA 24h"), colorida pelo consumo do
 * SLA. Etapa BLOQUEADA é neutralizada (o relógio relevante é o de espera, não o
 * de trabalho — ajuste registrado na revisão da Tela 1). Concluída/sem SLA → "—". */
export function AgingCell({
  ageHours,
  slaHours,
  blocked = false,
}: {
  ageHours: number | null;
  slaHours: number | null;
  blocked?: boolean;
}) {
  const t = useTranslations("common.flow");

  if (ageHours == null || slaHours == null || slaHours <= 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (blocked) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {t("blockedFor", { age: formatAge(ageHours) })}
      </span>
    );
  }

  const ratio = ageHours / slaHours;
  const tone = agingTone(ratio);

  return (
    <div className="text-sm leading-tight">
      <span className={`font-semibold ${toneTextClass[tone]}`}>{formatAge(ageHours)}</span>{" "}
      <span className="text-muted-foreground">
        / {t("sla")} {formatSla(slaHours)}
      </span>
      {ratio >= 1 ? <div className="text-xs text-danger">{t("slaExceeded")}</div> : null}
    </div>
  );
}
