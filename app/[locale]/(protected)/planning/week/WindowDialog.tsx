"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Clock } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { setStageWindow, type WindowOverlap } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { formatDisplayTime } from "@/lib/dates";

/** Marca (ou desmarca) o compromisso fixo de uma etapa já programada — o studio às 14h que a
 *  grade não sabe representar como número de horas.
 *
 *  `setStageWindow` é a mesma porta para os dois casos: marcar manda `startTime`, desmarcar manda
 *  `startTime: null`. Dois `useServerAction` sobre a mesma action, não um só, porque cada caminho
 *  fecha com um toast diferente — "marcado" e "desmarcado" não são a mesma frase. */
export function WindowDialog({
  activeStageId,
  label,
  startTime,
  endTime,
}: {
  activeStageId: string;
  label: string;
  /** "14:00" no relógio de São Paulo, ou nula se a etapa não tem compromisso. */
  startTime: string | null;
  endTime: string | null;
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startTime ?? "");
  const [end, setEnd] = useState(endTime ?? "");
  // Quando `setStageWindow` recusa gravar, o painel de saídas (adiar/remarcar/cancelar) mora
  // aqui — não é erro, então `useServerAction` chama `onSuccess` do mesmo jeito, e é o
  // componente que precisa reconhecer a forma `{ overlap }` e desviar da UI de sucesso.
  const [overlap, setOverlap] = useState<WindowOverlap | null>(null);

  // O estado local é rascunho de edição; a verdade é a prop, e reabrir tem de recomeçar dela. O
  // `<li>` da célula é estável entre um "Desmarcar" e o `router.refresh()` que o segue — React
  // reaproveita esta mesma instância, então sem isto o formulário reabriria mostrando um
  // compromisso que o servidor já apagou, e um submit desatento o recriaria. Também cobre quem
  // mexeu na hora com o diálogo fechado. O painel de sobreposição é rascunho da mesma forma:
  // reabrir (ou fechar por "Cancelar") tem de recomeçar limpo, senão a próxima abertura ficaria
  // presa na tela de conflito de uma tentativa anterior.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setStart(startTime ?? "");
      setEnd(endTime ?? "");
    }
    setOverlap(null);
    setOpen(next);
  };

  const fecharEAtualizar = () => {
    setOpen(false);
    router.refresh();
  };

  const marcar = useServerAction(setStageWindow, {
    onSuccess: (result) => {
      // `useServerAction` só enxerga `{ error }` como falha — um `{ overlap }` chega aqui como
      // "sucesso" porque o servidor não quebrou, só se recusou a escrever por cima de outro
      // compromisso. Por isso o toast de "marcado" fica condicional: ele só cabe quando algo de
      // fato foi marcado, e mostrá-lo junto do painel de conflito enganaria o gestor.
      if (result && typeof result === "object" && "overlap" in result) {
        setOverlap((result as { overlap: WindowOverlap }).overlap);
        return;
      }
      toast.success(t("windowSet_toast"));
      fecharEAtualizar();
    },
  });
  const desmarcar = useServerAction(setStageWindow, {
    successMessage: t("windowCleared_toast"),
    onSuccess: fecharEAtualizar,
  });
  // Reenvia a MESMA ocupante (índice fixo — só existe quando `occupants.length === 1`) com o
  // horário que o servidor já calculou; ao terminar, reenvia a janela nova pedida — mesmo
  // caminho de `marcar`, que decide sozinho entre fechar ou mostrar um novo conflito.
  const adiarOcupante = useServerAction(setStageWindow, {
    onSuccess: () => marcar.run({ activeStageId, startTime: start, endTime: end || null }),
  });
  const isPending = marcar.isPending || desmarcar.isPending || adiarOcupante.isPending;

  // Adiar troca um compromisso alheio de lugar — decisão que o gestor toma UMA ocupante por vez.
  // Com dois ou mais no caminho, `firstFreeStartISO` é dimensionado só para o caso de um único
  // ocupante, e oferecer o botão aqui empurraria uma remarcação em cadeia sem o gestor decidir
  // cada uma. Por isso as saídas ficam restritas a remarcar a NOVA janela ou cancelar.
  const podeAdiar = overlap !== null && overlap.canOverride && overlap.occupants.length === 1;

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="outline" size="sm" aria-label={t("windowOpen")}>
          <Clock className="h-3.5 w-3.5" />
        </Button>
      }
      title={overlap ? t("overlapTitle") : t("windowTitle")}
      description={label}
      formId="window-form"
      submitLabel={t("windowSubmit")}
      isPending={isPending}
      footer={
        overlap ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              {t("overlapCancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOverlap(null)}
            >
              {t("overlapRetime")}
            </Button>
            {podeAdiar && (
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const [occupant] = overlap.occupants;
                  adiarOcupante.run({
                    activeStageId: occupant.activeStageId,
                    startTime: formatDisplayTime(new Date(overlap.firstFreeStartISO)),
                    endTime: null,
                  });
                }}
              >
                {t("overlapPostpone")}
              </Button>
            )}
          </DialogFooter>
        ) : undefined
      }
    >
      {overlap ? (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">
            {overlap.occupants.map((occupant) => (
              <li key={occupant.activeStageId}>
                {t("overlapOccupant", {
                  task: occupant.taskTitle,
                  stage: occupant.stageName,
                  from: formatDisplayTime(new Date(occupant.startISO)),
                  to: formatDisplayTime(new Date(occupant.endISO)),
                })}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            {t(overlap.canOverride ? "overlapAllowed" : "overlapBlocked")}
          </p>
        </div>
      ) : (
        <form
          id="window-form"
          data-testid="window-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            marcar.run({ activeStageId, startTime: start, endTime: end || null });
          }}
        >
          <div>
            <FieldLabel htmlFor="wd-start" required>
              {t("windowStart")}
            </FieldLabel>
            <input
              id="wd-start"
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            />
          </div>
          <div>
            <FieldLabel htmlFor="wd-end">{t("windowEnd")}</FieldLabel>
            <input
              id="wd-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
            />
            {/* Sem o fim, a etapa não fica sem duração: o servidor fecha a janela pela referência
                dela. Quem olha o formulário precisa saber disso antes de deixar o campo em branco. */}
            <p className="mt-1 text-xs text-muted-foreground">{t("windowEndHint")}</p>
          </div>
          {/* Só existe o que desmarcar quando já há um compromisso — a prop original, não o estado
              do formulário, porque é o servidor que decide se há algo para limpar. */}
          {startTime !== null && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => desmarcar.run({ activeStageId, startTime: null })}
            >
              {t("windowClear")}
            </Button>
          )}
        </form>
      )}
    </FormDialog>
  );
}
