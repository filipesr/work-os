import { getTranslations } from "next-intl/server";
import type { DoneLine } from "@/lib/planning/week-done";

/**
 * O que já foi feito no dia, acima da fila do que ainda vai acontecer.
 *
 * Separado dos itens da fila de propósito: feito é MEDIÇÃO (hora apontada) e o resto é ESTIMATIVA
 * (referência da etapa) — misturar os dois numa lista só faria a tela afirmar como fato um número
 * que ninguém mediu. É a mesma separação da carga por cliente e da linha do tempo.
 *
 * O feito não se reordena nem se arrasta: já aconteceu.
 */
export async function DayDone({ done }: { done: DoneLine[] }) {
  if (done.length === 0) return null;
  // Namespace próprio: as duas telas que usam este bloco leem namespaces diferentes
  // (`planning.week` e `planning.myWeek`), e o texto é o mesmo nas duas.
  const t = await getTranslations("planning.done");

  return (
    <ul className="mb-1 space-y-1">
      {done.map((l) => (
        <li
          key={`${l.taskId}-${l.stageId}`}
          className="rounded border border-success/30 bg-success-subtle px-2 py-1 text-xs text-muted-foreground"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium" title={`${l.taskTitle} · ${l.stageName}`}>
                {l.completed && <span className="text-success">✓ </span>}
                {l.taskTitle}
              </p>
              {l.stageName && <p className="truncate opacity-80">{l.stageName}</p>}
            </div>
            {/* A hora só aparece quando existe: etapa que fechou sem apontamento conta zero, e um
                "0.0h" ao lado do ✓ leria como trabalho de graça em vez de apontamento ausente. */}
            {l.hours > 0 && <span className="shrink-0 tabular-nums">{l.hours.toFixed(1)}h</span>}
          </div>
          {l.hours === 0 && <p className="italic opacity-80">{t("noHours")}</p>}
        </li>
      ))}
    </ul>
  );
}
